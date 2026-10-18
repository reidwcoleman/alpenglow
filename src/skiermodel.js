// Procedural skier: capsule limbs posed every frame with two-bone IK.
// Local frame: +Z = ski tips, +Y = up, +X = skier's left.
import * as THREE from 'three';
import { avatarKits, AvatarRig } from './avatar.js';

const THIGH = 0.44, SHIN = 0.45, UPPER = 0.29, FORE = 0.28, POLE = 1.18;

let G = null;
function geos() {
  if (G) return G;
  G = {
    thigh: new THREE.CapsuleGeometry(0.083, THIGH - 0.06, 4, 10),
    shin: new THREE.CapsuleGeometry(0.07, SHIN - 0.08, 4, 10),
    upper: new THREE.CapsuleGeometry(0.066, UPPER - 0.04, 4, 10),
    fore: new THREE.CapsuleGeometry(0.058, FORE - 0.06, 4, 10),
    torso: new THREE.CapsuleGeometry(0.155, 0.3, 6, 14),
    hips: new THREE.CapsuleGeometry(0.118, 0.1, 4, 12).rotateZ(Math.PI / 2),
    face: new THREE.SphereGeometry(0.098, 16, 12),
    helmet: new THREE.SphereGeometry(0.122, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56),
    goggles: new THREE.CylinderGeometry(0.118, 0.118, 0.062, 20, 1, true, -Math.PI * 0.42, Math.PI * 0.84),
    strap: new THREE.CylinderGeometry(0.121, 0.121, 0.03, 20, 1, true, Math.PI * 0.58, Math.PI * 0.84),
    hand: new THREE.SphereGeometry(0.055, 10, 8).scale(1, 1.1, 1.25),
    boot: new THREE.BoxGeometry(0.105, 0.11, 0.3, 1, 1, 1).translate(0, 0.07, 0.01),
    cuff: new THREE.CylinderGeometry(0.066, 0.06, 0.2, 10).translate(0, 0.17, -0.02),
    pole: new THREE.CylinderGeometry(0.0085, 0.0065, POLE, 6).translate(0, -POLE / 2, 0),
    grip: new THREE.CylinderGeometry(0.017, 0.015, 0.14, 8).translate(0, -0.05, 0),
    basket: new THREE.CylinderGeometry(0.045, 0.045, 0.008, 10).translate(0, -POLE + 0.09, 0),
    ski: skiGeometry(),
    collar: new THREE.TorusGeometry(0.085, 0.035, 8, 14).rotateX(Math.PI / 2),
    bib: new THREE.PlaneGeometry(0.22, 0.2),
    board: boardGeometry(),
    binding: bindingGeometry(),
    beanie: new THREE.SphereGeometry(0.121, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6).scale(1, 1.18, 1.04),
    cuffB: new THREE.CylinderGeometry(0.124, 0.126, 0.05, 20, 1, true).translate(0, 0.03, 0),
    pom: new THREE.SphereGeometry(0.035, 10, 8).translate(0, 0.15, 0),
  };
  return G;
}

// a twin-tip snowboard, 1.56 m, waist 25 cm, rockered nose and tail; built nose along +X
function boardGeometry() {
  const L = 1.56, segs = 56, T = 0.016;
  const pos = [], col = [], idx = [];
  const top = new THREE.Color(1, 1, 1), dark = new THREE.Color(0.05, 0.05, 0.06), band = new THREE.Color(0.16, 0.16, 0.18), light = new THREE.Color(0.85, 0.85, 0.82);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const z = -L / 2 + t * L;
    const u = Math.abs(t - 0.5) * 2; // 0 at the waist, 1 at the tips
    let w = 0.124 + 0.02 * Math.pow(Math.min(u / 0.74, 1), 2);
    if (u > 0.8) w *= 0.3 + 0.7 * Math.sqrt(Math.max(0, 1 - ((u - 0.8) / 0.2) ** 2));
    const y = 0.006 + (u > 0.72 ? ((u - 0.72) / 0.28) ** 2 * 0.075 : 0);
    const graphic = u > 0.6 && u < 0.7 ? band : Math.abs(u - 0.18) < 0.03 ? light : u < 0.1 ? band : top;
    pos.push(w, y + T, z, -w, y + T, z, w, y, z, -w, y, z);
    for (const c of [graphic, graphic, dark, dark]) col.push(c.r, c.g, c.b);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 4, b = a + 4;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
    idx.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
    idx.push(a, a + 2, b, a + 2, b + 2, b);
    idx.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

// base plate, heel cup and highback, toes along +Z
function bindingGeometry() {
  const parts = [
    new THREE.BoxGeometry(0.13, 0.018, 0.27).translate(0, 0.009, 0.04),
    new THREE.BoxGeometry(0.13, 0.06, 0.014).translate(0, 0.04, -0.075),
    new THREE.BoxGeometry(0.11, 0.15, 0.012).translate(0, 0.075, 0).rotateX(-0.25).translate(0, 0.06, -0.075),
    new THREE.BoxGeometry(0.135, 0.022, 0.04).translate(0, 0.085, 0.11),
  ];
  const pos = [], idx = [];
  let o = 0;
  for (const p of parts) {
    const ng = p.toNonIndexed();
    const a = ng.getAttribute('position');
    for (let i = 0; i < a.count; i++) { pos.push(a.getX(i), a.getY(i), a.getZ(i)); idx.push(o + i); }
    o += a.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function skiGeometry() {
  // 1.72 m ski with sidecut, rocker tip and tail, coloured top sheet
  const L = 1.72, segs = 40, T = 0.018;
  const pos = [], col = [], idx = [];
  const top = new THREE.Color(1, 1, 1), dark = new THREE.Color(0.05, 0.05, 0.06), accent = new THREE.Color(0.18, 0.18, 0.2);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs; // 0 tail, 1 tip
    const z = -L * 0.44 + t * L;
    const sc = 1 - Math.sin(t * Math.PI) * 0.22; // sidecut
    let w = 0.052 * sc * (t > 0.9 ? 1 - (t - 0.9) * 3.5 : 1) * (t < 0.04 ? 0.8 + t * 5 : 1);
    let y = 0.012;
    if (t > 0.86) y += Math.pow((t - 0.86) / 0.14, 2) * 0.075;
    if (t < 0.06) y += Math.pow((0.06 - t) / 0.06, 2) * 0.03;
    const graphic = (Math.abs(t - 0.62) < 0.07 || Math.abs(t - 0.3) < 0.025) ? accent : top;
    // top-left, top-right, bottom-left, bottom-right
    pos.push(w, y + T, z, -w, y + T, z, w, y, z, -w, y, z);
    for (const c of [graphic, graphic, dark, dark]) col.push(c.r, c.g, c.b);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 4, b = a + 4;
    idx.push(a, b, a + 1, a + 1, b, b + 1); // top
    idx.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2); // base
    idx.push(a, a + 2, b, a + 2, b + 2, b); // left side
    idx.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3); // right side
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const PALETTE = {
  jackets: [0xd8342c, 0xf2b705, 0x2a7de1, 0x18a868, 0xf06d1a, 0x8e3fd1, 0xe8e8ea, 0x1d1f26, 0xff4f8b, 0x14b8c4, 0x7a9a3a, 0xc23b5f],
  pants: [0x1b1d24, 0x2c3140, 0x3b2f2a, 0x494f5c, 0x1f2f4a, 0xe6e6e6, 0x5a2a2a, 0x2c4a3a],
  helmets: [0xf4f4f4, 0x15161a, 0xd8342c, 0x2a7de1, 0xf2b705, 0x9aa0aa, 0x18a868],
  goggles: [0xff8a1e, 0x2aa8ff, 0xc23bff, 0x22e0a0, 0xffd21e, 0xff3e3e],
  skis: [0xe63946, 0x1d3557, 0xf4a261, 0x2a9d8f, 0xffffff, 0x111111, 0x8338ec, 0xffbe0b],
  skin: [0xe8b796, 0xc68a64, 0x8d5a3b, 0xf1c7a8, 0x6b4430],
  boards: [0xffffff, 0x111111, 0xe63946, 0x2a9d8f, 0xffbe0b, 0x8338ec, 0xff7a1a, 0x3a86ff],
  beanies: [0xd8342c, 0x1d1f26, 0xf2b705, 0xe8e8ea, 0x2a7de1, 0x18a868, 0xff4f8b, 0x7a9a3a],
};

function pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }

export function randomOutfit(rnd, racer = false) {
  const jacket = pick(PALETTE.jackets, rnd);
  return {
    jacket,
    pants: racer ? jacket : pick(PALETTE.pants, rnd),
    helmet: racer ? pick([0xf4f4f4, 0x15161a, jacket], rnd) : pick(PALETTE.helmets, rnd),
    goggles: pick(PALETTE.goggles, rnd),
    skis: pick(PALETTE.skis, rnd),
    boots: pick([0x15161a, 0xf0f0f0, 0x2a2d35, 0xd8342c], rnd),
    gloves: pick([0x15161a, 0x2a2d35, 0x5a3a28, jacket], rnd),
    skin: pick(PALETTE.skin, rnd),
    avatar: rnd(),
    racer,
    // freeriders: some wear a beanie over the goggles, park kids ride baggier
    beanie: !racer && rnd() < 0.3 ? pick(PALETTE.beanies, rnd) : 0,
    pom: rnd() < 0.5,
    board: false,
    deck: pick(PALETTE.boards, rnd),
  };
}

const Y = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function ik(A, C, l1, l2, pole, out) {
  const d0 = tmpV.subVectors(C, A);
  let d = d0.length();
  const dir = d0.multiplyScalar(1 / (d || 1));
  d = Math.min(d, l1 + l2 - 1e-3);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const perp = tmpV2.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  return out.copy(A).addScaledVector(dir, a).addScaledVector(perp, h);
}

function place(mesh, a, b) {
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  tmpV.subVectors(b, a).normalize();
  mesh.quaternion.setFromUnitVectors(Y, tmpV);
}

function bibTexture(num, color) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 116;
  const g = c.getContext('2d');
  g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, 128, 116);
  g.fillStyle = '#' + new THREE.Color(color).getHexString();
  g.fillRect(0, 0, 128, 18); g.fillRect(0, 98, 128, 18);
  g.fillStyle = '#111'; g.font = 'bold 66px Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(num), 64, 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// where the grabbing hand goes and what the legs do, per grab
// skis: (x: + left, z: + tips); board (rider frame): x + nose, z + toe edge
const SKI_GRAB = {
  mute: { hand: 'L', at: [-0.05, 0.02, 0.32], lift: 0.06, cross: 0.32, tip: 0.2 },
  tail: { hand: 'R', at: [-0.16, 0.06, -0.3], lift: 0.06, cross: 0, tip: -0.42 },
  japan: { hand: 'L', at: [0.12, 0.04, 0.14], lift: 0.16, back: 0.1, cross: 0.1, tip: 0.5 },
  safety: { hand: 'R', at: [-0.2, 0.05, 0.02], lift: 0.14, cross: 0, tip: 0.15 },
  critical: { hand: 'R', at: [0.06, 0.04, -0.2], lift: 0.12, cross: -0.22, tip: -0.25 },
  nose: { hand: 'L', at: [0.14, 0.08, 0.62], lift: 0.18, cross: 0, tip: 0.55 },
};
const BOARD_GRAB = {
  indy: { hand: 'R', at: [-0.04, 0.03, 0.15], lift: 0.3 },
  melon: { hand: 'L', at: [0.06, 0.03, -0.15], lift: 0.3, back: 0.06 },
  method: { hand: 'L', at: [0.02, 0.02, -0.17], lift: 0.34, back: 0.22, roll: -0.55 },
  stalefish: { hand: 'R', at: [-0.08, 0.02, -0.16], lift: 0.3, back: 0.08 },
  nose: { hand: 'L', at: [0.62, 0.05, 0.02], lift: 0.22, front: 0.16 },
  tail: { hand: 'R', at: [-0.62, 0.05, 0.02], lift: 0.22, rear: 0.16 },
};
// the board names for the same buttons
export const BOARD_NAME = { mute: 'indy', tail: 'tail', japan: 'melon', safety: 'method', critical: 'stalefish', nose: 'nose' };

export class SkierModel {
  constructor(outfit, bib = 0) {
    const g = geos();
    const M = (c, r = 0.7, m = 0, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...extra });
    this.board = !!outfit.board;
    const jacketM = M(outfit.jacket, outfit.racer ? 0.35 : 0.72);
    const pantsM = M(outfit.pants, outfit.racer ? 0.35 : 0.8);
    const helmetM = outfit.beanie ? M(outfit.beanie, 0.95) : M(outfit.helmet, 0.28, 0.05);
    const goggleM = M(outfit.goggles, 0.18, 0.75, { envMapIntensity: 1.1 });
    const strapM = M(0x16171c, 0.8);
    const skinM = M(outfit.skin, 0.6);
    const gloveM = M(outfit.gloves, 0.75);
    const bootM = M(outfit.boots, 0.35);
    const skiM = new THREE.MeshStandardMaterial({ color: this.board ? outfit.deck ?? 0xffffff : outfit.skis, vertexColors: true, roughness: 0.3, metalness: 0.1 });
    const poleM = M(0x9ea5b0, 0.3, 0.8);
    const darkM = M(0x111215, 0.6);

    this.group = new THREE.Group();
    this.tilt = new THREE.Group();
    this.group.add(this.tilt);
    // a snowboarder stands sideways: the body lives in a frame turned a quarter (left foot forward)
    this.frame = this.tilt;
    if (this.board) {
      this.frame = new THREE.Group();
      this.frame.rotation.y = -Math.PI / 2;
      this.tilt.add(this.frame);
    }
    const add = (geo, mat, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadow; m.receiveShadow = false;
      this.frame.add(m);
      return m;
    };
    this.parts = {
      bootL: add(g.boot, bootM), bootR: add(g.boot, bootM),
      cuffL: add(g.cuff, bootM), cuffR: add(g.cuff, bootM),
      shinL: add(g.shin, pantsM), shinR: add(g.shin, pantsM),
      thighL: add(g.thigh, pantsM), thighR: add(g.thigh, pantsM),
      hips: add(g.hips, pantsM),
      torso: add(g.torso, jacketM),
      collar: add(g.collar, outfit.racer ? jacketM : darkM),
      face: add(g.face, skinM),
      helmet: add(outfit.beanie ? g.beanie : g.helmet, helmetM),
      goggles: add(g.goggles, goggleM, false),
      strap: add(g.strap, strapM, false),
      upperL: add(g.upper, jacketM), upperR: add(g.upper, jacketM),
      foreL: add(g.fore, jacketM), foreR: add(g.fore, jacketM),
      handL: add(g.hand, gloveM), handR: add(g.hand, gloveM),
    };
    const P = this.parts;
    if (this.board) {
      P.deck = add(g.board, skiM);
      const bm = M(0x1b1c20, 0.45, 0.2);
      P.bindL = add(g.binding, bm); P.bindR = add(g.binding, bm);
      for (const k of ['cuffL', 'cuffR']) P[k].scale.set(1.25, 1, 1.25);
      for (const k of ['bootL', 'bootR']) P[k].scale.set(1.15, 1.2, 1.05);
    } else {
      Object.assign(P, {
        skiL: add(g.ski, skiM), skiR: add(g.ski, skiM),
        poleL: add(g.pole, poleM), poleR: add(g.pole, poleM),
        gripL: add(g.grip, darkM, false), gripR: add(g.grip, darkM, false),
        basketL: add(g.basket, darkM, false), basketR: add(g.basket, darkM, false),
      });
    }
    if (outfit.beanie) {
      P.cuffB = add(g.cuffB, helmetM, false);
      if (outfit.pom) P.pom = add(g.pom, helmetM, false);
    }
    if (bib) {
      const bm = new THREE.MeshStandardMaterial({ map: bibTexture(bib, outfit.jacket), roughness: 0.8, side: THREE.DoubleSide });
      P.bib = add(g.bib, bm, false);
      P.bibBack = add(g.bib, bm, false);
    }
    this.headGear = ['helmet', 'goggles', 'strap', 'cuffB', 'pom'].filter((k) => P[k]);
    this.small = ['goggles', 'strap', 'gripL', 'gripR', 'basketL', 'basketR', 'collar', 'cuffB', 'pom', 'bindL', 'bindR'].filter((k) => P[k]);
    if (P.bib) this.small.push('bib', 'bibBack');
    // joint scratch
    this.j = {};
    for (const k of ['hipL', 'hipR', 'kneeL', 'kneeR', 'ankL', 'ankR', 'pelvis', 'chest', 'neck', 'head', 'shL', 'shR', 'elL', 'elR', 'hdL', 'hdR', 'tipL', 'tipR', 'spine', 'side', 'fwd'])
      this.j[k] = new THREE.Vector3();
    this.kp = [new THREE.Vector3(), new THREE.Vector3()];
    this.ep = [new THREE.Vector3(), new THREE.Vector3()];
    this.hipSide = new THREE.Vector3();
    this.boardQ = new THREE.Quaternion();
    this.gAmt = 0; this.gKind = null; this.airS = 0; this.lastT = null;
    this.lod = 0;
    // a real body when the avatars are loaded (browser only); the capsules stay for far away
    if (avatarKits.length) {
      const kit = avatarKits[Math.floor((outfit.avatar ?? Math.random()) * avatarKits.length) % avatarKits.length];
      this.rig = new AvatarRig(kit, outfit);
      this.frame.add(this.rig.root);
      this.body = ['shinL', 'shinR', 'thighL', 'thighR', 'hips', 'torso', 'collar', 'face', 'upperL', 'upperR', 'foreL', 'foreR', 'handL', 'handR'].map((k) => P[k]);
      // the body wears its own (dyed) boots: what's left of the capsule boot is the binding
      for (const k of ['cuffL', 'cuffR']) P[k].scale.setScalar(0.001);
      if (this.board) for (const k of ['bootL', 'bootR']) P[k].scale.setScalar(0.001);
      else for (const k of ['bootL', 'bootR']) { P[k].scale.set(0.95, 0.45, 1.05); P[k].material = new THREE.MeshStandardMaterial({ color: 0x2b2e35, roughness: 0.4, metalness: 0.5 }); }
      this.f = {
        pelvis: new THREE.Vector3(), hipSide: new THREE.Vector3(), pelvisUp: new THREE.Vector3(), side: null, spine: null, fwd: null,
        headQ: new THREE.Quaternion(), ank: [new THREE.Vector3(), new THREE.Vector3()], hand: [new THREE.Vector3(), new THREE.Vector3()],
        kneePole: [new THREE.Vector3(), new THREE.Vector3()], elbowPole: [new THREE.Vector3(), new THREE.Vector3()],
        foot: [new THREE.Quaternion(), new THREE.Quaternion()], grip: 1,
      };
      this.real = true;
      for (const m of this.body) m.visible = false;
    }
  }

  // close by: the avatar; far away the capsule figure is plenty
  setReal(on) {
    if (!this.rig || on === this.real) return;
    this.real = on;
    this.rig.root.visible = on;
    for (const m of this.body) m.visible = !on;
  }

  hideHead(on) {
    if (on === !!this.headHidden) return;
    this.headHidden = on;
    for (const k of this.headGear) this.parts[k].visible = !on && (this.lod === 0 || !this.small.includes(k));
  }

  setDetail(near) {
    const lod = near ? 0 : 1;
    if (lod === this.lod) return;
    this.lod = lod;
    for (const k of this.small) if (!(this.gearOff && /grip|basket/.test(k)) && !(this.real && this.body?.includes(this.parts[k])) && !(this.headHidden && this.headGear.includes(k))) this.parts[k].visible = near;
    for (const k in this.parts) this.parts[k].castShadow = near && !this.small.includes(k);
  }

  // the avatar's skeleton from this frame's joints (its own limb lengths: pelvis height scaled to its legs)
  poseReal(hq) {
    const j = this.j, f = this.f, kit = this.rig.kit, P = this.parts;
    const legK = (kit.leg[0] + kit.leg[1]) / (THIGH + SHIN);
    const ankY = (a) => a.y - 0.03;
    f.pelvis.copy(j.pelvis);
    const ankMid = (j.ankL.y + j.ankR.y) / 2;
    f.pelvis.y = ankY({ y: ankMid }) + (j.pelvis.y - ankMid) * legK;
    f.hipSide.copy(this.hipSide);
    f.pelvisUp.copy(Y).lerp(j.spine, 0.45).normalize();
    f.side = j.side; f.spine = j.spine; f.fwd = j.fwd;
    f.headQ.copy(hq);
    for (const [s, ank, hd, boot] of [[0, j.ankL, j.hdL, P.bootL], [1, j.ankR, j.hdR, P.bootR]]) {
      f.ank[s].set(ank.x, ankY(ank), ank.z);
      // hands: same place relative to the shoulders the capsule figure uses
      f.hand[s].copy(hd);
      f.hand[s].y += f.pelvis.y - j.pelvis.y;
      f.kneePole[s].copy(this.kp[s]).normalize();
      f.elbowPole[s].copy(this.ep[s]);
      f.foot[s].copy(boot.quaternion);
    }
    f.grip = this.board ? 0.35 + this.gAmt * 0.65 : this.gearOff ? 0.3 : 1;
    this.rig.pose(f);
  }

  // p: { crouch, tuck, lean, angulate, plow, air, grab, grabKind, polePlant, poleSide, crash, t, twist, look, edge, skate, press, shifty, daffy, flail }
  pose(p) {
    const dt = this.lastT == null ? 0.016 : clamp(p.t - this.lastT, 0, 0.1);
    this.lastT = p.t;
    // grabs and the air pose ease in and out instead of snapping
    if (p.grab) this.gKind = p.grabKind;
    this.gAmt += ((p.grab ? 1 : 0) - this.gAmt) * Math.min(1, dt * (p.grab ? 14 : 9));
    if (this.gAmt < 0.01) this.gKind = null;
    this.airS += (p.air - this.airS) * Math.min(1, dt * 10);
    this.tilt.rotation.set(0, 0, p.lean);
    if (this.board) {
      // riding switch: the other foot leads, the body faces the other edge
      const sw = !!p.switch;
      if (sw !== this.sw) { this.sw = sw; this.frame.rotation.y = sw ? Math.PI / 2 : -Math.PI / 2; }
      this.lowerBoard(sw ? { ...p, lean: -p.lean, edge: -(p.edge || 0) } : p);
    } else this.lowerSki(p);
    this.upper(p);
  }

  lowerSki(p) {
    const j = this.j, P = this.parts;
    const crouch = p.crouch, tuck = p.tuck, air = this.airS;
    const stance = 0.105 + p.plow * 0.16;
    j.ankL.set(stance, 0.17, 0);
    j.ankR.set(-stance, 0.17, 0);
    // inner leg is shorter when edged: lift the inside foot a little
    const innerLift = Math.abs(p.lean) * 0.09;
    if (p.lean > 0) j.ankR.y += innerLift; else j.ankL.y += innerLift;
    if (air > 0) { j.ankL.y += air * 0.12; j.ankR.y += air * 0.12; }
    const G = SKI_GRAB[this.gKind] ?? SKI_GRAB.mute;
    const g = this.gAmt;
    j.ankL.y += G.lift * g; j.ankR.y += G.lift * g;
    if (G.back) { j.ankL.z -= G.back * g; j.ankR.z -= G.back * g; }
    // daffy: one ski kicked forward, the other back
    const daffy = p.daffy || 0;
    j.ankL.z += daffy * 0.42; j.ankR.z -= daffy * 0.42; j.ankL.y += daffy * 0.08;
    const cross = G.cross * g + (p.cross || 0) * 0.3;
    const tipPitch = G.tip * g;
    // skating stride: push one ski out and back while the other glides
    const skate = p.skate || 0;
    const pushL = skate * Math.max(0, Math.sin(p.skatePhase || 0)), pushR = skate * Math.max(0, -Math.sin(p.skatePhase || 0));
    j.ankL.x += pushL * 0.26; j.ankL.z -= pushL * 0.12; j.ankL.y += pushR * 0.07;
    j.ankR.x -= pushR * 0.26; j.ankR.z -= pushR * 0.12; j.ankR.y += pushL * 0.07;

    const hipH = 0.93 - crouch * 0.22 - tuck * 0.33 - air * 0.12 - g * 0.08 + Math.sin(p.t * 9) * 0.004;
    const hipZ = -0.06 - crouch * 0.07 - tuck * 0.12;
    j.pelvis.set(-p.lean * 0.12 - (pushL - pushR) * 0.09, hipH, hipZ);
    // upper body: forward pitch and counter-roll (angulation)
    const pitch = 0.2 + crouch * 0.25 + tuck * 0.95 + air * 0.15 + g * 0.25;
    const ang = -p.lean * p.angulate;
    j.spine.set(Math.sin(ang) * Math.cos(pitch), Math.cos(ang) * Math.cos(pitch), Math.sin(pitch)).normalize();
    // shifty: the hips turn the skis across while the shoulders stay
    const shifty = (p.shifty || 0) * 0.9;
    const twist = (p.twist || 0) - shifty;
    this.frameUpper(twist);
    j.hipL.copy(j.pelvis).addScaledVector(this.hipSide, 0.095);
    j.hipR.copy(j.pelvis).addScaledVector(this.hipSide, -0.095);
    for (const [s, sg] of [[0, 1], [1, -1]]) this.kp[s].set(-p.lean * 0.9 + sg * (0.1 + p.plow * 0.4), 0.15, 1);
    this.legs();

    // skis, boots
    const plowYaw = p.plow * 0.32;
    // skis roll further onto edge than the body leans when edging at low speed
    const extraEdge = clamp((p.edge || 0) * 0.75 - p.lean, -0.45, 0.45) * (Math.abs(p.edge || 0) > Math.abs(p.lean) ? 1 : 0);
    for (const [s, ank, ski, boot, cuff, yaw] of [[1, j.ankL, P.skiL, P.bootL, P.cuffL, -plowYaw + skate * 0.36 - cross], [-1, j.ankR, P.skiR, P.bootR, P.cuffR, plowYaw - skate * 0.36 + cross]]) {
      ski.position.set(ank.x, ank.y - 0.17, ank.z);
      ski.rotation.set(air * -0.12 + tipPitch - (s > 0 ? daffy : -daffy) * 0.35, yaw - shifty, extraEdge);
      boot.position.set(ank.x, ank.y - 0.17, ank.z);
      boot.rotation.copy(ski.rotation);
      cuff.position.copy(boot.position);
      cuff.rotation.set(0.25 + crouch * 0.2 + tuck * 0.3, yaw - shifty, 0);
    }

    // hands: relaxed ready position, tuck pulls them in front of the face
    const handY = hipH + 0.02 + crouch * 0.05;
    j.hdL.set(0.31, handY, hipZ + 0.36).lerp(tmpV.set(0.11, hipH + 0.18, hipZ + 0.62), tuck);
    j.hdR.set(-0.31, handY, hipZ + 0.36).lerp(tmpV.set(-0.11, hipH + 0.18, hipZ + 0.62), tuck);
    if (air > 0) {
      // arms out for balance, pulled in tight while spinning
      const tight = clamp(Math.abs(p.spinRate || 0) / 7, 0, 1);
      const out = 0.42 - tight * 0.24;
      j.hdL.lerp(tmpV.set(out, hipH + 0.18 + tight * 0.1, hipZ + 0.2 + tight * 0.15), air);
      j.hdR.lerp(tmpV.set(-out, hipH + 0.18 + tight * 0.1, hipZ + 0.2 + tight * 0.15), air);
    }
    if (g > 0.01) {
      const ank = G.at[0] > 0 ? j.ankL : j.ankR;
      const h = G.hand === 'L' ? j.hdL : j.hdR, o = G.hand === 'L' ? j.hdR : j.hdL;
      h.lerp(tmpV.set(G.at[0], ank.y + G.at[1], G.at[2]), g);
      o.lerp(tmpV.set(G.hand === 'L' ? -0.5 : 0.5, hipH + 0.32, hipZ + 0.1), g);
    }
    if (this.twistNow) for (const h of [j.hdL, j.hdR]) h.sub(j.pelvis).applyQuaternion(tmpQ.setFromAxisAngle(Y, this.twistNow)).add(j.pelvis);
    // pole plant: reach the inside hand forward and down
    if (p.polePlant > 0) {
      const h = p.poleSide > 0 ? j.hdL : j.hdR;
      h.z += p.polePlant * 0.16; h.y -= p.polePlant * 0.08;
    }
    this.flail(p, hipH, hipZ, 1);
    for (const [s, sg] of [[0, 1], [1, -1]]) this.ep[s].set(sg * 0.6, -0.6, -0.5).normalize().applyQuaternion(tmpQ.setFromAxisAngle(Y, this.twistNow));
  }

  // a snowboarder, in the body's own frame: +X toward the nose (front foot), +Z toward the toe edge
  lowerBoard(p) {
    const j = this.j, P = this.parts;
    const crouch = p.crouch, tuck = p.tuck, air = this.airS;
    const ts = clamp(p.lean / 0.6, -1, 1); // + toeside, - heelside
    const G = BOARD_GRAB[BOARD_NAME[this.gKind]] ?? BOARD_GRAB.indy;
    const g = this.gAmt;
    const half = 0.25;
    const lift = air * 0.1 + G.lift * g;
    j.ankL.set(half, 0.17 + lift + (G.front ?? 0) * g, -(G.back ?? 0) * g);
    j.ankR.set(-half, 0.17 + lift + (G.rear ?? 0) * g, -(G.back ?? 0) * g);
    // nose / tail press (butters and rail presses): weight over one end, the other end lifts
    const press = p.press || 0;
    if (press) { (press > 0 ? j.ankR : j.ankL).y += 0.16 * Math.abs(press); }
    // boned: front leg straightened, the nose kicked out
    const daffy = p.daffy || 0;
    j.ankL.x += daffy * 0.12; j.ankL.y += daffy * 0.02; j.ankR.y += daffy * 0.2;

    const hipH = 0.9 - crouch * 0.24 - tuck * 0.18 - air * 0.06 - g * 0.18 + Math.sin(p.t * 9) * 0.003;
    const hipZ = -0.03 + Math.max(0, ts) * 0.05 - Math.max(0, -ts) * 0.09 - tuck * 0.04;
    j.pelvis.set(0.02 - press * 0.12, hipH, hipZ);
    // the inclination comes from the tilt; the upper body angulates back against it
    const pitch = 0.22 + crouch * 0.26 + tuck * 0.3 - p.lean * 0.6 + air * 0.12 + g * 0.42;
    const ang = 0.05 - press * 0.15;
    j.spine.set(Math.sin(ang) * Math.cos(pitch), Math.cos(ang) * Math.cos(pitch), Math.sin(pitch)).normalize();
    // shoulders open a little toward the nose; a shifty turns the board under them
    const shifty = (p.shifty || 0) * 0.9;
    this.frameUpper(0.32 + (p.twist || 0) * 0.5 + shifty);
    j.hipL.copy(j.pelvis).addScaledVector(this.hipSide, 0.095);
    j.hipR.copy(j.pelvis).addScaledVector(this.hipSide, -0.095);
    this.kp[0].set(0.12, 0.1, 1); this.kp[1].set(0.05, 0.1, 1);
    this.legs();

    // the deck follows the feet: along the ankles, rolled onto its edge
    const dir = tmpV.subVectors(j.ankL, j.ankR).normalize();
    const extraEdge = clamp((p.edge || 0) * 0.75 - p.lean, -0.45, 0.45) * (Math.abs(p.edge || 0) > Math.abs(p.lean) ? 1 : 0);
    this.boardQ.setFromUnitVectors(tmpV2.set(1, 0, 0), dir).multiply(tmpQ.setFromAxisAngle(tmpV2.set(1, 0, 0), extraEdge + (G.roll ?? 0) * g));
    if (shifty) this.boardQ.premultiply(tmpQ.setFromAxisAngle(Y, -shifty));
    const up = tmpV2.set(0, 1, 0).applyQuaternion(this.boardQ);
    P.deck.position.addVectors(j.ankL, j.ankR).multiplyScalar(0.5).addScaledVector(up, -0.17);
    P.deck.quaternion.copy(this.boardQ);
    for (const [ank, boot, cuff, bind, duck] of [[j.ankL, P.bootL, P.cuffL, P.bindL, 0.26], [j.ankR, P.bootR, P.cuffR, P.bindR, -0.26]]) {
      const q = tmpQ.copy(this.boardQ).multiply(new THREE.Quaternion().setFromAxisAngle(Y, duck));
      bind.position.copy(ank).addScaledVector(up, -0.155);
      bind.quaternion.copy(q);
      boot.position.copy(ank).addScaledVector(up, -0.15);
      boot.quaternion.copy(q);
      cuff.position.copy(boot.position);
      cuff.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(tmpV2.set(1, 0, 0), 0.3 + crouch * 0.3));
    }

    // arms: front hand toward the nose, back hand by the back hip
    const reach = Math.max(0, -ts) * 0.14;
    j.hdL.set(0.36, hipH + 0.06 - Math.max(0, ts) * 0.05, hipZ + 0.18 + reach);
    j.hdR.set(-0.3, hipH - 0.02, hipZ + 0.14 + reach);
    j.hdL.lerp(tmpV.set(0.22, hipH + 0.05, hipZ + 0.4), tuck);
    j.hdR.lerp(tmpV.set(-0.05, hipH + 0.02, hipZ + 0.42), tuck);
    if (air > 0) {
      const tight = clamp(Math.abs(p.spinRate || 0) / 7, 0, 1);
      j.hdL.lerp(tmpV.set(0.55 - tight * 0.3, hipH + 0.3 - tight * 0.05, 0.05 + tight * 0.2), air);
      j.hdR.lerp(tmpV.set(-0.5 + tight * 0.3, hipH + 0.28 - tight * 0.05, 0.05 + tight * 0.2), air);
    }
    if (g > 0.01) {
      const h = G.hand === 'L' ? j.hdL : j.hdR, o = G.hand === 'L' ? j.hdR : j.hdL;
      // the edge of the deck where the hand goes
      const at = tmpV.set(G.at[0], 0.03, G.at[2]).applyQuaternion(this.boardQ).add(P.deck.position);
      at.y += G.at[1];
      h.lerp(at, g);
      o.lerp(tmpV.set(G.hand === 'L' ? -0.55 : 0.55, hipH + 0.38, 0.0), g);
    }
    this.flail(p, hipH, hipZ, 1);
    this.ep[0].set(0.5, -0.6, -0.6).normalize(); this.ep[1].set(-0.5, -0.6, -0.6).normalize();
  }

  // spine frames from j.spine and an upper-body twist about the vertical
  frameUpper(twist) {
    const j = this.j;
    j.side.set(1, 0, 0).addScaledVector(j.spine, -j.spine.x).normalize();
    j.fwd.crossVectors(j.side, j.spine).normalize();
    this.hipSide.copy(j.side);
    this.twistNow = twist;
    if (twist) {
      const qT = tmpQ.setFromAxisAngle(Y, twist);
      j.spine.applyQuaternion(qT); j.side.applyQuaternion(qT); j.fwd.applyQuaternion(qT);
    }
  }

  legs() {
    const j = this.j, P = this.parts;
    ik(j.hipL, j.ankL, THIGH, SHIN, this.kp[0], j.kneeL);
    ik(j.hipR, j.ankR, THIGH, SHIN, this.kp[1], j.kneeR);
    place(P.thighL, j.hipL, j.kneeL); place(P.thighR, j.hipR, j.kneeR);
    place(P.shinL, j.kneeL, j.ankL); place(P.shinR, j.kneeR, j.ankR);
  }

  // crashing or sketchy: arms thrown out
  flail(p, hipH, hipZ) {
    const j = this.j;
    if (p.crash) {
      j.hdL.set(0.5, hipH + 0.3, hipZ + 0.1); j.hdR.set(-0.5, hipH + 0.4, hipZ - 0.1);
    } else if (p.flail > 0) {
      const k = p.flail, w = Math.sin(p.t * 17);
      j.hdL.lerp(tmpV.set(0.55, hipH + 0.35 + w * 0.12, hipZ + 0.1), k);
      j.hdR.lerp(tmpV.set(-0.55, hipH + 0.35 - w * 0.12, hipZ + 0.05), k);
    }
  }

  upper(p) {
    const j = this.j, P = this.parts;
    const tuck = p.tuck;
    j.chest.copy(j.pelvis).addScaledVector(j.spine, 0.42);
    P.hips.position.copy(j.pelvis).addScaledVector(j.spine, 0.04);
    P.hips.quaternion.setFromUnitVectors(Y, j.spine);
    P.torso.position.copy(j.pelvis).addScaledVector(j.spine, 0.27);
    P.torso.quaternion.setFromUnitVectors(Y, j.spine);
    j.neck.copy(j.pelvis).addScaledVector(j.spine, 0.56);
    P.collar.position.copy(j.neck);
    P.collar.quaternion.setFromUnitVectors(Y, j.spine);
    // the head looks where it's going: up off the spine, turned toward the line (and into a spin)
    const headUp = (this._headUp ??= new THREE.Vector3()).copy(j.spine).lerp(Y, 0.55 + tuck * 0.2).normalize();
    j.head.copy(j.neck).addScaledVector(headUp, 0.12);
    const yaw = this.board ? 1.15 + (p.look || 0) : this.twistNow * 1.15 + (p.look || 0);
    const hq = (this._hq ??= new THREE.Quaternion()).setFromUnitVectors(Y, headUp).multiply(tmpQ.setFromAxisAngle(Y, clamp(yaw, -1.6, 1.9)));
    for (const k of ['face', ...this.headGear]) { P[k].position.copy(j.head); P[k].quaternion.copy(hq); }
    if (P.bib) {
      P.bib.position.copy(j.pelvis).addScaledVector(j.spine, 0.3).addScaledVector(j.fwd, 0.158);
      const m = new THREE.Matrix4().makeBasis(j.side.clone().negate(), j.spine, j.fwd.clone().negate());
      P.bib.quaternion.setFromRotationMatrix(m);
      P.bib.rotateY(Math.PI);
      P.bibBack.position.copy(j.pelvis).addScaledVector(j.spine, 0.3).addScaledVector(j.fwd, -0.158);
      P.bibBack.quaternion.setFromRotationMatrix(m);
    }
    j.shL.copy(j.chest).addScaledVector(j.side, 0.2).addScaledVector(j.spine, 0.04);
    j.shR.copy(j.chest).addScaledVector(j.side, -0.2).addScaledVector(j.spine, 0.04);
    if (this.rig && this.real) this.poseReal(hq);
    ik(j.shL, j.hdL, UPPER, FORE, this.ep[0], j.elL);
    ik(j.shR, j.hdR, UPPER, FORE, this.ep[1], j.elR);
    place(P.upperL, j.shL, j.elL); place(P.upperR, j.shR, j.elR);
    place(P.foreL, j.elL, j.hdL); place(P.foreR, j.elR, j.hdR);
    P.handL.position.copy(j.hdL); P.handR.position.copy(j.hdR);
    P.handL.quaternion.copy(P.foreL.quaternion); P.handR.quaternion.copy(P.foreR.quaternion);

    // gear on the real body: helmet on its head, bib on its chest, poles in its hands
    const fw = tmpV2.set(0, 0, 1).applyQuaternion(hq);
    let skull = j.head;
    if (this.rig && this.real) {
      const r = this.rig;
      skull = r.skull;
      for (const k of this.headGear) { P[k].position.copy(r.skull); P[k].scale.setScalar(1.06); }
      j.hdL.copy(r.palm[0]); j.hdR.copy(r.palm[1]);
      if (P.bib) {
        P.bib.position.copy(r.chestP).addScaledVector(j.spine, 0.05).addScaledVector(j.fwd, 0.17);
        P.bibBack.position.copy(r.chestP).addScaledVector(j.spine, 0.05).addScaledVector(j.fwd, -0.16);
      }
    }
    P.helmet.position.copy(skull).addScaledVector(headUp, P.cuffB ? 0.008 : 0.016);
    P.goggles.position.copy(skull).addScaledVector(headUp, P.cuffB ? 0.03 : 0.014).addScaledVector(fw, 0.012);
    P.strap.position.copy(P.goggles.position);
    if (P.cuffB) P.cuffB.position.copy(skull).addScaledVector(headUp, 0.02);
    if (P.pom) P.pom.position.copy(skull).addScaledVector(headUp, 0.012);
    if (this.board) return;
    // poles: tip trails behind near the snow; planted tip is ahead
    const air = this.airS;
    for (const [s, hd, pole, grip, basket] of [[1, j.hdL, P.poleL, P.gripL, P.basketL], [-1, j.hdR, P.poleR, P.gripR, P.basketR]]) {
      const tip = tmpV.set(hd.x + s * 0.12, 0.06, hd.z - 0.62);
      tip.lerp(tmpV2.set(hd.x + s * 0.06, hd.y + 0.12, hd.z - 1.15), Math.max(tuck, air * 0.7));
      if (p.polePlant > 0 && s === p.poleSide) tip.lerp(tmpV2.set(hd.x + s * 0.18, 0.0, hd.z + 0.45), p.polePlant);
      const dir = tip.sub(hd).normalize();
      pole.position.copy(hd);
      pole.quaternion.setFromUnitVectors(Y, dir.negate());
      grip.position.copy(hd); grip.quaternion.copy(pole.quaternion);
      basket.position.copy(hd); basket.quaternion.copy(pole.quaternion);
    }
  }
}
