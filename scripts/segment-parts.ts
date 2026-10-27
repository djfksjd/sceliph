/**
 * Opt-in offline part segmentation: Grounding DINO (text → box) + SAM 2.1
 * (box → mask). Never writes AssemblyIR; masks are `estimated` evidence for the
 * silhouette fitter.
 *
 * Requires a separately installed @huggingface/transformers 4.3.1
 * (`--runtime-dir`, the directory containing its node_modules) and a local
 * model directory (`--model-dir`) laid out as `<model-dir>/<repo id>/...` with
 * the files of the pinned revisions below. The CLI disables remote downloads,
 * verifies every model file hash and refuses to overwrite earlier output.
 *
 *   npx vite-node scripts/segment-parts.ts -- --runtime-dir DIR --model-dir DIR \
 *     --input photo.jpg (--prompts prompts.json | --box-request box-request.json --boxes reply.json) \
 *     --output outputs/run [--max-side 640] [--threshold 0.25]
 *
 * With --box-request/--boxes (see scripts/part-box-sheet.ts) every part uses
 * the validated LLM/VLM boxes; a part the reply omits is `not-located` and is
 * never replaced by text detection.
 *
 * prompts.json: [{ "id": "box", "text": "a box.", "componentIds": ["box"] }, ...]
 * An optional "box": [x0, y0, x1, y1] (resized-image pixels) skips text
 * detection for that part, e.g. when an LLM or the user points at the part.
 * Part masks that cover nearly the whole object are marked `suspect` and are
 * not used by scripts/photo-shape-fit.ts.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { validatePartBoxResponse, type PartBoxRequest } from '../src/engine/part-box-response';

const DETECTOR = { id: 'onnx-community/grounding-dino-tiny-ONNX', revision: 'ff690b0a8050566c290287545bd059350f3e9096' };
const SEGMENTER = { id: 'onnx-community/sam2.1-hiera-tiny-ONNX', revision: '814a066640debee5a91e70aa401fb8e17e030503' };
const PINNED_FILES: Array<[string, number, string]> = [
  [`${DETECTOR.id}/onnx/model.onnx`, 718_761_381, '267c8b00d269dc2dda0d8592812d3027abd5fb59f1cabf8e3d56f8fdf07f68ec'],
  [`${DETECTOR.id}/tokenizer.json`, 711_396, 'd241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66'],
  [`${SEGMENTER.id}/onnx/vision_encoder.onnx`, 354_238, '4f30aacd3aaefbca81a0b7fe4c1fc96345570ea0a6f80ced599493d1b3be2e8c'],
  [`${SEGMENTER.id}/onnx/vision_encoder.onnx_data`, 134_084_864, 'e83df9866a5afe68ea7f0f721f18f65137fc3acbf0da1c74e946d363e09c69cc'],
  [`${SEGMENTER.id}/onnx/prompt_encoder_mask_decoder.onnx`, 213_114, '874414704c5d686db7d206a35f6e15d26563d50c8c4468fccc6739bd7e491dcf'],
  [`${SEGMENTER.id}/onnx/prompt_encoder_mask_decoder.onnx_data`, 20_958_208, 'e9874d900dd4134ed60eab1e97910327c2419e0b2954485d8fd6e7f1a1470f47'],
];
const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_PROMPTS = 16;

type Box = [number, number, number, number];
interface PartPrompt { id: string; text: string; componentIds?: string[]; box?: Box; boxes?: Box[] }
interface Tensor { data: ArrayLike<number | boolean>; dims: number[] }

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function required(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`Missing --${name}.`);
  return value;
}
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const runtimeDir = resolve(required('runtime-dir'));
const modelDir = resolve(required('model-dir'));
const inputPath = resolve(required('input'));
const outputDir = resolve(required('output'));
const maxSide = Number(argument('max-side') ?? 640);
const threshold = Number(argument('threshold') ?? 0.25);
if (!Number.isInteger(maxSide) || maxSide < 64 || maxSide > 1024) throw new Error('--max-side must be an integer within 64..1024.');
if (!(Number.isFinite(threshold) && threshold > 0 && threshold < 1)) throw new Error('--threshold must be within (0, 1).');
const inputBytes = readFileSync(inputPath);
const boxRequestPath = argument('box-request');
let boxRequest: PartBoxRequest | undefined;
let prompts: PartPrompt[];
if (boxRequestPath) {
  boxRequest = JSON.parse(readFileSync(resolve(boxRequestPath), 'utf8')) as PartBoxRequest;
  if (boxRequest.schema !== 'sceliph.part-box-request/0.1') throw new Error('Unsupported part box request.');
  if (boxRequest.image.sha256 !== sha256(inputBytes) || boxRequest.image.maxSide !== maxSide) throw new Error('Box request was prepared for a different image or max side.');
  const reply = validatePartBoxResponse(JSON.parse(readFileSync(resolve(required('boxes')), 'utf8')), boxRequest);
  prompts = boxRequest.parts.map((part) => ({
    id: part.id,
    text: part.description.slice(0, 120),
    componentIds: part.componentIds,
    boxes: reply.parts.find((item) => item.id === part.id)?.boxes ?? [],
  }));
} else {
  prompts = JSON.parse(readFileSync(resolve(required('prompts')), 'utf8')) as PartPrompt[];
}
if (!Array.isArray(prompts) || prompts.length < 1 || prompts.length > MAX_PROMPTS) throw new Error(`Prompts must list 1–${MAX_PROMPTS} parts.`);
const promptIds = new Set<string>();
for (const prompt of prompts) {
  if (typeof prompt.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(prompt.id) || promptIds.has(prompt.id)) throw new Error('Prompt ids must be unique [A-Za-z0-9_-]{1,64}.');
  if (typeof prompt.text !== 'string' || prompt.text.length < 2 || prompt.text.length > 120) throw new Error(`Prompt ${prompt.id} text must be 2–120 characters.`);
  if (prompt.box !== undefined && (!Array.isArray(prompt.box) || prompt.box.length !== 4 || !prompt.box.every(Number.isFinite)
    || prompt.box[2] <= prompt.box[0] || prompt.box[3] <= prompt.box[1])) throw new Error(`Prompt ${prompt.id} box must be [x0, y0, x1, y1] with x1 > x0 and y1 > y0.`);
  if (prompt.boxes !== undefined && (!Array.isArray(prompt.boxes) || prompt.boxes.length > 8)) throw new Error(`Prompt ${prompt.id} may list at most 8 boxes.`);
  promptIds.add(prompt.id);
}
/**
 * A part mask is suspect when it swallowed the object: it covers at least this
 * share of the union and contains most pixels of every other segmented part.
 */
const SUSPECT_UNION_SHARE = 0.9;
const SUSPECT_CONTAINED_SHARE = 0.8;
for (const [path, bytes, digest] of PINNED_FILES) {
  const absolute = join(modelDir, path);
  if (statSync(absolute).size !== bytes || sha256(readFileSync(absolute)) !== digest) throw new Error(`Unreviewed model file ${path}.`);
}
if (inputBytes.byteLength > MAX_INPUT_BYTES) throw new Error('Input image byte budget exceeded.');
if (existsSync(join(outputDir, 'manifest.json'))) throw new Error('Output already contains masks; choose a fresh directory.');
mkdirSync(outputDir, { recursive: true });

const transformers = createRequire(join(runtimeDir, 'package.json'))('@huggingface/transformers') as {
  env: { allowRemoteModels: boolean; allowLocalModels: boolean; localModelPath: string };
  RawImage: new (data: Uint8ClampedArray, width: number, height: number, channels: number) => unknown;
  pipeline: (task: string, model: string, options: Record<string, unknown>) => Promise<(image: unknown, labels: string[], options: Record<string, unknown>) => Promise<Array<{ score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } }>>>;
  Sam2Model: { from_pretrained(id: string, options: Record<string, unknown>): Promise<(inputs: unknown) => Promise<{ pred_masks: Tensor; iou_scores: Tensor }>> };
  AutoProcessor: { from_pretrained(id: string, options: Record<string, unknown>): Promise<((image: unknown, options: Record<string, unknown>) => Promise<{ original_sizes: unknown; reshaped_input_sizes: unknown }>) & { post_process_masks(masks: Tensor, original: unknown, reshaped: unknown): Promise<Tensor[]> }> };
};
transformers.env.allowRemoteModels = false;
transformers.env.allowLocalModels = true;
transformers.env.localModelPath = `${modelDir}/`;

const image = await loadImage(inputBytes);
if (image.width < 2 || image.height < 2 || image.width * image.height > 16_777_216) throw new Error('Input image dimensions are unsafe.');
const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
const width = Math.max(2, Math.round(image.width * scale));
const height = Math.max(2, Math.round(image.height * scale));
const canvas = createCanvas(width, height);
const context = canvas.getContext('2d');
context.drawImage(image, 0, 0, width, height);
const rgba = context.getImageData(0, 0, width, height).data;
const rgb = new Uint8ClampedArray(width * height * 3);
for (let i = 0; i < width * height; i += 1) {
  rgb[i * 3] = rgba[i * 4]!;
  rgb[i * 3 + 1] = rgba[i * 4 + 1]!;
  rgb[i * 3 + 2] = rgba[i * 4 + 2]!;
}
const raw = new transformers.RawImage(rgb, width, height, 3);

const started = performance.now();
// Load the text detector only when some part has no box.
const detector = prompts.some((prompt) => !prompt.box && !prompt.boxes)
  ? await transformers.pipeline('zero-shot-object-detection', DETECTOR.id, { dtype: 'fp32' })
  : undefined;
const segmenter = await transformers.Sam2Model.from_pretrained(SEGMENTER.id, { dtype: 'fp32' });
const processor = await transformers.AutoProcessor.from_pretrained(SEGMENTER.id, {});

function writeMask(name: string, mask: Uint8Array): string {
  const out = createCanvas(width, height);
  const ctx = out.getContext('2d');
  const data = ctx.createImageData(width, height);
  for (let i = 0; i < mask.length; i += 1) {
    const value = mask[i] ? 255 : 0;
    data.data[i * 4] = value;
    data.data[i * 4 + 1] = value;
    data.data[i * 4 + 2] = value;
    data.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const bytes = out.toBuffer('image/png');
  writeFileSync(join(outputDir, name), bytes);
  return sha256(bytes);
}

const union = new Uint8Array(width * height);
const parts = [];
async function segmentBox(box: Box): Promise<{ mask: Uint8Array; score: number }> {
  const inputs = await processor(raw, { input_boxes: [[box]] });
  const output = await segmenter(inputs);
  const masks = await processor.post_process_masks(output.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);
  const candidates = masks[0]!;
  const count = candidates.dims[1]!;
  let chosen = 0;
  for (let k = 1; k < count; k += 1) if (Number(output.iou_scores.data[k]) > Number(output.iou_scores.data[chosen])) chosen = k;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i += 1) mask[i] = candidates.data[chosen * width * height + i] ? 1 : 0;
  return { mask, score: Number(output.iou_scores.data[chosen]) };
}

for (const prompt of prompts) {
  let boxes = prompt.boxes ?? (prompt.box ? [prompt.box] : undefined);
  let boxSource: 'llm-box' | 'given-box' | 'text-detection' = boxRequest ? 'llm-box' : 'given-box';
  let detectionScore = 1;
  if (boxes && boxes.length === 0) {
    parts.push({ id: prompt.id, text: prompt.text, componentIds: prompt.componentIds ?? [], status: 'not-located' as const });
    continue;
  }
  if (!boxes) {
    // The exported detector has a fixed text batch of 1, so prompts run one at a time.
    const best = (await detector!(raw, [prompt.text], { threshold })).sort((a, b) => b.score - a.score)[0];
    if (!best) {
      parts.push({ id: prompt.id, text: prompt.text, componentIds: prompt.componentIds ?? [], status: 'not-detected' as const });
      continue;
    }
    boxes = [[best.box.xmin, best.box.ymin, best.box.xmax, best.box.ymax]];
    boxSource = 'text-detection';
    detectionScore = best.score;
  }
  const mask = new Uint8Array(width * height);
  const maskIouScores: number[] = [];
  for (const box of boxes) {
    const result = await segmentBox(box);
    maskIouScores.push(result.score);
    for (let i = 0; i < mask.length; i += 1) if (result.mask[i]) mask[i] = 1;
  }
  let pixels = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) {
      union[i] = 1;
      pixels += 1;
    }
  }
  parts.push({
    id: prompt.id,
    text: prompt.text,
    componentIds: prompt.componentIds ?? [],
    status: 'segmented' as 'segmented' | 'suspect',
    mask,
    boxSource,
    detectionScore,
    boxes,
    maskIouScores,
    pixels,
    file: `${prompt.id}.png`,
    sha256: writeMask(`${prompt.id}.png`, mask),
  });
}
const unionPixels = union.reduce((sum, value) => sum + value, 0);
const segmentedParts = parts.filter((part) => part.status === 'segmented') as Array<Extract<(typeof parts)[number], { mask: Uint8Array }>>;
if (segmentedParts.length > 1) {
  for (const part of segmentedParts) {
    if (part.pixels < SUSPECT_UNION_SHARE * unionPixels) continue;
    const swallowsOthers = segmentedParts.filter((other) => other !== part).every((other) => {
      let inside = 0;
      for (let i = 0; i < other.mask.length; i += 1) if (other.mask[i] && part.mask[i]) inside += 1;
      return inside >= SUSPECT_CONTAINED_SHARE * other.pixels;
    });
    if (swallowsOthers) {
      Object.assign(part, { status: 'suspect', reason: `Mask covers ${(100 * part.pixels / unionPixels).toFixed(1)}% of the object union and contains the other parts; likely the whole object, not the part.` });
    }
  }
}
for (const part of parts) delete (part as { mask?: Uint8Array }).mask;
const unionSha = writeMask('object.png', union);
writeFileSync(join(outputDir, 'manifest.json'), `${JSON.stringify({
  schema: 'sceliph.part-segmentation/0.1',
  provenance: 'estimated',
  writesAssemblyIR: false,
  detector: DETECTOR,
  segmenter: SEGMENTER,
  input: { sha256: sha256(inputBytes), width, height, maxSide },
  threshold,
  ...(boxRequest ? { boxRequestSha256: sha256(readFileSync(resolve(boxRequestPath!))), boxReplySha256: sha256(readFileSync(resolve(required('boxes')))) } : {}),
  parts,
  object: { file: 'object.png', sha256: unionSha, pixels: unionPixels },
  limitations: [
    'Masks are model estimates of visible regions; occluded portions are absent.',
    'Text detection keeps one box per prompt (highest score); LLM/VLM boxes are prompts whose placement is not verified.',
  ],
}, null, 2)}\n`);
writeFileSync(join(outputDir, 'run.json'), `${JSON.stringify({ schema: 'sceliph.part-segmentation-run/0.1', elapsedMs: Math.round(performance.now() - started), note: 'Host-specific timing.' }, null, 2)}\n`);
console.log(JSON.stringify(parts.map((part) => ({ id: part.id, status: part.status, pixels: 'pixels' in part ? part.pixels : 0 }))));
