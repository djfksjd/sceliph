import subprocess,json,time,sys
from pathlib import Path
CLI='/Users/danny/.nvm/versions/node/v24.13.1/bin/agent-browser'
stage=sys.argv[1]
attack=sys.argv[2] if len(sys.argv)>2 else 'read-failure'
logs=[]
def call(*args):
 r=subprocess.run([CLI,'--session','native-race',*args],capture_output=True,text=True)
 logs.append({'args':list(args),'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
 if r.returncode: raise RuntimeError(r.stderr)
 return r.stdout
call('open','http://127.0.0.1:4179/?editor=elements&race='+str(time.time()))
call('wait','--load','networkidle')
call('upload','nav input[type=file]',str(Path('benchmarks/modeling-slices-20261002/part-material-preservation/gear.elements.json').resolve()))
call('wait','--text','spur_gear')
if attack=='tooth-selection':
 call('eval',"""(async()=>{const p=await(await fetch('/benchmarks/modeling-slices-20261002/part-material-preservation/gear.elements.json')).json();for(const part of p.parts)delete part.axialChamferMm;const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(p)],'unchamfered-gear.json',{type:'application/json'}));const input=document.querySelector('nav input[type=file]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,200));return document.querySelector('[role=status]').textContent})()""")
call('eval',"""(async()=>{const text=await(await fetch('/src/ElementEditor.tsx')).text();const url=text.match(/import \{ GLTFExporter \} from "([^"]+)"/)[1];const {GLTFExporter}=await import(url);const old=GLTFExporter.prototype.parseAsync;window.downloads=[];HTMLAnchorElement.prototype.click=function(){window.downloads.push(this.download)};GLTFExporter.prototype.parseAsync=async function(...args){GLTFExporter.prototype.parseAsync=old;window.waiting=true;await new Promise(r=>window.release=r);return old.apply(this,args)};return 'armed actual exporter';})()""")
if attack=='tooth-selection':
 call('select','select[aria-label="Connected feature ID"]','tooth_0000')
 call('find','role','button','click','--name','Export diagnostic tooth cut')
else:
 call('find','role','button','click','--name','Export project GLB + source JSON')
assert 'true' in call('eval','Boolean(window.waiting)')
if attack in ['selection','tooth-selection']:
 call('find','role','textbox','fill','--name','Select by ID','spur_gear')
 call('find','role','button','click','--name','Select','--exact')
else:
 call('eval',"""(()=>{File.prototype.text=async function(){throw new Error('intentional replacement read failure')};const input=document.querySelector('nav input[type=file]'),dt=new DataTransfer();dt.items.add(new File(['{}'],'failed.json',{type:'application/json'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true})()""")
time.sleep(.3)
call('eval','window.release(); true')
for i in range(60):
 time.sleep(.15)
 text=call('eval','JSON.stringify({downloads:window.downloads,status:document.querySelector("[role=status]").textContent})')
 if i>12:break
Path('work/native-export-selection-20261004/'+stage+'-'+attack+'.json').write_text(json.dumps(logs,indent=2))
result=json.loads(json.loads(text))
if stage!='before':
 assert result['downloads']==[],result
 if attack=='read-failure':assert 'intentional replacement read failure' in result['status'],result
print(text)
