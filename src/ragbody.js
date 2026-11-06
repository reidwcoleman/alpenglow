// The body once it's down: fifteen weighted joints with a radius each, thrown off at the speed of
// the fall. Gravity and the snow have it from there. It swings round to lie flat along the slide,
// on its back or front depending how it went down, the limbs letting go of whatever they were
// doing; each joint keeps clear of the snow, and contact scrubs the speed. RideSim runs it for the
// length of a crash, and the rider is drawn from it.
import * as THREE from 'three';
import { wallHit } from './snowedge.js';

const AIR_G = 17.5, STEP = 1 / 120;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const UP = new THREE.Vector3(0, 1, 0);

// the joints as they stand: x, y, z, radius, mass (x + is the rider's right)
const CORE = { Hips: [0, 0.99, 0, 0.19, 7], Chest: [0, 1.43, 0, 0.21, 8], Neck: [0, 1.65, 0, 0.1, 2], Head: [0, 1.83, 0, 0.16, 3] };
const SIDE = { Leg: [0.14, 0.99, 0, 0.14, 3], Knee: [0.14, 0.54, 0.045, 0.13, 2], Foot: [0.14, 0.14, 0, 0.11, 2], Arm: [0.245, 1.49, 0, 0.14, 2], Elbow: [0.44, 1.245, -0.012, 0.1, 1], Hand: [0.47, 0.94, 0.09, 0.08, 1] };
const LIMBS = [['Leg', 'Knee'], ['Knee', 'Foot'], ['Arm', 'Elbow'], ['Elbow', 'Hand']];

export class RagBody {
  constructor(ground, walls = false) {
    this.ground = ground; this.walls = walls;
    this.nodes = {}; this.rest = {}; this.bends = {};
    this.velocity = new THREE.Vector3(); this.origin = new THREE.Vector3();
    this.q = new THREE.Quaternion(); this.target = new THREE.Quaternion(); this.stance = new THREE.Quaternion();
    this.bend = new THREE.Quaternion(); this.none = new THREE.Quaternion();
    this.normal = new THREE.Vector3(); this.along = new THREE.Vector3(); this.right = new THREE.Vector3(); this.forward = new THREE.Vector3();
    this.basis = new THREE.Matrix4();
    this.slideHeading = 0; this.yawCarry = 0; this.slideOnBack = false;
    this.contacts = 0; this.age = 0; this.bracing = false; this.impact = 0; this.gentle = false;
    const add = (name, [x, y, z, radius, mass]) => {
      this.rest[name] = new THREE.Vector3(x, y, z);
      this.nodes[name] = { p: new THREE.Vector3(), old: new THREE.Vector3(), frame: new THREE.Vector3(), radius, mass };
    };
    for (const k in CORE) add(k, CORE[k]);
    for (const [s, m] of [['L', -1], ['R', 1]]) {
      for (const k in SIDE) { const v = SIDE[k]; add(`${k}_${s}`, [v[0] * m, v[1], v[2], v[3], v[4]]); }
      for (const [a, b] of LIMBS) {
        const kid = `${b}_${s}`, parent = `${a}_${s}`;
        this.bends[kid] = { parent, rest: this.rest[kid].clone().sub(this.rest[parent]), from: new THREE.Quaternion() };
      }
    }
  }

  // gear comes off a real fall, a moment after it starts
  get shedsEquipment() { return !this.gentle && this.age >= (this.bracing ? 0.13 : 0.025); }

  // down at (x, y, z): facing heading with the body at airQ turned by stance; moving (vx, vz);
  // impact: how hard it hit. bracing: flat onto the snow; gentle: a slip, not a slam
  start(x, y, z, heading, vx, vz, impact, spinVel, airQ, stance, bracing, gentle) {
    this.age = 0; this.bracing = bracing; this.impact = impact; this.gentle = gentle; this.contacts = 0;
    this.q.setFromAxisAngle(UP, heading).multiply(airQ).multiply(this.stance.setFromAxisAngle(UP, stance));
    this.slideHeading = Math.hypot(vx, vz) > 0.5 ? Math.atan2(vx, vz) : heading;
    this.forward.set(0, 0, 1).applyQuaternion(this.q);
    const sh = Math.sin(this.slideHeading), ch = Math.cos(this.slideHeading);
    this.slideOnBack = this.along.set(0, 1, 0).applyQuaternion(this.q).y > 0.25 ? this.forward.x * sh + this.forward.z * ch < 0 : Math.cos(stance) < 0;
    this.yawCarry = clamp(spinVel * 0.025, -0.18, 0.18);
    for (const k in this.bends) this.bends[k].from.identity();
    this.origin.set(x, y + 0.99, z);
    this.velocity.set(vx * 0.94, -clamp(impact * (gentle ? 0.18 : 0.3), 0.4, 15), vz * 0.94);
    this.pose(); this.clearWalls(true); this.support();
    for (const k in this.nodes) { const n = this.nodes[k]; n.old.copy(n.p).addScaledVector(this.velocity, -STEP); n.frame.copy(n.p); }
  }

  // the body as it was drawn the moment it went down (joint name to world position): it starts
  // from there, and the limbs let go of that pose instead of a standing one
  seed(at) {
    if (!at.Hips || !at.Chest || !at.Leg_L || !at.Leg_R) return;
    this.origin.copy(at.Hips);
    this.right.subVectors(at.Leg_R, at.Leg_L).normalize();
    this.along.subVectors(at.Chest, at.Hips).normalize();
    this.forward.crossVectors(this.right, this.along).normalize();
    this.along.crossVectors(this.forward, this.right).normalize();
    this.q.setFromRotationMatrix(this.basis.makeBasis(this.right, this.along, this.forward));
    const inverse = this.bend.copy(this.q).invert().clone();
    for (const k in this.bends) {
      const b = this.bends[k];
      if (!at[k] || !at[b.parent]) continue;
      this.normal.subVectors(at[k], at[b.parent]).normalize().applyQuaternion(inverse);
      b.from.setFromUnitVectors(this.along.copy(b.rest).normalize(), this.normal);
    }
    this.pose(); this.clearWalls(true); this.support();
    for (const k in this.nodes) { const n = this.nodes[k]; n.old.copy(n.p).addScaledVector(this.velocity, -STEP); n.frame.copy(n.p); }
  }

  // every joint from the body's place and turn, the limbs relaxing out of how they started
  pose() {
    const relax = 1 - Math.exp(-this.age * 9);
    for (const k in this.nodes) {
      const n = this.nodes[k], b = this.bends[k];
      if (b) n.p.copy(b.rest).applyQuaternion(this.bend.copy(b.from).slerp(this.none, relax)).applyQuaternion(this.q).add(this.nodes[b.parent].p);
      else n.p.copy(this.rest[k]).sub(this.rest.Hips).applyQuaternion(this.q).add(this.origin);
    }
  }

  // nothing goes under the snow: the whole body lifts by the worst joint
  support() {
    let lift = 0;
    for (const k in this.nodes) { const n = this.nodes[k]; lift = Math.max(lift, this.ground(n.p.x, n.p.z) + n.radius - n.p.y); }
    if (lift <= 0) return false;
    this.origin.y += lift;
    for (const k in this.nodes) this.nodes[k].p.y += lift;
    this.contacts++;
    return true;
  }

  // and nothing goes through a wall of snow
  clearWalls(first = false) {
    if (!this.walls) return;
    for (const k in this.nodes) {
      const n = this.nodes[k];
      const a = first ? { x: this.origin.x, y: n.p.y - n.radius, z: this.origin.z } : { x: n.old.x, y: n.old.y - n.radius, z: n.old.z };
      const b = { x: n.p.x, y: n.p.y - n.radius, z: n.p.z };
      const w = wallHit(this.ground, a, b, 0.18) ?? wallHit(this.ground, b, b, 0.18);
      if (!w) continue;
      const dx = w.x - n.p.x, dz = w.z - n.p.z;
      this.origin.x += dx; this.origin.z += dz;
      for (const j in this.nodes) { this.nodes[j].p.x += dx; this.nodes[j].p.z += dz; }
      const into = this.velocity.x * w.nx + this.velocity.z * w.nz;
      if (into < 0) { this.velocity.x -= w.nx * into; this.velocity.z -= w.nz * into; }
      this.contacts++;
    }
  }

  // getting up: the air drags harder once the rider is trying to stop
  update(dt, stopping) {
    if (dt <= 0) return;
    for (const k in this.nodes) this.nodes[k].frame.copy(this.nodes[k].p);
    const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n;
    this.contacts = 0;
    for (let i = 0; i < n; i++) {
      this.age += h;
      for (const k in this.nodes) this.nodes[k].old.copy(this.nodes[k].p);
      const { x, z } = this.origin, g = this.ground;
      this.normal.set(g(x - 0.3, z) - g(x + 0.3, z), 0.6, g(x, z - 0.3) - g(x, z + 0.3)).normalize();
      // flat on the slope, head along the slide, still carrying a little of the spin
      const yaw = this.slideHeading + this.yawCarry * Math.exp(-this.age * 3), sy = Math.sin(yaw), cy = Math.cos(yaw);
      this.along.set(sy, 0, cy).addScaledVector(this.normal, -(this.normal.x * sy + this.normal.z * cy)).normalize();
      this.forward.copy(this.normal).multiplyScalar(this.slideOnBack ? 1 : -1);
      this.right.crossVectors(this.along, this.forward).normalize();
      this.target.setFromRotationMatrix(this.basis.makeBasis(this.right, this.along, this.forward));
      this.q.slerp(this.target, 1 - Math.exp(-(this.gentle ? 10 : this.bracing ? 8 : 7) * h));
      this.velocity.y -= AIR_G * h;
      this.velocity.multiplyScalar(Math.exp(-(stopping ? (this.gentle ? 0.25 : 0.5) : 0.18) * h));
      this.origin.addScaledVector(this.velocity, h);
      this.pose();
      this.clearWalls();
      if (this.support()) {
        const vn = this.velocity.dot(this.normal);
        if (vn < 0) this.velocity.addScaledVector(this.normal, -vn);
        const sp = this.velocity.length();
        this.velocity.multiplyScalar(Math.max(0, 1 - (2.4 * h) / Math.max(sp, 0.001)));
      }
    }
  }

  // moved bodily (kept in bounds)
  translate(dx, dz) {
    this.origin.x += dx; this.origin.z += dz;
    for (const k in this.nodes) for (const v of [this.nodes[k].p, this.nodes[k].old, this.nodes[k].frame]) { v.x += dx; v.z += dz; }
  }
}
