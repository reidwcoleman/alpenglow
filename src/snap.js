// One skier's look at one instant, as a flat list of numbers: what the replays record
// and what multiplayer sends. applySnap() poses a stand-in skier from two of them.
const TRICK = [null, 'backflip', 'frontflip', 'cork', 'bio', 'rodeo', 'misty', 'sideflip', 'flatspin'];
const GRAB = [null, 'mute', 'tail', 'japan'];
const PHASE = [null, 'tumble', 'down', 'up'];
export const SNAP_N = 52;

export function snap(s, out = new Float32Array(SNAP_N)) {
  const c = s.controls;
  let i = 0;
  const w = (v) => { out[i++] = v; };
  w(s.pos.x); w(s.pos.y); w(s.pos.z);
  w(s.vel.x); w(s.vel.y); w(s.vel.z);
  w(s.heading); w(s.avgHeading); w(s.skidYaw);
  w(s.normal.x); w(s.normal.y); w(s.normal.z);
  w(s.pitch); w(s.flipAxis.x); w(s.flipAxis.y); w(s.flipAxis.z);
  w(TRICK.indexOf(s.trickType));
  w(s.crash > 0 ? 1 : 0); w(PHASE.indexOf(s.crashPhase)); w(s.tumble); w(s.tumbleAxis.x); w(s.tumbleAxis.z); w(s.cartAngle); w(s.lie);
  w(s.lean); w(s.edge); w(s.compress); w(s.gload); w(s.jumpCharge); w(s.airTime); w(s.onGround ? 1 : 0);
  w(c.steer); w(c.tuck); w(c.brake); w(c.grab ? 1 : 0); w(GRAB.indexOf(c.grabKind ?? null)); w(c.jump ? 1 : 0);
  w(s.polePlant); w(s.poleSide); w(s.skating); w(s.skatePhase);
  w(s.butter ? s.butter.t : -1); w(s.butter?.tail ? 1 : 0);
  w(s.grind ? 1 : 0); w(s.time); w(s.surf.powder); w(s.skid); w(s.latAcc); w(s.maxAirY ?? 0); w(s.sinkV ?? 0);
  w(s.spin); w(0);
  return out;
}

const lerp = (a, b, t) => a + (b - a) * t;

// pose skier d from snapshots a..b at t (0..1)
export function applySnap(d, a, b = a, t = 0) {
  const L = (k) => lerp(a[k], b[k], t);
  const N = t < 0.5 ? a : b; // discrete fields from the nearer one
  d.pos.set(L(0), L(1), L(2));
  d.vel.set(L(3), L(4), L(5));
  d.heading = L(6); d.avgHeading = L(7); d.skidYaw = L(8);
  d.normal.set(L(9), L(10), L(11)).normalize();
  d.pitch = L(12); d.flipAxis.set(L(13), L(14), L(15)).normalize();
  d.trickType = TRICK[N[16]] ?? null;
  d.crash = N[17]; d.crashPhase = PHASE[N[18]] ?? null; d.tumble = L(19); d.tumbleAxis.set(L(20), 0, L(21)).normalize(); d.cartAngle = L(22); d.lie = L(23);
  d.lean = L(24); d.edge = L(25); d.compress = L(26); d.gload = L(27); d.jumpCharge = L(28); d.airTime = L(29); d.onGround = !!N[30];
  const c = d.controls;
  c.steer = L(31); c.tuck = L(32); c.brake = L(33); c.grab = !!N[34]; c.grabKind = GRAB[N[35]] ?? null; c.jump = !!N[36];
  d.polePlant = L(37); d.poleSide = N[38]; d.skating = N[39]; d.skatePhase = L(40);
  d.butter = N[41] >= 0 ? { t: L(41), tail: !!N[42] } : null;
  d.grind = N[43] ? (d.grind ?? { fake: true }) : null;
  d.time = L(44); d.surf.powder = L(45); d.skid = L(46); d.latAcc = L(47); d.maxAirY = L(48); d.sinkV = L(49);
  d.spin = L(50);
}
