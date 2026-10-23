// The heavy, pure number work of loading the mountain (no three.js here): terrain chunks, the
// surrounding ranges, the forest's placement, the shade field's heights and the snow's noise
// texture. Run on loading threads (bootWorker.js) when the browser has them, so it all happens
// at once on every core; or right here, one after the other, when it doesn't.
import { heightAt, treeDensity, slopeAt, LIFT, centerX, halfWidth, EXTENT_Z, MAP, PARK_FEET, PIPE, ROLLERS, surfaceAt, parkAt } from './course.js';
import { buildChunkArrays } from './chunkbuild.js';
import { makeSimplex, mulberry32 } from './noise.js';

export function noiseTexData(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const nA = makeSimplex(3), nB = makeSimplex(5), nC = makeSimplex(11), nD = makeSimplex(13);
  const TAU = Math.PI * 2;
  // periodic noise via sampling a torus in 4D-ish: blend two 2D lookups
  const per = (n, x, y, f) => {
    const a = (x / size) * TAU, b = (y / size) * TAU;
    const r = f / TAU;
    return (n(Math.cos(a) * r + 10, Math.sin(a) * r + 10) + n(Math.cos(b) * r + 40, Math.sin(b) * r + 40) +
      n((Math.cos(a) + Math.sin(b)) * r * 0.7 + 70, (Math.sin(a) + Math.cos(b)) * r * 0.7 + 70)) / 3;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    let r = 0, g = 0, b = 0, a = 0, amp = 1, tot = 0;
    for (let o = 0; o < 4; o++) {
      const f = 4 * Math.pow(2, o);
      r += per(nA, x, y, f) * amp; g += per(nB, x, y, f) * amp;
      b += per(nC, x, y, f * 2) * amp; a += per(nD, x, y, f * 1.5) * amp;
      tot += amp; amp *= 0.5;
    }
    data[i] = Math.max(0, Math.min(255, (r / tot * 1.6 + 0.5) * 255));
    data[i + 1] = Math.max(0, Math.min(255, (g / tot * 1.6 + 0.5) * 255));
    data[i + 2] = Math.max(0, Math.min(255, (b / tot * 1.6 + 0.5) * 255));
    data[i + 3] = Math.max(0, Math.min(255, (a / tot * 1.6 + 0.5) * 255));
  }
  return data;
}

// a ring of the surrounding ranges: positions on an S grid, sunk where the finer mesh covers it
export function ringArrays(S, X0, X1, ZA, ZB, holeX, holeZ0, holeZ1) {
  const nx = Math.floor((X1 - X0) / S) + 1, nz = Math.floor((ZB - ZA) / S) + 1;
  const pos = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = X0 + i * S, z = ZA + j * S;
    let y = heightAt(x, z);
    if (x > -holeX + S && x < holeX - S && z > holeZ0 + S && z < holeZ1 - S) y -= 40;
    // the band where it meets the finer mesh sits just under it: no two surfaces fighting
    else if (x >= -holeX && x <= holeX && z >= holeZ0 && z <= holeZ1) y -= 2.5;
    const k = (j * nx + i) * 3;
    pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let q = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  return { pos, idx, nx, nz };
}

// heights on a grid (the shade field's)
export function gridHeights(x0, z0, S, nx, nz) {
  const data = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) data[j * nx + i] = heightAt(x0 + i * S, z0 + j * S);
  return data;
}

// where every spruce stands: per tree x, y, z, variant, height scale, turn, grey tint, width;
// and which of them get a trunk collider (with its boughs' reach and height). part/of: one
// band of the rows (each row has its own dice, so the bands can go to different threads)
export const TREE_PARTS = 4;
export function placeTrees(part = 0, of = 1) {
  const X = 880, ZA = -600, ZB = EXTENT_Z - 80, step = 8.5, SPRUCE_H = 16;
  const rows = Math.ceil((ZB - ZA) / step), r0 = Math.floor((rows * part) / of), r1 = Math.floor((rows * (part + 1)) / of);
  let rnd;
  const noise = makeSimplex(77);
  const liftDx = LIFT.x1 - LIFT.x0, liftDz = LIFT.z1 - LIFT.z0;
  const liftLen = Math.hypot(liftDx, liftDz);
  const ldx = liftDx / liftLen, ldz = liftDz / liftLen;
  const T = [], C = [];
  for (let r = r0; r < r1; r++) {
    const z = ZA + r * step;
    rnd = mulberry32(99 + r * 7919);
    for (let x = -X; x < X; x += step) {
      const px = x + (rnd() - 0.5) * step * 0.95, pz = z + (rnd() - 0.5) * step * 0.95;
      const d = treeDensity(px, pz);
      if (d <= 0.02 || rnd() > d * 0.85) continue;
      if (slopeAt(px, pz) > 0.9) continue;
      // keep the chairlift corridor clear
      const lx = px - LIFT.x0, lz = pz - LIFT.z0;
      const along = lx * ldx + lz * ldz;
      if (along > -20 && along < liftLen + 20 && Math.abs(lx * ldz - lz * ldx) < 9) continue;
      if (noise(px / 30, pz / 30) < -0.35 && rnd() < 0.6) continue;
      // open hillsides: the pines stand in groves with the odd lone tree between (the tree-skiing
      // parks keep their forest)
      if (!MAP.glades) {
        const grove = noise(px / 140 + 13.1, pz / 140 - 7.7), near = Math.abs(px - centerX(pz)) - halfWidth(pz);
        // (beside the piste a few, the slopes above it in clumps, the far hillsides near bare)
        if (grove < (near < 60 ? 0.42 : near < 300 ? 0.18 : 0.4) && rnd() > (near < 300 ? 0.06 : 0.015)) continue;
      }
      const h = 9 + rnd() * 12 + (d > 0.8 ? 3 : 0);
      const v = Math.floor(rnd() * 4);
      const g = 0.8 + rnd() * 0.35;
      const rot = rnd() * Math.PI * 2, sx = 0.9 + rnd() * 0.2;
      T.push(px, heightAt(px, pz) - 0.3, pz, v, h / SPRUCE_H, rot, g, sx);
      // only trees close to where people ski need colliders
      if (Math.abs(px - centerX(pz)) < halfWidth(pz) + 140) C.push(px, pz, Math.max(0.6, h * 0.035), Math.min(3.2, Math.max(1.3, h * 0.17)), h);
    }
  }
  return { trees: Float32Array.from(T), colliders: Float32Array.from(C) };
}

// a park feature's snow: a grid laid along the course (columns across the piste, rows down
// it), heights from heightAt, with normals, the groomed/powder mix and how steep its faces are
export function featArrays(fi) {
  const f = PARK_FEET[fi];
  const isPipe = f.dx0 < PIPE.dx && f.dx1 > PIPE.dx, isRoll = f.dx0 < ROLLERS.dx && f.dx1 > ROLLERS.dx;
  const ddx = isPipe ? 0.25 : isRoll ? 0.5 : f.res ?? 0.3, dz = isPipe ? 0.6 : isRoll ? 0.6 : f.res ?? 0.3;
  const nx = Math.ceil((f.dx1 - f.dx0) / ddx) + 1, nz = Math.ceil((f.z1 - f.z0) / dz) + 1;
  // one extra ring of samples for the normals
  const gx = nx + 2, gz = nz + 2;
  const H = new Float32Array(gx * gz), X = new Float32Array(gx * gz), F = new Float32Array(gx * gz);
  for (let j = 0; j < gz; j++) {
    const z = f.z0 + (j - 1) * dz, c = centerX(z);
    for (let i = 0; i < gx; i++) {
      const x = c + f.dx0 + (i - 1) * ddx;
      X[j * gx + i] = x;
      H[j * gx + i] = heightAt(x, z);
      F[j * gx + i] = parkAt(f.dx0 + (i - 1) * ddx, z);
    }
  }
  const pos = new Float32Array(nx * nz * 3), nrm = new Float32Array(nx * nz * 3);
  const pst = new Float32Array(nx * nz).fill(1), ice = new Float32Array(nx * nz), face = new Float32Array(nx * nz);
  const surf = { powder: 0, ice: 0 };
  let v = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = (j + 1) * gx + (i + 1);
    const z = f.z0 + j * dz;
    pos[v * 3] = X[k]; pos[v * 3 + 1] = H[k]; pos[v * 3 + 2] = z;
    pst[v] = 1 - surfaceAt(X[k], z, surf).powder;
    // how steeply the feature itself rises out of the run here (its faces get a blue shade)
    const fx = (F[k + 1] - F[k - 1]) / (2 * ddx), fz = (F[k + gx] - F[k - gx]) / (2 * dz);
    const fs = Math.hypot(fx, fz);
    face[v] = Math.min(1, Math.max(0, (fs - 0.06) / 0.34)) ** 1.5;
    const hx = (H[k + 1] - H[k - 1]) / (2 * ddx), hz = (H[k + gx] - H[k - gx]) / (2 * dz);
    const l = Math.hypot(hx, 1, hz);
    nrm[v * 3] = -hx / l; nrm[v * 3 + 1] = 1 / l; nrm[v * 3 + 2] = -hz / l;
    v++;
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let q = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  return { pos, nrm, pst, ice, face, idx };
}

export function run(job) {
  switch (job.kind) {
    case 'chunk': return buildChunkArrays(job.cx, job.cz, job.segs, job.size, job.lod, job.coarsest);
    case 'ring': return ringArrays(...job.args);
    case 'grid': return { data: gridHeights(...job.args) };
    case 'trees': return placeTrees(job.part, job.of);
    case 'noise': return { data: noiseTexData(job.size) };
    case 'feat': return featArrays(job.i);
  }
  throw new Error('job ' + job.kind);
}

// the typed arrays in a result, to hand back without copying
export function buffers(r) {
  const out = [];
  for (const k in r) if (ArrayBuffer.isView(r[k])) out.push(r[k].buffer);
  return out;
}
