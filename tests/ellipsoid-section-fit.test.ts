import { expect,it } from 'vitest';
import { fitEllipsoidAxialPower } from '../src/engine/ellipsoid-section-fit';
const points=(q:number,scale=1)=>[.75,.88].map(z=>[20*scale*(1-z**q)**(1/q),0,30*scale*z] as [number,number,number]);
const input=(q=3,scale=1)=>({schema:'sceliph.ellipsoid-section-fit/0.1' as const,frame:'primitive-local' as const,units:'mm' as const,evidence:{status:'designed' as const,sourceId:'authored-section'},pointsMm:points(q,scale)});
it.each([.5,1,3])('fits declared section points deterministically at scale %s',scale=>{
 const a=fitEllipsoidAxialPower([20*scale,14*scale,30*scale],2,input(3,scale));
 expect(a.axialPower).toBeCloseTo(3,6);expect(a).toEqual(fitEllipsoidAxialPower([20*scale,14*scale,30*scale],2,input(3,scale)));expect(a.residuals.every(n=>Math.abs(n)<.002)).toBe(true);
});
it('rejects inconsistent, uninformative and unsupported evidence without mutating input',()=>{
 const valid=input(),before=structuredClone(valid);
 const bad=[{...valid,frame:'world'},{...valid,units:'m'},{...valid,extra:true},{...valid,evidence:{status:'inferred',sourceId:'photo'}},{...valid,pointsMm:[[20,0,0],[0,0,30]]},{...valid,pointsMm:[valid.pointsMm[0],valid.pointsMm[0]]},{...valid,pointsMm:[points(1.5)[0],points(4)[1]]},{...valid,pointsMm:points(5)},{...valid,pointsMm:[[NaN,0,9],valid.pointsMm[1]]}];
 for(const b of bad)expect(()=>fitEllipsoidAxialPower([20,14,30],2,b)).toThrow();expect(valid).toEqual(before);
});

import { applyAssemblyPrimaryRecipe,ASSEMBLY_PRIMARY_RECIPE_V4_SCHEMA } from '../src/engine/assembly-primary-recipe';
import { fingerprintAssemblyIR } from '../src/engine/assembly-edit';
import { compileAssemblyGeometry } from '../src/engine/assembly-compiler';
import { createBirdPrimaryStudy } from '../src/engine/bird-primary-study';
import { DoubleSide,Mesh,MeshBasicMaterial,Raycaster,Vector3 } from 'three';
import type { AssemblyIR } from '../src/engine/assembly-ir';
const fixture=(scale=1):AssemblyIR=>({schema:'morphloom.assembly/0.1',name:'Designed section fitting fixture',units:'mm',components:[{id:'pod',name:'Pod',category:'enclosure',materialName:'clay',detail:'Designed solid, not CAD',material:{surface:'raw',color:'#999999',roughness:.75,metalness:0,microNormalStrength:0},evidence:{status:'estimated',source:'Authored fixture'},geometry:{op:'implicitSurface',descriptor:{bounds:{min:[-25*scale,-20*scale,-35*scale],max:[25*scale,20*scale,35*scale]},resolution:32,triangleBudget:15000,primitives:[{id:'envelope',type:'ellipsoid',radii:[20*scale,14*scale,30*scale]}]}}}]});
async function recipe(ir:AssemblyIR,scale=1){return {schema:ASSEMBLY_PRIMARY_RECIPE_V4_SCHEMA,sourceFingerprint:await fingerprintAssemblyIR(ir),steps:[{op:'ellipsoid-section-fit',componentId:'pod',primitiveId:'envelope',fit:input(3,scale)}]};}
it.each([.5,1,3])('applies, saves/reopens and measures actual generated sections at scale %s',async scale=>{
 const ir=fixture(scale),before=structuredClone(ir),r=await recipe(ir,scale);
 const a=await applyAssemblyPrimaryRecipe(ir,JSON.stringify(r));expect(ir).toEqual(before);expect(a.receipt.fits![0].axialPower).toBe(3);
 const reopened=JSON.parse(JSON.stringify(a.ir)),noop=await applyAssemblyPrimaryRecipe(reopened,JSON.stringify(await recipe(reopened,scale)));
 expect(noop.receipt.outputFingerprint).toBe(noop.receipt.inputFingerprint);
 const ga=compileAssemblyGeometry(a.ir.components[0].geometry),gb=compileAssemblyGeometry(reopened.components[0].geometry),m=new MeshBasicMaterial({side:DoubleSide});
 try{
  for(const k of ['position','normal','uv'])expect(ga.getAttribute(k).array).toEqual(gb.getAttribute(k).array);expect(ga.index?.array).toEqual(gb.index?.array);
  for(const point of points(3,scale)){
   const hit=new Raycaster(new Vector3(.05*scale,0,point[2]/1000),new Vector3(-1,0,0)).intersectObject(new Mesh(ga,m))[0];expect(hit).toBeDefined();
   expect(Math.abs(hit.point.x*1000-point[0])).toBeLessThan(50*scale/32);
  }
 }finally{ga.dispose();gb.dispose();m.dispose();}
 const b=await applyAssemblyPrimaryRecipe(ir,JSON.stringify(r));expect(a).toEqual(b);
 const next=structuredClone(a.ir);const changed=await recipe(next,scale);changed.steps[0].fit=input(2.5,scale);
 expect((await applyAssemblyPrimaryRecipe(next,JSON.stringify(changed))).receipt.fits![0].axialPower).toBe(2.5);
});
it('rejects legacy versions, wrong source, composed target and inconsistent fit atomically',async()=>{
 const ir=fixture(),before=structuredClone(ir),r=await recipe(ir);
 for(const version of ['0.1','0.2','0.3'])await expect(applyAssemblyPrimaryRecipe(ir,JSON.stringify({...r,schema:'sceliph.assembly-primary-recipe/'+version}))).rejects.toThrow();
 await expect(applyAssemblyPrimaryRecipe(ir,JSON.stringify({...r,sourceFingerprint:'0'.repeat(64)}))).rejects.toThrow(/source/);
 r.steps[0].fit.pointsMm=[points(1.5)[0],points(4)[1]];await expect(applyAssemblyPrimaryRecipe(ir,JSON.stringify(r))).rejects.toThrow(/Inconsistent/);expect(ir).toEqual(before);
 const bird=createBirdPrimaryStudy();r.sourceFingerprint=await fingerprintAssemblyIR(bird);r.steps[0].componentId='organic_core';r.steps[0].primitiveId='torso';
 await expect(applyAssemblyPrimaryRecipe(bird,JSON.stringify(r))).rejects.toThrow(/independent/);
});
