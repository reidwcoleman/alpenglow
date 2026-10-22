# Occlusion rendered in Cycles onto geometry the game builds itself (src/bake.js registers it,
# tools/dumpbake.mjs writes it to blender/data/bake_<name>.bin): every mesh as the game has it,
# the slope round it when there is one, then a byte per vertex (1 open, 0 shut in) into
# public/models/ao_<name>.bin, mesh by mesh in the game's order.
# blender -b --python blender/bake.py [-- name ...]
import sys, os, json, struct, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import numpy as np
from common import reset, ROOT, write_manifest

HERE = os.path.dirname(os.path.abspath(__file__))
want = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else None
# how far a ray looks for something shading it (metres), per thing
DIST = {'clinic': 1.6, 'heli': 0.45, 'tree': None}


def mesh_obj(name, P, I, shift=(0, 0, 0)):
    """game-frame positions (n x 3) and triangles into a Blender object"""
    me = bpy.data.meshes.new(name)
    V = np.empty_like(P)
    V[:, 0], V[:, 1], V[:, 2] = P[:, 0] + shift[0], -P[:, 2], P[:, 1]
    me.vertices.add(len(V))
    me.vertices.foreach_set('co', V.ravel())
    nt = len(I)
    me.loops.add(nt * 3)
    me.loops.foreach_set('vertex_index', I.ravel())
    me.polygons.add(nt)
    me.polygons.foreach_set('loop_start', np.arange(0, nt * 3, 3, dtype=np.int32))
    me.update(calc_edges=True)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def bake(name):
    reset()
    raw = open(os.path.join(HERE, 'data', f'bake_{name}.bin'), 'rb').read()
    hl = struct.unpack_from('<I', raw)[0]
    head = json.loads(raw[4:4 + hl])
    o = 4 + hl
    parts = []
    for m in head['meshes']:
        P = np.frombuffer(raw, np.float32, m['n'] * 3, o).reshape(-1, 3); o += m['n'] * 12
        I = np.frombuffer(raw, np.uint32, m['t'] * 3, o).reshape(-1, 3).astype(np.int32); o += m['t'] * 12
        parts.append((P, I))
    big = max(float(np.ptp(P, axis=0).max()) for P, _ in parts)
    gap = big * 3
    objs = []
    for k, (P, I) in enumerate(parts):
        objs.append(mesh_obj(f'm{k:03d}', P, I, (k * gap, 0, 0) if head['apart'] else (0, 0, 0)))
    if 'ground' in head:
        g = head['ground']
        N, r = g['N'], g['r']
        ys = np.array(g['ys'], np.float32)
        P = np.array([(g['x'] - r + 2 * r * i / N, ys[j * (N + 1) + i], g['z'] - r + 2 * r * j / N) for j in range(N + 1) for i in range(N + 1)], np.float32)
        tri = []
        for j in range(N):
            for i in range(N):
                a = j * (N + 1) + i
                tri += [(a, a + N + 1, a + 1), (a + 1, a + N + 1, a + N + 2)]
        mesh_obj('ground', P - np.array([0, 0.05, 0], np.float32), np.array(tri, np.int32))
    sc = bpy.context.scene
    sc.world.light_settings.distance = DIST.get(name) or big * 0.12
    sc.cycles.samples = 32
    out = []
    for ob in objs:
        me = ob.data
        ca = me.color_attributes.new('AO', 'FLOAT_COLOR', 'POINT')
        me.color_attributes.active_color = ca
        if not me.materials:
            me.materials.append(bpy.data.materials.get('bake') or bpy.data.materials.new('bake'))
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        C = np.empty(len(me.vertices) * 4, np.float32)
        ca.data.foreach_get('color', C)
        occ = C[0::4].copy()
        # (a vertex buried inside another piece sees nothing: it takes its open neighbours' light)
        E = np.empty(len(me.edges) * 2, np.int32)
        me.edges.foreach_get('vertices', E)
        E = E.reshape(-1, 2)
        for _ in range(4):
            bad = occ < 0.1
            if not bad.any():
                break
            s = np.zeros_like(occ); c = np.zeros_like(occ)
            for a_, b_ in ((0, 1), (1, 0)):
                ok = ~bad[E[:, b_]]
                np.add.at(s, E[ok, a_], occ[E[ok, b_]])
                np.add.at(c, E[ok, a_], 1)
            fix = bad & (c > 0)
            occ[fix] = s[fix] / c[fix]
        # (a vertex whose every edge is long is the corner of a big flat face: what it sees would
        # be smeared over the whole face as a wedge of shade, so it fades out there)
        if len(E):
            V = np.empty(len(me.vertices) * 3, np.float32)
            me.vertices.foreach_get('co', V)
            V = V.reshape(-1, 3)
            L = np.linalg.norm(V[E[:, 0]] - V[E[:, 1]], axis=1)
            short = np.full(len(occ), 1e9, np.float32)
            np.minimum.at(short, E[:, 0], L)
            np.minimum.at(short, E[:, 1], L)
            lo, hi = big * 0.03, big * 0.09
            t = np.clip((short - lo) / (hi - lo), 0, 1)
            occ = occ + (1 - occ) * (t * t * (3 - 2 * t))
        out.append(np.clip(occ * 255 + 0.5, 0, 255).astype(np.uint8))
        print(name, ob.name, len(occ), 'mean', round(float(occ.mean()), 3))
    dst = os.path.join(ROOT, 'public', 'models', f'ao_{name}.bin')
    open(dst, 'wb').write(np.concatenate(out).tobytes())
    print('baked', dst, os.path.getsize(dst))


for f in sorted(glob.glob(os.path.join(HERE, 'data', 'bake_*.bin'))):
    n = os.path.basename(f)[5:-4]
    if want and n not in want:
        continue
    bake(n)
write_manifest()
