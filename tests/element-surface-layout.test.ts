import { expect, it } from 'vitest';
import { Euler, Quaternion, Vector3 } from 'three';
import { createBirdProject } from '../src/engine/bird-element-demo';
import { applyEllipsoidSurfaceLayout, type SurfaceLayout } from '../src/engine/element-surface-layout';
import { deleteElement,detachElement,editElement,editPart,parseProject,resolveElements,serializeProject,slotId } from '../src/engine/element-project';
const layout:SurfaceLayout={rows:5,latitudeDegrees:[-60,60],azimuthDegrees:[-170,170],direction:[0,0,-1],elevationDegrees:10};
it('uses actual ellipsoid roots on differently sized and rotated owners; keeps non-target values',()=>{
 for(const scale of [[55,75,110],[90,32,70]] as [number,number,number][]){
  const p=editPart(createBirdProject(),'body',{scale,rotation:[.3,.2,.4]}),before=structuredClone(p);
  const next=applyEllipsoidSurfaceLayout(p,'body_feathers',layout),owner=p.parts[0],inverse=new Quaternion().setFromEuler(new Euler(...owner.rotation)).invert();
  const roots=resolveElements(next).filter(e=>e.groupId==='body_feathers');
  for(const e of roots){const root=new Vector3(...e.position).sub(new Vector3(...owner.position)).applyQuaternion(inverse);expect((root.x/(scale[0]/2))**2+(root.y/(scale[1]/2))**2+(root.z/(scale[2]/2))**2).toBeCloseTo(1,12);}
  expect(new Set(roots.map(e=>e.position.join(','))).size).toBe(50);
  expect(next.parts).toEqual(p.parts);expect(p).toEqual(before);
  expect(resolveElements(next).filter(e=>e.groupId!=='body_feathers')).toEqual(resolveElements(p).filter(e=>e.groupId!=='body_feathers'));
  expect(serializeProject(applyEllipsoidSurfaceLayout(next,'body_feathers',layout))).toBe(serializeProject(next));
  expect(resolveElements(parseProject(serializeProject(next)))).toEqual(resolveElements(next));
 }
});
it('retains deleted/ detached slots and individual properties without shifting other roots',()=>{
 const baseline=createBirdProject(),id=slotId('body_feathers',0);let p=editElement(baseline,id,{params:{color:'#123456'},visible:false});p=deleteElement(p,slotId('body_feathers',1));p=detachElement(p,slotId('body_feathers',2));
 const next=applyEllipsoidSurfaceLayout(p,'body_feathers',layout),full=applyEllipsoidSurfaceLayout(baseline,'body_feathers',layout);
 expect(next.elements).toEqual(p.elements);expect(next.groups[3].deleted).toEqual(p.groups[3].deleted);
 expect(next.groups[3].overrides[id].params).toEqual(p.groups[3].overrides[id].params);expect(next.groups[3].overrides[id].visible).toBe(false);
 expect(next.groups[3].overrides[slotId('body_feathers',3)].position).toEqual(full.groups[3].overrides[slotId('body_feathers',3)].position);
});
it('rejects invalid grids and locked input atomically',()=>{
 const p=createBirdProject(),before=serializeProject(p);
 for(const bad of [{rows:3},{rows:0},{rows:1.5},{latitudeDegrees:[0,90]},{azimuthDegrees:[-200,200]},{azimuthDegrees:[0,NaN]},{direction:[0,0,0]}])expect(()=>applyEllipsoidSurfaceLayout(p,'body_feathers',{...layout,...bad} as SurfaceLayout)).toThrow();
 expect(()=>applyEllipsoidSurfaceLayout(editPart(p,'body',{locked:true}),'body_feathers',layout)).toThrow(/locked/);
 expect(()=>applyEllipsoidSurfaceLayout(editElement(p,slotId('body_feathers',0),{locked:true}),'body_feathers',layout)).toThrow(/locked/);
 expect(serializeProject(p)).toBe(before);
});
