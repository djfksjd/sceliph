/**
 * Pre-registered analysis of scripts/abo-multiview-eval.ts runs (one run per
 * repeat, same items). Items are the unit: each arm's metric is averaged over
 * the repeats first, then paired differences get a seeded percentile
 * bootstrap over items, per stratum. An arm with no IR in a repeat counts as
 * a failure there (IoU/F 0, Chamfer and size errors 1).
 *
 * Item metrics: footprint = max of the [long, short] footprint errors
 * (yaw-independent), height = y extent error, chamfer, fScore2, meanIoU.
 *
 *   npx vite-node scripts/abo-multiview-summary.ts -- --runs DIR1,DIR2,DIR3 --selection selection.json [--out summary.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

interface Score { meanIoU: number; chamfer: number; fScore2: number; extentError: [number, number, number]; footprintError: [number, number] }
interface Result { modelId: string; excluded?: string; scores?: Record<string, Score> }
type Metric = 'footprint' | 'height' | 'chamfer' | 'fScore2' | 'meanIoU';

const runDirs = (argument('runs') ?? '').split(',').filter(Boolean).map((dir) => resolve(dir));
if (runDirs.length === 0) throw new Error('Missing --runs.');
const runs = runDirs.map((dir) => JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8')) as { protocolSha256: string; modelAlias: string; totalCostUsd: number; results: Result[] });
if (new Set(runs.map((run) => run.protocolSha256)).size !== 1) throw new Error('Runs use different protocols.');
const selection = JSON.parse(readFileSync(resolve(argument('selection') ?? ''), 'utf8')) as { items: Array<{ modelId: string; stratum?: string }> };
const arms = ['b0', 'b1', 'b2', 'a1', 'a2'];
const metrics: Metric[] = ['footprint', 'height', 'chamfer', 'fScore2', 'meanIoU'];
const lowerIsBetter = (metric: Metric) => metric === 'footprint' || metric === 'height' || metric === 'chamfer';

const metricOf = (score: Score | undefined, metric: Metric): number => {
  if (!score) return lowerIsBetter(metric) ? 1 : 0;
  if (metric === 'footprint') return Math.max(...score.footprintError);
  if (metric === 'height') return score.extentError[1];
  return score[metric];
};

const ids = runs[0]!.results.map((result) => result.modelId);
const excluded = ids.filter((id) => runs.some((run) => run.results.find((result) => result.modelId === id)?.excluded));
const included = ids.filter((id) => !excluded.includes(id));
/** item → arm → metric → mean over repeats */
const table = new Map(included.map((id) => [id, Object.fromEntries(arms.map((arm) => [arm, Object.fromEntries(metrics.map((metric) => {
  const values = runs.map((run) => metricOf(run.results.find((result) => result.modelId === id)?.scores?.[arm], metric));
  return [metric, values.reduce((a, b) => a + b, 0) / values.length];
}))]))]));
const spread = (arm: string) => included.map((id) => {
  const values = runs.map((run) => metricOf(run.results.find((result) => result.modelId === id)?.scores?.[arm], 'footprint'));
  return Math.max(...values) - Math.min(...values);
});

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

const strataIds: Record<string, string[]> = { all: included };
for (const id of included) {
  const stratum = selection.items.find((item) => item.modelId === id)?.stratum ?? 'other';
  (strataIds[stratum] ??= []).push(id);
}
const paired = (members: string[], a: string, b: string, metric: Metric) => {
  const diffs = members.map((id) => table.get(id)![a]![metric]! - table.get(id)![b]![metric]!);
  const ci = bootstrapMedianCi(diffs);
  const better = (d: number) => (lowerIsBetter(metric) ? d < 0 : d > 0);
  return { n: diffs.length, median: round(median(diffs)), ci95: [round(ci[0]), round(ci[1])] as [number, number], better: diffs.filter(better).length, worse: diffs.filter((d) => d !== 0 && !better(d)).length };
};
const pairs: Array<[string, string]> = [['a2', 'a1'], ['a2', 'b2'], ['a1', 'b1'], ['a2', 'b1'], ['b2', 'b1']];
const strata = Object.fromEntries(Object.entries(strataIds).map(([name, members]) => [name, {
  n: members.length,
  perArm: Object.fromEntries(arms.map((arm) => [arm, {
    ...Object.fromEntries(metrics.map((metric) => [`${metric}Median`, round(median(members.map((id) => table.get(id)![arm]![metric]!)))])),
    footprintP75: round(quantile(members.map((id) => table.get(id)![arm]!.footprint!), 0.75)),
  }])),
  comparisons: Object.fromEntries(pairs.map(([a, b]) => [`${a}-${b}`, Object.fromEntries(metrics.map((metric) => [metric, paired(members, a, b, metric)]))])),
}]));

const thin = strata.thin!.comparisons;
const criteria = [
  { id: 'footprint-gain', rule: 'thin: median paired (a2 − a1) footprint error < 0 and bootstrap 95% CI upper bound < 0', pass: thin['a2-a1']!.footprint!.median < 0 && thin['a2-a1']!.footprint!.ci95[1] < 0 },
  { id: 'no-shape-loss', rule: 'thin: median paired (a2 − a1) Chamfer/diag ≤ +0.001', pass: thin['a2-a1']!.chamfer!.median <= 0.001 },
  { id: 'beats-hull', rule: 'all: median paired (a2 − b2) Chamfer/diag < 0 and bootstrap 95% CI upper bound < 0', pass: strata.all!.comparisons['a2-b2']!.chamfer!.median < 0 && strata.all!.comparisons['a2-b2']!.chamfer!.ci95[1] < 0 },
  { id: 'absolute-footprint', rule: 'thin: a2 footprint error median ≤ 10%', pass: strata.thin!.perArm.a2!.footprintMedian! <= 0.1 },
];
const summary = {
  schema: 'sceliph.abo-multiview-summary/0.1',
  protocolSha256: runs[0]!.protocolSha256,
  modelAlias: runs[0]!.modelAlias,
  repeats: runs.length,
  items: ids.length,
  excluded,
  noIr: Object.fromEntries(['a1', 'a2'].map((arm) => [arm, runs.map((run) => run.results.filter((result) => !result.excluded && !result.scores?.[arm]).map((result) => result.modelId))])),
  repeatSpreadFootprintMedian: Object.fromEntries(['a1', 'a2'].map((arm) => [arm, round(median(spread(arm)))])),
  strata,
  criteria,
  totalCostUsd: round(runs.reduce((sum, run) => sum + run.totalCostUsd, 0)),
};
const out = argument('out');
if (out) writeFileSync(resolve(out), `${JSON.stringify(summary, null, 1)}\n`);
console.log(JSON.stringify({ criteria, repeatSpread: summary.repeatSpreadFootprintMedian, perArm: Object.fromEntries(Object.entries(strata).map(([name, value]) => [name, value.perArm])) }, null, 1));
