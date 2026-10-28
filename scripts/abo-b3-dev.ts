/**
 * B3 first slice (dev, exploratory; texture-plan/b3-review-codex.md §7): on a
 * fixed two-photo IR, compare four albedo arms against real turntable photos
 * from views the bake never used.
 *   B0       the IR's own colours
 *   B4       photo-judged finish and pattern annotation (abo-material-annotate)
 *   B3raw    photo projection from frames 0 and 18, baked into a chart atlas, B4 elsewhere
 *   B3light  the same after a weak per-part de-light (strength 0.35, gain within [0.5, 2])
 * Cameras: fitTurntableCameras on frames 0 and 18 with the IR (sign fixed in slice 16).
 * Held-out frame k starts from frame 0's camera turned by 5°·k about the vertical
 * axis and is then refitted to that frame's silhouette alone (no colour), so the
 * pose is registered but identical for every arm. The same fit with the ground-truth mesh checks that
 * turntable model (held-out silhouette IoU); ground truth is used for nothing else.
 * Scores: unlit albedo render against the photo, inside the photo silhouette and
 * the render, eroded away from part boundaries: SSIM of L* at full resolution
 * and after 4× box downsampling (less sensitive to residual misregistration),
 * and mean ΔE00.
 *
 *   npx vite-node scripts/abo-b3-dev.ts -- --run RUN_DIR --b4 B4_DIR --selection selection.json --data-dir DIR \
 *     --output OUT_DIR --sam-runtime-dir DIR --sam-model-dir DIR [--only id,id]
 *
 * ABO data, images and 3D models © Amazon.com, CC-BY-4.0.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import type { AssemblyIR } from '../src/engine/assembly-ir';
import { orbitToPinhole, type OrbitCamera } from '../src/engine/orbit-camera';
import { rasterizeSilhouette } from '../src/engine/mesh-silhouette-raster';
import { fitSilhouetteCamera, fitTurntableCameras } from '../src/engine/photo-part-color';
import { ciede2000, srgbToLab, ssim } from '../src/eval/appearance-metrics';
import { assemblyMeshes, foregroundMask, maskBox, preparePhoto, samObjectMask } from './lib/abo-eval';
import { readGlbTriangles } from './lib/glb-triangles';
import { bakeParts, bakeProjection, bakedShading, delightPhoto, insideDistance, irShading, renderAlbedo, type BakePhoto, type Shading } from './lib/texture-bake';

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
const BAKE_FRAMES = [0, 18] as const;
const HELD_OUT = [9, 27, 36, 54];
const SIGN = 1 as const;
const BAKE = { atlasSize: 2048, erodePx: 3, minFacing: 0.25, depthTolerance: 0.01 };
const DELIGHT = { strength: 0.35, radiusShare: 1 / 8 };
const SCORE_ERODE_PX = 2;

const runDir = resolve(required('run'));
const b4Dir = resolve(required('b4'));
const dataDir = resolve(required('data-dir'));
const outDir = resolve(required('output'));
mkdirSync(outDir, { recursive: true });
const only = argument('only')?.split(',');
const selection = JSON.parse(readFileSync(resolve(required('selection')), 'utf8')) as { items: Array<{ modelId: string; name: string }> };
const run = JSON.parse(readFileSync(join(runDir, 'results.json'), 'utf8')) as { results: Array<{ modelId: string; excluded?: string; a2View?: { azimuthDeg: number; elevationDeg: number } }> };

async function loadFrame(modelId: string, frame: number) {
  const photo = await preparePhoto(join(dataDir, 'spins', `${modelId}-${frame}.jpg`), PREP);
  const file = join(outDir, 'work', `${modelId}-${frame}.png`);
  mkdirSync(join(outDir, 'work'), { recursive: true });
  writeFileSync(file, photo.png);
  const foreground = foregroundMask(photo.rgba, photo.width, photo.height, PREP.backgroundThreshold);
  const box = maskBox(foreground, photo.width);
  if (!box) throw new Error(`${modelId}-${frame}: empty foreground.`);
  const sam = await samObjectMask({ photoFile: file, box, workDir: join(outDir, 'work'), stem: `${modelId}-${frame}`, width: photo.width, height: photo.height, maxSide: PREP.maxSide, samRuntimeDir: required('sam-runtime-dir'), samModelDir: required('sam-model-dir') });
  return { ...photo, mask: sam.map((value, i) => (value && foreground[i] ? 1 : 0)) };
}

const turned = (camera: OrbitCamera, frame: number): OrbitCamera => ({ ...camera, azimuthDeg: camera.azimuthDeg + SIGN * 5 * frame });
const iou = (a: Uint8Array, b: Uint8Array) => { let i = 0; let u = 0; for (let k = 0; k < a.length; k += 1) { if (a[k] && b[k]) i += 1; if (a[k] || b[k]) u += 1; } return u ? i / u : 0; };

function score(photo: { rgba: Uint8ClampedArray; mask: Uint8Array; width: number; height: number }, render: ReturnType<typeof renderAlbedo>) {
  const { width, height } = photo;
  const covered = Uint8Array.from(render.surface.part, (p) => (p >= 0 ? 1 : 0));
  // Interior of each rendered part and of the photo silhouette.
  const partInside = new Uint8Array(width * height);
  const parts = new Set(render.surface.part);
  const region = new Uint8Array(width * height);
  for (const p of parts) {
    if (p < 0) continue;
    for (let i = 0; i < region.length; i += 1) region[i] = render.surface.part[i] === p ? 1 : 0;
    const d = insideDistance(region, width, height, SCORE_ERODE_PX + 1);
    for (let i = 0; i < region.length; i += 1) if (region[i] && d[i]! > SCORE_ERODE_PX) partInside[i] = 1;
  }
  const photoInside = insideDistance(photo.mask, width, height, SCORE_ERODE_PX + 1);
  const shared = new Uint8Array(width * height);
  let n = 0; let missing = 0; let product = 0;
  for (let i = 0; i < shared.length; i += 1) {
    if (photo.mask[i]) { product += 1; if (!covered[i]) missing += 1; }
    if (partInside[i] && photoInside[i]! > SCORE_ERODE_PX) { shared[i] = 1; n += 1; }
  }
  const labA = new Float32Array(width * height * 3);
  const labB = new Float32Array(width * height * 3);
  let deltaE = 0;
  for (let i = 0; i < shared.length; i += 1) {
    if (!shared[i]) continue;
    const a = srgbToLab(render.rgba[i * 4]!, render.rgba[i * 4 + 1]!, render.rgba[i * 4 + 2]!);
    const b = srgbToLab(photo.rgba[i * 4]!, photo.rgba[i * 4 + 1]!, photo.rgba[i * 4 + 2]!);
    labA.set(a, i * 3); labB.set(b, i * 3);
    deltaE += ciede2000(a, b);
  }
  // 4× box-downsampled SSIM over blocks that lie fully inside the shared region.
  const cw = Math.floor(width / 4); const ch = Math.floor(height / 4);
  const coarseA = new Float32Array(cw * ch * 3); const coarseB = new Float32Array(cw * ch * 3); const coarseShared = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y += 1) for (let x = 0; x < cw; x += 1) {
    let full = true;
    for (let j = 0; j < 4 && full; j += 1) for (let i = 0; i < 4; i += 1) if (!shared[(y * 4 + j) * width + x * 4 + i]) { full = false; break; }
    if (!full) continue;
    coarseShared[y * cw + x] = 1;
    for (let c = 0; c < 3; c += 1) {
      let sa = 0; let sb = 0;
      for (let j = 0; j < 4; j += 1) for (let i = 0; i < 4; i += 1) { const q = ((y * 4 + j) * width + x * 4 + i) * 3 + c; sa += labA[q]!; sb += labB[q]!; }
      coarseA[(y * cw + x) * 3 + c] = sa / 16; coarseB[(y * cw + x) * 3 + c] = sb / 16;
    }
  }
  return { ssim: ssim(labA, labB, shared, width, height), ssimCoarse: ssim(coarseA, coarseB, coarseShared, cw, ch), deltaE00: n ? deltaE / n : NaN, scoredPixels: n, missingShare: product ? missing / product : NaN, silhouetteIoU: iou(covered, photo.mask) };
}

function writePng(path: string, rgba: Uint8ClampedArray, width: number, height: number) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  image.data.set(rgba);
  context.putImageData(image, 0, 0);
  writeFileSync(path, canvas.toBuffer('image/png'));
}

const results = [];
for (const entry of run.results) {
  if (entry.excluded || (only && !only.includes(entry.modelId))) continue;
  const id = entry.modelId;
  const irPath = join(runDir, `${id}-a2-ir.json`);
  const b4Path = join(b4Dir, `${id}-a2-ir.json`);
  if (!existsSync(irPath) || !existsSync(b4Path)) continue;
  const started = performance.now();
  const b0Ir = JSON.parse(readFileSync(irPath, 'utf8')) as AssemblyIR;
  const b4Ir = JSON.parse(readFileSync(b4Path, 'utf8')) as AssemblyIR;
  const frames = new Map<number, Awaited<ReturnType<typeof loadFrame>>>();
  for (const frame of [...BAKE_FRAMES, ...HELD_OUT]) frames.set(frame, await loadFrame(id, frame));
  const views = BAKE_FRAMES.map((frame) => ({ mask: frames.get(frame)!.mask, width: frames.get(frame)!.width, height: frames.get(frame)!.height })) as [{ mask: Uint8Array; width: number; height: number }, { mask: Uint8Array; width: number; height: number }];
  const fit = fitTurntableCameras(assemblyMeshes(b0Ir), views, SIGN, { seed: 1, maxEvaluations: 2400, ...(entry.a2View ? { viewHint: entry.a2View } : {}) });
  // Turntable-model check with the ground-truth mesh (diagnostic only).
  const truth = await readGlbTriangles(join(dataDir, 'models', `${id}.glb`));
  const truthFit = fitTurntableCameras(truth.meshes, views, SIGN, { seed: 1, maxEvaluations: 2400 });
  const truthHeldOut = Object.fromEntries(HELD_OUT.map((frame) => {
    const photo = frames.get(frame)!;
    const camera = orbitToPinhole({ ...turned(truthFit.cameras[0], frame), width: photo.width, height: photo.height });
    return [frame, +iou(rasterizeSilhouette(camera, truth.meshes), photo.mask).toFixed(4)];
  }));

  const b0Parts = bakeParts(b0Ir);
  const b4Parts = bakeParts(b4Ir);
  const bakePhotos: BakePhoto[] = BAKE_FRAMES.map((frame, k) => ({ camera: orbitToPinhole(fit.cameras[k]!), rgba: frames.get(frame)!.rgba, mask: frames.get(frame)!.mask }));
  const raw = bakeProjection(b4Parts, bakePhotos, BAKE);
  const radius = Math.max(4, Math.round(Math.max(bakePhotos[0]!.camera.width, bakePhotos[0]!.camera.height) * DELIGHT.radiusShare));
  const light = bakeProjection(b4Parts, bakePhotos.map((photo) => delightPhoto(photo, b4Parts, DELIGHT.strength, radius)), BAKE);
  const b4Shading = irShading(b4Parts);
  const arms: Array<[string, typeof b0Parts, Shading]> = [
    ['B0', b0Parts, irShading(b0Parts)],
    ['B4', b4Parts, b4Shading],
    ['B3raw', b4Parts, bakedShading(raw, b4Shading)],
    ['B3light', b4Parts, bakedShading(light, b4Shading)],
  ];
  const scores: Record<string, Record<number, ReturnType<typeof score>>> = {};
  const registration: Record<number, { turnedIoU: number; refitIoU: number }> = {};
  for (const frame of HELD_OUT) {
    const photo = frames.get(frame)!;
    const start = turned(fit.cameras[0], frame);
    const refit = fitSilhouetteCamera(assemblyMeshes(b0Ir), photo.mask, photo.width, photo.height, { seed: 1, maxEvaluations: 1600, viewHint: { azimuthDeg: start.azimuthDeg, elevationDeg: start.elevationDeg } });
    const startIoU = iou(rasterizeSilhouette(orbitToPinhole({ ...start, width: photo.width, height: photo.height }), assemblyMeshes(b0Ir)), photo.mask);
    const useRefit = refit.iou > startIoU;
    registration[frame] = { turnedIoU: +startIoU.toFixed(4), refitIoU: +refit.iou.toFixed(4) };
    const camera = orbitToPinhole(useRefit ? { ...refit.camera, width: photo.width, height: photo.height } : { ...start, width: photo.width, height: photo.height });
    const strip = new Uint8ClampedArray(photo.width * 5 * photo.height * 4);
    const paste = (rgba: Uint8ClampedArray, slot: number) => {
      for (let y = 0; y < photo.height; y += 1) strip.set(rgba.subarray(y * photo.width * 4, (y + 1) * photo.width * 4), (y * photo.width * 5 + slot * photo.width) * 4);
    };
    paste(photo.rgba, 0);
    arms.forEach(([name, parts, shading], slot) => {
      const render = renderAlbedo(camera, parts, shading);
      (scores[name] ??= {})[frame] = score(photo, render);
      paste(render.rgba, slot + 1);
    });
    writePng(join(outDir, `${id}-f${frame}-photo-B0-B4-B3raw-B3light.png`), strip, photo.width * 5, photo.height);
  }
  const record = {
    modelId: id, name: selection.items.find((item) => item.modelId === id)?.name,
    fitIoU: fit.iou.map((v) => +v.toFixed(4)), registration, truthFitIoU: truthFit.iou.map((v) => +v.toFixed(4)), truthHeldOutIoU: truthHeldOut,
    bake: { raw: { coverage: +raw.coverage.toFixed(4), perPhoto: raw.perPhoto, overlapTexels: raw.overlapTexels }, light: { coverage: +light.coverage.toFixed(4) } },
    scores, ms: Math.round(performance.now() - started),
  };
  results.push(record);
  const brief = (arm: string) => HELD_OUT.map((f) => scores[arm]![f]!.ssimCoarse.toFixed(3)).join('/');
  console.log(JSON.stringify({ id, fit: record.fitIoU, registration, truthHeldOut, coverage: record.bake.raw.coverage, ssim: { B0: brief('B0'), B4: brief('B4'), B3raw: brief('B3raw'), B3light: brief('B3light') } }));
}
writeFileSync(join(outDir, 'results.json'), `${JSON.stringify({ schema: 'sceliph.abo-b3-dev/0.1', bakeFrames: BAKE_FRAMES, heldOut: HELD_OUT, bake: BAKE, delight: DELIGHT, scoreErodePx: SCORE_ERODE_PX, results }, null, 1)}\n`);
