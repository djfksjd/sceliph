import {strToU8,zipSync} from 'fflate';
import type {AssemblyIR} from './assembly-ir';
import {validateAssemblyIR} from './assembly-compiler';
import {fingerprintAssemblyIR} from './assembly-edit';
import {canonicalizeGlbBufferViews} from './glb-canonicalization';
import {validateGlbStandard} from './gltf-standard-validation';
import {DELIVERY_PIPELINE_REVISION} from './delivery-validation';

interface Accessor {componentType:number;type:string;count:number}
interface Primitive {mode?:number;targets?:unknown[];attributes:Record<string,number>;indices?:number}
interface Document {
 images?:unknown[];textures?:unknown[];skins?:unknown[];animations?:unknown[];extensionsRequired?:unknown[];
 buffers?:Array<{uri?:string}>;
 nodes?:Array<{skin?:number;extensions?:unknown;extras?:{assemblyIR?:AssemblyIR}}>;
 meshes?:Array<{name?:string;primitives:Primitive[]}>;accessors:Accessor[];
}
/** Mirrors the existing native import profile, never a declaration of native execution. */
export function assertBlenderNormalKitSource(doc:Document):void {
 if(doc.images?.length||doc.textures?.length)throw new Error('Blender normal kit: texture sources are unsupported.');
 if(doc.skins?.length||doc.animations?.length||doc.extensionsRequired?.length)throw new Error('Blender normal kit: rig, animation and required extensions are unsupported.');
 if(doc.buffers?.some(b=>b.uri)||doc.nodes?.some(n=>n.skin!==undefined||n.extensions))throw new Error('Blender normal kit: external URI, skin and extended nodes are unsupported.');
 if(!doc.meshes?.length||doc.meshes.length>128||(doc.nodes?.length??0)>10000)throw new Error('Blender normal kit scene budget exceeded.');
 const names=new Set<string>();let vertices=0,corners=0;
 for(const [i,mesh] of doc.meshes.entries()){
  let meshCorners=0;
  const name=mesh.name||'Mesh_'+i;if(names.has(name))throw new Error('Blender normal kit: duplicate mesh name.');names.add(name);
  for(const primitive of mesh.primitives){
   if(primitive.mode!==undefined&&primitive.mode!==4||primitive.targets?.length)throw new Error('Blender normal kit requires static triangles.');
   const p=doc.accessors[primitive.attributes.POSITION],n=doc.accessors[primitive.attributes.NORMAL];
   if(!p||!n||[p,n].some(a=>a.componentType!==5126||a.type!=='VEC3'))throw new Error('Blender normal kit requires explicit Float32 POSITION/NORMAL.');
   if(!Number.isInteger(p.count)||p.count!==n.count||p.count<1||p.count>200000)throw new Error('Blender normal kit accessor budget exceeded.');
   const count=primitive.indices===undefined?p.count:doc.accessors[primitive.indices]?.count;
   if(!Number.isInteger(count)||count<3||count>200000||count%3!==0)throw new Error('Blender normal kit triangle corner budget exceeded.');
   meshCorners+=count;
   if(meshCorners>200000)throw new Error('Blender normal kit mesh combined corner budget exceeded.');
   vertices+=p.count;corners+=count;
  }
 }
 if(vertices>2000000||corners>2000000)throw new Error('Blender normal kit total geometry budget exceeded.');
}
const sha=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer))).map(v=>v.toString(16).padStart(2,'0')).join('');
export async function buildBlenderNormalKit(input:ArrayBuffer,source:AssemblyIR,scripts:{wrapper:string;helper:string;license:string}):Promise<Uint8Array>{
 if(input.byteLength>100*1024*1024)throw new Error('Blender normal kit exceeds 100MiB budget.');
 // Reuse the strict framing/buffer parser. No canonicalized bytes replace this source.
 canonicalizeGlbBufferViews(input);
 const view=new DataView(input),doc=JSON.parse(new TextDecoder().decode(new Uint8Array(input,20,view.getUint32(12,true)))) as Document;
 assertBlenderNormalKitSource(doc);validateAssemblyIR(source);
 const savedSource=JSON.parse(JSON.stringify(source)) as AssemblyIR;
 const references=(doc.nodes??[]).flatMap(n=>n.extras?.assemblyIR?[n.extras.assemblyIR]:[]);
 if(references.length!==1)throw new Error('Blender normal kit requires one current AssemblyIR reference.');
 validateAssemblyIR(references[0]);
 if(await fingerprintAssemblyIR(references[0])!==await fingerprintAssemblyIR(savedSource))throw new Error('Blender normal kit IR does not match the current GLB reference.');
 const validation=await validateGlbStandard(input);
 if(validation.status!=='pass'||validation.independentRead.status!=='pass')throw new Error('Blender normal kit GLB validation failed.');
 const files:Record<string,Uint8Array>={
  'model.glb':new Uint8Array(input),'source.json':strToU8(JSON.stringify(savedSource,null,2)),
  'tools/blender-source-normal-import.py':strToU8(scripts.wrapper),'tools/blender_source_normal_import.py':strToU8(scripts.helper),'LICENSE':strToU8(scripts.license),
  'README.txt':strToU8('SCELIPH — optional Blender 5.2 Float32 source normal import\n\nExtract this kit and run from its directory:\nblender --background --threads 1 --python-exit-code 1 --python tools/blender-source-normal-import.py -- model.glb output.blend receipt.json\n\nThe command refuses existing outputs and unsupported Blender versions. Execution is explicit; this ZIP does not run code automatically.\nsource.json is editable in Sceliph. Imported source references are before-edit references, not reconstructed editable IR. Further Blender mesh edits do not update source.json. Native import has not been executed by this browser download. Texture, rig, animation and morph sources are unsupported. The normal tolerance remains 0.01 degree.\n'),
 };
 if(Object.values(files).reduce((n,b)=>n+b.byteLength,0)>100*1024*1024)throw new Error('Blender normal kit combined budget exceeded.');
 const hashes=Object.fromEntries(await Promise.all(Object.entries(files).map(async([name,data])=>[name,await sha(data)])));
 files['manifest.json']=strToU8(JSON.stringify({schema:'sceliph.blender-normal-kit/0.1',compilerRevision:DELIVERY_PIPELINE_REVISION,blenderVersion:'5.2',policy:'morphloom.blender-source-normal-import/0.1',nativeImportVerified:false,sourceReferenceState:'before-edit-reference',sourceFingerprintRepresentation:'source-json/0.1',sha256:hashes},null,2));
 const zipped=zipSync(Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,[bytes,{mtime:new Date(1980,0,1)}]])),{level:6});
 if(zipped.byteLength>100*1024*1024)throw new Error('Blender normal kit ZIP budget exceeded.');
 return zipped;
}
