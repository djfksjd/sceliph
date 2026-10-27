import type {BufferGeometry} from 'three';

export const CAP_DIAGONAL_POLICY = 'quality-diagonal-v1';
const threshold = 1e-12; // Same relative degeneracy contract as the topology gate.
/** Opt-in local diagonal flips on planar cap triangle pairs. Reuses authored
 * corners (including UV/normal), never moves a vertex or touches a side wall. */
export function improveExtrudeCapDiagonals(geometry: BufferGeometry): number {
  if (geometry.index) throw Error('Cap diagonal policy requires non-indexed extrusion');
  const position = geometry.getAttribute('position');
  const caps = geometry.groups.filter(g => g.materialIndex === 0);
  const triangles = caps.flatMap(g => Array.from({length: g.count / 3}, (_, i) => g.start + i * 3));
  const key = (i: number) => `${position.getX(i)},${position.getY(i)},${position.getZ(i)}`;
  const area = (a: number, b: number, c: number) =>
    (position.getX(b) - position.getX(a)) * (position.getY(c) - position.getY(a)) -
    (position.getY(b) - position.getY(a)) * (position.getX(c) - position.getX(a));
  const quality = (a: number, b: number, c: number) => {
    const edge = (u: number, v: number) => (position.getX(u) - position.getX(v)) ** 2 + (position.getY(u) - position.getY(v)) ** 2;
    const longest = Math.max(edge(a, b), edge(b, c), edge(c, a));
    return longest === 0 ? 0 : area(a, b, c) ** 2 / longest ** 2;
  };
  let flips = 0;
  // Bounded work: complex or irreparable caps still fail the normal gate.
  while (flips < 64) {
    const bad = triangles.filter(t => quality(t, t + 1, t + 2) <= threshold);
    if (!bad.length) break;
    const edges = new Map<string, Array<{triangle: number; u: number; v: number; w: number}>>();
    for (const t of triangles) for (let j = 0; j < 3; j++) {
      const u = t + j, v = t + (j + 1) % 3, w = t + (j + 2) % 3;
      const edgeKey = [key(u), key(v)].sort().join('|');
      const list = edges.get(edgeKey) ?? []; list.push({triangle: t, u, v, w}); edges.set(edgeKey, list);
    }
    let best: {t: number; other: number; corners: number[]; quality: number} | undefined;
    for (const t of bad) for (let j = 0; j < 3; j++) {
      const u = t + j, v = t + (j + 1) % 3, w = t + (j + 2) % 3;
      const pair = edges.get([key(u), key(v)].sort().join('|'));
      if (pair?.length !== 2) continue;
      const neighbor = pair.find(e => e.triangle !== t);
      if (!neighbor || key(neighbor.u) !== key(v) || key(neighbor.v) !== key(u)) continue;
      const x = neighbor.w, z = position.getZ(u);
      if ([v, w, x].some(i => position.getZ(i) !== z) || key(w) === key(x)) continue;
      const originalArea = area(u, v, w), neighborArea = area(neighbor.u, neighbor.v, x);
      const firstArea = area(w, u, x), secondArea = area(w, x, v);
      if (originalArea * neighborArea <= 0 || firstArea * originalArea <= 0 || secondArea * originalArea <= 0) continue;
      const beforeArea = Math.abs(originalArea) + Math.abs(neighborArea), afterArea = Math.abs(firstArea) + Math.abs(secondArea);
      if (Math.abs(beforeArea - afterArea) > beforeArea * 1e-10) continue;
      const score = Math.min(quality(w, u, x), quality(w, x, v));
      if (score <= threshold || best && score <= best.quality) continue;
      best = {t, other: neighbor.triangle, corners: [w, u, x, w, x, v], quality: score};
    }
    if (!best) break;
    const destinations = [best.t, best.t + 1, best.t + 2, best.other, best.other + 1, best.other + 2];
    for (const attribute of Object.values(geometry.attributes)) {
      const values = best.corners.map(i => Array.from({length: attribute.itemSize}, (_, j) => attribute.getComponent(i, j)));
      destinations.forEach((i, n) => values[n].forEach((v, j) => attribute.setComponent(i, j, v)));
      attribute.needsUpdate = true;
    }
    flips++;
  }
  return flips;
}
