import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {PartInspector} from '../src/PartInspector';
import {generateSpurGearProject} from '../src/engine/gear-pack';
import {gearChamferMaximum} from '../src/engine/gear-chamfer';
import type {SpurGearGeometry} from '../src/engine/spur-gear';
it('keeps an invalid coupled gear draft rendered and blocks Apply instead of crashing on chamfer maximum',()=>{
 const part=generateSpurGearProject({}).parts[0];
 part.geometry={...(part.geometry as SpurGearGeometry),boreDiameterMm:24};
 expect(()=>gearChamferMaximum(part.geometry as SpurGearGeometry)).toThrow();
 const html=renderToStaticMarkup(<PartInspector part={part} version2 version5 apply={()=>{throw Error('unexpected apply');}} action={()=>{}}/>);
 expect(html).toContain('role="alert"');
 expect(html).toContain('Adjust the gear dimensions or chamfer');
 expect(html).toContain('Fix invalid inputs before applying');
 expect(html).toMatch(/disabled=""[^>]*>Apply part edit/);
});
it('exposes units, stable ID, engine-compatible bounds and locked controls',()=>{
 const part=generateSpurGearProject({}).parts[0];part.locked=true;
 const html=renderToStaticMarkup(<PartInspector part={part} version2 version5 apply={()=>{}} action={()=>{}}/>);
 expect(html).toContain('<code>spur_gear</code>');
 expect(html).toContain('Locked · unlock to edit');
 expect(html).toMatch(/aria-label="Gear moduleMm"[^>]*min="0.2"[^>]*max="5"[^>]*disabled=""/);
 expect(html).toMatch(/aria-label="Gear faceWidthMm"[^>]*min="0.1"[^>]*max="100"/);
});
