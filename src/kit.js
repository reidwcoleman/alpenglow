// Pieces of geometry gathered per material, merged into one mesh each at the end (the lift,
// the huts).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxUV } from './proctex.js';

export class Kit {
  constructor() { this.parts = new Map(); }
  add(key, geo, { tint = 0xffffff, size = null, uv = false } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (size) boxUV(g, size);
    else if (!uv || !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const c = new THREE.Color(tint), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(a, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
    return g;
  }
  // a piece already in the kit's form (position, normal, uv, color; not indexed)
  addRaw(key, g) {
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
  }
  // each material's pieces merged into one geometry (for stamping copies)
  merged() {
    const out = {};
    for (const [key, list] of this.parts) out[key] = mergeGeometries(list);
    return out;
  }
  build(mats, parent, shadow = true) {
    for (const [key, list] of this.parts) {
      const m = new THREE.Mesh(mergeGeometries(list), mats[key]);
      m.castShadow = shadow && !['glass', 'lit', 'glow', 'net'].includes(key); m.receiveShadow = true;
      m.matrixAutoUpdate = false; m.updateMatrix();
      parent.add(m);
    }
  }
}
