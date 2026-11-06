// A kicker from the side, frame by frame from the lead-in through the landing: node tools/ridelook.mjs
// [spinSeconds] [flipSeconds] [charge]. GEAR=board for a snowboard; writes shots/crash/look_<tag>_<n>.jpg
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
import fs from 'node:fs';
fs.mkdirSync('shots/crash', { recursive: true });
const [spin = '0.5', flip = '0', load = '1'] = process.argv.slice(2), gear = process.env.GEAR ?? 'ski', tag = process.env.TAG ?? `ride${gear}`;
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?menu=0&mode=free&fixdpr=1&tod=bluebird&z=${process.env.Z ?? 240}&v=26&gear=${gear}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(1000);
await page.evaluate(([spin, flip, load]) => {
  const g = window.__game, p = g.player, C = window.__course, c = p.controls, dt = 1 / 60;
  g.paused = true;
  document.getElementById('hud')?.classList.add('hidden');
  const J = C.JUMPS.filter((j) => !j.drop && j.h >= Number(new URLSearchParams(location.search).get('jh') ?? 2.5)).sort((a, b) => a.lip - b.lip).find((j) => j.lip > p.pos.z + 40);
  let air = 0, landed = 0;
  window.__adv = (n) => {
    for (let i = 0; i < n; i++) {
      const look = Math.max(8, p.speed * 0.9), tz = p.pos.z + look, tx = p.pos.z <= J.lip + 2 ? C.centerX(Math.min(tz, J.lip)) + J.dx : C.centerX(tz);
      const err = Math.atan2(Math.sin(Math.atan2(tx - p.pos.x, look) - Math.atan2(p.vel.x, p.vel.z)), Math.cos(Math.atan2(tx - p.pos.x, look) - Math.atan2(p.vel.x, p.vel.z)));
      c.steer = p.onGround ? -Math.max(-1, Math.min(1, err * 3)) : 0; c.flip = 0; c.brake = 0;
      c.jump = load > 0 && p.onGround && p.pos.z > J.lip - 12 && p.pos.z < J.lip - 0.3;
      if (!p.onGround) { air += dt; if (spin > 0 && air < spin) c.steer = -1; if (flip > 0 && air < flip) c.flip = 1; } else if (air > 0) landed += dt;
      p.step(dt);
    }
    p.updateVisual(dt * n, g.camera.position);
    const a = Math.atan2(p.vel.x, p.vel.z) + 1.3, d = 5.5;
    window.__freeCam = { pos: [p.pos.x + Math.sin(a) * d, p.pos.y + 1.3, p.pos.z + Math.cos(a) * d], look: [p.pos.x, p.pos.y + 0.8, p.pos.z], fov: 40 };
    return { z: +(p.pos.z - J.lip).toFixed(1), v: +p.speed.toFixed(1), g: p.onGround, air: +air.toFixed(2), landed: +landed.toFixed(2), crash: p.crash };
  };
  while (p.pos.z < J.lip - 13) window.__adv(1);
}, [+spin, +flip, +load]);
let n = 0, st = null;
if (process.env.SKIP) await page.evaluate((k) => { for (let i = 0; i < k; i++) window.__adv(1); }, Number(process.env.SKIP));
for (let f = 0; f < 90 && n < 16; f++) {
  st = await page.evaluate((k) => window.__adv(k), Number(process.env.STEP ?? 9));
  await page.waitForTimeout(90);
  await page.screenshot({ path: `shots/crash/look_${tag}_${n}.jpg`, quality: 85 });
  console.log(n, JSON.stringify(st));
  n++;
}
await browser.close();
