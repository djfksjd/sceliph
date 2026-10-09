import {editPart,validateProject,type ElementProject}from'./element-project';
import {executeDomainInvocation}from'./domain-invocation';
import type {ElementDomainRegistry}from'./element-domain-packs';
import {modelingSourceSHA256}from'./element-modeling-recipe';
import {exportSelectedScene}from'./element-renderer';
import {analyzeTopology}from'./topology';
import {declarationTextSha256}from'./parameter-binding';
import {inspectUvQuality} from './uv-quality';
import {evaluateMeshUvExport} from './mesh-export-policy';
export const PART_REGENERATION_REVISION='sceliph.part-regeneration/0.1';
export function partRegenerationBlocker(input:ElementProject,targetId:string):string|null{
 if(input.schema!=='morphloom.elements/0.6'||input.groups.length||input.elements.length||input.regions.length||input.assemblies?.length)return 'Requires static native0.6 without assembly or surface attachments';
 const part=input.parts.find(p=>p.id===targetId);
 if(!part)return 'Select an existing part';if(part.locked)return 'Unlock the selected part first';if(part.home||part.assemblyId)return 'Detached or assembly-bound targets are unsupported';if(part.evidence?.status!=='authored'||part.geometry?.op!=='extrude')return 'Only authored extrusion geometry is supported';return null;
}
/** Explicit replacement of one authored static extrusion, not IR reverse
 * engineering. Full source and declaration identities must match the preview. */
export async function regenerateAuthoredPart(registry:ElementDomainRegistry,project:ElementProject,targetId:string,declaration:string,expected:{sourceSha256:string;declarationSha256:string}){
 const input=validateProject(structuredClone(project)),captured={...expected};
 if(![captured.sourceSha256,captured.declarationSha256].every(s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s)))throw Error('Invalid regeneration fingerprints');
 const [sourceSha256,declarationSha256]=await Promise.all([modelingSourceSHA256(input),declarationTextSha256(declaration)]);
 if(captured.sourceSha256!==sourceSha256||captured.declarationSha256!==declarationSha256)throw Error('Stale regeneration input');
 const blocked=partRegenerationBlocker(input,targetId);if(blocked)throw Error(blocked);
 const generated=executeDomainInvocation(registry,declaration),p=generated.project;
 if(p.parts.length!==1||p.groups.length||p.elements.length||p.regions.length||p.assemblies?.length||p.parts[0].geometry?.op!=='extrude')throw Error('A single extrusion generator is required');
 if(generated.invocation.materials?.length)throw Error('Geometry regeneration cannot include material edits');
 const patched=editPart(input,targetId,{geometry:p.parts[0].geometry});
 const next=validateProject({...patched,parts:patched.parts.map(p=>p.id===targetId?{...p,evidence:{status:'authored',source:PART_REGENERATION_REVISION+'; explicit geometry replacement from '+generated.invocation.packId+'; input identity recorded by source SHA'}}:p)});
 // Validate the actual target after preserving its UV scale, normal policy and
 // transform. Checking the generator's defaults misses user-setting failures.
 const built=exportSelectedScene(next,[targetId]);
 try{
  if(built.stats.triangles>100000||!analyzeTopology(built.root).pass)throw Error('Regenerated geometry fails topology/budget');
  const uv=evaluateMeshUvExport(await inspectUvQuality(built.root),'editable-mesh');
  if(!uv.allowed)throw Error('Final target UV failed: '+uv.issues.map(i=>`${i.id}: ${i.reason}`).join('; '));
 }finally{built.dispose();}
 return {project:next,receipt:{schema:PART_REGENERATION_REVISION,targetId,packId:generated.invocation.packId,sourceSha256,declarationSha256,outputSha256:await modelingSourceSHA256(next),preserved:'Target ID/name/transform/material and non-target source; target geometry/UV/normals regenerated',scope:'Authored static mesh only; no CAD/reference/assembly/rig certification'}};
}
