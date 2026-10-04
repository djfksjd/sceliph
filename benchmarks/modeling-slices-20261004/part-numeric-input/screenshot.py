import subprocess,json,time,base64,hashlib,zipfile
from pathlib import Path
root=Path('work/part-numeric-input-20261004').resolve();logs=[]
def call(*args):
 r=subprocess.run(['/Users/danny/.nvm/versions/node/v24.13.1/bin/agent-browser','--session','numeric-screenshot',*args],capture_output=True,text=True);logs.append({'args':list(args),'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr});assert r.returncode==0,r.stderr;return r.stdout
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
 call('open','http://127.0.0.1:4179/?editor=elements&numericimage=1');call('wait','--load','networkidle');call('upload','nav input[type=file]',str(Path('work/gear-projection-tile-20261004/final-default-kit/source.json').resolve()));call('wait','--text','Local projection tile (mm)');fill('Position X','5');fill('Local projection tile (mm)','');a=state();assert a['applyDisabled'] and a['alerts']
 call('eval',"document.querySelector(`[aria-label=\"Local projection tile (mm)\"]`).closest('label').scrollIntoView({block:'center'});true");call('screenshot',str(root/'blank-error-visible.png'));print('actual incomplete input and inline error screenshot PASS')
finally:
 (root/'screenshot-commands.json').write_text(json.dumps(logs,indent=2));call('close')
