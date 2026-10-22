# The chairlift, piece by piece in its own frame (the game stamps them along the line):
#   liftTower    a line tower 11 m to the cable, base at the origin, the line along +z
#   liftTerminal a terminal with its bullwheel at +z (the other end is it turned round)
#   liftGlass    the operator cabin's glass (drawn in the game's glass)
#   liftChair    a four-seat chair hanging from its grip at the origin, facing +z
# -> public/models/lift.glb
# blender -b --python blender/lift.py
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from common import reset, export, pack
from props_common import apart, Builder, new_obj, mat, smooth_angle, bake_colors, hexrgb, MATTE, STEEL, PAINT, GLOSS, ROUGH, GLASS, LIT, SNOW

reset()
H = 11.0
rnd = random.Random(7)
C = lambda h, kind: mat(f'c{h:06x}_{kind}', hexrgb(h), kind)
STL, DARKS, YEL, WHITE, BLUE = C(0x8a9099, STEEL), C(0x23262b, PAINT), C(0xf2c230, PAINT), C(0xeef0f3, PAINT), C(0x1f5a9e, PAINT)
SN, CON = C(0xf3f6fb, SNOW), C(0xbdb9b0, MATTE)


def catmull(pts, n=6):
    P = [Vector(p) for p in pts]
    out = []
    for i in range(len(P) - 1):
        p0, p1, p2, p3 = P[max(0, i - 1)], P[i], P[i + 1], P[min(len(P) - 1, i + 2)]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)))
    out.append(tuple(P[-1]))
    return out


def arc_h(b, c, R, r, a0, a1, m, n=10, plane='xz'):
    pts = []
    for k in range(n + 1):
        a = a0 + (a1 - a0) * k / n
        if plane == 'xz':
            pts.append((c[0] + R * math.cos(a), c[1], c[2] + R * math.sin(a)))
    b.tube(pts, r, m, seg=6)


def ring(b, c, R, r, m, n=20):
    pts = [(c[0] + R * math.cos(k / n * math.tau), c[1], c[2] + R * math.sin(k / n * math.tau)) for k in range(n + 1)]
    b.tube(pts, r, m, seg=6, cap=False)


# ------------------------------------------------------------------ tower
b = Builder()
o = new_obj('liftTower')
b.box((2.2, 1.6, 2.2), (0, 0, 0), CON, r=0.05)
b.box((2.3, 0.3, 2.3), (0, 0.88, 0), SN, r=0.12)
b.cyl((0, 0.8, 0), (0, 0.92, 0), 0.64, 0.64, STL, seg=20)
for k in range(8):
    a = k / 8 * math.tau
    b.cyl((math.cos(a) * 0.52, 0.87, math.sin(a) * 0.52), (math.cos(a) * 0.52, 1.09, math.sin(a) * 0.52), 0.035, 0.035, DARKS, seg=6)
b.cyl((0, 0.4, 0), (0, 0.4 + H, 0), 0.48, 0.3, STL, seg=20)
for y in (3.2, 6.4, 9.6):
    rr = 0.42 - y * 0.012
    b.cyl((0, y - 0.045, 0), (0, y + 0.045, 0), rr, rr, C(0x7a8089, STEEL), seg=20)
b.box((0.9, 0.8, 0.9), (0, H + 0.4, 0), STL, r=0.08)
b.cyl((-2.95, H + 0.62, 0), (2.95, H + 0.62, 0), 0.2, 0.2, STL, seg=14)
b.box((5.6, 0.05, 0.75), (0, H + 0.38, 0.62), C(0x5c6168, STEEL))
for z in (0.98, 0.26):
    b.cyl((-2.8, H + 1.38, z), (2.8, H + 1.38, z), 0.03, 0.03, YEL, seg=6)
for k in range(7):
    x = -2.7 + k * 0.9
    b.cyl((x, H + 0.38, 0.98), (x, H + 1.38, 0.98), 0.025, 0.025, YEL, seg=6)
for sx in (-2.4, 2.4):
    b.box((0.2, 0.26, 2.9), (sx, H + 0.4, 0), C(0x4a4f57, STEEL), r=0.02)
    for px in (-0.09, 0.09):
        b.box((0.02, 0.34, 2.75), (sx + px, H + 0.16, 0), C(0xb9bec5, STEEL))
    for k in range(6):
        z = -1.05 + k * 0.42
        b.cyl((sx - 0.055, H + 0.11, z), (sx + 0.055, H + 0.11, z), 0.19, 0.19, C(0x1a1c20, ROUGH), seg=16)
        b.cyl((sx - 0.1, H + 0.11, z), (sx + 0.1, H + 0.11, z), 0.08, 0.08, C(0xc9ced4, STEEL), seg=10)
    b.box((0.16, 0.5, 0.2), (sx, H + 0.62, 0), C(0x4a4f57, STEEL))
    b.box((0.24, 0.07, 2.7), (sx, H + 0.56, 0), SN, r=0.03)
LAD = C(0x3a3f46, PAINT)
y = 1.2
while y < H:
    b.box((0.44, 0.04, 0.04), (0, y, -0.5), LAD)
    y += 0.42
for sx in (-0.22, 0.22):
    b.box((0.04, H - 0.8, 0.04), (sx, (H + 0.8) / 2 + 0.2, -0.5), LAD)
y = 3.0
while y < H:
    arc_h(b, (0, y, -0.5), 0.36, 0.02, math.pi, math.tau, LAD)
    y += 0.9
b.cyl((0, H + 0.7, -0.25), (0, H + 3.1, -0.25), 0.03, 0.015, C(0x9a9da3, STEEL), seg=5)
b.cyl((0, 0.98, 0), (0, 3.28, 0), 0.64, 0.64, C(0x2b5fae, ROUGH), seg=20)
b.cyl((0, 2.37, 0), (0, 2.73, 0), 0.66, 0.66, C(0xe9ecef, ROUGH), seg=20)
for y in (1.45, 2.95):
    ring(b, (0, y, 0), 0.645, 0.025, C(0x1a1c20, ROUGH))
b.box((0.98, 0.16, 0.98), (0, H + 0.86, 0), SN, r=0.07)
b.box((5.4, 0.07, 0.62), (0, H + 0.44, 0.62), SN, r=0.03)
b.box((5.6, 0.08, 0.36), (0, H + 0.86, 0), SN, r=0.04)
b.finish(o)
smooth_angle(o, 40)
tower = o

# ------------------------------------------------------------------ terminal (bullwheel at +z)
b = Builder()
o = new_obj('liftTerminal')
b.box((12, 3.2, 22), (0, -1.3, 2), CON, r=0.08)
s = -10.0
while s < 12:
    for sx in (-1, 1):
        r = 0.8 + rnd.random() * 0.7
        b.dome((sx * (6.2 + rnd.random() * 0.4), -0.2, 2 + s), r * 1.2, r * 0.75, r * 1.6, SN, seg=10, rings=4)
    s += 1.2 + rnd.random() * 0.6
for zz in (1.5, 7.5):
    for sx in (-1, 1):
        th = sx * 0.12
        ax = Vector((-math.sin(th), math.cos(th), 0))
        c = Vector((sx * (2.2 + 0.08 * (H + 1.4) / 2), (H + 1.4) / 2 - 0.2, zz))
        hl = (H + 1.4) / 2
        b.cyl(tuple(c - ax * hl), tuple(c + ax * hl), 0.3, 0.22, STL, seg=12)
    b.cyl((-2.8, H + 1.0, zz), (2.8, H + 1.0, zz), 0.18, 0.18, STL, seg=12)
# the canopy: a rounded box section along z, blue below the band, white above, snow on its back
w2, hh, rr = 4.4, 2.6, 1.15
cy0 = H + 2.4


def section(scale, inset):
    pts = []
    ww, h2, r2 = w2 * scale - inset, hh / 2 * scale - inset * 0.6, max(0.2, rr * scale - inset)
    for cx, cyy, a0 in ((ww - r2, h2 - r2, 0), (-(ww - r2), h2 - r2, math.pi / 2), (-(ww - r2), -(h2 - r2), math.pi), (ww - r2, -(h2 - r2), 1.5 * math.pi)):
        for k in range(5):
            a = a0 + k / 4 * math.pi / 2
            pts.append((cx + r2 * math.cos(a), cyy + r2 * math.sin(a)))
    return pts


Lc = 15.0
zs = [(4.5 - Lc / 2 - 0.6, 0.86, 0.3), (4.5 - Lc / 2 - 0.3, 0.97, 0.05), (4.5 - Lc / 2, 1.0, 0), (4.5 + Lc / 2, 1.0, 0), (4.5 + Lc / 2 + 0.3, 0.97, 0.05), (4.5 + Lc / 2 + 0.6, 0.86, 0.3)]
rings_ = [[(x, cy0 + y, z) for x, y in section(sc, ins)] for z, sc, ins in zs]


def canopy_m(ri, k):
    ys = rings_[ri][k][1]
    return BLUE if ys < H + 2.15 else WHITE


b.loft(rings_, WHITE, mats=canopy_m)
b.box((7.6, 0.5, Lc + 0.4), (0, H + 3.95, 4.5), SN, r=0.22)
ring(b, (0, H + 0.3, 8), 2.4, 0.16, DARKS, n=36)
for k in range(6):
    b.box((4.8, 0.09, 0.09), (0, H + 0.3, 8), C(0x5c6168, STEEL), yaw=k * math.pi / 6)
b.cyl((0, H + 0.4, 8), (0, H + 1.0, 8), 0.45, 0.45, C(0x5c6168, STEEL), seg=16)
b.box((2.6, 1.0, 2.6), (0, H + 1.3, 8), C(0x6b717a, STEEL), r=0.12)
b.box((6.5, 0.5, 10), (0, 0.5, -3), C(0xc9c6bf, MATTE), r=0.05)
b.box((6.5, 0.2, 4), (0, 0.3, -9.6), C(0xc9c6bf, MATTE))
b.box((3.6, 0.08, 5.5), (0, 0.79, -1.8), C(0x24272c, ROUGH))
for sx in (-1.86, 1.86):
    b.box((0.12, 0.1, 5.5), (sx, 0.8, -1.8), YEL)
b.box((3.6, 0.02, 0.18), (0, 0.84, -0.2), YEL)
b.box((3.6, 0.02, 0.12), (0, 0.84, -4.4), C(0xd8342c, PAINT))
for k in range(4):
    gx = -1.35 + k * 0.9
    b.box((0.06, 1.0, 0.06), (gx - 0.4, 1.25, -4.8), C(0x8d939b, STEEL))
    b.box((0.7, 0.08, 0.04), (gx, 1.5, -4.8), YEL)
for row in range(3):
    z = -(6.2 + row * 1.3)
    for sx in (-2.6, 2.6):
        b.cyl((sx, 0.75, z), (sx, 1.75, z), 0.05, 0.04, C(0x2b2f36, PAINT), seg=6)
    b.box((5.2, 0.03, 0.03), (0, 1.68, z), BLUE)
hx, hz = 5.4, -2.5
b.box((3.4, 0.3, 3.4), (hx, 0.9, hz), CON)
for sx in (-1, 1):
    for sz in (-1, 1):
        b.box((0.1, 2.5, 0.1), (hx + sx * 1.6, 2.3, hz + sz * 1.6), C(0x30343a, PAINT))
b.box((3.4, 0.6, 3.4), (hx, 1.3, hz), C(0x3a3f46, PAINT))
b.box((3.8, 0.3, 3.8), (hx, 3.65, hz), C(0x2b2f36, PAINT), r=0.05)
b.box((3.7, 0.3, 3.7), (hx, 3.92, hz), SN, r=0.12)
b.box((1.6, 0.08, 0.7), (hx, 2.05, hz + 0.8), C(0xc9a27a, ROUGH))
b.box((0.6, 0.4, 0.05), (hx, 2.35, hz + 1.05), C(0x1a2a3a, GLOSS))
for lx, lz in ((-3.0, -0.8), (3.0, -7.5)):
    b.cyl((lx, 0.6, lz), (lx, 4.6, lz), 0.08, 0.06, C(0x2b2f36, PAINT), seg=8)
    b.box((0.6, 0.15, 0.3), (lx, 4.65, lz), C(0x2b2f36, PAINT), r=0.05)
    b.box((0.5, 0.03, 0.22), (lx, 4.56, lz), C(0xffe6b8, LIT))
b.finish(o)
smooth_angle(o, 40)
terminal = o
b = Builder()
o = new_obj('liftGlass')
b.box((3.2, 1.9, 3.2), (hx, 2.55, hz), C(0x9fbdd2, GLASS))
b.finish(o, grid=0)
glass = o

# ------------------------------------------------------------------ chair (grip at the origin)
b = Builder()
o = new_obj('liftChair')
steelC, frameC, pad, padD = C(0x9ea5b0, STEEL), C(0x3a3f46, PAINT), C(0x1f5fa8, MATTE), C(0x173f72, MATTE)
b.box((0.34, 0.3, 0.8), (0, -0.06, 0), C(0x2b2f36, PAINT), r=0.06)
b.box((0.4, 0.16, 0.5), (0, 0.08, 0), C(0xd8b84a, PAINT), r=0.05)
b.tube(catmull([(0, -0.2, 0), (0, -0.6, -0.12), (0, -1.3, -0.42), (0, -1.7, -0.5)]), 0.055, frameC, seg=8)
b.cyl((-1.39, -1.7, -0.5), (1.39, -1.7, -0.5), 0.045, 0.045, frameC, seg=10)
for sx in (-1.39, 1.39):
    b.tube(catmull([(sx, -1.7, -0.5), (sx, -2.2, -0.36), (sx, -2.5, -0.15), (sx, -2.52, 0.32)]), 0.04, frameC, seg=8)
b.box((2.76, 0.06, 0.62), (0, -2.55, 0.08), frameC)
tilt = lambda a: (lambda x, y, z: (x, y * math.cos(a) - z * math.sin(a), y * math.sin(a) + z * math.cos(a)))
for i in range(4):
    dx = -1.0 + i * 0.667
    m = pad if i % 2 else padD
    b.box((0.62, 0.14, 0.6), (dx, -2.45, 0.1), m, r=0.05)
    b.box((0.62, 0.68, 0.12), (dx, -2.03, -0.24), m, r=0.05, tilt=tilt(-0.22))
    b.box((0.58, 0.07, 0.15), (dx, -1.67, -0.31), SN, r=0.03)
for sx in (-1.4, 1.4):
    b.tube(catmull([(sx, -2.5, -0.2), (sx, -2.2, -0.1), (sx, -2.18, 0.3), (sx, -2.4, 0.42)]), 0.03, steelC, seg=6)
for sx in (-1.43, 1.43):
    b.tube(catmull([(sx, -2.15, -0.15), (sx, -1.6, 0.05), (sx, -1.25, 0.42)]), 0.03, steelC, seg=6)
b.cyl((-1.43, -1.25, 0.42), (1.43, -1.25, 0.42), 0.035, 0.035, steelC, seg=8)
b.box((2.4, 0.04, 0.22), (0, -1.0, 0.72), steelC)
for sx in (-0.8, 0.0, 0.8):
    b.tube(catmull([(sx, -1.25, 0.42), (sx, -1.1, 0.6), (sx, -1.0, 0.72)]), 0.02, steelC, seg=6)
b.box((0.05, 0.22, 0.3), (0, -0.9, -0.24), C(0xf2f2f2, PAINT))
b.box((0.36, 0.06, 0.44), (0, 0.18, 0), SN, r=0.025)
b.box((2.3, 0.04, 0.18), (0, -0.96, 0.72), SN, r=0.015)
b.finish(o, grid=0)
smooth_angle(o, 40)
chair = o

apart([tower, terminal, chair])
bake_colors([tower], distance=0.8, samples=24, floor=[(0, 0.0, 0, 30)])
bake_colors([terminal], distance=1.0, samples=24, floor=[(80, 0.0, 2, 60)])
bake_colors([chair], distance=0.4, samples=24)
apart([tower, terminal, chair], 0)
bake_colors([glass], ao=False)
export([tower, terminal, glass, chair], 'lift')
pack('lift')
