import { describe, expect, it } from 'vitest';
import { minimizeCmaEs, seededNormal, symmetricEigen } from '../src/engine/cma-es';
import { squaredDistanceTransform } from '../src/engine/distance-transform';

describe('CMA-ES port', () => {
  it('decomposes symmetric matrices', () => {
    const matrix = [[4, 1, 0.5], [1, 3, 0.2], [0.5, 0.2, 2]];
    const { values, basis } = symmetricEigen(matrix);
    for (let k = 0; k < 3; k += 1) {
      for (let i = 0; i < 3; i += 1) {
        const av = matrix[i]!.reduce((sum, value, j) => sum + value * basis[j]![k]!, 0);
        expect(av).toBeCloseTo(values[k]! * basis[i]![k]!, 10);
      }
    }
  });

  it('minimises sphere and Rosenbrock functions', () => {
    const sphere = minimizeCmaEs((x) => x.reduce((sum, v) => sum + (v - 0.3) ** 2, 0), [1, -1, 2, 0.5], { sigma: 0.5, seed: 7, targetValue: 1e-12 });
    expect(sphere.bestValue).toBeLessThan(1e-10);
    sphere.best.forEach((value) => expect(value).toBeCloseTo(0.3, 4));
    const rosenbrock = minimizeCmaEs((x) => x.slice(0, -1).reduce((sum, v, i) => sum + 100 * (x[i + 1]! - v * v) ** 2 + (1 - v) ** 2, 0), [0, 0, 0, 0], { sigma: 0.5, seed: 3, targetValue: 1e-10 });
    expect(rosenbrock.bestValue).toBeLessThan(1e-8);
  });

  it('is reproducible for one seed and different across seeds', () => {
    const objective = (x: number[]) => (x[0]! - 1) ** 2 + 10 * (x[1]! + 2) ** 2;
    const a = minimizeCmaEs(objective, [0, 0], { sigma: 1, seed: 42, maxEvaluations: 120 });
    const b = minimizeCmaEs(objective, [0, 0], { sigma: 1, seed: 42, maxEvaluations: 120 });
    const c = minimizeCmaEs(objective, [0, 0], { sigma: 1, seed: 43, maxEvaluations: 120 });
    expect(a).toEqual(b);
    expect(c.best).not.toEqual(a.best);
    const normal = seededNormal(9);
    const samples = Array.from({ length: 20_000 }, normal);
    const mean = samples.reduce((sum, v) => sum + v, 0) / samples.length;
    const variance = samples.reduce((sum, v) => sum + (v - mean) ** 2, 0) / samples.length;
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(variance).toBeCloseTo(1, 1);
  });

  it('rejects unsafe inputs and NaN objectives', () => {
    expect(() => minimizeCmaEs(() => 0, [], { sigma: 1, seed: 1 })).toThrow();
    expect(() => minimizeCmaEs(() => 0, [0], { sigma: 0, seed: 1 })).toThrow(/sigma/);
    expect(() => minimizeCmaEs(() => 0, [0], { sigma: 1, seed: -1 })).toThrow(/seed/);
    expect(() => minimizeCmaEs(() => NaN, [0], { sigma: 1, seed: 1 })).toThrow(/NaN/);
  });
});

describe('Felzenszwalb–Huttenlocher distance transform', () => {
  it('matches brute force on random masks', () => {
    const normal = seededNormal(5);
    for (const [width, height] of [[17, 11], [1, 9], [23, 1], [32, 32]] as const) {
      const mask = new Uint8Array(width * height).map(() => (normal() > 1.2 ? 1 : 0));
      mask[0] = 1;
      const transform = squaredDistanceTransform(mask, width, height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          let best = Infinity;
          for (let j = 0; j < height; j += 1) {
            for (let i = 0; i < width; i += 1) if (mask[j * width + i]) best = Math.min(best, (i - x) ** 2 + (j - y) ** 2);
          }
          expect(transform[y * width + x]).toBe(best);
        }
      }
    }
  });

  it('handles an empty target class and the background target', () => {
    const empty = squaredDistanceTransform(new Uint8Array(12), 4, 3);
    expect([...empty].every((value) => value === Infinity)).toBe(true);
    const mask = new Uint8Array([1, 1, 1, 1, 0, 1, 1, 1, 1]);
    expect(squaredDistanceTransform(mask, 3, 3, 0)[0]).toBe(2);
    expect(() => squaredDistanceTransform(new Uint8Array(5), 2, 2)).toThrow(/unsafe/);
  });
});
