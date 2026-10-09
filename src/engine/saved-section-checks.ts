import type { AssemblyIR } from './assembly-ir';
import type { EllipsoidSectionFitInput } from './ellipsoid-section-fit';
import type { SectionMeshBudget } from './ellipsoid-section-budget';
import { measureEllipsoidSectionMesh } from './ellipsoid-section-budget';
import { validateAssemblyIR } from './assembly-compiler';
import { fingerprintAssemblySectionGeometry } from './assembly-edit';
import { editImplicitEllipsoidSectionShape,implicitEllipsoidEditBlocker } from './implicit-ellipsoid-edit';
import { SECTION_CHECK_ENGINE,validateSavedSectionChecks,type SavedSectionCheck } from './saved-section-check-contract';
export interface SavedSectionStatus {componentId:string;primitiveId:string;status:'verified'|'stale'|'failed'|'blocked';withinBudget:boolean;errorsMm?:number[];reason:string}
export async function attachSavedSectionCheck(source:AssemblyIR,componentId:string,primitiveId:string,fit:EllipsoidSectionFitInput,budget:SectionMeshBudget):Promise<AssemblyIR>{
 const next=structuredClone(source);validateAssemblyIR(next);const c=next.components.find(c=>c.id===componentId);if(!c)throw Error('Saved section target missing.');
 const entry:SavedSectionCheck={componentId,primitiveId,fit:structuredClone(fit),budget:structuredClone(budget),engine:SECTION_CHECK_ENGINE,geometryFingerprint:await fingerprintAssemblySectionGeometry(c.geometry,c.scale,next.units)};
 const entries=(next.sectionMeshChecks?.entries??[]).filter(e=>e.componentId!==componentId);entries.push(entry);next.sectionMeshChecks={schema:'sceliph.saved-section-checks/0.1',entries};validateSavedSectionChecks(next.sectionMeshChecks);validateAssemblyIR(next);return next;
}
export async function inspectSavedSectionChecks(source:AssemblyIR):Promise<SavedSectionStatus[]>{
 const ir=structuredClone(source);validateAssemblyIR(ir);const reports:SavedSectionStatus[]=[];
 for(const entry of ir.sectionMeshChecks?.entries??[]){
  let stale=false;
  try{
   const c=ir.components.find(c=>c.id===entry.componentId);if(!c||c.geometry.op!=='implicitSurface'||c.geometry.descriptor.primitives[0]?.id!==entry.primitiveId||(c.scale??[1,1,1]).some(n=>n!==1))throw Error('Saved target missing or unsupported representation/scale.');
   stale=await fingerprintAssemblySectionGeometry(c.geometry,c.scale,ir.units)!==entry.geometryFingerprint;
   const blocker=implicitEllipsoidEditBlocker(ir,c);if(blocker)throw Error(blocker);
   const p=c.geometry.descriptor.primitives[0];editImplicitEllipsoidSectionShape(ir,c.id,p.id,p.sectionShape??{schema:'sceliph.ellipsoid-section-shape/0.1',radialPower:2,axialPower:2});
   const result=measureEllipsoidSectionMesh(c.geometry.descriptor,entry.fit,entry.budget.maximumResolution),withinBudget=result.errorsMm.every(e=>e<=entry.budget.toleranceMm);
   reports.push({componentId:c.id,primitiveId:p.id,status:stale?'stale':withinBudget?'verified':'failed',withinBudget,errorsMm:result.errorsMm,reason:stale?'Geometry changed; saved binding requires explicit recheck/refresh.':withinBudget?'Actual current mesh sections satisfy declared budget.':'Actual section error exceeds declared budget.'});
  }catch(e){reports.push({componentId:entry.componentId,primitiveId:entry.primitiveId,status:stale?'stale':'blocked',withinBudget:false,reason:e instanceof Error?e.message:'Saved section inspection failed.'});}
 }
 return reports;
}
export async function refreshSavedSectionChecks(source:AssemblyIR):Promise<AssemblyIR>{
 const snapshot=structuredClone(source);validateAssemblyIR(snapshot);const reports=await inspectSavedSectionChecks(snapshot);
 if(reports.some(r=>!r.withinBudget))throw Error('Saved section refresh blocked: current mesh does not satisfy every declared section budget.');
 let next=snapshot;for(const e of snapshot.sectionMeshChecks?.entries??[])next=await attachSavedSectionCheck(next,e.componentId,e.primitiveId,e.fit,e.budget);return next;
}
