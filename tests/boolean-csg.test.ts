import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { compileAssemblyGeometry, compileAssemblyIR, validateAssemblyIR } from '../src/engine/assembly-compiler';
import type { AssemblyGeometryIR, AssemblyIR } from '../src/engine/assembly-ir';
import { initManifold, isManifoldReady } from '../src/engine/boolean-csg';

const plate: AssemblyGeometryIR = {
  op: 'booleanCSG',
  operation: 'difference',
  operands: [
    { geometry: { op: 'roundedBox', size: [100, 10, 60], radius: 0 } },
    { geometry: { op: 'cylinder', radiusTop: 10, radiusBottom: 10, depth: 20, radialSegments: 48 }, position: [-25, 0, 0] },
    { geometry: { op: 'cylinder', radiusTop: 10, radiusBottom: 10, depth: 20, radialSegments: 48 }, position: [25, 0, 0] },
  ],
};

const assembly = (geometry: AssemblyGeometryIR): AssemblyIR => ({
  schema: 'morphloom.assembly/0.1', name: 'csg', units: 'mm',
  components: [{ id: 'part', name: 'Part', category: 'mechanical', materialName: 'steel', detail: 'boolean fixture', geometry, material: { color: '#999999' } }],
});

function volumeMm3(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  const count = index ? index.count : position.count;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let volume = 0;
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(position, index ? index.getX(i) : i);
    b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1);
    c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2);
    volume += a.dot(b.clone().cross(c)) / 6;
  }
  return volume * 1e9;
}

describe('booleanCSG through vendored Manifold', () => {
  it('refuses to compile before the runtime is loaded', () => {
    if (isManifoldReady()) return;
    expect(() => compileAssemblyGeometry(plate)).toThrow(/initManifold/);
  });

  describe('with the runtime loaded', () => {
    beforeAll(async () => {
      await initManifold();
    });

    it('drills two exact holes and keeps a closed, deterministic mesh', () => {
      const first = compileAssemblyGeometry(plate);
      const second = compileAssemblyGeometry(plate);
      try {
        const polygonArea = 0.5 * 48 * 10 * 10 * Math.sin((2 * Math.PI) / 48);
        expect(volumeMm3(first)).toBeCloseTo(100 * 10 * 60 - 2 * polygonArea * 10, 0);
        first.computeBoundingBox();
        expect(first.boundingBox!.max.x * 1000).toBeCloseTo(50, 3);
        expect(first.boundingBox!.max.y * 1000).toBeCloseTo(5, 3);
        expect(Array.from(first.getAttribute('position').array)).toEqual(Array.from(second.getAttribute('position').array));
        expect(first.userData.booleanCsg).toMatchObject({ operation: 'difference', operands: 3, genus: 2 });
      } finally {
        first.dispose();
        second.dispose();
      }
      const build = compileAssemblyIR(assembly(plate), 'beauty');
      try {
        expect(build.metrics.topology.pass).toBe(true);
        expect(build.metrics.topology.boundaryEdges).toBe(0);
      } finally {
        build.root.traverse((object) => {
          const mesh = object as THREE.Mesh;
          mesh.geometry?.dispose();
          for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) material.dispose();
        });
      }
    });

    it('unions and intersects with the expected bounds, including nesting', () => {
      const union = compileAssemblyGeometry({
        op: 'booleanCSG', operation: 'union', operands: [
          { geometry: { op: 'sphere', radius: 20 } },
          { geometry: { op: 'sphere', radius: 20 }, position: [30, 0, 0] },
        ],
      });
      const intersection = compileAssemblyGeometry({
        op: 'booleanCSG', operation: 'intersection', operands: [
          { geometry: { op: 'roundedBox', size: [40, 40, 40], radius: 0 } },
          { geometry: { op: 'booleanCSG', operation: 'union', operands: [
            { geometry: { op: 'roundedBox', size: [10, 100, 10], radius: 0 } },
            { geometry: { op: 'roundedBox', size: [100, 10, 10], radius: 0 } },
          ] } },
        ],
      });
      try {
        union.computeBoundingBox();
        expect(union.boundingBox!.min.x * 1000).toBeCloseTo(-20, 1);
        expect(union.boundingBox!.max.x * 1000).toBeCloseTo(50, 1);
        intersection.computeBoundingBox();
        const size = intersection.boundingBox!.getSize(new THREE.Vector3()).multiplyScalar(1000);
        expect([size.x, size.y, size.z].map((value) => Math.round(value))).toEqual([40, 40, 10]);
        expect(volumeMm3(intersection)).toBeCloseTo(40 * 10 * 10 + 40 * 10 * 10 - 10 * 10 * 10, 0);
      } finally {
        union.dispose();
        intersection.dispose();
      }
    });

    it('rejects unsafe or unsupported boolean declarations', () => {
      const nested = (depth: number): AssemblyGeometryIR => depth === 0
        ? { op: 'roundedBox', size: [10, 10, 10], radius: 0 }
        : { op: 'booleanCSG', operation: 'union', operands: [{ geometry: nested(depth - 1) }, { geometry: { op: 'sphere', radius: 4 } }] };
      expect(() => validateAssemblyIR(assembly(nested(2)))).not.toThrow();
      expect(() => validateAssemblyIR(assembly(nested(3)))).toThrow(/depth/);
      expect(() => validateAssemblyIR(assembly({ op: 'booleanCSG', operation: 'union', operands: [{ geometry: { op: 'sphere', radius: 4 } }] }))).toThrow(/2–8 operands/);
      expect(() => validateAssemblyIR(assembly({ op: 'booleanCSG', operation: 'xor' as 'union', operands: [{ geometry: { op: 'sphere', radius: 4 } }, { geometry: { op: 'sphere', radius: 3 } }] }))).toThrow(/operation/);
      expect(() => validateAssemblyIR(assembly({ op: 'booleanCSG', operation: 'union', operands: [
        { geometry: { op: 'sphere', radius: 4 } },
        { geometry: { op: 'implicitSurface', descriptor: {} as never } },
      ] }))).toThrow(/operand geometry/);
      expect(() => validateAssemblyIR(assembly({ op: 'booleanCSG', operation: 'union', operands: [
        { geometry: { op: 'sphere', radius: 4 } },
        { geometry: { op: 'roundedBox', size: [4, 4, 4], radius: 3 } },
      ] }))).toThrow(/operands\[1\]/);
      expect(() => validateAssemblyIR(assembly({ op: 'booleanCSG', operation: 'union', operands: [
        { geometry: { op: 'sphere', radius: 4 }, scale: [1, 0, 1] },
        { geometry: { op: 'sphere', radius: 3 } },
      ] }))).toThrow(/non-zero/);
      expect(() => compileAssemblyGeometry({ op: 'booleanCSG', operation: 'difference', operands: [
        { geometry: { op: 'sphere', radius: 4 } },
        { geometry: { op: 'sphere', radius: 9 } },
      ] })).toThrow(/empty/);
    });
  });
});
