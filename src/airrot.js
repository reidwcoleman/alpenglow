// The body's turn through the air, after Cork7's: one orientation, turned by an angular momentum
// set against the takeoff, not a heading and a flip angle stacked on each other. So it rotates
// the way a body can: spin and flip held together share one rate (the quicker of the two) and
// tip the axis over, instead of adding up into a whirl; a flip goes over the shoulder the body
// faced when it started; a cork (an off-axis flip) tumbles about one axis fixed in the air, the
// body turning about its spine three times as easily as end over end.
import * as THREE from 'three';

const SPINE = 3; // how much easier the body turns about its spine than end over end
const SPINE_FLIP = 2.9; // (flipping: a touch less)
const SPIN_K = 0.66; // the share of a spin that goes into the cork's momentum
const OVER_K = 0.28; // (over the top: rodeo, misty)
const OVER_SPINE = 7;
const TILT = (40 * Math.PI) / 180; // a back flip with a spin leans its axis this far
const TILT_N = 2; // (rad/s of both for the full lean)
const ROLL_CONE = (95 * Math.PI) / 180;
const INVERTED = -0.3; // upside down: the body's up this far below level
const SETTLE = 0.05; // (rad turned before a cork starts to blend in)

// a value eased toward on or off, critically damped (the cork and the over blend in and out)
class Blend {
  constructor() { this.reset(); }
  reset() { this.value = 0; this.velocity = 0; this.started = false; }
  update(on, dt) {
    const r = on ? 1 : 0;
    if (!this.started) { this.started = true; this.value = r; return r; }
    const d = this.value - r, a = (this.velocity + 10 * d) * dt, k = Math.exp(-10 * dt);
    this.value = r + (d + a) * k;
    this.velocity = (this.velocity - 10 * a) * k;
    if (this.value < 0 || this.value > 1) { this.value = Math.min(1, Math.max(0, this.value)); this.velocity = 0; }
    return this.value;
  }
}

const _e = new THREE.Euler();

export class AirRot {
  constructor() {
    this.q = new THREE.Quaternion();
    this.momentum = new THREE.Vector3();
    this.inverse = new THREE.Quaternion();
    this.local = new THREE.Vector3();
    this.omega = new THREE.Vector3();
    this.step = new THREE.Quaternion();
    this.half = new THREE.Quaternion();
    this.up = new THREE.Vector3();
    this.nose = new THREE.Vector3();
    this.hip = new THREE.Vector3();
    this.regular = new THREE.Vector3();
    this.corkAxis = new THREE.Vector3();
    this.flipAxis = new THREE.Vector3();
    // the takeoff's frame (the flip goes over its lateral, the spin about its up)
    this.lat = new THREE.Vector3(1, 0, 0);
    this.fwd = new THREE.Vector3(0, 0, 1);
    this.tup = new THREE.Vector3(0, 1, 0);
    this.pitchHeld = false;
    this.cork = new Blend();
    this.over = new Blend();
    this.spineEase = SPINE;
    this.rollLean = SPIN_K * Math.tan(ROLL_CONE / 2);
    this.reset();
  }

  // off the lip: facing yaw, tipped by pitch (or a whole orientation)
  reset(pitch = 0, yaw = 0, q = null) {
    this.pitchHeld = false;
    if (q) this.q.copy(q); else this.q.setFromEuler(_e.set(pitch, yaw, 0, 'YXZ'));
    if (q) { this.lat.set(1, 0, 0).applyQuaternion(q); this.fwd.set(0, 0, 1).applyQuaternion(q); }
    else { this.lat.set(Math.cos(yaw), 0, -Math.sin(yaw)); this.fwd.set(Math.sin(yaw), 0, Math.cos(yaw)); }
    this.tup.crossVectors(this.fwd, this.lat).normalize();
    const r = Math.hypot(this.fwd.x, this.fwd.z) || 1;
    const lean = Math.atan2(-(this.tup.x * this.fwd.x + this.tup.z * this.fwd.z) / r, this.tup.y);
    this.rollLean = SPIN_K * Math.tan(Math.max(0.2, Math.min(1.1, (ROLL_CONE - lean) / 2)));
    this.cork.reset(); this.over.reset();
    this.turned = 0; this.corked = false; this.speed = 0;
    this.spinAngle = 0; this.flipAngle = 0; this.inversions = 0;
    this.regularScale = 1; this.regularSpin = 0;
    this.heading = this.bodyHeading;
    this.wasInverted = this.upright < INVERTED;
  }

  // a flip started fresh goes over the shoulder the body faces now (riding switch, the other way)
  controlPitch(flip, sw, flipVel, rollVel) {
    const on = flip !== 0;
    if (on && !this.pitchHeld && Math.abs(flipVel) < 0.1 && Math.abs(rollVel) < 0.1) {
      const s = sw ? -1 : 1;
      this.lat.set(s, 0, 0).applyQuaternion(this.q);
      this.fwd.set(0, 0, s).applyQuaternion(this.q);
      this.tup.crossVectors(this.fwd, this.lat).normalize();
    }
    this.pitchHeld = on;
  }

  // turn by the rates (flip front +, spin left +, roll), in small steps; cork / over: the
  // off-axis keys held
  update(flip, spin, dt, cork = false, roll = 0, over = false) {
    if (dt <= 0) return;
    const rate = Math.max(Math.abs(flip), Math.abs(spin), Math.abs(roll));
    const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
    let turnedNow = 0;
    for (let i = 0; i < n; i++) {
      if (this.turned < SETTLE) { this.cork.reset(); this.over.reset(); }
      const ck = this.cork.update(cork, h * 0.5), ov = this.over.update(over, h * 0.5);
      // (a back flip with a spin leans its axis toward the nose)
      const f = TILT * Math.max(-1, Math.min(1, spin / TILT_N)) * Math.max(0, Math.min(1, -flip / TILT_N)) * (1 - ov);
      this.flipAxis.copy(this.lat).multiplyScalar(Math.cos(f)).addScaledVector(this.fwd, Math.sin(f));
      this.momentum.copy(this.flipAxis).multiplyScalar(flip)
        .addScaledVector(this.tup, spin * (SPIN_K + (OVER_K - SPIN_K) * ov))
        .addScaledVector(this.fwd, -roll * this.rollLean);
      const fr = Math.abs(flip) / (Math.abs(flip) + Math.abs(roll) || 1), se = SPINE + (SPINE_FLIP - SPINE) * fr;
      this.spineEase = se + (OVER_SPINE - se) * ov;
      // (a midpoint step: the rate at the half-turned body, then the whole step)
      this.velocity(this.q, flip, spin, roll, rate, ck, this.omega);
      const w0 = this.omega.length();
      this.step.setFromAxisAngle(this.omega.normalize(), w0 * h * 0.5);
      this.velocity(this.half.copy(this.q).premultiply(this.step), flip, spin, roll, rate, ck, this.omega);
      const w = this.omega.length();
      this.step.setFromAxisAngle(this.omega.normalize(), w * h);
      this.q.premultiply(this.step).normalize();
      this.turned += w * h; turnedNow += w * h;
      this.cork.update(cork, h * 0.5); this.over.update(over, h * 0.5);
      if (ck > 0.5 && Math.abs(flip) > 0.3 && Math.abs(spin) > 0.3) this.corked = true;
      const bh = this.bodyHeading;
      let dv = bh - this.heading;
      if (dv > Math.PI) dv -= Math.PI * 2; else if (dv < -Math.PI) dv += Math.PI * 2;
      this.spinAngle += ((1 - ck) * this.regularSpin * this.regularScale + ck * dv / h) * h;
      this.flipAngle += ((1 - ck) * flip * this.regularScale + ck * this.omega.x * w) * h;
      this.heading = bh;
      const inv = this.upright < INVERTED;
      if (inv && !this.wasInverted) this.inversions++;
      this.wasInverted = inv;
    }
    // (how fast it's turning, on average over the step: the landing assist waits for it to slow)
    this.speed = turnedNow / dt;
  }

  // the angular velocity: plain (the spin about the body's spine, the flip about the takeoff's
  // lateral, their rate shared) blended toward the cork's (about the momentum's axis, read in the
  // body's frame with the spine made easier to turn about)
  velocity(q, flip, spin, roll, rate, ck, out) {
    const s = Math.abs(flip) / Math.max(Math.abs(flip), Math.abs(spin), 1e-9);
    this.regularSpin = spin * (1 - s);
    const l = -spin * s;
    this.regular.set(0, this.regularSpin, -roll).applyQuaternion(q).addScaledVector(this.lat, flip).addScaledVector(this.fwd, l);
    const u = Math.max(Math.hypot(flip, this.regularSpin, l, roll), this.regular.length());
    this.regularScale = u > 1e-9 ? rate / u : 0;
    this.regular.multiplyScalar(this.regularScale);
    this.turnAxis(q, this.corkAxis);
    this.corkAxis.multiplyScalar(rate);
    return out.copy(this.regular).lerp(this.corkAxis, ck);
  }

  turnAxis(q, out) {
    this.inverse.copy(q).invert();
    this.local.copy(this.momentum).applyQuaternion(this.inverse);
    this.local.y *= this.spineEase;
    return out.copy(this.local).applyQuaternion(q).normalize();
  }

  // a nudge from outside (the landing pull)
  correct(dq) {
    this.q.premultiply(dq).normalize();
    this.heading = this.bodyHeading;
    this.wasInverted = this.upright < INVERTED;
  }

  get upright() { return this.up.set(0, 1, 0).applyQuaternion(this.q).y; }
  get bodyHeading() {
    this.nose.set(0, 0, 1).applyQuaternion(this.q);
    this.hip.set(1, 0, 0).applyQuaternion(this.q);
    const e = this.nose.x - this.hip.z, t = this.nose.z + this.hip.x;
    return e * e + t * t < 1e-12 ? this.heading : Math.atan2(e, t);
  }
  get tilt() { return Math.acos(Math.max(-1, Math.min(1, this.upright))); }
}
