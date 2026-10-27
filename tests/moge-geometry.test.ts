import { describe, expect, it } from 'vitest';
import {
  anchorMetricScale,
  buildMonocularCameraEvidence,
  finalizeMogeOutput,
  focalFromFovX,
  mogeIntrinsicsFromFocal,
  normalizedViewPlaneUv,
  recoverFocalShift,
  type MogeRawOutput,
} from '../src/engine/moge-geometry';

/** Builds the affine output MoGe would emit for a known pinhole camera. */
function syntheticRaw(width: number, height: number, focal: number, shift: number, metricScale?: number, depthAt = (x: number, y: number) => 2 + 0.6 * x / width + 0.3 * Math.sin(y / height * 3)): MogeRawOutput {
  const uv = normalizedViewPlaneUv(width, height);
  const points = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const z = depthAt(x, y);
      points[i * 3] = uv[i * 2]! * z / focal;
      points[i * 3 + 1] = uv[i * 2 + 1]! * z / focal;
      points[i * 3 + 2] = z - shift;
    }
  }
  return { width, height, points, metricScale };
}

describe('MoGe-2 ONNX post-processing port', () => {
  it('matches the upstream view-plane UV convention at pixel centres', () => {
    const uv = normalizedViewPlaneUv(4, 2);
    const a = 2;
    const spanX = a / Math.sqrt(1 + a * a);
    const spanY = 1 / Math.sqrt(1 + a * a);
    expect(uv[0]).toBeCloseTo(-spanX * 3 / 4, 12);
    expect(uv[1]).toBeCloseTo(-spanY * 1 / 2, 12);
    expect(uv[(1 * 4 + 3) * 2]).toBeCloseTo(spanX * 3 / 4, 12);
    expect(uv[(1 * 4 + 3) * 2 + 1]).toBeCloseTo(spanY * 1 / 2, 12);
  });

  it('recovers focal and shift of non-square synthetic point maps', () => {
    for (const [width, height, focal, shift] of [[96, 64, 1.4, 1.1], [64, 96, 0.9, -0.4], [80, 80, 2.2, 1.7]] as const) {
      const raw = syntheticRaw(width, height, focal, shift);
      const result = recoverFocalShift(raw.points, width, height);
      expect(result.focal).toBeCloseTo(focal, 4);
      expect(result.shift).toBeCloseTo(shift, 4);
      expect(result.sampledPoints).toBe(64 * 64);
    }
  });

  it('recovers only the shift when the field of view is known', () => {
    const width = 120;
    const height = 80;
    const focal = focalFromFovX(55, width / height);
    const raw = syntheticRaw(width, height, focal, 0.8);
    const result = recoverFocalShift(raw.points, width, height, undefined, focal);
    expect(result.focal).toBe(focal);
    expect(result.shift).toBeCloseTo(0.8, 4);
  });

  it('produces intrinsics, metric depth and a projection-consistent point map', () => {
    const width = 96;
    const height = 72;
    const focal = 1.3;
    const raw = syntheticRaw(width, height, focal, 0.9, 0.25);
    const geometry = finalizeMogeOutput(raw);
    const expected = mogeIntrinsicsFromFocal(focal, width / height);
    expect(geometry.intrinsics.fx).toBeCloseTo(expected.fx, 4);
    expect(geometry.intrinsics.fy).toBeCloseTo(expected.fy, 4);
    expect(geometry.validPixels).toBe(width * height);
    const i = 30 * width + 50;
    const trueDepth = 2 + 0.6 * 50 / width + 0.3 * Math.sin(30 / height * 3);
    expect(geometry.depth[i]).toBeCloseTo(trueDepth * 0.25, 4);
    const u = (50 + 0.5) / width;
    expect(geometry.points[i * 3]! / geometry.points[i * 3 + 2]! * geometry.intrinsics.fx + 0.5).toBeCloseTo(u, 5);
    const fovX = 2 * Math.atan(0.5 / expected.fx) * 180 / Math.PI;
    expect(geometry.fovXDegrees).toBeCloseTo(fovX, 2);
  });

  it('excludes masked pixels from the solve and the output', () => {
    const width = 64;
    const height = 64;
    const raw = syntheticRaw(width, height, 1.5, 0.5, 1);
    const mask = new Float32Array(width * height).fill(0.9);
    for (let i = 0; i < width * 20; i += 1) {
      mask[i] = 0.1;
      raw.points[i * 3 + 2] = 999;
    }
    const geometry = finalizeMogeOutput({ ...raw, mask });
    expect(geometry.focal).toBeCloseTo(1.5, 4);
    expect(geometry.validPixels).toBe(width * (height - 20));
    expect(geometry.depth[0]).toBe(Infinity);
    expect(geometry.validMask[0]).toBe(0);
  });

  it('measures a known anchor and reports the scale correction', () => {
    const width = 80;
    const height = 60;
    const raw = syntheticRaw(width, height, 1.2, 0.3, 0.5, () => 2);
    const geometry = finalizeMogeOutput(raw);
    const anchor = anchorMetricScale(geometry, { from: [10, 30], to: [70, 30], knownMm: 500 });
    const a = geometry.points.subarray((30 * width + 10) * 3, (30 * width + 10) * 3 + 3);
    const b = geometry.points.subarray((30 * width + 70) * 3, (30 * width + 70) * 3 + 3);
    const estimated = Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) * 1000;
    expect(anchor.estimatedMm).toBeCloseTo(estimated, 6);
    expect(anchor.scaleCorrection).toBeCloseTo(500 / estimated, 9);
    expect(() => anchorMetricScale(geometry, { from: [-1, 0], to: [5, 5], knownMm: 10 })).toThrow(/outside/);
    expect(() => anchorMetricScale(geometry, { from: [1, 1], to: [5, 5], knownMm: 0 })).toThrow(/positive/);
  });

  it('builds estimated evidence that never claims to write IR', () => {
    const raw = syntheticRaw(64, 48, 1.1, 0.2, 0.4);
    const geometry = finalizeMogeOutput(raw);
    const evidence = buildMonocularCameraEvidence(geometry, { modelId: 'test', modelSha256: 'a'.repeat(64), inputSha256: 'b'.repeat(64) });
    expect(evidence.provenance).toBe('estimated');
    expect(evidence.writesAssemblyIR).toBe(false);
    expect(evidence.depth.unit).toBe('m');
    expect(evidence.camera.intrinsicsPixels.cx).toBe(32);
    expect(evidence.limitations.some((item) => item.includes('anchor'))).toBe(true);
    expect(() => buildMonocularCameraEvidence(geometry, { modelId: 'x', modelSha256: 'bad', inputSha256: 'b'.repeat(64) })).toThrow(/SHA-256/);
  });

  it('rejects malformed raw outputs', () => {
    const raw = syntheticRaw(16, 16, 1, 0);
    expect(() => finalizeMogeOutput({ ...raw, points: new Float32Array(3) })).toThrow(/H×W×3/);
    expect(() => finalizeMogeOutput({ ...raw, metricScale: -1 })).toThrow(/positive/);
    expect(() => finalizeMogeOutput({ ...raw, width: 1 })).toThrow(/unsafe/);
    expect(() => focalFromFovX(180, 1)).toThrow();
  });
});
