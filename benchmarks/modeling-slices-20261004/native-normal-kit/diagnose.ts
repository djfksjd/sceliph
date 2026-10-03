import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {generateBearingProject} from '../../src/engine/bearing-pack';
import {exportSelectedScene} from '../../src/engine/element-renderer';
import {parseProject,serializeProject} from '../../src/engine/element-project';
import {writeFileSync} from 'node:fs';
(globalThis as any).FileReader=class{result:unknown;onloadend?:()=>void;async readAsArrayBuffer(blob:Blob){this.result=await blob.arrayBuffer();this.onloadend?.();}};
const p=generateBearingProject({}),ids=p.parts.map(p=>p.id),q=parseProject(serializeProject({...p,selection:ids}));delete q.selection;
async function make(project:any){const b=exportSelectedScene(project,ids);try{return await new GLTFExporter().parseAsync(b.root,{binary:true}) as ArrayBuffer;}finally{b.dispose();}}
const a=await make(p),b=await make(q);writeFileSync('work/native-normal-kit-20261004/original.glb',new Uint8Array(a));writeFileSync('work/native-normal-kit-20261004/regenerated.glb',new Uint8Array(b));
function doc(a:ArrayBuffer){const n=new DataView(a).getUint32(12,true);return {n,d:JSON.parse(new TextDecoder().decode(new Uint8Array(a,20,n))),bin:new Uint8Array(a,28+n)}}
const x=doc(a),y=doc(b),diffs:any[]=[];
function diff(a:any,b:any,path:string){if(JSON.stringify(a)===JSON.stringify(b))return;if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[k],b[k],path+'.'+k)}else diffs.push({path,a,b})}
diff(x.d,y.d,'doc');console.log(JSON.stringify({a:a.byteLength,b:b.byteLength,jsonLengths:[x.n,y.n],semanticJsonDiffs:diffs,firstFullDifference:new Uint8Array(a).findIndex((v,i)=>v!==new Uint8Array(b)[i]),firstBinDifference:x.bin.findIndex((v,i)=>v!==y.bin[i])},null,2));
