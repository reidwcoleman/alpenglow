// RoundedBoxGeometry, built once per size: the village asks for the same sills, shutters and
// snow caps hundreds of times, and building one is slow (its UVs especially). `new` works on it
// as on the original, and every caller gets its own copy to move about.
import { BufferGeometry } from 'three';
import { RoundedBoxGeometry as RB } from 'three/addons/geometries/RoundedBoxGeometry.js';

const cache = new Map();
export function RoundedBoxGeometry(sx = 1, sy = 1, sz = 1, seg = 2, r = 0.1) {
  const k = `${sx} ${sy} ${sz} ${seg} ${r}`;
  let g = cache.get(k);
  // (kept as a plain BufferGeometry: cloning an RB builds a fresh default one first)
  if (!g) { g = new BufferGeometry().copy(new RB(sx, sy, sz, seg, r)); cache.set(k, g); }
  return g.clone();
}
