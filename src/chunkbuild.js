// Raw terrain chunk arrays (no three.js) so a Web Worker can build them.
import { heightAt, meshHeightAt, centerX, halfWidth, surfaceAt } from './course.js';
import { smoothstep } from './noise.js';


// lod: this chunk's level; every vertex also carries the height the next coarser level has
// there (aMorph.x), so the shader can blend into it before the swap and nothing pops
export function buildChunkArrays(cx, cz, segs, size, lod = 0, coarsest = false) {
  const step = size / segs;
  const n = segs + 1;
  const gn = n + 2; // one-sample border for normals
  const H = new Float32Array(gn * gn);
  for (let j = 0; j < gn; j++) for (let i = 0; i < gn; i++) H[j * gn + i] = meshHeightAt(cx + (i - 1) * step, cz + (j - 1) * step, step);
  const vCount = n * n + 4 * n;
  const pos = new Float32Array(vCount * 3);
  const nrm = new Float32Array(vCount * 3);
  const pst = new Float32Array(vCount);
  const ice = new Float32Array(vCount);
  const surf = { powder: 0, ice: 0 };
  // the coarser level's grid (every other vertex, sampled as that level samples it)
  const cn = segs / 2 + 1, C = new Float32Array(cn * cn);
  for (let j = 0; j < cn; j++) for (let i = 0; i < cn; i++) C[j * cn + i] = coarsest ? 0 : meshHeightAt(cx + i * 2 * step, cz + j * 2 * step, step * 2);
  const coarseAt = (i, j) => {
    const ci = Math.min(cn - 2, i >> 1), cj = Math.min(cn - 2, j >> 1);
    const u = (i - ci * 2) / 2, w = (j - cj * 2) / 2;
    const a = C[cj * cn + ci], b = C[cj * cn + ci + 1], c = C[(cj + 1) * cn + ci], d = C[(cj + 1) * cn + ci + 1];
    // the same split as the index buffer: triangles (a, c, b) and (b, c, d)
    return u + w <= 1 ? a + u * (b - a) + w * (c - a) : d + (1 - u) * (c - d) + (1 - w) * (b - d);
  };
  const mor = new Float32Array(vCount * 2);
  let v = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = cx + i * step, z = cz + j * step;
    const k = (j + 1) * gn + (i + 1);
    const hx = H[k + 1] - H[k - 1], hz = H[k + gn] - H[k - gn];
    let nx = -hx, ny = 2 * step, nz = -hz;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    pos[v * 3] = x; pos[v * 3 + 1] = H[k]; pos[v * 3 + 2] = z;
    nrm[v * 3] = nx; nrm[v * 3 + 1] = ny; nrm[v * 3 + 2] = nz;
    surfaceAt(x, z, surf);
    pst[v] = 1 - surf.powder;
    ice[v] = surf.ice;
    mor[v * 2] = coarsest ? H[k] : coarseAt(i, j); mor[v * 2 + 1] = coarsest ? 0 : lod + 1;
    v++;
  }
  const idx = new Uint32Array(segs * segs * 6 + 4 * (n - 1) * 6);
  let q = 0;
  for (let j = 0; j < segs; j++) for (let i = 0; i < segs; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  // skirts hide cracks between neighbouring LODs
  const drop = step * 1.5 + 1.5;
  const sides = [
    Array.from({ length: n }, (_, i) => i),
    Array.from({ length: n }, (_, i) => (n - 1) * n + i),
    Array.from({ length: n }, (_, j) => j * n),
    Array.from({ length: n }, (_, j) => j * n + n - 1),
  ];
  const flips = [false, true, true, false];
  sides.forEach((side, s) => {
    const base = v;
    for (const k of side) {
      pos[v * 3] = pos[k * 3]; pos[v * 3 + 1] = pos[k * 3 + 1] - drop; pos[v * 3 + 2] = pos[k * 3 + 2];
      nrm[v * 3] = nrm[k * 3]; nrm[v * 3 + 1] = nrm[k * 3 + 1]; nrm[v * 3 + 2] = nrm[k * 3 + 2];
      pst[v] = pst[k]; ice[v] = ice[k];
      mor[v * 2] = mor[k * 2] - drop; mor[v * 2 + 1] = mor[k * 2 + 1];
      v++;
    }
    for (let i = 0; i < n - 1; i++) {
      const a = side[i], b = side[i + 1], c = base + i, d = base + i + 1;
      if (flips[s]) { idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c; }
      else { idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
    }
  });
  return { pos, nrm, pst, ice, idx, mor };
}
