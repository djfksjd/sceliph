import type {BufferGeometry} from 'three';
import {compileAssemblyGeometry,validateAssemblyIR} from './assembly-compiler';
import type {AssemblyGeometryIR} from './assembly-ir';
import {setLatheSegments} from './lathe-segment-edit';

type LatheSource=Extract<AssemblyGeometryIR,{op:'lathe'}>;
function validateSource(source:LatheSource):void{
 if(source.op!=='lathe'||Object.keys(source).some(key=>!['op','profile','segments','normalPolicy'].includes(key)))throw Error('Expected AssemblyIR lathe geometry.');
 if(!Array.isArray(source.profile)||source.profile.length>129||source.profile.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))throw Error('Lathe measurement supports at most 129 finite profile points.');
 validateAssemblyIR({schema:'morphloom.assembly/0.1',name:'Lathe measurement',units:'mm',components:[{id:'measurement',name:'Measurement',category:'mechanical',materialName:'raw',detail:'Primitive-local diagnostic only',geometry:source,material:{color:'#808080',surface:'raw',roughness:.5,metalness:0}}]});
}
export type LatheSurfaceMeasurement={maximumDeviationMm:number;triangles:number;rings:Array<{profileIndex:number;radiusMm:number;maximumDeviationMm:number}>};

/** Oriented triangle correspondence, independent of vertex/triangle storage
 * order or indexed vs non-indexed encoding. Coordinate values remain exact;
 * this never substitutes for the separate strict GLB byte contract.
 */
function triangleCounts(geometry:BufferGeometry):Map<string,number>{
 const p=geometry.getAttribute('position'),index=geometry.index,count=index?.count??p?.count??0;
 if(!p||p.itemSize!==3||!Number.isInteger(p.count)||p.count>300000||!Number.isInteger(count)||!count||count%3||count>300000||index&&index.itemSize!==1)throw Error('Invalid or over-budget native lathe triangle/index data.');
 const vertices:string[]=[];
 for(let i=0;i<p.count;i++){
  const values=[p.getX(i),p.getY(i),p.getZ(i)];
  if(!values.every(Number.isFinite))throw Error('Non-finite native lathe triangle positions.');
  vertices.push(values.join(','));
 }
 const result=new Map<string,number>();
 for(let i=0;i<count;i+=3){
  const ids=[0,1,2].map(offset=>index?index.getX(i+offset):i+offset);
  if(ids.some(id=>!Number.isInteger(id)||id<0||id>=p.count))throw Error('Native lathe index is non-finite, fractional or out of range.');
  const [a,b,c]=ids.map(id=>vertices[id]);
  if(a===b||b===c||a===c)throw Error('Degenerate native lathe triangle.');
  // Cyclic rotations retain winding; reversing the order does not.
  const key=[`${a};${b};${c}`,`${b};${c};${a}`,`${c};${a};${b}`].sort()[0];
  result.set(key,(result.get(key)??0)+1);
 }
 return result;
}
function validateTriangleCorrespondence(source:LatheSource,geometry:BufferGeometry):void{
 const actual=triangleCounts(geometry),expectedGeometry=compileAssemblyGeometry(source);
 try{
  const expected=triangleCounts(expectedGeometry);
  if(actual.size!==expected.size||[...actual].some(([key,count])=>expected.get(key)!==count))throw Error('Native lathe triangles do not correspond to the declared source (connectivity, winding or face multiplicity differs).');
 }finally{expectedGeometry.dispose();}
}

/** Primitive-local millimetres. Circumferential polygon error only, not profile
 * interpolation error, world-scale error, or manufacturing accuracy.
 * Reads actual vertex rings, including normal-split duplicates, rather than
 * declaring success from the segment count or ideal sagitta formula alone.
 */
export function measureLatheCircumference(source:LatheSource,geometry:BufferGeometry):LatheSurfaceMeasurement{
 validateSource(source);
 setLatheSegments(source,source.segments??64); // Reuse the existing resource bounds.
 const p=geometry.getAttribute('position'),count=geometry.index?.count??p?.count??0;
 if(!p||p.count>300000||count===0||count%3!==0||count/3>100000)throw Error('Invalid or over-budget lathe mesh.');
 const points:Array<[number,number,number]>=[];
 for(let i=0;i<p.count;i++){
  const point:[number,number,number]=[p.getX(i)*1000,p.getY(i)*1000,p.getZ(i)*1000];
  if(!point.every(Number.isFinite))throw Error('Non-finite lathe mesh.');
  points.push(point);
 }
 if(points.some(([x,y,z])=>!source.profile.some(([r,py])=>{
  const epsilon=Math.max(1e-5,Math.abs(py)*1e-6,r*1e-6);
  return Math.abs(y-py)<=epsilon&&Math.abs(Math.hypot(x,z)-(r<1e-6?0:r))<=epsilon;
 })))throw Error('Lathe ring contains vertices outside the authored profile.');
 const rings:LatheSurfaceMeasurement['rings']=[];
 for(const [profileIndex,[radius,y]] of source.profile.entries()){
  if(radius<1e-6)continue; // Compiler collapses these authored rows to the axis.
  const epsilon=Math.max(1e-5,Math.abs(y)*1e-6,radius*1e-6);
  const unique=new Map<number,[number,number]>();
  for(const [x,py,z] of points){
   if(Math.abs(py-y)<=epsilon&&Math.abs(Math.hypot(x,z)-radius)<=epsilon){
    const angle=(Math.atan2(z,x)+Math.PI*2)%(Math.PI*2);
    unique.set(Math.round(angle*1e7),[x,z]);
   }
  }
  const ring=[...unique].sort((a,b)=>a[0]-b[0]).map(entry=>entry[1]);
  if(ring.length!==(source.segments??64))throw Error(`Incomplete or mismatched lathe ring at profile ${profileIndex}.`);
  let maximumDeviationMm=0;
  for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1];
   const t=Math.max(0,Math.min(1,-(a[0]*dx+a[1]*dz)/(dx*dx+dz*dz)));
   const minimumRadius=Math.hypot(a[0]+t*dx,a[1]+t*dz);
   maximumDeviationMm=Math.max(maximumDeviationMm,Math.abs(radius-minimumRadius),Math.abs(radius-Math.hypot(...a)));
  }
  rings.push({profileIndex,radiusMm:radius,maximumDeviationMm});
 }
 if(!rings.length)throw Error('Lathe requires a non-axis ring for circumferential measurement.');
 validateTriangleCorrespondence(source,geometry);
 return {maximumDeviationMm:Math.max(...rings.map(r=>r.maximumDeviationMm)),triangles:count/3,rings};
}

export function measureLatheSurfaceError(source:LatheSource):LatheSurfaceMeasurement{
 validateSource(source);
 setLatheSegments(source,source.segments??64);
 const geometry=compileAssemblyGeometry(source);
 try{return measureLatheCircumference(source,geometry);}finally{geometry.dispose();}
}

/** At most eleven measurements (binary search plus original/final).
 * Never coarsens an authored grid. Caller applies the result through the
 * existing component patch so frozen/source/material blockers stay active.
 */
export function fitLatheSurfaceBudget(source:LatheSource,toleranceMm:number):{geometry:LatheSource;measurement:LatheSurfaceMeasurement}{
 if(!Number.isFinite(toleranceMm)||toleranceMm<.000001||toleranceMm>1000)throw Error('Lathe tolerance must be 0.000001..1000 mm.');
 const current=measureLatheSurfaceError(source);
 if(current.maximumDeviationMm<=toleranceMm)return {geometry:structuredClone(source),measurement:current};
 if((source.segments??64)%4!==0)throw Error('Automatic lathe refinement requires a cardinal grid (segments divisible by four) to preserve bounds. Use the existing manual segment edit.');
 const maximum=Math.floor(Math.min(512,Math.floor(100000/(2*(source.profile.length-1))))/4);
 let low=(source.segments??64)/4+1,high=maximum;
 // Actual Float32 ring errors are checked again before returning. The search
 // only chooses a refinement; no global minimality claim at rounding limits.
 while(low<high){
  const mid=Math.floor((low+high)/2),candidate=setLatheSegments(source,mid*4) as LatheSource;
  if(measureLatheSurfaceError(candidate).maximumDeviationMm<=toleranceMm)high=mid;
  else low=mid+1;
 }
 if(low>maximum)throw Error('Lathe tolerance is unattainable within the existing segment/triangle budget; source unchanged.');
 const geometry=setLatheSegments(source,low*4) as LatheSource,measurement=measureLatheSurfaceError(geometry);
 if(measurement.maximumDeviationMm>toleranceMm)throw Error('Lathe tolerance is unattainable within the existing segment/triangle budget; source unchanged.');
 return {geometry,measurement};
}
