# Shared helpers for the Blender asset scripts (run headless: blender -b --python blender/<asset>.py).
# Everything is modelled in the game's frame (x left, y up, z forward, metres) and converted to
# Blender's (z up) on the way in; the glTF exporter converts back, so a point written as
# G(x, y, z) lands at (x, y, z) in the game.
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'blender', 'out')
os.makedirs(OUT, exist_ok=True)


def G(x, y, z):
    return Vector((x, -z, y))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 64
    w = bpy.data.worlds.new('w')
    sc.world = w
    w.light_settings.distance = 0.35
    return sc


def material(name, rgb=(1, 1, 1), rough=0.8):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.roughness = rough
    return m


def obj_from_bm(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def frame(t, side):
    """two axes across a direction t (game frame): u along side, v = t x u"""
    t = Vector(t).normalized()
    s = Vector(side)
    u = (s - t * s.dot(t)).normalized()
    v = t.cross(u)
    return u, v


def loft(name, rings, seg=24, cap0=0.4, cap1=0.4, part=0):
    """A closed tube through rings: dicts with c (game xyz), t (direction), side, a, b (radii), p
    (squareness, 2 = ellipse), w (bone weights: dict, or function of the game-frame point), part.
    Caps dome out by cap * min radius (None: open). Returns the object, with vertex groups for the
    bones and a '_part' float attribute."""
    bm = bmesh.new()
    deform = bm.verts.layers.deform.verify()
    part_l = bm.verts.layers.float.new('_part')
    groups = {}

    def gid(b):
        if b not in groups:
            groups[b] = len(groups)
        return groups[b]

    def put(p, w, pt):
        v = bm.verts.new(G(*p))
        ww = w(p) if callable(w) else w
        tot = sum(x for x in ww.values() if x > 0) or 1
        for b, x in ww.items():
            if x > 0:
                v[deform][gid(b)] = x / tot
        v[part_l] = pt
        return v

    loops = []
    for r in rings:
        u, v = frame(r['t'], r.get('side', (1, 0, 0)))
        c = Vector(r['c'])
        e = 2 / r.get('p', 2)
        ring = []
        for k in range(seg):
            th = k / seg * math.pi * 2
            cs, sn = math.cos(th), math.sin(th)
            x = math.copysign(abs(cs) ** e, cs)
            y = math.copysign(abs(sn) ** e, sn)
            p = c + u * (r['a'] * x) + v * (r['b'] * y)
            ring.append(put(tuple(p), r['w'], r.get('part', part)))
        loops.append((ring, r, u, v, c))
    for i in range(len(loops) - 1):
        A, B = loops[i][0], loops[i + 1][0]
        for k in range(seg):
            k1 = (k + 1) % seg
            bm.faces.new((A[k], A[k1], B[k1], B[k]))

    def cap(entry, out, dome):
        ring, r, u, v, c = entry
        t = u.cross(v) * out
        ctr = put(tuple(c + t * min(r['a'], r['b']) * dome), r['w'] if not callable(r['w']) else r['w'](tuple(c)), r.get('part', part))
        for k in range(seg):
            k1 = (k + 1) % seg
            if out > 0:
                bm.faces.new((ctr, ring[k], ring[k1]))
            else:
                bm.faces.new((ctr, ring[k1], ring[k]))

    if cap0 is not None:
        cap(loops[0], -1, cap0)
    if cap1 is not None:
        cap(loops[-1], 1, cap1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = obj_from_bm(bm, name)
    for b, i in sorted(groups.items(), key=lambda kv: kv[1]):
        o.vertex_groups.new(name=b)
    return o


def ellipsoid(name, c, r, w, part, rings=10, seg=24, axis=(0, 1, 0), side=(1, 0, 0)):
    ax = Vector(axis).normalized()
    out = []
    for i in range(1, rings):
        t = -math.cos(i / rings * math.pi)
        k = math.sqrt(max(0, 1 - t * t))
        out.append(dict(c=tuple(Vector(c) + ax * (t * r[1])), t=tuple(ax), side=side, a=r[0] * k, b=r[2] * k, w=w, part=part))
    return loft(name, out, seg, 0.9, 0.9, part)


def subdivide(o, levels=1):
    m = o.modifiers.new('sub', 'SUBSURF')
    m.levels = levels
    m.render_levels = levels
    apply(o, m)


def bevel(o, width, segments=2):
    m = o.modifiers.new('bev', 'BEVEL')
    m.width = width
    m.segments = segments
    m.limit_method = 'ANGLE'
    apply(o, m)


def apply(o, m):
    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
        bpy.ops.object.modifier_apply(modifier=m.name)


def smooth(o, angle=None):
    for p in o.data.polygons:
        p.use_smooth = True
    if angle is not None:
        with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o], selected_editable_objects=[o]):
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))


def join(objs, name):
    with bpy.context.temp_override(active_object=objs[0], selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = name
    return objs[0]


def bake_ao(objs, distance=0.35, samples=64, floor=None, base=None):
    """Ambient occlusion into a 'Col' corner colour (white = open), optionally multiplied by a base
    colour per face material (base: {material name: rgb})."""
    sc = bpy.context.scene
    sc.world.light_settings.distance = distance
    sc.cycles.samples = samples
    helpers = []
    if floor is not None:
        bpy.ops.mesh.primitive_plane_add(size=40, location=G(0, floor, 0))
        helpers.append(bpy.context.active_object)
    for o in objs:
        me = o.data
        if not me.materials:
            me.materials.append(material('m_' + o.name))
        ca = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        me.color_attributes.active_color = ca
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        if base:
            for poly in me.polygons:
                mat = me.materials[poly.material_index].name if me.materials else ''
                rgb = base.get(mat)
                if rgb is None:
                    continue
                for li in poly.loop_indices:
                    c = ca.data[li].color
                    ca.data[li].color = (c[0] * rgb[0], c[1] * rgb[1], c[2] * rgb[2], 1)
    for h in helpers:
        bpy.data.objects.remove(h)


def part_into_green(o, scale=8):
    """(gltfpack drops custom attributes) the '_part' attribute into Col's green, the AO kept in red
    and blue: the game reads part = round(g * scale)"""
    me = o.data
    ca = me.color_attributes['Col']
    pa = me.attributes['_part'].data
    for poly in me.polygons:
        for li, vi in zip(poly.loop_indices, poly.vertices):
            c = ca.data[li].color
            ca.data[li].color = (c[0], round(pa[vi].value) / scale, c[0], 1)


def pack(name):
    """meshopt-compress an exported GLB into public/models"""
    import subprocess
    src = os.path.join(OUT, name + '.glb')
    dst_dir = os.path.join(ROOT, 'public', 'models')
    os.makedirs(dst_dir, exist_ok=True)
    dst = os.path.join(dst_dir, name + '.glb')
    subprocess.run(['npx', 'gltfpack', '-i', src, '-o', dst, '-cc', '-kn', '-km', '-kv', '-vtf'], cwd=ROOT, check=True)
    print('packed', dst, os.path.getsize(dst))
    # the list the game checks before asking for a file
    import json
    files = sorted(f[:-4] for f in os.listdir(dst_dir) if f.endswith('.glb'))
    with open(os.path.join(dst_dir, 'manifest.json'), 'w') as fh:
        json.dump({f: os.path.getsize(os.path.join(dst_dir, f + '.glb')) for f in files}, fh)


def export(objs, name, skins=False):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_skins=skins,
                              export_animations=False, export_attributes=True, export_vertex_color='ACTIVE',
                              export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True,
                              export_materials='EXPORT', export_yup=True, export_apply=True, export_texcoords=True)
    print('wrote', path, os.path.getsize(path))
    return path
