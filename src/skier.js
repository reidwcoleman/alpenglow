// Ski physics shared by the player and every AI. Gravity, snow friction,
// air drag (upright vs tuck), edge grip that bends the velocity through a
// carve and turns into a speed-scrubbing skid past its limit, ballistic
// airtime off any crest or kicker, and crashes on bad landings or impacts.
import * as THREE from 'three';
import { heightAt, normalAt, centerX, halfWidth, centerSlope } from './course.js';
import { SkierModel } from './skiermodel.js';
import { clamp, smoothstep } from './noise.js';

const GRAV = 9.81;
const UP = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3(), _f = new THREE.Vector3(), _s = new THREE.Vector3(), _a = new THREE.Vector3();
const _t = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const near = [];

export function wrapAngle(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

export class Skier {
  constructor(world, opts) {
    this.world = world;
    this.name = opts.name ?? 'Skier';
    this.isPlayer = !!opts.isPlayer;
    this.grip = opts.grip ?? 1.45; // in g
    this.mass = 80;
    this.model = new SkierModel(opts.outfit, opts.bib ?? 0);
    world.scene.add(this.model.group);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.normal = new THREE.Vector3(0, 1, 0);
    this.controls = { steer: 0, tuck: 0, brake: 0, jump: false, grab: false, flip: 0 };
    this.onGround = true;
    this.airTime = 0;
    this.spin = 0; this.pitch = 0; this.flipAcc = 0; this.grabTime = 0;
    this.crash = 0; this.crashRot = new THREE.Vector3();
    this.lean = 0; this.latAcc = 0; this.skid = 0; this.skidYaw = 0; this.compress = 0;
    this.polePlant = 0; this.poleSide = 1; this.lastLeanSign = 0;
    this.trackDist = 0;
    this.stuck = 0;
    this.jumpCharge = 0;
    this.time = Math.random() * 10;
    this.listeners = {};
    this.trackSlot = world.tracks ? world.tracks.alloc() : null;
    this.lastTrickHeight = 0;
    this.maxAirY = 0;
  }

  on(evt, fn) { (this.listeners[evt] ??= []).push(fn); }
  emit(evt, data) { for (const fn of this.listeners[evt] ?? []) fn(data); }

  get speed() { return this.vel.length(); }

  place(x, z, heading = null, speed = 0) {
    this.pos.set(x, heightAt(x, z), z);
    const h = heading ?? Math.atan2(centerSlope(z), 1);
    this.heading = h;
    normalAt(x, z, this.normal);
    this.forward(_f);
    this.vel.copy(_f).multiplyScalar(speed);
    this.onGround = true; this.airTime = 0; this.crash = 0;
    this.spin = 0; this.pitch = 0; this.flipAcc = 0;
    this.stuck = 0; this.lean = 0; this.skid = 0;
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
    const dir = Math.atan2(centerSlope(z), 1);
    this.place(x, z, dir, 3);
    this.emit('respawn');
  }

  step(dt) {
    this.time += dt;
    const c = this.controls;
    if (this.crash > 0) return this.stepCrash(dt);
    if (this.onGround) this.stepGround(dt, c); else this.stepAir(dt, c);
    this.collide();
  }

  stepGround(dt, c) {
    const v = this.vel, n = normalAt(this.pos.x, this.pos.z, this.normal);
    const speed = v.length();
    // --- steering: carve radius tightens with edge, pivot when slow ---
    const R = 6.5 + speed * 0.3;
    const pivot = 2.4 * (1 - smoothstep(0, 9, speed));
    let steer = c.steer;
    const yawRate = -steer * Math.max(speed / R, pivot) * (1 - c.brake * 0.3);
    this.heading += yawRate * dt;

    const f = this.forward(_f);
    const side = _s.crossVectors(n, f).normalize(); // skier's left
    // --- forces ---
    _a.set(0, -GRAV, 0);
    const N = GRAV * Math.max(n.y, 0.2);
    const off = Math.abs(this.pos.x - centerX(this.pos.z)) / halfWidth(this.pos.z);
    const powder = smoothstep(1.0, 1.25, off);
    if (speed > 0.05) {
      const mu = 0.042 + powder * 0.07;
      _a.addScaledVector(v, -(mu * N) / speed);
      const CdA = 0.56 - 0.34 * c.tuck + powder * 0.1;
      const k = (0.5 * 1.2 * CdA) / this.mass;
      _a.addScaledVector(v, -k * speed);
    }
    // skating / poling to get going on the flats
    const vLong0 = v.dot(f);
    if (c.tuck > 0.5 && vLong0 < 7 && c.brake < 0.1) _a.addScaledVector(f, 2.4 * (1 - vLong0 / 7));
    // hockey stop / snowplough
    if (c.brake > 0 && speed > 0.1) {
      const b = c.brake * (0.55 * GRAV * N / GRAV + 0.004 * speed * speed);
      _a.addScaledVector(v, -Math.min(b, speed / dt) / speed);
    }
    v.addScaledVector(_a, dt);

    // --- edge grip: bend velocity toward the ski, skid when it can't ---
    const vLat = v.dot(side);
    const maxGrip = this.grip * N * (1 - c.brake * 0.6) * (1 - powder * 0.25);
    const need = -vLat / dt;
    const applied = clamp(need, -maxGrip, maxGrip);
    v.addScaledVector(side, applied * dt);
    const rem = Math.abs(vLat + applied * dt);
    this.latAcc = this.latAcc * 0.8 + applied * 0.2;
    // skidding scrubs speed
    const skid = Math.min(rem, 6);
    if (skid > 0.05) {
      const sp = v.length();
      if (sp > 0.01) v.multiplyScalar(Math.max(0, sp - skid * 0.9 * GRAV * 0.55 * dt) / sp);
    }
    this.skid = this.skid * 0.85 + (skid + c.brake * Math.min(speed, 12) * 0.25) * 0.15;
    // going backwards: turn around (slowly)
    if (vLong0 < -1) this.heading += wrapAngle(Math.atan2(v.x, v.z) - this.heading) * dt * 2;

    // jump (ollie) on release
    if (c.jump) this.jumpCharge = Math.min(1, this.jumpCharge + dt * 2.5);
    let pop = 0;
    if (!c.jump && this.jumpCharge > 0) { pop = 2.2 + this.jumpCharge * 2.6; this.jumpCharge = 0; }

    // integrate and follow the ground (leaving it over crests)
    this.pos.addScaledVector(v, dt);
    if (pop > 0) { v.addScaledVector(n, pop); this.pos.addScaledVector(n, 0.05); }
    const gy = heightAt(this.pos.x, this.pos.z);
    if (this.pos.y > gy + 0.03) {
      this.onGround = false; this.airTime = 0; this.spin = 0; this.pitch = 0; this.flipAcc = 0;
      this.grabTime = 0; this.maxAirY = this.pos.y - gy; this.takeoffZ = this.pos.z;
      if (this.trackSlot) this.trackSlot.break();
      this.emit('takeoff', { pop: pop > 0 });
    } else {
      this.pos.y = gy;
      normalAt(this.pos.x, this.pos.z, n);
      const vn = v.dot(n);
      if (vn < 0) v.addScaledVector(n, -vn);
    }

    // visual lean from lateral acceleration
    const leanT = clamp(Math.atan2(-this.latAcc, GRAV) * 0.85, -0.88, 0.88) * smoothstep(1.5, 6, speed);
    this.lean += (leanT - this.lean) * Math.min(1, dt * 10);
    const sgn = Math.sign(this.lean);
    if (Math.abs(this.lean) > 0.25 && sgn !== this.lastLeanSign) {
      this.lastLeanSign = sgn;
      this.polePlant = 1; this.poleSide = sgn > 0 ? -1 : 1; // inside hand
    }
    this.polePlant = Math.max(0, this.polePlant - dt * 3);
    const skidT = c.brake * (this.skidSide ?? 1) * 1.15;
    this.skidYaw += (skidT - this.skidYaw) * Math.min(1, dt * 7);
    if (c.brake === 0) this.skidSide = Math.sign(steer || this.lean || 1) * -1;
    this.compress = Math.max(0, this.compress - dt * 2.5);

    // ski tracks
    this.trackDist += speed * dt;
    if (this.trackSlot && this.trackDist > 0.45) {
      this.trackDist = 0;
      this.trackSlot.add(this.pos, this.forward(_t), n, this.skid);
    }
    this.stuck = speed < 0.6 ? this.stuck + dt : 0;
  }

  stepAir(dt, c) {
    const v = this.vel;
    this.airTime += dt;
    v.y -= GRAV * dt;
    const sp = v.length();
    const k = (0.5 * 1.2 * (0.6 - 0.2 * c.tuck)) / this.mass;
    v.addScaledVector(v, -k * sp * dt);
    // spins and flips
    const spinRate = -c.steer * 6.6;
    this.heading += spinRate * dt;
    this.spin += spinRate * dt;
    if (this.airTime > 0.12) {
      this.pitch += c.flip * 6.0 * dt;
      this.flipAcc += c.flip * 6.0 * dt;
    }
    // without input the body settles back toward level...
    if (c.flip === 0) {
      const target = Math.round(this.pitch / (Math.PI * 2)) * Math.PI * 2;
      this.pitch += (target - this.pitch) * Math.min(1, dt * 4);
    }
    // ...and a released spin finishes at the nearest half turn (lands forward or switch)
    if (Math.abs(c.steer) < 0.15 && this.airTime > 0.15) {
      const hor = Math.atan2(v.x, v.z);
      const rel = this.heading - hor;
      const target = hor + Math.round(rel / Math.PI) * Math.PI;
      const d = target - this.heading;
      const step = Math.sign(d) * Math.min(Math.abs(d), dt * 5.5);
      this.heading += step; this.spin += step;
    }
    if (c.grab) this.grabTime += dt;
    this.pos.addScaledVector(v, dt);
    const gy = heightAt(this.pos.x, this.pos.z);
    this.maxAirY = Math.max(this.maxAirY, this.pos.y - gy);
    this.lean *= 1 - Math.min(1, dt * 4);
    if (this.pos.y <= gy) this.land(gy);
  }

  land(gy) {
    const v = this.vel;
    this.pos.y = gy;
    const n = normalAt(this.pos.x, this.pos.z, this.normal);
    const vn = -v.dot(n);
    const hor = Math.atan2(v.x, v.z);
    const mis = Math.abs(wrapAngle(this.heading - hor));
    const pErr = Math.abs(wrapAngle(this.pitch));
    const big = this.airTime > 0.3;
    const crash = big && (pErr > 0.75 || (mis > 0.95 && mis < 2.25) || vn > 15.5 || (this.controls.grab && this.airTime > 0.3 && vn > 6));
    if (!crash && mis >= 2.25) this.heading += Math.PI; // land switch, swing around
    v.addScaledVector(n, Math.max(0, vn));
    // flat landings cost speed
    v.multiplyScalar(1 - clamp((vn - 4) * 0.03, 0, 0.35));
    this.onGround = true;
    this.compress = clamp(vn / 9, 0.2, 1);
    const trick = {
      air: this.airTime, height: this.maxAirY, vn,
      spin: Math.round(Math.abs(this.spin) / Math.PI) * 180,
      flips: Math.round(Math.abs(this.flipAcc) / (Math.PI * 2)),
      flipDir: Math.sign(this.flipAcc), grab: this.grabTime > 0.25, clean: !crash,
    };
    this.pitch = 0; this.spin = 0; this.flipAcc = 0;
    if (this.trackSlot) this.trackSlot.break();
    if (crash) this.startCrash('landing'); else this.emit('land', trick);
  }

  startCrash(reason) {
    if (this.crash > 0) return;
    this.crash = 2.6;
    this.crashRot.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 8);
    this.onGround = true;
    this.emit('crash', { reason, speed: this.speed });
  }

  stepCrash(dt) {
    this.crash -= dt;
    const v = this.vel;
    v.y -= GRAV * dt;
    const sp = Math.hypot(v.x, v.z);
    if (sp > 0.01) {
      const d = Math.min(sp, (0.55 * GRAV + sp * 0.1) * dt);
      v.x -= (v.x / sp) * d; v.z -= (v.z / sp) * d;
    }
    this.pos.addScaledVector(v, dt);
    const gy = heightAt(this.pos.x, this.pos.z);
    if (this.pos.y < gy) { this.pos.y = gy; if (v.y < 0) v.y = -v.y * 0.25; }
    this.crashRot.multiplyScalar(1 - Math.min(1, dt * 1.2));
    if (this.crash <= 0) this.respawn();
  }

  collide() {
    const w = this.world;
    if (!w.forest) return;
    w.forest.query(this.pos.x, this.pos.z, near);
    for (const o of near) {
      const dx = this.pos.x - o.x, dz = this.pos.z - o.z;
      const minD = o.r + 0.35;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minD * minD) continue;
      const gy = heightAt(o.x, o.z);
      if (o.top && this.pos.y > gy + o.top) continue;
      const d = Math.sqrt(d2) || 0.01;
      const nx = dx / d, nz = dz / d;
      const into = -(this.vel.x * nx + this.vel.z * nz);
      this.pos.x = o.x + nx * minD; this.pos.z = o.z + nz * minD;
      if (into > 0) {
        if (into > 6.5 && this.crash <= 0) {
          this.startCrash(o.kind);
          this.emit('impact', { kind: o.kind, x: o.x, z: o.z });
        }
        this.vel.x += nx * into * 1.15; this.vel.z += nz * into * 1.15;
      }
    }
  }

  // ---- visuals ----
  updateVisual(dt, camPos) {
    const m = this.model;
    const g = m.group;
    g.position.copy(this.pos);
    const airK = this.onGround ? 0 : smoothstep(0.05, 0.35, this.airTime);
    _t.copy(this.normal).lerp(UP, this.onGround ? 0.15 : 0.8).normalize();
    _q.setFromUnitVectors(UP, _t);
    _q2.setFromAxisAngle(UP, this.heading + this.skidYaw);
    g.quaternion.copy(_q).multiply(_q2);
    if (this.pitch !== 0) g.quaternion.multiply(_q2.setFromAxisAngle(_t.set(1, 0, 0), -this.pitch));
    if (this.crash > 0) {
      const k = clamp(this.crash / 2.6, 0, 1);
      g.quaternion.multiply(_q2.setFromEuler(new THREE.Euler(
        Math.sin(this.time * this.crashRot.x) * 1.3 * k + (1 - k) * 1.35,
        this.time * this.crashRot.y * k,
        Math.sin(this.time * this.crashRot.z) * 1.2 * k)));
      g.position.y += 0.25;
    }
    const dist = camPos ? camPos.distanceTo(this.pos) : 0;
    m.setDetail(dist < 70);
    m.group.visible = dist < 1400;
    if (!m.group.visible) return;
    if (dist > 180 && (Math.floor(this.time * 60) % 3) !== 0) return; // pose far skiers less often
    const sp = this.speed;
    m.pose({
      lean: this.lean,
      angulate: 0.55,
      crouch: clamp(0.18 + Math.abs(this.lean) * 0.45 + this.compress * 0.7 + this.jumpCharge * 0.5 + (this.controls.brake > 0 ? 0.25 : 0), 0, 1),
      tuck: this.crash > 0 ? 0 : clamp(this.controls.tuck * smoothstep(5, 9, sp), 0, 1) * (1 - airK * 0.5),
      plow: this.controls.brake > 0 && sp < 9 && !this.isPlayer ? 1 : 0,
      air: airK,
      grab: this.controls.grab && airK > 0 ? 1 : 0,
      grabTip: this.controls.grab && airK > 0 ? 1 : 0,
      polePlant: Math.sin(this.polePlant * Math.PI),
      poleSide: this.poleSide,
      crash: this.crash > 0,
      t: this.time,
    });
  }

  dispose() {
    this.world.scene.remove(this.model.group);
  }
}
