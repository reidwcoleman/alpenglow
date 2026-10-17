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
  { name: 'Meadow Rollers', z0: 700, z1: 950, grad: 0.21, width: 90 },
  { name: 'Terrain Park', z0: 950, z1: 1490, grad: 0.2, width: 150 },
  { name: 'Glacier Bowl', z0: 1490, z1: 1900, grad: 0.39, width: 110 },
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
// Natural crests (kickers in the park are added from JUMPS below). u runs downhill from the lip.
export const KICKERS = [
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

// --- the terrain park ---------------------------------------------------------
// Laid out across the piste (dx from the centre line) and down it (z): a jump line of
// table tops on the skier's left, a roller line beyond it, rails and boxes on the right
// and a halfpipe beyond those. The race corridor down the middle stays clear.
export const PARK = { top: 1032, z0: 1040, z1: 1400 };
// z: start of the takeoff ramp; h: lip height over the slope; ramp/table/land: lengths (m)
export const PARK_JUMPS = [
// speed: the approach (m/s at the foot of the ramp) that lands in the sweet spot (tools/parkjump.mjs)
  { name: 'Small', zone: 'Jump Line', z: 1062, dx: -28, h: 1.6, ramp: 6.5, table: 4, land: 8, w: 7, speed: 10.5 },
  { name: 'Medium', zone: 'Jump Line', z: 1130, dx: -28, h: 2.5, ramp: 8.5, table: 7, land: 11, w: 9, speed: 12.5 },
  { name: 'Large', zone: 'Jump Line', z: 1205, dx: -28, h: 3.3, ramp: 10.5, table: 10, land: 14, w: 11, speed: 14.6 },
  { name: 'XL', zone: 'Jump Line', z: 1290, dx: -28, h: 4.1, ramp: 12, table: 13, land: 17, w: 12, speed: 16.2 },
];
// the rest of the run's kickers, each off to one side so the race line stays clear
const RUN_JUMPS = [
  { name: 'Drop In', zone: 'Drop In', z: 112, dx: -22, h: 1.3, ramp: 6, table: 3, land: 7, w: 7 },
  { name: 'Wall Hit', zone: 'The Wall', z: 330, dx: -24, h: 1.5, ramp: 7, table: 2, land: 8, w: 8 },
  { name: 'Wall Hit', zone: 'The Wall', z: 450, dx: 24, h: 1.5, ramp: 7, table: 2, land: 8, w: 8 },
  { name: 'Wall Hit', zone: 'The Wall', z: 570, dx: -24, h: 1.5, ramp: 7, table: 2, land: 8, w: 8 },
  { name: 'Big Air', zone: 'Big Air', z: 1585, dx: 30, h: 4.6, ramp: 15, table: 6, land: 26, w: 14 },
  { name: 'Express', zone: 'Kicker Line', z: 2480, dx: -22, h: 2.2, ramp: 8, table: 5, land: 10, w: 9 },
  { name: 'Express', zone: 'Kicker Line', z: 2560, dx: 22, h: 2.4, ramp: 8.5, table: 5, land: 11, w: 9 },
  { name: 'Express', zone: 'Kicker Line', z: 2700, dx: -22, h: 2.6, ramp: 9, table: 6, land: 12, w: 10 },
  { name: 'Express', zone: 'Kicker Line', z: 2790, dx: 22, h: 2.8, ramp: 9.5, table: 6, land: 12, w: 10 },
  { name: 'Last Call', zone: 'Last Call', z: 3230, dx: -24, h: 2.4, ramp: 9, table: 6, land: 11, w: 10 },
];
export const JUMPS = [...RUN_JUMPS, ...PARK_JUMPS].sort((a, b) => a.z - b.z);
for (const J of JUMPS) {
  J.lip = J.z + J.ramp;
  J.len = J.ramp + J.table + J.land;
  KICKERS.push({ z: J.lip, off: J.dx, x: centerX(J.lip) + J.dx, h: J.h, w: J.w, ramp: J.ramp, kind: 'park', jump: J });
}
// halfpipe: flat bottom, 5.2 m transitions up to 72 degrees, a short steep wall to the lip, decks
const P72 = 1.2566;
export const PIPE = { z0: 1100, z1: 1350, dx: 54, flat: 4.2, R: 5.2, deck: 3, outer: 7 };
PIPE.amax = PIPE.R * Math.sin(P72);
PIPE.lip = PIPE.amax + 0.3;
PIPE.H = PIPE.R * (1 - Math.cos(P72)) + 0.3 * Math.tan(P72);
export const ROLLERS = { z0: 1058, z1: 1382, dx: -58, len: 14, h: 1.15, w: 12 };
// rails and boxes: ridden onto from a short snow ramp. shape: down (parallel to the slope),
// flat, kink (flat then down), rainbow (an arch)
export const PARK_RAILS = [
  { name: 'Butter Box', z: 1062, dx: 26, len: 7, h: 0.45, kind: 'box', shape: 'down', color: 0x2a7de1 },
  { name: 'Down Rail', z: 1108, dx: 24, len: 9, h: 0.6, kind: 'rail', shape: 'down', color: 0xf2b705 },
  { name: 'Rainbow Box', z: 1155, dx: 28, len: 8, h: 0.5, kind: 'box', shape: 'rainbow', color: 0xff4f8b },
  { name: 'Kinked Rail', z: 1205, dx: 24, len: 11, h: 0.65, kind: 'rail', shape: 'kink', color: 0xd8342c },
  { name: 'Flat Box', z: 1258, dx: 28, len: 7, h: 0.5, kind: 'box', shape: 'flat', color: 0x18a868 },
  { name: 'Long Tube', z: 1305, dx: 25, len: 14, h: 0.8, kind: 'rail', shape: 'down', color: 0xff6a2b },
];
for (const R of PARK_RAILS) R.zone = 'Rail Garden';
// rail zones down the rest of the run
const RUN_RAILS = [
  { name: 'Start Box', zone: 'Drop In', z: 116, dx: 22, len: 8, h: 0.5, kind: 'box', shape: 'flat', color: 0x2a7de1 },
  { name: 'Yard Rail', zone: 'Rail Yard', z: 740, dx: 24, len: 10, h: 0.7, kind: 'rail', shape: 'down', color: 0xf2b705 },
  { name: 'Yard Box', zone: 'Rail Yard', z: 775, dx: -24, len: 9, h: 0.5, kind: 'box', shape: 'flat', color: 0x18a868 },
  { name: 'Yard Kink', zone: 'Rail Yard', z: 860, dx: 24, len: 12, h: 0.7, kind: 'rail', shape: 'kink', color: 0xd8342c },
  { name: 'Yard Rainbow', zone: 'Rail Yard', z: 900, dx: -24, len: 9, h: 0.55, kind: 'box', shape: 'rainbow', color: 0xff4f8b },
  { name: 'Forest Rail', zone: 'Forest Line', z: 2050, dx: 17, len: 10, h: 0.6, kind: 'rail', shape: 'down', color: 0xff6a2b },
  { name: 'Forest Box', zone: 'Forest Line', z: 2200, dx: -17, len: 10, h: 0.5, kind: 'box', shape: 'down', color: 0x8e3fd1 },
  { name: 'Last Box', zone: 'Last Call', z: 3020, dx: 24, len: 10, h: 0.5, kind: 'box', shape: 'flat', color: 0x2a7de1 },
  { name: 'Last Tube', zone: 'Last Call', z: 3080, dx: -24, len: 14, h: 0.75, kind: 'rail', shape: 'down', color: 0xf2b705 },
  { name: 'Last Kink', zone: 'Last Call', z: 3150, dx: 24, len: 11, h: 0.7, kind: 'rail', shape: 'kink', color: 0xd8342c },
];
export const RAILS = [...RUN_RAILS, ...PARK_RAILS].sort((a, b) => a.z - b.z);
const RAMP_L = 3.4;
for (const R of RAILS) R.hw = R.kind === 'box' ? 0.32 : 0.045;

function jumpProfile(u, J) {
  const L = J.ramp;
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
  { z0: ROLLERS.z0, z1: ROLLERS.z1, k: 1 },
  { z0: PIPE.z0, z1: PIPE.z1, k: 2 },
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
  { dx0: ROLLERS.dx - 10, dx1: ROLLERS.dx + 10, z0: ROLLERS.z0 - 3, z1: ROLLERS.z1 + 3 },
  { dx0: PIPE.dx - 23, dx1: PIPE.dx + 23, z0: PIPE.z0 - 3, z1: PIPE.z1 + 3 },
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
export const ZONES = [
  { name: 'Drop In', z1: 170 }, { name: 'The Wall', z1: 700 }, { name: 'Rail Yard', z1: 950 }, { name: 'Terrain Park', z1: 1490 },
  { name: 'Big Air', z1: 1680 }, { name: 'Glacier Bowl', z1: 1900 }, { name: 'Forest Line', z1: 2400 }, { name: 'Kicker Line', z1: 2950 },
  { name: 'Last Call', z1: FINISH_Z - 10 }, { name: 'Finish', z1: FINISH_Z + 60 },
];

// Mogul field on the skier's left of Glacier Bowl.
const MOGUL = { z0: 1530, z1: 1860 };

// --- height -----------------------------------------------------------------
export function heightAt(x, z) {
  const c = prof(CX, z), hw = prof(HW, z);
  const dx = x - c, adx = Math.abs(dx);
  let y = prof(ELEV, z);

  // valley walls beyond the piste
  const s = Math.max(0, adx - hw - 10);
  y += 300 * (1 - Math.exp(-s / 650)) + 0.05 * s; // valley sides rise, then level into benches

  // big alpine relief far from the run
  const far = smoothstep(800, 3600, adx) + smoothstep(-300, -1600, z) + smoothstep(3900, 5600, z);
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

// Snow surface under (x, z): groomed piste, natural powder off piste, and
// scraped ice patches on the steep, heavily skied pitches. Shared by the
// physics (grip, friction) and the terrain shader (via a vertex attribute).
const ICY = [[180, 690], [1500, 1870], [2450, 2900]];
export function surfaceAt(x, z, out) {
  const hw = prof(HW, z);
  const adx = Math.abs(x - prof(CX, z));
  const onP = 1 - smoothstep(hw - 3, hw + 6, adx);
  out.powder = 1 - onP;
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
export const LIFT = { x0: centerX(3330) + 78, z0: 3330, x1: centerX(70) + 62, z1: 70 };

export const rng = mulberry32(1234);
