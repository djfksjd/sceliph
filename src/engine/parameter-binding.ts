import {parseDomainInvocation}from'./domain-invocation';
import {parseDomainRequirements,executeRequiredDomainInvocation}from'./domain-requirements';
import {validateDomainPackInput,type ElementDomainRegistry}from'./element-domain-packs';
export const PARAMETER_BINDING_REVISION='sceliph.parameter-binding/0.1';
export async function declarationTextSha256(text:string):Promise<string>{
 const bytes=new TextEncoder().encode(text);if(bytes.length>65536)throw Error('Declaration or requirements exceed64KiB');
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
/** Explicit user operation. Original text stays intact; only independently
 * required numeric fields are bound. It does not edit saved native IR or fix
 * an unsupported pack/frame/capability/material. */
export async function bindRequiredParameters(registry:ElementDomainRegistry,text:string,requirementsText:string,expected:{declarationSha256:string;requirementsSha256:string}){
 const captured={...expected};if(![captured.declarationSha256,captured.requirementsSha256].every(s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s)))throw Error('Invalid binding fingerprints');
 const [declarationSha256,requirementsSha256]=await Promise.all([declarationTextSha256(text),declarationTextSha256(requirementsText)]);
 if(captured.declarationSha256!==declarationSha256||captured.requirementsSha256!==requirementsSha256)throw Error('Stale declaration/requirements fingerprint');
 const d=parseDomainInvocation(text),r=parseDomainRequirements(registry,requirementsText);
 if(d.packId!==r.packId)throw Error('Binding cannot change the Domain Pack');
 const meta=registry.list().find(p=>p.id===d.packId)!;validateDomainPackInput(d.input,meta);
 const changes=Object.entries(r.input).filter(([key,value])=>!Object.hasOwn(d.input,key)||d.input[key]!==value).map(([key,value])=>({key,before:Object.hasOwn(d.input,key)?d.input[key]:null,after:value}));
 const declaration=JSON.stringify({...d,input:{...d.input,...r.input}},null,2)+'\n';
 const result=executeRequiredDomainInvocation(registry,declaration,requirementsText);
 return {declaration,project:result.project,receipt:{schema:PARAMETER_BINDING_REVISION,declarationSha256,requirementsSha256,outputSha256:await declarationTextSha256(declaration),changes,scope:'User-required numeric binding; not model inference accuracy or production approval'}};
}
