// Spectators and chairlift riders: the same scanned people the skiers are, posed once
// (standing, cheering, clapping, sitting on a chair) and skinned on the CPU into static
// meshes, then instanced, with a different jacket colour on every copy.
import * as THREE from 'three';
import { avatarKits, AvatarRig, kitMaterial } from './avatar.js';
import { toyMaterial } from './toyrider.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4(), _t = new THREE.Matrix4(), _n = new THREE.Matrix3();
const _p = new THREE.Vector3(), _q = new THREE.Quaternion();

// the frame AvatarRig.pose wants, for a body standing (or sitting) at the origin facing +z
function frame(kit, kind, rnd) {
  const I = kit.I, bp = kit.bindP;
  const pel = bp[I('Bip01_Pelvis')].clone();
  const sh = [bp[I('Bip01_L_UpperArm')], bp[I('Bip01_R_UpperArm')]];
  const arm = kit.arm[0] + kit.arm[1];
  const f = {
    pelvis: pel.clone().add(V(0, -0.015, 0)), hipSide: V(1, 0, 0), pelvisUp: V(0, 1, 0),
    side: V(1, 0, 0), spine: V(0, 1, 0.06).normalize(), fwd: V(0, 0, 1),
    headQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.05 + rnd() * 0.12, (rnd() - 0.5) * 0.9, 0)),
    ank: kit.feet.map((p) => p.clone().add(V(Math.sign(p.x) * 0.03, 0, 0))),
    hand: [V(), V()], kneePole: [V(0, 0, 1), V(0, 0, 1)], elbowPole: [V(0.3, 0, -1).normalize(), V(-0.3, 0, -1).normalize()],
    foot: [new THREE.Quaternion(), new THREE.Quaternion()], grip: 0.35,
  };
  for (const s of [0, 1]) {
    const sg = s ? -1 : 1, S = sh[s];
    if (kind === 'cheer') { f.hand[s].set(S.x + sg * 0.16, S.y + arm * 0.9, S.z + 0.08); f.elbowPole[s].set(sg, -0.2, 0).normalize(); }
    else if (kind === 'clap') { f.hand[s].set(sg * 0.05, S.y - 0.12, S.z + 0.34); f.elbowPole[s].set(sg, -1, 0).normalize(); }
    else if (kind === 'sit') { f.hand[s].set(sg * 0.17, pel.y - 0.02, 0.36); f.elbowPole[s].set(sg * 0.4, -0.2, -1).normalize(); }
    else { f.hand[s].set(S.x + sg * 0.05, S.y - arm * 0.96, S.z + 0.04); }
  }
  if (kind === 'sit') {
    // on the chair: thighs out level, shins hanging, leaning back a little
    const sl = kit.leg[0], sh2 = kit.leg[1];
    f.spine.set(0, 1, -0.12).normalize();
    f.ank = kit.feet.map((p) => V(p.x * 0.8, pel.y - sh2 * 0.98, sl * 0.95));
    f.kneePole = [V(0, 1, 0.4).normalize(), V(0, 1, 0.4).normalize()];
  }
  return f;
}

// skin the rig's current pose into a plain geometry (with the rest positions kept for the dye)
export function bake(rig) {
  rig.root.updateMatrixWorld(true);
  rig.skeleton.update();
  const src = rig.kit.geo, bm = rig.skeleton.boneMatrices;
  const pos = src.getAttribute('position'), nrm = src.getAttribute('normal'), si = src.getAttribute('skinIndex'), sw = src.getAttribute('skinWeight');
  const n = pos.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  // (straight off the arrays: the per-vertex getters are most of the cost here)
  const flat = (a) => (a.isInterleavedBufferAttribute || a.normalized ? null : a.array);
  const pa = flat(pos), na = flat(nrm), ia = flat(si), wa = flat(sw);
  const e = _m.elements;
  for (let i = 0; i < n; i++) {
    e.fill(0);
    for (let c = 0; c < 4; c++) {
      const w = wa ? wa[i * 4 + c] : sw.getComponent(i, c);
      if (!w) continue;
      const b = (ia ? ia[i * 4 + c] : si.getComponent(i, c)) * 16;
      for (let k = 0; k < 16; k++) e[k] += bm[b + k] * w;
    }
    const x = pa ? pa[i * 3] : pos.getX(i), y = pa ? pa[i * 3 + 1] : pos.getY(i), z = pa ? pa[i * 3 + 2] : pos.getZ(i);
    const iw = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    P[i * 3] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * iw;
    P[i * 3 + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * iw;
    P[i * 3 + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * iw;
    _n.setFromMatrix4(_m);
    if (na) _p.set(na[i * 3], na[i * 3 + 1], na[i * 3 + 2]); else _p.fromBufferAttribute(nrm, i);
    _p.applyMatrix3(_n).normalize();
    N[i * 3] = _p.x; N[i * 3 + 1] = _p.y; N[i * 3 + 2] = _p.z;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('uv', src.getAttribute('uv'));
  g.setAttribute('aPart', src.getAttribute('aPart'));
  g.setAttribute('aRest', pos);
  g.setIndex(src.index);
  g.computeBoundingSphere();
  return g;
}

const PANTS = [0x1d1f26, 0x2a2f3a, 0x3b3f47, 0x23324a, 0x4a3b2c, 0x1f2b24];
const JACKETS = [0xd8342c, 0xf2b705, 0x2a7de1, 0x18a868, 0xf06d1a, 0x8e3fd1, 0xe8e8ea, 0x1d1f26, 0xff4f8b, 0x14b8c4, 0x6b4a32, 0xc9d6e6];

// one posed body per kit and pose: [{ kit, kind, geo, mat }]
export function bodies(kinds, rnd) {
  if (!avatarKits.length) return [];
  const out = [];
  avatarKits.forEach((kit, ki) => {
    const outfit = { jacket: 0xffffff, pants: PANTS[ki % PANTS.length], gloves: 0x1d1f26, boots: 0x2a2420 };
    const mat = kitMaterial(kit, outfit, true);
    for (const kind of kinds) {
      const rig = new AvatarRig(kit, outfit);
      rig.pose(frame(kit, kind, rnd));
      out.push({ kit, kind, geo: bake(rig), mat });
    }
  });
  return out;
}

// instanced people at spots [{ x, y, z, yaw, s }]: returns the meshes and, for each spot,
// which mesh and slot it went to (to move them later)
export function crowd(scene, spots, kinds, rnd, shadow = true) {
  const B = bodies(kinds, rnd);
  if (!B.length) return null;
  const pick = spots.map(() => Math.floor(rnd() * B.length));
  const meshes = B.map((b, bi) => {
    const n = pick.filter((p) => p === bi).length;
    if (!n) return null;
    const im = new THREE.InstancedMesh(b.geo, b.mat, n);
    im.castShadow = shadow; im.receiveShadow = true;
    im.frustumCulled = false;
    scene.add(im);
    im.userData.n = 0;
    return im;
  });
  const slots = spots.map((sp, i) => {
    const im = meshes[pick[i]];
    const k = im.userData.n++;
    _q.setFromAxisAngle(V(0, 1, 0), sp.yaw);
    _t.compose(_p.set(sp.x, sp.y, sp.z), _q, V(sp.s ?? 1, sp.s ?? 1, sp.s ?? 1));
    im.setMatrixAt(k, _t);
    im.setColorAt(k, new THREE.Color(JACKETS[Math.floor(rnd() * JACKETS.length)]));
    return { im, k };
  });
  for (const im of meshes) if (im) { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.frustumCulled = true; im.computeBoundingSphere(); im.boundingSphere.radius += 2; }
  return { meshes: meshes.filter(Boolean), slots };
}

// the triangles of a baked body whose corners all belong to parts (and one side: +1 left, -1 right)
export function piece(geo, parts, side) {
  const part = geo.getAttribute('aPart'), rest = geo.getAttribute('aRest'), idx = geo.index.array;
  const keep = [];
  const ok = (v) => parts.includes(Math.round(part.getX(v))) && Math.sign(rest.getX(v)) === side;
  for (let i = 0; i < idx.length; i += 3) if (ok(idx[i]) && ok(idx[i + 1]) && ok(idx[i + 2])) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  const g = geo.clone();
  g.setIndex(keep);
  g.computeBoundingSphere();
  return g;
}

// one posed copy of a particular body (the player's own, sitting on the lift): a single
// instance wearing their jacket
export function posedOne(kit, outfit, kind) {
  const rig = new AvatarRig(kit, outfit);
  rig.pose(frame(kit, kind, Math.random));
  const geo = bake(rig);
  const mat = (kit.toy ? toyMaterial : kitMaterial)(kit, { ...outfit, jacket: 0xffffff }, true);
  const im = new THREE.InstancedMesh(geo, mat, 1);
  im.setMatrixAt(0, new THREE.Matrix4());
  im.setColorAt(0, new THREE.Color(outfit.jacket));
  im.castShadow = true; im.frustumCulled = false;
  im.userData.pelvis = kit.bindP[kit.I('Bip01_Pelvis')].clone();
  return im;
}
