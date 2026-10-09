import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Canvas,ImageData,createCanvas,loadImage} from '@napi-rs/canvas';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {Mesh,Raycaster,Vector3} from 'three';
import {WebIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {bearingPack} from '../src/engine/bearing-pack';
import {gearPack} from '../src/engine/gear-pack';
import {centeredPlatePack} from '../src/engine/centered-plate-pack';
import {createElementDomainRegistry} from '../src/engine/element-domain-packs';
import {parseEditableElementSource} from '../src/engine/editable-source';
import {ElementSourceLoadSession} from '../src/element-source-load';
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

const registry=createElementDomainRegistry();for(const pack of[bearingPack,gearPack,centeredPlatePack])registry.register(pack);
const cases=[{id:'plate',packId:centeredPlatePack.metadata.id,input:{widthMm:45,heightMm:15,thicknessMm:3,boreDiameterMm:6},target:'plate_body'},{id:'gear',packId:gearPack.metadata.id,input:{moduleMm:.6,toothCount:30,faceWidthMm:3,boreDiameterMm:6},target:'spur_gear'},{id:'bearing',packId:bearingPack.metadata.id,input:{boreDiameterMm:12,outerDiameterMm:30,widthMm:10,ballDiameterMm:5,ballCount:7},target:'ball_0000'}];
const proof:any[]=[];
for(const c of cases){
 const declaration={schema:'sceliph.domain-invocation/0.1',units:'mm',coordinates:'right-handed-y-up',packId:c.packId,input:c.input,requiredCapabilities:['semantic-part-editing','selected-scene-export']};
 const path=resolve(out,c.id+'.declaration.json');writeFileSync(path,JSON.stringify(declaration,null,2),{flag:'wx'});
 async function load(path:string){let project:ElementProject|undefined;const session=new ElementSourceLoadSession(text=>parseEditableElementSource(registry,text));await session.load({name:path,size:readFileSync(path).length,text:async()=>readFileSync(path,'utf8')},()=>true,p=>project=p,()=>{});assert(!session.blocked&&!!project,'Editor import failed');return project!;}
 const project=await load(path),original=await save(c.id+'-original',project),part=project.parts.find(p=>p.id===c.target)!;
 const moved=editPart(project,c.target,{position:[part.position[0]+2,part.position[1]-3,part.position[2]+1]}),edited=await save(c.id+'-edited',moved),reloaded=await load(resolve(out,c.id+'-edited.source.json')),reopened=await save(c.id+'-reopened',reloaded);
 assert(Buffer.from(edited.bytes).equals(Buffer.from(reopened.bytes)),'Native saved source was regenerated from invocation or drifted');
 assert(JSON.stringify(snapshot(original.doc,c.target).primitives)===JSON.stringify(snapshot(edited.doc,c.target).primitives),'Target geometry/normals/UV/index changed');
 for(const p of project.parts.filter(p=>p.id!==c.target))assert(JSON.stringify(snapshot(original.doc,p.id))===JSON.stringify(snapshot(edited.doc,p.id)),'Non-target changed');
 const before=snapshot(original.doc,c.target),after=snapshot(edited.doc,c.target);for(let i=0;i<3;i++)assert(Math.abs((after.translation[i]-before.translation[i])*1000-[2,-3,1][i])<=.0001,'World mm translation');
 const material=(doc:any,id:string)=>{const p=doc.getRoot().listNodes().find((n:any)=>n.getName()===id).getMesh().listPrimitives()[0];const m=p.getMaterial();return [m.getBaseColorFactor(),m.getRoughnessFactor(),m.getMetallicFactor()];};for(const p of project.parts)assert(JSON.stringify(material(original.doc,p.id))===JSON.stringify(material(edited.doc,p.id)),'Material changed');
 const next=editPart(reloaded,c.target,{position:[reloaded.parts.find(p=>p.id===c.target)!.position[0]+1,part.position[1]-3,part.position[2]+1]}),continued=await save(c.id+'-continued',next);assert(Math.abs((snapshot(continued.doc,c.target).translation[0]-before.translation[0])*1000-3)<=.0001,'Continued edit accumulated wrong translation');
 proof.push({id:c.id,pass:true,canonicalNativeReopenExact:true,continuedEditing:true,unchangedPartBuffers:true,unchangedMaterials:true,declaredMovementMm:[2,-3,1]});
}
writeFileSync(resolve(out,'report.json'),JSON.stringify({schema:'sceliph.editable-declaration-flow/0.1',pass:true,rows,proof,browser:'not-run; existing environment denial',blender:'not-run; existing startup crash',scope:'Actual shared import session plus file exports; no claim of UI clicks, new inference or independent DCC acceptance'},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({pass:true,cases:proof.length,glbs:rows.length}));
