import subprocess,json,time
from pathlib import Path
root=Path('work/native-normal-kit-20261004').resolve();logs=[]
def call(*args):
 r=subprocess.run(['/Users/danny/.nvm/versions/node/v24.13.1/bin/agent-browser','--session','native-kit',*args],capture_output=True,text=True);logs.append({'args':list(args),'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr});assert r.returncode==0,r.stderr;return r.stdout
try:
 call('upload','nav input[type=file]',str(root/'default.json'));call('wait','--text','inner_race');time.sleep(.3)
 call('eval',"""(async()=>{const text=await(await fetch('/src/ElementEditor.tsx')).text();const {GLTFExporter}=await import(text.match(/import \{ GLTFExporter \} from "([^"]+)"/)[1]);const old=GLTFExporter.prototype.parseAsync;let calls=0;window.downloads=[];HTMLAnchorElement.prototype.click=function(){window.downloads.push(this.download)};GLTFExporter.prototype.parseAsync=async function(...args){const data=await old.apply(this,args);if(++calls===2){GLTFExporter.prototype.parseAsync=old;window.waiting=true;await new Promise(r=>window.release=r)}return data};return true})()""")
 call('find','role','button','click','--name','BLENDER 5.2 · NATIVE NORMAL KIT')
 for i in range(100):
  if 'true' in call('eval','Boolean(window.waiting)'):break
  time.sleep(.1)
 else:raise AssertionError('actual regeneration did not pause')
 call('eval',"""(()=>{File.prototype.text=async()=>{throw new Error('intentional kit replacement read failure')};const input=document.querySelector('nav input[type=file]'),dt=new DataTransfer();dt.items.add(new File(['{}'],'failed.json'));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true})()""")
 time.sleep(.2);call('eval','window.release();true');time.sleep(2)
 result=json.loads(json.loads(call('eval','JSON.stringify({downloads:window.downloads,status:document.querySelector("[role=status]").textContent})')))
 assert result['downloads']==[] and 'intentional kit replacement read failure' in result['status'],result
 print(json.dumps(result))
finally:(root/'race-commands.json').write_text(json.dumps(logs,indent=2))
