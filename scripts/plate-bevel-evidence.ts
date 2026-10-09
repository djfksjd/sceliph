import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Canvas,ImageData,createCanvas,loadImage} from '@napi-rs/canvas';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {Mesh,Raycaster,Vector3} from 'three';
import {WebIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {generateBeveledPlateProject} from '../src/engine/plate-bevel';
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

const proof=[];
for(const k of [.5,1,2]){
 const input={widthMm:20*k,heightMm:10*k,thicknessMm:4*k,boreDiameterMm:4*k};
 const baseline=parseProject(readFileSync('tests/fixtures/plate-bevel/baseline-'+k+'.source.json','utf8')),base=await save('baseline-'+k,baseline),zero=await save('zero-'+k,generateBeveledPlateProject({...input,edgeBevelMm:0}));assert(Buffer.from(base.bytes).equals(Buffer.from(zero.bytes)),'Zero bevel whole bytes');
 const p=generateBeveledPlateProject({...input,edgeBevelMm:.4*k}),after=await save('bevel-'+k,p),back=await save('reopened-'+k,parseProject(readFileSync(resolve(out,'bevel-'+k+'.source.json'),'utf8')));assert(Buffer.from(after.bytes).equals(Buffer.from(back.bytes)),'Bevel whole-byte regeneration');
 const {inspectMeshExport}=await import('../src/engine/mesh-export-policy');const uv=await inspectMeshExport(after.bytes.buffer as ArrayBuffer,serializeProject(p),'editable-mesh');proof.push({k,zeroWholeBytes:true,bevelWholeBytes:true,uv});
}
writeFileSync(resolve(out,'report.json'),JSON.stringify({pass:true,rows,proof,browser:'not-run',blender:'not-run',scope:'Actual mesh bevel and native roundtrip, no visual shading/physical/CAD certification'},null,2)+'\n');console.log(JSON.stringify({pass:true,files:rows.length}));
