// The kit a rider wears, built in code: helmet and beanie (fitted to the avatars' heads),
// goggles with a mirrored lens, ski and snowboard boots, skis and boards with printed top
// sheets, bindings and poles. Head gear is in the head frame used by SkierModel: origin at
// the skull point (eye level), +Y up, +Z out of the face, +X the rider's left. Boots, skis
// and bindings: origin on the ski / board under the boot centre, +Z toward the toes.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const cache = new Map();
const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const hexs = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');

// ---------------------------------------------------------------- the head
// the shell sits on an ellipsoid round the cranium; the avatar's hair is squeezed inside
// HAIR (see avatar.js) so nothing pokes through
export const SHELL = { c: [0, 0.03, 0.015], r: [0.118, 0.13, 0.142] };
export const HAIR = { c: [0, 0.03, 0.015], r: [0.1, 0.11, 0.122] };
export const KNIT = { c: [0, 0.03, 0.012], r: [0.103, 0.124, 0.122] };

// how low the edge comes, round the head (az 0 = the face)
const helmetCut = (az) => { const f = (1 + Math.cos(az)) / 2; return -0.062 + 0.11 * f - 0.028 * Math.sin(az) ** 2; };
const beanieCut = (az) => { const f = (1 + Math.cos(az)) / 2; return -0.045 + 0.105 * f - 0.025 * Math.sin(az) ** 2; };

function ellipsoidShell({ c, r }, cut, segA = 56, segV = 18, colorAt = null, groove = null) {
  const pos = [], nrm = [], col = [], idx = [];
  const ring = segA + 1;
  for (let i = 0; i <= segV; i++) {
    for (let k = 0; k <= segA; k++) {
      const az = (k / segA) * TAU;
      const cosCut = Math.max(-0.999, Math.min(0.999, (cut(az) - c[1]) / r[1]));
      const th = (i / segV) * Math.acos(cosCut);
      let x = r[0] * Math.sin(th) * Math.sin(az), y = r[1] * Math.cos(th), z = r[2] * Math.sin(th) * Math.cos(az);
      const n = new THREE.Vector3(x / r[0] ** 2, y / r[1] ** 2, z / r[2] ** 2).normalize();
      const g = groove ? groove(x, y, z, th, az) : 0;
      x -= n.x * g; y -= n.y * g; z -= n.z * g;
      pos.push(x + c[0], y + c[1], z + c[2]);
      nrm.push(n.x, n.y, n.z);
      const cc = colorAt ? colorAt(x, y, z, th, az, g) : [1, 1, 1];
      col.push(...cc);
    }
  }
  for (let i = 0; i < segV; i++) for (let k = 0; k < segA; k++) {
    const a = i * ring + k, b = a + ring;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { pos, nrm, col, idx, ring, segV };
}

function toGeo(parts) {
  const pos = [], nrm = [], col = [], idx = [], uv = [];
  let o = 0;
  for (const p of parts) {
    pos.push(...p.pos); nrm.push(...p.nrm); col.push(...p.col);
    if (p.uv) uv.push(...p.uv); else for (let i = 0; i < p.pos.length / 3; i++) uv.push(0, 0);
    for (const i of p.idx) idx.push(i + o);
    o += p.pos.length / 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// a geometry's parts from a stock three.js one, in one colour
function stock(geo, color) {
  const g = geo.index ? geo : geo;
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  const out = { pos: Array.from(p.array), nrm: Array.from(n.array), col: [], idx: g.index ? Array.from(g.index.array) : [...Array(p.count).keys()] };
  for (let i = 0; i < p.count; i++) out.col.push(color.r, color.g, color.b);
  return out;
}

// a helmet: the shell (its stripe and vents are drawn by helmetMaterial), a dark rim and liner
export function helmetGeometry() {
  return once('helmet', () => {
    const white = [1, 1, 1], dark = [0.09, 0.09, 0.1];
    const outer = ellipsoidShell(SHELL, helmetCut, 96, 24, () => white);
    // the liner inside, facing in
    const inner = ellipsoidShell({ c: SHELL.c, r: SHELL.r.map((v) => v - 0.014) }, (az) => helmetCut(az) + 0.004, 48, 6, () => dark);
    for (let i = 0; i < inner.idx.length; i += 3) [inner.idx[i + 1], inner.idx[i + 2]] = [inner.idx[i + 2], inner.idx[i + 1]];
    for (let i = 0; i < inner.nrm.length; i++) inner.nrm[i] *= -1;
    // the rim joining them
    const rim = { pos: [], nrm: [], col: [], idx: [] };
    const N = 96;
    for (let k = 0; k <= N; k++) {
      const a = outer.segV * outer.ring + k, ki = Math.round((k / N) * 48);
      const b = inner.segV * inner.ring + ki;
      rim.pos.push(...outer.pos.slice(a * 3, a * 3 + 3), ...inner.pos.slice(b * 3, b * 3 + 3));
      rim.nrm.push(0, -1, 0, 0, -1, 0);
      rim.col.push(...dark, ...dark);
      if (k < N) { const o = k * 2; rim.idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
    }
    return toGeo([outer, inner, rim]);
  });
}

// the shell's paint: its colour, a stripe over the top in c2, three vent slots, a finish
export function helmetMaterial(c, c2, fin) {
  const m = new THREE.MeshStandardMaterial({ color: c, vertexColors: true, roughness: fin === 1 ? 0.62 : fin === 2 ? 0.1 : 0.26, metalness: fin === 2 ? 1 : 0.05, envMapIntensity: fin === 2 ? 1.4 : 1 });
  const u = { uStripe: { value: new THREE.Color(c2 ?? c) }, uHasStripe: { value: c2 != null && c2 !== c ? 1 : 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHP; uniform vec3 uStripe; uniform float uHasStripe;')
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float shell = step( 0.5, vColor.r );
  float aa = fwidth( vHP.x ) * 1.2;
  float top = smoothstep( 0.0, 0.02, vHP.y - 0.02 );
  float st = ( 1.0 - smoothstep( 0.017 - aa, 0.017 + aa, abs( vHP.x ) ) ) * top * uHasStripe * shell;
  diffuseColor.rgb = mix( diffuseColor.rgb, uStripe, st );
  float vz = smoothstep( -0.075, -0.05, vHP.z ) * smoothstep( 0.115, 0.085, vHP.z ) * smoothstep( 0.07, 0.1, vHP.y );
  float slot = 0.0;
  for ( int i = -1; i <= 1; i++ ) slot = max( slot, 1.0 - smoothstep( 0.0045 - aa, 0.0045 + aa, abs( vHP.x - float( i ) * 0.036 ) ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.04 ), slot * vz * shell );
}`);
  };
  m.customProgramCacheKey = () => 'ag-helmet';
  return m;
}

// a knitted beanie: ribbed, a folded cuff, maybe a pom
export function beanieGeometry(pom) {
  return once('beanie' + pom, () => {
    const rib = (x, y, z, th, az) => { const k = 0.86 + 0.14 * Math.abs(Math.sin(az * 36)); return [k, k, k]; };
    const crown = ellipsoidShell(KNIT, beanieCut, 96, 16, rib);
    // the cuff: a fat band round the edge
    const cuff = { pos: [], nrm: [], col: [], idx: [] };
    const N = 96, H = 0.042, R = 1.06;
    for (let k = 0; k <= N; k++) {
      const az = (k / N) * TAU, y0 = beanieCut(az);
      for (const [j, dy] of [[0, -0.004], [1, H * 0.5], [2, H]]) {
        const y = y0 + dy;
        const cosT = Math.max(-0.999, Math.min(0.999, (y - KNIT.c[1]) / KNIT.r[1]));
        const s = Math.sqrt(1 - cosT * cosT) * (j === 1 ? R + 0.015 : R);
        const x = KNIT.r[0] * s * Math.sin(az), z = KNIT.r[2] * s * Math.cos(az);
        cuff.pos.push(x + KNIT.c[0], y, z + KNIT.c[2]);
        const n = new THREE.Vector3(Math.sin(az), j === 0 ? -0.6 : j === 2 ? 0.6 : 0, Math.cos(az)).normalize();
        cuff.nrm.push(n.x, n.y, n.z);
        const kk = 0.8 + 0.2 * Math.abs(Math.sin(az * 48));
        cuff.col.push(kk, kk, kk);
      }
      if (k < N) { const o = k * 3; cuff.idx.push(o, o + 3, o + 1, o + 1, o + 3, o + 4, o + 1, o + 4, o + 2, o + 2, o + 4, o + 5); }
    }
    const parts = [crown, cuff];
    if (pom) {
      const p = stock(new THREE.IcosahedronGeometry(0.036, 2).translate(KNIT.c[0], KNIT.c[1] + KNIT.r[1] + 0.022, KNIT.c[2] - 0.01), new THREE.Color(1, 1, 1));
      // fluffy: jitter the colour
      for (let i = 0; i < p.col.length; i += 3) { const k = 0.82 + Math.random() * 0.18; p.col[i] = p.col[i + 1] = p.col[i + 2] = k; }
      parts.push(p);
    }
    return toGeo(parts);
  });
}

// goggles: a curved frame, a lens bulging out of it, a strap round the back of the head
const GOG = { cy: 0.02, cz: 0.022, r: 0.137, span: 1.0, h0: -0.01, h1: 0.05 };
function inGoggle(s, y, grow = 0) {
  // a rounded rectangle in (arc length, height), with a notch for the nose
  const half = GOG.span * GOG.r + grow;
  const top = GOG.h1 + grow, bot = GOG.h0 - grow + 0.014 * Math.max(0, 1 - Math.abs(s) / 0.028);
  const rr = 0.022;
  if (Math.abs(s) > half || y > top || y < bot) return false;
  const dx = Math.max(0, Math.abs(s) - (half - rr)), dy = Math.max(0, y - (top - rr), (bot + rr) - y);
  return Math.hypot(dx, dy) <= rr;
}
// a fan from the middle out to the outline, wrapped on a cylinder round the face
function goggleSurface(r, grow, bulge, color, flip = false) {
  const N = 72, M = 6, out = { pos: [], nrm: [], col: [], idx: [] };
  const yc = (GOG.h0 + GOG.h1) / 2;
  const edge = [];
  for (let k = 0; k < N; k++) {
    const a = (k / N) * TAU, ds = Math.cos(a), dy = Math.sin(a);
    let lo = 0, hi = 0.2;
    for (let it = 0; it < 22; it++) { const m = (lo + hi) / 2; if (inGoggle(ds * m, yc + dy * m, grow)) lo = m; else hi = m; }
    edge.push([ds * lo, yc + dy * lo]);
  }
  const P = (s, y) => {
    const az = s / GOG.r, u = s / (GOG.span * GOG.r), v = (y - yc) / (GOG.h1 - GOG.h0);
    const rr = r + bulge * Math.max(0, 1 - u * u) * Math.max(0, 1 - 4 * v * v);
    const n = new THREE.Vector3(Math.sin(az), -v * 0.25, Math.cos(az)).normalize();
    out.pos.push(rr * Math.sin(az), y, GOG.cz + rr * Math.cos(az));
    out.nrm.push(n.x, n.y, n.z);
    out.col.push(...color);
  };
  P(0, yc);
  for (let m = 1; m <= M; m++) for (let k = 0; k < N; k++) { const t = m / M; P(edge[k][0] * t, yc + (edge[k][1] - yc) * t); }
  const id = (m, k) => (m === 0 ? 0 : 1 + (m - 1) * N + (k % N));
  for (let m = 0; m < M; m++) for (let k = 0; k < N; k++) {
    if (m === 0) { flip ? out.idx.push(0, id(1, k + 1), id(1, k)) : out.idx.push(0, id(1, k), id(1, k + 1)); continue; }
    const a = id(m, k), b = id(m + 1, k), c = id(m, k + 1), d = id(m + 1, k + 1);
    if (flip) out.idx.push(a, c, b, c, d, b); else out.idx.push(a, b, c, c, b, d);
  }
  // the frame's rim: from this surface back toward the face
  return out;
}

export function goggleGeometry() {
  return once('goggles', () => {
    const frame = goggleSurface(GOG.r, 0.008, 0.004, [1, 1, 1]);
    const back = goggleSurface(GOG.r - 0.018, 0.008, 0, [0.1, 0.1, 0.11], true);
    // join the two outlines: the frame's depth
    const rim = { pos: [], nrm: [], col: [], idx: [] };
    const N = 72, M = 6, o1 = 1 + (M - 1) * N;
    for (let k = 0; k <= N; k++) {
      const i = o1 + (k % N);
      rim.pos.push(...frame.pos.slice(i * 3, i * 3 + 3), ...back.pos.slice(i * 3, i * 3 + 3));
      const n = frame.nrm.slice(i * 3, i * 3 + 3);
      rim.nrm.push(...n, ...n);
      rim.col.push(0.6, 0.6, 0.6, 0.6, 0.6, 0.6);
      if (k < N) { const o = k * 2; rim.idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3); }
    }
    const g = toGeo([frame, back, rim]);
    g.computeVertexNormals();
    return g;
  });
}
export function lensGeometry() { return once('lens', () => toGeo([goggleSurface(GOG.r + 0.003, -0.003, 0.012, [1, 1, 1])])); }

// the strap: round the back of the head, from one side of the frame to the other
export function strapGeometry(onBeanie) {
  return once('strap' + onBeanie, () => {
    const E = onBeanie ? KNIT : SHELL;
    const out = { pos: [], nrm: [], col: [], idx: [] };
    const a0 = GOG.span * 0.92, N = 48;
    const yc = GOG.cy + 0.004;
    for (let k = 0; k <= N; k++) {
      const az = a0 + ((TAU - 2 * a0) * k) / N;
      for (const [j, dy] of [[0, -0.019], [1, 0.019]]) {
        const y = yc + dy;
        const cosT = Math.max(-0.99, Math.min(0.99, (y - E.c[1]) / E.r[1]));
        const s = Math.sqrt(1 - cosT * cosT) * (onBeanie ? 1.075 : 1.035);
        out.pos.push(E.r[0] * s * Math.sin(az) + E.c[0], y, E.r[2] * s * Math.cos(az) + E.c[2]);
        out.nrm.push(Math.sin(az), 0, Math.cos(az));
        // a printed band down the middle
        out.col.push(1, 1, 1);
        void j;
      }
      if (k < N) { const o = k * 2; out.idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
    }
    return toGeo([out]);
  });
}

// a jacket's high collar round the neck (in the chest frame: +Y up the spine, +Z forward)
export function collarGeometry() {
  return once('collar', () => {
    const out = { pos: [], nrm: [], col: [], idx: [] };
    const N = 32;
    const rings = [[-0.01, 0.088, 0.082], [0.05, 0.08, 0.075], [0.085, 0.074, 0.07], [0.095, 0.068, 0.064]];
    rings.forEach(([y, rx, rz], j) => {
      for (let k = 0; k <= N; k++) {
        const az = (k / N) * TAU;
        // open a little at the front: the zip
        const zf = Math.cos(az) > 0.96 ? 0.94 : 1;
        out.pos.push(rx * Math.sin(az) * zf, y + Math.max(0, Math.cos(az)) * (j === 3 ? -0.018 : 0), rz * Math.cos(az) * zf + 0.012);
        out.nrm.push(Math.sin(az), 0.15, Math.cos(az));
        const k2 = j === 3 ? 0.75 : 1;
        out.col.push(k2, k2, k2);
      }
      if (j < rings.length - 1) for (let k = 0; k < N; k++) { const a = j * (N + 1) + k, b = a + N + 1; out.idx.push(a, a + 1, b, a + 1, b + 1, b); }
    });
    return toGeo([out]);
  });
}

// ---------------------------------------------------------------- feet
// a loft through rounded-rectangle rings: [y, zCentre, halfWidth x, halfLength z, squareness]
function loft(rings, N = 28, colorAt = () => [1, 1, 1], capTop = true) {
  const out = { pos: [], nrm: [], col: [], idx: [] };
  const R = rings.length;
  const pt = (rg, t) => {
    const [y, zc, wx, wz, p] = rg;
    const c = Math.cos(t), s = Math.sin(t);
    const e = 2 / p;
    const x = wx * Math.sign(s) * Math.abs(s) ** e, z = zc + wz * Math.sign(c) * Math.abs(c) ** e;
    return [x, y, z];
  };
  for (let j = 0; j < R; j++) {
    for (let k = 0; k <= N; k++) {
      const t = (k / N) * TAU;
      const [x, y, z] = pt(rings[j], t);
      out.pos.push(x, y, z);
      const n = new THREE.Vector3(x / rings[j][2], 0, (z - rings[j][1]) / rings[j][3]).normalize();
      out.nrm.push(n.x, n.y, n.z);
      out.col.push(...colorAt(x, y, z, j, t));
    }
  }
  for (let j = 0; j < R - 1; j++) for (let k = 0; k < N; k++) {
    const a = j * (N + 1) + k, b = a + N + 1;
    out.idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  // sole and top caps
  const cap = (j, up) => {
    const c0 = out.pos.length / 3;
    const [y, zc] = rings[j];
    out.pos.push(0, y, zc); out.nrm.push(0, up ? 1 : -1, 0); out.col.push(...colorAt(0, y, zc, j, -1));
    for (let k = 0; k <= N; k++) {
      const i = j * (N + 1) + k;
      out.pos.push(out.pos[i * 3], out.pos[i * 3 + 1], out.pos[i * 3 + 2]); out.nrm.push(0, up ? 1 : -1, 0);
      out.col.push(...(up ? [0.12, 0.12, 0.13] : colorAt(0, y, zc, j, -1)));
    }
    for (let k = 0; k < N; k++) up ? out.idx.push(c0, c0 + 1 + k, c0 + 1 + k + 1) : out.idx.push(c0, c0 + 1 + k + 1, c0 + 1 + k);
  };
  cap(0, false);
  if (capTop) cap(R - 1, true);
  return out;
}

// a ski boot: a hard shell with four buckles and a power strap, soles on the binding
export function skiBootGeometry() {
  return once('skiboot', () => {
    const sole = [0.13, 0.13, 0.14];
    const shell = loft([
      [0.035, 0.022, 0.054, 0.165, 3.2], [0.05, 0.022, 0.057, 0.164, 3.2], [0.09, 0.02, 0.06, 0.158, 2.6], [0.12, 0.0, 0.06, 0.135, 2.4],
      [0.16, -0.02, 0.06, 0.1, 2.4], [0.2, -0.012, 0.062, 0.078, 2.2], [0.26, 0.004, 0.064, 0.072, 2.2], [0.33, 0.022, 0.066, 0.072, 2.2],
    ], 32, (x, y) => (y < 0.052 ? sole : [1, 1, 1]));
    const parts = [shell];
    // buckles on the outside (the +x side; the right boot is mirrored)
    const metal = new THREE.Color(0.78, 0.8, 0.84);
    for (const [y, z, w] of [[0.11, 0.1, 0.03], [0.165, 0.055, 0.032], [0.235, 0.05, 0.034], [0.3, 0.07, 0.034]]) {
      parts.push(stock(new THREE.BoxGeometry(0.012, 0.016, w).rotateX(-0.2).translate(0.062, y, z * 0.6), metal));
    }
    // power strap round the top of the cuff
    const strap = new THREE.Color(0.1, 0.1, 0.11);
    parts.push(stock(new THREE.CylinderGeometry(0.072, 0.07, 0.028, 24, 1, true).translate(0, 0.315, 0.022).scale(1, 1, 1.08), strap));
    return toGeo(parts);
  });
}

// a snowboard boot: soft, laced, chunky
export function boardBootGeometry() {
  return once('boardboot', () => {
    const sole = [0.12, 0.12, 0.13];
    const shell = loft([
      [0.03, 0.02, 0.06, 0.168, 2.6], [0.05, 0.02, 0.064, 0.17, 2.4], [0.09, 0.016, 0.066, 0.162, 2.2], [0.125, -0.002, 0.066, 0.138, 2.1],
      [0.17, -0.018, 0.066, 0.106, 2.1], [0.22, -0.01, 0.068, 0.086, 2.0], [0.29, 0.0, 0.07, 0.08, 2.0],
    ], 32, (x, y) => (y < 0.05 ? sole : [1, 1, 1]));
    const lace = new THREE.Color(0.85, 0.85, 0.8);
    const parts = [shell];
    for (let i = 0; i < 6; i++) parts.push(stock(new THREE.BoxGeometry(0.05, 0.006, 0.008).translate(0, 0.0, 0).rotateX(-0.6 - i * 0.12).translate(0, 0.12 + i * 0.03, 0.105 - i * 0.012), lace));
    return toGeo(parts);
  });
}

// ---------------------------------------------------------------- top sheets
// draws a design on a canvas: length along y (the tip at the top), width along x
export function paintDesign(g, w, h, design, c1, c2, board = false) {
  const A = hexs(c1), B = hexs(c2);
  g.fillStyle = A; g.fillRect(0, 0, w, h);
  const rnd = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  g.save();
  switch (design) {
    case 'stripe': g.fillStyle = B; g.fillRect(w * 0.42, 0, w * 0.16, h); g.fillRect(w * 0.3, 0, w * 0.04, h); g.fillRect(w * 0.66, 0, w * 0.04, h); break;
    case 'tip': g.fillStyle = B; g.fillRect(0, 0, w, h * 0.16); g.fillRect(0, h * 0.86, w, h * 0.14); g.fillRect(0, h * 0.2, w, h * 0.02); break;
    case 'chevron': g.fillStyle = B; for (let y = -w; y < h; y += w * 1.1) { g.beginPath(); g.moveTo(0, y + w * 0.5); g.lineTo(w / 2, y); g.lineTo(w, y + w * 0.5); g.lineTo(w, y + w * 0.85); g.lineTo(w / 2, y + w * 0.35); g.lineTo(0, y + w * 0.85); g.fill(); } break;
    case 'checker': { g.fillStyle = B; const s = w / 4; for (let y = 0; y < h / s; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) g.fillRect(x * s, y * s, s, s); break; }
    case 'pixel': { const s = w / 8; for (let y = 0; y < h / s; y++) for (let x = 0; x < 8; x++) { const r = rnd(); if (r > 0.55) { g.fillStyle = r > 0.8 ? B : `color-mix(in srgb, ${A} 50%, ${B})`; g.fillRect(x * s, y * s, s, s); } } break; }
    case 'wood': {
      for (let x = 0; x < w; x += 2) { const k = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(x * 0.05) * 3); g.fillStyle = `color-mix(in srgb, ${A} ${(70 + k * 30).toFixed(0)}%, ${B})`; g.fillRect(x, 0, 2, h); }
      g.globalAlpha = 0.35; g.strokeStyle = B; g.lineWidth = 1.5;
      for (let i = 0; i < 9; i++) { const cx = rnd() * w, cy = rnd() * h; for (let r = 4; r < 22; r += 5) { g.beginPath(); g.ellipse(cx, cy, r * 0.5, r * 2.4, 0, 0, TAU); g.stroke(); } }
      break;
    }
    case 'tiger': g.fillStyle = B; for (let y = 0; y < h; y += w * 0.42) { const s = rnd() > 0.5 ? 1 : -1; g.beginPath(); g.moveTo(s > 0 ? 0 : w, y); g.quadraticCurveTo(w * 0.5, y + w * 0.1 + rnd() * w * 0.15, s > 0 ? w * (0.55 + rnd() * 0.35) : w * (0.45 - rnd() * 0.35), y + w * 0.2); g.quadraticCurveTo(w * 0.5, y + w * 0.3, s > 0 ? 0 : w, y + w * 0.18); g.fill(); } break;
    case 'galaxy': {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, A); gr.addColorStop(0.5, `color-mix(in srgb, ${A} 70%, #ff3d9a)`); gr.addColorStop(1, A); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = B; for (let i = 0; i < (w * h) / 900; i++) { const r = rnd() * 1.6 + 0.3; g.globalAlpha = 0.4 + rnd() * 0.6; g.beginPath(); g.arc(rnd() * w, rnd() * h, r, 0, TAU); g.fill(); }
      g.globalAlpha = 1; g.beginPath(); g.arc(w * 0.5, h * 0.3, w * 0.22, 0, TAU); g.fill(); g.fillStyle = A; g.beginPath(); g.arc(w * 0.58, h * 0.28, w * 0.19, 0, TAU); g.fill();
      break;
    }
    case 'bolt': g.fillStyle = B; for (let y = h * 0.08; y < h; y += h * 0.32) { g.beginPath(); g.moveTo(w * 0.62, y); g.lineTo(w * 0.22, y + h * 0.13); g.lineTo(w * 0.5, y + h * 0.13); g.lineTo(w * 0.36, y + h * 0.26); g.lineTo(w * 0.8, y + h * 0.1); g.lineTo(w * 0.52, y + h * 0.1); g.closePath(); g.fill(); } break;
    case 'peaks': {
      g.fillStyle = B;
      for (const [y0, k] of [[h * 0.42, 1], [h * 0.75, 0.7]]) { g.beginPath(); g.moveTo(0, y0); for (let x = 0; x <= w; x += w / 6) g.lineTo(x, y0 - (x / (w / 6)) % 2 * w * 0.5 * k - w * 0.1); g.lineTo(w, y0 + w); g.lineTo(0, y0 + w); g.fill(); }
      g.beginPath(); g.arc(w * 0.5, h * 0.15, w * 0.24, 0, TAU); g.fill();
      break;
    }
    case 'fade': { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, B); gr.addColorStop(1, A); g.fillStyle = gr; g.fillRect(0, 0, w, h); break; }
    case 'camo': for (let i = 0; i < (w * h) / 500; i++) { g.fillStyle = rnd() > 0.5 ? B : `color-mix(in srgb, ${A} 45%, ${B})`; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, w * (0.1 + rnd() * 0.18), w * (0.2 + rnd() * 0.4), rnd() * 3, 0, TAU); g.fill(); } break;
    case 'stars': g.fillStyle = B; for (let i = 0; i < h / (w * 0.5); i++) { const cx = (0.2 + rnd() * 0.6) * w, cy = rnd() * h, r = w * (0.08 + rnd() * 0.12); g.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU - Math.PI / 2, rr = k % 2 ? r * 0.45 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.fill(); } break;
    case 'dots': g.fillStyle = B; for (let y = w * 0.25, i = 0; y < h; y += w * 0.42, i++) for (let x = (i % 2 ? 0.25 : 0.65) * w; x < w; x += w * 0.8) { g.beginPath(); g.arc(x, y, w * 0.14, 0, TAU); g.fill(); } break;
    case 'split': g.fillStyle = B; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h * 0.35); g.lineTo(0, h * 0.65); g.fill(); break;
    case 'flames': {
      g.fillStyle = B;
      const f = (base, col, s) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, h); g.lineTo(0, base); for (let x = 0; x <= w; x += w / 5) g.quadraticCurveTo(x + w / 10, base - h * (0.12 + rnd() * 0.18) * s, x + w / 5, base - h * 0.02); g.lineTo(w, h); g.fill(); };
      f(h * 0.62, B, 1); f(h * 0.78, '#ffd21e', 0.7);
      break;
    }
    default: break;
  }
  g.restore();
  // the name, small, running along it
  g.save();
  g.translate(w / 2, h * 0.55);
  g.rotate(-Math.PI / 2);
  g.font = `italic 800 ${Math.round(w * (board ? 0.16 : 0.42))}px "Barlow Condensed", Inter, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const dark = (new THREE.Color(c1).getHSL({}).l > 0.55);
  g.fillStyle = design === 'logo' ? B : dark ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.75)';
  g.fillText('ALPENGLOW', 0, 0);
  g.restore();
  if (design === 'logo') { g.fillStyle = B; g.fillRect(0, h * 0.06, w, h * 0.012); g.fillRect(0, h * 0.93, w, h * 0.012); }
}

export function designTexture(design, c1, c2, board = false) {
  return once(`tex:${design}:${c1}:${c2}:${board}`, () => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    const w = board ? 256 : 96, h = 1024;
    c.width = w + 32; c.height = h;
    const g = c.getContext('2d');
    paintDesign(g, w, h, design, c1, c2, board);
    // the base and sidewalls: a dark strip at the right edge
    g.fillStyle = '#16171b'; g.fillRect(w, 0, 32, h);
    g.fillStyle = '#e8e8e8'; g.fillRect(w + 16, 0, 16, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.userData.split = w / (w + 32);
    return t;
  });
}

// an icon of the top sheet for the menu
export function designURL(design, c1, c2, board = false) {
  return once(`url:${design}:${c1}:${c2}:${board}`, () => {
    if (typeof document === 'undefined') return '';
    const c = document.createElement('canvas');
    const w = board ? 128 : 48, h = 512;
    c.width = w; c.height = h;
    paintDesign(c.getContext('2d'), w, h, design, c1, c2, board);
    return c.toDataURL('image/png');
  });
}

// ---------------------------------------------------------------- skis and boards
// a twin-tip ski, 1.72 m: sidecut, rockered tip and tail, thinner at the ends; uv: top sheet
export function skiGeometry() {
  return once('ski', () => {
    const L = 1.72, segs = 64, split = 96 / 128;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs; // 0 tail, 1 tip
      const z = -L * 0.45 + t * L;
      const sc = 1 - Math.sin(t * Math.PI) * 0.2;
      let w = 0.054 * sc;
      // rounded tip and tail
      if (t > 0.93) w *= Math.sqrt(Math.max(0, 1 - ((t - 0.93) / 0.07) ** 2)) * 0.85 + 0.15;
      if (t < 0.05) w *= Math.sqrt(Math.max(0, 1 - ((0.05 - t) / 0.05) ** 2)) * 0.8 + 0.2;
      let y = 0.012;
      if (t > 0.82) y += ((t - 0.82) / 0.18) ** 2 * 0.085;
      if (t < 0.12) y += ((0.12 - t) / 0.12) ** 2 * 0.06;
      const T = 0.008 + 0.012 * Math.sin(t * Math.PI);
      const v = t;
      // top left, top right, bottom left, bottom right; then the sidewall copies
      pos.push(w, y + T, z, -w, y + T, z, w, y, z, -w, y, z);
      uv.push(0, v, split, v, 0.81, v, 0.81, v);
      pos.push(w, y + T, z, w, y, z, -w, y + T, z, -w, y, z);
      uv.push(0.97, v, 0.97, v, 0.97, v, 0.97, v);
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 8, b = a + 8;
      idx.push(a, a + 1, b, a + 1, b + 1, b); // top (tip toward +z)
      idx.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3); // base
      idx.push(a + 4, b + 4, a + 5, a + 5, b + 4, b + 5); // left side
      idx.push(a + 6, a + 7, b + 6, a + 7, b + 7, b + 6); // right side
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
}

// a twin-tip board, 1.56 m, nose along +X; uv: top sheet
export function boardGeometry() {
  return once('board', () => {
    const L = 1.56, segs = 72, split = 256 / 288;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const z = -L / 2 + t * L;
      const u = Math.abs(t - 0.5) * 2;
      let w = 0.124 + 0.022 * Math.pow(Math.min(u / 0.74, 1), 2);
      if (u > 0.8) w *= 0.3 + 0.7 * Math.sqrt(Math.max(0, 1 - ((u - 0.8) / 0.2) ** 2));
      const y = 0.006 + (u > 0.72 ? ((u - 0.72) / 0.28) ** 2 * 0.075 : 0);
      const T = 0.008 + 0.01 * (1 - u * u);
      pos.push(w, y + T, z, -w, y + T, z, w, y, z, -w, y, z);
      uv.push(0, t, split, t, 0.917, t, 0.917, t);
      pos.push(w, y + T, z, w, y, z, -w, y + T, z, -w, y, z);
      uv.push(0.97, t, 0.97, t, 0.97, t, 0.97, t);
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 8, b = a + 8;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
      idx.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);
      idx.push(a + 4, b + 4, a + 5, a + 5, b + 4, b + 5);
      idx.push(a + 6, a + 7, b + 6, a + 7, b + 7, b + 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.rotateY(Math.PI / 2);
    g.computeVertexNormals();
    return g;
  });
}

// a ski binding under the boot: toe piece, heel piece with its lever, brake arms
export function skiBindingGeometry() {
  return once('skibind', () => {
    const body = new THREE.Color(0.16, 0.17, 0.19), acc = new THREE.Color(1, 1, 1), metal = new THREE.Color(0.7, 0.72, 0.76);
    const parts = [
      stock(new THREE.BoxGeometry(0.07, 0.016, 0.5).translate(0, 0.026, 0.0), body),
      stock(new THREE.BoxGeometry(0.078, 0.05, 0.075).translate(0, 0.055, 0.215), body),
      stock(new THREE.BoxGeometry(0.06, 0.02, 0.05).translate(0, 0.088, 0.21), acc),
      stock(new THREE.BoxGeometry(0.08, 0.065, 0.085).translate(0, 0.06, -0.19), body),
      stock(new THREE.BoxGeometry(0.05, 0.016, 0.1).rotateX(-0.35).translate(0, 0.1, -0.235), acc),
      stock(new THREE.BoxGeometry(0.006, 0.006, 0.08).rotateX(0.5).translate(0.05, 0.03, -0.13), metal),
      stock(new THREE.BoxGeometry(0.006, 0.006, 0.08).rotateX(0.5).translate(-0.05, 0.03, -0.13), metal),
    ];
    return toGeo(parts);
  });
}

// a snowboard binding: base plate, heel cup, highback, ankle and toe straps (toes along +Z)
export function boardBindingGeometry() {
  return once('boardbind', () => {
    const body = new THREE.Color(0.14, 0.15, 0.17), strap = new THREE.Color(1, 1, 1);
    const hb = new THREE.CylinderGeometry(0.085, 0.08, 0.2, 16, 1, true, Math.PI * 0.62, Math.PI * 0.76).translate(0, 0.14, -0.005).rotateX(-0.22);
    const cup = new THREE.CylinderGeometry(0.078, 0.078, 0.06, 16, 1, true, Math.PI * 0.55, Math.PI * 0.9).translate(0, 0.045, -0.02);
    const ankle = new THREE.CylinderGeometry(0.078, 0.078, 0.05, 16, 1, true, -Math.PI * 0.45, Math.PI * 0.9).translate(0, 0.17, 0.0).rotateX(0.35);
    const toe = new THREE.CylinderGeometry(0.075, 0.075, 0.035, 14, 1, true, -Math.PI * 0.42, Math.PI * 0.84).translate(0, 0.075, 0.1).scale(1, 1, 0.8);
    const parts = [
      stock(new THREE.BoxGeometry(0.135, 0.016, 0.29).translate(0, 0.008, 0.02), body),
      stock(cup, body), stock(hb, body), stock(ankle, strap), stock(toe, strap),
    ];
    const g = toGeo(parts);
    g.computeVertexNormals();
    return g;
  });
}

// a ski pole, grip at the top (origin), tip down -Y
export function poleGeometry(len) {
  return once('pole' + len, () => {
    const shaft = new THREE.Color(1, 1, 1), dark = new THREE.Color(0.08, 0.08, 0.09);
    const parts = [
      stock(new THREE.CylinderGeometry(0.0085, 0.006, len, 8).translate(0, -len / 2, 0), shaft),
      stock(new THREE.CylinderGeometry(0.019, 0.016, 0.16, 12).translate(0, -0.05, 0), dark),
      stock(new THREE.SphereGeometry(0.02, 10, 6).scale(1, 0.6, 1).translate(0, 0.03, 0), dark),
      stock(new THREE.TorusGeometry(0.042, 0.004, 6, 18).rotateX(Math.PI / 2).translate(0, -len + 0.09, 0), dark),
      stock(new THREE.CylinderGeometry(0.012, 0.016, 0.02, 8).translate(0, -len + 0.09, 0), dark),
      stock(new THREE.BoxGeometry(0.084, 0.003, 0.006).translate(0, -len + 0.09, 0), dark),
      stock(new THREE.BoxGeometry(0.006, 0.003, 0.084).translate(0, -len + 0.09, 0), dark),
    ];
    return toGeo(parts);
  });
}
