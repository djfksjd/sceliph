import {expect,it} from 'vitest';
import {projectionUvScalarForTileMm} from '../src/engine/projection-uv-tile';
import {generateSpurGearProject} from '../src/engine/gear-pack';
import {migrateElementProjectToV4,editPart,parseProject,serializeProject,ElementHistory} from '../src/engine/element-project';
import {exportSelectedScene} from '../src/engine/element-renderer';
import {inspectUvQuality} from '../src/engine/uv-quality';
import {Mesh} from 'three';
it('converts physical local projection axes to existing UV scalar and rejects unsafe tile sizes',()=>{
 expect(projectionUvScalarForTileMm(10)).toBe(100);expect(projectionUvScalarForTileMm(1)).toBe(1000);expect(projectionUvScalarForTileMm(1e6)).toBe(.001);
 for(const n of [0,-1,NaN,Infinity,.99,1e6+1])expect(()=>projectionUvScalarForTileMm(n)).toThrow();
});
it('changes actual UV only for three scales and a different tooth count, with native source reopen/history',async()=>{
 for(const input of [{moduleMm:.5,faceWidthMm:4,boreDiameterMm:3},{},{moduleMm:2,faceWidthMm:16,boreDiameterMm:12},{toothCount:36}]){
  const p=migrateElementProjectToV4(generateSpurGearProject(input)),q=editPart(p,p.parts[0].id,{uvScale:projectionUvScalarForTileMm(10)}),a=exportSelectedScene(p,[p.parts[0].id]),b=exportSelectedScene(parseProject(serializeProject(q)),[q.parts[0].id]);
  try{const x=a.root.getObjectByName(p.parts[0].id) as Mesh,y=b.root.getObjectByName(p.parts[0].id) as Mesh;
   for(const k of ['position','normal'])expect(y.geometry.getAttribute(k).array).toEqual(x.geometry.getAttribute(k).array);expect(y.geometry.index?.array).toEqual(x.geometry.index?.array);expect(y.matrix.elements).toEqual(x.matrix.elements);
   const u=x.geometry.getAttribute('uv'),v=y.geometry.getAttribute('uv');for(let i=0;i<u.array.length;i++)expect(v.array[i]).toBe(Math.fround(u.array[i]*100));
   const r=await inspectUvQuality(b.root,{overlapPairBudgetPerMesh:100});expect(r.integrityPass).toBe(true);expect(r.meshes[0].features.every(f=>f.integrityPass)).toBe(true);
   const h=new ElementHistory(p);h.commit(q);expect(h.undo()).toEqual(p);expect(h.redo()).toEqual(q);
  }finally{a.dispose();b.dispose();}
 }
});
