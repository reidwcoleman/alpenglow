// The mountain as the rider's physics sees it (src/ridesim.js): the snow's height and grade, the
// kickers' lips, the rails and the pipe's walls.
import { heightAt, centerX, centerSlope, surfaceAt, JUMPS, RAILS, railAt, PIPE, pipeWalls } from './course.js';

const LIP_LEN = 2.5, RAMP_RUN = 8.5, deg = Math.PI / 180;
const KICKS = [], DROPS = [];
for (const J of JUMPS) {
  if (J.drop) { DROPS.push({ z: J.z + J.ramp + J.table, dx: J.dx, width: J.w, J }); continue; }
  const lipAngle = J.lipAngle ?? Math.atan((2 * J.h) / J.ramp) / deg;
  KICKS.push({ z: J.lip, offset: J.dx, width: J.w, lipAngle, lipLength: Math.min(LIP_LEN, J.ramp * 0.3), run: J.ramp, transfer: 0, J });
}
for (const R of RAILS) Object.assign(R, { entry: 'ride', length: R.L, width: R.hw * 2, entryRun: RAMP_RUN });

// by 16 m stretches along the run, so a step only looks at what's near
const BZ = 16;
const bucket = (list, a, b) => {
  const B = new Map();
  for (const f of list) for (let i = Math.floor(a(f) / BZ) - 1; i <= Math.floor(b(f) / BZ) + 1; i++) { if (!B.has(i)) B.set(i, []); B.get(i).push(f); }
  return B;
};
const KB = bucket(KICKS, (K) => K.z - K.run, (K) => K.z);
const RB = bucket(RAILS, (R) => R.z - RAMP_RUN - 16, (R) => R.z + R.L + 20);
const NONE = [];
const near = (B, z) => B.get(Math.floor(z / BZ)) ?? NONE;

const kickerCenter = (K, z) => centerX(z) + K.offset;
const lipCross = (K, x, z) => {
  const c = kickerCenter(K, z), r = Math.max(0.6, K.width / 2 - 0.05), a = Math.max(c - r, Math.min(c + r - 1, x - 0.5));
  return heightAt(a + 1, z) - heightAt(a, z);
};
const _s = { powder: 0, ice: 0 }, _r = { s: 0, lat: 0, y: 0, slope: 0 }, _g = { x: 0, z: 0 };

export function pipeOffset(x, z) {
  if (z < PIPE.z0 + 8 || z > PIPE.z1 - 6) return null;
  const off = x - centerX(z) - PIPE.dx;
  if (Math.abs(off) > PIPE.flat + PIPE.lip + 0.6 || pipeWalls(z) < 0.6) return null;
  return off;
}

export const mountain = {
  h: heightAt,
  center: centerX,
  centerSlope,
  maxSpeed: 43,
  // (the rules of a long run, and the sides of the built forms are walls you can run into)
  classic: true,
  snowWalls: true,
  // the rise per metre going `heading`; on a lip it's the lip's own angle
  grade(x, z, heading) {
    for (const K of near(KB, z)) {
      if (z <= K.z && z >= K.z - K.lipLength + 0.5 && Math.abs(x - kickerCenter(K, z)) < K.width / 2) return lipCross(K, x, z) * Math.sin(heading) + Math.tan(K.lipAngle * deg) * Math.cos(heading);
    }
    const a = Math.sin(heading) * 0.5, b = Math.cos(heading) * 0.5;
    return heightAt(x + a, z + b) - heightAt(x - a, z - b);
  },
  // the snow under a body facing `heading`: slope along it and across it
  frame(x, z, heading, out) {
    let gx = heightAt(x + 0.5, z) - heightAt(x - 0.5, z), gz = heightAt(x, z + 0.5) - heightAt(x, z - 0.5);
    for (const K of near(KB, z)) {
      if (z <= K.z && z > K.z - K.lipLength - 3 && Math.abs(x - kickerCenter(K, z)) < K.width / 2) {
        gx = lipCross(K, x, z);
        if (z >= K.z - K.lipLength + 0.5) gz = Math.tan(K.lipAngle * deg);
        break;
      }
    }
    out.slope = gx * Math.sin(heading) + gz * Math.cos(heading);
    out.cross = gx * Math.cos(heading) - gz * Math.sin(heading);
    return out;
  },
  deep: (x, z) => surfaceAt(x, z, _s).powder > 0.5,
  kickersNear: (z) => near(KB, z),
  kickerCenter,
  onRunIn(x, z) {
    for (const K of near(KB, z)) if (z >= K.z - K.run && z <= K.z && Math.abs(x - kickerCenter(K, z)) < K.width / 2) return true;
    return false;
  },
  railsNear: (z) => near(RB, z),
  railProj(R, x, z, out) { railAt(R, x, z, _r); out.t = _r.s / R.L; out.side = _r.lat; return out; },
  railTop(R, t) { railAt(R, R.a.x + R.dir.x * t * R.L, R.a.z + R.dir.z * t * R.L, _r); return _r.y; },
  railPoint(R, t, out) { out.x = R.a.x + R.dir.x * t * R.L; out.z = R.a.z + R.dir.z * t * R.L; return out; },
  railYaw: (R) => R.yaw,
  // the pipe: on a wall the velocity lives on the wall
  onWall(x, z) { const o = pipeOffset(x, z); return o !== null && Math.abs(o) > PIPE.flat; },
  gradXZ(x, z) {
    _g.x = (heightAt(x + 0.1, z) - heightAt(x - 0.1, z)) / 0.2;
    _g.z = (heightAt(x, z + 0.1) - heightAt(x, z - 0.1)) / 0.2;
    return _g;
  },
  // going out over a pipe's lip: the wall throws you straight up and a little back in
  pipeLip(r, x0, z0) {
    const a = pipeOffset(x0, z0), b = pipeOffset(r.x, r.z), L = PIPE.flat + PIPE.amax;
    if (a === null || b === null || Math.abs(a) >= L || Math.abs(b) < L) return null;
    const sg = Math.sign(b), sl = centerSlope(r.z), il = 1 / Math.hypot(1, sl), ax = il, az = -sl * il;
    const out = (r.velocityX * ax + r.velocityZ * az) * sg;
    if (out <= 0) return null;
    const g = this.gradXZ(x0, z0), rise = g.x * r.velocityX + g.z * r.velocityZ, up = Math.hypot(rise, out) + r.charge * 2.2;
    const back = Math.min(up * 0.5, (3.2 * 17.5) / (2 * Math.max(up, 0.5)));
    return { x: r.x, y: r.y, z: r.z, gx: g.x, gz: g.z, vx: r.velocityX - ax * sg * (out + back), vz: r.velocityZ - az * sg * (out + back), vertical: up };
  },
  // a pillow's ledge lets go of you at the speed you were going
  dropAt(r, x0, z0) {
    for (const D of DROPS) {
      if (z0 <= D.z && r.z > D.z && Math.abs(r.x - centerX(r.z) - D.dx) < D.width / 2 + 1 && r.speed > 5) return { vertical: 0.4 };
    }
    return null;
  },
};
