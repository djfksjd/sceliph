import{expect,it}from'vitest';import{regenerateAuthoredPart}from'../src/engine/part-regeneration';import{createElementDomainRegistry}from'../src/engine/element-domain-packs';import{beveledPlatePack}from'../src/engine/plate-bevel';import{generateCenteredPlateProject}from'../src/engine/centered-plate-pack';import{editPart,ElementHistory,parseProject,serializeProject}from'../src/engine/element-project';import{modelingSourceSHA256}from'../src/engine/element-modeling-recipe';import{declarationTextSha256}from'../src/engine/parameter-binding';
import {exportSelectedScene} from '../src/engine/element-renderer';
import {inspectUvQuality} from '../src/engine/uv-quality';
const reg=createElementDomainRegistry();reg.register(beveledPlatePack);const declaration=JSON.stringify({schema:'sceliph.domain-invocation/0.1',packId:beveledPlatePack.metadata.id,units:'mm',coordinates:'right-handed-y-up',input:{widthMm:32,heightMm:14,thicknessMm:5,boreDiameterMm:4,edgeBevelMm:.6},requiredCapabilities:['generate']});
function source(){const p=generateCenteredPlateProject({});p.parts[0].id='user_panel';p.parts.push({...structuredClone(p.parts[0]),id:'neighbor',position:[30,0,0]});return editPart(p,'user_panel',{position:[1,2,3],rotation:[.1,.2,.3],scale:[1.1,1,1],material:{roughness:.4,metalness:.8}});}
async function expected(p:ReturnType<typeof source>){return {sourceSha256:await modelingSourceSHA256(p),declarationSha256:await declarationTextSha256(declaration)};}
it('replaces actual geometry under arbitrary stable IDs and preserves user transforms, PBR, neighbor and undo/redo',async()=>{const p=source(),before=serializeProject(p),r=await regenerateAuthoredPart(reg,p,'user_panel',declaration,await expected(p)),old=p.parts[0],next=r.project.parts[0];expect(next.geometry).not.toEqual(old.geometry);expect({...next,geometry:old.geometry,evidence:old.evidence}).toEqual(old);expect(r.project.parts[1]).toEqual(p.parts[1]);expect(serializeProject(p)).toBe(before);const h=new ElementHistory(p);h.commit(r.project);expect(serializeProject(h.undo())).toBe(before);expect(h.redo()).toEqual(r.project);expect(serializeProject(parseProject(serializeProject(r.project)))).toBe(serializeProject(r.project));});
it('rejects stale sources, invalid targets and unsupported requests without touching source',async()=>{const p=source(),e=await expected(p),before=serializeProject(p);await expect(regenerateAuthoredPart(reg,editPart(p,'neighbor',{position:[31,0,0]}),'user_panel',declaration,e)).rejects.toThrow('Stale');for(const patch of [{locked:true},{evidence:{status:'inferred',source:'unknown'}},{home:{position:[0,0,0],rotation:[0,0,0]}}]){const q=structuredClone(p);Object.assign(q.parts[0],patch);await expect(regenerateAuthoredPart(reg,q,'user_panel',declaration,await expected(q))).rejects.toThrow();}const bad=JSON.stringify({...JSON.parse(declaration),input:{edgeBevelMm:100}});await expect(regenerateAuthoredPart(reg,p,'user_panel',bad,{...e,declarationSha256:await declarationTextSha256(bad)})).rejects.toThrow();expect(serializeProject(p)).toBe(before);});
it('captures original source before await and ignores caller fingerprint mutation',async()=>{const p=source(),e=await expected(p),job=regenerateAuthoredPart(reg,p,'user_panel',declaration,e);p.parts[0].position[0]=99;e.sourceSha256='0'.repeat(64);expect((await job).project.parts[0].position[0]).toBe(1);});

it('refuses assembly dependencies and material-changing regeneration requests',async()=>{const p=source();p.assemblies=[{id:'assembly_fixture',name:'Fixture',axis:[0,1,0]}];p.parts[0].assemblyId='assembly_fixture';await expect(regenerateAuthoredPart(reg,p,'user_panel',declaration,await expected(p))).rejects.toThrow('assembly');const q=source(),d=JSON.stringify({...JSON.parse(declaration),materials:[{componentId:'plate_body',material:{roughness:.2,metalness:0}}]});await expect(regenerateAuthoredPart(reg,q,'user_panel',d,{sourceSha256:await modelingSourceSHA256(q),declarationSha256:await declarationTextSha256(d)})).rejects.toThrow('material');});

it('reopens a replacement for further edits and repeating replacement never accumulates the target transform',async()=>{
 const first=await regenerateAuthoredPart(reg,source(),'user_panel',declaration,await expected(source()));
 const reopened=parseProject(serializeProject(first.project));
 const moved=editPart(reopened,'user_panel',{position:[4,2,3]});
 const second=await regenerateAuthoredPart(reg,moved,'user_panel',declaration,await expected(moved));
 const third=await regenerateAuthoredPart(reg,second.project,'user_panel',declaration,await expected(second.project));
 expect(second.project.parts[0].position).toEqual([4,2,3]);
 expect(second.project.parts[0].rotation).toEqual(reopened.parts[0].rotation);
 expect(second.project.parts[0].scale).toEqual(reopened.parts[0].scale);
 expect(second.project.parts[0].material).toEqual(reopened.parts[0].material);
 expect(second.project.parts[1]).toEqual(moved.parts[1]);
 expect(serializeProject(third.project)).toBe(serializeProject(second.project));
 expect(third.receipt.outputSha256).toBe(second.receipt.outputSha256);
 await expect(regenerateAuthoredPart(reg,moved,'user_panel',declaration,first.receipt)).rejects.toThrow('Stale');
});

it('blocks a replacement whose preserved user UV scale breaks the final target, leaving history and original source intact',async()=>{
 const p=editPart(generateCenteredPlateProject({widthMm:1000,heightMm:1000,thicknessMm:1000,boreDiameterMm:0}),'plate_body',{uvScale:.001});
 const built=exportSelectedScene(p,['plate_body']);
 try{expect((await inspectUvQuality(built.root)).integrityPass).toBe(true);}finally{built.dispose();}
 const original=serializeProject(p),history=new ElementHistory(p);
 await expect(regenerateAuthoredPart(reg,p,'plate_body',declaration,await expected(p))).rejects.toThrow('Final target UV');
 expect(serializeProject(p)).toBe(original);
 expect(serializeProject(history.undo())).toBe(original);
 const valid=editPart(p,'plate_body',{uvScale:1});
 const result=await regenerateAuthoredPart(reg,valid,'plate_body',declaration,await expected(valid));
 expect(result.project.parts[0].uvScale).toBe(1);
 const final=exportSelectedScene(result.project,['plate_body']);
 try{expect((await inspectUvQuality(final.root)).integrityPass).toBe(true);}finally{final.dispose();}
});
