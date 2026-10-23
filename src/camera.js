// Chase, low action, helmet and trackside cameras.
import * as THREE from 'three';
import { heightAt, centerX, halfWidth } from './course.js';
import { clamp, smoothstep } from './noise.js';

export const CAM_MODES = ['chase', 'action', 'helmet', 'drone', 'tv'];
// (Cork7's ranges and defaults, as its Settings sliders have them)
export const CAM_RANGE = { height: [0.8, 3.2, 0.1], angle: [-10, 50, 1], distance: [1.5, 8, 0.1], fov: [50, 100, 1], stiffness: [0, 100, 5], slopeTilt: [0, 100, 5] };
export const CAM_DEFAULTS = { height: 1.3, angle: 0, distance: 4.3, fov: 58, speedFov: true, stiffness: 50, slopeTilt: 100, trickCam: true };

const _rl = new THREE.Vector3();

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
    // Settings > Camera, Cork7's rig: height and distance of the arm, how far the view tips down
    // (angle), the lens and whether it widens with speed, how tightly it follows (stiffness), how
    // far it tips with the slope (tilt) and the trick cam
    this.opt = { ...CAM_DEFAULTS };
    // hold the right mouse button to look around
    this.free = { on: false, yaw: 0, pitch: 0 };
    addEventListener('pointerdown', (e) => { if (e.button === 2 && e.target?.tagName === 'CANVAS') { this.free.on = true; e.preventDefault(); } });
    addEventListener('pointermove', (e) => {
      if (!this.free.on) return;
      if (!(e.buttons & 2)) { this.free.on = false; return; }
      this.free.yaw = clamp(this.free.yaw - e.movementX * 0.005, -Math.PI, Math.PI);
      this.free.pitch = clamp(this.free.pitch + e.movementY * 0.004, -0.35, 0.7);
    });
    addEventListener('pointerup', (e) => { if (e.button === 2) this.free.on = false; });
    addEventListener('blur', () => { this.free.on = false; });
    addEventListener('contextmenu', (e) => { if (e.target?.tagName === 'CANVAS') e.preventDefault(); });
  }

  cycle() {
    this.mode = CAM_MODES[(CAM_MODES.indexOf(this.mode) + 1) % CAM_MODES.length];
    this.snap = true; this.tvSpot = null;
    return this.mode;
  }

  bump(k) { this.shake = Math.max(this.shake, k * 0.6); }

  // where and when the rider comes down (Cork7's own probe: ballistic, then bisected onto the snow)
  predictLand(s) {
    const p = s.pos, v = s.vel, g = 0.5 * (s.airG ?? 9.81);
    let a = 0, b = 0.12;
    for (; b < 7; b += 0.12) { if (p.y + v.y * b - g * b * b <= heightAt(p.x + v.x * b, p.z + v.z * b)) break; a = b; }
    for (let i = 0; i < 6; i++) { const m = (a + b) / 2; if (p.y + v.y * m - g * m * m > heightAt(p.x + v.x * m, p.z + v.z * m)) a = m; else b = m; }
    this.td = this.td ?? new THREE.Vector3();
    this.td.set(p.x + v.x * b, 0, p.z + v.z * b);
    this.td.y = heightAt(this.td.x, this.td.z);
    this.tdIn = b;
  }

  update(dt, s) {
    this.t += dt;
    const sp = s.speed;
    const hv = new THREE.Vector3(s.vel.x, 0, s.vel.z);
    const want = hv.lengthSq() > 4 ? hv.normalize() : new THREE.Vector3(Math.sin(s.heading), 0, Math.cos(s.heading));
    // (Cork7's chase turns with you quickly, a little lazier through a hard carve)
    const O = this.opt, stiff = 0.5 + O.stiffness / 100;
    const turnK = this.mode === 'chase' ? (6 - 2.5 * Math.min(1, Math.abs(s.lean ?? 0))) * stiff : 3.2;
    this.dir.lerp(want, this.snap ? 1 : Math.min(1, dt * (s.onGround || s.grind ? turnK : 1.2))).normalize();
    const cam = this.cam;
    let fov = 62 + clamp(sp - 8, 0, 30) * 0.55;
    const tgt = new THREE.Vector3();
    const look = new THREE.Vector3();
    // Cork7's trick cam: an air that will last more than ~1.3 s eases the camera back, up and out
    // to the side so the whole trick reads, aimed partway toward where it comes down, and hands
    // back to the chase in the last third of a second
    const inAir = !s.onGround && !s.grind && s.crash <= 0;
    let big = 0;
    if (inAir) {
      this.predictLand(s);
      const tot = s.airTime + this.tdIn;
      big = O.trickCam ? clamp((tot - 1.3) / 0.7, 0, 1) * clamp(this.tdIn / 0.35, 0, 1) : 0;
    }
    this.pull = (this.pull ?? 0) + (big - (this.pull ?? 0)) * (1 - Math.exp(-(big > (this.pull ?? 0) ? 3 : 5) * dt));
    if (this.mode === 'chase') {
      // Cork7's rig: 4.3 m back and 1.3 m up on an arm that lies back along the slope, a little
      // to the side, a 58 degree lens that opens 8 more toward 38 m/s, the view tipped down the
      // hill but never letting the rider out of the frame (and pulled back for a big air)
      const pull = this.pull;
      const x0 = s.pos.x, z0 = s.pos.z, g0 = heightAt(x0, z0);
      // the grade the view follows (Cork7's): on the snow, the way the rider is actually moving
      // (up a kicker that's its ramp) or the slope just ahead; in the air it starts from the one he
      // left on, so off a kicker it looks up at him against the sky, and only through the flight
      // comes round to the landing, steeper as he drops toward it
      const hor = Math.hypot(x0 - (this.lx ?? x0), z0 - (this.lz ?? z0));
      if (inAir && !this.wasAir) this.tg = this.grade ?? 0;
      let gr;
      if (inAir) {
        const T = this.td, r = clamp((heightAt(T.x + this.dir.x * 8, T.z + this.dir.z * 8) - T.y) / 8, -1.1, 1.1);
        const i = clamp(s.airTime / Math.max(0.25, s.airTime + this.tdIn), 0, 1), a = clamp((s.airTime + this.tdIn - 0.6) / 0.6, 0, 1);
        const c = clamp((T.y - s.pos.y) / Math.max(4, Math.hypot(T.x - x0, T.z - z0)), -1.1, 0), l = clamp((-s.vel.y - 2) / 6, 0, 1);
        const u = this.tg + (r - this.tg) * i, d = Math.min(u, u + (c - u) * l);
        gr = this.tg + (d - this.tg) * a;
      } else {
        const ahead = (heightAt(x0 + this.dir.x * 8, z0 + this.dir.z * 8) - g0) / 8;
        gr = clamp(hor > 1e-3 ? Math.max((s.pos.y - (this.ly ?? s.pos.y)) / hor, ahead * 0.8) : ahead, -1.1, 1.1);
      }
      this.grade = (this.grade ?? gr) + (gr - (this.grade ?? gr)) * Math.min(1, dt * (inAir ? 3.3 : 2));
      // (the arm's own angle holds through the air, and after a landing eases back over a second)
      this.since = inAir ? 0 : (this.since ?? 9) + dt;
      if (!inAir) this.armGrade = this.since > 1.2 || this.armGrade == null ? this.grade : this.armGrade + (this.grade - this.armGrade) * Math.min(1, dt * (this.since < 0.6 ? 6 : 3));
      this.wasAir = inAir; this.lx = x0; this.lz = z0; this.ly = s.pos.y;
      const portrait = clamp(1.2 - cam.aspect, 0, 0.7);
      const b = (O.distance + portrait * 1.6) * (1 + 0.5 * pull), hh = O.height + 1.6 * pull;
      // (the rider's height on a spring: rollers and bumps don't jolt the view)
      const ry = s.onGround ? s.pos.y : s.pos.y + (this.airOff ?? 0);
      if (this.snap || this.ry == null) { this.ry = ry; this.ryV = 0; }
      else if (inAir) { this.ry = s.pos.y; this.ryV = s.vel.y; }
      else {
        const T = 0.12 / stiff, w = 2 / T, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
        const ch = this.ry - ry, tmp = (this.ryV + w * ch) * dt;
        this.ryV = (this.ryV - w * tmp) * e;
        this.ry = clamp(ry + (ch + tmp) * e, s.pos.y - 0.5, s.pos.y + 0.5);
      }
      // (free look swings the arm round the rider and up or down)
      const fr = this.free;
      if (!fr.on) { const k = 1 - Math.exp(-4 * dt); fr.yaw -= fr.yaw * k; fr.pitch -= fr.pitch * k; }
      const C = Math.atan(clamp(Math.min(0, this.armGrade ?? this.grade), -0.9, 0)) * O.slopeTilt / 100;
      let E = b * Math.cos(C) + hh * Math.sin(C), D = hh * Math.cos(C) - b * Math.sin(C);
      if (fr.pitch) { const r = Math.hypot(E, D), a = clamp(Math.atan2(D, E) + fr.pitch, -0.1, 1.3); E = r * Math.cos(a); D = r * Math.sin(a); }
      const adir = this.dir.clone();
      if (fr.yaw) adir.applyAxisAngle(new THREE.Vector3(0, 1, 0), fr.yaw);
      // through a carve the camera swings out to the side of the turn
      this.swing = (this.swing ?? 0) + ((s.onGround ? -s.lean * 0.8 : 0) - (this.swing ?? 0)) * Math.min(1, dt * 2.5);
      const side = new THREE.Vector3(adir.z, 0, -adir.x);
      tgt.copy(s.pos).addScaledVector(adir, -E).addScaledVector(side, 0.42 + this.swing + 1.4 * pull);
      // (kept 0.6 m over the snow all along the arm)
      let floor = heightAt(tgt.x, tgt.z);
      for (let k = 1; k <= 8; k++) floor = Math.max(floor, heightAt(tgt.x + adir.x * E * k / 8, tgt.z + adir.z * E * k / 8));
      tgt.y = Math.max(this.ry + D, floor + 0.6);
      fov = O.fov + (O.speedFov ? 8 * (clamp(sp, 0, 38) / 38) ** 2 : 0) + 18 * portrait + 6 * pull;
      const hd = Math.max(0.5, Math.hypot(x0 - tgt.x, z0 - tgt.z)), tv = Math.tan((fov * Math.PI) / 360);
      const riderA = Math.atan2(s.pos.y + 1 - tgt.y, hd);
      const slopeA = Math.atan(clamp(Math.min(0, this.grade), -0.9, 0) + clamp(Math.max(0, this.grade), 0, 0.8) * 0.6) * O.slopeTilt / 100;
      let aim = slopeA;
      if (pull > 0) {
        // (aimed a third of the way to the landing)
        const T = this.td, ax = x0 + (T.x - x0) * 0.35, az = z0 + (T.z - z0) * 0.35, ay = s.pos.y + 1 + (T.y - s.pos.y - 1) * 0.35;
        aim += (Math.atan2(ay - tgt.y, Math.max(0.5, Math.hypot(ax - tgt.x, az - tgt.z))) - aim) * pull;
      }
      const tilt = clamp(aim - (O.angle * Math.PI) / 180, riderA - Math.atan(tv * 0.33), riderA + Math.atan(tv * 0.47));
      // (looking round: at the rider, not down the hill)
      const fl = Math.min(1, (Math.abs(fr.yaw) + Math.abs(fr.pitch)) * 2);
      look.copy(tgt).addScaledVector(adir, 12);
      if (fl > 0) { look.lerp(_rl.copy(s.pos).setY(s.pos.y + 1), fl); }
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
    } else if (this.mode === 'drone') {
      // Cork7's drone: flies high behind the rider, looking down the line
      tgt.copy(s.pos).addScaledVector(this.dir, -10.5);
      tgt.y = Math.max(s.pos.y + 6.5, heightAt(tgt.x, tgt.z) + 4);
      look.copy(s.pos).addScaledVector(this.dir, 7);
      look.y = s.pos.y + 0.3;
      fov = 54;
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
    // (Cork7 keeps you in the helmet through a slam; only if the goggles are gone does it step out)
    if (s.crash > 0 && this.mode === 'helmet' && tgt.distanceTo(s.pos) > 2.5) {
      tgt.copy(s.pos).addScaledVector(this.dir, -4); tgt.y += 2.2; look.copy(s.pos);
    }
    if (this.snap) { this.pos.copy(tgt); this.look.copy(look); this.snap = false; }
    const k = this.mode === 'helmet' ? 1 : this.mode === 'tv' ? 1 : Math.min(1, dt * (this.mode === 'chase' ? 9 : this.mode === 'drone' ? 2.6 : 7));
    this.pos.lerp(tgt, k);
    this.look.lerp(look, Math.min(1, dt * 12));
    cam.position.copy(this.pos);
    // our own helmet would fill the view
    s.model.hideHead?.(this.mode === 'helmet');
    // speed buzz + impact shake
    this.shake = Math.max(0, this.shake - dt * 2.2);
    // (Cork7 never rattles the view at speed: it stays calm however fast you go)
    const buzz = this.shake * 0.12;
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
