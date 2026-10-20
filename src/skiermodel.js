// Procedural skier: capsule limbs posed every frame with two-bone IK.
// Local frame: +Z = ski tips, +Y = up, +X = skier's left.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { avatarKits, AvatarRig } from './avatar.js';
import { ITEMS } from './meta.js';
import { helmetGeometry, helmetMaterial, beanieGeometry, goggleGeometry, lensGeometry, strapGeometry, skiBootGeometry, boardBootGeometry,
  skiGeometry, boardGeometry, skiBindingGeometry, boardBindingGeometry, poleGeometry, gearMaterials } from './gear.js';

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
    goggles: goggleGeometry(),
    lens: lensGeometry(),
    hand: new THREE.SphereGeometry(0.055, 10, 8).scale(1, 1.1, 1.25),
    boot: skiBootGeometry(),
    bboot: boardBootGeometry(),
    cuff: new THREE.CylinderGeometry(0.066, 0.06, 0.2, 10).translate(0, 0.17, -0.02),
    pole: poleGeometry(POLE),
    ski: skiGeometry(),
    skiBind: skiBindingGeometry(),
    collar: new THREE.TorusGeometry(0.085, 0.035, 8, 14).rotateX(Math.PI / 2),
    bib: new THREE.PlaneGeometry(0.22, 0.2),
    board: boardGeometry(),
    binding: boardBindingGeometry(),
  };
  return G;
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

// a rider for the mountain, dressed from the shop's catalogue
const DESIGNS = ['logo', 'stripe', 'tip', 'chevron', 'flames', 'checker', 'wood', 'tiger', 'galaxy', 'bolt', 'peaks', 'fade', 'camo', 'stars', 'dots', 'split', 'pixel'];
export function randomOutfit(rnd, racer = false) {
  const of = (cat) => { const l = ITEMS.filter((it) => it.cat === cat && it.r !== 'event'); return l[Math.floor(rnd() * l.length)]; };
  const j = of('jacket'), p = of('pants'), h = of('head'), g = of('goggles'), sk = of('skis'), dk = of('deck'), gl = of('gloves');
  const jacket = racer ? pick(PALETTE.jackets, rnd) : j.c;
  const o = {
    jacket, jacket2: racer ? jacket : j.c2 ?? j.c, jpat: racer ? 0 : j.pat,
    pants: racer ? jacket : p.c, pants2: racer ? jacket : p.c2 ?? p.c, ppat: racer ? 0 : p.pat,
    helmet: racer ? pick([0xf4f4f4, 0x15161a, jacket], rnd) : h.helmet ? h.c : pick(PALETTE.helmets, rnd),
    helmet2: !racer && h.helmet ? h.c2 : null, helmetFin: !racer && h.helmet ? h.fin ?? 0 : 0,
    goggles: g.c, goggles2: g.c2 ?? 0x16171c,
    skis: sk.c, skis2: sk.c2 ?? 0xffffff, skiDesign: racer ? pick(['logo', 'stripe', 'tip'], rnd) : sk.design ?? pick(DESIGNS, rnd),
    boots: pick([0x15161a, 0xf0f0f0, 0x2a2d35, 0xd8342c, 0x1f4fd1], rnd),
    gloves: gl.c, gloves2: gl.c2 ?? gl.c,
    poles: pick([0x9ea5b0, 0x15161a, 0xd8342c, 0xd9a520], rnd),
    skin: pick(PALETTE.skin, rnd),
    avatar: rnd(),
    racer,
    beanie: !racer && h.beanie ? h.c : 0,
    pom: !!h.pom,
    board: false,
    deck: dk.c, deck2: dk.c2 ?? 0x15161a, deckDesign: dk.design ?? pick(DESIGNS, rnd),
  };
  return o;
}

const Y = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

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

// Ski grabs: the hand takes hold of the ski itself. hand / ski: which; along: where on the ski
// (m ahead of the boot, - behind); edge: +1 its outside edge, -1 the inside; lift: both knees up,
// knee: the grabbed one further; back: the feet tucked under; cross: the tips crossed (+) or the
// tails (-); tip: tips down (+) / up (-); curl: the body folded over it; tw: what a tweak adds
// (poke: the free leg kicked straight). The ski is pulled up to the hand, not the hand down to it.
const SKI_GRAB = {
  mute: { hand: 'L', ski: 'R', along: 0.24, edge: 1, lift: 0.2, knee: 0.1, cross: 0.3, tip: 0.16, curl: 0.4, tw: { cross: 0.2, tip: 0.18, out: 0.08 } },
  safety: { hand: 'R', ski: 'R', along: 0.05, edge: 1, lift: 0.22, knee: 0.08, cross: 0, tip: 0.08, curl: 0.35, tw: { poke: 1, tip: -0.12 } },
  japan: { hand: 'L', ski: 'L', along: 0.14, edge: -1, lift: 0.24, knee: 0.16, back: 0.1, cross: 0.12, tip: 0.34, curl: 0.4, tw: { tip: 0.24, back: 0.1, cross: 0.1 } },
  tail: { hand: 'R', ski: 'R', along: -0.32, edge: 1, lift: 0.2, knee: 0.06, back: 0.06, cross: 0, tip: -0.22, curl: 0.2, tw: { tip: -0.2, poke: 0.5 } },
  critical: { hand: 'R', ski: 'L', along: -0.26, edge: -1, lift: 0.2, knee: 0.1, cross: -0.22, tip: -0.2, curl: 0.25, tw: { cross: -0.14, out: 0.06 } },
  nose: { hand: 'L', ski: 'L', along: 0.62, edge: 1, lift: 0.2, knee: 0.16, cross: 0, tip: -0.5, curl: 0.45, tw: { tip: -0.18, poke: 0.6 } },
};
// what a body not doing a trick does (the menu preview, the rescue): nothing
const NO_TRK = { lead: 0, look: 0, lookW: 0, tuck: 0, pop: 0, land: 0, wob: 0, rail: 0, bal: 0, tweak: 0, sr: 0, sa: 0, fr: 0 };
const _gp = new THREE.Vector3(), _sh = new THREE.Vector3(), _gd = new THREE.Vector3(), _ge = new THREE.Euler();
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

const packGeo = {};
// the pack: a rounded bag, narrower at the top, its outer face bellied out with what's in it
function packBodyGeometry() {
  const g = new RoundedBoxGeometry(0.3, 0.46, 0.15, 4, 0.06);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const nx = x / 0.15, ny = y / 0.23;
    x *= 1 - 0.13 * Math.max(0, ny);
    if (z < 0) z *= 1 + 0.55 * (1 - nx * nx) * (1 - 0.7 * ny * ny);
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}
// the lid over the top, draped down the outer face
function packLidGeometry() {
  const g = new RoundedBoxGeometry(0.27, 0.09, 0.2, 3, 0.04);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // (droops at the front, domed in the middle)
    p.setXYZ(i, x, y - Math.max(0, -z - 0.04) * 0.5 + 0.015 * (1 - (x / 0.135) ** 2), z);
  }
  g.computeVertexNormals();
  return g.translate(0, 0.215, -0.015);
}

export class SkierModel {
  constructor(outfit, bib = 0) {
    const g = geos();
    this.outfit = outfit;
    const M = (c, r = 0.7, m = 0, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...extra });
    this.board = !!outfit.board;
    const jacketM = M(outfit.jacket, outfit.racer ? 0.35 : 0.72);
    const pantsM = M(outfit.pants, outfit.racer ? 0.35 : 0.8);
    // helmets: gloss, matte or chrome, maybe a stripe; a beanie is soft knit
    const fin = outfit.helmetFin ?? 0;
    const helmetM = outfit.beanie ? M(outfit.beanie, 0.95, 0, { vertexColors: true }) : helmetMaterial(outfit.helmet, outfit.helmet2, fin);
    // the kit's materials (goggles, boots, skis or board, poles, bindings) come from gear.js
    const { frameM, lensM, strapM, bootM, skiM, poleM, bindM } = gearMaterials(outfit, this.board);
    const skinM = M(outfit.skin, 0.6);
    const gloveM = M(outfit.gloves, 0.75);
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
    const bootG = this.board ? g.bboot : g.boot;
    this.parts = {
      bootL: add(bootG, bootM), bootR: add(bootG, bootM),
      cuffL: add(g.cuff, bootM), cuffR: add(g.cuff, bootM),
      shinL: add(g.shin, pantsM), shinR: add(g.shin, pantsM),
      thighL: add(g.thigh, pantsM), thighR: add(g.thigh, pantsM),
      hips: add(g.hips, pantsM),
      torso: add(g.torso, jacketM),
      collar: add(g.collar, outfit.racer ? jacketM : darkM),
      face: add(g.face, skinM),
      helmet: add(outfit.beanie ? beanieGeometry(!!outfit.pom) : helmetGeometry(), helmetM),
      goggles: add(g.goggles, frameM, false),
      lens: add(g.lens, lensM, false),
      strap: add(strapGeometry(!!outfit.beanie), strapM, false),
      upperL: add(g.upper, jacketM), upperR: add(g.upper, jacketM),
      foreL: add(g.fore, jacketM), foreR: add(g.fore, jacketM),
      handL: add(g.hand, gloveM), handR: add(g.hand, gloveM),
    };
    const P = this.parts;
    // the right boot is the left one mirrored (buckles on the outside)
    P.bootR.scale.x = -1;
    for (const k of ['cuffL', 'cuffR']) P[k].scale.setScalar(0.001);
    if (this.board) {
      P.deck = add(g.board, skiM);
      P.bindL = add(g.binding, bindM); P.bindR = add(g.binding, bindM);
    } else {
      Object.assign(P, {
        skiL: add(g.ski, skiM), skiR: add(g.ski, skiM),
        sbindL: add(g.skiBind, bindM), sbindR: add(g.skiBind, bindM),
        poleL: add(g.pole, poleM), poleR: add(g.pole, poleM),
      });
    }
    // a freeride pack on the back (not on a race suit), and the jacket's hood bunched behind the neck
    if (!outfit.racer) {
      const packM = M(outfit.pack ?? 0x2b2f36, 0.82);
      const pack = new THREE.Group();
      // (pack frame: +z against the back, -z the outer face, +y up)
      const body = new THREE.Mesh(packGeo.body ??= packBodyGeometry(), packM);
      const lid = new THREE.Mesh(packGeo.lid ??= packLidGeometry(), M(outfit.jacket2 ?? 0x3a3f46, 0.7));
      const pocket = new THREE.Mesh(packGeo.pocket ??= new RoundedBoxGeometry(0.17, 0.13, 0.04, 3, 0.017).translate(0, -0.11, -0.112).rotateX(0.12), M(0x3d424b, 0.8));
      const strapM = M(0x16181c, 0.9);
      for (const sx of [-0.085, 0.085]) {
        const st = new THREE.Mesh(packGeo.strap ??= new RoundedBoxGeometry(0.05, 0.36, 0.022, 2, 0.008).translate(0, 0.04, 0.1).rotateX(-0.22), strapM);
        st.position.x = sx; pack.add(st);
      }
      // compression straps round the outer face, with their buckles
      for (const y of [0.075, -0.035]) {
        const cs = new THREE.Mesh(packGeo.cstrap ??= new THREE.TorusGeometry(0.2, 0.006, 4, 20, 1.5).rotateX(Math.PI / 2).rotateY(Math.PI / 2 + 0.75).scale(1, 1, 0.59), strapM);
        cs.position.y = y; pack.add(cs);
        const bk = new THREE.Mesh(packGeo.buckle ??= new THREE.BoxGeometry(0.03, 0.018, 0.01).translate(0.05, 0, -0.118), M(0x111214, 0.5));
        bk.position.y = y; pack.add(bk);
      }
      const handle = new THREE.Mesh(packGeo.handle ??= new THREE.CylinderGeometry(0.011, 0.011, 0.24, 8).translate(-0.075, 0.02, -0.128), M(0x2e3238, 0.45, 0.5));
      const grip = new THREE.Mesh(packGeo.grip ??= new THREE.CylinderGeometry(0.008, 0.008, 0.07, 6).rotateZ(Math.PI / 2).translate(-0.075, 0.15, -0.128), M(0x16181c, 0.6));
      pack.add(body, lid, pocket, handle, grip);
      for (const m of pack.children) m.castShadow = true;
      this.frame.add(pack);
      P.pack = pack;
      const hood = new THREE.Mesh(packGeo.hood ??= new THREE.TorusGeometry(0.1, 0.04, 8, 16, Math.PI).rotateX(-Math.PI / 2).scale(1, 1, 0.8), jacketM);
      hood.castShadow = true;
      this.frame.add(hood);
      P.hood = hood;
    }
    if (bib) {
      const bm = new THREE.MeshStandardMaterial({ map: bibTexture(bib, outfit.jacket), roughness: 0.8, side: THREE.DoubleSide });
      P.bib = add(g.bib, bm, false);
      P.bibBack = add(g.bib, bm, false);
    }
    this.headGear = ['helmet', 'goggles', 'lens', 'strap'].filter((k) => P[k]);
    this.small = ['goggles', 'lens', 'strap', 'collar', 'bindL', 'bindR', 'sbindL', 'sbindR'].filter((k) => P[k]);
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
      // the player's rider is one of the lads, picked by index; everyone else is random
      const lads = avatarKits.filter((k) => !/Female/.test(k.name));
      const kit = outfit.male ? lads[(outfit.avatar | 0) % lads.length] : avatarKits[Math.floor((outfit.avatar ?? Math.random()) * avatarKits.length) % avatarKits.length];
      this.rig = new AvatarRig(kit, outfit);
      this.frame.add(this.rig.root);
      this.body = ['shinL', 'shinR', 'thighL', 'thighR', 'hips', 'torso', 'collar', 'face', 'upperL', 'upperR', 'foreL', 'foreR', 'handL', 'handR'].map((k) => P[k]);
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
    for (const k of this.small) if (!(this.gearOff && /sbind/.test(k)) && !(this.real && this.body?.includes(this.parts[k])) && !(this.headHidden && this.headGear.includes(k)) && !this.cut?.has(k)) this.parts[k].visible = near;
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
      // (but a hand holding a ski stays on the ski)
      f.hand[s].y += (f.pelvis.y - j.pelvis.y) * (s === this.gHand ? 1 - this.gAmt : 1);
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
    // the trick's body mechanics, from the skier (Skier.trickPose); still for anyone else
    this.k = this.trk ?? NO_TRK;
    // the upper body has weight: it lags into a new turn and swings past, rocks back when the
    // skis speed up under it and forward when they're checked, and the arms follow it
    const sw = (this.swing ??= { r: p.lean, vr: 0, f: 0, vf: 0 });
    if (dt > 0) {
      const h = Math.min(dt, 1 / 30);
      sw.vr += (70 * (p.lean - sw.r) - 9 * sw.vr) * h; sw.r += sw.vr * h;
      sw.vf += (55 * ((p.fore || 0) - sw.f) - 8 * sw.vf) * h; sw.f += sw.vf * h;
    }
    this.lagR = clamp(sw.r - p.lean, -0.3, 0.3);
    this.lagF = clamp(sw.f, -1, 1);
    // on the snow: the skid, the legs' give, standing still and the pole plants fold in here
    p = this.ground(p, dt);
    this.tilt.rotation.set(0, 0, p.lean);
    if (this.board) {
      // riding switch: the other foot leads, the body faces the other edge
      const sw = !!p.switch;
      if (sw !== this.sw) { this.sw = sw; this.frame.rotation.y = sw ? Math.PI / 2 : -Math.PI / 2; }
      this.lowerBoard(sw ? { ...p, lean: -p.lean, edge: -(p.edge || 0) } : p);
    } else this.lowerSki(p);
    this.upper(p);
    if (this.rig && this.real) this.rig.mesh.material.userData.u.uFlap.value.set(p.t % 600, p.wind || 0);
  }

  lowerSki(p) {
    const j = this.j, P = this.parts;
    const crouch = p.crouch, tuck = p.tuck, air = this.airS;
    const al = Math.abs(p.lean) * (1 - air);
    const stance = 0.105 + p.plow * 0.16 + sstep(0.2, 0.8, al) * 0.02;
    j.ankL.set(stance, 0.17, 0);
    j.ankR.set(-stance, 0.17, 0);
    // long leg, short leg: tipped over, both skis stay on the snow, so the inside leg folds up
    // (by the stance width times the tilt) and its ski leads a little
    const inside = p.lean > 0 ? j.ankR : j.ankL;
    inside.y += 2 * stance * Math.tan(Math.min(al, 0.95)) * 0.85;
    inside.z += 0.075 * sstep(0.1, 0.7, al);
    // in the air the knees draw up (right up to the chest through a flip); at the pop the legs
    // snap straight first
    const K = this.k, pop = K.pop * air, tk = K.tuck * air;
    if (air > 0) {
      const up = air * 0.12 * (1 - K.pop) + tk * 0.22;
      j.ankL.y += up; j.ankR.y += up; j.ankL.z += tk * 0.08; j.ankR.z += tk * 0.08;
    }
    const G = SKI_GRAB[this.gKind] ?? SKI_GRAB.mute, Tw = G.tw;
    const g = this.gAmt, tw = K.tweak * g;
    const gs = G.ski === 'L' ? j.ankL : j.ankR, go = G.ski === 'L' ? j.ankR : j.ankL;
    j.ankL.y += G.lift * g; j.ankR.y += G.lift * g; gs.y += G.knee * g;
    const gBack = (G.back ?? 0) * g + (Tw.back ?? 0) * tw;
    j.ankL.z -= gBack; j.ankR.z -= gBack;
    // tweaked out: the skis pushed apart, or the free leg poked straight
    if (Tw.out) { j.ankL.x += Tw.out * tw; j.ankR.x -= Tw.out * tw; }
    if (Tw.poke) { go.y -= Tw.poke * tw * (G.lift + 0.12); go.z += Tw.poke * tw * 0.14; }
    // daffy: one ski kicked forward, the other back
    const daffy = p.daffy || 0;
    j.ankL.z += daffy * 0.42; j.ankR.z -= daffy * 0.42; j.ankL.y += daffy * 0.08;
    const cross = G.cross * g + (Tw.cross ?? 0) * tw + (p.cross || 0) * 0.3;
    const tipPitch = G.tip * g + (Tw.tip ?? 0) * tw;
    // skating stride: push one ski out and back while the other glides
    const skate = p.skate || 0;
    const pushL = skate * Math.max(0, Math.sin(p.skatePhase || 0)), pushR = skate * Math.max(0, -Math.sin(p.skatePhase || 0));
    j.ankL.x += pushL * 0.26; j.ankL.z -= pushL * 0.12; j.ankL.y += pushR * 0.07;
    j.ankR.x -= pushR * 0.26; j.ankR.z -= pushR * 0.12; j.ankR.y += pushL * 0.07;

    if (p.crash) {
      const r = p.rag ?? 0.5, t = p.ragT ?? p.t, s = p.ragSeed ?? 0;
      j.ankL.x += 0.1 + 0.16 * r * Math.sin(t * 5.7 + s); j.ankR.x -= 0.12 + 0.16 * r * Math.sin(t * 6.3 + 2 + s);
      j.ankL.y += 0.12 + 0.3 * r * Math.max(0, Math.sin(t * 4.1 + s)); j.ankR.y += 0.05 + 0.3 * r * Math.max(0, Math.sin(t * 4.9 + 1 + s));
      j.ankL.z += 0.32 * r * Math.sin(t * 3.7 + s) + 0.12 * (1 - r); j.ankR.z += 0.32 * r * Math.sin(t * 4.3 + 2 + s) - 0.18 * (1 - r);
    }
    // (the hips sit over the outside foot, forward over the boots, not back in the seat)
    const hipH = 0.93 - crouch * 0.22 - tuck * 0.33 - air * 0.12 - g * 0.08 + Math.sin(p.t * 9) * 0.004 + al * 0.085;
    const hipZ = -0.035 - crouch * 0.05 - tuck * 0.12 - (this.lagF || 0) * 0.05;
    j.pelvis.set(-p.lean * 0.1 - (pushL - pushR) * 0.09, hipH, hipZ);
    if (this.gm) j.pelvis.x += this.gm.sway;
    // upper body: forward pitch and counter-roll (angulation), plus its swing
    const pitch = 0.22 + crouch * 0.28 + tuck * 0.95 + air * 0.15 + g * 0.25 + (this.lagF || 0) * 0.14;
    // (in the tipped frame: back toward upright, so the shoulders stay level-ish over the edges)
    const ang = p.lean * p.angulate - (this.lagR || 0) * 0.8;
    j.spine.set(Math.sin(ang) * Math.cos(pitch), Math.cos(ang) * Math.cos(pitch), Math.sin(pitch)).normalize();
    this.trickBody(G, g, tk, pop, ang, pitch);
    // shifty: the hips turn the skis across while the shoulders stay
    const shifty = (p.shifty || 0) * 0.9;
    // (in the air the shoulders lead the spin and the hips follow; on a rail the chest faces down it)
    const twist = (p.twist || 0) * (1 - air) * (1 - K.rail) + K.lead - shifty;
    this.frameUpper(twist);
    j.hipL.copy(j.pelvis).addScaledVector(this.hipSide, 0.095);
    j.hipR.copy(j.pelvis).addScaledVector(this.hipSide, -0.095);
    for (const [s, sg] of [[0, 1], [1, -1]]) this.kp[s].set(-p.lean * 0.9 + sg * (0.1 + p.plow * 0.4), 0.15, 1);
    if (g > 0.01) this.grabReach(G, gs, go, g, air * -0.12 + tipPitch, cross, shifty);
    this.legs();

    // skis, boots
    const plowYaw = p.plow * 0.32;
    // skis roll further onto edge than the body leans when edging at low speed
    const extraEdge = clamp((p.edge || 0) * 0.75 - p.lean, -0.45, 0.45) * (Math.abs(p.edge || 0) > Math.abs(p.lean) ? 1 : 0);
    for (const [s, ank, ski, boot, cuff, yaw, bind] of [[1, j.ankL, P.skiL, P.bootL, P.cuffL, -plowYaw + skate * 0.36 - cross, P.sbindL], [-1, j.ankR, P.skiR, P.bootR, P.cuffR, plowYaw - skate * 0.36 + cross, P.sbindR]]) {
      ski.position.set(ank.x, ank.y - 0.17, ank.z);
      // the ski flexes: bent into its arc by the carve (the outside one more), the forebody
      // chattering at speed and slapping on a landing
      if (ski.morphTargetInfluences) {
        const outside = (s > 0) === (p.lean > 0);
        ski.morphTargetInfluences[0] = clamp((p.flex || 0) * (outside ? 1 : 0.6) - air * 0.3, -0.25, 1);
        ski.morphTargetInfluences[1] = (p.chatter || 0) * Math.sin(p.t * 71 + s * 1.7) * 0.5 + (p.slap || 0) * Math.sin(p.t * 38);
      }
      ski.rotation.set(air * -0.12 + tipPitch - (s > 0 ? daffy : -daffy) * 0.35, yaw - shifty, extraEdge);
      boot.position.set(ank.x, ank.y - 0.17, ank.z);
      boot.rotation.copy(ski.rotation);
      bind.position.copy(ski.position); bind.rotation.copy(ski.rotation);
      cuff.position.copy(boot.position);
      cuff.rotation.set(0.25 + crouch * 0.2 + tuck * 0.3, yaw - shifty, 0);
    }

    // hands: forward and wide in the ready position (the outside one a touch lower, level with
    // the slope), tuck pulls them in front of the face; they swing with the body
    const handY = hipH + 0.05 + crouch * 0.05;
    const lr = this.lagR || 0, lf = this.lagF || 0;
    j.hdL.set(0.33 + lr * 0.25, handY - p.lean * 0.06 + Math.abs(lr) * 0.1, hipZ + 0.42 - lf * 0.12).lerp(tmpV.set(0.11, hipH + 0.18, hipZ + 0.62), tuck);
    j.hdR.set(-0.33 + lr * 0.25, handY + p.lean * 0.06 + Math.abs(lr) * 0.1, hipZ + 0.42 - lf * 0.12).lerp(tmpV.set(-0.11, hipH + 0.18, hipZ + 0.62), tuck);
    if (air > 0) {
      // arms out for balance, pulled in tight while spinning, swung up as he pops
      const tight = clamp(Math.max(Math.abs(p.spinRate || 0), Math.abs(K.sr)) / 7, 0, 1);
      const out = 0.42 - tight * 0.24;
      const ay = hipH + 0.18 + tight * 0.1 + pop * 0.22, az = hipZ + 0.2 + tight * 0.15 + pop * 0.12;
      j.hdL.lerp(tmpV.set(out, ay, az), air);
      j.hdR.lerp(tmpV.set(-out, ay, az), air);
      // through a flip the hands hug the shins
      if (tk > 0.01) {
        j.hdL.lerp(tmpV.set(0.15, hipH - 0.04, hipZ + 0.4), tk * 0.8);
        j.hdR.lerp(tmpV.set(-0.15, hipH - 0.04, hipZ + 0.4), tk * 0.8);
      }
    }
    // sliding a rail: arms out wide, see-sawing to keep balance
    if (K.rail > 0.01) {
      const b = clamp(K.bal, -1, 1);
      j.hdL.lerp(tmpV.set(0.52, hipH + 0.24 + b * 0.16, hipZ + 0.2), K.rail * 0.85);
      j.hdR.lerp(tmpV.set(-0.52, hipH + 0.24 - b * 0.16, hipZ + 0.2), K.rail * 0.85);
    }
    // touchdown: hands come forward and down over the knees as the legs soak it up
    if (K.land > 0.01) {
      const k = Math.min(1, K.land) * 0.6;
      j.hdL.lerp(tmpV.set(0.3, hipH + 0.02, hipZ + 0.5), k);
      j.hdR.lerp(tmpV.set(-0.3, hipH + 0.02, hipZ + 0.5), k);
    }
    // grabbing: the free arm out and up for balance
    if (g > 0.01) (G.hand === 'L' ? j.hdR : j.hdL).lerp(tmpV.set(G.hand === 'L' ? -0.52 : 0.52, hipH + 0.36, hipZ + 0.05), g);
    if (this.twistNow) for (const h of [j.hdL, j.hdR]) h.sub(j.pelvis).applyQuaternion(tmpQ.setFromAxisAngle(Y, this.twistNow)).add(j.pelvis);
    // on the snow: hands forward where he can see them, and the pole plant
    this.groundArms(p);
    // and the other hand on the ski itself, wherever the ski's turned (the palm reaches past the wrist)
    this.gHand = -1;
    if (g > 0.01) {
      const ski = G.ski === 'L' ? P.skiL : P.skiR;
      this.grabPoint(G, ski.position, ski.rotation, _gp);
      (this.gPt ??= new THREE.Vector3()).copy(_gp);
      this.shoulder(G, _sh);
      _gp.addScaledVector(_gd.subVectors(_sh, _gp).normalize(), this.rig && this.real ? 0.075 : 0.04);
      (G.hand === 'L' ? j.hdL : j.hdR).lerp(_gp, g);
      this.gHand = G.hand === 'L' ? 0 : 1;
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
    // (in the air the shoulders lead the spin instead)
    const K = this.k;
    this.frameUpper(0.32 + (p.twist || 0) * 0.5 * (1 - air) * (1 - K.rail) + K.lead * 0.6 + shifty);
    j.hipL.copy(j.pelvis).addScaledVector(this.hipSide, 0.095);
    j.hipR.copy(j.pelvis).addScaledVector(this.hipSide, -0.095);
    this.kp[0].set(0.12, 0.1, 1); this.kp[1].set(0.05, 0.1, 1);
    this.legs();

    // the deck follows the feet: along the ankles, rolled onto its edge
    const dir = tmpV.subVectors(j.ankL, j.ankR).normalize();
    const extraEdge = clamp((p.edge || 0) * 0.75 - p.lean, -0.45, 0.45) * (Math.abs(p.edge || 0) > Math.abs(p.lean) ? 1 : 0);
    this.boardQ.setFromUnitVectors(tmpV2.set(1, 0, 0), dir).multiply(tmpQ.setFromAxisAngle(tmpV2.set(1, 0, 0), extraEdge + (G.roll ?? 0) * g));
    if (shifty) this.boardQ.premultiply(tmpQ.setFromAxisAngle(Y, -shifty));
    const up = (this._up ??= new THREE.Vector3()).set(0, 1, 0).applyQuaternion(this.boardQ);
    P.deck.position.addVectors(j.ankL, j.ankR).multiplyScalar(0.5).addScaledVector(up, -0.17);
    P.deck.quaternion.copy(this.boardQ);
    for (const [ank, boot, cuff, bind, duck] of [[j.ankL, P.bootL, P.cuffL, P.bindL, 0.26], [j.ankR, P.bootR, P.cuffR, P.bindR, -0.26]]) {
      const q = tmpQ.copy(this.boardQ).multiply(new THREE.Quaternion().setFromAxisAngle(Y, duck));
      bind.position.copy(ank).addScaledVector(up, -0.165);
      bind.quaternion.copy(q);
      boot.position.copy(ank).addScaledVector(up, -0.165);
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
    this.boardArms(p, hipH, hipZ, ts);
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
    this.gHand = g > 0.01 ? (G.hand === 'L' ? 0 : 1) : -1;
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

  // the trick's body on top of the riding stance: the hips up as the legs snap straight at the
  // pop, the body folded over a grab or into a flip's tuck, dipped and folded over the knees at
  // touchdown, rocking side to side after a sketchy one
  trickBody(G, g, tk, pop, ang, pitch) {
    const j = this.j, K = this.k;
    j.pelvis.y += pop * 0.08 - tk * 0.04 - K.land * 0.12;
    j.pelvis.x += K.wob * 0.05;
    const dp = G.curl * g + tk * 0.35 + K.land * 0.3 - pop * 0.12, da = K.wob * 0.22;
    if (Math.abs(dp) < 1e-4 && Math.abs(da) < 1e-4) return;
    const pt = pitch + dp, an = ang + da;
    j.spine.set(Math.sin(an) * Math.cos(pt), Math.cos(an) * Math.cos(pt), Math.sin(pt)).normalize();
  }

  // a point on a ski: its origin (the sole under the boot) and rotation
  grabPoint(G, pos, rot, out) {
    return out.set(G.edge * (G.ski === 'L' ? 1 : -1) * 0.05, 0.012, G.along).applyEuler(rot).add(pos);
  }

  // where the grabbing arm's shoulder is (the real body's sits where its own legs put it)
  shoulder(G, out) {
    const j = this.j;
    out.copy(j.pelvis).addScaledVector(j.spine, 0.46).addScaledVector(j.side, G.hand === 'L' ? 0.19 : -0.19);
    if (this.rig && this.real) {
      const kit = this.rig.kit, legK = (kit.leg[0] + kit.leg[1]) / (THIGH + SHIN);
      out.y += -0.03 + (j.pelvis.y - (j.ankL.y + j.ankR.y) / 2) * (legK - 1);
    }
    return out;
  }

  // a grab: the ski comes up to the hand. Out of the arm's reach, the knee is pulled further up
  // toward the chest (and the other ski comes with it) until the hand gets there, as far as the
  // leg folds
  grabReach(G, gs, go, g, rx, cross, shifty) {
    const j = this.j, hp = G.ski === 'L' ? j.hipL : j.hipR;
    _ge.set(rx, (G.ski === 'L' ? -cross : cross) - shifty, 0);
    this.shoulder(G, _sh);
    const reach = (this.rig && this.real ? this.rig.kit.arm[0] + this.rig.kit.arm[1] + 0.06 : UPPER + FORE + 0.03) * 0.93;
    for (let it = 0; it < 4; it++) {
      this.grabPoint(G, tmpV2.set(gs.x, gs.y - 0.17, gs.z), _ge, _gp);
      const d = _gp.distanceTo(_sh) - reach;
      if (d < 0.005) break;
      _gd.subVectors(_sh, _gp).normalize().multiplyScalar(d * g);
      _gd.x *= 0.5; // (up and in toward the chest, not out sideways)
      gs.add(_gd); go.addScaledVector(_gd, 0.6);
      gs.y = Math.min(gs.y, j.pelvis.y + 0.02);
      const hd = gs.distanceTo(hp);
      if (hd < 0.27) gs.sub(hp).multiplyScalar(0.27 / Math.max(hd, 1e-3)).add(hp);
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
      // a body out of control: arms thrown about by the tumble, then flung out on the snow
      const r = p.rag ?? 0.5, t = p.ragT ?? p.t, s = p.ragSeed ?? 0;
      j.hdL.set(0.5 + 0.18 * r * Math.sin(t * 7.1 + s), hipH + 0.3 + 0.42 * r * Math.sin(t * 5.3 + 1 + s), hipZ + 0.1 + 0.4 * r * Math.sin(t * 6.2 + s * 2));
      j.hdR.set(-0.5 - 0.18 * r * Math.sin(t * 6.4 + 2 + s), hipH + 0.4 + 0.42 * r * Math.sin(t * 4.7 + 3 + s), hipZ - 0.1 + 0.4 * r * Math.sin(t * 5.6 + 1 + s));
      // sprawled once it stops: one arm up past the head, the other out
      const lie = 1 - r;
      j.hdL.lerp(tmpV.set(0.42, hipH + 0.75, hipZ + 0.2), lie * 0.6);
      j.hdR.lerp(tmpV.set(-0.62, hipH + 0.18, hipZ - 0.05), lie * 0.6);
      this.ep[0].set(0.9, 0.2, -0.3).normalize(); this.ep[1].set(-0.9, -0.3, -0.2).normalize();
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
    const headUp = (this._headUp ??= new THREE.Vector3()).copy(j.spine).lerp(this.upW ?? Y, 0.55 + tuck * 0.2).normalize();
    j.head.copy(j.neck).addScaledVector(headUp, 0.12);
    // (spinning, it leads into the turn and then spots the landing: Skier.trickPose)
    const lw = this.k?.lookW ?? 0;
    const yaw = this.board ? 1.15 + (p.look || 0) : (this.twistNow * 1.15 + (p.look || 0)) * (1 - lw) + (this.k?.look ?? 0) * lw;
    const hq = (this._hq ??= new THREE.Quaternion()).setFromUnitVectors(Y, headUp).multiply(tmpQ.setFromAxisAngle(Y, clamp(yaw, -1.95, 1.95)));
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
    let skull = j.head;
    if (this.rig && this.real) {
      const r = this.rig;
      skull = r.skull;
      j.hdL.copy(r.palm[0]); j.hdR.copy(r.palm[1]);
      // (how far the grabbing hand is from the ski: the tools check it)
      this.gMiss = this.gHand >= 0 && this.gPt && !this.board ? r.palm[this.gHand].distanceTo(this.gPt) : 0;
      if (P.bib) {
        P.bib.position.copy(r.chestP).addScaledVector(j.spine, 0.05).addScaledVector(j.fwd, 0.17);
        P.bibBack.position.copy(r.chestP).addScaledVector(j.spine, 0.05).addScaledVector(j.fwd, -0.16);
      }
    } else skull = tmpV2.copy(j.head).addScaledVector(headUp, -0.02);
    // the pack rides on the back of the chest, the hood on the back of the neck
    if (P.pack) {
      const chest = this.rig && this.real ? this.rig.chestP : j.chest, neck = this.rig && this.real ? this.rig.neckP : j.neck;
      const bq = (this._bq ??= new THREE.Quaternion()).setFromRotationMatrix((this._bm ??= new THREE.Matrix4()).makeBasis(j.side, j.spine, j.fwd));
      P.pack.position.copy(chest).addScaledVector(j.spine, -0.07).addScaledVector(j.fwd, -0.2);
      P.pack.quaternion.copy(bq);
      P.hood.position.copy(neck).addScaledVector(j.fwd, -0.06).addScaledVector(j.spine, -0.01);
      P.hood.quaternion.copy(bq);
    }
    // (all the head gear is built round the skull point, in the head's frame)
    for (const k of this.headGear) P[k].position.copy(skull);
    if (this.board) return;
    // poles: tip trails behind near the snow; planted tip is ahead
    const air = this.airS;
    for (const [s, hd, pole] of [[1, j.hdL, P.poleL], [-1, j.hdR, P.poleR]]) {
      const tip = tmpV.set(hd.x + s * 0.12, 0.06, hd.z - 0.62);
      tip.lerp(tmpV2.set(hd.x + s * 0.06, hd.y + 0.12, hd.z - 1.15), Math.max(tuck, air * 0.7));
      const dir = tip.sub(hd).normalize();
      this.groundPole(s, hd, dir, p);
      pole.position.copy(hd);
      pole.quaternion.setFromUnitVectors(Y, dir.negate());
    }
  }

  // ---------------- on the snow ----------------
  // What the body is doing over the snow, read off the group's own motion (so every caller gets
  // it): its speed, the line it's travelling against the way the skis point (a skid), the snow
  // rising and falling under the boots, standing still; and when to plant a pole. Returns the
  // pose params with all that folded in (a reused copy: the caller's object is left alone).
  ground(p, dt) {
    const G = (this.gm ??= {
      last: new THREE.Vector3(), v: new THREE.Vector3(), vl: new THREE.Vector3(), has: false,
      vy: 0, susp: 0, onT: 0, sp: 0, slip: 0, skid: 0, skidL: 0, stop: 1, lean: 0, dLean: 0, peak: 0, peakS: 0, trans: 0,
      pl: 0, plT: 0, plS: 1, plCool: 0, anchor: new THREE.Vector3(), from: new THREE.Vector3(),
      seed: Math.random() * 100, q: {}, sway: 0, look: 0, dt: 0,
    });
    G.dt = dt;
    const snow = !p.crash && this.airS < 0.05 && this.gAmt < 0.05;
    const pos = this.group.position;
    if (dt > 0) {
      const d = tmpV.subVectors(pos, G.last);
      if (!G.has || d.lengthSq() > 16) { G.v.set(0, 0, 0); G.vy = 0; G.susp = 0; G.has = true; }
      else {
        d.multiplyScalar(1 / dt);
        const vy = d.y;
        G.v.lerp(d, Math.min(1, dt * 10));
        // the legs soak up the snow: the hips ride a smoothed line while the boots follow every
        // bump and dip (they fold over a roll, reach down into a hollow)
        if (snow && (G.onT += dt) > 0.3) {
          G.vy += (vy - G.vy) * Math.min(1, dt * 8);
          G.susp += (G.vy - vy) * dt;
        } else { if (!snow) G.onT = 0; G.vy = vy; }
        G.susp = clamp(G.susp * (1 - Math.min(1, dt * 5)), -0.1, 0.04);
      }
      G.last.copy(pos);
    }
    // the travel in the skis' own frame: +z along them, +x to his left
    const vl = G.vl.copy(G.v).applyQuaternion(tmpQ.copy(this.group.quaternion).invert());
    const sp = Math.hypot(vl.x, vl.z);
    let slip = sp > 0.8 ? Math.atan2(vl.x, vl.z) : 0;
    // (riding backwards is still a straight run)
    if (slip > Math.PI / 2) slip -= Math.PI; else if (slip < -Math.PI / 2) slip += Math.PI;
    G.sp = sp;
    const k6 = Math.min(1, dt * 6);
    G.skid += ((snow ? sstep(0.3, 0.85, Math.abs(slip)) * sstep(1.5, 4, sp) : 0) - G.skid) * k6;
    G.slip += (slip - G.slip) * k6;
    G.skidL += ((snow ? Math.sign(vl.x) * sstep(0.3, 0.85, Math.abs(slip)) * sstep(1.5, 5, sp) : 0) - G.skidL) * k6;
    G.stop += ((snow ? 1 - sstep(0.6, 2.5, sp) : 0) - G.stop) * Math.min(1, dt * 2.5);
    // how fast the body is rolling from one edge to the other
    const dL = dt > 0 ? (p.lean - G.lean) / dt : 0;
    G.lean = p.lean;
    G.dLean += (clamp(dL, -8, 8) - G.dLean) * Math.min(1, dt * 12);
    // cross-under: the legs fold as the skis come back under the body between two turns
    G.trans += ((snow ? clamp(Math.abs(G.dLean) / 2.5, 0, 1) * (1 - sstep(0.12, 0.45, Math.abs(p.lean))) : 0) - G.trans) * Math.min(1, dt * 10);

    // the pole plant: as the edges let go at the end of a turn, the outside hand (the downhill
    // one, the inside of the turn to come) swings its pole forward; the tip touches the snow as the
    // body crosses over the skis, he rides past it, and it comes away
    if (Math.abs(p.lean) > 0.1 && Math.sign(p.lean) !== G.peakS) { G.peakS = Math.sign(p.lean); G.peak = 0; }
    G.peak = Math.max(G.peak, Math.abs(p.lean));
    G.plCool -= dt;
    const can = snow && !this.board && !this.gearOff && sp > 3.5 && p.tuck < 0.3 && !p.skate && G.stop < 0.3 && G.skid < 0.4 && !p.flail;
    if (!can) { if (G.pl === 1 || G.pl === 2) { G.pl = 3; G.plT = 0; G.from.set(G.plS * 0.3, -0.75, -0.6).normalize(); } }
    else if (G.pl === 0 && G.plCool <= 0 && G.peak > 0.28 && Math.abs(p.lean) > 0.05) {
      const edge = p.edge || 0;
      const roll = Math.sign(edge) === -Math.sign(p.lean) && Math.abs(edge) > 0.05;
      const ease = G.dLean * Math.sign(p.lean) < -1.4 && Math.abs(p.lean) < G.peak * 0.75;
      if (roll || ease) { G.pl = 1; G.plT = 0; G.plS = Math.sign(p.lean); G.plCool = 0.55; }
    }
    if (G.pl) {
      G.plT += dt;
      if (G.pl === 3 && G.plT > 0.28) G.pl = 0;
    }

    const q = Object.assign(G.q, p);
    // a skid (a hockey stop): the skis go across under him, he leans back up the hill against
    // them, hips and knees into the slope, and the upper body stays square to the line he's
    // sliding down
    q.lean = clamp(p.lean + G.skidL * (this.board ? 0.3 : 0.6), -0.9, 0.9);
    q.angulate = (p.angulate ?? 0.7) * (1 - 0.3 * G.skid);
    if (!this.board) q.twist = (p.twist || 0) + G.skid * clamp(G.slip, -1.1, 1.1) * 0.62;
    else if (snow) q.twist = (p.twist || 0) - clamp(p.lean / 0.6, -1, 1) * 0.2 - (this.lagR || 0) * 0.6;
    // standing still: upright and easy, breathing, weight drifting from foot to foot, looking about
    const t = p.t, sd = G.seed, st = G.stop;
    const breath = Math.sin(t * 1.9 + sd);
    G.sway = st * (0.022 * Math.sin(t * 0.55 + sd) + 0.01 * Math.sin(t * 1.3 + sd * 2));
    q.crouch = clamp(p.crouch - G.susp * 4.2 + G.trans * 0.22 + G.skid * 0.12 - st * 0.06 + breath * (0.012 + st * 0.02), 0, 1.15);
    // the head: looking about when stopped, toward the next turn as the pole goes in
    const lookT = st * (0.4 * Math.sin(t * 0.37 + sd) + 0.22 * Math.sin(t * 0.83 + sd * 3)) + (G.pl === 1 || G.pl === 2 ? G.plS * 0.2 : 0);
    G.look += (lookT - G.look) * Math.min(1, dt * 4);
    q.look = (p.look || 0) + G.look;
    // the head stays level with the horizon while the body tips over (in the body's frame:
    // the world's up, leaned back the other way)
    const ul = q.lean * 0.8 * (1 - this.airS);
    const up = (this.upW ??= new THREE.Vector3());
    if (!this.board) up.set(Math.sin(ul), Math.cos(ul), 0);
    else up.set(0, Math.cos(ul), (this.sw ? 1 : -1) * Math.sin(ul));
    return q;
  }

  // the snow's height at x in the tipped body frame (it tips the other way)
  snowAt(x, lean) { return -x * Math.tan(clamp(lean, -0.9, 0.9)); }

  // a pole's direction: (x, z) over the ground in the upper body's turned frame, falling by vy
  poleDir(out, x, z, vy) {
    const t = this.twistNow || 0, c = Math.cos(t), sn = Math.sin(t);
    const r = Math.sqrt(1 - vy * vy) / (Math.hypot(x, z) || 1);
    return out.set((x * c + z * sn) * r, -vy, (z * c - x * sn) * r);
  }

  // the hands: forward and wide in front of the body, where he can see them, held in the upper
  // body's own frame so they turn with it (the inside one leads); the pole hand's plant
  groundArms(p) {
    const j = this.j, G = this.gm;
    if (!G) return;
    const w = (1 - this.airS) * (1 - this.gAmt) * (p.crash ? 0 : 1) * (1 - clamp(p.flail || 0, 0, 1));
    if (w < 0.001) return;
    const al = Math.abs(p.lean), lr = this.lagR || 0, lf = this.lagF || 0, st = G.stop, sk = G.skid;
    const inS = p.lean > 0 ? -1 : 1;
    const ch = (this._gch ??= new THREE.Vector3()).copy(j.pelvis).addScaledVector(j.spine, 0.44);
    const T = (this._gt ??= new THREE.Vector3());
    for (const [s, h] of [[1, j.hdL], [-1, j.hdR]]) {
      // (the inside hand leads, forward and up over the inside knee; the outside one stays level)
      const inside = s === inS ? al : 0, lead = s === inS ? al : -al * 0.4;
      T.copy(ch)
        .addScaledVector(j.side, s * (0.31 + st * 0.03 + sk * 0.07 + inside * 0.06))
        .addScaledVector(j.fwd, 0.42 + lead * 0.14 - st * 0.08)
        .addScaledVector(j.spine, -0.17 + inside * 0.12 - st * 0.05);
      // (they swing with the body's weight)
      T.x += lr * 0.2; T.y += Math.abs(lr) * 0.08; T.z -= lf * 0.1;
      h.lerp(T, w * (1 - p.tuck));
    }
    // skating: both poles push, in time with the stride
    if (p.skate) {
      const ph = Math.sin((p.skatePhase || 0) * 2);
      for (const [s, h] of [[1, j.hdL], [-1, j.hdR]]) { h.z += ph * 0.12 * w; h.y += ph * 0.07 * w; h.x += s * 0.02 * w; }
    }
    if (!G.pl) return;
    const s = G.plS, h = s > 0 ? j.hdL : j.hdR, L = POLE - 0.07;
    if (G.pl === 1) {
      // the swing: hand forward and down a little, the wrist flicks the tip ahead
      const e = sstep(0, 1, G.plT / 0.15);
      h.z += 0.12 * e * w; h.y += 0.04 * e * w; h.x += s * 0.04 * e * w;
      if (G.plT >= 0.15) {
        // the tip goes in: ahead and a little out, a pole's length from the hand
        const A = G.anchor;
        const v = clamp((h.y - this.snowAt(h.x + s * 0.3, p.lean)) / L, 0.3, 0.99);
        this.poleDir(A, s * 0.6, 0.8, v).multiplyScalar(L).add(h);
        A.y = this.snowAt(A.x, p.lean);
        G.pl = 2; G.plT = 0;
      }
    }
    if (G.pl === 2) {
      // planted: the tip stays where it went in while he rides past it, the hand swings round it
      const A = G.anchor, dt = G.dt;
      A.x -= G.vl.x * dt; A.z -= G.vl.z * dt; A.y = this.snowAt(A.x, p.lean);
      h.z += 0.12 * w; h.y += 0.04 * w; h.x += s * 0.04 * w;
      const d = (this._gd ??= new THREE.Vector3()).subVectors(h, A);
      h.copy(A).addScaledVector(d.normalize(), L);
      if (A.z < h.z - 0.3 || G.plT > 0.3) {
        G.pl = 3; G.plT = 0;
        G.from.subVectors(A, h).normalize();
      }
    } else if (G.pl === 3) {
      const e = 1 - sstep(0, 1, G.plT / 0.28);
      h.z += 0.12 * e * w; h.y += 0.04 * e * w;
    }
  }

  // a pole on the snow: carried tips back and a little out, clear of the snow; swung forward and
  // planted; leant on when he's standing still. dir (hand to tip) is blended toward it
  groundPole(s, hd, dir, p) {
    const G = this.gm;
    if (!G) return;
    const w = (1 - this.airS) * (1 - this.gAmt) * (p.crash ? 0 : 1) * (1 - Math.max(p.tuck, clamp(p.flail || 0, 0, 1)));
    if (w < 0.001) return;
    const L = POLE, A = (this._pa ??= new THREE.Vector3()), B = (this._pb ??= new THREE.Vector3());
    const lean = p.lean, lf = clamp(this.lagF || 0, -1, 1);
    const hRel = hd.y - this.snowAt(hd.x + s * 0.25, lean);
    const vy = clamp((hRel - 0.24) / L, 0.3, 0.92);
    this.poleDir(A, s * (0.4 + G.skid * 0.4), -1 + lf * 0.3 + G.skid * 0.3, vy);
    // skating: the poles push off beside the boots
    if (p.skate) {
      const ph = Math.sin((p.skatePhase || 0) * 2);
      const v2 = clamp((hRel + 0.02) / L, 0.3, 0.99);
      this.poleDir(B, s * 0.25, -0.35 - ph * 0.5, v2);
      A.lerp(B, 0.6 * clamp(0.5 - ph, 0, 1)).normalize();
    }
    // stopped: leaning on them, the tips in the snow ahead and out to the side
    if (G.stop > 0.01) {
      const v2 = clamp((hRel + 0.02) / L, 0.3, 0.99);
      this.poleDir(B, s * 0.5, 0.6, v2);
      A.lerp(B, G.stop).normalize();
    }
    let planted = G.stop > 0.6;
    if (G.pl && s === G.plS) {
      const v3 = clamp((hRel + 0.02) / L, 0.3, 0.99);
      this.poleDir(B, s * 0.6, 0.8, v3);
      if (G.pl === 1) A.lerp(B, sstep(0, 1, G.plT / 0.15)).normalize();
      else if (G.pl === 2) { A.subVectors(G.anchor, hd).normalize(); planted = true; }
      else A.lerp(G.from, 1 - sstep(0, 1, G.plT / 0.28)).normalize();
    }
    // never through the snow: a tip that would go in skims over it instead (out to the side)
    if (!planted) {
      const floor = hd.y - this.snowAt(hd.x + A.x * L, lean) - 0.03;
      if (-A.y * L > floor) {
        const ny = -clamp(floor / L, 0.05, 0.99), hz = Math.hypot(A.x, A.z);
        if (hz < 0.05) { A.x = s; A.z = 0; } else { A.x /= hz; A.z /= hz; }
        const r = Math.sqrt(1 - ny * ny);
        A.x *= r; A.z *= r; A.y = ny;
      }
    }
    dir.lerp(A, w).normalize();
  }

  // a snowboarder's arms on the snow: relaxed, swinging with the body, reaching over the toe edge
  // on a heelside turn and the front hand pointing down the turn on a toeside one; easy when stopped
  boardArms(p, hipH, hipZ, ts) {
    const j = this.j, G = this.gm;
    if (!G) return;
    const w = (1 - this.airS) * (1 - this.gAmt) * (p.crash ? 0 : 1) * (1 - p.tuck);
    if (w < 0.001) return;
    const lr = this.lagR || 0, st = G.stop, toe = Math.max(0, ts), heel = Math.max(0, -ts);
    const T = (this._gt ??= new THREE.Vector3());
    T.set(0.45 + toe * 0.05, hipH + 0.07 - toe * 0.08 + heel * 0.06, hipZ + 0.1 + heel * 0.16 + toe * 0.06);
    T.z -= lr * 0.25; T.y += Math.abs(lr) * 0.06;
    T.lerp(tmpV2.set(0.24, hipH - 0.1, hipZ + 0.1), st);
    j.hdL.lerp(T, w);
    T.set(-0.38 - heel * 0.04, hipH - 0.02 + heel * 0.06, hipZ + 0.04 + heel * 0.18 - toe * 0.04);
    T.z += lr * 0.2;
    T.lerp(tmpV2.set(-0.24, hipH - 0.12, hipZ + 0.06), st);
    j.hdR.lerp(T, w);
  }
}
