// Static meshes that share a material are drawn as one: their geometry baked into world space
// and merged. For the park and the like, built once and never moved (anything that can be
// knocked over is left as it is).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function batchStatic(root, keep = new Set()) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || keep.has(o) || !o.visible || Array.isArray(o.material) || o.morphTargetInfluences) return;
    for (let p = o.parent; p && p !== root; p = p.parent) if (keep.has(p) || !p.visible) return;
    const g = o.geometry;
    const key = [o.material.uuid, o.castShadow, o.receiveShadow, o.renderOrder, !!g.index, Object.keys(g.attributes).sort().join()].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  let saved = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const geos = list.map((o) => {
      const g = o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      for (const k of Object.keys(g.morphAttributes)) delete g.morphAttributes[k];
      return g;
    });
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, list[0].material);
    m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow; m.renderOrder = list[0].renderOrder;
    m.matrixAutoUpdate = false;
    root.add(m);
    for (const o of list) o.parent.remove(o);
    saved += list.length - 1;
  }
  return saved;
}
