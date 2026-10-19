// The rescue helicopter: a red and white twin-engine air ambulance. The fuselage is lofted
// from cross-sections (a smooth pod with a wrap-round glass canopy, tapering into the tail
// boom), a ducted fan in the tail fin, a four-blade rotor on its hub, curved skids, nav lights,
// a beacon that flashes and a searchlight. A hoist on a boom over the right-hand door lets an
// orange basket stretcher down on its cable. The rescue (rescue.js) flies it.
import * as THREE from 'three';
import { posedOne } from './people.js';
import { avatarKits } from './avatar.js';

function label(text, w, h, bg, fg) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = fg; g.font = `900 ${Math.round(h * 0.62)}px Helvetica, Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function crossTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d6202a'; g.fillRect(50, 18, 28, 92); g.fillRect(18, 50, 92, 28);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// the panel lines, doors, hatches, rivets and grime over the paint (u along the body from the
// nose, v round it from the top: a quarter round is the left side, three quarters the right)
const ZN = 2.95, ZT = -6.6;
function panelTex() {
  const W = 2048, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const U = (z) => ((ZN - z) / (ZN - ZT)) * W, V = (v) => v * H;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  // grime: a little darker underneath and along the boom
  const belly = g.createLinearGradient(0, V(0.35), 0, V(0.5));
  belly.addColorStop(0, 'rgba(0,0,0,0)'); belly.addColorStop(1, 'rgba(40,40,40,0.18)');
  g.fillStyle = belly; g.fillRect(0, V(0.35), W, V(0.15));
  const belly2 = g.createLinearGradient(0, V(0.5), 0, V(0.65));
  belly2.addColorStop(0, 'rgba(40,40,40,0.18)'); belly2.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = belly2; g.fillRect(0, V(0.5), W, V(0.15));
  // soot behind the exhausts, on top of the boom
  for (const v of [0.02, 0.98]) {
    const sg = g.createLinearGradient(U(-1.7), 0, U(-3.6), 0);
    sg.addColorStop(0, 'rgba(30,26,24,0.55)'); sg.addColorStop(1, 'rgba(30,26,24,0)');
    g.fillStyle = sg; g.fillRect(U(-1.7), V(v) - 70, U(-3.6) - U(-1.7), 140);
  }
  const line = (a = 0.4, w = 2.2) => { g.strokeStyle = `rgba(20,22,26,${a})`; g.lineWidth = w; };
  // seams round the body
  line();
  for (const z of [2.42, 1.55, 0.78, -1.08, -1.92, -2.65, -3.6, -4.6, -5.6]) { g.beginPath(); g.moveTo(U(z), 0); g.lineTo(U(z), H); g.stroke(); }
  // a seam along each side and down the spine of the boom
  for (const v of [0.1, 0.9, 0.4, 0.6]) { g.beginPath(); g.moveTo(U(1.55), V(v)); g.lineTo(U(-6.4), V(v)); g.stroke(); }
  // the doors on both sides: the pilots' doors and the big sliding doors
  for (const sv of [0.25, 0.75]) {
    line(0.55, 3);
    g.beginPath(); g.roundRect(U(2.05), V(sv - 0.15), U(0.86) - U(2.05), V(0.29), 18); g.stroke();
    g.beginPath(); g.roundRect(U(0.74), V(sv - 0.16), U(-1.04) - U(0.74), V(0.31), 14); g.stroke();
    // handles and the slide rail's track
    g.fillStyle = 'rgba(30,32,36,0.8)'; g.fillRect(U(0.98), V(sv + 0.02), 26, 8); g.fillRect(U(0.6), V(sv + 0.03), 30, 8);
    // hatches and a step plate
    line(0.35, 2);
    for (const [z, dv, w, h] of [[-2.2, 0.05, 0.35, 0.06], [-3.0, -0.02, 0.5, 0.05], [-1.4, 0.12, 0.22, 0.05], [1.2, 0.16, 0.3, 0.04]]) g.strokeRect(U(z), V(sv + dv), U(z - w) - U(z), V(h));
    // rivet rows along the seams
    g.fillStyle = 'rgba(30,32,36,0.35)';
    for (const z of [1.55, -1.08, -1.92]) for (let v = sv - 0.2; v < sv + 0.2; v += 0.012) { g.beginPath(); g.arc(U(z) + 7, V(v), 1.6, 0, 7); g.fill(); }
  }
  // fine noise so the paint isn't flat
  for (let i = 0; i < 40000; i++) { const k = Math.random() < 0.5 ? 255 : 0; g.fillStyle = `rgba(${k},${k},${k},${Math.random() * 0.04})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// a body lofted through cross-sections { z, y, w, h, sq } (half width / height, sq: how square
// the superellipse is, 2 = round). a0..a1 limits it to part of the way round (0 = the top,
// clockwise seen from the front), z0..z1 to part of its length; scale puffs it out (for glass
// laid on the paint). color(z, a, s) paints it.
function superY(a, sq) { const c = Math.cos(a); return Math.sign(c) * Math.pow(Math.abs(c), 2 / sq); }
function superX(a, sq) { const s = Math.sin(a); return Math.sign(s) * Math.pow(Math.abs(s), 2 / sq); }
function sectionAt(S, z) {
  if (z >= S[0].z) return S[0];
  for (let i = 0; i < S.length - 1; i++) {
    const A = S[i], B = S[i + 1];
    if (z <= A.z && z >= B.z) {
      const t = (A.z - z) / (A.z - B.z), k = t * t * (3 - 2 * t) * 0.35 + t * 0.65;
      return { z, y: A.y + (B.y - A.y) * k, w: A.w + (B.w - A.w) * k, h: A.h + (B.h - A.h) * k, sq: A.sq + (B.sq - A.sq) * k };
    }
  }
  return S[S.length - 1];
}
function loft(S, { a0 = 0, a1 = Math.PI * 2, z0 = S[S.length - 1].z, z1 = S[0].z, scale = 1, nz = 48, na = 36, color = null, cap = false, uv = false, skip = null } = {}) {
  const pos = [], col = [], idx = [], uvs = [];
  const zA = S[0].z, zB = S[S.length - 1].z;
  const c = new THREE.Color();
  for (let i = 0; i <= nz; i++) {
    const z = z1 - ((z1 - z0) * i) / nz;
    const s = sectionAt(S, z);
    for (let j = 0; j <= na; j++) {
      const a = a0 + ((a1 - a0) * j) / na;
      pos.push(superX(a, s.sq) * s.w * scale, s.y + superY(a, s.sq) * s.h * scale, z);
      if (color) { color(z, a, s, c); col.push(c.r, c.g, c.b); }
      // (the livery's panel lines: along the body, and round it from the top)
      if (uv) uvs.push((zA - z) / (zA - zB), (((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2));
    }
  }
  const row = na + 1;
  for (let i = 0; i < nz; i++) for (let j = 0; j < na; j++) {
    const p = i * row + j;
    // (left open where skip says: the doorway)
    if (skip && skip(z1 - ((z1 - z0) * (i + 0.5)) / nz, a0 + ((a1 - a0) * (j + 0.5)) / na)) continue;
    idx.push(p, p + 1, p + row, p + 1, p + row + 1, p + row);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const UPV = new THREE.Vector3(0, 1, 0);
const tube = (pts, r, seg = 40) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 8, false);

export class Helicopter {
  constructor(scene) {
    const paint = new THREE.MeshPhysicalMaterial({ vertexColors: true, map: panelTex(), roughness: 0.32, metalness: 0.15, clearcoat: 0.45, clearcoatRoughness: 0.2, envMapIntensity: 0.7 });
    const red = new THREE.MeshPhysicalMaterial({ color: 0xc81d26, roughness: 0.3, metalness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    const white = new THREE.MeshPhysicalMaterial({ color: 0xf2f3f5, roughness: 0.3, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.15 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.5, metalness: 0.6 });
    const metalM = new THREE.MeshStandardMaterial({ color: 0x9aa1aa, roughness: 0.3, metalness: 0.9 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x14202c, roughness: 0.04, metalness: 0.3, envMapIntensity: 2.0, clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide });
    const orange = new THREE.MeshStandardMaterial({ color: 0xff6a12, roughness: 0.45, metalness: 0.05 });
    const G = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
    const root = (this.group = new THREE.Group());

    // the pod and boom, one smooth loft (nose at +z)
    const S = [
      { z: 2.95, y: 1.38, w: 0.06, h: 0.08, sq: 2 },
      { z: 2.8, y: 1.4, w: 0.42, h: 0.42, sq: 2.1 },
      { z: 2.35, y: 1.55, w: 0.8, h: 0.8, sq: 2.3 },
      { z: 1.5, y: 1.68, w: 0.98, h: 0.98, sq: 2.6 },
      { z: 0.2, y: 1.72, w: 1.02, h: 1.04, sq: 2.8 },
      { z: -1.1, y: 1.76, w: 0.98, h: 1.0, sq: 2.8 },
      { z: -1.9, y: 1.9, w: 0.72, h: 0.78, sq: 2.5 },
      { z: -2.6, y: 2.08, w: 0.38, h: 0.44, sq: 2.2 },
      { z: -6.0, y: 2.25, w: 0.2, h: 0.24, sq: 2 },
      { z: -6.6, y: 2.3, w: 0.16, h: 0.22, sq: 2 },
    ];
    const RED = new THREE.Color(0xc81d26), WHITE = new THREE.Color(0xf2f3f5), YEL = new THREE.Color(0xffc21a), GREY = new THREE.Color(0x5c6068);
    // the right-hand door's opening (it slides back along the outside): dark inside
    const inDoor = (z, a) => z > -1.0 && z < 0.7 && a > Math.PI * 2 - 2.2 && a < Math.PI * 2 - 0.9;
    const livery = (z, a, s, c) => {
        const ly = Math.cos(a); // +1 top, -1 bottom
        if (z < -2.4) c.copy(z < -5.8 ? WHITE : RED);
        else if (ly < -0.82) c.copy(GREY); // the belly
        else if (ly < -0.05) c.copy(RED);
        else if (ly < 0.08 && z < 1.9) c.copy(YEL); // a yellow cheat line
        else c.copy(WHITE);
      };
    root.add(G(loft(S, { nz: 90, na: 96, uv: true, color: livery, skip: inDoor }), paint));
    // the cabin's lining, seen through the doorway and the glass
    root.add(G(loft(S, { z0: -1.95, z1: 2.7, scale: 0.975, nz: 30, na: 40 }), new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.9, side: THREE.BackSide })));
    // the glass: a canopy wrapped round the nose, cabin windows, a sliding door's window
    root.add(G(loft(S, { a0: -2.05, a1: 2.05, z0: 1.05, z1: 2.72, scale: 1.025, nz: 28, na: 30 }), glass));
    for (const sd of [-1, 1]) {
      if (sd > 0) root.add(G(loft(S, { a0: 0.95, a1: 1.75, z0: -0.75, z1: 0.65, scale: 1.025, nz: 10, na: 8 }), glass));
      root.add(G(loft(S, { a0: sd > 0 ? 0.95 : -1.75, a1: sd > 0 ? 1.75 : -0.95, z0: -1.55, z1: -0.95, scale: 1.025, nz: 6, na: 8 }), glass));
      // the door rail
      root.add(G(new THREE.BoxGeometry(0.04, 0.04, 2.2), metalM, sd * 1.0, 2.55, -0.5));
      // a step
      root.add(G(new THREE.BoxGeometry(0.28, 0.04, 0.7), dark, sd * 1.1, 0.72, 0.2));
    }
    // the sliding door on the hoist side: its own panel of the hull and window, open in the hover
    this.door = new THREE.Group();
    this.door.add(G(loft(S, { a0: -2.2, a1: -0.9, z0: -1.0, z1: 0.7, scale: 1.035, nz: 14, na: 14, uv: true, color: livery }), paint));
    this.door.add(G(loft(S, { a0: -1.75, a1: -0.98, z0: -0.7, z1: 0.5, scale: 1.05, nz: 8, na: 8 }), glass));
    root.add(this.door);
    this.doorOpen = 0;
    // inside: the cabin floor, a seat bench and a medical bag by the door
    root.add(G(new THREE.BoxGeometry(1.3, 0.06, 2.0), dark, 0, 0.9, -0.2));
    root.add(G(new THREE.BoxGeometry(1.2, 0.45, 0.5), new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.8 }), 0, 1.15, -1.0));
    root.add(G(new THREE.BoxGeometry(0.45, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0xd8342c, roughness: 0.7 }), 0.3, 1.08, 0.35));
    // the frame bar down the middle of the windscreen
    root.add(G(new THREE.BoxGeometry(0.05, 0.04, 1.4).rotateX(-0.75), dark, 0, 2.28, 1.95));
    // the engine deck: cowlings, exhausts, intakes
    root.add(G(new THREE.CapsuleGeometry(0.42, 1.9, 6, 16).rotateX(Math.PI / 2).scale(1.35, 0.7, 1), white, 0, 2.72, -0.6));
    for (const sd of [-1, 1]) {
      root.add(G(new THREE.CylinderGeometry(0.11, 0.13, 0.5, 12).rotateX(Math.PI / 2 + 0.5), dark, sd * 0.38, 2.86, -1.75));
      root.add(G(new THREE.BoxGeometry(0.04, 0.22, 0.5), dark, sd * 0.58, 2.75, 0.05));
    }
    // the tail: ducted fan in the fin, horizontal stabiliser with end plates
    const fin = new THREE.Shape();
    fin.moveTo(-0.9, -0.55); fin.lineTo(0.45, -0.6); fin.lineTo(0.55, 0.35); fin.lineTo(0.15, 1.55); fin.lineTo(-0.35, 1.55); fin.lineTo(-0.75, 0.4); fin.closePath();
    const duct = new THREE.Path(); duct.absarc(-0.03, 0.08, 0.36, 0, Math.PI * 2, true); fin.holes.push(duct);
    const finG = new THREE.ExtrudeGeometry(fin, { depth: 0.16, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
    finG.translate(0, 0, -0.08); finG.rotateY(Math.PI / 2);
    root.add(G(finG, red, 0, 2.3, -6.75));
    root.add(G(new THREE.TorusGeometry(0.42, 0.11, 10, 28).rotateY(Math.PI / 2), red, 0, 2.38, -6.72));
    root.add(G(new THREE.CylinderGeometry(0.42, 0.42, 0.24, 28, 1, true).rotateZ(Math.PI / 2), dark, 0, 2.38, -6.72));
    this.tailRotor = new THREE.Group();
    for (let i = 0; i < 9; i++) this.tailRotor.add(G(new THREE.BoxGeometry(0.02, 0.38, 0.06).translate(0, 0.19, 0).rotateX((i / 9) * Math.PI * 2), dark));
    this.tailRotor.position.set(0, 2.38, -6.72);
    root.add(this.tailRotor);
    root.add(G(new THREE.BoxGeometry(1.9, 0.06, 0.42), red, 0, 2.2, -5.5));
    for (const sd of [-1, 1]) root.add(G(new THREE.BoxGeometry(0.05, 0.42, 0.42), red, sd * 0.95, 2.28, -5.5));
    // mast, hub, four tapered blades with a little droop, and their blur
    root.add(G(new THREE.CylinderGeometry(0.1, 0.14, 0.45, 12), metalM, 0, 3.15, -0.25));
    this.rotor = new THREE.Group();
    this.rotor.position.set(0, 3.42, -0.25);
    this.rotor.add(G(new THREE.CylinderGeometry(0.3, 0.26, 0.18, 16), dark));
    this.rotor.add(G(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), metalM, 0, 0.08, 0));
    // the swashplate under the hub and its pitch links up to each blade's horn
    this.rotor.add(G(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 18), metalM, 0, -0.2, 0));
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + 0.35;
      this.rotor.add(G(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 5), metalM, Math.cos(a) * 0.22, -0.08, -Math.sin(a) * 0.22));
    }
    for (let i = 0; i < 4; i++) {
      const b = new THREE.BoxGeometry(5.0, 0.045, 0.32, 10, 1, 1);
      const p = b.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const t = (p.getX(k) + 2.5) / 5;
        p.setZ(k, p.getZ(k) * (1 - t * 0.35));
        p.setY(k, p.getY(k) - t * t * 0.12);
      }
      b.computeVertexNormals();
      b.translate(2.75, 0, 0);
      const m = G(b, dark);
      // the blade's root: a cuff and grip on the hub
      m.add(G(new THREE.BoxGeometry(0.42, 0.1, 0.2), metalM, 0.42, 0, 0));
      m.rotation.y = (i * Math.PI) / 2;
      this.rotor.add(m);
      // a yellow tip
      const tip = G(new THREE.BoxGeometry(0.28, 0.05, 0.22), new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.4 }), 5.1, -0.12, 0);
      m.add(tip);
    }
    root.add(this.rotor);
    this.blur = new THREE.Mesh(new THREE.RingGeometry(0.4, 5.3, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1a1c20, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }));
    this.blur.position.set(0, 3.36, -0.25);
    root.add(this.blur);
    // skids: two curved cross tubes, skid tubes turned up at the front
    for (const z of [-0.75, 0.95]) root.add(G(tube([new THREE.Vector3(-1.05, 0.08, z), new THREE.Vector3(-0.85, 0.7, z), new THREE.Vector3(0, 0.95, z), new THREE.Vector3(0.85, 0.7, z), new THREE.Vector3(1.05, 0.08, z)], 0.045), metalM));
    for (const sd of [-1, 1]) root.add(G(tube([new THREE.Vector3(sd * 1.07, 0.06, -1.6), new THREE.Vector3(sd * 1.07, 0.04, 0), new THREE.Vector3(sd * 1.07, 0.05, 1.5), new THREE.Vector3(sd * 1.07, 0.3, 2.05)], 0.05), metalM));
    // lights: red to port (left, +x), green to starboard, a white strobe at the tail, the beacon
    // on top and the searchlight under the nose
    const lamp = (c, i) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i });
    root.add(G(new THREE.SphereGeometry(0.06, 8, 6), lamp(0xff2020, 3), 0.98, 2.22, -5.5));
    root.add(G(new THREE.SphereGeometry(0.06, 8, 6), lamp(0x20ff40, 3), -0.98, 2.22, -5.5));
    root.add(G(new THREE.SphereGeometry(0.05, 8, 6), lamp(0xffffff, 3), 0, 2.32, -6.98));
    this.beacon = G(new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), lamp(0xff1a1a, 0), 0, 3.05, -1.7);
    root.add(this.beacon);
    root.add(G(new THREE.CylinderGeometry(0.13, 0.1, 0.14, 14).rotateX(0.5), metalM, 0.45, 0.82, 2.0));
    root.add(G(new THREE.CircleGeometry(0.11, 14).rotateX(-Math.PI / 2 + 0.5), lamp(0xfff6e0, 1.0), 0.45, 0.75, 2.04));
    // antennae
    root.add(G(new THREE.BoxGeometry(0.03, 0.35, 0.1).rotateX(-0.4), dark, 0, 0.62, -0.8));
    root.add(G(new THREE.BoxGeometry(0.03, 0.28, 0.08).rotateX(-0.4), dark, 0, 2.55, -3.0));
    // livery: RESCUE down the boom, a red cross on the cabin behind the doors, the registration
    const word = label('RESCUE', 512, 96, null, '#ffffff');
    const cross = crossTex();
    const reg = label('SL-RX1', 256, 64, null, '#ffffff');
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.28), new THREE.MeshBasicMaterial({ map: word, transparent: true }));
      w.position.set(s * 0.302, 2.17, -4.3); w.rotation.y = s * (Math.PI / 2 + 0.06);
      root.add(w);
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshStandardMaterial({ map: cross, transparent: true, roughness: 0.4 }));
      c.position.set(s * 0.9, 2.05, -1.65); c.rotation.y = s * Math.PI / 2;
      root.add(c);
      const r = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshBasicMaterial({ map: reg, transparent: true }));
      r.position.set(s * 1.03, 1.25, 0.6); r.rotation.y = s * Math.PI / 2;
      root.add(r);
    }
    // the hoist: a boom out over the right-hand door (-x), the winch drum, cable, the stretcher
    root.add(G(new THREE.BoxGeometry(0.9, 0.12, 0.14), metalM, -1.25, 2.62, 0.2));
    root.add(G(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 12).rotateX(Math.PI / 2), dark, -1.62, 2.55, 0.2));
    this.winch = new THREE.Vector3(-1.62, 2.42, 0.2);
    this.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5).translate(0, -0.5, 0), dark);
    this.cable.position.copy(this.winch);
    root.add(this.cable);
    // a Stokes basket: an orange shell with a tube rail round the top, a hook ring over it on
    // four lines
    const sx = new THREE.Group();
    const BS = [
      { z: 1.05, y: 0.08, w: 0.22, h: 0.12, sq: 3 },
      { z: 0.85, y: 0.1, w: 0.31, h: 0.16, sq: 3.5 },
      { z: -0.85, y: 0.1, w: 0.31, h: 0.16, sq: 3.5 },
      { z: -1.05, y: 0.08, w: 0.24, h: 0.13, sq: 3 },
    ];
    const shell = loft(BS, { a0: Math.PI / 2, a1: Math.PI * 1.5, nz: 16, na: 14 });
    sx.add(G(shell, new THREE.MeshStandardMaterial({ color: 0xff6a12, roughness: 0.45, side: THREE.DoubleSide })));
    const railPts = [];
    for (let k = 0; k <= 40; k++) { const a = (k / 40) * Math.PI * 2; railPts.push(new THREE.Vector3(Math.cos(a) * 0.33, 0.24, Math.sin(a) * 1.07)); }
    sx.add(G(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts, true), 60, 0.022, 6, true), metalM));
    for (const z of [-0.6, -0.2, 0.2, 0.6]) sx.add(G(new THREE.BoxGeometry(0.62, 0.025, 0.04), orange, 0, 0.2, z));
    for (const z of [-0.7, 0, 0.7]) sx.add(G(new THREE.BoxGeometry(0.66, 0.05, 0.07), new THREE.MeshStandardMaterial({ color: 0x1d1f26, roughness: 0.8 }), 0, 0.26, z));
    sx.add(G(new THREE.TorusGeometry(0.06, 0.012, 6, 12), metalM, 0, 1.3, 0));
    const slings = new THREE.BufferGeometry().setFromPoints([0.31, -0.31].flatMap((x) => [-0.95, 0.95].flatMap((z) => [new THREE.Vector3(x, 0.24, z), new THREE.Vector3(0, 1.26, 0)])));
    sx.add(new THREE.LineSegments(slings, new THREE.LineBasicMaterial({ color: 0x222222 })));
    this.stretcher = sx;
    root.add(sx);
    this.setCable(1);
    this.spin = 0; this.t = 0;
    root.visible = false;
    scene.add(root);
  }

  // let the stretcher out to len metres under the winch
  setCable(len) {
    this.len = len;
    this.cable.scale.y = Math.max(0.01, len);
    this.stretcher.position.copy(this.winch).add(new THREE.Vector3(0, -len - 1.3, 0));
  }

  // the stretcher's bed, in the world
  bed(out) { return this.stretcher.localToWorld(out.set(0, 0.12, 0)); }

  // the crew, once the people have loaded: the pilot up front in a white helmet, and the medic
  // in the doorway (seen once the door slides open)
  addCrew(outfit) {
    if (this.crew || avatarKits.length < 2) return;
    this.crew = true;
    const helmet = new THREE.MeshPhysicalMaterial({ color: 0xf2f3f5, roughness: 0.25, clearcoat: 0.8 });
    const visor = new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.05, metalness: 0.8 });
    const put = (kit, kind, o, at, yaw, lean) => {
      const m = posedOne(kit, o, kind);
      const pel = m.userData.pelvis;
      m.geometry.translate(-pel.x, -pel.y, -pel.z);
      m.geometry.rotateY(yaw);
      m.geometry.translate(at.x, at.y, at.z);
      m.castShadow = false;
      this.group.add(m);
      // a flight helmet over the head
      const head = kit.bindP[kit.I('Bip01_Head')].clone().sub(pel);
      head.applyAxisAngle(new THREE.Vector3(1, 0, 0), lean).applyAxisAngle(UPV, yaw).add(at);
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 10), helmet);
      h.position.copy(head).add(new THREE.Vector3(0, 0.1, 0)); h.scale.set(1, 1.05, 1.12);
      const v = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 6, -0.9, 1.8, 1.0, 0.7), visor);
      v.rotation.y = yaw; v.position.copy(h.position);
      this.group.add(h, v);
    };
    put(avatarKits[0], 'sit', { ...outfit, jacket: 0x1f2a3c, pants: 0x1f2a3c, jacket2: 0x1f2a3c, pants2: 0x1f2a3c, jpat: 0, ppat: 0 }, new THREE.Vector3(-0.36, 1.42, 1.15), 0, -0.12);
    // the hoist operator sits in the doorway, legs out over the skid, watching the cable
    put(avatarKits[1], 'sit', { ...outfit, jacket: 0xd8342c, pants: 0x2a2f3a, jacket2: 0xd8342c, pants2: 0x2a2f3a, jpat: 0, ppat: 0 }, new THREE.Vector3(-0.62, 1.1, -0.2), -Math.PI / 2, -0.12);
  }

  update(dt, rpm = 1, open = false) {
    this.t += dt;
    // the sliding door rolls back along its rail for the hoist
    this.doorOpen += ((open ? 1 : 0) - this.doorOpen) * Math.min(1, dt * 1.6);
    const k = this.doorOpen * this.doorOpen * (3 - 2 * this.doorOpen);
    this.door.position.set(-0.05 * Math.min(1, k * 4), 0, -1.55 * k);
    this.spin += dt * 38 * rpm;
    this.rotor.rotation.y = this.spin;
    this.tailRotor.rotation.x = this.spin * 4;
    this.blur.material.opacity = 0.14 * Math.min(1, rpm * 1.4);
    // the beacon flashes twice a second
    this.beacon.material.emissiveIntensity = (this.t * 2) % 1 < 0.15 ? 6 : 0.2;
  }
}
