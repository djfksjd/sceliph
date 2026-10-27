import * as THREE from 'three';

/**
 * Pinhole camera in OpenCV convention (x right, y down, z forward) with pixel
 * intrinsics. World coordinates are millimetres.
 */
export interface PinholeCamera {
  width: number;
  height: number;
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  position: [number, number, number];
  target: [number, number, number];
  up?: [number, number, number];
}

const MAX_RASTER_PIXELS = 1_048_576;
const MAX_TRIANGLES = 2_000_000;

type Vec3 = [number, number, number];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function normalize(a: Vec3, label: string): Vec3 {
  const length = Math.hypot(a[0], a[1], a[2]);
  if (!(length > 1e-12)) throw new Error(`Camera ${label} is degenerate.`);
  return [a[0] / length, a[1] / length, a[2] / length];
}

export function checkPinholeCamera(camera: PinholeCamera): void {
  const { width, height } = camera;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 4 || height < 4 || width * height > MAX_RASTER_PIXELS) {
    throw new Error('Camera raster size is unsafe.');
  }
  const values = [camera.fx, camera.fy, camera.cx, camera.cy, ...camera.position, ...camera.target, ...(camera.up ?? [0, 1, 0])];
  if (!values.every(Number.isFinite) || !(camera.fx > 0) || !(camera.fy > 0)) throw new Error('Camera parameters must be finite with positive focal lengths.');
}

/** World→camera rotation rows (right, down, forward). */
function cameraBasis(camera: PinholeCamera): [Vec3, Vec3, Vec3] {
  const forward = normalize(sub(camera.target, camera.position), 'view direction');
  const right = normalize(cross(forward, camera.up ?? [0, 1, 0]), 'up vector');
  const down = cross(forward, right);
  return [right, down, forward];
}

/** Projects a world point (mm) to pixel coordinates and camera depth (mm). */
export function projectPoint(camera: PinholeCamera, point: Vec3): { x: number; y: number; depth: number } {
  checkPinholeCamera(camera);
  const [right, down, forward] = cameraBasis(camera);
  const relative = sub(point, camera.position);
  const depth = dot(relative, forward);
  return { x: camera.fx * dot(relative, right) / depth + camera.cx, y: camera.fy * dot(relative, down) / depth + camera.cy, depth };
}

export interface WorldTriangleMesh {
  /** World-space vertex positions in millimetres, xyz triples. */
  positions: Float32Array | Float64Array;
  /** Optional triangle indices; absent means sequential triples. */
  index?: ArrayLike<number>;
}

/** World-space millimetre triangles of a compiled geometry under a TRS transform. */
export function worldTriangleMesh(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, metresToMm = 1000): WorldTriangleMesh {
  const attribute = geometry.getAttribute('position');
  if (!attribute || attribute.itemSize !== 3) throw new Error('Geometry has no xyz positions.');
  const positions = new Float64Array(attribute.count * 3);
  const vector = new THREE.Vector3();
  for (let i = 0; i < attribute.count; i += 1) {
    vector.fromBufferAttribute(attribute, i).applyMatrix4(matrix);
    positions[i * 3] = vector.x * metresToMm;
    positions[i * 3 + 1] = vector.y * metresToMm;
    positions[i * 3 + 2] = vector.z * metresToMm;
  }
  return { positions, index: geometry.index ? Array.from(geometry.index.array as ArrayLike<number>) : undefined };
}

/**
 * Binary silhouette (1 = covered) sampled at pixel centres. Every triangle
 * must lie in front of the camera; anything else is rejected rather than
 * clipped so a fit can never be scored against a partially missing mesh.
 */
export function rasterizeSilhouette(camera: PinholeCamera, meshes: WorldTriangleMesh[], nearMm = 1e-3): Uint8Array {
  checkPinholeCamera(camera);
  const [right, down, forward] = cameraBasis(camera);
  const { width, height } = camera;
  const mask = new Uint8Array(width * height);
  let triangles = 0;
  for (const mesh of meshes) {
    const { positions } = mesh;
    const vertexCount = positions.length / 3;
    if (!Number.isInteger(vertexCount)) throw new Error('Mesh positions must be xyz triples.');
    const projected = new Float64Array(vertexCount * 2);
    for (let i = 0; i < vertexCount; i += 1) {
      const relative: Vec3 = [positions[i * 3]! - camera.position[0], positions[i * 3 + 1]! - camera.position[1], positions[i * 3 + 2]! - camera.position[2]];
      const depth = dot(relative, forward);
      if (!(depth > nearMm)) throw new Error('Mesh vertex lies behind the camera near plane.');
      projected[i * 2] = camera.fx * dot(relative, right) / depth + camera.cx;
      projected[i * 2 + 1] = camera.fy * dot(relative, down) / depth + camera.cy;
    }
    const triangleCount = mesh.index ? mesh.index.length / 3 : vertexCount / 3;
    if (!Number.isInteger(triangleCount)) throw new Error('Mesh triangle list is incomplete.');
    triangles += triangleCount;
    if (triangles > MAX_TRIANGLES) throw new Error('Silhouette triangle budget exceeded.');
    for (let t = 0; t < triangleCount; t += 1) {
      const ia = mesh.index ? mesh.index[t * 3]! : t * 3;
      const ib = mesh.index ? mesh.index[t * 3 + 1]! : t * 3 + 1;
      const ic = mesh.index ? mesh.index[t * 3 + 2]! : t * 3 + 2;
      const ax = projected[ia * 2]!, ay = projected[ia * 2 + 1]!;
      const bx = projected[ib * 2]!, by = projected[ib * 2 + 1]!;
      const cx = projected[ic * 2]!, cy = projected[ic * 2 + 1]!;
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (area === 0 || !Number.isFinite(area)) continue;
      const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 0.5));
      const maxX = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx) - 0.5));
      const minY = Math.max(0, Math.floor(Math.min(ay, by, cy) - 0.5));
      const maxY = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy) - 0.5));
      const sign = area > 0 ? 1 : -1;
      for (let y = minY; y <= maxY; y += 1) {
        const py = y + 0.5;
        for (let x = minX; x <= maxX; x += 1) {
          const px = x + 0.5;
          const w0 = sign * ((bx - ax) * (py - ay) - (by - ay) * (px - ax));
          const w1 = sign * ((cx - bx) * (py - by) - (cy - by) * (px - bx));
          const w2 = sign * ((ax - cx) * (py - cy) - (ay - cy) * (px - cx));
          if (w0 >= 0 && w1 >= 0 && w2 >= 0) mask[y * width + x] = 1;
        }
      }
    }
  }
  return mask;
}

/**
 * Visible-surface id buffer: for every pixel centre, the index of the nearest
 * mesh (or -1). Depth is interpolated perspective-correctly (1/z linear in
 * screen space), so partially hidden parts yield the visible-region masks that
 * image segmenters return. The same near-plane rule as the silhouette applies.
 */
export function rasterizeIdBuffer(camera: PinholeCamera, meshes: WorldTriangleMesh[], nearMm = 1e-3): Int16Array {
  return rasterizeIdDepthBuffer(camera, meshes, nearMm).ids;
}

/** Id buffer plus the visible camera-space depth (mm along the view axis; Infinity where empty). */
export function rasterizeIdDepthBuffer(camera: PinholeCamera, meshes: WorldTriangleMesh[], nearMm = 1e-3): { ids: Int16Array; depthMm: Float32Array } {
  checkPinholeCamera(camera);
  if (meshes.length > 32_767) throw new Error('Too many meshes for an id buffer.');
  const [right, down, forward] = cameraBasis(camera);
  const { width, height } = camera;
  const ids = new Int16Array(width * height).fill(-1);
  const inverseDepth = new Float64Array(width * height);
  let triangles = 0;
  meshes.forEach((mesh, meshIndex) => {
    const { positions } = mesh;
    const vertexCount = positions.length / 3;
    if (!Number.isInteger(vertexCount)) throw new Error('Mesh positions must be xyz triples.');
    const projected = new Float64Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i += 1) {
      const relative: Vec3 = [positions[i * 3]! - camera.position[0], positions[i * 3 + 1]! - camera.position[1], positions[i * 3 + 2]! - camera.position[2]];
      const depth = dot(relative, forward);
      if (!(depth > nearMm)) throw new Error('Mesh vertex lies behind the camera near plane.');
      projected[i * 3] = camera.fx * dot(relative, right) / depth + camera.cx;
      projected[i * 3 + 1] = camera.fy * dot(relative, down) / depth + camera.cy;
      projected[i * 3 + 2] = 1 / depth;
    }
    const triangleCount = mesh.index ? mesh.index.length / 3 : vertexCount / 3;
    if (!Number.isInteger(triangleCount)) throw new Error('Mesh triangle list is incomplete.');
    triangles += triangleCount;
    if (triangles > MAX_TRIANGLES) throw new Error('Silhouette triangle budget exceeded.');
    for (let t = 0; t < triangleCount; t += 1) {
      const ia = mesh.index ? mesh.index[t * 3]! : t * 3;
      const ib = mesh.index ? mesh.index[t * 3 + 1]! : t * 3 + 1;
      const ic = mesh.index ? mesh.index[t * 3 + 2]! : t * 3 + 2;
      const ax = projected[ia * 3]!, ay = projected[ia * 3 + 1]!, az = projected[ia * 3 + 2]!;
      const bx = projected[ib * 3]!, by = projected[ib * 3 + 1]!, bz = projected[ib * 3 + 2]!;
      const cx = projected[ic * 3]!, cy = projected[ic * 3 + 1]!, cz = projected[ic * 3 + 2]!;
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (area === 0 || !Number.isFinite(area)) continue;
      const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 0.5));
      const maxX = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx) - 0.5));
      const minY = Math.max(0, Math.floor(Math.min(ay, by, cy) - 0.5));
      const maxY = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy) - 0.5));
      for (let y = minY; y <= maxY; y += 1) {
        const py = y + 0.5;
        for (let x = minX; x <= maxX; x += 1) {
          const px = x + 0.5;
          const w0 = ((cx - bx) * (py - by) - (cy - by) * (px - bx)) / area;
          const w1 = ((ax - cx) * (py - cy) - (ay - cy) * (px - cx)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w0 * az + w1 * bz + w2 * cz;
          const index = y * width + x;
          if (z > inverseDepth[index]!) {
            inverseDepth[index] = z;
            ids[index] = meshIndex;
          }
        }
      }
    }
  });
  const depthMm = new Float32Array(width * height);
  for (let i = 0; i < depthMm.length; i += 1) depthMm[i] = ids[i]! >= 0 ? 1 / inverseDepth[i]! : Infinity;
  return { ids, depthMm };
}
