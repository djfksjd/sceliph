import {expect,it} from 'vitest';
import {gearEditPreflight} from '../src/engine/gear-edit-preflight';
import {generateSpurGearProject} from '../src/engine/gear-pack';
import {editPart,serializeProject} from '../src/engine/element-project';
import type {SpurGearGeometry} from '../src/engine/spur-gear';
it('reports invalid coupled dimensions without throwing or mutating the input',()=>{
 const p=generateSpurGearProject({}),g=p.parts[0].geometry as SpurGearGeometry,before=serializeProject(p);
 for(const patch of [{moduleMm:0},{toothCount:24.5},{boreDiameterMm:24},{faceWidthMm:101},{pressureAngleDeg:19}]){
  expect(gearEditPreflight({...g,...patch},0).valid).toBe(false);
  expect(()=>editPart(p,p.parts[0].id,{geometry:{...g,...patch}})).toThrow();
 }
 expect(serializeProject(p)).toBe(before);
});
it('allows supported variants and rejects a chamfer made invalid by a width edit',()=>{
 for(const input of [{moduleMm:.5,boreDiameterMm:3},{},{moduleMm:2},{toothCount:36}]){
  const g=generateSpurGearProject(input).parts[0].geometry as SpurGearGeometry;
  expect(gearEditPreflight(g,0).valid).toBe(true);
 }
 const g=generateSpurGearProject({}).parts[0].geometry as SpurGearGeometry;
 expect(gearEditPreflight(g,.04).valid).toBe(true);
 expect(gearEditPreflight({...g,faceWidthMm:.1},.04)).toMatchObject({valid:false,maximumChamferMm:.1*.1});
});
