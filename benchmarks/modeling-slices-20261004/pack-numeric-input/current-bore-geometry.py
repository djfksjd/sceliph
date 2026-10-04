import pathlib,struct,json,hashlib,math
p=pathlib.Path('work/pack-numeric-input-20261004');results=[]
for label in ['before','cleared-generated','pending-preserved','restored','explicit-zero','explicit-four','reopened']:
 f=p/label/'morphloom-uv-diagnostic.glb';raw=f.read_bytes();n=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+n]);binaryStart=20+n+8
 def attribute(index):
  a=d['accessors'][index];v=d['bufferViews'][a['bufferView']];fmt,size={5126:('f',4),5125:('I',4),5123:('H',2),5121:('B',1)}[a['componentType']];width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];offset=binaryStart+v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size*width);return [struct.unpack_from('<'+fmt*width,raw,offset+i*stride) for i in range(a['count'])]
 node=next(x for x in d['nodes'] if x.get('name')=='spur_gear');assert 'matrix' not in node and 'translation' not in node
 primitive=d['meshes'][node['mesh']]['primitives'][0];xyz=attribute(primitive['attributes']['POSITION']);indices=[x[0] for x in attribute(primitive['indices'])] if 'indices' in primitive else list(range(len(xyz)));cover=[]
 for i in range(0,len(indices),3):
  a,b,c=[xyz[k] for k in indices[i:i+3]];area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
  if not math.isfinite(area) or abs(area)<1e-18:continue
  u=((-a[0])*(c[1]-a[1])-(-a[1])*(c[0]-a[0]))/area;v=((b[0]-a[0])*(-a[1])-(b[1]-a[1])*(-a[0]))/area
  if u>=-1e-12 and v>=-1e-12 and u+v<=1+1e-12:cover.append({'triangle':i//3,'axisIntersectionZM':a[2]+u*(b[2]-a[2])+v*(c[2]-a[2])})
 source=p/label/'morphloom-source.json';bore=json.loads(source.read_text())['parts'][0]['geometry']['boreDiameterMm'];results.append({'label':label,'boreDiameterMm':bore,'glbSHA256':hashlib.sha256(raw).hexdigest(),'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'actualAxisCoveringTriangles':cover,'scope':'diagnostic center Z-axis through native untransformed spur gear; not a manufacturing or tolerance approval'})
assert results[0]['boreDiameterMm']==6 and not results[0]['actualAxisCoveringTriangles'];assert results[1]['boreDiameterMm']==0 and results[1]['actualAxisCoveringTriangles']
(p/'current-bore-geometry.json').write_text(json.dumps(results,indent=2));print('actual exported triangle data: original center open, cleared field then generated center capped PASS reproduction')

assert all(not x['actualAxisCoveringTriangles'] for x in results if x['label'] in ['pending-preserved','restored','explicit-four','reopened']);assert results[4]['actualAxisCoveringTriangles'];print('current actual geometry: pending/restored 6mm and explicit/reopened4mm stay open, intentional0 caps PASS')
