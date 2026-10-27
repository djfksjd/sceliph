/**
 * Opt-in offline one-photo camera + shape fit. Writes an `inferred` proposal
 * (fitted-ir.json) next to a receipt; it never modifies the input IR file.
 *
 *   npx vite-node scripts/photo-shape-fit.ts -- --model moge.onnx --runtime-dir DIR \
 *     --image photo.png --ir start.json --spec spec.json --segmentation seg-dir --output out-dir \
 *     [--max-side 640] [--tokens 2400] [--seed 1] [--raster 160] [--max-evaluations 4000] [--restarts 2] [--no-exif]
 *
 * Field of view precedence: spec.knownFovXDegrees, then JPEG EXIF (unless
 * --no-exif or the image is detectably cropped), then the monocular estimate.
 *
 * `--segmentation` is the output directory of scripts/segment-parts.ts for the
 * same image and max side; `spec.json` follows sceliph.photo-fit-spec/0.1 with
 * anchor pixels in the resized (max-side) image.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createCanvas, ImageData, loadImage } from '@napi-rs/canvas';
import type { AssemblyIR } from '../src/engine/assembly-ir';
import { fovFromExif, readJpegExif } from '../src/engine/exif-fov';
import { orbitToPinhole } from '../src/engine/orbit-camera';
import { fitPhotoShape, renderAssemblyIds, rescaleOrbit, type PhotoFitSpec, type PhotoPartMask } from '../src/engine/photo-shape-fit';
import { MOGE_MODEL_ID, readMaskPng, runMoge, sha256 } from './lib/moge-runtime';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function required(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`Missing --${name}.`);
  return value;
}

const outputDir = resolve(required('output'));
if (existsSync(join(outputDir, 'receipt.json'))) throw new Error('Output already contains a fit; choose a fresh directory.');
const imageBytes = readFileSync(resolve(required('image')));
const irPath = resolve(required('ir'));
const irBytes = readFileSync(irPath);
const ir = JSON.parse(irBytes.toString('utf8')) as AssemblyIR;
const specBytes = readFileSync(resolve(required('spec')));
const spec = JSON.parse(specBytes.toString('utf8')) as PhotoFitSpec;
const segmentationDir = resolve(required('segmentation'));
const manifest = JSON.parse(readFileSync(join(segmentationDir, 'manifest.json'), 'utf8')) as {
  schema: string;
  input: { sha256: string; width: number; height: number };
  object: { file: string; sha256: string };
  parts: Array<{ id: string; status: string; componentIds: string[]; file?: string; sha256?: string }>;
};
if (manifest.schema !== 'sceliph.part-segmentation/0.1') throw new Error('Unsupported segmentation manifest.');
if (manifest.input.sha256 !== sha256(imageBytes)) throw new Error('Segmentation was produced from a different image.');
const maxSide = Number(argument('max-side') ?? 640);
const seed = Number(argument('seed') ?? 1);

const original = await loadImage(imageBytes);
const exifFov = process.argv.includes('--no-exif') ? { reason: 'Disabled with --no-exif.' } : fovFromExif(readJpegExif(imageBytes), original.width, original.height);
const fov = spec.knownFovXDegrees !== undefined
  ? { source: 'spec' as const, fovXDegrees: spec.knownFovXDegrees }
  : 'fovXDegrees' in exifFov
    ? { source: 'exif' as const, fovXDegrees: exifFov.fovXDegrees, method: exifFov.method, limitations: exifFov.limitations }
    : { source: 'monocular-estimate' as const, exifUnavailable: exifFov.reason };
const fittingSpec: PhotoFitSpec = fov.source === 'monocular-estimate' ? spec : { ...spec, knownFovXDegrees: fov.fovXDegrees };

const { geometry, modelSha256, rgba } = await runMoge({
  modelPath: resolve(required('model')),
  runtimeDir: resolve(required('runtime-dir')),
  inputBytes: imageBytes,
  maxSide,
  tokens: Number(argument('tokens') ?? 2400),
  // A known FOV also constrains MoGe's own focal/shift recovery.
  fovXDegrees: fittingSpec.knownFovXDegrees,
});
const { width, height } = geometry;
if (manifest.input.width !== width || manifest.input.height !== height) throw new Error('Segmentation resolution differs from the point map; use the same --max-side.');
const verifiedMask = async (file: string, digest: string): Promise<Uint8Array> => {
  const path = join(segmentationDir, file);
  if (sha256(readFileSync(path)) !== digest) throw new Error(`Mask ${file} does not match its manifest hash.`);
  return readMaskPng(path, width, height);
};
const objectMask = await verifiedMask(manifest.object.file, manifest.object.sha256);
const parts: PhotoPartMask[] = [];
for (const part of manifest.parts) {
  if (part.status !== 'segmented' || !part.file || !part.sha256 || part.componentIds.length === 0) continue;
  parts.push({ id: part.id, componentIds: part.componentIds, mask: await verifiedMask(part.file, part.sha256) });
}

const started = performance.now();
const result = fitPhotoShape({
  ir,
  geometry,
  objectMask,
  parts,
  spec: fittingSpec,
  seed,
  rasterMaxSide: Number(argument('raster') ?? 160),
  maxEvaluations: Number(argument('max-evaluations') ?? 4000),
  restarts: Number(argument('restarts') ?? 2),
});
const elapsedMs = Math.round(performance.now() - started);

// Review overlay: photo, target outline (green) and fitted silhouette outline (red).
const fittedOrbit = rescaleOrbit(result.receipt.orbits[0]!.orbit, width, height);
const ids = renderAssemblyIds(result.ir, orbitToPinhole(fittedOrbit));
const overlay = new Uint8ClampedArray(rgba);
const edge = (mask: (i: number) => boolean, i: number): boolean => {
  if (!mask(i)) return false;
  const x = i % width;
  const y = Math.floor(i / width);
  return x === 0 || y === 0 || x === width - 1 || y === height - 1 || !mask(i - 1) || !mask(i + 1) || !mask(i - width) || !mask(i + width);
};
for (let i = 0; i < width * height; i += 1) {
  if (edge((j) => objectMask[j] === 1, i)) overlay.set([40, 220, 90, 255], i * 4);
  if (edge((j) => ids[j]! >= 0, i)) overlay.set([235, 40, 40, 255], i * 4);
}
const canvas = createCanvas(width, height);
canvas.getContext('2d').putImageData(new ImageData(overlay, width, height), 0, 0);

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'overlay.png'), canvas.toBuffer('image/png'));
writeFileSync(join(outputDir, 'fitted-ir.json'), `${JSON.stringify(result.ir, null, 2)}\n`);
writeFileSync(join(outputDir, 'receipt.json'), `${JSON.stringify({
  schema: 'sceliph.photo-shape-fit/0.1',
  provenance: 'inferred',
  writesInputIR: false,
  inputs: {
    imageSha256: sha256(imageBytes),
    irSha256: sha256(irBytes),
    specSha256: sha256(specBytes),
    segmentationObjectSha256: manifest.object.sha256,
    mogeModel: { id: MOGE_MODEL_ID, sha256: modelSha256 },
  },
  fieldOfView: fov,
  lowConfidenceReasons: result.lowConfidenceReasons,
  anchor: result.anchor,
  raster: result.raster,
  initialOrbit: result.initialOrbit,
  fit: result.receipt,
  limitations: [
    'Camera and shape come from one photo, model-estimated depth and masks; values are inferred, not measured.',
    'Only parameters declared in the spec move; everything else is taken from the input IR.',
    'Occluded geometry is constrained only by priors and bounds; check per-parameter identification.',
  ],
}, null, 2)}\n`);
writeFileSync(join(outputDir, 'run.json'), `${JSON.stringify({ schema: 'sceliph.photo-shape-fit-run/0.1', fitMs: elapsedMs, note: 'Host-specific timing.' }, null, 2)}\n`);
console.log(JSON.stringify({ iou: result.receipt.after.views[0]!.iou, depthResidual: result.receipt.after.views[0]!.depthResidual, lowConfidenceReasons: result.lowConfidenceReasons, fitMs: elapsedMs }));
