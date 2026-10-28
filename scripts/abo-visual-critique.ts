/**
 * Visual self-critique on two turntable photos (slice 16). For each item the
 * model's two-photo IR (arm a2 of scripts/abo-multiview-eval.ts) is overlaid on
 * both photos from jointly fitted turntable cameras (src/engine/photo-part-color.ts,
 * side frame = front + 90°, sign fixed on dev with ground truth): every part in
 * its own colour, product pixels the model misses in magenta, model pixels
 * outside the product outlined in cyan. The model sees the photos, the overlays
 * and its IR and writes a corrected IR. A revision is kept only when the mean
 * silhouette IoU over both photos improves by at least `minGain` (cameras refit);
 * otherwise the previous IR stands. Ground truth is used for scoring only.
 *
 *   npx vite-node scripts/abo-visual-critique.ts -- --run RUN_DIR --selection selection.json --data-dir DIR \
 *     --protocol protocol.json --model sonnet --workdir EMPTY_DIR --output OUT_DIR --sam-runtime-dir DIR --sam-model-dir DIR \
 *     [--rounds 2] [--candidates 1] [--focus] [--only id,id] [--dump-overlays]
 *
 * ABO data, images and 3D models © Amazon.com, CC-BY-4.0.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { formatAssemblyFeedback } from '../src/engine/assembly-feedback';
import type { AssemblyIR } from '../src/engine/assembly-ir';
import { compareMeshShapes, type MeshCompareOptions, type MeshCompareResult } from '../src/engine/mesh-shape-compare';
import { rasterizeIdBuffer } from '../src/engine/mesh-silhouette-raster';
import { orbitToPinhole } from '../src/engine/orbit-camera';
import { fitTurntableCameras, type TurntableFit } from '../src/engine/photo-part-color';
import { assemblyMeshes, foregroundMask, maskBox, preparePhoto, samObjectMask } from './lib/abo-eval';
import { callClaudeWithImage, type ClaudeCallRecord } from './lib/claude-cli';
import { readGlbTriangles } from './lib/glb-triangles';
import { stripDimensions } from './lib/product-name';
import { parseViewAssemblyReply } from './lib/view-assembly-reply';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function required(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`Missing --${name}.`);
  return value;
}

export const TURNTABLE_SIGN = 1 as const;
const PALETTE = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080'];
const CRITIQUE = [
  'Images 1 and 2 are the two catalog photos (the second is the same product after the turntable turned it a quarter turn).',
  'Images 3 and 4 overlay your current model on those photos, seen from cameras fitted to both photos: each part is drawn in its own colour (legend below), magenta marks product pixels your model misses, and cyan outlines mark model pixels outside the product.',
  'Compare carefully and correct the model: part sizes, positions, proportions, profiles and paths. Keep part ids where a part persists, keep the overall height, keep connected parts touching (move a shade together with the arm that holds it). Do not add the floor or background.',
  'Return the full corrected JSON object, the same format as before.',
].join('\n');

interface Protocol { guide: string; maxRounds: number; padShare: number; maxSide: number; backgroundThreshold: number; frames: { front: number; side: number }; compare: MeshCompareOptions }

const protocol = JSON.parse(readFileSync(resolve(required('protocol')), 'utf8')) as Protocol;
const selection = JSON.parse(readFileSync(resolve(required('selection')), 'utf8')) as { items: Array<{ modelId: string; name: string; heightMm: number; stratum?: string; productType: string }> };
const runDir = resolve(required('run'));
const dataDir = resolve(required('data-dir'));
const model = required('model');
const workdir = resolve(required('workdir'));
if (!existsSync(workdir) || readdirSync(workdir).length > 0) throw new Error('--workdir must be an existing empty directory.');
const outDir = resolve(required('output'));
mkdirSync(outDir, { recursive: true });
const rounds = Number(argument('rounds') ?? 2);
const minGain = Number(argument('min-gain') ?? 0.01);
const candidates = Number(argument('candidates') ?? 1);
const focus = process.argv.includes('--focus');
const only = argument('only')?.split(',');
const dump = process.argv.includes('--dump-overlays');
const run = JSON.parse(readFileSync(join(runDir, 'results.json'), 'utf8')) as { results: Array<{ modelId: string; excluded?: string; a2View?: { azimuthDeg: number; elevationDeg: number } }> };

const summarize = (result: MeshCompareResult) => ({ meanIoU: result.meanIoU, chamfer: result.chamfer, fScore5: result.fScore.at5, fScore2: result.fScore.at2, extentError: result.extentError, footprintError: result.footprintError, yawDeg: result.yawDeg });

function overlayPng(photo: { rgba: Uint8ClampedArray; width: number; height: number }, mask: Uint8Array, ids: Int16Array): Buffer {
  const { width, height } = photo;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  const rgb = PALETTE.map((hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)));
  for (let p = 0; p < width * height; p += 1) {
    let [r, g, b] = [photo.rgba[p * 4]!, photo.rgba[p * 4 + 1]!, photo.rgba[p * 4 + 2]!];
    const id = ids[p]!;
    if (id >= 0) {
      const c = rgb[id % rgb.length]!;
      [r, g, b] = [r * 0.45 + c[0]! * 0.55, g * 0.45 + c[1]! * 0.55, b * 0.45 + c[2]! * 0.55];
      const x = p % width;
      const y = Math.floor(p / width);
      const edge = x > 0 && x < width - 1 && y > 0 && y < height - 1 && [p - 1, p + 1, p - width, p + width].some((q) => ids[q]! < 0);
      if (edge && !mask[p]) [r, g, b] = [0, 220, 255];
    } else if (mask[p]) {
      [r, g, b] = [r * 0.35 + 255 * 0.65, g * 0.35, b * 0.35 + 255 * 0.65];
    }
    image.data.set([Math.round(r), Math.round(g), Math.round(b), 255], p * 4);
  }
  context.putImageData(image, 0, 0);
  return canvas.toBuffer('image/png');
}

/**
 * Measured discrepancies for the prompt: connected regions of missed product
 * pixels (photo, not model) and extra model pixels (model, not photo) above 0.4%
 * of the product area, each tied to the nearest part and sized in mm at the
 * model's depth (distance / focal).
 */
function discrepancies(mask: Uint8Array, ids: Int16Array, width: number, height: number, mmPerPx: number, componentIds: string[], label: string): Array<{ size: number; part?: string; text: string }> {
  const area = mask.reduce((sum, value) => sum + value, 0) || 1;
  const kinds: Array<['missing' | 'extra', (p: number) => boolean]> = [['missing', (p) => mask[p] === 1 && ids[p]! < 0], ['extra', (p) => mask[p] !== 1 && ids[p]! >= 0]];
  const lines: Array<{ size: number; part?: string; text: string }> = [];
  for (const [kind, test] of kinds) {
    const seen = new Uint8Array(width * height);
    for (let start = 0; start < width * height; start += 1) {
      if (seen[start] || !test(start)) continue;
      const stack = [start];
      seen[start] = 1;
      let n = 0; let sx = 0; let sy = 0; let x0 = width; let y0 = height; let x1 = 0; let y1 = 0;
      const touching = new Map<number, number>();
      while (stack.length) {
        const p = stack.pop()!;
        const x = p % width; const y = Math.floor(p / width);
        n += 1; sx += x; sy += y; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        for (const q of [p - 1, p + 1, p - width, p + width]) {
          if (q < 0 || q >= width * height || Math.abs((q % width) - x) > 1) continue;
          if (ids[q]! >= 0) touching.set(ids[q]!, (touching.get(ids[q]!) ?? 0) + 1);
          if (!seen[q] && test(q)) { seen[q] = 1; stack.push(q); }
        }
      }
      if (n < area * 0.004) continue;
      const part = [...touching.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const near = part === undefined ? 'not touching any part' : `next to part "${componentIds[part]}"`;
      const where = `${Math.round((sx / n) / width * 100)}% from left, ${Math.round((sy / n) / height * 100)}% from top`;
      lines.push({ size: n, ...(part === undefined ? {} : { part: componentIds[part]! }), text: `${label}: ${kind === 'missing' ? 'product not covered by the model' : 'model outside the product'}, ${near}, about ${Math.round((x1 - x0 + 1) * mmPerPx)} × ${Math.round((y1 - y0 + 1) * mmPerPx)} mm (w × h), centred ${where}` });
    }
  }
  return lines.sort((a, b) => b.size - a.size).slice(0, 6);
}

const results = [];
let totalCost = 0;
for (const entry of run.results) {
  if (entry.excluded || (only && !only.includes(entry.modelId))) continue;
  const irPath = join(runDir, `${entry.modelId}-a2-ir.json`);
  if (!existsSync(irPath)) continue;
  const item = selection.items.find((candidate) => candidate.modelId === entry.modelId)!;
  const started = performance.now();
  const photos = [];
  for (const frame of [protocol.frames.front, protocol.frames.side]) {
    const photo = await preparePhoto(join(dataDir, 'spins', `${item.modelId}-${frame}.jpg`), protocol);
    const photoFile = join(outDir, `${item.modelId}-${frame}.png`);
    writeFileSync(photoFile, photo.png);
    const foreground = foregroundMask(photo.rgba, photo.width, photo.height, protocol.backgroundThreshold);
    const box = maskBox(foreground, photo.width)!;
    const sam = await samObjectMask({ photoFile, box, workDir: outDir, stem: `${item.modelId}-${frame}`, width: photo.width, height: photo.height, maxSide: protocol.maxSide, samRuntimeDir: required('sam-runtime-dir'), samModelDir: required('sam-model-dir') });
    // The dataset's background is already white: SAM fills the holes of open frames,
    // so keep only its pixels that are not studio white.
    const mask = sam.map((value, i) => (value && foreground[i] ? 1 : 0));
    photos.push({ ...photo, mask });
  }
  const views: [{ mask: Uint8Array; width: number; height: number }, { mask: Uint8Array; width: number; height: number }] = [
    { mask: photos[0]!.mask, width: photos[0]!.width, height: photos[0]!.height },
    { mask: photos[1]!.mask, width: photos[1]!.width, height: photos[1]!.height },
  ];
  const fitFor = (ir: AssemblyIR, hint?: { azimuthDeg: number; elevationDeg: number }): TurntableFit => fitTurntableCameras(assemblyMeshes(ir), views, TURNTABLE_SIGN, { seed: 1, maxEvaluations: 2400, ...(hint ? { viewHint: hint } : {}) });
  let current = JSON.parse(readFileSync(irPath, 'utf8')) as AssemblyIR;
  let currentView = entry.a2View;
  let fit = fitFor(current, currentView);
  const history: Array<{ round: number; iou: [number, number]; accepted: boolean; focus?: string; reason?: string }> = [{ round: 0, iou: fit.iou, accepted: true }];
  const calls: Array<ClaudeCallRecord & { round: number }> = [];
  const request = [`Catalog photos (background removed) of: ${stripDimensions(item.name)}.`, `The product listing gives its overall height as ${Math.round(item.heightMm)} mm.`].join('\n');
  for (let round = 1; round <= rounds; round += 1) {
    const idBuffers = fit.cameras.map((camera) => rasterizeIdBuffer(orbitToPinhole(camera), assemblyMeshes(current)));
    const overlays = fit.cameras.map((camera, k) => overlayPng(photos[k]!, photos[k]!.mask, idBuffers[k]!));
    const found = fit.cameras.flatMap((camera, k) => discrepancies(photos[k]!.mask, idBuffers[k]!, photos[k]!.width, photos[k]!.height, camera.distanceMm / camera.fx, current.components.map((component) => component.id), k === 0 ? 'Photo 1' : 'Photo 2')).sort((a, b) => b.size - a.size);
    const measured = found.slice(0, 6).map((line) => line.text);
    const target = found.find((line) => line.part)?.part;
    const focusText = focus && target ? `\n\nThis round, fix only part "${target}" (and move parts attached to it just enough to stay connected). Copy every other part exactly as it is.` : '';
    if (dump) overlays.forEach((png, k) => writeFileSync(join(outDir, `${item.modelId}-overlay-r${round}-${k}.png`), png));
    const legend = current.components.map((component, index) => `${PALETTE[index % PALETTE.length]} ${component.id} (${component.name})`).join('\n');
    const overlap = `Silhouette overlap now: photo 1 ${(fit.iou[0] * 100).toFixed(1)}%, photo 2 ${(fit.iou[1] * 100).toFixed(1)}%.`;
    const prompt = `${request}\n\n${CRITIQUE}\n\nLegend:\n${legend}\n\n${overlap}\nLargest measured differences (sizes at the model's depth; trust them over guesses):\n${measured.length ? measured.map((line) => `- ${line}`).join('\n') : '- none above 0.4% of the product area'}${focusText}\n\nYour current model:\n${JSON.stringify({ view: currentView, assembly: current })}`;
    let best: { ir: AssemblyIR; view: { azimuthDeg: number; elevationDeg: number }; fit: TurntableFit; gain: number } | undefined;
    for (let candidate = 0; candidate < candidates; candidate += 1) {
    let revised: { ir: AssemblyIR; view: { azimuthDeg: number; elevationDeg: number } } | undefined;
    let text = prompt;
    for (let attempt = 0; attempt < protocol.maxRounds && !revised; attempt += 1) {
      const { text: reply, record } = await callClaudeWithImage({ model, systemPrompt: protocol.guide, workdir, image: photos[0]!.png, extraImages: [photos[1]!.png, overlays[0]!, overlays[1]!], mediaType: 'image/png', text });
      calls.push({ round, ...record });
      totalCost += record.costUsd;
      const parsed = parseViewAssemblyReply(reply, []);
      if (parsed.ir && parsed.view) revised = { ir: parsed.ir, view: parsed.view };
      else text = `${prompt}\n\nYour previous reply:\n${reply.slice(0, 20_000)}\n\n${parsed.feedback.pass ? '' : formatAssemblyFeedback(parsed.feedback)}${parsed.viewIssue ? `\n${parsed.viewIssue}` : ''}\nReturn the corrected JSON object only.`;
    }
    if (!revised) continue;
    const candidateFit = fitFor(revised.ir, revised.view);
    const candidateGain = (candidateFit.iou[0] + candidateFit.iou[1]) / 2 - (fit.iou[0] + fit.iou[1]) / 2;
    writeFileSync(join(outDir, `${item.modelId}-r${round}-c${candidate}-ir.json`), `${JSON.stringify(revised.ir, null, 1)}\n`);
    if (!best || candidateGain > best.gain) best = { ...revised, fit: candidateFit, gain: candidateGain };
    }
    if (!best) {
      history.push({ round, iou: fit.iou, accepted: false, reason: 'no valid reply' });
      break;
    }
    const accepted = best.gain >= minGain;
    history.push({ round, iou: best.fit.iou, accepted, ...(focus && target ? { focus: target } : {}), ...(accepted ? {} : { reason: `gain ${best.gain.toFixed(4)} < ${minGain}` }) });
    if (!accepted) break;
    current = best.ir;
    currentView = best.view;
    fit = best.fit;
  }
  writeFileSync(join(outDir, `${item.modelId}-final-ir.json`), `${JSON.stringify(current, null, 1)}\n`);
  writeFileSync(join(outDir, `${item.modelId}-critique-calls.json`), `${JSON.stringify({ request, calls, history }, null, 1)}\n`);
  const truth = await readGlbTriangles(join(dataDir, 'models', `${item.modelId}.glb`));
  const original = JSON.parse(readFileSync(irPath, 'utf8')) as AssemblyIR;
  const scores = {
    a2: summarize(compareMeshShapes(assemblyMeshes(original), truth.meshes, protocol.compare)),
    critique: summarize(compareMeshShapes(assemblyMeshes(current), truth.meshes, protocol.compare)),
  };
  const record = { modelId: item.modelId, productType: item.productType, stratum: item.stratum, accepted: history.filter((h) => h.round > 0 && h.accepted).length, history, scores, costUsd: +calls.reduce((a, c) => a + c.costUsd, 0).toFixed(4), ms: Math.round(performance.now() - started) };
  results.push(record);
  console.log(JSON.stringify({ modelId: record.modelId, accepted: record.accepted, iou: history.map((h) => h.iou.map((v) => v.toFixed(2)).join('/')), f2: [scores.a2.fScore2, scores.critique.fScore2], fp: [Math.max(...scores.a2.footprintError), Math.max(...scores.critique.footprintError)] }));
}
writeFileSync(join(outDir, 'results.json'), `${JSON.stringify({
  schema: 'sceliph.abo-visual-critique/0.1',
  protocolSha256: createHash('sha256').update(readFileSync(resolve(required('protocol')))).digest('hex'),
  sourceRun: runDir.split('/').slice(-2).join('/'),
  model, rounds, minGain, candidates, focus, turntableSign: TURNTABLE_SIGN,
  totalCostUsd: +totalCost.toFixed(4),
  results,
}, null, 1)}\n`);
