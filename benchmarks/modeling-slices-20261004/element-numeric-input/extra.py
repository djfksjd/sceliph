import subprocess,json,time,base64,hashlib,zipfile
from pathlib import Path
root=Path('work/element-numeric-input-20261004').resolve();logs=[]
def call(*args):
 r=subprocess.run(['/Users/danny/.nvm/versions/node/v24.13.1/bin/agent-browser','--session','element-numeric-extra',*args],capture_output=True,text=True);logs.append({'args':list(args),'exit':r.returncode,'stdout':({'capturedBytes':len(r.stdout)} if args==('eval','JSON.stringify(window.saved)') else r.stdout),'stderr':r.stderr});assert r.returncode==0,r.stderr;return r.stdout
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
def state():return json.loads(json.loads(call('eval',"JSON.stringify({values:Object.fromEntries([...document.querySelectorAll('aside[aria-label=Inspector] input[type=number]')].map(x=>[x.getAttribute('aria-label'),x.value])),alerts:[...document.querySelectorAll('[role=alert]')].map(x=>x.textContent),saveDisabled:[...document.querySelectorAll('button')].find(x=>x.textContent==='Save project JSON').disabled,exportDisabled:[...document.querySelectorAll('button')].find(x=>x.textContent==='Export project GLB + source JSON').disabled})")))
def select(id):call('fill','form input',id);call('press','Tab');call('click','form button[type=submit]')
try:
 call('open','http://127.0.0.1:4179/?editor=elements&explicitnumeric=1');call('wait','--load','networkidle');call('upload','nav input[type=file]',str(root/'explicit-source.json'));call('wait','--text','Individual effective values');before=capture('explicit-before','Export project GLB + source JSON');fill('Position X','');assert state()['saveDisabled'];call('find','role','button','click','--name','Cancel incomplete inputs');cancel=capture('explicit-cancel','Export project GLB + source JSON');assert (cancel/'morphloom-project.glb').read_bytes()==(before/'morphloom-project.glb').read_bytes();fill('Position X','6');after=capture('explicit-moved','Export project GLB + source JSON');q=json.loads((after/'morphloom-source.json').read_text());assert q['elements'][0]['position']==[6,65,0]
 call('eval',"""(async()=>{const text=await(await fetch('/src/ElementEditor.tsx')).text();const {GLTFExporter}=await import(text.match(/import \{ GLTFExporter \} from "([^"]+)"/)[1]);const old=GLTFExporter.prototype.parseAsync;window.saved=[];window.oldClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){window.saved.push(this.download)};GLTFExporter.prototype.parseAsync=async function(...args){const geometry=new Set();args[0].traverse(o=>{if(o.geometry)geometry.add(o.geometry)});window.expectedDisposals=geometry.size;window.disposals=0;for(const g of geometry)g.addEventListener('dispose',()=>window.disposals++);window.exportStarted=true;const data=await old.apply(this,args);await new Promise(resolve=>{window.releaseExport=resolve});return data};return true})()""")
 call('find','role','button','click','--name','Export project GLB + source JSON')
 for _ in range(50):
  if call('eval','typeof window.releaseExport').strip()=='"function"':break
  time.sleep(.1)
 else:raise AssertionError('Exporter did not reach barrier')
 fill('Position X','');assert state()['exportDisabled'];call('eval','window.releaseExport();true')
 for _ in range(50):
  result=json.loads(json.loads(call('eval','JSON.stringify({downloads:window.saved,disposals:window.disposals,expected:window.expectedDisposals})')))
  if result['disposals']==result['expected']:break
  time.sleep(.1)
 else:raise AssertionError(result)
 assert result['downloads']==[] and result['expected']>0;assert state()['alerts'];(root/'race-result.json').write_text(json.dumps(result,indent=2));call('eval','HTMLAnchorElement.prototype.click=window.oldClick;true');print('explicit world-coordinate edit and real pending-export cancellation/disposal PASS')
finally:(root/'extra-commands.json').write_text(json.dumps(logs,indent=2));call('close')
