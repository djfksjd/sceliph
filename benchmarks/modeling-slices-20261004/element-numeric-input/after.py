import subprocess,json,time,base64,hashlib,zipfile
from pathlib import Path
root=Path('work/element-numeric-input-20261004').resolve();logs=[]
def call(*args):
 r=subprocess.run(['/Users/danny/.nvm/versions/node/v24.13.1/bin/agent-browser','--session','element-numeric-after',*args],capture_output=True,text=True);logs.append({'args':list(args),'exit':r.returncode,'stdout':({'capturedBytes':len(r.stdout)} if args==('eval','JSON.stringify(window.saved)') else r.stdout),'stderr':r.stderr});assert r.returncode==0,r.stderr;return r.stdout
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
 call('open','http://127.0.0.1:4179/?editor=elements&elementnumericafter=1');call('wait','--load','networkidle');call('upload','nav input[type=file]',str(root/'source.json'));call('wait','--text','Individual effective values');fill('Position X','');a=state();assert a['saveDisabled'] and a['exportDisabled'] and a['values']['Position X']=='' and a['alerts'],a
 call('eval',"document.querySelector(`[aria-label=\"Position X\"]`).closest('label').scrollIntoView({block:'center'});true");call('screenshot',str(root/'blank-error.png'));call('find','role','button','click','--name','Cancel incomplete inputs');cancel=capture('cancel','Export project GLB + source JSON');assert (cancel/'morphloom-project.glb').read_bytes()==(root/'before/morphloom-project.glb').read_bytes()
 fill('Position X','');fill('Rotation Y','');b=state();assert b['saveDisabled'] and len(b['alerts'])>=3;fill('Position X','5');assert state()['saveDisabled'];call('find','role','button','click','--name','Cancel incomplete inputs');fill('Position X','6');moved=capture('moved','Export project GLB + source JSON');q=json.loads((moved/'morphloom-source.json').read_text());assert q['groups'][0]['overrides']['body_fur/000000']['position']==[6,0,0]
 call('find','role','button','click','--name','Undo');undo=capture('undo','Export project GLB + source JSON');assert (undo/'morphloom-project.glb').read_bytes()==(root/'before/morphloom-project.glb').read_bytes();call('find','role','button','click','--name','Redo');redo=capture('redo','Export project GLB + source JSON');assert (redo/'morphloom-project.glb').read_bytes()==(moved/'morphloom-project.glb').read_bytes()
 select('body_fur');call('wait','--text','Group defaults');fill('Count','');c=state();assert c['saveDisabled'];select('body_fur/000000');call('wait','--text','Individual effective values');assert not state()['saveDisabled'] and not state()['alerts'];fill('Position X','');call('upload','nav input[type=file]',str(root/'bad.json'));call('wait','--text','ProjectError: json: project');assert not state()['alerts'];call('upload','nav input[type=file]',str(moved/'morphloom-source.json'));call('wait','--text','Individual effective values');reopened=capture('reopened','Export project GLB + source JSON');assert (reopened/'morphloom-project.glb').read_bytes()==(moved/'morphloom-project.glb').read_bytes();fill('Position X','7');extra=capture('additional','Export project GLB + source JSON');assert json.loads((extra/'morphloom-source.json').read_text())['groups'][0]['overrides']['body_fur/000000']['position']==[7,0,0]
 call('find','role','button','click','--name','Lock');call('wait','--text','Unlock');locked=json.loads(json.loads(call('eval',"JSON.stringify([...document.querySelectorAll('aside[aria-label=Inspector] input[type=number]')].every(x=>x.disabled))")));assert locked is True
 (root/'after-states.json').write_text(json.dumps({'blank':a,'multipleFields':b,'blankGroupCount':c,'cancelGLBExact':True,'undoRedoGLBExact':True,'reopenGLBExact':True,'additionalPositionMm':7,'lockedInputsDisabled':True},indent=2));print('actual blank/correction/Cancel/group/selection/read failure/undo/redo/save/reopen/additional/lock PASS')
finally:
 (root/'last-state.txt').write_text(call('eval',"JSON.stringify({target:document.querySelector('form input')?.value,status:document.querySelector('[role=status]')?.textContent,inspector:document.querySelector('aside[aria-label=Inspector]')?.textContent})"))
 (root/'after-commands.json').write_text(json.dumps(logs,indent=2));call('close')
