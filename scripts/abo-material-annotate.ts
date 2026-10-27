/**
 * Arm B4 of the texture work: the model looks at the same catalog photo and the
 * IR's part list (shape untouched) and decides, per part, the surface finish and
 * whether it shows a visible pattern (`albedoVariation`, 0 = uniform colour) and
 * how coarse it is. One extra call per item; the IR geometry and colours stay as
 * written so appearance comparisons are on identical shape.
 *
 *   npx vite-node scripts/abo-material-annotate.ts -- --run RUN_DIR --arm a1 --data-dir DIR --model sonnet \
 *     --workdir EMPTY_DIR --output OUT_DIR [--only id,id]
 *
 * ABO data, images and 3D models © Amazon.com, CC-BY-4.0.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateAssemblyIR } from '../src/engine/assembly-compiler';
import type { AssemblyIR, SurfaceFinishIR } from '../src/engine/assembly-ir';
import { SURFACE_LIBRARY } from '../src/engine/surface-system';
import { extractJsonObject } from '../src/viewer/assist-protocol';
import { preparePhoto } from './lib/abo-eval';
import { callClaudeWithImage } from './lib/claude-cli';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function required(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`Missing --${name}.`);
  return value;
}

const FINISHES = Object.keys(SURFACE_LIBRARY) as SurfaceFinishIR[];
export const ANNOTATION_GUIDE = [
  'You annotate the materials of a 3D model of the product in the photo. The geometry and base colours are fixed; you only describe surface appearance.',
  'Output exactly one JSON object and nothing else: {"components":[{"id":string,"surface":finish,"albedoVariation":number,"textureScale":[u,v]}, ...]} with one entry per listed component id.',
  `finish: one of ${FINISHES.map((finish) => `"${finish}"`).join(', ')}.`,
  'albedoVariation (0 to 0.5): how much visible colour pattern the part shows in the photo. 0 = a uniform colour (painted MDF, lacquer, plain plastic, smooth metal). 0.1-0.2 = subtle (fine weave, light grain). 0.25-0.4 = clear (wood grain, knots, plank lines, marble veining, visible weave). Judge from the photo, not from the material name.',
  'textureScale [u,v]: pattern repeats across one face, 1 to 6; small numbers for large features such as planks or veins, larger for fine weave.',
  'Parts that are not visible in the photo: keep the finish implied by the material and use 0 unless the visible parts of the same material show a pattern.',
].join('\n');

const PREP = { padShare: 0.08, maxSide: 640 };
const runDir = resolve(required('run'));
const arm = required('arm');
const dataDir = resolve(required('data-dir'));
const model = required('model');
const workdir = resolve(required('workdir'));
if (!existsSync(workdir) || readdirSync(workdir).length > 0) throw new Error('--workdir must be an existing empty directory.');
const outDir = resolve(required('output'));
mkdirSync(outDir, { recursive: true });
copyFileSync(join(runDir, 'results.json'), join(outDir, 'results.json'));
const run = JSON.parse(readFileSync(join(runDir, 'results.json'), 'utf8')) as { results: Array<{ modelId: string; excluded?: string }> };
const only = argument('only')?.split(',');

const receipts = [];
let totalCost = 0;
for (const result of run.results) {
  if (result.excluded || (only && !only.includes(result.modelId))) continue;
  const irPath = join(runDir, `${result.modelId}-${arm}-ir.json`);
  if (!existsSync(irPath)) continue;
  const ir = JSON.parse(readFileSync(irPath, 'utf8')) as AssemblyIR;
  const photo = await preparePhoto(join(dataDir, 'spins', `${result.modelId}-0.jpg`), PREP);
  const parts = ir.components.map((component) => `- ${component.id}: ${component.name}; material "${component.materialName}"; colour ${component.material.color}`).join('\n');
  const text = `Catalog photo of the product. Components of the model:\n${parts}\nAnnotate every component.`;
  let annotated: AssemblyIR | undefined;
  let error: string | undefined;
  const { text: reply, record } = await callClaudeWithImage({ model, systemPrompt: ANNOTATION_GUIDE, workdir, image: photo.png, mediaType: 'image/png', text });
  totalCost += record.costUsd;
  try {
    const value = extractJsonObject(reply) as { components?: Array<{ id?: unknown; surface?: unknown; albedoVariation?: unknown; textureScale?: unknown }> };
    const byId = new Map((value.components ?? []).map((entry) => [entry.id, entry]));
    annotated = {
      ...structuredClone(ir),
      components: ir.components.map((component) => {
        const entry = byId.get(component.id);
        if (!entry) return structuredClone(component);
        const surface = FINISHES.includes(entry.surface as SurfaceFinishIR) ? entry.surface as SurfaceFinishIR : component.material.surface;
        const variation = typeof entry.albedoVariation === 'number' ? Math.min(0.5, Math.max(0, entry.albedoVariation)) : 0;
        const scale = Array.isArray(entry.textureScale) && entry.textureScale.length === 2 && entry.textureScale.every((v) => typeof v === 'number' && v >= 0.5 && v <= 8)
          ? entry.textureScale as [number, number] : undefined;
        return { ...structuredClone(component), material: { ...structuredClone(component.material), ...(surface ? { surface } : {}), ...(variation > 0 ? { albedoVariation: +variation.toFixed(3) } : {}), ...(scale ? { textureScale: scale } : {}) } };
      }),
    };
    validateAssemblyIR(annotated);
  } catch (caught) {
    error = (caught as Error).message;
    annotated = undefined;
  }
  // A failed annotation keeps the IR as written, so the arm never loses an item.
  writeFileSync(join(outDir, `${result.modelId}-${arm}-ir.json`), `${JSON.stringify(annotated ?? ir, null, 1)}\n`);
  writeFileSync(join(outDir, `${result.modelId}-annotation.json`), `${JSON.stringify({ request: text, reply, record, error }, null, 1)}\n`);
  const varied = (annotated ?? ir).components.filter((component) => (component.material.albedoVariation ?? 0) > 0).length;
  receipts.push({ modelId: result.modelId, varied, components: ir.components.length, costUsd: record.costUsd, ...(error ? { error } : {}) });
  console.log(JSON.stringify(receipts.at(-1)));
}
writeFileSync(join(outDir, 'annotation-receipts.json'), `${JSON.stringify({ schema: 'sceliph.material-annotation/0.1', model, guide: ANNOTATION_GUIDE, totalCostUsd: +totalCost.toFixed(4), receipts }, null, 1)}\n`);
