import {expect, it} from 'vitest';
import {createElementDomainRegistry} from '../src/engine/element-domain-packs';
import {beveledPlatePack} from '../src/engine/plate-bevel';
import {generateCenteredPlateProject} from '../src/engine/centered-plate-pack';
import {ElementHistory, editPart, parseProject, serializeProject} from '../src/engine/element-project';
import {modelingSourceSHA256} from '../src/engine/element-modeling-recipe';
import {PART_PLAN_SCHEMA, parsePartRegenerationPlan, previewPartRegenerationPlan} from '../src/engine/part-regeneration-plan';
import {exportSelectedScene} from '../src/engine/element-renderer';
import {analyzeTopology} from '../src/engine/topology';
import {inspectUvQuality} from '../src/engine/uv-quality';

const registry = createElementDomainRegistry(); registry.register(beveledPlatePack);
function source() {
  const p = generateCenteredPlateProject({});
  p.parts.push({...structuredClone(p.parts[0]), id: 'neighbor', position: [40, 0, 0]});
  p.parts.push({...structuredClone(p.parts[0]), id: 'untouched', position: [-40, 0, 0]});
  return editPart(p, 'plate_body', {position: [1, 2, 3], rotation: [.1, .2, .3], material: {roughness: .3, metalness: .7}});
}
const declaration = {schema: 'sceliph.domain-invocation/0.1', units: 'mm', coordinates: 'right-handed-y-up',
  packId: beveledPlatePack.metadata.id, input: {widthMm: 32, heightMm: 14, thicknessMm: 5, boreDiameterMm: 4, edgeBevelMm: .6},
  requiredCapabilities: ['authored-single-extrusion']};
async function plan(p = source()) {return {schema: PART_PLAN_SCHEMA, sourceSha256: await modelingSourceSHA256(p),
  steps: ['plate_body', 'neighbor'].map(targetId => ({targetId, declaration: structuredClone(declaration)}))};}

it('checks two actual replacements, preserves placement/material/non-target and commits as one reversible edit', async () => {
  const p = source(), before = serializeProject(p), result = await previewPartRegenerationPlan(registry, p, JSON.stringify(await plan(p)));
  expect(serializeProject(p)).toBe(before);
  expect(result.receipt.steps).toHaveLength(2);
  for (let i = 0; i < 2; i++) {
    expect(result.project.parts[i].geometry).not.toEqual(p.parts[i].geometry);
    expect({...result.project.parts[i], geometry: p.parts[i].geometry, evidence: p.parts[i].evidence}).toEqual(p.parts[i]);
  }
  expect(result.project.parts[2]).toEqual(p.parts[2]);
  const built = exportSelectedScene(result.project, ['plate_body', 'neighbor']);
  try {expect(analyzeTopology(built.root).pass).toBe(true); expect((await inspectUvQuality(built.root)).integrityPass).toBe(true);} finally {built.dispose();}
  const history = new ElementHistory(p); history.commit(result.project);
  expect(serializeProject(history.undo())).toBe(before); expect(history.redo()).toEqual(result.project);
  expect(serializeProject(parseProject(serializeProject(result.project)))).toBe(serializeProject(result.project));
});

it('rolls back the entire plan if a later replacement fails final UV, and permits a corrected retry', async () => {
  let p = source();
  const large = generateCenteredPlateProject({widthMm: 1000, heightMm: 1000, thicknessMm: 1000, boreDiameterMm: 0});
  p.parts[1].geometry = large.parts[0].geometry;
  p = editPart(p, 'neighbor', {uvScale: .001});
  const before = serializeProject(p), text = JSON.stringify(await plan(p));
  await expect(previewPartRegenerationPlan(registry, p, text)).rejects.toThrow('Final target UV');
  expect(serializeProject(p)).toBe(before);
  const corrected = editPart(p, 'neighbor', {uvScale: 1});
  expect((await previewPartRegenerationPlan(registry, corrected, JSON.stringify(await plan(corrected)))).receipt.steps).toHaveLength(2);
});

it('rejects stale plans, duplicate targets, unknown fields, invalid frames and oversized plans', async () => {
  const p = source(), request = await plan(p);
  await expect(previewPartRegenerationPlan(registry, editPart(p, 'untouched', {position: [0, 0, 0]}), JSON.stringify(request))).rejects.toThrow('Stale');
  expect(() => parsePartRegenerationPlan(JSON.stringify({...request, steps: [request.steps[0], request.steps[0]]}))).toThrow('unique');
  expect(() => parsePartRegenerationPlan(JSON.stringify({...request, script: 'ignored'}))).toThrow();
  expect(() => parsePartRegenerationPlan(JSON.stringify({...request, steps: []}))).toThrow();
  expect(() => parsePartRegenerationPlan(JSON.stringify({...request, steps: Array(9).fill(request.steps[0])}))).toThrow();
  expect(() => parsePartRegenerationPlan(' '.repeat(65537))).toThrow('64 KiB');
  request.steps[0].declaration.units = 'm';
  expect(() => parsePartRegenerationPlan(JSON.stringify(request))).toThrow('frame');
});

it('captures the source before awaiting and rejects locked targets without changing any part', async () => {
  const p = source(), request = await plan(p), captured = structuredClone(p);
  const pending = previewPartRegenerationPlan(registry, p, JSON.stringify(request)); p.parts[2].position[0] = 99;
  expect((await pending).project.parts[2]).toEqual(captured.parts[2]);
  const locked = editPart(source(), 'neighbor', {locked: true}), before = serializeProject(locked);
  await expect(previewPartRegenerationPlan(registry, locked, JSON.stringify(await plan(locked)))).rejects.toThrow('Unlock');
  expect(serializeProject(locked)).toBe(before);
});
