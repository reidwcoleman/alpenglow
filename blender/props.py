# The small props, each in its own frame (the game instances them where they stand):
#   propCat    a piste groomer: track units, red body, the cab and its glass, blade out front (+z),
#              tiller and comb behind, beacon, work lights, snow on the roof and hood
#   propGun    a fan snow gun on its tower, barrel tipped up along +z
#   propSign   a trail sign's post and timber board with snow on top (the painted face is the game's)
#   propMarker a piste marker pole (its difficulty cap is the game's, tinted per pole)
#   propCane   a bamboo fence cane
#   propStart  the start gate's posts and wand (at the start's own origin)
# -> public/models/props.glb
# blender -b --python blender/props.py
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import reset, export, pack
from props_common import apart, Builder, new_obj, mat, smooth_angle, bake_colors, hexrgb, MATTE, STEEL, PAINT, GLOSS, ROUGH, GLASS, LIT, SNOW

reset()
C = lambda h, kind: mat(f'c{h:06x}_{kind}', hexrgb(h), kind)
SN = C(0xf3f6fb, SNOW)


def rotx(a):
    ca, sa = math.cos(a), math.sin(a)
    return lambda x, y, z: (x, y * ca - z * sa, y * sa + z * ca)


def rotz(a):
    ca, sa = math.cos(a), math.sin(a)
    return lambda x, y, z: (x * ca - y * sa, x * sa + y * ca, z)


def stadium(L, H, n=6):
    """the loop round a track unit, (y, z): flat top and bottom, round ends, z -L/2..L/2"""
    r, pts = H / 2, []
    for cz, a0 in ((L / 2 - r, -math.pi / 2), (-(L / 2 - r), math.pi / 2)):
        for k in range(n + 1):
            a = a0 + k / n * math.pi
            pts.append((r + r * math.sin(a), cz + r * math.cos(a)))
    return pts


objs = []

# ------------------------------------------------------------------ the groomer
b = Builder()
o = new_obj('propCat')
RED, DARK, STEELC, GL, RUB = C(0xc8302a, PAINT), C(0x1d1f24, PAINT), C(0xb4b9c0, STEEL), C(0x1c2732, GLASS), C(0x202226, ROUGH)
for sx in (-1.3, 1.3):
    loop = stadium(5.0, 0.95)
    b.loft([[(sx + dx, y, z) for y, z in loop] for dx in (-0.48, 0.48)], RUB)
    # the cleats across the top run and round the ends
    for k in range(20):
        b.box((1.0, 0.06, 0.09), (sx, 0.97, -2.2 + k * 0.23), C(0x6b7078, STEEL))
    for k in range(5):
        a = -math.pi / 2 + (k + 0.5) / 5 * math.pi
        for cz, s in ((2.05, 1), (-2.05, -1)):
            b.box((1.0, 0.06, 0.09), (sx, 0.475 + 0.5 * math.sin(a) * 0.95, cz + s * 0.5 * math.cos(a)), C(0x6b7078, STEEL), tilt=rotx(-s * a))
    # road wheels and the drive sprocket seen through the side
    for z in (-1.4, -0.45, 0.5, 1.45):
        b.cyl((sx + math.copysign(0.46, sx), 0.42, z), (sx + math.copysign(0.5, sx), 0.42, z), 0.3, 0.3, C(0x3a3e45, PAINT), seg=14)
        b.cyl((sx + math.copysign(0.49, sx), 0.42, z), (sx + math.copysign(0.53, sx), 0.42, z), 0.1, 0.1, STEELC, seg=8)
    b.cyl((sx + math.copysign(0.46, sx), 0.5, -2.05), (sx + math.copysign(0.52, sx), 0.5, -2.05), 0.38, 0.38, C(0x2a2d33, PAINT), seg=14)
    # the mudguard over the track
    b.box((1.05, 0.06, 4.6), (sx, 1.06, -0.1), RED, r=0.0)
b.box((1.7, 0.6, 4.4), (0, 1.05, 0), RED, r=0.06)
b.box((3.4, 0.5, 2.0), (0, 1.5, -1.3), RED, r=0.1)
b.box((2.2, 0.9, 1.4), (0, 2.15, -1.25), RED, r=0.12)
for k in range(5):
    b.box((0.05, 0.5, 1.0), (-1.11, 2.15, -1.55 + k * 0.15), C(0x2a2d33, PAINT))
b.cyl((0.85, 2.4, -1.75), (0.85, 3.5, -1.75), 0.07, 0.07, STEELC, seg=8)
b.cyl((0.85, 3.5, -1.75), (0.85, 3.6, -1.6), 0.07, 0.07, STEELC, seg=8)
# the cab: a sloped-front shell, glass let into each side
cab = [(-0.25, 1.6), (1.75, 1.6), (1.75, 2.0), (1.45, 3.1), (0.0, 3.1), (-0.25, 2.95)]
b.loft([[(x, y, z) for z, y in cab] for x in (-1.05, 1.05)], RED)
b.box((1.84, 0.9, 0.06), (0, 2.5, 1.79), GL, tilt=rotx(-0.25))
for sx in (-1, 1):
    b.box((0.04, 0.8, 1.5), (sx * 1.06, 2.5, 0.75), GL)
    b.box((0.04, 0.6, 0.7), (sx * 1.25, 2.6, 1.6), DARK)
    b.cyl((sx * 1.06, 2.3, 1.6), (sx * 1.25, 2.4, 1.6), 0.02, 0.02, DARK, seg=6)
    b.cyl((sx * 0.98, 1.3, 0.2), (sx * 0.98, 2.9, 0.2), 0.025, 0.025, STEELC, seg=6)
b.box((1.7, 0.8, 0.04), (0, 2.5, -0.27), GL)
for sx in (-1, 1):
    b.box((0.5, 0.05, 0.25), (sx * 0.9, 1.2, 1.9), STEELC)
# roof: snow, the beacon, a bar of work lights
b.box((2.0, 0.18, 1.6), (0, 3.18, 0.7), SN, r=0.08)
b.cyl((-0.6, 3.2, 0.3), (-0.6, 3.46, 0.3), 0.13, 0.11, C(0xff8a1a, GLOSS), seg=12)
b.box((1.4, 0.12, 0.14), (0.2, 3.3, 1.55), DARK)
for lx in (-0.35, 0.15, 0.65):
    b.box((0.22, 0.14, 0.04), (lx, 3.3, 1.63), C(0xfff3d0, LIT))
b.box((2.1, 0.14, 1.3), (0, 2.66, -1.25), SN, r=0.06)
b.box((3.0, 0.1, 1.6), (0, 1.8, -1.3), SN, r=0.05)
# the blade: a curved mouldboard on its push arms, cutting edge, wings, the lift rams
for sx in (-0.9, 0.9):
    b.box((0.16, 0.18, 1.6), (sx, 0.75, 2.85), STEELC)
    b.cyl((sx * 0.6, 1.25, 2.1), (sx * 0.75, 1.05, 3.4), 0.07, 0.06, C(0xd8dadd, STEEL), seg=8)
mould = []
for k in range(9):
    a = k / 8
    y = 0.05 + a * 1.4
    z = 3.98 - 0.4 * math.sin(a * math.pi / 2) ** 1.4 - 0.05 * a
    mould.append((y, z))
front = [(y, z) for y, z in mould]
back = [(y, z - 0.09) for y, z in reversed(mould)]
prof = front + back
b.loft([[(x, y, z) for y, z in prof] for x in (-2.3, 2.3)], C(0xe0e2e5, PAINT))
b.box((4.6, 0.08, 0.22), (0, 0.06, 3.98), DARK)
b.box((4.0, 0.14, 0.4), (0, 0.8, 3.45), STEELC)
for sx in (-1, 1):
    b.box((0.08, 1.3, 0.7), (sx * 2.38, 0.68, 3.65), C(0xe0e2e5, PAINT))
b.box((4.4, 0.06, 0.25), (0, 1.47, 3.58), SN, r=0.025)
# the tiller and its comb
for sx in (-0.7, 0.7):
    b.box((0.14, 0.16, 1.4), (sx, 0.85, -2.9), STEELC)
b.cyl((-2.2, 0.55, -3.7), (2.2, 0.55, -3.7), 0.5, 0.5, C(0x3a3e45, PAINT), seg=18)
b.loft([[(x, 0.55 + 0.56 * math.sin(a), -3.7 + 0.56 * math.cos(a)) for a in [k / 10 * math.pi for k in range(11)]] + [(x, 0.55, -3.7)] for x in (-2.2, 2.2)], RED)
b.box((4.4, 0.05, 1.0), (0, 0.1, -4.4), RUB, tilt=rotx(0.12))
for k in range(22):
    b.box((0.03, 0.04, 0.12), (-2.1 + k * 0.2, 0.06, -4.9), RUB)
b.box((4.2, 0.1, 0.5), (0, 1.12, -3.7), SN, r=0.04)
b.finish(o, grid=0)
smooth_angle(o, 35)
objs.append(o)

# ------------------------------------------------------------------ the snow gun
b = Builder()
o = new_obj('propGun')
YEL, GREY, BLK = C(0xf2c419, PAINT), C(0x3a3e46, PAINT), C(0x16181d, PAINT)
tilt = rotx(-0.42)


def T(x, y, z):
    x, y, z = tilt(x, y, z)
    return (x, y + 3.25, z)


def seg_cyl(z0, z1, r0, r1, m, seg=22):
    b.cyl(T(0, 0, z0), T(0, 0, z1), r0, r1, m, seg=seg)


seg_cyl(-0.57, 0.57, 0.56, 0.52, YEL)
seg_cyl(0.55, 0.66, 0.57, 0.57, BLK)
seg_cyl(-0.9, -0.57, 0.3, 0.45, GREY)
seg_cyl(-0.98, -0.9, 0.16, 0.3, GREY)
# the grill: spokes over the mouth, the hub, the nozzle ring with its nozzles
for k in range(8):
    a = k / 8 * math.pi
    b.cyl(T(math.cos(a) * 0.48, math.sin(a) * 0.48, 0.67), T(-math.cos(a) * 0.48, -math.sin(a) * 0.48, 0.67), 0.012, 0.012, BLK, seg=4)
seg_cyl(0.6, 0.72, 0.1, 0.08, C(0x2a2d33, PAINT), seg=10)
ring = [T(math.cos(k / 24 * math.tau) * 0.62, math.sin(k / 24 * math.tau) * 0.62, 0.68) for k in range(25)]
b.tube(ring, 0.03, C(0xb4b9c0, STEEL), seg=6, cap=False)
for k in range(12):
    a = k / 12 * math.tau
    b.cyl(T(math.cos(a) * 0.62, math.sin(a) * 0.62, 0.68), T(math.cos(a) * 0.64, math.sin(a) * 0.64, 0.76), 0.025, 0.015, C(0xb4b9c0, STEEL), seg=5)
b.box((0.95, 0.12, 0.6), T(0, 0.58, -0.1), SN, r=0.05, tilt=tilt)
# the yoke and its pivot, the tower, base, control box, hydrant and hose
for sx in (-0.62, 0.62):
    b.box((0.08, 0.6, 0.18), (sx, 3.05, 0), GREY)
    b.cyl((sx - 0.06, 3.25, 0), (sx + 0.06, 3.25, 0), 0.09, 0.09, C(0xb4b9c0, STEEL), seg=10)
b.box((1.32, 0.1, 0.2), (0, 2.78, 0), GREY)
b.cyl((0, 0.2, 0), (0, 2.8, 0), 0.12, 0.09, GREY, seg=10)
b.cyl((0, 2.6, 0), (0, 2.82, 0), 0.16, 0.16, GREY, seg=10)
b.box((1.1, 0.25, 0.9), (0, 0.12, 0), GREY, r=0.03)
b.box((0.4, 0.55, 0.3), (0.45, 0.6, 0), C(0xc7c9cc, PAINT), r=0.03)
b.box((0.42, 0.06, 0.32), (0.45, 0.9, 0), SN, r=0.02)
b.cyl((-0.9, 0, 0.4), (-0.9, 0.9, 0.4), 0.1, 0.1, C(0xd23a2a, PAINT), seg=10)
b.cyl((-0.9, 0.9, 0.4), (-0.9, 0.98, 0.4), 0.12, 0.06, C(0xd23a2a, PAINT), seg=10)
b.cyl((-0.9, 0.6, 0.4), (-0.78, 0.6, 0.4), 0.05, 0.05, C(0xb4b9c0, STEEL), seg=8)
b.tube([(-0.78, 0.6, 0.4), (-0.45, 0.3, 0.45), (-0.15, 0.4, 0.2), (-0.1, 1.0, 0.1), (-0.1, 2.4, 0.1)], 0.04, BLK, seg=6)
b.finish(o, grid=0)
smooth_angle(o, 40)
objs.append(o)

# ------------------------------------------------------------------ the trail sign
b = Builder()
o = new_obj('propSign')
WOOD, WD = C(0x5b3d24, ROUGH), C(0x4a3020, ROUGH)
b.cyl((0, -0.2, 0), (0, 2.42, 0), 0.075, 0.065, WOOD, seg=10)
b.box((2.6, 0.81, 0.06), (0, 2.0, 0.06), WOOD)
for y in (1.58, 2.42):
    b.box((2.72, 0.08, 0.1), (0, y, 0.07), WD, r=0.0)
for x in (-1.33, 1.33):
    b.box((0.08, 0.92, 0.1), (x, 2.0, 0.07), WD)
for y in (1.75, 2.25):
    b.box((0.2, 0.06, 0.1), (0, y, -0.02), C(0x6b7078, STEEL))
b.box((2.74, 0.07, 0.14), (0, 2.49, 0.07), SN, r=0.03)
b.dome((0, -0.15, 0), 0.32, 0.22, 0.32, SN, seg=10, rings=3)
b.finish(o, grid=0)
smooth_angle(o, 40)
objs.append(o)

# ------------------------------------------------------------------ the marker pole
b = Builder()
o = new_obj('propMarker')
b.cyl((0, -0.2, 0), (0, 1.56, 0), 0.036, 0.034, C(0xf26a1b, GLOSS), seg=10)
for y in (1.05, 1.3):
    b.cyl((0, y, 0), (0, y + 0.1, 0), 0.037, 0.037, C(0xf4f4f2, GLOSS), seg=10)
b.cyl((0, 1.56, 0), (0, 1.9, 0), 0.03, 0.03, C(0x2b2f36, PAINT), seg=8)
b.dome((0, 0.15, 0), 0.16, 0.1, 0.16, SN, seg=8, rings=3)
b.finish(o, grid=0)
smooth_angle(o, 50)
objs.append(o)

# ------------------------------------------------------------------ the bamboo cane
b = Builder()
o = new_obj('propCane')
pts = [(0, -0.15 + k * 0.29, 0) for k in range(6)]
b.tube_r(pts, [0.03 - k * 0.0015 for k in range(6)], C(0xc9a964, ROUGH), seg=7)
for y in (0.2, 0.6, 1.0, 1.35):
    b.cyl((0, y - 0.02, 0), (0, y + 0.02, 0), 0.032, 0.032, C(0x7a6232, ROUGH), seg=7)
b.finish(o, grid=0)
smooth_angle(o, 50)
objs.append(o)

# ------------------------------------------------------------------ the start gate
b = Builder()
o = new_obj('propStart')
POST = C(0x3a2416, ROUGH)
for sx in (-5.6, 5.6):
    b.box((0.4, 3.6, 0.4), (sx, 1.6, 0.6), POST, r=0.05)
    b.box((0.46, 0.14, 0.46), (sx, 3.47, 0.6), SN, r=0.06)
    b.box((0.08, 0.24, 0.24), (sx - math.copysign(0.24, sx), 0.6, 0.8), C(0x9aa0a8, STEEL))
    b.dome((sx, -0.05, 0.6), 0.5, 0.25, 0.5, SN, seg=10, rings=3)
for k in range(7):
    x = -5.25 + k * 1.5
    b.cyl((x, 0.6, 0.8), (x + 1.5, 0.6, 0.8), 0.045, 0.045, C(0xd42a2a if k % 2 == 0 else 0xf4f4f2, GLOSS), seg=8)
b.box((0.22, 0.22, 0.18), (-5.3, 0.6, 0.8), C(0x2b2f36, PAINT), r=0.0)
b.box((0.05, 0.03, 0.05), (-5.3, 0.72, 0.9), C(0x57e061, LIT))
b.finish(o, grid=0)
smooth_angle(o, 40)
objs.append(o)

apart(objs)
bake_colors(objs[:1], distance=0.6, samples=32, floor=[(0, 0.0, 0, 20)])
bake_colors(objs[1:3], distance=0.35, samples=32, floor=[(80, 0.0, 0, 8), (160, 0.0, 0, 8)])
bake_colors(objs[3:5], distance=0.1, samples=16)
bake_colors(objs[5:], distance=0.4, samples=24, floor=[(400, 0.0, 0, 20)])
apart(objs, 0)
export(objs, 'props')
pack('props')
