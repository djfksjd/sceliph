import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {WebIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {parseProject,serializeProject} from '../src/engine/element-project';
import {exportSelectedScene} from '../src/engine/element-renderer';
import {evaluateModelResponse} from '../src/engine/model-response-evaluation';
import {compileAssemblyIR,validateAssemblyIR} from '../src/engine/assembly-compiler';
import {applyAssemblyComponentPatch} from '../src/engine/assembly-edit';
import {preparePortableGltfGeometry,createPortableGltfExportInput} from '../src/engine/gltf-export-preparation';
import {canonicalizeGlbBufferViews} from '../src/engine/glb-canonicalization';
import {analyzeTopology} from '../src/engine/topology';
import {validateGlbStandard} from '../src/engine/gltf-standard-validation';
import type {AssemblyIR} from '../src/engine/assembly-ir';
class Reader{result:unknown;onloadend?:()=>void;async readAsArrayBuffer(b:Blob){this.result=await b.arrayBuffer();this.onloadend?.();}}
Object.assign(globalThis,{FileReader:Reader});
if(process.argv.length!==6)throw Error('Usage: vite-node scripts/verify-offline-model-artifacts.ts creation|edit TASK_ROOT RUN_DIRECTORY NEW_OUTPUT_DIRECTORY');
const [mode,baseArg,runArg,outArg]=process.argv.slice(2),base=resolve(baseArg),run=resolve(runArg),out=resolve(outArg);mkdirSync(out);const io=new WebIO().registerExtensions(ALL_EXTENSIONS),rows:any[]=[];
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const assert=(v:boolean,why:string)=>{if(!v)throw Error(why);};
function write(name:string,data:string|Uint8Array){writeFileSync(resolve(out,name),data,{flag:'wx'});}
async function glb(name:string,bytes:Uint8Array){write(name+'.glb',bytes);const validation=await validateGlbStandard(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)as ArrayBuffer);assert(validation.status==='pass',name+' strict GLB failure');const doc=await io.readBinary(bytes);return {bytes,doc,validation,sha256:sha(bytes)};}
async function native(name:string,text:string){const source=serializeProject(parseProject(text));write(name+'.source.json',source);const p=parseProject(readFileSync(resolve(out,name+'.source.json'),'utf8'));const built=exportSelectedScene(p,p.parts.map(p=>p.id));try{const topology=analyzeTopology(built.root);assert(topology.pass&&topology.orientationConsistent===true,'Topology failure');return await glb(name,new Uint8Array(await new GLTFExporter().parseAsync(built.root,{binary:true})as ArrayBuffer));}finally{built.dispose();}}
async function assembly(name:string,ir:AssemblyIR){validateAssemblyIR(ir);write(name+'.source.json',JSON.stringify(ir,null,2));const b=compileAssemblyIR(ir,'beauty');try{assert(analyzeTopology(b.root).pass,'Assembly topology failure');const p=preparePortableGltfGeometry(b.root);assert(p.unresolvedNormalMappedMeshes.length===0,'Tangent inputs');return await glb(name,new Uint8Array(canonicalizeGlbBufferViews(await new GLTFExporter().parseAsync(createPortableGltfExportInput(b.root),{binary:true,includeCustomExtensions:true})as ArrayBuffer)));}finally{const gs=new Set<any>(),ms=new Set<any>();b.root.traverse((o:any)=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])ms.add(m);});for(const g of gs)g.dispose();for(const m of ms)m.dispose();b.root.clear();}}
const bufferSha=(a:any)=>a?sha(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)):null;
function snapshot(doc:any,id:string){const n=doc.getRoot().listNodes().find((n:any)=>n.getName()===id);assert(!!n,'Missing node '+id);return {translation:n.getTranslation(),rotation:n.getRotation(),scale:n.getScale(),parent:n.getParentNode()?.getName()??null,primitives:n.getMesh().listPrimitives().map((p:any)=>({attributes:Object.fromEntries(p.listSemantics().map((s:string)=>[s,bufferSha(p.getAttribute(s).getArray())])),index:bufferSha(p.getIndices()?.getArray()),material:p.getMaterial()?{name:p.getMaterial().getName(),color:p.getMaterial().getBaseColorFactor(),roughness:p.getMaterial().getRoughnessFactor(),metalness:p.getMaterial().getMetallicFactor()}:null}))};}
const report=JSON.parse(readFileSync(resolve(run,'run.json'),'utf8'));
assert(report.networkCalls===0&&report.greedy===true,'Recorded runtime contract');
if(mode==='creation'){
 const contract=JSON.parse(readFileSync(resolve(base,'creation-contract.json'),'utf8'));
 for(const [id,requirement]of Object.entries(contract.requirements)as any[]){
  const text=readFileSync(resolve(run,id+'.response.txt'),'utf8'),entry=report.rows.find((r:any)=>r.id===id);assert(entry?.responseSha256===sha(new TextEncoder().encode(text)),'Response binding');
  try{
   const evaluation=evaluateModelResponse({schema:'sceliph.model-response-task/0.2',id,domain:'local-declaration-conformance',request:'Recorded actual local model creation task',maximumTriangles:contract.maximumTriangles,parts:[{id:'body',...requirement,toleranceMm:contract.dimensionToleranceMm}]},text);write(id+'.evaluation.json',JSON.stringify(evaluation,null,2));assert(evaluation.pass,'Critical creation requirement failed');
   const first=await native(id,text),reopened=await native(id+'-reopened',readFileSync(resolve(out,id+'.source.json'),'utf8'));assert(Buffer.from(first.bytes).equals(Buffer.from(reopened.bytes)),'Whole-byte regeneration');rows.push({id,pass:true,evaluation,firstSha256:first.sha256,reopenedSha256:reopened.sha256,validation:first.validation});
  }catch(e){rows.push({id,pass:false,error:String(e)});}
 }
}else if(mode==='edit'){
 const contract=JSON.parse(readFileSync(resolve(base,'edit-contract.json'),'utf8')),ir=JSON.parse(readFileSync(resolve(base,'edit-source.json'),'utf8'))as AssemblyIR,original=await assembly('original',ir);
 for(const[id,expected]of Object.entries(contract.requirements)as any[]){
  const raw=readFileSync(resolve(run,id+'.response.txt'),'utf8'),entry=report.rows.find((r:any)=>r.id===id);assert(entry?.responseSha256===sha(new TextEncoder().encode(raw)),'Edit response binding');
  try{
   const patch=JSON.parse(raw);assert(patch.componentId===expected.componentId&&JSON.stringify(patch.translateMm)===JSON.stringify(expected.translateMm),'Wrong target or declared translation');assert(patch.expectedInputFingerprint===contract.expectedInputFingerprint,'Wrong source SHA');
   const applied=await applyAssemblyComponentPatch(ir,patch),first=await assembly(id,applied.ir),reopened=await assembly(id+'-reopened',JSON.parse(readFileSync(resolve(out,id+'.source.json'),'utf8')));assert(Buffer.from(first.bytes).equals(Buffer.from(reopened.bytes)),'Edit whole-byte regeneration');
   const before=snapshot(original.doc,expected.componentId),after=snapshot(first.doc,expected.componentId);assert(JSON.stringify({...before,translation:null})===JSON.stringify({...after,translation:null}),'Target buffers/material/hierarchy changed');for(let axis=0;axis<3;axis++)assert(Math.abs((after.translation[axis]-before.translation[axis])*1000-expected.translateMm[axis])<=contract.toleranceMm,'Wrong world mm movement');
   for(const c of ir.components.filter(c=>c.id!==expected.componentId))assert(JSON.stringify(snapshot(original.doc,c.id))===JSON.stringify(snapshot(first.doc,c.id)),'Non-target payload changed');
   let blocked=false;try{await applyAssemblyComponentPatch(applied.ir,patch);}catch{blocked=true;}assert(blocked,'Stale patch replay accepted');
   rows.push({id,pass:true,receipt:applied.receipt,firstSha256:first.sha256,reopenedSha256:reopened.sha256,validation:first.validation,nonTargetExact:true,staleReplayBlocked:true});
  }catch(e){rows.push({id,pass:false,error:String(e)});}
 }
}else throw Error('Unsupported mode');
write('report.json',JSON.stringify({schema:'sceliph.local-model-artifact-proof/0.1',mode,sourceRunSha256:sha(new Uint8Array(readFileSync(resolve(run,'run.json')))),pass:rows.length>0&&rows.every(r=>r.pass),rows,browser:'not-run',blender:'not-run',scope:'Recorded installed0.6B local model in schema-guided bounded tasks; not general prompt/photoreal/production acceptance'},null,2)+'\n');console.log(JSON.stringify({mode,rows:rows.map(r=>({id:r.id,pass:r.pass,error:r.error})),pass:rows.every(r=>r.pass)}));if(rows.some(r=>!r.pass))process.exitCode=1;
