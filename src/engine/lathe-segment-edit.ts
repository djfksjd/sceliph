import type {AssemblyIR,AssemblyComponentIR,AssemblyGeometryIR} from './assembly-ir';
export const LATHE_SEGMENT_EDIT_SCHEMA='morphloom.lathe-segments/0.1';
/** Only mappings whose target appearance has been verified are editable here. */
export function latheSegmentEditBlocker(ir:AssemblyIR,component:AssemblyComponentIR):string|undefined {
  if(component.geometry.op!=='lathe')return 'Segment edit requires a lathe component.';
  if(ir.fidelity||ir.visualPlan)return 'Segment edit is blocked by the frozen fidelity/visual-plan contract.';
  if(component.material.surface!=='raw'||component.material.referenceProjection||(component.material.microNormalStrength??0)!==0)
    return 'Segment edit currently requires explicit raw scalar PBR; projected or procedural texture mappings are not verified.';
  return undefined;
}
export function setLatheSegments(source:AssemblyGeometryIR,segments:number):AssemblyGeometryIR {
  if(source.op!=='lathe')throw new Error('Segment edit requires lathe.');
  if(!Number.isInteger(segments)||segments<3||segments>512)throw new Error('Lathe segments must be an integer from 3 to 512.');
  if((source.profile.length-1)*segments*2>100000)throw new Error('Lathe segment edit exceeds the 100000 triangle budget.');
  return {...structuredClone(source),segments};
}
