import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { compileAssemblyGeometry } from '../src/engine/assembly-compiler';
import type { AssemblyIR } from '../src/engine/assembly-ir';
import { projectPoint, rasterizeIdDepthBuffer, worldTriangleMesh } from '../src/engine/mesh-silhouette-raster';
import type { MogeGeometry } from '../src/engine/moge-geometry';
import { orbitFromLookAt, orbitToPinhole, type OrbitCamera } from '../src/engine/orbit-camera';
import { downsampleMask, downsampleObjectDepth, fitPhotoShape, type PhotoFitSpec } from '../src/engine/photo-shape-fit';

const scene = (box: [number, number, number], boxY: number, radius: number, depth: number, post: [number, number, number]): AssemblyIR => ({
  schema: 'morphloom.assembly/0.1',
  name: 'photo-fit-fixture',
  units: 'mm',
  components: [
    { id: 'box', name: 'Box', category: 'enclosure', materialName: 'wood', detail: 'fixture', geometry: { op: 'roundedBox', size: box, radius: 1 }, position: [0, boxY, 0], material: { color: '#884422' } },
    { id: 'post', name: 'Post', category: 'mechanical', materialName: 'steel', detail: 'fixture', geometry: { op: 'cylinder', radiusTop: radius, radiusBottom: radius, depth, radialSegments: 32 }, position: post, material: { color: '#335599' } },
  ],
});

/** Exact "MoGe-like" output rendered from a known camera: metric point map, depth and masks. */
function syntheticPhoto(ir: AssemblyIR, orbit: OrbitCamera) {
  const camera = orbitToPinhole(orbit);
  const meshes = ir.components.map((component) => {
    const geometry = compileAssemblyGeometry(component.geometry);
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...component.position!.map((v) => v / 1000) as [number, number, number]), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    const mesh = worldTriangleMesh(geometry, matrix);
    geometry.dispose();
    return mesh;
  });
  const { ids, depthMm } = rasterizeIdDepthBuffer(camera, meshes);
  const { width, height } = orbit;
  const intrinsics = { fx: orbit.fx / width, fy: orbit.fy / height, cx: 0.5, cy: 0.5 };
  const points = new Float32Array(width * height * 3);
  const depth = new Float32Array(width * height);
  const validMask = new Uint8Array(width * height);
  for (let i = 0; i < ids.length; i += 1) {
    if (ids[i]! < 0) {
      depth[i] = Infinity;
      points.fill(Infinity, i * 3, i * 3 + 3);
      continue;
    }
    const z = depthMm[i]! / 1000;
    const u = ((i % width) + 0.5) / width;
    const v = (Math.floor(i / width) + 0.5) / height;
    points[i * 3] = (u - 0.5) / intrinsics.fx * z;
    points[i * 3 + 1] = (v - 0.5) / intrinsics.fy * z;
    points[i * 3 + 2] = z;
    depth[i] = z;
    validMask[i] = 1;
  }
  const geometry: MogeGeometry = {
    width, height, focal: 1, shift: 0, intrinsics, fovXDegrees: 0, fovYDegrees: 0, depth, points, validMask,
    validPixels: validMask.reduce((sum, value) => sum + value, 0), metricScale: 1,
  };
  return { geometry, ids, camera };
}

describe('photo shape fit helpers', () => {
  it('downsamples masks by area majority and depth by block median', () => {
    const mask = new Uint8Array([1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0]);
    expect([...downsampleMask(mask, 4, 4, 2, 2)]).toEqual([1, 0, 1, 1]);
    const geometry = { width: 4, height: 4, depth: Float32Array.from({ length: 16 }, (_, i) => i / 10), validMask: new Uint8Array(16).fill(1) } as unknown as MogeGeometry;
    const depth = downsampleObjectDepth(geometry, mask, 1000, 2, 2);
    expect(depth[0]).toBeCloseTo(100, 3);
    expect(Number.isNaN(depth[1]!)).toBe(true);
  });
});

describe('one-photo camera + shape fit', () => {
  const truth = scene([300, 150, 200], 75, 40, 180, [60, 240, -20]);
  const truthOrbit: OrbitCamera = { width: 128, height: 96, fx: 128 / (2 * Math.tan(Math.PI / 9)), fy: 128 / (2 * Math.tan(Math.PI / 9)), cx: 64, cy: 48, target: [0, 100, 0], azimuthDeg: 30, elevationDeg: 25, distanceMm: 900 };
  const photo = syntheticPhoto(truth, truthOrbit);
  const pixel = (point: [number, number, number]): [number, number] => {
    const projected = projectPoint(photo.camera, point);
    return [projected.x, projected.y];
  };
  const spec: PhotoFitSpec = {
    schema: 'sceliph.photo-fit-spec/0.1',
    referenceComponentId: 'box',
    viewHint: { azimuthDeg: 42, elevationDeg: 17, sigmaDeg: 20 },
    anchor: { from: pixel([-130, 130, 100]), to: pixel([130, 130, 100]), knownMm: 260 },
    knownFovXDegrees: 40,
    parameters: [
      { componentId: 'box', path: ['geometry', 'size', 1], min: 60, max: 300 },
      { componentId: 'box', path: ['geometry', 'size', 2], min: 60, max: 400 },
      { componentId: 'post', path: ['geometry', 'radiusTop'], min: 10, max: 80 },
      { componentId: 'post', path: ['geometry', 'radiusBottom'], min: 10, max: 80 },
      { componentId: 'post', path: ['position', 0], min: -150, max: 150 },
      { componentId: 'post', path: ['position', 2], min: -150, max: 150 },
    ],
  };
  const mask = (keep: (id: number) => boolean) => Uint8Array.from(photo.ids, (id) => (keep(id) ? 1 : 0));

  it('recovers the camera relative to the reference part and the declared dimensions', () => {
    const start = scene([300, 110, 260], 55, 28, 180, [30, 220, 10]);
    const before = structuredClone(start);
    const result = fitPhotoShape({
      ir: start,
      geometry: photo.geometry,
      objectMask: mask((id) => id >= 0),
      parts: [{ id: 'box', componentIds: ['box'], mask: mask((id) => id === 0) }, { id: 'post', componentIds: ['post'], mask: mask((id) => id === 1) }],
      spec,
      seed: 3,
      rasterMaxSide: 128,
      maxEvaluations: 2500,
    });
    expect(start).toEqual(before);
    expect(result.anchor.scaleCorrection).toBeCloseTo(1, 1);
    const view = result.receipt.after.views[0]!;
    expect(view.iou).toBeGreaterThan(0.95);
    expect(view.depthResidual).toBeLessThan(0.02);
    const box = result.ir.components[0]!.geometry;
    if (box.op !== 'roundedBox') throw new Error('fixture changed');
    expect(Math.abs(box.size[1] - 150) / 150).toBeLessThan(0.06);
    expect(Math.abs(box.size[2] - 200) / 200).toBeLessThan(0.06);
    const fittedCamera = orbitToPinhole(result.receipt.orbits[0]!.orbit);
    const fittedView = orbitFromLookAt(fittedCamera.position, result.ir.components[0]!.position!);
    const trueView = orbitFromLookAt(photo.camera.position, truth.components[0]!.position!);
    expect(Math.abs(fittedView.azimuthDeg - trueView.azimuthDeg)).toBeLessThan(3);
    expect(Math.abs(fittedView.elevationDeg - trueView.elevationDeg)).toBeLessThan(3);
    expect(Math.abs(fittedView.distanceMm - trueView.distanceMm) / trueView.distanceMm).toBeLessThan(0.05);
    expect(result.receipt.cameraParameters.some((item) => item.field === 'focalScale')).toBe(false);
  }, 60_000);

  it('refuses to fit the reference placement and validates inputs', () => {
    const start = scene([300, 110, 260], 55, 28, 180, [30, 220, 10]);
    const objectMask = mask((id) => id >= 0);
    const run = (override: Partial<PhotoFitSpec>, masks = objectMask) => fitPhotoShape({ ir: start, geometry: photo.geometry, objectMask: masks, parts: [], spec: { ...spec, ...override }, seed: 1, rasterMaxSide: 64, maxEvaluations: 16, restarts: 1 });
    expect(() => run({ parameters: [{ componentId: 'box', path: ['position', 1], min: 0, max: 200 }] })).toThrow(/reference component position/);
    expect(() => run({ referenceComponentId: 'nope' })).toThrow(/Reference component/);
    expect(() => run({ viewHint: { azimuthDeg: 0, elevationDeg: 85, sigmaDeg: 10 } })).toThrow(/View hint/);
    expect(() => run({}, new Uint8Array(4))).toThrow(/point-map resolution/);
  });
});
