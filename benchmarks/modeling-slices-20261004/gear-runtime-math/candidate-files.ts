import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {candidateExport} from './candidate-export';
(globalThis as any).FileReader=class{result:unknown;onloadend?:()=>void;async readAsArrayBuffer(b:Blob){this.result=await b.arrayBuffer();this.onloadend?.();}};
const cases=JSON.parse(readFileSync('work/gear-runtime-math-20261004/cases.json','utf8')),rows=[];
for(let i=0;i<cases.length;i++)for(const tooth of [false,true]){const {bytes,topology}=await candidateExport(cases[i],tooth),name=`candidate-node-${i}-${tooth?'tooth':'whole'}.glb`;writeFileSync('work/gear-runtime-math-20261004/'+name,bytes);rows.push({name,sha256:createHash('sha256').update(bytes).digest('hex'),topology});}
writeFileSync('work/gear-runtime-math-20261004/candidate-files-result.json',JSON.stringify(rows,null,2));console.log(rows.map(r=>({name:r.name,topologyPass:r.topology.pass})));
