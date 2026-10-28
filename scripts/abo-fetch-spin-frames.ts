/**
 * Downloads extra turntable frames of already selected ABO items, for scoring
 * renders against real photos from views the model never saw (B3 texture
 * evaluation). Frames are spin azimuth indices (5° steps); files land next to
 * the frames that scripts/abo-holdout-select.ts fetched, as {modelId}-{frame}.jpg,
 * and are skipped when present.
 *
 *   npx vite-node scripts/abo-fetch-spin-frames.ts -- --selection selection.json --data-dir DIR \
 *     --frames 9,27,36,54 (--split dev | --only id,id)
 *
 * ABO data and images © Amazon.com, CC-BY-4.0.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

const BUCKET = 'https://amazon-berkeley-objects.s3.amazonaws.com';
function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const dataDir = resolve(argument('data-dir')!);
const selection = JSON.parse(readFileSync(resolve(argument('selection')!), 'utf8')) as { items: Array<{ modelId: string; spinId: string; split: string }> };
const frames = argument('frames')!.split(',').map(Number);
const only = argument('only')?.split(',');
const items = selection.items.filter((item) => (only ? only.includes(item.modelId) : item.split === argument('split')));
const spins = new Map<string, Map<number, string>>();
for (const line of gunzipSync(readFileSync(join(dataDir, 'meta/spins.csv.gz'))).toString('utf8').trim().split('\n').slice(1)) {
  const [spinId, azimuth, , , , path] = line.split(',');
  const byFrame = spins.get(spinId!) ?? new Map<number, string>();
  byFrame.set(Number(azimuth), path!);
  spins.set(spinId!, byFrame);
}
mkdirSync(join(dataDir, 'spins'), { recursive: true });
let fetched = 0;
for (const item of items) {
  for (const frame of frames) {
    const file = join(dataDir, 'spins', `${item.modelId}-${frame}.jpg`);
    if (existsSync(file)) continue;
    const path = spins.get(item.spinId)?.get(frame);
    if (!path) throw new Error(`Spin ${item.spinId} has no frame ${frame}.`);
    const response = await fetch(`${BUCKET}/spins/original/${path}`);
    if (!response.ok) throw new Error(`GET ${path} failed with ${response.status}.`);
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    fetched += 1;
  }
}
console.log(JSON.stringify({ items: items.length, frames, fetched }));
