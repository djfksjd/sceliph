/**
 * Minimal deterministic CMA-ES for small bounded fitting problems.
 *
 * Ported from Nikolaus Hansen's `purecma.py` (pycma, public domain; pycma
 * revision 5846f6ea3ac709014f78779182fd01db3c508550): the `CMAESParameters`
 * defaults, `ask`/`tell` updates, lazy eigendecomposition and the JAMA-derived
 * `tred2`/`tql2` symmetric eigen solver. The only change in behaviour is the
 * normal generator, which is a seeded Mulberry32 + Box–Muller stream so the
 * same seed reproduces the same search on every runtime.
 */

export interface CmaEsOptions {
  sigma: number;
  seed: number;
  populationSize?: number;
  maxEvaluations?: number;
  targetValue?: number;
}

export interface CmaEsResult {
  best: number[];
  bestValue: number;
  evaluations: number;
  iterations: number;
  mean: number[];
  stopReason: 'maxEvaluations' | 'targetValue' | 'condition' | 'tolfun' | 'tolx';
}

const MAX_DIMENSION = 64;

export function seededNormal(seed: number): () => number {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('CMA-ES seed must be a uint32.');
  let state = seed >>> 0;
  let spare: number | undefined;
  const uniform = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) + 0.5) / 4294967296;
  };
  return () => {
    if (spare !== undefined) {
      const value = spare;
      spare = undefined;
      return value;
    }
    const radius = Math.sqrt(-2 * Math.log(uniform()));
    const angle = 2 * Math.PI * uniform();
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}

/** Householder tridiagonalisation (JAMA `tred2`, via purecma). */
function tred2(n: number, V: number[][], d: number[], e: number[]): void {
  for (let j = 0; j < n; j += 1) d[j] = V[n - 1]![j]!;
  for (let i = n - 1; i > 0; i -= 1) {
    let h = 0;
    let scale = 0;
    for (let k = 0; k < i; k += 1) scale += Math.abs(d[k]!);
    if (scale === 0) {
      e[i] = d[i - 1]!;
      for (let j = 0; j < i; j += 1) {
        d[j] = V[i - 1]![j]!;
        V[i]![j] = 0;
        V[j]![i] = 0;
      }
    } else {
      for (let k = 0; k < i; k += 1) {
        d[k] = d[k]! / scale;
        h += d[k]! * d[k]!;
      }
      let f = d[i - 1]!;
      let g = Math.sqrt(h);
      if (f > 0) g = -g;
      e[i] = scale * g;
      h -= f * g;
      d[i - 1] = f - g;
      for (let j = 0; j < i; j += 1) e[j] = 0;
      for (let j = 0; j < i; j += 1) {
        f = d[j]!;
        V[j]![i] = f;
        g = e[j]! + V[j]![j]! * f;
        for (let k = j + 1; k < i; k += 1) {
          g += V[k]![j]! * d[k]!;
          e[k] = e[k]! + V[k]![j]! * f;
        }
        e[j] = g;
      }
      f = 0;
      for (let j = 0; j < i; j += 1) {
        e[j] = e[j]! / h;
        f += e[j]! * d[j]!;
      }
      const hh = f / (h + h);
      for (let j = 0; j < i; j += 1) e[j] = e[j]! - hh * d[j]!;
      for (let j = 0; j < i; j += 1) {
        f = d[j]!;
        g = e[j]!;
        for (let k = j; k < i; k += 1) V[k]![j] = V[k]![j]! - (f * e[k]! + g * d[k]!);
        d[j] = V[i - 1]![j]!;
        V[i]![j] = 0;
      }
    }
    d[i] = h;
  }
  for (let i = 0; i < n - 1; i += 1) {
    V[n - 1]![i] = V[i]![i]!;
    V[i]![i] = 1;
    const h = d[i + 1]!;
    if (h !== 0) {
      for (let k = 0; k <= i; k += 1) d[k] = V[k]![i + 1]! / h;
      for (let j = 0; j <= i; j += 1) {
        let g = 0;
        for (let k = 0; k <= i; k += 1) g += V[k]![i + 1]! * V[k]![j]!;
        for (let k = 0; k <= i; k += 1) V[k]![j] = V[k]![j]! - g * d[k]!;
      }
    }
    for (let k = 0; k <= i; k += 1) V[k]![i + 1] = 0;
  }
  for (let j = 0; j < n; j += 1) {
    d[j] = V[n - 1]![j]!;
    V[n - 1]![j] = 0;
  }
  V[n - 1]![n - 1] = 1;
  e[0] = 0;
}

/** Symmetric tridiagonal QL with implicit shifts (JAMA `tql2`, via purecma). */
function tql2(n: number, d: number[], e: number[], V: number[][]): void {
  for (let i = 1; i < n; i += 1) e[i - 1] = e[i]!;
  e[n - 1] = 0;
  let f = 0;
  let tst1 = 0;
  const eps = 2 ** -52;
  for (let l = 0; l < n; l += 1) {
    tst1 = Math.max(tst1, Math.abs(d[l]!) + Math.abs(e[l]!));
    let m = l;
    while (m < n) {
      if (Math.abs(e[m]!) <= eps * tst1) break;
      m += 1;
    }
    if (m > l) {
      for (let iteration = 0; ; iteration += 1) {
        if (iteration > 64 * n) throw new Error('CMA-ES eigendecomposition did not converge.');
        let g = d[l]!;
        let p = (d[l + 1]! - g) / (2 * e[l]!);
        let r = Math.hypot(p, 1);
        if (p < 0) r = -r;
        d[l] = e[l]! / (p + r);
        d[l + 1] = e[l]! * (p + r);
        const dl1 = d[l + 1]!;
        let h = g - d[l]!;
        for (let i = l + 2; i < n; i += 1) d[i] = d[i]! - h;
        f += h;
        p = d[m]!;
        let c = 1;
        let c2 = c;
        let c3 = c;
        const el1 = e[l + 1]!;
        let s = 0;
        let s2 = 0;
        for (let i = m - 1; i >= l; i -= 1) {
          c3 = c2;
          c2 = c;
          s2 = s;
          g = c * e[i]!;
          h = c * p;
          r = Math.hypot(p, e[i]!);
          e[i + 1] = s * r;
          s = e[i]! / r;
          c = p / r;
          p = c * d[i]! - s * g;
          d[i + 1] = h + s * (c * g + s * d[i]!);
          for (let k = 0; k < n; k += 1) {
            h = V[k]![i + 1]!;
            V[k]![i + 1] = s * V[k]![i]! + c * h;
            V[k]![i] = c * V[k]![i]! - s * h;
          }
        }
        p = -s * s2 * c3 * el1 * e[l]! / dl1;
        e[l] = s * p;
        d[l] = c * p;
        if (Math.abs(e[l]!) <= eps * tst1) break;
      }
    }
    d[l] = d[l]! + f;
    e[l] = 0;
  }
}

/** Returns eigenvalues and a row-major basis whose columns are eigenvectors. */
export function symmetricEigen(matrix: number[][]): { values: number[]; basis: number[][] } {
  const n = matrix.length;
  const V = matrix.map((row) => row.slice());
  const d = new Array<number>(n).fill(0);
  const e = new Array<number>(n).fill(0);
  tred2(n, V, d, e);
  tql2(n, d, e, V);
  return { values: d, basis: V };
}

/** Minimises `objective` from `start`; never mutates its inputs. */
export function minimizeCmaEs(objective: (x: number[]) => number, start: number[], options: CmaEsOptions): CmaEsResult {
  const N = start.length;
  if (N < 1 || N > MAX_DIMENSION || !start.every(Number.isFinite)) throw new Error(`CMA-ES start must have 1–${MAX_DIMENSION} finite values.`);
  if (!(Number.isFinite(options.sigma) && options.sigma > 0)) throw new Error('CMA-ES sigma must be finite and positive.');
  const randn = seededNormal(options.seed);
  const lambda = options.populationSize ?? 4 + Math.floor(3 * Math.log(N));
  if (!Number.isInteger(lambda) || lambda < 4 || lambda > 512) throw new Error('CMA-ES population size must be an integer in [4, 512].');
  const maxEvaluations = options.maxEvaluations ?? Math.round(100 * lambda + 150 * (N + 3) ** 2 * Math.sqrt(lambda));
  if (!Number.isInteger(maxEvaluations) || maxEvaluations < lambda || maxEvaluations > 1_000_000) {
    throw new Error('CMA-ES evaluation budget is unsafe.');
  }
  const mu = Math.floor(lambda / 2);
  const rawWeights = Array.from({ length: mu }, (_, i) => Math.log(lambda / 2 + 0.5) - Math.log(i + 1));
  const weightSum = rawWeights.reduce((sum, w) => sum + w, 0);
  const weights = rawWeights.map((w) => w / weightSum);
  const mueff = weights.reduce((sum, w) => sum + w, 0) ** 2 / weights.reduce((sum, w) => sum + w * w, 0);
  const cc = (4 + mueff / N) / (N + 4 + 2 * mueff / N);
  const cs = (mueff + 2) / (N + mueff + 5);
  const c1 = 2 / ((N + 1.3) ** 2 + mueff);
  const cmu = Math.min(1 - c1, 2 * (mueff - 2 + 1 / mueff) / ((N + 2) ** 2 + mueff));
  const damps = 2 * mueff / lambda + 0.3 + cs;
  const lazyGap = 0.5 * N * lambda / (c1 + cmu) / N ** 2;

  let mean = start.slice();
  let sigma = options.sigma;
  const pc = new Array<number>(N).fill(0);
  const ps = new Array<number>(N).fill(0);
  const C: number[][] = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => (i === j ? 1 : 0)));
  let basis = C.map((row) => row.slice());
  let eigenvalues = new Array<number>(N).fill(1);
  let invsqrt = C.map((row) => row.slice());
  let condition = 1;
  let updatedAt = 0;
  let evaluations = 0;
  let iterations = 0;
  let best = start.slice();
  let bestValue = Infinity;

  const updateEigensystem = (): void => {
    if (evaluations <= updatedAt + lazyGap) return;
    for (let i = 0; i < N; i += 1) {
      for (let j = 0; j < i; j += 1) C[i]![j] = C[j]![i] = (C[i]![j]! + C[j]![i]!) / 2;
    }
    const eigen = symmetricEigen(C);
    if (Math.min(...eigen.values) <= 0) throw new Error('CMA-ES covariance lost positive definiteness.');
    eigenvalues = eigen.values;
    basis = eigen.basis;
    condition = Math.max(...eigenvalues) / Math.min(...eigenvalues);
    invsqrt = Array.from({ length: N }, () => new Array<number>(N).fill(0));
    for (let i = 0; i < N; i += 1) {
      for (let j = 0; j <= i; j += 1) {
        let sum = 0;
        for (let k = 0; k < N; k += 1) sum += basis[i]![k]! * basis[j]![k]! / Math.sqrt(eigenvalues[k]!);
        invsqrt[i]![j] = invsqrt[j]![i] = sum;
      }
    }
    updatedAt = evaluations;
  };

  for (;;) {
    updateEigensystem();
    const candidates: number[][] = [];
    for (let k = 0; k < lambda; k += 1) {
      const z = eigenvalues.map((value) => sigma * Math.sqrt(value) * randn());
      candidates.push(mean.map((m, i) => m + basis[i]!.reduce((sum, b, j) => sum + b * z[j]!, 0)));
    }
    const values = candidates.map((candidate) => {
      const value = objective(candidate.slice());
      if (Number.isNaN(value)) throw new Error('CMA-ES objective returned NaN.');
      return value;
    });
    evaluations += lambda;
    iterations += 1;
    const order = values.map((_, i) => i).sort((a, b) => values[a]! - values[b]! || a - b);
    const sorted = order.map((i) => candidates[i]!);
    const sortedValues = order.map((i) => values[i]!);
    if (sortedValues[0]! < bestValue) {
      bestValue = sortedValues[0]!;
      best = sorted[0]!.slice();
    }
    const old = mean;
    mean = Array.from({ length: N }, (_, i) => sorted.slice(0, mu).reduce((sum, x, k) => sum + weights[k]! * x[i]!, 0));
    const y = mean.map((m, i) => m - old[i]!);
    const z = invsqrt.map((row) => row.reduce((sum, v, j) => sum + v * y[j]!, 0));
    const csn = Math.sqrt(cs * (2 - cs) * mueff) / sigma;
    for (let i = 0; i < N; i += 1) ps[i] = (1 - cs) * ps[i]! + csn * z[i]!;
    const ccn = Math.sqrt(cc * (2 - cc) * mueff) / sigma;
    const psSquare = ps.reduce((sum, v) => sum + v * v, 0);
    const hsig = psSquare / N / (1 - (1 - cs) ** (2 * evaluations / lambda)) < 2 + 4 / (N + 1) ? 1 : 0;
    for (let i = 0; i < N; i += 1) pc[i] = (1 - cc) * pc[i]! + ccn * hsig * y[i]!;
    const c1a = c1 * (1 - (1 - hsig ** 2) * cc * (2 - cc));
    const decay = 1 - c1a - cmu;
    for (let i = 0; i < N; i += 1) {
      for (let j = 0; j < N; j += 1) {
        let value = C[i]![j]! * decay + c1 * pc[i]! * pc[j]!;
        for (let k = 0; k < mu; k += 1) {
          value += weights[k]! * cmu / sigma ** 2 * (sorted[k]![i]! - old[i]!) * (sorted[k]![j]! - old[j]!);
        }
        C[i]![j] = value;
      }
    }
    sigma *= Math.exp(Math.min(1, cs / damps * (psSquare / N - 1) / 2));

    let stopReason: CmaEsResult['stopReason'] | undefined;
    if (options.targetValue !== undefined && sortedValues[0]! <= options.targetValue) stopReason = 'targetValue';
    else if (evaluations >= maxEvaluations) stopReason = 'maxEvaluations';
    else if (condition > 1e14) stopReason = 'condition';
    else if (sortedValues[sortedValues.length - 1]! - sortedValues[0]! < 1e-12) stopReason = 'tolfun';
    else if (sigma * Math.sqrt(Math.max(...eigenvalues)) < 1e-11) stopReason = 'tolx';
    if (stopReason) return { best, bestValue, evaluations, iterations, mean, stopReason };
  }
}
