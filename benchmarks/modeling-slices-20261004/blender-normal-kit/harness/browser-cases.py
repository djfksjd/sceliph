import subprocess,json,zipfile,hashlib,re
from pathlib import Path
out=Path('/Users/danny/Documents/morphloom/outputs/blender-normal-kit-20261004');source=Path('/Users/danny/Documents/morphloom/outputs/lathe-profile-surface-normals-20261004');rows=[]
def call(*args):return subprocess.run(['agent-browser','--session','normal-kit',*args],capture_output=True,text=True,check=True,timeout=90).stdout
for name in ['small','default','large','solid']:
 call('upload','input[type=file]',str(source/(name+'-after.json')))
 call('wait','--fn','document.body.innerText.includes('+json.dumps('Authored profile-surface bushing '+name)+')')
 call('wait','--fn','document.querySelector('+json.dumps('[aria-label="내보내기 및 비용 검증"]')+').textContent.includes("PASS")&&!document.querySelector("select").disabled')
 snapshot=call('snapshot','-i');ref=re.search(r'button "BLENDER 5.2 · SOURCE NORMAL KIT" \[ref=(e\d+)\]',snapshot);assert ref
 target=out/(name+'-browser-kit.zip');call('download','@'+ref[1],str(target))
 directory=out/(name+'-browser-kit');directory.mkdir(exist_ok=True)
 with zipfile.ZipFile(target) as z:
  assert z.read('model.glb')==(source/(name+'-after.glb')).read_bytes();assert json.loads(z.read('source.json'))==json.loads((source/(name+'-after.json')).read_text())
  m=json.loads(z.read('manifest.json'));assert m['nativeImportVerified'] is False
  for path,sha in m['sha256'].items():assert hashlib.sha256(z.read(path)).hexdigest()==sha
  z.extractall(directory)
 rows.append({'id':name,'kitSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'actualModelSha256':hashlib.sha256((directory/'model.glb').read_bytes()).hexdigest(),'membersAndHashesPass':True})
(out/'browser-cases.json').write_text(json.dumps(rows,indent=2)+'\n');print('Four actual browser downloads, separate saved IR, exact GLB and independent ZIP hashes PASS')
