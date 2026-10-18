// The forest: snow-laden spruces (src/spruce.js), placed by the course's tree density.
// Also the spatial hash every collider on the mountain lives in.
import * as THREE from 'three';
import { MAP } from './course.js';
import { placeTrees } from './boot.js';

// how much snow lies on the boughs (0..1.2)
export const treeSnow = { value: 0.85 };
if (typeof window !== 'undefined') window.__treeSnow = treeSnow;

export class Forest {
  // placed: placeTrees()'s arrays (worked out on a loading thread), or it's done here
  constructor(scene, placed = placeTrees()) {
    this.scene = scene;
    this.hash = new Map();
    this.trees = [];
    this.place(placed);
  }

  key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }

  addCollider(x, z, r, kind = 'tree') {
    const ix = Math.floor(x / 8), iz = Math.floor(z / 8);
    const k = this.key(ix, iz);
    let a = this.hash.get(k);
    if (!a) { a = []; this.hash.set(k, a); }
    const o = { x, z, r, kind };
    a.push(o);
    return o;
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

  place({ trees: T, colliders: C }) {
    for (let i = 0; i < T.length; i += 8) {
      const g = T[i + 6];
      this.trees.push({ x: T[i], y: T[i + 1], z: T[i + 2], v: T[i + 3], s: T[i + 4], rot: T[i + 5], tint: new THREE.Color(g * 0.94, g, g * 0.98), sx: T[i + 7] });
    }
    // the trunk, and how far the boughs reach (you can push through those, slowly)
    for (let i = 0; i < C.length; i += 5) {
      const o = this.addCollider(C[i], C[i + 1], C[i + 2]);
      o.br = C[i + 3]; o.th = C[i + 4];
    }
    this.count = this.trees.length;
  }

  // the GPU side (browser only: the headless sim never builds it)
  async buildRender(renderer, patch, quality = 'high') {
    const { SpruceForest } = await import('./spruce.js');
    // the tree-skiing park has trees all round you: keep the full-detail ring tighter there
    const q = MAP.glades && quality !== 'low' ? (quality === 'ultra' ? 'high' : 'low') : quality;
    this.veg = new SpruceForest(this.trees, q, patch, treeSnow);
    this.scene.add(this.veg.group);
  }

  update(camera, elapsed) {
    if (this.veg) this.veg.update(camera, elapsed);
  }
}
