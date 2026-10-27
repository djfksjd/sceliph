/**
 * Opt-in offline MoGe-2 camera/depth evidence. Never writes AssemblyIR.
 *
 * Requires a separately installed onnxruntime-node (`--runtime-dir`, the
 * directory containing its node_modules) and the hash-pinned official
 * Ruicheng/moge-2-vits-normal-onnx export. This CLI does not download or
 * install anything and refuses to overwrite earlier evidence.
 *
 *   npx vite-node scripts/moge-camera-evidence.ts -- --model model.onnx \
 *     --runtime-dir /path/with/onnxruntime-node --input photo.jpg --output outputs/run \
 *     [--max-side 640] [--tokens 2400] [--fov-x 50] [--anchor x1,y1,x2,y2,mm] [--probe x1,y1,x2,y2]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { anchorMetricScale, buildMonocularCameraEvidence, type MetricAnchor } from '../src/engine/moge-geometry';
import { MOGE_MODEL_ID, runMoge, sha256 } from './lib/moge-runtime';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`Missing --${name}.`);
  return value;
}

function parseAnchor(text: string | undefined): MetricAnchor | undefined {
  if (text === undefined) return undefined;
  const values = text.split(',').map(Number);
  if (values.length !== 5 || !values.every(Number.isFinite)) throw new Error('--anchor must be x1,y1,x2,y2,mm in output-image pixels.');
  return { from: [values[0]!, values[1]!], to: [values[2]!, values[3]!], knownMm: values[4]! };
}

function parseProbes(): Array<{ from: [number, number]; to: [number, number] }> {
  const probes = process.argv.flatMap((value, index) => (value === '--probe' ? [process.argv[index + 1] ?? ''] : []));
  if (probes.length > 16) throw new Error('At most 16 --probe measurements are allowed.');
  return probes.map((text) => {
    const values = text.split(',').map(Number);
    if (values.length !== 4 || !values.every(Number.isFinite)) throw new Error('--probe must be x1,y1,x2,y2 in output-image pixels.');
    return { from: [values[0]!, values[1]!], to: [values[2]!, values[3]!] };
  });
}

const modelPath = resolve(required('model'));
const runtimeDir = resolve(required('runtime-dir'));
const inputPath = resolve(required('input'));
const outputDir = resolve(required('output'));
const maxSide = Number(argument('max-side') ?? 640);
const tokens = Number(argument('tokens') ?? 2400);
const fovX = argument('fov-x') === undefined ? undefined : Number(argument('fov-x'));
const anchor = parseAnchor(argument('anchor'));
const probes = parseProbes();
const inputBytes = readFileSync(inputPath);
if (existsSync(join(outputDir, 'evidence.json'))) throw new Error('Output already contains evidence; choose a fresh directory.');
mkdirSync(outputDir, { recursive: true });
const { geometry, modelSha256: modelSha, sessionLoadMs, inferenceMs } = await runMoge({ modelPath, runtimeDir, inputBytes, maxSide, tokens, fovXDegrees: fovX });
const { width, height } = geometry;
const anchorResult = anchor ? anchorMetricScale(geometry, anchor) : undefined;
const evidence = buildMonocularCameraEvidence(geometry, {
  modelId: MOGE_MODEL_ID,
  modelSha256: modelSha,
  inputSha256: sha256(inputBytes),
  knownFovXDegrees: fovX,
  anchor: anchorResult,
  measurements: probes,
});

// Inverse-depth preview for human review only; not evidence.
const preview = createCanvas(width, height);
const previewContext = preview.getContext('2d');
const imageData = previewContext.createImageData(width, height);
const inverse = Array.from(geometry.depth, (value, i) => (geometry.validMask[i] ? 1 / value : 0));
const valid = inverse.filter((value) => value > 0).sort((a, b) => a - b);
const low = valid[Math.floor(valid.length * 0.02)] ?? 0;
const high = valid[Math.floor(valid.length * 0.98)] ?? 1;
for (let i = 0; i < width * height; i += 1) {
  const t = inverse[i]! > 0 ? Math.min(1, Math.max(0, (inverse[i]! - low) / Math.max(1e-12, high - low))) : 0;
  imageData.data[i * 4] = Math.round(255 * t);
  imageData.data[i * 4 + 1] = Math.round(255 * t * t);
  imageData.data[i * 4 + 2] = Math.round(255 * (1 - t) * (inverse[i]! > 0 ? 1 : 0));
  imageData.data[i * 4 + 3] = 255;
}
previewContext.putImageData(imageData, 0, 0);
writeFileSync(join(outputDir, 'depth-preview.png'), preview.toBuffer('image/png'));
writeFileSync(join(outputDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(join(outputDir, 'run.json'), `${JSON.stringify({
  schema: 'sceliph.moge-run/0.1',
  tokens,
  maxSide,
  executionProvider: 'cpu',
  intraOpNumThreads: 4,
  sessionLoadMs,
  inferenceMs,
  note: 'Timing is host-specific and excluded from evidence.json.',
}, null, 2)}\n`);
console.log(JSON.stringify({ evidence: join(outputDir, 'evidence.json'), fovXDegrees: evidence.camera.fovXDegrees, medianDepth: evidence.depth.median, anchor: anchorResult, measurements: evidence.measurements }, null, 2));
