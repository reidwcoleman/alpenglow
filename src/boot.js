// The heavy, pure number work of loading the mountain (no three.js here): terrain chunks, the
// surrounding ranges, the forest's placement, the shade field's heights and the snow's noise
// texture. Run on loading threads (bootWorker.js) when the browser has them, so it all happens
// at once on every core; or right here, one after the other, when it doesn't.
import { heightAt, treeDensity, slopeAt, LIFT, centerX, halfWidth, EXTENT_Z, HOSPITAL } from './course.js';
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
// and which of them get a trunk collider (with its boughs' reach and height)
export function placeTrees() {
  const rnd = mulberry32(99);
  const X = 880, ZA = -600, ZB = EXTENT_Z - 80, step = 8.5, SPRUCE_H = 16;
  const noise = makeSimplex(77);
  const liftDx = LIFT.x1 - LIFT.x0, liftDz = LIFT.z1 - LIFT.z0;
  const liftLen = Math.hypot(liftDx, liftDz);
  const ldx = liftDx / liftLen, ldz = liftDz / liftLen;
  const T = [], C = [];
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
    // and the hospital and its helipad
    if (Math.hypot(px - HOSPITAL.x, pz - HOSPITAL.z) < 56) continue;
    const h = 9 + rnd() * 12 + (d > 0.8 ? 3 : 0);
    const v = Math.floor(rnd() * 4);
    const g = 0.8 + rnd() * 0.35;
    const rot = rnd() * Math.PI * 2, sx = 0.9 + rnd() * 0.2;
    T.push(px, heightAt(px, pz) - 0.3, pz, v, h / SPRUCE_H, rot, g, sx);
    // only trees close to where people ski need colliders
    if (Math.abs(px - centerX(pz)) < halfWidth(pz) + 140) C.push(px, pz, Math.max(0.6, h * 0.035), Math.min(3.2, Math.max(1.3, h * 0.17)), h);
  }
  return { trees: Float32Array.from(T), colliders: Float32Array.from(C) };
}

export function run(job) {
  switch (job.kind) {
    case 'chunk': return buildChunkArrays(job.cx, job.cz, job.segs, job.size, job.lod, job.coarsest);
    case 'ring': return ringArrays(...job.args);
    case 'grid': return { data: gridHeights(...job.args) };
    case 'trees': return placeTrees();
    case 'noise': return { data: noiseTexData(job.size) };
  }
  throw new Error('job ' + job.kind);
}

// the typed arrays in a result, to hand back without copying
export function buffers(r) {
  const out = [];
  for (const k in r) if (ArrayBuffer.isView(r[k])) out.push(r[k].buffer);
  return out;
}
