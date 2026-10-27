import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { compileAssemblyGeometry } from '../src/engine/assembly-compiler';
import type { AssemblyIR } from '../src/engine/assembly-ir';
import { projectPoint, rasterizeSilhouette, worldTriangleMesh, type PinholeCamera } from '../src/engine/mesh-silhouette-raster';
import { fitAssemblySilhouette } from '../src/engine/silhouette-parameter-fit';

const camera = (position: [number, number, number], size = 96): PinholeCamera => ({
  width: size, height: size, fx: size * 1.6, fy: size * 1.6, cx: size / 2, cy: size / 2, position, target: [0, 0, 0],
});

const product = (box: [number, number, number], radius: number, depth: number): AssemblyIR => ({
  schema: 'morphloom.assembly/0.1',
  name: 'fit-fixture',
  units: 'mm',
  components: [
    {
      id: 'body', name: 'Body', category: 'enclosure', materialName: 'abs', detail: 'fixture',
      geometry: { op: 'roundedBox', size: box, radius: 1 },
      material: { color: '#888888' },
    },
    {
      id: 'post', name: 'Post', category: 'mechanical', materialName: 'steel', detail: 'fixture',
      geometry: { op: 'cylinder', radiusTop: radius, radiusBottom: radius, depth },
      position: [0, box[1] / 2 + depth / 2, 0],
      material: { color: '#cccccc' },
    },
  ],
});

function render(ir: AssemblyIR, view: PinholeCamera): Uint8Array {
  const meshes = ir.components.map((component) => {
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
  return rasterizeSilhouette(view, meshes);
}

describe('mesh silhouette raster', () => {
  it('projects with OpenCV axes and covers the analytic box area', () => {
    const view = camera([0, 0, 200]);
    const centre = projectPoint(view, [0, 0, 0]);
    expect(centre.x).toBeCloseTo(48, 9);
    expect(centre.depth).toBeCloseTo(200, 9);
    expect(projectPoint(view, [10, 0, 0]).x).toBeGreaterThan(48);
    expect(projectPoint(view, [0, 10, 0]).y).toBeLessThan(48);
    const ir: AssemblyIR = { ...product([40, 20, 10], 1, 1), components: [product([40, 20, 10], 1, 1).components[0]!] };
    const mask = render(ir, view);
    const covered = mask.reduce((sum, value) => sum + value, 0);
    const scale = 96 * 1.6 / (200 - 5);
    const analytic = 40 * scale * 20 * scale;
    expect(Math.abs(covered - analytic) / analytic).toBeLessThan(0.08);
  });

  it('rejects geometry behind the camera instead of clipping it', () => {
    const view = camera([0, 0, 3]);
    expect(() => render(product([40, 20, 10], 3, 8), view)).toThrow(/near plane/);
  });
});

describe('render-and-compare parameter fit', () => {
  const truth = product([42, 18, 26], 4.5, 30);
  const views = [camera([0, 40, 260], 160), camera([260, 40, 0], 160)].map((view, i) => ({ id: `v${i}`, camera: view, target: render(truth, view) }));
  const parameters = [
    { componentId: 'body', path: ['geometry', 'size', 0], min: 10, max: 80 },
    { componentId: 'body', path: ['geometry', 'size', 2], min: 10, max: 80 },
    { componentId: 'post', path: ['geometry', 'radiusTop'], min: 1, max: 12 },
    { componentId: 'post', path: ['geometry', 'radiusBottom'], min: 1, max: 12 },
    { componentId: 'post', path: ['geometry', 'depth'], min: 5, max: 60 },
    { componentId: 'post', path: ['position', 1], min: 0, max: 80 },
  ];

  it('recovers visible dimensions and flags occluded ones as unidentified', () => {
    const start = product([30, 18, 34], 3, 40);
    const original = structuredClone(start);
    const { ir, receipt } = fitAssemblySilhouette(start, parameters, views, { seed: 11, maxEvaluations: 1500 });
    expect(start).toEqual(original);
    expect(receipt.provenance).toBe('inferred');
    expect(receipt.restarts).toBe(3);
    expect(receipt.after.loss).toBeLessThan(receipt.before.loss);
    receipt.after.views.forEach((view) => expect(view.iou).toBeGreaterThan(0.97));
    const body = ir.components[0]!.geometry;
    const post = ir.components[1]!.geometry;
    if (body.op !== 'roundedBox' || post.op !== 'cylinder') throw new Error('fixture changed');
    expect(Math.abs(body.size[0] - 42) / 42).toBeLessThan(0.03);
    expect(Math.abs(body.size[2] - 26) / 26).toBeLessThan(0.03);
    const byPath = (path: string) => receipt.parameters.find((item) => `${item.componentId}.${item.path.join('.')}` === path)!;
    expect(byPath('body.geometry.size.0').identified).toBe(true);
    expect(byPath('body.geometry.size.2').identified).toBe(true);
    // The post's top edge is visible, so its top height is recovered...
    expect(Math.abs(ir.components[1]!.position![1] + post.depth / 2 - 39)).toBeLessThan(1);
    // ...but the bottom is hidden inside the body: depth and height are not determined.
    expect(byPath('post.geometry.depth').identified).toBe(false);
    expect(byPath('post.position.1').identified).toBe(false);
    const again = fitAssemblySilhouette(start, parameters, views, { seed: 11, maxEvaluations: 1500 });
    expect(again.receipt).toEqual(receipt);
  }, 20_000);

  it('rejects unsafe parameter declarations', () => {
    const start = product([30, 18, 34], 3, 40);
    expect(() => fitAssemblySilhouette(start, [{ componentId: 'nope', path: ['geometry', 'size', 0], min: 1, max: 2 }], views, { seed: 1 })).toThrow(/does not exist/);
    expect(() => fitAssemblySilhouette(start, [{ componentId: 'body', path: ['geometry', 'op'], min: 1, max: 2 }], views, { seed: 1 })).toThrow(/existing number/);
    expect(() => fitAssemblySilhouette(start, [{ componentId: 'body', path: ['geometry', 'size', 0], min: 40, max: 50 }], views, { seed: 1 })).toThrow(/outside its bounds/);
    expect(() => fitAssemblySilhouette(start, [parameters[0]!, parameters[0]!], views, { seed: 1 })).toThrow(/unique/);
    expect(() => fitAssemblySilhouette(start, [parameters[0]!], [{ ...views[0]!, target: new Uint8Array(4) }], { seed: 1 })).toThrow(/does not match/);
    expect(() => fitAssemblySilhouette(start, [parameters[0]!], views, { seed: 1, restarts: 0 })).toThrow(/restarts/);
  });
});
