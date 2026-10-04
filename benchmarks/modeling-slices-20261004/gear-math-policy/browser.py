import subprocess,json,time,base64,hashlib,zipfile
from pathlib import Path
root=Path('work/gear-math-policy-20261004').resolve();logs=[]
def call(*args):
 r=subprocess.run(['/Users/danny/.nvm/versions/node/v24.13.1/bin/agent-browser','--session',sessionName,*args],capture_output=True,text=True);logs.append({'args':list(args),'exit':r.returncode,'stdout':({'capturedBytes':len(r.stdout)} if args==('eval','JSON.stringify(window.saved)') else r.stdout),'stderr':r.stderr});assert r.returncode==0,r.stderr;return r.stdout
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
def fill(name,value):
 if value=='':
  call('find','role','spinbutton','click','--name',name)
  for _ in range(8):call('press','Backspace')
 else:call('find','role','spinbutton','fill','--name',name,value)
 call('press','Tab')
def state():return json.loads(json.loads(call('eval',"JSON.stringify({values:Object.fromEntries([...document.querySelectorAll('input[type=number]')].map(x=>[x.getAttribute('aria-label'),x.value])),alerts:[...document.querySelectorAll('[role=alert]')].map(x=>x.textContent),applyDisabled:[...document.querySelectorAll('button')].find(x=>x.textContent==='Apply part edit').disabled})")))
def state():return json.loads(json.loads(call('eval',"JSON.stringify({inputs:Object.fromEntries([...document.querySelectorAll('main > label input[type=number]')].map(x=>[x.getAttribute('aria-label'),x.value])),errors:[...document.querySelectorAll('[role=alert]')].map(x=>x.textContent),generateDisabled:[...document.querySelectorAll('button')].find(x=>x.textContent==='Generate pack').disabled})")))
def pack(id):call('select','select:has(option[value="mechanical.spur-gear.visual"])',id)
sessionName='native-gear-policy-current'
def choose():
 call('fill','form input','spur_gear');call('press','Tab');call('click','form button[type=submit]')
try:
 call('wait','--text','SCELIPH · ELEMENT EDITOR');call('snapshot','-i');rows=[]
 for i in range(4):
  call('upload','nav input[type=file]',str(root/f'original-{i}.json'));call('wait','--text','Loaded project');choose();call('find','role','button','click','--name','Enable gear math policy (schema 0.8)');call('wait','--text','Gear arithmetic policy');assert 'legacy' in call('eval','document.querySelector(`[aria-label="Gear math revision"]`).value')
  call('select','select[aria-label="Gear math revision"]','morphloom.gear-ieee-series/0.1');call('find','role','button','click','--name','Apply part edit');folder=capture(f'browser-policy-{i}','Export project GLB + source JSON');assert (folder/'morphloom-project.glb').read_bytes()==(root/f'node-policy-{i}.glb').read_bytes()
  call('download','button[title^="Textureless static native parts only"]',str(root/f'normal-kit-{i}.zip'));rows.append({'case':i,'wholeNodeBrowserGLBByteExact':True})
  if i==1:
   call('find','role','button','click','--name','Undo');undo=capture('browser-undo','Export project GLB + source JSON');assert 'mathRevision' not in json.loads((undo/'morphloom-source.json').read_text())['parts'][0]['geometry'];call('find','role','button','click','--name','Redo');redo=capture('browser-redo','Export project GLB + source JSON');assert (redo/'morphloom-project.glb').read_bytes()==(folder/'morphloom-project.glb').read_bytes()
 call('close');sessionName='native-gear-policy-reopened';call('open','http://127.0.0.1:4179/?editor=elements&nativepolicyreopen=1');call('wait','--text','SCELIPH · ELEMENT EDITOR');call('upload','nav input[type=file]',str(root/'browser-policy-1/morphloom-source.json'));call('wait','--text','Loaded project');choose();assert 'morphloom.gear-ieee-series/0.1' in call('eval','document.querySelector(`[aria-label="Gear math revision"]`).value');reopened=capture('browser-reopened','Export project GLB + source JSON');assert (reopened/'morphloom-project.glb').read_bytes()==(root/'browser-policy-1/morphloom-project.glb').read_bytes()
 call('find','role','spinbutton','fill','--name','Position X','2');call('find','role','button','click','--name','Apply part edit');edited=capture('browser-edited','Export project GLB + source JSON');assert json.loads((edited/'morphloom-source.json').read_text())['parts'][0]['position']==[2,0,0];call('find','role','button','click','--name','Undo');undone=capture('browser-edit-undo','Export project GLB + source JSON');assert (undone/'morphloom-project.glb').read_bytes()==(reopened/'morphloom-project.glb').read_bytes();call('select','select[aria-label="Connected feature ID"]','tooth_0003');cut=capture('browser-tooth','Export diagnostic tooth cut');call('screenshot',str(root/'native-policy-editor.png'))
 (root/'browser-result.json').write_text(json.dumps({'cases':rows,'schemaMigrationLegacyDefault':True,'historyRedoWholeByteExact':True,'freshJSONReopenWholeByteExact':True,'furtherTranslationMm':[2,0,0],'editUndoWholeByteExact':True,'diagnosticFeatureExport':'spur_gear/tooth_0003'},indent=2));print('4 native policy Node/browser whole bytes exact; actual source reopen/edit/undo and kits PASS')
finally:
 (root/'browser-commands.json').write_text(json.dumps(logs,indent=2));call('close')
