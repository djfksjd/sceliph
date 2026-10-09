import {expect,it} from 'vitest';
import type {AssemblyIR} from '../src/engine/assembly-ir';
import {createAssemblyTranslationCatalogue} from '../src/engine/assembly-action-catalogue';
import {applyAssemblyComponentPatch,fingerprintAssemblyIR} from '../src/engine/assembly-edit';
const fixture=():AssemblyIR=>({schema:'morphloom.assembly/0.1',units:'mm',name:'case',components:[3,9].map((radius,i)=>({id:'part'+i,name:'part'+i,category:'mechanical',materialName:'raw',detail:'authored concept',geometry:{op:'sphere',radius},material:{color:'#808080'}}))});
it('derives comparative labels from validated dimensions and binds every action to the actual source',async()=>{
 const source=fixture(),before=JSON.stringify(source),catalogue=await createAssemblyTranslationCatalogue(source,'move',[2,3]);expect(catalogue.proposals).toHaveLength(24);expect(catalogue.sourceFingerprint).toBe(await fingerprintAssemblyIR(source));
 for(const p of catalogue.proposals){expect(p.response.expectedInputFingerprint).toBe(catalogue.sourceFingerprint);expect(p.description).toContain(p.response.componentId==='part0'?'smallest-radius':'largest-radius');}
 const move=catalogue.proposals.find(p=>p.response.componentId==='part0'&&JSON.stringify(p.response.translateMm)==='[0,2,0]')!;
 const result=await applyAssemblyComponentPatch(source,move.response);expect(result.ir.components[0].position).toEqual([0,2,0]);expect(result.ir.components[1]).toEqual(source.components[1]);expect(JSON.stringify(source)).toBe(before);await expect(applyAssemblyComponentPatch(result.ir,move.response)).rejects.toThrow('stale');
});
it('does not invent a smaller/larger distinction for tied radii or depend on component ordering/IDs',async()=>{
 const source=fixture();source.components.reverse();source.components[0].id='different';const a=await createAssemblyTranslationCatalogue(source,'test',[1]);expect(a.proposals.filter(p=>p.description.includes('smallest-radius')).every(p=>p.response.componentId==='part0')).toBe(true);
 source.components[0].geometry={op:'sphere',radius:3};const b=await createAssemblyTranslationCatalogue(source,'test',[1]);expect(b.proposals.every(p=>p.description.includes('equal-radius'))).toBe(true);
});
it('rejects unsupported geometry/scale and invalid or excessive action budgets without changing input',async()=>{
 const source=fixture(),before=JSON.stringify(source);
 for(const amounts of [[],[0],[-1],[1,1],[NaN],[1,2,3]])await expect(createAssemblyTranslationCatalogue(source,'move',amounts)).rejects.toThrow();
 for(const op of ['-move','_move',17])await expect(createAssemblyTranslationCatalogue(source,op as string,[1])).rejects.toThrow('operation');
 await expect(createAssemblyTranslationCatalogue({...source,components:[{...source.components[0],scale:[2,1,1]}]},'move',[1])).rejects.toThrow('unscaled');
 await expect(createAssemblyTranslationCatalogue({...source,components:[{...source.components[0],geometry:{op:'roundedBox',size:[1,1,1],radius:.1,segments:4}}]},'move',[1])).rejects.toThrow('spheres');expect(JSON.stringify(source)).toBe(before);
});

it('captures source state before asynchronous fingerprinting and keeps returned proposals independent',async()=>{
 const source=fixture(),original=structuredClone(source),pending=createAssemblyTranslationCatalogue(source,'move',[1]);source.components[0].geometry={op:'sphere',radius:30};const catalogue=await pending;expect(catalogue.sourceFingerprint).toBe(await fingerprintAssemblyIR(original));expect(catalogue.proposals.find(p=>p.response.componentId==='part0')!.description).toContain('smallest-radius');catalogue.proposals[0].response.translateMm![0]=900;expect(source.components[0].position).toBeUndefined();
});
