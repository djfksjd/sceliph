import {afterEach,expect,it,vi} from 'vitest';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {generateSpurGearProject} from '../src/engine/gear-pack';
import {parseProject,serializeProject,migrateElementProjectToV5,editPart} from '../src/engine/element-project';
import {exportSelectedScene} from '../src/engine/element-renderer';
import {prepareDiagnosticToothExportSource} from '../src/engine/element-export-source';
afterEach(()=>vi.unstubAllGlobals());
async function glb(source:ReturnType<typeof generateSpurGearProject>,id:string){
 vi.stubGlobal('FileReader',class{result:unknown;onloadend?:()=>void;async readAsArrayBuffer(b:Blob){this.result=await b.arrayBuffer();this.onloadend?.();}});
 const copy=prepareDiagnosticToothExportSource(source,'spur_gear',id),built=exportSelectedScene(copy,['spur_gear']);const mesh=built.root.getObjectByName('spur_gear')!;mesh.name=`spur_gear/${id}`;mesh.userData={...mesh.userData,connectedSourceFeatureId:`spur_gear/${id}`,extraction:'diagnostic-sector-cut',detachable:false};
 try{return new Uint8Array(await new GLTFExporter().parseAsync(built.root,{binary:true}) as ArrayBuffer);}finally{built.dispose();}
}
for(const [moduleMm,toothCount] of [[.5,24],[1,24],[2,24],[1,36]])it(`sector ${moduleMm}mm module/${toothCount} teeth source reload is whole-byte exact`,async()=>{
 const p=generateSpurGearProject({moduleMm,toothCount,boreDiameterMm:2}),before=structuredClone(p),a=await glb(p,'tooth_0003'),b=await glb(parseProject(serializeProject(p)),'tooth_0003');expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);expect(p).toEqual(before);
 const n=new DataView(a.buffer).getUint32(12,true),d=JSON.parse(new TextDecoder().decode(a.subarray(20,20+n))),mesh=d.nodes.find((x:any)=>x.name==='spur_gear/tooth_0003');expect(mesh.extras.connectedSourceFeatureId).toBe('spur_gear/tooth_0003');expect(mesh.extras.detachable).toBe(false);
});
it('rejects missing feature/part and chamfer without mutating original source',()=>{
 const p=generateSpurGearProject({}),before=structuredClone(p);expect(()=>prepareDiagnosticToothExportSource(p,'missing','tooth_0000')).toThrow();expect(()=>prepareDiagnosticToothExportSource(p,'spur_gear','tooth_9999')).toThrow();expect(()=>prepareDiagnosticToothExportSource(editPart(migrateElementProjectToV5(p),'spur_gear',{axialChamferMm:.01}),'spur_gear','tooth_0000')).toThrow(/Chamfered/);expect(p).toEqual(before);
});
