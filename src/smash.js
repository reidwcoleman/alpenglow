// Things you can ride into and knock flat: piste poles, gate poles, flags, signs. Each is a
// soft collider (it slows you, it doesn't stop you) and a target to animate: whole objects,
// or slots of an instanced mesh. Hit one and it tips over away from you, bounces once and
// lies in the snow until the next run.
import * as THREE from 'three';
import { heightAt } from './course.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _ax = new THREE.Vector3();

export class Smash {
  constructor(forest) {
    this.forest = forest;
    this.all = [];
    this.live = [];
    this.onHit = null;
  }

  // targets: Object3Ds (pivoting at their own origin) or { im, i } instanced slots.
  // opts: { h: height you can clear it at, slow: share of speed it takes, kind, off }
  add(x, z, r, targets, opts = {}) {
    const o = this.forest.addCollider(x, z, r, opts.kind ?? 'pole');
    o.soft = true; o.h = opts.h ?? 2; o.slow = opts.slow ?? 0.04; o.off = !!opts.off;
    o.parts = targets.map((t) => {
      if (t.isObject3D) return { obj: t, p0: t.position.clone(), q0: t.quaternion.clone() };
      t.im.getMatrixAt(t.i, _m);
      const p0 = new THREE.Vector3(), q0 = new THREE.Quaternion(), s0 = new THREE.Vector3();
      _m.decompose(p0, q0, s0);
      return { im: t.im, i: t.i, p0, q0, s0 };
    });
    o.ang = 0; o.angV = 0; o.slide = new THREE.Vector3(); o.dz = 0;
    this.all.push(o);
    return o;
  }

  // a rider at vel went into it
  hit(o, vel) {
    if (o.down || o.off) return;
    o.down = true;
    const sp = Math.hypot(vel.x, vel.z) || 1;
    // tip over about the horizontal axis across the line of the hit
    o.axis = new THREE.Vector3(vel.z / sp, 0, -vel.x / sp);
    o.angV = Math.min(14, 3 + sp * 0.5);
    o.ang = 0;
    o.slide.set(vel.x * 0.35, 0, vel.z * 0.35);
    o.off0 = new THREE.Vector3();
    this.live.push(o);
    this.onHit?.(o, sp);
  }

  update(dt) {
    for (let k = this.live.length - 1; k >= 0; k--) {
      const o = this.live[k];
      // falls like a stick: faster the further over it goes, a bounce on the snow
      o.angV += Math.sin(Math.max(0.05, o.ang)) * 14 * dt;
      o.ang += o.angV * dt;
      const flat = Math.PI / 2 - 0.06;
      if (o.ang > flat) { o.ang = flat; o.angV = -Math.abs(o.angV) * 0.25; if (Math.abs(o.angV) < 0.4) o.angV = 0; }
      o.off0.addScaledVector(o.slide, dt);
      o.slide.multiplyScalar(Math.exp(-dt * 5));
      this.apply(o);
      if (o.angV === 0 && o.slide.lengthSq() < 0.01) this.live.splice(k, 1);
    }
  }

  apply(o) {
    _q.setFromAxisAngle(o.axis ?? _ax.set(1, 0, 0), o.ang);
    for (const t of o.parts) {
      _p.copy(t.p0).add(o.off0 ?? _s.set(0, 0, 0));
      // slid along with the snow under it
      if (o.off0) _p.y = heightAt(_p.x, _p.z) + (t.p0.y - heightAt(t.p0.x, t.p0.z));
      if (t.obj) {
        t.obj.position.copy(_p);
        t.obj.quaternion.copy(_q).multiply(t.q0);
      } else {
        _m.compose(_p, _q.clone().multiply(t.q0), t.s0);
        t.im.setMatrixAt(t.i, _m);
        t.im.instanceMatrix.needsUpdate = true;
      }
    }
  }

  // stand everything back up (a new run)
  reset() {
    for (const o of this.all) {
      if (!o.down) continue;
      o.down = false; o.ang = 0; o.angV = 0; o.off0 = null; o.axis = null; o.slide.set(0, 0, 0);
      this.apply(o);
    }
    this.live.length = 0;
  }

  // a set (race gates) that is only there some of the time
  setOff(kind, off) { for (const o of this.all) if (o.kind === kind) o.off = off; }
}
