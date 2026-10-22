# Helpers for the world's props (rails, lifts, buildings, signs...): every surface gets its colour
# times baked occlusion in the vertex colour and a kind in the alpha (kind / 8), which the game's
# prop material turns into roughness and metalness:
#   0 matte paint   1 bare steel   2 painted steel   3 gloss plastic   4 rough (wood, bark, rubber)
#   5 glass         6 lit (glows)  7 snow
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector, Matrix
from common import G, apply

MATTE, STEEL, PAINT, GLOSS, ROUGH, GLASS, LIT, SNOW = range(8)
MATS = {}


def mat(name, rgb, kind):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    MATS[name] = (rgb, kind)
    return name


def new_obj(name, origin=(0, 0, 0)):
    """an empty mesh object placed at origin (game frame); geometry is added in world coords and
    shifted into it, so a far-off prop keeps fine detail once quantised"""
    me = bpy.data.meshes.new(name)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.location = G(*origin)
    return o


class Builder:
    """collects geometry (world/game coords) into one bmesh with materials by name"""

    def __init__(self, origin=(0, 0, 0)):
        self.bm = bmesh.new()
        self.order = []
        self.origin = Vector(G(*origin))
        self.uv = None

    def mi(self, name):
        if name not in self.order:
            self.order.append(name)
        return self.order.index(name)

    def v(self, p):
        return self.bm.verts.new(G(*p) - self.origin)

    def face(self, verts, m):
        f = self.bm.faces.new(verts)
        f.material_index = self.mi(m)
        return f

    def loft(self, rings, m, closed=True, cap0=True, cap1=True, mats=None):
        """rings: lists of game-frame points; faces between them (wrapping if closed)"""
        rows = [[self.v(p) for p in r] for r in rings]
        for i in range(len(rows) - 1):
            A, B = rows[i], rows[i + 1]
            n = len(A)
            for k in range(n if closed else n - 1):
                k1 = (k + 1) % n
                self.face((A[k], A[k1], B[k1], B[k]), mats(i, k) if mats else m)
        if cap0:
            self.face(list(reversed(rows[0])), m)
        if cap1:
            self.face(rows[-1], m)
        return rows

    def tube(self, pts, r, m, seg=12, cap=True, up=(0, 1, 0), square=False):
        """a round (or square) tube along a polyline of game points"""
        rings = []
        for i, p in enumerate(pts):
            a = Vector(pts[max(0, i - 1)])
            b = Vector(pts[min(len(pts) - 1, i + 1)])
            t = (b - a).normalized()
            u = Vector(up) - t * Vector(up).dot(t)
            if u.length < 1e-6:
                u = Vector((1, 0, 0)) - t * t.x
            u.normalize()
            w = t.cross(u)
            ring = []
            for k in range(4 if square else seg):
                th = (k + (0.5 if square else 0)) / (4 if square else seg) * math.tau
                ring.append(tuple(Vector(p) + u * (r * math.cos(th)) + w * (r * math.sin(th))))
            rings.append(ring)
        return self.loft(rings, m, cap0=cap, cap1=cap)

    def box(self, size, at, m, yaw=0.0, r=0.0, tilt=None):
        """an axis box (game sizes) turned by yaw about y, bevelled by r"""
        res = bmesh.ops.create_cube(self.bm, size=1)
        vs = res['verts']
        cy, sy = math.cos(yaw), math.sin(yaw)
        for v in vs:
            x, y, z = v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]
            if tilt:
                x, y, z = tilt(x, y, z)
            xr, zr = x * cy + z * sy, -x * sy + z * cy
            v.co = G(xr + at[0], y + at[1], zr + at[2]) - self.origin
        faces = list({f for v in vs for f in v.link_faces})
        for f in faces:
            f.material_index = self.mi(m)
        if r > 0:
            edges = list({e for v in vs for e in v.link_edges})
            bmesh.ops.bevel(self.bm, geom=vs + edges, offset=r, segments=2, affect='EDGES', profile=0.5)
        return vs

    def cyl(self, a, b, r0, r1, m, seg=12, cap=True):
        a, b = Vector(a), Vector(b)
        return self.tube_r([tuple(a), tuple(b)], [r0, r1], m, seg, cap)

    def tube_r(self, pts, radii, m, seg=12, cap=True):
        rings = []
        for i, p in enumerate(pts):
            a = Vector(pts[max(0, i - 1)])
            b = Vector(pts[min(len(pts) - 1, i + 1)])
            t = (b - a).normalized()
            up = Vector((0, 1, 0)) if abs(t.y) < 0.95 else Vector((1, 0, 0))
            u = (up - t * up.dot(t)).normalized()
            w = t.cross(u)
            rings.append([tuple(Vector(p) + u * (radii[i] * math.cos(k / seg * math.tau)) + w * (radii[i] * math.sin(k / seg * math.tau))) for k in range(seg)])
        return self.loft(rings, m, cap0=cap, cap1=cap)

    def dome(self, c, rx, ry, rz, m, yaw=0.0, seg=12, rings=5):
        """the top half of an ellipsoid (a heap of snow), base at c"""
        cy, sy = math.cos(yaw), math.sin(yaw)
        rows = []
        for j in range(rings):
            ph = j / rings * math.pi / 2
            row = []
            for k in range(seg):
                th = k / seg * math.tau
                x, z = rx * math.cos(ph) * math.cos(th), rz * math.cos(ph) * math.sin(th)
                row.append((c[0] + x * cy + z * sy, c[1] + ry * math.sin(ph), c[2] - x * sy + z * cy))
            rows.append(row)
        rs = self.loft(rows, m, cap0=False, cap1=False)
        top = self.v((c[0], c[1] + ry, c[2]))
        n = len(rs[-1])
        for k in range(n):
            self.face((rs[-1][k], rs[-1][(k + 1) % n], top), m)

    def finish(self, o):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-6)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(o.data)
        self.bm.free()
        for n in self.order:
            o.data.materials.append(bpy.data.materials[n])
        return o


def smooth_angle(o, deg=40):
    for p in o.data.polygons:
        p.use_smooth = True
    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o], selected_editable_objects=[o]):
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(deg))


def bake_colors(objs, distance=0.4, samples=32, ao=True, floor=None):
    """occlusion over the whole set together (they shade each other), then colour x AO, kind in alpha"""
    sc = bpy.context.scene
    sc.world.light_settings.distance = distance
    sc.cycles.samples = samples
    helpers = []
    if floor is not None:
        for f in floor:
            bpy.ops.mesh.primitive_plane_add(size=f[3], location=G(f[0], f[1], f[2]))
            helpers.append(bpy.context.active_object)
    for o in objs:
        me = o.data
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        me.color_attributes.active_color = ca
        if ao:
            bpy.ops.object.select_all(action='DESELECT')
            o.select_set(True)
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        for poly in me.polygons:
            rgb, kind = MATS[me.materials[poly.material_index].name]
            for li in poly.loop_indices:
                a = ca.data[li].color[0] if ao else 1
                a = 0.3 + 0.7 * a
                ca.data[li].color = (rgb[0] * a, rgb[1] * a, rgb[2] * a, kind / 8)
    for h in helpers:
        bpy.data.objects.remove(h)


def hexrgb(h):
    """an sRGB hex colour as linear rgb (what the vertex colour holds)"""
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin((h >> 16) & 255), lin((h >> 8) & 255), lin(h & 255))
