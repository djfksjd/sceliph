import { expect,it } from 'vitest';
import { fitEllipsoidWithMeshBudget } from '../src/engine/ellipsoid-section-budget';
import type { AssemblyIR } from '../src/engine/assembly-ir';
const source=():AssemblyIR=>({schema:'morphloom.assembly/0.1',name:'Section mesh budget fixture',units:'mm',components:[{id:'pod-shell',name:'Pod',category:'enclosure',materialName:'clay',detail:'Authored solid',material:{surface:'raw',color:'#999999',roughness:.75,metalness:0,microNormalStrength:0},evidence:{status:'estimated',source:'Authored'},geometry:{op:'implicitSurface',descriptor:{bounds:{min:[-25,-20,-35],max:[25,20,35]},resolution:32,triangleBudget:15000,primitives:[{id:'envelope',type:'ellipsoid',radii:[20,14,30]}]}}}]});
const fit=()=>({schema:'sceliph.ellipsoid-section-fit/0.1' as const,frame:'primitive-local' as const,units:'mm' as const,evidence:{status:'designed' as const,sourceId:'q3-target'},pointsMm:[.75,.88].map(z=>[20*(1-z**3)**(1/3),0,30*z] as [number,number,number])});
it('refines actual mesh sections within explicit mm budget and preserves original source',()=>{
 const ir=source(),original=structuredClone(ir);ir.components[0].geometry.descriptor.resolution=16;original.components[0].geometry.descriptor.resolution=16;
 const result=fitEllipsoidWithMeshBudget(ir,'pod-shell','envelope',fit(),{schema:'sceliph.section-mesh-budget/0.1',toleranceMm:.15,maximumResolution:48});
 expect(ir).toEqual(original);expect(result.report.selectedResolution).toBeGreaterThan(16);expect(result.report.attempts.length).toBeLessThanOrEqual(4);
 expect(result.report.attempts.at(-1)!.errorsMm.every(n=>n<=.15)).toBe(true);
 expect(result).toEqual(fitEllipsoidWithMeshBudget(ir,'pod-shell','envelope',fit(),{schema:'sceliph.section-mesh-budget/0.1',toleranceMm:.15,maximumResolution:48}));
});
it('fails atomically on impossible budget and unsupported transform',()=>{
 const ir=source(),before=structuredClone(ir);
 expect(()=>fitEllipsoidWithMeshBudget(ir,'pod-shell','envelope',fit(),{schema:'sceliph.section-mesh-budget/0.1',toleranceMm:.0001,maximumResolution:32})).toThrow(/budget/);expect(ir).toEqual(before);
 ir.components[0].geometry.descriptor.primitives[0].transform={scale:[2,1,1]};
 expect(()=>fitEllipsoidWithMeshBudget(ir,'pod-shell','envelope',fit(),{schema:'sceliph.section-mesh-budget/0.1',toleranceMm:.15,maximumResolution:48})).toThrow(/transform/);
});

import { compileAssemblyGeometry } from '../src/engine/assembly-compiler';
import { polygonizeImplicitSurface } from '../src/engine/implicit-surface';
import { applyAssemblyPrimaryRecipe,ASSEMBLY_PRIMARY_RECIPE_V5_SCHEMA } from '../src/engine/assembly-primary-recipe';
import { fingerprintAssemblyIR } from '../src/engine/assembly-edit';
import { createBirdPrimaryStudy } from '../src/engine/bird-primary-study';
it.each([.5,1,3])('preserves non-targets and exact generated buffers on save/reopen at scale %s',async scale=>{
 const ir=source(),g=ir.components[0].geometry;if(g.op!=='implicitSurface')throw Error('fixture');g.descriptor.resolution=16;
 g.descriptor.bounds.min=g.descriptor.bounds.min.map(n=>n*scale) as [number,number,number];g.descriptor.bounds.max=g.descriptor.bounds.max.map(n=>n*scale) as [number,number,number];g.descriptor.primitives[0].radii=g.descriptor.primitives[0].radii!.map(n=>n*scale) as [number,number,number];
 const other=createBirdPrimaryStudy().components.find(c=>c.id==='eye_left')!;ir.components.push(other);const points=fit();points.pointsMm=points.pointsMm.map(p=>p.map(n=>n*scale) as [number,number,number]);
 const step={op:'ellipsoid-section-fit-budget',componentId:'pod-shell',primitiveId:'envelope',fit:points,budget:{schema:'sceliph.section-mesh-budget/0.1',toleranceMm:.15*scale,maximumResolution:48}};
 const text=JSON.stringify({schema:ASSEMBLY_PRIMARY_RECIPE_V5_SCHEMA,sourceFingerprint:await fingerprintAssemblyIR(ir),steps:[step]});
 const result=await applyAssemblyPrimaryRecipe(ir,text);expect(result.ir.components[1]).toEqual(other);
 const reopened=JSON.parse(JSON.stringify(result.ir)),a=compileAssemblyGeometry(result.ir.components[0].geometry),b=compileAssemblyGeometry(reopened.components[0].geometry),c=compileAssemblyGeometry(ir.components[1].geometry),d=compileAssemblyGeometry(result.ir.components[1].geometry);
 try{for(const k of ['position','normal','uv']){expect(a.getAttribute(k).array).toEqual(b.getAttribute(k).array);expect(c.getAttribute(k).array).toEqual(d.getAttribute(k).array);}expect(a.index?.array).toEqual(b.index?.array);expect(c.index?.array).toEqual(d.index?.array);}finally{[a,b,c,d].forEach(x=>x.dispose());}
 const noop=await applyAssemblyPrimaryRecipe(reopened,JSON.stringify({schema:ASSEMBLY_PRIMARY_RECIPE_V5_SCHEMA,sourceFingerprint:await fingerprintAssemblyIR(reopened),steps:[step]}));expect(noop.ir).toEqual(reopened);
 expect((await applyAssemblyPrimaryRecipe(ir,text)).ir).toEqual(result.ir);
});
it('rejects unsupported versions, stale budget combinations and malformed budget',async()=>{
 const ir=source(),original=structuredClone(ir),step={op:'ellipsoid-section-fit-budget',componentId:'pod-shell',primitiveId:'envelope',fit:fit(),budget:{schema:'sceliph.section-mesh-budget/0.1',toleranceMm:.15,maximumResolution:48}};
 const r={schema:ASSEMBLY_PRIMARY_RECIPE_V5_SCHEMA,sourceFingerprint:await fingerprintAssemblyIR(ir),steps:[step]};
 for(const version of ['0.1','0.2','0.3','0.4'])await expect(applyAssemblyPrimaryRecipe(ir,JSON.stringify({...r,schema:'sceliph.assembly-primary-recipe/'+version}))).rejects.toThrow();
 await expect(applyAssemblyPrimaryRecipe(ir,JSON.stringify({...r,steps:[step,{op:'ellipsoid-radii',componentId:'pod-shell',primitiveId:'envelope',radiiMm:[21,14,30]}]}))).rejects.toThrow(/invalidate/);
 for(const budget of [null,{...step.budget,toleranceMm:0},{...step.budget,maximumResolution:49},{...step.budget,extra:true}])expect(()=>fitEllipsoidWithMeshBudget(ir,'pod-shell','envelope',fit(),budget as any)).toThrow();expect(ir).toEqual(original);
});
it('keeps legacy polygonization buffers exact with explicit legacy ceiling',()=>{
 const g=source().components[0].geometry;if(g.op!=='implicitSurface')throw Error('fixture');const a=polygonizeImplicitSurface(g.descriptor),b=polygonizeImplicitSurface(g.descriptor,64);
 try{expect(a.resolution).toBe(b.resolution);for(const k of ['position','normal'])expect(a.geometry.getAttribute(k).array).toEqual(b.geometry.getAttribute(k).array);expect(a.geometry.index!.array).toEqual(b.geometry.index!.array);}finally{a.geometry.dispose();b.geometry.dispose();}
 expect(()=>polygonizeImplicitSurface(g.descriptor,31)).toThrow(/ceiling/);
});
