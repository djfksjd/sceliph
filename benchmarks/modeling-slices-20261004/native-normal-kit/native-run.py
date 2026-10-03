import subprocess,json
from pathlib import Path
root=Path('work/native-normal-kit-20261004').resolve();rows=[]
for name in ['small','default','large','gear']:
 folder=root/name
 command=['/Applications/Blender.app/Contents/MacOS/Blender','--background','--threads','1','--python-exit-code','1','--python',str(folder/'tools/blender-source-normal-import.py'),'--',str(folder/'model.glb'),str(folder/'output.blend'),str(folder/'receipt.json')]
 r=subprocess.run(command,capture_output=True,text=True);(root/(name+'-native.log')).write_text(r.stdout+r.stderr);rows.append({'case':name,'command':command,'exit':r.returncode});assert r.returncode==0,r.stderr
(root/'native-runs.json').write_text(json.dumps(rows,indent=2))
