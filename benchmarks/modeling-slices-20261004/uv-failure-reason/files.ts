import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inspectMeshExport} from '../../src/engine/mesh-export-policy';
const base='work/gear-projection-tile-20261004/',out='work/uv-failure-reason-20261004/';
const cases=[['default-before/morphloom-uv-diagnostic.glb','default-before/morphloom-source.json',false],['default-after/morphloom-project.glb','default-after/morphloom-source.json',true],['damaged-tooth.glb','default-after/morphloom-source.json',false]] as const;
const results=[];
for(const [glb,json,allowed] of cases){
 const file=readFileSync(base+glb),source=readFileSync(base+json,'utf8'),bytes=file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength) as ArrayBuffer;
 const diagnostic=await inspectMeshExport(bytes,source,'diagnostic');let error='';
 try{await inspectMeshExport(bytes,source,'editable-mesh');}catch(e){error=String(e);}
 if((error==='')!==allowed)throw new Error(`Unexpected decision ${glb}: ${error}`);
 const m=diagnostic.report.meshes.find(m=>m.id==='spur_gear')!;
 if(!allowed&&!error.includes('double-area <= 1e-10 or non-finite'))throw new Error('Missing precise threshold explanation');
 results.push({glb,sha256:createHash('sha256').update(file).digest('hex'),sourceSha256:createHash('sha256').update(source).digest('hex'),allowed,error,zeroUvTriangles:m.zeroUvTriangles,degenerateUvTriangles:m.degenerateUvTriangles,eligibleUvTriangles:m.eligibleUvTriangles,failedFeatures:m.features.filter(f=>!f.integrityPass).map(f=>f.id),standard:diagnostic.meshExport.standard});
}
writeFileSync(out+'file-results.json',JSON.stringify(results,null,2));console.log('Current actual-file inspection: default blocked, explicit edit allowed, damaged tooth blocked PASS');
