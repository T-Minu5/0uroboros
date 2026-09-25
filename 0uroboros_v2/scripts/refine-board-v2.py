"""Add restrained perimeter relief to immutable v1 GLB through Blender MCP.
All helper inputs are Three.js X/Y-up/Z coordinates. No gameplay mesh is moved.
"""
import bpy, math, json, struct, re
from pathlib import Path
from mathutils import Vector
ROOT=Path('/Users/t-minus/Dropbox/00_AI Projects/Card_IO/0uroboros_v2')
OUT=ROOT/'assets/models'
source=OUT/'ouroboros-board.glb'
scene=bpy.data.scenes.new('Ouroboros_Perimeter_V2')
bpy.context.window.scene=scene
bpy.ops.import_scene.gltf(filepath=str(source))
original=list(scene.objects)
anchor_objects=[o for o in original if o.type=='EMPTY']
# Every imported object gets an isolated name; exporter names are restored below.
for o in original:o.name='V2_'+re.sub(r'\.\d{3}$','',o.name)
materials={re.sub(r'\.\d{3}$','',m.name):m for o in original if o.type=='MESH' for m in o.data.materials}
metal=materials['OB / graphite titanium'];edge=materials['OB / milled gunmetal'];base=materials['OB / obsidian polymer'];red=materials['OB / restrained red traces']
parts=[]
def pos(p):return (p[0],-p[2],p[1])
def box(name,p,d,m,bevel=.05):
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos(p));o=bpy.context.object;o.name='V2_detail_'+name
 o.dimensions=(d[0],d[2],d[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 if bevel:
  mod=o.modifiers.new('Machined chamfer','BEVEL');mod.width=bevel;mod.segments=2
  o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL')
 parts.append(o);return o

def armor(name,p,w,d,height,chamfer,m):
 # Octagonal plan with a pronounced inset upper perimeter gives broad face relief.
 pts=[(-w/2+chamfer,-d/2),(w/2-chamfer,-d/2),(w/2,-d/2+chamfer),(w/2,d/2-chamfer),(w/2-chamfer,d/2),(-w/2+chamfer,d/2),(-w/2,d/2-chamfer),(-w/2,-d/2+chamfer)]
 inset=min(.12,w*.12,d*.12)
 verts=[]
 for yy,scale in [(-height/2,1),(height*.18,1),(height/2,1-inset/max(w,d))]:
  verts.extend(pos((p[0]+x*scale,p[1]+yy,p[2]+z*scale)) for x,z in pts)
 faces=[tuple(reversed(range(8))),tuple(range(16,24))]
 for layer in range(2):
  for i in range(8):j=(i+1)%8;faces.append((layer*8+i,layer*8+j,(layer+1)*8+j,(layer+1)*8+i))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
 o=bpy.data.objects.new('V2_detail_'+name,mesh);scene.collection.objects.link(o);o.data.materials.append(m)
 mod=o.modifiers.new('Edge machining','BEVEL');mod.width=.018;mod.segments=2;o.modifiers.new('Surface normals','WEIGHTED_NORMAL');parts.append(o);return o

def cassette(name,p,d,m,axis='x',count=6):
 # One coherent component: recessed black bed and separated raised louvers.
 start=len(parts);box(name+'_bed',p,d,base,.025)
 for i in range(count):
  t=(i-(count-1)/2)
  if axis=='x':q=(p[0]+t*d[0]/count,p[1]+.055,p[2]);size=(d[0]/count*.36,.075,d[2]*.77)
  else:q=(p[0],p[1]+.055,p[2]+t*d[2]/count);size=(d[0]*.77,.075,d[2]/count*.36)
  box(name+'_fin',q,size,m,.009)
 group=parts[start:];bpy.ops.object.select_all(action='DESELECT')
 for o in group:o.select_set(True)
 bpy.context.view_layer.objects.active=group[0];bpy.ops.object.convert(target='MESH');bpy.ops.object.join();obj=bpy.context.object;obj.name='V2_detail_'+name
 parts[start:]=[obj];return obj

def bolt(name,p):
 bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.115,depth=.046,location=pos(p));o=bpy.context.object;o.name='V2_detail_'+name;o.data.materials.append(edge);parts.append(o)
 slot=box(name+'_slot',(p[0],p[1]+.025,p[2]),(.12,.012,.027),base,.004)
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);slot.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');bpy.ops.object.join();parts.remove(slot)

# Corner saddles expand outward; inner edges never enter the play deck.
for sx in [-1,1]:
 for sz in [-1,1]:
  armor(f'corner_saddle_{sx}_{sz}',(sx*7.85,.36,sz*4.35),1.0,.99,.31,.22,metal)
  armor(f'corner_inset_{sx}_{sz}',(sx*7.89,.535,sz*4.38),.61,.60,.07,.14,base)
  bolt(f'captive_corner_fastener_{sx}_{sz}',(sx*7.9,.59,sz*4.40))
# Three armor segments per side: long uninterrupted negative spaces between them.
for sx in [-1,1]:
 for index,z in enumerate([-2.8,0,2.8]):
  armor(f'rail_segment_{sx}_{index}',(sx*8.04,.24,z),.65,2.20,.22,.14,metal)
  cassette(f'rail_vent_{sx}_{index}',(sx*8.065,.372,z),(.32,.045,1.22),edge,axis='z',count=5)
 for z in [-1.38,1.38]:
  armor(f'rail_bridge_{sx}_{z}',(sx*8.015,.43,z),.83,.30,.19,.09,edge)
 box(f'side_shadow_groove_{sx}',(sx*8.20,-.31,0),(.16,.14,6.90),base,.025)
 armor(f'lower_side_armor_{sx}',(sx*8.18,-.53,0),.40,7.2,.32,.14,metal)
# Wider front chamfers catch light under the cyan banks without changing their tops.
for sz in [-1,1]:
 for sx in [-1,1]:
  armor(f'fascia_wing_{sx}_{sz}',(sx*4.82,-.38,sz*4.91),5.0,.62,.52,.23,edge)
  cassette(f'fascia_radiator_{sx}_{sz}',(sx*4.82,-.086,sz*5.00),(3.45,.046,.25),metal,count=9)
# Central prow extends the front console chassis below its screen.
armor('central_front_prow',(0,-.35,5.04),3.68,1.03,.58,.35,metal)
armor('central_front_recess',(0,-.018,5.21),2.63,.32,.04,.10,base)
box('central_front_red_status_inlay',(0,.013,5.25),(1.75,.021,.038),red,.012)
armor('rear_service_cassette',(0,-.33,-4.93),3.60,.62,.42,.22,metal)
cassette('rear_service_vent',(0,-.08,-4.99),(2.60,.05,.25),edge,count=8)
for sx in [-1,1]:
 for sz in [-1,1]:
  armor(f'corner_underfoot_{sx}_{sz}',(sx*7.37,-.90,sz*4.12),1.28,1.08,.33,.23,base)
# Exactly 49 manufactured component assemblies, grouped for production.
part_count=len(parts)
anchor_count=len([o for o in original if o.type=='EMPTY'])
# Record immutable gameplay transforms before batching.
anchor_snapshot={o.name[3:]:list(o.location) for o in original if o.type=='EMPTY'}
bpy.context.view_layer.update()
# Batch both existing geometry and new components by material, retaining 9 draws.
for o in list(scene.objects):
 if o.type=='MESH':
  bpy.context.view_layer.objects.active=o;o.select_set(True)
  for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
  o.select_set(False)
bpy.ops.object.select_all(action='DESELECT')
meshes=[o for o in scene.objects if o.type=='MESH']
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();joined=bpy.context.object
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
for o in scene.objects:
 if o.type=='MESH':o.name='V2_Table_'+re.sub(r'\.\d{3}$','',o.active_material.name).split(' / ')[-1].replace(' ','_')
bpy.ops.object.select_all(action='SELECT')
target=OUT/'ouroboros-board-v2.glb'
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_apply=True,export_animations=False,export_extras=True)
# Keep v1 semantic export names even when Blender has identically named old scenes.
b=target.read_bytes();length,kind=struct.unpack_from('<II',b,12);g=json.loads(b[20:20+length])
for n in g.get('nodes',[]):
 if n.get('name','').startswith('V2_'):n['name']=re.sub(r'\.\d{3}$','',n['name'][3:])
for m in g.get('materials',[]):m['name']=re.sub(r'\.\d{3}$','',m['name'])
j=json.dumps(g,separators=(',',':')).encode();j+=b' '*((-len(j))%4);tail=b[20+length:]
target.write_bytes(struct.pack('<III',0x46546c67,2,20+len(j)+len(tail))+struct.pack('<II',len(j),kind)+j+tail)
# Reuse original review rig by copying, never relinking original objects.
source_scene=bpy.data.scenes.get('Ouroboros_Table_V31.001')
if source_scene:
 scene.world=source_scene.world
 for o in source_scene.objects:
  if o.type in ['LIGHT','CAMERA'] or o.name=='Studio floor':
   clone=o.copy();scene.collection.objects.link(clone)
   if o.type=='CAMERA':scene.camera=clone
if not scene.camera:
 bpy.ops.object.camera_add(location=pos((0,18,13.8)));scene.camera=bpy.context.object
if scene.camera:
 scene.camera.location=pos((0,18,13.8));scene.camera.rotation_euler=(Vector(pos((0,0,.7)))-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data=scene.camera.data.copy();scene.camera.data.type='ORTHO';scene.camera.data.ortho_scale=23.4
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'board-v2-review.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'ouroboros-board-v2.blend'))
report={'componentAssemblies':part_count,'anchorCount':anchor_count,'anchorTransformsUnchanged':all(list(o.location)==anchor_snapshot[o.name[3:]] for o in anchor_objects),'glbBytes':target.stat().st_size,'meshes':len(g['meshes']),'materials':len(g['materials']),'nodes':len(g['nodes']),'scene':scene.name}
(OUT/'board-v2-geometry-report.json').write_text(json.dumps(report,indent=2))
result=report
