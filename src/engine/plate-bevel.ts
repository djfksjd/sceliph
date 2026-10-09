import type {DomainPack}from'./element-domain-packs';
import {centeredPlatePack,generateCenteredPlateProject}from'./centered-plate-pack';
import {editPart,validateProject,type ElementProject}from'./element-project';
export const PLATE_BEVEL_REVISION='sceliph.centered-plate-bevel/0.1';
/** Authoring operation, reusing the existing extrusion bevel. Caps are inset;
 * the land retains declared overall dimensions and polygonal bore radius. */
export function generateBeveledPlateProject(input:Readonly<Record<string,unknown>>):ElementProject{
 if(!input||typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw Error('Invalid bevel plate input');
 const radius=Object.hasOwn(input,'edgeBevelMm')?input.edgeBevelMm:.4;
 if(typeof radius!=='number'||!Number.isFinite(radius)||radius<0||radius>100)throw Error('Invalid edgeBevelMm');
 const base=generateCenteredPlateProject(Object.fromEntries(Object.entries(input).filter(([k])=>k!=='edgeBevelMm')));
 if(radius===0)return base;
 const g=base.parts[0].geometry!;if(g.op!=='extrude')throw Error('Plate extrusion expected');
 const w=g.points[1][0]-g.points[0][0],h=g.points[2][1]-g.points[1][1],t=g.depth,bore=Number(input.boreDiameterMm??4),sec=1/Math.cos(Math.PI/128);
 if(t-2*radius<.01||2*radius>=Math.min(w,h)||bore>0&&bore+2*radius*(sec+1)>=Math.min(w,h)-.02)throw Error('Bevel exceeds cap, wall or thickness clearance');
 const holes=bore===0?undefined:[Array.from({length:128},(_,i)=>{const a=-2*Math.PI*i/128,r=bore/2+radius*sec;return [r*Math.cos(a),r*Math.sin(a)]as[number,number];})];
 const next=editPart(base,'plate_body',{geometry:{op:'extrude',points:[[-w/2+radius,-h/2+radius],[w/2-radius,-h/2+radius],[w/2-radius,h/2-radius],[-w/2+radius,h/2-radius]],depth:t-2*radius,bevelSize:radius,bevelThickness:radius,bevelSegments:3,...(holes?{holes}:{})}});
 return validateProject({...next,parts:next.parts.map(p=>p.id==='plate_body'?{...p,evidence:{status:'authored',source:PLATE_BEVEL_REVISION+'; three-segment mesh bevel, compensated cap/wall profile; not CAD fillet or manufacturing tolerance'}}:p)});
}

export const beveledPlatePack:DomainPack={metadata:{...centeredPlatePack.metadata,id:'product.beveled-plate',parameters:{...centeredPlatePack.metadata.parameters,dimensions:{...centeredPlatePack.metadata.parameters.dimensions,edgeBevelMm:{min:0,max:100,default:.4}}},parameterNotes:[...(centeredPlatePack.metadata.parameterNotes??[]),'Three-segment mesh bevel. Overall dimensions and polygonal bore land retained; not a CAD fillet.','Bevel must fit thickness and remaining wall clearance; zero preserves the original plate. Generate creates a new project; save current edits first.']},generate:generateBeveledPlateProject};
