// Headless park check: AI riders on each line, count airs/grinds/crashes.
//   node tools/parksim.mjs [seconds]
import * as THREE from 'three';
import { Skier } from '../src/skier.js';
import { AIController } from '../src/ai.js';
import { randomOutfit } from '../src/skiermodel.js';
import { mulberry32 } from '../src/noise.js';
import { PARK, PIPE, JUMPS, RAILS, centerX } from '../src/course.js';
const T = Number(process.argv[2] ?? 120);
const scene = new THREE.Scene();
const skiers = [];
const world = { scene, forest: null, tracks: null, skiers };
const rnd = mulberry32(5);
const stats = {};
for (const line of ['jumps', 'rails', 'pipe']) for (let i = 0; i < 3; i++) {
  const s = new Skier(world, { outfit: randomOutfit(rnd), name: line + i });
  const ai = new AIController(s, 'park', rnd, world);
  ai.line = line; s.ai = ai; skiers.push(s);
  const st = (stats[line] ??= { airs: 0, big: 0, grinds: 0, gdist: 0, crash: {}, laps: 0, maxRise: 0 });
  s.on('land', (t) => { if (t.air > 0.5) st.airs++; if (t.air > 1.2) st.big++; st.maxRise = Math.max(st.maxRise, t.rise); });
  s.on('grindEnd', (g) => { st.grinds++; st.gdist += g.dist; });
  s.on('crash', (e) => { st.crash[e.reason] = (st.crash[e.reason] ?? 0) + 1; });
  s.reset = () => {
    const z = line === 'pipe' ? PIPE.z0 - 6 : PARK.top + i * 3;
    const dx = line === 'jumps' ? JUMPS[0].dx : line === 'rails' ? RAILS[0].dx : PIPE.dx;
    s.place(centerX(z) + dx, z, null, 6); ai.lastZ = z;
  };
  s.reset();
}
const H = 0.01;
for (let t = 0; t < T; t += H) {
  for (const s of skiers) s.ai.update(H, skiers);
  for (const s of skiers) {
    s.step(H);
    if (s.pos.z > PARK.z1 + 20 || s.stuck > 4) { stats[s.ai.line].laps++; s.reset(); }
  }
}
for (const [k, v] of Object.entries(stats)) console.log(k, JSON.stringify({ ...v, gdist: +v.gdist.toFixed(1), maxRise: +v.maxRise.toFixed(1) }));
