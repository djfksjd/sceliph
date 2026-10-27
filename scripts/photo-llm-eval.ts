/**
 * Photo → AssemblyIR evaluation against Blender ground truth
 * (scripts/blender-assembly-ground-truth.py). The model sees the rendered
 * photo, one stated dimension and the component ids, and returns an IR plus a
 * coarse view. Between rounds it only hears structural feedback (parse,
 * schema, compile, missing parts), never the truth. Each candidate is scored
 * as written and again after the one-photo camera + shape fit, which starts
 * from the candidate with automatically derived parameters.
 *
 *   npx vite-node scripts/photo-llm-eval.ts -- --protocol protocol.json --scenes DIR --model haiku \
 *     --workdir EMPTY_DIR --output OUT_DIR --moge model.onnx --runtime-dir DIR [--only a,b]
 *   (or --replay DIR instead of --model/--workdir: reads DIR/<scene>.txt as the
 *   model's single reply, for pipeline checks and rescoring saved replies)
 *
 * Uses the local Claude Code CLI (`claude -p`, the user's own plan) with no
 * tools, MCP servers, setting sources or session persistence, in an empty
 * working directory.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AssemblyIR } from '../src/engine/assembly-ir';
import { formatAssemblyFeedback, type AssemblyFeedback } from '../src/engine/assembly-feedback';
import { compareAssemblyToTruth } from '../src/engine/assembly-truth-compare';
import type { PinholeCamera } from '../src/engine/mesh-silhouette-raster';
import { decidePhotoFitAcceptance, derivePhotoFitParameters, fitPhotoShape, mergeGroupPartMasks, renderAssemblyIds, type PhotoFitAcceptanceGate, type PhotoFitSpec } from '../src/engine/photo-shape-fit';
import { callClaudeWithImage, type ClaudeCallRecord } from './lib/claude-cli';
import { parseViewAssemblyReply as parseReply } from './lib/view-assembly-reply';
import { readMaskPng, runMoge, sha256 } from './lib/moge-runtime';

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
  fit: {
    viewHintSigmaDeg: number; sizeRange: [number, number]; positionReach: number; maxEvaluations: number; restarts: number; seed: number; raster: number;
    /** v2: hold position axes the IR centres on the reference (absent = false, the v1 behaviour). */
    lockAligned?: boolean;
    /** v2: freeze shape parameters the photo barely responds to. */
    sensitivityGate?: { step: number; minLossChange: number };
    /** v2: one mask per group of identical parts, independent of their labels. */
    mergeGroupMasks?: boolean;
  };
  /** v2: when set, the fitted IR replaces the written one only if it passes this gate. */
  acceptance?: PhotoFitAcceptanceGate;
}
interface Task {
  id: string;
  object: string;
  components: Array<{ id: string; description: string }>;
  referenceComponentId: string;
  known: string;
  knownDimensionMm: number;
  fovXDegrees: number;
}
interface Truth {
  fovXDegrees: number;
  fxPixels: number;
  cameraPositionMm: [number, number, number];
  cameraTargetMm: [number, number, number];
  anchorFrom: number[];
  anchorTo: number[];
  anchorMm: number;
  partMasks: Record<string, string>;
}

const protocolBytes = readFileSync(resolve(required('protocol')));
const protocol = JSON.parse(protocolBytes.toString('utf8')) as Protocol;
const scenesDir = resolve(required('scenes'));
const replayDir = argument('replay') ? resolve(argument('replay')!) : undefined;
const model = replayDir ? 'replay' : required('model');
if (!/^[a-z0-9.-]{2,40}$/.test(model)) throw new Error('--model must be a CLI model alias.');
const workdir = replayDir ? '' : resolve(required('workdir'));
if (!replayDir && (!existsSync(workdir) || readdirSync(workdir).length > 0)) throw new Error('--workdir must be an existing empty directory.');
const outputDir = resolve(required('output'));
if (existsSync(join(outputDir, 'results.json'))) throw new Error('Output already contains results; choose a fresh directory.');
const only = argument('only')?.split(',');
mkdirSync(outputDir, { recursive: true });

interface CallRecord extends ClaudeCallRecord { round: number }

const sceneIds = readdirSync(scenesDir).filter((id) => existsSync(join(scenesDir, id, 'task.json')) && (!only || only.includes(id))).sort();
const geometryCache = new Map<string, Awaited<ReturnType<typeof runMoge>>['geometry']>();
const results = [];
for (const sceneId of sceneIds) {
  const dir = join(scenesDir, sceneId);
  const task = JSON.parse(readFileSync(join(dir, 'task.json'), 'utf8')) as Task;
  const truthIr = JSON.parse(readFileSync(join(dir, 'truth-ir.json'), 'utf8')) as AssemblyIR;
  const truth = JSON.parse(readFileSync(join(dir, 'truth.json'), 'utf8')) as Truth;
  const image = readFileSync(join(dir, 'image.png'));
  const width = 640;
  const height = 480;
  const ids = task.components.map((component) => component.id);
  const request = [
    `Photo: ${task.object}.`,
    task.known,
    `The camera's horizontal field of view is ${task.fovXDegrees} degrees.`,
    `Model it with exactly these components: ${task.components.map((component) => `"${component.id}" (${component.description})`).join(', ')}.`,
  ].join('\n');

  // Convention check: the truth IR rasterised with the truth camera must match Blender's alpha.
  const truthCamera: PinholeCamera = { width, height, fx: truth.fxPixels, fy: truth.fxPixels, cx: width / 2, cy: height / 2, position: truth.cameraPositionMm, target: truth.cameraTargetMm };
  const truthIds = renderAssemblyIds(truthIr, truthCamera);
  const alpha = await readMaskPng(join(dir, 'object-alpha.png'), width, height, 'alpha');
  let inter = 0;
  let union = 0;
  for (let i = 0; i < alpha.length; i += 1) {
    const own = truthIds[i]! >= 0;
    if (own && alpha[i]) inter += 1;
    if (own || alpha[i]) union += 1;
  }
  const conventionIoU = +(inter / union).toFixed(4);

  const calls: CallRecord[] = [];
  const rounds: Array<{ text: string; stage: string; viewIssue?: string; issues: AssemblyFeedback['issues'] }> = [];
  let accepted: ReturnType<typeof parseReply> | undefined;
  let prompt = request;
  for (let round = 0; round < protocol.maxRounds; round += 1) {
    const { text, record } = replayDir
      ? { text: readFileSync(join(replayDir, `${sceneId}.txt`), 'utf8'), record: { modelIds: ['replay'], costUsd: 0, durationMs: 0, isError: false } }
      : await callClaudeWithImage({ model, systemPrompt: protocol.guide, workdir, image, mediaType: 'image/png', text: prompt });
    calls.push({ round, ...record });
    const parsed = parseReply(text, ids);
    rounds.push({ text, stage: parsed.feedback.stage, ...(parsed.viewIssue ? { viewIssue: parsed.viewIssue } : {}), issues: parsed.feedback.issues });
    if (parsed.ir && parsed.view) {
      accepted = parsed;
      break;
    }
    prompt = `${request}\n\nYour previous reply:\n${text.slice(0, 20_000)}\n\n${parsed.feedback.pass ? '' : formatAssemblyFeedback(parsed.feedback)}${parsed.viewIssue ? `\n${parsed.viewIssue}` : ''}\nReturn the corrected JSON object only.`;
  }

  const record: Record<string, unknown> = {
    id: sceneId,
    conventionIoU,
    roundsUsed: rounds.length,
    accepted: accepted !== undefined,
    costUsd: +calls.reduce((sum, call) => sum + call.costUsd, 0).toFixed(4),
    modelIds: [...new Set(calls.flatMap((call) => call.modelIds))],
  };
  if (accepted?.ir) {
    const llmScore = compareAssemblyToTruth(accepted.ir, truthIr, task.referenceComponentId);
    record.view = accepted.view;
    record.llm = llmScore.summary;
    writeFileSync(join(outputDir, `${sceneId}-llm-ir.json`), `${JSON.stringify(accepted.ir, null, 1)}\n`);

    let geometry = geometryCache.get(sceneId);
    if (!geometry) {
      geometry = (await runMoge({ modelPath: resolve(required('moge')), runtimeDir: resolve(required('runtime-dir')), inputBytes: image, maxSide: 640, tokens: 2400, fovXDegrees: task.fovXDegrees })).geometry;
      geometryCache.set(sceneId, geometry);
    }
    if (geometry.width !== width || geometry.height !== height) throw new Error('Point map resolution differs from the render.');
    const derived = derivePhotoFitParameters(accepted.ir, { referenceComponentId: task.referenceComponentId, knownDimensionMm: task.knownDimensionMm, sizeRange: protocol.fit.sizeRange, positionReach: protocol.fit.positionReach, lockAligned: protocol.fit.lockAligned ?? false });
    let parts = [];
    for (const [componentId, file] of Object.entries(truth.partMasks)) {
      const mask = await readMaskPng(join(dir, file), width, height, 'alpha');
      if (mask.some((value) => value !== 0)) parts.push({ id: componentId, componentIds: [componentId], mask });
    }
    if (protocol.fit.mergeGroupMasks) parts = mergeGroupPartMasks(parts, derived.groups);
    const spec: PhotoFitSpec = {
      schema: 'sceliph.photo-fit-spec/0.1',
      referenceComponentId: task.referenceComponentId,
      viewHint: { ...accepted.view!, sigmaDeg: protocol.fit.viewHintSigmaDeg },
      anchor: { from: [truth.anchorFrom[0]!, truth.anchorFrom[1]!], to: [truth.anchorTo[0]!, truth.anchorTo[1]!], knownMm: truth.anchorMm },
      parameters: derived.parameters,
      knownFovXDegrees: task.fovXDegrees,
    };
    const started = performance.now();
    try {
      const fit = fitPhotoShape({ ir: accepted.ir, geometry, objectMask: alpha, parts, spec, seed: protocol.fit.seed, rasterMaxSide: protocol.fit.raster, maxEvaluations: protocol.fit.maxEvaluations, restarts: protocol.fit.restarts, ...(protocol.fit.sensitivityGate ? { sensitivityGate: protocol.fit.sensitivityGate } : {}) });
      const fitScore = compareAssemblyToTruth(fit.ir, truthIr, task.referenceComponentId);
      record.fit = {
        ...fitScore.summary,
        parameters: derived.parameters.length,
        locked: derived.locked.length,
        groups: derived.groups,
        iouBefore: +fit.receipt.before.views[0]!.iou.toFixed(4),
        iouCameraOnly: +fit.cameraOnly.view.iou.toFixed(4),
        iouAfter: +fit.receipt.after.views[0]!.iou.toFixed(4),
        lossCameraOnly: +fit.cameraOnly.loss.toFixed(5),
        lossAfter: +fit.receipt.after.loss.toFixed(5),
        lowConfidenceReasons: fit.lowConfidenceReasons.length,
        aligned: derived.aligned.length,
        frozen: fit.receipt.parameters.filter((parameter) => parameter.frozen).length,
        fitMs: Math.round(performance.now() - started),
      };
      if (protocol.acceptance) {
        const decision = decidePhotoFitAcceptance(fit, protocol.acceptance);
        record.acceptance = { ...decision, relativeLossGain: +decision.relativeLossGain.toFixed(4), iou: +decision.iou.toFixed(4) };
        record.final = decision.accept ? fitScore.summary : llmScore.summary;
      }
      writeFileSync(join(outputDir, `${sceneId}-fitted-ir.json`), `${JSON.stringify(fit.ir, null, 1)}\n`);
      writeFileSync(join(outputDir, `${sceneId}-fit.json`), `${JSON.stringify({ spec, derived, anchor: fit.anchor, raster: fit.raster, cameraOnly: fit.cameraOnly, receipt: fit.receipt, ...(record.acceptance ? { acceptance: record.acceptance } : {}), lowConfidenceReasons: fit.lowConfidenceReasons, score: fitScore }, null, 1)}\n`);
    } catch (error) {
      record.fit = { error: (error as Error).message };
    }
    writeFileSync(join(outputDir, `${sceneId}-llm-score.json`), `${JSON.stringify(llmScore, null, 1)}\n`);
  }
  writeFileSync(join(outputDir, `${sceneId}-calls.json`), `${JSON.stringify({ request, calls, rounds }, null, 1)}\n`);
  results.push(record);
  console.log(JSON.stringify(record));
}
writeFileSync(join(outputDir, 'results.json'), `${JSON.stringify({
  schema: 'sceliph.photo-llm-eval/0.1',
  protocolSha256: createHash('sha256').update(protocolBytes).digest('hex'),
  sceneImageSha256: Object.fromEntries(sceneIds.map((id) => [id, sha256(readFileSync(join(scenesDir, id, 'image.png')))])),
  modelAlias: model,
  totalCostUsd: +results.reduce((sum, item) => sum + (item.costUsd as number), 0).toFixed(4),
  results,
}, null, 1)}\n`);
