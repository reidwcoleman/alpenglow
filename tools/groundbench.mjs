// Ground riding bench (no rendering, deterministic): the player's skier on the real course with
// keyboard-style steering, on each snow of the day. Prints speed, turn radius, skid angle, stops.
// node tools/groundbench.mjs [board]   (PARK=<id> another park, VDT=1 a ragged frame rate,
// SKIER=../src/other.js another copy of the physics to compare, TRACE=<snow> the linked turns)
import * as THREE from 'three';
// (some modules read the page's URL at load)
globalThis.location ??= { search: '', hash: '', href: 'http://localhost/' };
const { Skier, wrapAngle } = await import(process.env.SKIER ?? '../src/skier.js');
const { Forest } = await import('../src/trees.js');
const { randomOutfit } = await import('../src/skiermodel.js');
const { mulberry32 } = await import('../src/noise.js');
const { centerX, centerSlope } = await import('../src/course.js');

const board = process.argv[2] === 'board';
// (the day's snow, as sky.js COND)
const COND = {
  groomed: { mu: 1, grip: 1, powder: 0, ice: 0 },
  powder: { mu: 1.04, grip: 0.95, powder: 0.32, ice: 0 },
  ice: { mu: 0.8, grip: 0.86, powder: 0, ice: 0.28 },
  slush: { mu: 1.25, grip: 1.06, powder: 0.14, ice: 0 },
};
const scene = new THREE.Scene();
const forest = new Forest(scene);
// (VDT=1: a ragged frame rate, 30-70 fps, as a busy phone gives)
let H = 1 / 60;
const rDt = mulberry32(9);
const tickH = () => { if (process.env.VDT) H = 1 / (30 + rDt() * 40); };

function rider(snow) {
  const world = { scene, forest, tracks: null, skiers: [], arcade: true, snow: COND[snow] };
  const outfit = randomOutfit(mulberry32(3), false); outfit.board = board;
  const s = new Skier(world, { outfit, isPlayer: true, name: 'bench' });
  world.skiers.push(s);
  const crashes = []; s.on('crash', (e) => crashes.push(`${e.reason}@${s.pos.z.toFixed(0)}`));
  s.crashes = () => crashes.length ? crashes.join(',') : 0;
  return s;
}
// keyboard steering as input.js ramps it
function steerTo(s, target) {
  const cur = s.kSteer ?? 0;
  const rate = target === 0 ? 7 : Math.sign(target) !== Math.sign(cur) ? 9 : 4.5;
  s.kSteer = cur + Math.max(-rate * H, Math.min(rate * H, target - cur));
  // (in the air the arrows spin you: the bench rider keeps still there)
  s.controls.steer = s.onGround ? s.kSteer : 0;
}
const fall = (z) => Math.atan2(centerSlope(z), 1);
const vdir = (s) => Math.atan2(s.vel.x, s.vel.z);
const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2);

// 1. a held turn from speed: the arc the velocity follows, skid angle, speed lost
function turn(snow, v0, z, secs = 1.1) {
  const s = rider(snow);
  s.place(centerX(z) - 6, z, fall(z), v0);
  let a0 = vdir(s), minR = 1e9, bMax = 0, bSum = 0, n = 0, skid = 0;
  for (let t = 0; t < secs; t += H) {
    steerTo(s, -1);
    const d0 = vdir(s);
    s.step(H); tickH();
    if (!s.onGround) continue;
    const w = Math.abs(wrapAngle(vdir(s) - d0)) / H;
    if (t > 0.4 && w > 1e-3) minR = Math.min(minR, Math.hypot(s.vel.x, s.vel.z) / w);
    const b = Math.abs(wrapAngle(s.heading - vdir(s)));
    bMax = Math.max(bMax, b); bSum += b; n++; skid += s.skid;
  }
  return `turn ${snow.padEnd(7)} v0 ${v0} -> ${f1(s.speed)}  R ${f1(minR)} m  turned ${(Math.abs(wrapAngle(vdir(s) - a0)) * 57.3).toFixed(0)} deg  slip avg ${(bSum / n * 57.3).toFixed(1)} max ${(bMax * 57.3).toFixed(1)} deg  skid ${f2(skid / n)} lean ${f2(s.lean)}`;
}
// 2. linked turns down the piste: turn until the skis are ~A off the fall line, then the other way
function linked(snow, z0, secs, A0 = 0.75) {
  let A = A0;
  const s = rider(snow);
  s.place(centerX(z0), z0, fall(z0), 8);
  let dir = 1, vSum = 0, n = 0, bSum = 0, vMax = 0, air = 0, wasAir = false;
  for (let t = 0; t < secs; t += H) {
    const rel = wrapAngle(s.heading - fall(s.pos.z));
    // (faster, the turns go further across the hill to hold the speed, as a rider does)
    A = A0 + 0.5 * Math.max(0, Math.min(1, (s.speed - 16) / 10));
    const off = s.pos.x - centerX(s.pos.z);
    if (dir > 0 && (rel > A || off > 12)) dir = -1; else if (dir < 0 && (rel < -A || off < -12)) dir = 1;
    steerTo(s, dir > 0 ? -1 : 1);
    s.controls.tuck = 0;
    s.step(H); tickH();
    if (s.crash > 0) continue;
    if (!s.onGround) { air += H; if (process.env.TRACE === snow && !wasAir) console.log('takeoff', f1(t), 'z', s.pos.z.toFixed(0), 'v', f1(s.speed)); wasAir = true; continue; }
    wasAir = false;
    if (process.env.TRACE === snow && Math.round(t * 60) % 15 === 0) console.log(f1(t), 'z', s.pos.z.toFixed(0), 'x', f1(off), 'v', f1(s.speed), 'rel', f2(rel), 'slip', f2(wrapAngle(s.heading - vdir(s))), 'edge', f2(s.edge), 'sw', !!s.skiSwitch, 'load', f2(s.load ?? 1));
    vSum += s.speed; n++; vMax = Math.max(vMax, s.speed);
    bSum += Math.abs(wrapAngle(s.heading - vdir(s)));
  }
  return `linked ${snow.padEnd(7)} z ${z0}->${s.pos.z.toFixed(0)} (${f1((s.pos.z - z0) / secs)} m/s down)  v avg ${f1(vSum / n)} max ${f1(vMax)}  slip ${(bSum / n * 57.3).toFixed(1)} deg  air ${f1(air)} s  crashes ${s.crashes()}`;
}
// 3. straight down in a tuck
function straight(snow, z0, secs) {
  const s = rider(snow);
  s.place(centerX(z0), z0, fall(z0), 4);
  const out = [];
  for (let t = 0, k = 0; t < secs; t += H, k++) {
    steerTo(s, 0); s.controls.tuck = 1;
    // stay on the line
    s.controls.steer = Math.max(-1, Math.min(1, -wrapAngle(fall(s.pos.z) - s.heading) * 2 + (s.pos.x - centerX(s.pos.z)) * 0.05));
    s.step(H); tickH();
    if (k % 180 === 179) out.push(f1(s.speed));
  }
  return `tuck   ${snow.padEnd(7)} z ${z0}: v every 3 s ${out.join(' ')}  crashes ${s.crashes()}`;
}
// 4. a hockey stop from speed
function stop(snow, v0, z) {
  const s = rider(snow);
  s.place(centerX(z), z, fall(z), v0);
  const p0 = s.pos.clone();
  let t = 0;
  for (; t < 8 && s.speed > 1; t += H) { steerTo(s, -1); s.controls.brake = 1; s.step(H); tickH(); }
  return `stop   ${snow.padEnd(7)} ${v0} m/s: ${f2(t)} s, ${f1(s.pos.distanceTo(p0))} m (${f2(v0 / t / 9.81)} g)`;
}
// 5. over the moguls / rollers: the load on the legs
function bumps(snow, z0, dx, secs) {
  const s = rider(snow);
  const x = centerX(z0) + dx;
  s.place(x, z0, fall(z0), 9);
  let lo = 9, hi = 0, air = 0, vS = 0, n = 0;
  for (let t = 0; t < secs; t += H) {
    s.controls.steer = Math.max(-1, Math.min(1, -wrapAngle(fall(s.pos.z) - s.heading) * 2 + (s.pos.x - centerX(s.pos.z) - dx) * 0.08));
    s.step(H); tickH();
    if (!s.onGround) { air += H; continue; }
    lo = Math.min(lo, s.gload); hi = Math.max(hi, s.gload); vS += s.speed; n++;
  }
  return `bumps  ${snow.padEnd(7)} z ${z0}->${s.pos.z.toFixed(0)} g ${f2(lo)}..${f2(hi)} v avg ${f1(vS / n)} air ${f1(air)} s crashes ${s.crashes()}`;
}

for (const sn of ['groomed', 'ice', 'powder', 'slush']) {
  for (const v of [10, 18, 26]) console.log(turn(sn, v, 1960));
}
for (const sn of ['groomed', 'ice', 'powder', 'slush']) console.log(linked(sn, 200, 40));
console.log(linked('groomed', 1960, 30));
for (const sn of ['groomed', 'ice', 'powder']) console.log(straight(sn, 200, 15));
for (const sn of ['groomed', 'ice', 'powder', 'slush']) console.log(stop(sn, 20, 1960));
console.log(bumps('groomed', 1520, -16, 12));
console.log(bumps('groomed', 2000, 0, 12));
