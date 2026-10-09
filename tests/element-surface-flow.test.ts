import { expect, it } from 'vitest';
import { Euler, Quaternion, Vector3 } from 'three';
import { createBirdProject } from '../src/engine/bird-element-demo';
import { applyEllipsoidSurfaceFlow } from '../src/engine/element-surface-flow';
import { deleteElement, detachElement, editElement, editPart, parseProject, resolveElements, serializeProject, slotId } from '../src/engine/element-project';

it('lays local +Y along the projected owner-local direction at the declared elevation', () => {
  for (const scale of [[55,75,110], [110,30,55]]) {
    let p = editPart(createBirdProject(), 'body', { scale: scale as [number,number,number], rotation: [.2,.4,.1] });
    const untouched = structuredClone(p);
    const next = applyEllipsoidSurfaceFlow(p, 'body_feathers', [0,0,-1], 15);
    const owner = p.parts.find(x=>x.id==='body')!;
    const q = new Quaternion().setFromEuler(new Euler(...owner.rotation));
    for (const e of resolveElements(next).filter(x=>x.groupId==='body_feathers')) {
      const root = new Vector3(...e.position).sub(new Vector3(...owner.position)).applyQuaternion(q.clone().invert());
      const n = new Vector3(root.x/(scale[0]**2),root.y/(scale[1]**2),root.z/(scale[2]**2)).normalize();
      const axis = new Vector3(0,1,0).applyEuler(new Euler(...e.rotation)).applyQuaternion(q.clone().invert());
      expect(axis.dot(n)).toBeCloseTo(Math.sin(Math.PI/12), 10);
      expect(axis.clone().addScaledVector(n,-axis.dot(n)).normalize().dot(new Vector3(0,0,-1))).toBeGreaterThan(0);
    }
    expect(p).toEqual(untouched);
    expect(next.parts).toEqual(p.parts);
    expect(resolveElements(next).filter(x=>x.groupId!=='body_feathers')).toEqual(resolveElements(p).filter(x=>x.groupId!=='body_feathers'));
    expect(resolveElements(parseProject(serializeProject(next)))).toEqual(resolveElements(next));
  }
});

it('preserves slot edits and deletions, and reapplication never accumulates rotation', () => {
  const id=slotId('body_feathers',0);
  let p=editElement(createBirdProject(),id,{params:{color:'#123456'},visible:false});
  p=deleteElement(p,slotId('body_feathers',1));
  p=detachElement(p,slotId('body_feathers',2));
  const next=applyEllipsoidSurfaceFlow(p,'body_feathers',[0,0,-1],15);
  expect(next.groups[3].overrides[id].params).toEqual(p.groups[3].overrides[id].params);
  expect(next.groups[3].overrides[id].visible).toBe(false);
  expect(next.groups[3].deleted).toEqual(p.groups[3].deleted);
  expect(next.elements).toEqual(p.elements);
  const again=applyEllipsoidSurfaceFlow(next,'body_feathers',[0,0,-1],15);
  expect(serializeProject(again)).toBe(serializeProject(next));
});

it('rejects locks and invalid directions atomically', () => {
  const p=createBirdProject(), before=serializeProject(p);
  expect(()=>applyEllipsoidSurfaceFlow(p,'body_feathers',[0,0,0],15)).toThrow();
  expect(()=>applyEllipsoidSurfaceFlow(p,'body_feathers',[0,NaN,1],15)).toThrow();
  expect(()=>applyEllipsoidSurfaceFlow(p,'body_feathers',[0,0,-1],91)).toThrow();
  expect(()=>applyEllipsoidSurfaceFlow(editPart(p,'body',{locked:true}),'body_feathers',[0,0,-1],15)).toThrow();
  expect(()=>applyEllipsoidSurfaceFlow(editElement(p,slotId('body_feathers',2),{locked:true}),'body_feathers',[0,0,-1],15)).toThrow();
  expect(serializeProject(p)).toBe(before);
});

it('rejects undefined tangents, unsupported owners and empty generated groups', () => {
  const p=createBirdProject(), id=slotId('body_feathers',0);
  const pole=editElement(p,id,{position:[0,0,-55]});
  expect(()=>applyEllipsoidSurfaceFlow(pole,'body_feathers',[0,0,-1],15)).toThrow(/flowParallelToNormal/);
  const center=editElement(p,id,{position:[0,0,0]});
  expect(()=>applyEllipsoidSurfaceFlow(center,'body_feathers',[0,0,-1],15)).toThrow(/flowSurfaceRoot/);
  expect(()=>applyEllipsoidSurfaceFlow(p,'missing',[0,0,-1],15)).toThrow(/unsupportedFlowSurface/);
  const unsupported=structuredClone(p);unsupported.groups[3].distribution='volume';
  expect(()=>applyEllipsoidSurfaceFlow(unsupported,'body_feathers',[0,0,-1],15)).toThrow(/unsupportedFlowSurface/);
  const empty=structuredClone(p);empty.groups[3].count=0;
  expect(()=>applyEllipsoidSurfaceFlow(empty,'body_feathers',[0,0,-1],15)).toThrow(/flowNoGeneratedMembers/);
});
