import {expect,it,vi} from 'vitest';
import {createBirdPrimaryStudy} from '../src/engine/bird-primary-study';
import * as compiler from '../src/engine/assembly-compiler';
import {auditAssemblyContactWitnesses,CONTACT_WITNESS_SCHEMA,inspectContactWitnessCache} from '../src/engine/assembly-contact-witness';

function fixture(name:string){
 const ir=createBirdPrimaryStudy();ir.name=name;ir.components=ir.components.slice(0,2);
 for(const c of ir.components){c.geometry={op:'roundedBox',size:[20,20,20],radius:0,segments:3};c.position=[0,0,0];c.rotation=[0,0,0];c.scale=[1,1,1];}
 ir.metadata!.sceliphContactWitnesses=JSON.stringify({schema:CONTACT_WITNESS_SCHEMA,witnesses:[{id:'socket',ownerId:ir.components[1].id,hostId:ir.components[0].id,ownerLocalMm:[0,0,0],minimumClearanceMm:.1}]});
 return ir;
}
it('reuses a successful identical JSON input without recompiling and returns independent measurements',()=>{
 const ir=fixture('cache-identical'),spy=vi.spyOn(compiler,'compileAssemblyGeometry');
 try{
  const a=auditAssemblyContactWitnesses(ir),count=spy.mock.calls.length;
  expect(count).toBe(2);const b=auditAssemblyContactWitnesses(JSON.parse(JSON.stringify(ir)));
  expect(b).toEqual(a);expect(spy.mock.calls.length).toBe(count);
  a[0].ownerClearanceMm=-1;a[0].id='poisoned';a.length=0;
  expect(auditAssemblyContactWitnesses(ir)).toEqual(b);
 }finally{spy.mockRestore();}
});
it('rechecks changed actual geometry and transforms after a successful result',()=>{
 const ir=fixture('cache-geometry');auditAssemblyContactWitnesses(ir);
 ir.components[0].position![0]=100;expect(()=>auditAssemblyContactWitnesses(ir)).toThrow(/socket/);
 ir.components[0].position![0]=0;ir.components[0].geometry={op:'roundedBox',size:[.1,.1,.1],radius:0,segments:3};
 expect(()=>auditAssemblyContactWitnesses(ir)).toThrow(/socket/);
});
it('rechecks changed witness location, clearance and version without retaining failures',()=>{
 const ir=fixture('cache-witness');auditAssemblyContactWitnesses(ir);const original=ir.metadata!.sceliphContactWitnesses;
 for(const patch of [{ownerLocalMm:[100,0,0]},{minimumClearanceMm:20}]){
  const d=JSON.parse(original as string);Object.assign(d.witnesses[0],patch);ir.metadata!.sceliphContactWitnesses=JSON.stringify(d);
  expect(()=>auditAssemblyContactWitnesses(ir)).toThrow(/socket/);
 }
 ir.metadata!.sceliphContactWitnesses=String(original).replace('0.1','future');expect(()=>auditAssemblyContactWitnesses(ir)).toThrow(/version/);
 ir.metadata!.sceliphContactWitnesses=original;expect(auditAssemblyContactWitnesses(ir)).toHaveLength(1);
});
it('validates unrelated source fields even after the relevant geometry passed',()=>{
 const ir=fixture('cache-validation');auditAssemblyContactWitnesses(ir);ir.units='m' as any;
 expect(()=>auditAssemblyContactWitnesses(ir)).toThrow();
});
it('does not conflate signed zero while preserving its unchanged measurements',()=>{
 const ir=fixture('cache-signed-zero'),spy=vi.spyOn(compiler,'compileAssemblyGeometry');
 try{const a=auditAssemblyContactWitnesses(ir);const count=spy.mock.calls.length;ir.components[0].position![0]=-0;
  expect(auditAssemblyContactWitnesses(ir)).toEqual(a);expect(spy.mock.calls.length).toBe(count+2);
 }finally{spy.mockRestore();}
});
it('bounds both entry count and retained string payload, and recomputes an evicted input',()=>{
 const first=fixture('cache-eviction-first');auditAssemblyContactWitnesses(first);
 for(let i=0;i<20;i++)auditAssemblyContactWitnesses(fixture(`cache-eviction-${i}`));
 const spy=vi.spyOn(compiler,'compileAssemblyGeometry');
 try{auditAssemblyContactWitnesses(first);expect(spy.mock.calls.length).toBe(2);}finally{spy.mockRestore();}
 for(let i=0;i<5;i++){
  const ir=fixture(`cache-byte-eviction-${i}`);
  for(let k=0;k<60;k++)ir.metadata![`padding_${k}`]='x'.repeat(1800);
  auditAssemblyContactWitnesses(ir);
 }
 const stats=inspectContactWitnessCache();expect(stats.entries).toBeLessThanOrEqual(stats.maximumEntries);
 expect(stats.payloadBytes).toBeLessThanOrEqual(stats.maximumPayloadBytes);expect(stats.entries).toBeLessThan(5);
});
it('bypasses cache for non-JSON properties without silently changing existing acceptance',()=>{
 const ir=fixture('cache-undefined'),spy=vi.spyOn(compiler,'compileAssemblyGeometry');
 (ir as any).nonJson=undefined;
 try{const a=auditAssemblyContactWitnesses(ir),count=spy.mock.calls.length;expect(auditAssemblyContactWitnesses(ir)).toEqual(a);expect(spy.mock.calls.length).toBe(count+2);}finally{spy.mockRestore();}
});
it('keeps the original per-mesh triangle budget after a successful smaller input',()=>{
 const ir=fixture('cache-triangle-budget');auditAssemblyContactWitnesses(ir);
 ir.components[0].geometry={op:'sphere',radius:10,widthSegments:256,heightSegments:128};
 expect(()=>auditAssemblyContactWitnesses(ir)).toThrow(/triangle budget/);
});
it('bypasses oversized keys rather than rejecting previously supported source',()=>{
 const ir=fixture('cache-large-key'),spy=vi.spyOn(compiler,'compileAssemblyGeometry');
 for(let k=0;k<100;k++)ir.metadata![`padding_${k}`]='x'.repeat(1800);
 try{const a=auditAssemblyContactWitnesses(ir),count=spy.mock.calls.length;expect(auditAssemblyContactWitnesses(ir)).toEqual(a);expect(spy.mock.calls.length).toBe(count+2);}finally{spy.mockRestore();}
});
