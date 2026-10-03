import subprocess,json,re,hashlib
from pathlib import Path
out=Path('/Users/danny/Documents/morphloom/outputs/lathe-fractional-segments-20261004');session='lathe-preflight'
def call(*args):return subprocess.run(['agent-browser','--session',session,*args],capture_output=True,text=True,timeout=70,check=True).stdout
def download(label,name):
 s=call('snapshot','-i');ref=re.search(r'button "'+re.escape(label)+r'" \[ref=(e\d+)\]',s);assert ref;call('download','@'+ref[1],str(out/name))
download('SAVE IR','browser-before-ir.json');download('GLB · BLENDER/UNITY/UNREAL/GODOT','browser-before.glb')
call('upload','input[type=file]',str(out/'browser-invalid.json'));call('wait','--fn','document.body.textContent.includes("Lathe segments must be an integer from 3 to 512")');text=call('eval','document.body.textContent');(out/'browser-error-text.json').write_text(text);call('screenshot',str(out/'browser-error.png'))
download('SAVE IR','browser-after-rejected-ir.json');download('GLB · BLENDER/UNITY/UNREAL/GODOT','browser-after-rejected.glb')
before=json.loads((out/'browser-before-ir.json').read_text());after=json.loads((out/'browser-after-rejected-ir.json').read_text());assert before==after==json.loads((out/'browser-valid.json').read_text());hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();assert hash(out/'browser-before.glb')==hash(out/'browser-after-rejected.glb')
(out/'browser-proof.json').write_text(json.dumps({'errorShown':True,'originalIRExact':True,'rejectedInputNotApplied':True,'glbByteExact':True,'glbSha256':hash(out/'browser-before.glb'),'method':'Actual native file upload, displayed error, SAVE IR and GLB downloads'},indent=2));call('close');print('Actual browser preflight failure leaves IR and GLB exactly unchanged')
