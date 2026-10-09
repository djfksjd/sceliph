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
import {executeDomainInvocation} from '../src/engine/domain-invocation';
import {generateSpurGearProject} from '../src/engine/gear-pack';
import {detachPart,restorePart,editPart,serializeProject,parseProject,migrateElementProjectToV6,type ElementProject} from '../src/engine/element-project';
import {prepareElementExportSource} from '../src/engine/element-export-source';
import {exportSelectedScene,ELEMENT_RENDERER_REVISION} from '../src/engine/element-renderer';
import {analyzeTopology} from '../src/engine/topology';
import {validateGlbStandard} from '../src/engine/gltf-standard-validation';
import {gearDimensions,gearProfile} from '../src/engine/spur-gear';
if(process.argv.length!==5)throw Error('Usage: vite-node scripts/domain-invocation-evidence.ts contract-directory model-run-directory new-output-directory');
const base=resolve(process.argv[2]),run=resolve(process.argv[3]),out=resolve(process.argv[4]);mkdirSync(out);const rows:any[]=[];
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

const contract=JSON.parse(readFileSync(resolve(base,'contract.json'),'utf8'));
const receipt=JSON.parse(readFileSync(resolve(run,'run.json'),'utf8'));
assert(receipt.networkCalls===0,'Runtime provenance');
if(contract.requiredStrategy==='sampled-constrained-choice-token'){assert(receipt.greedy===false,'Actual stochastic model execution required');for(const c of contract.cases){const entry=receipt.rows.find((r:any)=>r.id===c.id);assert(entry?.strategy===contract.requiredStrategy&&entry.choiceSeed===c.choiceSeed,'Sample seed/strategy binding');}}else assert(receipt.greedy===true,'Ranked runtime provenance');
const registry=createElementDomainRegistry();for(const pack of [bearingPack,gearPack,centeredPlatePack])registry.register(pack);
const results:any[]=[];
for(const c of contract.cases){
 try{
  const raw=readFileSync(resolve(run,c.id+'.response.txt'),'utf8');assert(receipt.rows.find((r:any)=>r.id===c.id)?.responseSha256===sha(new TextEncoder().encode(raw)),'Response provenance');
  // Ranking runner stores the candidate payload as JSON, including a string payload.
  const payload=JSON.parse(raw);assert(typeof payload==='string','Expected engine candidate string');
  const {invocation,project}=executeDomainInvocation(registry,payload);
  assert(JSON.stringify(invocation)===JSON.stringify(c.invocation),'Wrong critical dimensions/structure/material selection');
  const first=await save(c.id,project),back=await save(c.id+'-reopened',parseProject(readFileSync(resolve(out,c.id+'.source.json'),'utf8')));
  assert(Buffer.from(first.bytes).equals(Buffer.from(back.bytes)),'Exact GLB regeneration');
  const nodes=first.doc.getRoot().listNodes();
  const dimensions:any={};
  for(const part of project.parts){const p=nodes.find(n=>n.getName()===part.id)!.getMesh()!.listPrimitives()[0];const a=p.getAttribute('POSITION')!.getArray()!;const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<a.length;i+=3)for(let j=0;j<3;j++){lo[j]=Math.min(lo[j],a[i+j]*1000);hi[j]=Math.max(hi[j],a[i+j]*1000);}dimensions[part.id]={min:lo,max:hi};}
  const input=invocation.input as Record<string,number>;
  if(invocation.packId===centeredPlatePack.metadata.id){
   const d=dimensions.plate_body,expected=[input.widthMm,input.heightMm,input.thicknessMm];for(let a=0;a<3;a++)assert(Math.abs(d.max[a]-d.min[a]-expected[a])<=contract.limits.dimensionToleranceMm,'Plate actual dimension');
   assert(Math.abs(d.max[0]+d.min[0])<=.01&&Math.abs(d.max[1]+d.min[1])<=.01&&Math.abs(d.max[2]+d.min[2])<=.01,'Plate XYZ centering');
   const positions=nodes.find(n=>n.getName()==='plate_body')!.getMesh()!.listPrimitives()[0].getAttribute('POSITION')!.getArray()!;let minRadius=Infinity;for(let i=0;i<positions.length;i+=3)minRadius=Math.min(minRadius,Math.hypot(positions[i],positions[i+1])*1000);assert(Math.abs(minRadius*2-input.boreDiameterMm)<=.01,'Actual bore vertex diameter');
   const b=exportSelectedScene(project,['plate_body']);try{const m=b.root.getObjectByName('plate_body') as Mesh;b.root.updateMatrixWorld(true);assert(new Raycaster(new Vector3(0,0,1),new Vector3(0,0,-1)).intersectObject(m).length===0,'Plate actual through bore');
    const material=nodes.find(n=>n.getName()==='plate_body')!.getMesh()!.listPrimitives()[0].getMaterial()!,wanted=invocation.materials![0].material;
    assert(material.getRoughnessFactor()===wanted.roughness&&material.getMetallicFactor()===wanted.metalness,'Actual PBR scalar');
    const texture=material.getMetallicRoughnessTexture();if(wanted.surface){assert(!!texture,'Missing embedded surface');const image=await loadImage(Buffer.from(texture!.getImage()!)),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,image.width,image.height).data;assert(Buffer.from(pixels).equals(Buffer.from((m.material as any).roughnessMap.image.data)),'Embedded roughness pixels');const transform=material.getMetallicRoughnessTextureInfo()!.getExtension('KHR_texture_transform') as any;assert(JSON.stringify(transform?.getScale())===JSON.stringify(wanted.surface.repeat),'Surface UV repeat');}else assert(!texture,'Unrequested surface');
   }finally{b.dispose();}
  }else if(invocation.packId===gearPack.metadata.id){
   const g=project.parts[0].geometry!;assert(g.op==='spur-gear','Gear operation');if(g.op!=='spur-gear')throw Error('Gear');const profile=gearProfile(g);assert(profile.features.length===input.toothCount,'Tooth structure');assert(profile.maximumFlankChordErrorMm<=.005*input.moduleMm,'Chord tolerance');const d=dimensions.spur_gear;assert(Math.abs(d.max[2]-d.min[2]-input.faceWidthMm)<=.01,'Actual gear depth');
  }else{
   assert(project.parts.length===input.ballCount+3,'Bearing structure');assert(project.parts.some(p=>p.id==='cage')&&project.parts.some(p=>p.id==='inner_race')&&project.parts.some(p=>p.id==='outer_race'),'Races/cage');for(const p of project.parts.filter(p=>p.id.startsWith('ball_'))){const d=dimensions[p.id];for(let a=0;a<3;a++)assert(Math.abs(d.max[a]-d.min[a]-input.ballDiameterMm)<=.01,'Actual ball size');const pitch=(input.boreDiameterMm+input.outerDiameterMm)/4;assert(Math.abs(Math.hypot(p.position[0],p.position[2])-pitch)<=1e-6,'Ball pitch');}
  }
  results.push({id:c.id,pass:true,dimensions,wholeByteRegeneration:true});
 }catch(error){results.push({id:c.id,pass:false,error:String(error)});}
}
writeFileSync(resolve(out,'report.json'),JSON.stringify({schema:'sceliph.domain-invocation-evidence/0.1',pass:results.every(r=>r.pass),results,files:rows,contractSha:sha(readFileSync(resolve(base,'contract.json'))),modelRunSha:sha(readFileSync(resolve(run,'run.json'))),browser:'not-run',blender:'not-run',scope:'Model-ranked finite engine declarations; no general prompt, photoreal or manufacturing acceptance'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(results));if(results.some(r=>!r.pass))process.exitCode=1;
