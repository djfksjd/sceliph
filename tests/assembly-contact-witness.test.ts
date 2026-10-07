import { expect, it } from 'vitest';
import { createBirdPrimaryStudy } from '../src/engine/bird-primary-study';
import { editImplicitEllipsoidRadii } from '../src/engine/implicit-ellipsoid-edit';

it('rejects an otherwise connected head shrink that removes a declared eye attachment', () => {
  const ir = createBirdPrimaryStudy();
  ir.metadata!.sceliphContactWitnesses = JSON.stringify({schema:'sceliph.contact-witnesses/0.1', witnesses:[{
    id:'left-eye-root', ownerId:'eye_left', hostId:'organic_core', ownerLocalMm:[1.8,0,0], minimumClearanceMm:.05,
  }]});
  const before = structuredClone(ir);
  expect(() => editImplicitEllipsoidRadii(ir, 'organic_core', 'head', [15,21,25])).toThrow(/contact/i);
  expect(ir).toEqual(before);
});

import { auditAssemblyContactWitnesses, CONTACT_WITNESS_SCHEMA } from '../src/engine/assembly-contact-witness';
import { applyAssemblyPrimaryRecipe, ASSEMBLY_PRIMARY_RECIPE_SCHEMA } from '../src/engine/assembly-primary-recipe';
import { fingerprintAssemblyIR } from '../src/engine/assembly-edit';

it('keeps authored eyes, wing roots and beak embedded, including JSON reopen and repeat edits', async () => {
  const ir=createBirdPrimaryStudy({preserveContacts:true}), before=structuredClone(ir);
  expect(auditAssemblyContactWitnesses(ir)).toHaveLength(5);
  const text=JSON.stringify({schema:ASSEMBLY_PRIMARY_RECIPE_SCHEMA,sourceFingerprint:await fingerprintAssemblyIR(ir),steps:[{op:'ellipsoid-radii',componentId:'organic_core',primitiveId:'head',radiiMm:[20.5,21,25]}]});
  const a=await applyAssemblyPrimaryRecipe(ir,text), b=await applyAssemblyPrimaryRecipe(ir,text);
  expect(a).toEqual(b);expect(ir).toEqual(before);expect(a.ir.components.slice(1)).toEqual(ir.components.slice(1));
  const reopened=JSON.parse(JSON.stringify(a.ir));
  expect(auditAssemblyContactWitnesses(reopened)).toEqual(auditAssemblyContactWitnesses(a.ir));
  expect(editImplicitEllipsoidRadii(reopened,'organic_core','head',[20.5,21,25])).toBe(reopened);
  const next=editImplicitEllipsoidRadii(reopened,'organic_core','head',[22,21,25]);
  expect(auditAssemblyContactWitnesses(next)).toHaveLength(5);
});

it('legacy IR without a contact declaration keeps its existing supported edit', () => {
  const ir=createBirdPrimaryStudy();expect(auditAssemblyContactWitnesses(ir)).toEqual([]);
  expect(editImplicitEllipsoidRadii(ir,'organic_core','head',[15,21,25])).not.toBe(ir);
});

it('rejects malformed, ambiguous, unsupported and invalid original contracts even for no-op edits', () => {
  const source=createBirdPrimaryStudy({preserveContacts:true});
  const good=JSON.parse(source.metadata!.sceliphContactWitnesses as string);
  const invalid=[{...good,schema:'future'},{...good,extra:true},{...good,witnesses:[]},{...good,witnesses:Array(9).fill(good.witnesses[0])},
    {...good,witnesses:[{...good.witnesses[0],hostId:'missing'}]},
    {...good,witnesses:[{...good.witnesses[0],hostId:'eye_left'}]},
    {...good,witnesses:[{...good.witnesses[0],ownerLocalMm:[1000,0,0]}]},
    {...good,witnesses:[{...good.witnesses[0],minimumClearanceMm:0}]},
    {...good,witnesses:[good.witnesses[0],good.witnesses[0]]}];
  for(const contract of invalid){const ir=structuredClone(source);ir.metadata!.sceliphContactWitnesses=JSON.stringify(contract);
    expect(()=>editImplicitEllipsoidRadii(ir,'organic_core','head',[21,21,25])).toThrow();}
  for(const raw of ['bad JSON',' '.repeat(8193),false]){const ir=structuredClone(source);ir.metadata!.sceliphContactWitnesses=raw;
    expect(()=>auditAssemblyContactWitnesses(ir)).toThrow();}
});

it('uses owner local mm through rotation, nonuniform scale and translation, and measures actual meshes', () => {
  const ir=createBirdPrimaryStudy();ir.components=ir.components.slice(0,2);
  const host=ir.components[0], owner=ir.components[1];
  host.geometry={op:'sphere',radius:10,widthSegments:32,heightSegments:24};
  owner.geometry={op:'sphere',radius:2,widthSegments:32,heightSegments:24};
  owner.position=[18,30,40];owner.rotation=[0,0,Math.PI/2];owner.scale=[1,2,1];
  host.position=[10,30,40];host.rotation=[0,.4,0];host.scale=[1.2,1,1];
  ir.metadata!.sceliphContactWitnesses=JSON.stringify({schema:CONTACT_WITNESS_SCHEMA,witnesses:[{id:'socket',ownerId:owner.id,hostId:host.id,ownerLocalMm:[0,0.5,0],minimumClearanceMm:.1}]});
  const report=auditAssemblyContactWitnesses(ir);expect(report[0].ownerClearanceMm).toBeGreaterThan(1);expect(report[0].hostClearanceMm).toBeGreaterThan(1);
  owner.position[0]=30;expect(()=>auditAssemblyContactWitnesses(ir)).toThrow(/socket/);
  owner.position[0]=18;owner.scale=[0,2,1];expect(()=>auditAssemblyContactWitnesses(ir)).toThrow(/transform/);
});
