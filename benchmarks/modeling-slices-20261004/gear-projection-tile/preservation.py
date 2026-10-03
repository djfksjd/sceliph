import json,struct,hashlib,copy
from pathlib import Path
root=Path('work/gear-projection-tile-20261004');rows=[]
def read(file):
 raw=file.read_bytes();n=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+n]),raw[28+n:]
def accessor(d,bin,i):
 a=d['accessors'][i];b=d['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];size={5126:4,5123:2,5125:4}[a['componentType']];start=b.get('byteOffset',0)+a.get('byteOffset',0);return bin[start:start+a['count']*width*size]
for name in ['small','default','large']:
 a,ab=read(root/(name+'-before')/'morphloom-uv-diagnostic.glb');b,bb=read(root/(name+'-after')/'morphloom-project.glb');
 before=json.loads((root/(name+'-before')/'morphloom-source.json').read_text());after=json.loads((root/(name+'-after')/'morphloom-source.json').read_text());expected=copy.deepcopy(before);expected['schema']='morphloom.elements/0.4';expected['parts'][0]['uvScale']=100;assert expected==after
 for id in ['spur_gear','preserved_sphere']:
  x=next(n for n in a['nodes'] if n.get('name')==id);y=next(n for n in b['nodes'] if n.get('name')==id);assert {k:x[k] for k in ['matrix','translation','rotation','scale'] if k in x}=={k:y[k] for k in ['matrix','translation','rotation','scale'] if k in y}
  ap=a['meshes'][x['mesh']]['primitives'][0];bp=b['meshes'][y['mesh']]['primitives'][0]
  for key in ['POSITION','NORMAL']:assert accessor(a,ab,ap['attributes'][key])==accessor(b,bb,bp['attributes'][key])
  au=accessor(a,ab,ap['attributes']['TEXCOORD_0']);bu=accessor(b,bb,bp['attributes']['TEXCOORD_0'])
  if id=='preserved_sphere':assert au==bu
  else:
   av=struct.unpack('<'+'f'*(len(au)//4),au);bv=struct.unpack('<'+'f'*(len(bu)//4),bu);assert all(struct.unpack('<f',struct.pack('<f',v*100))[0]==w for v,w in zip(av,bv))
  if 'indices' in ap:assert accessor(a,ab,ap['indices'])==accessor(b,bb,bp['indices'])
 assert a['materials']==b['materials'];assert a['scenes']==b['scenes'];assert [n.get('children') for n in a['nodes']]==[n.get('children') for n in b['nodes']]
 rows.append({'case':name,'onlyDeclaredSourceMigrationAndTargetUVScalarChanged':True,'actualPositionNormalIndexPBRHierarchyAndNonTargetUVExact':True,'actualTargetUVf32Times100':True,'localProjectionTileMm':10,'afterGlbSHA256':hashlib.sha256((root/(name+'-after')/'morphloom-project.glb').read_bytes()).hexdigest()})
(root/'preservation.json').write_text(json.dumps(rows,indent=2));print(json.dumps(rows,indent=2))
