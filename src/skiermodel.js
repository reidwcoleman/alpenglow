// Procedural skier: capsule limbs posed every frame with two-bone IK.
// Local frame: +Z = ski tips, +Y = up, +X = skier's left.
import * as THREE from 'three';

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
  };
  return G;
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
    racer,
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

export class SkierModel {
  constructor(outfit, bib = 0) {
    const g = geos();
    const M = (c, r = 0.7, m = 0, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...extra });
    const jacketM = M(outfit.jacket, outfit.racer ? 0.35 : 0.72);
    const pantsM = M(outfit.pants, outfit.racer ? 0.35 : 0.8);
    const helmetM = M(outfit.helmet, 0.28, 0.05);
    const goggleM = M(outfit.goggles, 0.06, 0.9, { envMapIntensity: 2.2 });
    const strapM = M(0x16171c, 0.8);
    const skinM = M(outfit.skin, 0.6);
    const gloveM = M(outfit.gloves, 0.75);
    const bootM = M(outfit.boots, 0.35);
    const skiM = new THREE.MeshStandardMaterial({ color: outfit.skis, vertexColors: true, roughness: 0.3, metalness: 0.1 });
    const poleM = M(0x9ea5b0, 0.3, 0.8);
    const darkM = M(0x111215, 0.6);

    this.group = new THREE.Group();
    this.tilt = new THREE.Group();
    this.group.add(this.tilt);
    const add = (geo, mat, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadow; m.receiveShadow = false;
      this.tilt.add(m);
      return m;
    };
    this.parts = {
      skiL: add(g.ski, skiM), skiR: add(g.ski, skiM),
      bootL: add(g.boot, bootM), bootR: add(g.boot, bootM),
      cuffL: add(g.cuff, bootM), cuffR: add(g.cuff, bootM),
      shinL: add(g.shin, pantsM), shinR: add(g.shin, pantsM),
      thighL: add(g.thigh, pantsM), thighR: add(g.thigh, pantsM),
      hips: add(g.hips, pantsM),
      torso: add(g.torso, jacketM),
      collar: add(g.collar, outfit.racer ? jacketM : darkM),
      face: add(g.face, skinM),
      helmet: add(g.helmet, helmetM),
      goggles: add(g.goggles, goggleM, false),
      strap: add(g.strap, strapM, false),
      upperL: add(g.upper, jacketM), upperR: add(g.upper, jacketM),
      foreL: add(g.fore, jacketM), foreR: add(g.fore, jacketM),
      handL: add(g.hand, gloveM), handR: add(g.hand, gloveM),
      poleL: add(g.pole, poleM), poleR: add(g.pole, poleM),
      gripL: add(g.grip, darkM, false), gripR: add(g.grip, darkM, false),
      basketL: add(g.basket, darkM, false), basketR: add(g.basket, darkM, false),
    };
    if (bib) {
      const bm = new THREE.MeshStandardMaterial({ map: bibTexture(bib, outfit.jacket), roughness: 0.8, side: THREE.DoubleSide });
      this.parts.bib = add(g.bib, bm, false);
      this.parts.bibBack = add(g.bib, bm, false);
    }
    this.small = ['goggles', 'strap', 'gripL', 'gripR', 'basketL', 'basketR', 'collar'].filter((k) => this.parts[k]);
    if (this.parts.bib) this.small.push('bib', 'bibBack');
    // joint scratch
    this.j = {};
    for (const k of ['hipL', 'hipR', 'kneeL', 'kneeR', 'ankL', 'ankR', 'pelvis', 'chest', 'neck', 'head', 'shL', 'shR', 'elL', 'elR', 'hdL', 'hdR', 'tipL', 'tipR', 'spine', 'side', 'fwd'])
      this.j[k] = new THREE.Vector3();
    this.lod = 0;
  }

  setDetail(near) {
    const lod = near ? 0 : 1;
    if (lod === this.lod) return;
    this.lod = lod;
    for (const k of this.small) if (!(this.gearOff && /grip|basket/.test(k))) this.parts[k].visible = near;
    for (const k in this.parts) this.parts[k].castShadow = near && !this.small.includes(k);
  }

  // p: { crouch, tuck, lean, angulate, plow, air, grab, polePlant, poleSide, crash, t, skidYaw }
  pose(p) {
    const j = this.j, P = this.parts;
    this.tilt.rotation.set(0, 0, p.lean);
    const crouch = p.crouch, tuck = p.tuck, air = p.air;
    const stance = 0.105 + p.plow * 0.16;
    const fore = 0.0;
    // ankles (boot tops) and skis
    j.ankL.set(stance, 0.17, fore);
    j.ankR.set(-stance, 0.17, fore);
    // inner leg is shorter when edged: lift the inside foot a little
    const innerLift = Math.abs(p.lean) * 0.09;
    if (p.lean > 0) j.ankR.y += innerLift; else j.ankL.y += innerLift;
    if (air > 0) { j.ankL.y += air * 0.12; j.ankR.y += air * 0.12; }
    // skating stride: push one ski out and back while the other glides
    const skate = p.skate || 0;
    const pushL = skate * Math.max(0, Math.sin(p.skatePhase || 0)), pushR = skate * Math.max(0, -Math.sin(p.skatePhase || 0));
    j.ankL.x += pushL * 0.26; j.ankL.z -= pushL * 0.12; j.ankL.y += pushR * 0.07;
    j.ankR.x -= pushR * 0.26; j.ankR.z -= pushR * 0.12; j.ankR.y += pushL * 0.07;

    const hipH = 0.93 - crouch * 0.22 - tuck * 0.33 - air * 0.12 + Math.sin(p.t * 9) * 0.004;
    const hipZ = -0.06 - crouch * 0.07 - tuck * 0.12;
    j.pelvis.set(-p.lean * 0.12 - (pushL - pushR) * 0.09, hipH, hipZ);
    // upper body: forward pitch and counter-roll (angulation)
    const pitch = 0.2 + crouch * 0.25 + tuck * 0.95 + air * 0.15;
    const ang = -p.lean * p.angulate;
    j.spine.set(Math.sin(ang) * Math.cos(pitch), Math.cos(ang) * Math.cos(pitch), Math.sin(pitch)).normalize();
    j.side.set(1, 0, 0).addScaledVector(j.spine, -j.spine.x).normalize();
    j.fwd.crossVectors(j.side, j.spine).normalize();
    // counter-rotation: the upper body keeps facing down the hill while the skis turn
    const twist = p.twist || 0;
    const qT = tmpQ.setFromAxisAngle(Y, twist);
    const hipSide = j.side.clone();
    j.spine.applyQuaternion(qT); j.side.applyQuaternion(qT); j.fwd.applyQuaternion(qT);
    j.hipL.copy(j.pelvis).addScaledVector(hipSide, 0.095);
    j.hipR.copy(j.pelvis).addScaledVector(hipSide, -0.095);
    // knees forward and driven into the turn
    const kneePole = tmpV.set(-p.lean * 0.9 + 0, 0.15, 1).normalize();
    const kp = kneePole.clone();
    const kL = new THREE.Vector3(), kR = new THREE.Vector3();
    ik(j.hipL, j.ankL, THIGH, SHIN, kp.clone().add(new THREE.Vector3(0.1 + p.plow * 0.4, 0, 0)), kL);
    ik(j.hipR, j.ankR, THIGH, SHIN, kp.clone().add(new THREE.Vector3(-0.1 - p.plow * 0.4, 0, 0)), kR);
    j.kneeL.copy(kL); j.kneeR.copy(kR);
    place(P.thighL, j.hipL, j.kneeL); place(P.thighR, j.hipR, j.kneeR);
    place(P.shinL, j.kneeL, j.ankL); place(P.shinR, j.kneeR, j.ankR);

    // skis, boots
    const plowYaw = p.plow * 0.32;
    // skis roll further onto edge than the body leans when edging at low speed
    const extraEdge = clamp((p.edge || 0) * 0.75 - p.lean, -0.45, 0.45) * (Math.abs(p.edge || 0) > Math.abs(p.lean) ? 1 : 0);
    for (const [s, ank, ski, boot, cuff, yaw] of [[1, j.ankL, P.skiL, P.bootL, P.cuffL, -plowYaw + skate * 0.36], [-1, j.ankR, P.skiR, P.bootR, P.cuffR, plowYaw - skate * 0.36]]) {
      ski.position.set(ank.x, ank.y - 0.17, ank.z);
      ski.rotation.set(air * -0.12 + (p.grabTip || 0) * 0.2, yaw, extraEdge);
      boot.position.set(ank.x, ank.y - 0.17, ank.z);
      boot.rotation.copy(ski.rotation);
      cuff.position.copy(boot.position);
      cuff.rotation.set(0.25 + crouch * 0.2 + tuck * 0.3, yaw, 0);
    }

    // torso
    j.chest.copy(j.pelvis).addScaledVector(j.spine, 0.42);
    P.hips.position.copy(j.pelvis).addScaledVector(j.spine, 0.04);
    P.hips.quaternion.setFromUnitVectors(Y, j.spine);
    P.torso.position.copy(j.pelvis).addScaledVector(j.spine, 0.27);
    P.torso.quaternion.setFromUnitVectors(Y, j.spine);
    j.neck.copy(j.pelvis).addScaledVector(j.spine, 0.56);
    P.collar.position.copy(j.neck);
    P.collar.quaternion.setFromUnitVectors(Y, j.spine);
    // head looks ahead: blend spine with vertical
    const headUp = tmpV.copy(j.spine).lerp(Y, 0.55 + tuck * 0.2).normalize();
    j.head.copy(j.neck).addScaledVector(headUp, 0.12);
    const hq = new THREE.Quaternion().setFromUnitVectors(Y, headUp).multiply(new THREE.Quaternion().setFromAxisAngle(Y, twist * 1.15));
    for (const k of ['face', 'helmet', 'goggles', 'strap']) { P[k].position.copy(j.head); P[k].quaternion.copy(hq); }
    P.helmet.position.addScaledVector(headUp, 0.012);
    P.goggles.position.addScaledVector(headUp, 0.025);
    P.strap.position.addScaledVector(headUp, 0.025);
    if (P.bib) {
      P.bib.position.copy(j.pelvis).addScaledVector(j.spine, 0.3).addScaledVector(j.fwd, 0.158);
      const m = new THREE.Matrix4().makeBasis(j.side.clone().negate(), j.spine, j.fwd.clone().negate());
      P.bib.quaternion.setFromRotationMatrix(m);
      P.bib.rotateY(Math.PI);
      P.bibBack.position.copy(j.pelvis).addScaledVector(j.spine, 0.3).addScaledVector(j.fwd, -0.158);
      P.bibBack.quaternion.setFromRotationMatrix(m);
    }

    // arms
    j.shL.copy(j.chest).addScaledVector(j.side, 0.2).addScaledVector(j.spine, 0.04);
    j.shR.copy(j.chest).addScaledVector(j.side, -0.2).addScaledVector(j.spine, 0.04);
    const handY = hipH + 0.02 + crouch * 0.05;
    // relaxed ready position, tuck pulls the hands in front of the face
    j.hdL.set(0.31, handY, hipZ + 0.36).lerp(tmpV.set(0.11, hipH + 0.18, hipZ + 0.62), tuck);
    j.hdR.set(-0.31, handY, hipZ + 0.36).lerp(tmpV.set(-0.11, hipH + 0.18, hipZ + 0.62), tuck);
    if (air > 0) {
      j.hdL.lerp(tmpV.set(0.42, hipH + 0.18, hipZ + 0.2), air * (1 - p.grab));
      j.hdR.lerp(tmpV.set(-0.42, hipH + 0.18, hipZ + 0.2), air * (1 - p.grab));
      // mute grab: left hand to the right ski tip area
      j.hdL.lerp(tmpV.set(-0.05, j.ankR.y + 0.02, 0.32), p.grab);
    }
    if (twist) for (const h of [j.hdL, j.hdR]) h.sub(j.pelvis).applyQuaternion(tmpQ.setFromAxisAngle(Y, twist)).add(j.pelvis);
    // pole plant: reach the inside hand forward and down
    if (p.polePlant > 0) {
      const h = p.poleSide > 0 ? j.hdL : j.hdR;
      h.z += p.polePlant * 0.16; h.y -= p.polePlant * 0.08;
    }
    if (p.crash) {
      j.hdL.set(0.5, hipH + 0.3, hipZ + 0.1); j.hdR.set(-0.5, hipH + 0.4, hipZ - 0.1);
    }
    ik(j.shL, j.hdL, UPPER, FORE, tmpV.set(0.6, -0.6, -0.5).normalize().clone(), j.elL);
    ik(j.shR, j.hdR, UPPER, FORE, tmpV.set(-0.6, -0.6, -0.5).normalize().clone(), j.elR);
    place(P.upperL, j.shL, j.elL); place(P.upperR, j.shR, j.elR);
    place(P.foreL, j.elL, j.hdL); place(P.foreR, j.elR, j.hdR);
    P.handL.position.copy(j.hdL); P.handR.position.copy(j.hdR);
    P.handL.quaternion.copy(P.foreL.quaternion); P.handR.quaternion.copy(P.foreR.quaternion);

    // poles: tip trails behind near the snow; planted tip is ahead
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
