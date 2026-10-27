/**
 * Pre-registered analysis of scripts/abo-photo-eval.ts results. Items are the
 * unit; paired differences use a seeded percentile bootstrap over items.
 * Excluded items (pre-registered run-time exclusions) are listed and left
 * out; an item whose model reply or fit failed keeps its written IR or, with
 * no IR at all, counts against the pipeline (arm score missing → loses).
 *
 *   npx vite-node scripts/abo-photo-summary.ts -- --results results.json [--out summary.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

interface Score { meanIoU: number; chamfer: number; fScore5: number; fScore2: number; extentError: [number, number, number] }
interface Result { modelId: string; productType: string; excluded?: string; fitError?: string; scores?: Record<string, Score>; fit?: { acceptance: { accept: boolean } } }

const path = argument('results');
if (!path) throw new Error('Missing --results.');
const run = JSON.parse(readFileSync(resolve(path), 'utf8')) as { protocolSha256: string; split: string; modelAlias: string; totalCostUsd: number; results: Result[] };
const included = run.results.filter((item) => !item.excluded);
const arms = ['b0', 'b1', 'llm', 'fit', 'final'] as const;

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (position - low);
}
const median = (values: number[]) => quantile(values, 0.5);
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function bootstrapMedianCi(values: number[], seed = 20261027, rounds = 10_000): [number, number] {
  const next = random(seed);
  const medians = Array.from({ length: rounds }, () => median(values.map(() => values[Math.floor(next() * values.length)]!)));
  return [quantile(medians, 0.025), quantile(medians, 0.975)];
}
const round = (value: number) => +value.toFixed(4);

/** A missing arm score (no IR) loses every comparison: IoU/F 0, extent error 1. */
const value = (item: Result, arm: string, metric: 'meanIoU' | 'fScore5' | 'chamfer'): number => item.scores?.[arm]?.[metric] ?? (metric === 'chamfer' ? 1 : 0);
const lateral = (item: Result, arm: string): number[] => {
  const error = item.scores?.[arm]?.extentError;
  return error ? [error[0], error[2]] : [1, 1];
};

const perArm = Object.fromEntries(arms.map((arm) => [arm, {
  medianIoU: round(median(included.map((item) => value(item, arm, 'meanIoU')))),
  medianFScore5: round(median(included.map((item) => value(item, arm, 'fScore5')))),
  medianChamfer: round(median(included.map((item) => value(item, arm, 'chamfer')))),
  lateralExtentErrorMedian: round(median(included.flatMap((item) => lateral(item, arm)))),
  lateralExtentErrorP75: round(quantile(included.flatMap((item) => lateral(item, arm)), 0.75)),
}]));
const paired = (a: string, b: string, metric: 'meanIoU' | 'fScore5') => {
  const diffs = included.map((item) => value(item, a, metric) - value(item, b, metric));
  const ci = bootstrapMedianCi(diffs);
  return { median: round(median(diffs)), ci95: [round(ci[0]), round(ci[1])], wins: diffs.filter((d) => d > 0.01).length, ties: diffs.filter((d) => Math.abs(d) <= 0.01).length, losses: diffs.filter((d) => d < -0.01).length };
};
const comparisons = {
  finalVsLlmIoU: paired('final', 'llm', 'meanIoU'),
  fitVsLlmIoU: paired('fit', 'llm', 'meanIoU'),
  finalVsB0IoU: paired('final', 'b0', 'meanIoU'),
  finalVsB1IoU: paired('final', 'b1', 'meanIoU'),
  finalVsB0FScore: paired('final', 'b0', 'fScore5'),
  finalVsB1FScore: paired('final', 'b1', 'fScore5'),
  llmVsB0IoU: paired('llm', 'b0', 'meanIoU'),
  llmVsB1IoU: paired('llm', 'b1', 'meanIoU'),
};
// Do no harm: items whose written IR already had lateral extent error ≤ 5% on both axes.
const accurate = included.filter((item) => item.scores?.llm && Math.max(...lateral(item, 'llm')) <= 0.05);
const harmed = accurate.filter((item) => Math.max(...lateral(item, 'final')) > Math.max(...lateral(item, 'llm')) + 0.03);

const criteria = [
  { id: 'final-beats-llm-iou', rule: 'median paired (final − llm) mean IoU ≥ 0.02 and bootstrap 95% CI lower bound > 0', pass: comparisons.finalVsLlmIoU.median >= 0.02 && comparisons.finalVsLlmIoU.ci95[0] > 0 },
  { id: 'final-beats-baselines', rule: 'median paired (final − b0) and (final − b1) > 0 for both mean IoU and F-score@5%', pass: [comparisons.finalVsB0IoU, comparisons.finalVsB1IoU, comparisons.finalVsB0FScore, comparisons.finalVsB1FScore].every((item) => item.median > 0) },
  { id: 'lateral-extent', rule: 'final lateral (x, z) extent error median ≤ 10% and p75 ≤ 25%', pass: perArm.final!.lateralExtentErrorMedian <= 0.1 && perArm.final!.lateralExtentErrorP75 <= 0.25 },
  { id: 'llm-beats-baselines', rule: 'median paired (llm − b0) and (llm − b1) mean IoU > 0 with bootstrap 95% CI lower bounds > 0', pass: [comparisons.llmVsB0IoU, comparisons.llmVsB1IoU].every((item) => item.median > 0 && item.ci95[0] > 0) },
  { id: 'do-no-harm', rule: 'of items with written lateral error ≤ 5%, at most 20% end > 3 pp worse', pass: accurate.length === 0 || harmed.length / accurate.length <= 0.2 },
];
const summary = {
  schema: 'sceliph.abo-photo-summary/0.1',
  protocolSha256: run.protocolSha256,
  split: run.split,
  modelAlias: run.modelAlias,
  items: run.results.length,
  excluded: run.results.filter((item) => item.excluded).map((item) => ({ modelId: item.modelId, reason: item.excluded })),
  noIr: included.filter((item) => !item.scores?.llm).map((item) => item.modelId),
  fitErrors: included.filter((item) => item.fitError).map((item) => ({ modelId: item.modelId, error: item.fitError })),
  accepted: included.filter((item) => item.fit?.acceptance.accept).length,
  perArm,
  comparisons,
  doNoHarm: { accurateItems: accurate.length, harmed: harmed.map((item) => item.modelId) },
  criteria,
  totalCostUsd: run.totalCostUsd,
};
const out = argument('out');
if (out) writeFileSync(resolve(out), `${JSON.stringify(summary, null, 1)}\n`);
console.log(JSON.stringify(summary, null, 1));
