import { orbitToPinhole, type OrbitCamera } from './orbit-camera';
import { rasterizeSilhouette, type WorldTriangleMesh } from './mesh-silhouette-raster';

/**
 * Scores a candidate mesh against a reference mesh with no shared structure
 * (e.g. an AssemblyIR against an artist GLB). Both are put on the floor
 * (min y = 0) and centred in x/z; the candidate is then turned about +Y to the
 * yaw that best matches the reference silhouettes. Every candidate scored
 * against one reference goes through the same procedure, so the alignment
 * favours none of them. Silhouettes come from a fixed ring of synthetic
 * cameras around the reference, never from photo cameras. Evaluation only.
 */

export interface MeshCompareOptions {
  /** Ring of synthetic views. Default 8 azimuths at 20° elevation. */
  views?: number;
  elevationDeg?: number;
  raster?: number;
  /** Coarse yaw step, then a ±step/2 refinement at step/10. Default 5°. */
  yawStepDeg?: number;
  surfaceSamples?: number;
  seed?: number;
}

export interface MeshCompareResult {
  schema: 'sceliph.mesh-shape-compare/0.1';
  yawDeg: number;
  /** Reference bounding-box diagonal, the length unit of the distance metrics. */
  diagonalMm: number;
  meanIoU: number;
  viewIoU: number[];
  /** Mean of both directed mean nearest-surface distances, ÷ diagonal. */
  chamfer: number;
  fScore: { at2: number; at5: number };
  extentMm: { candidate: [number, number, number]; reference: [number, number, number] };
  /** |candidate − reference| / reference per axis after alignment (x, y, z). */
  extentError: [number, number, number];
  /**
   * Horizontal footprint as the [long, short] sides of each mesh's own
   * minimum-area rectangle in x/z: independent of yaw, so the alignment can
   * neither swap nor mix the two horizontal sizes.
   */
  footprintMm: { candidate: [number, number]; reference: [number, number] };
  /** |candidate − reference| / reference for the [long, short] footprint sides. */
  footprintError: [number, number];
}

type Vec3 = [number, number, number];
const MAX_SAMPLES = 50_000;

function triangles(mesh: WorldTriangleMesh): number {
  return mesh.index ? mesh.index.length / 3 : mesh.positions.length / 9;
}
function vertex(mesh: WorldTriangleMesh, triangle: number, corner: number): Vec3 {
  const i = mesh.index ? mesh.index[triangle * 3 + corner]! : triangle * 3 + corner;
  return [mesh.positions[i * 3]!, mesh.positions[i * 3 + 1]!, mesh.positions[i * 3 + 2]!];
}

function bounds(meshes: WorldTriangleMesh[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const mesh of meshes) {
    for (let i = 0; i < mesh.positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = mesh.positions[i + axis]!;
        if (value < min[axis]!) min[axis] = value;
        if (value > max[axis]!) max[axis] = value;
      }
    }
  }
  if (!min.every(Number.isFinite)) throw new Error('Mesh has no finite vertices.');
  return { min, max };
}

/** Floor at y = 0, x/z bounding-box centre at the origin, optional yaw about +Y. */
function placed(meshes: WorldTriangleMesh[], yawDeg = 0): WorldTriangleMesh[] {
  const { min, max } = bounds(meshes);
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const c = Math.cos(yawDeg * Math.PI / 180);
  const s = Math.sin(yawDeg * Math.PI / 180);
  return meshes.map((mesh) => {
    const positions = new Float64Array(mesh.positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      const x = mesh.positions[i]! - cx;
      const z = mesh.positions[i + 2]! - cz;
      positions[i] = c * x + s * z;
      positions[i + 1] = mesh.positions[i + 1]! - min[1];
      positions[i + 2] = -s * x + c * z;
    }
    return { positions, ...(mesh.index ? { index: mesh.index } : {}) };
  });
}

function iou(a: Uint8Array, b: Uint8Array): number {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] && b[i]) inter += 1;
    if (a[i] || b[i]) union += 1;
  }
  return union === 0 ? 1 : inter / union;
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Area-weighted surface samples. */
export function sampleSurface(meshes: WorldTriangleMesh[], count: number, seed: number): Float64Array {
  const areas: number[] = [];
  const refs: Array<[WorldTriangleMesh, number]> = [];
  let total = 0;
  for (const mesh of meshes) {
    for (let t = 0; t < triangles(mesh); t += 1) {
      const [a, b, c] = [vertex(mesh, t, 0), vertex(mesh, t, 1), vertex(mesh, t, 2)];
      const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const area = 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
      if (!(area > 0)) continue;
      total += area;
      areas.push(total);
      refs.push([mesh, t]);
    }
  }
  if (!(total > 0)) throw new Error('Mesh has no surface area.');
  const next = random(seed);
  const out = new Float64Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const r = next() * total;
    let lo = 0;
    let hi = areas.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (areas[mid]! < r) lo = mid + 1;
      else hi = mid;
    }
    const [mesh, t] = refs[lo]!;
    const [a, b, c] = [vertex(mesh, t, 0), vertex(mesh, t, 1), vertex(mesh, t, 2)];
    let p = next();
    let q = next();
    if (p + q > 1) {
      p = 1 - p;
      q = 1 - q;
    }
    for (let axis = 0; axis < 3; axis += 1) out[i * 3 + axis] = a[axis]! + p * (b[axis]! - a[axis]!) + q * (c[axis]! - a[axis]!);
  }
  return out;
}

/** Distance from each query point to its nearest target point (uniform grid, exact). */
export function nearestDistances(query: Float64Array, target: Float64Array, cell: number): Float64Array {
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < target.length / 3; i += 1) {
    const k = key(Math.floor(target[i * 3]! / cell), Math.floor(target[i * 3 + 1]! / cell), Math.floor(target[i * 3 + 2]! / cell));
    const list = grid.get(k);
    if (list) list.push(i);
    else grid.set(k, [i]);
  }
  const out = new Float64Array(query.length / 3);
  for (let i = 0; i < out.length; i += 1) {
    const [x, y, z] = [query[i * 3]!, query[i * 3 + 1]!, query[i * 3 + 2]!];
    const [gx, gy, gz] = [Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell)];
    let best = Infinity;
    // Search growing shells; a point found in shell r is final once r·cell exceeds it.
    for (let r = 0; r < 4096; r += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        for (let dy = -r; dy <= r; dy += 1) {
          const edge = Math.abs(dx) === r || Math.abs(dy) === r;
          for (let dz = -r; dz <= r; dz += edge || r === 0 ? 1 : 2 * r) {
            for (const j of grid.get(key(gx + dx, gy + dy, gz + dz)) ?? []) {
              const d = Math.hypot(target[j * 3]! - x, target[j * 3 + 1]! - y, target[j * 3 + 2]! - z);
              if (d < best) best = d;
            }
          }
        }
      }
      if (best <= r * cell) break;
    }
    out[i] = best;
  }
  return out;
}

/** [long, short] sides of the minimum-area rectangle around the x/z projection (convex hull + edge sweep). */
export function footprintSides(meshes: WorldTriangleMesh[]): [number, number] {
  const points: Array<[number, number]> = [];
  for (const mesh of meshes) for (let i = 0; i < mesh.positions.length; i += 3) points.push([mesh.positions[i]!, mesh.positions[i + 2]!]);
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Array<[number, number]>) => {
    const out: Array<[number, number]> = [];
    for (const point of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, point) <= 0) out.pop();
      out.push(point);
    }
    out.pop();
    return out;
  };
  const hull = [...half(points), ...half([...points].reverse())];
  if (hull.length < 3) {
    const xs = points.map((point) => point[0]);
    const zs = points.map((point) => point[1]);
    const sides = [Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)].sort((a, b) => b - a);
    return [sides[0]!, sides[1]!];
  }
  let best: [number, number] = [Infinity, Infinity];
  for (let i = 0; i < hull.length; i += 1) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length === 0) continue;
    const u = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of hull) {
      const pu = p[0] * u[0]! + p[1] * u[1]!;
      const pv = -p[0] * u[1]! + p[1] * u[0]!;
      minU = Math.min(minU, pu);
      maxU = Math.max(maxU, pu);
      minV = Math.min(minV, pv);
      maxV = Math.max(maxV, pv);
    }
    const sides = [maxU - minU, maxV - minV].sort((x, y) => y - x) as [number, number];
    if (sides[0] * sides[1] < best[0] * best[1]) best = sides;
  }
  return best;
}

export function compareMeshShapes(candidate: WorldTriangleMesh[], reference: WorldTriangleMesh[], options: MeshCompareOptions = {}): MeshCompareResult {
  const viewCount = options.views ?? 8;
  const elevationDeg = options.elevationDeg ?? 20;
  const size = options.raster ?? 160;
  const yawStep = options.yawStepDeg ?? 5;
  const samples = options.surfaceSamples ?? 8_000;
  if (!(Number.isInteger(viewCount) && viewCount >= 1 && viewCount <= 24)) throw new Error('View count must be within 1–24.');
  if (!(Number.isInteger(size) && size >= 32 && size <= 512)) throw new Error('Compare raster must be within 32–512.');
  if (!(yawStep > 0 && yawStep <= 90)) throw new Error('Yaw step must be within (0, 90].');
  if (!(Number.isInteger(samples) && samples >= 100 && samples <= MAX_SAMPLES)) throw new Error(`Surface samples must be within 100–${MAX_SAMPLES}.`);
  const ref = placed(reference);
  const refBounds = bounds(ref);
  const refExtent = refBounds.max.map((value, axis) => value - refBounds.min[axis]!) as Vec3;
  const diagonal = Math.hypot(...refExtent);
  const candExtentRaw = (() => {
    const b = bounds(candidate);
    return b.max.map((value, axis) => value - b.min[axis]!) as Vec3;
  })();
  // Frame both shapes with room for a candidate up to twice the reference.
  const reach = Math.max(diagonal, Math.hypot(...candExtentRaw));
  const fovY = 40 * Math.PI / 180;
  const f = size / 2 / Math.tan(fovY / 2);
  const cameras = Array.from({ length: viewCount }, (_, k): OrbitCamera => ({
    width: size, height: size, fx: f, fy: f, cx: size / 2, cy: size / 2,
    target: [0, refExtent[1] / 2, 0], azimuthDeg: k * 360 / viewCount, elevationDeg, distanceMm: 0.65 * reach / Math.tan(fovY / 2), rollDeg: 0, focalScale: 1,
  })).map(orbitToPinhole);
  const refMasks = cameras.map((camera) => rasterizeSilhouette(camera, ref));
  const score = (yaw: number) => {
    const turned = placed(candidate, yaw);
    const ious = cameras.map((camera, k) => iou(rasterizeSilhouette(camera, turned), refMasks[k]!));
    return { yaw, ious, mean: ious.reduce((sum, value) => sum + value, 0) / ious.length };
  };
  let best = score(0);
  for (let yaw = yawStep; yaw < 360; yaw += yawStep) {
    const next = score(yaw);
    if (next.mean > best.mean) best = next;
  }
  for (let delta = -yawStep / 2; delta <= yawStep / 2 + 1e-9; delta += yawStep / 10) {
    if (delta === 0) continue;
    const next = score(best.yaw + delta);
    if (next.mean > best.mean) best = next;
  }
  const cand = placed(candidate, best.yaw);
  const candBounds = bounds(cand);
  const candExtent = candBounds.max.map((value, axis) => value - candBounds.min[axis]!) as Vec3;
  const seed = options.seed ?? 1;
  const candPoints = sampleSurface(cand, samples, seed);
  const refPoints = sampleSurface(ref, samples, seed + 1);
  const cell = diagonal / 64;
  const toRef = nearestDistances(candPoints, refPoints, cell);
  const toCand = nearestDistances(refPoints, candPoints, cell);
  const mean = (values: Float64Array) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const fScore = (tau: number) => {
    const precision = toRef.filter((value) => value <= tau).length / toRef.length;
    const recall = toCand.filter((value) => value <= tau).length / toCand.length;
    return precision + recall === 0 ? 0 : 2 * precision * recall / (precision + recall);
  };
  const round = (value: number) => +value.toFixed(4);
  const candFootprint = footprintSides(candidate);
  const refFootprint = footprintSides(reference);
  return {
    schema: 'sceliph.mesh-shape-compare/0.1',
    yawDeg: round(((best.yaw % 360) + 360) % 360),
    diagonalMm: round(diagonal),
    meanIoU: round(best.mean),
    viewIoU: best.ious.map(round),
    chamfer: round((mean(toRef) + mean(toCand)) / 2 / diagonal),
    fScore: { at2: round(fScore(0.02 * diagonal)), at5: round(fScore(0.05 * diagonal)) },
    extentMm: { candidate: candExtent.map((value) => +value.toFixed(1)) as Vec3, reference: refExtent.map((value) => +value.toFixed(1)) as Vec3 },
    extentError: candExtent.map((value, axis) => round(Math.abs(value - refExtent[axis]!) / refExtent[axis]!)) as Vec3,
    footprintMm: { candidate: candFootprint.map((value) => +value.toFixed(1)) as [number, number], reference: refFootprint.map((value) => +value.toFixed(1)) as [number, number] },
    footprintError: candFootprint.map((value, index) => round(Math.abs(value - refFootprint[index]!) / refFootprint[index]!)) as [number, number],
  };
}
