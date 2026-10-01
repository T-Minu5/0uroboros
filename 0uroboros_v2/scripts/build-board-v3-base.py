"""Original concept-directed 0uroboros board. Run through Blender MCP.
Coordinates supplied to helpers are Three.js x/y/z; converted to Blender Z-up.
Existing scenes are retained. Only a new scene is created.
"""
import bpy, math, json, struct, re
from pathlib import Path
from mathutils import Vector

ROOT = Path('/Users/t-minus/Dropbox/00_AI Projects/0uroboros_ProjectFolder/0uroboros_v2')
OUT = ROOT / 'assets/models'
OUT.mkdir(parents=True, exist_ok=True)
scene = bpy.data.scenes.new('Ouroboros_Table_V3_Base')
bpy.context.window.scene = scene
collection = scene.collection
def pos(p): return (p[0], -p[2], p[1])
def material(name, color, metallic=0, rough=.4, emission=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metallic
    p.inputs['Roughness'].default_value=rough
    p.inputs['Emission Color'].default_value=(*color,1)
    p.inputs['Emission Strength'].default_value=emission
    return m
metal=material('OB / graphite titanium',(.036,.048,.069),.78,.32)
edge=material('OB / milled gunmetal',(.13,.16,.21),.82,.27)
base=material('OB / obsidian polymer',(.012,.015,.027),.25,.53)
well=material('OB / wine-black field glass',(.038,.008,.021),.5,.31)
plate=material('OB / Location smoked violet',(.072,.035,.105),.6,.31)
pink=material('OB / magenta inlay',(.95,.005,.42),.25,.3,2.2)
red=material('OB / restrained red traces',(.55,.009,.029),.25,.4,.9)
cyan=material('OB / cyan Data Center core',(.007,.55,.8),.15,.3,1.7)
gold=material('OB / probability gold',(.65,.4,.03),.5,.3,.35)
def box(name,p,d,m,bevel=.06):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos(p))
    o=bpy.context.object; o.name=name; o.dimensions=(d[0],d[2],d[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(m)
    if bevel:
        mod=o.modifiers.new('Manufactured radius','BEVEL');mod.width=bevel;mod.segments=3
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o
def rounded(w,d,r,steps=8):
    pts=[]
    for cx,cz,start in [(w/2-r,d/2-r,0),(-w/2+r,d/2-r,90),(-w/2+r,-d/2+r,180),(w/2-r,-d/2+r,270)]:
        for i in range(steps+1):
            a=math.radians(start+i*90/steps);pts.append((cx+r*math.cos(a),cz+r*math.sin(a)))
    return pts
def rim(name,p,w,d,r,width,height,m):
    outer=rounded(w,d,r);inner=rounded(w-2*width,d-2*width,max(.025,r-width)); n=len(outer)
    verts=[pos((p[0]+x,p[1]+h,p[2]+z)) for h in [-height/2,height/2] for contour in [outer,inner] for x,z in contour]
    faces=[]
    for i in range(n):
        j=(i+1)%n
        faces += [(i,j,n+j,n+i),(2*n+i,3*n+i,3*n+j,2*n+j),(i,2*n+i,2*n+j,j),(n+i,n+j,3*n+j,3*n+i)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);collection.objects.link(o);o.data.materials.append(m)
    return o
def ring(name,p,r,width,m):
    bpy.ops.mesh.primitive_torus_add(major_segments=40,minor_segments=8,location=pos(p),major_radius=r,minor_radius=width)
    o=bpy.context.object;o.name=name;o.data.materials.append(m)
    for f in o.data.polygons:f.use_smooth=True
    return o
def anchor(name,p,**extras):
    o=bpy.data.objects.new(name,None);collection.objects.link(o);o.location=pos(p)
    for k,v in extras.items():o[k]=v
    return o

def polygon_plate(name,p,outline,height,m,bevel=.015):
    n=len(outline)
    verts=[pos((p[0]+x,p[1]+h,p[2]+z)) for h in [-height/2,height/2] for x,z in outline]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    for i in range(n):j=(i+1)%n;faces.append((i,j,n+j,n+i))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);collection.objects.link(o);o.data.materials.append(m)
    if bevel:
        mod=o.modifiers.new('Subtle manufactured chamfer','BEVEL');mod.width=bevel;mod.segments=2
        o.modifiers.new('Weighted normal','WEIGHTED_NORMAL')
    return o

# Cohesive stacked chassis, perimeter rubber isolation, metal guard and luminous insert.
box('Armored chassis',(0,-.4,0),(16.4,.8,9.65),base,.55)
box('Continuous play deck',(0,-.015,0),(15.6,.2,8.85),metal,.42)
for yy,w,d,rr,ww,hh,mat in [(-.61,16.4,9.65,.75,.16,.11,edge),(-.39,16.55,9.8,.78,.08,.09,pink),(-.20,16.45,9.7,.75,.17,.14,metal),(.12,16.15,9.4,.9,.36,.3,edge),(.23,15.66,8.94,.78,.13,.12,base),(.28,15.40,8.68,.69,.065,.075,pink),(.20,15.17,8.45,.62,.07,.06,metal)]:
    rim('Perimeter', (0,yy,0),w,d,rr,ww,hh,mat)
for x in [-7.7,7.7]:
    for z in [-4.25,4.25]:
        box('Corner impact cap',(x,.36,z),(.65,.23,.72),metal,.15)
        ring('Corner captive fastener',(x,.49,z),.12,.023,edge)
        box('Bolt slot',(x,.50,z),(.14,.01,.022),base,.006)
# Five continuous lanes, each a paired deployment well and structurally joined Location.
nodes=[]
for i,x in enumerate([-5.6,-2.8,0,2.8,5.6]):
    name=f'Node_{i+1}'
    box(name+'_spine',(x,.09,0),(2.58,.15,7.68),base,.17)
    rim(name+'_lane_rail',(x,.16,0),2.56,7.63,.18,.07,.14,edge)
    for sign,side in [(-1,'opponent'),(1,'local')]:
        box(name+'_'+side+'_well',(x,.16,sign*2.40),(2.35,.065,2.85),well,.10)
        for dx in [-1.02,1.02]:
            for zz in [1.42,3.50]:
                box('Lane alignment tick',(x+dx,.216,sign*zz),(.18,.012,.025),edge,.004)
        # V3 rhombus: neutral, wider than tall, no circular/red components.
        power_top=.70 if side=='opponent' else .46
        diamond=[(-.425,0),(0,-.30),(.425,0),(0,.30)]
        polygon_plate(name+'_'+side+'_rhombus_shell',(x,power_top-.090,sign*.98),diamond,.15,edge,.018)
        inset=[(px*.78,pz*.78) for px,pz in diamond]
        polygon_plate(name+'_'+side+'_rhombus_face',(x,power_top-.008,sign*.98),inset,.016,metal,.008)
        anchor(name+'_'+side+'_power',(x,power_top,sign*.98),role='power',player=side)
        anchor(name+'_'+side+'_deployment',(x,.24,sign*2.4),role='deployment',width=2.32,depth=2.55)
        for dx in [-1.14,1.14]:
            for zz in [1.48,2.05,2.62,3.19]:
                box('Recess fastening',(x+dx,.245,sign*zz),(.06,.04,.17),metal,.015)
    box(name+'_location_bridge',(x,.235,0),(2.69,.32,1.44),metal,.19)
    rim(name+'_location_frame',(x,.414,0),2.48,1.21,.19,.08,.08,edge)
    box(name+'_location_screen',(x,.421,0),(2.26,.022,.98),plate,.12)
    for dx in [-1.19,1.19]:
        for zz in [-.43,.43]:box('Location screws',(x+dx,.47,zz),(.06,.025,.06),gold,.014)
    shoulder=[(-.60,.22),(.60,.22),(.43,-.02),(0,-.40),(-.43,-.02)]
    polygon_plate(name+'_probability_peaked_shoulder',(x,.48,3.98),shoulder,.16,edge,.025)
    face=[(px*.85,pz*.85) for px,pz in shoulder]
    polygon_plate(name+'_probability_dark_facet',(x,.571,3.98),face,.014,metal,.008)
    anchor(name+'_location',(x,.46,0),role='location',width=2.26,depth=.98)
    anchor(name+'_probability',(x,.70,3.90),role='probability')
    nodes.append({'index':i,'x':x,'location':[x,.46,0],'powerLocal':[x,.46,.98],'powerOpponent':[x,.70,-.98],'deploymentLocal':[x,.24,2.4],'deploymentOpponent':[x,.24,-2.4]})
# Far and near Data Center banks integrated in the perimeter architecture.
for sign,side in [(-1,'opponent'),(1,'local')]:
    for x,dc in [(-4.6,'backup'),(4.6,'primary')]:
        if side=='local':
            dc_z=4.75
            box(side+'_'+dc+'_housing',(x,.04,dc_z),(3.45,.48,.76),base,.11)
            box(side+'_'+dc+'_core',(x,.305,dc_z),(2.85,.11,.38),cyan,.05)
            for dx in [-1.47,1.47]:box('Core clamp',(x+dx,.25,dc_z),(.20,.18,.67),metal,.045)
            for dx in [-1.05,-.75,-.45,-.15,.15,.45,.75,1.05]:
                box('Data lattice',(x+dx,.359,dc_z),(.022,.012,.34),edge,.003)
            anchor(side+'_'+dc+'_integrity',(x,.38,dc_z),role='data-center')
        else:
            box(side+'_'+dc+'_housing',(x,.23,sign*4.48),(3.45,.55,.76),base,.13)
            box(side+'_'+dc+'_core',(x,.53,sign*4.48),(2.85,.13,.40),cyan,.1)
            for dx in [-1.47,1.47]:box('Core clamp',(x+dx,.54,sign*4.48),(.20,.25,.67),metal,.07)
            for dx in [-1.05,-.75,-.45,-.15,.15,.45,.75,1.05]:
                box('Data lattice',(x+dx,.612,sign*4.48),(.022,.015,.36),edge,.003)
            anchor(side+'_'+dc+'_integrity',(x,.65,sign*4.48),role='data-center')
    box(side+'_resource_housing',(0,.17,sign*4.58),(3.25,.53,1.03),metal,.21)
    box(side+'_resource_screen',(0,.45,sign*4.60),(2.83,.04,.72),plate,.12)
    anchor(side+'_resources',(0,.49,sign*4.60),role='resources')
    for x in [-2.04,2.04]:
        for dz in [-.20,0,.20]:box('Heat-exchanger louver',(x,.40,sign*4.5+dz),(.54,.08,.07),base,.02)
# Duration outriggers and pile bays occupy the concept's left peripheral region.
for sign,side in [(-1,'opponent'),(1,'local')]:
    box(side+'_duration_outrigger',(-8.07,-.20,sign*5.90),(3.56,.24,1.48),base,.18)
    for j in range(4):
        x=-9.3+j*.82; z=sign*5.90
        rim(side+'_duration_bay',(x,-.052,z),.71,1.22,.08,.025,.025,pink if sign<0 else cyan)
        anchor(side+f'_duration_{j}',(x,-.02,z),role='duration')
    for j,role in enumerate(['draw','discard']):
        z=sign*4.80
        box(side+'_'+role+'_bay',(-8.95+j*1.6,-.17,z),(1.47,.17,.54),metal,.08)
        anchor(side+'_'+role,(-8.95+j*1.6,-.07,z),role=role)
# Foreground stays clear under the hand; dedicated cache and one timer housing.
box('Crypto_cache_housing',(6.0,-.15,6.00),(2.4,.28,1.6),base,.22)
rim('Crypto_cache_inlay',(6.0,.009,6.00),2.30,1.50,.18,.028,.025,cyan)
anchor('local_crypto_cache',(6,.04,6),role='crypto-cache')
box('End_turn_single_housing',(8.70,-.11,6.00),(2.1,.33,.94),metal,.14)
box('End_turn_single_screen',(8.70,.075,6.00),(1.86,.045,.7),cyan,.10)
anchor('end_turn_timer',(8.7,.12,6),role='single-countdown-control')
anchor('hand_fan_origin',(0,.4,6.05),role='hand',clearanceWidth=10)

# Production batch by material: few draw calls, while semantic anchor empties survive.
source_objects=len([o for o in scene.objects if o.type=='MESH'])
for m in [metal,edge,base,well,plate,pink,red,cyan,gold]:
    group=[o for o in scene.objects if o.type=='MESH' and o.active_material==m]
    if not group:continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in group:o.select_set(True)
    bpy.context.view_layer.objects.active=group[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    bpy.context.object.name='Table_'+m.name.split(' / ')[1].replace(' ','_')

# Render rig lives only in the .blend; GLB contains table geometry/semantic anchors.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'ouroboros-board-v3-base.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_yup=True,export_animations=False,export_extras=True)
# Strip Blender collision suffixes only in exported names; original scenes untouched.
pth=OUT/'ouroboros-board-v3-base.glb';data=pth.read_bytes();length,kind=struct.unpack_from('<II',data,12);payload=json.loads(data[20:20+length])
for item in payload.get('nodes',[])+payload.get('materials',[]):
    if 'name' in item:item['name']=re.sub(r'\.\d{3}$','',item['name'])
encoded=json.dumps(payload,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);tail=data[20+length:]
pth.write_bytes(struct.pack('<III',0x46546c67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),kind)+encoded+tail)
world=bpy.data.worlds.new('OB studio');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.075,.095,.15,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.42
def area(name,p,power,color,size):
    bpy.ops.object.light_add(type='AREA',location=pos(p));o=bpy.context.object;o.name=name;o.data.energy=power;o.data.color=color;o.data.shape='DISK';o.data.size=size
    o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
area('Softbox key',(0,12,1),2300,(.69,.77,1),12)
area('Magenta rim',(-9,4,-2),700,(1,.04,.3),8)
area('Cyan edge',(6,5,6),1100,(.04,.7,1),7)
box('Studio floor',(0,-.94,0),(200,.1,200),material('Studio floor',(.013,.019,.033),.1,.6),.0)
bpy.ops.object.camera_add(location=pos((.0,17.8,18.8)))
camera=bpy.context.object;camera.name='Board review camera'
camera.rotation_euler=(Vector(pos((0,0,.6)))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=23.4;scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=40
scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'board-v3-base-review.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'ouroboros-board-v3-base.blend'))
(OUT/'board-v3-regions.json').write_text(json.dumps({'coordinateSystem':'glTF Y-up; local player +Z','nodes':nodes,'sourceMeshObjects':source_objects,'meshBatches':9},indent=2))
result={'scene':scene.name,'sourceMeshObjects':source_objects,'meshBatches':9,'glb':str(OUT/'ouroboros-board-v3-base.glb'),'blend':str(OUT/'ouroboros-board-v3-base.blend'),'render':str(OUT/'board-v3-base-review.png'),'originalScenePreserved':len(bpy.data.scenes['Scene'].objects)==3}
