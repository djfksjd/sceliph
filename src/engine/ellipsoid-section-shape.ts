import type { ImplicitPrimitive } from './implicit-surface';
import type { Vector3 } from 'three';
export interface EllipsoidSectionShape {
  schema: 'sceliph.ellipsoid-section-shape/0.1';
  /** Superellipse XY-section exponent, dimensionless. 2 is an ellipse. */
  radialPower: number;
  /** Z-axis profile exponent, dimensionless. 2 is an ellipsoid. */
  axialPower: number;
}
export function validateEllipsoidSectionShape(primitive: ImplicitPrimitive): void {
  const value = primitive.sectionShape;
  if(value === undefined)return;
  if(primitive.type !== 'ellipsoid' || !value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== 3 || value.schema !== 'sceliph.ellipsoid-section-shape/0.1'
    || !Object.hasOwn(value,'radialPower') || !Object.hasOwn(value,'axialPower')
    || [value.radialPower,value.axialPower].some(n=>typeof n!=='number'||!Number.isFinite(n)||n<1.5||n>4))
    throw Error('Ellipsoid section shape requires version 0.1 and finite 1.5..4 radial/axial powers.');
}
/** Scalar implicit field with correct zero contour; not an exact Euclidean SDF. */
export function shapedEllipsoidField(point: Vector3,radii:[number,number,number],shape:EllipsoidSectionShape): number {
  const p=shape.radialPower,q=shape.axialPower;
  const xy=Math.abs(point.x/radii[0])**p+Math.abs(point.y/radii[1])**p;
  const norm=(xy**(q/p)+Math.abs(point.z/radii[2])**q)**(1/q);
  return (norm-1)*Math.min(...radii);
}
/** Explicit opt-in/clear. Absence retains the original ellipsoid field and buffers. */
export function migrateEllipsoidSectionShape(primitive:ImplicitPrimitive,shape?:EllipsoidSectionShape):ImplicitPrimitive {
  validateEllipsoidSectionShape(primitive);
  if(primitive.type!=='ellipsoid')throw Error('Section-shape migration requires an ellipsoid.');
  const next=structuredClone(primitive);
  if(shape===undefined)delete next.sectionShape;else next.sectionShape=structuredClone(shape);
  validateEllipsoidSectionShape(next);return next;
}
