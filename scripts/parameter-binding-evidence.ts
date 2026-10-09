import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Canvas,ImageData,createCanvas,loadImage} from '@napi-rs/canvas';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {Mesh,Raycaster,Vector3} from 'three';
import {WebIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {bindRequiredParameters,declarationTextSha256}from'../src/engine/parameter-binding';
import {createElementDomainRegistry}from'../src/engine/element-domain-packs';
import {centeredPlatePack}from'../src/engine/centered-plate-pack';
import {gearPack}from'../src/engine/gear-pack';
import {bearingPack}from'../src/engine/bearing-pack';
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


const registry=createElementDomainRegistry();for(const pack of[centeredPlatePack,gearPack,bearingPack])registry.register(pack);
const base='outputs/correction-holdout-20261008',contract=JSON.parse(readFileSync(base+'/contract.json','utf8')),proof=[];
for(const c of contract.cases){const raw=JSON.parse(readFileSync(base+'/model-run/'+c.id+'.response.txt','utf8')),requirements=JSON.stringify({schema:'sceliph.domain-requirements/0.1',packId:c.invocation.packId,units:'mm',coordinates:'right-handed-y-up',input:c.invocation.input});const expected={declarationSha256:await declarationTextSha256(raw),requirementsSha256:await declarationTextSha256(requirements)},bound=await bindRequiredParameters(registry,raw,requirements,expected);writeFileSync(resolve(out,c.id+'.bound-declaration.json'),bound.declaration,{flag:'wx'});writeFileSync(resolve(out,c.id+'.receipt.json'),JSON.stringify(bound.receipt,null,2),{flag:'wx'});
 const first=await save(c.id,bound.project);const {inspectMeshExport}=await import('../src/engine/mesh-export-policy');const uv=await inspectMeshExport(first.bytes.buffer as ArrayBuffer,serializeProject(bound.project),'editable-mesh');const back=await save(c.id+'-reopened',parseProject(readFileSync(resolve(out,c.id+'.source.json'),'utf8')));assert(Buffer.from(first.bytes).equals(Buffer.from(back.bytes)),'Whole-byte regeneration');const repeated=await bindRequiredParameters(registry,bound.declaration,requirements,{declarationSha256:await declarationTextSha256(bound.declaration),requirementsSha256:expected.requirementsSha256});assert(repeated.declaration===bound.declaration&&repeated.receipt.changes.length===0,'Binding replay drift');proof.push({id:c.id,pass:true,receipt:bound.receipt,reopenExact:true,bindingIdempotent:true,uv});}
writeFileSync(resolve(out,'report.json'),JSON.stringify({pass:true,proof,rows,scope:'Explicit engine parameter binding against independent user requirements; not model accuracy improvement',originalModelHoldoutPass:false,browser:'not-run',blender:'not-run'},null,2)+'\n');console.log(JSON.stringify({pass:true,cases:proof.length,glbs:rows.length}));
