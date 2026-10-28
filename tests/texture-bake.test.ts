import { describe, expect, it } from 'vitest';
import type { AssemblyIR } from '../src/engine/assembly-ir';
import { orbitToPinhole } from '../src/engine/orbit-camera';
import { bakeParts, bakeProjection, bakedShading, renderAlbedo, type BakePart, type BakePhoto, type Shading } from '../scripts/lib/texture-bake';

const camera = (azimuthDeg: number, elevationDeg = 20) => orbitToPinhole({ width: 192, height: 192, fx: 260, fy: 260, cx: 96, cy: 96, target: [0, 200, 0], azimuthDeg, elevationDeg, distanceMm: 1600, rollDeg: 0, focalScale: 1 });

const box = (id: string, size: [number, number, number], position: [number, number, number], rotation: [number, number, number] = [0, 0, 0]) => ({
  id, name: id, category: 'mechanical', materialName: 'board', detail: 'fixture', geometry: { op: 'roundedBox', size, radius: 0 }, position, rotation, material: { color: '#808080' },
});

/** Ground-truth surface colour from the world position: a 50 mm checker, or flat red for `red` parts. */
function truthShading(parts: BakePart[], red: Set<number> = new Set()): Shading {
  return (p, t, b0, b1) => {
    if (red.has(p)) return [0.8, 0.02, 0.02];
    const q = parts[p]!.positions;
    const b2 = 1 - b0 - b1;
    const x = b0 * q[t * 9]! + b1 * q[t * 9 + 3]! + b2 * q[t * 9 + 6]!;
    const y = b0 * q[t * 9 + 1]! + b1 * q[t * 9 + 4]! + b2 * q[t * 9 + 7]!;
    const z = b0 * q[t * 9 + 2]! + b1 * q[t * 9 + 5]! + b2 * q[t * 9 + 8]!;
    const odd = (Math.floor(x / 50) + Math.floor(y / 50) + Math.floor(z / 50)) & 1;
    return odd ? [0.7, 0.7, 0.7] : [0.05, 0.05, 0.05];
  };
}

function photo(parts: BakePart[], azimuthDeg: number, shading: Shading): BakePhoto {
  const cam = camera(azimuthDeg);
  const { rgba, surface } = renderAlbedo(cam, parts, shading);
  return { camera: cam, rgba, mask: Uint8Array.from(surface.part, (p) => (p >= 0 ? 1 : 0)) };
}

const options = { atlasSize: 1024, erodePx: 1, minFacing: 0.2, depthTolerance: 0.01 };

describe('offline photo projection bake', () => {
  it('lands each photo texel on the right surface point from a view it never saw (perspective-correct bake)', () => {
    const ir = { schema: 'morphloom.assembly/0.1', name: 'Plate', units: 'mm', components: [box('plate', [500, 20, 400], [0, 200, 0], [-0.9, 0.3, 0])] } as unknown as AssemblyIR;
    const parts = bakeParts(ir);
    // Colour encodes world position (0.2–0.8 over ±300 mm), so a colour error converts to a position error in mm.
    const encode = (v: number) => 0.2 + 0.6 * (v + 300) / 600;
    const gradient: Shading = (p, t, b0, b1) => {
      const q = parts[p]!.positions;
      const b2 = 1 - b0 - b1;
      const at = (k: number) => b0 * q[t * 9 + k]! + b1 * q[t * 9 + 3 + k]! + b2 * q[t * 9 + 6 + k]!;
      return [encode(at(0)), encode(at(1) - 200), encode(at(2))];
    };
    const bake = bakeProjection(parts, [photo(parts, -30, gradient), photo(parts, 40, gradient)], options);
    expect(bake.overlapTexels).toBe(0);
    const heldOut = camera(5, 35);
    const expected = renderAlbedo(heldOut, parts, gradient).rgba;
    const got = renderAlbedo(heldOut, parts, bakedShading(bake, () => [1, 0, 1])).rgba;
    const decode = (byte: number) => { const c = byte / 255; const linear = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; return (linear - 0.2) / 0.6 * 600; };
    const errors: number[] = [];
    for (let i = 0; i < expected.length / 4; i += 1) {
      if (expected[i * 4] === 255 && expected[i * 4 + 1] === 255) continue;
      if (got[i * 4] === 255 && got[i * 4 + 1] === 0 && got[i * 4 + 2] === 255) continue;
      errors.push(Math.hypot(...[0, 1, 2].map((c) => decode(got[i * 4 + c]!) - decode(expected[i * 4 + c]!))));
    }
    errors.sort((a, b) => a - b);
    // One photo pixel is about 6 mm on this plate; 8-bit colour quantisation alone is about 1 mm.
    expect(errors.length).toBeGreaterThan(1000);
    expect(errors[Math.floor(errors.length / 2)]!).toBeLessThan(6);
    expect(errors[Math.floor(errors.length * 0.95)]!).toBeLessThan(15);
  });

  it('never paints an occluder onto the surface hidden behind it', () => {
    const ir = { schema: 'morphloom.assembly/0.1', name: 'Occlusion', units: 'mm', components: [box('wall', [600, 400, 40], [0, 200, 0]), box('block', [160, 160, 160], [0, 200, 300])] } as unknown as AssemblyIR;
    const parts = bakeParts(ir);
    const wall = parts.findIndex((part) => part.id === 'wall');
    const block = parts.findIndex((part) => part.id === 'block');
    const bake = bakeProjection(parts, [photo(parts, 0, truthShading(parts, new Set([block])))], options);
    let wallBaked = 0; let wallRed = 0;
    const uv = bake.atlasUv[wall]!;
    const size = bake.atlasSize;
    // Every baked texel inside the wall's charts must carry checker colours, never the block's red.
    for (let t = 0; t < uv.length / 6; t += 1) {
      const x = Math.floor((uv[t * 6]! + uv[t * 6 + 2]! + uv[t * 6 + 4]!) / 3);
      const y = Math.floor((uv[t * 6 + 1]! + uv[t * 6 + 3]! + uv[t * 6 + 5]!) / 3);
      const texel = y * size + x;
      if (!bake.source[texel]) continue;
      wallBaked += 1;
      if (bake.color[texel * 3]! > 0.5 && bake.color[texel * 3 + 1]! < 0.2) wallRed += 1;
    }
    expect(wallBaked).toBeGreaterThan(0);
    expect(wallRed).toBe(0);
    // The block's own front face is baked red.
    const blockUv = bake.atlasUv[block]!;
    let blockRed = 0;
    for (let t = 0; t < blockUv.length / 6; t += 1) {
      const texel = Math.floor((blockUv[t * 6 + 1]! + blockUv[t * 6 + 3]! + blockUv[t * 6 + 5]!) / 3) * size + Math.floor((blockUv[t * 6]! + blockUv[t * 6 + 2]! + blockUv[t * 6 + 4]!) / 3);
      if (bake.source[texel] && bake.color[texel * 3]! > 0.5) blockRed += 1;
    }
    expect(blockRed).toBeGreaterThan(0);
  });
});
