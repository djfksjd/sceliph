import subprocess,json,time,base64,hashlib,zipfile
from pathlib import Path
root=Path('work/pack-numeric-input-20261004').resolve();logs=[]
def call(*args):
 r=subprocess.run(['/Users/danny/.nvm/versions/node/v24.13.1/bin/agent-browser','--session','pack-followup',*args],capture_output=True,text=True);logs.append({'args':list(args),'exit':r.returncode,'stdout':({'capturedBytes':len(r.stdout)} if args==('eval','JSON.stringify(window.saved)') else r.stdout),'stderr':r.stderr});assert r.returncode==0,r.stderr;return r.stdout
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
 call('snapshot','-i');pack('mechanical.bearing.visual');call('wait','--text','ballDiameterMm');fill('ballDiameterMm','');b=state();assert b['generateDisabled'];call('find','role','button','click','--name','Restore valid generation inputs');fill('ballDiameterMm','5');call('find','role','button','click','--name','Generate pack');bearing=capture('bearing-five','Export project GLB + source JSON');source=json.loads((bearing/'morphloom-source.json').read_text());assert next(x for x in source['parts'] if x['id']=='ball_0000')['geometry']['radius']==2.5
 fill('ballDiameterMm','');pack('mechanical.spur-gear.visual');call('wait','--text','boreDiameterMm');assert not state()['errors'] and state()['inputs']['boreDiameterMm']=='6'
 call('upload','nav input[type=file]',str(root/'explicit-four/morphloom-source.json'));call('wait','--text','Loaded project');call('fill','form input','spur_gear');call('press','Tab');call('click','form button[type=submit]');call('find','role','button','click','--name','Enable UV editing (schema 0.4)');call('wait','--text','Local projection tile (mm)');call('find','role','spinbutton','fill','--name','Local projection tile (mm)','10');call('find','role','button','click','--name','Apply part edit');call('snapshot','-i');call('download','button[title^="Textureless static native parts only"]',str(root/'four-native.zip'))
 with zipfile.ZipFile(root/'four-native.zip') as z:z.extractall(root/'four-native-kit')
 call('close');call('open','http://127.0.0.1:4179/?editor=elements&freshpack=1');call('wait','--load','networkidle');call('upload','nav input[type=file]',str(root/'four-native-kit/source.json'));call('wait','--text','Loaded project');call('snapshot','-i');call('download','button[title^="Textureless static native parts only"]',str(root/'four-native-reopened.zip'));assert (root/'four-native.zip').read_bytes()==(root/'four-native-reopened.zip').read_bytes()
 (root/'followup-results.json').write_text(json.dumps({'bearingBlankBlocked':b,'bearingBallRadiusMm':2.5,'packSwitchClearsErrorAndDefaults':True,'freshNativeKitWholeZIPByteExact':True,'ordinaryGLBWholeByteExact':False,'ordinaryReopenDiagnosis':'ordinary-reopen-diagnosis.json','DCC':'not-run'},indent=2));print('bearing inputs and fresh native kit whole ZIP exact PASS; ordinary GLB byte equality remains FAIL')
finally:
 (root/'followup-commands.json').write_text(json.dumps(logs,indent=2));call('close')
