import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { compileAssemblyIR, validateAssemblyIR } from '../src/engine/assembly-compiler';
import type { AssemblyIR } from '../src/engine/assembly-ir';

const ir = (albedoVariation?: number): AssemblyIR => ({
  schema: 'morphloom.assembly/0.1', name: 'Board', units: 'mm',
  components: [{ id: 'board', name: 'Board', category: 'mechanical', materialName: 'oak board', detail: 'board', geometry: { op: 'roundedBox', size: [600, 20, 300], radius: 2 }, position: [0, 10, 0], material: { color: '#a0703c', surface: 'wood', ...(albedoVariation === undefined ? {} : { albedoVariation }) } }],
} as AssemblyIR);

const material = (source: AssemblyIR) => {
  let found: THREE.MeshPhysicalMaterial | undefined;
  compileAssemblyIR(source, 'beauty').root.traverse((object) => {
    if (object instanceof THREE.Mesh && !found) found = object.material as THREE.MeshPhysicalMaterial;
  });
  return found!;
};

describe('opt-in albedo variation', () => {
  it('keeps the legacy solid base colour when absent', () => {
    const legacy = material(ir());
    expect(legacy.map).toBeNull();
    expect(legacy.color.getHexString()).toBe('a0703c');
  });

  it('adds a pattern base-colour map and lifts the colour so the mean stays put', () => {
    const varied = material(ir(0.25));
    expect(varied.map).toBeInstanceOf(THREE.Texture);
    const data = varied.map!.image.data as Uint8Array;
    const values = new Set<number>();
    let mean = 0;
    for (let i = 0; i < data.length; i += 4) {
      values.add(data[i]!);
      const v = data[i]! / 255;
      mean += v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }
    mean /= data.length / 4;
    expect(values.size).toBeGreaterThan(8);
    const base = new THREE.Color('#a0703c');
    expect(varied.color.r * mean).toBeCloseTo(base.r, 3);
    expect(varied.color.g * mean).toBeCloseTo(base.g, 3);
  });

  it('rejects out-of-range variation', () => {
    expect(() => validateAssemblyIR(ir(0.8))).toThrow(/albedoVariation/);
  });
});

describe('opt-in photo albedo patch', () => {
  const patchIr = (rgba: Uint8Array): AssemblyIR => ({
    ...ir(),
    components: [{ ...ir().components[0]!, material: { color: '#a0703c', surface: 'wood', textureScale: [2, 2], albedoPatch: { width: 8, height: 8, rgbaBase64: btoa(String.fromCharCode(...rgba)) } } }],
  } as AssemblyIR);
  const stripes = new Uint8Array(8 * 8 * 4);
  for (let i = 0; i < 64; i += 1) stripes.set((i % 8) < 4 ? [200, 150, 100, 255] : [100, 70, 40, 255], i * 4);

  it('maps a mirrored, mean-normalised photo tile and keeps the declared mean colour', () => {
    const m = material(patchIr(stripes));
    expect(m.map).toBeInstanceOf(THREE.DataTexture);
    expect(m.map!.wrapS).toBe(THREE.MirroredRepeatWrapping);
    expect(m.map!.repeat.toArray()).toEqual([2, 2]);
    const data = m.map!.image.data as Uint8Array;
    const lin = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    let mean = 0;
    for (let i = 0; i < 64; i += 1) mean += lin(data[i * 4]!) / 64;
    expect(m.color.r * mean).toBeCloseTo(new THREE.Color('#a0703c').r, 2);
    expect(Math.max(...Array.from(data).filter((_, i) => i % 4 !== 3))).toBe(255);
  });

  it('rejects a patch whose bytes do not match its size', () => {
    expect(() => validateAssemblyIR(patchIr(stripes.slice(0, 100)))).toThrow(/albedoPatch/);
  });
});
