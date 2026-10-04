import bpy,json,hashlib,math
from pathlib import Path
root=Path('work/tooth-export-order-20261004').resolve();asset=root/'browser-first/spur_gear-tooth_0003-diagnostic.glb'
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(asset))
def snapshot():
 return [{'name':o.name,'parent':o.parent.name if o.parent else None,'matrix':[list(r) for r in o.matrix_world],'vertices':[list(v.co) for v in o.data.vertices],'polygons':[list(p.vertices) for p in o.data.polygons],'uv':[[list(x.uv) for x in layer.data] for layer in o.data.uv_layers],'normals':[list(n.vector) for n in o.data.corner_normals],'materials':[m.name if m else None for m in o.data.materials]} for o in bpy.data.objects if o.type=='MESH']
a=snapshot();assert len(a)==1 and a[0]['name'].startswith('spur_gear/tooth_0003');assert a[0]['uv'];assert all(math.isfinite(x) for v in a[0]['vertices'] for x in v)
bpy.ops.wm.save_as_mainfile(filepath=str(root/'diagnostic.blend'));bpy.ops.wm.open_mainfile(filepath=str(root/'diagnostic.blend'));b=snapshot();assert a==b
(root/'blender-reopen-result.json').write_text(json.dumps({'inputSHA256':hashlib.sha256(asset.read_bytes()).hexdigest(),'BlenderVersion':bpy.app.version_string,'firstImportMeshCount':len(a),'meshName':a[0]['name'],'vertices':len(a[0]['vertices']),'polygons':len(a[0]['polygons']),'uvLayers':len(a[0]['uv']),'savedBlendReopenExact':True,'normalComparisonToInputGLB':'not-run','GLBReexport':'not-run','scope':'ordinary diagnostic first import and saved blend structural reopen, not normal drift or IR inverse editing certification'},indent=2));print('diagnostic Blender first import and saved blend exact structure reopen PASS')
