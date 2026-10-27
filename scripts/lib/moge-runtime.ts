import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { finalizeMogeOutput, type MogeGeometry } from '../../src/engine/moge-geometry';

export const MOGE_MODEL_ID = 'Ruicheng/moge-2-vits-normal-onnx@e50ffda41565591092adea54c6ac83d6212e1e23';
export const MOGE_MODEL_SHA256 = '24eacb5dc7a2c54c7bc98f7de085ffbed79ad006ea5b664c2c2cdc02ff3a52f0';
const MODEL_BYTES = 140_852_051;
const MAX_INPUT_BYTES = 16 * 1024 * 1024;

interface OrtTensor { data: Float32Array | BigInt64Array; dims: readonly number[] }
interface OrtModule {
  Tensor: new (type: string, data: Float32Array | BigInt64Array, dims: number[]) => OrtTensor;
  InferenceSession: { create(path: string, options: Record<string, unknown>): Promise<{ run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>> }> };
}

export const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Verifies the pinned model, resizes the image (longest side ≤ maxSide) and runs MoGe-2 on CPU. */
export async function runMoge(options: {
  modelPath: string;
  runtimeDir: string;
  inputBytes: Uint8Array;
  maxSide: number;
  tokens: number;
  fovXDegrees?: number;
}): Promise<{ geometry: MogeGeometry; modelSha256: string; rgba: Uint8ClampedArray; sessionLoadMs: number; inferenceMs: number }> {
  const { maxSide, tokens } = options;
  if (!Number.isInteger(maxSide) || maxSide < 64 || maxSide > 1024) throw new Error('MoGe max side must be an integer within 64..1024.');
  if (!Number.isInteger(tokens) || tokens < 1200 || tokens > 3600) throw new Error('MoGe tokens must be an integer within 1200..3600.');
  if (options.inputBytes.byteLength > MAX_INPUT_BYTES) throw new Error('Input image byte budget exceeded.');
  if (statSync(options.modelPath).size !== MODEL_BYTES) throw new Error('Unreviewed MoGe model size.');
  const modelSha256 = sha256(readFileSync(options.modelPath));
  if (modelSha256 !== MOGE_MODEL_SHA256) throw new Error('Unreviewed MoGe model hash.');
  const ort = createRequire(join(options.runtimeDir, 'package.json'))('onnxruntime-node') as OrtModule;
  const image = await loadImage(Buffer.from(options.inputBytes));
  if (image.width < 2 || image.height < 2 || image.width * image.height > 16_777_216) throw new Error('Input image dimensions are unsafe.');
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(2, Math.round(image.width * scale));
  const height = Math.max(2, Math.round(image.height * scale));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, width, height).data;
  const pixels = new Float32Array(3 * width * height);
  for (let i = 0; i < width * height; i += 1) {
    for (let channel = 0; channel < 3; channel += 1) pixels[channel * width * height + i] = rgba[i * 4 + channel]! / 255;
  }
  const started = performance.now();
  const session = await ort.InferenceSession.create(options.modelPath, { executionProviders: ['cpu'], intraOpNumThreads: 4, graphOptimizationLevel: 'all' });
  const loaded = performance.now();
  const outputs = await session.run({
    image: new ort.Tensor('float32', pixels, [1, 3, height, width]),
    num_tokens: new ort.Tensor('int64', BigInt64Array.of(BigInt(tokens)), []),
  });
  const inferred = performance.now();
  const pick = (name: string): OrtTensor => {
    const tensor = outputs[name];
    if (!tensor) throw new Error(`MoGe output ${name} is missing.`);
    return tensor;
  };
  const geometry = finalizeMogeOutput({
    width,
    height,
    points: Float32Array.from(pick('points').data as Float32Array),
    normal: Float32Array.from(pick('normal').data as Float32Array),
    mask: Float32Array.from(pick('mask').data as Float32Array),
    // The official export names the exp()-ed metric scale head output `scale`.
    metricScale: Number((pick(outputs.metric_scale ? 'metric_scale' : 'scale').data as Float32Array)[0]),
  }, { fovXDegrees: options.fovXDegrees });
  return { geometry, modelSha256, rgba, sessionLoadMs: Math.round(loaded - started), inferenceMs: Math.round(inferred - loaded) };
}

/** Reads a PNG mask at an expected size: white-on-black (`luma`) or by `alpha` coverage. */
export async function readMaskPng(path: string, width: number, height: number, channel: 'luma' | 'alpha' = 'luma'): Promise<Uint8Array> {
  const image = await loadImage(readFileSync(path));
  if (image.width !== width || image.height !== height) throw new Error(`Mask ${path} is ${image.width}×${image.height}, expected ${width}×${height}.`);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = channel === 'alpha'
      ? (data[i * 4 + 3]! > 127 ? 1 : 0)
      : (Math.max(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!) > 127 ? 1 : 0);
  }
  return mask;
}
