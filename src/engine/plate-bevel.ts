import type {DomainPack}from'./element-domain-packs';
import {centeredPlatePack,generateCenteredPlateProject,generateDeterministicCenteredPlateProject}from'./centered-plate-pack';
import {editPart,validateProject,type ElementProject}from'./element-project';
import {deterministicPlateBorePoint,PLATE_ARITHMETIC_REVISION,PLATE_BEVEL_SECANT} from './plate-arithmetic';
export const PLATE_BEVEL_REVISION='sceliph.centered-plate-bevel/0.1';
/** Authoring operation, reusing the existing extrusion bevel. Caps are inset;
 * the land retains declared overall dimensions and polygonal bore radius. */
export function generateBeveledPlateProject(input:Readonly<Record<string,unknown>>):ElementProject{
 return generateBeveledPlate(input,false);
}
function generateBeveledPlate(input:Readonly<Record<string,unknown>>,deterministic:boolean):ElementProject{
 if(!input||typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw Error('Invalid bevel plate input');
 const radius=Object.hasOwn(input,'edgeBevelMm')?input.edgeBevelMm:.4;
 if(typeof radius!=='number'||!Number.isFinite(radius)||radius<0||radius>100)throw Error('Invalid edgeBevelMm');
 const base=(deterministic?generateDeterministicCenteredPlateProject:generateCenteredPlateProject)(Object.fromEntries(Object.entries(input).filter(([k])=>k!=='edgeBevelMm')));
 if(radius===0)return base;
 const g=base.parts[0].geometry!;if(g.op!=='extrude')throw Error('Plate extrusion expected');
 const w=g.points[1][0]-g.points[0][0],h=g.points[2][1]-g.points[1][1],t=g.depth,bore=Number(input.boreDiameterMm??4),sec=deterministic?PLATE_BEVEL_SECANT:1/Math.cos(Math.PI/128);
 if(t-2*radius<.01||2*radius>=Math.min(w,h)||bore>0&&bore+2*radius*(sec+1)>=Math.min(w,h)-.02)throw Error('Bevel exceeds cap, wall or thickness clearance');
 const holes=bore===0?undefined:[Array.from({length:128},(_,i)=>{const a=-2*Math.PI*i/128,r=bore/2+radius*sec;if(deterministic)return deterministicPlateBorePoint(r,i);return [r*Math.cos(a),r*Math.sin(a)]as[number,number];})];
 const next=editPart(base,'plate_body',{geometry:{op:'extrude',points:[[-w/2+radius,-h/2+radius],[w/2-radius,-h/2+radius],[w/2-radius,h/2-radius],[-w/2+radius,h/2-radius]],depth:t-2*radius,bevelSize:radius,bevelThickness:radius,bevelSegments:3,...(holes?{holes}:{})}});
 return validateProject({...next,parts:next.parts.map(p=>p.id==='plate_body'?{...p,evidence:{status:'authored',source:PLATE_BEVEL_REVISION+'; three-segment mesh bevel, compensated cap/wall profile; not CAD fillet or manufacturing tolerance'+(deterministic?'; '+PLATE_ARITHMETIC_REVISION:'')}}:p)});
}

export const beveledPlatePack:DomainPack={metadata:{...centeredPlatePack.metadata,id:'product.beveled-plate',parameters:{...centeredPlatePack.metadata.parameters,dimensions:{...centeredPlatePack.metadata.parameters.dimensions,edgeBevelMm:{min:0,max:100,default:.4}}},parameterNotes:[...(centeredPlatePack.metadata.parameterNotes??[]),'Three-segment mesh bevel. Overall dimensions and polygonal bore land retained; not a CAD fillet.','Bevel must fit thickness and remaining wall clearance; zero preserves the original plate. Generate creates a new project; save current edits first.']},generate:generateBeveledPlateProject};

/** Separate opt-in generator: legacy pack output and source remain unchanged. */
export const qualityBeveledPlatePack:DomainPack={metadata:{...beveledPlatePack.metadata,id:'product.quality-beveled-plate',parameterNotes:[...(beveledPlatePack.metadata.parameterNotes??[]),'Explicit quality-diagonal-v1 cap policy: bounded planar edge flips preserve boundary vertices, walls and surface area; ordinary topology/UV gates still apply.']},generate:input=>{
 const project=generateBeveledPlateProject(input),part=project.parts[0];
 if(part.geometry?.op!=='extrude')throw Error('Plate extrusion expected');
 return editPart(project,part.id,{geometry:{...part.geometry,capTriangulation:'quality-diagonal-v1'}});
}};

export function generateDeterministicBeveledPlateProject(input:Readonly<Record<string,unknown>>):ElementProject{
 const project=generateBeveledPlate(input,true),part=project.parts[0];
 if(part.geometry?.op!=='extrude')throw Error('Plate extrusion expected');
 return editPart(project,part.id,{geometry:{...part.geometry,capTriangulation:'quality-diagonal-v1'}});
}
/** New pack identity avoids silently rewriting previously saved declarations. */
export const deterministicBeveledPlatePack:DomainPack={metadata:{...qualityBeveledPlatePack.metadata,id:'product.deterministic-beveled-plate',
 capabilities:[...qualityBeveledPlatePack.metadata.capabilities,'deterministic-descriptor'],
 parameterNotes:[...(qualityBeveledPlatePack.metadata.parameterNotes??[]),PLATE_ARITHMETIC_REVISION+': explicit IEEE series for 128-point bore coordinates and bevel compensation. No quantization; geometry quality and delivery checks remain separate.']},generate:generateDeterministicBeveledPlateProject};
