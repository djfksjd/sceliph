import {writeFileSync} from 'node:fs';
import {generateSpurGearProject} from '../../src/engine/gear-pack';
import {exportSelectedScene} from '../../src/engine/element-renderer';
import {inspectUvQuality} from '../../src/engine/uv-quality';
import {migrateElementProjectToV4,editPart,serializeProject} from '../../src/engine/element-project';
const cases={small:{moduleMm:.5,faceWidthMm:4,boreDiameterMm:3},default:{},large:{moduleMm:2,faceWidthMm:16,boreDiameterMm:12}};
const rows=[];
for(const [name,input] of Object.entries(cases))for(const scalar of [1,100]){
 const legacy=generateSpurGearProject(input),project=scalar===1?legacy:editPart(migrateElementProjectToV4(legacy),legacy.parts[0].id,{uvScale:scalar}),built=exportSelectedScene(project,[legacy.parts[0].id]);
 try{const r=await inspectUvQuality(built.root,{includeTriangles:true,overlapPairBudgetPerMesh:100});const mesh=r.meshes[0];rows.push({name,scalar,pass:r.integrityPass,triangles:mesh.triangleCount,degenerate:mesh.degenerateUvTriangles,zero:mesh.zeroUvTriangles,invalidWorld:mesh.invalidWorldTriangles,minimumNonzeroDoubleUvArea:Math.min(...mesh.triangles!.map(t=>Math.abs((t.signedUvArea??0)*2)).filter(a=>a>0)),failingTeeth:mesh.features.filter(f=>!f.integrityPass),uvUnitsPerMeterRange:mesh.uvUnitsPerMeterRange,maximumAnisotropy:mesh.maximumAnisotropy});writeFileSync('work/gear-projection-tile-20261004/'+name+'-'+scalar+'.json',serializeProject(project));}finally{built.dispose();}
}
writeFileSync('work/gear-projection-tile-20261004/diagnosis.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows.map(r=>({...r,failingTeeth:r.failingTeeth.length})),null,2));
