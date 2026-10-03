import subprocess,json,time,base64,hashlib,zipfile
from pathlib import Path
root=Path('work/gear-projection-tile-20261004').resolve();logs=[]
def call(*args):
 r=subprocess.run(['/Users/danny/.nvm/versions/node/v24.13.1/bin/agent-browser','--session','gear-tile',*args],capture_output=True,text=True);logs.append({'args':list(args),'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr});assert r.returncode==0,r.stderr;return r.stdout
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
 for name in ['small','default','large']:
  call('upload','nav input[type=file]',str(root/(name+'-source.json')));call('wait','--text','spur_gear')
  before=capture(name+'-before','Export project UV diagnostic GLB + source JSON')
  call('find','role','button','click','--name','Enable UV editing (schema 0.4)');call('wait','--text','Local projection tile (mm)')
  if name=='default':
   call('find','role','checkbox','check','--name','Isolate selection');call('find','role','button','click','--name','Fit view')
   call('find','role','checkbox','check','--name','Synthetic UV checker preview');call('eval','document.querySelector(".element-viewport").scrollIntoView({block:"center"});true');call('screenshot',str(root/'checker-before.png'))
   call('eval','JSON.stringify(document.querySelector(".element-viewport").getBoundingClientRect().toJSON())')
  call('find','role','spinbutton','fill','--name','Local projection tile (mm)','10');call('find','role','button','click','--name','Apply part edit')
  after=capture(name+'-after','Export project GLB + source JSON')
  if name=='default':
   call('eval','document.querySelector(".element-viewport").scrollIntoView({block:"center"});true');call('screenshot',str(root/'checker-after.png'))
   call('eval','JSON.stringify(document.querySelector(".element-viewport").getBoundingClientRect().toJSON())')
   call('find','role','spinbutton','fill','--name','Local projection tile (mm)','0');text=call('eval','JSON.stringify({disabled:[...document.querySelectorAll("button")].find(b=>b.textContent==="Apply part edit").disabled,error:document.querySelector("[role=alert]")?.textContent})');assert 'true' in text and '1..1000000' in text
   call('find','role','button','click','--name','Cancel edit');call('find','role','button','click','--name','Undo');undo=capture('default-undo','Export project UV diagnostic GLB + source JSON');call('find','role','button','click','--name','Redo');redo=capture('default-redo','Export project GLB + source JSON')
   assert (redo/'morphloom-project.glb').read_bytes()==(after/'morphloom-project.glb').read_bytes()
  call('download','button[title^="Textureless static native parts only"]',str(root/(name+'-after.zip')))
  with zipfile.ZipFile(root/(name+'-after.zip')) as z:z.extractall(root/(name+'-kit'))
 print('three sizes actual exports, invalid tile blocking, Undo/Redo and native kits PASS')
finally:(root/'browser-commands.json').write_text(json.dumps(logs,indent=2))
