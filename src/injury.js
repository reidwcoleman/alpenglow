// A crash bad enough that you don't get up: blood sprays off the impact and every slam as
// the body tumbles, the helmet cracks and comes off, the head bleeds, an arm or a leg (or
// both) snaps off at the elbow or knee with the bone showing and tumbles away bleeding, the
// clothes soak through, a red smear follows the body down the slope and pools where it
// stops. All of it heals when you walk out of the hospital.
import * as THREE from 'three';
import { heightAt, normalAt } from './course.js';
import { kitMaterial } from './avatar.js';
import { bake, piece } from './people.js';

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const DROPS = 600;

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
  return new THREE.CanvasTexture(c);
}

// the end of a broken bone in a ring of torn flesh, pointing along +y
function stump() {
  const g = new THREE.Group();
  const flesh = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8).scale(1, 0.55, 1), new THREE.MeshStandardMaterial({ color: 0x7a0a10, roughness: 0.3 }));
  const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.09, 8).translate(0, 0.045, 0), new THREE.MeshStandardMaterial({ color: 0xe9e0cc, roughness: 0.55 }));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.03, 6).translate(0, 0.1, 0).rotateZ(0.3), bone.material);
  g.add(flesh, bone, tip);
  return g;
}

export class Injuries {
  constructor(scene) {
    this.scene = scene;
    this.texs = [1, 2, 3, 4].map(splatTex);
    this.mat = this.texs.map((t) => new THREE.MeshStandardMaterial({
      color: 0x5a0408, alphaMap: t, transparent: true, depthWrite: false, roughness: 0.22, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }));
    this.splats = [];
    this.bits = []; // the pieces that came off: limbs, the helmet
    this.stumps = [];
    this.blood = 0;
    this.who = null;
    // flying drops
    const geo = new THREE.BufferGeometry();
    this.dp = new Float32Array(DROPS * 3); this.dv = new Float32Array(DROPS * 3); this.dl = new Float32Array(DROPS);
    this.dp.fill(-1e4);
    geo.setAttribute('position', new THREE.BufferAttribute(this.dp, 3));
    this.drops = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x7c0610, size: 0.07, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false }));
    this.drops.frustumCulled = false;
    scene.add(this.drops);
    this.di = 0;
  }

  // a splat of blood on the snow at (x, z), r metres across
  splat(x, z, r, grow = 0) {
    if (this.splats.length > 260) { const old = this.splats.shift(); this.scene.remove(old.m); }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.mat[this.splats.length % this.mat.length]);
    normalAt(x, z, _n);
    m.quaternion.setFromUnitVectors(UP, _n).multiply(_q.setFromAxisAngle(UP, Math.random() * 6.28));
    m.position.set(x, heightAt(x, z) + 0.03, z);
    m.scale.setScalar(grow ? r * 0.2 : r);
    m.renderOrder = 2;
    this.scene.add(m);
    this.splats.push({ m, r, grow });
  }

  // a spray of drops from at, thrown along vel
  spray(at, vel, n = 60, force = 4) {
    for (let i = 0; i < n; i++) {
      const k = this.di++ % DROPS;
      this.dp[k * 3] = at.x; this.dp[k * 3 + 1] = at.y; this.dp[k * 3 + 2] = at.z;
      this.dv[k * 3] = vel.x * 0.4 + (Math.random() - 0.5) * force;
      this.dv[k * 3 + 1] = Math.random() * force * 0.9 + 1;
      this.dv[k * 3 + 2] = vel.z * 0.4 + (Math.random() - 0.5) * force;
      this.dl[k] = 2.5;
    }
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
    this.gore = true;
    // the first spray, off the impact
    this.spray(_p.copy(skier.pos).add(UP), v, 140, 6);
    // the helmet goes, cracked
    const lid = ['helmet', 'goggles', 'lens', 'strap'].filter((k) => P[k]);
    const helmet = new THREE.Group();
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
    this.bits.push({ obj: helmet, vel: new THREE.Vector3(v.x * 0.5 + (Math.random() - 0.5) * 4, 3 + Math.random() * 2, v.z * 0.5 + (Math.random() - 0.5) * 4), spin: new THREE.Vector3(9, 5, 7), trail: 0 });
    this.pool = { t: 0 };
    this.trailAt = skier.pos.clone();
    // a spatter across the screen
    const fx = document.getElementById('bloodfx');
    if (fx) { fx.classList.remove('on'); void fx.offsetWidth; fx.classList.add('on'); }
    if (!rig) return;
    // a limb off at the elbow or the knee, and at high speed a second one
    const all = ['armL', 'armR', 'legL', 'legR'].sort(() => Math.random() - 0.5);
    const n = skier.crashSpeed > 22 || Math.random() < 0.35 ? 2 : 1;
    rig.root.updateMatrixWorld(true);
    const baked = bake(rig);
    const u = rig.mesh.material.userData.u;
    all.slice(0, n).forEach((which, ci) => this.sever(skier, which, baked, ci === 0 ? u.uCut : u.uCut2));
    // blood where it happened
    for (let i = 0; i < 6; i++) this.splat(skier.pos.x + (Math.random() - 0.5) * 2.5, skier.pos.z + (Math.random() - 0.5) * 2.5, 0.4 + Math.random() * 0.8);
  }

  sever(skier, which, baked, cutU) {
    const M = skier.model, rig = M.rig, P = M.parts, v = skier.vel;
    const arm = which.startsWith('arm'), s = which.endsWith('L') ? 0 : 1, side = s ? -1 : 1, S = s ? 'R' : 'L';
    const ix = rig.ix, kit = rig.kit;
    const joint = arm ? ix.fore[s] : ix.calf[s], parent = arm ? ix.upper[s] : ix.thigh[s];
    const geo = piece(baked, arm ? [4, 5] : [7, 8], side);
    // (centred on itself, so it tumbles about its middle)
    const mid = geo.boundingSphere.center.clone();
    geo.translate(-mid.x, -mid.y, -mid.z);
    const o = M.outfit;
    const mat = kitMaterial(kit, { jacket: 0xffffff, pants: o.pants, gloves: o.gloves ?? 0x1d1f26, boots: o.boots ?? 0x2a2420 }, true);
    const cut = kit.bindP[joint];
    mat.userData.u.uCut.value.set(cut.x, cut.y, cut.z, 1);
    mat.userData.u.uStain.value = 1;
    const limb = new THREE.InstancedMesh(geo, mat, 1);
    limb.setMatrixAt(0, new THREE.Matrix4());
    limb.setColorAt(0, new THREE.Color(o.jacket));
    limb.castShadow = true; limb.frustumCulled = false;
    rig.root.matrixWorld.decompose(_p, _q, _s);
    limb.position.copy(rig.root.localToWorld(mid.clone())); limb.quaternion.copy(_q); limb.scale.copy(_s);
    // the bone sticking out of the torn end, pointing out of the limb
    const st = stump();
    st.position.copy(rig.wp[joint]).sub(mid);
    st.quaternion.setFromUnitVectors(UP, _n.subVectors(rig.wp[joint], rig.wp[arm ? ix.hand[s] : ix.foot[s]]).normalize());
    limb.add(st);
    // the boot (and ski) come away with a leg; the pole with an arm
    if (!arm) for (const k of [`boot${S}`, `cuff${S}`, `ski${S}`, `sbind${S}`]) {
      const part = P[k];
      if (!part) continue;
      const mesh = new THREE.Mesh(part.geometry, part.material);
      part.updateMatrixWorld(true);
      _m.copy(rig.root.matrixWorld).invert().multiply(part.matrixWorld);
      _m.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.position.sub(mid);
      limb.add(mesh);
      part.visible = false; M.cut.add(k);
    } else if (P[`pole${S}`]) { P[`pole${S}`].visible = false; M.cut.add(`pole${S}`); }
    this.scene.add(limb);
    // gone from the body: the bones below the break shrink to nothing, a stump at the joint
    rig.bones[joint].scale.setScalar(0.001);
    cutU.value.set(cut.x, cut.y, cut.z, 1);
    const bodyStump = stump();
    rig.root.add(bodyStump);
    this.stumps.push({ obj: bodyStump, joint, parent, rig });
    this.cutBones = [...(this.cutBones ?? []), rig.bones[joint]];
    this.bits.push({ obj: limb, vel: new THREE.Vector3(v.x * 0.7 + side * 3 * Math.random(), 2.5 + Math.random() * 3, v.z * 0.7 + (Math.random() - 0.5) * 3), spin: new THREE.Vector3(7, 11, 5), trail: 0, bleeds: true });
  }

  update(dt) {
    const S = this.who;
    // drops in flight, and where they land
    let any = false;
    for (let k = 0; k < DROPS; k++) {
      if (this.dl[k] <= 0) continue;
      any = true;
      this.dl[k] -= dt;
      this.dv[k * 3 + 1] -= 9.81 * dt;
      const x = (this.dp[k * 3] += this.dv[k * 3] * dt), y = (this.dp[k * 3 + 1] += this.dv[k * 3 + 1] * dt), z = (this.dp[k * 3 + 2] += this.dv[k * 3 + 2] * dt);
      if (y < heightAt(x, z)) {
        this.dl[k] = 0;
        if (Math.random() < 0.12) this.splat(x, z, 0.1 + Math.random() * 0.2);
      }
      if (this.dl[k] <= 0) this.dp[k * 3 + 1] = -1e4;
    }
    if (any || this.dropsLive) this.drops.geometry.attributes.position.needsUpdate = true;
    this.dropsLive = any;
    if (!S || !this.gore) return;
    const rig = S.model.rig;
    if (this.pool) {
      if (rig) {
        const u = rig.mesh.material.userData.u;
        this.blood = Math.min(1, this.blood + dt * 0.6);
        u.uBlood.value = this.blood;
        u.uStain.value = Math.min(1, this.blood * 1.2);
      }
      // a smear down the slope behind the body as it slides
      if (S.crash > 0 && S.speed > 1 && this.trailAt.distanceTo(S.pos) > 0.45) {
        this.trailAt.copy(S.pos);
        this.splat(S.pos.x, S.pos.z, 0.35 + Math.random() * 0.45);
      }
      // and it pools under him once he's still
      this.pool.t += dt;
      if (!this.pool.m && S.speed < 0.6 && this.pool.t > 0.6) {
        let head = S.pos;
        if (rig) { rig.root.updateMatrixWorld(true); head = rig.root.localToWorld(rig.skull.clone()); }
        this.splat(head.x, head.z, 2.4, true);
        this.pool.m = this.splats[this.splats.length - 1];
        for (const st of this.stumps) { const w = st.obj.getWorldPosition(_p); this.splat(w.x, w.z, 1.6, true); }
      }
      // the stumps sit on the joints (the rig poses every frame), still bleeding
      for (const st of this.stumps) {
        st.obj.position.copy(st.rig.wp[st.joint]);
        st.obj.quaternion.setFromUnitVectors(UP, _n.subVectors(st.rig.wp[st.joint], st.rig.wp[st.parent]).normalize());
        if (Math.random() < dt * 3) { st.obj.getWorldPosition(_p); this.spray(_p, _s.set(0, 0, 0), 3, 1.2); }
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
        if (v.y < -2 && b.bleeds) this.spray(o.position, v, 25, 3);
        if (v.y < 0) v.y = -v.y * 0.25;
        const f = Math.exp(-dt * 2.2);
        v.x *= f; v.z *= f;
        b.spin.multiplyScalar(Math.exp(-dt * 3));
        if (v.lengthSq() < 0.3 && b.spin.lengthSq() < 1) b.rest = true;
      }
      // a red trail where the limb lands and slides
      if (b.bleeds) {
        b.trail -= dt;
        if (b.trail <= 0 && o.position.y < gy + 0.4) { b.trail = 0.1; this.splat(o.position.x, o.position.z, 0.25 + Math.random() * 0.35); }
      }
    }
  }

  // the body slamming the snow as it tumbles: more blood every time
  slam(skier) {
    if (!this.gore || skier !== this.who) return;
    this.spray(_p.copy(skier.pos).add(_s.set(0, 0.4, 0)), skier.vel, 45, 4);
    this.splat(skier.pos.x, skier.pos.z, 0.6 + Math.random() * 0.6);
  }

  // good as new (the blood on the snow stays until the next run)
  heal() {
    const S = this.who;
    if (!S) return;
    const M = S.model, rig = M.rig;
    for (const b of this.cutBones ?? []) b.scale.setScalar(1);
    this.cutBones = null;
    if (rig) {
      const u = rig.mesh.material.userData.u;
      u.uBlood.value = 0; u.uStain.value = 0; u.uCut.value.set(0, 0, 0, 0); u.uCut2.value.set(0, 0, 0, 0);
    }
    for (const st of this.stumps) st.obj.parent?.remove(st.obj);
    this.stumps = [];
    if (M.cut) for (const k of M.cut) if (M.parts[k]) M.parts[k].visible = true;
    M.cut = null; M.lod = -1;
    for (const b of this.bits) this.scene.remove(b.obj);
    this.bits = [];
    this.blood = 0; this.pool = null; this.gore = false;
    this.who = null;
  }

  clear() {
    this.heal();
    for (const sp of this.splats) this.scene.remove(sp.m);
    this.splats = [];
    this.dl.fill(0);
  }
}
