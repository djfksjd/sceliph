import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { generateSpurGearProject } from '../src/engine/gear-pack';
import { editPart, migrateElementProjectToV8 } from '../src/engine/element-project';
import { prepareDiagnosticToothExportSource, prepareElementExportSource } from '../src/engine/element-export-source';
import { exportSelectedScene } from '../src/engine/element-renderer';
import { GEAR_DETERMINISTIC_MATH_REVISION } from '../src/engine/gear-deterministic-math';
import type { SpurGearGeometry } from '../src/engine/spur-gear';

// Evidence-only CLI: no automatic legacy policy migration or baseline replacement.
if (process.argv.length !== 3) throw new Error('Usage: npx vite-node scripts/gear-runtime-evidence.ts <new-output-directory>');
const out = resolve(process.argv[2]);
mkdirSync(out); // Existing evidence must never be overwritten.
const readerDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'FileReader');
class NodeReader {
  result: ArrayBuffer | null = null;
  onloadend?: () => void;
  onerror?: (error: unknown) => void;
  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.(); }, error => { this.onerror?.(error); });
  }
}
Object.defineProperty(globalThis, 'FileReader', { value: NodeReader, configurable: true, writable: true });
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const reports = [];
try {
  for (const [moduleMm, toothCount] of [[0.5, 24], [1, 24], [2, 24], [1, 36]]) {
    const legacy = generateSpurGearProject({ moduleMm, toothCount, boreDiameterMm: 4 });
    const migrated = migrateElementProjectToV8(legacy);
    const stable = editPart(migrated, 'spur_gear', { geometry: {
      ...migrated.parts[0].geometry as SpurGearGeometry, mathRevision: GEAR_DETERMINISTIC_MATH_REVISION,
    } });
    for (const [policy, project] of [['legacy', legacy], ['explicit-ieee', stable]] as const) {
      for (const tooth of [false, true]) {
        const source = tooth ? prepareDiagnosticToothExportSource(project, 'spur_gear', 'tooth_0003') : prepareElementExportSource(project);
        const built = exportSelectedScene(source, ['spur_gear']);
        try {
          if (tooth) {
            const mesh = built.root.getObjectByName('spur_gear');
            if (!mesh) throw new Error('Missing exported gear');
            mesh.name = 'spur_gear/tooth_0003';
            mesh.userData = { ...mesh.userData, connectedSourceFeatureId: 'spur_gear/tooth_0003', extraction: 'diagnostic-sector-cut', detachable: false };
          }
          const bytes = new Uint8Array(await new GLTFExporter().parseAsync(built.root, { binary: true }) as ArrayBuffer);
          const name = `${moduleMm}-${toothCount}-${policy}-${tooth ? 'tooth' : 'whole'}`;
          const sourceBytes = new TextEncoder().encode(JSON.stringify(source));
          writeFileSync(resolve(out, name + '.glb'), bytes, { flag: 'wx' });
          writeFileSync(resolve(out, name + '.json'), sourceBytes, { flag: 'wx' });
          reports.push({ name, moduleMm, toothCount, policy, tooth, bytes: bytes.length, glbSha256: hash(bytes), sourceSha256: hash(sourceBytes) });
        } finally { built.dispose(); }
      }
    }
  }
  writeFileSync(resolve(out, 'report.json'), JSON.stringify({ schema: 'sceliph.gear-runtime-evidence/0.1', node: process.version, arch: process.arch, platform: process.platform, reports }, null, 2) + '\n', { flag: 'wx' });
} finally {
  if (readerDescriptor) Object.defineProperty(globalThis, 'FileReader', readerDescriptor);
  else Reflect.deleteProperty(globalThis, 'FileReader');
}
