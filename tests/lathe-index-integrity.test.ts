import {readFileSync} from 'node:fs';
import {BufferAttribute} from 'three';
import {expect,it} from 'vitest';
import {compileAssemblyGeometry} from '../src/engine/assembly-compiler';
import {measureLatheCircumference} from '../src/engine/lathe-surface-budget';
import type {AssemblyIR} from '../src/engine/assembly-ir';
function source(){const ir:AssemblyIR=JSON.parse(readFileSync('benchmarks/modeling-slices-20261004/assembly-lathe-normals/verified/default-after.json','utf8'));const g=ir.components[0].geometry;if(g.op!=='lathe')throw Error();return {...g,segments:48};}
function indexed(g:ReturnType<typeof source>){const mesh=compileAssemblyGeometry(g);if(!mesh.index)mesh.setIndex(Array.from({length:mesh.getAttribute('position').count},(_,i)=>i));return mesh;}
it('rejects an opposite-side chord despite intact rings and a nominal sub-0.03mm ring error',()=>{
 const g=source(),mesh=indexed(g);try{
  const p=mesh.getAttribute('position'),index=mesh.index!,a=index.getX(0);let opposite=-1;
  for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i)-p.getY(a))<1e-9&&Math.abs(p.getX(i)+p.getX(a))<1e-9&&Math.abs(p.getZ(i)+p.getZ(a))<1e-9){opposite=i;break;}
  expect(opposite).toBeGreaterThanOrEqual(0);index.setX(1,opposite);
  // Independent midpoint witness: this real triangle edge cuts through the axis.
  const midpointRadiusMm=Math.hypot((p.getX(a)+p.getX(opposite))/2,(p.getZ(a)+p.getZ(opposite))/2)*1000;
  expect(midpointRadiusMm).toBeLessThan(.000001);
  expect(()=>measureLatheCircumference(g,mesh)).toThrow(/triangle|source|index/i);
 }finally{mesh.dispose();}
});
it.each(['duplicate','missing','flipped','degenerate','out-of-range','fractional','non-finite'])('rejects %s triangle/index data without changing the source',kind=>{
 const g=source(),before=structuredClone(g),mesh=indexed(g);try{
  const values=Array.from(mesh.index!.array);
  if(kind==='duplicate')values.splice(values.length-3,3,...values.slice(0,3));
  if(kind==='missing')values.splice(-3);
  if(kind==='flipped')[values[1],values[2]]=[values[2],values[1]];
  if(kind==='degenerate')values[1]=values[0];
  if(kind==='out-of-range')values[0]=mesh.getAttribute('position').count;
  if(kind==='fractional')values[0]=.5;
  if(kind==='non-finite')values[0]=NaN;
  mesh.setIndex(new BufferAttribute(new Float32Array(values),1));
  expect(()=>measureLatheCircumference(g,mesh)).toThrow(/triangle|source|index/i);expect(g).toEqual(before);
 }finally{mesh.dispose();}
});
it.each(['triangle-order','vertex-order','non-indexed'])('accepts equivalent %s storage while measuring the same actual rings',kind=>{
 const g=source(),original=indexed(g);let changed=original.clone();try{
  const reference=measureLatheCircumference(g,original);
  if(kind==='triangle-order'){
   const values=Array.from(changed.index!.array),next=[];
   for(let i=values.length-3;i>=0;i-=3)next.push(values[i+1],values[i+2],values[i]);
   changed.setIndex(next);
  }
  if(kind==='vertex-order'){
   const count=changed.getAttribute('position').count;
   for(const [name,attribute] of Object.entries(changed.attributes)){
    const values=new Float32Array(attribute.array.length);
    for(let i=0;i<count;i++)for(let j=0;j<attribute.itemSize;j++)values[(count-1-i)*attribute.itemSize+j]=attribute.array[i*attribute.itemSize+j];
    changed.setAttribute(name,new BufferAttribute(values,attribute.itemSize));
   }
   changed.setIndex(Array.from(changed.index!.array,v=>count-1-v));
  }
  if(kind==='non-indexed'){changed.dispose();changed=original.toNonIndexed();}
  expect(measureLatheCircumference(g,changed)).toEqual(reference);
 }finally{changed.dispose();original.dispose();}
});
