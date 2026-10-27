import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { compileAssemblyGeometry } from '../src/engine/assembly-compiler';
import type { AssemblyIR } from '../src/engine/assembly-ir';
import { compareAssemblyToTruth } from '../src/engine/assembly-truth-compare';
import { rasterizeSilhouette, worldTriangleMesh, type PinholeCamera } from '../src/engine/mesh-silhouette-raster';
import { decidePhotoFitAcceptance, derivePhotoFitParameters, verticalExtentScale } from '../src/engine/photo-shape-fit';
import { fitAssemblySilhouette } from '../src/engine/silhouette-parameter-fit';

const part = (id: string, geometry: AssemblyIR['components'][number]['geometry'], position: [number, number, number]): AssemblyIR['components'][number] => ({
  id, name: id, category: 'mechanical', materialName: 'oak', detail: 'fixture', geometry, position, material: { color: '#886644' },
});

const table = (width: number, depth: number, legRadius: number, legHeight: number, inset = 40): AssemblyIR => ({
  schema: 'morphloom.assembly/0.1', name: 'table', units: 'mm',
  components: [
    part('top', { op: 'roundedBox', size: [width, 30, depth], radius: 3 }, [0, legHeight + 15, 0]),
    ...[[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([sx, sz], index) => part(
      `leg-${index + 1}`,
      { op: 'cylinder', radiusTop: legRadius, radiusBottom: legRadius, depth: legHeight, radialSegments: 24 },
      [sx! * (width / 2 - inset), legHeight / 2, sz! * (depth / 2 - inset)],
    )),
  ],
});

function render(ir: AssemblyIR, view: PinholeCamera): Uint8Array {
  return rasterizeSilhouette(view, ir.components.map((component) => {
    const geometry = compileAssemblyGeometry(component.geometry);
    const mesh = worldTriangleMesh(geometry, new THREE.Matrix4().makeTranslation(...(component.position ?? [0, 0, 0]).map((v) => v / 1000) as [number, number, number]));
    geometry.dispose();
    return mesh;
  }));
}

describe('derived photo-fit parameters', () => {
  it('locks the known dimension, groups identical parts and keeps straight cylinders straight', () => {
    const derived = derivePhotoFitParameters(table(600, 400, 20, 420), { referenceComponentId: 'top', knownDimensionMm: 600 });
    expect(derived.locked).toEqual([{ componentId: 'top', path: ['geometry', 'size', 0] }]);
    expect(derived.groups).toEqual([['leg-1', 'leg-2', 'leg-3', 'leg-4']]);
    const names = derived.parameters.map((parameter) => `${parameter.componentId}.${parameter.path.join('.')}`);
    expect(names).toEqual([
      'top.geometry.size.1', 'top.geometry.size.2',
      'leg-1.geometry.radiusTop', 'leg-1.geometry.depth',
      'leg-1.position.0', 'leg-1.position.1', 'leg-1.position.2',
    ]);
    const radius = derived.parameters[2]!;
    expect(radius.links).toHaveLength(3 + 4);
    expect(radius.links!.filter((link) => link.path[1] === 'radiusBottom').map((link) => link.componentId)).toEqual(['leg-1', 'leg-2', 'leg-3', 'leg-4']);
    expect(derived.parameters[4]!.links!.map((link) => link.ratio)).toEqual([-1, -1, 1]);
    expect(derived.parameters[6]!.links!.map((link) => link.ratio)).toEqual([1, -1, -1]);
    expect(radius).toMatchObject({ min: 10, max: 40 });
    expect(() => derivePhotoFitParameters(table(600, 400, 20, 420), { referenceComponentId: 'nope' })).toThrow(/Reference/);
  });

  it('fits a whole group through one linked parameter', () => {
    const truth = table(600, 400, 20, 420);
    const start = table(600, 400, 28, 420);
    const views = [
      { id: 'front', camera: { width: 120, height: 120, fx: 150, fy: 150, cx: 60, cy: 60, position: [300, 700, 1500], target: [0, 250, 0] } as PinholeCamera },
      { id: 'side', camera: { width: 120, height: 120, fx: 150, fy: 150, cx: 60, cy: 60, position: [1500, 600, 300], target: [0, 250, 0] } as PinholeCamera },
    ].map((view) => ({ ...view, target: render(truth, view.camera) }));
    const derived = derivePhotoFitParameters(start, { referenceComponentId: 'top', knownDimensionMm: 600 });
    const radius = derived.parameters.find((parameter) => parameter.path[1] === 'radiusTop')!;
    const { ir, receipt } = fitAssemblySilhouette(start, [radius], views, { seed: 3, maxEvaluations: 300, restarts: 1 });
    for (const leg of ir.components.slice(1)) {
      if (leg.geometry.op !== 'cylinder') throw new Error('fixture changed');
      expect(leg.geometry.radiusTop).toBe(leg.geometry.radiusBottom);
      expect(Math.abs(leg.geometry.radiusTop - 20)).toBeLessThan(1.5);
    }
    expect(receipt.parameters[0]!.links).toHaveLength(7);
    expect(() => fitAssemblySilhouette(start, [{ ...radius, links: [{ componentId: 'leg-2', path: ['geometry', 'radiusTop'], ratio: 2 }] }], views, { seed: 1 })).toThrow(/value × ratio/);
    expect(() => fitAssemblySilhouette(start, [radius, { componentId: 'leg-2', path: ['geometry', 'radiusTop'], min: 1, max: 50 }], views, { seed: 1 })).toThrow(/unique/);
  }, 20_000);
});

describe('assembly truth comparison', () => {
  const truth = table(600, 400, 20, 420);

  it('is exact on the truth and invariant to a quarter-turn yaw and relabelled identical parts', () => {
    expect(compareAssemblyToTruth(truth, truth, 'top').summary).toMatchObject({ medianSizeError: 0, maxSizeError: 0, maxPlacementError: 0, within5: 1 });
    const turned = structuredClone(truth);
    for (const component of turned.components) {
      const [x, y, z] = component.position!;
      component.position = [-z, y, x];
      if (component.geometry.op === 'roundedBox') component.geometry.size = [component.geometry.size[2], component.geometry.size[1], component.geometry.size[0]];
    }
    [turned.components[1]!.id, turned.components[3]!.id] = [turned.components[3]!.id, turned.components[1]!.id];
    const result = compareAssemblyToTruth(turned, truth, 'top');
    expect(result.yawDeg).not.toBe(0);
    expect(result.summary.maxSizeError).toBeLessThan(1e-6);
    expect(result.summary.maxPlacementError).toBeLessThan(1e-6);
  });

  it('reports relative errors and missing parts', () => {
    const wrong = table(600, 480, 20, 420);
    wrong.components.pop();
    const result = compareAssemblyToTruth(wrong, truth, 'top');
    expect(result.missingComponentIds).toEqual(['leg-4']);
    const depth = result.items.find((item) => item.componentId === 'top' && item.kind === 'size' && item.axis === 'z')!;
    expect(depth.relativeError).toBeCloseTo(0.2, 3);
    expect(result.summary.within5).toBeLessThan(1);
  });
});

describe('reference copies', () => {
  it('share the reference sizes, including the locked known dimension', () => {
    const shelf: AssemblyIR = {
      schema: 'morphloom.assembly/0.1', name: 'shelf', units: 'mm',
      components: [
        part('side-right', { op: 'roundedBox', size: [20, 900, 300], radius: 2 }, [390, 450, 0]),
        part('side-left', { op: 'roundedBox', size: [20, 900, 300], radius: 2 }, [-390, 450, 0]),
      ],
    };
    const derived = derivePhotoFitParameters(shelf, { referenceComponentId: 'side-left', knownDimensionMm: 900 });
    expect(derived.groups).toEqual([['side-left', 'side-right']]);
    expect(derived.locked).toEqual([{ componentId: 'side-left', path: ['geometry', 'size', 1] }]);
    expect(derived.parameters.map((parameter) => `${parameter.componentId}.${parameter.path.join('.')}`)).toEqual([
      'side-left.geometry.size.0', 'side-left.geometry.size.2', 'side-right.position.0',
    ]);
    expect(derived.aligned).toEqual([{ componentId: 'side-right', axis: 1 }, { componentId: 'side-right', axis: 2 }]);
    const free = derivePhotoFitParameters(shelf, { referenceComponentId: 'side-left', knownDimensionMm: 900, lockAligned: false });
    expect(free.parameters).toHaveLength(5);
    expect(free.aligned).toEqual([]);
    const backed = structuredClone(shelf);
    backed.components.push(part('back', { op: 'roundedBox', size: [760, 880, 6], radius: 1 }, [0, 450, -147]));
    expect(derivePhotoFitParameters(backed, { referenceComponentId: 'side-left', knownDimensionMm: 900 }).aligned).toContainEqual({ componentId: 'back', axis: 0 });
    expect(derived.parameters[0]!.links).toEqual([{ componentId: 'side-right', path: ['geometry', 'size', 0], ratio: 1 }]);
  });
});

describe('sensitivity gate', () => {
  it('freezes a parameter the views cannot see and still fits the visible ones', () => {
    const truth = table(600, 400, 20, 420);
    const start = table(600, 400, 28, 420);
    start.components.push(part('hidden', { op: 'roundedBox', size: [100, 10, 100], radius: 1 }, [0, 435, 0]));
    const truthWithHidden = structuredClone(truth);
    truthWithHidden.components.push(part('hidden', { op: 'roundedBox', size: [100, 10, 100], radius: 1 }, [0, 435, 0]));
    const camera = { width: 120, height: 120, fx: 150, fy: 150, cx: 60, cy: 60, position: [300, 700, 1500], target: [0, 250, 0] } as PinholeCamera;
    const views = [{ id: 'front', camera, target: render(truthWithHidden, camera) }];
    const derived = derivePhotoFitParameters(start, { referenceComponentId: 'top', knownDimensionMm: 600 });
    const radius = derived.parameters.find((parameter) => parameter.path[1] === 'radiusTop')!;
    const hidden = { componentId: 'hidden', path: ['geometry', 'size', 0], min: 50, max: 200 };
    const { ir, receipt } = fitAssemblySilhouette(start, [radius, hidden], views, { seed: 3, maxEvaluations: 200, restarts: 1, sensitivityGate: { step: 0.05, minLossChange: 1e-4 } });
    const [radiusReport, hiddenReport] = receipt.parameters;
    expect(hiddenReport).toMatchObject({ frozen: true, identified: false, after: 100, sensitivity: 0 });
    expect(radiusReport!.frozen).toBe(false);
    expect(radiusReport!.sensitivity).toBeGreaterThan(1e-4);
    expect(ir.components.find((component) => component.id === 'hidden')!.geometry).toMatchObject({ size: [100, 10, 100] });
    expect(() => fitAssemblySilhouette(start, [radius], views, { seed: 1, sensitivityGate: { step: 0, minLossChange: 0 } })).toThrow(/Sensitivity gate/);
  }, 20_000);
});

describe('photo fit acceptance', () => {
  const result = (cameraOnlyLoss: number, afterLoss: number, iou: number) => ({
    cameraOnly: { loss: cameraOnlyLoss, view: { id: 'photo', iou: 0.9, meanBoundaryDistancePx: 1 } },
    receipt: { after: { loss: afterLoss, views: [{ id: 'photo', iou, meanBoundaryDistancePx: 0.5 }] }, parameters: [{ frozen: false }, { frozen: false }, { frozen: true }] },
  }) as unknown as Parameters<typeof decidePhotoFitAcceptance>[0];
  const gate = { minRelativeLossGain: 0.3, minRelativeLossGainPerParameter: 0.2, minIou: 0.9 };

  it('keeps the written IR when the shape barely improves on the camera-only fit', () => {
    expect(decidePhotoFitAcceptance(result(0.1, 0.09, 0.97), gate)).toMatchObject({ accept: false });
    expect(decidePhotoFitAcceptance(result(0.1, 0.05, 0.97), gate)).toMatchObject({ accept: true, freeParameters: 2, reasons: [] });
    expect(decidePhotoFitAcceptance(result(0.1, 0.065, 0.97), gate).reasons).toEqual([expect.stringMatching(/2 free parameters removed 17\.5% each/)]);
  });

  it('rejects a fit that still misses the silhouette', () => {
    const decision = decidePhotoFitAcceptance(result(0.4, 0.1, 0.63), gate);
    expect(decision.accept).toBe(false);
    expect(decision.reasons).toHaveLength(1);
    expect(decision.relativeLossGain).toBeCloseTo(0.75, 6);
  });
});

describe('extent prior and gated parameter budget', () => {
  const camera = { width: 120, height: 120, fx: 150, fy: 150, cx: 60, cy: 60, position: [300, 700, 1500], target: [0, 250, 0] } as PinholeCamera;

  it('holds the assembly at a known height against the silhouette', () => {
    const post = (depth: number): AssemblyIR => ({ schema: 'morphloom.assembly/0.1', name: 'post', units: 'mm', components: [part('post', { op: 'cylinder', radiusTop: 40, radiusBottom: 40, depth, radialSegments: 24 }, [0, 250, 0])] });
    const views = [{ id: 'front', camera, target: render(post(420), camera) }];
    const depth = { componentId: 'post', path: ['geometry', 'depth'], min: 200, max: 800 };
    const free = fitAssemblySilhouette(post(520), [depth], views, { seed: 2, maxEvaluations: 300, restarts: 1 });
    const held = fitAssemblySilhouette(post(520), [depth], views, { seed: 2, maxEvaluations: 300, restarts: 1, extentPriors: [{ axis: 1, targetMm: 520, sigmaMm: 2 }] });
    expect(Math.abs(free.receipt.parameters[0]!.after - 420)).toBeLessThan(10);
    expect(Math.abs(held.receipt.parameters[0]!.after - 520)).toBeLessThan(10);
    expect(() => fitAssemblySilhouette(post(520), [depth], views, { seed: 2, extentPriors: [{ axis: 1, targetMm: -1, sigmaMm: 1 }] })).toThrow(/Extent priors/);
  }, 20_000);

  it('keeps only the most sensitive parameters when more than the budget pass the gate', () => {
    const ir = table(600, 400, 20, 420);
    for (let k = 0; k < 30; k += 1) ir.components.push(part(`peg-${k}`, { op: 'roundedBox', size: [10, 10, 10], radius: 1 }, [-280 + k * 19, 460, 0]));
    const views = [{ id: 'front', camera, target: render(ir, camera) }];
    const parameters = ir.components.map((component) => ({ componentId: component.id, path: ['position', 1], min: component.position![1] - 50, max: component.position![1] + 50 }));
    expect(() => fitAssemblySilhouette(ir, parameters, views, { seed: 1, maxEvaluations: 50, restarts: 1 })).toThrow(/at most 32/);
    const { receipt } = fitAssemblySilhouette(ir, parameters, views, { seed: 1, maxEvaluations: 50, restarts: 1, sensitivityGate: { step: 0.05, minLossChange: 0 } });
    const active = receipt.parameters.filter((parameter) => !parameter.frozen);
    expect(active).toHaveLength(32);
    const weakestActive = Math.min(...active.map((parameter) => parameter.sensitivity!));
    expect(receipt.parameters.filter((parameter) => parameter.frozen).every((parameter) => parameter.sensitivity! <= weakestActive)).toBe(true);
  }, 20_000);
});

describe('vertical extent scale', () => {
  it('reads the object height from the masked point rows, ignoring outliers', () => {
    const n = 1000;
    const points = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) points[i * 3 + 1] = i / (n - 1) * 0.5;
    points[3 * 999 + 1] = 40;
    const geometry = { width: n, height: 1, points, validMask: new Uint8Array(n).fill(1) } as unknown as Parameters<typeof verticalExtentScale>[0];
    const result = verticalExtentScale(geometry, new Uint8Array(n).fill(1), 960);
    expect(result.estimatedMm).toBeCloseTo(480, 0);
    expect(result.scaleCorrection).toBeCloseTo(2, 2);
    expect(() => verticalExtentScale(geometry, new Uint8Array(n), 960)).toThrow(/too few/);
  });
});
