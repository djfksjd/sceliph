import { alignEllipsoidAnchors } from './element-anchor-align';
import { applyEllipsoidSurfaceFlow } from './element-surface-flow';
import { applyEllipsoidSurfaceLayout, type SurfaceLayout } from './element-surface-layout';
import { prepareElementExportSource } from './element-export-source';
import { ProjectError, serializeProject, type ElementProject, type Vec3 } from './element-project';

export const MODELING_RECIPE_VERSION='sceliph.modeling-recipe/0.2';
function object(value:unknown,keys:string[],path:string):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new ProjectError('recipeObject',path);
  const r=value as Record<string,unknown>;
  if(Object.keys(r).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(r,k)))throw new ProjectError('recipeKeys',path);
  return r;
}
export async function modelingSourceSHA256(project:ElementProject):Promise<string>{
  const bytes=new TextEncoder().encode(serializeProject(prepareElementExportSource(project)));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
}
export async function applyModelingRecipe(project:ElementProject,text:string):Promise<{project:ElementProject;receipt:{version:string;sourceSHA256:string;outputSHA256:string;steps:number}}>{
  if(text.length>65_536)throw new ProjectError('recipeSize','recipe');
  const input=structuredClone(project),r=object(JSON.parse(text),['schema','sourceSHA256','steps'],'recipe');
  if(r.schema!==MODELING_RECIPE_VERSION && r.schema!=='sceliph.modeling-recipe/0.1')throw new ProjectError('recipeSchema','schema');
  if(typeof r.sourceSHA256!=='string'||! /^[a-f0-9]{64}$/.test(r.sourceSHA256))throw new ProjectError('recipeSHA256','sourceSHA256');
  if(!Array.isArray(r.steps)||r.steps.length<1||r.steps.length>16)throw new ProjectError('recipeStepCount','steps');
  const sourceSHA256=await modelingSourceSHA256(input);
  if(sourceSHA256!==r.sourceSHA256)throw new ProjectError('recipeSourceMismatch','sourceSHA256');
  let next=input;
  for(const [i,value] of r.steps.entries()){
    const op=(value as {op?:unknown})?.op;
    const keys=op==='anchor-align' && r.schema===MODELING_RECIPE_VERSION?['op','targetId','targetAnchor','referenceId','referenceAnchor']:op==='surface-flow'?['op','groupId','direction','elevationDegrees']:op==='surface-rows'?['op','groupId','rows','latitudeDegrees','azimuthDegrees','direction','elevationDegrees']:null;
    if(!keys)throw new ProjectError('unsupportedRecipeOperation',`steps.${i}`);
    const step=object(value,keys,`steps.${i}`);
    if(op==='anchor-align'){
      if(typeof step.targetId!=='string'||typeof step.referenceId!=='string')throw new ProjectError('recipePartId',`steps.${i}`);
      next=alignEllipsoidAnchors(next,step.targetId,step.targetAnchor as Vec3,step.referenceId,step.referenceAnchor as Vec3);
      continue;
    }
    if(typeof step.groupId!=='string')throw new ProjectError('recipeGroupId',`steps.${i}`);
    if(!Array.isArray(step.direction)||step.direction.length!==3||!step.direction.every(v=>typeof v==='number'&&Number.isFinite(v)))throw new ProjectError('recipeDirection',`steps.${i}`);
    if(typeof step.elevationDegrees!=='number')throw new ProjectError('recipeElevation',`steps.${i}`);
    next=op==='surface-flow'?applyEllipsoidSurfaceFlow(next,step.groupId,step.direction as Vec3,step.elevationDegrees):applyEllipsoidSurfaceLayout(next,step.groupId,{rows:step.rows,latitudeDegrees:step.latitudeDegrees,azimuthDegrees:step.azimuthDegrees,direction:step.direction,elevationDegrees:step.elevationDegrees} as SurfaceLayout);
  }
  return {project:next,receipt:{version:r.schema as string,sourceSHA256,outputSHA256:await modelingSourceSHA256(next),steps:r.steps.length}};
}
