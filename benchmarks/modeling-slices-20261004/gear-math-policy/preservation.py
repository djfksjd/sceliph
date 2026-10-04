import json,struct,hashlib
from pathlib import Path
p=Path('work/gear-math-policy-20261004')
def glb(f):
 b=f.read_bytes();n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),b[28+n:]
def accessor(d,b,i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];size={5126:4,5125:4,5123:2,5121:1}[a['componentType']]*{'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];o=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size);return b''.join(b[o+k*stride:o+k*stride+size] for k in range(a['count']))
def mesh(d,b,name):
 node=next(x for x in d['nodes'] if x.get('name')==name);prim=d['meshes'][node['mesh']]['primitives'][0];out={key:accessor(d,b,i) for key,i in prim['attributes'].items()};out['INDEX']=accessor(d,b,prim['indices']) if 'indices' in prim else None;out['material']=d.get('materials',[])[prim['material']] if 'material' in prim else None;out['node']={k:v for k,v in node.items() if k!='mesh'};return out
rows=[]
for i in range(4):
 ad,ab=glb(p/f'node-original-{i}.glb');bd,bb=glb(p/f'node-policy-{i}.glb');before=mesh(ad,ab,'marker');after=mesh(bd,bb,'marker');assert before==after
 old=json.loads((p/f'original-{i}.json').read_text());new=json.loads((p/f'policy-{i}.json').read_text());assert old['parts'][1]==new['parts'][1]
 an=next(x for x in ad['nodes'] if x.get('name')=='spur_gear');bn=next(x for x in bd['nodes'] if x.get('name')=='spur_gear');aa=ad['accessors'][ad['meshes'][an['mesh']]['primitives'][0]['attributes']['POSITION']];ba=bd['accessors'][bd['meshes'][bn['mesh']]['primitives'][0]['attributes']['POSITION']];assert aa['min']==ba['min'] and aa['max']==ba['max']
 rows.append({'case':i,'markerGeometryNormalUVIndexMaterialNodeExact':True,'markerIRExact':True,'gearBoundsExact':True})
beforeD,beforeB=glb(p/'browser-reopened/morphloom-project.glb');editedD,editedB=glb(p/'browser-edited/morphloom-project.glb');assert mesh(beforeD,beforeB,'marker')==mesh(editedD,editedB,'marker')
for name in ['spur_gear','marker']:
 a=mesh(beforeD,beforeB,name);b=mesh(editedD,editedB,name);a.pop('node');b.pop('node');assert a==b
oldD,oldB=glb(p/'node-original-1.glb');undoD,undoB=glb(p/'browser-undo/morphloom-project.glb');assert oldB==undoB
(p/'preservation-result.json').write_text(json.dumps({'cases':rows,'translationPreservesBothMeshPayloadsAndMarkerNode':True,'schemaOnlyUndoBINExactToOriginal':True},indent=2));print('actual non-target attributes/material/node + source and target bounds exact; local translation payload preservation PASS')
