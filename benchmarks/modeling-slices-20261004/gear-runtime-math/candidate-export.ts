import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {exportSelectedScene} from '../../src/engine/element-renderer';
import {generateSpurGearProject} from '../../src/engine/gear-pack';
import {prepareElementExportSource} from '../../src/engine/element-export-source';
import {analyzeTopology} from '../../src/engine/topology';
import {gearExtrude,extractToothGeometry,type SpurGearGeometry} from './candidate-spur-gear';
export async function candidateExport(g:SpurGearGeometry,tooth=false){
 const {op,...input}=g;const original=generateSpurGearProject(input),copy=prepareElementExportSource(original);
 copy.parts[0].geometry=tooth?extractToothGeometry(g,'tooth_0003'):gearExtrude(g);
 let built:ReturnType<typeof exportSelectedScene>;
 if(tooth)built=exportSelectedScene(copy,['spur_gear']);
 else{
  const g=copy.parts[0].geometry;if(g.op!=='extrude'||g.points.length>8192)throw new Error('bounded derived gear reference required');
  const shape=new THREE.Shape();g.points.forEach((p,i)=>i?shape.lineTo(...p):shape.moveTo(...p));shape.closePath();
  for(const loop of g.holes??[]){const path=new THREE.Path();loop.forEach((p,i)=>i?path.lineTo(...p):path.moveTo(...p));path.closePath();shape.holes.push(path);}
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:g.depth,steps:1,bevelEnabled:false});geometry.translate(0,0,-g.depth/2);geometry.scale(.001,.001,.001);
  const material=new THREE.MeshStandardMaterial({color:'#aeb8c2',roughness:.32,metalness:.9}),mesh=new THREE.Mesh(geometry,material);mesh.name='spur_gear';
  const root=new THREE.Group();root.name='candidate-derived-gear-reference';root.add(mesh);root.userData={derivedGeometry:g,currentEditableIRAvailable:false,sourceSpecState:'original-reference-only'};
  built={root,dispose:()=>{geometry.dispose();material.dispose();}} as ReturnType<typeof exportSelectedScene>;
 }
 built.root.userData.candidateMathRevision='experimental.gear-ieee-series/0.1';
 built.root.userData.originalNativeGearSource=prepareElementExportSource(original);
 built.root.userData.support='isolated candidate derived reference; product generator unchanged';
 try{const topology=analyzeTopology(built.root);return {bytes:new Uint8Array(await new GLTFExporter().parseAsync(built.root,{binary:true}) as ArrayBuffer),topology};}finally{built.dispose();}
}
