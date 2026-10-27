/**
 * Scores segmentation and one-photo camera + shape fits against Blender ground
 * truth produced by scripts/blender-moge-ground-truth.py.
 *
 *   npx vite-node scripts/photo-fit-ground-truth.ts -- --truth-ir truth-ir.json --output report.json \
 *     --case id=a,scene=DIR,segmentation=DIR,fit=DIR[,image=image.jpg] [--case ...]
 *
 * Camera error is measured relative to the reference box centre because object
 * placement and camera share a translation gauge.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AssemblyIR } from '../src/engine/assembly-ir';
import type { PinholeCamera } from '../src/engine/mesh-silhouette-raster';
import { orbitFromLookAt, orbitToPinhole, type OrbitCamera } from '../src/engine/orbit-camera';
import { renderAssemblyIds } from '../src/engine/photo-shape-fit';
import { readMaskPng, sha256 } from './lib/moge-runtime';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const truthIr = JSON.parse(readFileSync(resolve(argument('truth-ir')!), 'utf8')) as AssemblyIR;
const cases = process.argv.flatMap((value, index) => (value === '--case' ? [process.argv[index + 1]!] : [])).map((text) => (
  Object.fromEntries(text.split(',').map((pair) => pair.split('=') as [string, string])) as { id: string; scene: string; segmentation: string; fit: string; image?: string }
));
if (cases.length === 0) throw new Error('Provide at least one --case.');

const iou = (a: Uint8Array, b: Uint8Array): number => {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] && b[i]) inter += 1;
    if (a[i] || b[i]) union += 1;
  }
  return union === 0 ? 0 : inter / union;
};
const vector = (a: number[], b: number[]): number[] => a.map((value, i) => value - b[i]!);
const length = (a: number[]): number => Math.hypot(...a);
const angle = (a: number[], b: number[]): number => Math.acos(Math.min(1, Math.max(-1, a.reduce((sum, v, i) => sum + v * b[i]!, 0) / (length(a) * length(b))))) * 180 / Math.PI;

const reports = [];
for (const item of cases) {
  const truth = JSON.parse(readFileSync(join(item.scene, 'truth.json'), 'utf8')) as {
    fovXDegrees: number; fxPixels: number; cameraPositionMm: [number, number, number]; cameraTargetMm: [number, number, number];
  };
  const width = 640;
  const height = 480;
  const truthCamera: PinholeCamera = { width, height, fx: truth.fxPixels, fy: truth.fxPixels, cx: width / 2, cy: height / 2, position: truth.cameraPositionMm, target: truth.cameraTargetMm };
  const truthIds = renderAssemblyIds(truthIr, truthCamera);
  const alpha = await readMaskPng(join(item.scene, 'object-alpha.png'), width, height, 'alpha');
  const ownTruthUnion = Uint8Array.from(truthIds, (id) => (id >= 0 ? 1 : 0));
  const manifest = JSON.parse(readFileSync(join(item.segmentation, 'manifest.json'), 'utf8')) as { parts: Array<{ id: string; file?: string; componentIds: string[] }>; object: { file: string } };
  const samUnion = await readMaskPng(join(item.segmentation, manifest.object.file), width, height);
  const samParts = [];
  for (const part of manifest.parts) {
    if (!part.file) {
      samParts.push({ id: part.id, iou: 0, status: 'not-detected' });
      continue;
    }
    const indices = new Set(part.componentIds.map((id) => truthIr.components.findIndex((component) => component.id === id)));
    const truthPart = Uint8Array.from(truthIds, (id) => (indices.has(id) ? 1 : 0));
    samParts.push({ id: part.id, iou: iou(await readMaskPng(join(item.segmentation, part.file), width, height), truthPart) });
  }

  const receipt = JSON.parse(readFileSync(join(item.fit, 'receipt.json'), 'utf8')) as { fit: { orbits: Array<{ orbit: OrbitCamera }>; after: { views: Array<{ iou: number }> } }; raster: { width: number; height: number } };
  const fitted = JSON.parse(readFileSync(join(item.fit, 'fitted-ir.json'), 'utf8')) as AssemblyIR;
  const orbit = receipt.fit.orbits[0]!.orbit;
  const fittedCamera = orbitToPinhole(orbit);
  const truthBox = truthIr.components[0]!;
  const fittedBox = fitted.components[0]!;
  const trueRelative = vector(truth.cameraPositionMm, truthBox.position!);
  const fittedRelative = vector(fittedCamera.position, fittedBox.position!);
  const trueView = orbitFromLookAt(truth.cameraPositionMm, truthBox.position!);
  const fittedView = orbitFromLookAt(fittedCamera.position, fittedBox.position!);
  const fittedFovX = 2 * Math.atan(orbit.width / 2 / (orbit.fx * (orbit.focalScale ?? 1))) * 180 / Math.PI;
  const geometry = (component: AssemblyIR['components'][number]) => component.geometry as unknown as Record<string, number | number[]>;
  const tBox = geometry(truthBox).size as number[];
  const fBox = geometry(fittedBox).size as number[];
  const tPost = geometry(truthIr.components[1]!);
  const fPost = geometry(fitted.components[1]!);
  const percent = (value: number, reference: number) => +(100 * (value / reference - 1)).toFixed(2);
  const postTop = (ir: AssemblyIR) => ir.components[1]!.position![1] + (geometry(ir.components[1]!).depth as number) / 2 - (ir.components[0]!.position![1] + (geometry(ir.components[0]!).size as number[])[1]! / 2);
  const postOffset = (ir: AssemblyIR) => [0, 2].map((axis) => ir.components[1]!.position![axis]! - ir.components[0]!.position![axis]!);
  reports.push({
    id: item.id,
    imageSha256: sha256(readFileSync(join(item.scene, item.image ?? 'image.png'))),
    segmentation: {
      ownRasterVsBlenderAlphaIoU: +iou(ownTruthUnion, alpha).toFixed(4),
      samUnionVsBlenderAlphaIoU: +iou(samUnion, alpha).toFixed(4),
      parts: samParts.map((part) => ({ ...part, iou: +part.iou.toFixed(4) })),
    },
    camera: {
      relativePositionErrorMm: +length(vector(fittedRelative, trueRelative)).toFixed(1),
      trueDistanceToBoxMm: +length(trueRelative).toFixed(1),
      viewDirectionErrorDegrees: +angle(fittedRelative, trueRelative).toFixed(2),
      azimuthErrorDegrees: +(fittedView.azimuthDeg - trueView.azimuthDeg).toFixed(2),
      elevationErrorDegrees: +(fittedView.elevationDeg - trueView.elevationDeg).toFixed(2),
      fovXTrue: truth.fovXDegrees,
      fovXFitted: +fittedFovX.toFixed(2),
    },
    dimensionsPercentError: {
      boxHeight: percent(fBox[1]!, tBox[1]!),
      boxDepth: percent(fBox[2]!, tBox[2]!),
      postRadiusTop: percent(fPost.radiusTop as number, tPost.radiusTop as number),
      postRadiusBottom: percent(fPost.radiusBottom as number, tPost.radiusBottom as number),
      postDepth: percent(fPost.depth as number, tPost.depth as number),
    },
    placementErrorMm: {
      postTopAboveBox: +(postTop(fitted) - postTop(truthIr)).toFixed(1),
      postOffsetXZ: postOffset(fitted).map((value, i) => +(value - postOffset(truthIr)[i]!).toFixed(1)),
    },
    fitSilhouetteIoU: +receipt.fit.after.views[0]!.iou.toFixed(4),
  });
}
const output = { schema: 'sceliph.photo-fit-ground-truth/0.1', truthIrSha256: sha256(readFileSync(resolve(argument('truth-ir')!))), cases: reports };
writeFileSync(resolve(argument('output')!), `${JSON.stringify(output, null, 1)}\n`);
console.log(JSON.stringify(reports, null, 1));
