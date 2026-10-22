// Light baked in Blender onto geometry the game builds itself (the cartoon pine), registered
// here by name;
// tools/dumpbake.mjs writes what's registered out for blender/bake.py, which renders its
// occlusion in Cycles to public/models/ao_<name>.bin (a byte per vertex, mesh by mesh in this
// order). When that file arrives it darkens the vertex colours. A file that doesn't match the
// geometry any more (its vertex count) is left alone: rebake.
import * as THREE from 'three';
import { MODELS } from './models.js';

export const BAKE = new Map();
window.__bake = BAKE; // (tools/dumpbake.mjs reads it)
// (the files wait till the game's up and running: nothing here is worth a slower start)
let started = false;
const waiting = [];
export function startBakes() { started = true; waiting.splice(0).forEach((f) => f()); }
const BASE = (import.meta.env?.BASE_URL ?? '/') + 'models/';

/** items: Object3Ds (every mesh under them) or bare geometries; opts.ground = [x, z, radius]
 * (the slope round it shades it too), opts.apart (each piece baked on its own) */
export function bakeable(name, items, opts = {}) {
  const list = [], seen = new Set(), rest = [];
  for (const it of items) {
    if (it.isBufferGeometry) { list.push({ geo: it, m: new THREE.Matrix4() }); continue; }
    it.updateMatrixWorld(true);
    // (not what moves on its own)
    const walk = (o) => {
      if (o.userData.base || o.userData.noBake) { o.traverse((c) => c.isMesh && rest.push(c)); return; }
      if (o.isMesh && !o.isInstancedMesh && !seen.has(o.geometry)) { seen.add(o.geometry); list.push({ geo: o.geometry, m: o.matrixWorld.clone(), mesh: o }); }
      o.children.forEach(walk);
    };
    walk(it);
  }
  BAKE.set(name, { list, opts, rest });
  if (MODELS['ao_' + name]) {
    const go = () => fetch(BASE + 'ao_' + name + '.bin').then((r) => r.arrayBuffer()).then((b) => applyAO(name, list, rest, new Uint8Array(b))).catch((e) => console.warn('ao', name, e));
    if (started) go(); else waiting.push(go);
  }
}

function applyAO(name, list, rest, ao) {
  const total = list.reduce((s, it) => s + it.geo.attributes.position.count, 0);
  if (total !== ao.length) { console.warn(`ao_${name}: ${ao.length} values for ${total} vertices, rebake`); return; }
  let o = 0;
  for (const { geo, mesh } of list) {
    const n = geo.attributes.position.count;
    const mats = mesh ? [mesh.material].flat() : [];
    let col = geo.attributes.color;
    if (!col) {
      // (a plain material: the occlusion becomes its vertex colour)
      if (mats.some((m) => !m.vertexColors && m.color === undefined)) { o += n; continue; }
      col = new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3);
      geo.setAttribute('color', col);
      for (const m of mats) if (!m.vertexColors) { m.vertexColors = true; m.needsUpdate = true; }
    } else if (mats.some((m) => !m.vertexColors)) { o += n; continue; }
    for (let i = 0; i < n; i++) {
      const k = 0.4 + 0.6 * (ao[o + i] / 255);
      col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
    }
    col.needsUpdate = true;
    o += n;
  }
  // (what was left out but shares a material that now reads vertex colours: plain white)
  for (const m of rest) {
    if (!m.geometry.attributes.color && [m.material].flat().some((x) => x.vertexColors)) {
      m.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(m.geometry.attributes.position.count * 3).fill(1), 3));
    }
  }
}
