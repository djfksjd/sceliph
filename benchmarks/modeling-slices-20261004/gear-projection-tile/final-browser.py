import subprocess,json,zipfile,time
from pathlib import Path
root=Path('work/gear-projection-tile-20261004').resolve();logs=[]
def call(*args):
 r=subprocess.run(['/Users/danny/.nvm/versions/node/v24.13.1/bin/agent-browser','--session','gear-tile-final',*args],capture_output=True,text=True);logs.append({'args':list(args),'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr});assert r.returncode==0,r.stderr;return r.stdout
try:
 call('open','http://127.0.0.1:4179/?editor=elements&finaltile=1');call('wait','--load','networkidle')
 for name in ['small','default','large']:
  call('upload','nav input[type=file]',str(root/(name+'-source.json')));call('wait','--text','spur_gear');call('find','role','button','click','--name','Enable UV editing (schema 0.4)');call('wait','--text','Local projection tile (mm)');call('find','role','spinbutton','fill','--name','Local projection tile (mm)','10');call('find','role','button','click','--name','Apply part edit');target=root/('final-'+name+'.zip');call('download','button[title^="Textureless static native parts only"]',str(target))
  with zipfile.ZipFile(target) as z:z.extractall(root/('final-'+name+'-kit'))
 call('upload','nav input[type=file]',str(root/'final-default-kit/source.json'));call('wait','--text','Local projection tile (mm)');call('download','button[title^="Textureless static native parts only"]',str(root/'final-reopened.zip'));assert (root/'final-reopened.zip').read_bytes()==(root/'final-default.zip').read_bytes()
 for size in [20,10]:
  call('find','role','spinbutton','fill','--name','Local projection tile (mm)',str(size));call('find','role','button','click','--name','Apply part edit');call('download','button[title^="Textureless static native parts only"]',str(root/('final-'+str(size)+'mm.zip')))
 assert (root/'final-10mm.zip').read_bytes()==(root/'final-default.zip').read_bytes();print('first saved kit / saved JSON reopen / 10-to-20-to-10 mm whole ZIP bytes exact PASS')
finally:(root/'final-browser-commands.json').write_text(json.dumps(logs,indent=2))
