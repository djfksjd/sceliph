/**
 * Post-processing for the raw MoGe-2 ONNX forward pass.
 *
 * The exported ONNX graph only returns the affine point map, normal map, mask
 * probability and metric scale; focal/shift recovery and reprojection live in
 * the upstream PyTorch `infer()` and must be re-implemented by the caller.
 * This module is a TypeScript port of that post-processing from
 * microsoft/MoGe (MIT License, Copyright (c) Microsoft Corporation),
 * revision 74fbce054ebed49800de42d0ad0e83495065719a:
 * `moge/model/v2.py#infer`, `moge/utils/geometry_torch.py#recover_focal_shift`
 * and `moge/utils/geometry_numpy.py#solve_optimal_focal_shift`.
 *
 * Differences from upstream: the scalar least-squares solve uses a damped
 * Gauss-Newton loop with a tighter tolerance than SciPy's `ftol=1e-3`, and a
 * start shift that keeps every sampled depth positive. Outputs are camera
 * estimates, never measured dimensions, and this module never writes IR.
 */

export interface MogeRawOutput {
  width: number;
  height: number;
  /** Affine-invariant point map, row-major H×W×3, as returned by ONNX `points`. */
  points: Float32Array;
  /** Unit normal map H×W×3 (OpenCV camera axes), as returned by ONNX `normal`. */
  normal?: Float32Array;
  /** Validity probability H×W in [0, 1], as returned by ONNX `mask`. */
  mask?: Float32Array;
  /** Metric scale (metres per affine unit), as returned by ONNX `metric_scale`. */
  metricScale?: number;
}

export interface MogeIntrinsics {
  /** Normalized pinhole intrinsics: pixel = (fx * X / Z + cx) * width. */
  fx: number;
  fy: number;
  cx: number;
  cy: number;
}

export interface MogeGeometry {
  width: number;
  height: number;
  /** Focal length relative to half the image diagonal (upstream convention). */
  focal: number;
  shift: number;
  intrinsics: MogeIntrinsics;
  fovXDegrees: number;
  fovYDegrees: number;
  /** Metres when `metricScale` was available, otherwise affine units. */
  depth: Float32Array;
  points: Float32Array;
  normal?: Float32Array;
  validMask: Uint8Array;
  validPixels: number;
  metricScale?: number;
}

export interface FinalizeMogeOptions {
  /** Known horizontal field of view; when given only the shift is recovered. */
  fovXDegrees?: number;
  forceProjection?: boolean;
  downsample?: [number, number];
}

const MAX_PIXELS = 4_194_304;
const MASK_THRESHOLD = 0.5;

function checkRaw(raw: MogeRawOutput): void {
  const { width, height } = raw;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || width * height > MAX_PIXELS) {
    throw new Error('MoGe output dimensions are unsafe.');
  }
  const pixels = width * height;
  if (!(raw.points instanceof Float32Array) || raw.points.length !== pixels * 3) {
    throw new Error('MoGe point map must be a Float32Array of H×W×3.');
  }
  if (raw.normal !== undefined && (!(raw.normal instanceof Float32Array) || raw.normal.length !== pixels * 3)) {
    throw new Error('MoGe normal map must be a Float32Array of H×W×3.');
  }
  if (raw.mask !== undefined && (!(raw.mask instanceof Float32Array) || raw.mask.length !== pixels)) {
    throw new Error('MoGe mask must be a Float32Array of H×W.');
  }
  if (raw.metricScale !== undefined && !(Number.isFinite(raw.metricScale) && raw.metricScale > 0)) {
    throw new Error('MoGe metric scale must be finite and positive.');
  }
}

/**
 * UV with the top-left corner at (-width / diagonal, -height / diagonal) and
 * the bottom-right corner at (width / diagonal, height / diagonal), sampled at
 * pixel centres. Row-major H×W×2.
 */
export function normalizedViewPlaneUv(width: number, height: number, aspectRatio = width / height): Float64Array {
  const spanX = aspectRatio / Math.sqrt(1 + aspectRatio ** 2);
  const spanY = 1 / Math.sqrt(1 + aspectRatio ** 2);
  const uv = new Float64Array(width * height * 2);
  const u0 = -spanX * (width - 1) / width;
  const v0 = -spanY * (height - 1) / height;
  const du = width > 1 ? (2 * spanX * (width - 1) / width) / (width - 1) : 0;
  const dv = height > 1 ? (2 * spanY * (height - 1) / height) / (height - 1) : 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 2;
      uv[index] = u0 + du * x;
      uv[index + 1] = v0 + dv * y;
    }
  }
  return uv;
}

/** Index map of PyTorch `F.interpolate(mode='nearest')` from `size` to `target`. */
function nearestSource(size: number, target: number): Int32Array {
  const scale = size / target;
  const map = new Int32Array(target);
  for (let i = 0; i < target; i += 1) map[i] = Math.min(size - 1, Math.floor(i * scale));
  return map;
}

function focalForShift(uv: Float64Array, xyz: Float64Array, shift: number): number {
  let numerator = 0;
  let denominator = 0;
  for (let i = 0, n = uv.length / 2; i < n; i += 1) {
    const z = xyz[i * 3 + 2]! + shift;
    const px = xyz[i * 3]! / z;
    const py = xyz[i * 3 + 1]! / z;
    numerator += px * uv[i * 2]! + py * uv[i * 2 + 1]!;
    denominator += px * px + py * py;
  }
  return numerator / denominator;
}

function residualCost(uv: Float64Array, xyz: Float64Array, shift: number, focal: number | undefined): number {
  const f = focal ?? focalForShift(uv, xyz, shift);
  let cost = 0;
  for (let i = 0, n = uv.length / 2; i < n; i += 1) {
    const z = xyz[i * 3 + 2]! + shift;
    const ex = f * xyz[i * 3]! / z - uv[i * 2]!;
    const ey = f * xyz[i * 3 + 1]! / z - uv[i * 2 + 1]!;
    cost += ex * ex + ey * ey;
  }
  return cost;
}

/**
 * Solves `min |focal * xy / (z + shift) - uv|` for the scalar shift (and the
 * closed-form focal when it is not given) with a damped Gauss-Newton loop.
 */
function solveShift(uv: Float64Array, xyz: Float64Array, focal: number | undefined): number {
  const n = uv.length / 2;
  let minZ = Infinity;
  let maxAbs = 0;
  for (let i = 0; i < n; i += 1) {
    minZ = Math.min(minZ, xyz[i * 3 + 2]!);
    maxAbs = Math.max(maxAbs, Math.abs(xyz[i * 3]!), Math.abs(xyz[i * 3 + 1]!), Math.abs(xyz[i * 3 + 2]!));
  }
  const floor = 1e-9 * Math.max(1, maxAbs);
  const lower = floor - minZ;
  let shift = Math.max(0, lower);
  let cost = residualCost(uv, xyz, shift, focal);
  let damping = 1e-3;
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const h = 1e-6 * Math.max(1, Math.abs(shift), maxAbs);
    const forward = shift + h;
    const backward = Math.max(lower, shift - h);
    const span = forward - backward;
    const fForward = focal ?? focalForShift(uv, xyz, forward);
    const fBackward = focal ?? focalForShift(uv, xyz, backward);
    const fCurrent = focal ?? focalForShift(uv, xyz, shift);
    let jtj = 0;
    let jtr = 0;
    for (let i = 0; i < n; i += 1) {
      for (let axis = 0; axis < 2; axis += 1) {
        const value = xyz[i * 3 + axis]!;
        const z = xyz[i * 3 + 2]!;
        const residual = fCurrent * value / (z + shift) - uv[i * 2 + axis]!;
        const jacobian = (fForward * value / (z + forward) - fBackward * value / (z + backward)) / span;
        jtj += jacobian * jacobian;
        jtr += jacobian * residual;
      }
    }
    if (!(jtj > 0)) break;
    let accepted = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const candidate = Math.max(lower, shift - jtr / (jtj * (1 + damping)));
      const candidateCost = residualCost(uv, xyz, candidate, focal);
      if (candidateCost <= cost) {
        const step = Math.abs(candidate - shift);
        shift = candidate;
        const improvement = cost - candidateCost;
        cost = candidateCost;
        damping = Math.max(1e-12, damping / 10);
        accepted = true;
        if (step <= 1e-12 * Math.max(1, Math.abs(shift)) || improvement <= 1e-15 * Math.max(cost, 1e-300)) return shift;
        break;
      }
      damping *= 10;
    }
    if (!accepted) break;
  }
  return shift;
}

export interface FocalShiftResult {
  focal: number;
  shift: number;
  sampledPoints: number;
}

/**
 * Recovers the relative focal length and z shift of an affine point map. Assumes
 * a centred optical axis, no distortion and square pixels, like upstream.
 */
export function recoverFocalShift(
  points: Float32Array,
  width: number,
  height: number,
  mask?: Uint8Array,
  focal?: number,
  downsample: [number, number] = [64, 64],
): FocalShiftResult {
  if (points.length !== width * height * 3) throw new Error('Point map size does not match its dimensions.');
  if (mask !== undefined && mask.length !== width * height) throw new Error('Mask size does not match its dimensions.');
  const [lowHeight, lowWidth] = downsample;
  if (!Number.isInteger(lowHeight) || !Number.isInteger(lowWidth) || lowHeight < 2 || lowWidth < 2 || lowHeight * lowWidth > 65_536) {
    throw new Error('Focal/shift downsample size is unsafe.');
  }
  const uvFull = normalizedViewPlaneUv(width, height);
  const rows = nearestSource(height, lowHeight);
  const columns = nearestSource(width, lowWidth);
  const uv: number[] = [];
  const xyz: number[] = [];
  for (let y = 0; y < lowHeight; y += 1) {
    for (let x = 0; x < lowWidth; x += 1) {
      const source = rows[y]! * width + columns[x]!;
      if (mask && mask[source] === 0) continue;
      const px = points[source * 3]!;
      const py = points[source * 3 + 1]!;
      const pz = points[source * 3 + 2]!;
      if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) continue;
      uv.push(uvFull[source * 2]!, uvFull[source * 2 + 1]!);
      xyz.push(px, py, pz);
    }
  }
  const sampledPoints = uv.length / 2;
  if (sampledPoints < 2) return { focal: focal ?? 1, shift: 0, sampledPoints };
  const uvArray = Float64Array.from(uv);
  const xyzArray = Float64Array.from(xyz);
  if (focal !== undefined) {
    if (!(Number.isFinite(focal) && focal > 0)) throw new Error('Known focal must be finite and positive.');
    return { focal, shift: solveShift(uvArray, xyzArray, focal), sampledPoints };
  }
  const shift = solveShift(uvArray, xyzArray, undefined);
  return { focal: focalForShift(uvArray, xyzArray, shift), shift, sampledPoints };
}

/** Converts the upstream diagonal-relative focal to normalized intrinsics. */
export function mogeIntrinsicsFromFocal(focal: number, aspectRatio: number): MogeIntrinsics {
  const diagonal = Math.sqrt(1 + aspectRatio ** 2);
  return { fx: focal / 2 * diagonal / aspectRatio, fy: focal / 2 * diagonal, cx: 0.5, cy: 0.5 };
}

export function focalFromFovX(fovXDegrees: number, aspectRatio: number): number {
  if (!(Number.isFinite(fovXDegrees) && fovXDegrees > 0 && fovXDegrees < 180)) {
    throw new Error('Horizontal field of view must be within (0, 180) degrees.');
  }
  return aspectRatio / Math.sqrt(1 + aspectRatio ** 2) / Math.tan(fovXDegrees * Math.PI / 360);
}

const fovDegrees = (normalizedFocal: number): number => 2 * Math.atan(0.5 / normalizedFocal) * 180 / Math.PI;

/** OpenCV-convention back-projection at pixel centres; non-finite depth stays non-finite. */
export function depthMapToPointMap(depth: Float32Array, width: number, height: number, intrinsics: MogeIntrinsics): Float32Array {
  if (depth.length !== width * height) throw new Error('Depth size does not match its dimensions.');
  const points = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      const index = y * width + x;
      const z = depth[index]!;
      points[index * 3] = (u - intrinsics.cx) / intrinsics.fx * z;
      points[index * 3 + 1] = (v - intrinsics.cy) / intrinsics.fy * z;
      points[index * 3 + 2] = z;
    }
  }
  return points;
}

/** Mirrors upstream `infer(force_projection=True, apply_mask=True)` for one image. */
export function finalizeMogeOutput(raw: MogeRawOutput, options: FinalizeMogeOptions = {}): MogeGeometry {
  checkRaw(raw);
  const { width, height } = raw;
  const pixels = width * height;
  const aspectRatio = width / height;
  const validMask = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i += 1) validMask[i] = raw.mask === undefined || raw.mask[i]! > MASK_THRESHOLD ? 1 : 0;
  const known = options.fovXDegrees === undefined ? undefined : focalFromFovX(options.fovXDegrees, aspectRatio);
  const recovered = recoverFocalShift(raw.points, width, height, raw.mask === undefined ? undefined : validMask, known, options.downsample);
  const intrinsics = mogeIntrinsicsFromFocal(recovered.focal, aspectRatio);
  const scale = raw.metricScale ?? 1;
  const depth = new Float32Array(pixels);
  let validPixels = 0;
  for (let i = 0; i < pixels; i += 1) {
    const z = raw.points[i * 3 + 2]! + recovered.shift;
    if (!(z > 0) || !Number.isFinite(z)) validMask[i] = 0;
    if (validMask[i]) validPixels += 1;
    depth[i] = validMask[i] ? z * scale : Infinity;
  }
  let points: Float32Array;
  if (options.forceProjection ?? true) {
    points = depthMapToPointMap(depth, width, height, intrinsics);
  } else {
    points = new Float32Array(pixels * 3);
    for (let i = 0; i < pixels; i += 1) {
      const z = raw.points[i * 3 + 2]! + recovered.shift;
      for (let axis = 0; axis < 3; axis += 1) {
        points[i * 3 + axis] = validMask[i] ? (axis === 2 ? z : raw.points[i * 3 + axis]!) * scale : Infinity;
      }
    }
  }
  let normal: Float32Array | undefined;
  if (raw.normal) {
    normal = new Float32Array(raw.normal);
    for (let i = 0; i < pixels; i += 1) {
      if (!validMask[i]) normal.fill(0, i * 3, i * 3 + 3);
    }
  }
  return {
    width,
    height,
    focal: recovered.focal,
    shift: recovered.shift,
    intrinsics,
    fovXDegrees: fovDegrees(intrinsics.fx),
    fovYDegrees: fovDegrees(intrinsics.fy),
    depth,
    points,
    normal,
    validMask,
    validPixels,
    metricScale: raw.metricScale,
  };
}

export interface MetricAnchor {
  /** Pixel coordinates (x, y) of the two ends of a known dimension. */
  from: [number, number];
  to: [number, number];
  knownMm: number;
}

export interface MetricAnchorResult {
  estimatedMm: number;
  knownMm: number;
  /** Multiply estimated geometry by this factor to honour the known dimension. */
  scaleCorrection: number;
}

/**
 * Compares a model-estimated distance with one user-supplied dimension. The
 * monocular metric scale is a learned prior, so a measured anchor is required
 * before any millimetre value may be treated as evidence.
 */
/** Model-estimated straight-line distance in millimetres between two image pixels. */
export function measureBetweenPixels(geometry: MogeGeometry, from: [number, number], to: [number, number]): number {
  const sample = ([x, y]: [number, number]): [number, number, number] => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Measurement pixel must be finite.');
    const column = Math.floor(x);
    const row = Math.floor(y);
    if (column < 0 || row < 0 || column >= geometry.width || row >= geometry.height) throw new Error('Measurement pixel is outside the image.');
    const index = row * geometry.width + column;
    if (!geometry.validMask[index]) throw new Error('Measurement pixel has no valid geometry.');
    return [geometry.points[index * 3]!, geometry.points[index * 3 + 1]!, geometry.points[index * 3 + 2]!];
  };
  const a = sample(from);
  const b = sample(to);
  const mm = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 1000;
  if (!(mm > 0)) throw new Error('Measurement endpoints project to the same point.');
  return mm;
}

/**
 * Compares a model-estimated distance with one user-supplied dimension. The
 * monocular metric scale is a learned prior, so a measured anchor is required
 * before any millimetre value may be treated as evidence.
 */
export function anchorMetricScale(geometry: MogeGeometry, anchor: MetricAnchor): MetricAnchorResult {
  if (!(Number.isFinite(anchor.knownMm) && anchor.knownMm > 0)) throw new Error('Known anchor dimension must be finite and positive.');
  const estimatedMm = measureBetweenPixels(geometry, anchor.from, anchor.to);
  return { estimatedMm, knownMm: anchor.knownMm, scaleCorrection: anchor.knownMm / estimatedMm };
}

export interface MonocularCameraEvidence {
  schema: 'sceliph.monocular-camera-evidence/0.1';
  provenance: 'estimated';
  writesAssemblyIR: false;
  model: { id: string; sha256: string; upstreamRevision: string };
  input: { sha256: string; width: number; height: number };
  camera: {
    intrinsicsNormalized: MogeIntrinsics;
    intrinsicsPixels: { fx: number; fy: number; cx: number; cy: number };
    fovXDegrees: number;
    fovYDegrees: number;
    knownFovXDegrees?: number;
  };
  depth: { unit: 'm' | 'affine'; validPixels: number; validFraction: number; minimum: number; median: number; maximum: number };
  anchor?: MetricAnchorResult;
  /** Additional pixel-pair distances; `anchoredMm` applies the anchor correction. */
  measurements?: Array<{ from: [number, number]; to: [number, number]; estimatedMm: number; anchoredMm?: number }>;
  limitations: string[];
}

export const MOGE_UPSTREAM_REVISION = '74fbce054ebed49800de42d0ad0e83495065719a';

export function buildMonocularCameraEvidence(
  geometry: MogeGeometry,
  context: {
    modelId: string;
    modelSha256: string;
    inputSha256: string;
    knownFovXDegrees?: number;
    anchor?: MetricAnchorResult;
    measurements?: Array<{ from: [number, number]; to: [number, number] }>;
  },
): MonocularCameraEvidence {
  if (!/^[a-f0-9]{64}$/.test(context.modelSha256) || !/^[a-f0-9]{64}$/.test(context.inputSha256)) {
    throw new Error('Model and input hashes must be lowercase SHA-256 hex.');
  }
  const finite: number[] = [];
  for (let i = 0; i < geometry.depth.length; i += 1) {
    if (geometry.validMask[i]) finite.push(geometry.depth[i]!);
  }
  if (finite.length === 0) throw new Error('MoGe output has no valid depth.');
  finite.sort((left, right) => left - right);
  const limitations = [
    'Camera intrinsics and depth are single-image model estimates, not measurements.',
    'Assumes a centred principal point, square pixels and no lens distortion.',
  ];
  if (geometry.metricScale === undefined) limitations.push('No metric scale head output; depth is affine.');
  if (!context.anchor) limitations.push('No measured anchor dimension; millimetre scale is a learned prior only.');
  return {
    schema: 'sceliph.monocular-camera-evidence/0.1',
    provenance: 'estimated',
    writesAssemblyIR: false,
    model: { id: context.modelId, sha256: context.modelSha256, upstreamRevision: MOGE_UPSTREAM_REVISION },
    input: { sha256: context.inputSha256, width: geometry.width, height: geometry.height },
    camera: {
      intrinsicsNormalized: geometry.intrinsics,
      intrinsicsPixels: {
        fx: geometry.intrinsics.fx * geometry.width,
        fy: geometry.intrinsics.fy * geometry.height,
        cx: geometry.intrinsics.cx * geometry.width,
        cy: geometry.intrinsics.cy * geometry.height,
      },
      fovXDegrees: geometry.fovXDegrees,
      fovYDegrees: geometry.fovYDegrees,
      ...(context.knownFovXDegrees === undefined ? {} : { knownFovXDegrees: context.knownFovXDegrees }),
    },
    depth: {
      unit: geometry.metricScale === undefined ? 'affine' : 'm',
      validPixels: geometry.validPixels,
      validFraction: geometry.validPixels / (geometry.width * geometry.height),
      minimum: finite[0]!,
      median: finite[Math.floor(finite.length / 2)]!,
      maximum: finite[finite.length - 1]!,
    },
    ...(context.anchor ? { anchor: context.anchor } : {}),
    ...(context.measurements?.length ? {
      measurements: context.measurements.map(({ from, to }) => {
        const estimatedMm = measureBetweenPixels(geometry, from, to);
        return { from, to, estimatedMm, ...(context.anchor ? { anchoredMm: estimatedMm * context.anchor.scaleCorrection } : {}) };
      }),
    } : {}),
    limitations,
  };
}
