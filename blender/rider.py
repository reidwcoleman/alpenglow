# The rider, after Cork7's: a chunky park skier with a big round head under the helmet, a boxy
# puffy shell with a high collar and its hood down on the back, fat quilted sleeves, big mitts and
# very baggy pants creased down the legs and stacked over the boots, short hair at the nape. On the
# game's skeleton (the scanned bodies' Bip01 names and rest pose, so the game's rig poses it).
# Lofted, then smoothed with subdivision; the soft shading of the folds is baked into 'Col'.
# blender -b --python blender/rider.py  ->  blender/out/rider.glb
import sys, os, math
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
# the head (and the helmet the game puts on it) is this much bigger than a real one, grown from
# the head bone: toyrider.js HEAD_SCALE must match
HS = 1.15
HEAD = P['Bip01_Head']
# the torso is this much shorter than the skeleton it's drawn on: the chest is squeezed between the
# waist and the shoulders, and everything above (and the arms) comes down. toyrider.js TORSO
# must match
TORSO = 0.075


def TY(y):
    if y <= 0.93:
        return y
    if y >= 1.38:
        return y - TORSO
    return 0.93 + (y - 0.93) * (1 - TORSO / 0.45)


ARMS = ('Clavicle', 'UpperArm', 'Forearm', 'Hand')
RB = {n: (p - V(0, TORSO, 0) if any(a in n for a in ARMS) else V(p.x, TY(p.y), p.z)) for n, p, _ in BONES}


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


def creases(n, amp, ph):
    """soft folds round a ring: a few lobes of different sizes"""
    return lambda th: amp * (math.sin(n * th + ph) * 0.6 + math.sin((n + 3) * th - ph * 1.7) * 0.4)


parts = []
# the shell: a slim rider in a loose one. Narrow through the chest and shoulders, cut at the hips
# (Cork7's: the long baggy pants show their full length), the collar zipped up high
SHELL = [(0.8, 0.208, 0.172, 0.03, 2.3), (0.83, 0.206, 0.168, 0.026, 2.4), (0.88, 0.2, 0.16, 0.016, 2.5), (0.93, 0.194, 0.152, 0.006, 2.5),
         (1.0, 0.19, 0.147, 0.0, 2.5), (1.08, 0.189, 0.145, -0.005, 2.5), (1.16, 0.19, 0.146, -0.008, 2.4), (1.26, 0.193, 0.147, -0.012, 2.3),
         (1.335, 0.192, 0.143, -0.016, 2.2), (1.395, 0.18, 0.135, -0.02, 2.1), (1.438, 0.155, 0.122, -0.022, 2.0), (1.472, 0.122, 0.106, -0.02, 2.0),
         (1.505, 0.099, 0.096, -0.014, 2.0), (1.535, 0.092, 0.092, -0.01, 2.0), (1.56, 0.09, 0.09, -0.006, 2.0)]
rings = []
for i, (y, a, b, z, p) in enumerate(SHELL):
    # (cut looser than the body: wider and a touch deeper below the chest)
    k = 1 + 0.08 * max(0, min(1, (1.4 - y) / 0.3))
    r = dict(c=(0, y, z), t=UP, side=X, a=a * k, b=b * (1 + (k - 1) * 0.5), p=p, part=2, w=hemW(y, 0.7 * (1 - (y - 0.8) / 0.15)) if y < 0.95 else spineW(y))
    # (loose folds hanging down the body, deeper toward the hem; the collar stays smooth)
    if y < 1.36:
        r['fold'] = creases(5, 0.034 * (1.4 - y), i * 0.9)
    rings.append(r)
parts.append(loft('shell', rings, seg=32, cap0=0.05, cap1=0.15))

# the hood, down on the back: a fat roll from shoulder to shoulder round behind the neck, standing
# up behind the head
hood = []
for i in range(11):
    a = -1.3 + i / 10 * 2.6
    k = 1 - abs(a) / 1.7
    c = (math.sin(a) * 0.106, 1.515 - 0.025 * abs(math.sin(a)), -0.05 - math.cos(a) * 0.085)
    t = (math.cos(a), 0, math.sin(a))
    hood.append(dict(c=c, t=t, side=(0, 1, 0), a=0.04 + 0.02 * k, b=0.03 + 0.018 * k, part=2, w={'Bip01_Spine2': 0.5, 'Bip01_Neck': 0.5}))
parts.append(loft('hood', hood, seg=16, cap0=0.8, cap1=0.8))

for s in (1, -1):
    S = 'L' if s > 0 else 'R'
    B = lambda n: f'Bip01_{S}_{n}'
    H, K, A = P[B('Thigh')] + V(0, 0.05, 0), P[B('Calf')], P[B('Foot')]
    leg = []
    # pants: loose from the hips (not so full there that they come through the shell when a knee
    # comes up), wider on down, creased, bunching at the knee
    # (baggy and straight: one wide tube hanging from the hip to the boot, Cork7's cut)
    TH = [(0, 0.1, 0.104, {'Bip01_Pelvis': 0.5, B('Thigh'): 0.5}), (0.2, 0.11, 0.114, {'Bip01_Pelvis': 0.15, B('Thigh'): 0.85}), (0.45, 0.118, 0.122, {B('Thigh'): 1}),
          (0.6, 0.121, 0.126, {B('Thigh'): 1}), (0.72, 0.123, 0.128, {B('Thigh'): 1}), (0.88, 0.124, 0.13, {B('Thigh'): 0.8, B('Calf'): 0.2}), (1.0, 0.125, 0.131, {B('Thigh'): 0.5, B('Calf'): 0.5})]
    out = lambda t: V(s * 0.012 * t, 0, 0)
    for i, (t, a, b, w) in enumerate(TH):
        leg.append(dict(c=tuple(H.lerp(K, t) + out(max(0, t - 0.4) / 0.6)), t=tuple(K - H), side=X, a=a, b=b, w=w, part=6, fold=creases(4, 0.026 if t > 0.5 else 0.012, i * 1.3 + s)))
    # (deep front to back: the boot's cuff leans forward inside and mustn't come through the seat;
    # the hem stacks in rolls over the boot)
    SH = [(0.1, 0.126, 0.132, {B('Thigh'): 0.25, B('Calf'): 0.75}), (0.3, 0.128, 0.135, {B('Calf'): 1}), (0.5, 0.13, 0.138, {B('Calf'): 1}),
          (0.64, 0.132, 0.141, {B('Calf'): 1}), (0.74, 0.134, 0.144, {B('Calf'): 1}), (0.81, 0.136, 0.146, {B('Calf'): 1}), (0.87, 0.138, 0.148, {B('Calf'): 1}),
          (0.93, 0.14, 0.15, {B('Calf'): 1}), (0.975, 0.141, 0.151, {B('Calf'): 1}), (1.0, 0.139, 0.149, {B('Calf'): 1})]
    for i, (t, a, b, w) in enumerate(SH):
        leg.append(dict(c=tuple(K.lerp(A, t) + out(1) + V(0, 0, -0.012 * math.sin(t * math.pi))), t=tuple(A - K), side=X, a=a, b=b, w=w, part=7,
                        fold=creases(4, 0.026, i * 1.1 - s)))
    # (the hem stays open wide over the boot, not gathered in)
    parts.append(loft('leg' + S, leg, seg=28, cap0=0.3, cap1=-0.04))

    # the sleeve: a slim arm in a loose sleeve, set into the shoulder, hanging in folds to a wide
    # cuff over the mitt
    C0, Sh, E, W = V(s * 0.115, 1.41, -0.024), P[B('UpperArm')], P[B('Forearm')], P[B('Hand')]
    arm = [
        (C0, Sh - C0, 0.074, 0.078, {'Bip01_Spine2': 0.7, B('UpperArm'): 0.3}, 3),
        (Sh, E - Sh, 0.079, 0.081, {'Bip01_Spine2': 0.25, B('UpperArm'): 0.75}, 3),
        (Sh.lerp(E, 0.25), E - Sh, 0.076, 0.078, {B('UpperArm'): 1}, 3),
        (Sh.lerp(E, 0.45), E - Sh, 0.078, 0.08, {B('UpperArm'): 1}, 3),
        (Sh.lerp(E, 0.65), E - Sh, 0.075, 0.077, {B('UpperArm'): 1}, 3),
        (Sh.lerp(E, 0.85), E - Sh, 0.077, 0.079, {B('UpperArm'): 0.8, B('Forearm'): 0.2}, 3),
        (E, W - Sh, 0.076, 0.078, {B('UpperArm'): 0.5, B('Forearm'): 0.5}, 4),
        (E.lerp(W, 0.25), W - E, 0.075, 0.077, {B('Forearm'): 1}, 4),
        (E.lerp(W, 0.5), W - E, 0.077, 0.079, {B('Forearm'): 1}, 4),
        (E.lerp(W, 0.72), W - E, 0.079, 0.081, {B('Forearm'): 1}, 4),
        (E.lerp(W, 0.86), W - E, 0.078, 0.08, {B('Forearm'): 0.9, B('Hand'): 0.1}, 4),
        (E.lerp(W, 0.92), W - E, 0.074, 0.076, {B('Forearm'): 0.85, B('Hand'): 0.15}, 4),
    ]
    parts.append(loft('arm' + S, [dict(c=tuple(c), t=tuple(t), side=Z, a=a * 1.08, b=b * 1.08, w=w, part=pt, fold=creases(3, 0.036, k * 0.8))
                                  for k, (c, t, a, b, w, pt) in enumerate(arm)], seg=22, cap0=0.3, cap1=-0.35))
    # the mitt: a big padded paddle with a gauntlet over the cuff, a thumb on the inside
    d = (W - E).normalized()
    mitt = [dict(c=tuple(W + d * t), t=tuple(d), side=Z, a=a, b=b, w={B('Hand'): wh, B('Forearm'): 1 - wh}, part=5)
            for t, a, b, wh in [(-0.075, 0.07, 0.07, 0.3), (-0.05, 0.072, 0.07, 0.5), (-0.02, 0.06, 0.054, 0.8), (0.015, 0.06, 0.048, 1),
                                (0.06, 0.062, 0.042, 1), (0.105, 0.058, 0.038, 1), (0.14, 0.044, 0.03, 1)]]
    parts.append(loft('mitt' + S, mitt, seg=18, cap0=0.4, cap1=0.8))
    thumb = W + d * 0.045 + V(0, 0, 0.045)
    parts.append(ellipsoid('thumb' + S, tuple(thumb), (0.024, 0.045, 0.024), {B('Hand'): 1}, 5, rings=6, seg=12, axis=tuple(d + V(0, 0, 0.8)), side=tuple(d.cross(V(0, 0, 1)))))

# neck, and the big head: the face under the helmet, a nose, ears, short hair at the back
parts.append(loft('neck', [dict(c=(0, 1.49, -0.012), t=UP, side=X, a=0.058, b=0.06, w={'Bip01_Spine2': 0.4, 'Bip01_Neck': 0.6}, part=1),
                           dict(c=(0, 1.56, -0.004), t=UP, side=X, a=0.06, b=0.062, w={'Bip01_Neck': 0.7, 'Bip01_Head': 0.3}, part=1),
                           dict(c=(0, 1.63, 0.004), t=UP, side=X, a=0.062, b=0.064, w={'Bip01_Head': 1}, part=1)], seg=20, cap0=0.2, cap1=0.2))
head = []
# (a full round face, filling the helmet out to just behind the goggles)
HC, HW = V(0, 1.676, 0.022), {'Bip01_Head': 1}
head.append(ellipsoid('head', tuple(HC), (0.097, 0.106, 0.11), HW, 0, rings=14, seg=28))
head.append(ellipsoid('nose', tuple(HC + V(0, -0.03, 0.104)), (0.015, 0.022, 0.018), HW, 0, rings=6, seg=12, axis=(0, 1, 0.4)))
for s in (1, -1):
    head.append(ellipsoid('ear', tuple(HC + V(s * 0.093, -0.012, -0.012)), (0.012, 0.025, 0.017), HW, 0, rings=6, seg=12))
head.append(ellipsoid('hair', tuple(HC + V(0, 0.016, -0.036)), (0.095, 0.102, 0.098), HW, 8, rings=12, seg=28))
for o in head:
    # (grown from the head bone)
    for v in o.data.vertices:
        p = v.co - Vector(G(*HEAD))
        v.co = Vector(G(*HEAD)) + p * HS
parts += head

# smooth every piece (subdivision carries the bone weights and the part along)
for o in parts:
    subdivide(o, 1)
    smooth(o)
    # then the shorter torso: the arms come down with the shoulders, the legs stay
    if o.name.startswith('leg'):
        continue
    rigid = o.name.startswith(('arm', 'mitt', 'thumb'))
    for v in o.data.vertices:
        v.co.z = v.co.z - TORSO if rigid else TY(v.co.z)
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
for n, _, par in BONES:
    p = RB[n]
    b = arm_d.edit_bones.new(n)
    b.head = G(*p)
    ch = kids.get(n)
    tail = RB[ch[0]] if ch and (RB[ch[0]] - p).length > 0.02 else p + V(0, 0.06, 0)
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
