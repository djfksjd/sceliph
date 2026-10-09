import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {BufferGeometry,BufferAttribute,Mesh} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {WebIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {validateBytes} from 'gltf-validator';
import {compileAssemblyIR,validateAssemblyIR} from '../src/engine/assembly-compiler';
import {applyAssemblyComponentPatch,fingerprintAssemblyIR} from '../src/engine/assembly-edit';
import {latheSegmentEditBlocker} from '../src/engine/lathe-segment-edit';
import {fitLatheSurfaceBudget,measureLatheCircumference,measureLatheSurfaceError} from '../src/engine/lathe-surface-budget';
// Explicit local opt-in utility. Does not expose an unverified browser tool.
if(process.argv.length!==6)throw Error('Usage: npx vite-node scripts/fit-lathe-surface.ts <assembly.json> <component-id> <tolerance-mm> <new-output-directory>');
const [input,id,toleranceText,directory]=process.argv.slice(2),inputBytes=readFileSync(input),ir=JSON.parse(inputBytes.toString());
validateAssemblyIR(ir);
const target=ir.components.find(c=>c.id===id);if(!target)throw Error('Unknown component ID.');
const blocker=latheSegmentEditBlocker(ir,target);if(blocker)throw Error(blocker);
if(target.geometry.op!=='lathe')throw Error('Expected lathe.');
const toleranceMm=Number(toleranceText),fit=fitLatheSurfaceBudget(target.geometry,toleranceMm);
const next=(fit.geometry.segments??64)===(target.geometry.segments??64)?structuredClone(ir):(await applyAssemblyComponentPatch(ir,{schema:'morphloom.component-patch/0.2',operationId:'circumference-fit',componentId:id,expectedInputFingerprint:await fingerprintAssemblyIR(ir),geometry:{operation:'lathe-segments',schema:'morphloom.lathe-segments/0.1',segments:fit.geometry.segments!}})).ir;
const sourceBytes=Buffer.from(JSON.stringify(next,null,2)+'\n'),reopened=JSON.parse(sourceBytes.toString());validateAssemblyIR(reopened);
const descriptor=Object.getOwnPropertyDescriptor(globalThis,'FileReader');
class NodeReader{result:ArrayBuffer|null=null;onloadend?:()=>void;onerror?:(e:unknown)=>void;readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();},e=>this.onerror?.(e));}}
Object.defineProperty(globalThis,'FileReader',{value:NodeReader,configurable:true});
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const files:Array<{name:string;bytes:Uint8Array}>=[],reports=[];
let preservedSignature:string|undefined;
let originalBounds:string|undefined;
try{
 for(const [name,source] of [['before',ir],['after',next],['reopened',reopened]] as const){
  const built=compileAssemblyIR(source,'beauty');
  try{
   if(!built.metrics.topology.pass)throw Error('Existing topology gate failed.');
   const bytes=new Uint8Array(await new GLTFExporter().parseAsync(built.root,{binary:true}) as ArrayBuffer);
   const validation=await validateBytes(bytes);if(validation.issues.numErrors||validation.issues.numWarnings)throw Error('GLB validation failed.');
   const doc=await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(bytes),node=doc.getRoot().listNodes().find(n=>n.getName()===id),primitive=node?.getMesh()?.listPrimitives()[0];
   const jsonLength=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(12,true),json=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+jsonLength)));
   const preservation=JSON.stringify({materials:json.materials,nodes:doc.getRoot().listNodes().map(n=>({name:n.getName(),translation:n.getTranslation(),rotation:n.getRotation(),scale:n.getScale(),children:n.listChildren().map(c=>c.getName()),primitives:n.getName()===id?undefined:n.getMesh()?.listPrimitives().map(p=>({attributes:Object.fromEntries(p.listSemantics().map(s=>[s,Array.from(p.getAttribute(s)!.getArray()!)])),indices:p.getIndices()?Array.from(p.getIndices()!.getArray()!):null,material:doc.getRoot().listMaterials().indexOf(p.getMaterial()!)}))}))});
   if(preservedSignature!==undefined&&preservedSignature!==preservation)throw Error('Non-target buffers/materials or hierarchy/transform preservation failed.');
   preservedSignature=preservation;
   if(!primitive)throw Error('Missing target primitive on independent reopen.');
   if(node!.getMesh()!.listPrimitives().length!==1)throw Error('Expected one native lathe primitive.');
   const p=primitive.getAttribute('POSITION')?.getArray();if(!p)throw Error('Missing positions.');
   const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(new Float32Array(p),3));const index=primitive.getIndices()?.getArray();if(index)geometry.setIndex(new BufferAttribute(new Uint32Array(index),1));
   let measurement;try{const g=source.components.find(c=>c.id===id)!.geometry;if(g.op!=='lathe')throw Error();measurement=measureLatheCircumference(g,geometry);geometry.computeBoundingBox();const bounds=JSON.stringify(geometry.boundingBox);if(originalBounds!==undefined&&bounds!==originalBounds)throw Error('Target bounds preservation failed.');originalBounds=bounds;}finally{geometry.dispose();}
   if(name!=='before'&&measurement.maximumDeviationMm>toleranceMm)throw Error('Exported circumference exceeds tolerance.');
   files.push({name:name+'.glb',bytes});reports.push({name,sha256:hash(bytes),bytes:bytes.length,measurement,khronos:{errors:validation.issues.numErrors,warnings:validation.issues.numWarnings}});
  }finally{built.root.traverse(o=>{if(o instanceof Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});}
 }
 if(hash(files[1].bytes)!==hash(files[2].bytes))throw Error('Strict whole-byte reopen determinism failed.');
 const out=resolve(directory);mkdirSync(out); // Never replace existing evidence.
 for(const file of files)writeFileSync(resolve(out,file.name),file.bytes,{flag:'wx'});
 writeFileSync(resolve(out,'sourceJSON.json'),sourceBytes,{flag:'wx'});
 writeFileSync(resolve(out,'report.json'),JSON.stringify({schema:'sceliph.lathe-circumference-evidence/0.1',node:process.version,platform:process.platform,arch:process.arch,inputSha256:hash(inputBytes),sourceSha256:hash(sourceBytes),componentId:id,toleranceMm,before:measureLatheSurfaceError(target.geometry),fitted:fit,reports,strictReopenBytes:true,boundsPreserved:true,nonTargetBuffersMaterialsHierarchyPreserved:true,browser:'not-run',blender:'not-run'},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({output:out,segments:fit.geometry.segments,maximumDeviationMm:fit.measurement.maximumDeviationMm,strictReopenBytes:true}));
}finally{if(descriptor)Object.defineProperty(globalThis,'FileReader',descriptor);else Reflect.deleteProperty(globalThis,'FileReader');}
