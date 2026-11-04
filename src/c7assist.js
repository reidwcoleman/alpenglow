// Cork7's helpers for the body in the air, rebuilt from how its simulation behaves: the
// orientation a rider takes over a slope (groundPose), the landing assist that eases a released
// trick round to the nearest clean landing, square to the landing's slope (LandingAssist), the
// levelling that keeps a flat spin flat (AirLevel), and the test for a landing that's on its
// tails, tips or edges (offLanding). Orientations here are in the rider's heading frame: +Z the
// way he's travelling, yaw 0 facing it.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3();

// standing over snow of this grade along the way he faces (rise per metre) and across it,
// turned by yaw, the edge leaning him in a touch
export function groundPose(grade, yaw, edge, out, cross = 0, limit = 1.3) {
  const g = clamp(grade, -limit, limit);
  out.setFromEuler(_e.set(-Math.atan(g), 0, Math.atan(clamp(cross, -limit, limit) / Math.hypot(1, g)) - edge * 0.045, 'YXZ'));
  return out.multiply(_q.setFromAxisAngle(UP, yaw));
}

// the rotation taking a to b (shortest way), as an axis (length = sin of half the angle) and angle
function errorTo(a, b, err) {
  err.copy(a).invert().premultiply(b).normalize();
  if (err.w < 0) err.set(-err.x, -err.y, -err.z, -err.w);
  return err;
}

class AssistCore {
  constructor(gradeLimit = 1.3) {
    this.released = 0; this.locked = false; this.yaw = 0; this.rail = false; this.holdYaw = false;
    this.velocity = new THREE.Vector3(); this.desired = new THREE.Vector3();
    this.error = new THREE.Quaternion(); this.target = new THREE.Quaternion(); this.correction = new THREE.Quaternion();
    this.gradeLimit = gradeLimit;
  }
  reset() { this.released = 0; this.locked = false; this.velocity.set(0, 0, 0); }
  update(dt, q, yaw, grade, tLand, rate, held, rail = false, cross = 0, carry = 0, holdYaw = false, offset = 0) {
    this.correction.identity();
    if (dt <= 0) return this.correction;
    this.released = held ? 0 : this.released + dt;
    if (held || rail !== this.rail || holdYaw !== this.holdYaw) this.locked = false;
    this.rail = rail; this.holdYaw = holdYaw;
    // let go (for a moment) and turning slower than 2.8 rad/s: aim for the nearest clean landing
    const on = !held && this.released > 0.035 && rate < 2.8;
    if (on && !this.locked) { this.yaw = rail ? yaw : Math.round((yaw + carry - offset) / Math.PI) * Math.PI; this.locked = true; }
    if (on) {
      if (rail || holdYaw) this.yaw = yaw;
      const k = Number.isFinite(tLand) ? clamp((1.5 - tLand) / 1.2, 0, 1) : 0;
      groundPose(grade * k, this.yaw + (rail || holdYaw ? 0 : offset), 0, this.target, cross * k, this.gradeLimit);
      errorTo(q, this.target, this.error);
      this.desired.set(this.error.x, this.error.y, this.error.z);
      const s = this.desired.length(), ang = 2 * Math.atan2(s, this.error.w);
      // (up to 4.8 rad/s, eight times the angle left)
      this.desired.multiplyScalar(s > 1e-8 ? Math.min(4.8, ang * 8) / s : 0);
    } else this.desired.set(0, 0, 0);
    // eased in at 30 rad/s^2 (40 letting go of it while held)
    this.desired.sub(this.velocity).clampLength(0, (held ? 40 : 30) * dt);
    this.velocity.add(this.desired);
    const w = this.velocity.length();
    if (w > 1e-8) this.correction.setFromAxisAngle(_v.copy(this.velocity).multiplyScalar(1 / w), w * dt);
    return this.correction;
  }
}

// The landing assist on Cork7's open parks: the core as it is, squaring the body to the landing's
// slope (within +-1.3 of grade) as the snow comes up over the last 1.5 s
export class LandingAssist {
  constructor() { this.core = new AssistCore(1.3); }
  reset() { this.core.reset(); }
  update(dt, q, yaw, grade, tLand, rate, held, rail = false, cross = 0, carry = 0, holdYaw = false) {
    return this.core.update(dt, q, yaw, grade, tLand, rate, held, rail, cross, carry, holdYaw);
  }
}

// Keeping a flat spin flat: the body is eased level (to within 8 degrees of the pitch it already
// had) and, coming in to land (near 0..1), toward the landing's slope; up to 2.2 rad/s, eased in
// over the first 0.15 s of the air
const LEVEL_PITCH = Math.tan((8 * Math.PI) / 180);
export class AirLevel {
  constructor() {
    this.target = new THREE.Quaternion(); this.error = new THREE.Quaternion(); this.axis = new THREE.Vector3();
    this.up = new THREE.Vector3(); this.correction = new THREE.Quaternion();
  }
  update(dt, q, yaw, airTime, grade = 0, cross = 0, near = 0) {
    this.correction.identity();
    if (dt <= 0) return this.correction;
    this.up.set(0, 1, 0).applyQuaternion(q);
    const l = Math.min(LEVEL_PITCH, Math.tan(Math.acos(clamp(this.up.y, -1, 1)))), u = clamp(near, 0, 1);
    groundPose(l + (grade - l) * u, yaw, 0, this.target, cross * u);
    errorTo(q, this.target, this.error);
    this.axis.set(this.error.x, this.error.y, this.error.z);
    const s = this.axis.length(), ang = 2 * Math.atan2(s, this.error.w);
    if (s < 1e-8 || ang < 1e-4) return this.correction;
    const fade = clamp((airTime - 0.03) / 0.12, 0, 1);
    const rate = Math.min(2.2, ang * 7) * fade;
    return this.correction.setFromAxisAngle(this.axis.multiplyScalar(1 / s), Math.min(ang, rate * dt));
  }
}

// a landing on the tails or tips (the skis pitched more than 45 degrees to the snow) or rolled
// onto an edge (more than 0.35 rad), together, counts as off the landing: SAVED IT, not STOMPED
const _n = new THREE.Vector3();
export function offLanding(q, normal) {
  const p = Math.asin(clamp(_n.set(0, 0, 1).applyQuaternion(q).dot(normal), -1, 1)) / ((45 * Math.PI) / 180);
  const r = Math.asin(clamp(_n.set(1, 0, 0).applyQuaternion(q).dot(normal), -1, 1)) / 0.35;
  return p * p + r * r >= 1;
}
