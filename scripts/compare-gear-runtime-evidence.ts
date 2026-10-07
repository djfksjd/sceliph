import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

if (process.argv.length !== 4) throw new Error('Usage: npx vite-node scripts/compare-gear-runtime-evidence.ts <directory-a> <directory-b>');
const directories = process.argv.slice(2).map(path => resolve(path));
const read = (directory: string, name: string) => {
  const path = resolve(directory, name);
  const stat = statSync(path);
  if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error(`Invalid or over-budget evidence file: ${name}`);
  return readFileSync(path);
};
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const reports = [];
// Fixed bounded cases; manifest claims cannot choose paths or substitute file hashes.
for (const [moduleMm, toothCount] of [[0.5, 24], [1, 24], [2, 24], [1, 36]]) {
  for (const policy of ['legacy', 'explicit-ieee']) {
    for (const kind of ['whole', 'tooth']) {
      const name = `${moduleMm}-${toothCount}-${policy}-${kind}`;
      const glb = directories.map(directory => read(directory, name + '.glb'));
      const source = directories.map(directory => read(directory, name + '.json'));
      const glbExact = glb[0].equals(glb[1]), sourceExact = source[0].equals(source[1]);
      reports.push({ name, policy, glbExact, sourceExact, pass: glbExact && sourceExact,
        glbSha256: glb.map(sha), sourceSha256: source.map(sha) });
    }
  }
}
const pass = reports.every(report => report.pass);
console.log(JSON.stringify({ schema: 'sceliph.gear-runtime-byte-comparison/0.1', pass, directories, reports }, null, 2));
if (!pass) process.exitCode = 1;
