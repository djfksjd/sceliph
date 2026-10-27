/**
 * Pre-registered analysis for benchmarks/oss-integration-20261026/abo-appearance/protocol.json.
 *
 *   npx vite-node scripts/abo-appearance-summary.ts -- --dir benchmarks/oss-integration-20261026/abo-appearance
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

type Scores = Record<string, { deltaE00: number; histogram: number; detailRatio: number; detailReference: number; ssimAlbedo: number; ssimLit: number; maskIoU: number }>;
interface Run { results: Array<{ modelId: string; stratum?: string; scores: Scores }> }

const index = process.argv.indexOf('--dir');
const dir = resolve(index >= 0 ? process.argv[index + 1]! : 'benchmarks/oss-integration-20261026/abo-appearance');
const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as Run;

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  return sorted[Math.floor(position)]! + (sorted[Math.ceil(position)]! - sorted[Math.floor(position)]!) * (position - Math.floor(position));
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
const count = (list: boolean[]) => list.filter(Boolean).length;

// Phase A
const a = read('phaseA-dev-controls.json').results;
const phaseA = [
  { id: 'V1', rule: 'self deltaE00 = 0 and detailRatio = 1 on every item', pass: a.every((r) => r.scores.self!.deltaE00 === 0 && Math.abs(r.scores.self!.detailRatio - 1) < 1e-9), observed: `${count(a.map((r) => r.scores.self!.deltaE00 === 0))}/${a.length}` },
  { id: 'V2', rule: 'flat detailRatio <= 0.1 on >= 9/10 and hue detailRatio within [0.9, 1.1] on >= 9/10', pass: count(a.map((r) => r.scores.flat!.detailRatio <= 0.1)) >= 9 && count(a.map((r) => r.scores.hue!.detailRatio >= 0.9 && r.scores.hue!.detailRatio <= 1.1)) >= 9, observed: `flat ${count(a.map((r) => r.scores.flat!.detailRatio <= 0.1))}/10, hue ${count(a.map((r) => r.scores.hue!.detailRatio >= 0.9 && r.scores.hue!.detailRatio <= 1.1))}/10` },
  { id: 'V3', rule: 'grey deltaE00 > flat deltaE00 on >= 9/10', pass: count(a.map((r) => r.scores.grey!.deltaE00 > r.scores.flat!.deltaE00)) >= 9, observed: `${count(a.map((r) => r.scores.grey!.deltaE00 > r.scores.flat!.deltaE00))}/10` },
];

// Phase B
const controls = new Map(read('phaseB-test-controls.json').results.map((r) => [r.modelId, r.scores]));
const arms = Object.fromEntries(['a1', 'a2'].map((arm) => {
  const results = read(`phaseB-test-${arm}.json`).results;
  const metric = (key: 'deltaE00' | 'histogram' | 'detailRatio' | 'ssimAlbedo' | 'ssimLit' | 'maskIoU', name: string) => results.map((r) => r.scores[name]![key]).filter(Number.isFinite);
  const diffs = results.map((r) => r.scores[arm]!.deltaE00 - r.scores[`${arm}-grey`]!.deltaE00).filter(Number.isFinite);
  const ci = bootstrapMedianCi(diffs);
  const textured = results.filter((r) => (controls.get(r.modelId)?.self?.detailReference ?? 0) >= 1);
  return [arm, {
    n: results.length,
    deltaE00: { ir: round(median(metric('deltaE00', arm))), greyIr: round(median(metric('deltaE00', `${arm}-grey`))), pairedMedian: round(median(diffs)), ci95: [round(ci[0]), round(ci[1])], better: diffs.filter((d) => d < 0).length },
    histogram: { ir: round(median(metric('histogram', arm))), greyIr: round(median(metric('histogram', `${arm}-grey`))) },
    detailRatio: { ir: round(median(metric('detailRatio', arm))), texturedItems: textured.length, irOnTextured: textured.length ? round(median(textured.map((r) => r.scores[arm]!.detailRatio))) : null },
    ssimAlbedo: round(median(metric('ssimAlbedo', arm))),
    ssimLit: round(median(metric('ssimLit', arm))),
    maskIoU: round(median(metric('maskIoU', arm))),
    byStratum: Object.fromEntries(['thin', 'other'].map((stratum) => {
      const members = results.filter((r) => r.stratum === stratum);
      return [stratum, { n: members.length, deltaE00: members.length ? round(median(members.map((r) => r.scores[arm]!.deltaE00))) : null }];
    })),
  }];
}));
const control = (name: string, key: 'deltaE00' | 'detailReference') => round(median([...controls.values()].map((s) => s[name]![key]).filter(Number.isFinite)));
const summary = {
  schema: 'sceliph.abo-appearance-summary/0.1',
  phaseA,
  phaseB: {
    arms,
    controls: { flatDeltaE00: control('flat', 'deltaE00'), greyDeltaE00: control('grey', 'deltaE00'), referenceDetail: control('self', 'detailReference') },
    criteria: [
      { id: 'B1', rule: 'a2: median paired (IR - grey IR) deltaE00 < 0 and 95% CI upper < 0', pass: arms.a2!.deltaE00.pairedMedian < 0 && arms.a2!.deltaE00.ci95[1] < 0 },
    ],
  },
};
writeFileSync(join(dir, 'summary.json'), `${JSON.stringify(summary, null, 1)}\n`);
console.log(JSON.stringify(summary, null, 1));
