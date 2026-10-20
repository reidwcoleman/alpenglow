// The subalpine forest, drawn: Engelmann spruces (four shapes), narrow subalpine firs (two),
// bare winter larches, silver dead snags and rime-buried "snow ghosts" up at the tree line.
// Conifers are whorls of drooping, gabled branch cards textured with a needle bough painted
// at boot, snow lying in clumps on the boughs' upper faces (less on the windward side, some
// boughs blown bare), a dark core so the crown reads dense, bark with lichen down low.
// Four LODs (bough cards / fewer, wider cards / opaque tiered skirts / three-tier cones),
// instanced per (LOD, variant), cross-faded with a screen-space dither so nothing pops.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { normalAt } from './course.js';
import { noiseTex, CLOUDS, CLOUD_GLSL } from './terrain.js';

export const SPRUCE_H = 16; // geometry height (m); instances scale to their own height
// 0-3 spruce, 4-5 subalpine fir, 6 dead snag, 7 bare larch, 8 snow ghost
export const SPECIES = { spruce: [0, 1, 2, 3], fir: [4, 5], snag: 6, larch: 7, ghost: 8 };
const VARIANTS = 9;
const CONIFER = (v) => v < 6;
// small trees take their cheaper LODs sooner (they're fewer pixels at the same distance)
const LOD_S = 0.8;

// ---------- the painted boughs (spruce needles | bare larch twigs) + where snow settles ----------
const TW = 512, TH = 512, HW = 256;
function boughTextures() {
  const W = HW, H = TH;
  const rnd = mulberry32(7);
  const half = (t) => W * 0.46 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.04)), 0.65) * (1 - 0.3 * t);
  const sx = (t) => W / 2 + Math.sin(t * 3.1) * 5;
  const sy = (t) => H - 6 - t * (H - 14);
  const cv = document.createElement('canvas'); cv.width = TW; cv.height = TH;
  const g = cv.getContext('2d');
  g.lineCap = 'round';
  const line = (x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  const PAL = [
    ['#0f2119', '#14291e', '#193123'],
    ['#1e3c28', '#24442d', '#294a31', '#213e2b'],
    ['#3b5437', '#455d3c', '#384c35', '#4d6343'],
  ];
  // --- spruce: twigs off the stem, needles off the twigs; dark fill first, lit tips last
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
      // the twig's tip tuft (new growth: a touch brighter)
      g.strokeStyle = PAL[Math.min(2, pass + 1)][0];
      const ex = w.x + w.dx * w.L, ey = w.y + w.dy * w.L;
      for (let k = 0; k < 3; k++) {
        const ang = Math.atan2(w.dy, w.dx) + (rnd() - 0.5) * 1.2;
        line(ex, ey, ex + Math.cos(ang) * 6, ey + Math.sin(ang) * 6);
      }
    }
  }
  g.strokeStyle = PAL[1][1]; g.lineWidth = 1.6;
  for (let k = 0; k < 40; k++) {
    const t = 0.9 + rnd() * 0.09, ang = -Math.PI / 2 + (rnd() - 0.5) * 2.2;
    line(sx(t), sy(t), sx(t) + Math.cos(ang) * 9, sy(t) + Math.sin(ang) * 9);
  }

  // --- larch in winter (right half): bare grey-brown twigs, knobbly short shoots, a few cones
  const ox = HW;
  const lx = (t) => ox + W / 2 + Math.sin(t * 2.3 + 1) * 6;
  g.strokeStyle = '#4e4339'; g.lineWidth = 4;
  for (let t = 0; t < 0.97; t += 0.02) { g.lineWidth = 4 - 2.6 * t; line(lx(t), sy(t), lx(t + 0.02), sy(t + 0.02)); }
  const sub = (x, y, ang, L, depth) => {
    const ex = x + Math.cos(ang) * L, ey = y + Math.sin(ang) * L;
    g.strokeStyle = ['#5e554b', '#6f665b', '#7e766b'][depth]; g.lineWidth = [1.8, 1.2, 0.9][depth];
    // (branchlets droop: bend the far half down)
    const mx = x + Math.cos(ang) * L * 0.55, my = y + Math.sin(ang) * L * 0.55;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(mx, my, ex, ey + L * 0.18 * (depth + 1) * 0.5); g.stroke();
    // short shoots: knobs along it
    g.fillStyle = '#4a4037';
    const nk = (L / 10) | 0;
    for (let k = 1; k <= nk; k++) {
      const f = k / (nk + 1);
      g.beginPath(); g.arc(x + (ex - x) * f + (rnd() - 0.5) * 2, y + (ey - y) * f + L * 0.09 * f * f * (depth + 1) - 1.5, 1.3 + rnd() * 0.8, 0, Math.PI * 2); g.fill();
    }
    if (depth < 2) {
      const n = depth === 0 ? 4 : 2;
      for (let k = 0; k < n; k++) {
        const f = 0.25 + 0.7 * (k / n) + rnd() * 0.05;
        const s = k % 2 ? 1 : -1;
        sub(x + (ex - x) * f, y + (ey - y) * f + L * 0.09 * f * f * (depth + 1), ang + s * (0.6 + rnd() * 0.4), L * (0.42 + rnd() * 0.18) * (1 - 0.5 * f), depth + 1);
      }
    }
    if (depth === 1 && rnd() < 0.18) { // last autumn's cones
      g.fillStyle = '#5a3f2a';
      g.beginPath(); g.ellipse(ex, ey - 3, 2.6, 3.8, 0, 0, Math.PI * 2); g.fill();
    }
  };
  for (let t = 0.04; t < 0.94; t += 0.1 + rnd() * 0.04) {
    for (const side of [-1, 1]) {
      const L = Math.min(half(t) * (0.75 + rnd() * 0.3), W / 2 - 14);
      sub(lx(t), sy(t), -Math.PI / 2 + side * (0.75 + rnd() * 0.35), L, 0);
    }
  }

  // snow: soft lumps along the stem where the bough is flat, scattered pads on the twigs
  const raw = document.createElement('canvas'); raw.width = TW; raw.height = TH;
  const s = raw.getContext('2d');
  s.fillStyle = '#000'; s.fillRect(0, 0, TW, TH);
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
  // (larch: a little snow caught in the forks, a thin line along the stem)
  for (let t = 0.05; t < 0.9; t += 0.05) blob(lx(t) + (rnd() - 0.5) * 6, sy(t), 9 + rnd() * 9, 5 + rnd() * 4, 0.45 + rnd() * 0.4);
  for (let k = 0; k < 30; k++) {
    const t = 0.05 + rnd() * 0.85;
    blob(lx(t) + (rnd() - 0.5) * 2 * half(t) * 0.6, sy(t) + (rnd() - 0.5) * 16, 4 + rnd() * 6, 3 + rnd() * 4, 0.3 + rnd() * 0.4);
  }
  const sc = document.createElement('canvas'); sc.width = TW; sc.height = TH;
  const s2 = sc.getContext('2d');
  s2.filter = 'blur(3px)';
  s2.drawImage(raw, 0, 0);

  // the canvas keeps its colours premultiplied, so a texel at the edge of a needle comes back
  // as a garbled bright hue (teal fringes). Take the colour from the twigs laid over a dark
  // under-colour instead and only the alpha from the canvas.
  const bg = document.createElement('canvas'); bg.width = TW; bg.height = TH;
  const b2 = bg.getContext('2d');
  b2.fillStyle = PAL[0][1]; b2.fillRect(0, 0, HW, TH);
  b2.fillStyle = '#4e463d'; b2.fillRect(HW, 0, HW, TH);
  b2.drawImage(cv, 0, 0);
  const rgb = b2.getImageData(0, 0, TW, TH).data, al = g.getImageData(0, 0, TW, TH).data;
  const px = new Uint8Array(TW * TH * 4);
  for (let y = 0; y < TH; y++) {
    const o = (TH - 1 - y) * TW * 4, i0 = y * TW * 4;
    for (let x = 0; x < TW * 4; x += 4) {
      px[o + x] = rgb[i0 + x]; px[o + x + 1] = rgb[i0 + x + 1]; px[o + x + 2] = rgb[i0 + x + 2]; px[o + x + 3] = al[i0 + x + 3];
    }
  }
  const map = new THREE.DataTexture(px, TW, TH);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter; map.generateMipmaps = true;
  map.anisotropy = 8;
  map.needsUpdate = true;
  const snow = new THREE.CanvasTexture(sc);
  snow.anisotropy = 8;
  return { map, snow };
}

// ---------- geometry ----------
// vertex colour: the crown's own occlusion (grey) or, on the opaque far trees, the colour itself
class Builder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.s = []; this.i = []; }
  v(x, y, z, nx, ny, nz, u, w, ao, sn, rgb) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, w);
    if (rgb) this.c.push(rgb[0] * ao, rgb[1] * ao, rgb[2] * ao); else this.c.push(ao, ao, ao);
    this.s.push(sn);
    return this.p.length / 3 - 1;
  }
  geo(withUv = true, smooth = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    if (withUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aSnow', new THREE.Float32BufferAttribute(this.s, 1));
    g.setIndex(this.i);
    if (smooth) g.computeVertexNormals();
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
  const S = [
    // spruces: crown base, radius, taper, whorl gap, snow, droop, bare-trunk stubs
    { y0: 0.8, R: 3.2, taper: 1.0, gap: 0.58, snow: 0.95, droop: 1.0 },
    { y0: 2.2, R: 2.9, taper: 0.9, gap: 0.64, snow: 0.8, droop: 1.1 },
    { y0: 0.4, R: 3.6, taper: 1.08, gap: 0.54, snow: 1.0, droop: 0.95 },
    { y0: 3.0, R: 2.6, taper: 0.95, gap: 0.68, snow: 0.85, droop: 1.15 },
    // subalpine firs: narrow spires, short level branches, crowns down to the snow
    { y0: 0.3, R: 2.0, taper: 0.72, gap: 0.46, snow: 1.0, droop: 0.6, fir: true },
    { y0: 0.9, R: 1.65, taper: 0.62, gap: 0.5, snow: 0.9, droop: 0.55, fir: true },
    // snag (its own builder), larch
    { y0: 0, R: 1, taper: 1, gap: 1, snow: 0.6, droop: 0 },
    { y0: 2.4, R: 3.3, taper: 1.0, gap: 0.95, snow: 0.4, droop: 0.7 },
    // ghost (its own builder)
    { y0: 0, R: 4.2, taper: 1, gap: 1, snow: 1, droop: 0 },
  ][v];
  return { rnd, ...S };
}

// the trunk: a tapered, slightly crooked column flaring into its roots; u in [-3,-2] around it
// (bark), [-5,-4] for a snag's bleached wood
function addTrunk(b, sh, top, r0 = 0.26, r1 = 0.05, N = 7, rows = 4, u0 = -3, crook = 0.12) {
  const rnd = sh.rnd;
  const ph = rnd() * 6.28;
  const ring = [];
  let tx = 0, tz = 0;
  for (let j = 0; j <= rows; j++) {
    const f = j / rows;
    const y = -0.4 + (top + 0.4) * f;
    const flare = 1 + 0.9 * Math.pow(Math.max(0, 1 - y / 1.2), 2);
    const r = (r0 + (r1 - r0) * Math.pow(f, 0.8)) * (y < 1.2 ? flare : 1);
    const ox = Math.sin(f * 2.4 + ph) * crook * f, oz = Math.cos(f * 1.9 + ph) * crook * f;
    tx = ox; tz = oz;
    const row = [];
    for (let k = 0; k <= N; k++) {
      const a = (k / N) * Math.PI * 2;
      // buttress roots: the flare isn't round
      const rr = r * (y < 1.2 ? 1 + 0.22 * Math.sin(a * 3 + ph) * (1 - y / 1.2) : 1);
      row.push(b.v(ox + Math.cos(a) * rr, y, oz + Math.sin(a) * rr, Math.cos(a), 0.1, Math.sin(a), u0 + k / N, y / SPRUCE_H, 1, 0));
    }
    ring.push(row);
  }
  for (let j = 0; j < rows; j++) for (let k = 0; k < N; k++) {
    const a = ring[j][k], c = ring[j + 1][k], d = ring[j][k + 1], e = ring[j + 1][k + 1];
    b.i.push(a, c, d, d, c, e);
  }
  // (where the trunk's axis is at a height: things growing off it start there)
  return { x: tx, z: tz, at: (y) => { const f = (y + 0.4) / (top + 0.4); return [Math.sin(f * 2.4 + ph) * crook * f, Math.cos(f * 1.9 + ph) * crook * f]; } };
}

// a dead branch stub: a thin three-sided spike, snow on its top face
function addStub(b, x0, y0, z0, a, L, r, dip, u0, snow) {
  const ux = Math.cos(a), uz = Math.sin(a);
  const ex = x0 + ux * L, ey = y0 - dip * L, ez = z0 + uz * L;
  const px = -uz, pz = ux;
  const base = [];
  for (let k = 0; k < 3; k++) {
    const t = (k / 3) * Math.PI * 2 + Math.PI / 2;
    const cy = Math.sin(t), cs = Math.cos(t);
    base.push(b.v(x0 + px * cs * r, y0 + cy * r, z0 + pz * cs * r, px * cs, cy, pz * cs, u0 + k / 3, y0 / SPRUCE_H, 0.8, cy > 0.5 ? snow : 0));
  }
  const tip = b.v(ex, ey, ez, ux, 0.3, uz, u0 + 0.5, ey / SPRUCE_H, 0.9, snow * 0.6);
  for (let k = 0; k < 3; k++) b.i.push(base[k], base[(k + 1) % 3], tip);
}

// a dark, jagged cone inside the crown so it reads as a dense mass, not a lattice
function addCore(b, sh, segs, sc = 0.24) {
  const rnd = sh.rnd;
  const rows = 6, ring = [];
  for (let j = 0; j <= rows; j++) {
    const y = sh.y0 + 0.3 + (SPRUCE_H * 0.96 - sh.y0) * (j / rows);
    const r = crownR(sh, y) * sc * (j === rows ? 0 : 1);
    const row = [];
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2 + j * 0.4;
      const rr = r * (0.6 + rnd() * 0.8);
      const tw = (rnd() - 0.5) * 1.4; // (normals scattered: it reads as needles in shadow, not a cylinder)
      row.push(b.v(Math.cos(a) * rr, y, Math.sin(a) * rr, Math.cos(a + tw) * 0.7, 0.4 + rnd() * 0.5, Math.sin(a + tw) * 0.7, -1, 0, 0.3 + 0.3 * j / rows, 0.1));
    }
    ring.push(row);
  }
  for (let j = 0; j < rows; j++) for (let k = 0; k < segs; k++) {
    const k1 = (k + 1) % segs;
    b.i.push(ring[j][k], ring[j + 1][k], ring[j][k1], ring[j][k1], ring[j + 1][k], ring[j + 1][k1]);
  }
}

// one branch: a gabled card from the trunk outward (a ridge along the branch, the twigs hanging
// off both sides), drooping and then sweeping up at the tip, the painted bough on top
function addBough(b, sh, y, a, L, Wf, segs, hf, snowS = 1, gable = 0.32, u0 = 0, uW = 0.5) {
  const rnd = sh.rnd;
  const ux = Math.cos(a), uz = Math.sin(a);
  const roll = (rnd() - 0.5) * 0.35;
  const sx = -uz, sz = ux, sy = roll;
  const W = L * Wf * (0.9 + rnd() * 0.2);
  const dk = sh.droop * (0.8 + rnd() * 0.4);
  // low boughs hang and then turn their tips up; high ones reach up and out
  const rise = L * (0.04 + 0.3 * hf), droop = L * (0.5 - 0.3 * hf) * dk, up = L * 0.22 * (1 - hf) * dk;
  const r0 = 0.12;
  // wind strips some boughs, others carry a heavy load
  const q = rnd();
  const load = q < 0.1 ? 0.2 + q : q > 0.78 ? 1.35 : 0.9 + 0.3 * rnd();
  const snowK = snowS * sh.snow * load * (1 - 0.25 * Math.abs(roll) * 4);
  const gh = gable * (0.8 + rnd() * 0.4);
  let prev = null;
  for (let j = 0; j <= segs; j++) {
    const f = j / segs;
    const x = ux * (r0 + L * f), z = uz * (r0 + L * f);
    const yy = y + rise * f - droop * f * f + up * f * f * f;
    // slope of the card here: tilts the normal; blend in the radial direction for a round crown
    const dy = (rise - 2 * droop * f + 3 * up * f * f) / L;
    let nx = -ux * dy, ny = 1, nz = -uz * dy;
    nx = nx * 0.55 + ux * 0.55; ny = ny * 0.55 + 0.25; nz = nz * 0.55 + uz * 0.55;
    const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    // occlusion: dark toward the trunk and low in the crown (the boughs above shade it)
    const ao = (0.42 + 0.58 * Math.pow(f, 0.65)) * (0.68 + 0.32 * hf);
    const sn = snowK * (1 - 0.5 * Math.max(0, -dy - 0.3));
    const wl = W * (0.55 + 0.45 * Math.min(1, f * 2.2)) * 0.5;
    const hang = wl * gh; // the sides hang below the ridge
    const l = b.v(x - sx * wl, yy - sy * wl - hang, z - sz * wl, nx * 0.8 - sx * 0.45, ny * 0.8, nz * 0.8 - sz * 0.45, u0, f, ao * 0.85, sn * 0.92);
    const c = b.v(x, yy, z, nx, ny, nz, u0 + uW * 0.5, f, ao, sn);
    const r = b.v(x + sx * wl, yy + sy * wl - hang, z + sz * wl, nx * 0.8 + sx * 0.45, ny * 0.8, nz * 0.8 + sz * 0.45, u0 + uW, f, ao * 0.85, sn * 0.92);
    if (prev) b.i.push(prev[0], prev[1], l, prev[1], c, l, prev[1], prev[2], c, prev[2], r, c);
    prev = [l, c, r];
  }
}

// detail: 0 near, 1 mid (fewer, wider cards), 2 far (larch only: a few cards)
function boughTree(v, detail) {
  const sh = shapeFor(v);
  const b = new Builder();
  const rnd = sh.rnd;
  const near = detail === 0;
  const larch = v === SPECIES.larch;
  addTrunk(b, sh, SPRUCE_H * (larch ? 0.95 : 0.9), larch ? 0.3 : sh.fir ? 0.2 : 0.26, 0.05, near ? 8 : 5, near ? 5 : 2);
  // dead lower branches on the bare trunk below the crown (shaded out years ago)
  if (near && sh.y0 > 1.2) {
    for (let k = 0; k < 16; k++) {
      const y = 0.9 + rnd() * (sh.y0 - 0.6);
      const r = 0.26 * (1 - y / SPRUCE_H) * 0.9;
      const a = rnd() * Math.PI * 2;
      addStub(b, Math.cos(a) * r, y, Math.sin(a) * r, a, 0.3 + rnd() * 0.9, 0.035, 0.15 + rnd() * 0.4, -3, 0.5);
    }
  }
  if (!larch) addCore(b, sh, near ? 12 : 6, (sh.fir ? 0.3 : 0.24) * (near ? 1 : 1.6));
  const gap = sh.gap * (detail === 0 ? 0.82 : detail === 1 ? 1.7 : 2.6);
  const perWhorl = larch ? (near ? 7 : detail === 1 ? 5 : 4) : sh.fir ? (near ? 10 : 7) : near ? 12 : 8;
  const u0 = larch ? 0.5 : 0;
  for (let y = sh.y0, w = 0; y < SPRUCE_H - 0.6; y += gap * (0.85 + rnd() * 0.3), w++) {
    const hf = (y - sh.y0) / (SPRUCE_H - sh.y0);
    const R = crownR(sh, y);
    const n = Math.max(3, Math.round(perWhorl * (0.6 + 0.4 * Math.min(1, R / 2))));
    const rot = rnd() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const a = rot + (k / n) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
      const L = R * (0.85 + rnd() * 0.3);
      // (long low boughs need three segments for their droop and upturned tips; short high ones two)
      addBough(b, sh, y, a, L, near ? 0.85 : 1.45, near ? (hf < 0.45 ? 3 : 2) : 1, hf, (near ? 1 : 0.85) * (larch ? 0.6 : 1), larch ? 1.1 : near ? 0.32 : 0.42, u0);
    }
    // up close, shorter boughs between the whorls fill the crown in toward the trunk
    if (near && !larch) for (let k = 0; k < (n >> 1); k++) {
      const a = rot + ((k + 0.5) / (n >> 1)) * Math.PI * 2 + (rnd() - 0.5) * 0.6;
      addBough(b, sh, y + gap * 0.5, a, R * (0.45 + rnd() * 0.2), 0.95, 1, hf, 0.7, 0.3);
    }
  }
  // the leader: two crossed vertical cards at the top (a fir's is a narrow spike)
  const lw = sh.fir ? 0.3 : larch ? 0.5 : 0.45;
  for (const a of [0, Math.PI / 2]) {
    const ux = Math.cos(a) * lw, uz = Math.sin(a) * lw, y0 = SPRUCE_H - 1.6, y1 = SPRUCE_H + (sh.fir ? 0.9 : 0.5);
    const q = [b.v(-ux, y0, -uz, 0, 1, 0, u0, 0.1, 0.8, 0.3), b.v(ux, y0, uz, 0, 1, 0, u0 + 0.5, 0.1, 0.8, 0.3),
      b.v(-ux * 0.2, y1, -uz * 0.2, 0, 1, 0, u0 + 0.15, 0.95, 0.9, 0.1), b.v(ux * 0.2, y1, uz * 0.2, 0, 1, 0, u0 + 0.35, 0.95, 0.9, 0.1)];
    b.i.push(q[0], q[1], q[2], q[1], q[3], q[2]);
  }
  return b.geo(true);
}

// a dead snag: bleached, spiral-grained trunk snapped off, broken branch stubs with snow on them
function snagTree(detail) {
  const sh = shapeFor(SPECIES.snag);
  const b = new Builder();
  const rnd = sh.rnd;
  const near = detail === 0;
  const top = SPRUCE_H * 0.78;
  const tc = addTrunk(b, sh, top, 0.3, 0.1, near ? 8 : 4, near ? 6 : 2, -5, 0.35);
  // the snapped top: a few splinters standing up out of the last ring
  for (let k = 0; k < (near ? 4 : 1); k++) {
    const a = rnd() * Math.PI * 2, r = 0.07;
    const x = tc.x + Math.cos(a) * r, z = tc.z + Math.sin(a) * r, y = top - 0.05;
    const h = 0.4 + rnd() * 0.9;
    const t = [b.v(x - 0.06, y, z, 1, 0, 0, -5, y / SPRUCE_H, 0.9, 0), b.v(x + 0.06, y, z + 0.04, 1, 0, 0, -4.6, y / SPRUCE_H, 0.9, 0),
      b.v(x + Math.cos(a) * 0.05, y + h, z + Math.sin(a) * 0.05, 1, 0.2, 0, -4.8, (y + h) / SPRUCE_H, 1, 0.3)];
    b.i.push(t[0], t[1], t[2]);
  }
  const n = near ? 30 : 8;
  for (let k = 0; k < n; k++) {
    const hf = 0.12 + 0.85 * (k / n) + (rnd() - 0.5) * 0.04;
    const y = top * hf;
    const r = (0.3 + (0.1 - 0.3) * hf) * 0.85;
    const a = rnd() * Math.PI * 2;
    const broken = rnd() < 0.45;
    const L = (broken ? 0.3 + rnd() * 0.5 : 0.8 + rnd() * 2.2) * (1.1 - hf * 0.7);
    const [ax, az] = tc.at(y);
    addStub(b, ax + Math.cos(a) * r, y, az + Math.sin(a) * r, a, L, 0.05 + 0.03 * (1 - hf), 0.1 + rnd() * 0.45, -5, 1.1);
  }
  return b.geo(true);
}

// a snow ghost: a tree near the tree line buried in rime and snow, stacked pillows of it with dark
// gaps where the needles still show, leaning a little, a knob of snow for a head
function ghostTree(detail, seed = 0) {
  const sh = shapeFor(SPECIES.ghost);
  const rnd = mulberry32(911 + seed);
  const b = new Builder();
  const rows = detail === 0 ? 22 : detail === 1 ? 11 : 6, segs = detail === 0 ? 16 : detail === 1 ? 9 : 6;
  const lean = 1.0 + rnd() * 1.6, la = rnd() * 6.28;
  const ph = rnd() * 6.28, top = SPRUCE_H * (0.9 + rnd() * 0.08);
  // lumps of rime and snow plastered on where the boughs were: each bulges out and sags
  const blobs = [];
  for (let k = 0; k < 13; k++) blobs.push({ f: 0.05 + rnd() * 0.85, a: rnd() * 6.28, w: 0.05 + rnd() * 0.07, amp: 0.25 + rnd() * 0.5, p: 1 + rnd() * 3 });
  const ring = [];
  for (let j = 0; j <= rows; j++) {
    const f = j / rows;
    const y0 = -0.6 + (top + 0.6) * f;
    const cx = Math.cos(la) * lean * f * f, cz = Math.sin(la) * lean * f * f;
    const row = [];
    for (let k = 0; k <= segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      let bulge = 0;
      for (const B of blobs) {
        const e = (f - B.f) / B.w;
        if (e > -3 && e < 3) bulge += B.amp * Math.exp(-e * e) * Math.pow(0.5 + 0.5 * Math.cos(a - B.a), B.p);
      }
      // ledges where the old whorls were, not quite level
      const crease = Math.pow(Math.abs(Math.cos(Math.PI * (f * 4.6 + 0.35 * Math.sin(a * 2 + ph)))), 6);
      let r = sh.R * Math.pow(1 - f, 0.8) * (0.62 + bulge) * (1 - 0.13 * crease) + 0.3 * (1 - f);
      r *= 1 + 0.08 * Math.sin(a * 3 + ph + f * 5);
      if (j === rows) r = 0.04;
      const y = y0 - Math.min(0.9, bulge * 0.7) * (1 - f * 0.5);
      // dark where the needles poke out of a ledge, all white over the lumps
      const sn = 1.15 + 1.0 * Math.min(1, bulge * 1.6) - 1.0 * crease;
      row.push(b.v(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, 0, 0, 0, -7 + k / segs, y0 / SPRUCE_H, 1, sn));
    }
    ring.push(row);
  }
  for (let j = 0; j < rows; j++) for (let k = 0; k < segs; k++) {
    const a = ring[j][k], c = ring[j + 1][k], d = ring[j][k + 1], e = ring[j + 1][k + 1];
    b.i.push(a, c, d, d, c, e);
  }
  const g = b.geo(true, true);
  // (the seam: average the normals so it doesn't show a crease)
  const n = g.getAttribute('normal');
  for (let j = 0; j <= rows; j++) {
    const i0 = j * (segs + 1), i1 = i0 + segs;
    const x = n.getX(i0) + n.getX(i1), y = n.getY(i0) + n.getY(i1), z = n.getZ(i0) + n.getZ(i1), l = Math.hypot(x, y, z) || 1;
    n.setXYZ(i0, x / l, y / l, z / l); n.setXYZ(i1, x / l, y / l, z / l);
  }
  return g;
}

// far: tiered opaque skirts with snow on their shoulders, coloured like the cards they replace
const FAR_GREEN = [0.008, 0.021, 0.0125];
function skirtTree(v, tiers = 5, segs = 10) {
  const sh = shapeFor(v);
  const b = new Builder();
  const rnd = sh.rnd;
  if (sh.fir && tiers > 3) tiers += 1;
  for (let t = 0; t < tiers; t++) {
    const f = t / tiers;
    const yRim = sh.y0 + (SPRUCE_H - sh.y0) * f * 0.92;
    const yTop = Math.min(SPRUCE_H + 0.4, yRim + (SPRUCE_H - sh.y0) * 0.36);
    const R = crownR(sh, yRim) * 1.02;
    const lo = 0.55 + 0.45 * f; // (the lower tiers sit in the shade of the ones above)
    const apex = b.v(0, yTop, 0, 0, 1, 0, 0, 0, 0.9 * lo, 0.25, FAR_GREEN);
    const mid = [], rim = [];
    for (let k = 0; k < segs * 2; k++) {
      const a = (k / (segs * 2)) * Math.PI * 2 + t * 0.7;
      const tip = k % 2 === 0;
      const r = R * (tip ? 1 : 0.7) * (0.9 + rnd() * 0.2);
      const ca = Math.cos(a), sa = Math.sin(a);
      mid.push(b.v(ca * r * 0.5, yTop * 0.4 + yRim * 0.6 + 0.3, sa * r * 0.5, ca * 0.72, 0.62, sa * 0.72, 0, 0, 0.8 * lo, sh.snow * (0.22 + rnd() * 0.33), FAR_GREEN));
      rim.push(b.v(ca * r, yRim - (tip ? 0.7 : 0.25), sa * r, ca * 0.85, 0.5, sa * 0.85, 0, 0, 1.0 * lo, tip ? 0.05 : 0.2, FAR_GREEN));
    }
    const under = b.v(0, yRim + 0.5, 0, 0, -1, 0, 0, 0, 0.25, 0, FAR_GREEN);
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
// band: x inner LOD boundary, y outer, z the cross-fade width (fraction of the boundary)
function spruceMaterial(tex, U, bough, snowK = 1, band) {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.88, metalness: 0,
    map: bough ? tex.map : null, alphaTest: bough ? 0.5 : 0, side: bough ? THREE.DoubleSide : THREE.FrontSide,
    color: 0xffffff,
  });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.uniforms.uBand = { value: band };
    sh.uniforms.uNoise = { value: noiseTex }; sh.uniforms.uClouds = CLOUDS;
    if (bough) sh.uniforms.uSnowMap = { value: tex.snow };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
      attribute float aSnow;
      varying float vSnow;
      varying vec2 vFade;
      varying vec3 vWN;
      uniform float uTime;
      uniform vec3 uWind;
      uniform vec4 uBand;
      varying vec2 vCXZ;`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
      #ifdef USE_INSTANCING
        vCXZ = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xz;
      #else
        vCXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;
      #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vSnow = aSnow * ${snowK.toFixed(2)};
      vFade = vec2( 1.0, 0.0 );
      vWN = normal;
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
        float isc = length( instanceMatrix[1].xyz );
        float ih = fract( sin( dot( ip.xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
        // every tree caught its own share of the snowfall (wind, shelter)
        vSnow *= 0.55 + 0.6 * ih;
        // and the wind stripped its windward side
        vWN = mat3( instanceMatrix ) * normal;
        float hh = position.y / ${SPRUCE_H.toFixed(1)};
        // sway: slow and whole-tree, with gusts rolling through the forest
        float gust = 0.55 + 0.45 * sin( uTime * 0.31 + dot( ip.xz, uWind.xz ) * 0.012 ) * sin( uTime * 0.53 + ip.x * 0.004 );
        transformed.xz += ( uWind.xz * ( 0.10 + 0.08 * sin( uTime * 1.1 + ih * 6.3 ) ) + vec2( sin( uTime * 1.3 + ip.x * 0.11 + ip.z * 0.07 ), cos( uTime * 0.9 + ip.z * 0.13 ) ) * 0.05 ) * gust * hh * hh / max( isc, 0.3 );
        ${bough ? `
        // the boughs' tips bob on their own
        if ( uv.x >= 0.0 ) {
          float tipK = uv.y * uv.y;
          float ph = dot( position, vec3( 1.7, 0.9, 1.3 ) ) + ih * 9.0;
          transformed.y += sin( uTime * 2.3 + ph ) * 0.07 * tipK * gust;
          transformed.xz += vec2( sin( uTime * 1.9 + ph * 1.3 ), cos( uTime * 2.1 + ph ) ) * 0.035 * tipK * gust;
        }` : ''}
        // LOD cross-fade: this tree's distance (as the forest worked it out) into the bands
        vec3 icn = ip; icn.y += isc * ${(SPRUCE_H * 0.5).toFixed(1)};
        float dl = distance( icn, cameraPosition ) * max( 1.0, ${LOD_S.toFixed(2)} / isc );
        float wIn = max( uBand.x * uBand.z, 1e-3 ), wOut = max( uBand.y * uBand.z, 1e-3 );
        vFade = vec2( clamp( ( dl - ( uBand.x - wIn ) ) / wIn, 0.0, 1.0 ), clamp( ( dl - ( uBand.y - wOut ) ) / wOut, 0.0, 1.0 ) );
      #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
      varying float vSnow;
      varying vec2 vCXZ;
      varying vec2 vFade;
      varying vec3 vWN;
      uniform vec3 uWind;
      uniform sampler2D uNoise;
      uniform vec4 uClouds;
      ${CLOUD_GLSL}
      uniform float uTreeSnow;
      ${bough ? 'uniform sampler2D uSnowMap;' : ''}
      float treeTransK = 0.0;
      float treeSnowN = 0.0;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      {
        // (screen-door between two LODs of the same tree: each pixel is one or the other)
        float dz = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
        if ( dz >= vFade.x || dz < vFade.y ) discard;
      }`)
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
      // needles let the low sun through: a glow round the crown's rim when it's behind the tree
      void RE_Direct_Tree( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
        RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
        float bk = pow( clamp( dot( directLight.direction, -geometryViewDir ), 0.0, 1.0 ), 6.0 );
        float th = clamp( -dot( geometryNormal, directLight.direction ), 0.0, 1.0 );
        reflectedLight.directDiffuse += directLight.color * ( material.diffuseColor * 0.5 + vec3( 0.07, 0.11, 0.025 ) ) * ( bk * 2.4 + th * 0.3 ) * treeTransK * RECIPROCAL_PI;
      }
      #undef RE_Direct
      #define RE_Direct RE_Direct_Tree`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float sK, sB = 1.0;
      // the windward side (and anything facing the sky less) holds less snow
      float wsn = 1.0 - 0.35 * smoothstep( 0.1, 0.8, dot( normalize( vWN.xz + 1e-4 ), uWind.xz / max( length( uWind.xz ), 1e-3 ) ) ) * smoothstep( 0.0, 0.4, length( vWN.xz ) );
      float vS = vSnow * wsn;
      ${bough ? `
      {
        // the needles' alpha thins in the mips: keep far boughs full
        vec2 tdx = dFdx( vMapUv * vec2( ${TW.toFixed(1)}, ${TH.toFixed(1)} ) ), tdy = dFdy( vMapUv * vec2( ${TW.toFixed(1)}, ${TH.toFixed(1)} ) );
        float lod = max( 0.0, 0.5 * log2( max( dot( tdx, tdx ), dot( tdy, tdy ) ) ) );
        float a0 = diffuseColor.a;
        diffuseColor.a = min( 1.0, diffuseColor.a * ( 1.0 + lod * 0.45 ) );
        float sM = texture2D( uSnowMap, vMapUv ).r;
        float th = 1.0 - 0.6 * clamp( vS * uTreeSnow, 0.0, 1.2 );
        sK = smoothstep( th + 0.01, th + 0.07, sM );
        treeSnowN = sK;
        // (u < 0: painted solids; the crown's dark core, bark, a snag's wood, a snow ghost's rime)
        if ( vMapUv.x < -0.5 ) {
          vec2 bu = vec2( fract( vMapUv.x ), vMapUv.y * ${SPRUCE_H.toFixed(1)} );
          float n1 = texture2D( uNoise, vec2( bu.x * 2.0, bu.y * 0.09 ) ).r, n2 = texture2D( uNoise, vec2( bu.x * 4.0 + 0.3, bu.y * 0.35 ) ).g;
          if ( vMapUv.x > -1.5 ) {
            diffuseColor.rgb = vec3( 0.016, 0.034, 0.024 ) * vColor.rgb; sK = 0.0;
          } else if ( vMapUv.x > -3.5 ) {
            // bark: scaly grey-brown plates and dark furrows, wolf lichen on the lower trunk
            float plates = smoothstep( 0.4, 0.6, texture2D( uNoise, vec2( bu.x * 6.0 + 0.3, bu.y * 0.7 ) ).g ) * 0.55 + n1 * 0.45;
            float furrow = smoothstep( 0.55, 0.7, texture2D( uNoise, vec2( bu.x * 5.0, bu.y * 0.12 ) ).a );
            vec3 bark = mix( vec3( 0.03, 0.022, 0.017 ), vec3( 0.105, 0.085, 0.07 ), plates ) * ( 1.0 - 0.6 * furrow );
            float lich = smoothstep( 0.66, 0.74, texture2D( uNoise, vec2( bu.x * 7.0, bu.y * 1.3 ) ).b ) * ( 1.0 - smoothstep( 1.2, 3.5, bu.y ) ) * smoothstep( 0.3, 0.7, bu.y );
            diffuseColor.rgb = mix( bark, vec3( 0.11, 0.13, 0.03 ), lich * 0.55 ) * vColor.rgb;
            sK = 0.0;
          } else if ( vMapUv.x > -5.5 ) {
            // silver snag wood, grain twisting up it, cracks
            float gr = texture2D( uNoise, vec2( bu.x * 1.5 + bu.y * 0.04, bu.y * 0.02 ) ).r;
            float crack = smoothstep( 0.62, 0.7, texture2D( uNoise, vec2( bu.x * 3.0 + bu.y * 0.08, bu.y * 0.05 ) ).g );
            diffuseColor.rgb = mix( vec3( 0.07, 0.064, 0.056 ), vec3( 0.17, 0.158, 0.14 ), gr ) * ( 1.0 - 0.7 * crack ) * vColor.rgb;
            sK = smoothstep( 0.4, 0.75, vS * uTreeSnow + ( n1 - 0.5 ) * 0.4 );
          } else {
            // rime: snow plastered over needles, the odd dark tuft showing through
            float rime = vSnow * uTreeSnow + ( n2 - 0.5 ) * 0.9 + ( n1 - 0.5 ) * 0.4;
            diffuseColor.rgb = vec3( 0.017, 0.032, 0.024 );
            sK = smoothstep( 0.6, 0.85, rime );
            sB = 0.84 + 0.16 * n1 + 0.08 * ( n2 - 0.5 ); // (crusty: rime feathers, not a smooth cake)
            treeSnowN = 0.0;
          }
          diffuseColor.a = 1.0;
          sM = 0.0;
        } else {
          diffuseColor.a = max( diffuseColor.a, sK );
          // the needles poking out round a clump sit in its shade (no pale green rim)
          diffuseColor.rgb *= 1.0 - 0.45 * smoothstep( th - 0.12, th + 0.02, sM ) * ( 1.0 - sK );
          // thin needles at the edge of a bough and round the rim of the crown let the sun through
          treeTransK = ( 1.0 - sK ) * ( 0.45 + 0.55 * ( 1.0 - smoothstep( 0.5, 0.95, a0 ) ) ) * smoothstep( 0.35, 0.85, vColor.r );
          if ( !gl_FrontFacing ) { diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.05, 0.07, 0.06 ), sK ); sK = 0.0; treeSnowN = 0.0; }
          else sK *= mix( 0.82, 1.0, smoothstep( th, th + 0.35, sM ) );
        }
      }` : `
      // (clumps of snow on dark needles, like the cards these stand in for)
      float pn = texture2D( uNoise, vCXZ * 0.31 ).r * 0.6 + texture2D( uNoise, vCXZ * 0.77 + 0.4 ).g * 0.4;
      sK = smoothstep( 0.12, 0.6, vS * uTreeSnow * 2.0 + ( pn - 0.5 ) * 1.0 ) * 0.92;
      treeSnowN = sK * 0.7;`}
      diffuseColor.rgb = mix( diffuseColor.rgb, ${SNOW_COL} * sB, sK );`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.7, sK );')
      // (needles are matte: no sky sheen glancing off the cards' edges)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectSpecular *= mix( 0.04, 0.6, sK );\n{ float cs = cloudSun( vCXZ ); reflectedLight.directDiffuse *= cs; reflectedLight.directSpecular *= cs * mix( 0.25, 1.0, sK ); }')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      normal = normalize( mix( normal, normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ), treeSnowN * treeSnowN * 0.85 ) );`);
  };
  m.customProgramCacheKey = () => 'spruce2-' + (bough ? 'b' : 's') + snowK;
  return m;
}

// ---------- the instanced forest ----------
const _wn = new THREE.Vector3(), _wu = new THREE.Vector3(0, 1, 0), _wq = new THREE.Quaternion(), _wm = new THREE.Matrix4(), _wp = new THREE.Vector3(), _ws = new THREE.Vector3();
// near cards / wider cards / skirts / (far off, a few pixels tall) three-tier cones; how far it draws
const LODS = {
  low: [55, 200, 520, 2300], high: [85, 320, 800, 3200], ultra: [120, 450, 1150, 3600],
};
const NL = 4;
const FADE = 0.14; // cross-fade band: the last 14% inside each boundary

export class SpruceForest {
  /** trees: [{x, y, z, v, s, rot, tint, sx}] */
  constructor(trees, quality, patch, snow) {
    this.group = new THREE.Group();
    // (the wind blows the same way as the weather's: from the west, down the valley)
    this.U = { uTime: { value: 0 }, uTreeSnow: snow, uWind: { value: new THREE.Vector3(0.8, 0, 0.6) } };
    this.lod = LODS[quality] ?? LODS.high;
    this.maxD = this.lod[3];
    const tex = boughTextures();
    const geos = [];
    for (let v = 0; v < VARIANTS; v++) {
      if (CONIFER(v)) geos.push([boughTree(v, 0), boughTree(v, 1), skirtTree(v, 5, 8), skirtTree(v, 2, 3)]);
      else if (v === SPECIES.snag) geos.push([snagTree(0), snagTree(1), snagTree(1), snagTree(1)]);
      else if (v === SPECIES.larch) geos.push([boughTree(v, 0), boughTree(v, 1), boughTree(v, 2), boughTree(v, 2)]);
      else geos.push([ghostTree(0), ghostTree(1), ghostTree(2), ghostTree(2)]);
    }
    // each LOD fades in over its inner boundary and out over its outer one
    const bands = [];
    for (let l = 0; l < NL; l++) bands.push(new THREE.Vector4(l ? this.lod[l - 1] : 0, this.lod[l], FADE, 0));
    // (far off, the snow on a crown reads as far less than it is: the dark under the boughs wins)
    const boughM = bands.map((b) => spruceMaterial(tex, this.U, true, 1, b));
    const farM = [null, null, spruceMaterial(tex, this.U, false, 0.7, bands[2]), spruceMaterial(tex, this.U, false, 0.45, bands[3])];
    for (const m of [...boughM, ...farM]) if (m) patch(m);
    this.tris = geos.map((g) => g.map((x) => x.index.count / 3));
    // per-tree matrices and tints
    const N = trees.length;
    this.N = N;
    this.mats = new Float32Array(N * 16);
    this.cols = new Float32Array(N * 3);
    this.var = new Uint8Array(N);
    this.pos = new Float32Array(N * 3);
    this.lk = new Float32Array(N); // LOD distance scale (small trees)
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
      this.lk[i] = Math.max(1, LOD_S / t.s);
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
        const mat = l < 2 || !CONIFER(v) ? boughM[l] : farM[l];
        const im = new THREE.InstancedMesh(geos[v][l], mat, Math.max(1, perVar[v]));
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, perVar[v]) * 3), 3);
        im.instanceColor.setUsage(THREE.DynamicDrawUsage);
        im.count = 0;
        im.visible = false;
        im.frustumCulled = false;
        im.castShadow = l < 2;
        im.receiveShadow = true;
        im.name = `spruce_l${l}_v${v}`;
        this.group.add(im);
        row.push(im);
      }
      this.meshes.push(row);
    }
    // tree wells: the hollow the snow leaves round a trunk, in the shade of the lowest boughs
    // (the trees near enough to see one; their matrices worked out the first time they're needed)
    {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 31);
      r.addColorStop(0, 'rgba(255,255,255,0.95)'); r.addColorStop(0.35, 'rgba(255,255,255,0.7)'); r.addColorStop(0.7, 'rgba(255,255,255,0.22)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
      const wm = new THREE.MeshBasicMaterial({ color: 0x23324a, alphaMap: new THREE.CanvasTexture(c), transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 });
      this.wells = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), wm, Math.max(1, Math.min(N, 6000)));
      this.wells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.wells.count = 0; this.wells.frustumCulled = false; this.wells.renderOrder = 1;
      this.group.add(this.wells);
      this.wellMats = new Float32Array(N * 16); this.wellOk = new Uint8Array(N);
    }
    this.last = new THREE.Vector3(1e9, 0, 0);
    this.lastDir = new THREE.Vector3();
    this.frust = new THREE.Frustum();
    this.pm = new THREE.Matrix4();
    this.age = 0;
    this.dir = new THREE.Vector3();
  }

  wellMatrix(i) {
    const M = this.mats, x = M[i * 16 + 12], y = M[i * 16 + 13], z = M[i * 16 + 14];
    const s = Math.hypot(M[i * 16 + 4], M[i * 16 + 5], M[i * 16 + 6]); // the tree's height scale
    normalAt(x, z, _wn);
    _wq.setFromUnitVectors(_wu, _wn);
    const d = (this.var[i] === SPECIES.snag ? 2.4 : this.var[i] === SPECIES.ghost ? 8 : 5.6) * s;
    _wm.compose(_wp.set(x, y + 0.14, z), _wq, _ws.set(d, 1, d)).toArray(this.wellMats, i * 16);
    this.wellOk[i] = 1;
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
    const B = this.lod;
    const cnt = this.meshes.map((r) => r.map(() => 0));
    let nw = 0;
    const wMax = this.wells.instanceMatrix.count, W = this.wells.instanceMatrix.array;
    const S = new THREE.Sphere();
    const cx = cp.x, cy = cp.y, cz = cp.z;
    const add = (l, i) => {
      const v = this.var[i];
      const im = this.meshes[l][v];
      const k = cnt[l][v]++;
      im.instanceMatrix.array.set(this.mats.subarray(i * 16, i * 16 + 16), k * 16);
      im.instanceColor.array.set(this.cols.subarray(i * 3, i * 3 + 3), k * 3);
    };
    for (const c of this.cells) {
      S.copy(c.sphere); S.radius += 25;
      if (S.center.distanceToSquared(cp) > (this.maxD + S.radius) ** 2) continue;
      if (!this.frust.intersectsSphere(S)) continue;
      for (const i of c.idx) {
        const dx = this.pos[i * 3] - cx, dy = this.pos[i * 3 + 1] - cy, dz = this.pos[i * 3 + 2] - cz;
        const k = this.lk[i];
        const d2 = (dx * dx + dy * dy + dz * dz) * k * k;
        const d = Math.sqrt(d2), m = 3 * k; // (margin: the camera moves up to 2 m between sorts)
        if (d > this.maxD + m) continue;
        const l = d < B[0] ? 0 : d < B[1] ? 1 : d < B[2] ? 2 : 3;
        add(l, i);
        // in the band either side of a boundary: drawn in both LODs, the shader dithers between
        if (l < NL - 1 && d > B[l] * (1 - FADE) - m) add(l + 1, i);
        else if (l > 0 && d < B[l - 1] + m) add(l - 1, i);
        if (l < 2 && nw < wMax) {
          if (!this.wellOk[i]) this.wellMatrix(i);
          W.set(this.wellMats.subarray(i * 16, i * 16 + 16), nw++ * 16);
        }
      }
    }
    this.wells.count = nw;
    this.wells.instanceMatrix.clearUpdateRanges(); this.wells.instanceMatrix.addUpdateRange(0, nw * 16); this.wells.instanceMatrix.needsUpdate = true;
    for (let l = 0; l < NL; l++) for (let v = 0; v < VARIANTS; v++) {
      const im = this.meshes[l][v], k = cnt[l][v];
      im.count = k;
      im.visible = k > 0;
      im.instanceMatrix.clearUpdateRanges(); im.instanceMatrix.addUpdateRange(0, k * 16); im.instanceMatrix.needsUpdate = true;
      im.instanceColor.clearUpdateRanges(); im.instanceColor.addUpdateRange(0, k * 3); im.instanceColor.needsUpdate = true;
    }
  }
}
