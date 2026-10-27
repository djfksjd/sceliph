import * as THREE from 'three';
import { compileAssemblyGeometry, validateAssemblyIR } from './assembly-compiler';
import type { AssemblyComponentIR, AssemblyIR } from './assembly-ir';
import { minimizeCmaEs, seededNormal, type CmaEsResult } from './cma-es';
import { squaredDistanceTransform } from './distance-transform';
import { checkPinholeCamera, rasterizeIdDepthBuffer, rasterizeSilhouette, worldTriangleMesh, type PinholeCamera, type WorldTriangleMesh } from './mesh-silhouette-raster';
import { orbitToPinhole, type OrbitCamera } from './orbit-camera';

/**
 * Bounded render-and-compare fitting of declared numeric IR parameters to
 * target silhouettes. The LLM keeps the discrete structure (which parts and
 * which parameters may move); this loop only adjusts the declared numbers.
 * Results are proposals labelled `inferred`; the input IR is never mutated.
 */

export interface SilhouetteFitParameter {
  componentId: string;
  /** Path inside the component, e.g. ['geometry', 'size', 0] or ['position', 1]. */
  path: Array<string | number>;
  min: number;
  max: number;
  /**
   * Other slots driven by this parameter: each receives `value × ratio`
   * (e.g. identical legs share one radius; mirrored legs use ratio −1).
   */
  links?: SilhouetteFitParameterLink[];
}

export interface SilhouetteFitParameterLink {
  componentId: string;
  path: Array<string | number>;
  ratio: number;
}

export interface SilhouetteFitView {
  id: string;
  /** Fixed camera. Exactly one of `camera` and `orbit` must be given. */
  camera?: PinholeCamera;
  /** Orbit camera whose fields may be fitted through `cameraParameters`. */
  orbit?: OrbitCamera;
  /** Target silhouette, 1 = foreground, row-major camera.width × camera.height. */
  target: Uint8Array;
  /**
   * Optional visible-region masks of component groups (e.g. from an image
   * segmenter). Scored against an occlusion-aware id buffer.
   */
  parts?: Array<{ id: string; componentIds: string[]; mask: Uint8Array; weight?: number }>;
  /**
   * Optional observed visible depth (mm, camera axis; non-finite = unknown),
   * e.g. an anchored monocular point map. Only its shape is compared: the
   * median offset is removed, so absolute distance stays with the camera prior.
   */
  depth?: { valuesMm: Float32Array; weight?: number };
}

export type OrbitFitField = 'azimuthDeg' | 'elevationDeg' | 'distanceMm' | 'rollDeg' | 'focalScale' | 'targetX' | 'targetY' | 'targetZ';

export interface SilhouetteCameraParameter {
  viewId: string;
  field: OrbitFitField;
  min: number;
  max: number;
  /** Gaussian prior, e.g. a monocular distance estimate or an LLM view hint. */
  prior?: { mean: number; sigma: number };
}

export interface SilhouetteFitOptions {
  seed: number;
  maxEvaluations?: number;
  /** Initial CMA-ES step in normalized parameter units (0..1 span). */
  sigma?: number;
  /** Weight of the symmetric boundary-distance term relative to (1 - IoU). */
  distanceWeight?: number;
  /**
   * Independent jittered restarts used to detect parameters the silhouettes do
   * not determine (occluded or sub-pixel). Default 3; 1 disables the check.
   */
  restarts?: number;
  /** Orbit-camera fields fitted jointly with the IR parameters. */
  cameraParameters?: SilhouetteCameraParameter[];
  /** Loss weight per squared prior z-score. Default 0.01. */
  priorWeight?: number;
  /**
   * Freezes shape parameters the views barely respond to: before optimising,
   * each is moved by ±`step` of its bound span (links follow) and kept only
   * when the larger absolute loss change reaches `minLossChange`. With a gate
   * up to 128 shape parameters may be declared; if more than the 32-parameter
   * budget (minus camera fields) pass, the most sensitive are kept. Unset = fit all.
   */
  sensitivityGate?: { step: number; minLossChange: number };
  /**
   * Gaussian priors on the assembly's world bounding-box extent (mm) along an
   * axis, e.g. a listed overall height when no part carries it. Same weight
   * as the camera priors.
   */
  extentPriors?: Array<{ axis: 0 | 1 | 2; targetMm: number; sigmaMm: number }>;
}

export interface SilhouetteFitViewScore {
  id: string;
  iou: number;
  meanBoundaryDistancePx: number;
  parts?: Array<{ id: string; iou: number; meanBoundaryDistancePx: number }>;
  /** Mean absolute depth-shape residual relative to the median observed depth. */
  depthResidual?: number;
}

interface FittedValueReport {
  min: number;
  max: number;
  before: number;
  after: number;
  /** Range of fitted values across equally good restarts. */
  spread: number;
  /**
   * False when equally good restarts disagree by more than 2% of the bound
   * span or the value ends within 0.5% of a bound. Agreement is necessary,
   * not sufficient: restarts can share a wrong basin.
   */
  identified: boolean;
  atBound: boolean;
}

interface ShapeValueReport extends FittedValueReport {
  /** Larger absolute loss change of the ±step probe (only with a sensitivity gate). */
  sensitivity?: number;
  /** Held at its starting value because the probe fell below the gate. */
  frozen?: boolean;
}

export interface SilhouetteFitReceipt {
  schema: 'sceliph.silhouette-parameter-fit/0.2';
  provenance: 'inferred';
  seed: number;
  parameters: Array<{ componentId: string; path: Array<string | number>; links?: SilhouetteFitParameterLink[] } & ShapeValueReport>;
  cameraParameters: Array<{ viewId: string; field: OrbitFitField; prior?: { mean: number; sigma: number } } & FittedValueReport>;
  /** Final orbit cameras of orbit views, after camera fitting. */
  orbits: Array<{ viewId: string; orbit: OrbitCamera }>;
  restarts: number;
  before: { loss: number; views: SilhouetteFitViewScore[] };
  after: { loss: number; views: SilhouetteFitViewScore[] };
  evaluations: number;
  stopReason: CmaEsResult['stopReason'];
  compiledGeometries: number;
}

const MAX_PARAMETERS = 32;
/** Declared shape parameters allowed when a sensitivity gate picks the active ones. */
const MAX_GATED_PARAMETERS = 128;
const MAX_VIEWS = 8;
const MAX_EVALUATIONS = 20_000;
const EMPTY_LOSS = 4;
const MAX_RESTARTS = 6;
/** Restarts within this loss of the best are treated as equally good. */
const EQUIVALENT_LOSS = 0.005;
const IDENTIFIED_SPAN = 0.02;
const MAX_PARTS_PER_VIEW = 16;
const MAX_LINKS = 64;
const AT_BOUND_SPAN = 0.005;
/** Restart offset (share of each range); kept wide so agreeing restarts mean identification. */
const RESTART_JITTER = 0.2;
const MIN_DEPTH_PIXELS = 32;

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function setOrbitField(orbit: OrbitCamera, field: OrbitFitField, value: number): void {
  if (field === 'targetX') orbit.target[0] = value;
  else if (field === 'targetY') orbit.target[1] = value;
  else if (field === 'targetZ') orbit.target[2] = value;
  else orbit[field] = value;
}

function getOrbitField(orbit: OrbitCamera, field: OrbitFitField): number {
  if (field === 'targetX') return orbit.target[0];
  if (field === 'targetY') return orbit.target[1];
  if (field === 'targetZ') return orbit.target[2];
  if (field === 'rollDeg') return orbit.rollDeg ?? 0;
  if (field === 'focalScale') return orbit.focalScale ?? 1;
  return orbit[field];
}

function resolveSlot(component: AssemblyComponentIR, path: Array<string | number>): { holder: Record<string | number, unknown>; key: string | number } {
  if (!Array.isArray(path) || path.length < 1 || path.length > 6) throw new Error('Fit parameter path must have 1–6 segments.');
  let holder: unknown = component;
  for (const segment of path.slice(0, -1)) {
    if (typeof holder !== 'object' || holder === null) throw new Error(`Fit parameter path ${path.join('.')} does not resolve.`);
    holder = (holder as Record<string | number, unknown>)[segment];
  }
  const key = path[path.length - 1]!;
  if (typeof holder !== 'object' || holder === null || typeof (holder as Record<string | number, unknown>)[key] !== 'number') {
    throw new Error(`Fit parameter ${component.id}.${path.join('.')} must resolve to an existing number.`);
  }
  return { holder: holder as Record<string | number, unknown>, key };
}

function componentMatrix(component: AssemblyComponentIR): THREE.Matrix4 {
  const position = new THREE.Vector3(...(component.position ?? [0, 0, 0]).map((value) => value / 1000) as [number, number, number]);
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(component.rotation ?? [0, 0, 0])));
  const scale = new THREE.Vector3(...(component.scale ?? [1, 1, 1]));
  return new THREE.Matrix4().compose(position, rotation, scale);
}

/** Scores one rendered silhouette against a target with a precomputed target distance field. */
export function scoreSilhouette(rendered: Uint8Array, target: Uint8Array, targetDistance: Float64Array, width: number, height: number): Omit<SilhouetteFitViewScore, 'id'> | undefined {
  let intersection = 0;
  let union = 0;
  let renderedCount = 0;
  let targetCount = 0;
  let renderedToTarget = 0;
  for (let i = 0; i < rendered.length; i += 1) {
    const r = rendered[i]! !== 0;
    const t = target[i]! !== 0;
    if (r) {
      renderedCount += 1;
      renderedToTarget += Math.sqrt(targetDistance[i]!);
    }
    if (t) targetCount += 1;
    if (r && t) intersection += 1;
    if (r || t) union += 1;
  }
  if (renderedCount === 0 || targetCount === 0) return undefined;
  const renderedDistance = squaredDistanceTransform(rendered, width, height, 1);
  let targetToRendered = 0;
  for (let i = 0; i < target.length; i += 1) {
    if (target[i]) targetToRendered += Math.sqrt(renderedDistance[i]!);
  }
  return {
    iou: intersection / union,
    meanBoundaryDistancePx: (renderedToTarget / renderedCount + targetToRendered / targetCount) / 2,
  };
}

export function fitAssemblySilhouette(
  ir: AssemblyIR,
  parameters: SilhouetteFitParameter[],
  views: SilhouetteFitView[],
  options: SilhouetteFitOptions,
): { ir: AssemblyIR; receipt: SilhouetteFitReceipt } {
  validateAssemblyIR(ir);
  const declaredLimit = options.sensitivityGate ? MAX_GATED_PARAMETERS : MAX_PARAMETERS;
  if (!Array.isArray(parameters) || parameters.length > declaredLimit) {
    throw new Error(`Silhouette fit allows at most ${declaredLimit} parameters.`);
  }
  if (!Array.isArray(views) || views.length < 1 || views.length > MAX_VIEWS) throw new Error(`Silhouette fit requires 1–${MAX_VIEWS} views.`);
  const maxEvaluations = options.maxEvaluations ?? 1_200;
  if (!Number.isInteger(maxEvaluations) || maxEvaluations < 8 || maxEvaluations > MAX_EVALUATIONS) throw new Error('Silhouette fit evaluation budget is unsafe.');
  const restarts = options.restarts ?? 3;
  if (!Number.isInteger(restarts) || restarts < 1 || restarts > MAX_RESTARTS) throw new Error(`Silhouette fit restarts must be within 1–${MAX_RESTARTS}.`);
  const distanceWeight = options.distanceWeight ?? 1;
  if (!(Number.isFinite(distanceWeight) && distanceWeight >= 0 && distanceWeight <= 100)) throw new Error('Distance weight must be within [0, 100].');
  const viewIds = new Set<string>();
  const componentIndex = new Map(ir.components.map((component, index) => [component.id, index]));
  const prepared = views.map((view) => {
    if (typeof view.id !== 'string' || view.id.length === 0 || viewIds.has(view.id)) throw new Error('Silhouette fit view ids must be unique non-empty strings.');
    viewIds.add(view.id);
    if ((view.camera === undefined) === (view.orbit === undefined)) throw new Error(`View ${view.id} must define exactly one of camera or orbit.`);
    const orbit = view.orbit ? structuredClone(view.orbit) : undefined;
    const camera = view.camera ?? orbitToPinhole(orbit!);
    checkPinholeCamera(camera);
    const pixels = camera.width * camera.height;
    if (!(view.target instanceof Uint8Array) || view.target.length !== pixels) {
      throw new Error(`Target mask for view ${view.id} does not match its camera.`);
    }
    if (!view.target.some((value) => value !== 0)) throw new Error(`Target mask for view ${view.id} is empty.`);
    if (view.parts !== undefined && (!Array.isArray(view.parts) || view.parts.length > MAX_PARTS_PER_VIEW)) throw new Error(`View ${view.id} may define at most ${MAX_PARTS_PER_VIEW} part masks.`);
    const partIds = new Set<string>();
    const parts = (view.parts ?? []).map((part) => {
      if (typeof part.id !== 'string' || part.id.length === 0 || partIds.has(part.id)) throw new Error(`Part mask ids in view ${view.id} must be unique.`);
      partIds.add(part.id);
      if (!(part.mask instanceof Uint8Array) || part.mask.length !== pixels || !part.mask.some((value) => value !== 0)) {
        throw new Error(`Part mask ${part.id} in view ${view.id} must be a non-empty mask matching the camera.`);
      }
      const weight = part.weight ?? 1;
      if (!(Number.isFinite(weight) && weight > 0 && weight <= 10)) throw new Error(`Part mask ${part.id} weight must be within (0, 10].`);
      if (!Array.isArray(part.componentIds) || part.componentIds.length === 0) throw new Error(`Part mask ${part.id} must name components.`);
      const members = new Set(part.componentIds.map((id) => {
        const index = componentIndex.get(id);
        if (index === undefined) throw new Error(`Part mask ${part.id} names unknown component ${id}.`);
        return index;
      }));
      return { id: part.id, members, mask: part.mask, weight, distance: squaredDistanceTransform(part.mask, camera.width, camera.height, 1) };
    });
    let depth: { valuesMm: Float32Array; weight: number } | undefined;
    if (view.depth !== undefined) {
      if (!(view.depth.valuesMm instanceof Float32Array) || view.depth.valuesMm.length !== pixels) throw new Error(`Depth for view ${view.id} must match its camera.`);
      const weight = view.depth.weight ?? 2;
      if (!(Number.isFinite(weight) && weight > 0 && weight <= 20)) throw new Error(`Depth weight for view ${view.id} must be within (0, 20].`);
      if (view.depth.valuesMm.filter((value) => Number.isFinite(value) && value > 0).length < MIN_DEPTH_PIXELS) throw new Error(`Depth for view ${view.id} has too few valid pixels.`);
      depth = { valuesMm: view.depth.valuesMm, weight };
    }
    return { id: view.id, orbit, camera, target: view.target, parts, depth, distance: squaredDistanceTransform(view.target, camera.width, camera.height, 1) };
  });
  const priorWeight = options.priorWeight ?? 0.01;
  if (!(Number.isFinite(priorWeight) && priorWeight >= 0 && priorWeight <= 10)) throw new Error('Prior weight must be within [0, 10].');
  const cameraKeys = new Set<string>();
  const cameraSlots = (options.cameraParameters ?? []).map((parameter) => {
    if (!(Number.isFinite(parameter.min) && Number.isFinite(parameter.max) && parameter.max > parameter.min)) {
      throw new Error('Camera parameter bounds must be finite with max > min.');
    }
    const view = prepared.find((item) => item.id === parameter.viewId);
    if (!view?.orbit) throw new Error(`Camera parameter view ${parameter.viewId} is not an orbit view.`);
    const key = `${parameter.viewId}\u0000${parameter.field}`;
    if (cameraKeys.has(key)) throw new Error('Camera parameters must be unique.');
    cameraKeys.add(key);
    if (parameter.prior && !(Number.isFinite(parameter.prior.mean) && Number.isFinite(parameter.prior.sigma) && parameter.prior.sigma > 0)) {
      throw new Error('Camera parameter prior must have a finite mean and positive sigma.');
    }
    const before = getOrbitField(view.orbit, parameter.field);
    if (before < parameter.min || before > parameter.max) throw new Error(`Camera parameter ${parameter.viewId}.${parameter.field} starts outside its bounds.`);
    return { ...parameter, view, before };
  });
  if (!options.sensitivityGate && parameters.length + cameraSlots.length > MAX_PARAMETERS) throw new Error(`Silhouette fit allows at most ${MAX_PARAMETERS} parameters in total.`);
  if (parameters.length + cameraSlots.length < 1) throw new Error('Silhouette fit requires at least one shape or camera parameter.');

  const working = structuredClone(ir);
  const keys = new Set<string>();
  let linkCount = 0;
  const slots = parameters.map((parameter) => {
    if (!(Number.isFinite(parameter.min) && Number.isFinite(parameter.max) && parameter.max > parameter.min)) {
      throw new Error('Fit parameter bounds must be finite with max > min.');
    }
    const claim = (componentId: string, path: Array<string | number>): { holder: Record<string | number, unknown>; key: string | number } => {
      const component = working.components.find((item) => item.id === componentId);
      if (!component) throw new Error(`Fit parameter component ${componentId} does not exist.`);
      const key = `${componentId}\u0000${path.join('\u0000')}`;
      if (keys.has(key)) throw new Error('Fit parameters and their links must be unique.');
      keys.add(key);
      return resolveSlot(component, path);
    };
    const slot = claim(parameter.componentId, parameter.path);
    const before = slot.holder[slot.key] as number;
    if (before < parameter.min || before > parameter.max) throw new Error(`Fit parameter ${parameter.componentId}.${parameter.path.join('.')} starts outside its bounds.`);
    if (parameter.links !== undefined && !Array.isArray(parameter.links)) throw new Error('Fit parameter links must be an array.');
    linkCount += parameter.links?.length ?? 0;
    if (linkCount > MAX_LINKS) throw new Error(`Silhouette fit allows at most ${MAX_LINKS} parameter links.`);
    const links = (parameter.links ?? []).map((link) => {
      if (!(Number.isFinite(link.ratio) && link.ratio !== 0)) throw new Error('Fit parameter link ratio must be finite and non-zero.');
      const linked = claim(link.componentId, link.path);
      const current = linked.holder[linked.key] as number;
      if (Math.abs(current - before * link.ratio) > 1e-6 * Math.max(1, Math.abs(current))) {
        throw new Error(`Linked slot ${link.componentId}.${link.path.join('.')} does not start at value × ratio.`);
      }
      return { ...linked, ratio: link.ratio };
    });
    return { ...parameter, ...slot, before, linked: links };
  });

  const geometryCache = new Map<string, THREE.BufferGeometry>();
  const meshCache = new Map<string, WorldTriangleMesh>();
  const meshesFor = (): WorldTriangleMesh[] => working.components.map((component) => {
    const geometryKey = JSON.stringify(component.geometry);
    const meshKey = `${geometryKey}|${JSON.stringify([component.position, component.rotation, component.scale])}`;
    const cachedMesh = meshCache.get(meshKey);
    if (cachedMesh) return cachedMesh;
    let geometry = geometryCache.get(geometryKey);
    if (!geometry) {
      geometry = compileAssemblyGeometry(component.geometry);
      geometryCache.set(geometryKey, geometry);
    }
    const mesh = worldTriangleMesh(geometry, componentMatrix(component));
    if (meshCache.size > 4_096) meshCache.clear();
    meshCache.set(meshKey, mesh);
    return mesh;
  });
  const assign = (values: number[]): void => {
    slots.forEach((slot, i) => {
      slot.holder[slot.key] = values[i]!;
      for (const link of slot.linked) link.holder[link.key] = values[i]! * link.ratio;
    });
    cameraSlots.forEach((slot, i) => { setOrbitField(slot.view.orbit!, slot.field, values[slots.length + i]!); });
    for (const view of prepared) {
      if (view.orbit && cameraSlots.some((slot) => slot.view === view)) view.camera = orbitToPinhole(view.orbit);
    }
  };
  const extentPriors = options.extentPriors ?? [];
  if (!Array.isArray(extentPriors) || extentPriors.length > 3 || extentPriors.some((item) => ![0, 1, 2].includes(item.axis)
    || !(Number.isFinite(item.targetMm) && item.targetMm > 0 && Number.isFinite(item.sigmaMm) && item.sigmaMm > 0))) {
    throw new Error('Extent priors need axis 0–2, a positive target and a positive sigma (at most 3).');
  }
  const extentOf = (meshes: WorldTriangleMesh[], axis: number): number => {
    let low = Infinity;
    let high = -Infinity;
    for (const mesh of meshes) {
      for (let i = axis; i < mesh.positions.length; i += 3) {
        const value = mesh.positions[i]!;
        if (value < low) low = value;
        if (value > high) high = value;
      }
    }
    return high - low;
  };
  const failed = (): { loss: number; views: SilhouetteFitViewScore[] } => ({
    loss: EMPTY_LOSS * 2,
    views: prepared.map((view) => ({ id: view.id, iou: 0, meanBoundaryDistancePx: Infinity })),
  });
  const evaluate = (values: number[]): { loss: number; views: SilhouetteFitViewScore[] } => {
    let meshes: WorldTriangleMesh[];
    try {
      assign(values);
      validateAssemblyIR(working);
      meshes = meshesFor();
    } catch {
      return failed();
    }
    let loss = 0;
    const scores: SilhouetteFitViewScore[] = [];
    for (const view of prepared) {
      const { width, height } = view.camera;
      const diagonal = Math.hypot(width, height);
      const term = (score: Omit<SilhouetteFitViewScore, 'id'> | undefined): number => (
        score ? 1 - score.iou + distanceWeight * score.meanBoundaryDistancePx / diagonal : EMPTY_LOSS
      );
      let whole: Uint8Array;
      let ids: Int16Array | undefined;
      let renderedDepth: Float32Array | undefined;
      try {
        if (view.parts.length > 0 || view.depth) {
          const buffer = rasterizeIdDepthBuffer(view.camera, meshes);
          ids = buffer.ids;
          renderedDepth = buffer.depthMm;
          whole = new Uint8Array(ids.length);
          for (let i = 0; i < ids.length; i += 1) whole[i] = ids[i]! >= 0 ? 1 : 0;
        } else {
          whole = rasterizeSilhouette(view.camera, meshes);
        }
      } catch {
        return failed();
      }
      const wholeScore = scoreSilhouette(whole, view.target, view.distance, width, height);
      let viewLoss = term(wholeScore);
      let weights = 1;
      const partScores: NonNullable<SilhouetteFitViewScore['parts']> = [];
      for (const part of view.parts) {
        const rendered = new Uint8Array(ids!.length);
        for (let i = 0; i < ids!.length; i += 1) rendered[i] = part.members.has(ids![i]!) ? 1 : 0;
        const score = scoreSilhouette(rendered, part.mask, part.distance, width, height);
        viewLoss += part.weight * term(score);
        weights += part.weight;
        partScores.push({ id: part.id, iou: score?.iou ?? 0, meanBoundaryDistancePx: score?.meanBoundaryDistancePx ?? Infinity });
      }
      let depthResidual: number | undefined;
      if (view.depth) {
        const residuals: number[] = [];
        const observed: number[] = [];
        for (let i = 0; i < renderedDepth!.length; i += 1) {
          const measured = view.depth.valuesMm[i]!;
          if (ids![i]! >= 0 && Number.isFinite(measured) && measured > 0) {
            residuals.push(renderedDepth![i]! - measured);
            observed.push(measured);
          }
        }
        if (residuals.length >= MIN_DEPTH_PIXELS) {
          const offset = median(residuals);
          depthResidual = residuals.reduce((sum, value) => sum + Math.abs(value - offset), 0) / residuals.length / median(observed);
        } else {
          depthResidual = 1;
        }
        viewLoss += view.depth.weight * depthResidual;
        weights += view.depth.weight;
      }
      loss += viewLoss / weights;
      scores.push({
        id: view.id,
        iou: wholeScore?.iou ?? 0,
        meanBoundaryDistancePx: wholeScore?.meanBoundaryDistancePx ?? Infinity,
        ...(view.parts.length > 0 ? { parts: partScores } : {}),
        ...(depthResidual === undefined ? {} : { depthResidual }),
      });
    }
    let prior = 0;
    cameraSlots.forEach((slot, i) => {
      if (slot.prior) prior += ((values[slots.length + i]! - slot.prior.mean) / slot.prior.sigma) ** 2;
    });
    for (const item of extentPriors) prior += ((extentOf(meshes, item.axis) - item.targetMm) / item.sigmaMm) ** 2;
    return { loss: loss / prepared.length + priorWeight * prior, views: scores };
  };

  const gate = options.sensitivityGate;
  if (gate && !(Number.isFinite(gate.step) && gate.step > 0 && gate.step <= 0.5 && Number.isFinite(gate.minLossChange) && gate.minLossChange >= 0)) {
    throw new Error('Sensitivity gate needs 0 < step ≤ 0.5 and minLossChange ≥ 0.');
  }
  const bounds = [...slots.map((slot) => [slot.min, slot.max] as const), ...cameraSlots.map((slot) => [slot.min, slot.max] as const)];
  const toValue = (unit: number, i: number): number => bounds[i]![0] + (bounds[i]![1] - bounds[i]![0]) * Math.min(1, Math.max(0, unit));
  try {
    const initial = [...slots.map((slot) => slot.before), ...cameraSlots.map((slot) => slot.before)];
    const before = evaluate(initial);
    const sensitivity = gate ? slots.map((slot, i) => Math.max(...[-1, 1].map((sign) => {
      const probe = [...initial];
      probe[i] = Math.min(slot.max, Math.max(slot.min, slot.before + sign * gate.step * (slot.max - slot.min)));
      return Math.abs(evaluate(probe).loss - before.loss);
    }))) : undefined;
    // Above the gate, the most sensitive shape parameters fill the optimiser's budget.
    const shapeBudget = MAX_PARAMETERS - cameraSlots.length;
    const keptShapes = new Set(slots.map((_, i) => i)
      .filter((i) => !sensitivity || sensitivity[i]! >= gate!.minLossChange)
      .sort((a, b) => (sensitivity ? sensitivity[b]! - sensitivity[a]! : a - b))
      .slice(0, shapeBudget));
    const active = initial.map((_, i) => i).filter((i) => i >= slots.length || keptShapes.has(i));
    const start = initial.map((value, i) => (value - bounds[i]![0]) / (bounds[i]![1] - bounds[i]![0]));
    const expand = (unit: number[]): number[] => {
      const values = [...initial];
      active.forEach((i, k) => { values[i] = toValue(unit[k]!, i); });
      return values;
    };
    const jitter = seededNormal(options.seed);
    const objective = (unit: number[]): number => {
      const outside = unit.reduce((sum, value) => sum + (value < 0 ? value * value : value > 1 ? (value - 1) ** 2 : 0), 0);
      return evaluate(expand(unit)).loss + outside;
    };
    const runs = active.length === 0 ? [{ result: { best: [], bestValue: before.loss, evaluations: 0, iterations: 0, mean: [], stopReason: 'tolx' } as CmaEsResult, values: initial, score: before }] : Array.from({ length: restarts }, (_, run) => {
      const activeStart = active.map((i) => start[i]!);
      const from = run === 0 ? activeStart : activeStart.map((value) => Math.min(1, Math.max(0, value + RESTART_JITTER * jitter())));
      const result = minimizeCmaEs(objective, from, { sigma: options.sigma ?? 0.2, seed: (options.seed + run) >>> 0, maxEvaluations, targetValue: 1e-9 });
      const values = expand(result.best);
      return { result, values, score: evaluate(values) };
    });
    const bestRun = runs.reduce((best, run) => (run.score.loss < best.score.loss ? run : best));
    const equivalent = runs.filter((run) => run.score.loss <= bestRun.score.loss + EQUIVALENT_LOSS);
    const spreads = initial.map((_, i) => Math.max(...equivalent.map((run) => run.values[i]!)) - Math.min(...equivalent.map((run) => run.values[i]!)));
    const atBound = (i: number): boolean => {
      const span = bounds[i]![1] - bounds[i]![0];
      return finalValues[i]! - bounds[i]![0] <= AT_BOUND_SPAN * span || bounds[i]![1] - finalValues[i]! <= AT_BOUND_SPAN * span;
    };
    const identified = (i: number): boolean => restarts > 1 && active.includes(i) && spreads[i]! <= IDENTIFIED_SPAN * (bounds[i]![1] - bounds[i]![0]) && !atBound(i);
    let finalValues = bestRun.values;
    let after = bestRun.score;
    if (after.loss > before.loss) {
      finalValues = initial;
      after = before;
    }
    assign(finalValues);
    validateAssemblyIR(working);
    return {
      ir: working,
      receipt: {
        schema: 'sceliph.silhouette-parameter-fit/0.2',
        provenance: 'inferred',
        seed: options.seed,
        parameters: slots.map((slot, i) => ({
          componentId: slot.componentId,
          path: [...slot.path],
          ...(slot.links?.length ? { links: slot.links.map((link) => ({ componentId: link.componentId, path: [...link.path], ratio: link.ratio })) } : {}),
          min: slot.min,
          max: slot.max,
          before: slot.before,
          after: finalValues[i]!,
          spread: spreads[i]!,
          identified: identified(i),
          atBound: atBound(i),
          ...(sensitivity ? { sensitivity: sensitivity[i]!, frozen: !active.includes(i) } : {}),
        })),
        cameraParameters: cameraSlots.map((slot, j) => {
          const i = slots.length + j;
          return {
            viewId: slot.viewId,
            field: slot.field,
            ...(slot.prior ? { prior: { ...slot.prior } } : {}),
            min: slot.min,
            max: slot.max,
            before: slot.before,
            after: finalValues[i]!,
            spread: spreads[i]!,
            identified: identified(i),
            atBound: atBound(i),
          };
        }),
        orbits: prepared.flatMap((view) => (view.orbit ? [{ viewId: view.id, orbit: structuredClone(view.orbit) }] : [])),
        restarts,
        before,
        after,
        evaluations: runs.reduce((sum, run) => sum + run.result.evaluations + 1, 1) + (sensitivity ? 2 * slots.length : 0),
        stopReason: bestRun.result.stopReason,
        compiledGeometries: geometryCache.size,
      },
    };
  } finally {
    for (const geometry of geometryCache.values()) geometry.dispose();
  }
}
