// Snow-laden spruces, drawn: each tree is whorls of drooping branch cards textured with a
// needle bough painted at boot (canvas), snow lying in clumps on the boughs' upper faces, a
// dark core so the crown reads dense. Three LODs (bough cards / fewer, wider cards / opaque
// tiered skirts), instanced per variant and re-sorted by distance when the camera moves.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

export const SPRUCE_H = 16; // geometry height (m); instances scale to their own height
const VARIANTS = 4;

// ---------- the painted bough (needles) + where snow settles on it ----------
function boughTextures() {
  const W = 256, H = 512;
  const rnd = mulberry32(7);
  const half = (t) => W * 0.46 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.04)), 0.65) * (1 - 0.3 * t);
  const sx = (t) => W / 2 + Math.sin(t * 3.1) * 5;
  const sy = (t) => H - 6 - t * (H - 14);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.lineCap = 'round';
  const line = (x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  const PAL = [
    ['#0c1d15', '#11261b', '#152d20'],
    ['#1a3826', '#1f402b', '#244530', '#1c3a2e'],
    ['#2f5a3c', '#3a6544', '#2d5640', '#456e4a'],
  ];
  // twigs off the stem, needles off the twigs; dark fill first, lit tips last
  const twigs = [];
  for (let t = 0.02; t < 0.97; t += 0.024 + rnd() * 0.01) {
    for (const side of [-1, 1]) {
      const L = Math.min(half(t) * (0.7 + rnd() * 0.35), W / 2 - 10);
      const a = 0.5 + rnd() * 0.35;
      twigs.push({ x: sx(t), y: sy(t), dx: Math.sin(a) * side, dy: -Math.cos(a), L, t });
    }
  }
  g.strokeStyle = '#2b2119'; g.lineWidth = 3;
  for (let t = 0; t < 0.98; t += 0.02) line(sx(t), sy(t), sx(t + 0.02), sy(t + 0.02));
  g.lineWidth = 1.4;
  for (const w of twigs) line(w.x, w.y, w.x + w.dx * w.L, w.y + w.dy * w.L);
  for (let pass = 0; pass < 3; pass++) {
    const lw = [2.4, 1.8, 1.3][pass];
    for (const w of twigs) {
      const n = Math.max(3, (w.L / (pass === 2 ? 3.4 : 2.3)) | 0);
      for (let k = 0; k < n; k++) {
        const f = k / n;
        if (pass === 2 && (f < 0.35 || rnd() < 0.45)) continue;
        const px = w.x + w.dx * w.L * f, py = w.y + w.dy * w.L * f;
        for (const s of [-1, 1]) {
          const ang = Math.atan2(w.dy, w.dx) + s * (0.55 + rnd() * 0.5);
          const len = (6 + rnd() * 6) * (1 - 0.45 * f) * (pass === 0 ? 1.15 : 1);
          const pal = PAL[pass];
          g.strokeStyle = pal[(rnd() * pal.length) | 0];
          g.lineWidth = lw;
          line(px, py, px + Math.cos(ang) * len, py + Math.sin(ang) * len);
        }
      }
      // the twig's tip tuft
      g.strokeStyle = PAL[Math.min(2, pass + 1)][0];
      const ex = w.x + w.dx * w.L, ey = w.y + w.dy * w.L;
      for (let k = 0; k < 3; k++) {
        const ang = Math.atan2(w.dy, w.dx) + (rnd() - 0.5) * 1.2;
        line(ex, ey, ex + Math.cos(ang) * 6, ey + Math.sin(ang) * 6);
      }
    }
  }
  // needles around the stem tip
  g.strokeStyle = PAL[1][1]; g.lineWidth = 1.6;
  for (let k = 0; k < 40; k++) {
    const t = 0.9 + rnd() * 0.09, ang = -Math.PI / 2 + (rnd() - 0.5) * 2.2;
    line(sx(t), sy(t), sx(t) + Math.cos(ang) * 9, sy(t) + Math.sin(ang) * 9);
  }

  // snow: soft lumps along the stem where the bough is flat, scattered pads on the twigs
  const raw = document.createElement('canvas'); raw.width = W; raw.height = H;
  const s = raw.getContext('2d');
  s.fillStyle = '#000'; s.fillRect(0, 0, W, H);
  const blob = (x, y, rx, ry, v) => {
    const gr = s.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    gr.addColorStop(0, `rgba(255,255,255,${v})`); gr.addColorStop(0.6, `rgba(255,255,255,${v * 0.7})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    s.fillStyle = gr;
    s.save(); s.translate(x, y); s.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); s.translate(-x, -y);
    s.beginPath(); s.arc(x, y, Math.max(rx, ry), 0, Math.PI * 2); s.fill(); s.restore();
  };
  for (let t = 0.05; t < 0.9; t += 0.03) blob(sx(t) + (rnd() - 0.5) * 10, sy(t), half(t) * (0.45 + rnd() * 0.4), 18 + rnd() * 10, 0.75 + rnd() * 0.25);
  for (let k = 0; k < 90; k++) {
    const t = 0.05 + rnd() * 0.85;
    blob(sx(t) + (rnd() - 0.5) * 2 * half(t) * 0.8, sy(t) + (rnd() - 0.5) * 20, 8 + rnd() * 16, 6 + rnd() * 10, 0.5 + rnd() * 0.5);
  }
  const sc = document.createElement('canvas'); sc.width = W; sc.height = H;
  const s2 = sc.getContext('2d');
  s2.filter = 'blur(3px)';
  s2.drawImage(raw, 0, 0);

  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const snow = new THREE.CanvasTexture(sc);
  snow.anisotropy = 8;
  return { map, snow };
}

// ---------- geometry ----------
class Builder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.s = []; this.i = []; }
  v(x, y, z, nx, ny, nz, u, w, ao, sn) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, w); this.c.push(ao, ao, ao); this.s.push(sn);
    return this.p.length / 3 - 1;
  }
  geo(withUv) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    if (withUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aSnow', new THREE.Float32BufferAttribute(this.s, 1));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

// crown radius at height y for a tree of the given shape
const crownR = (sh, y) => {
  const f = (y - sh.y0) / (SPRUCE_H - sh.y0);
  return sh.R * Math.pow(Math.max(0, 1 - f), sh.taper) + 0.15;
};

function shapeFor(v) {
  const rnd = mulberry32(31 + v * 17);
  return {
    rnd,
    y0: [1.0, 2.6, 0.6, 3.4][v],
    R: [3.3, 3.0, 3.8, 2.7][v],
    taper: [1.0, 0.9, 1.08, 0.95][v],
    gap: [0.58, 0.66, 0.54, 0.7][v],
    snow: [0.95, 0.8, 1.0, 0.85][v],
  };
}

function addTrunk(b, sh, top) {
  const N = 6, r0 = 0.26, r1 = 0.05;
  const ring = (y, r) => [...Array(N)].map((_, k) => {
    const a = (k / N) * Math.PI * 2;
    return b.v(Math.cos(a) * r, y, Math.sin(a) * r, Math.cos(a), 0, Math.sin(a), -2, 0, 1, 0);
  });
  const lo = ring(-0.4, r0), hi = ring(top, r1);
  for (let k = 0; k < N; k++) { const k1 = (k + 1) % N; b.i.push(lo[k], hi[k], lo[k1], lo[k1], hi[k], hi[k1]); }
}

// a dark, jagged cone inside the crown so it reads as a dense mass, not a lattice
function addCore(b, sh, segs, sc = 0.3) {
  const rnd = sh.rnd;
  const rows = 6, ring = [];
  for (let j = 0; j <= rows; j++) {
    const y = sh.y0 + 0.3 + (SPRUCE_H * 0.96 - sh.y0) * (j / rows);
    const r = crownR(sh, y) * sc * (j === rows ? 0 : 1);
    const row = [];
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2 + j * 0.4;
      const rr = r * (0.8 + rnd() * 0.4);
      row.push(b.v(Math.cos(a) * rr, y, Math.sin(a) * rr, Math.cos(a) * 0.8, 0.6, Math.sin(a) * 0.8, -1, 0, 0.5 + 0.3 * j / rows, 0.15));
    }
    ring.push(row);
  }
  for (let j = 0; j < rows; j++) for (let k = 0; k < segs; k++) {
    const k1 = (k + 1) % segs;
    b.i.push(ring[j][k], ring[j + 1][k], ring[j][k1], ring[j][k1], ring[j + 1][k], ring[j + 1][k1]);
  }
}

// one branch: a drooping card from the trunk outward, the painted bough on top
function addBough(b, sh, y, a, L, Wf, segs, hf, snowS = 1) {
  const rnd = sh.rnd;
  const ux = Math.cos(a), uz = Math.sin(a);
  const roll = (rnd() - 0.5) * 0.35;
  const sx = -uz, sz = ux, sy = roll;
  const W = L * Wf * (0.9 + rnd() * 0.2);
  const rise = L * (0.05 + 0.25 * hf), droop = L * (0.42 - 0.22 * hf) * (0.8 + rnd() * 0.4);
  const r0 = 0.12;
  const snowK = snowS * sh.snow * (0.75 + rnd() * 0.25) * (1 - 0.25 * Math.abs(roll) * 4);
  let prev = null;
  for (let j = 0; j <= segs; j++) {
    const f = j / segs;
    const x = ux * (r0 + L * f), z = uz * (r0 + L * f);
    const yy = y + rise * f - droop * f * f;
    // slope of the card here: tilts the normal; blend in the radial direction for a round crown
    const dy = (rise - 2 * droop * f) / L;
    let nx = -ux * dy, ny = 1, nz = -uz * dy;
    nx = nx * 0.55 + ux * 0.55; ny = ny * 0.55 + 0.25; nz = nz * 0.55 + uz * 0.55;
    const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    const ao = (0.42 + 0.58 * Math.pow(f, 0.7)) * (0.72 + 0.28 * hf);
    const sn = snowK * (1 - 0.5 * Math.max(0, -dy - 0.3));
    const wl = W * (0.55 + 0.45 * Math.min(1, f * 2.2)) * 0.5;
    const l = b.v(x - sx * wl, yy - sy * wl, z - sz * wl, nx, ny, nz, 0, f, ao, sn);
    const r = b.v(x + sx * wl, yy + sy * wl, z + sz * wl, nx, ny, nz, 1, f, ao, sn);
    if (prev) b.i.push(prev[0], prev[1], l, prev[1], r, l);
    prev = [l, r];
  }
}

function boughTree(v, detail) {
  const sh = shapeFor(v);
  const b = new Builder();
  const rnd = sh.rnd;
  const near = detail === 0;
  addTrunk(b, sh, SPRUCE_H * 0.9);
  addCore(b, sh, near ? 9 : 6);
  const gap = sh.gap * (near ? 1 : 2.1);
  const perWhorl = near ? 10 : 6;
  const segs = near ? 3 : 1;
  for (let y = sh.y0, w = 0; y < SPRUCE_H - 0.6; y += gap * (0.85 + rnd() * 0.3), w++) {
    const hf = (y - sh.y0) / (SPRUCE_H - sh.y0);
    const R = crownR(sh, y);
    const n = Math.max(3, Math.round(perWhorl * (0.6 + 0.4 * Math.min(1, R / 2))));
    const rot = rnd() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const a = rot + (k / n) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
      const L = R * (0.85 + rnd() * 0.3);
      addBough(b, sh, y, a, L, near ? 0.75 : 1.0, segs, hf, near ? 1 : 0.8);
    }
  }
  // the leader: two crossed vertical cards at the top
  for (const a of [0, Math.PI / 2]) {
    const ux = Math.cos(a) * 0.45, uz = Math.sin(a) * 0.45, y0 = SPRUCE_H - 1.6, y1 = SPRUCE_H + 0.5;
    const q = [b.v(-ux, y0, -uz, 0, 1, 0, 0, 0.1, 0.8, 0.3), b.v(ux, y0, uz, 0, 1, 0, 1, 0.1, 0.8, 0.3),
      b.v(-ux * 0.2, y1, -uz * 0.2, 0, 1, 0, 0.3, 0.95, 0.9, 0.1), b.v(ux * 0.2, y1, uz * 0.2, 0, 1, 0, 0.7, 0.95, 0.9, 0.1)];
    b.i.push(q[0], q[1], q[2], q[1], q[3], q[2]);
  }
  return b.geo(true);
}

// far: tiered opaque skirts with snow on their shoulders
function skirtTree(v, tiers = 5, segs = 10) {
  const sh = shapeFor(v);
  const b = new Builder();
  const rnd = sh.rnd;
  for (let t = 0; t < tiers; t++) {
    const f = t / tiers;
    const yRim = sh.y0 + (SPRUCE_H - sh.y0) * f * 0.92;
    const yTop = Math.min(SPRUCE_H + 0.4, yRim + (SPRUCE_H - sh.y0) * 0.36);
    const R = crownR(sh, yRim) * 1.02;
    const apex = b.v(0, yTop, 0, 0, 1, 0, 0, 0, 0.9, 0.25);
    const mid = [], rim = [];
    for (let k = 0; k < segs * 2; k++) {
      const a = (k / (segs * 2)) * Math.PI * 2 + t * 0.7;
      const tip = k % 2 === 0;
      const r = R * (tip ? 1 : 0.7) * (0.9 + rnd() * 0.2);
      const ca = Math.cos(a), sa = Math.sin(a);
      mid.push(b.v(ca * r * 0.5, yTop * 0.4 + yRim * 0.6 + 0.3, sa * r * 0.5, ca * 0.5, 0.86, sa * 0.5, 0, 0, 0.75, sh.snow * (0.22 + rnd() * 0.33)));
      rim.push(b.v(ca * r, yRim - (tip ? 0.7 : 0.25), sa * r, ca * 0.85, 0.5, sa * 0.85, 0, 0, 0.8, tip ? 0.05 : 0.2));
    }
    const under = b.v(0, yRim + 0.5, 0, 0, -1, 0, 0, 0, 0.25, 0);
    const n = segs * 2;
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      b.i.push(apex, mid[k1], mid[k], mid[k], mid[k1], rim[k], rim[k], mid[k1], rim[k1], under, rim[k], rim[k1]);
    }
  }
  return b.geo(false);
}

// ---------- material ----------
const SNOW_COL = 'vec3( 0.84, 0.88, 0.94 )';
function spruceMaterial(tex, U, bough) {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.88, metalness: 0,
    map: bough ? tex.map : null, alphaTest: bough ? 0.5 : 0, side: bough ? THREE.DoubleSide : THREE.FrontSide,
    color: bough ? 0xffffff : 0x11261a,
  });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    if (bough) sh.uniforms.uSnowMap = { value: tex.snow };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSnow;\nvarying float vSnow;\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vSnow = aSnow;
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
        float hh = position.y / ${SPRUCE_H.toFixed(1)};
        transformed.xz += vec2( sin( uTime * 1.1 + ip.x * 0.11 + ip.z * 0.07 ), cos( uTime * 0.9 + ip.z * 0.13 ) ) * 0.12 * hh * hh;
      #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vSnow;\nuniform float uTreeSnow;\n${bough ? 'uniform sampler2D uSnowMap;' : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float sK;
      ${bough ? `
      {
        // the needles' alpha thins in the mips: keep far boughs full
        vec2 tdx = dFdx( vMapUv * vec2( 256.0, 512.0 ) ), tdy = dFdy( vMapUv * vec2( 256.0, 512.0 ) );
        float lod = max( 0.0, 0.5 * log2( max( dot( tdx, tdx ), dot( tdy, tdy ) ) ) );
        diffuseColor.a = min( 1.0, diffuseColor.a * ( 1.0 + lod * 0.45 ) );
        float sM = texture2D( uSnowMap, vMapUv ).r;
        // (u < 0: the solid trunk and the crown's dark core, painted flat)
        if ( vMapUv.x < -0.5 ) {
          diffuseColor = vec4( ( vMapUv.x < -1.5 ? vec3( 0.045, 0.032, 0.024 ) : vec3( 0.03, 0.06, 0.04 ) ) * vColor.rgb, 1.0 );
          sM = 0.0;
        }
        float th = 1.0 - 0.6 * clamp( vSnow * uTreeSnow, 0.0, 1.2 );
        sK = smoothstep( th, th + 0.1, sM );
        diffuseColor.a = max( diffuseColor.a, sK );
        // seen from below: the snow is a grey-green shadowed mass
        if ( !gl_FrontFacing ) { diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.05, 0.07, 0.06 ), sK ); sK = 0.0; }
        else sK *= mix( 0.82, 1.0, smoothstep( th, th + 0.35, sM ) );
      }` : `
      sK = clamp( vSnow * uTreeSnow, 0.0, 1.0 );`}
      diffuseColor.rgb = mix( diffuseColor.rgb, ${SNOW_COL}, sK );`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.7, sK );')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      normal = normalize( mix( normal, normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ), sK * 0.85 ) );`);
  };
  m.customProgramCacheKey = () => 'spruce-' + (bough ? 'b' : 's');
  return m;
}

// ---------- the instanced forest ----------
// near cards / wider cards / skirts / (far off, a few pixels tall) three-tier cones; how far it draws
const LODS = {
  low: [55, 200, 520, 2300], high: [85, 320, 800, 3200], ultra: [120, 450, 1150, 3600],
};
const NL = 4;

export class SpruceForest {
  /** trees: [{x, y, z, v, s, rot, tint}] */
  constructor(trees, quality, patch, snow) {
    this.group = new THREE.Group();
    this.U = { uTime: { value: 0 }, uTreeSnow: snow };
    const tex = boughTextures();
    const geos = [];
    for (let v = 0; v < VARIANTS; v++) geos.push([boughTree(v, 0), boughTree(v, 1), skirtTree(v), skirtTree(v, 2, 3)]);
    const mats = [spruceMaterial(tex, this.U, true), spruceMaterial(tex, this.U, true), spruceMaterial(tex, this.U, false)];
    for (const m of mats) patch(m);
    this.tris = geos.map((g) => g.map((x) => x.index.count / 3));
    // per-tree matrices and tints
    const N = trees.length;
    this.N = N;
    this.mats = new Float32Array(N * 16);
    this.cols = new Float32Array(N * 3);
    this.var = new Uint8Array(N);
    this.pos = new Float32Array(N * 3);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    const perVar = new Array(VARIANTS).fill(0);
    const cells = new Map();
    trees.forEach((t, i) => {
      q.setFromAxisAngle(Y, t.rot);
      sc.set(t.s * t.sx, t.s, t.s * t.sx);
      p.set(t.x, t.y, t.z);
      m4.compose(p, q, sc).toArray(this.mats, i * 16);
      this.cols[i * 3] = t.tint.r; this.cols[i * 3 + 1] = t.tint.g; this.cols[i * 3 + 2] = t.tint.b;
      this.var[i] = t.v;
      this.pos[i * 3] = t.x; this.pos[i * 3 + 1] = t.y + t.s * SPRUCE_H * 0.5; this.pos[i * 3 + 2] = t.z;
      perVar[t.v]++;
      const k = Math.floor(t.x / 96) + ',' + Math.floor(t.z / 96);
      let c = cells.get(k);
      if (!c) { c = { idx: [], min: new THREE.Vector3(1e9, 1e9, 1e9), max: new THREE.Vector3(-1e9, -1e9, -1e9) }; cells.set(k, c); }
      c.idx.push(i);
      c.min.min(p); p.y += t.s * SPRUCE_H; c.max.max(p);
    });
    this.cells = [...cells.values()].map((c) => {
      const s = new THREE.Sphere();
      new THREE.Box3(c.min, c.max).getBoundingSphere(s);
      return { idx: Uint32Array.from(c.idx), sphere: s };
    });
    // one instanced mesh per (lod, variant)
    this.meshes = [];
    for (let l = 0; l < NL; l++) {
      const row = [];
      for (let v = 0; v < VARIANTS; v++) {
        const im = new THREE.InstancedMesh(geos[v][l], mats[Math.min(l, 2)], Math.max(1, perVar[v]));
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, perVar[v]) * 3), 3);
        im.instanceColor.setUsage(THREE.DynamicDrawUsage);
        im.count = 0;
        im.frustumCulled = false;
        im.castShadow = l < 2;
        im.receiveShadow = true;
        im.name = `spruce_l${l}_v${v}`;
        this.group.add(im);
        row.push(im);
      }
      this.meshes.push(row);
    }
    this.lod = LODS[quality] ?? LODS.high;
    this.maxD = this.lod[3];
    this.last = new THREE.Vector3(1e9, 0, 0);
    this.lastDir = new THREE.Vector3();
    this.frust = new THREE.Frustum();
    this.pm = new THREE.Matrix4();
    this.age = 0;
    this.dir = new THREE.Vector3();
  }

  update(camera, elapsed) {
    this.U.uTime.value = elapsed;
    camera.getWorldDirection(this.dir);
    const cp = camera.position;
    this.age++;
    if (cp.distanceToSquared(this.last) < 4 && this.dir.dot(this.lastDir) > 0.9985 && this.age < 45) return;
    this.age = 0;
    this.last.copy(cp); this.lastDir.copy(this.dir);
    camera.updateMatrixWorld();
    this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frust.setFromProjectionMatrix(this.pm);
    const n2 = this.lod[0] ** 2, m2 = this.lod[1] ** 2, s2 = this.lod[2] ** 2, f2 = this.maxD ** 2;
    const cnt = this.meshes.map((r) => r.map(() => 0));
    const S = new THREE.Sphere();
    const cx = cp.x, cy = cp.y, cz = cp.z;
    for (const c of this.cells) {
      S.copy(c.sphere); S.radius += 25;
      if (S.center.distanceToSquared(cp) > (this.maxD + S.radius) ** 2) continue;
      if (!this.frust.intersectsSphere(S)) continue;
      for (const i of c.idx) {
        const dx = this.pos[i * 3] - cx, dy = this.pos[i * 3 + 1] - cy, dz = this.pos[i * 3 + 2] - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > f2) continue;
        const l = d2 < n2 ? 0 : d2 < m2 ? 1 : d2 < s2 ? 2 : 3;
        const v = this.var[i];
        const im = this.meshes[l][v];
        const k = cnt[l][v]++;
        im.instanceMatrix.array.set(this.mats.subarray(i * 16, i * 16 + 16), k * 16);
        im.instanceColor.array.set(this.cols.subarray(i * 3, i * 3 + 3), k * 3);
      }
    }
    for (let l = 0; l < NL; l++) for (let v = 0; v < VARIANTS; v++) {
      const im = this.meshes[l][v], k = cnt[l][v];
      im.count = k;
      im.instanceMatrix.clearUpdateRanges(); im.instanceMatrix.addUpdateRange(0, k * 16); im.instanceMatrix.needsUpdate = true;
      im.instanceColor.clearUpdateRanges(); im.instanceColor.addUpdateRange(0, k * 3); im.instanceColor.needsUpdate = true;
    }
  }
}
