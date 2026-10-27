/**
 * Exact squared Euclidean distance transform of a binary mask using the
 * separable lower-envelope algorithm of Felzenszwalb & Huttenlocher,
 * "Distance Transforms of Sampled Functions" (Theory of Computing, 2012).
 * Implemented from the paper; no upstream code is copied.
 */

const MAX_PIXELS = 16_777_216;

function transform1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q += 1) {
    if (f[q] === Infinity) continue;
    if (f[v[k]!] === Infinity) {
      v[k] = q;
      continue;
    }
    let s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) {
      k -= 1;
      s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q += 1) {
    while (z[k + 1]! < q) k += 1;
    const source = f[v[k]!]!;
    d[q] = source === Infinity ? Infinity : (q - v[k]!) ** 2 + source;
  }
}

/**
 * Squared distance, in pixels, from every pixel to the nearest pixel whose
 * mask value equals `target` (1 = foreground by default). Pixels of the target
 * class have distance 0; an empty target class yields Infinity everywhere.
 */
export function squaredDistanceTransform(mask: Uint8Array, width: number, height: number, target: 0 | 1 = 1): Float64Array {
  if (!(mask instanceof Uint8Array) || !Number.isInteger(width) || !Number.isInteger(height)
    || width < 1 || height < 1 || width * height !== mask.length || mask.length > MAX_PIXELS) {
    throw new Error('Distance transform mask dimensions are unsafe or inconsistent.');
  }
  const out = new Float64Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) out[i] = (mask[i] ? 1 : 0) === target ? 0 : Infinity;
  const size = Math.max(width, height);
  const f = new Float64Array(size);
  const d = new Float64Array(size);
  const v = new Int32Array(size);
  const z = new Float64Array(size + 1);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) f[y] = out[y * width + x]!;
    transform1d(f, height, d, v, z);
    for (let y = 0; y < height; y += 1) out[y * width + x] = d[y]!;
  }
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) f[x] = out[row + x]!;
    transform1d(f, width, d, v, z);
    for (let x = 0; x < width; x += 1) out[row + x] = d[x]!;
  }
  return out;
}
