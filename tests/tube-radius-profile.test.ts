import { expect, it } from 'vitest';
import { Vector3 } from 'three';
import { compileAssemblyGeometry } from '../src/engine/assembly-compiler';
import type { AssemblyGeometryIR } from '../src/engine/assembly-ir';
import { createTubePath } from '../src/engine/tube-quadratic-curve';
const fixture = () => ({op:'tube',points:[[0,0,0],[0,-4,22]],radius:6,tubularSegments:32,radialSegments:24,capFinish:'flat-outward',curve:{schema:'morphloom.tube-quadratic-bezier/0.1',controlPointMm:[0,0,12]},radiusProfile:{schema:'sceliph.tube-radius-profile/0.1',stations:[[0,6],[.5,3],[1,.6]]}} as unknown as Extract<AssemblyGeometryIR,{op:'tube'}>);
it('uses declared arc-length station radii in actual generated rings',()=>{
 const source=fixture(),g=compileAssemblyGeometry(source),path=createTubePath(source),p=g.getAttribute('position');
 try{for(const [row,r] of [[0,6],[16,3],[32,.6]]){const v=new Vector3().fromBufferAttribute(p,row*25);expect(v.distanceTo(path.getPointAt(row/32))*1000).toBeCloseTo(r,4);}}finally{g.dispose();}
});
import { Mesh, MeshBasicMaterial } from 'three';
import { migrateTubeRadiusProfile } from '../src/engine/tube-radius-profile';
import { analyzeTopology } from '../src/engine/topology';
import { createBirdPrimaryStudy } from '../src/engine/bird-primary-study';
import { auditAssemblyContactWitnesses } from '../src/engine/assembly-contact-witness';
import { editTubeRadiusProfile } from '../src/engine/tube-radius-profile-edit';
import { applyAssemblyPrimaryRecipe, ASSEMBLY_PRIMARY_RECIPE_V2_SCHEMA } from '../src/engine/assembly-primary-recipe';
import { fingerprintAssemblyIR } from '../src/engine/assembly-edit';
it.each([.5,1,4])('produces closed finite seams, correct cap UV and deterministic arrays at scale %s',scale=>{
 const s=fixture();s.points=s.points.map(p=>p.map(v=>v*scale) as [number,number,number]);s.curve!.controlPointMm=s.curve!.controlPointMm.map(v=>v*scale) as [number,number,number];s.radius*=scale;s.radiusProfile!.stations=s.radiusProfile!.stations.map(([u,r])=>[u,r*scale]);
 const a=compileAssemblyGeometry(s),b=compileAssemblyGeometry(JSON.parse(JSON.stringify(s))),m=new MeshBasicMaterial();
 try{expect(analyzeTopology(new Mesh(a,m)).pass).toBe(true);for(const key of ['position','normal','uv'])expect(a.getAttribute(key).array).toEqual(b.getAttribute(key).array);expect(a.index!.array).toEqual(b.index!.array);
  const n=a.getAttribute('normal'),uv=a.getAttribute('uv');for(let row=0;row<=32;row++){expect(new Vector3().fromBufferAttribute(n,row*25).toArray()).toEqual(new Vector3().fromBufferAttribute(n,row*25+24).toArray());}
  for(let i=0;i<n.count;i++)expect(new Vector3().fromBufferAttribute(n,i).length()).toBeCloseTo(1,5);
  // Duplicated end cap ring retains a full disc mapping despite its small physical radius.
  const endCap=33*25+2+25;const values=Array.from({length:25},(_,j)=>uv.getX(endCap+j));expect(Math.min(...values)).toBeCloseTo(0,5);expect(Math.max(...values)).toBeCloseTo(1,5);
 }finally{a.dispose();b.dispose();m.dispose();}
});
it('opt-in/clear migration preserves legacy geometry bytes without mutating the source',()=>{
 const legacy=fixture();delete legacy.radiusProfile;const before=structuredClone(legacy),declared=migrateTubeRadiusProfile(legacy,[[0,6],[1,.6]]),cleared=migrateTubeRadiusProfile(declared);
 expect(legacy).toEqual(before);expect(cleared).toEqual(legacy);const a=compileAssemblyGeometry(legacy),b=compileAssemblyGeometry(cleared);
 try{for(const key of ['position','normal','uv'])expect(a.getAttribute(key).array).toEqual(b.getAttribute(key).array);expect(a.index!.array).toEqual(b.index!.array);}finally{a.dispose();b.dispose();}
});
it('rejects unsupported, malformed, unbounded and unaligned taper declarations',()=>{
 const g=fixture(),profile=g.radiusProfile!;
 const bad=[null,{}, {...profile,schema:'future'},{...profile,extra:true},{...profile,stations:[[0,6],[1,0]]},{...profile,stations:[[0,6],[.5,2],[1,3]]},{...profile,stations:[[0,5],[1,.6]]},{...profile,stations:[[0,6],[.51,3],[1,.6]]},{...profile,stations:[[0,6],[0,3],[1,.6]]},{...profile,stations:[[0,6],[1,NaN]]}];
 for(const radiusProfile of bad)expect(()=>compileAssemblyGeometry({...g,radiusProfile} as never)).toThrow();
 for(const change of [{closed:true},{curve:undefined},{capFinish:undefined},{tubularSegments:512},{radialSegments:256}])expect(()=>compileAssemblyGeometry({...g,...change} as never)).toThrow();
});
it('edits a curved beak via versioned recipe with contacts, non-targets, reopen and no-op preserved',async()=>{
 const ir=createBirdPrimaryStudy({preserveContacts:true,taperedBeak:true}),before=structuredClone(ir),stations:Array<[number,number]>=[[0,6],[.25,4.5],[.5,2.8],[.75,1.4],[1,.4]];
 expect(auditAssemblyContactWitnesses(ir)).toHaveLength(5);
 const text=JSON.stringify({schema:ASSEMBLY_PRIMARY_RECIPE_V2_SCHEMA,sourceFingerprint:await fingerprintAssemblyIR(ir),steps:[{op:'tube-radius-profile',componentId:'beak',stations}]});
 const a=await applyAssemblyPrimaryRecipe(ir,text),b=await applyAssemblyPrimaryRecipe(ir,text);expect(a).toEqual(b);expect(ir).toEqual(before);expect(a.ir.components.filter(c=>c.id!=='beak')).toEqual(ir.components.filter(c=>c.id!=='beak'));expect(a.receipt.schema).toBe('sceliph.assembly-primary-receipt/0.2');
 const reopened=JSON.parse(JSON.stringify(a.ir));expect(editTubeRadiusProfile(reopened,'beak',stations)).toBe(reopened);
 await expect(applyAssemblyPrimaryRecipe(ir,text.replace('/0.2','/0.1'))).rejects.toThrow();
 const bad=JSON.parse(text);bad.steps.push({op:'tube-radius-profile',componentId:'missing',stations});await expect(applyAssemblyPrimaryRecipe(ir,JSON.stringify(bad))).rejects.toThrow();expect(ir).toEqual(before);
});
