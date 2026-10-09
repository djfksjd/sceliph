import {executeRequiredDomainInvocation} from './domain-requirements';
import type {ElementDomainRegistry} from './element-domain-packs';
import {DOMAIN_INVOCATION_SCHEMA,executeDomainInvocation} from './domain-invocation';
import {parseProject,serializeProject,type ElementProject} from './element-project';

/** Editor entry point: native source stays native; a versioned, registered
 * declaration is evaluated once and becomes saved editable source, never code. */
export function parseEditableElementSource(registry:ElementDomainRegistry,text:string,requirementsText?:string):ElementProject {
  if(new TextEncoder().encode(text).byteLength>2_000_000)throw Error('Source exceeds 2 MB');
  const header:unknown=JSON.parse(text);
  if(header&&typeof header==='object'&&!Array.isArray(header)&&'schema' in header&&header.schema===DOMAIN_INVOCATION_SCHEMA){
    const {project}=requirementsText?.trim()?executeRequiredDomainInvocation(registry,text,requirementsText):executeDomainInvocation(registry,text);
    return parseProject(serializeProject(project));
  }
  if(requirementsText?.trim())throw Error('Requirements apply to a new Domain declaration only. Clear them to load saved native source.');
  return parseProject(text);
}
