import subprocess,json,time,base64,hashlib,zipfile
from pathlib import Path
root=Path('work/tooth-export-order-20261004').resolve();logs=[]
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
sessionName='tooth-first-current'
def choose():
 call('fill','form input','spur_gear');call('press','Tab');call('click','form button[type=submit]');call('select','select[aria-label="Connected feature ID"]','tooth_0003')
try:
 call('open','http://127.0.0.1:4179/?editor=elements&toothfirst=1');call('wait','--text','SCELIPH · ELEMENT EDITOR');call('snapshot','-i');pack('mechanical.spur-gear.visual');call('wait','--text','boreDiameterMm');fill('boreDiameterMm','4');call('find','role','button','click','--name','Generate pack');choose();first=capture('browser-first','Export diagnostic tooth cut');call('close')
 sessionName='tooth-reopen-current';call('open','http://127.0.0.1:4179/?editor=elements&toothreload=1');call('wait','--text','SCELIPH · ELEMENT EDITOR');call('snapshot','-i');call('upload','nav input[type=file]',str(first/'morphloom-gear-source.json'));call('wait','--text','Loaded project');choose();second=capture('browser-reopened','Export diagnostic tooth cut');assert (first/'spur_gear-tooth_0003-diagnostic.glb').read_bytes()==(second/'spur_gear-tooth_0003-diagnostic.glb').read_bytes();assert (first/'morphloom-gear-source.json').read_bytes()==(second/'morphloom-gear-source.json').read_bytes()
 source=json.loads((first/'morphloom-gear-source.json').read_text());assert source['parts'][0]['geometry']['op']=='spur-gear' and source['parts'][0]['geometry']['toothCount']==24
 call('screenshot',str(root/'browser-tooth-export.png'));(root/'browser-result.json').write_text(json.dumps({'fullGLBByteExact':True,'fullEditableGearSourceByteExact':True,'fullSourceGeometry':'spur-gear','fullSourceToothCount':24,'feature':'spur_gear/tooth_0003','scope':'diagnostic closed sector, not detachable part'},indent=2));print('actual tooth diagnostic/source download, fresh source reopen, same feature reexport whole bytes exact PASS')
finally:
 (root/'browser-commands.json').write_text(json.dumps(logs,indent=2));call('close')
