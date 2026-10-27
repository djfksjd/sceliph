import { describe, expect, it } from 'vitest';
import { ciede2000, compareView, srgbToLab, type RgbaImage } from '../src/eval/appearance-metrics';

const image = (width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]): RgbaImage => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) data.set(pixel(x, y), (y * width + x) * 4);
  return { width, height, data };
};

describe('appearance metrics', () => {
  it('matches published CIEDE2000 test pairs', () => {
    // Sharma, Wu & Dalal (2005), pairs 1 and 17.
    expect(ciede2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 3);
    expect(ciede2000([50, 2.5, 0], [73, 25, -18])).toBeCloseTo(27.1492, 3);
    const white = srgbToLab(255, 255, 255);
    expect(white[0]).toBeCloseTo(100, 2);
    expect(Math.abs(white[1]) + Math.abs(white[2])).toBeLessThan(0.05);
  });

  it('separates colour error from missing detail', () => {
    const square = (x: number, y: number) => x >= 4 && x < 60 && y >= 4 && y < 60;
    const striped = image(64, 64, (x, y) => (square(x, y) ? (x % 6 < 3 ? [150, 90, 50, 255] : [110, 60, 30, 255]) : [0, 0, 0, 0]));
    const flat = image(64, 64, (x, y) => (square(x, y) ? [130, 75, 40, 255] : [0, 0, 0, 0]));
    const blue = image(64, 64, (x, y) => (square(x, y) ? (x % 6 < 3 ? [50, 90, 150, 255] : [30, 60, 110, 255]) : [0, 0, 0, 0]));
    const pair = (candidate: RgbaImage) => compareView({ reference: { albedo: striped, lit: striped }, candidate: { albedo: candidate, lit: candidate } });
    const self = pair(striped);
    const flatScores = pair(flat);
    const blueScores = pair(blue);
    expect(self.deltaE00).toBe(0);
    expect(self.detailRatio).toBeCloseTo(1, 6);
    expect(self.ssimAlbedo).toBeCloseTo(1, 6);
    expect(self.maskIoU).toBe(1);
    // Flat keeps the mean colour but loses the stripes.
    expect(flatScores.detailRatio).toBeLessThan(0.05);
    expect(flatScores.deltaE00).toBeLessThan(blueScores.deltaE00);
    // A hue swap keeps the stripes but changes the colour.
    expect(blueScores.detailRatio).toBeGreaterThan(0.5);
    expect(blueScores.deltaE00).toBeGreaterThan(20);
    expect(blueScores.histogram).toBeLessThan(self.histogram);
  });

  it('does not count part boundaries as texture when an id image is given', () => {
    const square = (x: number, y: number) => x >= 4 && x < 60 && y >= 4 && y < 60;
    const twoParts = image(64, 64, (x, y) => (square(x, y) ? (x < 32 ? [200, 60, 40, 255] : [40, 60, 200, 255]) : [0, 0, 0, 0]));
    const ids = image(64, 64, (x, y) => (square(x, y) ? (x < 32 ? [1, 0, 128, 255] : [2, 0, 128, 255]) : [0, 0, 0, 0]));
    const flatRef = image(64, 64, (x, y) => (square(x, y) ? [120, 60, 120, 255] : [0, 0, 0, 0]));
    const without = compareView({ reference: { albedo: flatRef, lit: flatRef }, candidate: { albedo: twoParts, lit: twoParts } });
    const withIds = compareView({ reference: { albedo: flatRef, lit: flatRef }, candidate: { albedo: twoParts, lit: twoParts, ids } });
    expect(without.detailCandidate).toBeGreaterThan(0.1);
    expect(withIds.detailCandidate).toBe(0);
    expect(withIds.detailLog).toBe(0);
    expect(withIds.spreadLog).toBe(0);
  });
});

