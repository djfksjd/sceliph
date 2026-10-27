import {afterEach, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Mesh, Vector3} from 'three';
import {deterministicPlateBorePoint, PLATE_BEVEL_SECANT} from '../src/engine/plate-arithmetic';
import {generateCenteredPlateProject} from '../src/engine/centered-plate-pack';
import {generateBeveledPlateProject, qualityBeveledPlatePack, deterministicBeveledPlatePack} from '../src/engine/plate-bevel';
import {serializeProject, parseProject} from '../src/engine/element-project';
import {createElementDomainRegistry} from '../src/engine/element-domain-packs';
import {executeDomainInvocation} from '../src/engine/domain-invocation';
import {exportSelectedScene} from '../src/engine/element-renderer';
import {analyzeTopology} from '../src/engine/topology';
import {inspectUvQuality} from '../src/engine/uv-quality';

afterEach(() => vi.restoreAllMocks());
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
it('preserves 54 captured legacy source hashes without silently changing either previous pack', () => {
  const baseline = JSON.parse(readFileSync('tests/fixtures/plate-arithmetic/legacy-baseline.json', 'utf8'));
  expect(baseline.cases).toHaveLength(18);
  for (const row of baseline.cases) {
    const {edgeBevelMm: _edge, ...plain} = row.input;
    expect(sha(serializeProject(generateCenteredPlateProject(plain)))).toBe(row.centered);
    expect(sha(serializeProject(generateBeveledPlateProject(row.input)))).toBe(row.beveled);
    expect(sha(serializeProject(qualityBeveledPlatePack.generate(row.input)))).toBe(row.quality);
  }
});

it('agrees with an independent 140-digit Decimal oracle over every bore point and the radius bounds', () => {
  const reference = JSON.parse(readFileSync('tests/fixtures/plate-arithmetic/decimal-reference.json', 'utf8'));
  let errorMm = 0;
  for (const radius of [0, .1, 50, 150, 200]) for (let i = 0; i < 128; i++) {
    const point = deterministicPlateBorePoint(radius, i);
    for (let axis = 0; axis < 2; axis++) errorMm = Math.max(errorMm, Math.abs(point[axis] - radius * reference.circle[i][axis]));
  }
  expect(errorMm).toBeLessThan(1e-10);
  expect(Math.abs(PLATE_BEVEL_SECANT - reference.bevelSecant)).toBeLessThan(1e-14);
  for (const [r, i] of [[-1, 0], [200.01, 0], [NaN, 0], [Infinity, 0], [1, -1], [1, 128], [1, .5]]) expect(() => deterministicPlateBorePoint(r, i)).toThrow();
});

it('generates deterministic descriptors without native sin/cos in beveled, sharp and no-bore cases', () => {
  vi.spyOn(Math, 'sin').mockImplementation(() => {throw Error('native sin');});
  vi.spyOn(Math, 'cos').mockImplementation(() => {throw Error('native cos');});
  for (const input of [{}, {edgeBevelMm: 0}, {boreDiameterMm: 0}]) {
    const source = deterministicBeveledPlatePack.generate(input);
    expect(source.parts[0].evidence.source).toContain('sceliph.plate-ieee-series/0.1');
    expect(serializeProject(parseProject(serializeProject(source)))).toBe(serializeProject(source));
  }
});

it('retains bounds, an open bore, topology and UV at three scales through the registered invocation path', async () => {
  const registry = createElementDomainRegistry(); registry.register(deterministicBeveledPlatePack);
  for (const scale of [.5, 1, 2]) {
    const input = {widthMm: 24 * scale, heightMm: 14 * scale, thicknessMm: 5 * scale, boreDiameterMm: 4 * scale, edgeBevelMm: .6 * scale};
    const declaration = JSON.stringify({schema: 'sceliph.domain-invocation/0.1', units: 'mm', coordinates: 'right-handed-y-up',
      packId: deterministicBeveledPlatePack.metadata.id, input, requiredCapabilities: ['authored-single-extrusion', 'deterministic-descriptor']});
    const project = executeDomainInvocation(registry, declaration).project, built = exportSelectedScene(project, ['plate_body']);
    try {
      const topology = analyzeTopology(built.root);
      expect(topology.pass).toBe(true);
      expect([topology.boundaryEdges, topology.nonManifoldEdges, topology.degenerateTriangles]).toEqual([0, 0, 0]);
      expect((await inspectUvQuality(built.root)).integrityPass).toBe(true);
      const g = (built.root.getObjectByName('plate_body') as Mesh).geometry; g.computeBoundingBox();
      expect(g.boundingBox!.getSize(new Vector3()).multiplyScalar(1000).toArray()).toEqual([input.widthMm, input.heightMm, input.thicknessMm].map(v => expect.closeTo(v, 4)));
      const p = g.getAttribute('position'); let radius = Infinity;
      for (let i = 0; i < p.count; i++) radius = Math.min(radius, Math.hypot(p.getX(i), p.getY(i)) * 1000);
      expect(2 * radius).toBeCloseTo(input.boreDiameterMm, 4);
    } finally {built.dispose();}
  }
  expect(() => registry.generate(deterministicBeveledPlatePack.metadata.id, {edgeBevelMm: 100})).toThrow();
});
