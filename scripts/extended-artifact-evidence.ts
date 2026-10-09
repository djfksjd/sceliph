import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {createElementDomainRegistry} from '../src/engine/element-domain-packs';
import {gearPack} from '../src/engine/gear-pack';
import {appendWorkspaceAsset,generateWorkspaceAsset,editWorkspacePart,serializeWorkspace,parseWorkspace,WorkspaceHistory,buildWorkspaceScene,type ElementWorkspace} from '../src/engine/element-workspace';
import {createWorkspaceEditorSession,serializeWorkspaceEditorSession,parseWorkspaceEditorFile} from '../src/engine/workspace-editor-session';
import {inspectUvQuality} from '../src/engine/uv-quality';
import {inspectBoundReferenceUv} from '../src/engine/bound-reference-uv';
import {parseOhpk} from '../src/engine/ohpk';
import {buildCharacter} from '../src/engine/character';
import {FIELD_HUMAN_SPEC} from '../src/types';
import {createPortableGltfExportInput,preparePortableGltfGeometry} from '../src/engine/gltf-export-preparation';
import {canonicalizeGlbBufferViews} from '../src/engine/glb-canonicalization';
import {auditRiggedGlbPayload} from './lib/rigged-payload-audit';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Canvas,ImageData} from '@napi-rs/canvas';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {Mesh} from 'three';
import {WebIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {generateSpurGearProject} from '../src/engine/gear-pack';
import {serializeProject} from '../src/engine/element-project';
import {exportSelectedScene,ELEMENT_RENDERER_REVISION} from '../src/engine/element-renderer';
import {analyzeTopology} from '../src/engine/topology';
import {validateGlbStandard} from '../src/engine/gltf-standard-validation';
if(process.argv.length!==4)throw Error('Usage: vite-node scripts/native-delivery-slice.ts new-output-directory history|uv|character');
const out=resolve(process.argv[2]);mkdirSync(out);const rows:any[]=[];
class Reader{result:unknown;onloadend?:()=>void;async readAsArrayBuffer(b:Blob){this.result=await b.arrayBuffer();this.onloadend?.();}}
class Offscreen extends Canvas{async convertToBlob(options?:{type?:string}){const type=options?.type??'image/png';return new Blob([new Uint8Array(this.encodeSync(type==='image/jpeg'?'jpeg':'png'))],{type});}}
Object.assign(globalThis,{FileReader:Reader,OffscreenCanvas:Offscreen,ImageData});
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const assert=(yes:boolean,why:string)=>{if(!yes)throw Error(why);};
const arraySha=(a:any)=>a?sha(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)):null;
const snapshot=(doc:any,id:string)=>{const n=doc.getRoot().listNodes().find((n:any)=>n.getName()===id);assert(!!n,'Missing node '+id);return {translation:n.getTranslation(),rotation:n.getRotation(),scale:n.getScale(),parent:n.getParentNode()?.getName()??null,primitives:n.getMesh().listPrimitives().map((p:any)=>({attributes:Object.fromEntries(p.listSemantics().map((s:string)=>[s,arraySha(p.getAttribute(s).getArray())])),index:arraySha(p.getIndices()?.getArray())}))};};
const io=new WebIO().registerExtensions(ALL_EXTENSIONS);
function write(name:string,value:string|Uint8Array){writeFileSync(resolve(out,name),value,{flag:'wx'});rows.push({file:name,sha256:sha(typeof value==='string'?new TextEncoder().encode(value):value)});}
async function saveGlb(name:string,bytes:Uint8Array){write(name+'.glb',bytes);const validation=await validateGlbStandard(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer);rows.push({name,validation});assert(validation.status==='pass','GLB standard: '+name);return io.readBinary(bytes);}
async function workspace(name:string,w:ElementWorkspace){write(name+'.json',serializeWorkspace(w));const reopened=parseWorkspace(readFileSync(resolve(out,name+'.json'),'utf8')),b=buildWorkspaceScene(reopened,'detail',true);try{assert(analyzeTopology(b.root).pass,'Workspace topology');const bytes=new Uint8Array(await new GLTFExporter().parseAsync(b.root,{binary:true}) as ArrayBuffer);return {bytes,doc:await saveGlb(name,bytes)};}finally{b.dispose();}}
if(process.argv[3]==='history'){
 const registry=createElementDomainRegistry();registry.register(gearPack);
 let w:ElementWorkspace={schema:'morphloom.workspace/0.1',units:'mm',coordinates:'right-handed-y-up',assets:[]};
 for(const [id,packId,x] of [['gear',gearPack.metadata.id,-100],['animal','morphloom.fur',100]] as const)w=appendWorkspaceAsset(w,generateWorkspaceAsset(registry,{id,packId,input:{},requiredCapabilities:['semantic-part-editing'],positionMm:[x,0,0],rotationRad:[0,0,0]}));
 const history=new WorkspaceHistory(w),base=await workspace('base',history.current);
 const next=editWorkspacePart(history.current,'gear','spur_gear',{position:[2,0,0]});history.commit(next);const edited=await workspace('edited',history.current);
 for(const node of base.doc.getRoot().listNodes().filter(n=>n.getName().startsWith('animal::')&&n.getMesh()))assert(JSON.stringify(snapshot(base.doc,node.getName()))===JSON.stringify(snapshot(edited.doc,node.getName())),'Unrelated domain changed');
 assert(JSON.stringify(snapshot(base.doc,'gear::spur_gear').primitives)===JSON.stringify(snapshot(edited.doc,'gear::spur_gear').primitives),'Target translation changed geometry/normal/UV/index');
 assert(Math.abs(snapshot(edited.doc,'gear::spur_gear').translation[0]-snapshot(base.doc,'gear::spur_gear').translation[0]-.002)<1e-6,'Declared local 2mm translation');
 const undo=await workspace('undo',history.undo()),redo=await workspace('redo',history.redo());assert(Buffer.from(undo.bytes).equals(Buffer.from(base.bytes)),'Undo whole bytes');assert(Buffer.from(redo.bytes).equals(Buffer.from(edited.bytes)),'Redo whole bytes');
 const states=history.retainedStates;history.commit(history.current);assert(history.retainedStates===states,'No-op duplicated history');
 for(const patch of [{units:'cm'},{coordinates:'right-handed-z-up'}]){let rejected=false;try{history.commit({...history.current,...patch} as any);}catch{rejected=true;}assert(rejected,'Invalid commit accepted');assert(serializeWorkspace(history.current)===serializeWorkspace(next),'Failed commit mutated source');}
 const session=serializeWorkspaceEditorSession(createWorkspaceEditorSession(history.current,'gear','spur_gear'));write('session.json',session);const loaded=parseWorkspaceEditorFile(readFileSync(resolve(out,'session.json'),'utf8'));assert(loaded.session.selectedId==='spur_gear'&&loaded.session.activeAssetId==='gear','Editing context');
 const reopened=await workspace('reopened',loaded.session.workspace);assert(Buffer.from(reopened.bytes).equals(Buffer.from(edited.bytes)),'Reopen whole bytes');
 const before=serializeWorkspace(history.current);for(const input of [{units:'cm'},{coordinates:'right-handed-z-up'}]){let rejected=false;try{registry.generate(gearPack.metadata.id,input,[]);}catch{rejected=true;}assert(rejected,'Conflicting provider input accepted');}
 let rejected=false;try{registry.generate(gearPack.metadata.id,{},['solid-brep']);}catch{rejected=true;}assert(rejected,'Unsupported capability accepted');assert(serializeWorkspace(history.current)===before,'Provider failure damaged workspace');
 registry.register({...gearPack,metadata:{...gearPack.metadata,id:'failure.probe'},generate:()=>{throw Error('Controlled provider failure');}});let failed=false;try{registry.generate('failure.probe',{},[]);}catch{failed=true;}assert(failed,'Failed provider accepted');assert(serializeWorkspace(history.current)===before,'Provider damaged workspace');const isolated=await workspace('after-provider-failure',history.current);assert(Buffer.from(isolated.bytes).equals(Buffer.from(edited.bytes)),'Failure altered unrelated export');
 rows.push({proof:'two registered domains, history whole-byte undo/redo/reopen, invalid commit atomic, unsupported units/coordinates/capability rejected',pass:true});
}else if(process.argv[3]==='uv'){
 function unpack(bytes:ArrayBuffer){const v=new DataView(bytes),n=v.getUint32(12,true);return {document:JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,n))),bin:new Uint8Array(bytes,20+n).slice()};}
 function pack(document:unknown,bin:Uint8Array){const text=new TextEncoder().encode(JSON.stringify(document)),n=Math.ceil(text.length/4)*4,bytes=new ArrayBuffer(20+n+bin.length),v=new DataView(bytes);v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,bytes.byteLength,true);v.setUint32(12,n,true);v.setUint32(16,0x4e4f534a,true);new Uint8Array(bytes,20,n).fill(32);new Uint8Array(bytes,20,text.length).set(text);new Uint8Array(bytes,20+n).set(bin);return bytes;}
 for(const damaged of [false,true]){
  const p=generateSpurGearProject({moduleMm:2,toothCount:40,pressureAngleDeg:25,faceWidthMm:12,boreDiameterMm:10}),b=exportSelectedScene(p,['spur_gear']),name=damaged?'damaged':'clean';write(name+'.source.json',serializeProject(p));
  try{
   if(damaged){const report=await inspectUvQuality(b.root,{includeTriangles:true}),uv=(b.root.getObjectByName('spur_gear') as Mesh).geometry.getAttribute('uv');for(const t of report.meshes[0].triangles!.filter(t=>t.connectedFeatureId==='spur_gear/tooth_0003'&&!t.legacyDegenerate).slice(0,12))for(let k=0;k<3;k++)uv.setXY(t.index*3+k,0,0);}
   const original=await new GLTFExporter().parseAsync(b.root,{binary:true}) as ArrayBuffer;await saveGlb(name+'-original',new Uint8Array(original));
   const {document,bin}=unpack(original),references:number[]=[],fingerprint=sha(new Uint8Array(original));document.nodes.find((n:any)=>n.name==='spur_gear').translation=[.002,0,0];
   document.nodes.forEach((n:any,i:number)=>{if(n.extras?.sourceSpec){n.extras.morphloomSourceSpecReference={schema:'morphloom.source-spec-reference/0.1',state:'before-edit-reference',sourceSha256:fingerprint,sourceSpec:n.extras.sourceSpec};delete n.extras.sourceSpec;references.push(i);}});
   document.asset.extras={morphloomBakedTransform:{schema:'morphloom.baked-transform/0.1',sourceSha256:fingerprint,node:'spur_gear',translationMm:[2,0,0],coordinates:'glTF right-handed Y-up world, millimeters',currentEditableIRAvailable:false,sourceSpecState:'before-edit-reference',referenceNodes:references}};
   const current=pack(document,bin);await saveGlb(name+'-translated',new Uint8Array(current));
   const originalFile=readFileSync(resolve(out,name+'-original.glb')),currentFile=readFileSync(resolve(out,name+'-translated.glb'));
   const receipt=await inspectBoundReferenceUv(originalFile.buffer.slice(originalFile.byteOffset,originalFile.byteOffset+originalFile.byteLength) as ArrayBuffer,currentFile.buffer.slice(currentFile.byteOffset,currentFile.byteOffset+currentFile.byteLength) as ArrayBuffer);write(name+'-receipt.json',JSON.stringify(receipt,null,2));
   assert(receipt.report.integrityPass===!damaged,'Per-feature UV gate');assert(receipt.currentEditableIRAvailable===false,'Reference promoted');
   if(damaged){const m=receipt.report.meshes[0];assert(m.degenerateUvTriangles/m.eligibleUvTriangles<=.05,'Must reproduce aggregate blind spot');assert(m.features.find(f=>f.id==='spur_gear/tooth_0003')?.integrityPass===false,'Damaged tooth hidden');}
  }finally{b.dispose();}
 }
}else if(process.argv[3]==='character'){
 const pack=await parseOhpk(new Uint8Array(readFileSync('public/assets/oxihuman-core-v1.ohpk')),async p=>new Uint8Array(inflateRawSync(p)));write('character-spec.json',JSON.stringify(FIELD_HUMAN_SPEC,null,2));
 async function character(name:string){const spec=JSON.parse(readFileSync(resolve(out,'character-spec.json'),'utf8')),b=buildCharacter(pack,spec,'beauty');
  try{const prep=preparePortableGltfGeometry(b.root);assert(prep.unresolvedNormalMappedMeshes.length===0,'Unresolved tangent input');const bytes=new Uint8Array(canonicalizeGlbBufferViews(await new GLTFExporter().parseAsync(createPortableGltfExportInput(b.root),{binary:true,onlyVisible:true,includeCustomExtensions:true,animations:b.root.animations}) as ArrayBuffer));await saveGlb(name,bytes);return bytes;}
  finally{const geometries=new Set<any>(),materials=new Set<any>();b.root.traverse((o:any)=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.add(m);});for(const g of geometries)g.dispose();const textures=new Set<any>();for(const m of materials){for(const v of Object.values(m) as any[])if(v?.isTexture&&!v.userData?.morphloomShared)textures.add(v);m.dispose();}for(const t of textures)t.dispose();b.root.clear();}
 }
 const original=await character('character'),reopen=await character('character-reopened');assert(Buffer.from(original).equals(Buffer.from(reopen)),'Character whole-byte regeneration');const audit=await auditRiggedGlbPayload(original,reopen);write('rigged-audit.json',JSON.stringify(audit,null,2));assert(audit.pass&&audit.skinnedMeshNodes>0&&audit.animationChannels>0,'Actual character rig/animation payload');
 rows.push({proof:'actual OHPK-derived character file regeneration and rigged payload, not anatomical or extreme-pose acceptance',pass:true});
}else throw Error('Unknown evidence mode');
writeFileSync(resolve(out,'report.json'),JSON.stringify({schema:'sceliph.extended-artifact-evidence/0.1',mode:process.argv[3],node:process.version,arch:process.arch,rendererRevision:ELEMENT_RENDERER_REVISION,browser:'not-run',blender:'not-run',rows},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output:out,pass:true}));
