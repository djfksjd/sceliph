import subprocess,json,time
from pathlib import Path
root=Path('work/gear-projection-tile-20261004').resolve();logs=[]
def call(*args):
 r=subprocess.run(['/Users/danny/.nvm/versions/node/v24.13.1/bin/agent-browser','--session','gear-tile-visual',*args],capture_output=True,text=True);logs.append({'args':list(args),'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr});assert r.returncode==0,r.stderr;return r.stdout
try:
 call('open','http://127.0.0.1:4179/?editor=elements&tilevisual=1');call('wait','--load','networkidle')
 call('eval',"""(async()=>{const text=await(await fetch('/src/ElementEditor.tsx')).text();const {OrbitControls}=await import(text.match(/import \{ OrbitControls \} from "([^"]+)"/)[1]);const old=OrbitControls.prototype.update;OrbitControls.prototype.update=function(...args){const r=old.apply(this,args);window.actualCamera={position:this.object.position.toArray(),target:this.target.toArray(),fov:this.object.fov,aspect:this.object.aspect,near:this.object.near,far:this.object.far};return r};return true})()""")
 call('upload','nav input[type=file]',str(root/'default-source.json'));call('wait','--text','spur_gear');call('find','role','button','click','--name','Enable UV editing (schema 0.4)');call('wait','--text','Local projection tile (mm)');call('find','role','checkbox','check','--name','Isolate selection');call('find','role','checkbox','check','--name','Synthetic UV checker preview');call('find','role','button','click','--name','Fit view');time.sleep(.5)
 call('eval','document.querySelector(".element-viewport").scrollIntoView({block:"center"});true')
 a=json.loads(call('eval','JSON.stringify({camera:window.actualCamera,viewport:document.querySelector(".element-viewport").getBoundingClientRect().toJSON()})'));a=json.loads(a)
 call('screenshot',str(root/'fixed-checker-before.png'));call('find','role','spinbutton','fill','--name','Local projection tile (mm)','10');call('find','role','button','click','--name','Apply part edit');time.sleep(.5)
 call('eval','document.querySelector(".element-viewport").scrollIntoView({block:"center"});true');b=json.loads(json.loads(call('eval','JSON.stringify({camera:window.actualCamera,viewport:document.querySelector(".element-viewport").getBoundingClientRect().toJSON()})')));call('screenshot',str(root/'fixed-checker-after.png'))
 assert a['viewport']['width']==b['viewport']['width'] and a['viewport']['height']==b['viewport']['height']
 for k in ['position','target']:assert all(abs(x-y)<1e-10 for x,y in zip(a['camera'][k],b['camera'][k]))
 for k in ['fov','aspect','near','far']:assert abs(a['camera'][k]-b['camera'][k])<1e-10
 (root/'fixed-camera.json').write_text(json.dumps({'before':a,'after':b,'lighting':'existing ElementEditor HemisphereLight2 / DirectionalLight2, unchanged source code','scope':'synthetic 64px/8cell UV checker, authored local projection density; no geometry accuracy claim'},indent=2));print('same actual camera, viewport and source lighting PASS')
finally:(root/'visual-commands.json').write_text(json.dumps(logs,indent=2))
