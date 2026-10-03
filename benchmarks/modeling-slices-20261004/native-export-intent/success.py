import subprocess,json,time,base64,hashlib,os
from pathlib import Path
CLI='/Users/danny/.nvm/versions/node/v24.13.1/bin/agent-browser'
p=Path('work/native-export-selection-20261004')
def call(*args):
 r=subprocess.run([CLI,'--session',os.environ.get('BROWSER_SESSION','native-race'),*args],capture_output=True,text=True,check=True)
 return r.stdout
call('eval',"""(()=>{window.saved=[];window.saving=[];HTMLAnchorElement.prototype.click=function(){const name=this.download;window.saving.push(fetch(this.href).then(r=>r.arrayBuffer()).then(b=>{const bytes=new Uint8Array(b);let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));window.saved.push({name,base64:btoa(text)})}))};return true})()""")
call('find','role','button','click','--name','Export project GLB + source JSON')
for i in range(60):
 time.sleep(.15)
 if '3' in call('eval','window.saved.length'):break
raw=call('eval','JSON.stringify(window.saved)')
files=json.loads(json.loads(raw));assert len(files)==3,files
hashes={}
for entry in files:
 data=base64.b64decode(entry['base64']);p.joinpath(entry['name']).write_bytes(data);hashes[entry['name']]=hashlib.sha256(data).hexdigest()
source=json.loads(p.joinpath('morphloom-source.json').read_text())
expected=json.loads(Path('benchmarks/modeling-slices-20261002/part-material-preservation/gear.elements.json').read_text())
expected['selection']=['spur_gear'];assert source==expected
p.joinpath('successful-files.json').write_text(json.dumps({'sourcePreserved':True,'sha256':hashes},indent=2))
print(json.dumps(hashes))
