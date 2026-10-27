import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {WebIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {createElementDomainRegistry} from '../src/engine/element-domain-packs';
import {generateCenteredPlateProject} from '../src/engine/centered-plate-pack';
import {qualityBeveledPlatePack} from '../src/engine/plate-bevel';
import {editPart, parseProject, serializeProject, type ElementProject} from '../src/engine/element-project';
import {modelingSourceSHA256} from '../src/engine/element-modeling-recipe';
import {PART_PLAN_SCHEMA, previewPartRegenerationPlan} from '../src/engine/part-regeneration-plan';
import {prepareElementExportSource} from '../src/engine/element-export-source';
import {exportSelectedScene} from '../src/engine/element-renderer';
import {analyzeTopology} from '../src/engine/topology';
import {inspectMeshExport} from '../src/engine/mesh-export-policy';
import {validateGlbStandard} from '../src/engine/gltf-standard-validation';

if (process.argv.length !== 3) throw Error('Usage: vite-node scripts/part-regeneration-plan-evidence.ts NEW_OUTPUT_DIRECTORY');
const out = resolve(process.argv[2]); mkdirSync(out, {recursive: false});
class Reader {
  result: unknown; onloadend?: () => void;
  async readAsArrayBuffer(blob: Blob) {this.result = await blob.arrayBuffer(); this.onloadend?.();}
}
Object.assign(globalThis, {FileReader: Reader});
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const assert = (pass: boolean, message: string) => {if (!pass) throw Error(message);};
const registry = createElementDomainRegistry(); registry.register(qualityBeveledPlatePack);
const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
async function save(name: string, project: ElementProject) {
  const source = serializeProject(project);
  const built = exportSelectedScene(prepareElementExportSource(parseProject(source)), project.parts.map(p => p.id));
  try {
    const topology = analyzeTopology(built.root); assert(topology.pass, 'Topology: ' + name);
    const bytes = new Uint8Array(await new GLTFExporter().parseAsync(built.root, {binary: true}) as ArrayBuffer);
    const standard = await validateGlbStandard(bytes.buffer as ArrayBuffer);
    assert(standard.status === 'pass', 'Khronos / independent parser: ' + name);
    const uv = await inspectMeshExport(bytes.buffer as ArrayBuffer, source, 'editable-mesh');
    assert(uv.meshExport.uv.allowed && uv.meshExport.standard.status === 'pass', 'Final GLB UV: ' + name);
    writeFileSync(resolve(out, name + '.source.json'), source, {flag: 'wx'});
    writeFileSync(resolve(out, name + '.glb'), bytes, {flag: 'wx'});
    return {bytes, doc: await io.readBinary(bytes), evidence: {name, sourceSha256: sha(source), glbSha256: sha(bytes), topology, standard, uv, triangles: built.stats.triangles}};
  } finally {built.dispose();}
}
function nodeSnapshot(doc: Awaited<ReturnType<typeof io.readBinary>>, id: string) {
  const node = doc.getRoot().listNodes().find(n => n.getName() === id);
  if (!node?.getMesh()) throw Error('Missing named mesh ' + id);
  return {translation: node.getTranslation(), rotation: node.getRotation(), scale: node.getScale(),
    parent: node.getParentNode()?.getName() ?? null,
    primitives: node.getMesh()!.listPrimitives().map(p => ({
      attributes: Object.fromEntries(p.listSemantics().map(s => {
        const a = p.getAttribute(s)!.getArray()!;
        return [s, sha(new Uint8Array(a.buffer, a.byteOffset, a.byteLength))];
      })),
      index: (() => {const a = p.getIndices()?.getArray(); return a ? sha(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)) : null;})(),
      material: [p.getMaterial()?.getBaseColorFactor(), p.getMaterial()?.getMetallicFactor(), p.getMaterial()?.getRoughnessFactor()],
    }))};
}
const cases = [];
for (const scale of [.5, 1, 2]) {
  let source = generateCenteredPlateProject({widthMm: 20 * scale, heightMm: 10 * scale, thicknessMm: 4 * scale, boreDiameterMm: 4 * scale});
  source.parts[0].id = 'panel_user'; source.parts[0].name = 'Mounting panel';
  source.parts.push({...structuredClone(source.parts[0]), id: 'brace_user', name: 'Support brace', position: [40 * scale, 0, 0]});
  source.parts.push({...structuredClone(source.parts[0]), id: 'untouched', name: 'Reference plate', position: [-40 * scale, 0, 0]});
  source = editPart(source, 'panel_user', {position: [1, 2, 3], rotation: [.1, .2, .3], material: {roughness: .4, metalness: .8}});
  const plan = {schema: PART_PLAN_SCHEMA, sourceSha256: await modelingSourceSHA256(source), steps: ['panel_user', 'brace_user'].map(targetId => ({targetId,
    declaration: {schema: 'sceliph.domain-invocation/0.1', units: 'mm', coordinates: 'right-handed-y-up', packId: qualityBeveledPlatePack.metadata.id,
      input: {widthMm: (targetId==='brace_user'?24:32) * scale, heightMm: 14 * scale, thicknessMm: 5 * scale, boreDiameterMm: 4 * scale, edgeBevelMm: .6 * scale}, requiredCapabilities: ['authored-single-extrusion']}}))};
  const text = JSON.stringify(plan, null, 2), before = await save('before-' + scale, source);
  writeFileSync(resolve(out, 'plan-' + scale + '.json'), text, {flag: 'wx'});
  const result = await previewPartRegenerationPlan(registry, source, text);
  const after = await save('after-' + scale, result.project), reopened = await save('reopened-' + scale, parseProject(serializeProject(result.project)));
  assert(Buffer.from(after.bytes).equals(Buffer.from(reopened.bytes)), 'Reopened GLB bytes');
  assert(JSON.stringify(nodeSnapshot(before.doc, 'untouched')) === JSON.stringify(nodeSnapshot(after.doc, 'untouched')), 'Non-target buffers/pose/material');
  for (const id of ['panel_user', 'brace_user']) {
    const a = nodeSnapshot(before.doc, id), b = nodeSnapshot(after.doc, id);
    assert(JSON.stringify({...a, primitives: null}) === JSON.stringify({...b, primitives: null}), 'Target pose');
    assert(JSON.stringify(a.primitives.map(p => p.material)) === JSON.stringify(b.primitives.map(p => p.material)), 'Target PBR');
  }
  cases.push({scale, receipt: result.receipt, files: [before.evidence, after.evidence, reopened.evidence], nonTargetExact: true, targetPoseAndPbrPreserved: true, reopenedGlbExact: true});
}
const maximumSource = generateCenteredPlateProject({});
maximumSource.parts = Array.from({length: 8}, (_, i) => ({...structuredClone(maximumSource.parts[0]), id: `panel_${i}`, position: [i * 40, 0, 0] as [number, number, number]}));
const maximumPlan = {schema: PART_PLAN_SCHEMA, sourceSha256: await modelingSourceSHA256(maximumSource), steps: maximumSource.parts.map(part => ({targetId: part.id,
  declaration: {schema: 'sceliph.domain-invocation/0.1', units: 'mm', coordinates: 'right-handed-y-up', packId: qualityBeveledPlatePack.metadata.id,
    input: {widthMm: 24, heightMm: 14, thicknessMm: 5, boreDiameterMm: 4, edgeBevelMm: .6}, requiredCapabilities: ['authored-single-extrusion']}}))};
const started = performance.now(), maximum = await previewPartRegenerationPlan(registry, maximumSource, JSON.stringify(maximumPlan));
const maximumWorkload = {steps: maximum.receipt.steps.length, elapsedMs: performance.now() - started, sourceBytes: new TextEncoder().encode(serializeProject(maximum.project)).length,
  scope: 'Eight representative 2112-triangle parts; observed host timing, not a latency SLA or worst-case 100k-triangle measurement'};
writeFileSync(resolve(out, 'report.json'), JSON.stringify({pass: true, cases, maximumWorkload, scope: 'Three authored scales, two replacements each. No photo fidelity / whole production approval.'}, null, 2), {flag: 'wx'});
console.log(JSON.stringify({pass: true, cases: cases.length, glbs: cases.length * 3}));
