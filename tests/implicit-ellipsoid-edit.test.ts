import { expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createBirdPrimaryStudy } from '../src/engine/bird-primary-study';
import { editImplicitEllipsoidRadii } from '../src/engine/implicit-ellipsoid-edit';
import { compileAssemblyGeometry, compileAssemblyIR } from '../src/engine/assembly-compiler';
import { analyzeTopology } from '../src/engine/topology';
import type { AssemblyIR } from '../src/engine/assembly-ir';

it('compiles a closed connected organic core and a bounded primary-form assembly', () => {
  const ir = createBirdPrimaryStudy(), build = compileAssemblyIR(ir, 'clay');
  expect(analyzeTopology(build.root)).toMatchObject({ pass: true, boundaryEdges: 0, nonManifoldEdges: 0, degenerateTriangles: 0 });
  expect(build.metrics.triangles).toBeLessThan(50_000);
  const core = build.root.getObjectByName('organic_core') as Mesh;
  // Weld only positions, then inspect adjacency; watertight alone permits separate islands.
  const positions = core.geometry.clone();
  for (const key of Object.keys(positions.attributes)) if (key !== 'position') positions.deleteAttribute(key);
  const welded = mergeVertices(positions, 1e-6), indices = welded.index!.array;
  const parent = Array.from({ length: welded.getAttribute('position').count }, (_, i) => i);
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]));
  for (let i = 0; i < indices.length; i += 3) { parent[find(indices[i + 1])] = find(indices[i]); parent[find(indices[i + 2])] = find(indices[i]); }
  expect(new Set(parent.map((_, i) => find(i))).size).toBe(1);
  positions.dispose(); welded.dispose();
  const geometry = compileAssemblyGeometry(ir.components[0].geometry), material = new MeshBasicMaterial({ side: DoubleSide });
  const localCore = new Mesh(geometry, material);
  // IR uses mm, compiler output uses glTF metres.
  for (const side of [-1, 1]) expect(new Raycaster(new Vector3(side * .012, .059, -.005), new Vector3(1, 0, 0)).intersectObject(localCore).length % 2).toBe(1);
  geometry.dispose(); material.dispose();
  build.root.traverse(o => { if (o instanceof Mesh) { o.geometry.dispose(); const materials = Array.isArray(o.material) ? o.material : [o.material]; materials.forEach(m => m.dispose()); } });
});

it('edits absolute radii, preserves non-target source and supports reopen/no-op/repeat generation', () => {
  for (const radii of [[19, 20, 22], [22, 22, 26]] as [number, number, number][]) {
    const ir = createBirdPrimaryStudy(), before = structuredClone(ir), next = editImplicitEllipsoidRadii(ir, 'organic_core', 'head', radii);
    expect(ir).toEqual(before);
    expect(next.components.slice(1)).toEqual(ir.components.slice(1));
    const g = next.components[0].geometry;
    if (g.op !== 'implicitSurface') throw Error();
    expect(g.descriptor.primitives.slice(0, 2)).toEqual((ir.components[0].geometry as typeof g).descriptor.primitives.slice(0, 2));
    const reopened = JSON.parse(JSON.stringify(next));
    expect(editImplicitEllipsoidRadii(reopened, 'organic_core', 'head', radii)).toBe(reopened);
    const a = compileAssemblyGeometry(g), b = compileAssemblyGeometry(reopened.components[0].geometry);
    for (const key of ['position', 'normal', 'uv']) expect(a.getAttribute(key).array).toEqual(b.getAttribute(key).array);
    // Implicit compilation expands triangles for UVs; null index is the actual contract.
    expect(a.index?.array ?? null).toEqual(b.index?.array ?? null);
    a.dispose(); b.dispose();
  }
});

it('works on a different ellipsoid source with a legacy radius tuple', () => {
  const ir: AssemblyIR = { schema: 'morphloom.assembly/0.1', name: 'Lobe', units: 'mm', components: [{ id: 'lobe', name: 'Lobe', category: 'mechanical', materialName: 'raw', detail: 'Authored', material: { color: '#999999', surface: 'raw' }, geometry: { op: 'implicitSurface', descriptor: { bounds: { min: [-40, -40, -40], max: [40, 40, 40] }, resolution: 24, triangleBudget: 5000, primitives: [{ id: 'legacy', type: 'ellipsoid', radius: [15, 20, 25] }] } } }] };
  const next = editImplicitEllipsoidRadii(ir, 'lobe', 'legacy', [18, 20, 25]);
  const g = next.components[0].geometry;
  if (g.op !== 'implicitSurface') throw Error();
  expect(g.descriptor.primitives[0]).toMatchObject({ radii: [18, 20, 25] });
  expect(g.descriptor.primitives[0].radius).toBeUndefined();
});

it('rejects unsafe inputs, clipped bounds, unsupported targets/mappings and frozen contracts atomically', () => {
  const ir = createBirdPrimaryStudy(), before = structuredClone(ir);
  for (const radii of [[0, 20, 20], [NaN, 20, 20], [Infinity, 20, 20], [100, 100, 100]] as [number, number, number][])
    expect(() => editImplicitEllipsoidRadii(ir, 'organic_core', 'head', radii)).toThrow();
  expect(() => editImplicitEllipsoidRadii(ir, 'missing', 'head', [20, 20, 20])).toThrow(/missing/);
  expect(() => editImplicitEllipsoidRadii(ir, 'organic_core', 'missing', [20, 20, 20])).toThrow(/ellipsoid/);
  const mapped = structuredClone(ir); mapped.components[0].material.surface = 'rubber';
  expect(() => editImplicitEllipsoidRadii(mapped, 'organic_core', 'head', [20, 20, 20])).toThrow(/mapping/);
  const frozen = { ...ir, dimensionContracts: [{}] } as AssemblyIR;
  expect(() => editImplicitEllipsoidRadii(frozen, 'organic_core', 'head', [20, 20, 20])).toThrow();
  expect(ir).toEqual(before);
});
