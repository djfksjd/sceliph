import { expect,it } from 'vitest';
import { polygonizeImplicitSurface, type ImplicitSurfaceDescriptor } from '../src/engine/implicit-surface';
const descriptor=()=>({bounds:{min:[-25,-25,-35],max:[25,25,35]},resolution:32,triangleBudget:15000,primitives:[{id:'mass',type:'ellipsoid',radii:[20,20,30]}]} as ImplicitSurfaceDescriptor);
it('changes actual cross-section vertices at fixed semi-axes when a section shape is declared',()=>{
 const legacy=descriptor(),shaped=structuredClone(legacy);(shaped.primitives[0] as any).sectionShape={schema:'sceliph.ellipsoid-section-shape/0.1',radialPower:2,axialPower:1.5};
 const a=polygonizeImplicitSurface(legacy).geometry,b=polygonizeImplicitSurface(shaped).geometry;
 try{expect(b.getAttribute('position').array).not.toEqual(a.getAttribute('position').array);}finally{a.dispose();b.dispose();}
});
import { DoubleSide,Mesh,MeshBasicMaterial,Raycaster,Vector3 } from 'three';
import { analyzeTopology } from '../src/engine/topology';
import { migrateEllipsoidSectionShape } from '../src/engine/ellipsoid-section-shape';
import { createBirdPrimaryStudy } from '../src/engine/bird-primary-study';
import { editImplicitEllipsoidSectionShape,editImplicitEllipsoidRadii } from '../src/engine/implicit-ellipsoid-edit';
import { auditAssemblyContactWitnesses } from '../src/engine/assembly-contact-witness';
import { applyAssemblyPrimaryRecipe,ASSEMBLY_PRIMARY_RECIPE_V3_SCHEMA } from '../src/engine/assembly-primary-recipe';
import { fingerprintAssemblyIR } from '../src/engine/assembly-edit';
it.each([.5,1,3])('measures designed section narrowing, finite normals and closed topology at scale %s',scale=>{
 const a=descriptor();a.bounds.min=a.bounds.min.map(n=>n*scale) as [number,number,number];a.bounds.max=a.bounds.max.map(n=>n*scale) as [number,number,number];a.primitives[0].radii=a.primitives[0].radii!.map(n=>n*scale) as [number,number,number];
 const b=structuredClone(a);b.primitives[0]=migrateEllipsoidSectionShape(b.primitives[0],{schema:'sceliph.ellipsoid-section-shape/0.1',radialPower:2,axialPower:1.5});
 const ga=polygonizeImplicitSurface(a).geometry,gb=polygonizeImplicitSurface(b).geometry,m=new MeshBasicMaterial({side:DoubleSide});
 try{
  expect(analyzeTopology(new Mesh(gb,m)).pass).toBe(true);
  const x=(g:typeof ga)=>new Raycaster(new Vector3(50*scale,0,22.5*scale),new Vector3(-1,0,0)).intersectObject(new Mesh(g,m))[0].point.x/scale;
  // One grid-cell tolerance fixed from this 32-grid fixture, before looking at output.
  const ideal=20*(1-.75**1.5)**(1/1.5);expect(Math.abs(x(gb)-ideal)).toBeLessThan(50/32);expect(x(ga)-x(gb)).toBeGreaterThan(2);
  for(const n of gb.getAttribute('normal').array)expect(Number.isFinite(n)).toBe(true);
  gb.computeBoundingBox();expect(Math.abs(gb.boundingBox!.max.x/scale-20)).toBeLessThan(50/32);
 }finally{ga.dispose();gb.dispose();m.dispose();}
});
it('preserves legacy generated buffers on neutral opt-in and explicit clear migration',()=>{
 const original=descriptor(),source=structuredClone(original),neutral=structuredClone(original);
 neutral.primitives[0]=migrateEllipsoidSectionShape(neutral.primitives[0],{schema:'sceliph.ellipsoid-section-shape/0.1',radialPower:2,axialPower:2});
 const cleared=structuredClone(neutral);cleared.primitives[0]=migrateEllipsoidSectionShape(cleared.primitives[0]);expect(cleared).toEqual(source);expect(original).toEqual(source);
 const a=polygonizeImplicitSurface(original).geometry,b=polygonizeImplicitSurface(neutral).geometry,c=polygonizeImplicitSurface(cleared).geometry;
 try{for(const key of ['position','normal']){expect(a.getAttribute(key).array).toEqual(b.getAttribute(key).array);expect(a.getAttribute(key).array).toEqual(c.getAttribute(key).array);}expect(a.index!.array).toEqual(b.index!.array);expect(a.index!.array).toEqual(c.index!.array);}finally{a.dispose();b.dispose();c.dispose();}
});
it('fails closed on malformed/version/unsupported primitive declarations',()=>{
 const valid={schema:'sceliph.ellipsoid-section-shape/0.1',radialPower:2,axialPower:2};
 for(const shape of [null,[],{}, {...valid,schema:'future'},{...valid,extra:true},{...valid,axialPower:1.49},{...valid,radialPower:4.01},{...valid,axialPower:NaN}]){
  const g=descriptor();(g.primitives[0] as any).sectionShape=shape;expect(()=>polygonizeImplicitSurface(g)).toThrow(/section shape/);
 }
 const g=descriptor();g.primitives[0]={id:'mass',type:'sphere',radius:10,sectionShape:valid as any};expect(()=>polygonizeImplicitSurface(g)).toThrow(/section shape/);
});
it('keeps stable axes/components/contacts across recipe, repeat generation, no-op and further radii edits',async()=>{
 const ir=createBirdPrimaryStudy({preserveContacts:true,taperedBeak:true}),before=structuredClone(ir);
 const steps=[{op:'ellipsoid-section-shape',componentId:'wing_left',primitiveId:'root',radialPower:2,axialPower:1.5},{op:'ellipsoid-section-shape',componentId:'wing_right',primitiveId:'root',radialPower:2,axialPower:1.5}];
 const text=JSON.stringify({schema:ASSEMBLY_PRIMARY_RECIPE_V3_SCHEMA,sourceFingerprint:await fingerprintAssemblyIR(ir),steps});
 const a=await applyAssemblyPrimaryRecipe(ir,text),b=await applyAssemblyPrimaryRecipe(ir,text);expect(a).toEqual(b);expect(ir).toEqual(before);expect(a.receipt.schema).toBe('sceliph.assembly-primary-receipt/0.3');expect(a.ir).toEqual(createBirdPrimaryStudy({preserveContacts:true,taperedBeak:true,shapedWings:true}));
 expect(a.ir.components.filter(c=>!c.id.startsWith('wing_'))).toEqual(ir.components.filter(c=>!c.id.startsWith('wing_')));expect(auditAssemblyContactWitnesses(a.ir)).toHaveLength(5);
 const reopened=JSON.parse(JSON.stringify(a.ir)),shape={schema:'sceliph.ellipsoid-section-shape/0.1' as const,radialPower:2,axialPower:1.5};expect(editImplicitEllipsoidSectionShape(reopened,'wing_left','root',shape)).toBe(reopened);
 const next=editImplicitEllipsoidRadii(reopened,'wing_left','root',[6,19,31]);expect(auditAssemblyContactWitnesses(next)).toHaveLength(5);
 for(const v of ['0.1','0.2'])await expect(applyAssemblyPrimaryRecipe(ir,text.replace('0.3',v))).rejects.toThrow();
 const bad=JSON.parse(text);bad.steps.push({...steps[0],componentId:'missing'});await expect(applyAssemblyPrimaryRecipe(ir,JSON.stringify(bad))).rejects.toThrow();expect(ir).toEqual(before);
});
it('blocks section changes that lose an existing head contact without moving or partially changing source',()=>{
 const ir=createBirdPrimaryStudy({preserveContacts:true,taperedBeak:true}),before=structuredClone(ir);
 expect(()=>editImplicitEllipsoidSectionShape(ir,'organic_core','head',{schema:'sceliph.ellipsoid-section-shape/0.1',radialPower:2,axialPower:1.5})).toThrow(/Contact/);expect(ir).toEqual(before);
});
