/**
 * Offline photo-projection texture bake for the B3 texture experiment
 * (benchmarks/oss-integration-20261026/texture-plan/b3-projection-draft.md and
 * b3-review-codex.md). Nothing here changes AssemblyIR: a compiled IR gets a
 * per-part chart atlas, every atlas texel is projected into each photo through
 * a fitted camera, and texels that are visible, facing the camera and away
 * from silhouette and part edges take the photo colour. Everything else keeps
 * the IR's own albedo. A CPU renderer draws unlit albedo images so arms can be
 * compared against real photos from views the bake never used.
 */
import * as THREE from 'three';
import type { AssemblyIR } from '../../src/engine/assembly-ir';
import { compileAssemblyIR } from '../../src/engine/assembly-compiler';
import type { PinholeCamera } from '../../src/engine/mesh-silhouette-raster';

type Vec3 = [number, number, number];

export interface BakePart {
  id: string;
  /** World-space triangle soup in millimetres, 9 numbers per triangle. */
  positions: Float64Array;
  /** Compiled primary UV per corner, 6 numbers per triangle. */
  uv: Float32Array;
  /** Linear base colour multiplier. */
  color: Vec3;
  /** Optional base-colour map (sRGB bytes) sampled with uv × repeat. */
  map?: { data: Uint8Array | Uint8ClampedArray; width: number; height: number; repeat: [number, number]; offset: [number, number]; mirrored: boolean };
}

const srgbToLinear = (value: number) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const linearToSrgb = (value: number) => {
  const c = Math.min(1, Math.max(0, value));
  return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
};

/** Compiles the IR in beauty mode and returns one bake part per mesh, in traversal order. */
export function bakeParts(ir: AssemblyIR): BakePart[] {
  const { root } = compileAssemblyIR(ir, 'beauty');
  root.updateMatrixWorld(true);
  const parts: BakePart[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position');
    const uvAttribute = geometry.getAttribute('uv');
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    const positions = new Float64Array(count * 3);
    const uv = new Float32Array(count * 2);
    const vector = new THREE.Vector3();
    for (let i = 0; i < count; i += 1) {
      const vertex = index ? index.getX(i) : i;
      vector.fromBufferAttribute(position, vertex).applyMatrix4(object.matrixWorld);
      positions.set([vector.x * 1000, vector.y * 1000, vector.z * 1000], i * 3);
      if (uvAttribute) uv.set([uvAttribute.getX(vertex), uvAttribute.getY(vertex)], i * 2);
    }
    const material = (Array.isArray(object.material) ? object.material[0] : object.material) as THREE.MeshPhysicalMaterial;
    const texture = material.map;
    const image = texture?.image as { data?: Uint8Array; width?: number; height?: number } | undefined;
    parts.push({
      id: String(object.userData.part?.id ?? object.name),
      positions, uv,
      color: [material.color.r, material.color.g, material.color.b],
      ...(texture && image?.data && image.width && image.height ? {
        map: {
          data: image.data, width: image.width, height: image.height,
          repeat: [texture.repeat.x, texture.repeat.y], offset: [texture.offset.x, texture.offset.y],
          mirrored: texture.wrapS === THREE.MirroredRepeatWrapping,
        },
      } : {}),
    });
  });
  return parts;
}

/** Linear albedo of a part at a compiled UV (bilinear map sample × colour). */
export function partAlbedo(part: BakePart, u: number, v: number): Vec3 {
  if (!part.map) return part.color;
  const { data, width, height, repeat, offset, mirrored } = part.map;
  const wrap = (t: number) => {
    if (!mirrored) return t - Math.floor(t);
    const m = t - 2 * Math.floor(t / 2);
    return m > 1 ? 2 - m : m;
  };
  const x = wrap(u * repeat[0] + offset[0]) * width - 0.5;
  const y = wrap(v * repeat[1] + offset[1]) * height - 0.5;
  const x0 = Math.floor(x); const y0 = Math.floor(y);
  const fx = x - x0; const fy = y - y0;
  const at = (xx: number, yy: number, c: number) => srgbToLinear(data[((Math.min(height - 1, Math.max(0, yy))) * width + Math.min(width - 1, Math.max(0, xx))) * 4 + c]!);
  const out: Vec3 = [0, 0, 0];
  for (let c = 0; c < 3; c += 1) {
    const top = at(x0, y0, c) * (1 - fx) + at(x0 + 1, y0, c) * fx;
    const bottom = at(x0, y0 + 1, c) * (1 - fx) + at(x0 + 1, y0 + 1, c) * fx;
    out[c] = (top * (1 - fy) + bottom * fy) * part.color[c]!;
  }
  return out;
}

function basis(camera: PinholeCamera): [Vec3, Vec3, Vec3] {
  const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a: Vec3): Vec3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
  const forward = norm(sub(camera.target, camera.position));
  const right = norm(cross(forward, camera.up ?? [0, 1, 0]));
  return [right, cross(forward, right), forward];
}

export interface SurfaceBuffer {
  width: number; height: number;
  /** Part index per pixel, -1 = empty. */
  part: Int32Array;
  /** Triangle index within the part. */
  triangle: Int32Array;
  /** Perspective-correct barycentrics of corners 0 and 1. */
  b0: Float32Array; b1: Float32Array;
  /** Camera depth in millimetres (Infinity = empty). */
  depth: Float32Array;
}

/** Visible-surface buffer with perspective-correct barycentrics at pixel centres. */
export function rasterizeSurface(camera: PinholeCamera, parts: BakePart[], nearMm = 1): SurfaceBuffer {
  const { width, height } = camera;
  const [right, down, forward] = basis(camera);
  const n = width * height;
  const buffer: SurfaceBuffer = { width, height, part: new Int32Array(n).fill(-1), triangle: new Int32Array(n).fill(-1), b0: new Float32Array(n), b1: new Float32Array(n), depth: new Float32Array(n).fill(Infinity) };
  const inverse = new Float64Array(n);
  parts.forEach((part, partIndex) => {
    const p = part.positions;
    const triangles = p.length / 9;
    const sx = new Float64Array(3); const sy = new Float64Array(3); const iz = new Float64Array(3);
    for (let t = 0; t < triangles; t += 1) {
      let behind = false;
      for (let k = 0; k < 3; k += 1) {
        const o = t * 9 + k * 3;
        const rel: Vec3 = [p[o]! - camera.position[0], p[o + 1]! - camera.position[1], p[o + 2]! - camera.position[2]];
        const depth = rel[0] * forward[0] + rel[1] * forward[1] + rel[2] * forward[2];
        if (!(depth > nearMm)) { behind = true; break; }
        sx[k] = camera.fx * (rel[0] * right[0] + rel[1] * right[1] + rel[2] * right[2]) / depth + camera.cx;
        sy[k] = camera.fy * (rel[0] * down[0] + rel[1] * down[1] + rel[2] * down[2]) / depth + camera.cy;
        iz[k] = 1 / depth;
      }
      if (behind) continue;
      const area = (sx[1]! - sx[0]!) * (sy[2]! - sy[0]!) - (sy[1]! - sy[0]!) * (sx[2]! - sx[0]!);
      if (area === 0 || !Number.isFinite(area)) continue;
      const minX = Math.max(0, Math.floor(Math.min(sx[0]!, sx[1]!, sx[2]!) - 0.5));
      const maxX = Math.min(width - 1, Math.ceil(Math.max(sx[0]!, sx[1]!, sx[2]!) - 0.5));
      const minY = Math.max(0, Math.floor(Math.min(sy[0]!, sy[1]!, sy[2]!) - 0.5));
      const maxY = Math.min(height - 1, Math.ceil(Math.max(sy[0]!, sy[1]!, sy[2]!) - 0.5));
      for (let y = minY; y <= maxY; y += 1) {
        const py = y + 0.5;
        for (let x = minX; x <= maxX; x += 1) {
          const px = x + 0.5;
          const w0 = ((sx[2]! - sx[1]!) * (py - sy[1]!) - (sy[2]! - sy[1]!) * (px - sx[1]!)) / area;
          const w1 = ((sx[0]! - sx[2]!) * (py - sy[2]!) - (sy[0]! - sy[2]!) * (px - sx[2]!)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w0 * iz[0]! + w1 * iz[1]! + w2 * iz[2]!;
          const index = y * width + x;
          if (z <= inverse[index]!) continue;
          inverse[index] = z;
          buffer.part[index] = partIndex;
          buffer.triangle[index] = t;
          buffer.b0[index] = (w0 * iz[0]!) / z;
          buffer.b1[index] = (w1 * iz[1]!) / z;
          buffer.depth[index] = 1 / z;
        }
      }
    }
  });
  return buffer;
}

/** Number of pixels to the nearest pixel outside `region` (4-neighbour BFS, capped). */
export function insideDistance(region: Uint8Array, width: number, height: number, cap: number): Uint8Array {
  const distance = new Uint8Array(width * height);
  let frontier: number[] = [];
  for (let i = 0; i < region.length; i += 1) {
    if (!region[i]) continue;
    const x = i % width; const y = (i - x) / width;
    const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1 || !region[i - 1] || !region[i + 1] || !region[i - width] || !region[i + width];
    if (edge) { distance[i] = 1; frontier.push(i); }
  }
  for (let level = 2; level <= cap && frontier.length; level += 1) {
    const next: number[] = [];
    for (const i of frontier) for (const j of [i - 1, i + 1, i - width, i + width]) {
      if (j < 0 || j >= region.length || !region[j] || distance[j]) continue;
      if (Math.abs((j % width) - (i % width)) > 1) continue;
      distance[j] = level;
      next.push(j);
    }
    frontier = next;
  }
  for (let i = 0; i < region.length; i += 1) if (region[i] && !distance[i]) distance[i] = cap;
  return distance;
}

export interface BakePhoto {
  camera: PinholeCamera;
  /** RGBA bytes at camera.width × camera.height. */
  rgba: Uint8ClampedArray | Uint8Array;
  /** Product silhouette (1 = product). */
  mask: Uint8Array;
}

export interface BakeOptions {
  /** Atlas side in texels. */
  atlasSize: number;
  /** Minimum distance (photo pixels) from the silhouette edge and from a part boundary. */
  erodePx: number;
  /** Minimum cosine between the surface normal and the direction to the camera. */
  minFacing: number;
  /** Depth agreement with the visible surface, as a share of the camera depth. */
  depthTolerance: number;
}

export interface AtlasChart { part: number; triangles: number[]; }

export interface Bake {
  atlasSize: number;
  /** Atlas UV per part corner (6 per triangle), in texels. */
  atlasUv: Float32Array[];
  /** Baked linear RGB per texel (3 per texel). */
  color: Float32Array;
  /** 0 = not baked, otherwise 1 + photo index. */
  source: Uint8Array;
  /** Texels claimed by two different charts (atlas overlap diagnostic). */
  overlapTexels: number;
  /** Share of surface texels that took a photo colour. */
  coverage: number;
  /** Texels covered per photo. */
  perPhoto: number[];
}

const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function corner(part: BakePart, t: number, k: number): Vec3 {
  const o = t * 9 + k * 3;
  return [part.positions[o]!, part.positions[o + 1]!, part.positions[o + 2]!];
}

/**
 * Charts: per part, triangles grouped by the signed dominant axis of their
 * normal and by shared corners, each projected onto that axis plane at one
 * global texel density and shelf-packed with a 2-texel gutter.
 */
function buildAtlas(parts: BakePart[], atlasSize: number): { uv: Float32Array[]; chartOf: Int32Array[] } {
  const charts: Array<{ part: number; triangles: number[]; axis: number; min: [number, number]; size: [number, number] }> = [];
  parts.forEach((part, partIndex) => {
    const count = part.positions.length / 9;
    const key = new Int8Array(count);
    for (let t = 0; t < count; t += 1) {
      const n = cross3(sub3(corner(part, t, 1), corner(part, t, 0)), sub3(corner(part, t, 2), corner(part, t, 0)));
      const axis = [0, 1, 2].reduce((best, a) => (Math.abs(n[a]!) > Math.abs(n[best]!) ? a : best), 0);
      key[t] = axis * 2 + (n[axis]! >= 0 ? 0 : 1);
    }
    const q = (v: number) => Math.round(v * 100);
    const byVertex = new Map<string, number[]>();
    for (let t = 0; t < count; t += 1) for (let k = 0; k < 3; k += 1) {
      const c = corner(part, t, k);
      const id = `${q(c[0])},${q(c[1])},${q(c[2])}`;
      const list = byVertex.get(id) ?? [];
      list.push(t);
      byVertex.set(id, list);
    }
    const seen = new Uint8Array(count);
    for (let start = 0; start < count; start += 1) {
      if (seen[start]) continue;
      const stack = [start];
      seen[start] = 1;
      const triangles: number[] = [];
      while (stack.length) {
        const t = stack.pop()!;
        triangles.push(t);
        for (let k = 0; k < 3; k += 1) {
          const c = corner(part, t, k);
          for (const other of byVertex.get(`${q(c[0])},${q(c[1])},${q(c[2])}`) ?? []) {
            if (seen[other] || key[other] !== key[start]) continue;
            seen[other] = 1;
            stack.push(other);
          }
        }
      }
      const axis = key[start]! >> 1;
      const [a, b] = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1];
      let minA = Infinity; let minB = Infinity; let maxA = -Infinity; let maxB = -Infinity;
      for (const t of triangles) for (let k = 0; k < 3; k += 1) {
        const c = corner(part, t, k);
        minA = Math.min(minA, c[a]!); maxA = Math.max(maxA, c[a]!);
        minB = Math.min(minB, c[b]!); maxB = Math.max(maxB, c[b]!);
      }
      charts.push({ part: partIndex, triangles, axis, min: [minA, minB], size: [Math.max(maxA - minA, 1e-3), Math.max(maxB - minB, 1e-3)] });
    }
  });
  const gutter = 2;
  const pack = (density: number) => {
    const order = [...charts.keys()].sort((i, j) => charts[j]!.size[1] - charts[i]!.size[1]);
    const placed = new Array<[number, number]>(charts.length);
    let x = gutter; let y = gutter; let shelf = 0;
    for (const i of order) {
      const w = Math.ceil(charts[i]!.size[0] * density) + gutter;
      const h = Math.ceil(charts[i]!.size[1] * density) + gutter;
      if (x + w > atlasSize) { x = gutter; y += shelf; shelf = 0; }
      if (y + h > atlasSize || w > atlasSize) return undefined;
      placed[i] = [x, y];
      x += w; shelf = Math.max(shelf, h);
    }
    return placed;
  };
  const area = charts.reduce((sum, chart) => sum + chart.size[0] * chart.size[1], 0);
  let density = Math.sqrt((atlasSize * atlasSize) / area) * 0.9;
  let placed = pack(density);
  while (!placed) { density *= 0.92; placed = pack(density); }
  const uv = parts.map((part) => new Float32Array((part.positions.length / 9) * 6));
  const chartOf = parts.map((part) => new Int32Array(part.positions.length / 9));
  charts.forEach((chart, i) => {
    for (const t of chart.triangles) chartOf[chart.part]![t] = i;
    const [a, b] = chart.axis === 0 ? [2, 1] : chart.axis === 1 ? [0, 2] : [0, 1];
    const [ox, oy] = placed![i]!;
    for (const t of chart.triangles) for (let k = 0; k < 3; k += 1) {
      const c = corner(parts[chart.part]!, t, k);
      uv[chart.part]![t * 6 + k * 2] = ox + (c[a]! - chart.min[0]) * density;
      uv[chart.part]![t * 6 + k * 2 + 1] = oy + (c[b]! - chart.min[1]) * density;
    }
  });
  return { uv, chartOf };
}

/**
 * Bakes photo colours into a chart atlas. A texel takes the colour of the photo
 * that sees it most squarely, provided it is the visible surface there (same
 * part, depth within tolerance), inside the product silhouette and at least
 * `erodePx` from both the silhouette edge and the part's visible boundary.
 */
export function bakeProjection(parts: BakePart[], photos: BakePhoto[], options: BakeOptions): Bake {
  const { atlasSize } = options;
  const { uv: atlasUv, chartOf } = buildAtlas(parts, atlasSize);
  const color = new Float32Array(atlasSize * atlasSize * 3);
  const source = new Uint8Array(atlasSize * atlasSize);
  const owner = new Int32Array(atlasSize * atlasSize).fill(-1);
  const views = photos.map((photo) => {
    const surface = rasterizeSurface(photo.camera, parts);
    const { width, height } = photo.camera;
    // Distance to the silhouette edge and to the edge of each part's visible region.
    const productEdge = insideDistance(photo.mask, width, height, options.erodePx + 1);
    const partEdge = new Uint8Array(width * height);
    const region = new Uint8Array(width * height);
    for (let p = 0; p < parts.length; p += 1) {
      region.fill(0);
      let any = false;
      for (let i = 0; i < region.length; i += 1) if (surface.part[i] === p) { region[i] = 1; any = true; }
      if (!any) continue;
      const d = insideDistance(region, width, height, options.erodePx + 1);
      for (let i = 0; i < region.length; i += 1) if (region[i]) partEdge[i] = d[i]!;
    }
    const linear = new Float32Array(width * height * 3);
    for (let i = 0; i < width * height; i += 1) for (let c = 0; c < 3; c += 1) linear[i * 3 + c] = srgbToLinear(photo.rgba[i * 4 + c]!);
    return { photo, surface, productEdge, partEdge, linear, basis: basis(photo.camera) };
  });
  let surfaceTexels = 0;
  let overlapTexels = 0;
  const perPhoto = photos.map(() => 0);
  parts.forEach((part, partIndex) => {
    const count = part.positions.length / 9;
    const uv = atlasUv[partIndex]!;
    for (let t = 0; t < count; t += 1) {
      const A = corner(part, t, 0); const B = corner(part, t, 1); const C = corner(part, t, 2);
      const n = cross3(sub3(B, A), sub3(C, A));
      const length = Math.hypot(...n) || 1;
      const normal: Vec3 = [n[0] / length, n[1] / length, n[2] / length];
      const ax = uv[t * 6]!, ay = uv[t * 6 + 1]!, bx = uv[t * 6 + 2]!, by = uv[t * 6 + 3]!, cx = uv[t * 6 + 4]!, cy = uv[t * 6 + 5]!;
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (area === 0) continue;
      const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx))); const maxX = Math.min(atlasSize - 1, Math.ceil(Math.max(ax, bx, cx)));
      const minY = Math.max(0, Math.floor(Math.min(ay, by, cy))); const maxY = Math.min(atlasSize - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
        const px = x + 0.5; const py = y + 0.5;
        const w0 = ((cx - bx) * (py - by) - (cy - by) * (px - bx)) / area;
        const w1 = ((ax - cx) * (py - cy) - (ay - cy) * (px - cx)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        const texel = y * atlasSize + x;
        // Neighbouring triangles of one chart share edge texels; another chart there is an overlap.
        const chart = chartOf[partIndex]![t]!;
        if (owner[texel] !== -1) {
          if (owner[texel] !== chart) overlapTexels += 1;
          continue;
        }
        owner[texel] = chart;
        surfaceTexels += 1;
        const P: Vec3 = [w0 * A[0] + w1 * B[0] + w2 * C[0], w0 * A[1] + w1 * B[1] + w2 * C[1], w0 * A[2] + w1 * B[2] + w2 * C[2]];
        let best = -1; let bestFacing = options.minFacing; let bestPixel = -1; let bestX = 0; let bestY = 0;
        views.forEach((view, k) => {
          const { camera } = view.photo;
          const [right, down, forward] = view.basis;
          const rel = sub3(P, camera.position);
          const depth = rel[0] * forward[0] + rel[1] * forward[1] + rel[2] * forward[2];
          if (!(depth > 1)) return;
          const toCamera = Math.hypot(...rel);
          const facing = -(normal[0] * rel[0] + normal[1] * rel[1] + normal[2] * rel[2]) / toCamera;
          if (facing <= bestFacing) return;
          const ix = camera.fx * (rel[0] * right[0] + rel[1] * right[1] + rel[2] * right[2]) / depth + camera.cx;
          const iy = camera.fy * (rel[0] * down[0] + rel[1] * down[1] + rel[2] * down[2]) / depth + camera.cy;
          const pxl = Math.floor(ix); const pyl = Math.floor(iy);
          if (pxl < 1 || pyl < 1 || pxl >= camera.width - 2 || pyl >= camera.height - 2) return;
          const pixel = pyl * camera.width + pxl;
          if (view.surface.part[pixel] !== partIndex) return;
          if (Math.abs(view.surface.depth[pixel]! - depth) > depth * options.depthTolerance) return;
          if (!view.photo.mask[pixel] || view.productEdge[pixel]! <= options.erodePx || view.partEdge[pixel]! <= options.erodePx) return;
          best = k; bestFacing = facing; bestPixel = pixel; bestX = ix - 0.5; bestY = iy - 0.5;
        });
        if (best < 0 || bestPixel < 0) continue;
        const view = views[best]!;
        const w = view.photo.camera.width;
        const x0 = Math.floor(bestX); const y0 = Math.floor(bestY); const fx = bestX - x0; const fy = bestY - y0;
        for (let c = 0; c < 3; c += 1) {
          const at = (xx: number, yy: number) => view.linear[(yy * w + xx) * 3 + c]!;
          color[texel * 3 + c] = (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
        }
        source[texel] = best + 1;
        perPhoto[best]! += 1;
      }
    }
  });
  const baked = perPhoto.reduce((a, b) => a + b, 0);
  return { atlasSize, atlasUv, color, source, overlapTexels, coverage: surfaceTexels ? baked / surfaceTexels : 0, perPhoto };
}

export type Shading = (partIndex: number, triangle: number, b0: number, b1: number) => Vec3;

/** IR albedo shading: the compiled UV through the part's own colour and map. */
export function irShading(parts: BakePart[]): Shading {
  return (p, t, b0, b1) => {
    const part = parts[p]!;
    const b2 = 1 - b0 - b1;
    const u = b0 * part.uv[t * 6]! + b1 * part.uv[t * 6 + 2]! + b2 * part.uv[t * 6 + 4]!;
    const v = b0 * part.uv[t * 6 + 1]! + b1 * part.uv[t * 6 + 3]! + b2 * part.uv[t * 6 + 5]!;
    return partAlbedo(part, u, v);
  };
}

/** Baked texels where the bake has them (nearest texel), otherwise the fallback shading. */
export function bakedShading(bake: Bake, fallback: Shading): Shading {
  return (p, t, b0, b1) => {
    const uv = bake.atlasUv[p]!;
    const b2 = 1 - b0 - b1;
    const x = Math.floor(b0 * uv[t * 6]! + b1 * uv[t * 6 + 2]! + b2 * uv[t * 6 + 4]!);
    const y = Math.floor(b0 * uv[t * 6 + 1]! + b1 * uv[t * 6 + 3]! + b2 * uv[t * 6 + 5]!);
    if (x >= 0 && y >= 0 && x < bake.atlasSize && y < bake.atlasSize) {
      const texel = y * bake.atlasSize + x;
      if (bake.source[texel]) return [bake.color[texel * 3]!, bake.color[texel * 3 + 1]!, bake.color[texel * 3 + 2]!];
    }
    return fallback(p, t, b0, b1);
  };
}

/** Unlit albedo render (sRGB RGBA, white background) plus the surface buffer. */
export function renderAlbedo(camera: PinholeCamera, parts: BakePart[], shading: Shading): { rgba: Uint8ClampedArray; surface: SurfaceBuffer } {
  const surface = rasterizeSurface(camera, parts);
  const rgba = new Uint8ClampedArray(camera.width * camera.height * 4).fill(255);
  for (let i = 0; i < camera.width * camera.height; i += 1) {
    if (surface.part[i]! < 0) continue;
    const c = shading(surface.part[i]!, surface.triangle[i]!, surface.b0[i]!, surface.b1[i]!);
    rgba[i * 4] = linearToSrgb(c[0]); rgba[i * 4 + 1] = linearToSrgb(c[1]); rgba[i * 4 + 2] = linearToSrgb(c[2]);
  }
  return { rgba, surface };
}

/**
 * Weak single-image de-light, per photo: inside each part's visible region the
 * linear colour is divided by (local mean luminance / region mean)^strength,
 * using a box mean of radius `radius` over that region only, with the gain
 * clamped to [0.5, 2]. A bounded heuristic, not albedo recovery.
 */
export function delightPhoto(photo: BakePhoto, parts: BakePart[], strength: number, radius: number): BakePhoto {
  const { width, height } = photo.camera;
  const surface = rasterizeSurface(photo.camera, parts);
  const out = new Uint8ClampedArray(photo.rgba);
  const lum = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    lum[i] = 0.2126 * srgbToLinear(photo.rgba[i * 4]!) + 0.7152 * srgbToLinear(photo.rgba[i * 4 + 1]!) + 0.0722 * srgbToLinear(photo.rgba[i * 4 + 2]!);
  }
  for (let p = 0; p < parts.length; p += 1) {
    const inside = (i: number) => surface.part[i] === p && photo.mask[i] === 1;
    // Integral images of luminance and count over the region.
    const sum = new Float64Array((width + 1) * (height + 1));
    const cnt = new Float64Array((width + 1) * (height + 1));
    let total = 0; let n = 0;
    for (let y = 0; y < height; y += 1) {
      let rowSum = 0; let rowCnt = 0;
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        if (inside(i)) { rowSum += lum[i]!; rowCnt += 1; total += lum[i]!; n += 1; }
        sum[(y + 1) * (width + 1) + x + 1] = sum[y * (width + 1) + x + 1]! + rowSum;
        cnt[(y + 1) * (width + 1) + x + 1] = cnt[y * (width + 1) + x + 1]! + rowCnt;
      }
    }
    if (n < 16) continue;
    const mean = total / n;
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!inside(i)) continue;
      const x0 = Math.max(0, x - radius); const x1 = Math.min(width, x + radius + 1);
      const y0 = Math.max(0, y - radius); const y1 = Math.min(height, y + radius + 1);
      const box = (a: Float64Array) => a[y1 * (width + 1) + x1]! - a[y0 * (width + 1) + x1]! - a[y1 * (width + 1) + x0]! + a[y0 * (width + 1) + x0]!;
      const local = box(sum) / Math.max(1, box(cnt));
      const gain = Math.min(2, Math.max(0.5, (Math.max(1e-4, mean) / Math.max(1e-4, local)) ** strength));
      for (let c = 0; c < 3; c += 1) out[i * 4 + c] = linearToSrgb(srgbToLinear(photo.rgba[i * 4 + c]!) * gain);
    }
  }
  return { ...photo, rgba: out };
}
