import {executeRequiredDomainInvocation,DomainRequestMismatch} from './domain-requirements';
import type {ElementDomainRegistry}from'./element-domain-packs';
export interface DeclarationCorrection {schema:'sceliph.declaration-correction/0.1';declaration:string;requirements:string;reason:string;maximumAttempts:1}
/** Optional caller-owned inference, bounded to one correction. No native source
 * is mutated; the same independent requirements must pass before publication. */
export async function correctRequiredDeclaration(registry:ElementDomainRegistry,declaration:string,requirements:string,propose:(feedback:DeclarationCorrection)=>Promise<string>,active:()=>boolean=()=>true){
 if(!active())throw Error('Correction cancelled');
 try{const result=executeRequiredDomainInvocation(registry,declaration,requirements);if(!active())throw Error('Correction cancelled');return {attempts:0,...result};}
 catch(error){
  if(!(error instanceof DomainRequestMismatch))throw error;
  const feedback:DeclarationCorrection={schema:'sceliph.declaration-correction/0.1',declaration,requirements,reason:error.message,maximumAttempts:1};
  if(!active())throw Error('Correction cancelled');
  const corrected=await propose(feedback);if(!active())throw Error('Correction cancelled');
  const result=executeRequiredDomainInvocation(registry,corrected,requirements);if(!active())throw Error('Correction cancelled');return {attempts:1,...result};
 }
}
