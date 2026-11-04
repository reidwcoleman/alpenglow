// Our side of tools/c7trick.js, stepped the same way (1/60 s, keys held HOLD s from the lip):
//   TRICK=spin|spingrab|flip|cork HOLD=0.6 node tools/ourtrick2.mjs [park] [nth kicker]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [park = 'yard', nth = '1'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE] });
const page = await b.newPage({ viewport: { width: 320, height: 180 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:5260/?menu=0&mode=run&park=${park}&q=low`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
console.log(await page.evaluate(([TR, HOLD, nth]) => {
  const g = window.__game, p = g.player, C = window.__course; g.paused = true;
  const J = C.JUMPS.filter((j) => !j.drop).sort((a, b) => a.lip - b.lip)[nth];
  p.place(C.centerX(J.lip - 25) + J.dx, J.lip - 25, null, J.pspeed);
  const rows = [], dt = 1 / 60; let t = 0, at = -1, y0 = 0, last = null;
  p.on('land', (tr) => { last = tr; }); p.on('crash', (e) => { last = { crash: e.reason }; });
  while (t < 20) {
    const c = p.controls;
    c.steer = 0; c.flip = 0; c.grab = false; c.grabKind = null; c.jump = false; c.tuck = 0; c.brake = 0; c.up = false;
    if (p.onGround && at < 0) { const tx = C.centerX(p.pos.z + 10) + J.dx, hv = Math.atan2(p.vel.x, p.vel.z), want = Math.atan2(tx - p.pos.x, 10); c.steer = -Math.max(-1, Math.min(1, Math.atan2(Math.sin(want - hv), Math.cos(want - hv)) * 3)); }
    if (!p.onGround && at >= 0 && t - at < HOLD) {
      if (TR !== 'flip') c.steer = -1;
      if (TR === 'spingrab') { c.grab = true; c.grabKind = 'mute'; }
      if (TR === 'flip' || TR === 'cork') c.flip = -1;
    }
    const was = !p.onGround;
    p.step(dt); t += dt;
    if (!was && !p.onGround && at < 0) { at = t; y0 = p.pos.y; rows.push(`takeoff ${(p.speed * 3.6).toFixed(0)} km/h vy ${p.vel.y.toFixed(1)}`); }
    if (at >= 0 && !p.onGround && Math.abs((t - at) * 10 - Math.round((t - at) * 10)) < dt * 5) {
      const hor = Math.atan2(p.vel.x, p.vel.z), yaw = Math.atan2(Math.sin(p.air7.bodyHeading - hor), Math.cos(p.air7.bodyHeading - hor));
      rows.push(`${(t - at).toFixed(1)} as ${p.c7Assist.core.velocity.length().toFixed(2)} L${+p.c7Assist.core.locked} ty${(p.c7Assist.core.yaw*57.3).toFixed(0)} rs${(p.air7.speed ?? 0).toFixed(2)} spinv ${p.spinVel.toFixed(2)} yaw ${(yaw * 57.3).toFixed(0)} up ${p.air7.upright.toFixed(2)} inv ${p.air7.inversions} h ${(p.pos.y - y0).toFixed(1)}`);
    }
    if (at >= 0 && was && p.onGround) { rows.push(`land ${(t - at).toFixed(2)} ${last?.crash ? 'CRASH' : last?.stomp ? 'STOMP' : last?.sketchy ? 'SAVED IT' : 'clean'} spin ${last?.spin} out ${(p.speed * 3.6).toFixed(0)}`); break; }
  }
  return rows.join('\n');
}, [process.env.TRICK ?? 'spin', +(process.env.HOLD ?? 0.6), +nth]));
await b.close();
