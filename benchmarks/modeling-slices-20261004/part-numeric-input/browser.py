import subprocess,json,time,base64,hashlib,zipfile
from pathlib import Path
root=Path('work/part-numeric-input-20261004').resolve();logs=[]
def call(*args):
 r=subprocess.run(['/Users/danny/.nvm/versions/node/v24.13.1/bin/agent-browser','--session','numeric-after',*args],capture_output=True,text=True);logs.append({'args':list(args),'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr});assert r.returncode==0,r.stderr;return r.stdout
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
try:
 call('open','http://127.0.0.1:4179/?editor=elements&numericafter=1');call('wait','--load','networkidle');fixture=Path('work/gear-projection-tile-20261004/final-default-kit/source.json').resolve();call('upload','nav input[type=file]',str(fixture));call('wait','--text','Local projection tile (mm)')
 fill('Position X','5');fill('Local projection tile (mm)','');a=state();assert a['applyDisabled'] and a['values']['Local projection tile (mm)']=='' and any('Local projection tile' in x for x in a['alerts']),a
 call('screenshot',str(root/'blank-blocked.png'));fill('Position Y','');fill('Local projection tile (mm)','10');b=state();assert b['applyDisabled'] and any('Position Y' in x for x in b['alerts']),b
 fill('Position Y','0');assert not state()['applyDisabled'];call('find','role','button','click','--name','Cancel edit');assert state()['values']['Position X']=='0' and not state()['alerts']
 fill('Local projection tile (mm)','');fill('UV scalar (dimensionless)','50');c=state();assert not c['applyDisabled'] and not c['alerts'] and c['values']['Local projection tile (mm)']=='20',c
 call('find','role','button','click','--name','Cancel edit');fill('UV scalar (dimensionless)','');fill('Local projection tile (mm)','10');assert not state()['alerts']
 fill('Position X','5');call('find','role','button','click','--name','Apply part edit');folder=capture('moved','Export project GLB + source JSON');source=json.loads((folder/'morphloom-source.json').read_text());original=json.loads(fixture.read_text());expected=json.loads(fixture.read_text());expected['parts'][0]['position'][0]=5;expected['selection']=['spur_gear'];assert source==expected
 call('upload','nav input[type=file]',str(folder/'morphloom-source.json'));call('wait','--text','Local projection tile (mm)');assert state()['values']['Position X']=='5';reopened=capture('reopened','Export project GLB + source JSON');assert (reopened/'morphloom-project.glb').read_bytes()==(folder/'morphloom-project.glb').read_bytes()
 fill('Position X','6');call('find','role','button','click','--name','Apply part edit');additional=capture('additional-edit','Export project GLB + source JSON');assert json.loads((additional/'morphloom-source.json').read_text())['parts'][0]['position'][0]==6
 call('find','role','button','click','--name','Lock');call('wait','--text','Unlock');assert json.loads(json.loads(call('eval',"JSON.stringify([...document.querySelectorAll('.element-columns input[type=number]')].every(x=>x.disabled))"))) is True
 (root/'after-states.json').write_text(json.dumps({'blankTile':a,'multipleInvalid':b,'aliasCorrection':c,'savedIRExactExceptDeclaredPosition':True,'freshLoadGLBExact':True,'additionalEditPositionMm':6,'lockedNumbersDisabled':True},indent=2));print('blank/multiple invalid fields blocked, correction/Cancel/aliases/lock/save/reopen/additional-edit PASS')
finally:
 (root/'last-state.txt').write_text(call('eval',"JSON.stringify([...document.querySelectorAll('input[type=number]')].map(x=>({label:x.getAttribute('aria-label'),disabled:x.disabled})))"))
 (root/'after-browser-commands.json').write_text(json.dumps(logs,indent=2));call('close')
