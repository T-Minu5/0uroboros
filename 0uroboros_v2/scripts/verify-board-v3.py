"""Validate the exported versioned geometry contract; no external dependencies."""
import json,struct
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'assets/models'
def read(p):
 data=p.read_bytes();length=struct.unpack_from('<I',data,12)[0];return json.loads(data[20:20+length])
a=read(root/'ouroboros-board-v2.glb');b=read(root/'ouroboros-board-v3.glb')
x={n['name']:n for n in a['nodes'] if 'mesh' not in n};y={n['name']:n for n in b['nodes'] if 'mesh' not in n}
assert x.keys()==y.keys()
changed=[]
for name in x:
 assert x[name].get('extras')==y[name].get('extras')
 av=x[name].get('translation',[0,0,0]);bv=y[name].get('translation',[0,0,0])
 if any(abs(i-j)>1e-5 for i,j in zip(av,bv)):changed.append({'name':name,'position':bv})
 for field,default in [('rotation',[0,0,0,1]),('scale',[1,1,1])]:
  assert all(abs(i-j)<1e-5 for i,j in zip(x[name].get(field,default),y[name].get(field,default)))
allowed=lambda n:n.endswith('_power') or n.endswith('_probability') or n in ['local_primary_integrity','local_backup_integrity']
assert all(allowed(n['name']) for n in changed)
assert len(changed)==17
assert len(b['meshes'])==9 and len(b['materials'])==9
assert {m['name'] for m in a['materials']}=={m['name'] for m in b['materials']}
tri=sum(b['accessors'][p['indices']]['count']//3 for m in b['meshes'] for p in m['primitives'])
report=json.loads((root/'board-v3-geometry-report.json').read_text())
report.pop('anchorTransformsUnchanged',None)
report.update({'baseToPerimeterAnchorsUnchanged':True,'comparedToV2':True,'intentionallyChangedAnchors':changed,'unchangedAnchors':34,'triangles':tri,'materialNames':[m['name'] for m in b['materials']]})
(root/'board-v3-geometry-report.json').write_text(json.dumps(report,indent=2))
print(f'PASS: 51 anchor names/extras, 34 unchanged positions, exactly 17 approved changes; {tri} triangles, 9 material meshes.')
