import pathlib,struct,json,copy,hashlib
p=pathlib.Path('work/element-numeric-input-20261004');results=[]
def read(path):
 raw=path.read_bytes();assert raw[:4]==b'glTF' and struct.unpack_from('<II',raw,4)==(2,len(raw));n=struct.unpack_from('<I',raw,12)[0];return raw,json.loads(raw[20:20+n]),raw[20+n:]
for base,cases,explicit in [('before',[('cancel',5),('moved',6),('undo',5),('redo',6),('reopened',6),('additional',7)],False),('explicit-before',[('explicit-cancel',5),('explicit-moved',6)],True)]:
 source=p/base/'morphloom-project.glb';raw,a,binary=read(source)
 for label,mm in cases:
  path=p/label/'morphloom-project.glb';other,d,otherBinary=read(path);assert binary==otherBinary,'local BIN changed';assert a['meshes']==d['meshes'] and a['materials']==d['materials'] and a['scenes']==d['scenes'];assert len(a['nodes'])==len(d['nodes'])
  for n,m in zip(a['nodes'],d['nodes']):
   expected=copy.deepcopy(n)
   if n.get('name')=='body_fur/000000':expected['matrix'][12]=mm/1000
   if 'sourceSpec' in n.get('extras',{}):
    spec=expected['extras']['sourceSpec']
    if explicit:spec['elements'][0]['position'][0]=mm
    else:spec['groups'][0]['overrides']['body_fur/000000']['position'][0]=mm
   assert expected==m,('unexpected node change',label,n.get('name'))
  results.append({'label':label,'ownerLocalInput':not explicit,'positionMm':mm,'sourceGLBSHA256':hashlib.sha256(raw).hexdigest(),'glbSHA256':hashlib.sha256(other).hexdigest(),'sourceJSONSHA256':hashlib.sha256((p/label/'morphloom-source.json').read_bytes()).hexdigest(),'allBINAndPBRExact':True,'nonTargetNodesExact':True,'hierarchyExact':True,'sourceSpecOnlyDeclaredPositionUpdated':True})
(p/'file-preservation.json').write_text(json.dumps(results,indent=2));print('actual generated/explicit GLB local POSITION/NORMAL/UV/index, PBR and non-target node preservation PASS')
