import { Euler, Quaternion, Vector3 } from 'three';
import { editPart, ProjectError, validateProject, type ElementProject, type Vec3 } from './element-project';

/** Align two analytic ellipsoid surface anchors. Fractions are owner-local full-scale fractions, units mm. */
export function alignEllipsoidAnchors(project:ElementProject,targetId:string,targetAnchor:Vec3,referenceId:string,referenceAnchor:Vec3):ElementProject{
 validateProject(project);
 const target=project.parts.find(p=>p.id===targetId),reference=project.parts.find(p=>p.id===referenceId);
 if(!target||!reference||targetId===referenceId||target.shape!=='ellipsoid'||reference.shape!=='ellipsoid'||target.geometry||reference.geometry)throw new ProjectError('unsupportedAnchorParts',targetId);
 for(const a of [targetAnchor,referenceAnchor])if(!Array.isArray(a)||a.length!==3||!a.every(Number.isFinite)||Math.abs(a.reduce((s,v)=>s+4*v*v,0)-1)>1e-12)throw new ProjectError('anchorNotOnEllipsoid',targetId);
 const tq=new Quaternion().setFromEuler(new Euler(...target.rotation)),rq=new Quaternion().setFromEuler(new Euler(...reference.rotation));
 const tn=new Vector3(...targetAnchor.map((v,i)=>v/target.scale[i])).normalize().applyQuaternion(tq),rn=new Vector3(...referenceAnchor.map((v,i)=>v/reference.scale[i])).normalize().applyQuaternion(rq);
 if(tn.dot(rn)>-1+1e-10)throw new ProjectError('anchorNormalsNotOpposed',targetId);
 const destination=new Vector3(...referenceAnchor.map((v,i)=>v*reference.scale[i])).applyQuaternion(rq).add(new Vector3(...reference.position));
 const offset=new Vector3(...targetAnchor.map((v,i)=>v*target.scale[i])).applyQuaternion(tq);
 const position=destination.sub(offset);
 return editPart(project,targetId,{position:[position.x,position.y,position.z]});
}
