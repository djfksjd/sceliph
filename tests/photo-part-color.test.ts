import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { AssemblyIR } from '../src/engine/assembly-ir';
import { orbitToPinhole } from '../src/engine/orbit-camera';
import { rasterizeIdBuffer, worldTriangleMesh } from '../src/engine/mesh-silhouette-raster';
import { applyPartColors, partColorsFromPhoto } from '../src/engine/photo-part-color';

const box = (w: number, h: number, d: number, at: [number, number, number]) => {
  const geometry = new THREE.BoxGeometry(w / 1000, h / 1000, d / 1000);
  const mesh = worldTriangleMesh(geometry, new THREE.Matrix4().makeTranslation(at[0] / 1000, at[1] / 1000, at[2] / 1000));
  geometry.dispose();
  return mesh;
};

const ir: AssemblyIR = {
  schema: 'morphloom.assembly/0.1', name: 'Cabinet', units: 'mm',
  components: [
    { id: 'body', name: 'Body', category: 'mechanical', materialName: 'oak', detail: 'body', geometry: { op: 'roundedBox', size: [600, 800, 400], radius: 0 }, position: [0, 400, 0], material: { color: '#888888' } },
    { id: 'top', name: 'Top', category: 'mechanical', materialName: 'marble', detail: 'top', geometry: { op: 'roundedBox', size: [700, 60, 460], radius: 0 }, position: [0, 830, 0], material: { color: '#888888' } },
    { id: 'back', name: 'Hidden back plate', category: 'mechanical', materialName: 'board', detail: 'hidden', geometry: { op: 'roundedBox', size: [500, 600, 10], radius: 0 }, position: [0, 400, -190], material: { color: '#123456' } },
  ],
} as AssemblyIR;

describe('photo part colours', () => {
  it('recovers per-part colours through a fitted camera and leaves hidden parts inferred', () => {
    const meshes = [box(600, 800, 400, [0, 400, 0]), box(700, 60, 460, [0, 830, 0]), box(500, 600, 10, [0, 400, -190])];
    const width = 320;
    const height = 320;
    const truth = orbitToPinhole({ width, height, fx: 400, fy: 400, cx: 160, cy: 168, target: [0, 430, 0], azimuthDeg: 30, elevationDeg: 18, distanceMm: 3000, rollDeg: 0, focalScale: 1 });
    const ids = rasterizeIdBuffer(truth, meshes);
    const colors: Array<[number, number, number]> = [[140, 90, 50], [235, 235, 228], [18, 52, 86]];
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < ids.length; i += 1) {
      if (ids[i]! < 0) continue;
      mask[i] = 1;
      data.set(colors[ids[i]!]!, i * 4);
    }
    const result = partColorsFromPhoto(ir, meshes, { width, height, data }, mask, { viewHint: { azimuthDeg: 0, elevationDeg: 10 }, maxEvaluations: 1600, seed: 3, exposure: 'photo' });
    expect(result.silhouetteIoU).toBeGreaterThan(0.9);
    const byId = new Map(result.parts.map((part) => [part.id, part]));
    expect(byId.get('body')).toMatchObject({ source: 'photo', color: '#8c5a32' });
    expect(byId.get('top')).toMatchObject({ source: 'photo', color: '#ebebe4' });
    expect(byId.get('back')).toMatchObject({ source: 'inferred', color: '#123456' });
    const recoloured = applyPartColors(ir, result.parts);
    expect(recoloured.components.map((component) => component.material.color)).toEqual(['#8c5a32', '#ebebe4', '#123456']);
    expect(recoloured.components[0]!.geometry).toEqual(ir.components[0]!.geometry);
    expect(ir.components[0]!.material.color).toBe('#888888');
  });
});
