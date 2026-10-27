/**
 * Prepares a coordinate-gridded review sheet so an LLM/VLM (or a person) can
 * point at parts by box. Writes box-sheet.png and box-request.json; the reply
 * (sceliph.part-box-response/0.1) is passed to scripts/segment-parts.ts --boxes.
 *
 *   npx vite-node scripts/part-box-sheet.ts -- --input photo.jpg --parts parts.json --output DIR [--max-side 640]
 *
 * parts.json: [{ "id": "stand", "description": "black tubular stand", "componentIds": ["stand"] }, ...]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { PART_BOX_INSTRUCTIONS, type PartBoxRequest } from '../src/engine/part-box-response';
import { sha256 } from './lib/moge-runtime';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const inputBytes = readFileSync(resolve(argument('input')!));
const outputDir = resolve(argument('output')!);
const maxSide = Number(argument('max-side') ?? 640);
if (!Number.isInteger(maxSide) || maxSide < 64 || maxSide > 1024) throw new Error('--max-side must be an integer within 64..1024.');
const parts = JSON.parse(readFileSync(resolve(argument('parts')!), 'utf8')) as PartBoxRequest['parts'];
if (!Array.isArray(parts) || parts.length < 1 || parts.length > 16) throw new Error('Parts must list 1–16 entries.');
const ids = new Set<string>();
for (const part of parts) {
  if (typeof part.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(part.id) || ids.has(part.id)) throw new Error('Part ids must be unique [A-Za-z0-9_-]{1,64}.');
  if (typeof part.description !== 'string' || part.description.length < 2 || part.description.length > 160) throw new Error(`Part ${part.id} description must be 2–160 characters.`);
  if (!Array.isArray(part.componentIds)) throw new Error(`Part ${part.id} componentIds must be an array.`);
  ids.add(part.id);
}
if (existsSync(join(outputDir, 'box-request.json'))) throw new Error('Output already contains a box request; choose a fresh directory.');

// Same resize rule as scripts/segment-parts.ts and scripts/lib/moge-runtime.ts.
const image = await loadImage(inputBytes);
const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
const width = Math.max(2, Math.round(image.width * scale));
const height = Math.max(2, Math.round(image.height * scale));
const canvas = createCanvas(width, height);
const context = canvas.getContext('2d');
context.drawImage(image, 0, 0, width, height);
context.lineWidth = 1;
for (let x = 0; x <= width; x += 32) {
  context.strokeStyle = x % 64 === 0 ? 'rgba(255,0,180,0.75)' : 'rgba(255,0,180,0.3)';
  context.beginPath();
  context.moveTo(x + 0.5, 0);
  context.lineTo(x + 0.5, height);
  context.stroke();
}
for (let y = 0; y <= height; y += 32) {
  context.strokeStyle = y % 64 === 0 ? 'rgba(255,0,180,0.75)' : 'rgba(255,0,180,0.3)';
  context.beginPath();
  context.moveTo(0, y + 0.5);
  context.lineTo(width, y + 0.5);
  context.stroke();
}
context.font = '10px sans-serif';
context.fillStyle = 'rgb(200,0,140)';
for (let x = 64; x < width; x += 64) context.fillText(String(x), x + 2, 10);
for (let y = 64; y < height; y += 64) context.fillText(String(y), 2, y - 2);

const request: PartBoxRequest = {
  schema: 'sceliph.part-box-request/0.1',
  // Bound to the original file bytes, which segment-parts also hashes.
  image: { sha256: sha256(inputBytes), width, height, maxSide },
  parts,
  instructions: PART_BOX_INSTRUCTIONS,
};
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'box-sheet.png'), canvas.toBuffer('image/png'));
writeFileSync(join(outputDir, 'box-request.json'), `${JSON.stringify(request, null, 2)}\n`);
console.log(JSON.stringify({ sheet: join(outputDir, 'box-sheet.png'), request: join(outputDir, 'box-request.json'), width, height }));
