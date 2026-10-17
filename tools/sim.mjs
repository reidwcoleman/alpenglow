// Headless race/freeride simulation: node tools/sim.mjs [race|free] [seconds]
import * as THREE from 'three';
import { Skier } from '../src/skier.js';
import { AIController } from '../src/ai.js';
import { Forest } from '../src/trees.js';
import { randomOutfit } from '../src/skiermodel.js';
import { mulberry32 } from '../src/noise.js';
import { START_Z, FINISH_Z, GATES, centerX, halfWidth, sectionName, lineX } from '../src/course.js';

const mode = process.argv[2] ?? 'race';
const secs = Number(process.argv[3] ?? 300);
const rnd = mulberry32(Number(process.env.SEED ?? 7));
const scene = new THREE.Scene();
const forest = new Forest(scene);
const skiers = [], ais = [];
const world = { scene, forest, tracks: null, race: mode === 'race', raceStarted: true, skiers };
const stats = new Map();
function add(style, z, x) {
  const s = new Skier(world, { outfit: randomOutfit(rnd, style === 'racer'), name: style + skiers.length, sidecut: style === 'racer' ? 24 : 16 });
  const ai = new AIController(s, style, rnd, world);
  s.place(x, z, null, style === 'racer' ? 0 : ai.targetSpeed * 0.7); ai.lastZ = z;
  skiers.push(s); ais.push(ai);
  const st = { style, crashes: [], gate: 0, missed: 0, finish: null, top: 0, air: 0, maxAir: 0, stuck: 0 };
  stats.set(s, st);
  s.on('crash', (e) => st.crashes.push(`${e.reason}@${Math.round(s.pos.z)}(${sectionName(s.pos.z)})`));
  s.on('land', (t) => { st.maxAir = Math.max(st.maxAir, t.air); });
}
if (mode === 'race') {
  [-10.5, -7.5, -4.5, -1.5, 1.5, 4.5, 7.5, 10.5].forEach((o) => add('racer', START_Z, centerX(START_Z) + o));
  ais.forEach((ai, i) => { ai.skill = 0.78 + (i / 8) * 0.2; ai.s.grip = 1.6 + ai.skill * 0.22; });
} else {
  for (const [style, n] of [['expert', 5], ['carver', 9], ['cruiser', 8], ['beginner', 4], ['park', 6]])
    for (let i = 0; i < n; i++) { const z = style === 'park' ? 900 + rnd() * 400 : 60 + rnd() * 3000; add(style, z, centerX(z) + (rnd() - 0.5) * halfWidth(z)); }
}
const H = 1 / 100;
let t = 0, bumps = 0;
for (; t < secs; t += H) {
  for (const ai of ais) ai.update(H, skiers);
  for (const s of skiers) s.step(H);
  for (let i = 0; i < skiers.length; i++) for (let j = i + 1; j < skiers.length; j++) {
    const a = skiers[i], b = skiers[j];
    const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z, d2 = dx * dx + dz * dz;
    if (d2 > 0.81) continue;
    const d = Math.sqrt(d2) || 0.01, nx = dx / d, nz = dz / d;
    const rel = (a.vel.x - b.vel.x) * nx + (a.vel.z - b.vel.z) * nz;
    const push = (0.9 - d) / 2;
    a.pos.x += nx * push; a.pos.z += nz * push; b.pos.x -= nx * push; b.pos.z -= nz * push;
    if (rel < 0) {
      a.vel.x -= rel * nx; a.vel.z -= rel * nz; b.vel.x += rel * nx; b.vel.z += rel * nz;
      bumps++;
      if (-rel > 5.5) for (const s of [a, b]) if (s.crash <= 0) s.startCrash('skier');
    }
  }
  for (const s of skiers) {
    const st = stats.get(s);
    st.top = Math.max(st.top, s.speed);
    if (s.stuck > 4) { st.stuck++; s.respawn(); }
    while (st.gate < GATES.length && s.pos.z >= GATES[st.gate].z) {
      const dx = s.pos.x - GATES[st.gate].x;
      if (Math.abs(dx) > GATES[st.gate].width / 2 + 0.3) { st.missed++; if (process.env.V) console.log('miss', st.gate, sectionName(s.pos.z), 'dx', dx.toFixed(1), 'v', (s.speed*3.6).toFixed(0), 'line', (lineX(s.pos.z)-GATES[st.gate].x).toFixed(1)); }
      st.gate++;
    }
    if (st.finish == null && s.pos.z >= FINISH_Z) st.finish = t;
  }
  if (mode === 'race' && [...stats.values()].every((s) => s.finish != null)) break;
}
for (const [s, st] of stats) {
  console.log(`${st.style.padEnd(8)} grip ${s.grip.toFixed(2)} fin ${st.finish?.toFixed(1) ?? '--'.padStart(5)} top ${(st.top * 3.6).toFixed(0)} km/h missed ${st.missed} stuck ${st.stuck} air ${st.maxAir.toFixed(1)} z ${s.pos.z.toFixed(0)} crashes ${st.crashes.length} ${st.crashes.slice(0, 4).join(' ')}`);
}
console.log('sim time', t.toFixed(1), 'bumps', bumps);
