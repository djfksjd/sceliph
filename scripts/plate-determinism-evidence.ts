import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {deterministicBeveledPlatePack} from '../src/engine/plate-bevel';
import {createElementDomainRegistry} from '../src/engine/element-domain-packs';
import {executeDomainInvocation} from '../src/engine/domain-invocation';
import {parseProject, serializeProject} from '../src/engine/element-project';
import {prepareElementExportSource} from '../src/engine/element-export-source';
import {exportSelectedScene} from '../src/engine/element-renderer';
import {analyzeTopology} from '../src/engine/topology';
import {inspectMeshExport} from '../src/engine/mesh-export-policy';
import {PLATE_ARITHMETIC_REVISION} from '../src/engine/plate-arithmetic';
import {modelingSourceSHA256} from '../src/engine/element-modeling-recipe';
import {PART_PLAN_SCHEMA, previewPartRegenerationPlan} from '../src/engine/part-regeneration-plan';

const [command, directory, browserDirectory] = process.argv.slice(2);
if (!['generate', 'compare', 'plan'].includes(command) || !directory || ['compare', 'plan'].includes(command) && !browserDirectory) {
  throw Error('Usage: vite-node scripts/plate-determinism-evidence.ts generate NEW_DIRECTORY | compare NODE_DIRECTORY BROWSER_DIRECTORY | plan NODE_DIRECTORY PLAN_BROWSER_DIRECTORY');
}
const out = resolve(directory), hash = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const assert = (pass: boolean, reason: string) => {if (!pass) throw Error(reason);};
class Reader {result: unknown; onloadend?: () => void; async readAsArrayBuffer(b: Blob) {this.result = await b.arrayBuffer(); this.onloadend?.();}}
Object.assign(globalThis, {FileReader: Reader});
if (command === 'generate') {
  mkdirSync(out);
  const registry = createElementDomainRegistry(); registry.register(deterministicBeveledPlatePack);
  const inputs = [.5, 1, 2].map(scale => ({widthMm: 24 * scale, heightMm: 14 * scale, thicknessMm: 5 * scale, boreDiameterMm: 4 * scale, edgeBevelMm: .6 * scale}));
  inputs.push({widthMm: 35, heightMm: 12, thicknessMm: 3, boreDiameterMm: 0, edgeBevelMm: .5});
  inputs.push({widthMm: 32, heightMm: 14, thicknessMm: 5, boreDiameterMm: 4, edgeBevelMm: 0});
  inputs.push({widthMm: 64, heightMm: 12, thicknessMm: 3, boreDiameterMm: 2, edgeBevelMm: .3});
  const cases = [];
  for (let i = 0; i < inputs.length; i++) {
    const id = `case-${i}`, declaration = JSON.stringify({schema: 'sceliph.domain-invocation/0.1', units: 'mm', coordinates: 'right-handed-y-up',
      packId: deterministicBeveledPlatePack.metadata.id, input: inputs[i], requiredCapabilities: ['authored-single-extrusion', 'deterministic-descriptor']}, null, 2);
    const project = executeDomainInvocation(registry, declaration).project;
    const source = serializeProject({...project, selection: []});
    const built = exportSelectedScene(prepareElementExportSource(project), ['plate_body']);
    try {
      const topology = analyzeTopology(built.root); assert(topology.pass, id + ': topology');
      const bytes = new Uint8Array(await new GLTFExporter().parseAsync(built.root, {binary: true}) as ArrayBuffer);
      const uv = await inspectMeshExport(bytes.buffer as ArrayBuffer, source, 'editable-mesh');
      assert(uv.meshExport.standard.status === 'pass', id + ': strict standard');
      const reopened = exportSelectedScene(prepareElementExportSource(parseProject(source)), ['plate_body']);
      try {
        const again = new Uint8Array(await new GLTFExporter().parseAsync(reopened.root, {binary: true}) as ArrayBuffer);
        assert(Buffer.from(bytes).equals(Buffer.from(again)), id + ': reopened bytes');
        writeFileSync(resolve(out, id + '.reopened.glb'), again, {flag: 'wx'});
      } finally {reopened.dispose();}
      for (const [name, data] of [[id + '.declaration.json', declaration], [id + '.source.json', source], [id + '.glb', bytes]] as const) writeFileSync(resolve(out, name), data, {flag: 'wx'});
      cases.push({id, input: inputs[i], sourceSha256: hash(source), glbSha256: hash(bytes), declarationSha256: hash(declaration), bytes: bytes.length, topology,
        standard: uv.meshExport.standard, uv: {allowed: uv.meshExport.uv.allowed, integrityPass: uv.report.integrityPass, fingerprintCoverage: uv.report.fingerprintCoverage}, reopenedExact: true});
    } finally {built.dispose();}
  }
  const maximumSource = deterministicBeveledPlatePack.generate(inputs[1]);
  maximumSource.parts = Array.from({length: 8}, (_, i) => ({...structuredClone(maximumSource.parts[0]), id: `part_${i}`, position: [40 * i, 0, 0] as [number, number, number]}));
  const maximumPlan = {schema: PART_PLAN_SCHEMA, sourceSha256: await modelingSourceSHA256(maximumSource), steps: maximumSource.parts.map(p => ({targetId: p.id,
    declaration: {schema: 'sceliph.domain-invocation/0.1', units: 'mm', coordinates: 'right-handed-y-up', packId: deterministicBeveledPlatePack.metadata.id,
      input: {...inputs[1], widthMm: 32}, requiredCapabilities: ['authored-single-extrusion', 'deterministic-descriptor']}}))};
  const started = performance.now(), maximumResult = await previewPartRegenerationPlan(registry, maximumSource, JSON.stringify(maximumPlan));
  const maximumWorkload = {steps: maximumResult.receipt.steps.length, elapsedMs: performance.now() - started, sourceBytes: new TextEncoder().encode(serializeProject(maximumResult.project)).length,
    scope: 'Warm Node24 process after six examples, eight 2112-triangle replacements; not a worst-case latency SLA'};
  writeFileSync(resolve(out, 'node-report.json'), JSON.stringify({revision: PLATE_ARITHMETIC_REVISION, pass: true, cases, maximumWorkload, scope: 'Six registered authored input cases; no photo/CAD/whole production approval'}, null, 2), {flag: 'wx'});
  console.log(JSON.stringify({pass: true, cases: cases.length, actualGlbs: cases.length * 2}));
} else if (command === 'compare') {
  const report = JSON.parse(readFileSync(resolve(out, 'node-report.json'), 'utf8'));
  const rows = [];
  for (const c of report.cases) {
    const source = readFileSync(resolve(browserDirectory!, c.id + '.source.json')), expectedSource = readFileSync(resolve(out, c.id + '.source.json'));
    const glb = readFileSync(resolve(browserDirectory!, c.id + '.glb')), expectedGlb = readFileSync(resolve(out, c.id + '.glb'));
    const reopened = readFileSync(resolve(browserDirectory!, c.id + '.reopened.glb'));
    const exportSource = readFileSync(resolve(browserDirectory!, c.id + '.export-source.json'));
    assert(source.equals(expectedSource), c.id + ': entire source JSON differs across runtimes');
    assert(glb.equals(expectedGlb), c.id + ': entire GLB differs across runtimes');
    assert(reopened.equals(glb), c.id + ': fresh browser reopen changed GLB bytes');
    assert(exportSource.equals(source), c.id + ': exported companion JSON differs from saved native source');
    const uv = await inspectMeshExport(new Uint8Array(glb).buffer as ArrayBuffer, source.toString('utf8'), 'editable-mesh');
    assert(uv.meshExport.standard.status === 'pass', c.id + ': browser standard');
    rows.push({id: c.id, sourceByteExact: true, glbByteExact: true, freshBrowserGlbExact: true, companionSourceExact: true, sourceSha256: hash(source), glbSha256: hash(glb), standard: uv.meshExport.standard, uvAllowed: uv.meshExport.uv.allowed});
  }
  writeFileSync(resolve(out, 'cross-runtime-report.json'), JSON.stringify({pass: true, revision: PLATE_ARITHMETIC_REVISION, cases: rows, scope: 'Node24 / actual browser declaration import and downloads. No rounding, source normalization, BIN-only comparison or production promotion.'}, null, 2), {flag: 'wx'});
  console.log(JSON.stringify({pass: true, cases: rows.length, entireSourceAndGlbExact: true}));
} else {
  const registry = createElementDomainRegistry(); registry.register(deterministicBeveledPlatePack);
  const source = parseProject(readFileSync('benchmarks/practical-workflow-20261010/before-1.source.json', 'utf8'));
  const plan = {schema: PART_PLAN_SCHEMA, sourceSha256: await modelingSourceSHA256(source), steps: ['panel_user', 'brace_user'].map(targetId => ({targetId,
    declaration: {schema: 'sceliph.domain-invocation/0.1', units: 'mm', coordinates: 'right-handed-y-up', packId: deterministicBeveledPlatePack.metadata.id,
      input: {widthMm: targetId === 'panel_user' ? 32 : 24, heightMm: 14, thicknessMm: 5, boreDiameterMm: 4, edgeBevelMm: .6},
      requiredCapabilities: ['authored-single-extrusion', 'deterministic-descriptor']}}))};
  const result = await previewPartRegenerationPlan(registry, source, JSON.stringify(plan));
  const text = serializeProject({...result.project, selection: []});
  const browserSource = readFileSync(resolve(browserDirectory!, 'browser-after.json'));
  assert(browserSource.equals(Buffer.from(text)), 'Plan: complete Node/browser native source differs');
  assert(readFileSync(resolve(browserDirectory!, 'browser-reopened.json')).equals(browserSource), 'Plan: fresh source reopen differs');
  const built = exportSelectedScene(prepareElementExportSource(result.project), result.project.parts.map(p => p.id));
  try {
    assert(analyzeTopology(built.root).pass, 'Plan: topology');
    const bytes = new Uint8Array(await new GLTFExporter().parseAsync(built.root, {binary: true}) as ArrayBuffer);
    const actual = readFileSync(resolve(browserDirectory!, 'browser-reopened.glb'));
    assert(actual.equals(Buffer.from(bytes)), 'Plan: complete Node/browser GLB differs');
    const uv = await inspectMeshExport(bytes.buffer as ArrayBuffer, text, 'editable-mesh');
    assert(uv.meshExport.standard.status === 'pass', 'Plan: standard validation');
    writeFileSync(resolve(out, 'plan-node.source.json'), text, {flag: 'wx'});
    writeFileSync(resolve(out, 'plan-node.glb'), bytes, {flag: 'wx'});
    writeFileSync(resolve(out, 'plan-cross-runtime-report.json'), JSON.stringify({pass: true, sourceByteExact: true, glbByteExact: true, freshSourceExact: true,
      receipt: result.receipt, sourceSha256: hash(text), glbSha256: hash(bytes), standard: uv.meshExport.standard, uvAllowed: uv.meshExport.uv.allowed,
      scope: 'Two replacements under inherited transforms/PBR and one non-target, matching actual browser apply/save/fresh reopen/export'}, null, 2), {flag: 'wx'});
    console.log(JSON.stringify({pass: true, planTargets: 2, entireSourceAndGlbExact: true}));
  } finally {built.dispose();}
}
