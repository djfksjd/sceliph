import type {DeclarationCorrection}from'./declaration-correction';
import {parseDomainInvocation,executeDomainInvocation}from'./domain-invocation';
import {validateDomainPackInput,type ElementDomainRegistry}from'./element-domain-packs';
export const DOMAIN_REQUIREMENTS_SCHEMA='sceliph.domain-requirements/0.1';
export class DomainRequestMismatch extends Error{constructor(reason:string,readonly feedback?:DeclarationCorrection){super(reason);this.name='DomainRequestMismatch';}}
export interface DomainRequirements{schema:typeof DOMAIN_REQUIREMENTS_SCHEMA;packId:string;units:'mm';coordinates:'right-handed-y-up';input:Record<string,number>}
/** Requirements are supplied independently by the user, not inferred from the
 * candidate or copied out of it. This checks declared intent, not CAD accuracy. */
export function parseDomainRequirements(registry:ElementDomainRegistry,requirementsText:string):DomainRequirements{
 if(new TextEncoder().encode(requirementsText).byteLength>65536)throw Error('Requirements exceed64KiB');
 const r:unknown=JSON.parse(requirementsText);
 if(!r||typeof r!=='object'||Array.isArray(r))throw Error('Invalid requirements record');
 const v=r as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['schema','packId','units','coordinates','input'].includes(k))||v.schema!==DOMAIN_REQUIREMENTS_SCHEMA||v.units!=='mm'||v.coordinates!=='right-handed-y-up'||typeof v.packId!=='string'||!v.input||typeof v.input!=='object'||Array.isArray(v.input)||Object.keys(v.input).length<1||Object.keys(v.input).length>32||Object.values(v.input).some(x=>typeof x!=='number'||!Number.isFinite(x)))throw Error('Invalid requirements fields/version/frame');
 const requirements=v as unknown as DomainRequirements,meta=registry.list().find(p=>p.id===requirements.packId);if(!meta)throw Error('Requirements reference an unregistered pack');
 validateDomainPackInput(requirements.input,meta);
 return requirements;
}
export function executeRequiredDomainInvocation(registry:ElementDomainRegistry,text:string,requirementsText:string){
 const requirements=parseDomainRequirements(registry,requirementsText);
 const invocation=parseDomainInvocation(text);
 const mismatch=(reason:string):never=>{throw new DomainRequestMismatch(reason,{schema:'sceliph.declaration-correction/0.1',declaration:text,requirements:requirementsText,reason,maximumAttempts:1});};
 if(invocation.packId!==requirements.packId)mismatch('Requested Domain Pack does not match declaration');
 for(const [key,value]of Object.entries(requirements.input))if(!Object.hasOwn(invocation.input,key)||invocation.input[key]!==value)mismatch('Request mismatch: '+key+' must be '+value);
 return executeDomainInvocation(registry,text);
}
