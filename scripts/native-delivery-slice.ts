import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Canvas,ImageData,createCanvas,loadImage} from '@napi-rs/canvas';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {Mesh,Raycaster,Vector3} from 'three';
import {WebIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {generateBearingProject} from '../src/engine/bearing-pack';
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
for(const scale of [.5,1,2]){
 const p=generateBearingProject({boreDiameterMm:20*scale,outerDiameterMm:40*scale,widthMm:12*scale,ballDiameterMm:6*scale}),id='ball_0000';
 const base=await save('bearing-'+scale,p),detached=detachPart(p,id,[30,0,0]),split=await save('bearing-'+scale+'-detached',detached),restored=restorePart(parseProject(serializeProject(detached)),id),back=await save('bearing-'+scale+'-restored',restored);
 assert(Buffer.from(base.bytes).equals(Buffer.from(back.bytes)),'Restore whole-byte identity');
 for(const part of p.parts.filter(x=>x.id!==id))assert(JSON.stringify(snapshot(base.doc,part.id))===JSON.stringify(snapshot(split.doc,part.id)),'Non-target detach buffers/transform/hierarchy');
 const material=(doc:any,id:string)=>{const n=doc.getRoot().listNodes().find((n:any)=>n.getName()===id),m=n.getMesh().listPrimitives()[0].getMaterial();return [m.getBaseColorFactor(),m.getRoughnessFactor(),m.getMetallicFactor()];};
 for(const part of p.parts)assert(JSON.stringify(material(base.doc,part.id))===JSON.stringify(material(split.doc,part.id)),'Material changed on detach');
 const ball=p.parts.find(x=>x.id===id)!,isolated={...structuredClone(p),parts:[{...structuredClone(ball),assemblyId:undefined}],assemblies:[],regions:[],groups:[],elements:[]};delete isolated.parts[0].assemblyId;
 const independent=await save('ball-'+scale,isolated,[id]),reload=parseProject(serializeProject(isolated));assert(reload.parts[0].id===id,'Stable extracted ID');
 const moved=editPart(reload,id,{position:[ball.position[0]+1,ball.position[1],ball.position[2]]}),edited=await save('ball-'+scale+'-edited',moved,[id]);assert(JSON.stringify(snapshot(independent.doc,id).primitives)===JSON.stringify(snapshot(edited.doc,id).primitives),'Ball translate must preserve actual geometry/UV/index');
 const shift=snapshot(edited.doc,id).translation[0]-snapshot(independent.doc,id).translation[0];assert(Math.abs(shift-.001)<1e-6,'World mm translation');
 const full=exportSelectedScene(p,p.parts.map(x=>x.id));try{full.root.updateMatrixWorld(true);for(const race of ['inner_race','outer_race'])assert(new Raycaster(new Vector3(0,1,0),new Vector3(0,-1,0)).intersectObject(full.root.getObjectByName(race)!,true).length===0,'Actual bearing through bore');}finally{full.dispose();}
}
for(const [name,input] of [['small',{moduleMm:.2,toothCount:18,pressureAngleDeg:20,faceWidthMm:2,boreDiameterMm:1}],['default',{}],['large',{moduleMm:2,toothCount:40,pressureAngleDeg:25,faceWidthMm:12,boreDiameterMm:10}]] as const){
 const p=migrateElementProjectToV6(generateSpurGearProject(input)),g=p.parts[0].geometry!;if(g.op!=='spur-gear')throw Error('Gear expected');const dimensions=gearDimensions(g),profile=gearProfile(g);assert(profile.features.length===g.toothCount,'Feature count');assert(profile.maximumFlankChordErrorMm<=.005*g.moduleMm,'Existing flank chord tolerance');
 const base=await save('gear-'+name,p),surface=editPart(p,p.parts[0].id,{material:{...p.parts[0].material!,surface:{finish:'brushed-metal',channels:'roughness-only',repeat:[8,8]}}}),after=await save('gear-'+name+'-surface',surface),reopen=await save('gear-'+name+'-reopened',parseProject(serializeProject(surface)));
 assert(Buffer.from(after.bytes).equals(Buffer.from(reopen.bytes)),'Textured whole-byte regeneration');assert(JSON.stringify(snapshot(base.doc,'spur_gear'))===JSON.stringify(snapshot(after.doc,'spur_gear')),'Surface geometry/normals/UV/index/transform preservation');
 const primitive=after.doc.getRoot().listNodes().find(n=>n.getName()==='spur_gear')!.getMesh()!.listPrimitives()[0],pos=primitive.getAttribute('POSITION')!,values=pos.getArray()!;let maximum=0,minimum=Infinity,minZ=Infinity,maxZ=-Infinity;
 for(let i=0;i<values.length;i+=3){const r=Math.hypot(values[i],values[i+1])*1000;maximum=Math.max(maximum,r);minimum=Math.min(minimum,r);minZ=Math.min(minZ,values[i+2]*1000);maxZ=Math.max(maxZ,values[i+2]*1000);}
 assert(Math.abs(maximum*2-dimensions.addendumDiameterMm)<=.01,'Actual gear outside diameter');assert(Math.abs(minimum*2-g.boreDiameterMm)<=.01,'Actual gear bore diameter');assert(Math.abs(maxZ-minZ-g.faceWidthMm)<=.01,'Actual gear face width');
 const scene=exportSelectedScene(surface,['spur_gear']);try{
  const m=(scene.root.getObjectByName('spur_gear') as Mesh).material as any,texture=primitive.getMaterial()!.getMetallicRoughnessTexture()!,image=await loadImage(Buffer.from(texture.getImage()!)),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,image.width,image.height).data;
  assert(Buffer.from(pixels).equals(Buffer.from(m.roughnessMap.image.data)),'Embedded roughness RGBA bytes');
  const info=primitive.getMaterial()!.getMetallicRoughnessTextureInfo()!,transform=info.getExtension('KHR_texture_transform') as any;assert(!!transform&&JSON.stringify(transform.getScale())==='[8,8]','Physical tiling transform preserved');
  rows.push({name:'gear-'+name+'-dimensions-surface-proof',dimensions,maximumFlankChordErrorMm:profile.maximumFlankChordErrorMm,embeddedRgbaSha:sha(pixels),repeat:[8,8],scope:'Explicit authored UV repeat, not measured physical roughness'});
 }finally{scene.dispose();}
}
writeFileSync(resolve(out,'report.json'),JSON.stringify({schema:'sceliph.native-delivery-slice/0.1',rendererRevision:ELEMENT_RENDERER_REVISION,node:process.version,arch:process.arch,scope:'Conceptual mechanical visualization; no manufacturer/load/CAD approval',browser:'not-run',blender:'not-run',rows},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output:out,files:rows.filter(r=>r.glbSha).length,pass:true}));
