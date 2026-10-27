/**
 * Compiles one AssemblyIR file to a GLB with the same exporter as the job
 * runner (no evidence gates; for fixtures and ground-truth scenes only).
 *
 *   npx vite-node scripts/export-assembly-glb.ts -- --ir assembly.json --out model.glb
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AssemblyIR } from '../src/engine/assembly-ir';
import { validateAssemblyIR } from '../src/engine/assembly-compiler';
import { exportAssembly } from './lib/morphloom-job';

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing --${name}.`);
  return value;
}

const ir = JSON.parse(readFileSync(resolve(argument('ir')), 'utf8')) as AssemblyIR;
validateAssemblyIR(ir);
const { bytes, metrics } = await exportAssembly(ir);
writeFileSync(resolve(argument('out')), bytes);
console.log(JSON.stringify(metrics));
