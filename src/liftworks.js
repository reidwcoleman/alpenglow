// The Shredline Express's steelwork: towers and the two terminals.
//   Towers: a tapered tube on a concrete footing with snow on it, flanged joints, the head and
//   crossarm with a grated catwalk and yellow rails, a sheave train each side (rubber-lined
//   wheels between side plates on a rocking beam), a caged ladder and the tower's number, the
//   padding round its foot and snow caught on the head, catwalk and beams.
//   Terminals: a long rounded canopy over the bullwheel on raked steel legs, the line's name
//   along both sides, the loading conveyor with its gates and the yellow load line, a rope maze,
//   the operator's glass cabin, lamps, and snow banked against the concrete.
// Everything goes into one Kit per material (clinic.js), so the whole lift is a few draws.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { concrete, surface } from './proctex.js';
import { Kit } from './clinic.js';

const B = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const RB = (w, h, d, r, x, y, z) => new RoundedBoxGeometry(w, h, d, 2, r).translate(x, y, z);
const CY = (r0, r1, h, seg, x, y, z) => new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z);
const tubeX = (r, len, x, y, z, seg = 10) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2).translate(x, y, z);
const tubeZ = (r, len, x, y, z, seg = 10) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2).translate(x, y, z);

const STEEL = 0x8a9099, DARK = 0x23262b, YEL = 0xf2c230, WHITE = 0xeef0f3, BLUE = 0x1f5a9e;

export function liftMaterials() {
  return {
    steel: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.42, metalness: 0.72 }),
    paint: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5, metalness: 0.15 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85 }),
    concrete: surface(concrete),
    snow: new THREE.MeshStandardMaterial({ color: 0xf3f6fb, vertexColors: true, roughness: 0.72 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x9fbdd2, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.38, envMapIntensity: 1.6, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }),
    glow: new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xffe6b8, emissiveIntensity: 1.6, vertexColors: true }),
    plate: new THREE.MeshStandardMaterial({ map: numberAtlas(), roughness: 0.5 }),
  };
}

// the tower numbers 1..32 in one texture (an 8 x 4 grid), white plates with black numbers
let atlas = null;
function numberAtlas() {
  if (atlas) return atlas;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  for (let i = 0; i < 32; i++) {
    const x = (i % 8) * 128, y = Math.floor(i / 8) * 128;
    g.fillStyle = '#f4f4f2'; g.fillRect(x, y, 128, 128);
    g.strokeStyle = '#1d1f24'; g.lineWidth = 6; g.strokeRect(x + 6, y + 6, 116, 116);
    g.fillStyle = '#1d1f24'; g.font = 'bold 72px Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(i + 1), x + 64, y + 68);
  }
  atlas = new THREE.CanvasTexture(c); atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 8;
  return atlas;
}

// put one piece into the kit, placed in the world (q, at)
const placer = (K, q, at) => (key, geo, tint, opts = {}) => { geo.applyQuaternion(q); geo.translate(at.x, at.y, at.z); return K.add(key, geo, { tint, ...opts }); };

// a line tower, H to the cable; num is its number on the line. Every tower is the same steel,
// so it's built once and stamped where each one stands (only the number plates differ)
const towerCache = new Map();
export function tower(K, H, q, at, num) {
  if (!towerCache.has(H)) {
    const T = new Kit();
    towerParts(T, H, new THREE.Quaternion(), new THREE.Vector3());
    towerCache.set(H, T.merged());
  }
  for (const [key, g] of Object.entries(towerCache.get(H))) K.addRaw(key, g.clone().applyQuaternion(q).translate(at.x, at.y, at.z));
  const put = placer(K, q, at);
  // its number, both ways
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(0.55, 0.55);
    if (s < 0) g.rotateY(Math.PI);
    const i = (num - 1) % 32, uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, ((i % 8) + uv.getX(k)) / 8, 1 - (Math.floor(i / 8) + 1 - uv.getY(k)) / 4);
    g.translate(0, 2.6, s * 0.43 + (s > 0 ? 0.02 : -0.02));
    put('plate', g, 0xffffff, { uv: true });
  }
}

function towerParts(K, H, q, at) {
  const put = placer(K, q, at);
  put('concrete', B(2.2, 1.6, 2.2, 0, 0.0, 0), 0xd2cfc8, { size: 3 });
  put('snow', RB(2.3, 0.3, 2.3, 0.12, 0, 0.88, 0));
  put('steel', CY(0.64, 0.64, 0.12, 16, 0, 0.86, 0), STEEL);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; put('steel', CY(0.035, 0.035, 0.22, 6, Math.cos(a) * 0.52, 0.98, Math.sin(a) * 0.52), DARK); }
  put('steel', CY(0.3, 0.48, H, 18, 0, 0.8 + H / 2 - 0.4, 0), STEEL);
  for (let y = 3.2; y < H - 1; y += 3.2) put('steel', CY(0.42 - y * 0.012, 0.42 - y * 0.012, 0.09, 18, 0, y, 0), 0x7a8089);
  // head and crossarm
  put('steel', RB(0.9, 0.8, 0.9, 0.08, 0, H + 0.4, 0), STEEL);
  put('steel', tubeX(0.2, 5.9, 0, H + 0.62, 0, 14), STEEL);
  // catwalk along the crossarm, its yellow rails
  put('steel', B(5.6, 0.05, 0.75, 0, H + 0.38, 0.62), 0x5c6168);
  for (const z of [0.98, 0.26]) put('paint', tubeX(0.03, 5.6, 0, H + 1.38, z, 6), YEL);
  for (let k = -2.7; k <= 2.7; k += 0.9) put('paint', CY(0.025, 0.025, 1.0, 6, k, H + 0.88, 0.98), YEL);
  // a sheave train each side: rocking beam, side plates, six rubber-lined wheels, the hub caps
  for (const sx of [-2.4, 2.4]) {
    put('steel', B(0.2, 0.26, 2.9, sx, H + 0.4, 0), 0x4a4f57);
    for (const px of [-0.09, 0.09]) put('steel', B(0.02, 0.34, 2.75, sx + px, H + 0.16, 0), 0xb9bec5);
    for (let k = 0; k < 6; k++) {
      const z = -1.05 + k * 0.42;
      put('rubber', tubeX(0.19, 0.11, sx, H + 0.11, z, 16), 0x1a1c20);
      put('steel', tubeX(0.08, 0.2, sx, H + 0.11, z, 10), 0xc9ced4);
    }
    // the hanger the beam rocks on
    put('steel', B(0.16, 0.5, 0.2, sx, H + 0.62, 0), 0x4a4f57);
  }
  // the ladder up the downhill side, its safety cage hoops
  for (let y = 1.2; y < H; y += 0.42) put('steel', B(0.44, 0.04, 0.04, 0, y, -0.5), 0x3a3f46);
  for (const sx of [-0.22, 0.22]) put('steel', B(0.04, H - 0.8, 0.04, sx, (H + 0.8) / 2 + 0.2, -0.5), 0x3a3f46);
  for (let y = 3; y < H; y += 0.9) put('steel', new THREE.TorusGeometry(0.36, 0.02, 4, 12, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI).translate(0, y, -0.5), 0x3a3f46);
  // the lightning rod
  put('steel', CY(0.015, 0.03, 2.4, 5, 0, H + 1.9, -0.25), 0x9a9da3);
  // the padding wrapped round the foot of the tube (two straps), snow caught on the head, the
  // catwalk grating and the sheave beams
  put('rubber', CY(0.64, 0.64, 2.3, 20, 0, 0.98 + 1.15, 0), 0x2b5fae);
  put('rubber', CY(0.66, 0.66, 0.36, 20, 0, 2.55, 0), 0xe9ecef);
  for (const y of [1.45, 2.95]) put('rubber', new THREE.TorusGeometry(0.645, 0.025, 4, 20).rotateX(Math.PI / 2).translate(0, y, 0), 0x1a1c20);
  put('snow', RB(0.98, 0.16, 0.98, 0.07, 0, H + 0.86, 0));
  put('snow', RB(5.4, 0.07, 0.62, 0.03, 0, H + 0.44, 0.62));
  put('snow', RB(0.36, 0.08, 5.6, 0.04, 0, H + 0.86, 0).rotateY(Math.PI / 2));
  for (const sx of [-2.4, 2.4]) put('snow', RB(0.24, 0.07, 2.7, 0.03, sx, H + 0.56, 0));
}

// a terminal: back = which end the bullwheel is (+1 / -1 along the line); signs get the line's
// name planes (one material, added by the caller)
export function terminal(K, H, q, at, back) {
  const put = placer(K, q, at);
  // the concrete it all stands on, snow banked against it
  put('concrete', B(12, 3.2, 22, 0, -1.3, back * 2), 0xd8d5ce, { size: 3 });
  for (let s = -10; s < 12; s += 1.2 + Math.random() * 0.6) for (const sx of [-1, 1]) {
    const r = 0.8 + Math.random() * 0.7;
    const g = new THREE.SphereGeometry(r, 10, 6).scale(1.2, 0.5, 1.6).translate(sx * (6.2 + Math.random() * 0.4), 0.15, back * 2 + s);
    put('snow', g);
  }
  // raked legs: two A-frames under the canopy
  for (const zz of [back * 1.5, back * 7.5]) for (const sx of [-1, 1]) {
    const leg = new THREE.CylinderGeometry(0.22, 0.3, H + 1.4, 12);
    leg.rotateZ(sx * 0.12); leg.translate(sx * (2.2 + 0.08 * (H + 1.4) / 2), (H + 1.4) / 2 - 0.2, zz);
    put('steel', leg, STEEL);
  }
  put('steel', tubeX(0.18, 5.6, 0, H + 1.0, back * 1.5, 12), STEEL);
  put('steel', tubeX(0.18, 5.6, 0, H + 1.0, back * 7.5, 12), STEEL);
  // the canopy: a long rounded shell, white over a blue skirt, snow on its back
  const shape = new THREE.Shape();
  const w = 4.4, h = 2.6, r = 1.15;
  shape.moveTo(-w + r, -h / 2); shape.lineTo(w - r, -h / 2); shape.quadraticCurveTo(w, -h / 2, w, -h / 2 + r); shape.lineTo(w, h / 2 - r);
  shape.quadraticCurveTo(w, h / 2, w - r, h / 2); shape.lineTo(-w + r, h / 2); shape.quadraticCurveTo(-w, h / 2, -w, h / 2 - r); shape.lineTo(-w, -h / 2 + r); shape.quadraticCurveTo(-w, -h / 2, -w + r, -h / 2);
  const L = 15;
  const shell = new THREE.ExtrudeGeometry(shape, { depth: L, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.6, bevelSegments: 4, curveSegments: 10 });
  shell.translate(0, H + 2.4, back * 4.5 - L / 2);
  // two-tone by height: a blue band low down
  {
    const g = put('paint', shell, 0xffffff);
    const ca = g.attributes.color, pa = g.attributes.position, c = new THREE.Color();
    for (let i = 0; i < pa.count; i++) { c.set(pa.getY(i) < at.y + H + 2.15 ? BLUE : WHITE); ca.setXYZ(i, c.r, c.g, c.b); }
  }
  put('snow', RB(7.6, 0.5, L + 0.4, 0.22, 0, H + 3.95, back * 4.5));
  // the bullwheel under it and the drive housing over the wheel
  put('rubber', new THREE.TorusGeometry(2.4, 0.16, 8, 40).rotateX(Math.PI / 2).translate(0, H + 0.3, back * 8), DARK);
  for (let k = 0; k < 6; k++) put('steel', new THREE.BoxGeometry(4.8, 0.09, 0.09).rotateY((k * Math.PI) / 6).translate(0, H + 0.3, back * 8), 0x5c6168);
  put('steel', CY(0.45, 0.45, 0.6, 16, 0, H + 0.7, back * 8), 0x5c6168);
  put('steel', RB(2.6, 1.0, 2.6, 0.12, 0, H + 1.3, back * 8), 0x6b717a);
  // the loading (or unloading) platform, the conveyor, the gates, the yellow line
  put('concrete', B(6.5, 0.5, 10, 0, 0.5, -back * 3), 0xdedbd4, { size: 3 });
  put('concrete', B(6.5, 0.2, 4, 0, 0.3, -back * 9.6).rotateX(0), 0xdedbd4, { size: 3 });
  put('rubber', B(3.6, 0.08, 5.5, 0, 0.79, -back * 1.8), 0x24272c);
  for (const sx of [-1.86, 1.86]) put('paint', B(0.12, 0.1, 5.5, sx, 0.8, -back * 1.8), YEL);
  put('paint', B(3.6, 0.02, 0.18, 0, 0.84, -back * 0.2), YEL);
  put('paint', B(3.6, 0.02, 0.12, 0, 0.84, -back * 4.4), 0xd8342c);
  for (let k = 0; k < 4; k++) {
    const gx = -1.35 + k * 0.9;
    put('steel', B(0.06, 1.0, 0.06, gx - 0.4, 1.25, -back * 4.8), 0x8d939b);
    put('paint', B(0.7, 0.08, 0.04, gx, 1.5, -back * 4.8), YEL);
  }
  // the rope maze: posts and taut ropes
  for (let row = 0; row < 3; row++) {
    const z = -back * (6.2 + row * 1.3);
    for (const sx of [-2.6, 2.6]) put('steel', CY(0.04, 0.05, 1.0, 6, sx, 1.25, z), 0x2b2f36);
    put('paint', B(5.2, 0.03, 0.03, 0, 1.68, z), BLUE);
  }
  // the operator's cabin: glass all round under a flat roof with snow on it, a desk inside
  const hx = 5.4, hz = -back * 2.5;
  put('concrete', B(3.4, 0.3, 3.4, hx, 0.9, hz), 0xcfccc5, { size: 3 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put('steel', B(0.1, 2.5, 0.1, hx + sx * 1.6, 2.3, hz + sz * 1.6), 0x30343a);
  put('steel', B(3.4, 0.6, 3.4, hx, 1.3, hz), 0x3a3f46);
  K.add('glass', B(3.2, 1.9, 3.2, hx, 2.55, hz).applyQuaternion(q).translate(at.x, at.y, at.z));
  put('steel', B(3.8, 0.3, 3.8, hx, 3.65, hz), 0x2b2f36);
  put('snow', RB(3.7, 0.3, 3.7, 0.12, hx, 3.92, hz));
  put('paint', B(1.6, 0.08, 0.7, hx, 2.05, hz + 0.8), 0xc9a27a);
  put('paint', B(0.6, 0.4, 0.05, hx, 2.35, hz + 1.05), 0x1a2a3a);
  // lamps at the platform corners
  for (const [lx, lz] of [[-3.0, -back * 0.8], [3.0, -back * 7.5]]) {
    put('steel', CY(0.06, 0.08, 4.0, 8, lx, 2.6, lz), 0x2b2f36);
    put('steel', RB(0.6, 0.15, 0.3, 0.05, lx, 4.65, lz), 0x2b2f36);
    K.add('glow', B(0.5, 0.03, 0.22, lx, 4.56, lz).applyQuaternion(q).translate(at.x, at.y, at.z));
  }
}
