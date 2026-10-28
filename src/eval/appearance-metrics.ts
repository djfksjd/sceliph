/**
 * Appearance metrics between two renders of the same view (reference vs
 * candidate), each an RGBA image whose alpha marks the object. Shape is
 * deliberately factored out: colour and pattern are compared only where both
 * renders cover the same pixels; mask IoU is reported separately.
 *
 *   deltaE00     CIEDE2000 between albedo pixels on the shared mask (median per view)
 *   histogram    intersection of each object's own Lab histogram (8×8×8), 1 = same palette
 *   detail       mean Sobel magnitude of albedo L* inside each eroded mask;
 *                ratio = candidate / reference (0 = flat, 1 = as much detail)
 *   ssim         windowed SSIM of L* on the shared mask (albedo and lit), pattern agreement
 *   detailLog    |ln(candidate detail / reference detail)| with part boundaries excluded
 *                (0 = the same amount of in-part pattern; flat or noisy both score high)
 *   spreadLog    |ln(candidate / reference)| of the in-part L* standard deviation
 * With an id image (one exact colour per mesh), detail and spread skip pixels whose
 * neighbourhood crosses a part boundary, so part edges never count as texture.
 */

export interface RgbaImage { width: number; height: number; data: Uint8ClampedArray | Uint8Array }
export interface RenderedImages { albedo: RgbaImage; lit: RgbaImage; ids?: RgbaImage }
export interface ViewPair { reference: RenderedImages; candidate: RenderedImages }
export interface AppearanceScores {
  maskIoU: number;
  deltaE00: number;
  histogram: number;
  detailReference: number;
  detailCandidate: number;
  detailRatio: number;
  detailLog: number;
  spreadReference: number;
  spreadCandidate: number;
  spreadLog: number;
  ssimAlbedo: number;
  ssimLit: number;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

/** sRGB 0–255 → CIE Lab (D65). */
export function srgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = toLinear(r / 255);
  const G = toLinear(g / 255);
  const B = toLinear(b / 255);
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIEDE2000 colour difference (Sharma, Wu & Dalal 2005). */
export function ciede2000(lab1: [number, number, number], lab2: [number, number, number]): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (a: number, b: number) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const h1p = hue(a1p, b1);
  const h2p = hue(a2p, b2);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * rad / 2);
  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
    else hbarp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos((hbarp - 30) * rad) + 0.24 * Math.cos(2 * hbarp * rad) + 0.32 * Math.cos((3 * hbarp + 6) * rad) - 0.2 * Math.cos((4 * hbarp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

function labImage(image: RgbaImage): { lab: Float32Array; mask: Uint8Array } {
  const n = image.width * image.height;
  const lab = new Float32Array(n * 3);
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const alpha = image.data[i * 4 + 3]!;
    if (alpha < 128) continue;
    mask[i] = 1;
    // Renders are on a transparent ground; un-premultiplied colour is the pixel colour.
    const [L, a, b] = srgbToLab(image.data[i * 4]!, image.data[i * 4 + 1]!, image.data[i * 4 + 2]!);
    lab[i * 3] = L;
    lab[i * 3 + 1] = a;
    lab[i * 3 + 2] = b;
  }
  return { lab, mask };
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = (sorted.length - 1) / 2;
  return (sorted[Math.floor(mid)]! + sorted[Math.ceil(mid)]!) / 2;
}

function histogram(lab: Float32Array, mask: Uint8Array): Float64Array {
  const bins = new Float64Array(512);
  let total = 0;
  const bin = (value: number, low: number, high: number) => Math.max(0, Math.min(7, Math.floor((value - low) / (high - low) * 8)));
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    bins[bin(lab[i * 3]!, 0, 100) * 64 + bin(lab[i * 3 + 1]!, -64, 64) * 8 + bin(lab[i * 3 + 2]!, -64, 64)] += 1;
    total += 1;
  }
  if (total > 0) for (let i = 0; i < bins.length; i += 1) bins[i]! /= total;
  return bins;
}

const idAt = (ids: RgbaImage | undefined, p: number) => (ids ? ids.data[p * 4]! + 256 * ids.data[p * 4 + 1]! : 0);

/** Pixels whose 3×3 neighbourhood is inside the mask and (with ids) inside one part. */
function interior(mask: Uint8Array, ids: RgbaImage | undefined, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const p = y * width + x;
      const id = idAt(ids, p);
      let inside = true;
      for (let dy = -1; dy <= 1 && inside; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const q = p + dy * width + dx;
        if (!mask[q] || idAt(ids, q) !== id) { inside = false; break; }
      }
      if (inside) out[p] = 1;
    }
  }
  return out;
}

/** Mean Sobel magnitude of L* over interior pixels. */
function detail(lab: Float32Array, inner: Uint8Array, width: number, height: number): number {
  let sum = 0;
  let count = 0;
  const L = (x: number, y: number) => lab[(y * width + x) * 3]!;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (!inner[y * width + x]) continue;
      const gx = L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1) - L(x - 1, y - 1) - 2 * L(x - 1, y) - L(x - 1, y + 1);
      const gy = L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1) - L(x - 1, y - 1) - 2 * L(x, y - 1) - L(x + 1, y - 1);
      sum += Math.hypot(gx, gy) / 8;
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

/** Pixel-weighted mean of each part's L* standard deviation over interior pixels. */
function spread(lab: Float32Array, inner: Uint8Array, ids: RgbaImage | undefined): number {
  const groups = new Map<number, { n: number; sum: number; sq: number }>();
  for (let p = 0; p < inner.length; p += 1) {
    if (!inner[p]) continue;
    const id = idAt(ids, p);
    const value = lab[p * 3]!;
    const group = groups.get(id) ?? { n: 0, sum: 0, sq: 0 };
    group.n += 1; group.sum += value; group.sq += value * value;
    groups.set(id, group);
  }
  let total = 0;
  let weight = 0;
  for (const group of groups.values()) {
    if (group.n < 16) continue;
    const mean = group.sum / group.n;
    total += Math.sqrt(Math.max(0, group.sq / group.n - mean * mean)) * group.n;
    weight += group.n;
  }
  return weight > 0 ? total / weight : 0;
}

const logGap = (candidate: number, reference: number, floor: number) => Math.abs(Math.log(Math.max(candidate, floor) / Math.max(reference, floor)));

/** Mean SSIM of L-star (scaled to 0–1) over 8×8 windows (stride 4) lying fully inside the shared mask. */
export function ssim(a: Float32Array, b: Float32Array, shared: Uint8Array, width: number, height: number): number {
  const C1 = 0.01 ** 2;
  const C2 = 0.03 ** 2;
  let total = 0;
  let windows = 0;
  for (let y = 0; y + 8 <= height; y += 4) {
    for (let x = 0; x + 8 <= width; x += 4) {
      let full = true;
      let ma = 0; let mb = 0;
      for (let j = 0; j < 8 && full; j += 1) for (let i = 0; i < 8; i += 1) {
        const p = (y + j) * width + x + i;
        if (!shared[p]) { full = false; break; }
        ma += a[p * 3]! / 100;
        mb += b[p * 3]! / 100;
      }
      if (!full) continue;
      ma /= 64; mb /= 64;
      let va = 0; let vb = 0; let cov = 0;
      for (let j = 0; j < 8; j += 1) for (let i = 0; i < 8; i += 1) {
        const p = (y + j) * width + x + i;
        const da = a[p * 3]! / 100 - ma;
        const db = b[p * 3]! / 100 - mb;
        va += da * da; vb += db * db; cov += da * db;
      }
      va /= 63; vb /= 63; cov /= 63;
      total += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      windows += 1;
    }
  }
  return windows > 0 ? total / windows : NaN;
}

export function compareView(pair: ViewPair): AppearanceScores {
  const { width, height } = pair.reference.albedo;
  const ref = labImage(pair.reference.albedo);
  const cand = labImage(pair.candidate.albedo);
  const refLit = labImage(pair.reference.lit);
  const candLit = labImage(pair.candidate.lit);
  const shared = new Uint8Array(ref.mask.length);
  let inter = 0;
  let union = 0;
  const deltas: number[] = [];
  for (let i = 0; i < shared.length; i += 1) {
    if (ref.mask[i] || cand.mask[i]) union += 1;
    if (!(ref.mask[i] && cand.mask[i])) continue;
    shared[i] = 1;
    inter += 1;
    deltas.push(ciede2000([ref.lab[i * 3]!, ref.lab[i * 3 + 1]!, ref.lab[i * 3 + 2]!], [cand.lab[i * 3]!, cand.lab[i * 3 + 1]!, cand.lab[i * 3 + 2]!]));
  }
  const hRef = histogram(ref.lab, ref.mask);
  const hCand = histogram(cand.lab, cand.mask);
  let histogramIntersection = 0;
  for (let i = 0; i < hRef.length; i += 1) histogramIntersection += Math.min(hRef[i]!, hCand[i]!);
  const refInner = interior(ref.mask, pair.reference.ids, width, height);
  const candInner = interior(cand.mask, pair.candidate.ids, width, height);
  const detailReference = detail(ref.lab, refInner, width, height);
  const detailCandidate = detail(cand.lab, candInner, width, height);
  const spreadReference = spread(ref.lab, refInner, pair.reference.ids);
  const spreadCandidate = spread(cand.lab, candInner, pair.candidate.ids);
  return {
    maskIoU: union > 0 ? inter / union : 0,
    deltaE00: median(deltas),
    histogram: histogramIntersection,
    detailReference,
    detailCandidate,
    detailRatio: detailReference > 0 ? detailCandidate / detailReference : NaN,
    // Floors keep near-flat surfaces comparable: 0.25 Sobel-L* and 0.5 L* are below visible grain.
    detailLog: logGap(detailCandidate, detailReference, 0.25),
    spreadReference,
    spreadCandidate,
    spreadLog: logGap(spreadCandidate, spreadReference, 0.5),
    ssimAlbedo: ssim(ref.lab, cand.lab, shared, width, height),
    ssimLit: ssim(refLit.lab, candLit.lab, shared, width, height),
  };
}

/** Mean over views, skipping views where a score is undefined (e.g. no shared pixels). */
export function averageScores(views: AppearanceScores[]): AppearanceScores {
  const keys = Object.keys(views[0]!) as Array<keyof AppearanceScores>;
  return Object.fromEntries(keys.map((key) => {
    const values = views.map((view) => view[key]).filter((value) => Number.isFinite(value));
    return [key, values.length ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(4) : NaN];
  })) as unknown as AppearanceScores;
}
