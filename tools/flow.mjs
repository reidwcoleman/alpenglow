// Hands-off flow check for a park: node tools/flow.mjs [park] [z0] [z1]. Rides the line (no tuck)
// and logs every feature's takeoff against the speed it's built for, plus speed every 20 m in
// [z0, z1]. Good flow: takeoff within ~10% of pspeed, flight on the landing, never below ~60 km/h.
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [park = 'yard', z0 = '0', z1 = '0'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE] });
const page = await b.newPage({ viewport: { width: 320, height: 180 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?menu=0&mode=run&park=${park}&q=low`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(800);
const out = await page.evaluate(([z0, z1]) => {
  const g = window.__game, p = g.player, C = window.__course, H = window.__h; g.paused = true;
  const J = C.JUMPS.filter((j) => !j.drop).sort((a, b) => a.lip - b.lip);
  const rows = [], trace = []; const dt = 1 / 60; let t = 0, air = null, nz = z0, min = 1e9, max = 0, lands = [], crashes = 0;
  p.on('land', (l) => lands.push(l)); p.on('crash', (e) => { crashes++; rows.push('CRASH ' + (e?.reason ?? '') + ' z' + Math.round(p.pos.z) + ' ' + Math.round(p.speed * 3.6) + ' km/h'); });
  const end = (C.FINISH_Z ?? 1e9) - 5;
  while (t < 300 && p.pos.z < end) {
    const sp = p.speed, N = J.find((j) => j.lip > p.pos.z - 1), look = Math.max(8, sp * 0.9), tz = p.pos.z + look;
    const tx = N && tz > N.lip - N.ramp - 40 ? C.centerX(Math.min(tz, N.lip)) + N.dx : C.centerX(tz);
    const hv = Math.atan2(p.vel.x, p.vel.z), want = Math.atan2(tx - p.pos.x, look), err = Math.atan2(Math.sin(want - hv), Math.cos(want - hv));
    const c = p.controls; c.steer = p.onGround ? -Math.max(-1, Math.min(1, err * 3)) : 0; c.tuck = 0; c.brake = 0; c.jump = false; c.flip = 0; c.grab = false;
    const was = !p.onGround;
    p.step(dt); t += dt;
    if (p.pos.z > 150 && p.onGround) { min = Math.min(min, sp); max = Math.max(max, sp); }
    if (p.pos.z >= nz && nz < z1) { trace.push(`z${Math.round(p.pos.z)} ${Math.round(sp * 3.6)}${p.onGround ? '' : '*'} x${(p.pos.x - C.centerX(p.pos.z)).toFixed(1)} sf${C.surfaceAt ? String(C.surfaceAt(p.pos.x, p.pos.z)?.powder ?? C.surfaceAt(p.pos.x, p.pos.z)).slice(0,5) : ''}`); nz += 10; }
    if (!was && !p.onGround && p.crash <= 0) air = { name: N?.name, J: N, z: p.pos.z, k: sp * 3.6, t };
    if (was && (p.onGround || p.crash > 0) && air) {
      const K = air.J, d = p.pos.z - air.z, tab = K?.table ?? 0, land = K?.land ?? 0, L = lands.pop();
      rows.push(`${String(air.name).padEnd(14)} z${Math.round(air.z)} in ${Math.round(air.k)} built ${Math.round((K?.pspeed ?? 0) * 3.6)} air ${(t - air.t).toFixed(2)} dist ${d.toFixed(0)} (table ${tab.toFixed(0)} land ${land.toFixed(0)}) out ${Math.round(p.speed * 3.6)}${d < tab ? ' SHORT' : d > tab + land ? ' LONG' : ''}`);
      air = null;
    }
  }
  rows.push('END ' + JSON.stringify({ grind: p.grind?.R?.name ?? p.grind?.rail?.name ?? !!p.grind, g: p.onGround, crash: p.crash, x: +(p.pos.x - C.centerX(p.pos.z)).toFixed(1), y: +(p.pos.y - H(p.pos.x, p.pos.z)).toFixed(2), v: +p.speed.toFixed(2), air: +p.airTime.toFixed(1), held: !!p.held, slam: p.state ?? '' })); return { rows, trace: trace.join(' | '), time: t.toFixed(1), min: Math.round(min * 3.6), max: Math.round(max * 3.6), crashes, z: Math.round(p.pos.z), fin: end };
}, [+z0, +z1]);
console.log(`${park} time ${out.time}s z ${out.z}/${Math.round(out.fin)} speed ${out.min}-${out.max} km/h crashes ${out.crashes}`);
console.log(out.rows.join('\n')); if (out.trace) console.log(out.trace);
await b.close();
