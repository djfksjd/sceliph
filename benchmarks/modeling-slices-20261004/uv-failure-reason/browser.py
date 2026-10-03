import subprocess,json,time,base64,hashlib,zipfile
from pathlib import Path
root=Path('work/uv-failure-reason-20261004').resolve();logs=[]
def call(*args):
 r=subprocess.run(['/Users/danny/.nvm/versions/node/v24.13.1/bin/agent-browser','--session','uv-reason',*args],capture_output=True,text=True);logs.append({'args':list(args),'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr});assert r.returncode==0,r.stderr;return r.stdout
def capture(label,button):
 call('eval',"""(()=>{window.originalAnchorClick??=HTMLAnchorElement.prototype.click;window.saved=[];HTMLAnchorElement.prototype.click=function(){const name=this.download;fetch(this.href).then(r=>r.arrayBuffer()).then(b=>{const bytes=new Uint8Array(b);let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));window.saved.push({name,base64:btoa(text)})})};return true})()""")
 call('find','role','button','click','--name',button)
 for i in range(100):
  if call('eval','window.saved.length').strip()=='3':break
  time.sleep(.1)
 else:raise AssertionError(call('eval','document.querySelector("[role=status]").textContent'))
 files=json.loads(json.loads(call('eval','JSON.stringify(window.saved)')))
 folder=root/label;folder.mkdir(exist_ok=True)
 for entry in files:(folder/entry['name']).write_bytes(base64.b64decode(entry['base64']))
 call('eval','HTMLAnchorElement.prototype.click=window.originalAnchorClick;true')
 return folder
try:
 call('open','http://127.0.0.1:4179/?editor=elements&uvreason=1');call('wait','--load','networkidle')
 fixture=Path('work/gear-projection-tile-20261004/default-source.json').resolve()
 call('upload','nav input[type=file]',str(fixture));call('wait','--text','spur_gear');call('click','details[aria-label="UV quality"] > summary');call('wait','--text','exactly zero-area 0')
 text=call('eval','document.querySelector(`details[aria-label="UV quality"]`).textContent')
 assert '1490/8384 double-area <= 1e-10 or non-finite' in text,text
 (root/'browser-panel.txt').write_text(text)
 call('find','role','button','click','--name','Export project GLB + source JSON');call('wait','--text','Mesh export blocked:');error=call('eval','document.querySelector("[role=status]").textContent');assert '0 exactly zero-area' in error and 'double-area <= 1e-10 or non-finite' in error,error
 (root/'browser-blocked.txt').write_text(error)
 call('eval','document.querySelector(`details[aria-label="UV quality"]`).scrollIntoView({block:"start"});true');call('screenshot',str(root/'uv-reason-panel.png'))
 folder=capture('diagnostic','Export project UV diagnostic GLB + source JSON')
 reference=Path('work/gear-projection-tile-20261004/default-before/morphloom-uv-diagnostic.glb')
 assert (folder/'morphloom-uv-diagnostic.glb').read_bytes()==reference.read_bytes(),'wording change altered actual GLB bytes'
 (root/'browser-result.json').write_text(json.dumps({'legacyDiagnosticGLBExact':True,'sha256':hashlib.sha256(reference.read_bytes()).hexdigest(),'sourceSHA256':hashlib.sha256(fixture.read_bytes()).hexdigest(),'defaultGearStillBlocked':True},indent=2))
 print('actual panel/error accurate; diagnostic GLB bytes unchanged PASS')
finally:
 (root/'browser-commands.json').write_text(json.dumps(logs,indent=2));call('close')
