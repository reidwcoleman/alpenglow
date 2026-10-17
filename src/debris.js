// Yard sale: in a big crash the skis and poles come off and cartwheel down
// the slope on their own until the skier gets up and collects them.
import * as THREE from 'three';
import { heightAt } from './course.js';

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const GEAR = ['skiL', 'skiR', 'poleL', 'poleR'];

export class Debris {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  spawn(skier) {
    const m = skier.model;
    m.group.updateMatrixWorld(true);
    const v = skier.vel;
    // lose one or both skis; poles usually go too
    const lose = GEAR.filter((k, i) => (i < 2 ? Math.random() < 0.8 : Math.random() < 0.7));
    for (const k of lose) {
      const part = m.parts[k];
      const mesh = new THREE.Mesh(part.geometry, part.material);
      part.matrixWorld.decompose(_p, _q, _s);
      mesh.position.copy(_p); mesh.quaternion.copy(_q);
      mesh.castShadow = true;
      this.scene.add(mesh);
      const k2 = 0.35 + Math.random() * 0.55;
      this.items.push({
        owner: skier, key: k, mesh,
        vel: new THREE.Vector3(v.x * k2 + (Math.random() - 0.5) * 4, 2 + Math.random() * 4, v.z * k2 + (Math.random() - 0.5) * 4),
        spin: new THREE.Vector3((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 22),
        rest: false,
      });
      part.visible = false;
    }
    if (['gripL', 'basketL'].length && lose.includes('poleL')) { m.parts.gripL.visible = false; m.parts.basketL.visible = false; }
    if (lose.includes('poleR')) { m.parts.gripR.visible = false; m.parts.basketR.visible = false; }
  }

  clear(skier) {
    this.items = this.items.filter((it) => {
      if (it.owner !== skier) return true;
      this.scene.remove(it.mesh);
      return false;
    });
    const P = skier.model.parts;
    for (const k of [...GEAR, 'gripL', 'gripR', 'basketL', 'basketR']) if (P[k]) P[k].visible = true;
    skier.model.lod = -1; // re-apply detail visibility next frame
  }

  update(dt) {
    for (const it of this.items) {
      if (it.rest) continue;
      const m = it.mesh, v = it.vel;
      v.y -= 9.81 * dt;
      m.position.addScaledVector(v, dt);
      const e = new THREE.Euler(it.spin.x * dt, it.spin.y * dt, it.spin.z * dt);
      m.quaternion.multiply(_q.setFromEuler(e));
      const gy = heightAt(m.position.x, m.position.z) + 0.03;
      if (m.position.y < gy) {
        m.position.y = gy;
        if (v.y < 0) v.y = -v.y * 0.3;
        const f = Math.exp(-dt * 2.6);
        v.x *= f; v.z *= f;
        it.spin.multiplyScalar(Math.exp(-dt * 4));
        // settle flat on the snow
        if (v.lengthSq() < 0.4 && it.spin.lengthSq() < 1) {
          it.rest = true;
          const yaw = new THREE.Euler().setFromQuaternion(m.quaternion, 'YXZ').y;
          m.quaternion.setFromEuler(new THREE.Euler(0, yaw, it.key.startsWith('pole') ? Math.PI / 2 : 0, 'YXZ'));
          m.position.y = gy + (it.key.startsWith('pole') ? 0.02 : 0);
        }
      }
    }
  }
}
