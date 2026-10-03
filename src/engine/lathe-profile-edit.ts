import {Mesh,MeshBasicMaterial} from 'three';
import type {AssemblyIR} from './assembly-ir';
import {applyAssemblyComponentPatch,fingerprintAssemblyIR} from './assembly-edit';
import {compileAssemblyGeometry} from './assembly-compiler';
import {latheSegmentEditBlocker} from './lathe-segment-edit';
import {analyzeTopology} from './topology';
export async function editLatheProfile(ir:AssemblyIR,componentId:string,points:Array<[number,number]>):Promise<AssemblyIR>{
 const c=ir.components.find(x=>x.id===componentId);if(!c||c.geometry.op!=='lathe')throw new Error('Lathe profile target is missing.');
 const reason=latheSegmentEditBlocker(ir,c);if(reason)throw new Error(reason);
 const g=c.geometry;if(g.profile.length>128||points.length!==g.profile.length||(g.profile.length-1)*(g.segments??64)*2>10000)throw new Error('Interactive lathe profile edit exceeds point/triangle budget.');
 if(points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>100000)||p[0]<0))throw new Error('Lathe profile requires finite radius 0..100000 and height -100000..100000 mm.');
 const edited=points.map(p=>[...p] as [number,number]),last=g.profile.length-1;
 const equal=(a:number[],b:number[])=>a[0]===b[0]&&a[1]===b[1];
 if(equal(g.profile[0],g.profile[last])){
  const firstChanged=!equal(edited[0],g.profile[0]),lastChanged=!equal(edited[last],g.profile[last]);
  if(firstChanged&&lastChanged&&!equal(edited[0],edited[last]))throw new Error('Closed profile endpoints conflict.');
  if(firstChanged)edited[last]=[...edited[0]];else if(lastChanged)edited[0]=[...edited[last]];
 }
 const deltas=edited.flatMap((p,i)=>equal(p,g.profile[i])?[]:[{pointIndex:i,deltaMm:[p[0]-g.profile[i][0],p[1]-g.profile[i][1]] as [number,number]}]);
 if(!deltas.length)return ir;
 const result=await applyAssemblyComponentPatch(ir,{schema:'morphloom.component-patch/0.2',operationId:'ui-lathe-profile-'+componentId,componentId,expectedInputFingerprint:await fingerprintAssemblyIR(ir),geometry:{operation:'lathe-profile-deltas',deltas}});
 const next=result.ir.components.find(x=>x.id===componentId)!;
 const geometry=compileAssemblyGeometry(next.geometry),material=new MeshBasicMaterial();
 try{const topology=analyzeTopology(new Mesh(geometry,material));if(!topology.pass)throw new Error('Edited lathe profile is not a verified closed solid (boundary, degenerate or self-intersection).');}finally{geometry.dispose();material.dispose();}
 return result.ir;
}
