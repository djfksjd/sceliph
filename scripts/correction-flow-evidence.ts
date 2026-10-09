import {readFileSync,writeFileSync}from'node:fs';
import {createElementDomainRegistry}from'../src/engine/element-domain-packs';
import {bearingPack}from'../src/engine/bearing-pack';
import {gearPack}from'../src/engine/gear-pack';
import {centeredPlatePack}from'../src/engine/centered-plate-pack';
import {correctRequiredDeclaration}from'../src/engine/declaration-correction';
import {serializeProject}from'../src/engine/element-project';
const base='outputs/bounded-correction-20261008',contract=JSON.parse(readFileSync(base+'/contract.json','utf8')),registry=createElementDomainRegistry();for(const pack of[bearingPack,gearPack,centeredPlatePack])registry.register(pack);const rows:any[]=[];
for(const c of contract.cases){const prior=JSON.parse(readFileSync('outputs/novel-parameters-20261008/model-run/'+c.id+'.response.txt','utf8')),response=JSON.parse(readFileSync(base+'/model-run/'+c.id+'.response.txt','utf8')),requirements=JSON.stringify({schema:'sceliph.domain-requirements/0.1',packId:c.invocation.packId,units:'mm',coordinates:'right-handed-y-up',input:c.invocation.input});let calls=0;const result=await correctRequiredDeclaration(registry,prior,requirements,async feedback=>{calls++;writeFileSync(base+'/'+c.id+'.feedback.json',JSON.stringify(feedback,null,2)+'\n');return response;});if(calls!==1||result.attempts!==1)throw Error('Incorrect correction budget');const saved=readFileSync(base+'/artifacts/'+c.id+'.source.json','utf8');if(serializeProject(result.project)!==saved)throw Error('SDK source differs from actual file proof');rows.push({id:c.id,pass:true,callbackCalls:calls,attempts:result.attempts});}
writeFileSync(base+'/flow-report.json',JSON.stringify({pass:true,rows,inference:'Replays current recorded actual correction answers, no new inference',scope:'One correction + unchanged independent requirements + actual saved file binding'},null,2)+'\n');console.log(JSON.stringify({pass:true,cases:rows.length}));
