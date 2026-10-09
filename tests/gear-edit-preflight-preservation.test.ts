import {afterEach,expect,it,vi} from 'vitest';
import {Mesh} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {generateSpurGearProject} from '../src/engine/gear-pack';
import {gearEditPreflight} from '../src/engine/gear-edit-preflight';
import {editPart,parseProject,serializeProject,validateProject,ElementHistory,type ElementProject} from '../src/engine/element-project';
import {prepareElementExportSource} from '../src/engine/element-export-source';
import {exportSelectedScene} from '../src/engine/element-renderer';
import type {SpurGearGeometry} from '../src/engine/spur-gear';
afterEach(()=>vi.unstubAllGlobals());
async function glb(p:ElementProject){
 vi.stubGlobal('FileReader',class{result:unknown;onloadend?:()=>void;async readAsArrayBuffer(b:Blob){this.result=await b.arrayBuffer();this.onloadend?.();}});
 const built=exportSelectedScene(prepareElementExportSource(p),p.parts.map(x=>x.id));
 try{return Buffer.from(await new GLTFExporter().parseAsync(built.root,{binary:true}) as ArrayBuffer);}finally{built.dispose();}
}
for(const [moduleMm,toothCount] of [[.5,24],[1,24],[2,24],[1,36]])it(`preflight + mm translation preserves actual buffers and repeated GLB after source reopen ${moduleMm}/${toothCount}`,async()=>{
 const generated=generateSpurGearProject({moduleMm,toothCount,boreDiameterMm:2});
 const p=validateProject({...generated,parts:[generated.parts[0],{...structuredClone(generated.parts[0]),id:'untouched',position:[60,0,0],color:'#304050'}]});
 const original=serializeProject(p),target=p.parts[0];
 expect(gearEditPreflight(target.geometry as SpurGearGeometry,0).valid).toBe(true);
 const moved=editPart(p,target.id,{position:[12,-3,5]}),reopened=parseProject(serializeProject(moved));
 expect(reopened.parts[1]).toEqual(p.parts[1]);expect(serializeProject(p)).toBe(original);
 const a=exportSelectedScene(p,p.parts.map(x=>x.id)),b=exportSelectedScene(reopened,reopened.parts.map(x=>x.id));
 try{
  for(const id of [target.id,'untouched']){
   const x=a.root.getObjectByName(id) as Mesh,y=b.root.getObjectByName(id) as Mesh;
   for(const key of ['position','normal','uv']){
    const aa=x.geometry.getAttribute(key).array,bb=y.geometry.getAttribute(key).array;
    expect(Buffer.from(bb.buffer,bb.byteOffset,bb.byteLength).equals(Buffer.from(aa.buffer,aa.byteOffset,aa.byteLength))).toBe(true);
   }
   expect(y.geometry.index?.array??null).toEqual(x.geometry.index?.array??null);
   expect(y.parent?.name).toBe(x.parent?.name);
   const xm=Array.isArray(x.material)?x.material[0]:x.material,ym=Array.isArray(y.material)?y.material[0]:y.material;
   const {uuid: _x,...materialX}=xm.toJSON(),{uuid: _y,...materialY}=ym.toJSON();
   expect(materialY).toEqual(materialX);
   if(id===target.id)expect(y.position.toArray()).toEqual([.012,-.003,.005]);
   else expect(y.matrix.elements).toEqual(x.matrix.elements);
  }
 }finally{a.dispose();b.dispose();}
 const first=await glb(reopened);expect((await glb(parseProject(serializeProject(reopened)))).equals(first)).toBe(true);
 const unchanged=editPart(reopened,target.id,{position:[12,-3,5]});expect((await glb(unchanged)).equals(first)).toBe(true);
 const further=editPart(reopened,target.id,{position:[14,-3,5]});expect(parseProject(serializeProject(further)).parts[0].position).toEqual([14,-3,5]);
 const history=new ElementHistory(p);history.commit(moved);history.commit(further);expect(history.undo()).toEqual(moved);expect(history.undo()).toEqual(p);expect(history.redo()).toEqual(moved);
});
