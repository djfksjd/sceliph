import {expect,it} from 'vitest';
import {validateSpurGear,SpurGearValidationError} from '../src/engine/spur-gear';
import {gearEditPreflight} from '../src/engine/gear-edit-preflight';
const base={op:'spur-gear' as const,moduleMm:1,toothCount:24,pressureAngleDeg:20,faceWidthMm:8,boreDiameterMm:2};
it('returns the actual exclusive bore limit without weakening rejection',()=>{
 for(const moduleMm of [.5,1,2]){
  const exclusiveMaximum=moduleMm*(base.toothCount-2.5)-moduleMm*.1;
  try{validateSpurGear({...base,moduleMm,boreDiameterMm:exclusiveMaximum});expect.unreachable();}catch(e){expect(e).toBeInstanceOf(SpurGearValidationError);expect(e).toMatchObject({issue:{code:'bore-clearance',field:'boreDiameterMm',exclusiveMaximum}});}
  expect(()=>validateSpurGear({...base,moduleMm,boreDiameterMm:exclusiveMaximum-.001})).not.toThrow();
  expect(gearEditPreflight({...base,moduleMm,boreDiameterMm:exclusiveMaximum},0)).toMatchObject({valid:false,issue:{code:'bore-clearance',field:'boreDiameterMm',exclusiveMaximum}});
 }
});
it('identifies invalid scalar parameters, whole teeth, and unsupported arithmetic',()=>{
 for(const [field,value] of [['moduleMm',0],['faceWidthMm',101],['pressureAngleDeg',19],['boreDiameterMm',Infinity],['toothCount',24.5]] as const){
  const result=gearEditPreflight({...base,[field]:value},0);expect(result.valid).toBe(false);expect(result.issue?.field).toBe(field);
 }
 expect(gearEditPreflight({...base,mathRevision:'unknown' as never},0)).toMatchObject({valid:false,issue:{code:'math-revision',field:'mathRevision'}});
});
it('does not leak caller objects into structured diagnostics or mutate them',()=>{
 const input={...base,boreDiameterMm:22},before=JSON.stringify(input),r=gearEditPreflight(input,0);
 expect(JSON.stringify(input)).toBe(before);expect(r.reason).toContain('less than 21.4 mm');
 expect(r.issue).not.toHaveProperty('input');expect(gearEditPreflight(base,0)).toMatchObject({valid:true,issue:null});
});
