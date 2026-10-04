import subprocess,json,time,base64,hashlib,zipfile
from pathlib import Path
root=Path('work/pack-numeric-input-20261004').resolve();logs=[]
def call(*args):
 r=subprocess.run(['/Users/danny/.nvm/versions/node/v24.13.1/bin/agent-browser','--session','pack-numeric-after',*args],capture_output=True,text=True);logs.append({'args':list(args),'exit':r.returncode,'stdout':({'capturedBytes':len(r.stdout)} if args==('eval','JSON.stringify(window.saved)') else r.stdout),'stderr':r.stderr});assert r.returncode==0,r.stderr;return r.stdout
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
try:
 call('open','http://127.0.0.1:4179/?editor=elements&packnumericafter=1');call('wait','--load','networkidle');pack('mechanical.spur-gear.visual');call('wait','--text','boreDiameterMm');fill('boreDiameterMm','');a=state();assert a['generateDisabled'] and a['inputs']['boreDiameterMm']=='' and a['errors'];preserved=capture('pending-preserved','Export project UV diagnostic GLB + source JSON');assert (preserved/'morphloom-uv-diagnostic.glb').read_bytes()==(root/'before/morphloom-uv-diagnostic.glb').read_bytes();call('eval',"document.querySelector(`[aria-label=\"boreDiameterMm\"]`).closest('label').scrollIntoView({block:'center'});true");call('screenshot',str(root/'blank-generation-error.png'))
 call('find','role','button','click','--name','Restore valid generation inputs');assert state()['inputs']['boreDiameterMm']=='6' and not state()['generateDisabled'];call('find','role','button','click','--name','Generate pack');restored=capture('restored','Export project UV diagnostic GLB + source JSON');assert (restored/'morphloom-uv-diagnostic.glb').read_bytes()==(root/'before/morphloom-uv-diagnostic.glb').read_bytes()
 fill('boreDiameterMm','0');assert not state()['generateDisabled'];call('find','role','button','click','--name','Generate pack');zero=capture('explicit-zero','Export project UV diagnostic GLB + source JSON');assert (zero/'morphloom-uv-diagnostic.glb').read_bytes()==(root/'cleared-generated/morphloom-uv-diagnostic.glb').read_bytes()
 fill('boreDiameterMm','4');call('find','role','button','click','--name','Generate pack');four=capture('explicit-four','Export project UV diagnostic GLB + source JSON');assert json.loads((four/'morphloom-source.json').read_text())['parts'][0]['geometry']['boreDiameterMm']==4;fill('moduleMm','0');assert state()['generateDisabled'] and state()['errors'];fill('boreDiameterMm','');fill('moduleMm','1');assert state()['generateDisabled'];call('find','role','button','click','--name','Restore valid generation inputs');assert not state()['generateDisabled'];fill('boreDiameterMm','');call('upload','nav input[type=file]',str(four/'morphloom-source.json'));call('wait','--text','Loaded project');assert not state()['errors'] and state()['generateDisabled'];reopened=capture('reopened','Export project UV diagnostic GLB + source JSON');assert (reopened/'morphloom-uv-diagnostic.glb').read_bytes()==(four/'morphloom-uv-diagnostic.glb').read_bytes()
 pack('mechanical.bearing.visual');call('wait','--text','ballDiameterMm');fill('ballDiameterMm','');b=state();assert b['generateDisabled'];call('find','role','button','click','--name','Restore valid generation inputs');fill('ballDiameterMm','5');call('find','role','button','click','--name','Generate pack');bearing=capture('bearing-five','Export project GLB + source JSON');source=json.loads((bearing/'morphloom-source.json').read_text());assert next(x for x in source['parts'] if x['id']=='ball_0000')['geometry']['radius']==2.5
 fill('ballDiameterMm','');pack('mechanical.spur-gear.visual');call('wait','--text','boreDiameterMm');assert not state()['errors'] and state()['inputs']['boreDiameterMm']=='6';(root/'after-states.json').write_text(json.dumps({'gearBlank':a,'bearingBlank':b,'blankPreservesGLB':True,'restoreAndRegenerateExact':True,'explicitZeroStillSupportedExact':True,'fourMmReopenExact':True,'rangeAndMultipleErrorsBlocked':True,'importAndPackSwitchClearErrors':True,'bearingEditedBallRadiusMm':2.5},indent=2));print('blank/range/multiple/restore/explicit0/nonzero/reopen/second-pack PASS')
finally:(root/'after-commands.json').write_text(json.dumps(logs,indent=2));call('close')
