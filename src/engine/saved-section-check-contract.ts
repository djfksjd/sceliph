import type { EllipsoidSectionFitInput } from './ellipsoid-section-fit';
import type { SectionMeshBudget } from './ellipsoid-section-budget';
export const SECTION_CHECK_ENGINE='sceliph.section-mesh-budget-engine/0.1';
export interface SavedSectionCheck {componentId:string;primitiveId:string;geometryFingerprint:string;engine:string;fit:EllipsoidSectionFitInput;budget:SectionMeshBudget}
export interface SavedSectionChecks {schema:'sceliph.saved-section-checks/0.1';entries:SavedSectionCheck[]}
function exact(v:unknown,keys:string[]):Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))throw Error('Saved section checks require exact plain JSON fields.');return v as Record<string,unknown>;
}
export function validateSavedSectionChecks(value:unknown):asserts value is SavedSectionChecks{
 if(value===undefined)return;
 const v=exact(value,['schema','entries']);if(v.schema!=='sceliph.saved-section-checks/0.1'||!Array.isArray(v.entries)||v.entries.length<1||v.entries.length>4)throw Error('Saved section checks require version0.1 and1..4 entries.');
 const targets=new Set<string>();
 for(const item of v.entries){
  const e=exact(item,['componentId','primitiveId','geometryFingerprint','engine','fit','budget']);
  if(typeof e.componentId!=='string'||typeof e.primitiveId!=='string'||![e.componentId,e.primitiveId].every(s=>/^[a-zA-Z0-9_-]{1,80}$/.test(s))||typeof e.geometryFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(e.geometryFingerprint)||e.engine!==SECTION_CHECK_ENGINE)throw Error('Invalid saved section binding/engine.');
  if(targets.has(e.componentId))throw Error('Duplicate saved section component.');targets.add(e.componentId);
  const f=exact(e.fit,['schema','frame','units','evidence','pointsMm']),ev=exact(f.evidence,['status','sourceId']);
  if(f.schema!=='sceliph.ellipsoid-section-fit/0.1'||f.frame!=='primitive-local'||f.units!=='mm'||!['designed','measured','estimated'].includes(ev.status as string)||typeof ev.sourceId!=='string'||!ev.sourceId.trim()||ev.sourceId.length>128||!Array.isArray(f.pointsMm)||f.pointsMm.length<2||f.pointsMm.length>16||f.pointsMm.some(p=>!Array.isArray(p)||p.length!==3||p.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>100000)))throw Error('Invalid saved section fit declaration.');
  const b=exact(e.budget,['schema','toleranceMm','maximumResolution']);if(b.schema!=='sceliph.section-mesh-budget/0.1'||typeof b.toleranceMm!=='number'||!Number.isFinite(b.toleranceMm)||b.toleranceMm<.0001||b.toleranceMm>10||typeof b.maximumResolution!=='number'||!Number.isInteger(b.maximumResolution)||b.maximumResolution<8||b.maximumResolution>48)throw Error('Invalid saved section mesh budget.');
 }
}
