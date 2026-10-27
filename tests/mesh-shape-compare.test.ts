import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { compareMeshShapes, footprintSides, nearestDistances } from '../src/engine/mesh-shape-compare';
import { worldTriangleMesh } from '../src/engine/mesh-silhouette-raster';

const box = (w: number, h: number, d: number, at: [number, number, number] = [0, 0, 0], yawDeg = 0) => {
  const geometry = new THREE.BoxGeometry(w / 1000, h / 1000, d / 1000);
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...at.map((v) => v / 1000) as [number, number, number]), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yawDeg * Math.PI / 180, 0)), new THREE.Vector3(1, 1, 1));
  const mesh = worldTriangleMesh(geometry, matrix);
  geometry.dispose();
  return mesh;
};
// An L-shaped table: top plus one off-centre leg block, so yaw is unambiguous.
const shape = (yawDeg = 0, at: [number, number, number] = [0, 0, 0], sx = 1) => [
  box(600 * sx, 30, 300, [at[0], at[1] + 435, at[2]], yawDeg),
  box(60, 420, 60, [at[0] + 200 * Math.cos(yawDeg * Math.PI / 180) * sx, at[1] + 210, at[2] - 200 * Math.sin(yawDeg * Math.PI / 180) * sx], yawDeg),
];

describe('mesh shape comparison', () => {
  it('is exact for the same shape, whatever its placement and yaw', () => {
    const same = compareMeshShapes(shape(), shape(), { views: 4, surfaceSamples: 2000 });
    expect(same.meanIoU).toBeGreaterThan(0.99);
    expect(same.chamfer).toBeLessThan(0.01);
    expect(same.extentError.every((value) => value < 1e-6)).toBe(true);
    const moved = compareMeshShapes(shape(40, [500, 80, -300]), shape(), { views: 4, surfaceSamples: 2000 });
    expect(moved.meanIoU).toBeGreaterThan(0.95);
    expect(Math.min(Math.abs(moved.yawDeg - 320), Math.abs(moved.yawDeg - 40))).toBeLessThan(1.5);
    expect(moved.extentError[1]).toBeLessThan(1e-6);
  });

  it('reports a wider candidate as an x extent error and a lower overlap', () => {
    const wide = compareMeshShapes(shape(0, [0, 0, 0], 1.2), shape(), { views: 4, surfaceSamples: 2000 });
    expect(wide.extentError[0]).toBeCloseTo(0.2, 2);
    expect(wide.meanIoU).toBeLessThan(0.97);
    expect(wide.fScore.at2).toBeLessThan(1);
  });

  it('measures the footprint independent of yaw, so a 35° turn neither mixes nor swaps the sides', () => {
    for (const yaw of [0, 35, 90]) {
      const [long, short] = footprintSides([box(800, 400, 300, [0, 200, 0], yaw)]);
      expect(long).toBeCloseTo(800, 3);
      expect(short).toBeCloseTo(300, 3);
    }
    const deep = compareMeshShapes([box(800, 400, 390, [0, 200, 0], 35)], [box(800, 400, 300, [0, 200, 0])], { views: 4, surfaceSamples: 2000 });
    expect(deep.footprintError[0]).toBeLessThan(1e-6);
    expect(deep.footprintError[1]).toBeCloseTo(0.3, 3);
  });

  it('finds exact nearest distances across grid cells', () => {
    const target = new Float64Array([0, 0, 0, 10, 0, 0]);
    expect(Array.from(nearestDistances(new Float64Array([4, 0, 0, 100, 0, 0]), target, 1))).toEqual([4, 90]);
  });
});
