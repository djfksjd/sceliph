/**
 * Appearance evaluation on ABO items: the artist GLB (with its textures) against a
 * candidate rendered from the same synthetic cameras (src/eval/appearance-render.ts
 * in Chrome through Playwright), scored by src/eval/appearance-metrics.ts.
 *
 *   --mode controls   candidates are the reference itself with controlled appearance
 *                     damage on identical geometry. Validates the metric:
 *                       self  the reference render itself
 *                       flat  every object pixel set to the view's mean visible colour
 *                             (the best single colour: colour kept, detail removed)
 *                       hueIn hue turned 180° in LCh with chroma reduced until it fits
 *                             sRGB, L* kept (detail kept, colour changed)
 *                       shuffle object pixels circularly shifted by half their count in
 *                             raster order (same colour statistics, wrong placement)
 *                       grey  the reference geometry rendered with #808080 materials
 *   --mode ir         candidates are LLM-written IRs from a run directory (yaw taken
 *                     from that run's shape scores) and the same IRs painted grey.
 *
 *   npx vite --port 5199 --strictPort &   (the harness page is scripts/appearance/render.html)
 *   PLAYWRIGHT_MODULE=/path/to/playwright npx vite-node scripts/abo-appearance-eval.ts -- \
 *     --mode controls --selection selection.json --split dev --data-dir DIR --output out.json [--base http://127.0.0.1:5199]
 *   ... --mode ir --selection selection.json --run DIR --arm a2 --data-dir DIR --output out.json
 *
 * ABO data, images and 3D models © Amazon.com, CC-BY-4.0.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { averageScores, compareView, srgbToLab, type AppearanceScores, type RgbaImage } from '../src/eval/appearance-metrics';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function required(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`Missing --${name}.`);
  return value;
}

const RENDER = { views: 8, elevationDeg: 20, size: 256 };
const mode = required('mode');
if (mode !== 'controls' && mode !== 'ir') throw new Error('--mode must be controls or ir.');
const base = argument('base') ?? 'http://127.0.0.1:5199';
const dataDir = resolve(required('data-dir'));
const selection = JSON.parse(readFileSync(resolve(required('selection')), 'utf8')) as { items: Array<{ modelId: string; split: string; productType: string; stratum?: string }> };

type Job = { modelId: string; productType: string; stratum?: string; candidates: Array<{ name: string; request: Record<string, unknown>; derive?: Derived[] }> };
type Derived = 'flat' | 'hueIn' | 'shuffle';
const jobs: Job[] = [];
if (mode === 'controls') {
  const only = argument('only')?.split(',');
  const split = argument('split') ?? 'dev';
  for (const item of selection.items.filter((entry) => (only ? only.includes(entry.modelId) : entry.split === split))) {
    jobs.push({ modelId: item.modelId, productType: item.productType, candidates: [
      { name: 'self', request: {}, derive: ['flat', 'hueIn', 'shuffle'] },
      { name: 'grey', request: { control: 'grey' } },
    ] });
  }
} else {
  const runDir = resolve(required('run'));
  const arm = required('arm');
  const run = JSON.parse(readFileSync(join(runDir, 'results.json'), 'utf8')) as { results: Array<{ modelId: string; excluded?: string; scores?: Record<string, { yawDeg: number }> }> };
  for (const result of run.results) {
    const irPath = join(runDir, `${result.modelId}-${arm}-ir.json`);
    if (result.excluded || !existsSync(irPath) || !result.scores?.[arm]) continue;
    const ir = JSON.parse(readFileSync(irPath, 'utf8')) as unknown;
    const item = selection.items.find((entry) => entry.modelId === result.modelId);
    jobs.push({ modelId: result.modelId, productType: item?.productType ?? '', ...(item?.stratum ? { stratum: item.stratum } : {}), candidates: [
      { name: arm, request: { ir, yawDeg: result.scores[arm]!.yawDeg } },
      { name: `${arm}-grey`, request: { ir, yawDeg: result.scores[arm]!.yawDeg, paint: '#808080' } },
    ] });
  }
}

/** Pixel-level controls derived from the reference render (object pixels only). */
function derive(image: RgbaImage, kind: Derived, ids?: RgbaImage): RgbaImage {
  const data = new Uint8ClampedArray(image.data);
  const n = image.width * image.height;
  const inside: number[] = [];
  for (let i = 0; i < n; i += 1) if (data[i * 4 + 3]! >= 128) inside.push(i);
  if (kind === 'flat') {
    let r = 0; let g = 0; let b = 0;
    for (const i of inside) { r += srgbToLinear(data[i * 4]!); g += srgbToLinear(data[i * 4 + 1]!); b += srgbToLinear(data[i * 4 + 2]!); }
    const count = Math.max(1, inside.length);
    const mean = [r, g, b].map((value) => linearToSrgb(value / count));
    for (const i of inside) data.set(mean, i * 4);
  } else if (kind === 'shuffle') {
    // Shift only among interior pixels of the same part (3×3 neighbourhood inside one id),
    // so edge pixels never move inward and parts never trade colours.
    const source = new Uint8ClampedArray(image.data);
    const id = (p: number) => (ids ? ids.data[p * 4]! + 256 * ids.data[p * 4 + 1]! : 0);
    const groups = new Map<number, number[]>();
    for (const p of inside) {
      const x = p % image.width;
      const y = Math.floor(p / image.width);
      if (x < 1 || y < 1 || x >= image.width - 1 || y >= image.height - 1) continue;
      let interior = true;
      for (let dy = -1; dy <= 1 && interior; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const q = p + dy * image.width + dx;
        if (source[q * 4 + 3]! < 128 || id(q) !== id(p)) { interior = false; break; }
      }
      if (!interior) continue;
      const list = groups.get(id(p)) ?? [];
      list.push(p);
      groups.set(id(p), list);
    }
    for (const list of groups.values()) {
      const shift = Math.floor(list.length / 2);
      list.forEach((p, k) => { const from = list[(k + shift) % list.length]! * 4; data.set(source.subarray(from, from + 3), p * 4); });
    }
  } else {
    for (const i of inside) {
      const [L, a, bb] = srgbToLab(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!);
      const chroma = Math.hypot(a, bb);
      const hue = Math.atan2(bb, a) + Math.PI;
      let scale = 1;
      // Shrink chroma until the rotated colour is inside sRGB, so L* (and detail) is kept.
      for (let step = 0; step < 24 && !inGamut(L, chroma * scale * Math.cos(hue), chroma * scale * Math.sin(hue)); step += 1) scale *= 0.85;
      data.set(labToSrgb(L, chroma * scale * Math.cos(hue), chroma * scale * Math.sin(hue)), i * 4);
    }
  }
  return { width: image.width, height: image.height, data };
}
const srgbToLinear = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const linearToSrgb = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
function labToLinear(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const inv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const x = inv(fy + a / 500) * 0.95047;
  const y = inv(fy);
  const z = inv(fy - b / 200) * 1.08883;
  return [3.2404542 * x - 1.5371385 * y - 0.4985314 * z, -0.969266 * x + 1.8760108 * y + 0.041556 * z, 0.0556434 * x - 0.2040259 * y + 1.0572252 * z];
}
const inGamut = (L: number, a: number, b: number) => labToLinear(L, a, b).every((value) => value >= -1e-4 && value <= 1 + 1e-4);
function labToSrgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const x = inv(fx) * 0.95047;
  const y = inv(fy);
  const z = inv(fz) * 1.08883;
  const R = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const G = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const B = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return [linearToSrgb(R), linearToSrgb(G), linearToSrgb(B)];
}

async function decode(encoded: string): Promise<RgbaImage> {
  const match = /^rgba:(\d+):([A-Za-z0-9+/=]+)$/.exec(encoded);
  if (!match) throw new Error('Empty render (WebGL context lost?).');
  const size = Number(match[1]);
  const data = new Uint8Array(Buffer.from(match[2]!, 'base64'));
  if (data.length !== size * size * 4) throw new Error('Render size mismatch.');
  return { width: size, height: size, data };
}

const playwright = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright') as { chromium: { launch: (options: Record<string, unknown>) => Promise<any> } };
const browser = await playwright.chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.route('**/__glb/**', (route: any) => {
  const id = new URL(route.request().url()).pathname.split('/').pop()!.replace(/\.glb$/, '');
  if (!/^[A-Z0-9]+$/.test(id)) return route.abort();
  return route.fulfill({ path: join(dataDir, 'models', `${id}.glb`), contentType: 'model/gltf-binary' });
});
await page.goto(`${base}/scripts/appearance/render.html`);
await page.waitForFunction(() => 'sceliphAppearance' in window, undefined, { timeout: 60_000 });

const results = [];
for (const job of jobs) {
  const record: Record<string, unknown> = { modelId: job.modelId, productType: job.productType, ...(job.stratum ? { stratum: job.stratum } : {}) };
  const scores: Record<string, AppearanceScores> = {};
  for (const candidate of job.candidates) {
    const rendered = await page.evaluate(async (request: Record<string, unknown>) => (window as any).sceliphAppearance.renderPair(request),
      { glbUrl: `/__glb/${job.modelId}.glb`, yawDeg: 0, ...RENDER, ...candidate.request }) as { reference: Array<{ albedo: string; lit: string; ids: string }>; candidate: Array<{ albedo: string; lit: string; ids: string }> };
    if (!rendered.reference.every((view) => view.albedo.length > 64 && view.lit.length > 64 && view.ids.length > 64) || !rendered.candidate.every((view) => view.albedo.length > 64 && view.lit.length > 64 && view.ids.length > 64)) {
      record.renderError = `${candidate.name}: empty render`;
      continue;
    }
    const views: AppearanceScores[] = [];
    const derived: Record<string, AppearanceScores[]> = Object.fromEntries((candidate.derive ?? []).map((kind) => [kind, []]));
    for (let k = 0; k < rendered.reference.length; k += 1) {
      const reference = { albedo: await decode(rendered.reference[k]!.albedo), lit: await decode(rendered.reference[k]!.lit), ids: await decode(rendered.reference[k]!.ids) };
      const own = { albedo: await decode(rendered.candidate[k]!.albedo), lit: await decode(rendered.candidate[k]!.lit), ids: await decode(rendered.candidate[k]!.ids) };
      views.push(compareView({ reference, candidate: own }));
      for (const kind of candidate.derive ?? []) derived[kind]!.push(compareView({ reference, candidate: { albedo: derive(own.albedo, kind, own.ids), lit: derive(own.lit, kind, own.ids), ids: own.ids } }));
    }
    scores[candidate.name] = averageScores(views);
    for (const [kind, list] of Object.entries(derived)) scores[kind] = averageScores(list);
  }
  record.scores = scores;
  results.push(record);
  console.log(JSON.stringify({ modelId: job.modelId, ...Object.fromEntries(Object.entries(scores).map(([name, s]) => [name, `dE ${s.deltaE00} hist ${s.histogram} detail ${s.detailRatio} ssimA ${s.ssimAlbedo} iou ${s.maskIoU}`])) }));
}
await browser.close();
const out = resolve(required('output'));
writeFileSync(out, `${JSON.stringify({
  schema: 'sceliph.abo-appearance-eval/0.1',
  mode,
  render: RENDER,
  metricsSha256: createHash('sha256').update(readFileSync(resolve('src/eval/appearance-metrics.ts'))).digest('hex'),
  rendererSha256: createHash('sha256').update(readFileSync(resolve('src/eval/appearance-render.ts'))).digest('hex'),
  results,
}, null, 1)}\n`);
