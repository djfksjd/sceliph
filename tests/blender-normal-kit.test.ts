import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {unzipSync,strFromU8} from 'fflate';
import {buildBlenderNormalKit,assertBlenderNormalKitSource} from '../src/engine/blender-normal-kit';
const root='benchmarks/modeling-slices-20261004/lathe-profile-surface-normals/';
const bytes=()=>new Uint8Array(readFileSync(root+'default-after.glb')).buffer;
it('packages unchanged actual GLB and editable IR with explicit helper provenance',async()=>{
 const ir=JSON.parse(readFileSync(root+'default-after.json','utf8'));
 const scripts={wrapper:readFileSync('scripts/blender-source-normal-import.py','utf8'),helper:readFileSync('scripts/blender_source_normal_import.py','utf8'),license:readFileSync('LICENSE','utf8')};
 const a=await buildBlenderNormalKit(bytes(),ir,scripts),b=await buildBlenderNormalKit(bytes(),ir,scripts);
 expect(a).toEqual(b);const files=unzipSync(a);
 expect(files['model.glb']).toEqual(new Uint8Array(bytes()));
 expect(JSON.parse(strFromU8(files['source.json']))).toEqual(ir);
 const manifest=JSON.parse(strFromU8(files['manifest.json']));
 expect(manifest.nativeImportVerified).toBe(false);expect(manifest.blenderVersion).toBe('5.2');
 expect(strFromU8(files['tools/blender_source_normal_import.py'])).toBe(scripts.helper);
 const wrong=structuredClone(ir);wrong.components[0].position=[1,0,0];
 await expect(buildBlenderNormalKit(bytes(),wrong,scripts)).rejects.toThrow(/IR/);
});
it('rejects unsupported native inputs instead of discarding texture, rig or required extensions',()=>{
 const raw=new Uint8Array(bytes()),length=new DataView(raw.buffer).getUint32(12,true),doc=JSON.parse(new TextDecoder().decode(raw.slice(20,20+length)));
 assertBlenderNormalKitSource(doc);
 for(const edit of [{images:[{}]},{textures:[{}]},{skins:[{}]},{animations:[{}]},{extensionsRequired:['KHR_draco_mesh_compression']}])expect(()=>assertBlenderNormalKitSource({...doc,...edit})).toThrow();
 const bad=structuredClone(doc);bad.accessors[bad.meshes[0].primitives[0].attributes.NORMAL].componentType=5122;expect(()=>assertBlenderNormalKitSource(bad)).toThrow(/Float32/);
});
it('matches the native per-mesh combined corner budget across multiple primitives',()=>{
 const raw=new Uint8Array(bytes()),length=new DataView(raw.buffer).getUint32(12,true),doc=JSON.parse(new TextDecoder().decode(raw.slice(20,20+length)));
 const p=doc.meshes[0].primitives[0];doc.accessors[p.attributes.POSITION].count=120000;doc.accessors[p.attributes.NORMAL].count=120000;
 if(p.indices!==undefined)doc.accessors[p.indices].count=120000;
 doc.meshes[0].primitives.push(structuredClone(p));
 expect(()=>assertBlenderNormalKitSource(doc)).toThrow(/mesh.*corner budget/);
});
