import {expect,it} from 'vitest';
import {measureSphereSurfaceError,fitSphereSurfaceBudget} from '../src/engine/sphere-surface-budget';
it('reduces actual triangle surface error for three radii without changing the declared radius',()=>{
 for(const radius of [1.25,2.5,5]){
  const g={op:'sphere' as const,radius,widthSegments:16,heightSegments:8};
  const before=measureSphereSurfaceError(g),fitted=fitSphereSurfaceBudget(g,.005);
  expect(before.maximumDeviationMm).toBeGreaterThan(.005);expect(fitted.measurement.maximumDeviationMm).toBeLessThanOrEqual(.005);
  expect(fitted.geometry.radius).toBe(radius);expect(fitted.measurement.triangles).toBeLessThanOrEqual(32512);
  expect(fitSphereSurfaceBudget(fitted.geometry,.005).geometry).toEqual(fitted.geometry);
  expect(fitSphereSurfaceBudget(g,.005)).toEqual(fitted);
 }
});
it('rejects invalid tolerances and unattainable budgets without partial mutation',()=>{
 const g={op:'sphere' as const,radius:100,widthSegments:16,heightSegments:8},before=JSON.stringify(g);
 for(const tolerance of [0,-1,NaN,Infinity,.0001])expect(()=>fitSphereSurfaceBudget(g,tolerance)).toThrow();
 expect(JSON.stringify(g)).toBe(before);
});

import {Mesh} from 'three';
import {generateBearingProject} from '../src/engine/bearing-pack';
import {editPart,parseProject,serializeProject,ElementHistory} from '../src/engine/element-project';
import {exportSelectedScene} from '../src/engine/element-renderer';
it('refines one native bearing ball through existing edits, preserving bounds and all other parts',()=>{
 const p=generateBearingProject({}),ball=p.parts.find(x=>x.id==='ball_0000')!;
 if(ball.geometry?.op!=='sphere')throw Error('Expected native sphere');
 const fit=fitSphereSurfaceBudget(ball.geometry,.005),q=editPart(p,ball.id,{geometry:fit.geometry}),reopened=parseProject(serializeProject(q));
 expect(reopened.parts.filter(x=>x.id!==ball.id)).toEqual(p.parts.filter(x=>x.id!==ball.id));
 expect({...reopened.parts.find(x=>x.id===ball.id)!,geometry:ball.geometry}).toEqual(ball);
 const a=exportSelectedScene(p,[ball.id,'ball_0001']),b=exportSelectedScene(reopened,[ball.id,'ball_0001']);
 try{
  const x=(a.root.getObjectByName(ball.id) as Mesh).geometry,y=(b.root.getObjectByName(ball.id) as Mesh).geometry;
  x.computeBoundingBox();y.computeBoundingBox();expect(y.boundingBox).toEqual(x.boundingBox);
  expect(y.index!.count).toBeGreaterThan(x.index!.count);
  for(const attr of ['position','normal','uv'])expect((b.root.getObjectByName('ball_0001') as Mesh).geometry.getAttribute(attr).array).toEqual((a.root.getObjectByName('ball_0001') as Mesh).geometry.getAttribute(attr).array);
 }finally{a.dispose();b.dispose();}
 const h=new ElementHistory(p);h.commit(q);expect(h.undo()).toEqual(p);expect(h.redo()).toEqual(q);
 expect(()=>editPart({...p,parts:p.parts.map(x=>x.id===ball.id?{...x,locked:true}:x)},ball.id,{geometry:fit.geometry})).toThrow(/locked/);
});
