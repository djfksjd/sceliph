import {writeFileSync,readFileSync} from 'node:fs';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {generateSpurGearProject} from '../../src/engine/gear-pack';
import {migrateElementProjectToV4,migrateElementProjectToV8,editPart,serializeProject} from '../../src/engine/element-project';
import {prepareElementExportSource} from '../../src/engine/element-export-source';
import {exportSelectedScene} from '../../src/engine/element-renderer';
import {GEAR_DETERMINISTIC_MATH_REVISION} from '../../src/engine/gear-deterministic-math';
import {analyzeTopology} from '../../src/engine/topology';
(globalThis as any).FileReader=class{result:unknown;onloadend?:()=>void;async readAsArrayBuffer(b:Blob){this.result=await b.arrayBuffer();this.onloadend?.();}};
const cases=JSON.parse(readFileSync('work/gear-runtime-math-20261004/cases.json','utf8')),rows=[];
for(let i=0;i<cases.length;i++){
 const {op,...input}=cases[i],original=migrateElementProjectToV4(generateSpurGearProject(input));original.parts[0].uvScale=100;
 const marker=structuredClone(original.parts[0]);marker.id='marker';marker.name='Independent preservation marker';marker.geometry={op:'sphere',radius:1};marker.position=[50,0,0];delete marker.uvScale;delete marker.creaseAngle;original.parts.push(marker);
 const migrated=migrateElementProjectToV8(original),source=editPart(migrated,'spur_gear',{geometry:{...migrated.parts[0].geometry as any,mathRevision:GEAR_DETERMINISTIC_MATH_REVISION}});
 for(const [label,p] of [['original',original],['policy',source]] as const){writeFileSync(`work/gear-math-policy-20261004/${label}-${i}.json`,serializeProject(p));const built=exportSelectedScene(prepareElementExportSource(p),p.parts.map(p=>p.id));try{const data=await new GLTFExporter().parseAsync(built.root,{binary:true}) as ArrayBuffer;writeFileSync(`work/gear-math-policy-20261004/node-${label}-${i}.glb`,new Uint8Array(data));rows.push({case:i,label,topology:analyzeTopology(built.root)});}finally{built.dispose();}}
}
writeFileSync('work/gear-math-policy-20261004/fixtures-result.json',JSON.stringify(rows,null,2));console.log(rows.map(r=>({case:r.case,label:r.label,topologyPass:r.topology.pass})));
