import {expect,it} from 'vitest';
import {sphereFitDisposition,createSphereFitReceipt,type SphereFitSession} from '../src/sphere-fit-session';
import {fitSphereSurfaceBudget} from '../src/engine/sphere-surface-budget';
const source={op:'sphere' as const,radius:3,widthSegments:48,heightSegments:32};
it('blocks failure and stale geometry/tolerance/input while allowing a fresh matching actual fit',()=>{
 const result=fitSphereSurfaceBudget(source,.005),ready=createSphereFitReceipt(result.geometry,.005,result.measurement);
 expect(sphereFitDisposition(ready,result.geometry,.005,false).blocked).toBe(false);
 for(const [g,t,invalid] of [[{...result.geometry,radius:4},.005,false],[result.geometry,.001,false],[result.geometry,.005,true]] as const){expect(sphereFitDisposition(ready,g,t,invalid)).toMatchObject({blocked:true,kind:'stale'});}
 const failed:SphereFitSession={status:'failed',reason:'unattainable'};expect(sphereFitDisposition(failed,source,.005,false)).toMatchObject({blocked:true,kind:'failed'});
 expect(sphereFitDisposition({status:'idle'},source,.005,false).blocked).toBe(false);
});
it('holds failure until cancel or a successful fit, and does not serialize a passing receipt into IR',()=>{
 const failed:SphereFitSession={status:'failed',reason:'unattainable'},changed={...source,radius:2};
 expect(sphereFitDisposition(failed,changed,.01,false).blocked).toBe(true);
 const result=fitSphereSurfaceBudget(changed,.01);expect(sphereFitDisposition(createSphereFitReceipt(result.geometry,.01,result.measurement),result.geometry,.01,false).blocked).toBe(false);
 expect(sphereFitDisposition({status:'idle'},changed,.01,false).blocked).toBe(false);
 expect(result.geometry).not.toHaveProperty('measurement');expect(result.geometry).not.toHaveProperty('receipt');
});

import {generateBearingProject} from '../src/engine/bearing-pack';
import {editPart,serializeProject,parseProject} from '../src/engine/element-project';
it('reopens only the geometry edit and requires a new actual measurement in a fresh session',()=>{
 const p=generateBearingProject({}),ball=p.parts.find(x=>x.id==='ball_0000')!;if(ball.geometry?.op!=='sphere')throw Error();
 const fit=fitSphereSurfaceBudget(ball.geometry,.005),receipt=createSphereFitReceipt(fit.geometry,.005,fit.measurement);
 const saved=serializeProject(editPart(p,ball.id,{geometry:fit.geometry})),reopened=parseProject(saved),g=reopened.parts.find(x=>x.id===ball.id)!.geometry!;
 expect(saved).not.toContain('geometryKey');expect(saved).not.toContain('maximumDeviationMm');
 expect(sphereFitDisposition({status:'idle'},g,.005,false).message).toBe('');
 if(g.op!=='sphere')throw Error();const repeated=fitSphereSurfaceBudget(g,.005);
 expect(repeated.geometry).toEqual(fit.geometry);expect(sphereFitDisposition(createSphereFitReceipt(repeated.geometry,.005,repeated.measurement),g,.005,false).kind).toBe('ready');
 fit.measurement.maximumDeviationMm=999;expect(receipt.status==='ready'&&receipt.measurement.maximumDeviationMm).toBeLessThanOrEqual(.005);
});
