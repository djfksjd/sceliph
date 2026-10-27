import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { compileAssemblyGeometry } from '../src/engine/assembly-compiler';
import type { AssemblyIR } from '../src/engine/assembly-ir';
import { projectPoint, rasterizeIdBuffer, worldTriangleMesh } from '../src/engine/mesh-silhouette-raster';
import { initialOrbitFromPointMap, orbitBasis, orbitFromLookAt, orbitToPinhole, type OrbitCamera } from '../src/engine/orbit-camera';
import { fitAssemblySilhouette } from '../src/engine/silhouette-parameter-fit';

const scene = (box: [number, number, number], radius: number, depth: number, post: [number, number, number]): AssemblyIR => ({
  schema: 'morphloom.assembly/0.1',
  name: 'camera-fit-fixture',
  units: 'mm',
  components: [
    { id: 'box', name: 'Box', category: 'enclosure', materialName: 'wood', detail: 'fixture', geometry: { op: 'roundedBox', size: box, radius: 1 }, position: [0, box[1] / 2, 0], material: { color: '#884422' } },
    { id: 'post', name: 'Post', category: 'mechanical', materialName: 'steel', detail: 'fixture', geometry: { op: 'cylinder', radiusTop: radius, radiusBottom: radius, depth }, position: post, material: { color: '#335599' } },
  ],
});

function meshes(ir: AssemblyIR) {
  return ir.components.map((component) => {
    const geometry = compileAssemblyGeometry(component.geometry);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...(component.position ?? [0, 0, 0]).map((v) => v / 1000) as [number, number, number]),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 1, 1),
    );
    const mesh = worldTriangleMesh(geometry, matrix);
    geometry.dispose();
    return mesh;
  });
}

const baseOrbit = (overrides: Partial<OrbitCamera>): OrbitCamera => ({
  width: 160, height: 120, fx: 220, fy: 220, cx: 80, cy: 60,
  target: [0, 100, 0], azimuthDeg: 30, elevationDeg: 25, distanceMm: 900, rollDeg: 0, focalScale: 1,
  ...overrides,
});

describe('orbit camera', () => {
  it('matches the documented axes and inverts look-at', () => {
    const front = orbitToPinhole(baseOrbit({ azimuthDeg: 0, elevationDeg: 0, target: [0, 0, 0], distanceMm: 500 }));
    expect(front.position[2]).toBeCloseTo(500, 9);
    expect(projectPoint(front, [10, 0, 0]).x).toBeGreaterThan(80);
    expect(projectPoint(front, [0, 10, 0]).y).toBeLessThan(60);
    const orbit = baseOrbit({ azimuthDeg: -47, elevationDeg: 33, distanceMm: 812 });
    const camera = orbitToPinhole(orbit);
    const recovered = orbitFromLookAt(camera.position, orbit.target);
    expect(recovered.azimuthDeg).toBeCloseTo(-47, 9);
    expect(recovered.elevationDeg).toBeCloseTo(33, 9);
    expect(recovered.distanceMm).toBeCloseTo(812, 9);
    const rolled = orbitToPinhole({ ...orbit, rollDeg: 90 });
    const unrolled = projectPoint(camera, [50, 100, 0]);
    const turned = projectPoint(rolled, [50, 100, 0]);
    expect(Math.hypot(turned.x - 80, turned.y - 60)).toBeCloseTo(Math.hypot(unrolled.x - 80, unrolled.y - 60), 6);
    expect(() => orbitBasis(0, 90)).toThrow(/elevation/);
  });

  it('initialises the true camera from an exact point map and true orientation hint', () => {
    const truth = baseOrbit({ target: [12, 90, -8] });
    const camera = orbitToPinhole(truth);
    const { right, down, forward } = orbitBasis(truth.azimuthDeg, truth.elevationDeg, 0);
    const width = 40;
    const height = 30;
    const points = new Float32Array(width * height * 3);
    const objectMask = new Uint8Array(width * height);
    const reference: [number, number, number] = [5, 80, 3];
    // A small cloud around the reference point, expressed in camera metres.
    for (let i = 0; i < width * height; i += 1) {
      const world: [number, number, number] = [reference[0] + ((i % 7) - 3), reference[1] + ((i % 5) - 2), reference[2] + ((i % 3) - 1)];
      const rel = [world[0] - camera.position[0], world[1] - camera.position[1], world[2] - camera.position[2]];
      points[i * 3] = (rel[0]! * right[0] + rel[1]! * right[1] + rel[2]! * right[2]) / 1000;
      points[i * 3 + 1] = (rel[0]! * down[0] + rel[1]! * down[1] + rel[2]! * down[2]) / 1000;
      points[i * 3 + 2] = (rel[0]! * forward[0] + rel[1]! * forward[1] + rel[2]! * forward[2]) / 1000;
      objectMask[i] = 1;
    }
    const init = initialOrbitFromPointMap({
      points, validMask: new Uint8Array(width * height).fill(1), objectMask, width, height, millimetresPerUnit: 1000,
      intrinsics: { fx: 220 / 160, fy: 220 / 120, cx: 0.5, cy: 0.5 }, hint: { azimuthDeg: truth.azimuthDeg, elevationDeg: truth.elevationDeg },
      worldReferenceMm: reference, raster: { width: 160, height: 120 },
    });
    const position = orbitToPinhole(init.orbit).position;
    position.forEach((value, axis) => expect(value).toBeCloseTo(camera.position[axis]!, 2));
    expect(init.orbit.fx).toBeCloseTo(220, 9);
  });
});

describe('occlusion-aware id buffer', () => {
  it('keeps the nearer component and exposes only visible regions', () => {
    const ir = scene([300, 150, 200], 40, 180, [0, 75, -200]);
    const camera = orbitToPinhole(baseOrbit({ azimuthDeg: 0, elevationDeg: 5 }));
    const ids = rasterizeIdBuffer(camera, meshes(ir));
    const counts = [0, 0];
    ids.forEach((id) => { if (id >= 0) counts[id]! += 1; });
    expect(counts[0]).toBeGreaterThan(1000);
    expect(counts[1]).toBeGreaterThan(20);
    const behind = rasterizeIdBuffer(camera, meshes({ ...ir, components: [ir.components[1]!] }));
    const postAlone = behind.reduce((sum, id) => sum + (id === 0 ? 1 : 0), 0);
    expect(counts[1]).toBeLessThan(postAlone);
  });
});

describe('joint camera and shape fit', () => {
  it('recovers a perturbed camera and unknown dimensions with one fixed known dimension', () => {
    const truthIr = scene([300, 150, 200], 40, 180, [60, 240, -20]);
    const truthOrbit = baseOrbit({});
    const ids = rasterizeIdBuffer(orbitToPinhole(truthOrbit), meshes(truthIr));
    const mask = (keep: (id: number) => boolean) => Uint8Array.from(ids, (id) => (keep(id) ? 1 : 0));
    const start = scene([300, 110, 260], 28, 130, [40, 200, 0]);
    start.components[0]!.position = [0, 55, 0];
    const startOrbit = baseOrbit({ azimuthDeg: 42, elevationDeg: 17, distanceMm: 1030, target: [30, 70, 20], focalScale: 1 });
    const { ir, receipt } = fitAssemblySilhouette(start, [
      { componentId: 'box', path: ['geometry', 'size', 1], min: 60, max: 300 },
      { componentId: 'box', path: ['geometry', 'size', 2], min: 60, max: 400 },
      { componentId: 'post', path: ['geometry', 'radiusTop'], min: 10, max: 80 },
      { componentId: 'post', path: ['geometry', 'radiusBottom'], min: 10, max: 80 },
      { componentId: 'post', path: ['geometry', 'depth'], min: 60, max: 300 },
      { componentId: 'post', path: ['position', 0], min: -150, max: 150 },
      { componentId: 'post', path: ['position', 1], min: 100, max: 400 },
      { componentId: 'post', path: ['position', 2], min: -100, max: 100 },
    ], [{
      id: 'photo', orbit: startOrbit, target: mask((id) => id >= 0),
      parts: [{ id: 'box', componentIds: ['box'], mask: mask((id) => id === 0) }, { id: 'post', componentIds: ['post'], mask: mask((id) => id === 1) }],
    }], {
      seed: 5,
      maxEvaluations: 6000,
      restarts: 2,
      cameraParameters: [
        { viewId: 'photo', field: 'azimuthDeg', min: 0, max: 60, prior: { mean: 42, sigma: 20 } },
        { viewId: 'photo', field: 'elevationDeg', min: 0, max: 50, prior: { mean: 17, sigma: 15 } },
        { viewId: 'photo', field: 'distanceMm', min: 500, max: 1600, prior: { mean: 1030, sigma: 300 } },
        { viewId: 'photo', field: 'targetX', min: -150, max: 150 },
        { viewId: 'photo', field: 'targetY', min: -50, max: 250 },
        { viewId: 'photo', field: 'targetZ', min: -150, max: 150 },
      ],
    });
    expect(receipt.after.views[0]!.iou).toBeGreaterThan(0.97);
    receipt.after.views[0]!.parts!.forEach((part) => expect(part.iou).toBeGreaterThan(0.9));
    const fitted = Object.fromEntries(receipt.cameraParameters.map((item) => [item.field, item.after]));
    expect(Math.abs(fitted.azimuthDeg! - 30)).toBeLessThan(3);
    expect(Math.abs(fitted.elevationDeg! - 25)).toBeLessThan(3);
    // Object placement and camera share a translation gauge, so compare the
    // camera position relative to the (fixed-position) reference box centre.
    const box = ir.components[0]!.geometry;
    if (box.op !== 'roundedBox') throw new Error('fixture changed');
    const relative = (cameraPosition: number[], boxCentre: number[]) => cameraPosition.map((value, axis) => value - boxCentre[axis]!);
    const fittedRelative = relative(orbitToPinhole(receipt.orbits[0]!.orbit).position, ir.components[0]!.position!);
    const trueRelative = relative(orbitToPinhole(truthOrbit).position, truthIr.components[0]!.position!);
    expect(Math.hypot(...fittedRelative.map((value, axis) => value - trueRelative[axis]!) as [number, number, number])).toBeLessThan(40);
    expect(Math.abs(box.size[1] - 150) / 150).toBeLessThan(0.06);
    expect(Math.abs(box.size[2] - 200) / 200).toBeLessThan(0.06);
    const postTopAboveBox = ir.components[1]!.position![1] + (ir.components[1]!.geometry as { depth: number }).depth / 2 - (ir.components[0]!.position![1] + box.size[1] / 2);
    expect(Math.abs(postTopAboveBox - 180)).toBeLessThan(8);
    expect(start.components[0]!.geometry).toEqual({ op: 'roundedBox', size: [300, 110, 260], radius: 1 });
  }, 60_000);

  it('rejects camera parameters on fixed-camera views and bad priors', () => {
    const ir = scene([300, 150, 200], 40, 180, [60, 240, -20]);
    const camera = orbitToPinhole(baseOrbit({}));
    const target = Uint8Array.from(rasterizeIdBuffer(camera, meshes(ir)), (id) => (id >= 0 ? 1 : 0));
    const parameter = { componentId: 'box', path: ['geometry', 'size', 1], min: 60, max: 300 };
    expect(() => fitAssemblySilhouette(ir, [parameter], [{ id: 'v', camera, target }], { seed: 1, cameraParameters: [{ viewId: 'v', field: 'azimuthDeg', min: 0, max: 60 }] })).toThrow(/orbit view/);
    expect(() => fitAssemblySilhouette(ir, [parameter], [{ id: 'v', orbit: baseOrbit({}), target }], { seed: 1, cameraParameters: [{ viewId: 'v', field: 'azimuthDeg', min: 0, max: 60, prior: { mean: 30, sigma: 0 } }] })).toThrow(/prior/);
    expect(() => fitAssemblySilhouette(ir, [parameter], [{ id: 'v', camera, orbit: baseOrbit({}), target }], { seed: 1 })).toThrow(/exactly one/);
    expect(() => fitAssemblySilhouette(ir, [parameter], [{ id: 'v', camera, target, parts: [{ id: 'p', componentIds: ['nope'], mask: target }] }], { seed: 1 })).toThrow(/unknown component/);
  });
});
