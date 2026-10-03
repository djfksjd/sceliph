import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Mesh} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {compileAssemblyIR,validateAssemblyIR} from '../../src/engine/assembly-compiler';
import {applyAssemblyComponentPatch,fingerprintAssemblyIR} from '../../src/engine/assembly-edit';
import {migrateLatheNormalPolicy} from '../../src/engine/lathe-normal-policy';
import {chamferLatheCorner} from '../../src/engine/lathe-chamfer';
import {DELIVERY_PIPELINE_REVISION} from '../../src/engine/delivery-validation';
import {preparePortableGltfGeometry,createPortableGltfExportInput} from '../../src/engine/gltf-export-preparation';
import {canonicalizeGlbBufferViews} from '../../src/engine/glb-canonicalization';
import {validateGlbStandard} from '../../src/engine/gltf-standard-validation';
class Reader {result:any;onloadend:any;readAsArrayBuffer(b:Blob){void b.arrayBuffer().then(x=>{this.result=x;queueMicrotask(()=>this.onloadend?.())})}}
Object.assign(globalThis,{FileReader:Reader});
const out='/Users/danny/Documents/morphloom/outputs/lathe-profile-surface-normals-20261004';
const sha=(b:any)=>createHash('sha256').update(b instanceof ArrayBuffer?new Uint8Array(b):b).digest('hex');
function dispose(root:any){root.traverse((x:any)=>{if(x instanceof Mesh){x.geometry.dispose();for(const m of Array.isArray(x.material)?x.material:[x.material])m.dispose()}})}
async function glb(ir:any){const b=compileAssemblyIR(ir,'beauty');try{preparePortableGltfGeometry(b.root);const data=await new GLTFExporter().parseAsync(createPortableGltfExportInput(b.root),{binary:true,onlyVisible:true,includeCustomExtensions:true});if(!(data instanceof ArrayBuffer))throw Error('Nonbinary');return canonicalizeGlbBufferViews(data)}finally{dispose(b.root)}}
function buffers(root:any){const m=root.getObjectByName('preserved') as Mesh;return JSON.stringify({attributes:Object.fromEntries(Object.entries(m.geometry.attributes).map(([k,a])=>[k,{count:a.count,itemSize:a.itemSize,sha:sha(a.array)}])),index:m.geometry.index?sha(m.geometry.index.array):null,position:m.position.toArray(),quaternion:m.quaternion.toArray(),scale:m.scale.toArray(),parent:m.parent?.name,material:JSON.stringify(m.material.toJSON(),(k,v)=>k==='uuid'?undefined:v)})}
function chord(g:any,r:number){const p=g.getAttribute('position'),points=new Map<number,number[]>();for(let i=0;i<p.count;i++){const x=p.getX(i)*1000,z=p.getZ(i)*1000;if(Math.abs(Math.hypot(x,z)-r)<r*1e-5)points.set(Math.atan2(z,x),[x,z])}const ring=[...points].sort((a,b)=>a[0]-b[0]);return Math.max(...ring.map((a,i)=>{const b=ring[(i+1)%ring.length];return r-Math.hypot((a[1][0]+b[1][0])/2,(a[1][1]+b[1][1])/2)}))}
const rows=[];
for(const [id,drop] of [['small',1],['default',1],['large',1],['solid',1]] as const){

 const source=JSON.parse(readFileSync(`benchmarks/modeling-slices-20261004/lathe-segment-edit/${id}-after.json`,'utf8'));
 source.name='Authored profile-surface bushing '+id;
 const segments=source.components[0].geometry.segments,radius=Math.max(...source.components[0].geometry.profile.map((p:number[])=>p[0]));

 const result=await applyAssemblyComponentPatch(source,{schema:'morphloom.component-patch/0.2',operationId:'profile-normals-'+id,componentId:'bushing',expectedInputFingerprint:await fingerprintAssemblyIR(source),geometry:{operation:'lathe-normal-policy',action:'set',policy:{schema:'morphloom.lathe-normals/0.2',weighting:'profile-surfaces'}}});
 const serialized=JSON.stringify(result.ir,null,2);writeFileSync(`${out}/${id}-after.json`,serialized);writeFileSync(`${out}/${id}-before.json`,JSON.stringify(source,null,2));const reopened=JSON.parse(readFileSync(`${out}/${id}-after.json`,'utf8'));validateAssemblyIR(reopened);
 const a=compileAssemblyIR(source,'beauty'),b=compileAssemblyIR(reopened,'beauty');let measurement;
 try{const old=a.root.getObjectByName('bushing') as Mesh,next=b.root.getObjectByName('bushing') as Mesh;old.geometry.computeBoundingBox();next.geometry.computeBoundingBox();const preserved=buffers(a.root)===buffers(b.root),error=chord(next.geometry,radius);if(!preserved||error>.03||!b.metrics.topology.pass)throw Error('Geometry contract failed');measurement={beforeChordMm:chord(old.geometry,radius),afterChordMm:error,beforeVertices:old.geometry.getAttribute('position').count,afterVertices:next.geometry.getAttribute('position').count,preserved,topology:b.metrics.topology};}finally{dispose(a.root);dispose(b.root)}
 const files=[];for(const [label,ir] of [['before',source],['after',reopened]] as const){const bytes=await glb(ir),repeat=await glb(ir),validation=await validateGlbStandard(bytes);if(sha(bytes)!==sha(repeat)||validation.status!=='pass'||validation.independentRead.status!=='pass')throw Error('File contract failed');writeFileSync(`${out}/${id}-${label}.glb`,new Uint8Array(bytes));files.push({label,sha256:sha(bytes),repeatSha256:sha(repeat),bytes:bytes.byteLength,validation})}
 rows.push({id,segments,sourceJsonSha256:sha(serialized),measurement,receipt:result.receipt,files});
}
writeFileSync(out+'/size-axis-file-proof.json',JSON.stringify({compiler:DELIVERY_PIPELINE_REVISION,cases:rows},null,2));console.log(JSON.stringify(rows.map(({id,measurement})=>({id,...measurement})),null,2));
