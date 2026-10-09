import { attachSavedSectionCheck } from './saved-section-checks';
import { fitEllipsoidWithMeshBudget,type SectionMeshBudget,type SectionMeshBudgetReport } from './ellipsoid-section-budget';
import { fitEllipsoidAxialPower, type EllipsoidSectionFitInput, type EllipsoidSectionFitResult } from './ellipsoid-section-fit';
import { editTubeRadiusProfile } from './tube-radius-profile-edit';
import type { AssemblyIR } from './assembly-ir';
import { fingerprintAssemblyIR } from './assembly-edit';
import { validateAssemblyIR } from './assembly-compiler';
import { editImplicitEllipsoidRadii, editImplicitEllipsoidSectionShape } from './implicit-ellipsoid-edit';

export const ASSEMBLY_PRIMARY_RECIPE_SCHEMA = 'sceliph.assembly-primary-recipe/0.1';
export const ASSEMBLY_PRIMARY_RECIPE_V2_SCHEMA = 'sceliph.assembly-primary-recipe/0.2';
export const ASSEMBLY_PRIMARY_RECIPE_V3_SCHEMA = 'sceliph.assembly-primary-recipe/0.3';
export const ASSEMBLY_PRIMARY_RECIPE_V4_SCHEMA = 'sceliph.assembly-primary-recipe/0.4';
export const ASSEMBLY_PRIMARY_RECIPE_V5_SCHEMA = 'sceliph.assembly-primary-recipe/0.5';
export const ASSEMBLY_PRIMARY_RECIPE_V6_SCHEMA = 'sceliph.assembly-primary-recipe/0.6';
interface EllipsoidStep { op: 'ellipsoid-radii'; componentId: string; primitiveId: string; radiiMm: [number, number, number] }
type BudgetStep = {componentId:string;primitiveId:string;fit:EllipsoidSectionFitInput;budget:SectionMeshBudget} & ({op:'ellipsoid-section-fit-budget'} | {op:'ellipsoid-section-fit-record'});
type PrimaryStep = BudgetStep | { op: 'ellipsoid-section-fit'; componentId: string; primitiveId: string; fit: EllipsoidSectionFitInput } | EllipsoidStep | { op: 'ellipsoid-section-shape'; componentId: string; primitiveId: string; radialPower: number; axialPower: number } | { op: 'tube-radius-profile'; componentId: string; stations: Array<[number,number]> };
export interface AssemblyPrimaryRecipe { schema: typeof ASSEMBLY_PRIMARY_RECIPE_SCHEMA | typeof ASSEMBLY_PRIMARY_RECIPE_V2_SCHEMA | typeof ASSEMBLY_PRIMARY_RECIPE_V3_SCHEMA | typeof ASSEMBLY_PRIMARY_RECIPE_V4_SCHEMA | typeof ASSEMBLY_PRIMARY_RECIPE_V5_SCHEMA | typeof ASSEMBLY_PRIMARY_RECIPE_V6_SCHEMA; sourceFingerprint: string; steps: PrimaryStep[] }
export interface AssemblyPrimaryRecipeReceipt { schema: 'sceliph.assembly-primary-receipt/0.1' | 'sceliph.assembly-primary-receipt/0.2' | 'sceliph.assembly-primary-receipt/0.3' | 'sceliph.assembly-primary-receipt/0.4' | 'sceliph.assembly-primary-receipt/0.5' | 'sceliph.assembly-primary-receipt/0.6'; meshBudgets?: Array<SectionMeshBudgetReport & {componentId:string;primitiveId:string}>; fits?: Array<EllipsoidSectionFitResult & { componentId: string; primitiveId: string }>; inputFingerprint: string; outputFingerprint: string; steps: PrimaryStep[] }

function strictObject(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype)
    throw new Error('Recipe requires plain JSON objects.');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some(k => !Object.hasOwn(record, k)))
    throw new Error('Recipe has missing or unsupported fields.');
  return record;
}

export async function applyAssemblyPrimaryRecipe(source: AssemblyIR, text: string): Promise<{ ir: AssemblyIR; receipt: AssemblyPrimaryRecipeReceipt }> {
  if (typeof text !== 'string' || text.length > 16_384) throw new Error('Primary recipe exceeds 16384 characters.');
  const input = structuredClone(source);
  validateAssemblyIR(input);
  const recipe = strictObject(JSON.parse(text), ['schema', 'sourceFingerprint', 'steps']);
  if (recipe.schema !== ASSEMBLY_PRIMARY_RECIPE_SCHEMA && recipe.schema !== ASSEMBLY_PRIMARY_RECIPE_V2_SCHEMA && recipe.schema !== ASSEMBLY_PRIMARY_RECIPE_V3_SCHEMA && recipe.schema !== ASSEMBLY_PRIMARY_RECIPE_V4_SCHEMA && recipe.schema !== ASSEMBLY_PRIMARY_RECIPE_V5_SCHEMA && recipe.schema !== ASSEMBLY_PRIMARY_RECIPE_V6_SCHEMA) throw new Error('Unsupported primary recipe version.');
  if (typeof recipe.sourceFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(recipe.sourceFingerprint)) throw new Error('Invalid source fingerprint.');
  if (!Array.isArray(recipe.steps) || recipe.steps.length < 1 || recipe.steps.length > 4) throw new Error('Primary recipe requires 1..4 steps.');
  const steps = recipe.steps.map(value => {
    if(value && typeof value==='object' && ((recipe.schema===ASSEMBLY_PRIMARY_RECIPE_V6_SCHEMA && (value as Record<string,unknown>).op==='ellipsoid-section-fit-record') || ((recipe.schema===ASSEMBLY_PRIMARY_RECIPE_V5_SCHEMA || recipe.schema===ASSEMBLY_PRIMARY_RECIPE_V6_SCHEMA) && (value as Record<string,unknown>).op==='ellipsoid-section-fit-budget'))){
      const step=strictObject(value,['op','componentId','primitiveId','fit','budget']);
      if(typeof step.componentId!=='string'||typeof step.primitiveId!=='string')throw Error('Section budget requires target IDs.');
      return step as unknown as PrimaryStep;
    }
    if((recipe.schema===ASSEMBLY_PRIMARY_RECIPE_V4_SCHEMA || recipe.schema===ASSEMBLY_PRIMARY_RECIPE_V5_SCHEMA || recipe.schema===ASSEMBLY_PRIMARY_RECIPE_V6_SCHEMA) && value && typeof value==='object' && (value as Record<string,unknown>).op==='ellipsoid-section-fit'){
      const step=strictObject(value,['op','componentId','primitiveId','fit']);
      if(typeof step.componentId!=='string'||typeof step.primitiveId!=='string')throw Error('Section fit requires target IDs.');
      return step as unknown as PrimaryStep;
    }
    if((recipe.schema === ASSEMBLY_PRIMARY_RECIPE_V3_SCHEMA || recipe.schema===ASSEMBLY_PRIMARY_RECIPE_V4_SCHEMA || recipe.schema===ASSEMBLY_PRIMARY_RECIPE_V5_SCHEMA || recipe.schema===ASSEMBLY_PRIMARY_RECIPE_V6_SCHEMA) && value && typeof value === 'object' && (value as Record<string,unknown>).op === 'ellipsoid-section-shape'){
      const step=strictObject(value,['op','componentId','primitiveId','radialPower','axialPower']);
      if(typeof step.componentId!=='string'||typeof step.primitiveId!=='string'||[step.radialPower,step.axialPower].some(n=>typeof n!=='number'||!Number.isFinite(n)||n<1.5||n>4))throw Error('Section recipe requires IDs and finite 1.5..4 powers.');
      return step as unknown as PrimaryStep;
    }
    if ((recipe.schema === ASSEMBLY_PRIMARY_RECIPE_V2_SCHEMA || recipe.schema === ASSEMBLY_PRIMARY_RECIPE_V3_SCHEMA || recipe.schema===ASSEMBLY_PRIMARY_RECIPE_V4_SCHEMA || recipe.schema===ASSEMBLY_PRIMARY_RECIPE_V5_SCHEMA || recipe.schema===ASSEMBLY_PRIMARY_RECIPE_V6_SCHEMA) && value && typeof value === 'object' && (value as Record<string,unknown>).op === 'tube-radius-profile') {
      const step = strictObject(value,['op','componentId','stations']);
      if(typeof step.componentId !== 'string' || !Array.isArray(step.stations)) throw Error('Tube taper recipe requires a component ID and stations.');
      return step as unknown as PrimaryStep;
    }
    const step = strictObject(value, ['op', 'componentId', 'primitiveId', 'radiiMm']);
    if (step.op !== 'ellipsoid-radii') throw new Error('Unsupported primary recipe operation.');
    if (typeof step.componentId !== 'string' || typeof step.primitiveId !== 'string') throw new Error('Primary recipe requires component/primitive IDs.');
    if (!Array.isArray(step.radiiMm) || step.radiiMm.length !== 3 || step.radiiMm.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < .1 || n > 100000))
      throw new Error('Primary recipe radii require finite 0.1..100000 mm semi-axes.');
    return step as unknown as PrimaryStep;
  });
  const targets = new Set<string>();
  for (const step of steps) { const key = JSON.stringify([step.componentId, step.op === 'tube-radius-profile' ? 'tube-radius-profile' : step.primitiveId, step.op]); if (targets.has(key)) throw new Error('Duplicate primitive target; combine into one absolute operation.'); targets.add(key); }
  for(const step of steps)if((step.op==='ellipsoid-section-fit-budget'||step.op==='ellipsoid-section-fit-record')&&steps.filter(s=>s.componentId===step.componentId).length!==1)throw Error('A mesh budget component must be edited by one absolute operation; later edits would invalidate its measurement.');
  const inputFingerprint = await fingerprintAssemblyIR(input);
  if (inputFingerprint !== recipe.sourceFingerprint) throw new Error('Primary recipe source mismatch; prepare a recipe for the current IR.');
  let ir = input;
  const fits: Array<EllipsoidSectionFitResult & {componentId:string;primitiveId:string}>=[];
  const meshBudgets: Array<SectionMeshBudgetReport & {componentId:string;primitiveId:string}>=[];
  for (const step of steps) {
    if(step.op==='ellipsoid-section-fit-budget'||step.op==='ellipsoid-section-fit-record'){
      const result=fitEllipsoidWithMeshBudget(ir,step.componentId,step.primitiveId,step.fit,step.budget);ir=result.ir;if(step.op==='ellipsoid-section-fit-record')ir=await attachSavedSectionCheck(ir,step.componentId,step.primitiveId,step.fit,step.budget);
      fits.push({...result.fit,componentId:step.componentId,primitiveId:step.primitiveId});meshBudgets.push({...result.report,componentId:step.componentId,primitiveId:step.primitiveId});
    }else if(step.op==='ellipsoid-section-fit'){
      const c=ir.components.find(c=>c.id===step.componentId);
      if(!c||c.geometry.op!=='implicitSurface'||c.geometry.descriptor.primitives.length!==1||(c.geometry.descriptor.operations?.length??0)!==0) throw Error('Section fit supports an independent ellipsoid only; composed surfaces are unsupported.');
      const p=c.geometry.descriptor.primitives[0];
      if(p.type!=='ellipsoid'||p.id!==step.primitiveId)throw Error('Section fit target is not the independent ellipsoid.');
      const radii=p.radii??p.radius;
      if(!Array.isArray(radii))throw Error('Section fit requires explicit semi-axes.');
      const radialPower=p.sectionShape?.radialPower??2;
      const fit=fitEllipsoidAxialPower(radii,radialPower,step.fit);
      ir=editImplicitEllipsoidSectionShape(ir,step.componentId,step.primitiveId,{schema:'sceliph.ellipsoid-section-shape/0.1',radialPower,axialPower:fit.axialPower});
      fits.push({...fit,componentId:step.componentId,primitiveId:step.primitiveId});
    }else ir = step.op === 'ellipsoid-radii' ? editImplicitEllipsoidRadii(ir, step.componentId, step.primitiveId, step.radiiMm) : step.op === 'tube-radius-profile' ? editTubeRadiusProfile(ir,step.componentId,step.stations) : editImplicitEllipsoidSectionShape(ir,step.componentId,step.primitiveId,{schema:'sceliph.ellipsoid-section-shape/0.1',radialPower:step.radialPower,axialPower:step.axialPower});
  }
  return { ir, receipt: { ...([ASSEMBLY_PRIMARY_RECIPE_V4_SCHEMA,ASSEMBLY_PRIMARY_RECIPE_V5_SCHEMA,ASSEMBLY_PRIMARY_RECIPE_V6_SCHEMA].includes(recipe.schema as string)?{fits}:{}), ...([ASSEMBLY_PRIMARY_RECIPE_V5_SCHEMA,ASSEMBLY_PRIMARY_RECIPE_V6_SCHEMA].includes(recipe.schema as string)?{meshBudgets}:{}), schema: recipe.schema === ASSEMBLY_PRIMARY_RECIPE_V6_SCHEMA ? 'sceliph.assembly-primary-receipt/0.6' : recipe.schema === ASSEMBLY_PRIMARY_RECIPE_V5_SCHEMA ? 'sceliph.assembly-primary-receipt/0.5' : recipe.schema === ASSEMBLY_PRIMARY_RECIPE_V4_SCHEMA ? 'sceliph.assembly-primary-receipt/0.4' : recipe.schema === ASSEMBLY_PRIMARY_RECIPE_V3_SCHEMA ? 'sceliph.assembly-primary-receipt/0.3' : recipe.schema === ASSEMBLY_PRIMARY_RECIPE_V2_SCHEMA ? 'sceliph.assembly-primary-receipt/0.2' : 'sceliph.assembly-primary-receipt/0.1', inputFingerprint, outputFingerprint: await fingerprintAssemblyIR(ir), steps } };
}
