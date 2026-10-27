/**
 * Minimal, bounded JPEG EXIF reader for camera field-of-view evidence.
 * Reads only the tags needed to derive the horizontal FOV; never trusts
 * offsets without bounds checks. A FOV derived here is `declared` camera
 * metadata, not a calibration: crops, digital zoom and lens distortion are
 * not visible in EXIF.
 */

export interface ExifCameraTags {
  orientation?: number;
  make?: string;
  model?: string;
  focalLengthMm?: number;
  focalLength35mm?: number;
  pixelXDimension?: number;
  pixelYDimension?: number;
  focalPlaneXResolution?: number;
  /** EXIF FocalPlaneResolutionUnit: 2 = inch, 3 = centimetre, 4 = millimetre, 5 = micrometre. */
  focalPlaneResolutionUnit?: number;
}

const MAX_SCAN_BYTES = 1 << 20;
const MAX_IFD_ENTRIES = 512;

export function readJpegExif(bytes: Uint8Array): ExifCameraTags | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let offset = 2;
  const limit = Math.min(bytes.length, MAX_SCAN_BYTES);
  while (offset + 4 <= limit) {
    if (bytes[offset] !== 0xff) return undefined;
    const marker = bytes[offset + 1]!;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return undefined;
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (length < 2 || offset + 2 + length > bytes.length) return undefined;
    const start = offset + 4;
    if (marker === 0xe1 && length >= 8 && String.fromCharCode(...bytes.subarray(start, start + 6)) === 'Exif\0\0') {
      return parseTiff(bytes.subarray(start + 6, offset + 2 + length));
    }
    offset += 2 + length;
  }
  return undefined;
}

function parseTiff(tiff: Uint8Array): ExifCameraTags | undefined {
  if (tiff.length < 8) return undefined;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const order = String.fromCharCode(tiff[0]!, tiff[1]!);
  if (order !== 'II' && order !== 'MM') return undefined;
  const little = order === 'II';
  if (view.getUint16(2, little) !== 42) return undefined;
  const tags: ExifCameraTags = {};
  const typeSize: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const visited = new Set<number>();

  const readIfd = (ifdOffset: number, handle: (tag: number, type: number, count: number, valueOffset: number) => void): void => {
    if (visited.has(ifdOffset) || ifdOffset < 8 || ifdOffset + 2 > tiff.length) return;
    visited.add(ifdOffset);
    const entries = view.getUint16(ifdOffset, little);
    if (entries > MAX_IFD_ENTRIES || ifdOffset + 2 + entries * 12 > tiff.length) return;
    for (let i = 0; i < entries; i += 1) {
      const entry = ifdOffset + 2 + i * 12;
      const tag = view.getUint16(entry, little);
      const type = view.getUint16(entry + 2, little);
      const count = view.getUint32(entry + 4, little);
      const size = (typeSize[type] ?? 0) * count;
      if (size === 0 || count > 1 << 16) continue;
      const valueOffset = size <= 4 ? entry + 8 : view.getUint32(entry + 8, little);
      if (valueOffset + size > tiff.length) continue;
      handle(tag, type, count, valueOffset);
    }
  };
  const integer = (type: number, at: number): number | undefined => (type === 3 ? view.getUint16(at, little) : type === 4 ? view.getUint32(at, little) : undefined);
  const rational = (type: number, at: number): number | undefined => {
    if (type !== 5 && type !== 10) return undefined;
    const numerator = type === 5 ? view.getUint32(at, little) : view.getInt32(at, little);
    const denominator = type === 5 ? view.getUint32(at + 4, little) : view.getInt32(at + 4, little);
    return denominator === 0 ? undefined : numerator / denominator;
  };
  const ascii = (count: number, at: number): string => String.fromCharCode(...tiff.subarray(at, at + Math.min(count, 128))).replace(/\0.*$/s, '').trim();

  let exifIfd: number | undefined;
  readIfd(view.getUint32(4, little), (tag, type, count, at) => {
    if (tag === 0x0112) tags.orientation = integer(type, at);
    else if (tag === 0x010f && type === 2) tags.make = ascii(count, at);
    else if (tag === 0x0110 && type === 2) tags.model = ascii(count, at);
    else if (tag === 0x8769) exifIfd = integer(type, at);
  });
  if (exifIfd !== undefined) {
    readIfd(exifIfd, (tag, type, _count, at) => {
      if (tag === 0x920a) tags.focalLengthMm = rational(type, at);
      else if (tag === 0xa405) tags.focalLength35mm = integer(type, at);
      else if (tag === 0xa002) tags.pixelXDimension = integer(type, at);
      else if (tag === 0xa003) tags.pixelYDimension = integer(type, at);
      else if (tag === 0xa20e) tags.focalPlaneXResolution = rational(type, at);
      else if (tag === 0xa210) tags.focalPlaneResolutionUnit = integer(type, at);
    });
  }
  return tags;
}

export interface ExifFovResult {
  fovXDegrees: number;
  method: 'focal-length-35mm-equivalent' | 'focal-length-and-focal-plane-resolution';
  provenance: 'declared';
  limitations: string[];
}

/** Diagonal of the 36 × 24 mm frame that defines the 35 mm-equivalent focal length. */
const FULL_FRAME_DIAGONAL_MM = Math.hypot(36, 24);
const UNIT_MM: Record<number, number> = { 2: 25.4, 3: 10, 4: 1, 5: 0.001 };

/**
 * Horizontal FOV for an image displayed at `width` × `height`. Returns
 * undefined, with a reason, when the tags are missing or the stored pixel
 * dimensions show a crop (aspect ratio differs by more than 1%).
 */
export function fovFromExif(tags: ExifCameraTags | undefined, width: number, height: number): ExifFovResult | { reason: string } {
  if (!tags) return { reason: 'No EXIF metadata.' };
  if (!(width > 0 && height > 0)) throw new Error('Image dimensions must be positive.');
  const rotated = tags.orientation !== undefined && tags.orientation >= 5 && tags.orientation <= 8;
  const storedAspect = tags.pixelXDimension && tags.pixelYDimension
    ? (rotated ? tags.pixelYDimension / tags.pixelXDimension : tags.pixelXDimension / tags.pixelYDimension)
    : undefined;
  if (storedAspect !== undefined && Math.abs(storedAspect / (width / height) - 1) > 0.01) {
    return { reason: 'Image aspect ratio differs from the EXIF pixel dimensions; the image was cropped.' };
  }
  const limitations = [
    'Declared EXIF metadata: digital zoom, uniform crops and lens distortion are not detectable.',
  ];
  if (storedAspect === undefined) limitations.push('No EXIF pixel dimensions; crops cannot be ruled out.');
  if (tags.focalLength35mm && tags.focalLength35mm > 0) {
    const horizontalMm = FULL_FRAME_DIAGONAL_MM * width / Math.hypot(width, height);
    return {
      fovXDegrees: 2 * Math.atan(horizontalMm / (2 * tags.focalLength35mm)) * 180 / Math.PI,
      method: 'focal-length-35mm-equivalent',
      provenance: 'declared',
      limitations: [...limitations, '35 mm-equivalent focal lengths are rounded to whole millimetres by most cameras.'],
    };
  }
  const unit = tags.focalPlaneResolutionUnit === undefined ? undefined : UNIT_MM[tags.focalPlaneResolutionUnit];
  if (tags.focalLengthMm && tags.focalLengthMm > 0 && tags.focalPlaneXResolution && tags.focalPlaneXResolution > 0 && unit && tags.pixelXDimension) {
    // FocalPlaneXResolution refers to the sensor's stored X axis.
    const storedX = tags.pixelXDimension;
    const sensorStoredXmm = storedX / tags.focalPlaneXResolution * unit;
    const sensorDisplayedWidthMm = rotated && tags.pixelYDimension ? sensorStoredXmm * tags.pixelYDimension / storedX : sensorStoredXmm;
    return {
      fovXDegrees: 2 * Math.atan(sensorDisplayedWidthMm / (2 * tags.focalLengthMm)) * 180 / Math.PI,
      method: 'focal-length-and-focal-plane-resolution',
      provenance: 'declared',
      limitations,
    };
  }
  return { reason: 'EXIF lacks a 35 mm-equivalent focal length and focal-plane resolution.' };
}
