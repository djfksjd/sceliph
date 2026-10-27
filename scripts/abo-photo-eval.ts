/**
 * Real catalog photo → AssemblyIR evaluation on the pre-registered ABO holdout
 * (scripts/abo-holdout-select.ts). Per item the model sees one turntable photo
 * (background removed by the dataset), the product name and the listed overall
 * height, and decides the components itself. Five candidates are scored
 * against the artist GLB with compareMeshShapes (same alignment for all):
 *   b0    box of the listed height, width from the mask aspect, depth = width
 *   b1    the mask silhouette extruded to depth = width
 *   llm   the IR as written
 *   fit   the one-photo camera + shape fit, always applied
 *   final the fit if decidePhotoFitAcceptance passes, else the written IR
 * Masks come from SAM 2.1 (box prompt = non-white bounding box), the camera
 * from MoGe-2 with no known FOV; the ground truth is only used for scoring.
 *
 *   npx vite-node scripts/abo-photo-eval.ts -- --selection selection.json --data-dir DIR --split dev \
 *     --protocol protocol.json --model sonnet --workdir EMPTY_DIR --output OUT_DIR \
 *     --moge model.onnx --runtime-dir ORT_DIR --sam-runtime-dir DIR --sam-model-dir DIR [--only id,id]
 *   (--replay DIR instead of --model/--workdir reads DIR/<modelId>.txt as the single reply)
 *
 * ABO data, images and 3D models © Amazon.com, CC-BY-4.0.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { formatAssemblyFeedback } from '../src/engine/assembly-feedback';
import { compareMeshShapes, type MeshCompareOptions } from '../src/engine/mesh-shape-compare';
import { decidePhotoFitAcceptance, derivePhotoFitParameters, fitPhotoShape, type PhotoFitAcceptanceGate, type PhotoFitSpec } from '../src/engine/photo-shape-fit';
import { assemblyMeshes, boxMesh, extrudedSilhouette, foregroundMask, largestComponent, maskBox, preparePhoto, samObjectMask, summarize } from './lib/abo-eval';
import { callClaudeWithImage, type ClaudeCallRecord } from './lib/claude-cli';
import { readGlbTriangles } from './lib/glb-triangles';
import { runMoge, sha256 } from './lib/moge-runtime';
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

interface Protocol {
  guide: string;
  maxRounds: number;
  /** White margin added on every side, as a share of the photo's larger side. */
  padShare: number;
  maxSide: number;
  /** A channel below this marks a non-background pixel for the SAM box prompt. */
  backgroundThreshold: number;
  exclusions: { minMaskShare: number; maxMaskShare: number };
  fit: {
    viewHintSigmaDeg: number; sizeRange: [number, number]; positionReach: number; maxEvaluations: number; restarts: number; seed: number; raster: number;
    lockAligned: boolean; sensitivityGate?: { step: number; minLossChange: number }; heightSigmaShare: number;
  };
  acceptance: PhotoFitAcceptanceGate;
  compare: MeshCompareOptions;
  /** Remove dimension strings (27.5"W, 50 x 90 cm, ...) from the product name, so sizes must come from the photo. */
  stripNameDimensions?: boolean;
  /** Score only b0, b1 and the written IR (exploratory runs). */
  skipFit?: boolean;
}

interface Item { split: string; modelId: string; productType: string; name: string; heightMm: number; photoSha256: string; glbSha256: string }

const protocolBytes = readFileSync(resolve(required('protocol')));
const protocol = JSON.parse(protocolBytes.toString('utf8')) as Protocol;
const selection = JSON.parse(readFileSync(resolve(required('selection')), 'utf8')) as { items: Item[] };
const dataDir = resolve(required('data-dir'));
const split = required('split');
const replayDir = argument('replay') ? resolve(argument('replay')!) : undefined;
const model = replayDir ? 'replay' : required('model');
if (!/^[a-z0-9.-]{2,40}$/.test(model)) throw new Error('--model must be a CLI model alias.');
const workdir = replayDir ? '' : resolve(required('workdir'));
if (!replayDir && (!existsSync(workdir) || readdirSync(workdir).length > 0)) throw new Error('--workdir must be an existing empty directory.');
const outputDir = resolve(required('output'));
if (existsSync(join(outputDir, 'results.json'))) throw new Error('Output already contains results; choose a fresh directory.');
mkdirSync(outputDir, { recursive: true });
const only = argument('only')?.split(',');
// --only selects by id across splits (pre-registered replacements come from the reserve).
const items = selection.items.filter((item) => (only ? only.includes(item.modelId) : item.split === split));
if (items.length === 0) throw new Error(`No ${split} items selected.`);

const results = [];
for (const item of items) {
  const started = performance.now();
  const record: Record<string, unknown> = { modelId: item.modelId, productType: item.productType, name: item.name, heightMm: item.heightMm };
  const photoPath = join(dataDir, 'spins', `${item.modelId}-0.jpg`);
  if (sha256(readFileSync(photoPath)) !== item.photoSha256) throw new Error(`Photo of ${item.modelId} changed since selection.`);
  const photo = await preparePhoto(photoPath, protocol);
  const photoFile = join(outputDir, `${item.modelId}-photo.png`);
  writeFileSync(photoFile, photo.png);
  const { width, height } = photo;

  // SAM object mask from the non-background bounding box.
  const foreground = foregroundMask(photo.rgba, width, height, protocol.backgroundThreshold);
  const promptBox = maskBox(foreground, width);
  const truth = await readGlbTriangles(join(dataDir, 'models', `${item.modelId}.glb`));
  if (truth.seeThrough) record.excluded = 'see-through material';
  let mask: Uint8Array | undefined;
  if (!record.excluded && promptBox) {
    mask = await samObjectMask({ photoFile, box: promptBox, workDir: outputDir, stem: item.modelId, width, height, maxSide: protocol.maxSide, samRuntimeDir: required('sam-runtime-dir'), samModelDir: required('sam-model-dir') });
    const share = mask.reduce((sum, value) => sum + value, 0) / mask.length;
    record.maskShare = +share.toFixed(4);
    if (share < protocol.exclusions.minMaskShare || share > protocol.exclusions.maxMaskShare) record.excluded = `mask covers ${(100 * share).toFixed(1)}% of the image`;
  } else if (!promptBox) {
    record.excluded = 'no foreground pixels';
  }
  if (record.excluded || !mask) {
    results.push(record);
    console.log(JSON.stringify(record));
    continue;
  }
  const box = maskBox(mask, width)!;
  const scores: Record<string, ReturnType<typeof summarize>> = {};
  const widthMm = item.heightMm * (box[2] - box[0]) / (box[3] - box[1]);
  scores.b0 = summarize(compareMeshShapes([boxMesh(widthMm, item.heightMm, widthMm)], truth.meshes, protocol.compare));
  scores.b1 = summarize(compareMeshShapes([extrudedSilhouette(mask, width, box, item.heightMm)], truth.meshes, protocol.compare));

  const request = [
    `Catalog photo (background removed) of: ${protocol.stripNameDimensions ? stripDimensions(item.name) : item.name}.`,
    `The product listing gives its overall height as ${Math.round(item.heightMm)} mm.`,
    'Decide the components yourself.',
  ].join('\n');
  const calls: Array<ClaudeCallRecord & { round: number }> = [];
  const rounds: Array<{ text: string; stage: string; viewIssue?: string }> = [];
  let accepted: ReturnType<typeof parseViewAssemblyReply> | undefined;
  let prompt = request;
  for (let round = 0; round < protocol.maxRounds; round += 1) {
    const { text, record: call } = replayDir
      ? { text: readFileSync(join(replayDir, `${item.modelId}.txt`), 'utf8'), record: { modelIds: ['replay'], costUsd: 0, durationMs: 0, isError: false } }
      : await callClaudeWithImage({ model, systemPrompt: protocol.guide, workdir, image: photo.png, mediaType: 'image/png', text: prompt });
    calls.push({ round, ...call });
    const parsed = parseViewAssemblyReply(text, []);
    rounds.push({ text, stage: parsed.feedback.stage, ...(parsed.viewIssue ? { viewIssue: parsed.viewIssue } : {}) });
    if (parsed.ir && parsed.view) {
      accepted = parsed;
      break;
    }
    prompt = `${request}\n\nYour previous reply:\n${text.slice(0, 20_000)}\n\n${parsed.feedback.pass ? '' : formatAssemblyFeedback(parsed.feedback)}${parsed.viewIssue ? `\n${parsed.viewIssue}` : ''}\nReturn the corrected JSON object only.`;
  }
  record.roundsUsed = rounds.length;
  record.costUsd = +calls.reduce((sum, call) => sum + call.costUsd, 0).toFixed(4);
  record.modelIds = [...new Set(calls.flatMap((call) => call.modelIds))];
  writeFileSync(join(outputDir, `${item.modelId}-calls.json`), `${JSON.stringify({ request, calls, rounds }, null, 1)}\n`);
  if (accepted?.ir) {
    const ir = accepted.ir;
    writeFileSync(join(outputDir, `${item.modelId}-llm-ir.json`), `${JSON.stringify(ir, null, 1)}\n`);
    record.components = ir.components.length;
    record.ops = [...new Set(ir.components.map((component) => component.geometry.op))];
    record.view = accepted.view;
    scores.llm = summarize(compareMeshShapes(assemblyMeshes(ir), truth.meshes, protocol.compare));
    if (!protocol.skipFit) try {
      const geometry = (await runMoge({ modelPath: resolve(required('moge')), runtimeDir: resolve(required('runtime-dir')), inputBytes: photo.png, maxSide: protocol.maxSide, tokens: 2400 })).geometry;
      if (geometry.width !== width || geometry.height !== height) throw new Error('Point map resolution differs from the prepared photo.');
      const referenceComponentId = largestComponent(ir);
      const derived = derivePhotoFitParameters(ir, { referenceComponentId, sizeRange: protocol.fit.sizeRange, positionReach: protocol.fit.positionReach, lockAligned: protocol.fit.lockAligned });
      const spec: PhotoFitSpec = {
        schema: 'sceliph.photo-fit-spec/0.1',
        referenceComponentId,
        viewHint: { ...accepted.view!, sigmaDeg: protocol.fit.viewHintSigmaDeg },
        knownExtent: { axis: 1, mm: item.heightMm, sigmaMm: item.heightMm * protocol.fit.heightSigmaShare },
        parameters: derived.parameters,
      };
      const fit = fitPhotoShape({ ir, geometry, objectMask: mask, parts: [], spec, seed: protocol.fit.seed, rasterMaxSide: protocol.fit.raster, maxEvaluations: protocol.fit.maxEvaluations, restarts: protocol.fit.restarts, ...(protocol.fit.sensitivityGate ? { sensitivityGate: protocol.fit.sensitivityGate } : {}) });
      const decision = decidePhotoFitAcceptance(fit, protocol.acceptance);
      scores.fit = summarize(compareMeshShapes(assemblyMeshes(fit.ir), truth.meshes, protocol.compare));
      scores.final = decision.accept ? scores.fit : scores.llm;
      record.fit = {
        referenceComponentId,
        parameters: derived.parameters.length,
        aligned: derived.aligned.length,
        frozen: fit.receipt.parameters.filter((parameter) => parameter.frozen).length,
        iouCameraOnly: +fit.cameraOnly.view.iou.toFixed(4),
        iouAfter: +fit.receipt.after.views[0]!.iou.toFixed(4),
        focalScale: +(fit.receipt.cameraParameters.find((parameter) => parameter.field === 'focalScale')?.after ?? 1).toFixed(4),
        initialScaleCorrection: +fit.anchor.scaleCorrection.toFixed(4),
        acceptance: { ...decision, relativeLossGain: +decision.relativeLossGain.toFixed(4), iou: +decision.iou.toFixed(4) },
      };
      writeFileSync(join(outputDir, `${item.modelId}-fitted-ir.json`), `${JSON.stringify(fit.ir, null, 1)}\n`);
      writeFileSync(join(outputDir, `${item.modelId}-fit.json`), `${JSON.stringify({ spec, derived, anchor: fit.anchor, raster: fit.raster, cameraOnly: fit.cameraOnly, receipt: fit.receipt, lowConfidenceReasons: fit.lowConfidenceReasons, acceptance: decision }, null, 1)}\n`);
    } catch (error) {
      record.fitError = (error as Error).message;
    }
  }
  record.scores = scores;
  record.ms = Math.round(performance.now() - started);
  results.push(record);
  console.log(JSON.stringify(record));
}
writeFileSync(join(outputDir, 'results.json'), `${JSON.stringify({
  schema: 'sceliph.abo-photo-eval/0.1',
  protocolSha256: createHash('sha256').update(protocolBytes).digest('hex'),
  split,
  modelAlias: model,
  totalCostUsd: +results.reduce((sum, item) => sum + ((item.costUsd as number | undefined) ?? 0), 0).toFixed(4),
  results,
}, null, 1)}\n`);
