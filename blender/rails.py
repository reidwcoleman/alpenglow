# Every park's rails, boxes and logs, from its layout (blender/export_layout.mjs): round rails on
# a spine, boxes with a steel coping, fallen logs with snow on their backs, the posts, gussets
# and base plates down to the snow and the snow banked round each foot. One object per feature
# (its origin at its start), one file per park: public/models/park_<id>.glb
# blender -b --python blender/rails.py [-- park ...]
import sys, os, json, math, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from common import reset, export, pack
from props_common import Builder, new_obj, mat, smooth_angle, bake_colors, hexrgb, MATTE, STEEL, PAINT, GLOSS, ROUGH, SNOW

HERE = os.path.dirname(os.path.abspath(__file__))
want = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else None


def build_park(L):
    reset()
    BLACK = mat('black', hexrgb(0x252a30), PAINT)
    COPE = mat('coping', hexrgb(0x5d666f), STEEL)
    TOP = mat('boxtop', hexrgb(0x1c1f24), GLOSS)
    PLATE = mat('plate', hexrgb(0x5d666f), STEEL)
    SNOWM = mat('snow', hexrgb(0xdde3ec), SNOW)
    BARK = mat('bark', hexrgb(0x5a3d28), ROUGH)
    objs = []
    for i, R in enumerate(L['rails']):
        pts = [Vector(p) for p in R['pts']]
        dx, dz = R['dir']
        sx, sz = dz, -dx
        b = Builder(tuple(pts[0]))
        o = new_obj(f"f{i:02d}", tuple(pts[0]))
        hw = R['hw']
        if R['kind'] == 'log':
            a, c = pts[0], pts[-1]
            t = (c - a).normalized()
            a2, c2 = a - t * 0.3 - Vector((0, hw, 0)), c + t * 0.3 - Vector((0, hw, 0))
            b.tube_r([tuple(a2), tuple(a2.lerp(c2, 0.5)), tuple(c2)], [hw * 1.15, hw * 1.07, hw], BARK, seg=14)
            # snow along its back
            snow = []
            for k in range(9):
                p = a2.lerp(c2, k / 8) + Vector((0, hw * 0.92, 0))
                snow.append(tuple(p))
            b.tube_r(snow, [hw * 0.55] * len(snow), SNOWM, seg=10)
            for tt in (0.15, 0.85):
                p = a.lerp(c, tt)
                g = R['ground'][min(len(R['ground']) - 1, int(tt * (len(R['ground']) - 1)))]
                b.cyl((p.x, g - 0.3, p.z), (p.x, p.y - 2 * hw + 0.05, p.z), 0.2, 0.16, BARK, seg=10)
        else:
            if R['kind'] == 'box':
                e = 0.05
                prof = [(-1, -0.24), (-1, -0.05), (-1, 0.004), (-1 + e / hw, 0.004), (1 - e / hw, 0.004), (1, 0.004), (1, -0.05), (1, -0.24)]
                sub = pts[::2] + ([pts[-1]] if (len(pts) - 1) % 2 else [])
                rings = [[(p.x + sx * s * hw, p.y + dy, p.z + sz * s * hw) for s, dy in prof] for p in sub]

                def m(ri, k):
                    s0, d0 = prof[k]
                    s1, d1 = prof[(k + 1) % len(prof)]
                    if k == len(prof) - 1:
                        return BLACK
                    if d0 > 0 and d1 > 0 and abs(s0) < 1 and abs(s1) < 1:
                        return TOP
                    if min(d0, d1) >= -0.05:
                        return COPE
                    return BLACK
                b.loft(rings, BLACK, mats=m)
            else:
                straight = R['shape'] in ('down', 'flat')
                path = [pts[0], pts[-1]] if straight else pts[::4] + ([pts[-1]] if (len(pts) - 1) % 4 else [])
                b.tube([tuple(p - Vector((0, 0.05, 0))) for p in path], 0.05, BLACK, seg=10)
                b.tube([tuple(p - Vector((0, 0.22, 0))) for p in path], 0.045, BLACK, square=True)
            for x, z, ry, snowY in R['legs']:
                box = R['kind'] == 'box'
                gy = snowY - 0.3
                top = ry - (0.24 if box else 0.22)
                h = top - gy
                if h < 0.05:
                    continue
                if box:
                    b.box((hw * 1.6, h, 0.07), (x, gy + h / 2, z), BLACK, yaw=R['yaw'], r=0.01)
                else:
                    b.cyl((x, gy, z), (x, top, z), 0.038, 0.038, BLACK, seg=8)
                    b.box((0.02, 0.17, 0.14), (x, ry - 0.135, z), BLACK, yaw=R['yaw'], r=0.004)
                    b.box((0.34, 0.025, 0.34), (x, snowY - 0.005, z), PLATE, yaw=R['yaw'], r=0.006)
                mm = hw * 0.95 if box else 0.2
                b.dome((x, snowY - 0.03, z), mm, 0.09, 0.22 if box else mm, SNOWM, yaw=R['yaw'], seg=8, rings=3)
        b.finish(o)
        smooth_angle(o, 50)
        mo = o.modifiers.new('wn', 'WEIGHTED_NORMAL')
        objs.append(o)
    if not objs:
        return None
    bake_colors(objs, distance=0.35, samples=24)
    name = 'park_' + L['park']
    export(objs, name)
    pack(name)
    return name


for f in sorted(glob.glob(os.path.join(HERE, 'data', 'layout_*.json'))):
    L = json.load(open(f))
    if want and L['park'] not in want:
        continue
    print('park', L['park'], len(L['rails']), build_park(L))
