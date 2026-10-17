// The mountain: one deterministic height function that the terrain mesh,
// physics, trees, props and AI all share. Downhill is +Z. The run starts at
// z = 0 near the summit and finishes in the village at z ~ 3420.
import { makeSimplex, fbm, ridged, clamp, smoothstep, mulberry32 } from './noise.js';

const N = makeSimplex(7);
const N2 = makeSimplex(19);
const N3 = makeSimplex(42);

export const SECTIONS = [
  { name: 'Summit Start', z0: -200, z1: 150, grad: 0.12, width: 70 },
  { name: 'The Wall', z0: 150, z1: 700, grad: 0.44, width: 80 },
  { name: 'Meadow Rollers', z0: 700, z1: 1000, grad: 0.21, width: 90 },
  { name: 'Terrain Park', z0: 1000, z1: 1450, grad: 0.2, width: 84 },
  { name: 'Glacier Bowl', z0: 1450, z1: 1900, grad: 0.39, width: 110 },
  { name: 'Pine Chute', z0: 1900, z1: 2400, grad: 0.27, width: 46 },
  { name: 'The Express', z0: 2400, z1: 2950, grad: 0.31, width: 70 },
  { name: 'Run-out', z0: 2950, z1: 3350, grad: 0.14, width: 80 },
  { name: 'Village', z0: 3350, z1: 9000, grad: 0.025, width: 120 },
];

export const START_Z = 30;
export const FINISH_Z = 3420;
const Z_MIN = -6000, Z_MAX = 9000;

// --- precomputed 1-D profiles along z (1 m steps) ---------------------------
const PN = Z_MAX - Z_MIN + 1;
const ELEV = new Float32Array(PN);
const CX = new Float32Array(PN);
const HW = new Float32Array(PN);

function sectionAt(z) {
  for (const s of SECTIONS) if (z < s.z1) return s;
  return SECTIONS[SECTIONS.length - 1];
}

(function buildProfiles() {
  // gradient, blended over 60 m between sections
  const grad = new Float32Array(PN);
  const width = new Float32Array(PN);
  for (let i = 0; i < PN; i++) {
    const z = i + Z_MIN;
    let g, w;
    if (z < -200) {
      // behind the start the mountain climbs steeply to the summit ridge
      const t = clamp((-200 - z) / 300, 0, 1);
      g = 0.12 + t * 0.9; w = 70;
    } else {
      g = 0; w = 0; let tw = 0;
      for (let k = -30; k <= 30; k += 6) {
        const s = sectionAt(z + k);
        g += s.grad; w += s.width; tw++;
      }
      g /= tw; w /= tw;
    }
    grad[i] = g; width[i] = w;
  }
  // integrate elevation so the finish sits at y ~ 0
  const zFin = FINISH_Z - Z_MIN;
  ELEV[zFin] = 0;
  for (let i = zFin + 1; i < PN; i++) ELEV[i] = ELEV[i - 1] - grad[i];
  for (let i = zFin - 1; i >= 0; i--) ELEV[i] = ELEV[i + 1] + grad[i];
  // smooth the width a second time for gentle piste edges
  for (let i = 0; i < PN; i++) {
    let s = 0, n = 0;
    for (let k = -40; k <= 40; k += 4) { const j = clamp(i + k, 0, PN - 1); s += width[j]; n++; }
    HW[i] = s / n / 2;
  }
  for (let i = 0; i < PN; i++) {
    const z = i + Z_MIN;
    const zz = clamp(z, -100, 3500);
    // start and finish areas run straight: clamp the curve parameter, then smooth the knees
    const zc = clamp(z, 90, 3260);
    CX[i] = 95 * Math.sin(zc / 470 + 0.4) + 42 * Math.sin(zc / 190 + 1.7) + 14 * Math.sin(zc / 77);
  }
  for (let pass = 0; pass < 3; pass++) {
    const src = CX.slice();
    for (let i = 0; i < PN; i++) {
      let s = 0, n = 0;
      for (let k = -60; k <= 60; k += 5) { s += src[clamp(i + k, 0, PN - 1)]; n++; }
      CX[i] = s / n;
    }
  }
})();

function prof(arr, z) {
  const f = clamp(z - Z_MIN, 0, PN - 1.001);
  const i = Math.floor(f), t = f - i;
  return arr[i] * (1 - t) + arr[i + 1] * t;
}

export const elevAt = (z) => prof(ELEV, z);
export const centerX = (z) => prof(CX, z);
export const halfWidth = (z) => prof(HW, z);
export const centerSlope = (z) => (prof(CX, z + 1) - prof(CX, z - 1)) / 2;
export const sectionName = (z) => sectionAt(z).name;
export const TOP_Y = elevAt(START_Z);

// --- features ---------------------------------------------------------------
// Kickers (terrain park + a few natural ones). u runs downhill from the lip.
export const KICKERS = [
  { z: 1080, off: -12, h: 1.7, w: 9, ramp: 11, kind: 'park' },
  { z: 1180, off: 14, h: 2.4, w: 10, ramp: 13, kind: 'park' },
  { z: 1290, off: -6, h: 3.1, w: 11, ramp: 15, kind: 'park' },
  { z: 1385, off: 16, h: 2.0, w: 9, ramp: 12, kind: 'park' },
  { z: 2620, off: 0, h: 1.25, w: 64, ramp: 22, kind: 'crest' }, // full-width roller on The Express
  { z: 820, off: 0, h: 0.9, w: 80, ramp: 18, kind: 'crest' },
];
for (const k of KICKERS) k.x = centerX(k.z) + k.off;

function kickerProfile(u, k) {
  if (u < -k.ramp || u > 26) return 0;
  if (u < 0) { const t = (u + k.ramp) / k.ramp; return k.h * t * t; }
  if (u < 3) return k.h;
  return k.h * (1 - smoothstep(3, 24, u));
}

// Mogul field on the skier's left of Glacier Bowl.
const MOGUL = { z0: 1500, z1: 1860 };

// --- height -----------------------------------------------------------------
export function heightAt(x, z) {
  const c = prof(CX, z), hw = prof(HW, z);
  const dx = x - c, adx = Math.abs(dx);
  let y = prof(ELEV, z);

  // valley walls beyond the piste
  const s = Math.max(0, adx - hw - 10);
  y += 0.1 * s + 0.00028 * s * s;

  // big alpine relief far from the run
  const far = smoothstep(380, 1900, adx) + smoothstep(-300, -1600, z) + smoothstep(3900, 5600, z);
  if (far > 0) {
    // domain-warped ridges: broad massifs with sharp crests rather than rows of teeth
    const wx = fbm(N3, x / 2600, z / 2600, 3) * 900, wz = fbm(N2, x / 2600 + 7, z / 2600, 3) * 900;
    const r = ridged(N, (x + wx) / 2300, (z + wz) / 2300, 6);
    const base = fbm(N2, x / 4000, z / 4000, 3);
    y += Math.min(far, 1.4) * (r * 1100 + base * 360 - 100);
  }

  // groomed piste vs natural snow
  const onP = 1 - smoothstep(hw - 6, hw + 14, adx);
  const roll = fbm(N2, x / 70, z / 70, 3) * 2.2;
  const natural = fbm(N2, x / 45, z / 45, 4) * 6 + N3(x / 7, z / 7) * 0.45;
  y += roll * onP + natural * (1 - onP);

  // moguls (lumpy, piste-side)
  if (z > MOGUL.z0 - 40 && z < MOGUL.z1 + 40 && dx < -hw * 0.25 && dx > -hw - 8) {
    const m = smoothstep(MOGUL.z0 - 40, MOGUL.z0, z) * (1 - smoothstep(MOGUL.z1, MOGUL.z1 + 40, z))
      * smoothstep(-hw * 0.25, -hw * 0.45, dx) * (1 - smoothstep(-hw + 2, -hw - 8, dx));
    const a = x * 0.55 + z * 0.33, b = x * -0.33 + z * 0.55;
    const mog = Math.sin(a) * Math.sin(b) + 0.35 * N3(x / 3, z / 3);
    y += m * mog * 0.75;
  }

  // kickers and crests
  for (let i = 0; i < KICKERS.length; i++) {
    const k = KICKERS[i];
    const u = z - k.z;
    if (u < -k.ramp - 1 || u > 27) continue;
    const v = Math.abs(x - k.x);
    const lat = 1 - smoothstep(k.w / 2 - 1.5, k.w / 2 + 3, v);
    if (lat <= 0) continue;
    y += kickerProfile(u, k) * lat;
  }

  // start platform and finish area are flat
  const startFlat = 1 - smoothstep(55, 90, Math.hypot(dx * 0.8, z - 0));
  if (startFlat > 0) y = y * (1 - startFlat) + (prof(ELEV, z) + roll * 0.2) * startFlat;
  return y;
}

export function normalAt(x, z, out, e = 0.6) {
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  out.set(-hx, 2 * e, -hz).normalize();
  return out;
}

// lateral offset from the piste centre in half-widths (0 centre, 1 edge)
export function pisteOffset(x, z) {
  return (x - centerX(z)) / halfWidth(z);
}

// --- race gates -------------------------------------------------------------
export const GATES = [];
(function buildGates() {
  let z = 190, side = 1, i = 0;
  while (z < FINISH_Z - 120) {
    const hw = halfWidth(z);
    const sec = sectionAt(z);
    const steep = sec.grad;
    // downhill-style: wider spacing where it's fast
    const spacing = 58 + steep * 70 + (sec.name === 'The Express' ? 30 : 0);
    let off = side * Math.min(hw * 0.26, 13 - steep * 8);
    if (sec.name === 'Terrain Park') off = side * Math.min(hw * 0.12, 8);
    if (sec.name === 'Pine Chute') off = side * hw * 0.24;
    if (sec.name === 'The Express') off = side * 7;
    GATES.push({ i: i++, z, x: centerX(z) + off, side, width: 9 });
    z += spacing; side = -side;
  }
})();

// Racing line: Catmull-Rom through a pass point inside each gate, cheated
// toward the next gate. LINE_K holds curvature for braking decisions.
const LINE_Z0 = 0, LINE_N = 3600;
const LINE_X = new Float32Array(LINE_N);
const LINE_K = new Float32Array(LINE_N);
(function buildLine() {
  const pts = [{ z: -40, x: centerX(-40) }, { z: START_Z, x: centerX(START_Z) }];
  GATES.forEach((g, i) => {
    const nx = GATES[i + 1] ? GATES[i + 1].x : centerX(FINISH_Z);
    pts.push({ z: g.z, x: g.x + clamp((nx - g.x) * 0.1, -2.6, 2.6) });
  });
  pts.push({ z: FINISH_Z, x: centerX(FINISH_Z) }, { z: FINISH_Z + 200, x: centerX(FINISH_Z + 200) });
  let k = 0;
  for (let z = 0; z < LINE_N; z++) {
    while (k < pts.length - 3 && pts[k + 2].z <= z) k++;
    const p0 = pts[k], p1 = pts[k + 1], p2 = pts[k + 2], p3 = pts[Math.min(k + 3, pts.length - 1)];
    const t = clamp((z - p1.z) / (p2.z - p1.z), 0, 1);
    const t2 = t * t, t3 = t2 * t;
    LINE_X[z] = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  }
  for (let z = 2; z < LINE_N - 2; z++) {
    const d1 = (LINE_X[z + 2] - LINE_X[z - 2]) / 4;
    const d2 = (LINE_X[z + 2] - 2 * LINE_X[z] + LINE_X[z - 2]) / 4;
    LINE_K[z] = Math.abs(d2) / Math.pow(1 + d1 * d1, 1.5);
  }
})();
export function lineX(z) { return prof2(LINE_X, z); }
export function lineCurv(z) { return prof2(LINE_K, z); }
function prof2(arr, z) {
  const f = clamp(z - LINE_Z0, 0, LINE_N - 1.001);
  const i = Math.floor(f), t = f - i;
  return arr[i] * (1 - t) + arr[i + 1] * t;
}

// --- tree placement ---------------------------------------------------------
export function treeDensity(x, z) {
  const c = prof(CX, z), hw = prof(HW, z);
  const adx = Math.abs(x - c);
  const s = adx - hw;
  if (s < 5) return 0;
  // trees are thinner above the tree line (upper mountain) and absent near the start
  const alt = heightAt(x, z);
  let d = 1 - smoothstep(520, 760, alt);
  // glacier bowl is open
  if (z > 1450 && z < 1900) d *= 0.25 + 0.75 * smoothstep(60, 160, s);
  // Pine Chute: dense wall of trees right at the edge
  if (z > 1880 && z < 2420) d = Math.max(d, 1.0);
  // village clearing
  if (z > 3300) d *= smoothstep(140, 260, adx);
  // patchy forest
  const patch = fbm(N3, x / 160, z / 160, 3) * 0.9 + 0.45;
  d *= clamp(patch * 1.6, 0, 1);
  // edges of the piste get glades
  d *= smoothstep(5, 18, s);
  return clamp(d, 0, 1);
}

export function slopeAt(x, z) {
  const hx = (heightAt(x + 1, z) - heightAt(x - 1, z)) / 2;
  const hz = (heightAt(x, z + 1) - heightAt(x, z - 1)) / 2;
  return Math.sqrt(hx * hx + hz * hz);
}

// Chairlift line runs straight on the skier's right, clear of the piste.
// Like most real lifts it is one straight line and crosses over the piste.
export const LIFT = { x0: centerX(3330) + 78, z0: 3330, x1: centerX(70) + 62, z1: 70 };

export const rng = mulberry32(1234);
