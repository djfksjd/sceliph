import {expect,it} from 'vitest';
import {createBirdProject} from '../src/engine/bird-element-demo';
import {applyModelingRecipe,MODELING_RECIPE_VERSION,modelingSourceSHA256} from '../src/engine/element-modeling-recipe';
import {parseProject,serializeProject} from '../src/engine/element-project';
const flow={op:'surface-flow',groupId:'body_feathers',direction:[0,0,-1],elevationDegrees:15};
it('applies a source-bound declaration and returns an output bound to saved/reopened IR',async()=>{
 const p=createBirdProject(),sha=await modelingSourceSHA256(p),text=JSON.stringify({schema:MODELING_RECIPE_VERSION,sourceSHA256:sha,steps:[flow]});
 const a=await applyModelingRecipe(p,text),b=await applyModelingRecipe(p,text);
 expect(serializeProject(a.project)).toBe(serializeProject(b.project));expect(a.receipt).toEqual(b.receipt);
 expect(await modelingSourceSHA256(parseProject(serializeProject(a.project)))).toBe(a.receipt.outputSHA256);
 expect(await modelingSourceSHA256({...p,selection:['body']})).toBe(sha);
});
it('rejects wrong source, unknown operations/keys/version and keeps failed multi-step input unchanged',async()=>{
 const p=createBirdProject(),before=serializeProject(p),sourceSHA256=await modelingSourceSHA256(p),recipe={schema:MODELING_RECIPE_VERSION,sourceSHA256,steps:[flow]};
 for(const bad of [{...recipe,sourceSHA256:'0'.repeat(64)},{...recipe,schema:'sceliph.modeling-recipe/2'},{...recipe,steps:[{...flow,code:'process.exit()'}]},{...recipe,steps:[flow,{op:'execute',code:'x'}]},{...recipe,steps:[flow,{...flow,groupId:'missing'}]},{...recipe,steps:[]}])await expect(applyModelingRecipe(p,JSON.stringify(bad))).rejects.toThrow();
 expect(serializeProject(p)).toBe(before);
});
it('accepts row declarations and rejects unbounded or malformed inputs',async()=>{
 const p=createBirdProject(),sourceSHA256=await modelingSourceSHA256(p);
 const step={...flow,op:'surface-rows',rows:5,latitudeDegrees:[-60,60],azimuthDegrees:[-170,170]};
 const result=await applyModelingRecipe(p,JSON.stringify({schema:MODELING_RECIPE_VERSION,sourceSHA256,steps:[step]}));expect(result.project.groups[3].overrides['body_feathers/000000'].position).toBeDefined();
 await expect(applyModelingRecipe(p,'x'.repeat(65_537))).rejects.toThrow(/recipeSize/);
 await expect(applyModelingRecipe(p,JSON.stringify({schema:MODELING_RECIPE_VERSION,sourceSHA256,steps:Array(17).fill(step)}))).rejects.toThrow(/recipeStepCount/);
});

it('supports0.1 recipes unchanged and gates anchor alignment to0.2',async()=>{
 const p=createBirdProject(),sourceSHA256=await modelingSourceSHA256(p),anchor={op:'anchor-align',targetId:'foot_left',targetAnchor:[0,.5,0],referenceId:'leg_left',referenceAnchor:[0,-.5,0]};
 await expect(applyModelingRecipe(p,JSON.stringify({schema:'sceliph.modeling-recipe/0.1',sourceSHA256,steps:[flow]}))).resolves.toBeDefined();
 await expect(applyModelingRecipe(p,JSON.stringify({schema:'sceliph.modeling-recipe/0.1',sourceSHA256,steps:[anchor]}))).rejects.toThrow(/unsupportedRecipeOperation/);
 const a=await applyModelingRecipe(p,JSON.stringify({schema:MODELING_RECIPE_VERSION,sourceSHA256,steps:[anchor]}));expect(a.project.parts.find(x=>x.id==='foot_left')!.position).toEqual([-23,6.5,-12]);
});
