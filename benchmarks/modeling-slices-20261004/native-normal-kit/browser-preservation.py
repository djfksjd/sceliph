import json,struct,hashlib
from pathlib import Path
root=Path('work/native-normal-kit-20261004')
def read(p):
 raw=p.read_bytes();n=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+n]),raw[28+n:]
a,ab=read(root/'default/model.glb');b,bb=read(root/'edited/model.glb');assert ab==bb,'actual local geometry/normal/UV/index BIN changed'
old=next(n for n in a['nodes'] if n.get('name')=='ball_0000');new=next(n for n in b['nodes'] if n.get('name')=='ball_0000');assert 'matrix' in old and 'matrix' in new
assert all(abs(new['matrix'][12+i]-old['matrix'][12+i]-(.002 if i==0 else 0))<1e-10 for i in range(3))
for d in [a,b]:
 for n in d['nodes']:
  if n.get('name')=='ball_0000':n['matrix'][12:15]=[0,0,0]
  if 'sourceSpec' in n.get('extras',{}):del n['extras']['sourceSpec']
assert a==b,'non-target GLB scene/PBR/hierarchy changed'
r={'localPositionNormalUVIndexBINExact':True,'nonTargetSceneMaterialHierarchyExact':True,'target':'ball_0000','coordinates':'glTF right-handed Y-up; meters','worldTranslationMeters':[.002,0,0],'binSha256':hashlib.sha256(ab).hexdigest(),'finalUIZIPMatchesEditedZIP':(root/'final-edited.zip').read_bytes()==(root/'edited.zip').read_bytes()}
assert r['finalUIZIPMatchesEditedZIP'];(root/'browser-preservation.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
