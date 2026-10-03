import {expect,it}from 'vitest';import {readFileSync}from 'node:fs';import {Mesh}from 'three';import {compileAssemblyIR}from '../src/engine/assembly-compiler';import {chamferLatheCorner}from '../src/engine/lathe-chamfer';import {migrateLatheNormalPolicy}from '../src/engine/lathe-normal-policy';
it('preserves actual flat caps and circumferential cylindrical normals independently for oblique chamfers',()=>{for(const drop of [1,4,8]){const ir=JSON.parse(readFileSync('benchmarks/modeling-slices-20261004/lathe-segment-edit/default-after.json','utf8'));ir.components[0].geometry.profile=[[8,-6],[8,6],[10,6],[14,6-drop],[14,-6],[8,-6]];ir.components[0].geometry=chamferLatheCorner(ir.components[0].geometry,2,.5);ir.components[0].geometry=migrateLatheNormalPolicy(ir.components[0].geometry,{schema:'morphloom.lathe-normals/0.2',weighting:'profile-surfaces'} as never);const b=compileAssemblyIR(ir,'beauty');try{const g=(b.root.getObjectByName('bushing')as Mesh).geometry,p=g.getAttribute('position'),n=g.getAttribute('normal');let caps=0,cylinders=0;for(let i=0;i<p.count;i+=3){if(p.getY(i)===p.getY(i+1)&&p.getY(i+1)===p.getY(i+2)&&Math.abs(p.getY(i)-.006)<1e-8){caps++;for(let j=0;j<3;j++){const k=i+j,cos=Math.abs(n.getY(k))/Math.hypot(n.getX(k),n.getY(k),n.getZ(k));expect(Math.acos(Math.min(1,cos))*180/Math.PI).toBeLessThanOrEqual(.01)}}}for(let i=0;i<p.count;i+=3){if(p.getY(i)===p.getY(i+1)&&p.getY(i+1)===p.getY(i+2))continue;if([0,1,2].every(j=>Math.abs(Math.hypot(p.getX(i+j),p.getZ(i+j))-.008)<1e-8)){cylinders++;for(let j=0;j<3;j++){const k=i+j,r=Math.hypot(p.getX(k),p.getZ(k)),len=Math.hypot(n.getX(k),n.getY(k),n.getZ(k)),cos=Math.abs((n.getX(k)*p.getX(k)+n.getZ(k)*p.getZ(k))/r)/len;expect(Math.acos(Math.min(1,cos))*180/Math.PI).toBeLessThanOrEqual(.01)}}}expect(cylinders).toBeGreaterThan(0);expect(caps).toBeGreaterThan(0);expect(b.metrics.topology.pass).toBe(true)}finally{b.root.traverse(x=>{if(x instanceof Mesh){x.geometry.dispose();for(const m of Array.isArray(x.material)?x.material:[x.material])m.dispose()}})}}});

it('rejects ambiguous version declarations and restores the legacy declaration explicitly',()=>{
 const ir=JSON.parse(readFileSync('benchmarks/modeling-slices-20261004/lathe-segment-edit/default-after.json','utf8'));
 const original=ir.components[0].geometry;
 for(const policy of [
  {schema:'morphloom.lathe-normals/0.2',weighting:'profile-surfaces',creaseAngleRad:.5},
  {schema:'morphloom.lathe-normals/0.2',weighting:'corner-angle'},
  {schema:'morphloom.lathe-normals/0.3',weighting:'profile-surfaces'},
 ])expect(()=>migrateLatheNormalPolicy(original,policy as never)).toThrow('Invalid lathe normal policy');
 const next=migrateLatheNormalPolicy(original,{schema:'morphloom.lathe-normals/0.2',weighting:'profile-surfaces'});
 expect(original.normalPolicy.schema).toBe('morphloom.lathe-normals/0.1');
 expect(migrateLatheNormalPolicy(next,original.normalPolicy)).toEqual(original);
 expect(migrateLatheNormalPolicy(next,undefined)).not.toHaveProperty('normalPolicy');
});

it('keeps actual position, UV and index bytes and generates finite deterministic pole normals',()=>{
 const base=JSON.parse(readFileSync('benchmarks/modeling-slices-20261004/lathe-segment-edit/default-after.json','utf8'));
 for(const profile of [base.components[0].geometry.profile,[[0,6],[14,0],[14,-6],[0,-6]]]){
  const legacy=structuredClone(base);legacy.components[0].geometry.profile=profile;
  const next=structuredClone(legacy);next.components[0].geometry=migrateLatheNormalPolicy(next.components[0].geometry,{schema:'morphloom.lathe-normals/0.2',weighting:'profile-surfaces'});
  const builds=[compileAssemblyIR(legacy,'beauty'),compileAssemblyIR(next,'beauty'),compileAssemblyIR(next,'beauty')];
  try{
   const geometries=builds.map(b=>(b.root.getObjectByName('bushing') as Mesh).geometry);
   for(const key of ['position','uv'])expect(Array.from(geometries[1].getAttribute(key).array)).toEqual(Array.from(geometries[0].getAttribute(key).array));
   expect(geometries[1].index).toEqual(geometries[0].index);
   const n=geometries[1].getAttribute('normal');expect(Array.from(n.array)).toEqual(Array.from(geometries[2].getAttribute('normal').array));
   for(let i=0;i<n.count;i++)expect(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))).toBeCloseTo(1,6);
   expect(builds[1].metrics.topology.pass).toBe(true);
  }finally{for(const b of builds)b.root.traverse(x=>{if(x instanceof Mesh){x.geometry.dispose();for(const m of Array.isArray(x.material)?x.material:[x.material])m.dispose()}})}
 }
});
