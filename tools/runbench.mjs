// Our run driven like tools/c7run.js drives Cork7's (aim down each kicker's line, no other input): node tools/runbench.mjs [park] [cruise|tuck] [spin secs] [flip secs]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [park = 'yard', MODE = 'cruise', SPIN = '0', FLIP = '0'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 320, height: 180 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:5260/?menu=0&mode=run&park=${park}&q=low`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(1500);
const out = await page.evaluate(async ([MODE, SPIN, FLIP]) => {
  const g = window.__game, p = g.player, C = window.__course;
  g.paused = true;
  const JUMPS = C.JUMPS.filter((j) => !j.drop).sort((a, b) => a.lip - b.lip);
  const dt = 1 / 60, log = [], jumps = [];
  let t = 0, air = null, lands = [];
  p.on('land', (tr) => lands.push(tr)); p.on('crash', (e) => lands.push({ crash: e.reason }));
  const zEnd = C.FINISH_Z ?? 1e9;
  while (t < 240 && p.pos.z < zEnd - 5) {
    const sp = p.speed * p.pace;
    const J = JUMPS.find((j) => j.lip > p.pos.z - 1);
    const look = Math.max(8, sp * 0.9), tz = p.pos.z + look;
    const tx = J && tz > J.lip - J.ramp - 40 ? C.centerX(Math.min(tz, J.lip)) + J.dx : C.centerX(tz);
    const hv = Math.atan2(p.vel.x, p.vel.z), want = Math.atan2(tx - p.pos.x, look);
    const err = Math.atan2(Math.sin(want - hv), Math.cos(want - hv));
    const c = p.controls;
    c.steer = p.onGround ? -Math.max(-1, Math.min(1, err * 3)) : 0; c.tuck = MODE === 'tuck' ? 1 : 0; c.brake = 0; c.jump = false; c.flip = 0;
    if (!p.onGround && SPIN > 0 && p.airTime < SPIN) c.steer = -1;
    if (!p.onGround && FLIP > 0 && p.airTime < FLIP) c.flip = 1;
    const was = !p.onGround;
    p.step(dt * p.pace); t += dt;
    if (p.crash > 0 && !air) {}
    if (!was && !p.onGround && p.crash <= 0) air = { z: Math.round(p.pos.z), kmh: Math.round(sp * 3.6), vy: +p.vel.y.toFixed(2), t, z0: p.pos.z };
    if (was && (p.onGround || p.crash > 0) && air) { air.air = +(t - air.t).toFixed(2); air.dist = +(p.pos.z - air.z0).toFixed(1); air.out = Math.round(p.speed * p.pace * 3.6); const L = lands.pop(); air.note = (L?.crash ? 'CRASH ' + L.crash : L ? (L.stomp ? 'STOMP' : L.sketchy ? 'SKETCHY' : 'land') : '') + (L?.spin ? ' ' + L.spin : '') + (L?.flips ? ' F' + L.flips : ''); delete air.t; delete air.z0; if (air.air > 0.4) jumps.push(air); air = null; }
    if (Math.abs(t - Math.round(t * 2) / 2) < dt / 2) log.push(`${t.toFixed(1)}s z${p.pos.z.toFixed(0)} ${(p.speed * p.pace * 3.6).toFixed(0)}`);
  }
  return { mode: MODE, time: +t.toFixed(1), z: +p.pos.z.toFixed(0), log: log.filter((_, i) => i % 6 === 0).join(' | '), jumps };
}, [MODE, +SPIN, +FLIP]);
console.log(JSON.stringify(out));
await b.close();
