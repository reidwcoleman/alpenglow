# The rider: a lanky park skier in a long hooded shell, straight baggy pants and mitts, on the
# game's skeleton (the scanned bodies' Bip01 names and rest pose, so the game's rig poses it).
# Lofted, then smoothed with subdivision; the soft shading of the folds is baked into 'Col'.
# blender -b --python blender/rider.py  ->  blender/out/rider.glb
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from common import G, reset, loft, ellipsoid, subdivide, smooth, join, bake_ao, export, material, part_into_green, pack

reset()
V = lambda x, y, z: Vector((x, y, z))

BONES = [
    ('Bip01', V(0, 0.895, 0), None), ('Bip01_Pelvis', V(0, 0.895, 0), 'Bip01'), ('Bip01_Spine', V(0, 1.015, 0), 'Bip01_Pelvis'),
    ('Bip01_L_Thigh', V(0.092, 0.895, 0), 'Bip01_Spine'), ('Bip01_L_Calf', V(0.108, 0.497, 0.012), 'Bip01_L_Thigh'), ('Bip01_L_Foot', V(0.114, 0.102, -0.012), 'Bip01_L_Calf'),
    ('Bip01_R_Thigh', V(-0.092, 0.895, 0), 'Bip01_Spine'), ('Bip01_R_Calf', V(-0.108, 0.497, 0.012), 'Bip01_R_Thigh'), ('Bip01_R_Foot', V(-0.114, 0.102, -0.012), 'Bip01_R_Calf'),
    ('Bip01_Spine1', V(0, 1.168, 0), 'Bip01_Spine'), ('Bip01_Spine2', V(0, 1.321, -0.01), 'Bip01_Spine1'), ('Bip01_Neck', V(0, 1.521, -0.012), 'Bip01_Spine2'),
    ('Bip01_Head', V(0, 1.587, 0.008), 'Bip01_Neck'),
    ('Bip01_L_Clavicle', V(0.073, 1.459, -0.024), 'Bip01_Neck'), ('Bip01_L_UpperArm', V(0.205, 1.43, -0.025), 'Bip01_L_Clavicle'),
    ('Bip01_L_Forearm', V(0.41, 1.232, -0.02), 'Bip01_L_UpperArm'), ('Bip01_L_Hand', V(0.58, 1.05, 0.075), 'Bip01_L_Forearm'),
    ('Bip01_R_Clavicle', V(-0.073, 1.459, -0.024), 'Bip01_Neck'), ('Bip01_R_UpperArm', V(-0.205, 1.43, -0.025), 'Bip01_R_Clavicle'),
    ('Bip01_R_Forearm', V(-0.41, 1.232, -0.02), 'Bip01_R_UpperArm'), ('Bip01_R_Hand', V(-0.58, 1.05, 0.075), 'Bip01_R_Forearm'),
]
P = {n: p for n, p, _ in BONES}
UP, X, Z = (0, 1, 0), (1, 0, 0), (0, 0, 1)


def spineW(y):
    st = [('Bip01_Pelvis', 0.895), ('Bip01_Spine', 1.015), ('Bip01_Spine1', 1.168), ('Bip01_Spine2', 1.321), ('Bip01_Neck', 1.521)]
    if y <= st[0][1]:
        return {st[0][0]: 1}
    for i in range(len(st) - 1):
        if y <= st[i + 1][1]:
            t = (y - st[i][1]) / (st[i + 1][1] - st[i][1])
            return {st[i][0]: 1 - t, st[i + 1][0]: t}
    return {'Bip01_Neck': 1}


def hemW(y, k):
    # the hem rides with the thighs (the front more than the back, the middle with both)
    def f(p):
        kk = k * (0.55 + 0.45 * min(1, max(0, (p[2] + 0.1) / 0.25)))
        l = 0.5 + 0.5 * max(-1, min(1, p[0] / 0.12))
        w = {b: v * (1 - kk) for b, v in spineW(y).items()}
        w['Bip01_L_Thigh'] = kk * l
        w['Bip01_R_Thigh'] = kk * (1 - l)
        return w
    return f


parts = []
# the shell: hem to collar
SHELL = [(0.725, 0.21, 0.172, 0.026, 2.3), (0.755, 0.209, 0.168, 0.022, 2.4), (0.84, 0.203, 0.16, 0.012, 2.5), (0.93, 0.196, 0.151, 0.004, 2.5),
         (1.04, 0.188, 0.142, -0.004, 2.5), (1.17, 0.191, 0.141, -0.008, 2.4), (1.28, 0.195, 0.143, -0.012, 2.3), (1.355, 0.192, 0.138, -0.016, 2.2),
         (1.405, 0.178, 0.128, -0.02, 2.1), (1.445, 0.152, 0.114, -0.022, 2.0), (1.482, 0.118, 0.098, -0.02, 2.0), (1.515, 0.092, 0.088, -0.016, 2.0),
         (1.55, 0.081, 0.084, -0.01, 2.0), (1.585, 0.077, 0.082, -0.008, 2.0)]
shell = loft('shell', [dict(c=(0, y, z), t=UP, side=X, a=a, b=b, p=p, part=2,
                            w=hemW(y, 0.88 * (1 - (y - 0.725) / 0.16)) if y < 0.88 else spineW(y)) for y, a, b, z, p in SHELL], seg=28, cap0=0.05, cap1=0.15)
parts.append(shell)
# the hood, down on the back: a fat roll from shoulder to shoulder round behind the neck
import math
hood = []
for i in range(9):
    a = -1.25 + i / 8 * 2.5
    c = (math.sin(a) * 0.095, 1.53 - 0.02 * abs(math.sin(a)), -0.035 - math.cos(a) * 0.075)
    t = (math.cos(a), 0, math.sin(a))
    k = 1 - abs(a) / 1.6
    hood.append(dict(c=c, t=t, side=(0, 1, 0), a=0.045 + 0.02 * k, b=0.03 + 0.02 * k, part=2, w={'Bip01_Spine2': 0.45, 'Bip01_Neck': 0.55}))
parts.append(loft('hood', hood, seg=16, cap0=0.8, cap1=0.8))

for s in (1, -1):
    S = 'L' if s > 0 else 'R'
    B = lambda n: f'Bip01_{S}_{n}'
    H, K, A = P[B('Thigh')] + V(0, 0.05, 0), P[B('Calf')], P[B('Foot')]
    leg = []
    TH = [(0, 0.11, 0.114, {'Bip01_Pelvis': 0.5, B('Thigh'): 0.5}), (0.2, 0.108, 0.112, {'Bip01_Pelvis': 0.15, B('Thigh'): 0.85}), (0.45, 0.105, 0.109, {B('Thigh'): 1}),
          (0.72, 0.102, 0.106, {B('Thigh'): 1}), (0.9, 0.101, 0.105, {B('Thigh'): 0.75, B('Calf'): 0.25}), (1.0, 0.101, 0.105, {B('Thigh'): 0.5, B('Calf'): 0.5})]
    for t, a, b, w in TH:
        leg.append(dict(c=tuple(H.lerp(K, t)), t=tuple(K - H), side=X, a=a, b=b, w=w, part=6))
    SH = [(0.12, 0.104, 0.112, {B('Thigh'): 0.25, B('Calf'): 0.75}), (0.35, 0.11, 0.124, {B('Calf'): 1}), (0.55, 0.116, 0.132, {B('Calf'): 1}),
          (0.72, 0.12, 0.136, {B('Calf'): 1}), (0.84, 0.124, 0.138, {B('Calf'): 1}), (0.93, 0.127, 0.139, {B('Calf'): 1}), (0.97, 0.128, 0.139, {B('Calf'): 1})]
    for t, a, b, w in SH:
        leg.append(dict(c=tuple(K.lerp(A, t) + V(0, 0, -0.012 * math.sin(t * math.pi))), t=tuple(A - K), side=X, a=a, b=b, w=w, part=7))
    parts.append(loft('leg' + S, leg, seg=24, cap0=0.3, cap1=-0.25))

    C0, Sh, E, W = V(s * 0.125, 1.425, -0.024), P[B('UpperArm')], P[B('Forearm')], P[B('Hand')]
    arm = [
        (C0, Sh - C0, 0.076, 0.079, {'Bip01_Spine2': 0.7, B('UpperArm'): 0.3}, 3),
        (Sh, E - Sh, 0.074, 0.076, {'Bip01_Spine2': 0.25, B('UpperArm'): 0.75}, 3),
        (Sh.lerp(E, 0.45), E - Sh, 0.069, 0.071, {B('UpperArm'): 1}, 3),
        (Sh.lerp(E, 0.85), E - Sh, 0.065, 0.067, {B('UpperArm'): 0.8, B('Forearm'): 0.2}, 3),
        (E, W - Sh, 0.064, 0.066, {B('UpperArm'): 0.5, B('Forearm'): 0.5}, 4),
        (E.lerp(W, 0.3), W - E, 0.062, 0.064, {B('Forearm'): 1}, 4),
        (E.lerp(W, 0.72), W - E, 0.065, 0.067, {B('Forearm'): 1}, 4),
        (E.lerp(W, 0.9), W - E, 0.068, 0.07, {B('Forearm'): 0.85, B('Hand'): 0.15}, 4),
    ]
    parts.append(loft('arm' + S, [dict(c=tuple(c), t=tuple(t), side=Z, a=a, b=b, w=w, part=pt) for c, t, a, b, w, pt in arm], seg=20, cap0=0.3, cap1=-0.35))
    d = (W - E).normalized()
    mitt = [dict(c=tuple(W + d * t), t=tuple(d), side=Z, a=a, b=b, w={B('Hand'): wh, B('Forearm'): 1 - wh}, part=5)
            for t, a, b, wh in [(-0.05, 0.044, 0.04, 0.6), (0.0, 0.046, 0.037, 0.9), (0.045, 0.048, 0.032, 1), (0.085, 0.045, 0.028, 1), (0.115, 0.036, 0.024, 1)]]
    parts.append(loft('mitt' + S, mitt, seg=16, cap0=0.4, cap1=0.8))
    thumb = W + d * 0.04 + V(0, 0, 0.035)
    parts.append(ellipsoid('thumb' + S, tuple(thumb), (0.018, 0.035, 0.018), {B('Hand'): 1}, 5, rings=6, seg=12, axis=tuple(d + V(0, 0, 0.8)), side=tuple(d.cross(V(0, 0, 1)))))

# neck and head: the face under the helmet, a nose, ears
parts.append(loft('neck', [dict(c=(0, 1.49, -0.012), t=UP, side=X, a=0.056, b=0.058, w={'Bip01_Spine2': 0.4, 'Bip01_Neck': 0.6}, part=1),
                           dict(c=(0, 1.56, -0.004), t=UP, side=X, a=0.054, b=0.056, w={'Bip01_Neck': 0.7, 'Bip01_Head': 0.3}, part=1),
                           dict(c=(0, 1.63, 0.004), t=UP, side=X, a=0.055, b=0.058, w={'Bip01_Head': 1}, part=1)], seg=20, cap0=0.2, cap1=0.2))
HC, HW = V(0, 1.676, 0.014), {'Bip01_Head': 1}
parts.append(ellipsoid('head', tuple(HC), (0.083, 0.11, 0.098), HW, 0, rings=14, seg=28))
parts.append(ellipsoid('nose', tuple(HC + V(0, -0.028, 0.094)), (0.014, 0.022, 0.017), HW, 0, rings=6, seg=12, axis=(0, 1, 0.4)))
for s in (1, -1):
    parts.append(ellipsoid('ear', tuple(HC + V(s * 0.082, -0.01, -0.006)), (0.011, 0.024, 0.016), HW, 0, rings=6, seg=12))

# smooth every piece (subdivision carries the bone weights and the part along)
for o in parts:
    subdivide(o, 1)
    smooth(o)
body = join(parts, 'rider')

# the armature, rest pose = the game's
arm_d = bpy.data.armatures.new('rig')
rig = bpy.data.objects.new('rig', arm_d)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
eb = {}
kids = {}
for n, p, par in BONES:
    if par:
        kids.setdefault(par, []).append(n)
for n, p, par in BONES:
    b = arm_d.edit_bones.new(n)
    b.head = G(*p)
    ch = kids.get(n)
    tail = P[ch[0]] if ch and (P[ch[0]] - p).length > 0.02 else p + V(0, 0.06, 0)
    b.tail = G(*tail)
    eb[n] = b
for n, p, par in BONES:
    if par:
        eb[n].parent = eb[par]
bpy.ops.object.mode_set(mode='OBJECT')
body.parent = rig
mod = body.modifiers.new('arm', 'ARMATURE')
mod.object = rig

# flat colours live in the game (the outfit); Blender bakes the shading of the folds
bake_ao([body], distance=0.22, samples=96)
part_into_green(body)
export([rig, body], 'rider', skins=True)
pack('rider')
