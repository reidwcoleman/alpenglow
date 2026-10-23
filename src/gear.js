// The kit a rider wears, built in code: helmet and beanie (fitted to the avatars' heads),
// goggles with a mirrored lens, ski and snowboard boots, skis and boards with printed top
// sheets, bindings and poles, and the materials that dress them. Head gear is in the head
// frame used by SkierModel: origin at the skull point (eye level), +Y up, +Z out of the face,
// +X the rider's left. Boots, skis and bindings: origin on the ski / board under the boot
// centre, +Z toward the toes.
//
// Most pieces share one "kit" material: each vertex carries a colour and a kind (gearMat):
// 0 the material's own colour shaded by the vertex colour, 1 bare metal, 2 rubber / fabric,
// 3 moulded plastic, 4 foam; all but 0 use the vertex colour as it is. So a whole boot (shell,
// sole, buckles, power strap, liner) is one mesh and one draw.
import * as THREE from 'three';
import { modelParts } from './models.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const TAU = Math.PI * 2;
const cache = new Map();
const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const hexs = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const K = { TINT: 0, METAL: 1, RUBBER: 2, PLASTIC: 3, FOAM: 4 };

// The kit as modelled in Blender (blender/gear.py): each piece in the same frame as the coded
// one below it, its colours times the baked shading in the vertex colour and what it's made of
// (K) in the alpha. Loaded before the riders are; the coded pieces stand in without it.
const BLEND = {};
export async function loadGearModels() {
  const parts = await modelParts('gear');
  for (const [k, g] of Object.entries(parts)) {
    const C4 = g.getAttribute('color');
    if (C4) {
      const n = C4.count, col = new Float32Array(n * 3), kind = new Float32Array(n);
      for (let i = 0; i < n; i++) { col[i * 3] = C4.getX(i); col[i * 3 + 1] = C4.getY(i); col[i * 3 + 2] = C4.getZ(i); kind[i] = Math.round(C4.getW(i) * 4); }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('gearMat', new THREE.BufferAttribute(kind, 1));
    }
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    BLEND[k] = g;
  }
}
const blended = (k) => BLEND[k] ?? null;

// ---------------------------------------------------------------- the head
// the shell sits on an ellipsoid round the cranium; the avatar's hair is squeezed inside
// HAIR (see avatar.js) so nothing pokes through
export const SHELL = { c: [0, 0.03, 0.015], r: [0.118, 0.13, 0.142] };
export const HAIR = { c: [0, 0.03, 0.015], r: [0.1, 0.11, 0.122] };
export const KNIT = { c: [0, 0.03, 0.012], r: [0.103, 0.124, 0.122] };

// how low the edge comes, round the head (az 0 = the face)
const helmetCut = (az) => { const f = (1 + Math.cos(az)) / 2; return -0.062 + 0.11 * f - 0.028 * Math.sin(az) ** 2; };
const beanieCut = (az) => { const f = (1 + Math.cos(az)) / 2; return -0.045 + 0.105 * f - 0.025 * Math.sin(az) ** 2; };

// a point on an ellipsoid at height y and azimuth az, pushed out by k (1 = on it)
function onEllipsoid(E, y, az, k = 1) {
  const cosT = Math.max(-0.999, Math.min(0.999, (y - E.c[1]) / E.r[1]));
  const s = Math.sqrt(1 - cosT * cosT) * k;
  return [E.r[0] * s * Math.sin(az) + E.c[0], y, E.r[2] * s * Math.cos(az) + E.c[2]];
}

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

// parts: { pos, nrm, col, idx, uv?, mat? (one kind per part, or one per vertex) }
function toGeo(parts) {
  const pos = [], nrm = [], col = [], idx = [], uv = [], mat = [];
  let o = 0;
  for (const p of parts) {
    const n = p.pos.length / 3;
    pos.push(...p.pos); nrm.push(...p.nrm); col.push(...p.col);
    if (p.uv) uv.push(...p.uv); else for (let i = 0; i < n; i++) uv.push(0, 0);
    if (Array.isArray(p.mat)) mat.push(...p.mat); else for (let i = 0; i < n; i++) mat.push(p.mat ?? 0);
    for (const i of p.idx) idx.push(i + o);
    o += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('gearMat', new THREE.Float32BufferAttribute(mat, 1));
  g.setIndex(idx);
  return g;
}

// a geometry's parts from a stock three.js one, in one colour and kind
function stock(geo, color, mat = 0) {
  const p = geo.getAttribute('position'), n = geo.getAttribute('normal');
  const out = { pos: Array.from(p.array), nrm: Array.from(n.array), col: [], idx: geo.index ? Array.from(geo.index.array) : [...Array(p.count).keys()], mat };
  const c = color.isColor ? color : new THREE.Color(...color);
  for (let i = 0; i < p.count; i++) out.col.push(c.r, c.g, c.b);
  return out;
}
const C = (r, g, b) => new THREE.Color(r, g ?? r, b ?? r);
const rbox = (w, h, d, r, seg = 1) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));

// a ribbon along a polyline of [x, y, z] points, `up` the ribbon's width direction at each
// point; thickness 0 gives a single (double-sided material) strip
function ribbon(pts, ups, width, color, mat, thick = 0) {
  const out = { pos: [], nrm: [], col: [], idx: [], mat };
  const v = new THREE.Vector3(), t = new THREE.Vector3(), u = new THREE.Vector3(), n = new THREE.Vector3();
  const layers = thick > 0 ? [thick / 2, -thick / 2] : [0];
  for (const [li, off] of layers.entries()) {
    const base = out.pos.length / 3;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      t.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      u.set(...ups[i]).normalize();
      n.crossVectors(t, u).normalize();
      if (li === 1) n.negate();
      for (const s of [-0.5, 0.5]) {
        v.set(...pts[i]).addScaledVector(u, s * width).addScaledVector(n, li === 1 ? -off : off);
        out.pos.push(v.x, v.y, v.z); out.nrm.push(n.x, n.y, n.z); out.col.push(color.r, color.g, color.b);
      }
      if (i < pts.length - 1) {
        const o = base + i * 2;
        if (li === 0) out.idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); else out.idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- shared shader bits
const NOISE_GLSL = `
float agHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float agNoise( vec3 x ) {
  vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( agHash( i ), agHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( agHash( i + vec3( 0, 1, 0 ) ), agHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
    mix( mix( agHash( i + vec3( 0, 0, 1 ) ), agHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( agHash( i + vec3( 0, 1, 1 ) ), agHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
`;
const SNOW_RGB = 'vec3( 0.9, 0.93, 0.97 )';

// the kit material (see the top): one per rider and piece, all sharing one program
export function kitMaterial(color, { rough = 0.5, metal = 0, snow = 0, side = THREE.FrontSide } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, vertexColors: true, side });
  const u = { uSnow: { value: snow } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float gearMat;\nflat varying float vKind;\nvarying vec3 vOP;\nvarying vec3 vON;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKind = gearMat; vOP = position; vON = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uSnow;\nflat varying float vKind;\nvarying vec3 vOP;\nvarying vec3 vON;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `
#if defined( USE_COLOR )
  diffuseColor.rgb = vKind < 0.5 ? diffuseColor.rgb * vColor.rgb : vColor.rgb;
#endif
  float agSnow = 0.0;
  if ( uSnow > 0.0 ) {
    // caked snow: on what faces up, low on the boot, in clumps
    float up = smoothstep( 0.2, 0.75, normalize( vON ).y );
    float cover = clamp( 0.6 * up + 0.7 * ( 1.0 - smoothstep( 0.045, 0.085, vOP.y ) ), 0.0, 1.0 ) * ( 1.0 - smoothstep( 0.12, 0.2, vOP.y ) ) * uSnow;
    float n = agNoise( vOP * 45.0 ) * 0.65 + agNoise( vOP * 120.0 ) * 0.35;
    agSnow = smoothstep( 1.0 - cover * 0.55, 1.05 - cover * 0.55, n );
    diffuseColor.rgb = mix( diffuseColor.rgb, ${SNOW_RGB}, agSnow );
  }`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  if ( vKind > 0.5 ) {
    roughnessFactor = vKind < 1.5 ? 0.3 : vKind < 2.5 ? 0.82 : vKind < 3.5 ? 0.32 : 0.95;
    metalnessFactor = vKind < 1.5 ? 1.0 : 0.0;
  }
  roughnessFactor = mix( roughnessFactor, 0.7, agSnow );
  metalnessFactor *= 1.0 - agSnow;`);
  };
  m.customProgramCacheKey = () => 'ag-kit';
  return m;
}

// ---------------------------------------------------------------- the helmet
// a helmet: the shell (its stripe and vents are drawn by helmetMaterial), a dark rim and
// liner, the chin strap and the goggle clip
export function helmetGeometry() {
  return once('helmet', () => blended('helmet') ?? (() => {
    const white = [1, 1, 1], dark = [0.09, 0.09, 0.1], pad = [0.05, 0.05, 0.055], strap = [0.05, 0.05, 0.055];
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
    const parts = [outer, inner, rim];
    // the chin strap: from under the shell's sides, a plastic divider below each ear, down
    // the jaw and round under the chin, the buckle on the left
    {
      const P = [[0.08, -0.03, -0.004], [0.068, -0.07, 0.006], [0.05, -0.1, 0.022], [0.026, -0.118, 0.04], [0.0, -0.124, 0.045]];
      const ctl = [...P, ...P.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z])].map(([x, y, z]) => new THREE.Vector3(x, y, z));
      const pts = new THREE.CatmullRomCurve3(ctl).getPoints(20).map((v) => [v.x, v.y, v.z]);
      parts.push(ribbon(pts, pts.map(() => [0, 0.3, -1]), 0.013, C(...strap), 0, 0.003));
      for (const s of [1, -1]) parts.push(stock(rbox(0.006, 0.02, 0.014, 0.003).translate(s * 0.074, -0.058, 0.0), C(...pad)));
      parts.push(stock(rbox(0.014, 0.009, 0.024, 0.003).rotateY(0.9).translate(0.028, -0.12, 0.042), C(0.12, 0.12, 0.13)));
    }
    // the goggle clip at the back, holding the strap
    {
      const y = GOG.cy + 0.004, [x, , z] = onEllipsoid(SHELL, y, Math.PI, 1.02);
      parts.push(stock(rbox(0.042, 0.04, 0.014, 0.006).translate(x, y, z), C(...dark)));
    }
    return toGeo(parts);
  })());
}

// the shell's paint: its colour, a stripe over the top in c2, vent slots (top, brow and rear
// exhausts, each with a lip catching the light), a finish; the soft parts stay matte
export function helmetMaterial(c, c2, fin) {
  const gloss = fin === 0, chrome = fin === 2;
  const m = new THREE.MeshPhysicalMaterial({ color: c, vertexColors: true, roughness: fin === 1 ? 0.62 : chrome ? 0.1 : 0.32, metalness: chrome ? 1 : 0.05,
    envMapIntensity: chrome ? 1.4 : 1, clearcoat: gloss ? 1 : chrome ? 0.4 : 0, clearcoatRoughness: 0.06 });
  const u = { uStripe: { value: new THREE.Color(c2 ?? c) }, uHasStripe: { value: c2 != null && c2 !== c ? 1 : 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vHP; uniform vec3 uStripe; uniform float uHasStripe;
float agSlot( vec2 p, vec2 a, vec2 b, float r ) { vec2 pa = p - a, ba = b - a; float h = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 ); return length( pa - ba * h ) - r; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float agShell = step( 0.5, vColor.r );
if ( agShell < 0.5 ) diffuseColor.rgb = vColor.rgb;
{
  float aa = fwidth( vHP.x ) * 1.2;
  float top = smoothstep( 0.0, 0.02, vHP.y - 0.02 );
  float st = ( 1.0 - smoothstep( 0.017 - aa, 0.017 + aa, abs( vHP.x ) ) ) * top * uHasStripe * agShell;
  diffuseColor.rgb = mix( diffuseColor.rgb, uStripe, st );
  // vents: short slots running fore and aft over the crown, two at the brow,
  // exhausts at the back
  float d = 1.0;
  if ( vHP.y > 0.07 ) {
    float ax = abs( vHP.x );
    d = min( d, agSlot( vec2( ax, vHP.z ), vec2( 0.03, 0.09 ), vec2( 0.033, 0.045 ), 0.0038 ) );
    d = min( d, agSlot( vec2( ax, vHP.z ), vec2( 0.034, 0.012 ), vec2( 0.033, -0.04 ), 0.0038 ) );
    d = min( d, agSlot( vec2( ax, vHP.z ), vec2( 0.0, 0.065 ), vec2( 0.0, 0.01 ), 0.0035 ) );
  }
  if ( vHP.z > 0.1 ) d = min( d, agSlot( vec2( abs( vHP.x ), vHP.y ), vec2( 0.024, 0.092 ), vec2( 0.046, 0.086 ), 0.0035 ) );
  if ( vHP.z < -0.08 ) {
    vec2 q = vec2( abs( vHP.x ), vHP.y );
    d = min( d, agSlot( q, vec2( 0.0, 0.08 ), vec2( 0.0, 0.055 ), 0.0045 ) );
    d = min( d, agSlot( q, vec2( 0.038, 0.075 ), vec2( 0.046, 0.05 ), 0.0042 ) );
  }
  // (the slots are found in branches, so their width on screen comes from the position)
  float aw = length( fwidth( vHP ) ) * 0.9 + 1e-5;
  float hole = 1.0 - smoothstep( -aw, aw, d );
  float lip = smoothstep( -aw, aw, d ) * ( 1.0 - smoothstep( 0.001, 0.0028, d ) );
  // inside a slot: the shadowed wall, then the liner's mesh at the bottom
  float deep = smoothstep( 0.0, -0.003, d );
  float mesh = 0.75 + 0.25 * step( 0.5, fract( ( vHP.x + vHP.z ) * 900.0 ) );
  vec3 inside = mix( vec3( 0.03 ), vec3( 0.1, 0.1, 0.11 ) * mesh, deep );
  diffuseColor.rgb = mix( diffuseColor.rgb * ( 1.0 + 0.12 * lip ), inside, hole );
  agShell *= 1.0 - hole;
}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  roughnessFactor = mix( 0.85, roughnessFactor, agShell );
  metalnessFactor *= agShell;`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
  material.clearcoat *= agShell;
#endif`);
  };
  m.customProgramCacheKey = () => 'ag-helmet2';
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

// ---------------------------------------------------------------- goggles
// a curved frame, a spherical lens bulging out of it, a strap round the back of the head
const GOG = { cy: 0.02, cz: 0.002, r: 0.137, span: 1.0, h0: -0.056, h1: 0.05 };
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
function goggleSurface(r, grow, bulge, color, flip = false, mat = 0) {
  const N = 72, M = 6, out = { pos: [], nrm: [], col: [], idx: [], mat };
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
  return out;
}

// the frame: its face, a foam layer against the face, outriggers where the strap clips on
export function goggleGeometry() {
  return once('goggles', () => blended('goggles') ?? (() => {
    const frame = goggleSurface(GOG.r, 0.008, 0.004, [1, 1, 1]);
    const back = goggleSurface(GOG.r - 0.02, 0.006, 0, [0.05, 0.05, 0.055], true, K.FOAM);
    // the frame's depth (tinted) then the foam (dark): a ring of three rows per outline point
    const rim = { pos: [], nrm: [], col: [], idx: [], mat: [] };
    const N = 72, M = 6, o1 = 1 + (M - 1) * N;
    for (let k = 0; k <= N; k++) {
      const i = o1 + (k % N);
      const f = frame.pos.slice(i * 3, i * 3 + 3), b = back.pos.slice(i * 3, i * 3 + 3);
      const m = f.map((v, j) => v + (b[j] - v) * 0.45);
      const n = frame.nrm.slice(i * 3, i * 3 + 3);
      rim.pos.push(...f, ...m, ...m, ...b);
      rim.nrm.push(...n, ...n, ...n, ...n);
      rim.col.push(0.75, 0.75, 0.75, 0.62, 0.62, 0.62, 0.07, 0.07, 0.075, 0.05, 0.05, 0.055);
      rim.mat.push(0, 0, K.FOAM, K.FOAM);
      if (k < N) {
        const o = k * 4;
        rim.idx.push(o, o + 1, o + 4, o + 4, o + 1, o + 5);
        rim.idx.push(o + 2, o + 3, o + 6, o + 6, o + 3, o + 7);
      }
    }
    const parts = [frame, back, rim];
    const yc = GOG.cy + 0.004;
    for (const s of [1, -1]) {
      // outrigger: the hinge block at each end of the frame
      const az = s * (GOG.span + 0.02), r = GOG.r - 0.004;
      parts.push(stock(rbox(0.014, 0.034, 0.03, 0.005).rotateY(az).translate(r * Math.sin(az), yc, GOG.cz + r * Math.cos(az)), C(0.55), 0));
    }
    const g = toGeo(parts);
    g.computeVertexNormals();
    return g;
  })());
}
export function lensGeometry() {
  return once('lens', () => blended('lens') ?? (() => {
    const g = toGeo([goggleSurface(GOG.r + 0.003, -0.003, 0.017, [1, 1, 1])]);
    g.computeVertexNormals();
    return g;
  })());
}

// Cork7's lens: a smooth tinted shield, not a mirror. Its own colour, a soft gloss that brightens
// toward the top and darkens toward the nose, a faint sheen of the sky across it at a glance
export function lensMaterial(tint) {
  const c = new THREE.Color(tint);
  const m = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.62), metalness: 0.35, roughness: 0.2, envMapIntensity: 0.55 });
  const u = { uTint: { value: c } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uTint;')
      .replace('#include <opaque_fragment>', `
{
  vec3 N = normalize( normal );
  vec3 V = normalize( vViewPosition );
  float fr = pow( 1.0 - clamp( abs( dot( N, V ) ), 0.0, 1.0 ), 3.0 );
  // (lighter across the top, deeper at the bottom)
  outgoingLight *= 0.8 + 0.35 * smoothstep( -0.5, 0.6, N.y );
  outgoingLight += uTint * fr * 0.12;
  // (never as bright as the white frame round it)
  outgoingLight = min( outgoingLight, uTint * 0.3 + 0.025 );
}
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'ag-lens2';
  return m;
}

// the strap: round the back of the head, from one side of the frame to the other; uv along it
export function strapGeometry(onBeanie) {
  return once('strap' + onBeanie, () => (!onBeanie && blended('strap')) || (() => {
    const E = onBeanie ? KNIT : SHELL;
    const out = { pos: [], nrm: [], col: [], idx: [], uv: [] };
    const a0 = GOG.span * 0.95, N = 48;
    const yc = GOG.cy + 0.004;
    const reps = 7;
    for (let k = 0; k <= N; k++) {
      const az = a0 + ((TAU - 2 * a0) * k) / N;
      // it stands off the head a little more over the clip at the back
      const clip = onBeanie ? 0 : Math.max(0, 1 - Math.abs(az - Math.PI) / 0.3) * 0.045;
      for (const [j, dy] of [[0, -0.02], [1, 0.02]]) {
        const y = yc + dy;
        const [x, , z] = onEllipsoid(E, y, az, (onBeanie ? 1.075 : 1.035) + clip);
        out.pos.push(x, y, z);
        out.nrm.push(Math.sin(az), 0, Math.cos(az));
        out.col.push(1, 1, 1);
        out.uv.push((k / N) * reps, j);
      }
      if (k < N) { const o = k * 2; out.idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
    }
    return toGeo([out]);
  })());
}

// the strap's woven band: the frame colour with a printed name and silicone grip lines
function strapTexture(c, accent) {
  return once(`strap:${c}:${accent}`, () => {
    if (typeof document === 'undefined') return null;
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 32;
    const g = cv.getContext('2d');
    const base = new THREE.Color(c), hsl = base.getHSL({});
    g.fillStyle = hexs(c); g.fillRect(0, 0, 256, 32);
    // weave
    g.globalAlpha = 0.1; g.fillStyle = hsl.l > 0.5 ? '#000' : '#fff';
    for (let x = 0; x < 256; x += 2) g.fillRect(x, 0, 1, 32);
    g.globalAlpha = 1;
    // the edges and the printed name in the lens colour (or white on a dark band)
    const ink = hsl.l > 0.6 ? '#16171c' : hexs(accent);
    g.fillStyle = ink; g.fillRect(0, 2, 256, 2); g.fillRect(0, 28, 256, 2);
    g.font = 'italic 800 19px "Barlow Condensed", Inter, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('STOMPED', 128, 16.5);
    // silicone beads either side of the name
    g.fillStyle = hsl.l > 0.6 ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.28)';
    for (const x0 of [8, 196]) for (let x = x0; x < x0 + 52; x += 7) { g.beginPath(); g.ellipse(x, 16, 1.6, 5, 0, 0, TAU); g.fill(); }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  });
}
export function strapMaterial(c, accent) {
  return new THREE.MeshStandardMaterial({ map: strapTexture(c, accent ?? 0xffffff), roughness: 0.85, side: THREE.DoubleSide });
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
// a point on a loft ring [y, zCentre, halfWidth x, halfLength z, squareness] at angle t
// (t 0 = the toe, +x side at t = pi/2)
function ringPt(rg, t, grow = 0) {
  const [y, zc, wx, wz, p] = rg;
  const c = Math.cos(t), s = Math.sin(t), e = 2 / p;
  return [(wx + grow) * Math.sign(s) * Math.abs(s) ** e, y, zc + (wz + grow) * Math.sign(c) * Math.abs(c) ** e];
}
// rings may carry a colour and a kind: [y, zc, wx, wz, p, [r, g, b], kind]; a ring repeated at
// the same height gives a hard change of colour
function loft(rings, N = 28, colorAt = null, capTop = true) {
  const out = { pos: [], nrm: [], col: [], idx: [], mat: [] };
  const R = rings.length;
  for (let j = 0; j < R; j++) {
    for (let k = 0; k <= N; k++) {
      const t = (k / N) * TAU;
      const [x, y, z] = ringPt(rings[j], t);
      out.pos.push(x, y, z);
      const n = new THREE.Vector3(x / rings[j][2], 0, (z - rings[j][1]) / rings[j][3]).normalize();
      out.nrm.push(n.x, n.y, n.z);
      out.col.push(...(colorAt ? colorAt(x, y, z, j, t) : rings[j][5] ?? [1, 1, 1]));
      out.mat.push(rings[j][6] ?? 0);
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
    const col = up ? [0.12, 0.12, 0.13] : colorAt ? colorAt(0, y, zc, j, -1) : rings[j][5] ?? [1, 1, 1];
    out.pos.push(0, y, zc); out.nrm.push(0, up ? 1 : -1, 0); out.col.push(...col); out.mat.push(up ? K.RUBBER : rings[j][6] ?? 0);
    for (let k = 0; k <= N; k++) {
      const i = j * (N + 1) + k;
      out.pos.push(out.pos[i * 3], out.pos[i * 3 + 1], out.pos[i * 3 + 2]); out.nrm.push(0, up ? 1 : -1, 0);
      out.col.push(...col); out.mat.push(up ? K.RUBBER : rings[j][6] ?? 0);
    }
    for (let k = 0; k < N; k++) up ? out.idx.push(c0, c0 + 1 + k, c0 + 1 + k + 1) : out.idx.push(c0, c0 + 1 + k + 1, c0 + 1 + k);
  };
  cap(0, false);
  if (capTop) cap(R - 1, true);
  return out;
}

// a band wrapped round a loft ring from angle t0 to t1, `h` tall, standing `off` proud of it
function ringBand(rg, t0, t1, h, off, color, mat, n = 16) {
  const out = { pos: [], nrm: [], col: [], idx: [], mat };
  const c = color.isColor ? color : C(...color);
  for (let k = 0; k <= n; k++) {
    const t = t0 + ((t1 - t0) * k) / n;
    const [x, y, z] = ringPt(rg, t, off);
    const nx = Math.sin(t), nz = Math.cos(t), l = Math.hypot(nx, nz);
    for (const dy of [-h / 2, -h / 2, h / 2, h / 2]) {
      out.pos.push(x, y + dy, z);
      out.nrm.push(nx / l, 0, nz / l); out.col.push(c.r, c.g, c.b);
    }
    // (only the outer face and the top and bottom edges are worth drawing)
    if (k < n) {
      const o = k * 4;
      out.idx.push(o, o + 4, o + 2, o + 2, o + 4, o + 6);
    }
  }
  // edges: push the inner rows back toward the shell
  for (let k = 0; k <= n; k++) {
    const t = t0 + ((t1 - t0) * k) / n;
    const [x, , z] = ringPt(rg, t, off - 0.004);
    const o = k * 4;
    out.pos[(o + 1) * 3] = x; out.pos[(o + 1) * 3 + 2] = z;
    out.pos[(o + 3) * 3] = x; out.pos[(o + 3) * 3 + 2] = z;
    out.nrm[(o + 1) * 3 + 1] = -1; out.nrm[(o + 3) * 3 + 1] = 1;
    if (k < n) out.idx.push(o + 1, o + 5, o, o, o + 5, o + 4, o + 2, o + 6, o + 3, o + 3, o + 6, o + 7);
  }
  return out;
}

// the ski boot's rings: the lower shell (with the sole, the toe and heel lugs come apart),
// then the cuff that wraps round it from the ankle up
const BOOT_SHELL = [
  [0.035, 0.022, 0.054, 0.165, 3.2], [0.05, 0.022, 0.056, 0.164, 3.2], [0.09, 0.02, 0.06, 0.158, 2.6], [0.12, 0.0, 0.06, 0.135, 2.4],
  [0.16, -0.02, 0.06, 0.1, 2.4], [0.2, -0.012, 0.062, 0.078, 2.2], [0.26, 0.004, 0.064, 0.072, 2.2],
];
const BOOT_CUFF = [
  [0.15, -0.024, 0.066, 0.096, 2.3], [0.2, -0.012, 0.067, 0.083, 2.2], [0.26, 0.004, 0.069, 0.077, 2.2], [0.33, 0.022, 0.071, 0.077, 2.2],
];

// a ski boot: a hard lower shell and cuff over a padded liner, a rubber sole with the toe and
// heel lugs the binding clamps, four buckles (levers outside, ladders inside), a power strap,
// the cuff rivet and the walk lever at the back
export function skiBootGeometry() {
  return once('skiboot2', () => blended('skiBoot') ?? (() => {
    const sole = [0.1, 0.1, 0.11], shellK = 0.86;
    const S = BOOT_SHELL;
    // the shell: the sole band (rubber), a hard line, then the shell (tinted)
    const shell = loft([
      [...S[0], sole, K.RUBBER], [0.052, 0.022, 0.0565, 0.1638, 3.2, sole, K.RUBBER],
      [0.052, 0.022, 0.0565, 0.1638, 3.2, [shellK, shellK, shellK], 0],
      ...S.slice(2).map((r) => [...r, [shellK, shellK, shellK], 0]),
    ], 32, null, false);
    const parts = [shell];
    // the cuff: a slightly bigger shell over the lower one, open at the bottom
    const cr = BOOT_CUFF.map((r, j) => [...r, j === 0 ? [0.7, 0.7, 0.7] : [1, 1, 1], 0]);
    { const t = BOOT_CUFF[BOOT_CUFF.length - 1]; cr.push([t[0] + 0.002, t[1], t[2] - 0.007, t[3] - 0.007, t[4], [0.5, 0.5, 0.5], 0]); }
    const cuff = loft(cr, 32, null, false);
    // drop the cuff's sole cap (loft adds one): it is open underneath
    {
      const n = cr.length * 33;
      cuff.idx = cuff.idx.slice(0, (cr.length - 1) * 32 * 6);
      cuff.pos.length = n * 3; cuff.nrm.length = n * 3; cuff.col.length = n * 3; cuff.mat.length = n;
    }
    parts.push(cuff);
    // the liner: a padded collar standing out of the cuff, and the tongue at the front
    const top = BOOT_CUFF[BOOT_CUFF.length - 1];
    const liner = loft([
      [top[0] - 0.01, top[1], top[2] - 0.006, top[3] - 0.006, 2.2, [0.08, 0.08, 0.09], K.FOAM],
      [top[0] + 0.018, top[1] + 0.004, top[2] - 0.002, top[3] - 0.002, 2.2, [0.12, 0.12, 0.13], K.FOAM],
      [top[0] + 0.03, top[1] + 0.004, top[2] - 0.01, top[3] - 0.01, 2.2, [0.1, 0.1, 0.11], K.FOAM],
    ], 24, null, true);
    parts.push(liner);
    // the sole's lugs at the toe and heel (what the binding grips)
    parts.push(stock(rbox(0.07, 0.022, 0.03, 0.006).translate(0, 0.046, 0.19), C(...sole), K.RUBBER));
    parts.push(stock(rbox(0.07, 0.024, 0.03, 0.006).translate(0, 0.047, -0.146), C(...sole), K.RUBBER));
    // buckles: [ring to follow, height, from angle, to angle] across the instep and up the cuff
    const metal = C(0.8, 0.82, 0.86), ladder = C(0.1, 0.1, 0.11);
    const buckles = [
      [[0.105, 0.012, 0.06, 0.148, 2.5], 0.105, -0.55, 0.75],
      [[0.15, -0.012, 0.06, 0.112, 2.4], 0.15, -1.0, 1.15],
      [[0.235, 0.0, 0.069, 0.08, 2.2], 0.235, -1.2, 1.3],
      [[0.295, 0.016, 0.071, 0.077, 2.2], 0.295, -1.2, 1.3],
    ];
    for (const [rg, , t0, t1] of buckles) {
      // the wire bail over the front, the lever folded flat on the outside, the ladder inside
      parts.push(ringBand(rg, t0 * 0.8, t1 - 0.25, 0.0035, 0.003, C(0.66, 0.68, 0.72), K.METAL, 12));
      const [lx, ly, lz] = ringPt(rg, t1, 0.006);
      // (a box thin in x turned by t - pi/2 lies flat on the shell at ring angle t)
      parts.push(stock(new THREE.BoxGeometry(0.006, 0.014, 0.045).rotateY(t1 - Math.PI / 2).translate(lx, ly, lz), metal, K.METAL));
      const [ax, ay, az] = ringPt(rg, t0 * 0.8, 0.004);
      parts.push(stock(new THREE.BoxGeometry(0.004, 0.012, 0.03).rotateY(t0 * 0.8 - Math.PI / 2).translate(ax, ay, az), ladder, K.PLASTIC));
    }
    // the power strap round the top of the cuff (velcro, with a lighter tab)
    parts.push(ringBand(top, -1.9, 1.9, 0.03, 0.005, C(0.09, 0.09, 0.1), K.RUBBER, 20));
    { const [x, y, z] = ringPt(top, 0.55, 0.009); parts.push(stock(rbox(0.006, 0.028, 0.02, 0.003).rotateY(0.55 + Math.PI / 2).translate(x, y - 0.002, z), C(0.85, 0.3, 0.16), K.PLASTIC)); }
    // the cuff rivet either side, and the walk lever at the back
    for (const s of [1, -1]) parts.push(stock(new THREE.CylinderGeometry(0.009, 0.009, 0.004, 12).rotateZ(Math.PI / 2).translate(s * 0.064, 0.17, -0.03), metal, K.METAL));
    { const [x, y, z] = ringPt(BOOT_CUFF[2], Math.PI, 0.004); parts.push(stock(rbox(0.026, 0.05, 0.008, 0.003).translate(x, y - 0.02, z), C(0.12, 0.12, 0.13), K.PLASTIC)); }
    return toGeo(parts);
  })());
}

// a snowboard boot: soft, laced, chunky
export function boardBootGeometry() {
  return once('boardboot', () => blended('boardBoot') ?? (() => {
    const sole = [0.12, 0.12, 0.13];
    const shell = loft([
      [0.03, 0.02, 0.06, 0.168, 2.6, sole, K.RUBBER], [0.05, 0.02, 0.064, 0.17, 2.4, sole, K.RUBBER], [0.05, 0.02, 0.064, 0.17, 2.4, [1, 1, 1], 0],
      [0.09, 0.016, 0.066, 0.162, 2.2], [0.125, -0.002, 0.066, 0.138, 2.1],
      [0.17, -0.018, 0.066, 0.106, 2.1], [0.22, -0.01, 0.068, 0.086, 2.0], [0.29, 0.0, 0.07, 0.08, 2.0],
    ], 32);
    const lace = new THREE.Color(0.85, 0.85, 0.8);
    const parts = [shell];
    for (let i = 0; i < 6; i++) parts.push(stock(new THREE.BoxGeometry(0.05, 0.006, 0.008).rotateX(-0.6 - i * 0.12).translate(0, 0.12 + i * 0.03, 0.105 - i * 0.012), lace, K.RUBBER));
    return toGeo(parts);
  })());
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
  g.fillText('STOMPED', 0, 0);
  g.restore();
  if (design === 'logo') { g.fillStyle = B; g.fillRect(0, h * 0.06, w, h * 0.012); g.fillRect(0, h * 0.93, w, h * 0.012); }
}

// the atlas a ski or board is printed from: [top sheet | sidewall + steel edge | base]
const PLANK = {
  ski: { dw: 96, sw: 32, bw: 64, h: 1024 },
  board: { dw: 256, sw: 32, bw: 128, h: 1024 },
};
const SIDE_ABS = 22; // sidewall columns before the steel edge starts
function plankLayout(board) {
  const L = board ? PLANK.board : PLANK.ski, W = L.dw + L.sw + L.bw, px = (x) => x / W;
  return {
    ...L, W,
    top: [px(0.5), px(L.dw - 0.5)],
    side: [px(L.dw + 0.5), px(L.dw + SIDE_ABS), px(L.dw + L.sw - 0.5)],
    base: [px(L.dw + L.sw + 0.5), px(W - 0.5)],
  };
}

// the sidewall and base painted next to the top sheet; `rm` paints roughness (g) and
// metalness (b) for the same layout
function paintPlankSides(g, Lo, c1, c2, rm) {
  const x0 = Lo.dw, h = Lo.h;
  if (rm) {
    g.fillStyle = 'rgb(0,74,12)'; g.fillRect(0, 0, Lo.dw, h); // the top sheet: glossy
    g.fillStyle = 'rgb(0,90,0)'; g.fillRect(x0, 0, SIDE_ABS, h); // ABS sidewall
    g.fillStyle = 'rgb(0,64,255)'; g.fillRect(x0 + SIDE_ABS, 0, Lo.sw - SIDE_ABS, h); // steel
    g.fillStyle = 'rgb(0,120,0)'; g.fillRect(x0 + Lo.sw, 0, Lo.bw, h); // sintered base
    const e = Math.max(2, Math.round(Lo.bw * 0.035));
    g.fillStyle = 'rgb(0,64,255)'; g.fillRect(x0 + Lo.sw, 0, e, h); g.fillRect(Lo.W - e, 0, e, h);
    return;
  }
  // sidewall: a thin line of the top sheet's colour, black ABS, then the steel edge
  g.fillStyle = '#121316'; g.fillRect(x0, 0, SIDE_ABS, h);
  g.fillStyle = hexs(c1); g.fillRect(x0, 0, 3, h);
  g.fillStyle = '#2a2c31'; g.fillRect(x0 + 9, 0, 2, h);
  const steel = g.createLinearGradient(x0 + SIDE_ABS, 0, x0 + Lo.sw, 0);
  steel.addColorStop(0, '#8f949c'); steel.addColorStop(1, '#c9ced6');
  g.fillStyle = steel; g.fillRect(x0 + SIDE_ABS, 0, Lo.sw - SIDE_ABS, h);
  // the base: black sintered, a big name printed in the second colour, the grind lines and steel edges
  const b0 = x0 + Lo.sw, bw = Lo.bw;
  g.fillStyle = '#16171b'; g.fillRect(b0, 0, bw, h);
  g.save();
  // (mirrored: it is read from underneath)
  g.translate(b0 + bw / 2, h * 0.5); g.scale(-1, 1); g.rotate(-Math.PI / 2);
  g.font = `italic 900 ${Math.round(bw * 0.62)}px "Barlow Condensed", Inter, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = hexs(new THREE.Color(c2).getHSL({}).l < 0.2 ? c1 : c2);
  g.globalAlpha = 0.85; g.fillText('STOMPED', 0, 0);
  g.restore();
  g.globalAlpha = 0.12; g.fillStyle = '#ffffff';
  for (let x = b0 + 3; x < b0 + bw - 3; x += 3) g.fillRect(x, 0, 1, h);
  g.globalAlpha = 1;
  const e = Math.max(2, Math.round(bw * 0.035));
  g.fillStyle = '#b3b8c0'; g.fillRect(b0, 0, e, h); g.fillRect(b0 + bw - e, 0, e, h);
}

export function designTexture(design, c1, c2, board = false) {
  return once(`tex:${design}:${c1}:${c2}:${board}`, () => {
    if (typeof document === 'undefined') return null;
    const Lo = plankLayout(board);
    const c = document.createElement('canvas');
    c.width = Lo.W; c.height = Lo.h;
    const g = c.getContext('2d');
    paintDesign(g, Lo.dw, Lo.h, design, c1, c2, board);
    paintPlankSides(g, Lo, c1, c2, false);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  });
}
function plankRMTexture(board) {
  return once(`rm:${board}`, () => {
    if (typeof document === 'undefined') return null;
    const Lo = plankLayout(board);
    const c = document.createElement('canvas');
    c.width = Lo.W; c.height = 8;
    paintPlankSides(c.getContext('2d'), { ...Lo, h: 8 }, 0, 0, true);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    return t;
  });
}

// a ski or board: the printed top sheet, sidewalls and base, steel edges that catch the light
// (metal in the roughness/metalness map), and snow packed on round the bindings and the tips
export function plankMaterial(design, c1, c2, board = false) {
  const rm = plankRMTexture(board);
  const m = new THREE.MeshStandardMaterial({ map: designTexture(design, c1, c2, board), roughnessMap: rm, metalnessMap: rm, roughness: 1, metalness: 1 });
  const u = { uSnow: { value: 1 }, uBoard: { value: board ? 1 : 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOP;\nvarying vec3 vON;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vON = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uSnow, uBoard;\nvarying vec3 vOP;\nvarying vec3 vON;\n${NOISE_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  float agSnow = 0.0;
  {
    // along the plank (a board is built along x, a ski along z)
    float a = mix( vOP.z, vOP.x, uBoard ), w = mix( vOP.x, vOP.z, uBoard );
    float aa = abs( a );
    float up = smoothstep( 0.5, 0.85, normalize( vON ).y );
    // packed round the boots and bindings, and on the turned-up tips
    float where = mix( smoothstep( 0.42, 0.2, aa ) * 0.9 + smoothstep( 0.62, 0.8, aa ) * 0.75, smoothstep( 0.62, 0.74, aa ) * 0.8 + smoothstep( 0.32, 0.18, abs( aa - 0.24 ) ) * 0.5, uBoard );
    float n = agNoise( vec3( w * 45.0, vOP.y * 45.0, a * 14.0 ) ) * 0.6 + agNoise( vOP * 110.0 ) * 0.4;
    float cover = clamp( where * up * uSnow, 0.0, 1.0 );
    agSnow = smoothstep( 1.0 - cover * 0.55, 1.05 - cover * 0.55, n );
    diffuseColor.rgb = mix( diffuseColor.rgb, ${SNOW_RGB}, agSnow );
  }`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  roughnessFactor = mix( roughnessFactor, 0.72, agSnow );
  metalnessFactor *= 1.0 - agSnow;`);
  };
  m.customProgramCacheKey = () => 'ag-plank';
  return m;
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
// a plank's cross-sections down its length: a crowned top sheet rolling over bevelled edges
// (cap construction) into the sidewall, the steel edge, a flat base. Per station 15 vertices:
// the top (7, from +x round to -x), each side (3: under the bevel, the top of the steel, the
// base corner) and the base (2). shape(t) -> [halfWidth, baseY, thickness] for t 0 tail .. 1 tip
function plankGeometry(L, z0, segs, shape, Lo, morph = null) {
  const pos = [], uv = [], idx = [];
  const morphs = morph ? [[], []] : null;
  const TOP = [[1, 0.55], [0.86, 1], [0.45, 1], [0, 1], [-0.45, 1], [-0.86, 1], [-1, 0.55]];
  const [u0, u1] = Lo.top, [s0, s1, s2] = Lo.side, [b0, b1] = Lo.base;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, z = z0 + t * L;
    const [w, y, T] = shape(t);
    const crown = Math.min(0.0018, T * 0.12);
    // the top: the bevel's foot sits under the top surface at 55% of the thickness
    for (const [fx, fy] of TOP) {
      const x = fx * w;
      const yy = fy === 1 ? y + T + crown * (1 - fx * fx) : y + T * fy;
      pos.push(x, yy, z);
      uv.push(u0 + ((1 - fx) / 2) * (u1 - u0), t);
    }
    for (const s of [1, -1]) {
      const e = Math.min(0.0024, T * 0.3);
      pos.push(s * w, y + T * 0.55, z, s * w, y + e, z, s * w, y, z);
      uv.push(s0, t, s1, t, s2, t);
    }
    pos.push(w, y, z, -w, y, z);
    uv.push(b0, t, b1, t);
    if (morph) {
      const [db, df] = morph(t, z);
      for (let k = 0; k < 15; k++) { morphs[0].push(0, db, 0); morphs[1].push(0, df, 0); }
    }
  }
  const V = 15;
  for (let i = 0; i < segs; i++) {
    const a = i * V, b = a + V;
    // the top (+x first; tip toward +z)
    for (let k = 0; k < 6; k++) idx.push(a + k, a + k + 1, b + k, a + k + 1, b + k + 1, b + k);
    // the sides: +x faces out to +x, -x to -x
    for (const [o, s] of [[7, 1], [10, -1]]) for (let k = 0; k < 2; k++) {
      const p = a + o + k, q = b + o + k;
      if (s > 0) idx.push(p, q, p + 1, p + 1, q, q + 1); else idx.push(p, p + 1, q, p + 1, q + 1, q);
    }
    // the base, facing down
    idx.push(a + 13, b + 13, a + 14, a + 14, b + 13, b + 14);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (morph) {
    g.morphAttributes.position = morphs.map((m) => new THREE.Float32BufferAttribute(m, 3));
    g.morphTargetsRelative = true;
  }
  return g;
}

// a twin-tip freeride ski, 1.72 m: sidecut, rockered tip and tail, thinner at the ends
export function skiGeometry() {
  return once('ski2', () => blended('ski') ?? (() => {
    const L = 1.72;
    return plankGeometry(L, -L * 0.45, 60, (t) => {
      const sc = 1 - Math.sin(t * Math.PI) * 0.2;
      let w = 0.054 * sc;
      // rounded tip and tail
      if (t > 0.93) w *= Math.sqrt(Math.max(0, 1 - ((t - 0.93) / 0.07) ** 2)) * 0.85 + 0.15;
      if (t < 0.05) w *= Math.sqrt(Math.max(0, 1 - ((0.05 - t) / 0.05) ** 2)) * 0.8 + 0.2;
      let y = 0.012;
      if (t > 0.82) y += ((t - 0.82) / 0.18) ** 2 * 0.085;
      if (t < 0.12) y += ((0.12 - t) / 0.12) ** 2 * 0.06;
      return [w, y, 0.009 + 0.015 * Math.sin(t * Math.PI) ** 0.7];
    }, plankLayout(false), (t, z) => {
      // morphs (relative): 0 the ski bent into an arc under the boot (tip and tail up), 1 the
      // forebody flapping (chatter, a hard landing)
      const zb = z / (L * 0.5);
      return [0.06 * zb * zb, 0.035 * Math.max(0, (t - 0.5) / 0.5) ** 1.6];
    });
  })());
}

// a twin-tip board, 1.56 m, nose along +X
export function boardGeometry() {
  return once('board2', () => blended('board') ?? (() => {
    const L = 1.56;
    const g = plankGeometry(L, -L / 2, 60, (t) => {
      const u = Math.abs(t - 0.5) * 2;
      let w = 0.124 + 0.022 * Math.pow(Math.min(u / 0.74, 1), 2);
      if (u > 0.8) w *= 0.3 + 0.7 * Math.sqrt(Math.max(0, 1 - ((u - 0.8) / 0.2) ** 2));
      const y = 0.006 + (u > 0.72 ? ((u - 0.72) / 0.28) ** 2 * 0.075 : 0);
      return [w, y, 0.011 + 0.011 * (1 - u * u)];
    }, plankLayout(true));
    g.rotateY(Math.PI / 2);
    g.computeVertexNormals();
    return g;
  })());
}

// a freeride ski binding under the boot: a track, the toe piece (housing, wings round the boot's
// toe lug, the anti-friction plate, the DIN window), the heel piece (housing, heel cup, the
// step-in lever) and the brake (pedal under the heel, arms folded along the ski's sides)
export function skiBindingGeometry() {
  return once('skibind2', () => blended('skiBind') ?? (() => {
    const body = C(1), dark = C(0.11, 0.115, 0.13), metal = C(0.72, 0.74, 0.78), accent = C(0.85, 0.1, 0.03), win = C(0.92);
    const parts = [
      // the track the pieces slide on
      stock(rbox(0.05, 0.008, 0.52, 0.003).translate(0, 0.034, -0.01), dark, K.PLASTIC),
      // toe: base, housing, wings, the AFD plate under the boot toe, the height screw, the DIN window
      stock(rbox(0.07, 0.016, 0.1, 0.006).translate(0, 0.04, 0.235), dark, K.PLASTIC),
      stock(rbox(0.058, 0.042, 0.06, 0.016, 2).translate(0, 0.064, 0.238), body, 0),
      stock(rbox(0.04, 0.012, 0.036, 0.005).rotateX(-0.25).translate(0, 0.087, 0.232), dark, K.PLASTIC),
      stock(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 10).translate(0, 0.095, 0.238), metal, K.METAL),
      stock(new THREE.BoxGeometry(0.012, 0.002, 0.018).rotateX(-0.25).translate(0, 0.0935, 0.224), win, K.PLASTIC),
      // the wings that hold the toe lug from the sides
      stock(rbox(0.012, 0.026, 0.034, 0.004).rotateY(0.35).translate(0.03, 0.056, 0.2), dark, K.PLASTIC),
      stock(rbox(0.012, 0.026, 0.034, 0.004).rotateY(-0.35).translate(-0.03, 0.056, 0.2), dark, K.PLASTIC),
      stock(new THREE.BoxGeometry(0.06, 0.004, 0.05).translate(0, 0.04, 0.165), metal, K.METAL),
      // heel: base, housing, heel cup over the heel lug, step-in lever, DIN window
      stock(rbox(0.07, 0.016, 0.11, 0.006).translate(0, 0.04, -0.205), dark, K.PLASTIC),
      stock(rbox(0.064, 0.056, 0.075, 0.016, 2).translate(0, 0.074, -0.212), body, 0),
      stock(rbox(0.07, 0.016, 0.04, 0.006).translate(0, 0.072, -0.165), dark, K.PLASTIC),
      stock(rbox(0.04, 0.008, 0.06, 0.003).rotateX(-0.5).translate(0, 0.104, -0.235), dark, K.PLASTIC),
      stock(new THREE.BoxGeometry(0.042, 0.004, 0.02).rotateX(-0.5).translate(0, 0.1, -0.258), accent, K.PLASTIC),
      stock(new THREE.BoxGeometry(0.012, 0.002, 0.016).translate(0, 0.103, -0.2), win, K.PLASTIC),
      // the brake pedal under the heel
      stock(new THREE.BoxGeometry(0.05, 0.006, 0.07).translate(0, 0.041, -0.11), dark, K.PLASTIC),
    ];
    // brake arms: metal wire from the heel piece forward along each side, plastic feet
    for (const s of [1, -1]) {
      const pts = [[s * 0.03, 0.048, -0.17], [s * 0.05, 0.044, -0.13], [s * 0.056, 0.04, -0.06]];
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 6, 0.0032, 5);
      parts.push(stock(tube, metal, K.METAL));
      parts.push(stock(rbox(0.008, 0.012, 0.03, 0.003).translate(s * 0.057, 0.04, -0.045), dark, K.PLASTIC));
    }
    return toGeo(parts);
  })());
}

// a snowboard binding: a disc screwed to the board, a base plate with a heel cup, a tall
// contoured highback leaning forward, a padded ankle strap and a toe cap strap, each with a
// metal ratchet (toes along +Z)
export function boardBindingGeometry() {
  return once('boardbind', () => blended('boardBind') ?? (() => {
    const body = new THREE.Color(0.14, 0.15, 0.17), strap = new THREE.Color(1, 1, 1), pad = new THREE.Color(0.22, 0.23, 0.26), metal = new THREE.Color(0.75, 0.77, 0.8);
    const disc = new THREE.CylinderGeometry(0.058, 0.06, 0.012, 24).translate(0, 0.006, 0.02);
    const plate = new THREE.BoxGeometry(0.14, 0.014, 0.3, 1, 1, 1).translate(0, 0.016, 0.02);
    // heel cup: a wall round the back of the heel
    const cup = new THREE.CylinderGeometry(0.08, 0.078, 0.075, 20, 1, true, Math.PI * 0.5, Math.PI).translate(0, 0.05, -0.045);
    const cupI = new THREE.CylinderGeometry(0.074, 0.072, 0.075, 20, 1, true, Math.PI * 0.5, Math.PI).translate(0, 0.05, -0.045);
    cupI.index.array.reverse();
    // side rails from the cup to the toe
    const railL = new THREE.BoxGeometry(0.008, 0.045, 0.2).translate(0.074, 0.04, 0.05);
    const railR = new THREE.BoxGeometry(0.008, 0.045, 0.2).translate(-0.074, 0.04, 0.05);
    // the highback: a curved shell up the back of the calf, leaning forward
    const hb = new THREE.CylinderGeometry(0.075, 0.084, 0.25, 20, 4, true, Math.PI * 0.6, Math.PI * 0.8);
    { const p = hb.attributes.position; for (let k = 0; k < p.count; k++) { const y = p.getY(k); p.setX(k, p.getX(k) * (1 - (y + 0.125) * 0.5)); } }
    hb.translate(0, 0.2, -0.05).rotateX(0.24);
    const hbI = hb.clone(); hbI.index.array.reverse();
    // straps: padded arcs over the ankle and the toe
    const ankle2 = new THREE.TorusGeometry(0.075, 0.016, 6, 18, Math.PI).rotateX(-Math.PI / 2 + 0.55).translate(0, 0.13, 0.04);
    const toe = new THREE.TorusGeometry(0.068, 0.013, 6, 16, Math.PI).rotateX(-Math.PI / 2 + 1.1).scale(1, 1, 0.75).translate(0, 0.06, 0.15);
    const parts = [
      stock(disc, metal, K.METAL), stock(plate, body, K.PLASTIC), stock(cup, body, K.PLASTIC), stock(cupI, pad, K.FOAM), stock(railL, body, K.PLASTIC), stock(railR, body, K.PLASTIC),
      stock(hb, body, K.PLASTIC), stock(hbI, pad, K.FOAM), stock(ankle2, strap, 0), stock(toe, strap, 0),
      // ratchets on the outside of each strap, and the forward-lean adjuster on the highback
      stock(new THREE.BoxGeometry(0.014, 0.022, 0.045).rotateX(-0.6).translate(0.085, 0.14, 0.07), metal, K.METAL),
      stock(new THREE.BoxGeometry(0.014, 0.018, 0.035).rotateX(-1.1).translate(0.075, 0.07, 0.17), metal, K.METAL),
      stock(new THREE.BoxGeometry(0.03, 0.05, 0.008).translate(0, 0.27, -0.155).rotateX(0.24), metal, K.METAL),
    ];
    const g = toGeo(parts);
    g.computeVertexNormals();
    return g;
  })());
}

// a ski pole, grip at the top (origin), tip down -Y: a moulded grip with finger ridges and a
// wrist strap, a printed band on the shaft, a powder basket and a carbide tip
export function poleGeometry(len) {
  return once('pole2:' + len, () => (Math.abs(len - 1.18) < 1e-3 && blended('pole')) || (() => {
    const rubber = C(0.07, 0.07, 0.08), plastic = C(0.13, 0.13, 0.14), print = C(0.9), tipC = C(0.55, 0.57, 0.6);
    // the grip, turned: a flared top, finger ridges down the front, a collar at the bottom
    const prof = [];
    const GN = 14;
    for (let i = 0; i <= GN; i++) {
      const t = i / GN, y = 0.035 - t * 0.2;
      let r = 0.0155 + 0.003 * Math.sin(t * Math.PI);
      if (t < 0.12) r = 0.012 + (0.021 - 0.012) * Math.sin((t / 0.12) * Math.PI * 0.5);
      if (t > 0.15 && t < 0.8) r += 0.0012 * Math.cos(((t - 0.15) / 0.65) * Math.PI * 8);
      if (t > 0.9) r = 0.019;
      prof.push(new THREE.Vector2(Math.max(0.004, r), y));
    }
    prof.unshift(new THREE.Vector2(0.0001, 0.035));
    prof.push(new THREE.Vector2(0.009, -0.17));
    const parts = [
      stock(new THREE.LatheGeometry(prof, 10), rubber, K.RUBBER),
      // the top cap
      stock(new THREE.CylinderGeometry(0.0125, 0.0135, 0.004, 12).translate(0, 0.036, 0), plastic, K.PLASTIC),
      // the shaft (tinted: the pole colour), tapering
      stock(new THREE.CylinderGeometry(0.0085, 0.0058, len - 0.17, 8, 1, true).translate(0, -0.17 - (len - 0.17) / 2, 0), C(1), 0),
      // a printed band near the top of the shaft
      stock(new THREE.CylinderGeometry(0.0089, 0.0088, 0.09, 8, 1, true).translate(0, -0.3, 0), C(0.08), K.PLASTIC),
      stock(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 8, 1, true).translate(0, -0.25, 0), print, K.PLASTIC),
      // the basket: a dished powder disc with a hub, a ferrule and the carbide tip
      stock(new THREE.LatheGeometry([new THREE.Vector2(0.0001, 0.006), new THREE.Vector2(0.012, 0.006), new THREE.Vector2(0.03, 0.002), new THREE.Vector2(0.05, 0.0), new THREE.Vector2(0.052, 0.004),
        new THREE.Vector2(0.05, -0.002), new THREE.Vector2(0.012, -0.004), new THREE.Vector2(0.0001, -0.004)], 12).translate(0, -len + 0.09, 0), plastic, K.PLASTIC),
      stock(new THREE.CylinderGeometry(0.008, 0.012, 0.028, 8).translate(0, -len + 0.09, 0), rubber, K.RUBBER),
      stock(new THREE.CylinderGeometry(0.0058, 0.0058, 0.07, 8).translate(0, -len + 0.045, 0), plastic, K.PLASTIC),
      stock(new THREE.ConeGeometry(0.0045, 0.018, 8).rotateX(Math.PI).translate(0, -len + 0.001, 0), tipC, K.METAL),
    ];
    // ribs across the basket
    for (let k = 0; k < 4; k++) parts.push(stock(new THREE.BoxGeometry(0.096, 0.004, 0.005).rotateY((k * Math.PI) / 4).translate(0, -len + 0.093, 0), rubber, K.RUBBER));
    // the wrist strap: a flat loop out of the top of the grip, hanging round the outside
    {
      const pts = [], ups = [];
      for (let i = 0; i <= 14; i++) {
        const a = (i / 14) * TAU * 0.8 + 0.6;
        pts.push([0.026 + 0.03 * Math.cos(a), 0.012 + 0.045 * Math.sin(a) - 0.02, 0.012 * Math.sin(a * 0.5)]);
        ups.push([0, 0, 1]);
      }
      parts.push(ribbon(pts, ups, 0.014, C(0.1, 0.1, 0.11), K.RUBBER, 0.002));
    }
    return toGeo(parts);
  })());
}

// every material the kit needs for one rider
export function gearMaterials(outfit, board) {
  return {
    frameM: kitMaterial(outfit.goggles2 ?? 0x16171c, { rough: 0.38, metal: 0.05 }),
    lensM: lensMaterial(outfit.goggles),
    strapM: strapMaterial(outfit.goggles2 ?? 0x16171c, outfit.goggles),
    bootM: kitMaterial(outfit.boots, { rough: board ? 0.8 : 0.26, metal: 0.04, snow: 1 }),
    skiM: board ? plankMaterial(outfit.deckDesign ?? 'logo', outfit.deck ?? 0xffffff, outfit.deck2 ?? 0x15161a, true) : plankMaterial(outfit.skiDesign ?? 'logo', outfit.skis, outfit.skis2 ?? 0xffffff),
    poleM: kitMaterial(outfit.poles ?? 0x9ea5b0, { rough: 0.3, metal: 0.8 }),
    bindM: kitMaterial(board ? 0x1d2026 : 0xd9dde3, { rough: 0.5, metal: 0.1 }),
  };
}
