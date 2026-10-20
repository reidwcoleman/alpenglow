// The forest: a subalpine mix (src/spruce.js) placed by the course's tree density. Spruce down
// low, more and narrower firs higher up, stunted and rime-buried "snow ghosts" at the tree line,
// stands of bare larch, the odd dead snag, saplings poking out of the snow round the big trees.
// Also the spatial hash every collider on the mountain lives in.
import * as THREE from 'three';
import { MAP, centerX, halfWidth, heightAt } from './course.js';
import { placeTrees } from './boot.js';
import { mulberry32, makeSimplex } from './noise.js';

// how much snow lies on the boughs (0..1.2)
export const treeSnow = { value: 0.85 };
if (typeof window !== 'undefined') window.__treeSnow = treeSnow;

const SPRUCE_H = 16; // (src/spruce.js: the geometry's height)
const FIR = [4, 5], SNAG = 6, LARCH = 7, GHOST = 8, SAPLING = [2, 4];
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

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
    // which placed trees have a collider (only those near where people ski)
    const col = new Map();
    for (let i = 0; i < C.length; i += 5) col.set(C[i] + ',' + C[i + 1], i);
    const rnd = mulberry32(4242);
    const nLarch = makeSimplex(301), nMeadow = makeSimplex(302);
    const saplings = [];
    for (let i = 0; i < T.length; i += 8) {
      const x = T[i], y = T[i + 1], z = T[i + 2];
      let v = T[i + 3], s = T[i + 4], sx = T[i + 7], g = T[i + 6];
      const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
      // how close to the tree line (the forest thins out between 520 and 760 m)
      const tl = smooth(470, 690, y);
      let h = s * SPRUCE_H;
      const larchy = nLarch(x / 220, z / 220) > 0.42 && y > 120 && y < 600;
      if (tl > 0.4 && r1 < 0.55 * tl) {
        // snow ghosts: short, fat, buried in rime
        v = GHOST; h = 3.2 + r2 * 4.5; sx = 0.85 + r3 * 0.35;
      } else if (larchy && r1 < 0.28) {
        v = LARCH; h = Math.max(h, 12 + r2 * 9);
      } else if (r1 > 0.972 - 0.02 * tl) {
        v = SNAG; h *= 0.75 + r2 * 0.35;
      } else if (r2 < 0.22 + 0.55 * tl) {
        v = FIR[r3 < 0.5 ? 0 : 1];
        h *= 1 - 0.45 * tl * r4; // (stunted up high)
      } else {
        h *= 1 - 0.3 * tl * r4;
      }
      s = h / SPRUCE_H;
      const tint = v === SNAG ? new THREE.Color(g * 0.95, g * 0.95, g * 0.95)
        : v === LARCH ? new THREE.Color(g, g * 0.94, g * 0.88)
          : v === GHOST ? new THREE.Color(1, 1, 1)
            : FIR.includes(v) ? new THREE.Color(g * 0.86, g * 0.96, g * 1.02)
              : new THREE.Color(g * 0.94, g, g * 0.98);
      this.trees.push({ x, y, z, v, s, rot: T[i + 5], tint, sx });
      // the trunk, and how far the boughs reach (you can push through those, slowly)
      const ci = col.get(x + ',' + z);
      if (ci !== undefined) {
        const o = this.addCollider(x, z, v === GHOST ? Math.max(0.9, h * 0.2) : Math.max(0.6, h * 0.035));
        o.br = v === GHOST ? 0 : v === SNAG ? 0.9 : Math.min(3.2, Math.max(1.3, h * 0.17));
        o.th = h;
      }
      // young trees coming up round the old ones (not on the runs, nor in the open meadows)
      if (v !== GHOST && v !== SNAG && r4 < 0.3 && nMeadow(x / 60, z / 60) > -0.3) {
        const n = 1 + ((rnd() * 2.6) | 0);
        for (let k = 0; k < n; k++) {
          const a = rnd() * Math.PI * 2, d = 2.6 + rnd() * 4.5;
          const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
          saplings.push(px, pz, 0.7 + rnd() * rnd() * 2.6, rnd(), rnd());
        }
      }
    }
    for (let i = 0; i < saplings.length; i += 5) {
      const px = saplings[i], pz = saplings[i + 1], h = saplings[i + 2];
      const off = Math.abs(px - centerX(pz)) - halfWidth(pz);
      if (off < 14 || (MAP.glades && off < 60)) continue;
      // half buried: only the top pokes out of the snowpack
      const bury = 0.25 + saplings[i + 3] * 0.35;
      const v = SAPLING[saplings[i + 4] < 0.5 ? 0 : 1];
      const g = 0.85 + saplings[i + 3] * 0.3;
      const tot = h / (1 - bury);
      const y = heightAt(px, pz) - tot * bury;
      this.trees.push({ x: px, y, z: pz, v, s: tot / SPRUCE_H, rot: saplings[i + 4] * 6.283, tint: new THREE.Color(g * 0.9, g, g), sx: 1.1 });
      // you can ride over the top of one, not through it
      if (off < 140) {
        const o = this.addCollider(px, pz, 0.18);
        o.br = Math.min(1.2, 0.3 + h * 0.3); o.th = h; o.top = h * 0.8;
      }
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
