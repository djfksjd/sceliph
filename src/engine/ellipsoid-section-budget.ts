import { DoubleSide,Mesh,MeshBasicMaterial,Raycaster,Vector3 } from 'three';
import type { AssemblyIR } from './assembly-ir';
import { validateAssemblyIR } from './assembly-compiler';
import { fitEllipsoidAxialPower,type EllipsoidSectionFitInput,type EllipsoidSectionFitResult } from './ellipsoid-section-fit';
import { editImplicitEllipsoidSectionShape } from './implicit-ellipsoid-edit';
import { polygonizeImplicitSurface,type ImplicitSurfaceDescriptor } from './implicit-surface';
export interface SectionMeshBudget {schema:'sceliph.section-mesh-budget/0.1';toleranceMm:number;maximumResolution:number}
export interface SectionMeshBudgetReport {selectedResolution:number;attempts:Array<{requestedResolution:number;resolvedResolution:number;triangleCount:number;errorsMm:number[]}>;toleranceMm:number;scope:'declared primitive-local sections only'}
/** Measures current mesh only; never changes shape or selects a higher requested resolution. */
export function measureEllipsoidSectionMesh(descriptor:ImplicitSurfaceDescriptor,points:EllipsoidSectionFitInput,maximumResolution:number){
 const p=descriptor.primitives[0],r=p?.radii??p?.radius;
 if(descriptor.primitives.length!==1||(descriptor.operations?.length??0)!==0||p.type!=='ellipsoid'||!Array.isArray(r)||descriptor.resolution>48||descriptor.triangleBudget>50000||(p.transform?.position??[0,0,0]).some(n=>n!==0)||(p.transform?.rotation??[0,0,0]).some(n=>n!==0)||(p.transform?.scale??[1,1,1]).some(n=>n!==1))throw Error('Saved check requires supported independent local ellipsoid.');
 fitEllipsoidAxialPower(r,p.sectionShape?.radialPower??2,points);
 const result=polygonizeImplicitSurface(descriptor,maximumResolution),material=new MeshBasicMaterial({side:DoubleSide});
 try{const mesh=new Mesh(result.geometry,material);const errorsMm=points.pointsMm.map(point=>{
  const radial=new Vector3(point[0],point[1],0),expected=radial.length();radial.normalize();
  const hits=new Raycaster(new Vector3(0,0,point[2]),radial,0,2*Math.max(...r)).intersectObject(mesh);
  if(!hits.length)throw Error('Section mesh budget has no radial intersection.');const error=Math.abs(hits[0].distance-expected);if(!Number.isFinite(error))throw Error('Section mesh budget returned non-finite error.');return error;
 });return {requestedResolution:descriptor.resolution,resolvedResolution:result.resolution,triangleCount:result.triangleCount,errorsMm};}finally{result.geometry.dispose();material.dispose();}
}
export function fitEllipsoidWithMeshBudget(source:AssemblyIR,componentId:string,primitiveId:string,points:EllipsoidSectionFitInput,budget:SectionMeshBudget):{ir:AssemblyIR;fit:EllipsoidSectionFitResult;report:SectionMeshBudgetReport}{
 validateAssemblyIR(source);
 if(!budget||typeof budget!=='object'||Array.isArray(budget)||Object.getPrototypeOf(budget)!==Object.prototype||Object.keys(budget).length!==3||budget.schema!=='sceliph.section-mesh-budget/0.1'||!Number.isFinite(budget.toleranceMm)||budget.toleranceMm<.0001||budget.toleranceMm>10||!Number.isInteger(budget.maximumResolution)||budget.maximumResolution<8||budget.maximumResolution>48)throw Error('Section mesh budget requires version0.1, 0.0001..10mm tolerance and maximum resolution8..48.');
 const c=source.components.find(c=>c.id===componentId);
 if(!c||c.geometry.op!=='implicitSurface'||c.geometry.descriptor.primitives.length!==1||(c.geometry.descriptor.operations?.length??0)!==0)throw Error('Section mesh budget requires independent ellipsoid.');
 const d=c.geometry.descriptor,p=d.primitives[0],r=p.radii??p.radius;
 if(p.id!==primitiveId||p.type!=='ellipsoid'||!Array.isArray(r))throw Error('Section mesh budget requires existing ellipsoid semi-axes.');
 if((p.transform?.position??[0,0,0]).some(n=>n!==0)||(p.transform?.rotation??[0,0,0]).some(n=>n!==0)||(p.transform?.scale??[1,1,1]).some(n=>n!==1)||(c.scale??[1,1,1]).some(n=>n!==1))throw Error('Section mesh budget does not support primitive transforms or component scaling.');
 if(budget.maximumResolution<d.resolution)throw Error('Section mesh budget cannot lower current resolution.');
 const radialPower=p.sectionShape?.radialPower??2,fit=fitEllipsoidAxialPower(r,radialPower,points);
 const shape={schema:'sceliph.ellipsoid-section-shape/0.1' as const,radialPower,axialPower:fit.axialPower};
 const shaped=editImplicitEllipsoidSectionShape(source,componentId,primitiveId,shape);
 const candidates=[...new Set([0,1,2,3].map(i=>Math.round(d.resolution+(budget.maximumResolution-d.resolution)*i/3)))];
 const attempts:SectionMeshBudgetReport['attempts']=[];
 for(const requestedResolution of candidates){
  const next=structuredClone(shaped),g=next.components.find(c=>c.id===componentId)!.geometry;
  if(g.op!=='implicitSurface')throw Error('Section budget target changed.');
  g.descriptor.resolution=requestedResolution;
  const attempt=measureEllipsoidSectionMesh(g.descriptor,points,budget.maximumResolution);
  attempts.push(attempt);
  if(attempt.errorsMm.every(e=>e<=budget.toleranceMm)){
   g.descriptor.resolution=attempt.resolvedResolution;
   const verified=editImplicitEllipsoidSectionShape(next,componentId,primitiveId,shape);
   return {ir:verified,fit,report:{selectedResolution:attempt.resolvedResolution,attempts,toleranceMm:budget.toleranceMm,scope:'declared primitive-local sections only'}};
  }
 }
 throw Error(`Section mesh budget not met within resolution ${budget.maximumResolution}; per-point errors mm: ${JSON.stringify(attempts)}. No edit applied.`);
}
