import {expect,it} from 'vitest';
import {createBirdProject} from '../src/engine/bird-element-demo';
import {alignEllipsoidAnchors} from '../src/engine/element-anchor-align';
import {editPart,parseProject,serializeProject} from '../src/engine/element-project';
it('closes authored foot/leg anchor gaps in mm, preserves every unrelated property and is idempotent',()=>{
 const p=createBirdProject(),before=structuredClone(p),next=alignEllipsoidAnchors(p,'foot_left',[0,.5,0],'leg_left',[0,-.5,0]);
 const foot=next.parts.find(x=>x.id==='foot_left')!,leg=next.parts.find(x=>x.id==='leg_left')!;
 expect(foot.position).toEqual([leg.position[0],leg.position[1]-leg.scale[1]/2-foot.scale[1]/2,leg.position[2]]);
 expect(next.parts.filter(x=>x.id!=='foot_left')).toEqual(p.parts.filter(x=>x.id!=='foot_left'));expect(next.groups).toEqual(p.groups);
 expect({...foot,position:before.parts.find(x=>x.id==='foot_left')!.position}).toEqual(before.parts.find(x=>x.id==='foot_left'));
 expect(p).toEqual(before);expect(serializeProject(alignEllipsoidAnchors(next,'foot_left',[0,.5,0],'leg_left',[0,-.5,0]))).toBe(serializeProject(next));
 expect(parseProject(serializeProject(next))).toEqual(next);
});
it('handles changed scales and rotated parents without modifying the reference',()=>{
 let p=editPart(createBirdProject(),'leg_left',{rotation:[0,0,Math.PI/2],scale:[8,70,8]});p=editPart(p,'foot_left',{rotation:[0,0,Math.PI/2],scale:[20,10,40]});
 const next=alignEllipsoidAnchors(p,'foot_left',[0,.5,0],'leg_left',[0,-.5,0]);expect(next.parts.find(x=>x.id==='foot_left')!.position[0]).toBeCloseTo(-23+35+5,10);expect(next.parts.find(x=>x.id==='leg_left')).toEqual(p.parts.find(x=>x.id==='leg_left'));
});
it('rejects locks, non-surface anchors, same parts and non-opposed normals',()=>{
 const p=createBirdProject();expect(()=>alignEllipsoidAnchors(editPart(p,'foot_left',{locked:true}),'foot_left',[0,.5,0],'leg_left',[0,-.5,0])).toThrow(/locked/);
 expect(()=>alignEllipsoidAnchors(p,'foot_left',[0,0,0],'leg_left',[0,-.5,0])).toThrow(/anchorNotOnEllipsoid/);
 expect(()=>alignEllipsoidAnchors(p,'foot_left',[0,.5,0],'leg_left',[0,.5,0])).toThrow(/anchorNormalsNotOpposed/);
 expect(()=>alignEllipsoidAnchors(p,'foot_left',[0,.5,0],'foot_left',[0,-.5,0])).toThrow(/unsupportedAnchorParts/);
});
