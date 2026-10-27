/**
 * Arm B1 of the 13th slice: the LLM-written IRs of a run, unchanged except that
 * components whose materialName names a patterned material get an explicit
 * `material.surface` and the opt-in `material.albedoVariation`. No model call,
 * no photo, no camera: a procedural pattern keyed by the material name only.
 *
 *   npx vite-node scripts/abo-procedural-albedo.ts -- --run RUN_DIR --arm a1 --output OUT_DIR
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AssemblyIR, SurfaceFinishIR } from '../src/engine/assembly-ir';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** Ordered: the first matching rule wins. Variation is the pattern contrast (0–0.5). */
/** textureScale is UV repeats per face: coarse enough that the pattern survives a 256 px view. */
export const PROCEDURAL_RULES: Array<{ pattern: RegExp; surface: SurfaceFinishIR; variation: number; textureScale: [number, number] }> = [
  { pattern: /linen|cotton|fabric|cloth|velvet|boucl|wool|felt|burlap|jute|rattan|wicker|weave/i, surface: 'fabric', variation: 0.2, textureScale: [3, 3] },
  { pattern: /leather/i, surface: 'leather', variation: 0.15, textureScale: [2, 2] },
  { pattern: /marble|granite|stone|travertine|terrazzo|slate/i, surface: 'stone', variation: 0.22, textureScale: [1.5, 1.5] },
  { pattern: /concrete|cement/i, surface: 'concrete', variation: 0.15, textureScale: [2, 2] },
  { pattern: /wood|oak|pine|walnut|maple|birch|teak|ash\b|elm|acacia|beech|cherry|mango|bamboo|veneer|mdf|plywood|fir|timber/i, surface: 'wood', variation: 0.3, textureScale: [1.2, 3] },
];

export function applyProceduralAlbedo(ir: AssemblyIR): { ir: AssemblyIR; changed: string[] } {
  const changed: string[] = [];
  const components = ir.components.map((component) => {
    const rule = PROCEDURAL_RULES.find((entry) => entry.pattern.test(component.materialName));
    if (!rule || /metal|steel|brass|chrome|iron|glass|plastic|acrylic/i.test(component.materialName)) return structuredClone(component);
    changed.push(component.id);
    return { ...structuredClone(component), material: { ...structuredClone(component.material), surface: component.material.surface ?? rule.surface, albedoVariation: rule.variation, textureScale: component.material.textureScale ?? rule.textureScale } };
  });
  return { ir: { ...structuredClone(ir), components }, changed };
}

if (process.argv.includes('--run')) {
  const runDir = resolve(argument('run')!);
  const arm = argument('arm') ?? 'a1';
  const outDir = resolve(argument('output')!);
  mkdirSync(outDir, { recursive: true });
  copyFileSync(join(runDir, 'results.json'), join(outDir, 'results.json'));
  const run = JSON.parse(readFileSync(join(runDir, 'results.json'), 'utf8')) as { results: Array<{ modelId: string }> };
  const receipts = [];
  for (const { modelId } of run.results) {
    const path = join(runDir, `${modelId}-${arm}-ir.json`);
    if (!existsSync(path)) continue;
    const { ir, changed } = applyProceduralAlbedo(JSON.parse(readFileSync(path, 'utf8')) as AssemblyIR);
    writeFileSync(join(outDir, `${modelId}-${arm}-ir.json`), `${JSON.stringify(ir, null, 1)}\n`);
    receipts.push({ modelId, changed, components: ir.components.length });
  }
  writeFileSync(join(outDir, 'procedural-albedo-receipts.json'), `${JSON.stringify({ schema: 'sceliph.procedural-albedo/0.1', rules: PROCEDURAL_RULES.map((rule) => ({ pattern: rule.pattern.source, surface: rule.surface, variation: rule.variation, textureScale: rule.textureScale })), receipts }, null, 1)}\n`);
  console.log(JSON.stringify(receipts.map((receipt) => `${receipt.modelId}:${receipt.changed.length}/${receipt.components}`)));
}
