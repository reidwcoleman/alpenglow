// One rider's physics. It knows nothing of the scene: it rides a `surface` (see surface.js for the
// real mountain, tools/c7diff.mjs for the reference's) and takes an input each step:
//   { steer, forward, brake, jump, grab, board, airRoll, cork, over, butter }  (steer + is left)
// The model, in short: the rider has ONE speed along a line (travelHeading) and is stuck to the
// snow. The slope pulls at 1.7 g, the air at 17.5 m/s^2. Nothing leaves the snow by accident: only a
// kicker's lip, a pop, the end of a rail or a pipe's lip throw you into the air, and in the air the
// body is one orientation turned by momentum, with an assist that squares it up once you let go.
// tools/c7diff.mjs runs this frame by frame against Cork7's own simulation.
import * as THREE from 'three';
import { AirRot } from './airrot.js';
import { LandingAssist, AirLevel, groundPose, offLanding } from './airassist.js';
import { Butter, faceplantTilt } from './ridebutter.js';
import { RagBody } from './ragbody.js';
import { wallHit, snowEdge, kickerSweep } from './snowedge.js';

export const SLOPE_G = 9.81 * 1.7, AIR_G = 17.5, VMAX = 43;
const ROLL = 0.13, K_RIDE = 0.0028, K_TUCK = 0.0024, DEEP = 1.38, EDGE_DRAG = 0.38, BRAKE = 17;
const SPIN0 = 6.3, SPIN1 = SPIN0 * 1.08, SPIN_GRAB = SPIN1 * 1.4, SPIN_DOWN = 6.5;
const RAIL_SPIN = 4.2, RAIL_G = AIR_G * 0.5;
const TUCK_TIME = 1.25, TUCK_SPEED = 18, BOUNDS = 121, BODY_BOUNDS = 123;
// rails reach out for you: on the snow within 1.5 m of the line, in the air within 1 m
const FUNNEL_REACH = 1.5, FUNNEL_ANGLE = (25 * Math.PI) / 180, FUNNEL_PULL = 1 / 12;
const AIR_REACH = 1, AIR_ANGLE = (35 * Math.PI) / 180, AIR_PULL = 0.7, AIR_WINDOW = 0.45;
const PIPE_GRAVITY_KEEP = 0.6; // (the walls pull less across the pipe than down the fall line)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (v) => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => mix(a, b, 1 - Math.exp(-k * dt));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const toward = (a, b, dt, rev, k = 28) => damp(a, b, b ? (rev ? k : 10) : SPIN_DOWN, dt);
const angleBetween = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.dot(b))));

// how bad a hit is: e into the thing at speed t in all
export function hitClass(e, t) {
  const n = e / Math.max(e, t, 0.001);
  return e < 3 ? 'scrape' : e < 14 || n < 0.48 ? 'balance' : e < 25 || n < 0.72 ? 'fall' : 'crash';
}

const _y = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3(), _n = new THREE.Vector3();
const POP_RISE = Math.tan((12 * Math.PI) / 180);
const _p = { t: 0, side: 0 }, _pt = { x: 0, z: 0 }, _f = { slope: 0, cross: 0 }, _f2 = { slope: 0, cross: 0 };

export class RideSim {
  constructor(surface) {
    this.S = surface;
    this.vmax = surface.maxSpeed ?? VMAX;
    this.air = new AirRot();
    this.q = this.air.q; // the body in the air, in the heading's frame
    this.assist = new LandingAssist();
    this.level = new AirLevel();
    this.groundTarget = new THREE.Quaternion();
    this.stanceTurn = new THREE.Quaternion();
    this.landingNormal = new THREE.Vector3();
    this.landingUp = new THREE.Vector3();
    this.butter = new Butter();
    this.walls = !!surface.snowWalls;
    this.body = new RagBody(surface.h, this.walls);
    this.moveFrom = { x: 0, y: 0, z: 0 };
    this.place(0, 0, 0, 0);
  }

  // on the snow at (x, z), facing and going heading at speed, every other thing reset
  place(x, z, heading, speed) {
    Object.assign(this, {
      x, z, y: this.S.h(x, z), speed, heading, travelHeading: heading, velocityX: Math.sin(heading) * speed, velocityZ: Math.cos(heading) * speed, vy: 0,
      lateral: 0, edge: 0, carveTransfer: 0, turnRate: 0, previousSteer: 0, airborne: false, airTime: 0, maxAir: 0, jumpDistance: 0, lastJumpDistance: 0,
      spin: 0, flip: 0, spinVelocity: 0, flipVelocity: 0, rollVelocity: 0, spinTightness: 0, flipTightness: 0, spinWindup: 0, flipWindup: 0, airGrab: 0,
      spinReversal: 0, flipReversal: 0, corkSet: false, railPitchHeld: 0, landingPrepare: 0, landing: 0, landingImpact: 0, landingBoost: 0, landingSpin: 0, landingFlip: 0,
      landingSettling: false, switchStance: false, forwardHeld: 0, tucking: false, crouch: 0, skid: 0, skidSide: 1, poling: 0, polePhase: 0, poleProgressZ: z, recoveryPushTime: 0,
      charge: 0, jumpHeld: false, takeoffKick: 0, grabTime: 0, airSource: '', event: '', crashTime: 0, crashDuration: 0, crashSeverity: 0, gentle: false, flat: false, recovery: 0, gearOff: false,
      rail: null, railT: 0, railSpin: 0, railSpinVelocity: 0, railSpinTravel: 0, railTime: 0, railSwaps: 0, railHops: 0, railHopTurns: [], railTarget: null, railPresses: 0, railSteer: 0, barSave: null, grind: false,
      pipeAir: false, lastLand: null,
    });
    this.butter.reset();
    this.air.reset();
    this.assist.reset();
  }

  // ---- the snow's slope, as a body stands on it ----
  groundPoseAt(out) {
    return this.pose(this.S.frame(this.x, this.z, this.heading, _f, this.grind), out);
  }
  pose(f, out) { return groundPose(f.slope, this.spin, this.edge, out, f.cross); }

  // into the air: vertical speed vy, horizontal speed, where from ('jump', 'ground', 'rail', 'pipe')
  takeoff(vy, horizontal = this.speed, source = 'jump', q = null) {
    this.railPitchHeld = 0;
    const o = this.landingSettling ? this.q.clone() : q ?? this.groundPoseAt(new THREE.Quaternion());
    const b = this.butter.launch(this, o);
    this.speed = horizontal;
    this.spinReversal = 0; this.flipReversal = 0; this.carveTransfer = 0; this.previousSteer = 0;
    this.airborne = true; this.vy = vy + b.pop; this.airTime = 0; this.spin = 0; this.flip = 0; this.corkSet = false;
    this.air.reset(0, 0, o);
    this.rollVelocity = 0; this.assist.reset(); this.landingSettling = false;
    this.flipVelocity = b.flip; this.flipWindup = 0; this.flipTightness = 0; this.airGrab = 0;
    this.spinVelocity = b.spin; this.spinWindup = 0; this.spinTightness = 0; this.landingPrepare = 0;
    this.velocityZ = this.speed * Math.cos(this.travelHeading);
    this.velocityX = this.speed * Math.sin(this.travelHeading);
    this.grabTime = 0; this.maxAir = 0; this.jumpDistance = 0;
    this.event = 'jump'; this.takeoffKick = 1; this.airSource = source;
    this.rail = null; this.grind = false; this.pipeAir = source === 'pipe';
  }

  // ---- rails ----
  mountRail(R, t, facing, spinVel = 0) {
    this.butter.reset();
    this.landingSettling = false; this.assist.reset();
    const S = this.S, yaw = S.railYaw(R), off = wrap(this.travelHeading - yaw), body = wrap(facing - yaw);
    this.spin = 0; this.spinTightness = 0; this.rail = R; this.railT = clamp(t, 0, 1); this.grind = true; this.airborne = false; this.vy = 0;
    this.railTime = 0; this.railSwaps = 0; this.railHops = 0; this.railHopTurns = []; this.railSpinVelocity = spinVel; this.railTarget = null; this.railPresses = 0;
    this.railSpin = body; this.railSpinTravel = 0; this.switchStance = false; this.skid = 0; this.charge = 0;
    this.speed = Math.max(9, this.speed * Math.max(0.35, Math.cos(off)));
    this.travelHeading = this.heading = yaw;
    this.velocityX = this.speed * Math.sin(yaw); this.velocityZ = this.speed * Math.cos(yaw);
    S.railPoint(R, this.railT, _pt);
    this.x = _pt.x; this.z = _pt.z; this.y = S.railTop(R, this.railT);
    this.event = this.event || 'rail';
  }

  shiftAcross(R, d) {
    const yaw = this.S.railYaw(R);
    this.x += Math.cos(yaw) * d; this.z -= Math.sin(yaw) * d;
  }

  // lining up a rail's run-in, the snow draws you onto it
  funnelToRail(dt, inp) {
    const S = this.S;
    for (const R of S.railsNear(this.z)) {
      if (R.entry !== 'ride') continue;
      S.railProj(R, this.x, this.z, _p);
      const d = _p.t * R.length, run = R.entryRun ?? 8.5, side = _p.side;
      if (d < -run || d >= 0 || Math.abs(side) > FUNNEL_REACH) continue;
      const off = wrap(this.travelHeading - S.railYaw(R));
      if (Math.abs(off) > FUNNEL_ANGLE || this.speed < 4 || inp.steer * Math.sign(side) > 0.3) return;
      const k = smooth((d + run) / run);
      this.shiftAcross(R, -Math.sign(side) * Math.min(Math.abs(side), FUNNEL_PULL * k * this.speed * dt));
      this.travelHeading -= off * (1 - Math.exp(-3 * k * dt));
      return;
    }
  }

  funnelInAir(dt) {
    const S = this.S;
    for (const R of S.railsNear(this.z)) {
      S.railProj(R, this.x, this.z, _p);
      const side = _p.side;
      if (_p.t < -0.02 || _p.t > 1 || Math.abs(side) > AIR_REACH) continue;
      const above = this.y - S.railTop(R, clamp(_p.t, 0, 1));
      if (this.vy >= 0 || above < -0.2 || above > -this.vy * AIR_WINDOW) continue;
      if (Math.abs(wrap(this.travelHeading - S.railYaw(R))) > AIR_ANGLE) continue;
      this.shiftAcross(R, -Math.sign(side) * Math.min(Math.abs(side), AIR_PULL * dt));
      return;
    }
  }

  // coming down on a rail
  landOnRail() {
    const S = this.S;
    if (this.vy >= 0) return false;
    for (const R of S.railsNear(this.z)) {
      S.railProj(R, this.x, this.z, _p);
      const d = _p.t * R.length;
      if (d < 0 || _p.t > 1 || Math.abs(_p.side) > R.width / 2 + 0.5) continue;
      const top = S.railTop(R, _p.t);
      if (this.y > top + 0.05 || this.y < top - 0.75) continue;
      if (this.air.upright < 0.45) { this.landingImpact = Math.max(2, -this.vy); this.beginCrash(this.landingImpact); return true; }
      const facing = this.heading + this.air.bodyHeading + (this.switchStance ? Math.PI : 0), t = _p.t;
      if (this.barSave?.R === R) { this.resumeBar(R, t, facing); return true; }
      const jd = this.jumpDistance, sv = this.spinVelocity;
      this.lastJumpDistance = jd; this.landingImpact = 0; this.landing = 0.6;
      this.event = 'railLand';
      this.mountRail(R, t, facing, sv);
      this.clearAir(1);
      return true;
    }
    return false;
  }

  // a hop off a bar coming back down on it: still the same slide
  resumeBar(R, t, facing) {
    const b = this.barSave, air = this.airTime;
    this.barSave = null;
    const q = Math.round(Math.abs(this.air.spinAngle) / (Math.PI / 2));
    this.mountRail(R, t, facing, this.spinVelocity);
    this.railTime = b.railTime + air; this.railPresses = b.railPresses; this.railSpinTravel = b.railSpinTravel; this.railSwaps = b.railSwaps;
    this.railHops = b.railHops + 1; this.railHopTurns = q > 0 && b.railHopTurns.length < 2 ? [...b.railHopTurns, Math.min(q, 2) * 90] : b.railHopTurns;
    this.landing = 0.3; this.landingImpact = 0; this.event = 'railHopLand';
    this.clearAir(0);
  }

  clearAir(prepare) {
    this.spin = 0; this.flip = 0; this.rollVelocity = 0; this.flipVelocity = 0; this.flipTightness = 0; this.spinVelocity = 0; this.spinTightness = 0;
    this.landingPrepare = prepare;
  }

  slide(dt, inp) {
    const S = this.S, R = this.rail, yaw = S.railYaw(R);
    this.grind = true; this.railTime += dt;
    const t = clamp(this.railT, 0, 1), a = Math.max(0, t - 0.02), b = Math.min(1, t + 0.02);
    const g = (S.railTop(R, b) - S.railTop(R, a)) / ((b - a) * R.length);
    this.speed = Math.max(9, this.speed - (RAIL_G * g) / Math.hypot(1, g) * dt);
    this.railT += (this.speed * dt) / R.length;
    const u = clamp(this.railT, 0, 1);
    S.railPoint(R, u, _pt);
    this.x = _pt.x; this.z = _pt.z; this.y = S.railTop(R, u);
    this.travelHeading = this.heading = yaw;
    this.velocityX = this.speed * Math.sin(yaw); this.velocityZ = this.speed * Math.cos(yaw);
    this.turnRate = 0; this.lateral = 0; this.skid = 0;
    // A/D: a quarter turn a press, two a bar
    const st = Math.abs(inp.steer) > 0.06 ? clamp(inp.steer, -1, 1) : 0, sg = Math.sign(st);
    if (sg && sg !== this.railSteer && this.railPresses < 2) {
      this.railPresses++;
      this.railTarget = (this.railTarget ?? Math.round(this.railSpin / (Math.PI / 2)) * (Math.PI / 2)) + (sg * Math.PI) / 2;
    }
    this.railSteer = sg;
    let d;
    if (this.railTarget !== null) {
      const left = this.railTarget - this.railSpin;
      d = Math.sign(left) * Math.min(Math.abs(left), RAIL_SPIN * dt);
      this.railSpinVelocity = d / dt;
      if (Math.abs(left - d) < 1e-6) { this.railTarget = null; this.railSpinVelocity = 0; }
    } else { this.railSpinVelocity = damp(this.railSpinVelocity, 0, 1.65, dt); d = this.railSpinVelocity * dt; }
    this.railSpin += d; this.railSpinTravel += Math.abs(d);
    if (this.railTarget === null && Math.abs(this.railSpinVelocity) < 0.45) {
      this.railSpin = damp(this.railSpin, Math.round(this.railSpin / (Math.PI / 2)) * (Math.PI / 2), 4.8, dt);
    }
    const swaps = Math.floor((this.railSpinTravel + 0.12) / (Math.PI / 2));
    if (swaps > this.railSwaps) { this.railSwaps = Math.min(swaps, 2); this.event = 'railSwap'; }
    if (inp.jump) this.charge = Math.min(1, this.charge + dt * 1.7);
    if (!inp.jump && this.jumpHeld) this.dismount(4.6 + this.charge * 3.4, true, inp);
    else if (this.railT >= 1) this.dismount(0.5, false, inp);
  }

  dismount(pop, popped, inp) {
    const S = this.S, R = this.rail, sp = this.railSpin, sv = this.railSpinVelocity, t = clamp(this.railT, 0, 1);
    const a = Math.max(0, t - 0.02), b = Math.min(1, t + 0.02);
    const g = (S.railTop(R, b) - S.railTop(R, a)) / ((b - a) * R.length);
    this.barSave = { R, railTime: this.railTime, railSwaps: this.railSwaps, railSpinTravel: this.railSpinTravel, railPresses: this.railPresses, railHops: this.railHops, railHopTurns: this.railHopTurns };
    this.railEnd = { R, popped, time: this.railTime, swaps: this.railSwaps, hops: this.railHops, hopTurns: this.railHopTurns, t };
    this.rail = null; this.grind = false;
    const q = groundPose(g, sp, 0, new THREE.Quaternion());
    this.takeoff(this.speed * g + pop, this.speed, 'rail', q);
    this.air.reset(0, sp, q);
    this.spinVelocity = sv; this.charge = 0;
    this.event = 'railOff';
    if (!popped) this.railPitchHeld = Number(inp.forward) | (Number(inp.brake) << 1);
  }

  // ---- crashes: the body goes down on its own (ragbody.js) for as long as the fall lasts ----
  beginCrash(impact, flat = false, kind) {
    if (this.crashTime > 0) return;
    this.gearOff = false; this.landingSettling = false; this.assist.reset(); this.recoveryPushTime = 0;
    const above = Math.max(0, this.y - this.S.h(this.x, this.z));
    this.crashSeverity = clamp(kind ? (impact / 42) * 0.8 + (above / 45) * 0.2 : (this.speed / 43) * 0.35 + (impact / 42) * 0.45 + (this.maxAir / 45) * 0.2, 0.12, 1);
    this.gentle = kind ? kind === 'fall' : !flat && impact < 16 && this.maxAir < 5.5 && this.speed < 27;
    this.flat = flat;
    this.crashDuration = this.gentle ? 0.8 + this.crashSeverity * 0.4 : 1.35 + this.crashSeverity * 1.35;
    this.crashTime = this.crashDuration; this.recovery = 0;
    this.body.start(this.x, this.y, this.z, this.heading, this.velocityX, this.velocityZ, impact, this.spinVelocity, this.q, this.switchStance ? Math.PI : 0, flat, this.gentle);
    this.airborne = false; this.landing = 0; this.landingBoost = 0; this.event = 'crash'; this.rail = null; this.grind = false;
  }

  // a step of the fall; when the clock runs out the rider is back up, sliding the way the body was
  stepCrash(dt) {
    const B = this.body, S = this.S;
    this.crashTime = Math.max(0, this.crashTime - dt);
    this.recovery = 1 - clamp(this.crashTime / (B.gentle ? 0.45 : 0.6), 0, 1);
    B.update(dt, this.crashTime < (B.gentle ? 0.55 : 0.75));
    this.gearOff = this.crashTime > 0 && B.shedsEquipment;
    const hip = B.nodes.Hips.p, z = clamp(hip.z, S.zMin ?? -Infinity, S.zMax ?? Infinity), c = S.center(z), x = clamp(hip.x, c - BODY_BOUNDS, c + BODY_BOUNDS);
    B.translate(x - hip.x, z - hip.z);
    this.x = x; this.z = z; this.y = S.h(x, z);
    this.velocityX = B.velocity.x; this.velocityZ = B.velocity.z;
    this.speed = Math.min(this.vmax, Math.hypot(this.velocityX, this.velocityZ));
    if (this.speed > 1.5) this.travelHeading = Math.atan2(this.velocityX, this.velocityZ);
    if (this.crashTime === 0) this.getUp(this.x, this.z, this.travelHeading, this.speed);
  }

  // back up after a crash, moving heading at speed, the first pole push ready
  getUp(x, z, heading, speed) {
    const gentle = this.body.gentle;
    this.place(x, z, heading, clamp(speed, 4, gentle ? 32 : 23));
    this.crouch = 0.5; this.recoveryPushTime = 6;
  }

  // something solid: the normal (nx, nz) out of it, how hard it was hit, at what speed in all.
  // Returns true if it put the rider down
  bump(nx, nz, impact, total, ridden = false) {
    const cls = hitClass(impact, total);
    if (cls === 'fall' || cls === 'crash') { this.landingImpact = impact; this.beginCrash(impact, false, cls); return true; }
    this.speed = Math.hypot(this.velocityX, this.velocityZ);
    if (this.speed > 0.1) this.travelHeading = Math.atan2(this.velocityX, this.velocityZ);
    if (cls === 'balance' && (ridden || !this.airborne)) {
      const c = Math.cos(this.heading), s = Math.sin(this.heading);
      this.landingSpin = clamp(((nx * c - nz * s) * impact) / 16, -0.8, 0.8);
      this.landingFlip = clamp((-(nx * s + nz * c) * impact) / 20, -0.6, 0.6);
    }
    return false;
  }

  // ---- the halfpipe's walls: the velocity stays on the wall, turned by the edge ----
  stepWall(dt, braking) {
    const S = this.S, g = S.gradXZ(this.x, this.z), il = 1 / Math.hypot(g.x, 1, g.z);
    const nx = -g.x * il, ny = il, nz = -g.z * il;
    let u = this.velocityX, d = this.velocityZ;
    if (Math.hypot(u, d) < 0.01) { u = Math.sin(this.travelHeading); d = Math.cos(this.travelHeading); }
    const g0 = S.gradXZ(this.x - u * dt, this.z - d * dt);
    let p = g0.x * u + g0.z * d;
    const m = u * nx + p * ny + d * nz;
    u -= nx * m; p -= ny * m; d -= nz * m;
    const k = this.speed / Math.max(0.001, Math.hypot(u, p, d));
    u *= k; p *= k; d *= k;
    const w = this.edge * (0.8 + clamp(this.speed / 85, 0, 0.44)) * (1 + this.carveTransfer * 0.14) * (braking ? 0.7 : 1), a = w * dt;
    const c = Math.cos(a), s = Math.sin(a);
    const b = u * c + (ny * d - nz * p) * s, e = p * c + (nz * u - nx * d) * s, f = d * c + (nx * p - ny * u) * s;
    // gravity along the wall, less of it across the pipe than down its fall
    let ax = SLOPE_G * ny * nx, ay = SLOPE_G * (ny * ny - 1), az = SLOPE_G * ny * nz;
    const lx = -nz * nx, ly = -nz * ny, lz = 1 - nz * nz, ll = Math.hypot(lx, ly, lz) || 1, along = (ax * lx + ay * ly + az * lz) / (ll * ll);
    ax = lx * along + (ax - lx * along) * PIPE_GRAVITY_KEEP; ay = ly * along + (ay - ly * along) * PIPE_GRAVITY_KEEP; az = lz * along + (az - lz * along) * PIPE_GRAVITY_KEEP;
    u = b + ax * dt; p = e + ay * dt; d = f + az * dt;
    const mag = Math.hypot(u, p, d), kk = this.tucking ? K_TUCK : K_RIDE;
    const next = clamp(mag - (ROLL + kk * this.speed * this.speed + Math.abs(this.edge) * EDGE_DRAG + (braking ? BRAKE : 0)) * dt, 0, this.vmax), r = next / Math.max(0.001, mag);
    this.velocityX = u * r; this.velocityZ = d * r; this.speed = next;
    this.travelHeading = Math.atan2(u, d); this.turnRate = w;
    this.lateral = this.edge * this.speed * 0.35 + this.skid * this.speed * 0.1;
  }

  pole(forwardOnly, dt) {
    if (forwardOnly) {
      const p0 = this.polePhase;
      this.polePhase = (p0 + dt / 0.95) % 1;
      if (p0 < 0.34 && this.polePhase >= 0.34) {
        const e = Math.cos(this.travelHeading) < 0 ? 1 - smooth((this.poleProgressZ - this.z - 8) / 8) : 1;
        this.speed = Math.min(this.vmax, this.speed + e * 1.65 * clamp(1 - this.speed / 52, 0.25, 1));
        if (this.recoveryPushTime > 0) this.speed += e * Math.min(3, Math.max(0, 13 - this.speed));
        this.recoveryPushTime = 0;
      }
    } else if (this.poling < 0.02) this.polePhase = 0;
  }

  // ---- one step ----
  update(dt, t) {
    const S = this.S;
    this.board = !!t.board; this.event = ''; this.railEnd = null; this.lastLand = null;
    if (!this.airborne && !this.grind) this.barSave = null;
    if (!this.grind) this.railSteer = Math.abs(t.steer) > 0.06 ? Math.sign(t.steer) : 0;
    this.landing = Math.max(0, this.landing - dt * 3.4);
    this.landingBoost = Math.max(0, this.landingBoost - dt);
    this.takeoffKick = Math.max(0, this.takeoffKick - dt * 4);
    this.railPitchHeld &= Number(t.forward) | (Number(t.brake) << 1);
    this.poleProgressZ = Math.max(this.poleProgressZ, this.z);
    if (this.crashTime <= 0) this.gearOff = false;
    if (this.crashTime > 0) { this.butter.reset(); this.stepCrash(dt); return; }
    this.recoveryPushTime = this.speed >= 18 ? 0 : Math.max(0, this.recoveryPushTime - dt);
    const wasAir = this.airborne;
    this.landingSpin = damp(this.landingSpin, 0, 5, dt);
    this.landingFlip = damp(this.landingFlip, 0, 5, dt);
    const buttering = this.butter.step(this, t, dt, !this.airborne && (t.butter || this.butter.active) ? S.grade(this.x, this.z, this.travelHeading) : 0);
    if (this.butter.ready && !this.rail) this.butter.rideOut(this);
    const free = !buttering && !this.airborne && !this.rail;
    const braking = free && !!t.brake;
    this.forwardHeld = free && t.forward && !braking ? this.forwardHeld + dt : 0;
    this.tucking = free && !!t.forward && !braking && (this.switchStance || this.forwardHeld >= TUCK_TIME || this.speed >= TUCK_SPEED);
    this.crouch = damp(this.crouch, !this.airborne && (this.tucking || t.jump) ? 1 : 0, 9, dt);
    if (Math.abs(t.steer) > 0.15) this.skidSide = Math.sign(t.steer);
    this.skid = damp(this.skid, braking ? this.skidSide * clamp(this.speed / 9, 0, 1) : 0, 7, dt);
    const st = !buttering && Math.abs(t.steer) > 0.05 ? clamp(t.steer, -1, 1) : 0;
    this.carveTransfer *= Math.exp(-6 * dt);
    if (!this.airborne && !braking && this.previousSteer * st < 0) this.carveTransfer = Math.abs(this.edge) * clamp(this.speed / 18, 0, 1);
    this.previousSteer = this.airborne || (!st && Math.abs(this.edge) < 0.1) ? 0 : st || this.previousSteer;
    const slow = clamp(13 / Math.max(this.speed, 1), 0.45, 1), rate = st ? (11 + this.carveTransfer * 11) * slow : 9, settled = smooth((1 - this.landing) / 0.68);
    this.edge = damp(this.edge, !this.airborne && !this.rail ? st * settled : 0, rate, dt);
    const poling = free && !!t.forward && !this.switchStance && !this.tucking && !braking && !t.jump;
    this.poling = damp(this.poling, +poling, 12, dt);

    if (this.airborne) {
      const k = Math.exp(-0.003 * dt);
      this.velocityX *= k; this.velocityZ *= k;
      this.speed = Math.hypot(this.velocityX, this.velocityZ);
      this.travelHeading = Math.atan2(this.velocityX, this.velocityZ);
      this.turnRate = 0; this.lateral = 0;
    } else {
      if (this.landingSettling && !this.rail && !buttering) {
        this.spinVelocity += (-100 * this.spin - 20 * this.spinVelocity) * dt;
        this.spin += this.spinVelocity * dt;
      }
      if (!buttering) { this.spinWindup = damp(this.spinWindup, 0, 10, dt); this.spinTightness = damp(this.spinTightness, 0, 14, dt); }
      this.landingPrepare = this.butter.active ? -1 : 0;
      if (S.onWall?.(this.x, this.z)) {
        this.stepWall(dt, braking);
        const s0 = this.speed;
        this.pole(poling, dt);
        const r = s0 > 0.001 ? this.speed / s0 : 1;
        this.velocityX *= r; this.velocityZ *= r;
      } else {
        const deep = S.deep(this.x, this.z);
        const w = this.edge * (0.8 + clamp(this.speed / 85, 0, 0.44)) * (1 + this.carveTransfer * 0.14) * (braking ? 0.7 : 1);
        this.turnRate = this.rail ? 0 : w;
        this.travelHeading += this.turnRate * dt;
        if (buttering) this.travelHeading += this.butter.pull(S.grade(this.x, this.z, this.travelHeading + Math.PI / 2), this.speed) * dt;
        let rise = S.grade(this.x, this.z, this.travelHeading);
        // (coming up to a rim the slope pulling you isn't the drop past it: it's the snow before it)
        if (this.walls && rise < -1) {
          const e = snowEdge(S.h, this, { x: this.x + Math.sin(this.travelHeading) * 0.5, y: this.y, z: this.z + Math.cos(this.travelHeading) * 0.5 });
          if (e) rise = e.grade;
        }
        const drag = (this.tucking ? K_TUCK : K_RIDE) * (deep ? DEEP : 1);
        const acc = SLOPE_G * Math.sin(Math.atan(-rise)) - ROLL - drag * this.speed * this.speed - Math.abs(this.edge) * EDGE_DRAG;
        if (!this.rail) this.speed = clamp(this.speed + (acc - (braking ? BRAKE : 0)) * dt, 0, this.vmax);
        this.pole(poling, dt);
        const u = this.skid * this.speed * 0.1, d = this.speed / Math.hypot(1, rise);
        this.velocityZ = d * Math.cos(this.travelHeading) - u * Math.sin(this.travelHeading);
        this.velocityX = d * Math.sin(this.travelHeading) + u * Math.cos(this.travelHeading);
        this.lateral = this.edge * this.speed * 0.35 + u;
      }
    }

    // (the frame the body turns in follows the line, in the air too; a pipe's air keeps its own)
    if (!this.pipeAir) this.heading += wrap(this.travelHeading + this.skid * 0.72 - this.heading) * (1 - Math.exp(-12 * dt));
    const x0 = this.x, z0 = this.z, M = this.moveFrom;
    M.x = this.x; M.y = this.y; M.z = this.z;
    this.x += this.velocityX * dt; this.z += this.velocityZ * dt;
    if (S.zMin != null) this.z = Math.max(S.zMin, this.z);
    const c = S.center(this.z);
    const bounds = S.bounds ?? BOUNDS;
    if (Math.abs(this.x - c) > bounds) {
      const sg = Math.sign(this.x - c);
      this.x = c + sg * bounds;
      const out = this.velocityX - S.centerSlope(this.z) * this.velocityZ;
      if (sg * out > 0) { this.velocityX -= out; this.speed *= Math.exp(-dt * 2.8); }
    }
    if (!this.airborne && !this.rail) this.funnelToRail(dt, t);
    if (!this.airborne && this.hitWall()) return;
    if (!this.airborne && !this.rail) {
      for (const R of S.railsNear(this.z)) {
        S.railProj(R, this.x, this.z, _p);
        if (_p.t >= 0 && _p.t <= 1 && Math.abs(_p.side) < R.width / 2 + 0.35 && this.y >= S.railTop(R, _p.t) - 0.4) {
          this.mountRail(R, _p.t, this.heading + this.spin + (this.switchStance ? Math.PI : 0), this.spinVelocity);
          break;
        }
      }
    }
    if (this.rail) this.slide(dt, t);
    else if (!this.airborne) this.groundEvents(z0, x0, t, dt);
    if (this.crashTime > 0) return;
    if (this.airborne) this.stepAir(dt, t, !wasAir);
    if (!this.airborne && !wasAir && this.landingSettling && !this.grind && this.crashTime <= 0) {
      const f = S.grade(this.x, this.z, this.heading), g = S.grade(this.x, this.z, this.heading + Math.PI / 2);
      groundPose(f, this.spin, this.edge, this.groundTarget, g);
      const a = angleBetween(this.q, this.groundTarget);
      if (a > 1e-6) this.q.rotateTowards(this.groundTarget, Math.min(8 * dt, a * (1 - Math.exp(-18 * dt))));
      if (a < 0.035 && Math.abs(this.spin) < 0.002 && Math.abs(this.spinVelocity) < 0.02) { this.landingSettling = false; this.spin = 0; this.spinVelocity = 0; }
    }
    this.jumpHeld = !!t.jump;
  }

  // ran into a wall of snow this step: put back clear of it with what went into it taken off, or
  // down if it was hard enough. True if it put the rider down
  hitWall() {
    if (!this.walls || this.rail || this.crashTime > 0) return false;
    const S = this.S, w = wallHit(S.h, this.moveFrom, this) ?? (this.airborne && this.vy < 0 ? wallHit(S.h, this, this) : null);
    if (!w) return false;
    const total = Math.hypot(this.velocityX, this.velocityZ), into = Math.max(0, -this.velocityX * w.nx - this.velocityZ * w.nz);
    this.x = w.x; this.z = w.z;
    if (!this.airborne) this.y = S.h(this.x, this.z);
    this.velocityX += w.nx * into; this.velocityZ += w.nz * into;
    return this.bump(w.nx, w.nz, into, total, true);
  }

  // rode off the rim of a form: into the air at the grade of the snow it left
  leaveEdge(t) {
    if (!this.walls) return false;
    const S = this.S, M = this.moveFrom, e = snowEdge(S.h, M, this);
    if (!e) return false;
    const v = Math.hypot(this.velocityX, this.velocityZ), c = Math.cos(this.heading), s = Math.sin(this.heading);
    this.y = M.y;
    this.takeoff(e.grade * v, v, 'ground', groundPose(e.dx * s + e.dz * c, this.spin, this.edge, new THREE.Quaternion(), e.dx * c - e.dz * s));
    this.takeoffKick = 0; this.railPitchHeld = Number(t.forward) | (Number(t.brake) << 1); this.charge = 0;
    return true;
  }

  // on the snow, this step: a kicker's lip, the pipe's lip, or a pop
  groundEvents(z0, x0, t, dt) {
    const S = this.S;
    for (const J of S.kickersNear(this.z)) {
      const kc = S.kickerCenter(J, this.z);
      if (z0 <= J.z && this.z > J.z && Math.abs(this.x - kc) < J.width / 2 + 1 && this.speed > 7) {
        const px = Math.max(kc - J.width / 2 + 0.6, Math.min(kc + J.width / 2 - 0.6, this.x));
        if (this.y < S.h(px, J.z - 0.01) - 1) continue;
        const a = Math.atan(Math.tan((J.lipAngle * Math.PI) / 180) * Math.max(0.2, Math.cos(this.travelHeading))), kick = 1.2 + clamp(this.charge, 0, 1) * 2.2;
        const f = S.frame(px, J.z - 0.01, this.heading, _f);
        const q = groundPose(f.slope, this.spin, this.edge, new THREE.Quaternion(), f.cross);
        this.y = S.h(this.x, J.z - 0.01);
        // (the lip's kick goes square to it; surface.classic: straight up instead)
        if (S.classic) this.takeoff(this.speed * Math.sin(a) + kick, this.speed * Math.cos(a), 'jump', q);
        else this.takeoff(this.speed * Math.sin(a) + kick * Math.cos(a), this.speed * Math.cos(a) - kick * Math.sin(a), 'jump', q);
        this.velocityX += (J.transfer ?? 0) * 0.22;
        this.charge = 0;
        break;
      }
    }
    if (this.airborne) return;
    if (S.pipeLip) {
      const L = S.pipeLip(this, x0, z0);
      if (L) {
        this.x = L.x; this.y = L.y; this.z = L.z;
        const c = Math.cos(this.heading), s = Math.sin(this.heading);
        const q = groundPose(L.gx * s + L.gz * c, this.spin, this.edge, new THREE.Quaternion(), L.gx * c - L.gz * s);
        this.takeoff(L.vertical, Math.hypot(L.vx, L.vz), 'pipe', q);
        this.velocityX = L.vx; this.velocityZ = L.vz;
        this.travelHeading = Math.atan2(L.vx, L.vz);
        this.charge = 0;
        return;
      }
    }
    // a drop: a ledge the map marks as one lets go of you
    const drop = S.dropAt?.(this, x0, z0);
    if (drop) { this.takeoff(drop.vertical, this.speed, 'ground'); this.takeoffKick = 0; this.railPitchHeld = Number(t.forward) | (Number(t.brake) << 1); this.charge = 0; return; }
    if (this.leaveEdge(t)) return;
    this.y = S.h(this.x, this.z);
    if (t.jump) this.charge = Math.min(1, this.charge + dt * 1.7);
    if (!t.jump && this.jumpHeld) {
      // the pop: off the snow square to it, harder the longer it was loaded; on a kicker's run-in
      // it's only the lip's little kick
      const f = S.frame(this.x, this.z, 0, _f), run = S.onRunIn(this.x, this.z);
      if (S.classic) {
        // (surface.classic: the pop only lifts, and the same whatever you're on)
        const lift = (3.6 + clamp(this.charge, 0, 1) * 2.6) / Math.hypot(f.cross, 1, f.slope);
        this.takeoff(this.popRise(f.cross * this.velocityX + f.slope * this.velocityZ, Math.hypot(this.velocityX, this.velocityZ)) + lift, this.speed, 'ground');
        this.charge = 0;
        return;
      }
      const l = (run ? 1.2 + clamp(this.charge, 0, 1) * 2.2 : 3.6 + clamp(this.charge, 0, 1) * 2.6) / Math.hypot(f.cross, 1, f.slope);
      const u = f.cross * this.velocityX + f.slope * this.velocityZ;
      const vx = this.velocityX - f.cross * l, vz = this.velocityZ - f.slope * l;
      this.takeoff(u + l, Math.hypot(vx, vz), 'ground');
      this.velocityX = vx; this.velocityZ = vz;
      this.travelHeading = Math.atan2(vx, vz);
      this.charge = 0;
    }
  }

  // how much of the snow's own rise a pop keeps (rise u at speed r): a little, unless you're on a
  // kicker's ramp or the run-in to a rail; beside a ramp, no more than the ramp's own
  popRise(u, r) {
    const S = this.S, most = r * POP_RISE;
    if (u <= most) return u;
    let beside = null;
    for (const J of S.kickersNear(this.z)) {
      if (this.z < J.z - J.run || this.z > J.z) continue;
      const c = S.kickerCenter(J, this.z), d = Math.abs(this.x - c);
      if (d > J.width / 2 + 1) continue;
      if (d <= J.width / 2) return u;
      beside = c;
      break;
    }
    for (const R of S.railsNear(this.z)) {
      S.railProj(R, this.x, this.z, _p);
      const d = _p.t * R.length;
      if (d >= -(R.entryRun ?? 8.5) && d <= 0 && Math.abs(_p.side) < 1.6) return u;
    }
    if (beside === null) return most;
    const f = S.frame(beside, this.z, 0, _f2), o = S.centerSlope(this.z);
    return Math.min(u, r * Math.max(POP_RISE, (f.cross * o + f.slope) / Math.hypot(o, 1)));
  }

  stepAir(dt, t, first) {
    const S = this.S, air = this.air;
    if (!first) { this.vy -= AIR_G * dt; this.y += this.vy * dt; this.airTime += dt; this.jumpDistance += Math.hypot(this.velocityX, this.velocityZ) * dt; }
    if (this.hitWall()) return;
    if (!first) {
      const k = kickerSweep(S.h, S.kickersNear(this.z), this.moveFrom, this);
      if (k) { this.x = k.x; this.y = k.y; this.z = k.z; }
    }
    const gy = S.h(this.x, this.z);
    let slope, cross;
    if (this.y <= gy) { const f = S.frame(this.x, this.z, 0, _f2); slope = f.slope; cross = f.cross; }
    else { slope = S.h(this.x, this.z + 0.5) - S.h(this.x, this.z - 0.5); cross = S.h(this.x + 0.5, this.z) - S.h(this.x - 0.5, this.z); }
    const lv = slope * this.velocityZ + cross * this.velocityX, closing = lv - this.vy, tLand = closing > 0.1 ? Math.max(0, this.y - gy) / closing : Infinity;
    this.landingPrepare = damp(Math.max(0, this.landingPrepare), 1 - smooth((tLand - 0.1) / 0.45), 14, dt);
    const f = Math.abs(t.steer) > 0.06 ? clamp(t.steer, -1, 1) : 0;
    const p = Number(t.forward && !(this.railPitchHeld & 1)) - Number(t.brake && !(this.railPitchHeld & 2));
    air.controlPitch(p, this.switchStance && !t.board, this.flipVelocity, this.rollVelocity);
    const m = Math.abs(t.airRoll ?? 0) > 0.06 ? clamp(t.airRoll ?? 0, -1, 1) : 0;
    this.spinTightness = damp(this.spinTightness, Math.abs(f), f ? 12 : 10, dt);
    this.airGrab = damp(this.airGrab, +!!t.grab, 12, dt);
    const h = mix(SPIN0, mix(SPIN1, SPIN_GRAB, this.airGrab), this.spinTightness), gs = f * h, gf = p * h;
    this.spinReversal = f * this.spinVelocity < 0 ? 0.12 : Math.max(0, this.spinReversal - dt);
    if (!p || Math.sign(p) !== this.flipReversal) this.flipReversal = 0;
    if (p * this.flipVelocity < -0.12) this.flipReversal = Math.sign(p);
    if (Math.abs(gf - this.flipVelocity) < h * 0.05) this.flipReversal = 0;
    this.spinVelocity = toward(this.spinVelocity, gs, dt, this.spinReversal > 0 || this.flipReversal !== 0, this.flipReversal ? 3.2 : 28);
    this.flipVelocity = toward(this.flipVelocity, gf, dt, this.flipReversal !== 0, 3.2);
    this.rollVelocity = toward(this.rollVelocity, m * h, dt, m * this.rollVelocity < 0, 5);
    if (this.flipReversal) this.spinVelocity = Math.sign(this.spinVelocity) * Math.min(Math.abs(this.spinVelocity), Math.abs(this.flipVelocity));
    const sw = this.flipReversal ? clamp(this.spinVelocity / h, -1, 1) : f;
    this.spinWindup = damp(this.spinWindup, sw, f ? 17 : 8, dt);
    const fw = this.flipReversal ? clamp(this.flipVelocity / h, -1, 1) : p;
    this.flipWindup = damp(this.flipWindup, fw, p ? 24 : 9, dt);
    this.flipTightness = damp(this.flipTightness, Math.abs(fw), p ? 14 : 10, dt);
    if (!p && Math.abs(this.flipVelocity) < 0.015) this.flipVelocity = 0;
    if (!f && Math.abs(this.spinVelocity) < 0.015) this.spinVelocity = 0;
    this.spin += this.spinVelocity * dt; this.flip += this.flipVelocity * dt;
    if (!m && Math.abs(this.rollVelocity) < 0.015) this.rollVelocity = 0;
    if (t.cork && this.airTime <= 0.25) this.corkSet = true;
    const ck = !!t.cork && this.corkSet;
    this.corked = ck;
    air.update(this.flipVelocity, this.spinVelocity, dt, ck, this.rollVelocity, !!t.over && ck);
    const held = !!(f || p || m || t.grab);
    const fH = cross * Math.sin(this.heading) + slope * Math.cos(this.heading), cH = cross * Math.cos(this.heading) - slope * Math.sin(this.heading);
    let overRail = false;
    if (!held) {
      for (const R of S.railsNear(this.z)) {
        for (const k of [0, 0.25, 0.5, 0.75]) {
          S.railProj(R, this.x + this.velocityX * k, this.z + this.velocityZ * k, _p);
          if (_p.t >= 0 && _p.t <= 1 && Math.abs(_p.side) < R.width / 2 + 0.7 && this.y >= S.railTop(R, _p.t) - 0.1) { overRail = true; break; }
        }
        if (overRail) break;
      }
    }
    const carry = Math.abs(this.flipVelocity) < 0.1 && Math.abs(this.rollVelocity) < 0.1 ? this.spinVelocity / SPIN_DOWN : 0;
    const flat = air.upright > 0.64 && Math.abs(air.flipAngle) < 0.5 && air.inversions === 0 && !air.corked && !p && !m && !t.cork && Math.abs(this.flipVelocity) < 0.1 && Math.abs(this.rollVelocity) < 0.1 && !overRail;
    const grabFlat = !!t.grab && flat, keys = !!(f || p || m);
    const yaw = air.bodyHeading;
    const E = this.assist.update(dt, this.q, yaw, overRail ? 0 : fH, tLand, air.speed, keys || (t.grab && !grabFlat) || (this.airTime < 0.22 && this.vy > 0), overRail, overRail ? 0 : cH, carry, grabFlat);
    air.correct(E);
    if (flat && (Math.abs(this.spinVelocity) > 0.5 || f) && E.x === 0 && E.y === 0 && E.z === 0) {
      const near = Number.isFinite(tLand) ? Math.max(0, Math.min(1, (1.5 - tLand) / 1.2)) : 0;
      air.correct(this.level.update(dt, this.q, air.bodyHeading, this.airTime, overRail ? 0 : fH, overRail ? 0 : cH, near));
    }
    if (t.grab) this.grabTime += dt;
    this.maxAir = Math.max(this.maxAir, this.y - S.h(this.x, this.z));
    if (!first) this.funnelInAir(dt);
    if (!first && this.landOnRail()) return;
    if (first || this.y > gy) return;
    this.touchDown(gy, lv, slope, cross);
  }

  // down on the snow: up to ~75 degrees off the landing's up and it holds; sideways never takes
  // you down, only costs a little speed
  touchDown(gy, lv, slope, cross) {
    const air = this.air, wall = !!this.S.onWall?.(this.x, this.z);
    this.landingImpact = Math.max(0, lv - this.vy) / Math.hypot(1, cross, slope);
    this.y = gy; this.airborne = false; this.landing = 1; this.lastJumpDistance = this.jumpDistance;
    const yaw = air.bodyHeading, ch = Math.cos(this.heading), sh = Math.sin(this.heading);
    const side = Math.abs(Math.sin(wall ? this.wallYaw(cross, slope) : yaw));
    this.landingNormal.set(-cross * ch + slope * sh, 1, -cross * sh - slope * ch).normalize();
    const up = this.landingUp.set(0, 1, 0).applyQuaternion(this.q).dot(this.landingNormal), tilt = Math.acos(clamp(up, -1, 1));
    const caught = this.butter.catchLanding(this, this.q, this.landingNormal);
    const bail = !caught && up < 0.25 && (up < 0 || this.landingImpact > 3 || this.airTime > 0.3);
    const flat = this.landingImpact > 33 && this.airTime > 0.35;
    const press = bail || flat ? null : this.butter.landingFor(this);
    const ok = !bail && !flat && press !== 'faceplant';
    const carry = Math.abs(this.flipVelocity) < 0.1 && Math.abs(this.rollVelocity) < 0.1 ? this.spinVelocity / SPIN_DOWN : 0;
    let info = { ok, impact: this.landingImpact, tilt, side, airTime: this.airTime, maxAir: this.maxAir, spinAngle: air.spinAngle, flipAngle: air.flipAngle, inversions: air.inversions, corked: air.corked, rail: false, faceplant: press === 'faceplant', flat };
    let pressed = false;
    if (ok) {
      const halves = Math.round((yaw + carry) / Math.PI);
      const switchOut = Math.abs(halves) % 2 === 1;
      if (switchOut) { this.switchStance = !this.switchStance; this.q.multiply(this.stanceTurn.set(0, 1, 0, 0)); }
      const sketchy = side >= 0.3 || offLanding(this.q, this.landingNormal);
      const stomp = !sketchy && this.airTime > 0.65;
      const boost = stomp && this.speed > 3 && this.velocityZ > 0.5 && lv < -0.15;
      // (what carries is the speed along the landing; surface.classic: the speed you came in with)
      const along = this.S.classic ? this.speed : Math.max(0, (this.speed * this.speed + this.vy * lv) / (Math.hypot(this.speed, lv) || 1));
      this.speed = clamp(along * (stomp ? 1 : 0.975 - side * 0.065 - clamp(tilt, 0, 1) * 0.045) + (boost ? 2.6 : 0), 0, this.vmax);
      this.landingBoost = boost ? 2.2 : 0;
      if (wall) this.landOnWall(cross, slope, stomp && lv < -0.15);
      this.spin = wrap(yaw - halves * Math.PI);
      this.landingSpin = this.spin;
      this.landingFlip = tilt * (Math.sign(this.landingUp.z) || 1);
      pressed = press === 'press' && this.butter.pressLanding(this, this.landingImpact);
      this.spinVelocity = pressed ? this.butter.velocity : clamp(this.spinVelocity, -3, 3);
      this.landingSettling = !pressed;
      if (pressed) this.butter.pose(this);
      this.event = 'land';
      Object.assign(info, { sketchy, stomp, boost: boost ? 2.6 : 0, switchOut, pressed });
    } else if (press === 'faceplant') { faceplantTilt(this.q); this.beginCrash(this.landingImpact); } else this.beginCrash(this.landingImpact, flat && !bail);
    this.lastLand = info;
    this.vy = 0; this.flip = 0; this.rollVelocity = 0; this.flipVelocity = 0; this.flipTightness = 0; this.spinTightness = 0; this.landingPrepare = 1;
  }

  // the velocity put back on the wall (keeping what's along it)
  landOnWall(cross, slope, kick) {
    const r = Math.hypot(cross, 1, slope), nx = -cross / r, ny = 1 / r, nz = -slope / r;
    const c = Math.min(0, this.velocityX * nx + this.vy * ny + this.velocityZ * nz);
    const vx = this.velocityX - nx * c, vy = this.vy - ny * c, vz = this.velocityZ - nz * c, sp = Math.hypot(vx, vy, vz);
    const k = Math.min(1 + (kick ? 2.6 : 0) / Math.max(0.001, sp), this.vmax / Math.max(0.001, sp));
    this.velocityX = vx * k; this.velocityZ = vz * k; this.speed = sp * k;
    this.travelHeading = Math.atan2(this.velocityX, this.velocityZ);
    this.landingBoost = kick ? 2.2 : 0;
  }

  // how far the nose is off the way the wall will take you (0 riding it forward or fakie)
  wallYaw(cross, slope) {
    const r = Math.hypot(cross, 1, slope); _n.set(-cross / r, 1 / r, -slope / r);
    _v.set(0, 0, 1).applyQuaternion(this.q);
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    _v.set(_v.x * c + _v.z * s, _v.y, _v.z * c - _v.x * s);
    _v.addScaledVector(_n, -_v.dot(_n));
    const fall = _y.set(0, -1, 0).addScaledVector(_n, _n.y).normalize();
    const f = _v.dot(fall);
    const a = Math.atan2(_v.clone().cross(fall).length(), f);
    const out = a <= Math.PI / 2 ? 0 : a - Math.PI / 2 < Math.PI - a ? a - Math.PI / 2 : a - Math.PI;
    _y.set(0, 1, 0);
    return out;
  }
}
