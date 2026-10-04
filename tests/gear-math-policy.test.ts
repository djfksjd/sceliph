import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {generateSpurGearProject} from '../src/engine/gear-pack';
import {migrateElementProjectToV8,editPart,parseProject,serializeProject,validateProject,ElementHistory} from '../src/engine/element-project';
import {GEAR_DETERMINISTIC_MATH_REVISION as revision} from '../src/engine/gear-deterministic-math';
import {gearProfile,type SpurGearGeometry} from '../src/engine/spur-gear';
import {prepareDiagnosticToothExportSource,prepareElementExportSource} from '../src/engine/element-export-source';
import {exportSelectedScene} from '../src/engine/element-renderer';
afterEach(()=>vi.unstubAllGlobals());
async function bytes(project:ReturnType<typeof generateSpurGearProject>,tooth=false){
 vi.stubGlobal('FileReader',class{result:unknown;onloadend?:()=>void;async readAsArrayBuffer(b:Blob){this.result=await b.arrayBuffer();this.onloadend?.();}});
 const source=tooth?prepareDiagnosticToothExportSource(project,'spur_gear','tooth_0003'):prepareElementExportSource(project),built=exportSelectedScene(source,['spur_gear']);
 if(tooth){const mesh=built.root.getObjectByName('spur_gear')!;mesh.name='spur_gear/tooth_0003';mesh.userData={...mesh.userData,connectedSourceFeatureId:'spur_gear/tooth_0003',extraction:'diagnostic-sector-cut',detachable:false};}
 try{return new Uint8Array(await new GLTFExporter().parseAsync(built.root,{binary:true}) as ArrayBuffer);}finally{built.dispose();}
}
it('legacy source actual diagnostic GLB remains byte exact to previous current file',async()=>{
 expect(Buffer.from(await bytes(generateSpurGearProject({boreDiameterMm:4}),true)).equals(readFileSync('benchmarks/modeling-slices-20261004/tooth-export-order/current-first.glb'))).toBe(true);
});
it('schema-only migration preserves every part and selects no new arithmetic',()=>{
 const p=generateSpurGearProject({}),q=migrateElementProjectToV8(p);expect({...q,schema:p.schema}).toEqual(p);expect((q.parts[0].geometry as SpurGearGeometry).mathRevision).toBeUndefined();
});
it('older schema and unknown revision reject, locked patch rejects, history preserves explicit policy',()=>{
 const p=generateSpurGearProject({}),q=migrateElementProjectToV8(p),geometry={...p.parts[0].geometry as SpurGearGeometry,mathRevision:revision};expect(()=>editPart(p,'spur_gear',{geometry})).toThrow();
 expect(()=>validateProject({...q,parts:[{...q.parts[0],geometry:{...geometry,mathRevision:'unknown'}}]})).toThrow();expect(()=>editPart({...q,parts:[{...q.parts[0],locked:true}]},'spur_gear',{geometry})).toThrow(/locked/);
 const changed=editPart(q,'spur_gear',{geometry}),h=new ElementHistory(q);h.commit(changed);expect(h.undo()).toEqual(q);expect(h.redo()).toEqual(changed);expect(parseProject(serializeProject(changed))).toEqual(changed);expect(p.schema).toBe('morphloom.elements/0.3');
});
for(const [moduleMm,toothCount] of [[.5,24],[1,24],[2,24],[1,36]])it(`explicit native policy ${moduleMm}/${toothCount} reopens without changing source parameters`,async()=>{
 const p=migrateElementProjectToV8(generateSpurGearProject({moduleMm,toothCount,boreDiameterMm:2})),g=p.parts[0].geometry as SpurGearGeometry,q=editPart(p,'spur_gear',{geometry:{...g,mathRevision:revision}}),a=await bytes(q),b=await bytes(parseProject(serializeProject(q)));expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
 expect(gearProfile(q.parts[0].geometry as SpurGearGeometry).points.length).toBeGreaterThan(1000);expect(q.parts[0].id).toBe(p.parts[0].id);
});

it('native policy full profiles equal the previously verified candidate values',()=>{
 const candidates=JSON.parse(gunzipSync(readFileSync('benchmarks/modeling-slices-20261004/gear-runtime-math/candidate-node.json.gz')).toString());
 for(const row of candidates){const profile=gearProfile({...row.input,mathRevision:revision});expect(Buffer.from(JSON.stringify(profile)).equals(Buffer.from(JSON.stringify(row.profile)))).toBe(true);}
});
