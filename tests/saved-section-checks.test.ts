import { expect,it } from 'vitest';
import { createBirdPrimaryStudy } from '../src/engine/bird-primary-study';
import type { AssemblyIR } from '../src/engine/assembly-ir';
import { attachSavedSectionCheck,inspectSavedSectionChecks,refreshSavedSectionChecks } from '../src/engine/saved-section-checks';
import { fitEllipsoidWithMeshBudget } from '../src/engine/ellipsoid-section-budget';
const source=():AssemblyIR=>({schema:'morphloom.assembly/0.1',name:'Saved section fixture',units:'mm',components:[{id:'pod',name:'Pod',category:'enclosure',materialName:'clay',detail:'Authored',material:{surface:'raw',color:'#999999',roughness:.75,metalness:0,microNormalStrength:0},evidence:{status:'estimated',source:'Authored'},geometry:{op:'implicitSurface',descriptor:{bounds:{min:[-25,-20,-35],max:[25,20,35]},resolution:16,triangleBudget:15000,primitives:[{id:'envelope',type:'ellipsoid',radii:[20,14,30]}]}}},createBirdPrimaryStudy().components.find(c=>c.id==='eye_left')!]});
const fit=()=>({schema:'sceliph.ellipsoid-section-fit/0.1' as const,frame:'primitive-local' as const,units:'mm' as const,evidence:{status:'designed' as const,sourceId:'authored-q3'},pointsMm:[.75,.88].map(z=>[20*(1-z**3)**(1/3),0,30*z] as [number,number,number])});
const budget={schema:'sceliph.section-mesh-budget/0.1' as const,toleranceMm:.15,maximumResolution:48};
async function saved(){const ir=fitEllipsoidWithMeshBudget(source(),'pod','envelope',fit(),budget).ir;return attachSavedSectionCheck(ir,'pod','envelope',fit(),budget);}
it('saves/reopens declarations and recomputes actual mesh errors without cached PASS',async()=>{
 const ir=await saved(),before=structuredClone(ir),reopened=JSON.parse(JSON.stringify(ir));const report=await inspectSavedSectionChecks(reopened);expect(report[0].status).toBe('verified');expect(report[0].errorsMm!.every(n=>n<=.15)).toBe(true);expect(ir).toEqual(before);expect(JSON.stringify(ir)).not.toContain('"status":"verified"');
 expect(await refreshSavedSectionChecks(ir)).toEqual(ir);
});
it('flags changed target geometry and rejects failed refresh without applying anything',async()=>{
 const ir=await saved();const g=ir.components[0].geometry;if(g.op!=='implicitSurface')throw Error('fixture');g.descriptor.primitives[0].sectionShape!.axialPower=1.5;const before=structuredClone(ir),report=await inspectSavedSectionChecks(ir);expect(report[0].status).toBe('stale');expect(report[0].withinBudget).toBe(false);await expect(refreshSavedSectionChecks(ir)).rejects.toThrow();expect(ir).toEqual(before);
});
it('does not invalidate local geometry evidence on color or unrelated component changes',async()=>{
 const ir=await saved();ir.components[0].material.color='#223344';ir.components[1].position=[1,2,3];expect((await inspectSavedSectionChecks(ir))[0].status).toBe('verified');
});

import { validateAssemblyIR,compileAssemblyGeometry } from '../src/engine/assembly-compiler';
import { applyAssemblyPrimaryRecipe,ASSEMBLY_PRIMARY_RECIPE_V6_SCHEMA } from '../src/engine/assembly-primary-recipe';
import { fingerprintAssemblyIR } from '../src/engine/assembly-edit';
import { vi } from 'vitest';
it('refreshes a changed but passing mesh explicitly without changing geometry or unrelated fields',async()=>{
 const ir=await saved(),g=ir.components[0].geometry;if(g.op!=='implicitSurface')throw Error('fixture');g.descriptor.resolution=38;const before=structuredClone(ir);
 const report=await inspectSavedSectionChecks(ir);expect(report[0].status).toBe('stale');expect(report[0].withinBudget).toBe(true);
 const refreshed=await refreshSavedSectionChecks(ir);expect((await inspectSavedSectionChecks(refreshed))[0].status).toBe('verified');expect(refreshed.components).toEqual(before.components);expect(ir).toEqual(before);
 const a=compileAssemblyGeometry(ir.components[0].geometry),b=compileAssemblyGeometry(refreshed.components[0].geometry);try{for(const k of ['position','normal','uv'])expect(a.getAttribute(k).array).toEqual(b.getAttribute(k).array);expect(a.index?.array).toEqual(b.index?.array);}finally{a.dispose();b.dispose();}
});
it('rejects cached PASS, unknown schema/engine, duplicates and forged source binding',async()=>{
 const ir=await saved(),before=structuredClone(ir);
 for(const mutate of [(x:any)=>x.sectionMeshChecks.pass=true,(x:any)=>x.sectionMeshChecks.schema='future',(x:any)=>x.sectionMeshChecks.entries[0].engine='future',(x:any)=>x.sectionMeshChecks.entries.push(x.sectionMeshChecks.entries[0]),(x:any)=>x.sectionMeshChecks.entries[0].fit.units='m']){const next=structuredClone(ir);mutate(next);expect(()=>validateAssemblyIR(next)).toThrow();}
 const forged=structuredClone(ir);forged.sectionMeshChecks!.entries[0].geometryFingerprint='0'.repeat(64);expect((await inspectSavedSectionChecks(forged))[0].status).toBe('stale');expect(ir).toEqual(before);
 const missing=structuredClone(ir);missing.components=missing.components.slice(1);expect((await inspectSavedSectionChecks(missing))[0].status).toBe('blocked');
});
it('records through version6 recipe and preserves legacy/no-op behavior',async()=>{
 const ir=source(),step={op:'ellipsoid-section-fit-record',componentId:'pod',primitiveId:'envelope',fit:fit(),budget};
 const text=JSON.stringify({schema:ASSEMBLY_PRIMARY_RECIPE_V6_SCHEMA,sourceFingerprint:await fingerprintAssemblyIR(ir),steps:[step]});const result=await applyAssemblyPrimaryRecipe(ir,text);expect(result.ir.sectionMeshChecks).toBeDefined();expect((await inspectSavedSectionChecks(result.ir))[0].status).toBe('verified');expect(ir.sectionMeshChecks).toBeUndefined();
 for(const v of ['0.1','0.2','0.3','0.4','0.5'])await expect(applyAssemblyPrimaryRecipe(ir,text.replace('/0.6','/'+v))).rejects.toThrow();
 const nextText=JSON.stringify({schema:ASSEMBLY_PRIMARY_RECIPE_V6_SCHEMA,sourceFingerprint:await fingerprintAssemblyIR(result.ir),steps:[step]});expect((await applyAssemblyPrimaryRecipe(result.ir,nextText)).receipt.inputFingerprint).toBe((await applyAssemblyPrimaryRecipe(result.ir,nextText)).receipt.outputFingerprint);
});
it('snapshots before asynchronous hashing so mutation cannot produce a false binding',async()=>{
 const ir=await saved(),old=structuredClone(ir),digest=crypto.subtle.digest.bind(crypto.subtle);const spy=vi.spyOn(crypto.subtle,'digest').mockImplementation(async(...args)=>{await new Promise(r=>setTimeout(r,10));return digest(...args);});
 try{const pending=inspectSavedSectionChecks(ir);ir.components[0].geometry={op:'sphere',radius:5};expect((await pending)[0].status).toBe('verified');expect((await inspectSavedSectionChecks(ir))[0].status).toBe('blocked');expect(old.components[0].geometry.op).toBe('implicitSurface');}finally{spy.mockRestore();}
});
