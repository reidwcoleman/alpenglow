// A crash bad enough that you don't get up: the helmet cracks and comes off, the head bleeds,
// an arm or a leg snaps off at the elbow or the knee and tumbles away leaving a trail, and
// the blood spreads on the snow. All of it heals when you walk out of the hospital.
import * as THREE from 'three';
import { heightAt, normalAt } from './course.js';
import { kitMaterial } from './avatar.js';
import { bake, piece } from './people.js';

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

// a few splatter shapes: a blob with drops thrown off it
function splatTex(seed) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = '#fff';
  for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(64 + (rnd() - 0.5) * 34, 64 + (rnd() - 0.5) * 34, 12 + rnd() * 20, 0, Math.PI * 2); g.fill(); }
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, d = 30 + rnd() * 30;
    g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1 + rnd() * 4, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class Injuries {
  constructor(scene) {
    this.scene = scene;
    this.texs = [1, 2, 3, 4].map(splatTex);
    this.mat = this.texs.map((t) => new THREE.MeshStandardMaterial({
      color: 0x5a0408, alphaMap: t, transparent: true, depthWrite: false, roughness: 0.25, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }));
    this.splats = [];
    this.bits = []; // the pieces that came off: a limb, the helmet
    this.blood = 0;
    this.who = null;
  }

  // a splat of blood on the snow at (x, z), r metres across
  splat(x, z, r, grow = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.mat[this.splats.length % this.mat.length]);
    normalAt(x, z, _n);
    m.quaternion.setFromUnitVectors(UP, _n).multiply(_q.setFromAxisAngle(UP, Math.random() * 6.28));
    m.position.set(x, heightAt(x, z) + 0.03, z);
    m.scale.setScalar(grow ? r * 0.2 : r);
    m.renderOrder = 2;
    this.scene.add(m);
    this.splats.push({ m, r, grow });
  }

  // skier: the player, just gone down hard. gore: false for the Off setting (just the rescue)
  hurt(skier, gore = true) {
    this.clear();
    this.who = skier;
    if (!gore) return;
    const M = skier.model, rig = M.rig, P = M.parts;
    M.group.updateMatrixWorld(true);
    M.cut = new Set();
    const v = skier.vel;
    // the helmet goes, cracked
    const lid = ['helmet', 'goggles', 'lens', 'strap'].filter((k) => P[k]);
    const helmet = new THREE.Group();
    // (pivoting on the helmet itself as it tumbles)
    if (lid.length) P[lid[0]].getWorldPosition(helmet.position);
    for (const k of lid) {
      const part = P[k];
      const mesh = new THREE.Mesh(part.geometry, part.material);
      part.matrixWorld.decompose(_p, _q, _s);
      mesh.position.copy(_p).sub(helmet.position); mesh.quaternion.copy(_q); mesh.scale.copy(_s);
      mesh.castShadow = true;
      helmet.add(mesh);
      part.visible = false; M.cut.add(k);
    }
    this.scene.add(helmet);
    this.bits.push({ obj: helmet, pivot: true, vel: new THREE.Vector3(v.x * 0.5 + (Math.random() - 0.5) * 4, 3 + Math.random() * 2, v.z * 0.5 + (Math.random() - 0.5) * 4), spin: new THREE.Vector3(9, 5, 7), trail: 0 });
    if (!rig) return;
    // and a limb: an arm off at the elbow, or a leg at the knee
    const which = ['armL', 'armR', 'legL', 'legR'][Math.floor(Math.random() * 4)];
    const arm = which.startsWith('arm'), s = which.endsWith('L') ? 0 : 1, side = s ? -1 : 1;
    const ix = rig.ix, kit = rig.kit;
    const joint = arm ? ix.fore[s] : ix.calf[s];
    const geo = piece(bake(rig), arm ? [4, 5] : [7, 8], side);
    // (centred on itself, so it tumbles about its middle)
    const mid = geo.boundingSphere.center.clone();
    geo.translate(-mid.x, -mid.y, -mid.z);
    const o = M.outfit;
    const mat = kitMaterial(kit, { jacket: 0xffffff, pants: o.pants, gloves: o.gloves ?? 0x1d1f26, boots: o.boots ?? 0x2a2420 }, true);
    const cut = kit.bindP[joint];
    mat.userData.u.uCut.value.set(cut.x, cut.y, cut.z, 1);
    const limb = new THREE.InstancedMesh(geo, mat, 1);
    limb.setMatrixAt(0, new THREE.Matrix4());
    limb.setColorAt(0, new THREE.Color(o.jacket));
    limb.castShadow = true; limb.frustumCulled = false;
    // where it is now: the rig's own frame in the world
    rig.root.updateMatrixWorld(true);
    rig.root.matrixWorld.decompose(_p, _q, _s);
    limb.position.copy(rig.root.localToWorld(mid.clone())); limb.quaternion.copy(_q); limb.scale.copy(_s);
    // the boot (and ski) come away with a leg
    if (!arm) for (const k of [`boot${s ? 'R' : 'L'}`, `cuff${s ? 'R' : 'L'}`, `ski${s ? 'R' : 'L'}`, `sbind${s ? 'R' : 'L'}`]) {
      const part = P[k];
      if (!part) continue;
      const mesh = new THREE.Mesh(part.geometry, part.material);
      // (into the limb's frame, so it flies with it)
      part.updateMatrixWorld(true);
      _m.copy(rig.root.matrixWorld).invert().multiply(part.matrixWorld);
      _m.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.position.sub(mid);
      limb.add(mesh);
      part.visible = false; M.cut.add(k);
    } else { const pole = P[`pole${s ? 'R' : 'L'}`]; if (pole) { pole.visible = false; M.cut.add(`pole${s ? 'R' : 'L'}`); } }
    this.scene.add(limb);
    // it's gone from the body: the bones below the break shrink to nothing (a stump at the joint)
    rig.bones[joint].scale.setScalar(0.001);
    rig.mesh.material.userData.u.uCut.value.set(cut.x, cut.y, cut.z, 1);
    this.cutBone = rig.bones[joint];
    this.bits.push({ obj: limb, vel: new THREE.Vector3(v.x * 0.7 + side * 3 * Math.random(), 2.5 + Math.random() * 3, v.z * 0.7 + (Math.random() - 0.5) * 3), spin: new THREE.Vector3(7, 11, 5), trail: 0, bleeds: true });
    // blood where it happened
    for (let i = 0; i < 4; i++) this.splat(skier.pos.x + (Math.random() - 0.5) * 2, skier.pos.z + (Math.random() - 0.5) * 2, 0.4 + Math.random() * 0.7);
    this.pool = { t: 0 };
  }

  update(dt) {
    const S = this.who;
    // the head bleeds more and more
    const rig = S?.model.rig;
    if (rig && this.pool) {
      this.blood = Math.min(1, this.blood + dt * 0.5);
      rig.mesh.material.userData.u.uBlood.value = this.blood;
      // and it pools under him once he's still
      this.pool.t += dt;
      if (!this.pool.m && S.speed < 0.6 && this.pool.t > 0.6) {
        rig.root.updateMatrixWorld(true);
        const head = rig.root.localToWorld(rig.skull.clone());
        this.splat(head.x, head.z, 1.9, true);
        this.pool.m = this.splats[this.splats.length - 1];
      }
    }
    for (const sp of this.splats) if (sp.grow && sp.m.scale.x < sp.r) sp.m.scale.setScalar(Math.min(sp.r, sp.m.scale.x + dt * 0.35));
    for (const b of this.bits) {
      if (b.rest) continue;
      const o = b.obj, v = b.vel;
      v.y -= 9.81 * dt;
      o.position.addScaledVector(v, dt);
      o.quaternion.multiply(_q.setFromEuler(new THREE.Euler(b.spin.x * dt, b.spin.y * dt, b.spin.z * dt)));
      const gy = heightAt(o.position.x, o.position.z) + 0.08;
      if (o.position.y < gy) {
        o.position.y = gy;
        if (v.y < 0) v.y = -v.y * 0.25;
        const f = Math.exp(-dt * 2.2);
        v.x *= f; v.z *= f;
        b.spin.multiplyScalar(Math.exp(-dt * 3));
        if (v.lengthSq() < 0.3 && b.spin.lengthSq() < 1) b.rest = true;
      }
      // a red trail where the limb lands and slides
      if (b.bleeds) {
        b.trail -= dt;
        if (b.trail <= 0 && o.position.y < gy + 0.4) { b.trail = 0.12; this.splat(o.position.x, o.position.z, 0.25 + Math.random() * 0.35); }
      }
    }
  }

  // good as new (the blood on the snow stays until the next run)
  heal() {
    const S = this.who;
    if (!S) return;
    const M = S.model, rig = M.rig;
    if (this.cutBone) this.cutBone.scale.setScalar(1);
    this.cutBone = null;
    if (rig) { rig.mesh.material.userData.u.uBlood.value = 0; rig.mesh.material.userData.u.uCut.value.set(0, 0, 0, 0); }
    if (M.cut) for (const k of M.cut) if (M.parts[k]) M.parts[k].visible = true;
    M.cut = null; M.lod = -1;
    for (const b of this.bits) this.scene.remove(b.obj);
    this.bits = [];
    this.blood = 0; this.pool = null;
    this.who = null;
  }

  clear() {
    this.heal();
    for (const sp of this.splats) this.scene.remove(sp.m);
    this.splats = [];
  }
}
