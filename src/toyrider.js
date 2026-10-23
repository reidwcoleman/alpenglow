// The riders' own figure, after Cork7's: a chunky park skier, one smooth skinned mesh in flat
// colour. A boxy puffy hooded shell to the top of the thighs, very baggy pants stacked over the
// boots, fat sleeves, big mitts, a big head under the helmet. It comes out as a "kit" in the same
// shape the scanned bodies load as (avatar.js): the same bone names, rest pose and limb lengths,
// so AvatarRig poses it and the gear sits on it. The figure itself is modelled in Blender
// (blender/rider.py); the loft here is only what's drawn if that file doesn't arrive.

// the head (and the helmet on it) grown from the head bone: blender/rider.py HS must match
export const HEAD_SCALE = 1.3;
// the torso this much shorter than the skeleton below was drawn: the chest squeezed between the
// waist and the shoulders, everything above (and the arms) brought down. blender/rider.py TORSO
// must match
export const TORSO = 0.075;
const TY = (y) => (y <= 0.93 ? y : y >= 1.38 ? y - TORSO : 0.93 + (y - 0.93) * (1 - TORSO / 0.45));
const ARMY = /Clavicle|UpperArm|Forearm|Hand/;
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadGLB, plainGeometry } from './models.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// the rest pose (an A-pose, facing +z, +x the rider's left), the bones and their parents
const BONES = [
  ['Bip01', V(0, 0.895, 0), -1],
  ['Bip01_Pelvis', V(0, 0.895, 0), 'Bip01'],
  ['Bip01_Spine', V(0, 1.015, 0), 'Bip01_Pelvis'],
  ['Bip01_L_Thigh', V(0.092, 0.895, 0), 'Bip01_Spine'],
  ['Bip01_L_Calf', V(0.108, 0.497, 0.012), 'Bip01_L_Thigh'],
  ['Bip01_L_Foot', V(0.114, 0.102, -0.012), 'Bip01_L_Calf'],
  ['Bip01_R_Thigh', V(-0.092, 0.895, 0), 'Bip01_Spine'],
  ['Bip01_R_Calf', V(-0.108, 0.497, 0.012), 'Bip01_R_Thigh'],
  ['Bip01_R_Foot', V(-0.114, 0.102, -0.012), 'Bip01_R_Calf'],
  ['Bip01_Spine1', V(0, 1.168, 0), 'Bip01_Spine'],
  ['Bip01_Spine2', V(0, 1.321, -0.01), 'Bip01_Spine1'],
  ['Bip01_Neck', V(0, 1.521, -0.012), 'Bip01_Spine2'],
  ['Bip01_Head', V(0, 1.587, 0.008), 'Bip01_Neck'],
  ['Bip01_L_Clavicle', V(0.073, 1.459, -0.024), 'Bip01_Neck'],
  ['Bip01_L_UpperArm', V(0.205, 1.43, -0.025), 'Bip01_L_Clavicle'],
  ['Bip01_L_Forearm', V(0.41, 1.232, -0.02), 'Bip01_L_UpperArm'],
  ['Bip01_L_Hand', V(0.58, 1.05, 0.075), 'Bip01_L_Forearm'],
  ['Bip01_R_Clavicle', V(-0.073, 1.459, -0.024), 'Bip01_Neck'],
  ['Bip01_R_UpperArm', V(-0.205, 1.43, -0.025), 'Bip01_R_Clavicle'],
  ['Bip01_R_Forearm', V(-0.41, 1.232, -0.02), 'Bip01_R_UpperArm'],
  ['Bip01_R_Hand', V(-0.58, 1.05, 0.075), 'Bip01_R_Forearm'],
];

// a ring of the loft: centre, its two axes (u x v points on along the tube), radii, roundness
// (2 an ellipse, higher squarer), the bones it follows, and the body part (avatar.js partOf)
function ring(c, t, side, a, b, w, part, p = 2) {
  const tt = t.clone().normalize();
  const u = side.clone().addScaledVector(tt, -side.dot(tt)).normalize();
  const v = new THREE.Vector3().crossVectors(tt, u);
  return { c, u, v, a, b, w, part, p };
}

const SEG = 20;
// a closed tube through the rings, capped at either end (cap: how far the cap domes out)
function tube(rings, I, capA = 0.4, capB = 0.4, seg = SEG) {
  const pos = [], wts = [], part = [], idx = [];
  const addV = (p, w, pt) => { pos.push(p.x, p.y, p.z); wts.push(w); part.push(pt); return pos.length / 3 - 1; };
  const base = [];
  for (const r of rings) {
    base.push(pos.length / 3);
    for (let k = 0; k < seg; k++) {
      const th = (k / seg) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
      const e = 2 / r.p;
      const x = Math.sign(cs) * Math.abs(cs) ** e, y = Math.sign(sn) * Math.abs(sn) ** e;
      const p = r.c.clone().addScaledVector(r.u, r.a * x).addScaledVector(r.v, r.b * y);
      addV(p, typeof r.w === 'function' ? r.w(p) : r.w, r.part);
    }
  }
  for (let i = 0; i + 1 < rings.length; i++) for (let k = 0; k < seg; k++) {
    const a = base[i] + k, b = base[i] + ((k + 1) % seg), c = base[i + 1] + k, d = base[i + 1] + ((k + 1) % seg);
    idx.push(a, b, c, b, d, c);
  }
  const cap = (r, b0, out, dome) => {
    const t = new THREE.Vector3().crossVectors(r.u, r.v).multiplyScalar(out);
    const ctr = addV(r.c.clone().addScaledVector(t, Math.min(r.a, r.b) * dome), typeof r.w === 'function' ? r.w(r.c) : r.w, r.part);
    for (let k = 0; k < seg; k++) {
      const k1 = b0 + ((k + 1) % seg), k0 = b0 + k;
      if (out > 0) idx.push(ctr, k0, k1); else idx.push(ctr, k1, k0);
    }
  };
  if (capA != null) cap(rings[0], base[0], -1, capA);
  if (capB != null) cap(rings[rings.length - 1], base[rings.length - 1], 1, capB);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // skinning: the four strongest bones, normalised
  const n = pos.length / 3, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const w = Object.entries(wts[i]).map(([k, v]) => [I(k), v]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = w.reduce((s, [, v]) => s + v, 0) || 1;
    w.forEach(([b, v], c) => { si[i * 4 + c] = b; sw[i * 4 + c] = v / tot; });
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setAttribute('aPart', new THREE.BufferAttribute(Float32Array.from(part), 1));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

// an ellipsoid as a tube of rings up its axis
function blob(c, rx, ry, rz, w, part, n = 9, axis = V(0, 1, 0), side = V(1, 0, 0), I) {
  const rings = [];
  for (let i = 1; i < n; i++) {
    const t = -Math.cos((i / n) * Math.PI), r = Math.sqrt(1 - t * t);
    const along = axis.clone().normalize();
    rings.push(ring(c.clone().addScaledVector(along, t * ry), along, side, rx * r, rz * r, w, part));
  }
  return tube(rings, I, 0.9, 0.9);
}

const lerpW = (a, b, t) => {
  const o = {};
  for (const k in a) o[k] = (o[k] ?? 0) + a[k] * (1 - t);
  for (const k in b) o[k] = (o[k] ?? 0) + b[k] * t;
  return o;
};

let KIT = null;
export function toyKit() {
  if (KIT) return KIT;
  const names = BONES.map((b) => b[0]);
  const I = (n) => names.indexOf(n);
  // (the loft is drawn on the skeleton as it was, then brought to the shorter torso)
  const rawP = BONES.map((b) => b[1].clone());
  const bindP = BONES.map(([n, p]) => (ARMY.test(n) ? p.clone().setY(p.y - TORSO) : p.clone().setY(TY(p.y))));
  const parents = BONES.map((b) => (b[2] === -1 ? -1 : I(b[2])));
  // every bone sits square to the world at rest, bar the hands: their x runs out along the
  // fingers (that's where the rig finds the palms)
  const bindQ = names.map((n, i) => {
    const q = new THREE.Quaternion();
    if (/_Hand$/.test(n)) q.setFromUnitVectors(V(1, 0, 0), bindP[i].clone().sub(bindP[parents[i]]).normalize());
    return q;
  });
  const local = names.map((n, i) => {
    const p = parents[i];
    if (p < 0) return { p: bindP[i].clone(), q: bindQ[i].clone() };
    const pq = bindQ[p].clone().invert();
    return { p: bindP[i].clone().sub(bindP[p]).applyQuaternion(pq), q: pq.multiply(bindQ[i]) };
  });
  const boneInverses = names.map((n, i) => new THREE.Matrix4().compose(bindP[i], bindQ[i], V(1, 1, 1)).invert());
  const P = (n) => rawP[I(n)];
  const geos = [];
  const UP = V(0, 1, 0), X = V(1, 0, 0);

  // the shell: hem to collar up the spine. Which bones by height: pelvis, the spine's three, the neck
  const spineW = (y) => {
    const st = [['Bip01_Pelvis', 0.895], ['Bip01_Spine', 1.015], ['Bip01_Spine1', 1.168], ['Bip01_Spine2', 1.321], ['Bip01_Neck', 1.521]];
    if (y <= st[0][1]) return { [st[0][0]]: 1 };
    for (let i = 0; i + 1 < st.length; i++) if (y <= st[i + 1][1]) { const t = (y - st[i][1]) / (st[i + 1][1] - st[i][1]); return { [st[i][0]]: 1 - t, [st[i + 1][0]]: t }; }
    return { Bip01_Neck: 1 };
  };
  // (the hem rides with the thighs a little, so a knee lifted into a grab doesn't come through it)
  // (the front more than the back, and the middle with both legs)
  const hemW = (y, k) => (p) => {
    const kk = k * (0.55 + 0.45 * Math.min(1, Math.max(0, (p.z + 0.1) / 0.25)));
    const l = 0.5 + 0.5 * Math.max(-1, Math.min(1, p.x / 0.12));
    return { ...Object.fromEntries(Object.entries(spineW(y)).map(([b, v]) => [b, v * (1 - kk)])), Bip01_L_Thigh: kk * l, Bip01_R_Thigh: kk * (1 - l) };
  };
  //            y      half width  half depth  z      squareness
  const SHELL = [[0.725, 0.21, 0.172, 0.026, 2.3], [0.755, 0.209, 0.168, 0.022, 2.4], [0.84, 0.203, 0.16, 0.012, 2.5], [0.93, 0.196, 0.151, 0.004, 2.5],
    [1.04, 0.188, 0.142, -0.004, 2.5], [1.17, 0.191, 0.141, -0.008, 2.4], [1.28, 0.195, 0.143, -0.012, 2.3], [1.355, 0.192, 0.138, -0.016, 2.2],
    [1.405, 0.178, 0.128, -0.02, 2.1], [1.445, 0.152, 0.114, -0.022, 2.0], [1.482, 0.118, 0.098, -0.02, 2.0], [1.515, 0.092, 0.088, -0.016, 2.0],
    [1.55, 0.081, 0.084, -0.01, 2.0], [1.585, 0.077, 0.082, -0.008, 2.0]];
  geos.push(tube(SHELL.map(([y, a, b, z, p]) => ring(V(0, y, z), UP, X, a, b, y < 0.88 ? hemW(y, 0.88 * (1 - (y - 0.725) / 0.16)) : spineW(y), 2, p)), I, 0.05, 0.15));

  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R', B = (n) => `Bip01_${S}_${n}`;
    // pants: straight and loose from the hips, the hem stacked over the boot
    const H = P(B('Thigh')).clone().add(V(0, 0.05, 0)), K = P(B('Calf')), A = P(B('Foot'));
    const leg = [];
    const TH = [[0, 0.11, 0.114, { Bip01_Pelvis: 0.5, [B('Thigh')]: 0.5 }], [0.2, 0.108, 0.112, { Bip01_Pelvis: 0.15, [B('Thigh')]: 0.85 }], [0.45, 0.105, 0.109, { [B('Thigh')]: 1 }],
      [0.72, 0.102, 0.106, { [B('Thigh')]: 1 }], [0.9, 0.101, 0.105, { [B('Thigh')]: 0.75, [B('Calf')]: 0.25 }], [1.0, 0.101, 0.105, { [B('Thigh')]: 0.5, [B('Calf')]: 0.5 }]];
    for (const [t, a, b, w] of TH) leg.push(ring(H.clone().lerp(K, t), K.clone().sub(H), X, a * 1.0, b, w, 6));
    // (deep front to back: the boot's cuff leans forward inside and mustn't come through the seat)
    const SH = [[0.12, 0.104, 0.112, { [B('Thigh')]: 0.25, [B('Calf')]: 0.75 }], [0.35, 0.11, 0.124, { [B('Calf')]: 1 }], [0.55, 0.116, 0.132, { [B('Calf')]: 1 }],
      [0.72, 0.12, 0.136, { [B('Calf')]: 1 }], [0.84, 0.124, 0.138, { [B('Calf')]: 1 }], [0.93, 0.127, 0.139, { [B('Calf')]: 1 }], [0.97, 0.128, 0.139, { [B('Calf')]: 1 }]];
    for (const [t, a, b, w] of SH) leg.push(ring(K.clone().lerp(A, t).add(V(0, 0, -0.012 * Math.sin(t * Math.PI))), A.clone().sub(K), X, a, b, w, 7));
    geos.push(Object.assign(tube(leg, I, 0.3, -0.25), { leg: true }));

    // the sleeve: set into the shoulder, loose to a wide cuff over the mitt
    const C0 = V(s * 0.125, 1.425, -0.024), Sh = P(B('UpperArm')), E = P(B('Forearm')), W = P(B('Hand'));
    const side = V(0, 0, 1);
    const arm = [
      ring(C0, Sh.clone().sub(C0), side, 0.076, 0.079, { Bip01_Spine2: 0.7, [B('UpperArm')]: 0.3 }, 3),
      ring(Sh.clone(), E.clone().sub(Sh), side, 0.074, 0.076, { Bip01_Spine2: 0.25, [B('UpperArm')]: 0.75 }, 3),
      ring(Sh.clone().lerp(E, 0.45), E.clone().sub(Sh), side, 0.069, 0.071, { [B('UpperArm')]: 1 }, 3),
      ring(Sh.clone().lerp(E, 0.85), E.clone().sub(Sh), side, 0.065, 0.067, { [B('UpperArm')]: 0.8, [B('Forearm')]: 0.2 }, 3),
      ring(E.clone(), W.clone().sub(Sh), side, 0.064, 0.066, { [B('UpperArm')]: 0.5, [B('Forearm')]: 0.5 }, 4),
      ring(E.clone().lerp(W, 0.3), W.clone().sub(E), side, 0.062, 0.064, { [B('Forearm')]: 1 }, 4),
      ring(E.clone().lerp(W, 0.72), W.clone().sub(E), side, 0.065, 0.067, { [B('Forearm')]: 1 }, 4),
      ring(E.clone().lerp(W, 0.9), W.clone().sub(E), side, 0.068, 0.07, { [B('Forearm')]: 0.85, [B('Hand')]: 0.15 }, 4),
    ];
    geos.push(Object.assign(tube(arm, I, 0.3, -0.35), { arm: true }));
    // the mitt: a rounded paddle out along the fingers, a thumb on the inside
    const d = W.clone().sub(E).normalize(), flat = new THREE.Vector3().crossVectors(d, V(0, 0, 1)).normalize();
    const mitt = [];
    for (const [t, a, b, wh] of [[-0.05, 0.044, 0.04, 0.6], [0.0, 0.046, 0.037, 0.9], [0.045, 0.048, 0.032, 1], [0.085, 0.045, 0.028, 1], [0.115, 0.036, 0.024, 1]])
      mitt.push(ring(W.clone().addScaledVector(d, t), d, V(0, 0, 1), a, b, { [B('Hand')]: wh, [B('Forearm')]: 1 - wh }, 5));
    geos.push(Object.assign(tube(mitt, I, 0.4, 0.7), { arm: true }));
    const thumb = W.clone().addScaledVector(d, 0.04).addScaledVector(V(0, 0, 1), 0.035);
    geos.push(Object.assign(blob(thumb, 0.018, 0.035, 0.018, { [B('Hand')]: 1 }, 5, 6, d.clone().add(V(0, 0, 0.8)), flat, I), { arm: true }));
  }

  // neck and head
  geos.push(tube([
    ring(V(0, 1.49, -0.012), UP, X, 0.056, 0.058, { Bip01_Spine2: 0.4, Bip01_Neck: 0.6 }, 1),
    ring(V(0, 1.56, -0.004), UP, X, 0.054, 0.056, { Bip01_Neck: 0.7, Bip01_Head: 0.3 }, 1),
    ring(V(0, 1.63, 0.004), UP, X, 0.055, 0.058, { Bip01_Head: 1 }, 1),
  ], I, 0.2, 0.2));
  const HC = V(0, 1.676, 0.014), HW = { Bip01_Head: 1 };
  const head = [blob(HC, 0.083, 0.11, 0.098, HW, 0, 12, UP, X, I), blob(HC.clone().add(V(0, -0.028, 0.094)), 0.014, 0.022, 0.017, HW, 0, 6, V(0, 1, 0.4), X, I)];
  for (const s of [1, -1]) head.push(blob(HC.clone().add(V(s * 0.082, -0.01, -0.006)), 0.011, 0.024, 0.016, HW, 0, 6, UP, X, I));
  const hb = P('Bip01_Head');
  for (const g of head) geos.push(g.translate(-hb.x, -hb.y, -hb.z).scale(HEAD_SCALE, HEAD_SCALE, HEAD_SCALE).translate(hb.x, hb.y, hb.z));

  for (const g of geos) {
    if (g.leg) continue;
    const a = g.getAttribute('position');
    for (let i = 0; i < a.count; i++) a.setY(i, g.arm ? a.getY(i) - TORSO : TY(a.getY(i)));
  }
  const geo = mergeGeometries(geos);
  geo.computeBoundingSphere();
  // (from here on the skeleton as it is)
  const PB = (n) => bindP[I(n)];
  const len = (a, b) => PB(a).distanceTo(PB(b));
  const sh = [PB('Bip01_L_UpperArm'), PB('Bip01_R_UpperArm')], th = [PB('Bip01_L_Calf'), PB('Bip01_R_Calf')];
  // (stand-ins for the scanned bodies' textures, for anything that still asks for them)
  const tex = (r, g, b, a = 255) => { const t = new THREE.DataTexture(new Uint8Array([r, g, b, a]), 1, 1); t.needsUpdate = true; return t; };
  KIT = {
    name: 'toy', toy: true, names, parents, local, boneInverses, bindP, bindQ, geo, I,
    map: tex(255, 255, 255), normal: tex(128, 128, 255), mask: tex(0, 0, 0),
    body: new THREE.Vector4((sh[0].z + sh[1].z) / 2, (th[0].z + th[1].z) / 2, (sh[0].y + sh[1].y) / 2, (Math.abs(th[0].x) + Math.abs(th[1].x)) / 2),
    neckP: PB('Bip01_Neck').clone(),
    waistY: PB('Bip01_Pelvis').y + 0.07,
    // (the gear goes round the skull: on the bigger head, further out and bigger)
    headScale: HEAD_SCALE, skullOff: V(0, 0.083, -0.008).multiplyScalar(HEAD_SCALE),
    skull: PB('Bip01_Head').clone().add(V(0, 0.083, -0.008).multiplyScalar(HEAD_SCALE)),
    feet: [PB('Bip01_L_Foot').clone(), PB('Bip01_R_Foot').clone()],
    hands: [PB('Bip01_L_Hand').clone(), PB('Bip01_R_Hand').clone()],
    neckY: PB('Bip01_Neck').y,
    leg: [len('Bip01_L_Thigh', 'Bip01_L_Calf'), len('Bip01_L_Calf', 'Bip01_L_Foot')],
    arm: [len('Bip01_L_UpperArm', 'Bip01_L_Forearm'), len('Bip01_L_Forearm', 'Bip01_L_Hand')],
    // the chest band's rest heights (Cork7's starter shell; it runs round the sleeves too)
    band: new THREE.Vector2(1.06, 1.215),
  };
  return KIT;
}

// The figure as modelled in Blender (blender/rider.py): the same skeleton and rest pose, smoothed
// with subdivision, the shading of its folds baked in (colour red), the body part in green. It
// takes the place of the coded loft above once it's loaded.
export async function loadRiderModel() {
  const kit = toyKit();
  const gl = await loadGLB('rider');
  let sk = null;
  gl.scene.traverse((o) => { if (o.isSkinnedMesh) sk = o; });
  if (!sk) throw new Error('rider.glb: no skinned mesh');
  const geo = plainGeometry(sk);
  // its joints by name onto the kit's bones
  const map = sk.skeleton.bones.map((b) => kit.I(b.name));
  if (map.some((i) => i < 0)) throw new Error('rider.glb: unknown bone ' + sk.skeleton.bones[map.indexOf(-1)].name);
  const si = geo.getAttribute('skinIndex');
  for (let i = 0; i < si.array.length; i++) si.array[i] = map[si.array[i]];
  const col = geo.getAttribute('color'), n = col.count, part = new Float32Array(n);
  for (let i = 0; i < n; i++) part[i] = Math.round(col.getY(i) * 8);
  geo.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  kit.geo = geo;
  kit.baked = true;
  return kit;
}

// flat colour by body part: the shell (and its band or panels), pants, mitts, skin, hair. In a
// crowd copy the jacket colour comes per instance.
export function toyMaterial(kit, outfit, crowd = false) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.86, metalness: 0, vertexColors: !!kit.baked });
  m.defines = { ...(crowd ? { CROWD: '' } : {}), ...(kit.baked ? { TOY_AO: '' } : {}) };
  const c = (x, d = 0x22262c) => new THREE.Color(x ?? d);
  const u = {
    uJacket: { value: c(outfit.jacket) }, uJacket2: { value: c(outfit.jacket2 ?? outfit.jacket) },
    uPants: { value: c(outfit.pants) }, uPants2: { value: c(outfit.pants2 ?? outfit.pants) },
    uGloves: { value: c(outfit.gloves, 0x15171b) }, uSkin: { value: c(outfit.skin, 0xc99a7e) }, uHair: { value: c(outfit.hair, 0x9c907e) },
    uPat: { value: new THREE.Vector2(outfit.jpat ?? 0, outfit.ppat ?? 0) }, uBand: { value: kit.band },
    uFlap: { value: new THREE.Vector2() },
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPart; varying float vPart; varying vec3 vRest; uniform vec2 uFlap;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vPart = aPart; vRest = position;
{
  // the loose ends move in the wind: the shell's hem, the cuffs, the pants' legs
  float pp = floor( aPart + 0.5 );
  float loose = pp == 2.0 ? smoothstep( 0.86, 0.68, position.y ) : pp == 4.0 ? 0.4 : pp == 7.0 ? 0.5 : pp == 6.0 ? 0.25 : 0.0;
  float fl = sin( uFlap.x * 24.0 + position.y * 31.0 + position.x * 17.0 + position.z * 13.0 ) * 0.6 + sin( uFlap.x * 41.0 + position.y * 57.0 - position.x * 23.0 ) * 0.4;
  transformed += objectNormal * fl * loose * uFlap.y * 0.008;
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vPart; varying vec3 vRest;
uniform vec3 uJacket, uJacket2, uPants, uPants2, uGloves, uSkin, uHair; uniform vec2 uPat, uBand;
float tyH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
// (a height on the shorter torso back to where it was drawn: the bands and the zip are placed there)
float tyOld(float y) { return y <= 0.93 ? y : y >= 1.38 - ${TORSO.toFixed(4)} ? y + ${TORSO.toFixed(4)} : 0.93 + (y - 0.93) / (1.0 - ${(TORSO / 0.45).toFixed(5)}); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float part = floor( vPart + 0.5 );
#if defined( CROWD ) && !defined( TOY_AO )
  vec3 jk = vColor.rgb;
#else
  vec3 jk = uJacket;
#endif
  vec3 col;
  if ( part > 7.5 ) col = uHair;
  else if ( part < 1.5 ) col = uSkin;
  else if ( part < 4.5 ) {
    col = jk;
    float pat = uPat.x;
    // 1 a dark band round the chest and the sleeves, 4 the sleeves in the second colour, 8 two
    // halves, 5 a fade
    // (on a sleeve the band goes by the distance down the arm from the shoulder, so with the arms
    // hanging it lines up with the chest's)
    float ry = tyOld( vRest.y );
    float bh = part < 2.5 ? ry : 1.43 - distance( vRest, vec3( sign( vRest.x ) * 0.205, ${(1.43 - TORSO).toFixed(4)}, -0.025 ) );
    if ( pat > 0.5 && pat < 1.5 && bh > uBand.x && bh < uBand.y ) col = uJacket2;
    else if ( pat > 3.5 && pat < 4.5 && part > 2.5 ) col = uJacket2;
    else if ( pat > 7.5 && pat < 8.5 && vRest.x < 0.0 ) col = uJacket2;
    else if ( pat > 4.5 && pat < 5.5 ) col = mix( uJacket2, jk, smoothstep( 0.7, 1.45, ry ) );
    else if ( pat > 1.5 && pat != 4.0 && pat != 5.0 && pat != 8.0 ) { float n = tyH( floor( vRest * 14.0 ) ); col = n > 0.66 ? uJacket2 : col; }
    // a darker hem band and cuffs
    if ( part < 2.5 && vRest.y < 0.72 ) col *= 0.8;
    // the zip up the front, and a little white tab on the chest
    if ( part < 2.5 && vRest.z > 0.0 && abs( vRest.x ) < 0.0045 && ry > 0.69 && ry < 1.56 ) col = vec3( 0.05, 0.06, 0.07 );
    if ( part < 2.5 && vRest.z > 0.05 && vRest.x > 0.085 && vRest.x < 0.13 && ry > 1.3 && ry < 1.33 ) col = vec3( 0.92 );
  }
  else if ( part < 5.5 ) col = uGloves;
  else col = uPants;
#ifdef TOY_AO
  // the folds' shading, baked in Blender (soft: the sun does the rest)
  col *= mix( 1.0, vColor.r, 0.75 );
#endif
  diffuseColor.rgb = col;
}`);
  };
  m.customProgramCacheKey = () => 'toy' + (crowd ? 'c' : '') + (kit.baked ? 'b' : '');
  return m;
}
