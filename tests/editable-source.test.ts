import {expect,it}from'vitest';
import {createElementDomainRegistry}from'../src/engine/element-domain-packs';
import {centeredPlatePack}from'../src/engine/centered-plate-pack';
import {parseEditableElementSource}from'../src/engine/editable-source';
import {ElementSourceLoadSession}from'../src/element-source-load';
import {editPart,serializeProject,type ElementProject}from'../src/engine/element-project';
const registry=createElementDomainRegistry();registry.register(centeredPlatePack);
const declaration={schema:'sceliph.domain-invocation/0.1',units:'mm',coordinates:'right-handed-y-up',packId:'product.centered-plate',input:{widthMm:30,heightMm:12,thicknessMm:3,boreDiameterMm:5},requiredCapabilities:['semantic-part-editing','selected-scene-export']};
const decode=(text:string)=>parseEditableElementSource(registry,text);
function deferred(){let resolve!:(text:string)=>void;const promise=new Promise<string>(r=>resolve=r);return {promise,resolve};}
const file=(text:()=>Promise<string>)=>({name:'declaration.json',size:200,text});
it('evaluates once into native editable source and preserves subsequent edits on a fresh import',async()=>{
 let project:ElementProject|undefined;const session=new ElementSourceLoadSession(decode);
 await session.load(file(async()=>JSON.stringify(declaration)),()=>true,p=>project=p,()=>{});expect(session.blocked).toBe(false);expect(project!.parts[0].geometry?.op).toBe('extrude');
 const edited=editPart(project!,'plate_body',{position:[3,4,5]}),saved=serializeProject(edited),fresh=new ElementSourceLoadSession(decode);await fresh.load(file(async()=>saved),()=>true,p=>project=p,()=>{});expect(serializeProject(project!)).toBe(saved);expect(project!.parts[0].position).toEqual([3,4,5]);expect(decode(saved).parts[0].position).toEqual([3,4,5]);
});
it('rejects invalid declarations atomically and prevents stale valid reads from replacing the failed latest selection',async()=>{
 const session=new ElementSourceLoadSession(decode),late=deferred();let publishes=0;
 const first=session.load(file(()=>late.promise),()=>true,()=>publishes++,()=>{});
 await session.load(file(async()=>JSON.stringify({...declaration,input:{widthMm:30,heightMm:12,thicknessMm:3,boreDiameterMm:12}})),()=>true,()=>publishes++,()=>{});expect(session.blocked).toBe(true);late.resolve(JSON.stringify(declaration));await first;expect(publishes).toBe(0);expect(session.state.status).toBe('failed');
 for(const bad of [{...declaration,packId:'missing'}, {...declaration,schema:'sceliph.domain-invocation/99'}, {...declaration,units:'cm'},{...declaration,requiredCapabilities:['manufacturing-brep']},{...declaration,materials:[{componentId:'missing',material:{metalness:0,roughness:.5}}]}])expect(()=>decode(JSON.stringify(bad))).toThrow();
});
it('does not publish an imported declaration after unmount or explicit restore',async()=>{
 for(const restore of [false,true]){let active=true,published=0;const session=new ElementSourceLoadSession(decode),late=deferred();const job=session.load(file(()=>late.promise),()=>active,()=>published++,()=>{});if(restore)session.restore();else{active=false;session.cancel();}late.resolve(JSON.stringify(declaration));await job;expect(published).toBe(0);}
});

it('isolates a failing registered provider and subsequently loads native source normally',async()=>{const r=createElementDomainRegistry();r.register(centeredPlatePack);r.register({...centeredPlatePack,metadata:{...centeredPlatePack.metadata,id:'test.failing-provider'},generate:()=>{throw Error('fixture provider failed');}});const session=new ElementSourceLoadSession(text=>parseEditableElementSource(r,text));let published=0;await session.load(file(async()=>JSON.stringify({...declaration,packId:'test.failing-provider'})),()=>true,()=>published++,()=>{});expect(session.blocked).toBe(true);expect(published).toBe(0);const native=serializeProject(r.generate(centeredPlatePack.metadata.id,{}));await session.load(file(async()=>native),()=>true,()=>published++,()=>{});expect(session.blocked).toBe(false);expect(published).toBe(1);});
