import {profileSurfaceNormals} from './lathe-profile-surface-normals';
import type {BufferGeometry} from 'three';
import type {AssemblyGeometryIR} from './assembly-ir';
import {creasePartNormals} from './crease-part-normals';

interface CornerAngleNormalPolicy {
  schema: 'morphloom.lathe-normals/0.1';
  creaseAngleRad: number;
  weighting: 'corner-angle';
}
export type LatheNormalPolicy=CornerAngleNormalPolicy|{schema:'morphloom.lathe-normals/0.2';weighting:'profile-surfaces'};
type Lathe=Extract<AssemblyGeometryIR,{op:'lathe'}>;
/** A new declaration is explicit; undeclared legacy buffers never change. */
export function validateLatheNormalPolicy(geometry:AssemblyGeometryIR):void {
  if(!('normalPolicy' in geometry)||geometry.normalPolicy===undefined)return;
  const policy=geometry.normalPolicy;
  if(geometry.op!=='lathe'||!policy||typeof policy!=='object'||Array.isArray(policy)
    ||![Object.prototype,null].includes(Object.getPrototypeOf(policy)))throw new Error('Invalid lathe normal policy object.');
  const old=policy.schema==='morphloom.lathe-normals/0.1'&&policy.weighting==='corner-angle'
    &&Object.keys(policy).length===3&&Object.keys(policy).every(k=>['schema','creaseAngleRad','weighting'].includes(k))
    &&Number.isFinite(policy.creaseAngleRad)&&policy.creaseAngleRad>=0&&policy.creaseAngleRad<=Math.PI;
  const exact=policy.schema==='morphloom.lathe-normals/0.2'&&policy.weighting==='profile-surfaces'
    &&Object.keys(policy).length===2&&Object.keys(policy).every(k=>['schema','weighting'].includes(k));
  if(!old&&!exact)throw new Error('Invalid lathe normal policy: explicit0.1 corner-angle or0.2 profile-surfaces required.');
  const segments=geometry.segments??64;
  if(!Number.isInteger(segments)||(geometry.profile.length-1)*segments*2>100000)
    throw new Error('Lathe normal policy exceeds the 100000 triangle budget.');
}
export function migrateLatheNormalPolicy(geometry:Lathe,policy:LatheNormalPolicy|undefined):Lathe {
  if(geometry.op!=='lathe')throw new Error('Normal policy migration requires lathe.');
  const result=structuredClone(geometry);
  if(policy===undefined)delete result.normalPolicy;else result.normalPolicy=structuredClone(policy);
  validateLatheNormalPolicy(result);return result;
}
export function applyLatheNormalPolicy(source:BufferGeometry,geometry:AssemblyGeometryIR):BufferGeometry {
  if(geometry.op!=='lathe'||!geometry.normalPolicy)return source;
  try {
    const result=geometry.normalPolicy.schema==='morphloom.lathe-normals/0.2'
      ?profileSurfaceNormals(source,geometry.profile,geometry.segments??64)
      :creasePartNormals(source,geometry.normalPolicy.creaseAngleRad,'corner-angle');
    if(result!==source)source.dispose();return result;
  }catch(error){source.dispose();throw error;}
}
