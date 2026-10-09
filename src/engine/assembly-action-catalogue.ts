import type {AssemblyIR} from './assembly-ir';
import {validateAssemblyIR} from './assembly-compiler';
import {fingerprintAssemblyIR,type AssemblyComponentPatch} from './assembly-edit';
export const ASSEMBLY_ACTION_CATALOGUE_REVISION='sceliph.assembly-action-catalogue/0.1';
/** Bounded, source-owned proposals. Comparative labels describe declared radii,
 * never inferred mass or a photo measurement. A model selects; the existing
 * patch executor still validates source and preserves non-target components. */
export async function createAssemblyTranslationCatalogue(ir:AssemblyIR,operationId:string,amountsMm:readonly number[]){
 const source=structuredClone(ir);validateAssemblyIR(source);
 if(typeof operationId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(operationId)||!Array.isArray(amountsMm)||!amountsMm.length||amountsMm.length>8||new Set(amountsMm).size!==amountsMm.length||amountsMm.some(n=>!Number.isFinite(n)||n<=0||n>100000))throw Error('Invalid catalogue operation/amounts.');
 const components=source.components;
 if(!components.length||components.length*amountsMm.length*6>32)throw Error('Catalogue exceeds32 proposals; narrow the source selection.');
 if(components.some(c=>c.geometry.op!=='sphere'||c.scale?.some(n=>n!==1)))throw Error('Comparative catalogue supports declared unscaled spheres only.');
 const radii=components.map(c=>(c.geometry as {op:'sphere';radius:number}).radius),min=Math.min(...radii),max=Math.max(...radii),fingerprint=await fingerprintAssemblyIR(source);
 const proposals:Array<{id:string;description:string;response:AssemblyComponentPatch}>=[];
 for(const c of components){
  const radius=(c.geometry as {op:'sphere';radius:number}).radius;
  const relative=min===max?'equal-radius':radius===min?'smallest-radius':radius===max?'largest-radius':'intermediate-radius';
  for(const amount of amountsMm)for(const axis of [0,1,2])for(const sign of [-1,1]){
   const translation:[number,number,number]=[0,0,0];translation[axis]=sign*amount;
   const direction=[['left','right'],['down','up'],['back','forward']][axis][sign===1?1:0],axisName='XYZ'[axis];
   proposals.push({id:c.id+'-'+axisName+sign+'-'+amount,description:`Move the ${relative} sphere ${c.id} (declared radius${radius}mm) ${direction} by${amount}mm along ${sign===1?'positive':'negative'}${axisName}.`,response:{schema:'morphloom.component-patch/0.1',operationId,expectedInputFingerprint:fingerprint,componentId:c.id,translateMm:translation}});
  }
 }
 return {schema:ASSEMBLY_ACTION_CATALOGUE_REVISION,coordinates:'right-handed Y-up world',units:'mm',sourceFingerprint:fingerprint,proposals};
}
