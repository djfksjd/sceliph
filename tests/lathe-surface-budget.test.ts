import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {compileAssemblyGeometry,compileAssemblyIR,validateAssemblyIR} from '../src/engine/assembly-compiler';
import {applyAssemblyComponentPatch,fingerprintAssemblyIR} from '../src/engine/assembly-edit';
import {fitLatheSurfaceBudget,measureLatheCircumference,measureLatheSurfaceError} from '../src/engine/lathe-surface-budget';
import type {AssemblyIR} from '../src/engine/assembly-ir';
const source=(id:string):AssemblyIR=>JSON.parse(readFileSync(`benchmarks/modeling-slices-20261004/assembly-lathe-normals/verified/${id}-after.json`,'utf8'));
const patch=async(ir:AssemblyIR,segments:number)=>applyAssemblyComponentPatch(ir,{schema:'morphloom.component-patch/0.2',operationId:'circumference-fit',componentId:'bushing',expectedInputFingerprint:await fingerprintAssemblyIR(ir),geometry:{operation:'lathe-segments',schema:'morphloom.lathe-segments/0.1',segments}});
it('measures actual facets against analytic sagitta and fits four existing profiles without coarsening',async()=>{
 for(const id of ['small','default','large','solid']){
  const ir=source(id),g=ir.components[0].geometry;
  if(g.op!=='lathe')throw Error();
  g.segments=16;const original=structuredClone(ir);
  const before=measureLatheSurfaceError(g),radius=Math.max(...g.profile.map(p=>p[0]));
  expect(before.maximumDeviationMm).toBeCloseTo(radius*(1-Math.cos(Math.PI/(g.segments??64))),5);
  expect(before.maximumDeviationMm).toBeGreaterThan(.03);
  const fitted=fitLatheSurfaceBudget(g,.03);
  expect(fitted.measurement.maximumDeviationMm).toBeLessThanOrEqual(.03);
  expect(fitted.geometry.segments).toBeGreaterThanOrEqual(g.segments!);
  const oldMesh=compileAssemblyGeometry(g),newMesh=compileAssemblyGeometry(fitted.geometry);
  try{oldMesh.computeBoundingBox();newMesh.computeBoundingBox();expect(newMesh.boundingBox).toEqual(oldMesh.boundingBox);}finally{oldMesh.dispose();newMesh.dispose();}
  const next=(await patch(ir,fitted.geometry.segments!)).ir;
  expect(ir).toEqual(original);expect(next.components[1]).toEqual(ir.components[1]);
  expect(next.components[0].geometry).toEqual(fitted.geometry);
  const reopened=JSON.parse(JSON.stringify(next));validateAssemblyIR(reopened);
  expect(measureLatheSurfaceError(reopened.components[0].geometry)).toEqual(fitted.measurement);
  expect(fitLatheSurfaceBudget(fitted.geometry,.03).geometry).toEqual(fitted.geometry);
  const built=compileAssemblyIR(next,'beauty');try{expect(built.metrics.topology.pass).toBe(true);}finally{built.root.traverse(o=>{if('geometry' in o)(o.geometry as {dispose():void}).dispose();if('material' in o){const m=o.material as {dispose():void}|Array<{dispose():void}>;for(const x of Array.isArray(m)?m:[m])x.dispose();}});}
 }
});
it('rejects impossible/invalid budgets and damaged rings without changing source',()=>{
 const g=source('default').components[0].geometry;if(g.op!=='lathe')throw Error();
 const before=structuredClone(g);
 for(const t of [NaN,Infinity,0,-1,.000001])expect(()=>fitLatheSurfaceBudget(g,t)).toThrow();
 expect(g).toEqual(before);
 expect(()=>fitLatheSurfaceBudget({...g,segments:17},.03)).toThrow(/cardinal/);
 expect(()=>measureLatheSurfaceError({...g,profile:Array.from({length:130},()=>[8,0] as [number,number])})).toThrow(/129/);
 const mesh=compileAssemblyGeometry(g);try{const p=mesh.getAttribute('position');p.setXYZ(0,999,999,999);expect(()=>measureLatheCircumference(g,mesh)).toThrow(/ring/);}finally{mesh.dispose();}
});
it('retains existing appearance/frozen blockers when the fitted command is applied',async()=>{
 for(const mode of ['surface','frozen']){
  const ir=source('default');if(mode==='surface')ir.components[0].material.surface='brushed-metal';else ir.fidelity={} as never;
  const original=structuredClone(ir),g=ir.components[0].geometry;if(g.op!=='lathe')throw Error();
  const fit=fitLatheSurfaceBudget(g,.03);
  await expect(patch(ir,fit.geometry.segments!)).rejects.toThrow();expect(ir).toEqual(original);
 }
});
