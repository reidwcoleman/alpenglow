// A rider on the mountain: the physics (RideSim, the same for the player and every computer rider)
// and all that hangs off it in the world: the body drawn, the tracks, nets and trees, what the
// game hears about (takeoffs, landings, rails, crashes).
import * as THREE from 'three';
import { heightAt, normalAt, centerX, halfWidth, centerSlope, surfaceAt, FINISH_Z } from './course.js';
import { RideSim } from './ridesim.js';
import { mountain } from './surface.js';
import { SkierModel, BOARD_NAME } from './skiermodel.js';
import { clamp, smoothstep } from './noise.js';

const GRAV = 9.81;
const UP = new THREE.Vector3(0, 1, 0);
const BLOB = {}; const _bn = new THREE.Vector3(), _bq = new THREE.Quaternion();
const _n = new THREE.Vector3(), _f = new THREE.Vector3();
const _t = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const near = [];

export function wrapAngle(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

const EDGE_MAX = 1.15; // how far the skis tip over at full edge, drawn
const TAU = Math.PI * 2;
const ease = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export class Skier {
  // how far off another rider is still drawn (the phone settings draw less)
  static drawDist = 1400;
  // and from how far that's the shared simple figure (FarRiders)
  static farDist = 200;

  constructor(world, opts) {
    this.world = world;
    this.name = opts.name ?? 'Skier';
    this.isPlayer = !!opts.isPlayer;
    this.board = !!opts.outfit?.board; // a snowboard instead of skis
    this.model = new SkierModel(opts.outfit, opts.bib ?? 0);
    world.scene.add(this.model.group);
    this.sim = new RideSim(mountain);
    this.inp = { steer: 0, forward: false, brake: false, jump: false, grab: false, board: this.board, airRoll: 0, cork: false, over: false, butter: false };
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0; this.avgHeading = 0; this.edge = 0;
    this.normal = new THREE.Vector3(0, 1, 0);
    this.controls = { steer: 0, tuck: 0, brake: 0, jump: false, grab: false, grabKind: null, flip: 0, roll: 0, up: false, down: false, butter: false };
    this.trickType = null; this.flipAxis = new THREE.Vector3(1, 0, 0); this.flipDir = 0; this.grabs = {};
    this.butter = null;
    this.spinVel = 0; this.perfectPop = false; this.offKicker = false; this.sinkV = 0;
    this.shiftyT = 0; this.daffyT = 0; this.shiftyS = 0; this.daffyS = 0; this.flailT = 0; this.spring = 0; this.springV = 0;
    this.surf = { powder: 0, ice: 0 };
    this.onGround = true; this.airTime = 0;
    this.spin = 0; this.pitch = 0; this.flipAcc = 0; this.grabTime = 0;
    this.crash = 0; this.crashPhase = null; this.crashT = 0;
    this.tumble = 0; this.tumbleAxis = new THREE.Vector3(1, 0, 0); this.lie = 0;
    this.lean = 0; this.latAcc = 0; this.skid = 0; this.skidYaw = 0; this.compress = 0;
    this.gload = 1; this.scrape = 0;
    this.skatePhase = 0; this.skating = 0;
    this.polePlant = 0; this.poleSide = 1; this.lastLeanSign = 0;
    this.trackDist = 0; this.stuck = 0; this.jumpCharge = 0;
    this.time = Math.random() * 10;
    this.listeners = {};
    const T = this.isPlayer && world.myTracks ? world.myTracks : world.tracks;
    this.trackSlot = T ? T.alloc() : null;
    this.maxAirY = 0;
    this.grind = null; this.pendingRail = null;
    this.pipeAir = false; this.takeoffY = 0; this.maxY = 0; this.takeoffSwitch = false;
    this.airLive = false; this.airQ = new THREE.Quaternion();
  }

  on(evt, fn) { (this.listeners[evt] ??= []).push(fn); }
  emit(evt, data) { for (const fn of this.listeners[evt] ?? []) fn(data); }

  get speed() { return this.crash > 0 ? this.vel.length() : this.sim.speed; }
  // the player riding himself (drawn in the taller stance)
  get strict() { return this.isPlayer && !this.ai && this.world.arcade; }
  get airG() { return 17.5; }
  get canSwitch() { return !this.board; }
  get skiSwitch() { return !this.board && this.sim.switchStance; }
  get boardSwitch() { return this.standInSwitch ?? (this.board && this.sim.switchStance); }
  set boardSwitch(v) { this.standInSwitch = v; }

  place(x, z, heading = null, speed = 0) {
    const h = heading ?? Math.atan2(centerSlope(z), 1);
    this.sim.place(x, z, h, speed);
    this.avgHeading = h;
    if (this.crash > 0) this.endCrash();
    this.spin = 0; this.pitch = 0; this.flipAcc = 0; this.trickType = null; this.flipAxis.set(1, 0, 0); this.butter = null;
    this.stuck = 0; this.lean = 0; this.skid = 0; this.edge = 0; this.gload = 1;
    this.grind = null; this.pendingRail = null; this.pipeAir = false; this.jumpCharge = 0;
    this.sync();
    if (this.trackSlot) this.trackSlot.break();
  }

  // ski direction projected onto the slope
  forward(out) {
    out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    out.addScaledVector(this.normal, -out.dot(this.normal)).normalize();
    return out;
  }

  respawn() {
    const z = Math.max(this.pos.z - 6, 20);
    const hw = halfWidth(z);
    const x = centerX(z) + clamp(this.pos.x - centerX(z), -hw * 0.55, hw * 0.55);
    this.place(x, z, Math.atan2(centerSlope(z), 1), 3);
    this.emit('respawn');
  }

  // what the keys mean to the physics: on the snow W/S are tuck and brake, in the air flips
  readControls() {
    const c = this.controls, i = this.inp, air = this.sim.airborne;
    i.steer = -clamp(c.steer, -1, 1);
    i.forward = air ? c.flip > 0 : c.tuck > 0.5;
    i.brake = air ? c.flip < 0 : c.brake > 0.05;
    i.jump = !!c.jump; i.grab = !!c.grab; i.butter = !!c.butter; i.board = this.board;
    i.airRoll = -(c.roll || 0);
    // (a spin and a flip held together, thrown in the first quarter second, is a cork)
    i.cork = air && Math.abs(c.steer) > 0.06 && !!c.flip;
    i.over = i.cork && !!c.up;
    return i;
  }

  step(dt) {
    if (this.frozen) return;
    this.time += dt;
    if (this.crash > 0) return this.stepCrash(dt);
    const S = this.sim;
    this.chargeAtLip = S.charge;
    S.update(dt, this.readControls());
    this.sync();
    this.events(dt);
    if (this.crash > 0) return;
    if (!S.airborne && !S.grind) this.rideTrack(dt);
    this.collide();
    this.nets(dt);
  }

  // the world's view of the physics
  sync() {
    const S = this.sim, sw = this.skiSwitch ? Math.PI : 0;
    this.pos.set(S.x, S.y, S.z);
    const rise = !S.airborne && !S.grind ? mountain.grade(S.x, S.z, S.travelHeading) * Math.hypot(S.velocityX, S.velocityZ) : S.vy;
    this.vel.set(S.velocityX, rise, S.velocityZ);
    this.onGround = !S.airborne && !S.grind;
    this.airTime = S.airborne ? S.airTime : 0;
    this.jumpCharge = S.charge;
    this.spinVel = S.airborne ? S.spinVelocity : 0;
    if (S.airborne) {
      const A = S.air;
      this.heading = S.heading + A.bodyHeading + sw;
      this.spin = A.spinAngle; this.pitch = A.flipAngle; this.flipAcc = A.flipAngle;
    } else this.heading = S.heading + S.spin + sw;
    if (S.grind) this.heading = S.heading + S.railSpin;
    this.airLive = S.airborne || (S.landingSettling && this.crash <= 0);
    if (this.airLive) {
      this.airQ.setFromAxisAngle(UP, S.heading).multiply(S.q);
      if (sw) this.airQ.multiply(_q.setFromAxisAngle(UP, Math.PI));
    }
    if (this.onGround) normalAt(S.x, S.z, this.normal);
    this.avgHeading += wrapAngle(this.heading - this.avgHeading) * 0.01;
    this.edge = -S.edge * EDGE_MAX * (0.55 + 0.4 * clamp(this.speed / 16, 0, 1));
    this.latAcc = S.speed * S.turnRate * 0.62;
    this.butter = S.butter.active ? { t: S.butter.age, tail: S.butter.end < 0 } : null;
  }

  // what happened this step
  events(dt) {
    const S = this.sim, ev = S.event, c = this.controls;
    if (ev === 'jump' || ev === 'railOff') this.onTakeoff(ev);
    if (S.railEnd) this.railDone();
    if (S.grind) this.railStep(dt);
    else if (this.grind) this.grind = null;
    if (ev === 'railLand' || ev === 'rail') this.railStart();
    if (ev === 'railHopLand') { this.pendingRail = null; this.railStart(true); this.emit('railHopLand', this.grind); }
    if (ev === 'railSwap' && this.grind) { this.grind.swaps = S.railSwaps; this.emit('railSwap', this.grind); }
    if (S.airborne) this.airStep(dt);
    if (this.pendingRail && !S.barSave) this.flushRail();
    if (S.lastLand) this.onLand(S.lastLand);
    else if (ev === 'crash' && this.crash <= 0) this.startCrash('landing', S.landingImpact);
    if (ev === 'butter' && S.butter.done) this.onButter(false);
    if (S.grind && c.jump) this.grind.press = (this.grind.press ?? 0) + dt;
    if (S.grind && c.flip > 0) this.grind.nose = (this.grind.nose ?? 0) + dt;
    else if (S.grind && c.flip < 0) this.grind.tail = (this.grind.tail ?? 0) + dt;
  }

  onButter(landed) {
    const d = this.sim.butter.done;
    this.sim.butter.done = null;
    if (!d) return;
    if (d.age >= 0.25 && this.sim.speed > 3) this.emit('butter', { tail: d.tail, spin: Math.round((d.turn - 0.3) / Math.PI) * 180, t: d.age, board: this.board, landed });
  }

  onTakeoff(ev) {
    const S = this.sim;
    if (S.butter.done) this.onButter(false);
    this.grabs = {}; this.grabTime = 0; this.trickType = null; this.flipAxis.set(1, 0, 0); this.flipDir = 0;
    this.shiftyT = 0; this.daffyT = 0; this.maxAirY = 0;
    this.takeoffY = this.maxY = this.pos.y; this.takeoffX = this.pos.x; this.takeoffZ = this.pos.z;
    this.takeoffSwitch = S.switchStance;
    this.offKicker = S.airSource === 'jump';
    this.fromRail = ev === 'railOff';
    this.popped = S.airSource === 'ground' || this.fromRail && !!S.railEnd?.popped;
    this.perfectPop = this.offKicker && this.chargeAtLip > 0.5;
    this.pipeAir = S.pipeAir;
    if (this.trackSlot) this.trackSlot.break();
    this.emit('takeoff', { pop: this.popped });
  }

  // what the trick is called, as it's flown
  airStep(dt) {
    const S = this.sim, c = this.controls, i = this.inp, A = S.air;
    this.maxY = Math.max(this.maxY, this.pos.y);
    this.maxAirY = S.maxAir;
    this.edge *= 1 - Math.min(1, dt * 3);
    this.lean *= 1 - Math.min(1, dt * 4);
    this.gload = 0;
    const p = i.forward ? 1 : i.brake ? -1 : 0, m = Math.abs(i.airRoll) > 0.06 ? Math.sign(i.airRoll) : 0, ck = i.cork && S.corkSet, over = i.over && ck;
    if (!this.trickType && (p || m)) {
      const t = m && !p ? (Math.abs(S.spinVelocity) > 0.7 ? 'flatspin' : 'sideflip') : ck ? (over ? (p < 0 ? 'rodeo' : 'misty') : (p < 0 ? 'cork' : 'bio')) : p < 0 ? 'backflip' : 'frontflip';
      this.trickType = t; this.flipDir = m && !p ? m : p;
      if (m && !p) this.flipAxis.set(0, 0, 1);
    } else if ((this.trickType === 'backflip' || this.trickType === 'frontflip') && ck) this.trickType = over ? (p < 0 ? 'rodeo' : 'misty') : p < 0 ? 'cork' : 'bio';
    if (c.grab) {
      this.grabTime += dt;
      const k = this.board ? BOARD_NAME[c.grabKind || 'mute'] ?? 'indy' : c.grabKind || 'mute';
      this.grabs[k] = (this.grabs[k] || 0) + dt;
    }
    const free = !this.trickType && !c.grab && Math.abs(c.steer) < 0.3;
    if (free && c.up) this.shiftyT += dt;
    if (free && c.down) this.daffyT += dt;
  }

  onLand(L) {
    const S = this.sim, v = this.vel;
    this.flushRail();
    if (S.butter.done) this.onButter(true);
    this.compress = clamp(L.impact / 9, 0.2, 1);
    this.gload = 1 + L.impact / 5;
    const crash = !L.ok;
    const grabs = Object.entries(this.grabs).filter(([, t]) => t >= 0.25).sort((a, b) => b[1] - a[1]);
    const spin = Math.abs(L.spinAngle), flips = this.trickType ? Math.max(Math.round(Math.abs(L.flipAngle) / TAU), L.inversions) : 0;
    const trick = {
      air: L.airTime, height: L.maxAir, vn: L.impact,
      spin: Math.round(spin / Math.PI) * 180, spinDir: Math.sign(L.spinAngle), spin90: Math.round(spin / (Math.PI / 2)) * 90,
      flips, flipDir: this.trickType ? this.flipDir : Math.sign(L.flipAngle), type: this.trickType,
      grab: this.grabTime > 0.25, grabTime: this.grabTime, grabs, clean: !crash, sketchy: !!L.sketchy, popped: !!this.popped,
      stomp: !!L.stomp, perfectPop: !!this.perfectPop, side: L.side, boost: L.boost ?? 0,
      rise: this.maxY - this.takeoffY, pipe: this.pipeAir, switchIn: this.takeoffSwitch, switchOut: !!L.switchOut, fromRail: !!this.fromRail,
      board: this.board, shifty: this.shiftyT >= 0.22, daffy: this.daffyT >= 0.22,
      hop: !this.offKicker && !this.fromRail, vz: v.z,
    };
    if (L.sketchy) { this.flailT = 0.7; this.wobT = 0; this.wobS = Math.sign(S.spin || Math.random() - 0.5); }
    this.springV -= Math.min(L.impact, 14) * 0.16;
    if (!crash && L.airTime > 0.3) { this.landT = 0; this.landA = clamp(0.3 + L.impact / 11, 0.3, 1) * (L.sketchy ? 1.15 : 1); }
    this.perfectPop = false; this.pipeAir = false;
    if (this.trackSlot) {
      this.trackSlot.break();
      if (L.airTime > 0.25 && L.impact > 1.5) this.trackSlot.dent(this.pos, v, this.normal, this.board ? 0.4 : 0.36, 0.9 + Math.min(L.impact, 14) * 0.06, 0.4 + Math.min(L.impact, 12) / 14);
    }
    if (crash) this.startCrash(L.faceplant ? 'faceplant' : 'landing', L.impact + (L.tilt > 2.2 ? Math.hypot(v.x, v.z) * 0.5 : 0));
    else this.emit('land', trick);
    if (!crash) { this.pitch = 0; this.spin = 0; this.flipAcc = 0; this.trickType = null; }
  }

  // on the snow: what the skis leave, what they sound and look like
  rideTrack(dt) {
    const S = this.sim, speed = this.speed, x = this.pos.x, z = this.pos.z;
    let { powder, ice } = surfaceAt(x, z, this.surf);
    const W = this.world.snow;
    if (W) { powder = Math.min(1, powder + W.powder * (1 - powder * 0.5)); ice = Math.min(1, ice + W.ice * (1 - powder)); this.surf.powder = powder; this.surf.ice = ice; }
    this.gload += (1 + Math.abs(S.turnRate) * speed * 0.03 - this.gload) * Math.min(1, dt * 9);
    const leanT = clamp(Math.atan2(-this.latAcc, GRAV) * 0.9, -0.95, 0.95) * smoothstep(1.5, 6, speed);
    this.lean += (leanT - this.lean) * Math.min(1, dt * 10);
    const sgn = Math.sign(this.lean);
    if (Math.abs(this.lean) > 0.25 && sgn !== this.lastLeanSign) { this.lastLeanSign = sgn; this.polePlant = 1; this.poleSide = sgn > 0 ? -1 : 1; }
    this.polePlant = Math.max(0, this.polePlant - dt * 3);
    this.compress = Math.max(0, this.compress - dt * 2.5);
    this.press = ease(this.press ?? 0, S.skid ? 0 : Math.abs(S.edge) * clamp(speed / 15, 0, 1), 3, dt);
    this.skating = S.poling > 0.5 ? 1 : 0;
    this.skatePhase = S.polePhase * Math.PI;
    this.landSkid = Math.max(0, (this.landSkid ?? 0) - dt * 6);
    this.skid = this.skid * 0.85 + (Math.abs(S.skid) * Math.min(speed, 12) * 0.35 + this.landSkid + Math.abs(S.edge) * speed * 0.012) * 0.15;
    this.scrape = this.scrape * 0.9 + ice * Math.min(1, this.skid / 1.5 + Math.abs(this.edge) * speed / 40) * 0.1;
    this.trackDist += speed * dt;
    if (this.trackSlot && this.trackDist > (this.isPlayer ? 0.3 : 0.45)) {
      this.trackDist = 0;
      const slip = speed > 1 ? wrapAngle(this.heading - Math.atan2(this.vel.x, this.vel.z)) : 0;
      this.trackSlot.add(this.pos, this.forward(_f), this.normal, this.skid, powder, this.board, Math.abs(slip) > Math.PI / 2 ? Math.PI - Math.abs(slip) : slip, this.lean);
    }
    this.stuck = speed < 0.6 ? this.stuck + dt : 0;
  }

  // ---- rails: the physics rides them, this tells the game ----
  railStart(resumed = false) {
    const S = this.sim, R = S.rail, q = Math.round(wrapAngle(S.railSpin) / (Math.PI / 2));
    if (resumed && this.grind) return;
    this.grind = { R, s: S.railT * R.L, v: S.speed, kind: this.railKind(q, R), side: S.railSpin, sideT: S.railSpin, swaps: S.railSwaps, lat: 0, bal: 0, t: S.railTime, d0: S.railT * R.L, spinIn: Math.round(Math.abs(this.spin) / (Math.PI / 2)) * 90, switchIn: this.takeoffSwitch };
    this.spin = 0; this.pitch = 0; this.flipAcc = 0; this.airTime = 0; this.pipeAir = false;
    if (this.trackSlot) this.trackSlot.break();
    if (!resumed) this.emit('grindStart', this.grind);
  }
  railKind(q, R) { return q === 0 ? '50-50' : Math.abs(q) === 2 ? 'Switch 50-50' : R.kind === 'box' ? 'Boardslide' : 'Lipslide'; }
  railStep() {
    const S = this.sim, g = this.grind;
    if (!g) return;
    g.s = S.railT * g.R.L; g.v = S.speed; g.t = S.railTime; g.side = S.railSpin; g.sideT = S.railTarget ?? S.railSpin;
    g.kind = this.railKind(Math.round(wrapAngle(g.sideT) / (Math.PI / 2)), g.R);
    g.bal = Math.sin(this.time * 5.1 + g.R.z) * 0.12;
    this.edge = 0; this.skid = 0; this.compress = 0.35; this.gload = 1;
    this.lean = -g.bal * 0.5;
  }
  // off the end of a bar it's over; a pop with bar still to go may come back down on it
  railDone() {
    const S = this.sim, E = S.railEnd, g = this.grind ?? {};
    this.pendingRail = { kind: g.kind ?? '50-50', rail: E.R.name, dist: Math.max(0, E.t * E.R.L - (g.d0 ?? 0)), t: E.time, fell: false, spinIn: g.spinIn ?? 0, swaps: E.swaps, hops: E.hops, hopTurns: E.hopTurns, switchIn: g.switchIn, pop: E.popped, press: g.press ?? 0, nose: g.nose ?? 0, tail: g.tail ?? 0, board: this.board };
    this.grind = null;
    if (!E.popped || E.t > 0.92) this.flushRail();
  }
  flushRail() { const p = this.pendingRail; if (!p) return; this.pendingRail = null; this.emit('grindEnd', p); }

  // the trick so far, mid-air: what the landing would call it if it came down now
  airTrick() {
    const grabs = Object.entries(this.grabs).filter(([, t]) => t >= 0.25).sort((a, b) => b[1] - a[1]);
    const sp = Math.abs(this.spin), fl = Math.abs(this.pitch);
    return {
      air: this.airTime, height: this.maxAirY,
      spin: Math.floor((sp + 0.35) / Math.PI) * 180, spinDir: Math.sign(this.spin), spin90: Math.floor((sp + 0.2) / (Math.PI / 2)) * 90,
      flips: this.trickType ? Math.floor((fl + 0.6) / TAU) : 0, flipDir: this.trickType ? this.flipDir : Math.sign(this.flipAcc), type: this.trickType,
      grabs, rise: this.maxY - this.takeoffY, pipe: this.pipeAir, switchIn: this.takeoffSwitch, fromRail: !!this.fromRail,
      board: this.board, shifty: this.shiftyT >= 0.22, daffy: this.daffyT >= 0.22,
    };
  }

  // something pushed the rider (a net, a tree, a boost): the physics takes it from here
  pushed() {
    const S = this.sim, v = this.vel;
    S.x = this.pos.x; S.z = this.pos.z; S.velocityX = v.x; S.velocityZ = v.z;
    const h = Math.hypot(v.x, v.z);
    if (S.airborne) { S.vy = v.y; S.speed = h; } else { S.speed = h; if (h > 0.1) S.travelHeading = Math.atan2(v.x, v.z); }
    if (S.airborne && h > 0.1) S.travelHeading = Math.atan2(v.x, v.z);
  }

  // the course is netted on both sides: ride into it and it gives, catches you and throws you
  // back in (hit it hard and you go down in it). The finish straight has solid boards instead.
  nets(dt) {
    const z = this.pos.z;
    if (z < 60 || z > FINISH_Z + 60) return;
    const boards = z > FINISH_Z - 250;
    const c = centerX(z), lim = boards ? halfWidth(z) * (z < FINISH_Z ? 0.92 : 1) + 1.7 : halfWidth(z) + 2.6;
    const dx = this.pos.x - c;
    if (Math.abs(dx) < lim) return;
    const sg = Math.sign(dx), cs = centerSlope(z), il = 1 / Math.hypot(1, cs);
    const nx = sg * il, nz = -sg * cs * il; // outward, across the piste
    const pen = (Math.abs(dx) - lim) * il;
    const out = this.vel.x * nx + this.vel.z * nz, total = this.speed;
    if (boards) {
      this.pos.x -= nx * pen; this.pos.z -= nz * pen;
      if (out > 0) {
        this.vel.x -= nx * out * 1.3; this.vel.z -= nz * out * 1.3;
        if (out > 4) this.emit('impact', { kind: 'boards', x: this.pos.x, z: this.pos.z, speed: out });
        this.pushed();
        if (this.sim.bump(-nx, -nz, out, total)) this.startCrash('boards', out);
      } else this.pushed();
      return;
    }
    // the net stretches about a metre before it's tight
    const MAX = 1.1;
    if (pen > MAX) { this.pos.x -= nx * (pen - MAX); this.pos.z -= nz * (pen - MAX); }
    const push = (70 * Math.min(pen, MAX) + (out > 0 ? 7 : 2) * out) * dt;
    this.vel.x -= nx * push; this.vel.z -= nz * push;
    this.vel.multiplyScalar(1 - Math.min(0.6, pen) * 0.5 * dt);
    if (pen > MAX - 0.05 && out > 0) { this.vel.x -= nx * out * 1.2; this.vel.z -= nz * out * 1.2; }
    this.pushed();
    this.world.netHit?.(sg, z, Math.min(pen, MAX) + 0.15);
    if (!this.netIn && out > 3) this.emit('impact', { kind: 'net', x: this.pos.x, z: this.pos.z, speed: out });
    this.netIn = 0.3;
    if (this.sim.bump(-nx, -nz, out, total)) this.startCrash('net', out);
  }

  // ---- crashes: the clock is the physics', the tumble is drawn here ----
  // hit: how hard it was (m/s into the thing, or into the snow)
  startCrash(reason, hit = 0) {
    if (this.crash > 0) return;
    const S = this.sim, sp = this.speed;
    if (S.crashTime <= 0) S.beginCrash(hit, false, hit > 25 ? 'crash' : 'fall');
    this.grind = null; this.flushRail();
    this.airLive = false;
    this.crash = 1; this.crashPhase = 'tumble'; this.crashT = 0; this.crashSpeed = sp;
    this.ragSeed = Math.random() * 6; this.halfTurns = 0;
    const hx = this.vel.x, hz = this.vel.z, hl = Math.hypot(hx, hz) || 1;
    this.tumbleAxis.set(hz / hl, 0, -hx / hl);
    this.tumble = this.pitch;
    this.tumbleRate = Math.min(sp / 0.75, 11) * (Math.random() < 0.75 ? 1 : -1);
    this.cartwheel = (Math.random() - 0.5) * Math.min(sp / 3, 5);
    this.cartAngle = 0; this.lie = 0; this.onGround = true;
    if (this.trackSlot) this.trackSlot.break();
    this.emit('crash', { reason, speed: sp, hit });
    if (sp > 10) this.emit('yardsale', { speed: sp });
  }

  stepCrash(dt) {
    const v = this.vel, S = this.sim;
    this.crashT += dt;
    S.crashTime = Math.max(0, S.crashTime - dt);
    v.y -= GRAV * dt;
    this.pos.addScaledVector(v, dt);
    const gy = heightAt(this.pos.x, this.pos.z);
    const n = normalAt(this.pos.x, this.pos.z, this.normal);
    if (this.pos.y <= gy + 0.02) {
      this.pos.y = gy;
      const vn = v.dot(n);
      if (vn < 0) v.addScaledVector(n, -vn * (vn < -3 ? 1.3 : 1));
      const sp = v.length();
      const mu = (this.crashPhase === 'tumble' ? 0.42 : 0.6) + this.surf.powder * 0.25 - this.surf.ice * 0.15;
      if (sp > 0.01) v.multiplyScalar(Math.max(0, sp - (mu * GRAV * n.y + 0.035 * sp * sp) * dt) / sp);
      this.trackDist += sp * dt;
      if (this.trackSlot && sp > 0.6 && this.trackDist > 0.35) { this.trackDist = 0; this.trackSlot.add(this.pos, _t.copy(v).normalize(), n, 2, 1); }
    } else if (this.trackSlot?.last) this.trackSlot.break();
    const sp = v.length(), left = S.crashTime;
    if (this.crashPhase === 'tumble') {
      this.tumble += this.tumbleRate * dt;
      const ht = Math.floor(Math.abs(this.tumble) / Math.PI);
      if (ht !== this.halfTurns) {
        this.halfTurns = ht;
        if (sp > 4 && this.pos.y <= gy + 0.05) {
          v.y += 0.8 + Math.min(sp, 30) * 0.07;
          this.emit('tumbleHit', { speed: sp });
          this.trackSlot?.dent(this.pos, v, n, 0.55, 1.2, 1);
        }
      }
      this.cartAngle += this.cartwheel * dt;
      const k = Math.exp(-dt * 1.5);
      this.tumbleRate *= k; this.cartwheel *= k;
      this.tumbleRate = Math.sign(this.tumbleRate) * Math.min(Math.abs(this.tumbleRate), sp / 0.6 + 1);
      if (Math.abs(this.tumbleRate) < 2.5) {
        const lying = Math.round((this.tumble - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
        this.tumble += (lying - this.tumble) * Math.min(1, dt * 4);
        this.cartAngle += (Math.round(this.cartAngle / Math.PI) * Math.PI - this.cartAngle) * Math.min(1, dt * 4);
      }
      this.lie = Math.min(1, this.lie + dt * 2);
      if (left < 0.6) { this.crashPhase = 'down'; this.crashT = 0; }
    } else if (this.crashPhase === 'down') {
      const lying = Math.round((this.tumble - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
      this.tumble += (lying - this.tumble) * Math.min(1, dt * 8);
      this.cartAngle += (Math.round(this.cartAngle / Math.PI) * Math.PI - this.cartAngle) * Math.min(1, dt * 8);
      if (left < 0.42) { this.crashPhase = 'up'; this.crashT = 0; }
    } else {
      v.multiplyScalar(Math.exp(-dt * 0.8));
      const up = Math.round(this.tumble / TAU) * TAU;
      this.tumble += (up - this.tumble) * Math.min(1, dt * 9);
      this.cartAngle += (Math.round(this.cartAngle / TAU) * TAU - this.cartAngle) * Math.min(1, dt * 9);
      this.lie = Math.max(0, this.lie - dt * 2.6);
      if (left <= 0) this.recover();
    }
  }

  recover() {
    const off = Math.abs(this.pos.x - centerX(this.pos.z)) / halfWidth(this.pos.z);
    this.world.forest?.query(this.pos.x, this.pos.z, near);
    const stuckInTrees = near.some((o) => Math.hypot(o.x - this.pos.x, o.z - this.pos.z) < o.r + 0.8);
    this.endCrash();
    if (off > 1.3 || stuckInTrees) this.respawn();
    else {
      // back on the skis with some of the speed of the fall, along the way you were sliding if
      // that's down the hill, otherwise down the fall line
      const fall = Math.atan2(centerSlope(this.pos.z), 1);
      const hv = Math.hypot(this.vel.x, this.vel.z), dir = Math.atan2(this.vel.x, this.vel.z);
      const heading = hv > 2 && Math.abs(wrapAngle(dir - fall)) < 1.2 ? dir : fall;
      this.sim.getUp(this.pos.x, this.pos.z, heading, Math.max(hv, (this.crashSpeed ?? 0) * 0.55));
      this.avgHeading = heading;
      this.sync();
      if (this.trackSlot) this.trackSlot.break();
    }
    this.emit('recover');
  }

  endCrash() {
    this.crash = 0; this.crashPhase = null; this.tumble = 0; this.lie = 0; this.cartAngle = 0;
    this.pitch = 0; this.spin = 0; this.flipAcc = 0; this.sim.crashTime = 0;
    this.emit('gear');
  }

  collide() {
    const w = this.world;
    if (!w.forest) return;
    w.forest.query(this.pos.x, this.pos.z, near);
    // through a tree's branches: they catch you and drag you back, then let you go
    let bough = null, moved = false;
    for (const o of near) {
      if (!o.br || this.crash > 0 || !this.isPlayer || this.ai) continue;
      const d = Math.hypot(this.pos.x - o.x, this.pos.z - o.z);
      if (d > o.br || this.pos.y > heightAt(o.x, o.z) + o.th * 0.9) continue;
      const sp = this.speed;
      if (sp > 0.5) { this.vel.multiplyScalar(Math.max(0, 1 - (1.6 + sp * 0.12) * (1 - d / o.br) * (1 / 100))); moved = true; }
      bough = o;
    }
    if (bough && bough !== this.bough) this.emit('branches', { x: bough.x, z: bough.z, h: bough.th, speed: this.speed });
    this.bough = bough;
    for (const o of near) {
      const dx = this.pos.x - o.x, dz = this.pos.z - o.z, minD = o.r + 0.35, d2 = dx * dx + dz * dz;
      if (d2 >= minD * minD) continue;
      const gy = heightAt(o.x, o.z);
      if (o.top && this.pos.y > gy + o.top) continue;
      // poles, gates and signs: knock them over and carry on, a little slower
      if (o.soft) {
        if (o.down || o.off || this.pos.y > gy + o.h || this.speed < 1.5) continue;
        const sp = this.speed;
        this.vel.multiplyScalar(1 - o.slow); moved = true;
        this.flailT = Math.max(this.flailT, o.slow > 0.05 ? 0.45 : 0.2);
        this.world.smash?.hit(o, this.vel);
        this.emit('smash', { kind: o.kind, speed: sp });
        continue;
      }
      const d = Math.sqrt(d2) || 0.01, nx = dx / d, nz = dz / d;
      const into = -(this.vel.x * nx + this.vel.z * nz), total = this.speed;
      this.pos.x = o.x + nx * minD; this.pos.z = o.z + nz * minD; moved = true;
      if (into > 0) {
        this.vel.x += nx * into * 1.15; this.vel.z += nz * into * 1.15;
        this.pushed(); moved = false;
        if (this.sim.bump(nx, nz, into, total)) {
          this.emit('impact', { kind: o.kind, x: o.x, z: o.z, speed: into });
          this.startCrash(o.kind, into);
          return;
        }
      }
    }
    if (moved) this.pushed();
  }

  // the body through a trick: shoulders, head, knees
  trickPose(dt) {
    const T = (this.trk ??= { lead: 0, look: 0, lookW: 0, tuck: 0, pop: 0, land: 0, wob: 0, rail: 0, bal: 0, tweak: 0, gh: 0, sr: 0, sa: 0, fr: 0, lh: null, lp: 0 });
    const c = this.controls, g = this.grind;
    const air = !this.onGround && !g && this.crash <= 0;
    if (dt > 0) {
      // the rotation the body actually made (whatever flew it: a combo, the keys, the assist)
      const sr = air && T.lh != null ? wrapAngle(this.heading - T.lh) / dt : 0;
      const fr = air && T.lh != null ? clamp((this.pitch - T.lp) / dt, -20, 20) : 0;
      const k = Math.min(1, dt * 12), sr0 = T.sr;
      T.sr += (sr - T.sr) * k;
      T.sa += (clamp((T.sr - sr0) / dt, -60, 60) - T.sa) * Math.min(1, dt * 8);
      T.fr += (fr - T.fr) * k;
    }
    T.lh = this.heading; T.lp = this.pitch;
    const ease = (key, to, rate) => { T[key] += (to - T[key]) * Math.min(1, dt * rate); };
    // the shoulders throw the spin and the hips follow; slowing to spot, the shoulders stop first.
    // Loading the pop with a turn held, they wind up the other way first
    let lead = 0, look = 0, lookW = 0;
    if (air) lead = clamp(T.sr * 0.05 + T.sa * 0.012, -0.55, 0.55);
    else if (g) lead = clamp(wrapAngle(-g.side), -0.65, 0.65); // (sliding: the chest faces down the rail)
    else if (this.world.arcade && this.jumpCharge > 0.05 && Math.abs(c.steer) > 0.3) lead = Math.sign(c.steer) * 0.5 * Math.min(1, this.jumpCharge * 2.5);
    ease('lead', lead, air || g ? 10 : 7);
    // the head leads into a spin, looking for the next half turn, then spots the landing
    if (air && this.airTime > 0.08) {
      const f = (this.heading - Math.atan2(this.vel.x, this.vel.z)) / Math.PI;
      const tgt = T.sr > 1 ? Math.ceil(f - 0.02) : T.sr < -1 ? Math.floor(f + 0.02) : Math.round(f);
      const rem = (tgt - f) * Math.PI;
      look = clamp(rem, -1.25, 1.25);
      lookW = 1 - smoothstep(1.3, 2.3, Math.abs(rem));
    } else if (g) { look = clamp(wrapAngle(-g.side), -1.2, 1.2); lookW = 0.8; }
    ease('look', look, 12); ease('lookW', lookW, 8);
    // knees to the chest through a flip, opening out to spot the landing
    ease('tuck', air && this.trickType ? clamp(Math.abs(T.fr) / 4.5, 0, 1) : 0, 9);
    // the legs snap straight as he pops off the lip, then draw up
    T.pop = air && this.popped && !this.fromRail ? 1 - smoothstep(0.02, 0.26, this.airTime) : 0;
    // a grab held long gets tweaked out further
    T.gh = air && c.grab ? T.gh + dt : 0;
    ease('tweak', smoothstep(0.3, 1.0, T.gh), 5);
    // touchdown: a quick dip the knees soak up, then back up; a sketchy one wobbles
    if (this.landT != null) {
      this.landT += dt;
      T.land = (this.landA ?? 0.5) * (this.landT < 0.07 ? this.landT / 0.07 : Math.exp(-(this.landT - 0.07) * 5.5));
      if (this.landT > 1.2 || !this.onGround) { this.landT = null; T.land = 0; }
    } else T.land = 0;
    if (this.wobT != null) {
      this.wobT += dt;
      T.wob = (this.wobS ?? 1) * Math.sin(this.wobT * 13) * Math.exp(-this.wobT * 3.2);
      if (this.wobT > 1.3 || !this.onGround) { this.wobT = null; T.wob = 0; }
    } else T.wob = 0;
    ease('rail', g ? 1 : 0, 10);
    T.bal = g ? g.bal + Math.sin(this.time * 3.3) * 0.25 : 0;
    // what's left of a flip that came down a touch short or long, eased out instead of snapped
    if (this.landTilt) { this.landTilt *= Math.exp(-dt * 14); if (Math.abs(this.landTilt) < 0.005 || !this.onGround) this.landTilt = 0; }
    return T;
  }

  // ---- visuals ----
  updateVisual(dt, camPos) {
    this.contact(camPos);
    const m = this.model;
    const g = m.group;
    const airK = this.onGround ? 0 : smoothstep(0.05, 0.35, this.airTime);
    _t.copy(this.normal).lerp(UP, this.onGround && !this.crash ? 0.15 : 0.8).normalize();
    _q.setFromUnitVectors(UP, _t);
    _q2.setFromAxisAngle(UP, this.heading + this.skidYaw);
    g.quaternion.copy(_q).multiply(_q2);
    let lie = 0;
    if (this.crash > 0) {
      // world-space tumble across the line of travel plus a cartwheel along it
      _q2.setFromAxisAngle(this.tumbleAxis, -this.tumble);
      _m.makeRotationAxis(_n.set(-this.tumbleAxis.z, 0, this.tumbleAxis.x), this.cartAngle);
      g.quaternion.premultiply(new THREE.Quaternion().setFromRotationMatrix(_m)).premultiply(_q2);
      lie = this.lie;
    } else if (this.airLive) {
      // (in the air, and settling out of it, the body has its own orientation)
      g.quaternion.copy(this.airQ);
    } else if (this.pitch !== 0) {
      g.quaternion.multiply(_q2.setFromAxisAngle(this.flipAxis, this.trickType ? this.pitch : -this.pitch));
    } else if (this.landTilt && this.onGround) {
      g.quaternion.multiply(_q2.setFromAxisAngle(this.flipAxis, this.landTilt));
    } else if (this.butter && this.onGround) {
      // butter: rock onto the nose or tail, pivoting on that ski end
      const k = Math.min(1, this.butter.t * 6) * (this.board ? 0.2 : 0.32);
      const a = this.butter.tail ? -k : k;
      g.quaternion.multiply(_q2.setFromAxisAngle(_n.set(1, 0, 0), a));
    } else if (this.grind && this.controls.flip) {
      // nose / tail press on a rail
      g.quaternion.multiply(_q2.setFromAxisAngle(_n.set(1, 0, 0), this.controls.flip * (this.board ? 0.1 : 0.2)));
    }
    (this.visPos ??= new THREE.Vector3()).copy(this.pos);
    // rotate about the body's centre, not the feet
    const ch = 0.8 * (1 - lie) + 0.24 * lie;
    _n.set(0, 0.8, 0).applyQuaternion(g.quaternion);
    g.position.copy(this.pos).addScaledVector(_t, ch).sub(_n);
    if (this.butter && this.onGround && !this.crash) g.position.y += Math.sin(Math.min(1, this.butter.t * 6) * 0.32) * 0.82;
    // deep snow: the skis ride under the surface, planing up as the speed builds
    // (only a whisker: the skis stay on top of the snow you can see)
    if (this.onGround && !this.grind) {
      const sink = this.surf.powder * clamp(0.05 - this.speed * 0.003, 0, 0.05) * (this.crash > 0 ? 0.5 : 1);
      this.sinkV = (this.sinkV ?? 0) + (sink - (this.sinkV ?? 0)) * Math.min(1, dt * 6);
    } else this.sinkV = (this.sinkV ?? 0) * (1 - Math.min(1, dt * 8));
    g.position.y -= this.sinkV;
    // the slope bends under a 1.7 m ski: lift him so neither the tip nor the tail is in the snow
    if (this.onGround && !this.grind && !this.crash) {
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const reach = this.board ? 0.8 : 0.9;
      let lift = 0;
      for (const k of [-1, -0.5, 0.5, 1]) {
        const x = this.pos.x + fx * reach * k, z = this.pos.z + fz * reach * k;
        // height of the plane the skis lie in there, against the snow itself
        const plane = this.pos.y - (this.normal.x * (x - this.pos.x) + this.normal.z * (z - this.pos.z)) / Math.max(0.3, this.normal.y);
        lift = Math.max(lift, heightAt(x, z) - plane);
      }
      this.liftV = (this.liftV ?? 0) + (Math.min(lift, 0.35) + 0.015 - (this.liftV ?? 0)) * Math.min(1, dt * 14);
      g.position.y += this.liftV;
    } else this.liftV = 0;

    const dist = camPos ? camPos.distanceTo(this.pos) : 0;
    m.setDetail(dist < 70);
    m.setReal?.(dist < 160);
    // a long way off another rider is drawn with the rest of them in one go (main.js)
    this.far = !this.isPlayer && dist > Skier.farDist && dist < Skier.drawDist;
    m.group.visible = dist < Skier.drawDist && !this.far;
    if (!m.group.visible) return;
    if (dist > 180 && (Math.floor(this.time * 60) % 3) !== 0) return; // pose far skiers less often
    const sp = this.speed;
    const c = this.controls;
    const crashed = this.crash > 0;
    // landings: the legs are a spring that dips and comes back up
    const vdt = Math.min(dt, 0.05);
    this.springV += (-150 * this.spring - 15 * this.springV) * vdt;
    this.spring += this.springV * vdt;
    this.flailT = Math.max(0, this.flailT - vdt);
    m.trk = this.trickPose(vdt);
    const free = !this.onGround && !crashed && !this.trickType && !c.grab && Math.abs(c.steer) < 0.3;
    this.shiftyS += ((free && c.up ? 1 : 0) - this.shiftyS) * Math.min(1, vdt * 9);
    this.daffyS += ((free && c.down ? 1 : 0) - this.daffyS) * Math.min(1, vdt * 9);
    const gCrouch = clamp((this.gload - 1) * 0.32, -0.12, 0.5);
    // fore-aft acceleration, smoothed, for the body's rock
    const spNow = this.speed;
    if (this.lastSp != null && vdt > 0) this.accelS = (this.accelS ?? 0) + ((spNow - this.lastSp) / vdt - (this.accelS ?? 0)) * Math.min(1, vdt * 6);
    this.lastSp = spNow;
    // riding backwards: he turns his shoulders and looks back over one of them to see where he's going
    const back = this.skiSwitch && this.onGround && !crashed && !this.grind;
    if (back && Math.abs(c.steer) > 0.3) this.lookSide = -Math.sign(c.steer);
    this.backK = (this.backK ?? 0) + ((back ? 1 : 0) - (this.backK ?? 0)) * Math.min(1, vdt * 6);
    const lookS = (this.lookSide ?? 1) * this.backK;
    // (the player stands tall like a Cork7 rider; the computer riders sit lower)
    let crouch = (this.strict ? 0.04 : 0.18) + Math.abs(this.lean) * (this.strict ? (this.board ? 0.1 : 0.06) : this.board ? 0.26 : 0.12) + this.compress * 0.35 + gCrouch * (this.strict ? (this.board ? 0.35 : 0.3) : this.board ? 1 : 0.7) + this.jumpCharge * 0.5 + (c.brake > 0 ? 0.25 : 0) - this.spring * 1.6;
    if (crashed) crouch = this.crashPhase === 'up' ? 0.9 * this.lie + 0.3 : 0.55;
    // (the player's rider drawn a size up, like Cork7's: easier to read on the hill and in a trick)
    const sc = this.strict ? 1.13 : 1;
    if (m.group.scale.x !== sc) m.group.scale.setScalar(sc);
    m.pose({
      // (the body's tilt eases off past ~40 degrees: angulation takes the rest)
      lean: crashed ? 0 : 0.85 * Math.tanh(this.lean / 0.85),
      angulate: this.board ? 0.55 : 0.7,
      tall: this.strict && !this.board ? 1 : 0,
      // (a Cork7 snowboarder rides up on the board too, not sat down in a squat)
      stand: this.strict && this.board ? 1 : 0,
      // the skis speeding up under him (+) or checked (-): the upper body rocks with it
      // (deep and slow in powder he sits back a little to keep the tips up)
      fore: crashed || !this.onGround ? 0 : clamp(this.accelS ?? 0, -6, 6) / 6 - this.surf.powder * 0.25 * (1 - smoothstep(6, 16, sp)),
      crouch: clamp(crouch, 0, 1),
      // (a Cork7 rider tucking only hunches over a little, eased into)
      tuck: (this.tuckPose = ease(this.tuckPose ?? 0, crashed || (this.skating && !this.board) ? 0 : clamp((this.onGround ? (this.sim.tucking ? 1 : 0) : c.tuck) * smoothstep(5, 9, sp), 0, 1) * (1 - airK * 0.5) * (this.strict ? 0.18 : 1), 4, dt)),
      plow: c.brake > 0 && sp < 9 && !this.isPlayer && !this.board ? 1 : 0,
      air: crashed ? 0 : airK,
      grab: c.grab && airK > 0 ? 1 : 0,
      grabTip: c.grab && airK > 0 ? 1 : 0,
      grabKind: c.grabKind || 'mute',
      cross: this.grind && c.jump ? 1 : 0,
      press: this.board ? (this.butter && this.onGround ? (this.butter.tail ? -1 : 1) * Math.min(1, this.butter.t * 6) : this.grind ? c.flip || 0 : 0) : 0,
      shifty: this.shiftyS, daffy: this.daffyS,
      flail: crashed ? 0 : smoothstep(0, 0.3, this.flailT),
      spinRate: this.onGround ? 0 : this.spinVel,
      look: crashed ? 0 : this.onGround ? clamp(-this.edge * 0.3, -0.35, 0.35) * (1 - this.backK) + lookS * 1.15 : clamp(this.spinVel * 0.07, -0.6, 0.6),
      polePlant: Math.sin(this.polePlant * Math.PI),
      poleSide: this.poleSide,
      crash: crashed && this.crashPhase !== 'up',
      // how wild the limbs are: thrown about while it tumbles, sprawled once it stops
      rag: crashed ? clamp(Math.abs(this.tumbleRate ?? 0) / 7 + this.speed / 30, 0, 1) * (this.crashPhase === 'tumble' ? 1 : 0.15) : 0,
      ragT: this.crashT * 1.0, ragSeed: this.ragSeed ?? 0,
      twist: crashed ? 0 : clamp(wrapAngle(this.avgHeading - this.heading) * 0.85, -0.7, 0.7) * (1 - this.backK) + lookS * 0.62,
      skate: this.skating && !crashed && !this.board ? 1 : 0,
      skatePhase: this.skatePhase,
      // (skidding, the skis come off their edges a little: flatter, sliding)
      edge: this.onGround && !crashed ? this.edge * (1 - 0.3 * smoothstep(0.6, 2.5, this.skid)) : 0,
      // the ski bends deeper as the pressure builds through a clean carve
      flex: this.onGround && !crashed ? clamp(Math.abs(this.lean) * 1.1 * this.gload + (this.press ?? 0) * 0.25, 0, 1) + clamp(Math.abs(this.spring) * 4, 0, 0.5) : 0,
      // (and chatters at speed on hard snow, and when the edges skip across it in a skid)
      chatter: this.onGround && !crashed ? smoothstep(15, 30, sp) * (0.25 + this.surf.ice * 2.5) * (0.6 + 0.4 * Math.abs(this.lean))
        + smoothstep(0.5, 2.5, this.skid) * smoothstep(5, 14, sp) * (0.3 + this.surf.ice * 1.2) * (1 - this.surf.powder) : 0,
      wind: crashed ? 0 : smoothstep(3, 22, Math.hypot(this.vel.x, this.vel.y, this.vel.z)),
      slap: this.onGround && !crashed ? clamp(Math.abs(this.springV) * 0.12, 0, 0.6) : 0,
      switch: !!this.boardSwitch,
      t: this.time,
    });
  }

  // a soft dark patch on the snow under the rider: the sky light the body and skis block.
  // Fades as he leaves the ground
  contact(camPos) {
    if (typeof document === 'undefined') return;
    if (!this.blob) {
      if (!BLOB.tex) {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
        r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.6)'); r.addColorStop(0.65, 'rgba(255,255,255,0.15)'); r.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = r; g.fillRect(0, 0, 64, 64);
        BLOB.tex = new THREE.CanvasTexture(c);
        BLOB.geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      }
      this.blob = new THREE.Mesh(BLOB.geo, new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: BLOB.tex, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      this.blob.renderOrder = 1;
      this.world.scene.add(this.blob);
    }
    const b = this.blob;
    const gy = heightAt(this.pos.x, this.pos.z), h = Math.max(0, this.pos.y - gy);
    b.visible = !this.hidden && !this.held && !this.frozen && h < 4 && (!camPos || this.pos.distanceToSquared(camPos) < 70 * 70);
    if (!b.visible) return;
    normalAt(this.pos.x, this.pos.z, _bn);
    b.position.set(this.pos.x, gy + 0.03, this.pos.z);
    b.quaternion.setFromUnitVectors(UP, _bn).multiply(_bq.setFromAxisAngle(UP, this.heading));
    const lying = this.crash > 0 ? 1 : 0;
    // (just the contact darkening under the skis: the sun casts the real shadow)
    b.scale.set(0.6 + h * 0.4 + lying * 0.7, 1, (this.board ? 1.3 : 1.75) + h * 0.4 + lying * 0.3);
    b.material.opacity = 0.26 * Math.max(0, 1 - h / 2);
  }

  dispose() {
    if (this.blob) this.world.scene.remove(this.blob);
    this.world.scene.remove(this.model.group);
  }
}

