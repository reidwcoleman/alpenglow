# The chalets (the village below the finish and the start house), from the game's layout
# (tools/dumpprops.mjs -> blender/data/props_<park>.json): a stone plinth, timber walls under
# gables, corner posts, a metal roof with a thick rounded load of snow, a cornice and a few
# icicles, shuttered windows with snow on their sills, the door, a balcony, the chimney.
# Each chalet 'cNN' sits at its own origin; its windows go in 'wNN' (uv 0..1 per pane, for the
# game's lit-window texture). -> public/models/village_<park>.glb
# blender -b --python blender/village.py [-- park ...]
import sys, os, json, math, glob, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector
from common import G, reset, export, pack
from props_common import Builder, new_obj, mat, smooth_angle, bake_colors, hexrgb, MATTE, STEEL, PAINT, GLOSS, ROUGH, GLASS, SNOW

HERE = os.path.dirname(os.path.abspath(__file__))
want = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else None


def mul(a, b):
    return tuple(x * y for x, y in zip(a, b))


def colour(name, base, tint, kind):
    return mat(f'{name}_{tint:06x}', mul(hexrgb(base), hexrgb(tint)), kind)


def build_chalet(i, c):
    X, GY, Z, yaw = c['x'], c['gy'], c['z'], c['yaw']
    w, d, h, rh = c['w'], c['d'], c['h'], c['rh']
    P = c.get('plinth', 1.2)
    rnd = random.Random(c.get('seed', i))
    cy, sy = math.cos(yaw), math.sin(yaw)
    T = lambda lx, ly, lz: (X + lx * cy + lz * sy, GY + ly, Z - lx * sy + lz * cy)
    b = Builder((X, GY, Z))
    o = new_obj(f'c{i:02d}', (X, GY, Z))
    WOOD = colour('larch', 0xb08458, c['wood'], ROUGH)
    STONE = colour('stone', 0xa29d94, 0xd8d2c8, MATTE)
    ROOF = colour('roof', 0x8d939b, c['roof'], PAINT)
    DARK = mat('darkwood', hexrgb(0x3a2416), ROUGH)
    SHUT = colour('shutter', 0xffffff, c['shutter'], MATTE)
    SN = mat('snow', hexrgb(0xf3f6fb), SNOW)
    ICE = mat('ice', hexrgb(0xdbe9f7), GLASS)
    DOOR = mat('door', hexrgb(0x5a3520), ROUGH)

    def box(sz, lc, m, r=0.0, tilt=None, turn=0.0):
        b.box(sz, T(*lc), m, yaw=yaw + turn, r=r, tilt=tilt)

    def rotz(a):
        ca, sa = math.cos(a), math.sin(a)
        return lambda x, y, z: (x * ca - y * sa, x * sa + y * ca, z)

    box((w + 0.3, P + 3, d + 0.3), (0, (P - 3) / 2, 0), STONE, 0.06)
    box((w, h, d), (0, P + h / 2, 0), WOOD, 0.03)
    # the gables: a prism from the wall top to the ridge
    for s in (-1, 1):
        pass
    tri = [(-w / 2, P + h), (0, P + h + rh), (w / 2, P + h)]
    front = [b.v(T(x, y, d / 2)) for x, y in tri]
    back = [b.v(T(x, y, -d / 2)) for x, y in tri]
    b.face(front, WOOD)
    b.face(list(reversed(back)), WOOD)
    for k in range(3):
        k1 = (k + 1) % 3
        b.face((front[k], back[k], back[k1], front[k1]), WOOD)
    for sx in (-1, 1):
        for sz in (-1, 1):
            box((0.3, h + 0.1, 0.3), (sx * (w / 2 - 0.1), P + h / 2, sz * (d / 2 - 0.1)), DARK, 0.03)
    box((w + 0.12, 0.22, d + 0.12), (0, P + 0.11, 0), DARK, 0.02)
    if h > 5.4:
        box((w + 0.12, 0.2, d + 0.12), (0, P + h * 0.52, 0), DARK, 0.02)
    # the roof and its load of snow
    oh, ohz = 0.9, 0.8
    a = math.atan2(rh, w / 2)
    run = w / 2 + oh
    L = run / math.cos(a) + 0.1
    top = P + h + rh
    eaveY = top - run * math.tan(a)
    snowT = 0.38 + rnd.random() * 0.3
    for s in (-1, 1):
        box((L, 0.16, d + ohz * 2), (s * run / 2, top - (run / 2) * math.tan(a) + 0.12, 0), ROOF, 0.02, tilt=rotz(-s * a))
        box((0.08, 0.3, d + ohz * 2), (s * (run + 0.02), eaveY - 0.05, 0), DARK, 0.01)
        box((L - 0.25, snowT, d + ohz * 2 - 0.1), (s * (run / 2 - 0.1), top - (run / 2 - 0.1) * math.tan(a) + 0.2 + snowT / 2 / math.cos(a), 0),
            SN, min(0.16, snowT / 2.2), tilt=rotz(-s * a))
        # the cornice rolling off the eave, a few icicles under it
        ex = s * (run - 0.12)
        b.cyl(T(ex, eaveY + 0.14 + snowT * 0.35, -(d / 2 + ohz - 0.15)), T(ex, eaveY + 0.14 + snowT * 0.35, d / 2 + ohz - 0.15), snowT * 0.5, snowT * 0.5, SN, seg=7)
        zz = -d / 2 - ohz + 0.4
        while zz < d / 2 + ohz - 0.4:
            ln = 0.15 + rnd.random() ** 2 * 0.7
            p = T(s * (run - 0.05), eaveY - 0.06, zz)
            b.tube_r([p, (p[0], p[1] - ln, p[2])], [0.04 + ln * 0.04, 0.004], ICE, seg=4)
            zz += 1.1 + rnd.random() * 1.6
    # the ridge's snow
    b.cyl(T(0, top + 0.16 + snowT * 0.6, -(d / 2 + ohz - 0.05)), T(0, top + 0.16 + snowT * 0.6, d / 2 + ohz - 0.05), snowT * 0.8, snowT * 0.8, SN, seg=7)
    # windows: frame, sill with snow, shutters with snow on top, the pane (its own object)
    panes = []

    def win(u, y, face, ww=1.0, wh=1.2, shut=True):
        turn = [0, math.pi, math.pi / 2, -math.pi / 2][face]
        depth = d / 2 if face < 2 else w / 2
        ct, st = math.cos(turn), math.sin(turn)
        R = lambda lx, ly, lz: (lx * ct + lz * st, ly, -lx * st + lz * ct)
        def wbox(sz, lc, m, r=0.0):
            box(sz, R(*lc), m, r, turn=turn)
        wbox((ww + 0.22, wh + 0.22, 0.1), (u, y, depth + 0.03), DARK, 0.01)
        wbox((ww + 0.4, 0.07, 0.3), (u, y - wh / 2 - 0.13, depth + 0.12), DARK, 0.01)
        wbox((ww + 0.32, 0.12, 0.24), (u, y - wh / 2 - 0.05, depth + 0.13), SN, 0.04)
        if shut:
            for sd in (-1, 1):
                sxp = u + sd * (ww * 0.5 + 0.11 + ww * 0.275)
                wbox((ww * 0.55, wh + 0.1, 0.05), (sxp, y, depth + 0.05), SHUT, 0.01)
        panes.append([T(*R(u + px * ww / 2, y + py * wh / 2, depth + 0.085)) for px, py in ((-1, -1), (1, -1), (1, 1), (-1, 1))])

    floors = 2 if h > 5.4 else 1
    if c.get('start'):
        for k in range(4):
            win(-w / 2 + 1.6 + k * ((w - 3.2) / 3), P + 1.25, 0, 1.3, 0.9, False)
        win(-1.2, P + 1.6, 1, 1.0, 1.0)
        win(1.2, P + 1.6, 1, 1.0, 1.0)
    else:
        n0 = max(1, int((w - 1.4) // 2.6))
        for f in range(floors):
            y = P + 1.55 + f * (h / floors)
            for face in (0, 1):
                for k in range(n0):
                    u = -((n0 - 1) * 2.6) / 2 + k * 2.6
                    if f == 0 and face == 0 and k == n0 // 2:
                        continue
                    if rnd.random() < 0.15:
                        continue
                    win(u, y, face)
            n1 = max(1, int((d - 1.6) // 3.2))
            for face in (2, 3):
                for k in range(n1):
                    if rnd.random() < 0.75:
                        win(-((n1 - 1) * 3.2) / 2 + k * 3.2, y, face)
        for face in (0, 1):
            win(0, P + h + rh * 0.38, face, 0.8, 0.9, False)
        dx = -((n0 - 1) * 2.6) / 2 + (n0 // 2) * 2.6
        box((1.15, 2.1, 0.12), (dx, P + 1.05, d / 2 + 0.04), DOOR, 0.02)
        box((1.4, 2.25, 0.08), (dx, P + 1.1, d / 2 + 0.01), DARK, 0.01)
        box((1.8, P + 0.1, 0.6), (dx, (P + 0.1) / 2 - 0.05, d / 2 + 0.3), STONE, 0.04)
        if c.get('balcony') and floors == 2:
            by, bw, bd = P + h / 2 + 0.05, w * 0.82, 1.3
            box((bw, 0.16, bd), (0, by, d / 2 + bd / 2), DARK, 0.02)
            box((bw - 0.1, 0.14, bd - 0.25), (0, by + 0.13, d / 2 + bd / 2 - 0.05), SN, 0.06)
            box((bw, 0.1, 0.12), (0, by + 1.0, d / 2 + bd - 0.06), DARK, 0.02)
            box((bw, 0.12, 0.16), (0, by + 1.1, d / 2 + bd - 0.06), SN, 0.05)
            # the railing: boards in a solid panel (they read as one from the piste)
            box((bw, 0.92, 0.06), (0, by + 0.52, d / 2 + bd - 0.06), WOOD, 0.0)
            for sxx in (-1, 1):
                box((0.06, 0.92, bd - 0.1), (sxx * bw / 2, by + 0.52, d / 2 + bd / 2), WOOD, 0.0)
    # the chimney, snow on its cap
    cx, cz = w * 0.22, -d * 0.2
    ch = P + h + rh * (1 - cx / (w / 2)) + 1.1
    box((0.85, ch - P - h + 0.4, 0.85), (cx, (ch + P + h - 0.4) / 2, cz), STONE, 0.04)
    box((1.05, 0.12, 1.05), (cx, ch + 0.06, cz), DARK, 0.02)
    box((1.0, 0.22, 1.0), (cx, ch + 0.22, cz), SN, 0.08)
    b.finish(o)
    smooth_angle(o, 35)
    # the panes
    pw = new_obj(f'w{i:02d}', (X, GY, Z))
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    org = Vector(G(X, GY, Z))
    for q in panes:
        vs = [bm.verts.new(G(*p) - org) for p in q]
        f = bm.faces.new(vs)
        for l, t in zip(f.loops, ((0, 1), (1, 1), (1, 0), (0, 0))):
            l[uv].uv = t
    bm.to_mesh(pw.data)
    bm.free()
    pw.data.materials.append(bpy.data.materials[mat('pane', hexrgb(0x3e3833), GLASS)])
    return o, pw


def build(L, park):
    reset()
    chal = L.get('chalets', [])
    if not chal:
        return None
    houses, panes = [], []
    for i, c in enumerate(chal):
        o, pw = build_chalet(i, c)
        houses.append(o)
        panes.append(pw)
    floors = [(c['x'], c['gy'] - 0.02, c['z'], max(c['w'], c['d']) * 3) for c in chal]
    bake_colors(houses, distance=1.2, samples=24, floor=floors)
    bake_colors(panes, ao=False)
    name = 'village_' + park
    export(houses + panes, name)
    pack(name)
    return name


for f in sorted(glob.glob(os.path.join(HERE, 'data', 'props_*.json'))):
    park = os.path.basename(f)[6:-5]
    if want and park not in want:
        continue
    print('village', park, build(json.load(open(f)), park))
