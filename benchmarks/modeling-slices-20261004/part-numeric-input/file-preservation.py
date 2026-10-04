import pathlib,struct,json,hashlib,copy
p=pathlib.Path('work/part-numeric-input-20261004');origin=pathlib.Path('work/gear-projection-tile-20261004/final-default-kit/model.glb')
def read(f):
 b=f.read_bytes();assert b[:4]==b'glTF' and struct.unpack_from('<II',b,4)==(2,len(b));at=12;d=None;payload=[]
 while at<len(b):
  n,t=struct.unpack_from('<II',b,at);x=b[at+8:at+8+n];at+=8+n
  if t==0x4e4f534a:d=json.loads(x)
  else:payload.append((t,x))
 return b,d,payload
b,a,ab=read(origin);results=[]
for label,mm in [('moved',5),('reopened',5),('additional-edit',6)]:
 f=p/label/'morphloom-project.glb';raw,d,db=read(f);assert ab==db,'local mesh bytes changed';assert a['meshes']==d['meshes'] and a['materials']==d['materials'] and a['scenes']==d['scenes'];assert len(a['nodes'])==len(d['nodes'])
 for n,m in zip(a['nodes'],d['nodes']):
  expected=copy.deepcopy(n)
  if n.get('name')=='spur_gear':expected['matrix']=[1,0,0,0,0,1,0,0,0,0,1,0,mm/1000,0,0,1]
  elif 'sourceSpec' in n.get('extras',{}):
   spec=expected['extras']['sourceSpec'];next(q for q in spec['parts'] if q['id']=='spur_gear')['position'][0]=mm
  assert expected==m,('Unexpected node change',n.get('name'))
 source=p/label/'morphloom-source.json';results.append({'label':label,'positionMm':mm,'glbSHA256':hashlib.sha256(raw).hexdigest(),'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'allBINBytesExact':True,'materialsMeshesScenesExact':True,'nonTargetNodesExact':True,'namedHierarchyPreserved':True,'rootSourceSpecUpdatedOnlyDeclaredPosition':True})
assert (p/'moved/morphloom-project.glb').read_bytes()==(p/'reopened/morphloom-project.glb').read_bytes()
(p/'file-preservation.json').write_text(json.dumps({'originalSHA256':hashlib.sha256(b).hexdigest(),'results':results},indent=2));print('actual 5mm/reopen/6mm GLB local payload, PBR and non-target preservation PASS')
