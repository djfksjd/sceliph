import {Mesh,MeshBasicMaterial}from 'three';
import type {AssemblyGeometryIR,AssemblyIR,AssemblyComponentIR}from './assembly-ir';
import {compileAssemblyGeometry}from './assembly-compiler';
import {analyzeTopology}from './topology';
import {latheSegmentEditBlocker}from './lathe-segment-edit';
export const LATHE_CHAMFER_SCHEMA='morphloom.lathe-corner-chamfer/0.1';
export function latheChamferBlocker(ir:AssemblyIR,c:AssemblyComponentIR):string|undefined{return latheSegmentEditBlocker(ir,c)??(c.scale?.some(n=>n!==1)?'Chamfer physical dimensions require unscaled component.':undefined)}
export function chamferLatheCorner(source:AssemblyGeometryIR,index:number,amount:number):AssemblyGeometryIR{
 if(source.op!=='lathe')throw new Error('Chamfer requires lathe.');
 const p=source.profile,n=p.length;
 if(!Number.isInteger(index)||index<1||index>=n-1||p[index][0]===0)throw new Error('Chamfer requires an interior non-axis profile point; seam/endpoints are unsupported.');
 if(!Number.isFinite(amount)||amount<.001||amount>100000)throw new Error('Chamfer setback must be finite and at least0.001 mm.');
 if(n+1>128||n*(source.segments??64)*2>10000)throw new Error('Chamfer exceeds interactive point/triangle budget.');
 const a=p[index-1],b=p[index],c=p[index+1],before=[a[0]-b[0],a[1]-b[1]],after=[c[0]-b[0],c[1]-b[1]],lenA=Math.hypot(...before),lenB=Math.hypot(...after);
 if(amount>=Math.min(lenA,lenB)/2)throw new Error('Chamfer setback must be less than half each adjacent edge length.');
 let twiceArea=0;for(let i=0;i<n;i++){const j=(i+1)%n;twiceArea+=p[i][0]*p[j][1]-p[j][0]*p[i][1]}
 const cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
 if(cross*twiceArea<=0)throw new Error('Chamfer requires a convex noncollinear material-removal corner.');
 const u:[number,number]=[b[0]+amount*before[0]/lenA,b[1]+amount*before[1]/lenA],v:[number,number]=[b[0]+amount*after[0]/lenB,b[1]+amount*after[1]/lenB];
 const profile=[...p.slice(0,index).map(x=>[...x]as [number,number]),u,v,...p.slice(index+1).map(x=>[...x]as [number,number])];
 const bounds=(pts:Array<[number,number]>)=>[Math.min(...pts.map(x=>x[0])),Math.max(...pts.map(x=>x[0])),Math.min(...pts.map(x=>x[1])),Math.max(...pts.map(x=>x[1]))];
 if(JSON.stringify(bounds(profile))!==JSON.stringify(bounds(p)))throw new Error('Chamfer would change the declared radial/axial envelope.');
 const result={...structuredClone(source),profile},geometry=compileAssemblyGeometry(result),material=new MeshBasicMaterial();
 try{const report=analyzeTopology(new Mesh(geometry,material));if(!report.pass||!report.orientationConsistent)throw new Error('Chamfer generated unsupported topology or winding.');}finally{geometry.dispose();material.dispose()}
 return result;
}
