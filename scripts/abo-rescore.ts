/**
 * Re-scores a finished scripts/abo-photo-eval.ts run under different compare
 * options (e.g. a finer raster) without any model call: the written and
 * fitted IRs are read back from the run directory, b0/b1 are rebuilt from the
 * same deterministic SAM mask, and `final` follows the recorded acceptance.
 * Scores carry the yaw-independent footprint error as well.
 *
 *   npx vite-node scripts/abo-rescore.ts -- --run RUN_DIR --selection selection.json --data-dir DIR \
 *     --compare '{"raster":320}' --output rescore.json --sam-runtime-dir DIR --sam-model-dir DIR
 *
 * ABO data, images and 3D models © Amazon.com, CC-BY-4.0.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AssemblyIR } from '../src/engine/assembly-ir';
import { compareMeshShapes, type MeshCompareOptions, type MeshCompareResult } from '../src/engine/mesh-shape-compare';
import { assemblyMeshes, boxMesh, extrudedSilhouette, foregroundMask, maskBox, preparePhoto, samObjectMask } from './lib/abo-eval';
import { readGlbTriangles } from './lib/glb-triangles';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function required(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`Missing --${name}.`);
  return value;
}

const runDir = resolve(required('run'));
const run = JSON.parse(readFileSync(join(runDir, 'results.json'), 'utf8')) as { protocolSha256: string; split: string; modelAlias: string; results: Array<{ modelId: string; productType: string; excluded?: string; fit?: { acceptance: { accept: boolean } } }> };
const selection = JSON.parse(readFileSync(resolve(required('selection')), 'utf8')) as { items: Array<{ modelId: string; heightMm: number }> };
const dataDir = resolve(required('data-dir'));
const compare = JSON.parse(required('compare')) as MeshCompareOptions;
// The protocol's padding and size, which the masks were made at.
const prep = { padShare: 0.08, maxSide: 640, backgroundThreshold: 235 };
const work = mkdtempSync(join(tmpdir(), 'abo-rescore-'));

const score = (result: MeshCompareResult) => ({ meanIoU: result.meanIoU, chamfer: result.chamfer, fScore5: result.fScore.at5, fScore2: result.fScore.at2, extentError: result.extentError, footprintError: result.footprintError, yawDeg: result.yawDeg });
const results = [];
for (const entry of run.results) {
  if (entry.excluded) {
    results.push({ modelId: entry.modelId, productType: entry.productType, excluded: entry.excluded });
    continue;
  }
  const item = selection.items.find((candidate) => candidate.modelId === entry.modelId)!;
  const photo = await preparePhoto(join(dataDir, 'spins', `${item.modelId}-0.jpg`), prep);
  const photoFile = join(work, `${item.modelId}-photo.png`);
  writeFileSync(photoFile, photo.png);
  const mask = await samObjectMask({ photoFile, box: maskBox(foregroundMask(photo.rgba, photo.width, photo.height, prep.backgroundThreshold), photo.width)!, workDir: work, stem: item.modelId, width: photo.width, height: photo.height, maxSide: prep.maxSide, samRuntimeDir: required('sam-runtime-dir'), samModelDir: required('sam-model-dir') });
  const box = maskBox(mask, photo.width)!;
  const truth = (await readGlbTriangles(join(dataDir, 'models', `${item.modelId}.glb`))).meshes;
  const widthMm = item.heightMm * (box[2] - box[0]) / (box[3] - box[1]);
  const scores: Record<string, ReturnType<typeof score>> = {
    b0: score(compareMeshShapes([boxMesh(widthMm, item.heightMm, widthMm)], truth, compare)),
    b1: score(compareMeshShapes([extrudedSilhouette(mask, photo.width, box, item.heightMm)], truth, compare)),
  };
  const irScore = (file: string) => (existsSync(file) ? score(compareMeshShapes(assemblyMeshes(JSON.parse(readFileSync(file, 'utf8')) as AssemblyIR), truth, compare)) : undefined);
  const llm = irScore(join(runDir, `${item.modelId}-llm-ir.json`));
  const fit = irScore(join(runDir, `${item.modelId}-fitted-ir.json`));
  if (llm) scores.llm = llm;
  if (fit) scores.fit = fit;
  const final = fit && entry.fit?.acceptance.accept ? fit : llm;
  if (final) scores.final = final;
  results.push({ modelId: item.modelId, productType: entry.productType, scores });
  console.log(JSON.stringify({ modelId: item.modelId, iou: Object.fromEntries(Object.entries(scores).map(([arm, value]) => [arm, value.meanIoU])) }));
}
rmSync(work, { recursive: true, force: true });
writeFileSync(resolve(required('output')), `${JSON.stringify({ schema: 'sceliph.abo-rescore/0.1', sourceRun: runDir.split('/').slice(-1)[0], protocolSha256: run.protocolSha256, split: run.split, modelAlias: run.modelAlias, compare, results }, null, 1)}\n`);
