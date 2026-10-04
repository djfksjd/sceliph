import {createBirdProject} from '../src/engine/bird-element-demo';
import {afterEach,expect,it,vi} from 'vitest';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {generateBearingProject} from '../src/engine/bearing-pack';
import {generateSpurGearProject} from '../src/engine/gear-pack';
import {exportSelectedScene} from '../src/engine/element-renderer';
import {parseProject,serializeProject,type ElementProject} from '../src/engine/element-project';
import {prepareElementExportSource} from '../src/engine/element-export-source';
afterEach(()=>vi.unstubAllGlobals());
async function bytes(project:ElementProject,ids:string[]){
 vi.stubGlobal('FileReader',class{result:unknown;onloadend?:()=>void;async readAsArrayBuffer(blob:Blob){this.result=await blob.arrayBuffer();this.onloadend?.();}});
 const built=exportSelectedScene(project,ids);try{return new Uint8Array(await new GLTFExporter().parseAsync(built.root,{binary:true}) as ArrayBuffer);}finally{built.dispose();}
}
for(const factor of [.5,1,2])it(`bearing scale${factor}: first/reopened full GLB exact and previous binary unchanged`,async()=>{
 const p=generateBearingProject({boreDiameterMm:20*factor,outerDiameterMm:40*factor,widthMm:12*factor,ballDiameterMm:6*factor});const original=structuredClone(p);p.selection=['ball_0000'];
 const ids=p.parts.map(x=>x.id),prepared=prepareElementExportSource(p),a=await bytes(prepared,ids),b=await bytes(prepareElementExportSource(parseProject(serializeProject(p))),ids);expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
 const old=await bytes(original,ids);const bin=(v:Uint8Array)=>v.slice(28+new DataView(v.buffer).getUint32(12,true));expect(Buffer.from(bin(a)).equals(Buffer.from(bin(old)))).toBe(true);expect(p).toEqual({...original,selection:['ball_0000']});expect(prepared.selection).toBeUndefined();expect(prepared).toEqual(original);
});
it('gear selected first/reopened GLB exact and explicit selection preserved separately',async()=>{
 const p=generateSpurGearProject({boreDiameterMm:4}),ids=['spur_gear'];expect(Buffer.from(await bytes(prepareElementExportSource(p),ids)).equals(Buffer.from(await bytes(prepareElementExportSource(parseProject(serializeProject({...p,selection:ids}))),ids)))).toBe(true);
});
it('legacy0.1 retains existing key order and actual original export bytes',async()=>{
 const p=createBirdProject(),original=structuredClone(p);p.selection=['body'];const prepared=prepareElementExportSource(p);expect(JSON.stringify(prepared)).toBe(JSON.stringify(original));expect(Buffer.from(await bytes(prepared,['body'])).equals(Buffer.from(await bytes(original,['body'])))).toBe(true);expect(p.selection).toEqual(['body']);
});
