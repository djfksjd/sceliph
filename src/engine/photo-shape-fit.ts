import * as THREE from 'three';
import { compileAssemblyGeometry, validateAssemblyIR } from './assembly-compiler';
import type { AssemblyIR } from './assembly-ir';
import { rasterizeIdBuffer, worldTriangleMesh, type PinholeCamera } from './mesh-silhouette-raster';
import { anchorMetricScale, focalFromFovX, mogeIntrinsicsFromFocal, type MetricAnchor, type MetricAnchorResult, type MogeGeometry } from './moge-geometry';
import { initialOrbitFromPointMap, type OrbitCamera } from './orbit-camera';
import { fitAssemblySilhouette, type SilhouetteCameraParameter, type SilhouetteFitParameter, type SilhouetteFitReceipt, type SilhouetteFitViewScore } from './silhouette-parameter-fit';

/**
 * One-photo camera + shape fit. The LLM supplies the discrete structure (IR,
 * which numbers may move and their bounds, a coarse view hint); the photo
 * supplies a monocular point map, visible part masks and one known dimension.
 * The reference component's placement is fixed to remove the translation
 * gauge shared by object placement and camera. Output is an `inferred`
 * proposal; the input IR is never mutated.
 */

export interface PhotoFitSpec {
  schema: 'sceliph.photo-fit-spec/0.1';
  /** Component whose placement anchors world coordinates; its position may not be fitted. */
  referenceComponentId: string;
  viewHint: { azimuthDeg: number; elevationDeg: number; sigmaDeg: number };
  /** Known dimension between two image pixels (in point-map pixels). Required unless `knownExtent` is given. */
  anchor?: MetricAnchor;
  /**
   * Known overall extent of the assembly along a world axis (e.g. a listed
   * height). Without `anchor` it also sets the initial metric scale from the
   * object's vertical extent in the point map; the fit keeps the assembly at
   * this extent through a prior of `sigmaMm` (default 1%).
   */
  knownExtent?: { axis: 0 | 1 | 2; mm: number; sigmaMm?: number };
  parameters: SilhouetteFitParameter[];
  /** Refine the monocular focal estimate under a ±15% prior. Default true; ignored with a known FOV. */
  fitFocal?: boolean;
  /** Horizontal field of view from EXIF or calibration; fixes the focal length. */
  knownFovXDegrees?: number;
}

export interface PhotoPartMask {
  id: string;
  componentIds: string[];
  /** Point-map resolution mask, 1 = visible part pixel. */
  mask: Uint8Array;
}

export interface PhotoFitResult {
  ir: AssemblyIR;
  receipt: SilhouetteFitReceipt;
  /** Empty only when every heuristic check passed; never a proof of accuracy. */
  lowConfidenceReasons: string[];
  anchor: MetricAnchorResult;
  /** Full-image pixel orbit before fitting (fitted orbits in the receipt use the same frame). */
  initialOrbit: OrbitCamera;
  /** Fitting raster and the object crop of the point map it covers. */
  raster: { width: number; height: number; crop: { x: number; y: number; width: number; height: number } };
  /** Stage 1: camera placed against the IR as written, shape untouched. */
  cameraOnly: { loss: number; view: SilhouetteFitViewScore };
}

const MAX_RASTER_SIDE = 320;
const CONFIDENT_IOU = 0.97;
const CONFIDENT_PART_IOU = 0.9;
const CONFIDENT_DEPTH_RESIDUAL = 0.03;
/** Margin around the object mask's bounding box, as a share of its larger side. */
const CROP_MARGIN = 0.15;
/** CMA-ES step (share of each range) once the camera is placed. */
const REFINE_SIGMA = 0.08;

/**
 * Initial metric scale from a known height when no two-point anchor exists:
 * the 2nd–98th percentile spread of the object's point-map rows along the
 * camera's vertical axis is taken as that height. It ignores camera
 * elevation, so it only seeds the camera distance; the fit's extent prior
 * then holds the assembly at the known height.
 */
export function verticalExtentScale(geometry: MogeGeometry, objectMask: Uint8Array, knownMm: number): MetricAnchorResult {
  const values: number[] = [];
  for (let i = 0; i < objectMask.length; i += 1) {
    if (objectMask[i] && geometry.validMask[i] && Number.isFinite(geometry.points[i * 3 + 1]!)) values.push(geometry.points[i * 3 + 1]!);
  }
  if (values.length < 16) throw new Error('Object mask covers too few valid point-map pixels.');
  values.sort((a, b) => a - b);
  const estimatedMm = (values[Math.floor(values.length * 0.98)]! - values[Math.floor(values.length * 0.02)]!) * 1000;
  if (!(estimatedMm > 0)) throw new Error('Object has no vertical extent in the point map.');
  return { estimatedMm, knownMm, scaleCorrection: knownMm / estimatedMm };
}

/** Object bounding box plus margin, clamped to the image. */
export function objectCrop(mask: Uint8Array, width: number, height: number): { x: number; y: number; width: number; height: number } {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const x = i % width;
    const y = Math.floor(i / width);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < 0) throw new Error('Object mask is empty.');
  const margin = Math.ceil(CROP_MARGIN * Math.max(x1 - x0 + 1, y1 - y0 + 1));
  const x = Math.max(0, x0 - margin);
  const y = Math.max(0, y0 - margin);
  return { x, y, width: Math.min(width, x1 + 1 + margin) - x, height: Math.min(height, y1 + 1 + margin) - y };
}

function cropPlane<T extends Uint8Array | Float32Array>(values: T, width: number, crop: { x: number; y: number; width: number; height: number }): T {
  const out = new (values.constructor as { new (length: number): T })(crop.width * crop.height);
  for (let y = 0; y < crop.height; y += 1) out.set(values.subarray((crop.y + y) * width + crop.x, (crop.y + y) * width + crop.x + crop.width) as never, y * crop.width);
  return out;
}

/** Block-median of anchored point-map depth over object pixels, in mm; NaN where unknown. */
export function downsampleObjectDepth(geometry: MogeGeometry, objectMask: Uint8Array, millimetresPerUnit: number, outWidth: number, outHeight: number): Float32Array {
  const { width, height } = geometry;
  const out = new Float32Array(outWidth * outHeight).fill(Number.NaN);
  for (let y = 0; y < outHeight; y += 1) {
    const y0 = Math.floor(y * height / outHeight);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * height / outHeight));
    for (let x = 0; x < outWidth; x += 1) {
      const x0 = Math.floor(x * width / outWidth);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * width / outWidth));
      const values: number[] = [];
      let total = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const index = sy * width + sx;
          total += 1;
          if (objectMask[index] && geometry.validMask[index] && Number.isFinite(geometry.depth[index]!)) values.push(geometry.depth[index]! * millimetresPerUnit);
        }
      }
      if (values.length * 2 >= total) {
        values.sort((a, b) => a - b);
        out[y * outWidth + x] = values[Math.floor(values.length / 2)]!;
      }
    }
  }
  return out;
}

/** Area-majority downsample of a binary mask to the fitting raster. */
export function downsampleMask(mask: Uint8Array, width: number, height: number, outWidth: number, outHeight: number): Uint8Array {
  if (mask.length !== width * height) throw new Error('Mask size does not match its dimensions.');
  const out = new Uint8Array(outWidth * outHeight);
  for (let y = 0; y < outHeight; y += 1) {
    const y0 = Math.floor(y * height / outHeight);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * height / outHeight));
    for (let x = 0; x < outWidth; x += 1) {
      const x0 = Math.floor(x * width / outWidth);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * width / outWidth));
      let on = 0;
      let total = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          on += mask[sy * width + sx] ? 1 : 0;
          total += 1;
        }
      }
      out[y * outWidth + x] = on * 2 >= total ? 1 : 0;
    }
  }
  return out;
}

function componentMatrix(component: AssemblyIR['components'][number]): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...(component.position ?? [0, 0, 0]).map((value) => value / 1000) as [number, number, number]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(component.rotation ?? [0, 0, 0]))),
    new THREE.Vector3(...(component.scale ?? [1, 1, 1])),
  );
}

/** Occlusion-aware component id buffer of an IR (index into `ir.components`, -1 = empty). */
export function renderAssemblyIds(ir: AssemblyIR, camera: PinholeCamera): Int16Array {
  const meshes = ir.components.map((component) => {
    const geometry = compileAssemblyGeometry(component.geometry);
    try {
      return worldTriangleMesh(geometry, componentMatrix(component));
    } finally {
      geometry.dispose();
    }
  });
  return rasterizeIdBuffer(camera, meshes);
}

/** Rescales a raster-resolution orbit to another image size with the same field of view. */
export function rescaleOrbit(orbit: OrbitCamera, width: number, height: number): OrbitCamera {
  const sx = width / orbit.width;
  const sy = height / orbit.height;
  return { ...orbit, target: [...orbit.target], width, height, fx: orbit.fx * sx, fy: orbit.fy * sy, cx: orbit.cx * sx, cy: orbit.cy * sy };
}

function worldBounds(ir: AssemblyIR): { centre: [number, number, number]; size: number } {
  const box = new THREE.Box3();
  for (const component of ir.components) {
    const geometry = compileAssemblyGeometry(component.geometry);
    try {
      geometry.computeBoundingBox();
      box.union(geometry.boundingBox!.clone().applyMatrix4(componentMatrix(component)));
    } finally {
      geometry.dispose();
    }
  }
  const centre = box.getCenter(new THREE.Vector3()).multiplyScalar(1000);
  const size = box.getSize(new THREE.Vector3()).multiplyScalar(1000);
  return { centre: [centre.x, centre.y, centre.z], size: Math.max(size.x, size.y, size.z) };
}

export function fitPhotoShape(input: {
  ir: AssemblyIR;
  geometry: MogeGeometry;
  objectMask: Uint8Array;
  parts: PhotoPartMask[];
  spec: PhotoFitSpec;
  seed: number;
  rasterMaxSide?: number;
  maxEvaluations?: number;
  restarts?: number;
  /** Weight of the monocular depth-shape term; 0 disables it. Default 2. */
  depthWeight?: number;
  /** Freeze shape parameters the photo barely responds to (see fitAssemblySilhouette). */
  sensitivityGate?: { step: number; minLossChange: number };
}): PhotoFitResult {
  const { ir, geometry, spec } = input;
  validateAssemblyIR(ir);
  if (spec.schema !== 'sceliph.photo-fit-spec/0.1') throw new Error('Unsupported photo fit spec schema.');
  if (!ir.components.some((component) => component.id === spec.referenceComponentId)) throw new Error('Reference component does not exist.');
  if (spec.parameters.some((parameter) => parameter.componentId === spec.referenceComponentId && parameter.path[0] === 'position')) {
    throw new Error('The reference component position anchors world coordinates and may not be fitted.');
  }
  const { azimuthDeg, elevationDeg, sigmaDeg } = spec.viewHint;
  if (![azimuthDeg, elevationDeg, sigmaDeg].every(Number.isFinite) || sigmaDeg <= 0 || sigmaDeg > 90 || Math.abs(elevationDeg) > 80) {
    throw new Error('View hint must be finite with 0 < sigma ≤ 90 and |elevation| ≤ 80 degrees.');
  }
  const pixels = geometry.width * geometry.height;
  if (input.objectMask.length !== pixels || input.parts.some((part) => part.mask.length !== pixels)) {
    throw new Error('Object and part masks must match the point-map resolution.');
  }
  const rasterMaxSide = input.rasterMaxSide ?? 160;
  if (!Number.isInteger(rasterMaxSide) || rasterMaxSide < 32 || rasterMaxSide > MAX_RASTER_SIDE) throw new Error(`Raster side must be within 32–${MAX_RASTER_SIDE}.`);
  // Fit inside the object crop so a small object still covers the raster.
  const crop = objectCrop(input.objectMask, geometry.width, geometry.height);
  const rasterScale = Math.min(1, rasterMaxSide / Math.max(crop.width, crop.height));
  const raster = { width: Math.max(8, Math.round(crop.width * rasterScale)), height: Math.max(8, Math.round(crop.height * rasterScale)) };
  const sx = raster.width / crop.width;
  const sy = raster.height / crop.height;

  if (!spec.anchor && !spec.knownExtent) throw new Error('A photo fit needs a metric anchor or a known extent.');
  if (spec.knownExtent && !(Number.isFinite(spec.knownExtent.mm) && spec.knownExtent.mm > 0)) throw new Error('Known extent must be finite and positive.');
  const anchor = spec.anchor ? anchorMetricScale(geometry, spec.anchor) : verticalExtentScale(geometry, input.objectMask, spec.knownExtent!.mm);
  const extentPriors = spec.knownExtent ? [{ axis: spec.knownExtent.axis, targetMm: spec.knownExtent.mm, sigmaMm: spec.knownExtent.sigmaMm ?? spec.knownExtent.mm * 0.01 }] : [];
  const bounds = worldBounds(ir);
  const init = initialOrbitFromPointMap({
    points: geometry.points,
    validMask: geometry.validMask,
    objectMask: input.objectMask,
    width: geometry.width,
    height: geometry.height,
    millimetresPerUnit: 1000 * anchor.scaleCorrection,
    intrinsics: spec.knownFovXDegrees === undefined
      ? geometry.intrinsics
      : mogeIntrinsicsFromFocal(focalFromFovX(spec.knownFovXDegrees, geometry.width / geometry.height), geometry.width / geometry.height),
    hint: { azimuthDeg, elevationDeg },
    worldReferenceMm: bounds.centre,
  });
  const fullOrbit = init.orbit;
  const toCrop = (full: OrbitCamera): OrbitCamera => ({ ...full, target: [...full.target], width: raster.width, height: raster.height, fx: full.fx * sx, fy: full.fy * sy, cx: (full.cx - crop.x) * sx, cy: (full.cy - crop.y) * sy });
  const toFull = (cropped: OrbitCamera): OrbitCamera => ({ ...cropped, target: [...cropped.target], width: geometry.width, height: geometry.height, fx: cropped.fx / sx, fy: cropped.fy / sy, cx: cropped.cx / sx + crop.x, cy: cropped.cy / sy + crop.y });
  const orbit = toCrop(fullOrbit);
  const reach = Math.max(bounds.size, 1);
  const elevationLow = Math.max(-80, elevationDeg - 2.5 * sigmaDeg);
  const elevationHigh = Math.min(80, elevationDeg + 2.5 * sigmaDeg);
  const cameraParameters: SilhouetteCameraParameter[] = [
    { viewId: 'photo', field: 'azimuthDeg', min: azimuthDeg - 2.5 * sigmaDeg, max: azimuthDeg + 2.5 * sigmaDeg, prior: { mean: azimuthDeg, sigma: sigmaDeg } },
    { viewId: 'photo', field: 'elevationDeg', min: elevationLow, max: elevationHigh, prior: { mean: elevationDeg, sigma: sigmaDeg } },
    { viewId: 'photo', field: 'distanceMm', min: orbit.distanceMm * 0.5, max: orbit.distanceMm * 2, prior: { mean: orbit.distanceMm, sigma: orbit.distanceMm * 0.25 } },
    { viewId: 'photo', field: 'targetX', min: orbit.target[0] - reach, max: orbit.target[0] + reach },
    { viewId: 'photo', field: 'targetY', min: orbit.target[1] - reach, max: orbit.target[1] + reach },
    { viewId: 'photo', field: 'targetZ', min: orbit.target[2] - reach, max: orbit.target[2] + reach },
    { viewId: 'photo', field: 'rollDeg', min: -15, max: 15, prior: { mean: 0, sigma: 4 } },
  ];
  if ((spec.fitFocal ?? true) && spec.knownFovXDegrees === undefined) cameraParameters.push({ viewId: 'photo', field: 'focalScale', min: 0.6, max: 1.6, prior: { mean: 1, sigma: 0.15 } });

  const cropMask = (mask: Uint8Array) => downsampleMask(cropPlane(mask, geometry.width, crop), crop.width, crop.height, raster.width, raster.height);
  const target = cropMask(input.objectMask);
  const parts = input.parts.map((part) => ({
    id: part.id,
    componentIds: part.componentIds,
    mask: cropMask(part.mask),
  })).filter((part) => part.mask.some((value) => value !== 0));
  const depthWeight = input.depthWeight ?? 2;
  const croppedGeometry = { ...geometry, width: crop.width, height: crop.height, validMask: cropPlane(geometry.validMask, geometry.width, crop), depth: cropPlane(geometry.depth, geometry.width, crop) };
  const depth = depthWeight > 0
    ? { valuesMm: downsampleObjectDepth(croppedGeometry, cropPlane(input.objectMask, geometry.width, crop), 1000 * anchor.scaleCorrection, raster.width, raster.height), weight: depthWeight }
    : undefined;
  const maxEvaluations = input.maxEvaluations ?? 4000;
  const restarts = input.restarts ?? 2;
  const view = (start: OrbitCamera) => [{ id: 'photo', orbit: start, target, parts, ...(depth ? { depth } : {}) }];
  // Stage 1 places the camera against the IR as written; stage 2 then moves
  // camera and shape together from there, so shape cannot absorb a bad start.
  const placed = fitAssemblySilhouette(ir, [], view(orbit), { seed: input.seed, maxEvaluations: Math.max(200, Math.round(maxEvaluations / 3)), restarts, cameraParameters, extentPriors });
  const joint = fitAssemblySilhouette(ir, spec.parameters, view(placed.receipt.orbits[0]!.orbit), { seed: input.seed, maxEvaluations, restarts, cameraParameters, extentPriors, sigma: REFINE_SIGMA, ...(input.sensitivityGate ? { sensitivityGate: input.sensitivityGate } : {}) });
  const fitted = { ir: joint.ir, receipt: { ...joint.receipt, before: placed.receipt.before, evaluations: placed.receipt.evaluations + joint.receipt.evaluations } };
  const fittedView = fitted.receipt.after.views[0]!;
  const lowConfidenceReasons: string[] = [];
  if (fittedView.iou < CONFIDENT_IOU) lowConfidenceReasons.push(`Object silhouette IoU ${fittedView.iou.toFixed(3)} < ${CONFIDENT_IOU}.`);
  for (const part of fittedView.parts ?? []) {
    if (part.iou < CONFIDENT_PART_IOU) lowConfidenceReasons.push(`Part ${part.id} IoU ${part.iou.toFixed(3)} < ${CONFIDENT_PART_IOU}.`);
  }
  if (fittedView.depthResidual !== undefined && fittedView.depthResidual > CONFIDENT_DEPTH_RESIDUAL) {
    lowConfidenceReasons.push(`Depth-shape residual ${fittedView.depthResidual.toFixed(3)} > ${CONFIDENT_DEPTH_RESIDUAL}.`);
  }
  for (const item of [...fitted.receipt.parameters.filter((p) => !p.frozen).map((p) => ({ name: `${p.componentId}.${p.path.join('.')}`, ...p })), ...fitted.receipt.cameraParameters.map((p) => ({ name: `camera.${p.field}`, ...p }))]) {
    if (item.atBound) lowConfidenceReasons.push(`${item.name} ended at a bound.`);
    else if (!item.identified) lowConfidenceReasons.push(`${item.name} is not identified by equally good restarts.`);
  }
  const receipt = { ...fitted.receipt, orbits: fitted.receipt.orbits.map((item) => ({ ...item, orbit: toFull(item.orbit) })) };
  return { ir: fitted.ir, receipt, lowConfidenceReasons, anchor, initialOrbit: fullOrbit, raster: { ...raster, crop }, cameraOnly: { loss: placed.receipt.after.loss, view: placed.receipt.after.views[0]! } };
}

/**
 * Merges the part masks of interchangeable components (a derived group) into
 * one mask over the whole group, so the fit does not depend on which copy the
 * IR author labelled which; other masks pass through unchanged.
 */
export function mergeGroupPartMasks(parts: PhotoPartMask[], groups: string[][]): PhotoPartMask[] {
  const out: PhotoPartMask[] = [];
  const merged = new Map<string[], PhotoPartMask>();
  for (const part of parts) {
    const group = groups.find((members) => part.componentIds.every((id) => members.includes(id)));
    if (!group) {
      out.push(part);
      continue;
    }
    const existing = merged.get(group);
    if (existing) {
      for (let i = 0; i < part.mask.length; i += 1) existing.mask[i] = existing.mask[i] || part.mask[i]!;
      continue;
    }
    const combined = { id: group.join('+'), componentIds: [...group], mask: Uint8Array.from(part.mask) };
    merged.set(group, combined);
    out.push(combined);
  }
  return out;
}

export interface PhotoFitAcceptanceGate {
  /** Required share of the camera-only loss removed by moving the shape. */
  minRelativeLossGain: number;
  /** Required share removed per free (not frozen) shape parameter, an information-criterion style penalty. */
  minRelativeLossGainPerParameter: number;
  /** Required object silhouette IoU after the fit. */
  minIou: number;
}

export interface PhotoFitAcceptance {
  accept: boolean;
  relativeLossGain: number;
  freeParameters: number;
  iou: number;
  reasons: string[];
}

/**
 * Decides from photo evidence alone (no truth) whether a fitted shape should
 * replace the IR as written. The camera-only stage is the baseline: if moving
 * the shape barely improves on it, the photo does not contradict the IR and
 * the written numbers are kept. Each free shape parameter must pay for itself,
 * and a fit that still misses the silhouette is not trusted either.
 */
export function decidePhotoFitAcceptance(result: Pick<PhotoFitResult, 'cameraOnly' | 'receipt'>, gate: PhotoFitAcceptanceGate): PhotoFitAcceptance {
  const before = result.cameraOnly.loss;
  const after = result.receipt.after.loss;
  const relativeLossGain = before > 0 ? (before - after) / before : 0;
  const iou = result.receipt.after.views[0]!.iou;
  const freeParameters = result.receipt.parameters.filter((parameter) => !parameter.frozen).length;
  const reasons: string[] = [];
  if (relativeLossGain < gate.minRelativeLossGain) reasons.push(`Shape fit removed ${(100 * relativeLossGain).toFixed(1)}% of the camera-only loss (< ${(100 * gate.minRelativeLossGain).toFixed(1)}%).`);
  if (freeParameters > 0 && relativeLossGain / freeParameters < gate.minRelativeLossGainPerParameter) {
    reasons.push(`${freeParameters} free parameters removed ${(100 * relativeLossGain / freeParameters).toFixed(1)}% each (< ${(100 * gate.minRelativeLossGainPerParameter).toFixed(1)}%).`);
  }
  if (iou < gate.minIou) reasons.push(`Fitted silhouette IoU ${iou.toFixed(3)} < ${gate.minIou}.`);
  return { accept: reasons.length === 0, relativeLossGain, freeParameters, iou, reasons };
}

const FITTABLE_GEOMETRY_PATHS: Record<string, Array<Array<string | number>>> = {
  roundedBox: [['size', 0], ['size', 1], ['size', 2]],
  cylinder: [['radiusTop'], ['radiusBottom'], ['depth']],
  sphere: [['radius']],
  torus: [['radius'], ['tube']],
  tube: [['radius']],
};
const SAME_VALUE_TOLERANCE = 0.005;
const ALIGNED_TOLERANCE_MM = 0.5;

export interface DerivedPhotoFitParameters {
  parameters: SilhouetteFitParameter[];
  /** Reference slots held fixed because they carry the stated known dimension. */
  locked: Array<{ componentId: string; path: Array<string | number> }>;
  /** Component ids moved together with an identical primary component. */
  groups: string[][];
  /** Position axes held because the IR puts them on the reference's or the assembly's centre line. */
  aligned: Array<{ componentId: string; axis: number }>;
  skipped: string[];
}

function readPath(component: AssemblyIR['components'][number], path: Array<string | number>): number | undefined {
  let holder: unknown = component;
  for (const segment of path) {
    if (typeof holder !== 'object' || holder === null) return undefined;
    holder = (holder as Record<string | number, unknown>)[segment];
  }
  return typeof holder === 'number' && Number.isFinite(holder) ? holder : undefined;
}

const sameValue = (a: number, b: number): boolean => Math.abs(a - b) <= SAME_VALUE_TOLERANCE * Math.max(Math.abs(a), Math.abs(b), 1);

/**
 * Derives the fit parameters for a one-photo refinement of an LLM-written IR,
 * so the LLM only has to write the IR and a coarse view. Size-like numbers
 * scale within `sizeRange`; non-reference positions move within
 * `positionReach × assembly extent`. Components with identical geometry and
 * rotation move as one group (shared sizes; positions linked with the ratio
 * of their starting values when those have equal magnitude, e.g. mirrored
 * legs). A straight cylinder stays straight. Reference-component numbers that
 * equal the stated known dimension (or its half, for radii) stay fixed, also
 * for exact copies of the reference. Position axes the IR puts exactly on the
 * reference's coordinate or on the assembly's bounding-box centre (coaxial,
 * centred, on the symmetry plane) are structural claims a single photo
 * resolves poorly, so they stay unless `lockAligned` is false.
 */
export function derivePhotoFitParameters(ir: AssemblyIR, options: {
  referenceComponentId: string;
  knownDimensionMm?: number;
  sizeRange?: [number, number];
  positionReach?: number;
  /** Keep position axes on the reference's or the assembly's centre line (structural claims). Default true. */
  lockAligned?: boolean;
}): DerivedPhotoFitParameters {
  validateAssemblyIR(ir);
  const reference = ir.components.find((component) => component.id === options.referenceComponentId);
  if (!reference) throw new Error('Reference component does not exist.');
  const [low, high] = options.sizeRange ?? [0.5, 2];
  if (!(low > 0 && high > low)) throw new Error('Size range must satisfy 0 < low < high.');
  const whole = worldBounds(ir);
  const reach = (options.positionReach ?? 0.5) * whole.size;
  const known = options.knownDimensionMm;
  const parameters: SilhouetteFitParameter[] = [];
  const locked: DerivedPhotoFitParameters['locked'] = [];
  const skipped: string[] = [];
  const aligned: DerivedPhotoFitParameters['aligned'] = [];
  const lockAligned = options.lockAligned ?? true;
  const isAligned = (member: AssemblyIR['components'][number], axis: number) => lockAligned && member.position !== undefined
    && [(reference.position ?? [0, 0, 0])[axis]!, whole.centre[axis]!].some((line) => Math.abs(member.position![axis]! - line) <= ALIGNED_TOLERANCE_MM);

  const signature = (component: AssemblyIR['components'][number]) => JSON.stringify([component.geometry, component.rotation ?? [0, 0, 0], component.scale ?? [1, 1, 1]]);
  const groups: Array<Array<AssemblyIR['components'][number]>> = [];
  for (const component of ir.components) {
    const group = groups.find((members) => signature(members[0]!) === signature(component));
    if (group) group.push(component);
    else groups.push([component]);
  }
  // Copies of the reference share its sizes (including the locked known
  // dimension); the reference leads its group because its placement is fixed.
  for (const members of groups) {
    const index = members.indexOf(reference);
    if (index > 0) members.unshift(...members.splice(index, 1));
  }

  for (const members of groups) {
    const primary = members[0]!;
    const paths = FITTABLE_GEOMETRY_PATHS[primary.geometry.op];
    if (!paths) {
      skipped.push(`${primary.id}: ${primary.geometry.op} sizes are not fitted`);
    } else {
      const geometryPaths = paths.map((path) => ['geometry', ...path]);
      const straight = primary.geometry.op === 'cylinder' && sameValue(readPath(primary, ['geometry', 'radiusTop'])!, readPath(primary, ['geometry', 'radiusBottom'])!);
      for (const path of geometryPaths) {
        if (straight && path[1] === 'radiusBottom') continue;
        const value = readPath(primary, path);
        if (value === undefined || value <= 0) continue;
        const isRadius = typeof path[1] === 'string' && /radius|tube/i.test(path[1]);
        if (primary === reference && known !== undefined && (sameValue(value, known) || (isRadius && sameValue(value * 2, known)))) {
          locked.push({ componentId: primary.id, path });
          continue;
        }
        const links = members.slice(1).map((member) => ({ componentId: member.id, path, ratio: 1 }));
        if (straight && path[1] === 'radiusTop') {
          for (const member of members) links.push({ componentId: member.id, path: ['geometry', 'radiusBottom'], ratio: readPath(member, ['geometry', 'radiusBottom'])! / value });
        }
        parameters.push({ componentId: primary.id, path, min: value * low, max: value * high, ...(links.length ? { links } : {}) });
      }
    }
    if (primary === reference) {
      for (const member of members.slice(1)) {
        if (!member.position) {
          skipped.push(`${member.id}: position is implicit; add an explicit position to fit placement`);
          continue;
        }
        for (const axis of [0, 1, 2]) {
          const start = member.position[axis]!;
          if (isAligned(member, axis)) {
            aligned.push({ componentId: member.id, axis });
            continue;
          }
          parameters.push({ componentId: member.id, path: ['position', axis], min: start - reach, max: start + reach });
        }
      }
      continue;
    }
    if (members.some((member) => !member.position)) {
      skipped.push(`${primary.id}: position is implicit; add an explicit position to fit placement`);
      continue;
    }
    for (const axis of [0, 1, 2]) {
      if (members.every((member) => isAligned(member, axis))) {
        aligned.push(...members.map((member) => ({ componentId: member.id, axis })));
        continue;
      }
      const values = members.map((member) => member.position![axis]!);
      const base = values[0]!;
      // Equal-magnitude starts (identical or mirrored copies) move together.
      const shared = members.length > 1 && (Math.abs(base) > 1
        ? values.every((value) => sameValue(Math.abs(value), Math.abs(base)))
        : values.every((value) => value === base));
      const owners = shared ? [0] : values.map((_, index) => index);
      for (const index of owners) {
        const start = values[index]!;
        const links = shared ? members.slice(1).map((other, j) => ({ componentId: other.id, path: ['position', axis], ratio: base === 0 ? 1 : values[j + 1]! / base })) : [];
        parameters.push({ componentId: members[index]!.id, path: ['position', axis], min: start - reach, max: start + reach, ...(links.length ? { links } : {}) });
      }
    }
  }
  return { parameters, locked, groups: groups.filter((members) => members.length > 1).map((members) => members.map((member) => member.id)), aligned, skipped: [...new Set(skipped)] };
}
