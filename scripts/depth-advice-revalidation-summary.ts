/**
 * Pre-registered re-validation of the slice-12 side-photo rule
 * (src/engine/depth-view-advice.ts) on fresh ABO items. The rule is applied
 * to each item from the one-photo arm's view reply of the first repeat (a1View)
 * and the pre-defined product stratum (thin → thin-structure, other →
 * box-furniture), before looking at any score. Item metric: footprint error =
 * max of the [long, short] footprint errors, averaged over repeats; an item
 * missing an arm in any repeat is dropped. Bootstrap: 10k resamples over items,
 * seed 20261027.
 *
 *   npx vite-node scripts/depth-advice-revalidation-summary.ts -- --selection selection.json \
 *     --runs r1,r2,r3 --out summary.json
 *
 * ABO data, images and 3D models © Amazon.com, CC-BY-4.0.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ReferenceView } from '../src/engine/reference-set';
import { adviseDepthView } from '../src/engine/depth-view-advice';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

interface Score { footprintError: [number, number]; meanIoU: number; fScore2: number }
interface Result { modelId: string; excluded?: string; a1View?: { azimuthDeg: number }; scores?: { a1?: Score; a2?: Score } }

const selection = JSON.parse(readFileSync(resolve(argument('selection')!), 'utf8')) as { items: Array<{ modelId: string; stratum: string }> };
const runs = argument('runs')!.split(',').map((dir) => (JSON.parse(readFileSync(join(resolve(dir), 'results.json'), 'utf8')) as { results: Result[] }).results);

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
const resample = (values: number[], next: () => number) => values.map(() => values[Math.floor(next() * values.length)]!);
function bootstrapMedianCi(values: number[], seed = 20261027, rounds = 10_000): [number, number] {
  const next = random(seed);
  const medians = Array.from({ length: rounds }, () => median(resample(values, next)));
  return [quantile(medians, 0.025), quantile(medians, 0.975)];
}
function bootstrapGapCi(a: number[], b: number[], seed = 20261027, rounds = 10_000): [number, number] {
  const next = random(seed);
  const gaps = Array.from({ length: rounds }, () => median(resample(a, next)) - median(resample(b, next)));
  return [quantile(gaps, 0.025), quantile(gaps, 0.975)];
}
/** One-sided exact binomial P(X ≥ k | n, 0.5). */
function signTestP(k: number, n: number): number {
  let p = 0;
  for (let i = k; i <= n; i += 1) {
    let c = 1;
    for (let j = 0; j < i; j += 1) c = (c * (n - j)) / (j + 1);
    p += c / 2 ** n;
  }
  return p;
}
const round = (value: number) => +value.toFixed(4);
const footprint = (score: Score | undefined) => (score ? Math.max(...score.footprintError) : undefined);
const photoView = { id: 'photo', assetKind: 'product', url: '', fileName: 'p.jpg', fileSize: 1, mimeType: 'image/jpeg', lastModified: 1, role: 'front', evidence: { fileName: 'p.jpg', width: 1, height: 1, averageColor: '#777777', brightness: 0.5, portraitSuitability: 90, notes: [] } } as unknown as ReferenceView;

const TIE = 0.005;
const rows = [];
for (const first of runs[0]!) {
  if (first.excluded) continue;
  const item = selection.items.find((candidate) => candidate.modelId === first.modelId)!;
  const per = runs.map((run) => run.find((result) => result.modelId === first.modelId));
  const a1 = per.map((result) => footprint(result?.scores?.a1));
  const a2 = per.map((result) => footprint(result?.scores?.a2));
  if ([...a1, ...a2].some((value) => value === undefined)) continue;
  const azimuth = first.a1View?.azimuthDeg;
  const advice = adviseDepthView([photoView], azimuth === undefined ? [] : [{ viewId: 'photo', azimuthDeg: azimuth, source: 'model-estimate' }], item.stratum === 'thin' ? 'thin-structure' : 'box-furniture');
  const mean = (values: Array<number | undefined>) => values.reduce((sum: number, value) => sum + value!, 0) / values.length;
  const meanIoU = (arm: 'a1' | 'a2') => mean(per.map((result) => result!.scores![arm]!.meanIoU));
  rows.push({
    modelId: item.modelId, stratum: item.stratum, azimuthDeg: azimuth ?? null, reason: advice.reason, request: advice.requestSidePhoto,
    a1: round(mean(a1)), a2: round(mean(a2)), diff: round(mean(a2) - mean(a1)), iouDiff: round(meanIoU('a2') - meanIoU('a1')),
  });
}

const group = (flag: boolean) => rows.filter((row) => row.request === flag);
const describe = (members: typeof rows) => {
  const diffs = members.map((row) => row.diff);
  const better = members.filter((row) => row.diff < -TIE).length;
  const worse = members.filter((row) => row.diff > TIE).length;
  return {
    n: members.length,
    a1Median: members.length ? round(median(members.map((row) => row.a1))) : null,
    a2Median: members.length ? round(median(members.map((row) => row.a2))) : null,
    diffMedian: members.length ? round(median(diffs)) : null,
    diffCi95: members.length ? bootstrapMedianCi(diffs).map(round) : null,
    better, worse, ties: members.length - better - worse,
    signTestP: better + worse ? round(signTestP(better, better + worse)) : null,
    iouDiffMedian: members.length ? round(median(members.map((row) => row.iouDiff))) : null,
  };
};
const requested = describe(group(true));
const notRequested = describe(group(false));
const gapCi = group(true).length && group(false).length ? bootstrapGapCi(group(true).map((row) => row.diff), group(false).map((row) => row.diff)).map(round) : null;
const criteria = [
  { id: 'V1-requested-gain', rule: 'requested: median paired (a2 − a1) footprint < 0 and bootstrap 95% CI upper < 0', pass: requested.diffMedian !== null && requested.diffMedian < 0 && requested.diffCi95![1]! < 0 },
  { id: 'V2-requested-sign', rule: `requested: one-sided sign test on items with |diff| > ${TIE}, p < 0.05`, pass: requested.signTestP !== null && requested.signTestP < 0.05 },
  { id: 'V3-not-requested-no-gain', rule: 'not requested: median paired (a2 − a1) footprint ≥ −0.01 (a second photo would not materially help); needs n ≥ 6', pass: notRequested.n >= 6 && notRequested.diffMedian! >= -0.01 },
  { id: 'V4-separation', rule: 'median(requested diffs) − median(not-requested diffs) < 0 with bootstrap 95% CI upper < 0; needs n ≥ 6 per group', pass: requested.n >= 6 && notRequested.n >= 6 && gapCi !== null && median(group(true).map((row) => row.diff)) - median(group(false).map((row) => row.diff)) < 0 && gapCi[1]! < 0 },
];
const byReason = Object.fromEntries([...new Set(rows.map((row) => row.reason))].map((reason) => [reason, rows.filter((row) => row.reason === reason).length]));
const out = { schema: 'sceliph.depth-advice-revalidation/0.1', repeats: runs.length, tieBand: TIE, requested, notRequested, gapCi95: gapCi, byReason, criteria, rows };
writeFileSync(resolve(argument('out')!), `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify({ requested, notRequested, gapCi95: gapCi, byReason, criteria: criteria.map((criterion) => `${criterion.id}: ${criterion.pass ? 'PASS' : 'FAIL'}`) }, null, 1));
