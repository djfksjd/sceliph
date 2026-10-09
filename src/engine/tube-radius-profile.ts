import { Vector3, type TubeGeometry } from 'three';
import type { TubeGeometryIR } from './tube-quadratic-curve';
import { validateTubeQuadraticCurve } from './tube-quadratic-curve';
export interface TubeRadiusProfileIR {
  schema: 'sceliph.tube-radius-profile/0.1';
  /** [normalized arc length, local radius in mm]. Piecewise linear, non-increasing. */
  stations: Array<[number, number]>;
}
export function validateTubeRadiusProfile(geometry: TubeGeometryIR): void {
  const value = geometry.radiusProfile;
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2
    || value.schema !== 'sceliph.tube-radius-profile/0.1' || !Object.hasOwn(value,'stations')) throw Error('Unsupported tube radius profile version/fields.');
  const stations=value.stations;
  if (!geometry.curve || geometry.closed || geometry.capFinish !== 'flat-outward') throw Error('Tube radius profile requires an open quadratic path and flat-outward caps.');
  if (!Array.isArray(stations) || stations.length < 2 || stations.length > 16 || stations.some((s,i) =>
    !Array.isArray(s) || s.length !== 2 || s.some(n => typeof n !== 'number' || !Number.isFinite(n))
    || s[0] < 0 || s[0] > 1 || s[1] < .1 || s[1] > 100000
    || i > 0 && (s[0] <= stations[i-1][0] || s[1] > stations[i-1][1]))) throw Error('Tube radius stations require increasing arc fractions and non-increasing 0.1..100000 mm radii.');
  if (stations[0][0] !== 0 || stations.at(-1)![0] !== 1 || stations[0][1] !== geometry.radius) throw Error('Tube radius profile must cover 0..1 and begin at the base radius.');
  const rows=geometry.tubularSegments ?? Math.max(48,geometry.points.length*8), radial=geometry.radialSegments ?? 10;
  if (!Number.isInteger(rows) || rows < 3 || rows > 256 || !Number.isInteger(radial) || radial < 3 || radial > 128) throw Error('Tube radius profile exceeds ring/segment budget (256/128).');
  // Each explicit slope junction must coincide with a generated ring, avoiding silent approximation.
  if (stations.some(([u]) => Math.abs(u*rows-Math.round(u*rows)) > 1e-9)) throw Error('Tube radius station must align with a generated arc-length ring.');
}
export function tubeRadiusAt(geometry: TubeGeometryIR, u: number): number {
  const stations=geometry.radiusProfile?.stations;
  if (!stations) return geometry.radius;
  for(let i=1;i<stations.length;i++) if(u<=stations[i][0]) {
    const [a,ra]=stations[i-1], [b,rb]=stations[i];return ra+(rb-ra)*(u-a)/(b-a);
  }
  return stations.at(-1)![1];
}
/** Explicit opt-in/clear migration; source and legacy compiler output stay unchanged. */
export function migrateTubeRadiusProfile(geometry: TubeGeometryIR, stations?: Array<[number,number]>): TubeGeometryIR {
  validateTubeQuadraticCurve(geometry);validateTubeRadiusProfile(geometry);
  const next=structuredClone(geometry);
  if(stations===undefined) delete next.radiusProfile;
  else next.radiusProfile={schema:'sceliph.tube-radius-profile/0.1',stations:structuredClone(stations)};
  validateTubeRadiusProfile(next);return next;
}
export function applyTubeRadiusProfile(tube: TubeGeometry, geometry: TubeGeometryIR): void {
  validateTubeRadiusProfile(geometry);
  if (!geometry.radiusProfile) return;
  const p=tube.getAttribute('position'), n=tube.getAttribute('normal');
  const rows=tube.parameters.tubularSegments, radial=tube.parameters.radialSegments, ring=radial+1;
  const v=new Vector3(), normal=new Vector3();
  for(let row=0;row<=rows;row++) {
    const delta=(tubeRadiusAt(geometry,row/rows)-geometry.radius)/1000;
    for(let j=0;j<ring;j++) {const i=row*ring+j;v.fromBufferAttribute(p,i);normal.fromBufferAttribute(n,i);v.addScaledVector(normal,delta);p.setXYZ(i,v.x,v.y,v.z);}
  }
  tube.computeVertexNormals();
  // TubeGeometry duplicates its angular UV seam; normals must agree on both copies.
  for(let row=0;row<=rows;row++) {
    const a=row*ring, b=a+radial;
    normal.fromBufferAttribute(n,a);v.fromBufferAttribute(n,b);normal.add(v).normalize();
    n.setXYZ(a,normal.x,normal.y,normal.z);n.setXYZ(b,normal.x,normal.y,normal.z);
  }
  p.needsUpdate=true;n.needsUpdate=true;
}
