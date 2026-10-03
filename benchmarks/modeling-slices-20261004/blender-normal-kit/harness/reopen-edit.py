import bpy,json,sys,hashlib
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:];root=Path(args[0]);rows=[]
def payload(mesh):
 return {'positions':[list(v.co) for v in mesh.vertices],'loops':[l.vertex_index for l in mesh.loops],'uv':[[list(v.uv) for v in layer.data] for layer in mesh.uv_layers],'normals':[list(v.vector) for v in mesh.corner_normals]}
for name in ['small','default','large','solid']:
 folder=root/(name+'-browser-kit');receipt=json.loads((folder/'receipt.json').read_text());blend=folder/'output.blend';assert hashlib.sha256(blend.read_bytes()).hexdigest()==receipt['blendSha256'];source_sha=hashlib.sha256((folder/'source.json').read_bytes()).hexdigest()
 bpy.ops.wm.open_mainfile(filepath=str(blend));before={m.name:payload(m) for m in bpy.data.meshes};obj=bpy.data.objects.get('bushing');assert obj and obj.type=='MESH'
 old=obj.matrix_world.translation.copy();world=obj.matrix_world.copy();world.translation.x+=.001;obj.matrix_world=world;bpy.context.view_layer.update();assert abs(obj.matrix_world.translation.x-old.x-.001)<1e-8
 edited=folder/'edited.blend';assert not edited.exists();bpy.ops.wm.save_as_mainfile(filepath=str(edited),check_existing=False);bpy.ops.wm.open_mainfile(filepath=str(edited));assert abs(bpy.data.objects['bushing'].matrix_world.translation.x-old.x-.001)<1e-8
 assert {m.name:payload(m) for m in bpy.data.meshes}==before
 assert hashlib.sha256((folder/'source.json').read_bytes()).hexdigest()==source_sha
 exported=folder/'edited.glb';assert not exported.exists();bpy.ops.export_scene.gltf(filepath=str(exported),export_format='GLB',export_normals=True,export_yup=True)
 rows.append({'id':name,'blendReopenAndNativeEdit':True,'worldTranslationMeters':[.001,0,0],'allLocalGeometryNormalUVIndexExact':True,'sourceJSONUnchanged':True,'sourceJSONSha256':source_sha,'originalBlendSha256':receipt['blendSha256'],'editedBlendSha256':hashlib.sha256(edited.read_bytes()).hexdigest(),'editedGLBSha256':hashlib.sha256(exported.read_bytes()).hexdigest(),'scope':'native mesh object translation; no IR inverse reconstruction'})
(root/'browser-native-edit.json').write_text(json.dumps(rows,indent=2)+'\n');print('Four actual .blend reopen, native translation, second save/reopen and unchanged local payload PASS')
