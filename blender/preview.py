# Render a built .glb from blender/out for a look: blender -b --python blender/preview.py -- <name> <object prefix> <out.png> [az el dist]
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
args = sys.argv[sys.argv.index('--') + 1:]
name, prefix, out = args[0], args[1], args[2]
az, el, dist = (float(a) for a in (args[3:6] if len(args) > 5 else (35, 25, 0)))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', name + '.glb'))
keep = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.startswith(prefix)]
for o in list(bpy.context.scene.objects):
    if o.type == 'MESH' and o not in keep:
        bpy.data.objects.remove(o)
mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
for o in keep:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
ctr, size = (mn + mx) / 2, (mx - mn).length
d = dist or size * 1.3
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
bpy.context.scene.collection.objects.link(cam)
a, e = math.radians(az), math.radians(el)
cam.location = ctr + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * d
cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
bpy.context.scene.camera = cam
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 3; sun.rotation_euler = (0.8, 0.3, 0.6)
bpy.context.scene.collection.objects.link(sun)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.color_type = os.environ.get('CT', 'VERTEX')
sc.display.shading.show_backface_culling = bool(os.environ.get('CULL'))
sc.display.shading.light = 'STUDIO'
sc.render.resolution_x, sc.render.resolution_y = 900, 600
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
