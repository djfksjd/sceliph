import {expect,it} from 'vitest';
import {generateSpurGearProject} from '../src/engine/gear-pack';
import {generateBearingProject} from '../src/engine/bearing-pack';
import {evaluateModelResponse,parseModelResponseTask,migrateModelResponseTask,type ModelResponseTask} from '../src/engine/model-response-evaluation';
const task:ModelResponseTask={schema:'sceliph.model-response-task/0.1',id:'gear',domain:'mechanical',request:'Declare a24-tooth module1.5 gear,8mm face width,4mm through bore.',maximumTriangles:100000,parts:[{id:'spur_gear',sizeMm:[39,39,8],toleranceMm:.01,throughAxis:'z'}]};
it('measures real local-mm dimensions/bore/topology without promoting a model claim',()=>{
 const r=evaluateModelResponse(task,JSON.stringify(generateSpurGearProject({moduleMm:1.5,toothCount:24,faceWidthMm:8,boreDiameterMm:4})));
 expect(r.pass).toBe(true);expect(r.eligibleForLLMQualityClaim).toBe(false);expect(r.modelRunVerified).toBe(false);
});
it('fails one critical feature instead of hiding it in an average or metadata',()=>{
 const source=generateSpurGearProject({moduleMm:1.5,toothCount:24,faceWidthMm:9,boreDiameterMm:0});
 const r=evaluateModelResponse(task,JSON.stringify(source));expect(r.pass).toBe(false);expect(r.checks.find(c=>c.id==='spur_gear:dimensions')?.pass).toBe(false);expect(r.checks.find(c=>c.id==='spur_gear:through-bore')?.pass).toBe(false);
});
it('fails missing parts and authored triangle budgets with other domains using the same evaluator',()=>{
 const p=generateBearingProject({}),t={...task,id:'bearing',domain:'industrial-visualization',parts:[{id:'missing',sizeMm:[1,1,1] as [number,number,number],toleranceMm:.01}]};
 expect(evaluateModelResponse(t,JSON.stringify(p)).pass).toBe(false);expect(evaluateModelResponse({...task,maximumTriangles:1},JSON.stringify(generateSpurGearProject({}))).pass).toBe(false);
});
it('rejects ambiguous/future/unbounded task inputs and invalid native responses',()=>{
 for(const bad of [{...task,schema:'future'},{...task,extra:true},{...task,maximumTriangles:100001},{...task,parts:[task.parts[0],task.parts[0]]},{...task,parts:[{...task.parts[0],toleranceMm:0}]}])expect(()=>parseModelResponseTask(JSON.stringify(bad))).toThrow();
 expect(()=>evaluateModelResponse(task,'not JSON')).toThrow();expect(()=>evaluateModelResponse(task,JSON.stringify({schema:'future'}))).toThrow();
});
it('does not accept nominal geometry dimensions when a part scale makes the delivered size wrong',()=>{
 const p=generateSpurGearProject({moduleMm:1.5,toothCount:24,faceWidthMm:8,boreDiameterMm:4});p.parts[0].scale=[2,1,1];
 expect(evaluateModelResponse(task,JSON.stringify(p)).checks.find(c=>c.id==='spur_gear:dimensions')?.pass).toBe(false);
});

it('v0.2 blocks a same-size gear with the wrong tooth count/module and keeps v0.1 compatibility',()=>{
 const correct=generateSpurGearProject({moduleMm:1.5,toothCount:24,faceWidthMm:8,boreDiameterMm:4});
 const wrong=generateSpurGearProject({moduleMm:39/34,toothCount:32,faceWidthMm:8,boreDiameterMm:4});
 expect(evaluateModelResponse(task,JSON.stringify(wrong)).pass).toBe(true); // reproduced blind spot, legacy contract unchanged
 const upgraded=migrateModelResponseTask(task,{spur_gear:correct.parts[0].geometry!});
 expect(evaluateModelResponse(upgraded,JSON.stringify(correct)).pass).toBe(true);
 const result=evaluateModelResponse(upgraded,JSON.stringify(wrong));
 expect(result.checks.find(c=>c.id==='spur_gear:dimensions')?.pass).toBe(true);
 expect(result.checks.find(c=>c.id==='spur_gear:declared-geometry')?.pass).toBe(false);expect(result.pass).toBe(false);
 expect(()=>migrateModelResponseTask(task,{})).toThrow();
 expect(()=>parseModelResponseTask(JSON.stringify({...upgraded,parts:[{...upgraded.parts[0],geometry:{op:'spur-gear',toothCount:0}}]}))).toThrow();
 expect(()=>parseModelResponseTask(JSON.stringify({...upgraded,parts:task.parts}))).toThrow();
});
