import subprocess,json,zipfile,hashlib,time
from pathlib import Path
root=Path('work/native-normal-kit-20261004').resolve();logs=[]
def call(*args):
 r=subprocess.run(['/Users/danny/.nvm/versions/node/v24.13.1/bin/agent-browser','--session','native-kit-reopen',*args],capture_output=True,text=True);logs.append({'args':list(args),'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr});assert r.returncode==0,r.stderr;return r.stdout
try:
 call('open','http://127.0.0.1:4179/?editor=elements&freshkit=1');call('wait','--load','networkidle');call('upload','nav input[type=file]',str(root/'default/source.json'));call('wait','--text','inner_race')
 call('download','button[title^="Textureless static native parts only"]',str(root/'reopened.zip'))
 assert (root/'reopened.zip').read_bytes()==(root/'default.zip').read_bytes()
 call('find','role','textbox','fill','--name','Select by ID','ball_0000');call('find','role','button','click','--name','Select','--exact');call('find','role','spinbutton','fill','--name','Position X','17');call('find','role','button','click','--name','Apply part edit');
 call('download','button[title^="Textureless static native parts only"]',str(root/'edited.zip'))
 with zipfile.ZipFile(root/'edited.zip') as z:
  source=json.loads(z.read('source.json'));z.extractall(root/'edited')
 before=json.loads((root/'default/source.json').read_text());target=next(p for p in source['parts'] if p['id']=='ball_0000');assert target['position']==[17,0,0]
 expected=json.loads(json.dumps(before));next(p for p in expected['parts'] if p['id']=='ball_0000')['position']=[17,0,0];assert source==expected
 report={'freshBrowserSessionReopenedZIPExact':True,'editedTarget':'ball_0000','positionMm':[17,0,0],'otherSourcePropertiesExact':True,'editedZIPsha256':hashlib.sha256((root/'edited.zip').read_bytes()).hexdigest()};(root/'reopen-browser-result.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
finally:(root/'reopen-browser-commands.json').write_text(json.dumps(logs,indent=2))
