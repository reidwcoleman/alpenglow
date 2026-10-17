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
    this.dir.lerp(want, this.snap ? 1 : Math.min(1, dt * (s.onGround ? 3.2 : 1.2))).normalize();
    const cam = this.cam;
    let fov = 62 + clamp(sp - 8, 0, 30) * 0.55;
    const tgt = new THREE.Vector3();
    const look = new THREE.Vector3();
    if (this.mode === 'chase' || this.mode === 'action') {
      const close = this.mode === 'action';
      const dist = close ? 2.7 + sp * 0.015 : 4.3 + sp * 0.045;
      const h = close ? 1.0 : 1.75 + sp * 0.01;
      tgt.copy(s.pos).addScaledVector(this.dir, -dist);
      tgt.y = Math.max(s.pos.y + h, heightAt(tgt.x, tgt.z) + (close ? 0.6 : 1.3));
      look.copy(s.pos).addScaledVector(this.dir, close ? 3.5 : 4.5);
      look.y = s.pos.y + (close ? 0.75 : 0.9) - (close ? 0 : sp * 0.004);
      if (close) fov += 8;
    } else if (this.mode === 'helmet') {
      const fwd = new THREE.Vector3(Math.sin(s.heading), 0, Math.cos(s.heading));
      tgt.copy(s.pos).addScaledVector(fwd, 0.15);
      tgt.y += 1.55 - s.controls.tuck * 0.5;
      look.copy(tgt).addScaledVector(this.dir, 10);
      look.y = heightAt(look.x, look.z) + 1.0;
      fov += 6;
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
    const k = this.mode === 'helmet' ? 1 : this.mode === 'tv' ? 1 : Math.min(1, dt * 7);
    this.pos.lerp(tgt, k);
    this.look.lerp(look, Math.min(1, dt * 12));
    cam.position.copy(this.pos);
    // speed buzz + impact shake
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const buzz = smoothstep(18, 40, sp) * 0.012 * (s.onGround ? 1 : 0.2) + this.shake * 0.12;
    if (buzz > 0) {
      cam.position.x += (Math.sin(this.t * 47) + Math.sin(this.t * 31)) * buzz;
      cam.position.y += (Math.sin(this.t * 53) + Math.sin(this.t * 23)) * buzz;
    }
    cam.lookAt(this.look);
    if (this.mode === 'helmet') cam.rotateZ(-s.lean * 0.35);
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 3);
    cam.updateProjectionMatrix();
  }

  // menu: cinematic shots that track AI skiers down the mountain
  menu(dt, t, skiers) {
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
