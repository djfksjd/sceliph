/**
 * One photo vs two photos → AssemblyIR on a pre-registered ABO holdout. Per
 * item the model writes the IR twice, independently:
 *   a1  from turntable frame 0 only
 *   a2  from frame 0 and frame 18 (the same camera after a 90° turn; ABO spins
 *       step 5° per frame and keep one crop per spin)
 * against three baselines that use no model:
 *   b0  box of the listed height, width from the frame-0 mask, depth = width
 *   b1  the frame-0 silhouette extruded to depth = width
 *   b2  the two-view visual hull of the frame-0 and frame-18 silhouettes
 * Product names have their dimensions stripped and only the listed overall
 * height is given, so horizontal sizes must come from the photos. No fit.
 * Scores come from compareMeshShapes against the artist GLB.
 *
 *   npx vite-node scripts/abo-multiview-eval.ts -- --selection selection.json --data-dir DIR --protocol protocol.json \
 *     --model sonnet --workdir EMPTY_DIR --output OUT_DIR --sam-runtime-dir DIR --sam-model-dir DIR (--split test | --only id,id)
 *
 * ABO data, images and 3D models © Amazon.com, CC-BY-4.0.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { formatAssemblyFeedback } from '../src/engine/assembly-feedback';
import type { AssemblyIR } from '../src/engine/assembly-ir';
import { compareMeshShapes, type MeshCompareOptions, type MeshCompareResult } from '../src/engine/mesh-shape-compare';
import { assemblyMeshes, boxMesh, extrudedSilhouette, foregroundMask, maskBox, preparePhoto, samObjectMask, visualHull } from './lib/abo-eval';
import { callClaudeWithImage, type ClaudeCallRecord } from './lib/claude-cli';
import { readGlbTriangles } from './lib/glb-triangles';
import { sha256 } from './lib/moge-runtime';
import { stripDimensions } from './lib/product-name';
import { parseViewAssemblyReply } from './lib/view-assembly-reply';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function required(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`Missing --${name}.`);
  return value;
}

interface Protocol {
  guide: string;
  /** Request lines per arm; {name} and {height} are filled in. */
  requests: { a1: string[]; a2: string[] };
  maxRounds: number;
  padShare: number;
  maxSide: number;
  backgroundThreshold: number;
  exclusions: { minMaskShare: number; maxMaskShare: number };
  frames: { front: number; side: number };
  compare: MeshCompareOptions;
}

interface Item { split: string; stratum?: string; modelId: string; productType: string; name: string; heightMm: number; photoSha256: string; sideSha256: string }

const protocolBytes = readFileSync(resolve(required('protocol')));
const protocol = JSON.parse(protocolBytes.toString('utf8')) as Protocol;
const selection = JSON.parse(readFileSync(resolve(required('selection')), 'utf8')) as { items: Item[] };
const dataDir = resolve(required('data-dir'));
const model = required('model');
if (!/^[a-z0-9.-]{2,40}$/.test(model)) throw new Error('--model must be a CLI model alias.');
const workdir = resolve(required('workdir'));
if (!existsSync(workdir) || readdirSync(workdir).length > 0) throw new Error('--workdir must be an existing empty directory.');
const outputDir = resolve(required('output'));
if (existsSync(join(outputDir, 'results.json'))) throw new Error('Output already contains results; choose a fresh directory.');
mkdirSync(outputDir, { recursive: true });
const only = argument('only')?.split(',');
const split = argument('split');
const items = only ? only.map((id) => selection.items.find((item) => item.modelId === id)!) : selection.items.filter((item) => item.split === split);
if (items.length === 0 || items.some((item) => !item)) throw new Error('No (or unknown) items selected.');

const summarize = (result: MeshCompareResult) => ({ meanIoU: result.meanIoU, chamfer: result.chamfer, fScore5: result.fScore.at5, fScore2: result.fScore.at2, extentError: result.extentError, footprintError: result.footprintError, yawDeg: result.yawDeg });

async function view(frame: number, expectedSha: string, stem: string) {
  const path = join(dataDir, 'spins', `${stem}-${frame}.jpg`);
  if (sha256(readFileSync(path)) !== expectedSha) throw new Error(`Frame ${frame} of ${stem} changed since selection.`);
  const photo = await preparePhoto(path, protocol);
  const photoFile = join(outputDir, `${stem}-${frame}.png`);
  writeFileSync(photoFile, photo.png);
  const promptBox = maskBox(foregroundMask(photo.rgba, photo.width, photo.height, protocol.backgroundThreshold), photo.width);
  if (!promptBox) return { photo };
  const mask = await samObjectMask({ photoFile, box: promptBox, workDir: outputDir, stem: `${stem}-${frame}`, width: photo.width, height: photo.height, maxSide: protocol.maxSide, samRuntimeDir: required('sam-runtime-dir'), samModelDir: required('sam-model-dir') });
  return { photo, mask, box: maskBox(mask, photo.width), share: mask.reduce((sum, value) => sum + value, 0) / mask.length };
}

/** The model's write → structural feedback loop for one arm. */
async function writeIr(images: Buffer[], request: string) {
  const calls: Array<ClaudeCallRecord & { round: number }> = [];
  const rounds: Array<{ text: string; stage: string; viewIssue?: string }> = [];
  let prompt = request;
  for (let round = 0; round < protocol.maxRounds; round += 1) {
    const { text, record } = await callClaudeWithImage({ model, systemPrompt: protocol.guide, workdir, image: images[0]!, extraImages: images.slice(1), mediaType: 'image/png', text: prompt });
    calls.push({ round, ...record });
    const parsed = parseViewAssemblyReply(text, []);
    rounds.push({ text, stage: parsed.feedback.stage, ...(parsed.viewIssue ? { viewIssue: parsed.viewIssue } : {}) });
    if (parsed.ir && parsed.view) return { ir: parsed.ir, view: parsed.view, calls, rounds };
    prompt = `${request}\n\nYour previous reply:\n${text.slice(0, 20_000)}\n\n${parsed.feedback.pass ? '' : formatAssemblyFeedback(parsed.feedback)}${parsed.viewIssue ? `\n${parsed.viewIssue}` : ''}\nReturn the corrected JSON object only.`;
  }
  return { calls, rounds };
}

const results = [];
for (const item of items) {
  const started = performance.now();
  const record: Record<string, unknown> = { modelId: item.modelId, productType: item.productType, stratum: item.stratum, heightMm: item.heightMm };
  const truth = await readGlbTriangles(join(dataDir, 'models', `${item.modelId}.glb`));
  if (truth.seeThrough) record.excluded = 'see-through material';
  const front = record.excluded ? undefined : await view(protocol.frames.front, item.photoSha256, item.modelId);
  const side = record.excluded ? undefined : await view(protocol.frames.side, item.sideSha256, item.modelId);
  if (!record.excluded) {
    record.maskShare = [front?.share, side?.share].map((share) => (share === undefined ? null : +share.toFixed(4)));
    const bad = [front, side].find((entry) => !entry?.box || entry.share! < protocol.exclusions.minMaskShare || entry.share! > protocol.exclusions.maxMaskShare);
    if (bad) record.excluded = `mask covers ${(100 * (bad.share ?? 0)).toFixed(1)}% of a view`;
  }
  if (record.excluded || !front?.mask || !side?.mask) {
    results.push(record);
    console.log(JSON.stringify(record));
    continue;
  }
  const scores: Record<string, ReturnType<typeof summarize>> = {};
  const frontBox = front.box!;
  const widthMm = item.heightMm * (frontBox[2] - frontBox[0]) / (frontBox[3] - frontBox[1]);
  scores.b0 = summarize(compareMeshShapes([boxMesh(widthMm, item.heightMm, widthMm)], truth.meshes, protocol.compare));
  scores.b1 = summarize(compareMeshShapes([extrudedSilhouette(front.mask, front.photo.width, frontBox, item.heightMm)], truth.meshes, protocol.compare));
  scores.b2 = summarize(compareMeshShapes([visualHull({ mask: front.mask, width: front.photo.width, box: frontBox }, { mask: side.mask, width: side.photo.width, box: side.box! }, item.heightMm)], truth.meshes, protocol.compare));

  const fill = (lines: string[]) => lines.join('\n').replaceAll('{name}', stripDimensions(item.name)).replaceAll('{height}', String(Math.round(item.heightMm)));
  const arms = { a1: [front.photo.png], a2: [front.photo.png, side.photo.png] };
  const costs: Record<string, number> = {};
  for (const [arm, images] of Object.entries(arms) as Array<[keyof typeof arms, Buffer[]]>) {
    const request = fill(protocol.requests[arm]);
    const written = await writeIr(images, request);
    costs[arm] = +written.calls.reduce((sum, call) => sum + call.costUsd, 0).toFixed(4);
    writeFileSync(join(outputDir, `${item.modelId}-${arm}-calls.json`), `${JSON.stringify({ request, calls: written.calls, rounds: written.rounds }, null, 1)}\n`);
    record[`${arm}Rounds`] = written.rounds.length;
    if (!written.ir) continue;
    writeFileSync(join(outputDir, `${item.modelId}-${arm}-ir.json`), `${JSON.stringify(written.ir, null, 1)}\n`);
    record[`${arm}View`] = written.view;
    scores[arm] = summarize(compareMeshShapes(assemblyMeshes(written.ir as AssemblyIR), truth.meshes, protocol.compare));
  }
  record.costUsd = costs;
  record.scores = scores;
  record.ms = Math.round(performance.now() - started);
  results.push(record);
  console.log(JSON.stringify({ modelId: item.modelId, iou: Object.fromEntries(Object.entries(scores).map(([arm, value]) => [arm, value.meanIoU])), footprint: Object.fromEntries(Object.entries(scores).map(([arm, value]) => [arm, value.footprintError])) }));
}
writeFileSync(join(outputDir, 'results.json'), `${JSON.stringify({
  schema: 'sceliph.abo-multiview-eval/0.1',
  protocolSha256: createHash('sha256').update(protocolBytes).digest('hex'),
  modelAlias: model,
  totalCostUsd: +results.reduce((sum, item) => sum + Object.values((item.costUsd as Record<string, number> | undefined) ?? {}).reduce((a, b) => a + b, 0), 0).toFixed(4),
  results,
}, null, 1)}\n`);
