import {expect, it} from 'vitest';
import {Mesh, Vector3} from 'three';
import {generateBeveledPlateProject, qualityBeveledPlatePack} from '../src/engine/plate-bevel';
import {exportSelectedScene} from '../src/engine/element-renderer';
import {analyzeTopology} from '../src/engine/topology';
import {inspectUvQuality} from '../src/engine/uv-quality';
import {improveExtrudeCapDiagonals} from '../src/engine/extrude-cap-diagonals';
import {validatePartGeometry} from '../src/engine/part-geometry';
import {validateProject, editPart} from '../src/engine/element-project';
import {compileAssemblyGeometry} from '../src/engine/assembly-compiler';

const input = {widthMm: 24, heightMm: 14, thicknessMm: 5, boreDiameterMm: 4, edgeBevelMm: .6};
it('repairs real near-tangent cap slivers at three scales without moving a boundary or changing wall attributes', async () => {
  for (const scale of [.5, 1, 2]) {
    const dimensions = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v * scale]));
    const old = exportSelectedScene(generateBeveledPlateProject(dimensions), ['plate_body']);
    const next = exportSelectedScene(qualityBeveledPlatePack.generate(dimensions), ['plate_body']);
    try {
      expect(analyzeTopology(old.root).degenerateTriangles).toBe(2); // Preserve the original failure oracle.
      const topology = analyzeTopology(next.root);
      expect(topology.pass).toBe(true);
      expect([topology.boundaryEdges, topology.nonManifoldEdges, topology.degenerateTriangles, topology.selfIntersections]).toEqual([0, 0, 0, 0]);
      expect(topology.triangles).toBe(analyzeTopology(old.root).triangles);
      expect((await inspectUvQuality(next.root)).integrityPass).toBe(true);
      const a = (old.root.getObjectByName('plate_body') as Mesh).geometry;
      const b = (next.root.getObjectByName('plate_body') as Mesh).geometry;
      expect(b.groups).toEqual(a.groups);
      for (const group of a.groups.filter(g => g.materialIndex === 1)) for (const name of Object.keys(a.attributes)) {
        const attr = a.getAttribute(name), newer = b.getAttribute(name);
        expect(Array.from(newer.array.slice(group.start * attr.itemSize, (group.start + group.count) * attr.itemSize)))
          .toEqual(Array.from(attr.array.slice(group.start * attr.itemSize, (group.start + group.count) * attr.itemSize)));
      }
      const corners = (g: typeof a) => {const p = g.getAttribute('position'); return [...new Set(Array.from({length: p.count}, (_, i) => [p.getX(i), p.getY(i), p.getZ(i)].join(',')))].sort();};
      expect(corners(b)).toEqual(corners(a));
      const surfaceArea = (g: typeof a) => {
        const p = g.getAttribute('position'); let area = 0;
        for (let i = 0; i < p.count; i += 3) {
          const v = [0, 1, 2].map(j => new Vector3().fromBufferAttribute(p, i + j));
          area += v[1].sub(v[0]).cross(v[2].sub(v[0])).length() / 2;
        }
        return area;
      };
      expect(surfaceArea(b)).toBeCloseTo(surfaceArea(a), 12);
      const unchanged = new Uint8Array(b.getAttribute('position').array.buffer).slice();
      expect(improveExtrudeCapDiagonals(b)).toBe(0);
      expect(new Uint8Array(b.getAttribute('position').array.buffer)).toEqual(unchanged);
    } finally {old.dispose(); next.dispose();}
  }
});

it('keeps an already passing legacy mesh byte-exact and rejects unknown policy values', () => {
  const good = {...input, widthMm: 32};
  const old = exportSelectedScene(generateBeveledPlateProject(good), ['plate_body']);
  const next = exportSelectedScene(qualityBeveledPlatePack.generate(good), ['plate_body']);
  try {
    const a = (old.root.getObjectByName('plate_body') as Mesh).geometry, b = (next.root.getObjectByName('plate_body') as Mesh).geometry;
    for (const name of Object.keys(a.attributes)) expect(b.getAttribute(name).array).toEqual(a.getAttribute(name).array);
  } finally {old.dispose(); next.dispose();}
  const geometry = generateBeveledPlateProject(good).parts[0].geometry;
  expect(() => validatePartGeometry({...geometry, capTriangulation: 'skip-gates'})).toThrow();
});

it('keeps the opt-in field within the declared native 0.6+ schemas on import and edit', () => {
  const current = qualityBeveledPlatePack.generate(input);
  expect(validateProject(current).parts[0].geometry).toEqual(current.parts[0].geometry);
  const legacy = {...generateBeveledPlateProject(input), schema: 'morphloom.elements/0.5' as const};
  expect(validateProject(legacy).schema).toBe('morphloom.elements/0.5');
  expect(() => validateProject({...current, schema: 'morphloom.elements/0.5'})).toThrow();
  expect(() => editPart(legacy, 'plate_body', {geometry: current.parts[0].geometry})).toThrow();
  const geometry = compileAssemblyGeometry(current.parts[0].geometry!);
  try {expect(analyzeTopology(new Mesh(geometry)).pass).toBe(true);} finally {geometry.dispose();}
});
