import {expect,it,vi} from 'vitest';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {unzipSync,strFromU8} from 'fflate';
import {generateBearingProject} from '../src/engine/bearing-pack';
import {exportSelectedScene} from '../src/engine/element-renderer';
import {buildNativeBlenderNormalKit} from '../src/engine/blender-normal-kit';
import {readFileSync} from 'node:fs';
import {Buffer} from 'node:buffer';
const scripts={wrapper:readFileSync('scripts/blender-source-normal-import.py','utf8'),helper:readFileSync('scripts/blender_source_normal_import.py','utf8'),license:readFileSync('LICENSE','utf8')};
async function fixture(){
 vi.stubGlobal('FileReader',class{result:unknown;onloadend?:()=>void;async readAsArrayBuffer(blob:Blob){this.result=await blob.arrayBuffer();this.onloadend?.();}});
 const project=generateBearingProject({}),ids=project.parts.map(p=>p.id),built=exportSelectedScene(project,ids);
 try{return {source:{...project,selection:ids},glb:await new GLTFExporter().parseAsync(built.root,{binary:true}) as ArrayBuffer};}finally{built.dispose();}
}
it('packs actual native bearing bytes and editable source without claiming native execution',async()=>{
 try{const f=await fixture(),a=await buildNativeBlenderNormalKit(f.glb,f.source,scripts),b=await buildNativeBlenderNormalKit(f.glb,f.source,scripts);
 // Native byte comparison checks every byte and length, without recursively
 // treating millions of binary entries as object properties. No tolerance.
 expect(a.constructor).toBe(b.constructor);expect(Buffer.compare(Buffer.from(a),Buffer.from(b))).toBe(0);
 const files=unzipSync(a);expect(Buffer.compare(Buffer.from(files['model.glb']),Buffer.from(f.glb))).toBe(0);expect(JSON.parse(strFromU8(files['source.json']))).toEqual(f.source);
 const m=JSON.parse(strFromU8(files['manifest.json']));expect(m.schema).toBe('sceliph.blender-normal-kit/0.2');expect(m.nativeImportVerified).toBe(false);expect(m.rendererRevision).toBe('morphloom.element-renderer/0.12');
 }finally{vi.unstubAllGlobals();}
});
it('rejects source mismatch and changed export selection',async()=>{
 try{const f=await fixture(),wrong=structuredClone(f.source);wrong.parts[0].position[0]+=1;await expect(buildNativeBlenderNormalKit(f.glb,wrong,scripts)).rejects.toThrow(/source|match/i);
 await expect(buildNativeBlenderNormalKit(f.glb,{...f.source,selection:['ball_0000']},scripts)).rejects.toThrow(/selection/i);
 }finally{vi.unstubAllGlobals();}
});
it('rejects changed actual NORMAL payload even with unchanged editable source reference',async()=>{
 try{const f=await fixture(),bytes=f.glb.slice(0),v=new DataView(bytes),n=v.getUint32(12,true),d=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,n))),a=d.accessors[d.meshes[0].primitives[0].attributes.NORMAL],b=d.bufferViews[a.bufferView];new Uint8Array(bytes)[28+n+(b.byteOffset??0)+(a.byteOffset??0)]^=1;
 await expect(buildNativeBlenderNormalKit(bytes,f.source,scripts)).rejects.toThrow(/regenerated.*bytes/i);
 }finally{vi.unstubAllGlobals();}
});
it('refuses an actual mixed workspace rather than promoting its project reference',async()=>{
 try{const f=await fixture(),{buildWorkspaceScene}=await import('../src/engine/element-workspace');const project=structuredClone(f.source);delete project.selection;
 const built=buildWorkspaceScene({schema:'morphloom.workspace/0.1',units:'mm',coordinates:'right-handed-y-up',assets:['a','b'].map(id=>({id,packId:'mechanical.bearing.visual',requiredCapabilities:[],source:structuredClone(project),positionMm:[0,0,0],rotationRad:[0,0,0]}))},'detail',false);
 try{const glb=await new GLTFExporter().parseAsync(built.root,{binary:true}) as ArrayBuffer;await expect(buildNativeBlenderNormalKit(glb,f.source,scripts)).rejects.toThrow(/native part source|workspace/i);}finally{built.dispose();}
 }finally{vi.unstubAllGlobals();}
});
