import subprocess,json,hashlib,zipfile,time
from pathlib import Path
CLI='/Users/danny/.nvm/versions/node/v24.13.1/bin/agent-browser';root=Path('work/native-normal-kit-20261004').resolve();logs=[]
def call(*args):
 r=subprocess.run([CLI,'--session','native-kit',*args],text=True,capture_output=True);logs.append({'args':list(args),'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr});assert r.returncode==0,r.stderr;return r.stdout
receipts=[]
try:
 for name in ['small','default','large','gear','default']:
  call('upload','nav input[type=file]',str(root/(name+'.json')))
  call('wait','--text','spur_gear' if name=='gear' else 'inner_race')
  target=root/(name+'-repeat.zip' if name=='default' and any(r['case']=='default' for r in receipts) else name+'.zip')
  call('download','button[title^="Textureless static native parts only"]',str(target))
  folder=root/target.stem;folder.mkdir(exist_ok=True)
  with zipfile.ZipFile(target) as z:z.extractall(folder)
  manifest=json.loads((folder/'manifest.json').read_text());assert manifest['nativeImportVerified'] is False
  for path,sha in manifest['sha256'].items():assert hashlib.sha256((folder/path).read_bytes()).hexdigest()==sha
  source=json.loads((folder/'source.json').read_text());assert source==json.loads((root/(name+'.json')).read_text())
  receipts.append({'case':name,'zipSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'glbSha256':manifest['sha256']['model.glb'],'sourceSha256':manifest['sha256']['source.json']})
 assert receipts[1]['zipSha256']==receipts[-1]['zipSha256']
 print(json.dumps(receipts,indent=2))
finally:
 (root/'browser-commands.json').write_text(json.dumps(logs,indent=2));(root/'browser-files.json').write_text(json.dumps(receipts,indent=2))
