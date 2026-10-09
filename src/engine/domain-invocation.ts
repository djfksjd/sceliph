import type {ElementDomainRegistry} from './element-domain-packs';
import {editPart,type PartMaterial} from './element-project';
export const DOMAIN_INVOCATION_SCHEMA='sceliph.domain-invocation/0.1';
export interface DomainInvocation{schema:typeof DOMAIN_INVOCATION_SCHEMA;units:'mm';coordinates:'right-handed-y-up';packId:string;input:Record<string,unknown>;requiredCapabilities:string[];materials?:Array<{componentId:string;material:PartMaterial}>}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
export function parseDomainInvocation(text:string):DomainInvocation{
 if(new TextEncoder().encode(text).byteLength>65536)throw Error('Domain invocation exceeds64KiB.');
 const v:unknown=JSON.parse(text);
 if(!record(v)||Object.keys(v).some(k=>!['schema','units','coordinates','packId','input','requiredCapabilities','materials'].includes(k))||v.schema!==DOMAIN_INVOCATION_SCHEMA||v.units!=='mm'||v.coordinates!=='right-handed-y-up'||typeof v.packId!=='string'||!v.packId.length||v.packId.length>128||!record(v.input)||!Array.isArray(v.requiredCapabilities)||v.requiredCapabilities.length>32||v.requiredCapabilities.some(x=>typeof x!=='string'||!x.length)||new Set(v.requiredCapabilities).size!==v.requiredCapabilities.length)throw Error('Unsupported invocation fields/version/frame.');
 if(v.materials!==undefined&&(!Array.isArray(v.materials)||v.materials.length>32||v.materials.some(m=>!record(m)||Object.keys(m).length!==2||typeof m.componentId!=='string'||!Object.hasOwn(m,'material'))||new Set(v.materials.map(m=>(m as {componentId:string}).componentId)).size!==v.materials.length))throw Error('Invalid material edit declarations.');
 return v as unknown as DomainInvocation;
}
/** Registered generators own math; IR edits keep the existing validation. No
 * arbitrary code, silent frame conversion or partial project is returned. */
export function executeDomainInvocation(registry:ElementDomainRegistry,text:string){
 const invocation=parseDomainInvocation(text);let project=registry.generate(invocation.packId,invocation.input,invocation.requiredCapabilities);
 for(const m of invocation.materials??[])project=editPart(project,m.componentId,{material:m.material});
 return {invocation,project};
}
