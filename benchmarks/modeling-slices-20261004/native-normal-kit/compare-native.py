import subprocess,json
from pathlib import Path
root=Path('work/native-normal-kit-20261004').resolve();rows=[]
for name in ['small','default','large','gear']:
 folder=root/name;source=json.loads((folder/'source.json').read_text());target='spur_gear' if name=='gear' else 'ball_0000'
 for part in source['parts']:
  output=folder/(part['id']+'-normal-comparison.json')
  command=['node_modules/.bin/vite-node','scripts/compare-native-normal-payload.ts',str(folder/'model.glb'),str(folder/'edited.glb'),part['id'],str(output),str(1 if part['id']==target else 0),'0','0']
  r=subprocess.run(command,capture_output=True,text=True);rows.append({'case':name,'part':part['id'],'exit':r.returncode});(folder/(part['id']+'-normal-comparison.log')).write_text(r.stdout+r.stderr);assert r.returncode==0,r.stderr
 (folder/'all-normal-comparisons.json').write_text(json.dumps([json.loads((folder/(part['id']+'-normal-comparison.json')).read_text()) for part in source['parts']],indent=2))
(root/'normal-comparison-runs.json').write_text(json.dumps(rows,indent=2));print('34 mesh comparisons PASS')
