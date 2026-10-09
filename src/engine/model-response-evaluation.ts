import {Box3,DoubleSide,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import {parseProject} from './element-project';
import {exportSelectedScene,ELEMENT_RENDERER_REVISION} from './element-renderer';
import {analyzeTopology} from './topology';
import {validatePartGeometry,type PartGeometry} from './part-geometry';

export const MODEL_RESPONSE_EVALUATION_REVISION='sceliph.model-response-evaluation/0.2';
export interface ModelResponseTask{
 schema:'sceliph.model-response-task/0.1'|'sceliph.model-response-task/0.2';id:string;domain:string;request:string;
 maximumTriangles:number;parts:Array<{id:string;sizeMm:[number,number,number];toleranceMm:number;throughAxis?:'x'|'y'|'z';geometry?:PartGeometry}>;
}
function fields(value:unknown,required:string[],optional:string[]=[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw Error('Evaluation requires plain JSON objects.');
 const v=value as Record<string,unknown>;if(required.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>![...required,...optional].includes(k)))throw Error('Evaluation has missing/unknown fields.');return v;
}
export function parseModelResponseTask(text:string):ModelResponseTask{
 if(new TextEncoder().encode(text).byteLength>65536)throw Error('Task exceeds64KiB.');
 const v=fields(JSON.parse(text),['schema','id','domain','request','maximumTriangles','parts']);
 if(!['sceliph.model-response-task/0.1','sceliph.model-response-task/0.2'].includes(v.schema as string)||typeof v.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(v.id)||typeof v.domain!=='string'||v.domain.length<1||v.domain.length>128||typeof v.request!=='string'||v.request.length<1||v.request.length>8192)throw Error('Unsupported evaluation task.');
 if(!Number.isInteger(v.maximumTriangles)||(v.maximumTriangles as number)<1||(v.maximumTriangles as number)>100000)throw Error('Unsafe triangle budget.');
 if(!Array.isArray(v.parts)||v.parts.length<1||v.parts.length>32)throw Error('Requires1..32 critical parts.');
 const ids=new Set<string>();for(const raw of v.parts){const p=fields(raw,['id','sizeMm','toleranceMm',...(v.schema==='sceliph.model-response-task/0.2'?['geometry']:[])],['throughAxis']);
  if(typeof p.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(p.id)||ids.has(p.id))throw Error('Invalid/duplicate target ID.');ids.add(p.id);
  if(!Array.isArray(p.sizeMm)||p.sizeMm.length!==3||p.sizeMm.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<=0||n>100000)||typeof p.toleranceMm!=='number'||!Number.isFinite(p.toleranceMm)||p.toleranceMm<=0||p.toleranceMm>1)throw Error('Invalid local-mm dimensions/tolerance.');
  if(v.schema==='sceliph.model-response-task/0.2')validatePartGeometry(p.geometry,true,true);
  if(p.throughAxis!==undefined&&!['x','y','z'].includes(p.throughAxis as string))throw Error('Unsupported bore axis.');
 }
 return v as unknown as ModelResponseTask;
}
// Explicit migration: a request label cannot supply missing engineering requirements.
export function migrateModelResponseTask(task:ModelResponseTask,requirements:Record<string,PartGeometry>):ModelResponseTask{
 const old=parseModelResponseTask(JSON.stringify(task));
 if(old.schema!=='sceliph.model-response-task/0.1'||Object.keys(requirements).length!==old.parts.length||old.parts.some(p=>!Object.hasOwn(requirements,p.id)))throw Error('Migration requires explicit geometry for every critical part.');
 return parseModelResponseTask(JSON.stringify({...old,schema:'sceliph.model-response-task/0.2',parts:old.parts.map(p=>({...p,geometry:requirements[p.id]}))}));
}
const canonical=(value:unknown):string=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
/** Evaluates recorded declarations, never invokes a provider or trusts claimed
 * model/quality metadata. Critical parts fail individually, not by averaging.
 * This initial evaluator supports static native part projects only.
 */
export function evaluateModelResponse(task:ModelResponseTask,response:string){
 task=parseModelResponseTask(JSON.stringify(task));
 if(new TextEncoder().encode(response).byteLength>2000000)throw Error('Response exceeds2MB.');
 const project=parseProject(response);
 if(project.groups.length||project.elements.length)throw Error('Evaluation supports native parts only; generated groups are unsupported.');
 const built=exportSelectedScene(project,project.parts.map(p=>p.id)),checks:Array<{id:string;pass:boolean;detail:string}>=[];
 try{
  const topology=analyzeTopology(built.root);
  checks.push({id:'topology',pass:topology.pass&&topology.orientationConsistent===true,detail:JSON.stringify(topology)});
  checks.push({id:'triangle-budget',pass:built.stats.triangles<=task.maximumTriangles,detail:`${built.stats.triangles}/${task.maximumTriangles}`});
  for(const expected of task.parts){
   const mesh=built.root.getObjectByName(expected.id);
   if(!(mesh instanceof Mesh)){checks.push({id:expected.id,pass:false,detail:'Required critical part missing.'});continue;}
   if(expected.geometry){const actual=project.parts.find(p=>p.id===expected.id)?.geometry;checks.push({id:expected.id+':declared-geometry',pass:canonical(actual)===canonical(expected.geometry),detail:JSON.stringify({expected:expected.geometry,actual,scope:'Exact validated declaration; accompanied by actual mesh dimension/topology checks.'})});}
   mesh.geometry.computeBoundingBox();const bounds=mesh.geometry.boundingBox as Box3,size=bounds.getSize(new Vector3()).multiply(mesh.scale).multiplyScalar(1000).toArray().map(Math.abs);
   const errors=size.map((n,i)=>Math.abs(n-expected.sizeMm[i]));
   checks.push({id:expected.id+':dimensions',pass:errors.every(n=>Number.isFinite(n)&&n<=expected.toleranceMm),detail:JSON.stringify({frame:'component-local axes after part scale',units:'mm',size,errors,toleranceMm:expected.toleranceMm})});
   if(expected.throughAxis){
    const axis={x:0,y:1,z:2}[expected.throughAxis],origin=new Vector3(),direction=new Vector3();origin.setComponent(axis,bounds.max.getComponent(axis)+.01);direction.setComponent(axis,-1);
    const material=new MeshBasicMaterial({side:DoubleSide}),probe=new Mesh(mesh.geometry,material);probe.updateMatrixWorld(true);
    try{const hits=new Raycaster(origin,direction).intersectObject(probe,false);checks.push({id:expected.id+':through-bore',pass:hits.length===0,detail:`Local-axis center ray intersections:${hits.length}; not a CAD bore-tolerance proof.`});}finally{material.dispose();}
   }
  }
  return {schema:MODEL_RESPONSE_EVALUATION_REVISION,rendererRevision:ELEMENT_RENDERER_REVISION,taskId:task.id,domain:task.domain,pass:checks.every(c=>c.pass),checks,triangles:built.stats.triangles,modelRunVerified:false,eligibleForLLMQualityClaim:false};
 }finally{built.dispose();}
}
