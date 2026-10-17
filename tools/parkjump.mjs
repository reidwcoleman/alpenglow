// Table-jump calibration: approach speed at the lip -> where you land and how hard.
//   node tools/parkjump.mjs
import * as THREE from 'three';
import { Skier } from '../src/skier.js';
import { randomOutfit } from '../src/skiermodel.js';
import { mulberry32 } from '../src/noise.js';
import { JUMPS, centerX } from '../src/course.js';
const scene = new THREE.Scene();
const world = { scene, forest: null, tracks: null, skiers: [] };
const rnd = mulberry32(1);
for (const J of JUMPS) {
  const rows = [];
  for (let v = 8; v <= 22; v += 1) {
    const s = new Skier(world, { outfit: randomOutfit(rnd), name: 't' });
    const z = J.z - 0.5;
    s.place(centerX(z) + J.dx, z, Math.atan2(centerX(z + 1) - centerX(z), 1), v);
    let landed = null, crashed = false, vlip = 0;
    s.on('land', (t) => { landed = landed ?? { z: s.pos.z, vn: t.vn, air: t.air, rise: t.rise }; });
    s.on('crash', () => { crashed = true; });
    for (let i = 0; i < 600 && !landed && !crashed; i++) { if (s.pos.z < J.lip) vlip = s.speed; s.step(0.01); }
    const knuckle = J.lip + J.table;
    if (landed) rows.push(`${v}->${vlip.toFixed(1)}: ${(landed.z - knuckle).toFixed(1)}m vn${landed.vn.toFixed(1)} ${landed.air.toFixed(2)}s`);
    else rows.push(`${v}: ${crashed ? 'CRASH' : 'none'}`);
    s.dispose();
  }
  console.log(J.name, 'table', J.table, 'land', J.land, '\n  ' + rows.join('\n  '));
}
