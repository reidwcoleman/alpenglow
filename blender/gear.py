# The rider's kit: helmet, goggles (frame and lens), the goggle strap, ski and snowboard boots,
# ski and snowboard bindings, a pole, a ski and a snowboard. Each in the frame the game puts it
# in (the helmet round the skull point, boots on their soles, a ski centred on its binding).
# Colours and what each surface is (outfit colour, metal, rubber, plastic, foam) go into the
# vertex colour (rgb x baked occlusion, kind in alpha); the planks keep their top-sheet UVs and
# carry their flex as shape keys.
# blender -b --python blender/gear.py  ->  public/models/gear.glb
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector
from common import G, reset, obj_from_bm, subdivide, smooth, export, pack, apply

reset()
TAU = math.pi * 2
TINT, METAL, RUBBER, PLASTIC, FOAM = 0, 1, 2, 3, 4
MATS = {}


def mat(name, rgb, kind):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    MATS[name] = (rgb, kind)
    return m


def mesh(name, build, mats):
    """build(bm, mi) adds geometry; mi(name) -> material index"""
    bm = bmesh.new()
    order = []

    def mi(n):
        if n not in order:
            order.append(n)
        return order.index(n)
    build(bm, mi)
    o = obj_from_bm(bm, name)
    for n in order:
        o.data.materials.append(bpy.data.materials[n])
    return o


def quad_grid(bm, rows, closed=False, mi=0, flip=False):
    """faces between rows of verts (each row a list); closed: rows wrap round"""
    for i in range(len(rows) - 1):
        A, B = rows[i], rows[i + 1]
        n = len(A)
        for k in range(n if closed else n - 1):
            k1 = (k + 1) % n
            f = (A[k], B[k], B[k1], A[k1]) if not flip else (A[k], A[k1], B[k1], B[k])
            bm.faces.new(f).material_index = mi


def fan(bm, ring, centre, mi, flip=False):
    c = bm.verts.new(centre)
    n = len(ring)
    for k in range(n):
        k1 = (k + 1) % n
        bm.faces.new((c, ring[k1], ring[k]) if not flip else (c, ring[k], ring[k1])).material_index = mi


def solid(o, thick, offset=-1, rim_mat=None):
    m = o.modifiers.new('sol', 'SOLIDIFY')
    m.thickness = thick
    m.offset = offset
    m.use_even_offset = True
    if rim_mat is not None:
        m.material_offset_rim = rim_mat
        m.material_offset = rim_mat
    apply(o, m)


def rbox(bm, mi, size, at, r=0.004, rot=None):
    """a box (sizes in game xyz), bevelled by r"""
    res = bmesh.ops.create_cube(bm, size=1)
    vs = res['verts']
    for v in vs:
        p = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))  # (game x, y, z) pre-convert
        if rot:
            p = rot(p)
        v.co = G(p.x + at[0], p.y + at[1], p.z + at[2])
    faces = list({f for v in vs for f in v.link_faces})
    for f in faces:
        f.material_index = mi
    if r > 0:
        edges = list({e for v in vs for e in v.link_edges})
        bmesh.ops.bevel(bm, geom=vs + edges, offset=r, segments=2, affect='EDGES', profile=0.5)


def finish(o, distance=0.05, samples=48, ao=True):
    """occlusion baked with nothing else in the scene, then colour x occlusion, kind in alpha"""
    others = [x for x in bpy.data.objects if x is not o]
    for x in others:
        x.hide_render = True
    me = o.data
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    me.color_attributes.active_color = ca
    if ao:
        sc = bpy.context.scene
        sc.world.light_settings.distance = distance
        sc.cycles.samples = samples
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    for poly in me.polygons:
        rgb, kind = MATS[me.materials[poly.material_index].name]
        for li in poly.loop_indices:
            a = ca.data[li].color[0] if ao else 1
            a = 0.35 + 0.65 * a
            ca.data[li].color = (rgb[0] * a, rgb[1] * a, rgb[2] * a, kind / 4)
    for x in others:
        x.hide_render = False


OBJS = []

# ------------------------------------------------------------------ helmet (round the skull point)
SHELL_C, SHELL_R = (0, 0.03, 0.015), (0.118, 0.13, 0.142)


def on_ell(c, r, y, az, k=1.0):
    ct = max(-0.999, min(0.999, (y - c[1]) / r[1]))
    s = math.sqrt(1 - ct * ct) * k
    return (r[0] * s * math.sin(az) + c[0], y, r[2] * s * math.cos(az) + c[2])


def helmet_cut(az):
    f = (1 + math.cos(az)) / 2
    return -0.062 + 0.11 * f - 0.028 * math.sin(az) ** 2


mat('h_shell', (1, 1, 1), TINT)
mat('h_liner', (0.07, 0.07, 0.08), FOAM)
mat('h_dark', (0.06, 0.06, 0.07), PLASTIC)


def build_helmet(bm, mi):
    NA, NV = 64, 14
    top = SHELL_C[1] + SHELL_R[1] * 0.999
    rows = []
    for j in range(1, NV + 1):
        row = []
        for k in range(NA):
            az = k / NA * TAU
            cut = helmet_cut(az)
            v = (j / NV) ** 1.15
            y = top + (cut - top) * v
            row.append(bm.verts.new(G(*on_ell(SHELL_C, SHELL_R, y, az))))
        rows.append(row)
    quad_grid(bm, rows, closed=True, mi=mi('h_shell'))
    fan(bm, rows[0], G(SHELL_C[0], top + 0.0005, SHELL_C[2]), mi('h_shell'))
    # the goggle clip at the back
    y = 0.024
    x, _, z = on_ell(SHELL_C, SHELL_R, y, math.pi, 1.02)
    rbox(bm, mi('h_dark'), (0.042, 0.04, 0.014), (x, y, z), 0.005)


helm = mesh('helmet', build_helmet, MATS)
bm = bmesh.new(); bm.from_mesh(helm.data)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(helm.data); bm.free()
solid(helm, 0.013, -1, rim_mat=1)
subdivide(helm, 1)
smooth(helm)
# the chin strap: a soft band from ear to ear under the chin
cs = bpy.data.curves.new('chin', 'CURVE'); cs.dimensions = '3D'
sp = cs.splines.new('POLY')
P = [(0.08, -0.03, -0.004), (0.068, -0.07, 0.006), (0.05, -0.1, 0.022), (0.026, -0.118, 0.04), (0.0, -0.124, 0.045)]
pts = P + [(-x, y, z) for x, y, z in reversed(P[:-1])]
sp.points.add(len(pts) - 1)
for p, q in zip(sp.points, pts):
    p.co = (*G(*q), 1)
cs.bevel_depth = 0.004; cs.bevel_resolution = 2
chin = bpy.data.objects.new('chin', cs); bpy.context.scene.collection.objects.link(chin)
with bpy.context.temp_override(active_object=chin, selected_objects=[chin], selected_editable_objects=[chin], object=chin):
    bpy.ops.object.convert(target='MESH')
chin = bpy.context.scene.objects['chin']
chin.data.materials.append(bpy.data.materials['h_liner'])
for x in (helm, chin):
    x.select_set(True)
with bpy.context.temp_override(active_object=helm, selected_objects=[helm, chin], selected_editable_objects=[helm, chin]):
    bpy.ops.object.join()
finish(helm, 0.05)
OBJS.append(helm)

# ------------------------------------------------------------------ goggles: frame and lens
# (Cork7's: big, low over the eyes to the bridge of the nose, close to the face)
GOG = dict(cy=0.02, cz=0.002, r=0.137, span=1.0, h0=-0.056, h1=0.05)


def in_goggle(s, y, grow=0):
    half = GOG['span'] * GOG['r'] + grow
    top = GOG['h1'] + grow
    bot = GOG['h0'] - grow + 0.014 * max(0, 1 - abs(s) / 0.028)
    return half, top, bot


def goggle_sheet(bm, mi_, grow, rad, bulge, NS=40, NY=10):
    """a rounded-rectangle sheet wrapped round the face cylinder at radius rad"""
    half, top, bot0 = in_goggle(0, 0, grow)
    rows = []
    for j in range(NY + 1):
        row = []
        for k in range(NS + 1):
            s = -half + 2 * half * k / NS
            bot = GOG['h0'] - grow + 0.014 * max(0, 1 - abs(s) / 0.028)
            y = bot + (top - bot) * j / NY
            # round the corners in
            u = abs(s) / half
            v = abs((y - (bot + top) / 2) / ((top - bot) / 2))
            if u > 0.86 and v > 0.5:
                pull = (u - 0.86) / 0.14 * (v - 0.5) / 0.5
                y = (bot + top) / 2 + (y - (bot + top) / 2) * (1 - 0.35 * pull)
            a = s / GOG['r']
            rr = rad + bulge * (1 - u * u) * (1 - (2 * j / NY - 1) ** 2)
            row.append(bm.verts.new(G(rr * math.sin(a), y, GOG['cz'] + rr * math.cos(a))))
        rows.append(row)
    quad_grid(bm, rows, mi=mi_)


mat('g_frame', (1, 1, 1), TINT)
mat('g_foam', (0.08, 0.08, 0.09), FOAM)
gog = mesh('goggles', lambda bm, mi: goggle_sheet(bm, mi('g_frame'), 0.008, GOG['r'] + 0.006, 0.0), MATS)
solid(gog, 0.016, 1, rim_mat=1)
subdivide(gog, 1)
smooth(gog)
finish(gog, 0.03)
OBJS.append(gog)
mat('g_lens', (1, 1, 1), TINT)
# (a little inside the frame's edge, so a thin white rim shows all the way round it)
lens = mesh('lens', lambda bm, mi: goggle_sheet(bm, mi('g_lens'), -0.011, GOG['r'] + 0.024, 0.006), MATS)
# (the sheet comes out facing in, toward the face: the lens is seen from outside)
bm = bmesh.new(); bm.from_mesh(lens.data)
bmesh.ops.reverse_faces(bm, faces=bm.faces); bm.to_mesh(lens.data); bm.free()
smooth(lens)
finish(lens, ao=False)
OBJS.append(lens)

# the strap: round the back of the helmet between the frame's ends, uv along it
mat('s_strap', (1, 1, 1), TINT)


def build_strap(bm, mi):
    a0, N, yc, reps = GOG['span'] * 0.95, 48, GOG['cy'] + 0.004, 7
    rows = [[], []]
    uvs = []
    for k in range(N + 1):
        az = a0 + (TAU - 2 * a0) * k / N
        clip = max(0, 1 - abs(az - math.pi) / 0.3) * 0.045
        for j, dy in ((0, -0.02), (1, 0.02)):
            x, y, z = on_ell(SHELL_C, SHELL_R, yc + dy, az, 1.035 + clip)
            rows[j].append(bm.verts.new(G(x, y, z)))
    for k in range(N):
        f = bm.faces.new((rows[0][k], rows[0][k + 1], rows[1][k + 1], rows[1][k]))
        f.material_index = mi('s_strap')
    uv = bm.loops.layers.uv.new('UVMap')
    idx = {v: (k, 0) for k, v in enumerate(rows[0])}
    idx.update({v: (k, 1) for k, v in enumerate(rows[1])})
    for f in bm.faces:
        for l in f.loops:
            k, j = idx[l.vert]
            l[uv].uv = (k / N * reps, 1 - j)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)


strap = mesh('strap', build_strap, MATS)
solid(strap, 0.003, 1)
smooth(strap)
finish(strap, ao=False)
OBJS.append(strap)

# ------------------------------------------------------------------ boots
def ring_pt(rg, t, grow=0):
    y, zc, wx, wz, p = rg[:5]
    c, s, e = math.cos(t), math.sin(t), 2 / p
    return ((wx + grow) * math.copysign(abs(s) ** e, s), y, zc + (wz + grow) * math.copysign(abs(c) ** e, c))


def boot_loft(bm, rings, mats, N=32, cap_top=True):
    rows = []
    for rg in rings:
        rows.append([bm.verts.new(G(*ring_pt(rg, k / N * TAU))) for k in range(N)])
    for i in range(len(rows) - 1):
        A, B = rows[i], rows[i + 1]
        for k in range(N):
            k1 = (k + 1) % N
            bm.faces.new((A[k], A[k1], B[k1], B[k])).material_index = mats[i]
    fan(bm, rows[0], G(0, rings[0][0], rings[0][1]), mats[0], flip=True)
    if cap_top:
        fan(bm, rows[-1], G(0, rings[-1][0], rings[-1][1]), mats[-1])
    return rows


BOOT_SHELL = [[0.035, 0.022, 0.054, 0.165, 3.2], [0.05, 0.022, 0.056, 0.164, 3.2], [0.09, 0.02, 0.06, 0.158, 2.6], [0.12, 0.0, 0.06, 0.135, 2.4],
              [0.16, -0.02, 0.06, 0.1, 2.4], [0.2, -0.012, 0.062, 0.078, 2.2], [0.26, 0.004, 0.064, 0.072, 2.2]]
BOOT_CUFF = [[0.15, -0.024, 0.066, 0.096, 2.3], [0.2, -0.012, 0.067, 0.083, 2.2], [0.26, 0.004, 0.069, 0.077, 2.2], [0.33, 0.022, 0.071, 0.077, 2.2]]
mat('b_shell', (0.9, 0.9, 0.9), TINT)
mat('b_cuff', (1, 1, 1), TINT)
mat('b_sole', (0.1, 0.1, 0.11), RUBBER)
mat('b_foam', (0.09, 0.09, 0.1), FOAM)
mat('b_metal', (0.78, 0.8, 0.84), METAL)
mat('b_strap', (0.08, 0.08, 0.09), RUBBER)


def build_skiboot(bm, mi):
    S = BOOT_SHELL
    rings = [S[0], [0.052, 0.022, 0.0565, 0.1638, 3.2], [0.054, 0.022, 0.0565, 0.1638, 3.2]] + S[2:]
    boot_loft(bm, rings, [mi('b_sole'), mi('b_sole')] + [mi('b_shell')] * (len(rings) - 2))
    top = BOOT_CUFF[-1]
    cuff = BOOT_CUFF + [[top[0] + 0.012, top[1], top[2] - 0.004, top[3] - 0.004, 2.2], [top[0] + 0.03, top[1] + 0.004, top[2] - 0.01, top[3] - 0.01, 2.2]]
    boot_loft(bm, cuff, [mi('b_cuff')] * (len(BOOT_CUFF) - 1) + [mi('b_foam'), mi('b_foam')], cap_top=True)
    # lugs
    rbox(bm, mi('b_sole'), (0.07, 0.022, 0.03), (0, 0.046, 0.19), 0.006)
    rbox(bm, mi('b_sole'), (0.07, 0.024, 0.03), (0, 0.047, -0.146), 0.006)
    # four buckles on the outside (+x), the power strap round the top
    for rg, t1 in (([0.105, 0.012, 0.06, 0.148, 2.5], 0.75), ([0.15, -0.012, 0.06, 0.112, 2.4], 1.15), ([0.235, 0.0, 0.069, 0.08, 2.2], 1.3), ([0.295, 0.016, 0.071, 0.077, 2.2], 1.3)):
        x, y, z = ring_pt(rg, t1, 0.006)
        ang = t1 - math.pi / 2
        rbox(bm, mi('b_metal'), (0.007, 0.015, 0.045), (x, y, z), 0.002, rot=lambda p, a=ang: Vector((p.x * math.cos(a) + p.z * math.sin(a), p.y, -p.x * math.sin(a) + p.z * math.cos(a))))
    for k in range(20):
        t = -1.9 + 3.8 * k / 19
        x, y, z = ring_pt(top, t, 0.006)
        rbox(bm, mi('b_strap'), (0.02, 0.03, 0.012), (x, y, z), 0.0, rot=lambda p, a=t: Vector((p.x * math.cos(a) + p.z * math.sin(a), p.y, -p.x * math.sin(a) + p.z * math.cos(a))))


skiboot = mesh('skiBoot', build_skiboot, MATS)
subdivide(skiboot, 1)
smooth(skiboot)
finish(skiboot, 0.04)
OBJS.append(skiboot)

mat('bb_upper', (1, 1, 1), TINT)
mat('bb_lace', (0.85, 0.85, 0.8), PLASTIC)


def build_boardboot(bm, mi):
    rings = [[0.03, 0.02, 0.06, 0.168, 2.6], [0.05, 0.02, 0.064, 0.17, 2.4], [0.052, 0.02, 0.064, 0.17, 2.4],
             [0.09, 0.016, 0.066, 0.162, 2.2], [0.125, -0.002, 0.066, 0.138, 2.1], [0.17, -0.018, 0.066, 0.106, 2.1], [0.22, -0.01, 0.068, 0.086, 2.0],
             [0.29, 0.0, 0.07, 0.08, 2.0], [0.3, 0.0, 0.064, 0.074, 2.0]]
    boot_loft(bm, rings, [mi('b_sole'), mi('b_sole')] + [mi('bb_upper')] * 5 + [mi('b_foam')])
    for i in range(6):
        a = -0.6 - i * 0.12
        rbox(bm, mi('bb_lace'), (0.05, 0.006, 0.008), (0, 0.12 + i * 0.03, 0.105 - i * 0.012), 0.0,
             rot=lambda p, a=a: Vector((p.x, p.y * math.cos(a) - p.z * math.sin(a), p.y * math.sin(a) + p.z * math.cos(a))))


bboot = mesh('boardBoot', build_boardboot, MATS)
subdivide(bboot, 1)
smooth(bboot)
finish(bboot, 0.04)
OBJS.append(bboot)

# ------------------------------------------------------------------ bindings
mat('k_body', (1, 1, 1), TINT)
mat('k_dark', (0.11, 0.115, 0.13), PLASTIC)
mat('k_accent', (0.85, 0.1, 0.03), PLASTIC)
mat('k_metal', (0.72, 0.74, 0.78), METAL)


def build_skibind(bm, mi):
    rbox(bm, mi('k_dark'), (0.05, 0.008, 0.52), (0, 0.034, -0.01), 0.003)
    rbox(bm, mi('k_dark'), (0.07, 0.016, 0.1), (0, 0.04, 0.235), 0.005)
    rbox(bm, mi('k_body'), (0.058, 0.042, 0.06), (0, 0.064, 0.238), 0.014)
    rbox(bm, mi('k_dark'), (0.07, 0.016, 0.11), (0, 0.04, -0.205), 0.005)
    rbox(bm, mi('k_body'), (0.064, 0.056, 0.075), (0, 0.074, -0.212), 0.014)
    rbox(bm, mi('k_accent'), (0.042, 0.008, 0.03), (0, 0.104, -0.245), 0.003)
    rbox(bm, mi('k_dark'), (0.05, 0.006, 0.07), (0, 0.041, -0.11), 0.002)
    for s in (1, -1):
        rbox(bm, mi('k_metal'), (0.006, 0.008, 0.11), (s * 0.05, 0.044, -0.11), 0.002)
        rbox(bm, mi('k_dark'), (0.012, 0.026, 0.034), (s * 0.03, 0.056, 0.2), 0.004)


sbind = mesh('skiBind', build_skibind, MATS)
smooth(sbind, 40)
finish(sbind, 0.03)
OBJS.append(sbind)

mat('n_body', (1, 1, 1), TINT)
mat('n_pad', (0.2, 0.21, 0.24), FOAM)
mat('n_strap', (0.06, 0.06, 0.07), RUBBER)


def arc(bm, mi_, c, rx, rz, rise, tilt, r_tube, n=14):
    """a padded strap arching over the foot: half an ellipse in x/y, leaning by tilt"""
    rows = []
    for i in range(n + 1):
        a = math.pi * i / n
        x, y = rx * math.cos(a), rise * math.sin(a)
        z = -y * math.sin(tilt)
        y = y * math.cos(tilt)
        ctr = Vector((c[0] + x, c[1] + y, c[2] + z))
        tdir = Vector((-math.sin(a), math.cos(a), 0)).normalized()
        u = Vector((0, 0, 1))
        vv = tdir.cross(u)
        ring = []
        for k in range(8):
            t = k / 8 * TAU
            p = ctr + u * (rz * math.cos(t)) + vv * (r_tube * math.sin(t))
            ring.append(bm.verts.new(G(*p)))
        rows.append(ring)
    quad_grid(bm, rows, closed=True, mi=mi_)
    fan(bm, rows[0], G(*(c[0] + rx, c[1], c[2])), mi_, flip=True)
    fan(bm, rows[-1], G(*(c[0] - rx, c[1], c[2])), mi_)


def build_boardbind(bm, mi):
    rbox(bm, mi('n_body'), (0.15, 0.016, 0.3), (0, 0.016, 0.02), 0.006)
    for s in (1, -1):
        rbox(bm, mi('n_body'), (0.012, 0.05, 0.2), (s * 0.076, 0.045, 0.05), 0.004)
    # the heel cup and the highback leaning forward up the calf
    rows = []
    for j in range(7):
        y = 0.02 + j / 6 * 0.32
        lean = 0.24 * (y / 0.32)
        w = 0.082 - 0.012 * (y / 0.34)
        row = []
        for k in range(13):
            a = math.pi * 0.62 + math.pi * 0.76 * k / 12
            x, z = w * math.cos(a) * 1.0, -0.045 + w * math.sin(a) * 1.05
            row.append(bm.verts.new(G(x, y, z + (-0.0) - lean * y * 0.5)))
        rows.append(row)
    quad_grid(bm, rows, mi=mi('n_body'))
    arc(bm, mi('n_strap'), (0, 0.11, 0.04), 0.082, 0.028, 0.07, 0.55, 0.012)
    arc(bm, mi('n_strap'), (0, 0.045, 0.15), 0.07, 0.02, 0.045, 1.0, 0.01)
    rbox(bm, mi('k_metal'), (0.014, 0.022, 0.045), (0.088, 0.13, 0.07), 0.003)
    rbox(bm, mi('k_metal'), (0.014, 0.018, 0.035), (0.078, 0.065, 0.165), 0.003)


bbind = mesh('boardBind', build_boardbind, MATS)
solid(bbind, 0.006, 0)
smooth(bbind, 40)
finish(bbind, 0.04)
OBJS.append(bbind)

# ------------------------------------------------------------------ pole (grip at the origin, tip down)
mat('p_grip', (0.07, 0.07, 0.08), RUBBER)
mat('p_shaft', (1, 1, 1), TINT)
mat('p_plastic', (0.13, 0.13, 0.14), PLASTIC)
mat('p_tip', (0.55, 0.57, 0.6), METAL)
POLE = 1.18


def lathe(bm, mi_, prof, n=12):
    rows = []
    for r, y in prof:
        rows.append([bm.verts.new(G(r * math.sin(k / n * TAU), y, r * math.cos(k / n * TAU))) for k in range(n)])
    for i in range(len(rows) - 1):
        A, B = rows[i], rows[i + 1]
        for k in range(n):
            k1 = (k + 1) % n
            bm.faces.new((A[k], A[k1], B[k1], B[k])).material_index = mi_
    fan(bm, rows[0], G(0, prof[0][1] + 0.001, 0), mi_)
    fan(bm, rows[-1], G(0, prof[-1][1] - 0.001, 0), mi_, flip=True)


def build_pole(bm, mi):
    prof = []
    for i in range(15):
        t = i / 14
        y = 0.035 - t * 0.2
        r = 0.0155 + 0.003 * math.sin(t * math.pi)
        if t < 0.12:
            r = 0.012 + 0.009 * math.sin(t / 0.12 * math.pi * 0.5)
        if 0.15 < t < 0.8:
            r += 0.0012 * math.cos((t - 0.15) / 0.65 * math.pi * 8)
        if t > 0.9:
            r = 0.019
        prof.append((max(0.004, r), y))
    lathe(bm, mi('p_grip'), prof, 14)
    lathe(bm, mi('p_shaft'), [(0.0085, -0.17), (0.0058, -POLE + 0.1)], 10)
    lathe(bm, mi('p_plastic'), [(0.012, -POLE + 0.096), (0.03, -POLE + 0.092), (0.052, -POLE + 0.09), (0.05, -POLE + 0.084), (0.012, -POLE + 0.086)], 16)
    lathe(bm, mi('p_plastic'), [(0.0058, -POLE + 0.08), (0.0058, -POLE + 0.01)], 8)
    lathe(bm, mi('p_tip'), [(0.0045, -POLE + 0.012), (0.0005, -POLE)], 8)


pole = mesh('pole', build_pole, MATS)
smooth(pole, 50)
finish(pole, 0.02)
OBJS.append(pole)

# ------------------------------------------------------------------ the planks (game layout and uvs)
PLANK = {'ski': (96, 32, 64), 'board': (256, 32, 128)}
SIDE_ABS = 22


def layout(kind):
    dw, sw, bw = PLANK[kind]
    W = dw + sw + bw
    px = lambda x: x / W
    return dict(top=(px(0.5), px(dw - 0.5)), side=(px(dw + 0.5), px(dw + SIDE_ABS), px(dw + sw - 0.5)), base=(px(dw + sw + 0.5), px(W - 0.5)))


def plank(name, L, z0, segs, shape, Lo, morph=None, turn=False):
    TOP = [(1, 0.55), (0.86, 1), (0.45, 1), (0, 1), (-0.45, 1), (-0.86, 1), (-1, 0.55)]
    u0, u1 = Lo['top']
    s0, s1, s2 = Lo['side']
    b0, b1 = Lo['base']
    P, UV, D = [], [], []
    for i in range(segs + 1):
        t = i / segs
        z = z0 + t * L
        w, y, T = shape(t)
        crown = min(0.0018, T * 0.12)
        for fx, fy in TOP:
            x = fx * w
            yy = y + T + crown * (1 - fx * fx) if fy == 1 else y + T * fy
            P.append((x, yy, z)); UV.append((u0 + (1 - fx) / 2 * (u1 - u0), t))
        for s in (1, -1):
            e = min(0.0024, T * 0.3)
            P += [(s * w, y + T * 0.55, z), (s * w, y + e, z), (s * w, y, z)]
            UV += [(s0, t), (s1, t), (s2, t)]
        P += [(w, y, z), (-w, y, z)]
        UV += [(b0, t), (b1, t)]
        if morph:
            D.append(morph(t, z))
    Vn = 15
    tris = []
    for i in range(segs):
        a, b = i * Vn, i * Vn + Vn
        for k in range(6):
            tris.append((a + k, a + k + 1, b + k + 1, b + k))
        for o, s in ((7, 1), (10, -1)):
            for k in range(2):
                p, q = a + o + k, b + o + k
                tris.append((p, q, q + 1, p + 1) if s > 0 else (p, p + 1, q + 1, q))
        tris.append((a + 13, b + 13, b + 14, a + 14))
    rot = (lambda p: (p[2], p[1], -p[0])) if turn else (lambda p: p)
    bm = bmesh.new()
    vs = [bm.verts.new(G(*rot(p))) for p in P]
    uv = bm.loops.layers.uv.new('UVMap')
    for f in tris:
        try:
            face = bm.faces.new([vs[i] for i in f])
        except ValueError:
            continue
        for l, i in zip(face.loops, f):
            l[uv].uv = (UV[i][0], 1 - UV[i][1])  # (glTF counts v from the top)
    # (the winding is the game's own: an open strip, so Blender can't be asked which way is out)
    o = obj_from_bm(bm, name)
    smooth(o, 32)
    if morph:
        o.shape_key_add(name='Basis')
        for mk in range(2):
            sk = o.shape_key_add(name=('bend', 'flap')[mk])
            for vi, p in enumerate(P):
                dy = D[vi // Vn][mk]
                q = rot((p[0], p[1] + dy, p[2]))
                sk.data[vi].co = G(*q)
    o.data.materials.append(mat('plank_' + name, (1, 1, 1), TINT))
    return o


def ski_shape(t):
    sc = 1 - math.sin(t * math.pi) * 0.2
    w = 0.054 * sc
    if t > 0.93:
        w *= math.sqrt(max(0, 1 - ((t - 0.93) / 0.07) ** 2)) * 0.85 + 0.15
    if t < 0.05:
        w *= math.sqrt(max(0, 1 - ((0.05 - t) / 0.05) ** 2)) * 0.8 + 0.2
    y = 0.012
    if t > 0.82:
        y += ((t - 0.82) / 0.18) ** 2 * 0.085
    if t < 0.12:
        y += ((0.12 - t) / 0.12) ** 2 * 0.06
    return w, y, 0.009 + 0.015 * math.sin(t * math.pi) ** 0.7


SL = 1.72
ski = plank('ski', SL, -SL * 0.45, 72, ski_shape, layout('ski'),
            lambda t, z: (0.06 * (z / (SL * 0.5)) ** 2, 0.035 * max(0, (t - 0.5) / 0.5) ** 1.6))
OBJS.append(ski)


def board_shape(t):
    u = abs(t - 0.5) * 2
    w = 0.124 + 0.022 * min(u / 0.74, 1) ** 2
    if u > 0.8:
        w *= 0.3 + 0.7 * math.sqrt(max(0, 1 - ((u - 0.8) / 0.2) ** 2))
    y = 0.006 + (((u - 0.72) / 0.28) ** 2 * 0.075 if u > 0.72 else 0)
    return w, y, 0.011 + 0.011 * (1 - u * u)


BL = 1.56
board = plank('board', BL, -BL / 2, 72, board_shape, layout('board'), turn=True)
OBJS.append(board)

export(OBJS, 'gear')
pack('gear')
