import type { AssemblyIR } from './assembly-ir';
import { minimizeCmaEs } from './cma-es';
import { orbitToPinhole, type OrbitCamera } from './orbit-camera';
import { rasterizeIdBuffer, rasterizeSilhouette, type WorldTriangleMesh } from './mesh-silhouette-raster';

/**
 * Photo → per-part base colour. The IR's shape is never changed: only a camera
 * is fitted so the compiled silhouette overlaps the photo's object mask, then
 * each part's colour becomes the median of the photo pixels where that part is
 * the visible surface (part boundaries excluded). Parts the photo does not show
 * keep the colour the model wrote and are reported as inferred.
 */

type Vec3 = [number, number, number];

export interface PhotoImage { width: number; height: number; data: Uint8ClampedArray | Uint8Array }
export interface PartColorOptions {
  /**
   * View from the model's reply (same convention as OrbitCamera: azimuth 0 looks
   * from +Z, positive toward +X). Silhouettes cannot tell front from back, so the
   * search stays within ±60° of it with a soft prior.
   */
  viewHint?: { azimuthDeg: number; elevationDeg: number };
  /** Vertical field of view assumed for the photo (catalog photos are long-lens). */
  fovDeg?: number;
  /** Longest side of the silhouette raster used while fitting. */
  fitRaster?: number;
  maxEvaluations?: number;
  /** Minimum visible interior pixels for a part to take a photo colour. */
  minPixels?: number;
  /**
   * Catalog photos carry shading; the albedo is closest to the well-lit faces.
   * Colours come from pixels at or above this luminance quantile of each part.
   */
  litQuantile?: number;
  /** Below this silhouette IoU the camera is not trusted and no colour is taken. */
  minSilhouetteIoU?: number;
  /**
   * A single photo cannot separate surface brightness from exposure. 'model'
   * keeps the photo's hues and relative part brightness but sets one global
   * exposure gain so the photo parts' median luminance matches the colours the
   * model wrote; 'photo' uses photo values as they are.
   */
  exposure?: 'photo' | 'model';
  seed?: number;
}

export interface PartColor { id: string; source: 'photo' | 'inferred'; color: string; pixels: number; reason?: 'hidden' | 'unregistered' }
export interface PartColorResult {
  camera: OrbitCamera;
  silhouetteIoU: number;
  /** Linear-light gain applied to every photo colour (1 when exposure is 'photo'). */
  exposureGain: number;
  parts: PartColor[];
}

function bounds(meshes: WorldTriangleMesh[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const mesh of meshes) for (let i = 0; i < mesh.positions.length; i += 3) for (let a = 0; a < 3; a += 1) {
    min[a] = Math.min(min[a]!, mesh.positions[i + a]!);
    max[a] = Math.max(max[a]!, mesh.positions[i + a]!);
  }
  return { min, max };
}

/** Nearest-neighbour downsample of a binary mask to fit maxSide. */
function downsample(mask: Uint8Array, width: number, height: number, maxSide: number): { mask: Uint8Array; width: number; height: number; scale: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    out[y * w + x] = mask[Math.min(height - 1, Math.floor((y + 0.5) / scale)) * width + Math.min(width - 1, Math.floor((x + 0.5) / scale))]!;
  }
  return { mask: out, width: w, height: h, scale };
}

function iou(a: Uint8Array, b: Uint8Array): number {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] || b[i]) union += 1;
    if (a[i] && b[i]) inter += 1;
  }
  return union ? inter / union : 0;
}

/** Fits azimuth, elevation, distance and image offset so the IR silhouette matches the photo mask. */
export function fitSilhouetteCamera(meshes: WorldTriangleMesh[], mask: Uint8Array, width: number, height: number, options: PartColorOptions = {}): { camera: OrbitCamera; iou: number } {
  const small = downsample(mask, width, height, options.fitRaster ?? 160);
  const { min, max } = bounds(meshes);
  const target: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
  const fov = (options.fovDeg ?? 30) * Math.PI / 180;
  // Parameters: azimuth°, elevation°, log distance factor, image offset x/y (half-widths).
  const make = (x: number[], w: number, h: number): OrbitCamera => {
    const f = h / 2 / Math.tan(fov / 2);
    return {
      width: w, height: h, fx: f, fy: f,
      cx: w / 2 + x[3]! * w * 0.5, cy: h / 2 + x[4]! * h * 0.5,
      target, azimuthDeg: x[0]!, elevationDeg: x[1]!,
      distanceMm: radius / Math.tan(fov / 2) * Math.exp(x[2]!),
      rollDeg: 0, focalScale: 1,
    };
  };
  // CMA-ES uses one step size, so search a normalised vector u: x = origin + u × scales.
  const scales = [30, 15, 0.4, 0.3, 0.3];
  const hintAz = options.viewHint?.azimuthDeg ?? 0;
  const prior = options.viewHint ? 0.05 : 0;
  const silhouetteLoss = (x: number[]) => {
    try {
      return 1 - iou(rasterizeSilhouette(orbitToPinhole(make(x, small.width, small.height)), meshes), small.mask);
    } catch {
      return 1; // camera inside the model: worst possible overlap
    }
  };
  const lossAt = (origin: number[]) => (u: number[]) => {
    const x = origin.map((value, i) => value + u[i]! * scales[i]!);
    return silhouetteLoss(x) + prior * ((x[0]! - hintAz) / 45) ** 2;
  };
  const hintEl = Math.max(-10, Math.min(60, options.viewHint?.elevationDeg ?? 15));
  const budget = options.maxEvaluations ?? 2400;
  let best = { x: [hintAz, hintEl, 0, 0, 0], value: Infinity };
  const starts = options.viewHint ? [-60, -30, 0, 30, 60] : [0, 45, 90, 135, 180, 225, 270, 315];
  for (const [k, offset] of starts.entries()) {
    const origin = [hintAz + offset, hintEl, 0, 0, 0];
    const result = minimizeCmaEs(lossAt(origin), [0, 0, 0, 0, 0], { sigma: 0.5, seed: (options.seed ?? 1) + k, maxEvaluations: Math.round(budget / starts.length) });
    if (result.bestValue < best.value) best = { x: origin.map((value, i) => value + result.best[i]! * scales[i]!), value: result.bestValue };
  }
  const refined = minimizeCmaEs(lossAt(best.x), [0, 0, 0, 0, 0], { sigma: 0.15, seed: (options.seed ?? 1) + 99, maxEvaluations: budget });
  if (refined.bestValue < best.value) best = { x: best.x.map((value, i) => value + refined.best[i]! * scales[i]!), value: refined.bestValue };
  return { camera: make(best.x, width, height), iou: 1 - silhouetteLoss(best.x) };
}

const toLinear = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toSrgb = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
const hex = (rgb: number[]) => `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`;

/** Per-part photo colours under a fitted camera; per-channel median in linear light. */
export function partColorsFromPhoto(ir: AssemblyIR, meshes: WorldTriangleMesh[], photo: PhotoImage, mask: Uint8Array, options: PartColorOptions = {}): PartColorResult {
  if (meshes.length !== ir.components.length) throw new Error('One world mesh per component is required.');
  const fit = fitSilhouetteCamera(meshes, mask, photo.width, photo.height, options);
  const ids = rasterizeIdBuffer(orbitToPinhole(fit.camera), meshes);
  const { width, height } = photo;
  const samples = ir.components.map(() => [[], [], []] as number[][]);
  const whites = ir.components.map(() => 0);
  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      const p = y * width + x;
      const id = ids[p]!;
      if (id < 0 || !mask[p]) continue;
      // Interior only: a 5×5 neighbourhood of the same part, so edges and seams do not bleed.
      let interior = true;
      for (let dy = -2; dy <= 2 && interior; dy += 1) for (let dx = -2; dx <= 2; dx += 1) if (ids[p + dy * width + dx] !== id || !mask[p + dy * width + dx]) { interior = false; break; }
      if (!interior) continue;
      const red = photo.data[p * 4]!;
      const green = photo.data[p * 4 + 1]!;
      const blue = photo.data[p * 4 + 2]!;
      whites[id]! += Math.min(red, green, blue) >= 245 ? 1 : 0;
      for (let c = 0; c < 3; c += 1) samples[id]![c]!.push(toLinear(photo.data[p * 4 + c]!));
    }
  }
  const minPixels = options.minPixels ?? 40;
  const quantile = options.litQuantile ?? 0.8;
  const trusted = fit.iou >= (options.minSilhouetteIoU ?? 0.8);
  const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]!; };
  const linear: Array<number[] | undefined> = [];
  const parts = ir.components.map((component, index): PartColor => {
    let [r, g, b] = samples[index]!;
    // Pure-white pixels are the studio background showing past a mis-registered thin
    // part, unless most of the part really is white.
    if (whites[index]! > 0 && whites[index]! < 0.6 * r!.length) {
      const keep = r!.flatMap((value, i) => (Math.min(value, g![i]!, b![i]!) >= toLinear(245) ? [] : [i]));
      [r, g, b] = [r, g, b].map((channel) => keep.map((i) => channel![i]!));
    }
    const pixels = r!.length;
    if (!trusted) return { id: component.id, source: 'inferred', color: component.material.color, pixels, reason: 'unregistered' };
    if (pixels < minPixels) return { id: component.id, source: 'inferred', color: component.material.color, pixels, reason: 'hidden' };
    const luminance = r!.map((value, i) => 0.2126 * value + 0.7152 * g![i]! + 0.0722 * b![i]!);
    const cut = [...luminance].sort((x, y) => x - y)[Math.min(pixels - 1, Math.floor(pixels * quantile))]!;
    const lit = luminance.flatMap((value, i) => (value >= cut ? [i] : []));
    linear[index] = [r!, g!, b!].map((channel) => median(lit.map((i) => channel[i]!)));
    return { id: component.id, source: 'photo', color: '', pixels };
  });
  const lum = (rgb: number[]) => 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
  const fromHex = (value: string) => [1, 3, 5].map((i) => toLinear(Number.parseInt(value.slice(i, i + 2), 16)));
  let gain = 1;
  if ((options.exposure ?? 'model') === 'model') {
    const ratios = parts.flatMap((part, index) => {
      const photoRgb = linear[index];
      const modelY = /^#[0-9a-fA-F]{6}$/.test(ir.components[index]!.material.color) ? lum(fromHex(ir.components[index]!.material.color)) : NaN;
      return part.source === 'photo' && photoRgb && lum(photoRgb) > 1e-4 && Number.isFinite(modelY) ? [modelY / lum(photoRgb)] : [];
    });
    if (ratios.length > 0) gain = median(ratios);
  }
  for (const [index, part] of parts.entries()) if (part.source === 'photo') part.color = hex(linear[index]!.map((value) => toSrgb(value * gain)));
  return { camera: fit.camera, silhouetteIoU: fit.iou, exposureGain: gain, parts };
}

/** A copy of the IR with photo colours applied; shape, ids and every other field unchanged. */
export function applyPartColors(ir: AssemblyIR, parts: PartColor[]): AssemblyIR {
  const byId = new Map(parts.filter((part) => part.source === 'photo').map((part) => [part.id, part.color]));
  return {
    ...structuredClone(ir),
    components: ir.components.map((component) => {
      const color = byId.get(component.id);
      return color ? { ...structuredClone(component), material: { ...structuredClone(component.material), color } } : structuredClone(component);
    }),
  };
}
