import {Triangle,Vector3} from 'three';
import {compileAssemblyGeometry} from './assembly-compiler';
import {validatePartGeometry,type PartGeometry} from './part-geometry';
type SphereGeometryIR=Extract<PartGeometry,{op:'sphere'}>;
export type SphereSurfaceMeasurement={maximumDeviationMm:number;triangles:number};
/** Maximum radial distance from the delivered flat triangles to the authored sphere.
 * A triangle's minimum radius occurs at its closest point to the origin;
 * its maximum radius occurs at a vertex. This measures facets, not only vertices.
 */
export function measureSphereSurfaceError(source:SphereGeometryIR):SphereSurfaceMeasurement{
 validatePartGeometry(source);
 if(source.op!=='sphere')throw Error('Sphere surface budget requires native sphere geometry.');
 const geometry=compileAssemblyGeometry(source);
 try{
  const p=geometry.getAttribute('position'),index=geometry.index,count=index?.count??p.count;
  const triangle=new Triangle(),origin=new Vector3(),closest=new Vector3();let maximumDeviationMm=0;
  for(let i=0;i<count;i+=3){
   for(const [offset,v] of [[0,triangle.a],[1,triangle.b],[2,triangle.c]] as const){
    v.fromBufferAttribute(p,index?index.getX(i+offset):i+offset).multiplyScalar(1000);
    maximumDeviationMm=Math.max(maximumDeviationMm,Math.abs(source.radius-v.length()));
   }
   triangle.closestPointToPoint(origin,closest);
   maximumDeviationMm=Math.max(maximumDeviationMm,Math.abs(source.radius-closest.length()));
  }
  if(!Number.isFinite(maximumDeviationMm))throw Error('Non-finite sphere surface measurement.');
  return {maximumDeviationMm,triangles:count/3};
 }finally{geometry.dispose();}
}
/** Explicit source edit: bounded candidates, no default compiler change or cached PASS. */
export function fitSphereSurfaceBudget(source:SphereGeometryIR,toleranceMm:number):{geometry:SphereGeometryIR;measurement:SphereSurfaceMeasurement}{
 if(!Number.isFinite(toleranceMm)||toleranceMm<.000001||toleranceMm>1000)throw Error('Sphere tolerance must be 0.000001..1000 mm.');
 const current=measureSphereSurfaceError(source);
 if(current.maximumDeviationMm<=toleranceMm)return {geometry:structuredClone(source),measurement:current};
 const candidates:Array<[number,number]>=[];
 const authoredHeight=source.heightSegments??28;
 if(authoredHeight>64){
  // Preserve a dense authored latitude grid while refining longitude first.
  // The balanced grid tops out at 64 latitudes and cannot represent this case.
  for(let width=8;width<=128;width+=4)candidates.push([width,authoredHeight]);
  for(let height=authoredHeight+2;height<=128;height+=2)candidates.push([128,height]);
 }else{
  // Keep the established candidate order for ordinary native sphere sources.
  for(let width=8;width<=128;width+=4)candidates.push([width,width/2]);
  for(let height=66;height<=128;height+=2)candidates.push([128,height]);
 }
 for(const [widthSegments,heightSegments] of candidates){
  // Refinement must not reduce either authored subdivision count.
  if(widthSegments<(source.widthSegments??48)||heightSegments<(source.heightSegments??28))continue;
  const geometry={...structuredClone(source),widthSegments,heightSegments},measurement=measureSphereSurfaceError(geometry);
  if(measurement.maximumDeviationMm<=toleranceMm)return {geometry,measurement};
 }
 throw Error('Sphere tolerance is unattainable within native limits (128 × 128, 32512 triangles). Increase tolerance; the source is unchanged.');
}
