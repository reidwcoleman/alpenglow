// Chase, low action, helmet and trackside cameras.
import * as THREE from 'three';
import { heightAt, centerX, halfWidth } from './course.js';
import { clamp, smoothstep } from './noise.js';

export const CAM_MODES = ['chase', 'action', 'helmet', 'tv'];

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.mode = 'chase';
    this.dir = new THREE.Vector3(0, 0, 1);
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.shake = 0;
    this.t = 0;
    this.tvSpot = null;
    this.snap = true;
  }

  cycle() {
    this.mode = CAM_MODES[(CAM_MODES.indexOf(this.mode) + 1) % CAM_MODES.length];
    this.snap = true; this.tvSpot = null;
    return this.mode;
  }

  bump(k) { this.shake = Math.max(this.shake, k); }

  update(dt, s) {
    this.t += dt;
    const sp = s.speed;
    const hv = new THREE.Vector3(s.vel.x, 0, s.vel.z);
    const want = hv.lengthSq() > 4 ? hv.normalize() : new THREE.Vector3(Math.sin(s.heading), 0, Math.cos(s.heading));
    // (Cork7's chase turns with you quickly, a little lazier through a hard carve)
    const turnK = this.mode === 'chase' ? 6 - 2.5 * Math.min(1, Math.abs(s.lean ?? 0)) : 3.2;
    this.dir.lerp(want, this.snap ? 1 : Math.min(1, dt * (s.onGround || s.grind ? turnK : 1.2))).normalize();
    const cam = this.cam;
    let fov = 62 + clamp(sp - 8, 0, 30) * 0.55;
    const tgt = new THREE.Vector3();
    const look = new THREE.Vector3();
    // big airs: the camera eases out and up to frame the whole trick and the landing
    const airT = s.onGround || s.grind || s.crash > 0 ? 0 : s.airTime;
    const big = smoothstep(0.25, 1.1, airT) * smoothstep(1.2, 5, s.maxAirY ?? 0);
    this.pull = (this.pull ?? 0) + (big - (this.pull ?? 0)) * Math.min(1, dt * (big > (this.pull ?? 0) ? 1.6 : 1.1));
    if (this.mode === 'chase') {
      // Cork7's rig: 4.3 m back and 1.3 m up on an arm that lies back along the slope, a little
      // to the side, a 58 degree lens that opens 8 more toward 38 m/s, the view tipped down the
      // hill but never letting the rider out of the frame (and pulled back for a big air)
      const pull = this.pull;
      const x0 = s.pos.x, z0 = s.pos.z, g0 = heightAt(x0, z0);
      const gr = clamp((heightAt(x0 + this.dir.x * 8, z0 + this.dir.z * 8) - g0) / 8, -1.1, 1.1);
      this.grade = (this.grade ?? gr) + (gr - (this.grade ?? gr)) * Math.min(1, dt * (s.onGround || s.grind ? 4 : 0.8));
      const portrait = clamp(1.2 - cam.aspect, 0, 0.7);
      const b = (4.3 + portrait * 1.6) * (1 + 0.5 * pull), hh = 1.3 + 1.6 * pull;
      const C = Math.atan(clamp(Math.min(0, this.grade), -0.9, 0));
      const E = b * Math.cos(C) + hh * Math.sin(C), D = hh * Math.cos(C) - b * Math.sin(C);
      // through a carve the camera swings out to the side of the turn
      this.swing = (this.swing ?? 0) + ((s.onGround ? -s.lean * 0.8 : 0) - (this.swing ?? 0)) * Math.min(1, dt * 2.5);
      const side = new THREE.Vector3(this.dir.z, 0, -this.dir.x);
      tgt.copy(s.pos).addScaledVector(this.dir, -E).addScaledVector(side, 0.42 + this.swing);
      // (kept 0.6 m over the snow all along the arm)
      let floor = heightAt(tgt.x, tgt.z);
      for (let k = 1; k <= 8; k++) floor = Math.max(floor, heightAt(tgt.x + this.dir.x * E * k / 8, tgt.z + this.dir.z * E * k / 8));
      tgt.y = Math.max(s.pos.y + D, floor + 0.6);
      fov = 58 + 8 * (clamp(sp, 0, 38) / 38) ** 2 + 18 * portrait + 6 * pull;
      const hd = Math.max(0.5, Math.hypot(x0 - tgt.x, z0 - tgt.z)), tv = Math.tan((fov * Math.PI) / 360);
      const riderA = Math.atan2(s.pos.y + 1 - tgt.y, hd);
      const slopeA = Math.atan(clamp(Math.min(0, this.grade), -0.9, 0) + clamp(Math.max(0, this.grade), 0, 0.8) * 0.6);
      const tilt = clamp(slopeA, riderA - Math.atan(tv * 0.33), riderA + Math.atan(tv * 0.47));
      look.copy(tgt).addScaledVector(this.dir, 12);
      look.y = tgt.y + Math.tan(tilt) * 12;
    } else if (this.mode === 'action') {
      const close = true;
      const dist = close ? 2.7 + sp * 0.015 : 4.3 + sp * 0.045;
      const h = close ? 1.0 : 1.75 + sp * 0.01;
      tgt.copy(s.pos).addScaledVector(this.dir, -dist);
      tgt.y = Math.max(s.pos.y + h, heightAt(tgt.x, tgt.z) + (close ? 0.6 : 1.3));
      look.copy(s.pos).addScaledVector(this.dir, close ? 3.5 : 4.5);
      look.y = s.pos.y + (close ? 0.75 : 0.9) - (close ? 0 : sp * 0.004);
      if (close) fov += 8;
    } else if (this.mode === 'helmet') {
      // at the rider's goggles (posed last frame, carried along by this frame's motion)
      const gog = s.model.parts.goggles;
      if (s.visPos && gog) {
        gog.getWorldPosition(tgt);
        tgt.sub(s.visPos).add(s.pos).addScaledVector(this.dir, 0.16);
      } else {
        tgt.copy(s.pos).addScaledVector(new THREE.Vector3(Math.sin(s.heading), 0, Math.cos(s.heading)), 0.15);
        tgt.y += 1.55 - s.controls.tuck * 0.5;
      }
      look.copy(tgt).addScaledVector(this.dir, 10);
      look.y = heightAt(look.x, look.z) + 1.0;
      fov += 6;
      if (!s.onGround && s.crash <= 0) {
        // in the air the view turns with every spin and flip
        const q = s.model.group.quaternion;
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
        const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
        tgt.copy(s.model.group.position).addScaledVector(up, 1.55).addScaledVector(f, 0.12);
        if (s.visPos) tgt.sub(s.visPos).add(s.pos);
        look.copy(tgt).addScaledVector(f, 10).addScaledVector(up, -2.5);
        this.helmUp = up;
      }
    } else {
      // trackside TV camera: pick a spot ahead at the piste edge, hold until passed
      if (!this.tvSpot || s.pos.z > this.tvSpot.z + 25 || s.pos.distanceTo(this.tvSpot) > 140) {
        const z = s.pos.z + 60 + Math.random() * 30;
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = centerX(z) + side * (halfWidth(z) + 6);
        this.tvSpot = new THREE.Vector3(x, heightAt(x, z) + 2.5 + Math.random() * 4, z);
        this.snap = true;
      }
      tgt.copy(this.tvSpot);
      look.copy(s.pos); look.y += 0.9;
      const d = this.tvSpot.distanceTo(s.pos);
      fov = clamp(1400 / Math.max(d, 8), 12, 55);
    }
    if (s.crash > 0 && this.mode === 'helmet') {
      tgt.copy(s.pos).addScaledVector(this.dir, -4); tgt.y += 2.2; look.copy(s.pos);
    }
    if (this.snap) { this.pos.copy(tgt); this.look.copy(look); this.snap = false; }
    const k = this.mode === 'helmet' ? 1 : this.mode === 'tv' ? 1 : Math.min(1, dt * (this.mode === 'chase' ? 9 : 7));
    this.pos.lerp(tgt, k);
    this.look.lerp(look, Math.min(1, dt * 12));
    cam.position.copy(this.pos);
    // our own helmet would fill the view
    s.model.hideHead?.(this.mode === 'helmet' && s.crash <= 0);
    // speed buzz + impact shake
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const buzz = smoothstep(18, 40, sp) * 0.012 * (s.onGround ? 1 : 0.2) + this.shake * 0.12;
    if (buzz > 0) {
      cam.position.x += (Math.sin(this.t * 47) + Math.sin(this.t * 31)) * buzz;
      cam.position.y += (Math.sin(this.t * 53) + Math.sin(this.t * 23)) * buzz;
    }
    const airHelm = this.mode === 'helmet' && this.helmUp && !s.onGround && s.crash <= 0;
    if (airHelm) { this.pos.copy(tgt); this.look.copy(look); cam.position.copy(tgt); cam.up.copy(this.helmUp); } else cam.up.set(0, 1, 0);
    this.helmUp = null;
    cam.lookAt(this.look);
    if (this.mode === 'helmet' && !airHelm) cam.rotateZ(-s.lean * 0.35);
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 3);
    cam.updateProjectionMatrix();
  }

  // menu: cinematic shots that track AI skiers down the mountain
  menu(dt, t, skiers) {
    this.cam.up.set(0, 1, 0);
    this.shotT = (this.shotT ?? 99) + dt;
    const ok = (s) => s && s.crash <= 0 && s.pos.z > 120 && s.pos.z < 3200 && s.speed > 8;
    if (this.shotT > 9 || !ok(this.subject)) {
      const pool = skiers.filter((s) => ok(s) && s.ai && s.ai.style !== 'beginner');
      if (pool.length) {
        this.subject = pool[Math.floor(Math.random() * pool.length)];
        this.shotT = 0;
        this.shot = Math.floor(Math.random() * 3);
        this.side = Math.random() < 0.5 ? -1 : 1;
        this.dir.set(this.subject.vel.x, 0, this.subject.vel.z).normalize();
        this.menuSnap = true;
      }
    }
    const s = this.subject;
    if (!s) return;
    const want = new THREE.Vector3(s.vel.x, 0, s.vel.z);
    if (want.lengthSq() > 1) this.dir.lerp(want.normalize(), Math.min(1, dt * 1.5)).normalize();
    const side = new THREE.Vector3(this.dir.z, 0, -this.dir.x).multiplyScalar(this.side);
    const k = this.shotT / 9;
    const tgt = new THREE.Vector3();
    let fov = 50;
    if (this.shot === 0) { // low tracking shot alongside
      tgt.copy(s.pos).addScaledVector(side, 7 - k * 2).addScaledVector(this.dir, 3 - k * 6);
      tgt.y = Math.max(tgt.y + 1.4, heightAt(tgt.x, tgt.z) + 1.0);
      fov = 46;
    } else if (this.shot === 1) { // high drone from behind, rising
      tgt.copy(s.pos).addScaledVector(this.dir, -16).addScaledVector(side, 5);
      tgt.y = s.pos.y + 7 + k * 9;
      fov = 55;
    } else { // telephoto from ahead, skier coming at camera
      tgt.copy(s.pos).addScaledVector(this.dir, 34 - k * 10).addScaledVector(side, 10);
      tgt.y = Math.max(s.pos.y + 3, heightAt(tgt.x, tgt.z) + 2);
      fov = 24;
    }
    if (this.menuSnap) { this.pos.copy(tgt); this.menuSnap = false; }
    this.pos.lerp(tgt, Math.min(1, dt * 3));
    this.cam.position.copy(this.pos);
    this.look.copy(s.pos); this.look.y += 1.0;
    // compose with the skier left of centre: the menu panel sits on the left
    this.cam.lookAt(this.look);
    this.cam.fov = fov; this.cam.updateProjectionMatrix();
  }
}
