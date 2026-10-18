// The mountain: one deterministic height function that the terrain mesh,
// physics, trees, props and AI all share. Downhill is +Z. The run starts at
// z ~ 30 near the summit and finishes at the base area. Which park it is
// (src/maps.js) is fixed for the page: picking another one reloads.
import { makeSimplex, fbm, ridged, clamp, smoothstep, mulberry32 } from './noise.js';
import { MAPS, resolveParkId } from './maps.js';

export const PARK_ID = resolveParkId();
export const MAP = MAPS[PARK_ID];

const N = makeSimplex(7);
const N2 = makeSimplex(19);
const N3 = makeSimplex(42);

export const SECTIONS = MAP.sections;

export const START_Z = MAP.start;
export const FINISH_Z = MAP.finish;
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
    // start and finish areas run straight: clamp the curve parameter, then smooth the knees
    const zc = clamp(z, MAP.curveClamp[0], MAP.curveClamp[1]);
    CX[i] = MAP.curve(zc);
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
// Natural crests (kickers in the park are added from JUMPS below). u runs downhill from the lip.
export const KICKERS = MAP.crests.map((k) => ({ ...k, kind: 'crest' }));
for (const k of KICKERS) k.x = centerX(k.z) + k.off;

function kickerProfile(u, k) {
  if (u < -k.ramp || u > 26) return 0;
  if (u < 0) { const t = (u + k.ramp) / k.ramp; return k.h * t * t; }
  if (u < 3) return k.h;
  return k.h * (1 - smoothstep(3, 24, u));
}

// --- the terrain park ---------------------------------------------------------
// Laid out across the piste (dx from the centre line) and down it (z): a jump line of
// table tops on the skier's left, a roller line beyond it, rails and boxes on the right
// and a halfpipe beyond those. The race corridor down the middle stays clear.
// (parks without a terrain park keep it far out of the way)
export const PARK = MAP.park ?? { top: -1e5, z0: -1e5, z1: -1e5 };
// z: start of the takeoff ramp; h: lip height over the slope; ramp/table/land: lengths (m)
export const PARK_JUMPS = MAP.parkJumps ?? [];
const RUN_JUMPS = MAP.runJumps;
export const JUMPS = [...RUN_JUMPS, ...PARK_JUMPS].sort((a, b) => a.z - b.z);
for (const J of JUMPS) {
  J.lip = J.z + J.ramp;
  J.len = J.ramp + J.table + J.land;
  KICKERS.push({ z: J.lip, off: J.dx, x: centerX(J.lip) + J.dx, h: J.h, w: J.w, ramp: J.ramp, kind: 'park', jump: J });
}
// halfpipe: flat bottom, 5.2 m transitions up to 72 degrees, a short steep wall to the lip, decks
const P72 = 1.2566;
export const PIPE = MAP.park ? { z0: 1100, z1: 1350, dx: 54, flat: 4.2, R: 5.2, deck: 3, outer: 7 } : { z0: -1e5, z1: -1e5 + 1, dx: 54, flat: 4.2, R: 5.2, deck: 3, outer: 7 };
PIPE.amax = PIPE.R * Math.sin(P72);
PIPE.lip = PIPE.amax + 0.3;
PIPE.H = PIPE.R * (1 - Math.cos(P72)) + 0.3 * Math.tan(P72);
export const ROLLERS = MAP.park ? { z0: 1058, z1: 1382, dx: -58, len: 14, h: 1.15, w: 12 } : { z0: -1e5, z1: -1e5 + 1, dx: -58, len: 14, h: 1.15, w: 12 };
// rails and boxes: ridden onto from a short snow ramp. shape: down (parallel to the slope),
// flat, kink (flat then down), rainbow (an arch)
export const PARK_RAILS = MAP.parkRails ?? [];
const RUN_RAILS = MAP.runRails;
export const RAILS = [...RUN_RAILS, ...PARK_RAILS].sort((a, b) => a.z - b.z);
const RAMP_L = 3.4;
for (const R of RAILS) R.hw = R.kind === 'box' ? 0.32 : R.kind === 'log' ? 0.17 : 0.045;

function jumpProfile(u, J) {
  const L = J.ramp;
  if (J.drop) {
    // a pillow: rounded rise, a flat top, then a sharp ledge back to the natural slope
    if (u < L) return J.h * smoothstep(0, L, u);
    if (u < L + J.table) return J.h;
    return J.h * (1 - smoothstep(L + J.table, J.len, u));
  }
  if (u < L) { const t = u / L; return J.h * t * t; }
  // the lip's back face drops onto the table
  const top = J.h - 0.45;
  if (u < L + 0.7) return J.h - 0.45 * smoothstep(L, L + 0.7, u);
  if (u < L + J.table) return top;
  return top * (1 - smoothstep(L + J.table, J.len, u));
}

export function pipeProfile(a) {
  const P = PIPE;
  if (a <= 0) return 0;
  if (a < P.amax) return P.R * (1 - Math.sqrt(1 - (a / P.R) ** 2));
  if (a < P.lip) return P.R * (1 - Math.cos(P72)) + (a - P.amax) * Math.tan(P72);
  if (a < P.lip + P.deck) return P.H;
  return P.H * (1 - smoothstep(0, P.outer, a - P.lip - P.deck));
}
export const pipeWalls = (z) => smoothstep(PIPE.z0, PIPE.z0 + 22, z) * (1 - smoothstep(PIPE.z1 - 16, PIPE.z1, z));

// every feature's stretch of the run, bucketed along z so the height lookup stays cheap
const B0 = -300, BS = 8, BN = 500;
const FEATS = [
  ...JUMPS.map((J) => ({ z0: J.z, z1: J.z + J.len, k: 0, J })),
  ...(MAP.park ? [{ z0: ROLLERS.z0, z1: ROLLERS.z1, k: 1 }, { z0: PIPE.z0, z1: PIPE.z1, k: 2 }] : []),
  ...RAILS.map((R) => ({ z0: R.z - RAMP_L, z1: R.z + 0.35, k: 3, R })),
];
function bucketize(list) {
  const B = Array.from({ length: BN }, () => []);
  for (const f of list) for (let b = Math.floor((f.z0 - B0) / BS); b <= Math.floor((f.z1 - B0) / BS); b++) if (b >= 0 && b < BN) B[b].push(f);
  return B;
}
const FEAT_B = bucketize(FEATS);

// added height of the features at (dx from the centre line, z)
export function parkAt(dx, z) {
  const b = Math.floor((z - B0) / BS);
  if (b < 0 || b >= BN) return 0;
  const L = FEAT_B[b];
  if (!L.length) return 0;
  let y = 0;
  for (let i = 0; i < L.length; i++) {
    const f = L[i];
    if (z < f.z0 || z > f.z1) continue;
    if (f.k === 0) {
      const J = f.J;
      const v = Math.abs(dx - J.dx);
      const lat = 1 - smoothstep(J.w / 2 - 1, J.w / 2 + 2.5, v);
      if (lat > 0) y += jumpProfile(z - J.z, J) * lat;
    } else if (f.k === 1) {
      const RL = ROLLERS;
      const lat = 1 - smoothstep(RL.w / 2 - 2, RL.w / 2 + 2, Math.abs(dx - RL.dx));
      if (lat > 0) { const s = Math.sin((Math.PI * (z - RL.z0)) / RL.len); y += RL.h * s * s * lat; }
    } else if (f.k === 2) {
      const a = Math.abs(dx - PIPE.dx) - PIPE.flat;
      if (a > 0 && a < PIPE.lip + PIPE.deck + PIPE.outer) y += pipeProfile(a) * pipeWalls(z);
    } else {
      const R = f.R, u = z - R.z;
      const lat = 1 - smoothstep(R.hw + 0.45, R.hw + 1.0, Math.abs(dx - R.dx));
      if (lat <= 0) continue;
      const top = R.h - 0.06;
      y += lat * (u < 0 ? top * Math.pow(Math.max(0, (u + RAMP_L) / RAMP_L), 1.3) : top * Math.max(0, 1 - u / 0.35));
    }
  }
  return y;
}

// areas the features' own fine surface covers (the coarse terrain hides underneath)
export const PARK_FEET = [
  ...JUMPS.map((J) => ({ dx0: J.dx - J.w / 2 - 6, dx1: J.dx + J.w / 2 + 6, z0: J.z - 3, z1: J.z + J.len + 3 })),
  ...(MAP.park ? [{ dx0: ROLLERS.dx - 10, dx1: ROLLERS.dx + 10, z0: ROLLERS.z0 - 3, z1: ROLLERS.z1 + 3 }, { dx0: PIPE.dx - 23, dx1: PIPE.dx + 23, z0: PIPE.z0 - 3, z1: PIPE.z1 + 3 }] : []),
  ...RAILS.map((R) => ({ dx0: R.dx - 3, dx1: R.dx + 3, z0: R.z - RAMP_L - 3, z1: R.z + 3 })),
];
const FEET_B = bucketize(PARK_FEET.map((f) => ({ ...f, z0: f.z0 - 2, z1: f.z1 + 2, f })));
function inFeet(dx, z) {
  const b = Math.floor((z - B0) / BS);
  if (b < 0 || b >= BN) return false;
  for (const { f } of FEET_B[b]) if (dx > f.dx0 && dx < f.dx1 && z > f.z0 && z < f.z1) return true;
  return false;
}

// the piste is groomed smooth around every feature so it sits true
const CALM = new Float32Array(PN);
for (let i = 0; i < PN; i++) {
  const z = i + Z_MIN;
  let c = smoothstep(PARK.z0 - 60, PARK.z0, z) * (1 - smoothstep(PARK.z1, PARK.z1 + 60, z));
  if (MAP.calm) c = Math.max(c, 1 - smoothstep(FINISH_Z, FINISH_Z + 80, z));
  for (const f of FEATS) if (z > f.z0 - 40 && z < f.z1 + 40) c = Math.max(c, smoothstep(f.z0 - 35, f.z0 - 8, z) * (1 - smoothstep(f.z1 + 8, f.z1 + 35, z)));
  CALM[i] = c;
}

// which named part of the run (x, z) is in
export function zoneAt(x, z) {
  const dx = x - centerX(z);
  if (z > PARK.top - 20 && z < PARK.z1 + 30) {
    if (z > PIPE.z0 - 10 && z < PIPE.z1 && Math.abs(dx - PIPE.dx) < 20) return 'Halfpipe';
    if (dx < -44) return 'Rollers';
    if (dx < -12) return 'Jump Line';
    if (dx > 12) return 'Rail Garden';
    return 'Terrain Park';
  }
  for (const Z of ZONES) if (z < Z.z1) return Z.name;
  return 'Village';
}
export const ZONES = MAP.zones;

// Mogul field on the skier's left of Glacier Bowl.
const MOGUL = MAP.moguls ?? { z0: -1e5, z1: -1e5 };

// --- height -----------------------------------------------------------------
export function heightAt(x, z) {
  const c = prof(CX, z), hw = prof(HW, z);
  const dx = x - c, adx = Math.abs(dx);
  let y = prof(ELEV, z);

  // valley walls beyond the piste
  const s = Math.max(0, adx - hw - 10);
  y += 300 * (1 - Math.exp(-s / 650)) + 0.05 * s; // valley sides rise, then level into benches

  // big alpine relief far from the run
  const far = smoothstep(800, 3600, adx) + smoothstep(-300, -1600, z) + smoothstep(FINISH_Z + 480, FINISH_Z + 2180, z);
  if (far > 0) {
    // domain-warped ridges: broad massifs with sharp crests rather than rows of teeth
    const wx = fbm(N3, x / 2600, z / 2600, 3) * 900, wz = fbm(N2, x / 2600 + 7, z / 2600, 3) * 900;
    const r = ridged(N, (x + wx) / 2300, (z + wz) / 2300, 6);
    const base = fbm(N2, x / 4000, z / 4000, 3);
    y += Math.min(far, 1.4) * (r * 950 + base * 320 - 90);
  }

  // groomed piste vs natural snow
  const onP = 1 - smoothstep(hw - 6, hw + 14, adx);
  // (flattened around the features so they sit true)
  const roll = fbm(N2, x / 70, z / 70, 3) * 2.2 * (1 - 0.85 * prof(CALM, z));
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
    if (k.kind === 'park') continue;
    const u = z - k.z;
    if (u < -k.ramp - 1 || u > 27) continue;
    const v = Math.abs(x - k.x);
    const lat = 1 - smoothstep(k.w / 2 - 1.5, k.w / 2 + 3, v);
    if (lat <= 0) continue;
    y += kickerProfile(u, k) * lat;
  }

  y += parkAt(dx, z);

  // start platform and finish area are flat
  const startFlat = 1 - smoothstep(55, 90, Math.hypot(dx * 0.8, z - 0));
  if (startFlat > 0) y = y * (1 - startFlat) + (prof(ELEV, z) + roll * 0.2) * startFlat;
  return y;
}

// what the coarse terrain mesh draws: under the park's fine surface it sits a little below
// (the minimum over a vertex spacing), so the sharp features are never poked through
export function meshHeightAt(x, z, step) {
  const y = heightAt(x, z);
  const dx = x - prof(CX, z);
  if (!inFeet(dx, z)) return y;
  let mn = Infinity;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) mn = Math.min(mn, parkAt(dx + i * step, z + j * step));
  return y - parkAt(dx, z) + mn - 0.15;
}

export function normalAt(x, z, out, e = 0.6) {
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  out.set(-hx, 2 * e, -hz).normalize();
  return out;
}

// every kicker without a measured approach speed gets one: the speed off the lip (no pop)
// whose flight comes down a third of the way down the landing
function sweetSpeed(J) {
  const x0 = centerX(J.lip) + J.dx;
  const zl = J.lip - 0.01;
  const y0 = heightAt(x0, zl);
  const sl = (heightAt(x0, zl) - heightAt(x0, zl - 0.6)) / 0.6;
  const want = J.lip + J.table + (J.drop ? 4 : J.land * 0.35);
  const landZ = (v) => {
    const il = 1 / Math.hypot(1, sl);
    let z = zl, y = y0, vz = v * il, vy = v * sl * il;
    for (let t = 0; t < 8; t += 0.01) {
      vy -= 9.81 * 0.01; z += vz * 0.01; y += vy * 0.01;
      if (t > 0.05 && y <= heightAt(centerX(z) + J.dx, z)) return z;
    }
    return z;
  };
  let lo = 4, hi = 45;
  for (let i = 0; i < 26; i++) { const m = (lo + hi) / 2; if (landZ(m) < want) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
// (quoted at the foot of the ramp, like the measured park tables: the climb costs speed)
for (const J of JUMPS) if (!J.speed) J.speed = +Math.sqrt(sweetSpeed(J) ** 2 + 2 * 9.81 * J.h).toFixed(1);

// rail tops: a straight line on the ground plan, heights per shape (sampled every 0.25 m)
for (const R of RAILS) {
  const za = R.z, zb = R.z + R.len;
  const xa = centerX(za) + R.dx, xb = centerX(zb) + R.dx;
  const ya = heightAt(xa, za) - parkAt(R.dx, za) + R.h, yb = heightAt(xb, zb) + R.h;
  const L = Math.hypot(xb - xa, zb - za);
  R.a = { x: xa, z: za }; R.L = L; R.dir = { x: (xb - xa) / L, z: (zb - za) / L };
  R.yaw = Math.atan2(R.dir.x, R.dir.z);
  const n = Math.ceil(L / 0.25);
  R.ys = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let y = ya + (yb - ya) * t;
    if (R.shape === 'flat') y = ya;
    else if (R.shape === 'kink') y = t < 0.4 ? ya : ya + (yb - ya) * ((t - 0.4) / 0.6);
    else if (R.shape === 'rainbow') y += 0.75 * Math.sin(Math.PI * t);
    R.ys[i] = y;
  }
}
// where (x, z) projects onto a rail: distance along it, sideways off it, and the top's height
export function railAt(R, x, z, out) {
  const rx = x - R.a.x, rz = z - R.a.z;
  out.s = rx * R.dir.x + rz * R.dir.z;
  out.lat = rx * R.dir.z - rz * R.dir.x;
  const f = clamp(out.s / R.L, 0, 1) * (R.ys.length - 1);
  const i = Math.min(Math.floor(f), R.ys.length - 2), t = f - i;
  out.y = R.ys[i] * (1 - t) + R.ys[i + 1] * t;
  out.slope = (R.ys[i + 1] - R.ys[i]) / (R.L / (R.ys.length - 1));
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
    pts.push({ z: g.z, x: g.x + clamp((nx - g.x) * 0.1, -1.6, 1.6) });
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
  const dx = x - c, adx = Math.abs(dx);
  const s = adx - hw;
  if (s < 5) return gladeDensity(dx, z);
  // trees are thinner above the tree line (upper mountain) and absent near the start
  const alt = heightAt(x, z);
  let d = 1 - smoothstep(520, 760, alt);
  d = MAP.trees(z, s, d);
  // base area clearing
  if (z > FINISH_Z - 120) d *= smoothstep(140, 260, adx);
  // patchy forest
  const patch = fbm(N3, x / 160, z / 160, 3) * 0.9 + 0.45;
  d *= clamp(patch * 1.6, 0, 1);
  // edges of the piste get glades
  d *= smoothstep(5, 18, s);
  // tree-skiing parks: the forest comes right down to the edge
  if (MAP.glades && z < FINISH_Z - 120) d = Math.max(d, 0.85 * smoothstep(5, 11, s) * (1 - smoothstep(35, 80, s)));
  return clamp(d, 0, 1);
}

// glade parks grow sparse trees on the run itself, clear of the features and their run-ins
function gladeDensity(dx, z) {
  if (!MAP.glades) return 0;
  let d = 0;
  for (const [a, b, k] of MAP.glades) if (z > a && z < b) d = k * smoothstep(a, a + 30, z) * (1 - smoothstep(b - 30, b, z));
  if (d <= 0) return 0;
  for (const J of JUMPS) if (z > J.z - 28 && z < J.z + J.len + 14 && Math.abs(dx - J.dx) < J.w / 2 + 6) return 0;
  for (const R of RAILS) if (z > R.z - 20 && z < R.z + R.len + 8 && Math.abs(dx - R.dx) < 5) return 0;
  return d;
}
const ICY = MAP.icy ?? [];
export function surfaceAt(x, z, out) {
  const hw = prof(HW, z);
  const adx = Math.abs(x - prof(CX, z));
  const onP = 1 - smoothstep(hw - 3, hw + 6, adx);
  // ungroomed parks: soft snow, powder in the glades
  out.powder = 1 - onP * (1 - (MAP.soft ? MAP.soft(z) : 0));
  let ice = 0;
  for (const [a, b] of ICY) {
    if (z < a - 30 || z > b + 30) continue;
    const sec = smoothstep(a - 30, a + 30, z) * (1 - smoothstep(b - 30, b + 30, z));
    // long, fall-line streaks where everyone scrapes their turns
    const n = N3(x / 11 + 31.7, z / 46) * 0.7 + N2(x / 5, z / 12) * 0.3;
    ice = Math.max(ice, sec * smoothstep(0.3, 0.55, n) * smoothstep(hw * 0.95, hw * 0.55, adx));
  }
  out.ice = ice * onP;
  return out;
}

export function slopeAt(x, z) {
  const hx = (heightAt(x + 1, z) - heightAt(x - 1, z)) / 2;
  const hz = (heightAt(x, z + 1) - heightAt(x, z - 1)) / 2;
  return Math.sqrt(hx * hx + hz * hz);
}

// Chairlift line runs straight on the skier's right, clear of the piste.
// Like most real lifts it is one straight line and crosses over the piste.
export const LIFT = { x0: centerX(FINISH_Z - 90) + 78, z0: FINISH_Z - 90, x1: centerX(70) + 62, z1: 70 };

export const rng = mulberry32(1234);
