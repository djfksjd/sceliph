import {deterministicHalfSinCos} from './deterministic-rotation';

export const PLATE_ARITHMETIC_REVISION = 'sceliph.plate-ieee-series/0.1';
export const PLATE_BORE_SEGMENTS = 128;
export const PLATE_BEVEL_SECANT = 1 / deterministicHalfSinCos(Math.PI / PLATE_BORE_SEGMENTS)[1];

/** Descriptor coordinates in mm. Explicit bounded IEEE arithmetic prevents
 * native transcendental differences from changing source JSON and its SHA.
 * No rounding, epsilon welding or compiler gate changes are involved. */
export function deterministicPlateBorePoint(radiusMm: number, index: number): [number, number] {
  if (!Number.isFinite(radiusMm) || radiusMm < 0 || radiusMm > 200 || !Number.isInteger(index) || index < 0 || index >= PLATE_BORE_SEGMENTS) {
    throw Error('Plate bore point requires radius 0..200mm and index 0..127');
  }
  const angle = -2 * Math.PI * index / PLATE_BORE_SEGMENTS;
  const [sin, cos] = deterministicHalfSinCos(angle);
  return [radiusMm * cos, radiusMm * sin];
}
