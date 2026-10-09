import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Canvas,ImageData,createCanvas,loadImage} from '@napi-rs/canvas';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {Mesh,Raycaster,Vector3} from 'three';
import {WebIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import{generateCenteredPlateProject}from'../src/engine/centered-plate-pack';
import{beveledPlatePack}from'../src/engine/plate-bevel';
import{createElementDomainRegistry}from'../src/engine/element-domain-packs';
import{regenerateAuthoredPart}from'../src/engine/part-regeneration';
import{modelingSourceSHA256}from'../src/engine/element-modeling-recipe';
import{declarationTextSha256}from'../src/engine/parameter-binding';
import {generateSpurGearProject} from '../src/engine/gear-pack';
import {detachPart,restorePart,editPart,serializeProject,parseProject,migrateElementProjectToV6,type ElementProject} from '../src/engine/element-project';
import {prepareElementExportSource} from '../src/engine/element-export-source';
import {exportSelectedScene,ELEMENT_RENDERER_REVISION} from '../src/engine/element-renderer';
import {analyzeTopology} from '../src/engine/topology';
import {validateGlbStandard} from '../src/engine/gltf-standard-validation';
import {gearDimensions,gearProfile} from '../src/engine/spur-gear';
if(process.argv.length!==3)throw Error('Usage: vite-node scripts/native-delivery-slice.ts new-output-directory');
const out=resolve(process.argv[2]);mkdirSync(out);const rows:any[]=[];
class Reader{result:unknown;onloadend?:()=>void;async readAsArrayBuffer(b:Blob){this.result=await b.arrayBuffer();this.onloadend?.();}}
class Offscreen extends Canvas{async convertToBlob(options?:{type?:string}){const type=options?.type??'image/png';return new Blob([new Uint8Array(this.encodeSync(type==='image/jpeg'?'jpeg':'png'))],{type});}}
Object.assign(globalThis,{FileReader:Reader,OffscreenCanvas:Offscreen,ImageData});
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const assert=(yes:boolean,why:string)=>{if(!yes)throw Error(why);};
const arraySha=(a:any)=>a?sha(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)):null;
const snapshot=(doc:any,id:string)=>{const n=doc.getRoot().listNodes().find((n:any)=>n.getName()===id);assert(!!n,'Missing node '+id);return {translation:n.getTranslation(),rotation:n.getRotation(),scale:n.getScale(),parent:n.getParentNode()?.getName()??null,primitives:n.getMesh().listPrimitives().map((p:any)=>({attributes:Object.fromEntries(p.listSemantics().map((s:string)=>[s,arraySha(p.getAttribute(s).getArray())])),index:arraySha(p.getIndices()?.getArray())}))};};
async function save(name:string,project:ElementProject,ids=project.parts.map(p=>p.id)){
 const source=serializeProject(project);writeFileSync(resolve(out,name+'.source.json'),source,{flag:'wx'});
 const built=exportSelectedScene(prepareElementExportSource(parseProject(source)),ids);
 try{
  assert(analyzeTopology(built.root).pass,'Topology gate: '+name);assert(built.stats.triangles<=100000,'Triangle budget: '+name);
  const bytes=new Uint8Array(await new GLTFExporter().parseAsync(built.root,{binary:true}) as ArrayBuffer),validation=await validateGlbStandard(bytes.buffer as ArrayBuffer);assert(validation.status==='pass','Independent GLB gate: '+name);
  writeFileSync(resolve(out,name+'.glb'),bytes,{flag:'wx'});const doc=await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(bytes);
  rows.push({name,sourceSha:sha(new TextEncoder().encode(source)),glbSha:sha(bytes),bytes:bytes.length,triangles:built.stats.triangles,validation});return {bytes,doc};
 }finally{built.dispose();}
}

const registry=createElementDomainRegistry();registry.register(beveledPlatePack);const proof=[];
for(const k of [.5,1,2]){let p=generateCenteredPlateProject({widthMm:20*k,heightMm:10*k,thicknessMm:4*k,boreDiameterMm:4*k});p.parts[0].id='panel_user';p.parts[0].name='User edited panel';p.parts.push({...structuredClone(p.parts[0]),id:'untouched',position:[30*k,0,0]});p=editPart(p,'panel_user',{position:[1,2,3],rotation:[.1,.2,.3],scale:[1.1,1,1],material:{roughness:.4,metalness:.8}});
 const declaration=JSON.stringify({schema:'sceliph.domain-invocation/0.1',units:'mm',coordinates:'right-handed-y-up',packId:beveledPlatePack.metadata.id,input:{widthMm:32*k,heightMm:14*k,thicknessMm:5*k,boreDiameterMm:4*k,edgeBevelMm:.6*k},requiredCapabilities:['authored-single-extrusion']});const before=await save('before-'+k,p),result=await regenerateAuthoredPart(registry,p,'panel_user',declaration,{sourceSha256:await modelingSourceSHA256(p),declarationSha256:await declarationTextSha256(declaration)}),after=await save('after-'+k,result.project),back=await save('reopened-'+k,parseProject(readFileSync(resolve(out,'after-'+k+'.source.json'),'utf8')));assert(Buffer.from(after.bytes).equals(Buffer.from(back.bytes)),'Regeneration reopen bytes');assert(JSON.stringify(snapshot(before.doc,'untouched'))===JSON.stringify(snapshot(after.doc,'untouched')),'Non-target buffers/transform/hierarchy');const a=snapshot(before.doc,'panel_user'),b=snapshot(after.doc,'panel_user');assert(JSON.stringify({...a,primitives:null})===JSON.stringify({...b,primitives:null}),'Target transforms/hierarchy');const material=(doc:any,id:string)=>{const m=doc.getRoot().listNodes().find((n:any)=>n.getName()===id).getMesh().listPrimitives()[0].getMaterial();return [m.getBaseColorFactor(),m.getRoughnessFactor(),m.getMetallicFactor()];};for(const id of['panel_user','untouched'])assert(JSON.stringify(material(before.doc,id))===JSON.stringify(material(after.doc,id)),'PBR preservation');const {inspectMeshExport}=await import('../src/engine/mesh-export-policy');const uv=await inspectMeshExport(after.bytes.buffer as ArrayBuffer,serializeProject(result.project),'editable-mesh');proof.push({k,receipt:result.receipt,nonTargetExact:true,targetTransformAndPbrPreserved:true,nativeReopenBytesExact:true,uv});}
writeFileSync(resolve(out,'report.json'),JSON.stringify({pass:true,proof,rows,browser:'not-run',blender:'not-run',scope:'Static authored native extrusion only; local geometry regenerated and target pose/material plus unrelated parts preserved'},null,2)+'\n');console.log(JSON.stringify({pass:true,cases:proof.length,glbs:rows.length}));
