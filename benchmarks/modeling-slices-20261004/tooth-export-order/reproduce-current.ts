import {prepareDiagnosticToothExportSource} from '../../src/engine/element-export-source';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {generateSpurGearProject} from '../../src/engine/gear-pack';
import {parseProject,serializeProject,type ElementProject} from '../../src/engine/element-project';
import {exportSelectedScene} from '../../src/engine/element-renderer';
import {extractToothGeometry} from '../../src/engine/spur-gear';
(globalThis as any).FileReader=class{result:unknown;onloadend?:()=>void;async readAsArrayBuffer(b:Blob){this.result=await b.arrayBuffer();this.onloadend?.();}};
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
async function cut(project:ElementProject){
 const copy=prepareDiagnosticToothExportSource(project,'spur_gear','tooth_0003'),part=copy.parts[0],id='tooth_0003';
 const built=exportSelectedScene(copy,[part.id]);const mesh=built.root.getObjectByName(part.id)!;mesh.name=`${part.id}/${id}`;mesh.userData={...mesh.userData,connectedSourceFeatureId:`${part.id}/${id}`,extraction:'diagnostic-sector-cut',detachable:false};
 try{return new Uint8Array(await new GLTFExporter().parseAsync(built.root,{binary:true}) as ArrayBuffer);}finally{built.dispose();}
}
const p=generateSpurGearProject({boreDiameterMm:4}),saved=serializeProject(p),first=await cut(p),second=await cut(parseProject(saved));
const bin=(v:Uint8Array)=>v.subarray(28+new DataView(v.buffer).getUint32(12,true));
const result={wholeByteExact:sha(first)===sha(second),BINExact:sha(bin(first))===sha(bin(second)),firstSHA256:sha(first),reopenedSHA256:sha(second),originalIRUnchanged:serializeProject(p)===saved,scope:'Current exportTooth preparation reproduction; diagnostic connected sector, not independently detachable assembly'};
writeFileSync('work/tooth-export-order-20261004/current-first.glb',first);writeFileSync('work/tooth-export-order-20261004/current-reopened.glb',second);writeFileSync('work/tooth-export-order-20261004/current-result.json',JSON.stringify(result,null,2));console.log(result);
