import type { PinholeCamera } from './mesh-silhouette-raster';

/**
 * Orbit parameterisation of a pinhole camera in Sceliph world space (Y up,
 * millimetres). Azimuth 0 / elevation 0 places the camera on +Z looking toward
 * -Z; positive azimuth orbits toward +X, positive elevation raises the camera.
 * `focalScale` multiplies the base pixel focal lengths so a monocular FOV
 * estimate can be refined under a prior.
 */
export interface OrbitCamera {
  width: number;
  height: number;
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  target: [number, number, number];
  azimuthDeg: number;
  elevationDeg: number;
  distanceMm: number;
  rollDeg?: number;
  focalScale?: number;
}

type Vec3 = [number, number, number];

const radians = (degrees: number): number => degrees * Math.PI / 180;

/** Unit camera axes (right, down, forward) for an orbit orientation. */
export function orbitBasis(azimuthDeg: number, elevationDeg: number, rollDeg = 0): { right: Vec3; down: Vec3; forward: Vec3 } {
  if (![azimuthDeg, elevationDeg, rollDeg].every(Number.isFinite) || Math.abs(elevationDeg) >= 89.5) {
    throw new Error('Orbit angles must be finite with |elevation| < 89.5 degrees.');
  }
  const a = radians(azimuthDeg);
  const e = radians(elevationDeg);
  const forward: Vec3 = [-Math.cos(e) * Math.sin(a), -Math.sin(e), -Math.cos(e) * Math.cos(a)];
  const right0: Vec3 = [Math.cos(a), 0, -Math.sin(a)];
  const down0: Vec3 = [
    forward[1] * right0[2] - forward[2] * right0[1],
    forward[2] * right0[0] - forward[0] * right0[2],
    forward[0] * right0[1] - forward[1] * right0[0],
  ];
  const r = radians(rollDeg);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return {
    right: [c * right0[0] + s * down0[0], c * right0[1] + s * down0[1], c * right0[2] + s * down0[2]],
    down: [c * down0[0] - s * right0[0], c * down0[1] - s * right0[1], c * down0[2] - s * right0[2]],
    forward,
  };
}

export function orbitToPinhole(orbit: OrbitCamera): PinholeCamera {
  if (!(Number.isFinite(orbit.distanceMm) && orbit.distanceMm > 0)) throw new Error('Orbit distance must be finite and positive.');
  const focalScale = orbit.focalScale ?? 1;
  if (!(Number.isFinite(focalScale) && focalScale > 0)) throw new Error('Orbit focal scale must be finite and positive.');
  const { down, forward } = orbitBasis(orbit.azimuthDeg, orbit.elevationDeg, orbit.rollDeg ?? 0);
  const position: Vec3 = [
    orbit.target[0] - forward[0] * orbit.distanceMm,
    orbit.target[1] - forward[1] * orbit.distanceMm,
    orbit.target[2] - forward[2] * orbit.distanceMm,
  ];
  return {
    width: orbit.width,
    height: orbit.height,
    fx: orbit.fx * focalScale,
    fy: orbit.fy * focalScale,
    cx: orbit.cx,
    cy: orbit.cy,
    position,
    target: [...orbit.target],
    up: [-down[0], -down[1], -down[2]],
  };
}

/** Orbit angles and distance of a camera at `position` looking at `target` (roll 0). */
export function orbitFromLookAt(position: Vec3, target: Vec3): { azimuthDeg: number; elevationDeg: number; distanceMm: number } {
  const offset: Vec3 = [position[0] - target[0], position[1] - target[1], position[2] - target[2]];
  const distanceMm = Math.hypot(...offset);
  if (!(distanceMm > 0)) throw new Error('Camera position and target coincide.');
  return {
    azimuthDeg: Math.atan2(offset[0], offset[2]) * 180 / Math.PI,
    elevationDeg: Math.asin(offset[1] / distanceMm) * 180 / Math.PI,
    distanceMm,
  };
}

export interface PointMapOrbitInitialization {
  orbit: OrbitCamera;
  /** Anchored camera-space centroid of the object's visible surface, mm. */
  objectCentroidCameraMm: Vec3;
  objectPixels: number;
}

/**
 * Initialises an orbit camera from a metric point map. Given a coarse
 * orientation hint (from the LLM or the user), the anchored camera-space
 * centroid `c` of the object's visible pixels fixes the camera position:
 * `position = o - (c.x right + c.y down + c.z forward)` with `o` the assumed
 * world reference point, and the target is the optical-axis point at depth c.z.
 */
export function initialOrbitFromPointMap(input: {
  points: Float32Array;
  validMask: Uint8Array;
  objectMask: Uint8Array;
  width: number;
  height: number;
  /** Metres-to-millimetres factor after the anchor correction (1000 × correction). */
  millimetresPerUnit: number;
  /** Normalized intrinsics (pixel = f × X/Z + c, in image fractions). */
  intrinsics: { fx: number; fy: number; cx: number; cy: number };
  hint: { azimuthDeg: number; elevationDeg: number };
  worldReferenceMm: Vec3;
  raster?: { width: number; height: number };
}): PointMapOrbitInitialization {
  const { width, height } = input;
  const pixels = width * height;
  if (input.points.length !== pixels * 3 || input.validMask.length !== pixels || input.objectMask.length !== pixels) {
    throw new Error('Point map, validity mask and object mask sizes must match.');
  }
  if (!(Number.isFinite(input.millimetresPerUnit) && input.millimetresPerUnit > 0)) throw new Error('Millimetre scale must be finite and positive.');
  const sum: Vec3 = [0, 0, 0];
  let count = 0;
  for (let i = 0; i < pixels; i += 1) {
    if (!input.validMask[i] || !input.objectMask[i]) continue;
    const x = input.points[i * 3]!;
    const y = input.points[i * 3 + 1]!;
    const z = input.points[i * 3 + 2]!;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    sum[0] += x;
    sum[1] += y;
    sum[2] += z;
    count += 1;
  }
  if (count < 16) throw new Error('Object mask covers too few valid point-map pixels.');
  const c: Vec3 = [sum[0] / count * input.millimetresPerUnit, sum[1] / count * input.millimetresPerUnit, sum[2] / count * input.millimetresPerUnit];
  if (!(c[2] > 0)) throw new Error('Object centroid lies behind the camera.');
  const { right, down } = orbitBasis(input.hint.azimuthDeg, input.hint.elevationDeg, 0);
  const o = input.worldReferenceMm;
  const target: Vec3 = [
    o[0] - c[0] * right[0] - c[1] * down[0],
    o[1] - c[0] * right[1] - c[1] * down[1],
    o[2] - c[0] * right[2] - c[1] * down[2],
  ];
  const rasterWidth = input.raster?.width ?? width;
  const rasterHeight = input.raster?.height ?? height;
  return {
    orbit: {
      width: rasterWidth,
      height: rasterHeight,
      fx: input.intrinsics.fx * rasterWidth,
      fy: input.intrinsics.fy * rasterHeight,
      cx: input.intrinsics.cx * rasterWidth,
      cy: input.intrinsics.cy * rasterHeight,
      target,
      azimuthDeg: input.hint.azimuthDeg,
      elevationDeg: input.hint.elevationDeg,
      distanceMm: c[2],
      rollDeg: 0,
      focalScale: 1,
    },
    objectCentroidCameraMm: c,
    objectPixels: count,
  };
}
