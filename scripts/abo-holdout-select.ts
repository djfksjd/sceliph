/**
 * Selects a fresh, pre-registered holdout from Amazon Berkeley Objects
 * (CC-BY-4.0) for the photo → AssemblyIR evaluation: turntable catalog photos
 * (spins) paired with artist-authored metric GLB models. Every rule below is
 * applied to metadata only, before any image is looked at, and the manifest
 * records the rules, seed and file hashes.
 *
 *   npx vite-node scripts/abo-holdout-select.ts -- --data-dir DIR --out manifest.json \
 *     [--seed 20261027] [--dev 10] [--test 30] [--reserve 15] [--continue-from earlier.json]
 *
 * --continue-from extends an earlier manifest: the same seeded order is
 * rebuilt, its first items must equal the earlier manifest's items, and the
 * new items are taken after them, skipping any whose mesh signature
 * (vertices, faces, extents) repeats an earlier or already chosen item.
 * With --strata '{"thin":["LAMP",...]}' and --quota '{"test":{"thin":24,"other":12},"reserve":{...}}'
 * the continued items fill per-stratum quotas in order (test first, then
 * reserve); "other" is every type not named in a stratum.
 *
 * Downloads (into --data-dir, skipped when present): the 16 listings shards,
 * 3dmodels.csv.gz, spins.csv.gz, then the GLB and spin frames 0 and 18 of each
 * selected item. Attribution: data, images and 3D models © Amazon.com, ABO
 * dataset builders M. Guillaumin, T. Dideriksen, K. Deng, H. Arora, J. Collins,
 * J. Malik; licensed CC-BY-4.0.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

const BUCKET = 'https://amazon-berkeley-objects.s3.amazonaws.com';
const SHARDS = Array.from({ length: 16 }, (_, index) => `listings/metadata/listings_${index.toString(16)}.json.gz`);
const PRODUCT_TYPES = ['TABLE', 'DESK', 'SHELF', 'CABINET', 'DRESSER', 'STOOL', 'LAMP', 'LIGHT_FIXTURE', 'ELECTRIC_FAN', 'STORAGE_BOX'];
const MAX_FACES = 200_000;
const HEIGHT_AGREEMENT = 0.05;
const SPIN_FRAMES = 72;
const INPUT_FRAME = 0;
const SIDE_FRAME = 18;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function required(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`Missing --${name}.`);
  return value;
}
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

async function fetchTo(key: string, path: string): Promise<Buffer> {
  if (existsSync(path)) return readFileSync(path);
  const response = await fetch(`${BUCKET}/${key}`);
  if (!response.ok) throw new Error(`GET ${key} failed with ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  return bytes;
}

/** Mulberry32: small, deterministic and good enough for a shuffle. */
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

const INCH_MM = 25.4;
const unitMm: Record<string, number> = { inches: INCH_MM, inch: INCH_MM, centimeters: 10, millimeters: 1, meters: 1000, feet: 12 * INCH_MM };

interface Listing {
  item_id: string;
  spin_id?: string;
  '3dmodel_id'?: string;
  product_type?: Array<{ value: string }>;
  item_name?: Array<{ language_tag: string; value: string }>;
  item_dimensions?: Record<string, { normalized_value?: { unit: string; value: number }; unit: string; value: number }>;
}

const dataDir = resolve(required('data-dir'));
const out = resolve(required('out'));
if (existsSync(out)) throw new Error('Manifest already exists; a holdout is selected once.');
const seed = Number(argument('seed') ?? 20261027);
const continueFrom = argument('continue-from');
const earlier = continueFrom ? (JSON.parse(readFileSync(resolve(continueFrom), 'utf8')) as { seed: number; items: Array<{ modelId: string }> }) : undefined;
if (earlier && earlier.seed !== Number(argument('seed') ?? 20261027)) throw new Error('--continue-from needs the same seed.');
const strata = JSON.parse(argument('strata') ?? '{}') as Record<string, string[]>;
const quota = argument('quota') ? (JSON.parse(argument('quota')!) as Record<string, Record<string, number>>) : undefined;
const stratumOf = (productType: string): string => Object.entries(strata).find(([, types]) => types.includes(productType))?.[0] ?? 'other';
if (quota && !continueFrom) throw new Error('--quota applies to a continued selection.');
const counts = { dev: Number(argument('dev') ?? 10), test: Number(argument('test') ?? 30), reserve: Number(argument('reserve') ?? 15) };

const exposed = new Set<string>((JSON.parse(readFileSync(resolve('benchmarks/development-exposure-ledger.json'), 'utf8')) as { entries: Array<{ sourceItemId?: string }> }).entries.flatMap((entry) => (entry.sourceItemId ? [entry.sourceItemId] : [])));

const models = new Map<string, { path: string; faces: number; extentY: number; signature: string }>();
for (const line of gunzipSync(await fetchTo('3dmodels/metadata/3dmodels.csv.gz', join(dataDir, 'meta/3dmodels.csv.gz'))).toString('utf8').trim().split('\n').slice(1)) {
  const cells = line.split(',');
  models.set(cells[0]!, { path: cells[1]!, faces: Number(cells[11]), extentY: Number(cells[13]), signature: cells.slice(10, 15).join(',') });
}
const spins = new Map<string, Map<number, string>>();
for (const line of gunzipSync(await fetchTo('spins/metadata/spins.csv.gz', join(dataDir, 'meta/spins.csv.gz'))).toString('utf8').trim().split('\n').slice(1)) {
  const [spinId, azimuth, , , , path] = line.split(',');
  const frames = spins.get(spinId!) ?? new Map<number, string>();
  frames.set(Number(azimuth), path!);
  spins.set(spinId!, frames);
}

const rejected: Record<string, number> = {};
const reject = (reason: string) => { rejected[reason] = (rejected[reason] ?? 0) + 1; };
const candidates = new Map<string, { itemId: string; modelId: string; spinId: string; productType: string; name: string; heightMm: number; modelHeightMm: number; modelPath: string; faces: number }>();
for (const shard of SHARDS) {
  for (const line of gunzipSync(await fetchTo(shard, join(dataDir, shard))).toString('utf8').trim().split('\n')) {
    const listing = JSON.parse(line) as Listing;
    const modelId = listing['3dmodel_id'];
    const spinId = listing.spin_id;
    if (!modelId || !spinId) continue;
    const productType = listing.product_type?.[0]?.value ?? '';
    if (!PRODUCT_TYPES.includes(productType)) { reject('product type'); continue; }
    if (exposed.has(listing.item_id) || exposed.has(modelId)) { reject('development exposure'); continue; }
    const model = models.get(modelId);
    if (!model) { reject('model metadata missing'); continue; }
    if (!(model.faces <= MAX_FACES)) { reject('faces > 200k'); continue; }
    if (spins.get(spinId)?.size !== SPIN_FRAMES) { reject('spin is not 72 frames'); continue; }
    const height = listing.item_dimensions?.height;
    const factor = height ? unitMm[height.normalized_value?.unit ?? height.unit] : undefined;
    const heightMm = height && factor ? (height.normalized_value?.value ?? height.value) * factor : undefined;
    if (!heightMm || !(heightMm > 0)) { reject('no listed height'); continue; }
    const modelHeightMm = model.extentY * 1000;
    if (Math.abs(modelHeightMm - heightMm) / heightMm > HEIGHT_AGREEMENT) { reject('listed height disagrees with model'); continue; }
    if (candidates.has(modelId)) { reject('duplicate model'); continue; }
    const name = listing.item_name?.find((entry) => entry.language_tag === 'en_US')?.value ?? listing.item_name?.[0]?.value ?? '';
    candidates.set(modelId, { itemId: listing.item_id, modelId, spinId, productType, name, heightMm, modelHeightMm, modelPath: model.path, faces: model.faces });
  }
}

// Seeded shuffle, then round-robin over product types so no type dominates.
const next = random(seed);
const byType = new Map<string, Array<ReturnType<typeof candidates.get> & object>>();
for (const candidate of [...candidates.values()].sort((a, b) => a.modelId.localeCompare(b.modelId))) {
  const list = byType.get(candidate.productType) ?? [];
  list.push(candidate);
  byType.set(candidate.productType, list);
}
for (const list of byType.values()) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
}
const order: Array<ReturnType<typeof candidates.get> & object> = [];
const types = [...byType.keys()].sort();
for (let round = 0; order.length < candidates.size; round += 1) {
  for (const type of types) {
    const item = byType.get(type)![round];
    if (item) order.push(item);
  }
}
const wanted = counts.dev + counts.test + counts.reserve;
let chosen: Array<(typeof order)[number] & { split?: string }> = order.slice(0, wanted);
if (earlier) {
  const prefix = order.slice(0, earlier.items.length).map((item) => item.modelId);
  if (prefix.join() !== earlier.items.map((item) => item.modelId).join()) throw new Error('The rebuilt order does not start with the earlier manifest; inputs changed.');
  const seen = new Set(prefix.map((modelId) => models.get(modelId)!.signature));
  chosen = [];
  const filled: Record<string, Record<string, number>> = {};
  const total = quota ? Object.values(quota).reduce((sum, perStratum) => sum + Object.values(perStratum).reduce((a, b) => a + b, 0), 0) : wanted;
  for (const candidate of order.slice(prefix.length)) {
    if (chosen.length === total) break;
    const signature = models.get(candidate.modelId)!.signature;
    if (seen.has(signature)) { reject('mesh repeats an earlier item'); continue; }
    let split: string | undefined;
    if (quota) {
      const stratum = stratumOf(candidate.productType);
      split = Object.keys(quota).find((name) => (filled[name]?.[stratum] ?? 0) < (quota[name]![stratum] ?? 0));
      if (!split) continue;
      filled[split] = { ...filled[split], [stratum]: (filled[split]?.[stratum] ?? 0) + 1 };
    }
    seen.add(signature);
    chosen.push({ ...candidate, ...(split ? { split } : {}) });
  }
}
const items = [];
for (const [index, candidate] of chosen.entries()) {
  const frames = spins.get(candidate.spinId)!;
  const glb = await fetchTo(`3dmodels/original/${candidate.modelPath}`, join(dataDir, 'models', `${candidate.modelId}.glb`));
  const photo = await fetchTo(`spins/original/${frames.get(INPUT_FRAME)}`, join(dataDir, 'spins', `${candidate.modelId}-${INPUT_FRAME}.jpg`));
  const side = await fetchTo(`spins/original/${frames.get(SIDE_FRAME)}`, join(dataDir, 'spins', `${candidate.modelId}-${SIDE_FRAME}.jpg`));
  items.push({
    ...candidate,
    split: candidate.split ?? (index < counts.dev ? 'dev' : index < counts.dev + counts.test ? 'test' : 'reserve'),
    ...(quota ? { stratum: stratumOf(candidate.productType) } : {}),
    glbSha256: sha256(glb),
    photoSha256: sha256(photo),
    sideSha256: sha256(side),
  });
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({
  schema: 'sceliph.abo-holdout/0.1',
  selectedAt: new Date().toISOString(),
  license: 'CC-BY-4.0 (Amazon Berkeley Objects)',
  rules: { productTypes: PRODUCT_TYPES, maxFaces: MAX_FACES, heightAgreement: HEIGHT_AGREEMENT, spinFrames: SPIN_FRAMES, inputFrame: INPUT_FRAME, sideFrame: SIDE_FRAME, excluded: 'items and models in benchmarks/development-exposure-ledger.json; duplicate 3dmodel ids', order: 'per-type seeded Fisher–Yates (mulberry32), then round-robin over sorted types', replacement: 'a dev/test item that fails a pre-registered run-time exclusion is replaced by the next reserve item of any type' },
  seed,
  ...(earlier ? { continuesFrom: { path: continueFrom, items: earlier.items.length } } : {}),
  ...(quota ? { strata, quota } : {}),
  candidates: candidates.size,
  candidatesByType: Object.fromEntries(types.map((type) => [type, byType.get(type)!.length])),
  rejected,
  items,
}, null, 1)}\n`);
console.log(JSON.stringify({ candidates: candidates.size, byType: Object.fromEntries(types.map((type) => [type, byType.get(type)!.length])), rejected, selected: items.length }));
