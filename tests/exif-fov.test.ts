import { describe, expect, it } from 'vitest';
import { fovFromExif, readJpegExif } from '../src/engine/exif-fov';

type Entry = { tag: number; type: number; values: number[] | string };

/** Builds a JPEG prefix containing an APP1 Exif segment with IFD0 and an Exif IFD. */
function jpegWithExif(ifd0: Entry[], exif: Entry[], little = true): Uint8Array {
  const typeSize: Record<number, number> = { 2: 1, 3: 2, 4: 4, 5: 8 };
  const tiff: number[] = [];
  const u16 = (v: number) => (little ? [v & 255, v >> 8] : [v >> 8, v & 255]);
  const u32 = (v: number) => (little ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24] : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255]);
  tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8));
  const layout = (entries: Entry[], start: number) => {
    const data: number[] = [];
    const table: number[] = [...u16(entries.length)];
    const dataStart = start + 2 + entries.length * 12 + 4;
    for (const entry of entries) {
      const raw: number[] = typeof entry.values === 'string'
        ? [...entry.values].map((c) => c.charCodeAt(0)).concat(0)
        : entry.values.flatMap((v) => (entry.type === 3 ? u16(v) : entry.type === 4 ? u32(v) : u32(Math.round(v * 1000)).concat(u32(1000))));
      const count = typeof entry.values === 'string' ? raw.length : entry.values.length;
      table.push(...u16(entry.tag), ...u16(entry.type), ...u32(count));
      if (raw.length <= 4) table.push(...raw, ...new Array(4 - raw.length).fill(0));
      else {
        table.push(...u32(dataStart + data.length));
        data.push(...raw);
      }
      void typeSize;
    }
    return [...table, ...u32(0), ...data];
  };
  const ifd0Bytes = (exifOffset: number) => layout([...ifd0, { tag: 0x8769, type: 4, values: [exifOffset] }], 8);
  const exifOffset = 8 + ifd0Bytes(0).length;
  tiff.push(...ifd0Bytes(exifOffset), ...layout(exif, exifOffset));
  const payload = [...'Exif\0\0'].map((c) => c.charCodeAt(0)).concat(tiff);
  const length = payload.length + 2;
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 255, ...payload, 0xff, 0xd9]);
}

describe('EXIF field of view', () => {
  it('reads tags in both byte orders and derives the 35 mm-equivalent FOV', () => {
    for (const little of [true, false]) {
      const bytes = jpegWithExif(
        [{ tag: 0x010f, type: 2, values: 'SONY' }, { tag: 0x0112, type: 3, values: [1] }],
        [{ tag: 0xa405, type: 3, values: [26] }, { tag: 0x920a, type: 5, values: [4.25] }, { tag: 0xa002, type: 4, values: [4032] }, { tag: 0xa003, type: 4, values: [3024] }],
        little,
      );
      const tags = readJpegExif(bytes)!;
      expect(tags).toMatchObject({ make: 'SONY', orientation: 1, focalLength35mm: 26, focalLengthMm: 4.25, pixelXDimension: 4032, pixelYDimension: 3024 });
      const fov = fovFromExif(tags, 1008, 756);
      if (!('fovXDegrees' in fov)) throw new Error(fov.reason);
      const horizontal = Math.hypot(36, 24) * 0.8;
      expect(fov.fovXDegrees).toBeCloseTo(2 * Math.atan(horizontal / 52) * 180 / Math.PI, 9);
      expect(fov.method).toBe('focal-length-35mm-equivalent');
      expect(fov.provenance).toBe('declared');
    }
  });

  it('uses focal-plane resolution and handles rotated orientation', () => {
    // 6000 px over 3.577 cm ≈ a 35.77 mm-wide sensor, 50 mm lens.
    const exif = [{ tag: 0x920a, type: 5, values: [50] }, { tag: 0xa20e, type: 5, values: [1677.418] }, { tag: 0xa210, type: 3, values: [3] }, { tag: 0xa002, type: 4, values: [6000] }, { tag: 0xa003, type: 4, values: [4000] }];
    const landscape = fovFromExif(readJpegExif(jpegWithExif([], exif)), 6000, 4000);
    if (!('fovXDegrees' in landscape)) throw new Error(landscape.reason);
    expect(landscape.fovXDegrees).toBeCloseTo(2 * Math.atan((6000 / 1677.418 * 10) / 100) * 180 / Math.PI, 4);
    const portrait = fovFromExif(readJpegExif(jpegWithExif([{ tag: 0x0112, type: 3, values: [6] }], exif)), 4000, 6000);
    if (!('fovXDegrees' in portrait)) throw new Error(portrait.reason);
    expect(portrait.fovXDegrees).toBeLessThan(landscape.fovXDegrees);
    expect(portrait.fovXDegrees).toBeCloseTo(2 * Math.atan((4000 / 1677.418 * 10) / 100) * 180 / Math.PI, 4);
  });

  it('refuses crops, missing tags and malformed data', () => {
    const exif = [{ tag: 0xa405, type: 3, values: [28] }, { tag: 0xa002, type: 4, values: [4000] }, { tag: 0xa003, type: 4, values: [3000] }];
    expect(fovFromExif(readJpegExif(jpegWithExif([], exif)), 1000, 1000)).toMatchObject({ reason: expect.stringMatching(/cropped/) });
    expect(fovFromExif(readJpegExif(jpegWithExif([], [{ tag: 0x920a, type: 5, values: [4] }])), 100, 75)).toMatchObject({ reason: expect.stringMatching(/lacks/) });
    expect(fovFromExif(undefined, 10, 10)).toEqual({ reason: 'No EXIF metadata.' });
    expect(readJpegExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeUndefined();
    const truncated = jpegWithExif([], exif).slice(0, 30);
    expect(() => readJpegExif(truncated)).not.toThrow();
    const corrupt = jpegWithExif([], exif);
    corrupt[16] = 0xff;
    corrupt[17] = 0xff;
    expect(() => readJpegExif(corrupt)).not.toThrow();
  });
});
