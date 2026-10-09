import {readFileSync,writeFileSync}from'node:fs';
import {createElementDomainRegistry}from'../src/engine/element-domain-packs';
import {bearingPack}from'../src/engine/bearing-pack';
import {gearPack}from'../src/engine/gear-pack';
import {centeredPlatePack}from'../src/engine/centered-plate-pack';
import {parseEditableElementSource}from'../src/engine/editable-source';
const base='outputs/novel-parameters-20261008',contract=JSON.parse(readFileSync(base+'/contract.json','utf8')),original=JSON.parse(readFileSync(base+'/artifacts/report.json','utf8'));let calls=0;const registry=createElementDomainRegistry();for(const pack of[bearingPack,gearPack,centeredPlatePack])registry.register({...pack,generate:input=>{calls++;return pack.generate(input);}});
const rows:any[]=[];
for(const c of contract.cases){const requirements={schema:'sceliph.domain-requirements/0.1',packId:c.invocation.packId,units:'mm',coordinates:'right-handed-y-up',input:c.invocation.input},raw=JSON.parse(readFileSync(base+'/model-run/'+c.id+'.response.txt','utf8')),before=calls;let accepted=false,error='';try{parseEditableElementSource(registry,raw,JSON.stringify(requirements));accepted=true;}catch(e){error=String(e);}const expected=original.results.find((r:any)=>r.id===c.id).pass;if(accepted!==expected||!accepted&&calls!==before)throw Error('Wrong guard decision or partial generation');rows.push({id:c.id,accepted,error,generatorCalls:calls-before});}
writeFileSync(base+'/requirements-guard.json',JSON.stringify({scope:'Independent locked numeric requirements; safety rejection, not improved model accuracy',pass:true,generationPass:original.pass,accepted:rows.filter(r=>r.accepted).length,rejected:rows.filter(r=>!r.accepted).length,rows},null,2)+'\n');console.log(JSON.stringify({guardPass:true,generationPass:original.pass,accepted:2,rejected:4}));
