import bpy,json,sys,hashlib
from pathlib import Path
root=Path(sys.argv[sys.argv.index('--')+1]).resolve();rows=[]
def payload(m):return {'positions':[list(v.co) for v in m.vertices],'loops':[l.vertex_index for l in m.loops],'uv':[[list(v.uv) for v in layer.data] for layer in m.uv_layers],'normals':[list(v.vector) for v in m.corner_normals]}
for name in ['small','default','large']:
 folder=root/(name+'-kit');receipt=json.loads((folder/'receipt.json').read_text());blend=folder/'output.blend';assert hashlib.sha256(blend.read_bytes()).hexdigest()==receipt['blendSha256'];bpy.ops.wm.open_mainfile(filepath=str(blend));before={m.name:payload(m) for m in bpy.data.meshes};sourceSha=hashlib.sha256((folder/'source.json').read_bytes()).hexdigest();saved=folder/'reopened.blend';assert not saved.exists();bpy.ops.wm.save_as_mainfile(filepath=str(saved),check_existing=False);bpy.ops.wm.open_mainfile(filepath=str(saved));assert {m.name:payload(m) for m in bpy.data.meshes}==before;assert hashlib.sha256((folder/'source.json').read_bytes()).hexdigest()==sourceSha
 exported=folder/'reexport.glb';assert not exported.exists();bpy.ops.export_scene.gltf(filepath=str(exported),export_format='GLB',export_normals=True,export_yup=True)
 rows.append({'case':name,'blendReopenLocalPositionNormalUVLoopExact':True,'sourceJSONUnchanged':True,'sourceSHA256':sourceSha,'reexportSHA256':hashlib.sha256(exported.read_bytes()).hexdigest()})
(root/'native-reopen.json').write_text(json.dumps(rows,indent=2));print('Three actual .blend reopen/resave/reopen preserve local geometry, UV, loops and normals')
