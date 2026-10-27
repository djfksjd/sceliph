/**
 * Applies photo part colours (src/engine/photo-part-color.ts) to the IRs of a
 * scripts/abo-multiview-eval.ts run, using the frame-0 catalog photo the model
 * saw. Writes a mirror run directory (results.json copied so the shape yaw is
 * reused) with recoloured `<id>-<arm>-ir.json` files and a receipt per item.
 *
 *   npx vite-node scripts/abo-photo-color.ts -- --run RUN_DIR --arm a1 --data-dir DIR --output OUT_DIR \
 *     --sam-runtime-dir DIR --sam-model-dir DIR [--only id,id]
 *
 * ABO data, images and 3D models © Amazon.com, CC-BY-4.0.
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AssemblyIR } from '../src/engine/assembly-ir';
import { applyPartColors, partColorsFromPhoto } from '../src/engine/photo-part-color';
import { assemblyMeshes, foregroundMask, maskBox, preparePhoto, samObjectMask } from './lib/abo-eval';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function required(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`Missing --${name}.`);
  return value;
}

const PREP = { padShare: 0.08, maxSide: 640, backgroundThreshold: 235 };
const OPTIONS = { fovDeg: 30, fitRaster: 160, maxEvaluations: 2400, minPixels: 40, seed: 1, litQuantile: Number(argument('lit-quantile') ?? 0.8), exposure: (argument('exposure') ?? 'model') as 'photo' | 'model' };
const runDir = resolve(required('run'));
const arm = required('arm');
const dataDir = resolve(required('data-dir'));
const outDir = resolve(required('output'));
mkdirSync(outDir, { recursive: true });
copyFileSync(join(runDir, 'results.json'), join(outDir, 'results.json'));
const run = JSON.parse(readFileSync(join(runDir, 'results.json'), 'utf8')) as { results: Array<{ modelId: string; excluded?: string; [key: string]: unknown }> };
const only = argument('only')?.split(',');
const work = mkdtempSync(join(tmpdir(), 'abo-photo-color-'));

const receipts = [];
for (const result of run.results) {
  if (result.excluded || (only && !only.includes(result.modelId))) continue;
  const irPath = join(runDir, `${result.modelId}-${arm}-ir.json`);
  if (!existsSync(irPath)) continue;
  const started = performance.now();
  const ir = JSON.parse(readFileSync(irPath, 'utf8')) as AssemblyIR;
  const photo = await preparePhoto(join(dataDir, 'spins', `${result.modelId}-0.jpg`), PREP);
  const photoFile = join(work, `${result.modelId}.png`);
  writeFileSync(photoFile, photo.png);
  const box = maskBox(foregroundMask(photo.rgba, photo.width, photo.height, PREP.backgroundThreshold), photo.width);
  if (!box) continue;
  const mask = await samObjectMask({ photoFile, box, workDir: work, stem: result.modelId, width: photo.width, height: photo.height, maxSide: PREP.maxSide, samRuntimeDir: required('sam-runtime-dir'), samModelDir: required('sam-model-dir') });
  const view = result[`${arm}View`] as { azimuthDeg: number; elevationDeg: number } | undefined;
  const colored = partColorsFromPhoto(ir, assemblyMeshes(ir), { width: photo.width, height: photo.height, data: photo.rgba }, mask, { ...OPTIONS, ...(view ? { viewHint: view } : {}) });
  writeFileSync(join(outDir, `${result.modelId}-${arm}-ir.json`), `${JSON.stringify(applyPartColors(ir, colored.parts), null, 1)}\n`);
  const receipt = {
    modelId: result.modelId,
    silhouetteIoU: +colored.silhouetteIoU.toFixed(4),
    exposureGain: +colored.exposureGain.toFixed(4),
    camera: { azimuthDeg: +colored.camera.azimuthDeg.toFixed(2), elevationDeg: +colored.camera.elevationDeg.toFixed(2), distanceMm: Math.round(colored.camera.distanceMm) },
    photoParts: colored.parts.filter((part) => part.source === 'photo').length,
    inferredParts: colored.parts.filter((part) => part.source === 'inferred').length,
    parts: colored.parts,
    ms: Math.round(performance.now() - started),
  };
  receipts.push(receipt);
  console.log(JSON.stringify({ modelId: receipt.modelId, iou: receipt.silhouetteIoU, photo: receipt.photoParts, inferred: receipt.inferredParts, ms: receipt.ms }));
}
rmSync(work, { recursive: true, force: true });
writeFileSync(join(outDir, 'photo-color-receipts.json'), `${JSON.stringify({ schema: 'sceliph.abo-photo-color/0.1', sourceRun: runDir.split('/').slice(-2).join('/'), arm, prep: PREP, options: OPTIONS, receipts }, null, 1)}\n`);
