// One skier's look at one instant, as a flat list of numbers: what the replays record
// and what multiplayer sends. applySnap() poses a stand-in skier from two of them.
const TRICK = [null, 'backflip', 'frontflip', 'cork', 'bio', 'rodeo', 'misty', 'sideflip', 'flatspin'];
const GRAB = [null, 'mute', 'tail', 'japan', 'safety', 'critical', 'nose'];
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
  // (a body turned Cork7's way has one orientation: sent as its turn from the heading, about an
  // axis, which is how a stand-in draws it)
  if (s.air7Live && !s.onGround) {
    const r = airTurn(s.air7.q, s.heading + s.skidYaw);
    w(s.trickType ? r[0] : -r[0]); w(r[1]); w(r[2]); w(r[3]);
  } else { w(s.pitch); w(s.flipAxis.x); w(s.flipAxis.y); w(s.flipAxis.z); }
  w(TRICK.indexOf(s.trickType));
  w(s.crash > 0 ? 1 : 0); w(PHASE.indexOf(s.crashPhase)); w(s.tumble); w(s.tumbleAxis.x); w(s.tumbleAxis.z); w(s.cartAngle); w(s.lie);
  w(s.lean); w(s.edge); w(s.compress); w(s.gload); w(s.jumpCharge); w(s.airTime); w(s.onGround ? 1 : 0);
  w(c.steer); w(c.tuck); w(c.brake); w(c.grab ? 1 : 0); w(GRAB.indexOf(c.grabKind ?? null)); w(c.jump ? 1 : 0);
  w(s.polePlant); w(s.poleSide); w(s.skating); w(s.skatePhase);
  w(s.butter ? s.butter.t : -1); w(s.butter?.tail ? 1 : 0);
  w(s.grind ? 1 : 0); w(s.time); w(s.surf.powder); w(s.skid); w(s.latAcc); w(s.maxAirY ?? 0); w(s.sinkV ?? 0);
  w(s.spin); w((c.up ? 1 : 0) + (c.down ? 2 : 0) + (c.flip > 0 ? 4 : 0) + (c.flip < 0 ? 8 : 0) + (s.boardSwitch ? 16 : 0));
  return out;
}

// the orientation q taken off a turn of yaw about the vertical: [angle, axis x, y, z]
function airTurn(q, yaw) {
  const c = Math.cos(yaw / 2), sn = Math.sin(yaw / 2);
  // (the yaw undone: conjugate(yaw) * q)
  let x = c * q.x - sn * q.z, y = c * q.y - sn * q.w, z = c * q.z + sn * q.x, ww = c * q.w + sn * q.y;
  if (ww < 0) { x = -x; y = -y; z = -z; ww = -ww; }
  const ang = 2 * Math.acos(Math.min(1, ww)), k = Math.sqrt(Math.max(0, 1 - ww * ww));
  return k < 1e-6 ? [0, 1, 0, 0] : [ang, x / k, y / k, z / k];
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
  const bits = N[51] | 0;
  d.boardSwitch = !!(bits & 16);
  c.up = !!(bits & 1); c.down = !!(bits & 2); c.flip = bits & 4 ? 1 : bits & 8 ? -1 : 0;
}
