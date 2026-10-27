/**
 * Arm B2 of the texture work: starting from photo-judged material annotations
 * (B4 IRs), every part the model marked as patterned (albedoVariation > 0) gets
 * a photo pattern tile instead of the procedural one: the largest square of that
 * part's visible interior in the catalog photo (camera fitted on silhouettes,
 * src/engine/photo-part-color.ts), with low-frequency shading divided out, stored
 * as material.albedoPatch and repeated at the annotated textureScale. Geometry,
 * colours and every other field stay as they are. Items whose camera does not
 * register (silhouette IoU < 0.8) and parts without a clean square stay B4.
 *
 *   npx vite-node scripts/abo-photo-patch.ts -- --run B4_DIR --arm a1 --data-dir DIR --output OUT_DIR \
 *     --sam-runtime-dir DIR --sam-model-dir DIR
 *
 * ABO data, images and 3D models © Amazon.com, CC-BY-4.0.
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { validateAssemblyIR } from '../src/engine/assembly-compiler';
import type { AssemblyIR } from '../src/engine/assembly-ir';
import { rasterizeIdBuffer } from '../src/engine/mesh-silhouette-raster';
import { orbitToPinhole } from '../src/engine/orbit-camera';
import { fitSilhouetteCamera } from '../src/engine/photo-part-color';
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
const SIZES = [96, 64, 48, 32, 24];
const MIN_IOU = 0.8;

/** Largest square window fully inside `inner` (integral image), nearest the region centroid on ties. */
function largestSquare(inner: Uint8Array, width: number, height: number): { x: number; y: number; size: number } | undefined {
  const integral = new Int32Array((width + 1) * (height + 1));
  let cx = 0; let cy = 0; let n = 0;
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      row += inner[y * width + x]!;
      integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1]! + row;
      if (inner[y * width + x]) { cx += x; cy += y; n += 1; }
    }
  }
  if (n === 0) return undefined;
  cx /= n; cy /= n;
  const sum = (x: number, y: number, s: number) => integral[(y + s) * (width + 1) + x + s]! - integral[y * (width + 1) + x + s]! - integral[(y + s) * (width + 1) + x]! + integral[y * (width + 1) + x]!;
  for (const size of SIZES) {
    let best: { x: number; y: number; size: number; d: number } | undefined;
    for (let y = 0; y + size <= height; y += 2) for (let x = 0; x + size <= width; x += 2) {
      if (sum(x, y, size) !== size * size) continue;
      const d = Math.hypot(x + size / 2 - cx, y + size / 2 - cy);
      if (!best || d < best.d) best = { x, y, size, d };
    }
    if (best) return { x: best.x, y: best.y, size: best.size };
  }
  return undefined;
}

/** Crop, divide out low-frequency luminance (box blur, radius size/4) and return RGBA bytes. */
function delitPatch(rgba: Uint8ClampedArray, width: number, box: { x: number; y: number; size: number }): Uint8Array {
  const { x: x0, y: y0, size } = box;
  const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const enc = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
  const rgb = new Float32Array(size * size * 3);
  const lum = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const p = (y0 + y) * width + x0 + x;
    const i = y * size + x;
    for (let c = 0; c < 3; c += 1) rgb[i * 3 + c] = lin(rgba[p * 4 + c]!);
    lum[i] = 0.2126 * rgb[i * 3]! + 0.7152 * rgb[i * 3 + 1]! + 0.0722 * rgb[i * 3 + 2]!;
  }
  const radius = Math.max(2, Math.floor(size / 4));
  const meanLum = lum.reduce((a, b) => a + b, 0) / lum.length;
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    let s = 0; let k = 0;
    for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      const yy = Math.min(size - 1, Math.max(0, y + dy));
      const xx = Math.min(size - 1, Math.max(0, x + dx));
      s += lum[yy * size + xx]!; k += 1;
    }
    const shading = Math.max(1e-4, s / k) / Math.max(1e-4, meanLum);
    const i = y * size + x;
    for (let c = 0; c < 3; c += 1) out[i * 4 + c] = enc(rgb[i * 3 + c]! / shading);
    out[i * 4 + 3] = 255;
  }
  return out;
}

const runDir = resolve(required('run'));
const arm = required('arm');
const dataDir = resolve(required('data-dir'));
const outDir = resolve(required('output'));
mkdirSync(outDir, { recursive: true });
copyFileSync(join(runDir, 'results.json'), join(outDir, 'results.json'));
const run = JSON.parse(readFileSync(join(runDir, 'results.json'), 'utf8')) as { results: Array<{ modelId: string; excluded?: string; [key: string]: unknown }> };
const work = mkdtempSync(join(tmpdir(), 'abo-photo-patch-'));
const receipts = [];
for (const result of run.results) {
  const irPath = join(runDir, `${result.modelId}-${arm}-ir.json`);
  if (result.excluded || !existsSync(irPath)) continue;
  const ir = JSON.parse(readFileSync(irPath, 'utf8')) as AssemblyIR;
  const patterned = ir.components.map((component, index) => ((component.material.albedoVariation ?? 0) > 0 ? index : -1)).filter((index) => index >= 0);
  let out = ir;
  let iou = NaN;
  const patched: Array<{ id: string; size: number }> = [];
  if (patterned.length > 0) {
    const photo = await preparePhoto(join(dataDir, 'spins', `${result.modelId}-0.jpg`), PREP);
    const photoFile = join(work, `${result.modelId}.png`);
    writeFileSync(photoFile, photo.png);
    const box = maskBox(foregroundMask(photo.rgba, photo.width, photo.height, PREP.backgroundThreshold), photo.width);
    const mask = box ? await samObjectMask({ photoFile, box, workDir: work, stem: result.modelId, width: photo.width, height: photo.height, maxSide: PREP.maxSide, samRuntimeDir: required('sam-runtime-dir'), samModelDir: required('sam-model-dir') }) : new Uint8Array(photo.width * photo.height);
    const meshes = assemblyMeshes(ir);
    const view = result[`${arm}View`] as { azimuthDeg: number; elevationDeg: number } | undefined;
    const fit = fitSilhouetteCamera(meshes, mask, photo.width, photo.height, { fovDeg: 30, fitRaster: 160, maxEvaluations: 2400, seed: 1, ...(view ? { viewHint: view } : {}) });
    iou = fit.iou;
    if (fit.iou >= MIN_IOU) {
      const ids = rasterizeIdBuffer(orbitToPinhole(fit.camera), meshes);
      const components = structuredClone(ir.components);
      for (const index of patterned) {
        const inner = new Uint8Array(photo.width * photo.height);
        for (let y = 2; y < photo.height - 2; y += 1) for (let x = 2; x < photo.width - 2; x += 1) {
          const p = y * photo.width + x;
          if (ids[p] !== index || !mask[p]) continue;
          let ok = true;
          for (let dy = -2; dy <= 2 && ok; dy += 1) for (let dx = -2; dx <= 2; dx += 1) if (ids[p + dy * photo.width + dx] !== index) { ok = false; break; }
          if (ok) inner[p] = 1;
        }
        const square = largestSquare(inner, photo.width, photo.height);
        if (!square) continue;
        const bytes = delitPatch(photo.rgba, photo.width, square);
        const material = components[index]!.material;
        material.albedoPatch = { width: square.size, height: square.size, rgbaBase64: Buffer.from(bytes).toString('base64'), source: `abo:${result.modelId}:frame0:${square.x},${square.y},${square.size}` };
        patched.push({ id: components[index]!.id, size: square.size });
      }
      out = { ...structuredClone(ir), components };
      validateAssemblyIR(out);
    }
  }
  writeFileSync(join(outDir, `${result.modelId}-${arm}-ir.json`), `${JSON.stringify(out, null, 1)}\n`);
  receipts.push({ modelId: result.modelId, patterned: patterned.length, patched, silhouetteIoU: Number.isFinite(iou) ? +iou.toFixed(4) : null });
  console.log(JSON.stringify({ modelId: result.modelId, patterned: patterned.length, patched: patched.length, iou: receipts.at(-1)!.silhouetteIoU }));
}
rmSync(work, { recursive: true, force: true });
writeFileSync(join(outDir, 'photo-patch-receipts.json'), `${JSON.stringify({ schema: 'sceliph.abo-photo-patch/0.1', sizes: SIZES, minIoU: MIN_IOU, receipts }, null, 1)}\n`);
