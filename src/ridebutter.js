// The butter: press onto a ski's nose or tail. The legs are a loaded spring: touching down (or
// holding B a tenth of a second on the snow) loads them, the press pivots the skis round the
// end that's down, and letting go springs you back up. Used by RideSim; it carries the
// rider's own state, so everything it turns is the rider's.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LEAN = 0.7, LEAN_TIME = 1.25, SPIN_K = 12, SETTLE_MAX = 30, SETTLE_TIME = 0.08;
const HALF = Math.PI, FADE_FROM = (Math.PI * 160) / 180, OVER = Math.PI / 4;
const FAST = 60 / 3.6, FAST_K = 1.5, MAX_IN = 7.5;
const PULL_MAX = 1.2, PULL_MIN_SPEED = 4;
const FACEPLANT_TILT = 0.7, LANDED_TILT = 0.26, PITCH_MAX = 1.4;
const springEnergy = (c) => 0.5 * 400 * (0.16 * clamp(c, 0, 1)) ** 2;
export const lever = (tight, load) => 0.74 * clamp(tight, 0, 1) + 0.06 * clamp(load, 0, 1);

class Spring {
  constructor() { this.reset(); }
  reset() { this.shift = 0; this.lean = 0; this.compression = 0; this.velocity = 0; this.energy = 0; this.peak = 0; }
  impact(v) {
    this.reset();
    if (v > MAX_IN) return 'overload';
    if (v < 0.7) return 'soft';
    this.energy = 0.5 * v * v * 0.18; this.peak = Math.sqrt(this.energy / springEnergy(1));
    return 'loaded';
  }
  update(on, dt) {
    const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n;
    for (let i = 0; i < n; i++) {
      this.energy *= Math.exp(-0.35 * h);
      const target = on ? this.peak : 0;
      this.velocity += (400 * (target - this.compression) - 40 * this.velocity) * h;
      this.compression = clamp(this.compression + this.velocity * h, 0, 1);
      this.shift += ((on ? Math.max(0.22 + 0.78 * target, this.lean) : 0) - this.shift) * (1 - Math.exp(-12 * h));
    }
  }
  release() { const e = Math.sqrt(2 * Math.min(this.energy, springEnergy(this.compression)) * 0.85); this.energy = 0; return e; }
}

const _i = new THREE.Quaternion(), _r = new THREE.Quaternion(), _x = new THREE.Vector3(1, 0, 0);

export class Butter {
  constructor() {
    this.pressure = new Spring();
    this.rotation = new THREE.Quaternion(); this.normal = new THREE.Vector3(); this.landed = { pitch: 0, end: 1 };
    this.cooldown = 0; this.requestedEnd = 1; this.reset();
  }
  reset(keepCool = false) {
    const c = this.cooldown;
    this.pressure.reset();
    Object.assign(this, { load: 0, end: 0, velocity: 0, active: false, ready: false, armed: false, forLanding: false, spent: false, riding: false, ridingAge: 0, fast: false, age: 0, groundHeld: 0, cooldown: keepCool ? c : 0, travel: 0, direction: 0, grade: undefined, caughtPitch: 0 });
    this.landed.pitch = 0; this.landed.end = 1; this.done = null;
  }
  get driveEnd() { return this.fast ? 2 * Math.PI : HALF; }
  get preparing() { return this.armed && !this.spent && this.cooldown === 0; }
  contact(r, v, end = this.requestedEnd) {
    if (r.grind || r.airborne || !this.preparing || this.active) return false;
    const res = this.pressure.impact(v);
    if (res === 'overload') this.spent = true;
    if (res !== 'loaded') return false;
    this.active = true; this.spent = true; this.end = end; this.fast = r.speed + 1e-9 >= FAST; this.caughtPitch = 0; this.age = 0; this.travel = 0; this.direction = 0;
    this.ready = false; this.riding = false; this.velocity = clamp(r.spinVelocity, -10, 10); r.landingSettling = false;
    return true;
  }
  // landing with B held: is the body close enough to a press to catch it?
  catchLanding(r, q, n) {
    this.normal.copy(n).applyQuaternion(this.rotation.copy(q).invert());
    if (r.switchStance) { this.normal.x *= -1; this.normal.z *= -1; }
    const { x, y, z } = this.normal;
    const lo = Math.min(0.9 * z, -0.84 * z) + 0.04 * y - 0.073 * Math.abs(x), hi = Math.min(0.82 * y - 0.25, 1.2 * y + 0.06 * z - 0.25, 1.65 * y + 0.04 * z - 0.18);
    this.landed.pitch = Math.asin(clamp(Math.abs(z), 0, 1)); this.landed.end = z < 0 ? 1 : -1;
    return this.forLanding && this.armed && this.preparing && !this.active && !r.grind && r.airTime <= 1.2 && y > 0 && this.landed.pitch <= PITCH_MAX && lo + 0.06 < hi;
  }
  landingFor(r) {
    const asked = this.forLanding && this.armed && !r.grind;
    this.forLanding = false;
    if (!asked) return null;
    if (!this.preparing || this.active) { this.spent = true; return null; }
    if (r.airTime > 1.2) { this.spent = true; return 'faceplant'; }
    return 'press';
  }
  pressLanding(r, impact) {
    const pitch = this.landed.pitch, tipped = pitch > LANDED_TILT;
    this.landed.pitch = 0;
    const on = this.contact(r, clamp(impact, 2, MAX_IN), tipped ? this.landed.end : this.requestedEnd);
    if (on) { this.pressure.lean = LEAN; this.caughtPitch = tipped ? Math.min(pitch, PITCH_MAX) : 0; } else this.spent = true;
    return on;
  }
  // the turn the slope gives a press, across the line
  pull(cross, speed) { return clamp((-9.81 * 1.7 * Math.sin(Math.atan(cross))) / Math.max(speed, PULL_MIN_SPEED), -PULL_MAX, PULL_MAX); }
  pose(r) {
    if (!this.active || r.grind) return;
    r.landingPrepare = -1; r.landingFlip = this.caughtPitch; r.spinTightness = this.load * 0.85; r.spinWindup = clamp(this.velocity / 3, -1, 1);
    const t = clamp((this.age - 0.25) / LEAN_TIME, 0, 1);
    r.flipWindup = this.end; r.flipTightness = this.pressure.shift * 0.84 + 0.16 * t * t * (3 - 2 * t);
  }
  step(r, inp, dt, grade = 0) {
    if (r.grind) { this.reset(); return false; }
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.cooldown < 1e-9) this.cooldown = 0;
    const was = this.armed;
    this.armed = !!inp.butter;
    if (this.armed && !was) {
      this.requestedEnd = inp.brake && !inp.forward ? -1 : 1;
      if (r.airborne) this.forLanding = true; else if (this.cooldown > 0) this.spent = true;
    }
    if (!this.armed) this.forLanding = false;
    if (!this.armed && !this.active) this.spent = false;
    if (r.airborne) { this.grade = undefined; this.groundHeld = 0; this.riding = false; return false; }
    if (this.forLanding) { this.forLanding = false; this.spent = true; }
    // a change of grade under the skis loads them
    if (was && this.grade !== undefined && !r.landingSettling) {
      const v = r.speed * Math.max(0, Math.sin(Math.atan(grade) - Math.atan(this.grade)));
      if (v > 0.7) this.contact(r, v);
    }
    this.grade = grade;
    this.groundHeld = this.preparing && !this.active && !r.landingSettling ? this.groundHeld + dt : 0;
    if (this.groundHeld + 1e-9 >= 0.1 && this.contact(r, 2, this.requestedEnd)) this.pressure.lean = LEAN;
    if (!this.active) { this.settle(r, dt); return false; }
    this.age += dt;
    this.pressure.update(true, dt);
    this.load = this.pressure.compression;
    this.direction ||= Math.sign(Math.abs(this.velocity) > 0.3 ? this.velocity : inp.steer);
    let turned = 0;
    const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n, end = this.driveEnd, fade0 = end - HALF + FADE_FROM;
    for (let i = 0; i < n; i++) {
      const u = clamp((this.travel - fade0) / (end - fade0), 0, 1), s = u * u * (3 - 2 * u);
      const driving = this.armed && inp.steer * this.direction > 0.06;
      const top = Math.min(6.5, 3 + this.load * 4) * (this.fast ? FAST_K : 1), want = driving ? this.direction * top * (1 - s) : 0;
      const slip = driving ? clamp((Math.abs(this.velocity) - top) / 3.5, 0, 1) : 0;
      const o = clamp((this.travel - end) / OVER, 0, 1), over = o * o * (3 - 2 * o);
      const k = 6 - 4.5 * slip * (1 - s) + s * 2 + over * 10 + (inp.steer * this.direction < -0.06 ? 4 : 0), e = Math.exp(-k * h), v0 = this.velocity;
      this.velocity = want + (v0 - want) * e;
      const d = want * h + ((v0 - want) * (1 - e)) / k;
      this.travel += Math.abs(d); turned += d;
    }
    const face = r.heading + r.spin + (r.switchStance ? Math.PI : 0);
    r.spin += turned;
    // (the pivot is the end that's down: the rest of you swings round it)
    const arm = this.end * lever(r.flipTightness, this.load);
    r.x += arm * (Math.sin(face) - Math.sin(face + turned));
    r.z += arm * (Math.cos(face) - Math.cos(face + turned));
    r.spinVelocity = this.velocity;
    r.speed = Math.max(0, r.speed - this.load * (5 + r.speed * 0.18 + Math.abs(this.velocity) * 0.5) * dt);
    this.pose(r);
    const finished = this.travel >= this.driveEnd - 1e-6 && Math.abs(this.velocity) < 1.5;
    this.ready = this.age > 0.12 && (!this.armed || finished || this.age + 1e-9 >= 2.5);
    return true;
  }
  // off the snow out of a press: the spring pops you, the spin carries on
  launch(r, q, extra = 0, turnedMin = 0) {
    this.riding = false;
    if (!this.active) return { pop: 0, spin: 0, flip: 0 };
    const halves = Math.round((r.spin + extra) / Math.PI), a = halves * Math.PI;
    this.rotation.set(0, Math.sin(-a / 2), 0, Math.cos(-a / 2));
    q.multiply(this.rotation);
    if (Math.abs(halves) % 2) r.switchStance = !r.switchStance;
    const turned = Math.max(this.travel, turnedMin);
    this.done = this.load > 0.12 ? { tail: this.end < 0, turn: turned, age: this.age } : null;
    const out = { pop: this.pressure.release(), spin: this.velocity, flip: 0 };
    this.cooldown = 1; this.pressure.reset(); this.active = false; this.ready = false; this.load = 0; this.velocity = 0; this.end = 0;
    return out;
  }
  // let go on the snow: back flat, the skis settling on the nearest half turn
  rideOut(r) {
    const n = this.velocity, stop = (n * Math.abs(n)) / (2 * SETTLE_MAX) + (n * SETTLE_TIME) / 2, a = Math.round((r.spin + stop) / Math.PI) * Math.PI;
    const f = r.S.frame(r.x, r.z, r.heading, _f);
    r.pose(f, r.q);
    this.launch(r, r.q, stop, Math.abs(a));
    r.spin -= a; r.spinVelocity = n; this.riding = true; this.ridingAge = 0;
    r.flipTightness = 0; r.flipWindup = 0; r.spinTightness = 0; r.spinWindup = 0;
    r.event = 'butter';
  }
  settle(r, dt) {
    if (!this.riding) return;
    this.ridingAge += dt;
    const u = clamp(this.ridingAge / SETTLE_TIME, 0, 1), lim = SETTLE_MAX * u * u * (3 - 2 * u);
    r.spinVelocity += clamp(-SPIN_K * SPIN_K * r.spin - 2 * SPIN_K * r.spinVelocity, -lim, lim) * dt;
    r.spin += r.spinVelocity * dt;
    if (Math.abs(r.spin) < 0.002 && Math.abs(r.spinVelocity) < 0.02) { r.spin = 0; r.spinVelocity = 0; this.riding = false; }
  }
}
const _f = { slope: 0, cross: 0 };
// the nose dug in: the body goes over it
export function faceplantTilt(q) { q.premultiply(_r.setFromAxisAngle(_x, FACEPLANT_TILT)); }
void _i;
