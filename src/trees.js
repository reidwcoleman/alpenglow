// The forest: snow-laden spruces (src/spruce.js), placed by the course's tree density.
// Also the spatial hash every collider on the mountain lives in.
import * as THREE from 'three';
import { heightAt, treeDensity, slopeAt, LIFT, centerX, halfWidth } from './course.js';
import { mulberry32, makeSimplex } from './noise.js';

const SPRUCE_H = 16;
// how much snow lies on the boughs (0..1.2)
export const treeSnow = { value: 0.85 };
if (typeof window !== 'undefined') window.__treeSnow = treeSnow;

export class Forest {
  constructor(scene) {
    this.scene = scene;
    this.hash = new Map();
    this.trees = [];
    this.place(mulberry32(99));
  }

  key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }

  addCollider(x, z, r, kind = 'tree') {
    const ix = Math.floor(x / 8), iz = Math.floor(z / 8);
    const k = this.key(ix, iz);
    let a = this.hash.get(k);
    if (!a) { a = []; this.hash.set(k, a); }
    a.push({ x, z, r, kind });
  }

  // colliders within radius of (x, z)
  query(x, z, out) {
    out.length = 0;
    const ix = Math.floor(x / 8), iz = Math.floor(z / 8);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const a = this.hash.get(this.key(ix + i, iz + j));
      if (a) for (const o of a) out.push(o);
    }
    return out;
  }

  place(rnd) {
    const X = 880, ZA = -600, ZB = 4400, step = 8.5;
    const noise = makeSimplex(77);
    const liftDx = LIFT.x1 - LIFT.x0, liftDz = LIFT.z1 - LIFT.z0;
    const liftLen = Math.hypot(liftDx, liftDz);
    const ldx = liftDx / liftLen, ldz = liftDz / liftLen;
    for (let z = ZA; z < ZB; z += step) for (let x = -X; x < X; x += step) {
      const px = x + (rnd() - 0.5) * step * 0.95, pz = z + (rnd() - 0.5) * step * 0.95;
      const d = treeDensity(px, pz);
      if (d <= 0.02 || rnd() > d * 0.85) continue;
      if (slopeAt(px, pz) > 0.9) continue;
      // keep the chairlift corridor clear
      const lx = px - LIFT.x0, lz = pz - LIFT.z0;
      const along = lx * ldx + lz * ldz;
      if (along > -20 && along < liftLen + 20 && Math.abs(lx * ldz - lz * ldx) < 9) continue;
      if (noise(px / 30, pz / 30) < -0.35 && rnd() < 0.6) continue;
      const h = 9 + rnd() * 12 + (d > 0.8 ? 3 : 0);
      const v = Math.floor(rnd() * 4);
      const g = 0.8 + rnd() * 0.35;
      this.trees.push({
        x: px, y: heightAt(px, pz) - 0.3, z: pz, v, s: h / SPRUCE_H, rot: rnd() * Math.PI * 2,
        tint: new THREE.Color(g * 0.94, g, g * 0.98), sx: 0.9 + rnd() * 0.2,
      });
      // only trees close to where people ski need colliders
      if (Math.abs(px - centerX(pz)) < halfWidth(pz) + 140) this.addCollider(px, pz, Math.max(0.6, h * 0.035));
    }
    this.count = this.trees.length;
  }

  // the GPU side (browser only: the headless sim never builds it)
  async buildRender(renderer, patch, quality = 'high') {
    const { SpruceForest } = await import('./spruce.js');
    this.veg = new SpruceForest(this.trees, quality, patch, treeSnow);
    this.scene.add(this.veg.group);
  }

  update(camera, elapsed) {
    if (this.veg) this.veg.update(camera, elapsed);
  }
}
