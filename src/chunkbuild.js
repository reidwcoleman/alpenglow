// Raw terrain chunk arrays (no three.js) so a Web Worker can build them.
import { heightAt, meshHeightAt, centerX, halfWidth, surfaceAt } from './course.js';
import { smoothstep } from './noise.js';

function pisteWeight(x, z) {
  const hw = halfWidth(z);
  const adx = Math.abs(x - centerX(z));
  return 1 - smoothstep(hw - 3, hw + 6, adx);
}

export function buildChunkArrays(cx, cz, segs, size) {
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
  let v = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = cx + i * step, z = cz + j * step;
    const k = (j + 1) * gn + (i + 1);
    const hx = H[k + 1] - H[k - 1], hz = H[k + gn] - H[k - gn];
    let nx = -hx, ny = 2 * step, nz = -hz;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    pos[v * 3] = x; pos[v * 3 + 1] = H[k]; pos[v * 3 + 2] = z;
    nrm[v * 3] = nx; nrm[v * 3 + 1] = ny; nrm[v * 3 + 2] = nz;
    pst[v] = pisteWeight(x, z);
    ice[v] = pst[v] > 0 ? surfaceAt(x, z, surf).ice : 0;
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
      v++;
    }
    for (let i = 0; i < n - 1; i++) {
      const a = side[i], b = side[i + 1], c = base + i, d = base + i + 1;
      if (flips[s]) { idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c; }
      else { idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
    }
  });
  return { pos, nrm, pst, ice, idx };
}
