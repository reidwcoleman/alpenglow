// The Summit Mountain Clinic: where the rescue helicopter brings you. An alpine medical
// centre set into the slope on a stone-clad terrace: a rubble-stone ground floor, two floors of
// larch boards with deep-set windows and a glass-fronted balcony, a white stair tower with the
// lit cross on top, a standing-seam roof under a thick load of snow with icicles off the eaves,
// a steel-and-glass entrance with the reception lit up inside, the ambulance bay, lamps, benches,
// flags and a ski rack on the terrace, and the helipad: a steel deck up on columns with its
// safety net, edge lights, floodlights and the windsock.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from './rbox.js';
import { heightAt, HOSPITAL, PARK_ID } from './course.js';
import { mulberry32 } from './noise.js';
import { bakeable } from './bake.js';
import { stone, larch, plaster, roofMetal, concrete, pavers, surface, boxUV } from './proctex.js';

const UP = new THREE.Vector3(0, 1, 0);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// pieces of geometry gathered per material, merged into one mesh each at the end
export class Kit {
  constructor() { this.parts = new Map(); }
  add(key, geo, { tint = 0xffffff, size = null, uv = false } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (size) boxUV(g, size);
    else if (!uv || !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const c = new THREE.Color(tint), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(a, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
    return g;
  }
  // a piece already in the kit's form (position, normal, uv, color; not indexed)
  addRaw(key, g) {
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
  }
  // each material's pieces merged into one geometry (for stamping copies)
  merged() {
    const out = {};
    for (const [key, list] of this.parts) out[key] = mergeGeometries(list);
    return out;
  }
  build(mats, parent, shadow = true) {
    for (const [key, list] of this.parts) {
      const m = new THREE.Mesh(mergeGeometries(list), mats[key]);
      m.castShadow = shadow && !['glass', 'lit', 'glow', 'net'].includes(key); m.receiveShadow = true;
      m.matrixAutoUpdate = false; m.updateMatrix();
      parent.add(m);
    }
  }
}

const B = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const RB = (w, h, d, r, x, y, z) => new RoundedBoxGeometry(w, h, d, 3, r).translate(x, y, z);

// the rooms seen through the windows: four in one texture (a ward, an office with the blinds
// half down, a corridor, a dark room)
function roomsTex() {
  return canvasTex(512, 512, (c) => {
    const room = (ox, oy, kind) => {
      const S = 256;
      c.save(); c.translate(ox, oy);
      const lit = kind !== 3;
      const bg = c.createLinearGradient(0, 0, 0, S);
      if (lit) { bg.addColorStop(0, '#fbe7c0'); bg.addColorStop(0.45, '#d9b98c'); bg.addColorStop(1, '#5c4836'); } else { bg.addColorStop(0, '#2b3442'); bg.addColorStop(1, '#151a22'); }
      c.fillStyle = bg; c.fillRect(0, 0, S, S);
      if (kind === 0) {
        // a bed, a drip stand, a picture
        c.fillStyle = '#f4f2ee'; c.fillRect(40, 150, 150, 44); c.fillStyle = '#8fb6d8'; c.fillRect(40, 140, 150, 16);
        c.fillStyle = '#e8e4dc'; c.fillRect(40, 120, 30, 30);
        c.fillStyle = '#9aa0a8'; c.fillRect(205, 60, 4, 140); c.fillRect(196, 60, 22, 4);
        c.fillStyle = '#6f8f6a'; c.fillRect(90, 50, 60, 40);
      } else if (kind === 1) {
        c.fillStyle = '#7a5a40'; c.fillRect(30, 170, 190, 10); c.fillStyle = '#2b2f36'; c.fillRect(100, 130, 54, 38);
        // blinds two thirds of the way down
        for (let y = 0; y < 150; y += 10) { c.fillStyle = '#e9e4da'; c.fillRect(0, y, S, 7); }
      } else if (kind === 2) {
        // a corridor going away: lights down the ceiling
        c.fillStyle = '#e8dcc8'; c.beginPath(); c.moveTo(0, S); c.lineTo(100, 150); c.lineTo(156, 150); c.lineTo(S, S); c.fill();
        for (let k = 0; k < 5; k++) { const t = k / 5, w = 60 * (1 - t * 0.8); c.fillStyle = '#fffbea'; c.fillRect(128 - w / 2, 20 + t * 90, w, 6 * (1 - t * 0.7)); }
      } else {
        c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(60, 110, 140, 90);
      }
      if (lit) { c.fillStyle = '#fffbe8'; c.fillRect(70, 8, 116, 7); }
      // the glass: sky and snow caught in it
      const rf = c.createLinearGradient(0, 0, S * 0.7, S);
      rf.addColorStop(0, 'rgba(200,222,245,0.55)'); rf.addColorStop(0.5, 'rgba(170,195,225,0.12)'); rf.addColorStop(1, 'rgba(230,236,245,0.35)');
      c.fillStyle = rf; c.fillRect(0, 0, S, S);
      c.restore();
    };
    room(0, 0, 0); room(256, 0, 1); room(0, 256, 2); room(256, 256, 3);
  });
}

export function buildClinic(scene, forest, ambulance) {
  const rnd = mulberry32(404);
  const { x, z } = HOSPITAL;
  const W = 26, D = 13, Hh = 9.6;
  const yaw = HOSPITAL.side > 0 ? -Math.PI / 2 : Math.PI / 2;
  let gy = Infinity, gyMax = -Infinity;
  for (let a = -W / 2; a <= W / 2; a += 4) for (let b = -D / 2; b <= D / 2; b += 4) { const h = heightAt(x - b, z + a); gy = Math.min(gy, h); gyMax = Math.max(gyMax, h); }
  // set into the slope: the uphill side a little buried, a terrace wall downhill
  const floor = Math.max(gyMax - 2.2, gy) + 0.2;

  const env = { envMapIntensity: 1 };
  const mats = {
    stone: surface(stone, env), larch: surface(larch, env), plaster: surface(plaster, env), roof: surface(roofMetal, env),
    concrete: surface(concrete, env), pavers: surface(pavers, env),
    snow: new THREE.MeshStandardMaterial({ color: 0xf3f6fb, roughness: 0.72, vertexColors: true, normalMap: plaster().normalMap, normalScale: new THREE.Vector2(0.5, 0.5) }),
    steel: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.4, metalness: 0.75 }),
    paint: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5, metalness: 0.1 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xa9c4d6, roughness: 0.03, metalness: 0.1, transparent: true, opacity: 0.32, envMapIntensity: 1.8, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }),
    ice: new THREE.MeshPhysicalMaterial({ color: 0xdbeaf7, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.8, envMapIntensity: 1.6, clearcoat: 1, vertexColors: true }),
    glow: new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xffe6b8, emissiveIntensity: 1.6, vertexColors: true }),
    lit: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.6 }),
  };
  const K = new Kit();
  const S = { stone: 1.6, larch: 1.4, plaster: 3, roof: 2, concrete: 3, pavers: 2 };
  const add = (key, geo, tint) => K.add(key, geo, { tint, size: S[key] ?? null });

  // ---- the terrace: stone-clad walls down to the snow, paved on top, steps down the front
  const ph = floor - gy + 6;
  add('stone', B(W + 6, ph, D + 9, 0, -ph / 2, 3), 0xd8d2c8);
  add('concrete', B(W + 6.5, 0.3, D + 9.5, 0, 0.0, 3), 0xe6e3dc); // the coping round the edge
  add('pavers', B(W + 5.4, 0.04, D + 8.4, 0, 0.17, 3));
  const stepW = 7;
  for (let k = 1; k <= 6; k++) add('concrete', B(stepW, 0.3 + ph, 0.5, 0, -k * 0.3 - ph / 2 + 0.15, D / 2 + 7.5 + k * 0.5), 0xd8d6d0);
  // handrails down the steps
  for (const sx of [-1, 1]) {
    const pts = [new THREE.Vector3(sx * (stepW / 2 - 0.2), 1.0, D / 2 + 7.4), new THREE.Vector3(sx * (stepW / 2 - 0.2), 1.0 - 1.8, D / 2 + 10.6)];
    add('steel', new THREE.TubeGeometry(new THREE.LineCurve3(pts[0], pts[1]), 2, 0.035, 8), 0x8d939b);
    for (const t of [0, 0.5, 1]) { const p = pts[0].clone().lerp(pts[1], t); add('steel', B(0.05, 1.0, 0.05, p.x, p.y - 0.5, p.z), 0x8d939b); }
  }
  // snow heaped along the terrace edges (it's been cleared off the paving)
  const drift = (px, pz, len, along) => {
    for (let s = -len / 2; s < len / 2; s += 0.7 + rnd() * 0.6) {
      const r = 0.6 + rnd() * 0.6;
      const g = new THREE.SphereGeometry(r, 14, 8);
      // lumpy: pushed in and out a little
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const k = 1 + (Math.sin(p.getX(i) * 7 + s) * Math.cos(p.getZ(i) * 6) * 0.08); p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k); }
      g.scale(along ? 1.8 + rnd() : 1.1, 0.32 + rnd() * 0.16, along ? 1.1 : 1.8 + rnd());
      g.translate(px + (along ? s : (rnd() - 0.5) * 0.4), 0.18, pz + (along ? (rnd() - 0.5) * 0.4 : s));
      g.computeVertexNormals();
      add('snow', g);
    }
  };
  drift(-W / 2 - 1.5, 6, 16, false); drift(W / 2 + 1.8, 9, 10, false);
  drift(-9.5, D / 2 + 7.0, 8, true); drift(9.5, D / 2 + 7.0, 8, true);

  // ---- the building: stone ground floor, larch above, a plaster band between
  add('stone', B(W, 3.8, D, 0, 1.9, 0));
  add('plaster', B(W + 0.5, 0.35, D + 0.5, 0, 3.9, 0), 0xdedbd4);
  add('larch', B(W, Hh - 4.05, D, 0, 4.05 + (Hh - 4.05) / 2, 0));
  // the stair tower, white, a little taller, its flat roof under snow
  const tx = -W / 2 + 2.5;
  // (standing a little proud of the end wall, so the two never fight over the same plane)
  add('plaster', B(5.3, Hh + 1.6, D + 0.6, tx - 0.15, (Hh + 1.6) / 2, 0));
  add('snow', RB(5.3, 0.45, D + 0.9, 0.18, tx, Hh + 1.75, 0));
  add('steel', B(5.4, 0.2, D + 1.0, tx, Hh + 1.5, 0), 0x3a3f46);

  // ---- the roof: a shallow gable along the length, deep eaves, rafters showing under them,
  // standing seams under a thick rounded load of snow, icicles off the front eave
  const rw = W + 3, rd = D + 4.2, rise = 2.6, slope = Math.atan2(rise, rd / 2), sl = Math.hypot(rd / 2, rise) + 0.25;
  for (const sd of [-1, 1]) {
    const slab = new THREE.BoxGeometry(rw, 0.32, sl);
    slab.rotateX(sd * slope); slab.translate(0, Hh + rise / 2 + 0.1, sd * rd / 4);
    add('roof', slab);
    const snow = new RoundedBoxGeometry(rw - 0.3, 0.6, sl - 0.2, 3, 0.26);
    snow.translate(0, 0.42, 0); snow.rotateX(sd * slope); snow.translate(0, Hh + rise / 2 + 0.1, sd * rd / 4);
    add('snow', snow);
    // fascia and the rafter tails
    add('larch', B(rw, 0.42, 0.2, 0, Hh - 0.02, sd * (rd / 2 + 0.06)), 0xb48a66);
    for (let k = -rw / 2 + 0.6; k < rw / 2; k += 1.2) add('larch', B(0.16, 0.24, 2.0, k, Hh - 0.2, sd * (D / 2 + 1.0)), 0x9a7454);
  }
  // the gable ends: timber triangles
  for (const sx of [-1, 1]) {
    const tri = new THREE.BufferGeometry();
    const yb = Hh, yt = Hh + rise;
    const v = sx > 0 ? [W / 2, yb, D / 2, W / 2, yb, -D / 2, W / 2, yt, 0] : [-W / 2, yb, -D / 2, -W / 2, yb, D / 2, -W / 2, yt, 0];
    tri.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); tri.computeVertexNormals();
    add('larch', tri);
  }
  // icicles along the front eave, longest where the snow overhangs most
  for (let k = -rw / 2 + 0.5; k < rw / 2 - 0.5; k += 0.35 + rnd() * 0.5) {
    if (rnd() < 0.25) continue;
    const L = 0.2 + rnd() * rnd() * 1.1;
    const g = new THREE.ConeGeometry(0.035 + rnd() * 0.04, L, 6).rotateX(Math.PI);
    g.translate(k, Hh - 0.2 - L / 2, rd / 2 + 0.12);
    K.add('ice', g);
  }
  // chimney, with a cap of snow
  add('stone', B(1.2, 3.4, 1.2, W / 2 - 5, Hh + 2.7, -2.5));
  add('steel', B(1.5, 0.12, 1.5, W / 2 - 5, Hh + 4.45, -2.5), 0x2b2f36);
  add('snow', RB(1.5, 0.3, 1.5, 0.12, W / 2 - 5, Hh + 4.6, -2.5));

  // ---- windows: deep-set, dark aluminium frames, sills (with snow on the upper ones), the
  // rooms behind the glass
  const roomsM = new THREE.MeshPhysicalMaterial({ map: roomsTex(), emissive: 0xffe2b0, emissiveIntensity: 0.32, roughness: 0.05, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.5 });
  roomsM.emissiveMap = roomsM.map;
  const panes = [];
  const win = (w, h, px, py, pz, face, sill = true) => {
    // face: +1 front (+z), -1 back, or 'x+' / 'x-' for the ends
    const along = typeof face === 'number';
    const q = new THREE.Quaternion().setFromAxisAngle(UP, along ? (face > 0 ? 0 : Math.PI) : face === 'x+' ? Math.PI / 2 : -Math.PI / 2);
    const at = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyQuaternion(q).add(new THREE.Vector3(px, py, pz));
    const put = (key, geo, tint) => { geo.applyQuaternion(q); const p = at(0, 0, 0); geo.translate(p.x, p.y, p.z); add(key, geo, tint); };
    const fc = 0x2c3036, t = 0.09;
    put('steel', B(w + 0.2, t, 0.16, 0, h / 2 + t / 2, 0.02), fc);
    put('steel', B(w + 0.2, t, 0.16, 0, -h / 2 - t / 2, 0.02), fc);
    for (const s of [-1, 1]) put('steel', B(t, h, 0.16, s * (w / 2 + t / 2), 0, 0.02), fc);
    put('steel', B(0.06, h, 0.06, w * 0.18, 0, 0.03), fc);
    if (sill) {
      put('steel', B(w + 0.36, 0.05, 0.3, 0, -h / 2 - 0.12, 0.14), 0xb9bec5);
      if (py > 4) put('snow', RB(w + 0.3, 0.12, 0.26, 0.05, 0, -h / 2 - 0.04, 0.15));
    }
    // the glass, set back, one of the four rooms behind it
    const g = new THREE.PlaneGeometry(w, h);
    const r = Math.floor(rnd() * 4), u0 = (r % 2) * 0.5, v0 = r < 2 ? 0.5 : 0;
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
    g.translate(0, 0, 0.005); g.applyQuaternion(q); const p = at(0, 0, 0); g.translate(p.x, p.y, p.z);
    panes.push(g);
  };
  for (let i = 0; i < 6; i++) {
    const wx = -W / 2 + 7 + i * 3.4;
    if (i < 2 || i > 3) win(2.2, 2.0, wx, 1.9, D / 2 + 0.02, 1);
    win(2.2, 1.9, wx, 5.9, D / 2 + 0.02, 1);
    win(2.2, 1.6, wx, 8.2, D / 2 + 0.02, 1);
    for (const fy of [1.9, 5.9, 8.2]) win(2.2, fy > 5 ? 1.7 : 2.0, wx, fy, -D / 2 - 0.02, -1);
  }
  for (let k = 0; k < 3; k++) win(2.0, 1.5, W / 2 + 0.02, 1.9 + k * 3.2, -3 + (k % 2) * 3, 'x+');
  // the stair tower's end: a column of stair windows, the lit cross high on it
  for (let k = 0; k < 3; k++) win(1.1, 2.3, -W / 2 - 0.3 - 0.02, 1.8 + k * 3.1, 2.6, 'x-');
  // the stair tower's tall slot of glass
  win(1.5, Hh - 1.4, tx, Hh / 2 + 0.7, D / 2 + 0.32, 1, false);
  const pm = new THREE.Mesh(mergeGeometries(panes), roomsM);
  pm.matrixAutoUpdate = false;

  // ---- the balcony along the first floor: larch deck, glass balustrade, steel rail
  const bW = W - 7.5, bx = 1.8;
  add('larch', B(bW, 0.22, 2.2, bx, 4.08, D / 2 + 1.1), 0xc29a74);
  add('snow', RB(bW - 0.2, 0.1, 2.0, 0.04, bx, 4.24, D / 2 + 1.1));
  K.add('glass', B(bW, 1.0, 0.03, bx, 4.75, D / 2 + 2.15));
  add('steel', B(bW + 0.1, 0.07, 0.12, bx, 5.28, D / 2 + 2.15), 0x8d939b);
  for (let k = 0; k <= 6; k++) add('steel', B(0.07, 1.1, 0.07, bx - bW / 2 + (k * bW) / 6, 4.75, D / 2 + 2.15), 0x8d939b);

  // ---- the entrance: a steel-and-glass porch under a thick white canopy with a red band,
  // the reception lit up inside it
  const pz0 = D / 2, pz1 = D / 2 + 5.2, pw = 9.4;
  add('concrete', B(pw, 0.12, 5.2, 0, 0.25, (pz0 + pz1) / 2), 0xe8e6e0);
  for (const sx of [-1, 1]) add('steel', B(0.16, 3.4, 0.16, sx * (pw / 2), 1.7, pz1), 0x30343a);
  for (let k = 1; k < 8; k++) add('steel', B(0.06, 3.3, 0.08, -pw / 2 + (k * pw) / 8, 1.7, pz1), 0x30343a);
  for (const sx of [-1, 1]) for (let k = 1; k < 4; k++) add('steel', B(0.08, 3.3, 0.06, sx * pw / 2, 1.7, pz0 + (k * 5.2) / 4), 0x30343a);
  add('steel', B(pw, 0.1, 0.1, 0, 3.35, pz1), 0x30343a);
  K.add('glass', B(pw, 3.3, 0.02, 0, 1.7, pz1));
  for (const sx of [-1, 1]) K.add('glass', B(0.02, 3.3, 5.2, sx * pw / 2, 1.7, (pz0 + pz1) / 2));
  // the canopy
  const cz = (pz0 + pz1) / 2 + 0.4, front = cz + 3.1;
  add('plaster', B(pw + 1.4, 0.6, 6.2, 0, 3.7, cz), 0xf4f3f0);
  add('paint', B(pw + 1.44, 0.56, 0.06, 0, 3.7, front + 0.03), 0xc8202a);
  for (const sx of [-1, 1]) add('paint', B(0.06, 0.56, 6.24, sx * (pw / 2 + 0.72), 3.7, cz), 0xc8202a);
  add('snow', RB(pw + 1.3, 0.3, 6.1, 0.12, 0, 4.1, cz));
  // downlights in its soffit
  for (const lx of [-3, 0, 3]) for (const lz of [pz0 + 1.5, pz1 - 0.5]) K.add('glow', new THREE.CylinderGeometry(0.16, 0.16, 0.04, 12).translate(lx, 3.39, lz));
  // inside: a pale floor, the reception desk, a sofa, ceiling panels, a plant
  add('paint', B(pw - 0.3, 0.02, 5.0, 0, 0.32, (pz0 + pz1) / 2), 0xd9d7d2);
  add('paint', RB(3.6, 1.1, 0.8, 0.08, -1.2, 0.86, pz0 + 1.6), 0xf2f2f2);
  add('larch', B(3.8, 0.06, 1.0, -1.2, 1.44, pz0 + 1.6), 0xd2aa80);
  add('paint', B(2.2, 0.45, 0.8, 3.0, 0.55, pz0 + 1.0), 0x2a6fb0);
  add('paint', B(2.2, 0.6, 0.2, 3.0, 0.9, pz0 + 0.65), 0x2a6fb0);
  add('paint', B(0.5, 0.5, 0.5, 3.6, 0.55, pz1 - 0.8), 0x4a4a4a);
  K.add('glow', B(pw - 1.0, 0.04, 0.5, 0, 3.32, pz0 + 1.2));
  K.add('glow', B(pw - 1.0, 0.04, 0.5, 0, 3.32, pz0 + 3.2));
  { const plant = new THREE.ConeGeometry(0.45, 1.4, 8); plant.translate(3.6, 1.5, pz1 - 0.8); add('paint', plant, 0x3f6b3a); }
  // the sliding doors: two leaves with steel frames, a red band across them
  for (const s of [-1, 1]) {
    add('steel', B(0.08, 2.6, 0.1, s * 1.6, 1.6, pz1 + 0.03), 0x30343a);
    add('steel', B(0.06, 2.6, 0.1, s * 0.02, 1.6, pz1 + 0.03), 0x30343a);
    add('paint', B(1.5, 0.12, 0.03, s * 0.8, 1.45, pz1 + 0.04), 0xc8202a);
  }
  add('steel', B(3.3, 0.12, 0.14, 0, 2.95, pz1 + 0.03), 0x30343a);

  // ---- the ambulance bay: a white wing to the side, its roller door, the van out front
  add('plaster', B(9, 4.6, 10, W / 2 + 4.5, 2.3, -1.5));
  add('steel', B(9.4, 0.25, 10.4, W / 2 + 4.5, 4.7, -1.5), 0x3a3f46);
  add('snow', RB(9.3, 0.45, 10.3, 0.18, W / 2 + 4.5, 5.0, -1.5));
  // roller door, horizontal slats
  for (let k = 0; k < 10; k++) add('steel', B(4.0, 0.3, 0.12, W / 2 + 5.2, 0.35 + k * 0.33, 3.55), k % 2 ? 0xb4bac2 : 0xa9afb7);
  add('steel', B(4.4, 0.2, 0.2, W / 2 + 5.2, 3.7, 3.58), 0x30343a);
  K.add('glow', B(1.2, 0.12, 0.2, W / 2 + 5.2, 3.95, 3.65));

  // ---- the terrace furniture: lamps, benches, planters with small spruces, a ski rack, flags
  for (const sx of [-11, -6, 6, 11]) {
    add('steel', new THREE.CylinderGeometry(0.07, 0.09, 3.6, 10).translate(sx, 1.8 + 0.2, D / 2 + 7.6), 0x2b2f36);
    add('steel', RB(0.7, 0.16, 0.36, 0.05, sx, 3.85, D / 2 + 7.6), 0x2b2f36);
    K.add('glow', B(0.6, 0.03, 0.28, sx, 3.76, D / 2 + 7.6));
  }
  for (const sx of [-9, 9]) {
    add('larch', B(2.2, 0.08, 0.55, sx, 0.65, D / 2 + 5.4), 0xc29a74);
    add('larch', B(2.2, 0.45, 0.06, sx, 0.98, D / 2 + 5.68), 0xc29a74);
    for (const e of [-0.9, 0.9]) add('steel', B(0.08, 0.5, 0.5, sx + e, 0.42, D / 2 + 5.4), 0x2b2f36);
  }
  for (const [px, pz] of [[-6.5, D / 2 + 5], [6.5, D / 2 + 5], [-W / 2 - 1.2, D / 2 + 3]]) {
    add('concrete', B(1.2, 0.8, 1.2, px, 0.55, pz), 0xd0cdc6);
    add('snow', RB(1.1, 0.12, 1.1, 0.05, px, 0.98, pz));
    for (const [h, r, y] of [[1.0, 0.55, 1.6], [0.8, 0.42, 2.1], [0.6, 0.28, 2.5]]) add('paint', new THREE.ConeGeometry(r, h, 8).translate(px, y, pz), 0x2d4a33);
  }
  // a ski rack with a few pairs left in it
  const rackX = 10.5, rackZ = D / 2 + 3.0;
  add('steel', B(2.6, 0.06, 0.06, rackX, 1.1, rackZ), 0x8d939b);
  for (const e of [-1.2, 1.2]) add('steel', B(0.06, 1.1, 0.06, rackX + e, 0.75, rackZ), 0x8d939b);
  const skiCols = [0xd8342c, 0x1d1f26, 0xf2b705, 0x2a7de1, 0x18a868];
  for (let k = 0; k < 5; k++) for (const o of [-0.05, 0.05]) {
    const g = B(0.08, 1.7, 0.02, rackX - 1.0 + k * 0.48 + o, 1.05, rackZ + 0.08);
    g.rotateX(0); add('paint', g, skiCols[k]);
  }
  // three flagpoles by the steps
  const flagTex = [
    canvasTex(256, 160, (c, w, h) => { c.fillStyle = '#ff8a3d'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 44px Helvetica, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('STOMPED', w / 2, h / 2); }),
    canvasTex(256, 160, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#d3232c'; c.fillRect(w / 2 - 22, h / 2 - 60, 44, 120); c.fillRect(w / 2 - 60, h / 2 - 22, 120, 44); }),
    canvasTex(256, 160, (c, w, h) => { c.fillStyle = '#1f4f9e'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 30px Helvetica, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SKI PATROL', w / 2, h / 2); }),
  ];
  const flags = [];
  [-12.4, -13.6, -14.8].forEach((fx, i) => {
    const fz = D / 2 + 6.2 + i * 0.35;
    add('steel', new THREE.CylinderGeometry(0.05, 0.07, 8, 8).translate(fx, 4.2, fz), 0xe8eaee);
    add('steel', new THREE.SphereGeometry(0.09, 8, 6).translate(fx, 8.25, fz), 0xd8b84a);
    // the cloth: a plane bent into a few folds (it waves: update())
    const fg = new THREE.PlaneGeometry(1.6, 1.0, 12, 4); fg.translate(0.8, 0, 0);
    const f = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: flagTex[i], side: THREE.DoubleSide, roughness: 0.8 }));
    f.position.set(fx, 7.6, fz);
    f.userData.base = fg.attributes.position.array.slice();
    f.userData.ph = i * 1.7;
    flags.push(f);
  });

  // ---- signs: the name on the timber, EMERGENCY on the canopy, the lit crosses
  const nameTex = canvasTex(1024, 128, (c, w, h) => {
    let fs = 84; c.font = `800 ${fs}px Helvetica, Arial`;
    const t = 'SUMMIT MOUNTAIN CLINIC';
    while (c.measureText(t).width > w - 30) { fs -= 4; c.font = `800 ${fs}px Helvetica, Arial`; }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillText(t, w / 2 + 3, h / 2 + 7);
    c.fillStyle = '#ffffff'; c.fillText(t, w / 2, h / 2 + 4);
  });
  const emTex = canvasTex(512, 64, (c, w, h) => {
    c.fillStyle = '#c8202a'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.font = 'bold 46px Helvetica, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('EMERGENCY', w / 2, h / 2 + 2);
  });
  const crossTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#d3232c'; c.fillRect(w * 0.36, h * 0.1, w * 0.28, h * 0.8); c.fillRect(w * 0.1, h * 0.36, w * 0.8, h * 0.28);
  });
  const ambTex = canvasTex(512, 64, (c, w, h) => { c.fillStyle = '#fff'; c.font = 'bold 44px Helvetica, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('AMBULANCE', w / 2, h / 2 + 2); });
  const signM = (map, k) => new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.5, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: k });
  const signs = [];
  const plane = (w, h, mat, px, py, pz, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(px, py, pz); m.rotation.y = ry; signs.push(m); return m; };
  plane(12, 1.5, signM(nameTex, 0.45), 1.5, Hh - 1.05, D / 2 + 0.05);
  plane(4.4, 0.55, signM(emTex, 0.8), 0, 3.7, front + 0.07);
  plane(4.0, 0.5, signM(ambTex, 0.3), W / 2 + 5.2, 4.25, 3.56);
  const crossM = signM(crossTex, 1.1); crossM.transparent = false;
  // the cross: a light box on the tower top, front and side, and a small one over the doors
  add('paint', B(3.0, 3.0, 0.5, tx, Hh + 3.6, D / 2 - 1.5), 0xf4f4f4);
  plane(2.8, 2.8, crossM, tx, Hh + 3.6, D / 2 - 1.24);
  plane(2.8, 2.8, crossM, tx, Hh + 3.6, D / 2 - 1.76, Math.PI);
  add('steel', B(0.12, 1.8, 0.12, tx, Hh + 2.0, D / 2 - 1.5), 0x30343a);
  add('paint', B(0.3, 2.4, 2.4, -W / 2 - 0.45, Hh - 1.6, -2.6), 0xf4f4f4);
  plane(2.2, 2.2, crossM, -W / 2 - 0.61, Hh - 1.6, -2.6, -Math.PI / 2);
  add('paint', B(1.3, 1.3, 0.3, 0, 4.75, pz1 + 0.2), 0xf4f4f4);
  plane(1.2, 1.2, crossM, 0, 4.75, pz1 + 0.36);

  // ---- put it all on the mountain
  const grp = new THREE.Group();
  grp.position.set(x, floor, z); grp.rotation.y = yaw;
  K.build(mats, grp);
  grp.add(pm, ...signs, ...flags);
  const amb = ambulance();
  amb.position.set(W / 2 + 5.2, 0, 8.2); amb.rotation.y = Math.PI * 0.94;
  grp.add(amb);
  scene.add(grp);

  // ---- the helipad: a steel deck up on columns beside the building, its safety net shelf,
  // the H in its circle, edge lights, two floodlights and the windsock
  const pad = new THREE.Vector3(W / 2 + 22, 0, 2).applyAxisAngle(UP, yaw).add(new THREE.Vector3(x, 0, z));
  let top = -Infinity;
  for (let a = -11; a <= 11; a += 2.75) for (let b = -11; b <= 11; b += 2.75) top = Math.max(top, heightAt(pad.x + a, pad.z + b));
  pad.y = top + 1.6;
  const P = new Kit();
  const padTex = canvasTex(1024, 1024, (c, w, h) => {
    c.fillStyle = '#4f5359'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) { c.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.05})`; c.fillRect(rnd() * w, rnd() * h, 3 + rnd() * 12, 3 + rnd() * 12); }
    // anti-slip panels
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 3;
    for (let k = 1; k < 8; k++) { c.beginPath(); c.moveTo((k * w) / 8, 0); c.lineTo((k * w) / 8, h); c.stroke(); c.beginPath(); c.moveTo(0, (k * h) / 8); c.lineTo(w, (k * h) / 8); c.stroke(); }
    c.strokeStyle = '#f2f2f2'; c.lineWidth = 14; c.strokeRect(20, 20, w - 40, h - 40);
    c.strokeStyle = '#ffd21e'; c.lineWidth = 30; c.beginPath(); c.arc(w / 2, h / 2, w * 0.36, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#fff'; c.font = 'bold 520px Helvetica, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', w / 2, h / 2 + 30);
    c.fillStyle = '#d3232c'; c.fillRect(w * 0.43, h * 0.07, w * 0.14, h * 0.05);
    c.fillStyle = '#fff'; c.font = 'bold 54px Helvetica, Arial'; c.fillText('3.8', w * 0.82, h * 0.86);
  });
  const deckM = new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.82 });
  const deckTop = new THREE.Mesh(new THREE.PlaneGeometry(21, 21).rotateX(-Math.PI / 2), deckM);
  deckTop.position.set(0, 0.01, 0); deckTop.receiveShadow = true;
  P.add('steel', B(21.4, 0.6, 21.4, 0, -0.3, 0), { tint: 0x5a6068 });
  P.add('steel', B(21.6, 0.18, 0.18, 0, 0.05, 10.75), { tint: 0xd8b84a }); P.add('steel', B(21.6, 0.18, 0.18, 0, 0.05, -10.75), { tint: 0xd8b84a });
  P.add('steel', B(0.18, 0.18, 21.6, 10.75, 0.05, 0), { tint: 0xd8b84a }); P.add('steel', B(0.18, 0.18, 21.6, -10.75, 0.05, 0), { tint: 0xd8b84a });
  // the safety net shelf all round, sloping out and up
  const netTex = canvasTex(128, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.strokeStyle = '#1d2026'; c.lineWidth = 3;
    for (let k = 0; k <= 8; k++) { c.beginPath(); c.moveTo((k * w) / 8, 0); c.lineTo((k * w) / 8, h); c.stroke(); c.beginPath(); c.moveTo(0, (k * h) / 8); c.lineTo(w, (k * h) / 8); c.stroke(); }
  });
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping; netTex.repeat.set(16, 1.2);
  const netM = new THREE.MeshStandardMaterial({ map: netTex, alphaTest: 0.4, transparent: false, side: THREE.DoubleSide, roughness: 0.8 });
  const nets = [];
  for (let s = 0; s < 4; s++) {
    const g = new THREE.PlaneGeometry(21.4, 1.6).rotateX(-Math.PI / 2 + 0.18).translate(0, 0.1, 10.7 + 0.8);
    g.rotateY((s * Math.PI) / 2);
    nets.push(g);
    for (let k = -10; k <= 10; k += 2.5) { const arm = B(0.06, 0.06, 1.7, k, -0.05, 11.5); arm.rotateY((s * Math.PI) / 2); P.add('steel', arm, { tint: 0x5a6068 }); }
  }
  const netMesh = new THREE.Mesh(mergeGeometries(nets), netM);
  // columns down to the snow, with bracing
  const colsAt = [];
  for (const a of [-9, 0, 9]) for (const b of [-9, 0, 9]) colsAt.push([a, b]);
  for (const [a, b] of colsAt) {
    const wp = new THREE.Vector3(a, 0, b).applyAxisAngle(UP, yaw).add(pad);
    const ground = heightAt(wp.x, wp.z) - 0.5;
    const L = pad.y - 0.6 - ground;
    if (L <= 0.1) continue;
    P.add('steel', new THREE.CylinderGeometry(0.28, 0.28, L, 12).translate(a, -0.6 - L / 2, b), { tint: 0x70767e });
    P.add('concrete', B(1.1, 0.6, 1.1, a, -0.6 - L + 0.1, b), { tint: 0xc9c6bf, size: 3 });
  }
  // the beams under the deck
  for (const a of [-9, 0, 9]) { P.add('steel', B(0.3, 0.5, 19, a, -0.85, 0), { tint: 0x5a6068 }); P.add('steel', B(19, 0.5, 0.3, 0, -0.85, a), { tint: 0x5a6068 }); }
  // edge lights (green), floodlights on two masts, the windsock
  for (let k = 0; k < 20; k++) {
    const s = Math.floor(k / 5), t = ((k % 5) / 5 - 0.4) * 20;
    const p = new THREE.Vector3(t, 0.12, 10.35).applyAxisAngle(UP, (s * Math.PI) / 2);
    P.add('glowG', new THREE.CylinderGeometry(0.11, 0.13, 0.2, 8).translate(p.x, p.y, p.z));
  }
  for (const [a, b] of [[-10.6, -10.6], [10.6, 10.6]]) {
    P.add('steel', new THREE.CylinderGeometry(0.08, 0.1, 4.5, 8).translate(a, 2.25, b), { tint: 0x70767e });
    P.add('steel', RB(0.8, 0.5, 0.4, 0.06, a, 4.6, b), { tint: 0x2b2f36 });
    P.add('glow', B(0.66, 0.36, 0.05, a - Math.sign(a) * 0.2 * 0, 4.6, b - Math.sign(b) * 0.22));
  }
  const sockAt = new THREE.Vector3(-10.4, 0, 10.4);
  P.add('steel', new THREE.CylinderGeometry(0.05, 0.08, 5.0, 8).translate(sockAt.x, 2.5, sockAt.z), { tint: 0xe8eaee });
  P.add('glowR', new THREE.SphereGeometry(0.1, 8, 6).translate(sockAt.x, 5.1, sockAt.z));
  // stairs up from the snow on the building side
  const stairs = new THREE.Vector3(-12, 0, 0);
  {
    const drop = pad.y - (heightAt(...(() => { const w = stairs.clone().applyAxisAngle(UP, yaw).add(pad); return [w.x, w.z]; })()));
    const n = Math.max(2, Math.ceil(drop / 0.2));
    for (let k = 0; k < n; k++) P.add('steel', B(1.4, 0.06, 0.3, -11.2 - k * 0.27, -0.2 - k * (drop / n), -6), { tint: 0x8d939b });
  }
  const pg = new THREE.Group();
  pg.position.copy(pad); pg.rotation.y = yaw;
  const padMats = { steel: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5, metalness: 0.6 }), concrete: mats.concrete,
    glow: new THREE.MeshStandardMaterial({ color: 0xfff6e6, emissive: 0xfff0d0, emissiveIntensity: 2.2, vertexColors: true }),
    glowG: new THREE.MeshStandardMaterial({ color: 0xc8ff9a, emissive: 0x7dff4a, emissiveIntensity: 1.8, vertexColors: true }),
    glowR: new THREE.MeshStandardMaterial({ color: 0xff6a5a, emissive: 0xff2a1a, emissiveIntensity: 2, vertexColors: true }) };
  P.build(padMats, pg);
  pg.add(deckTop, netMesh);
  const sockTex = canvasTex(256, 64, (c, w, h) => { for (let k = 0; k < 5; k++) { c.fillStyle = k % 2 ? '#ffffff' : '#ff5a12'; c.fillRect((k * w) / 5, 0, w / 5 + 1, h); } });
  const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.42, 2.4, 14, 1, true).rotateZ(Math.PI / 2).translate(1.2, 0, 0), new THREE.MeshStandardMaterial({ map: sockTex, side: THREE.DoubleSide, roughness: 0.8 }));
  sock.position.set(sockAt.x, 4.7, sockAt.z); sock.rotation.set(0, 0.6, -0.25);
  pg.add(sock);
  scene.add(pg);

  forest.addCollider(x, z, Math.max(W, D) * 0.58, 'chalet');
  // (its terrace follows each park's ground, so each park has its own bake)
  bakeable('clinic_' + PARK_ID, [grp, pg], { ground: [x, z, 70] });
  const out = new THREE.Vector3(0, 0, 1).applyAxisAngle(UP, yaw);
  return {
    info: { at: new THREE.Vector3(x, floor, z), door: new THREE.Vector3(0, floor, D / 2 + 5.4).applyAxisAngle(UP, yaw).add(new THREE.Vector3(x, 0, z)), out, pad: pad.clone().setY(pad.y + 0.02), yaw },
    sock, flags,
  };
}

// the flags on the terrace stir in the wind
export function waveFlags(flags, t) {
  for (const f of flags) {
    const p = f.geometry.attributes.position, b = f.userData.base;
    for (let i = 0; i < p.count; i++) {
      const x = b[i * 3], k = x / 1.6;
      p.setZ(i, Math.sin(t * 3.2 + x * 3.1 + f.userData.ph) * 0.16 * k);
      p.setY(i, b[i * 3 + 1] - k * k * 0.12);
    }
    p.needsUpdate = true;
  }
}
