// look back up the hill at the player's tracks: node behind.mjs out.jpg z wait [q]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [out, z = '600', wait = '6000', q = ''] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 800)); });
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?menu=0&mode=free&auto=1&fixdpr=1&tod=bluebird&z=${z}${q}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(Number(wait));
if (process.env.EVAL) await page.evaluate(process.env.EVAL);
const views = JSON.parse(process.env.VIEWS ?? '[[0,6,3,2]]');
let i = 0;
for (const [yaw, dist, h, ahead] of views) {
  await page.evaluate(([yaw, dist, h, ahead]) => {
    const g = window.__game, p = g.player;
    document.getElementById('hud').classList.add('hidden');
    g.paused = true;
    const v = p.vel, l = Math.hypot(v.x, v.z) || 1, dx = v.x / l, dz = v.z / l;
    // camera ahead of the rider (downhill), looking back up the line
    const a = Math.atan2(dx, dz) + (yaw * Math.PI) / 180;
    const pos = [p.pos.x + Math.sin(a) * dist, p.pos.y + h, p.pos.z + Math.cos(a) * dist];
    window.__freeCam = { pos, look: [p.pos.x - dx * ahead, p.pos.y, p.pos.z - dz * ahead], fov: 50 };
  }, [yaw, dist, h, ahead]);
  await page.waitForTimeout(500);
  const o = views.length > 1 ? out.replace('.jpg', `_${i++}.jpg`) : out;
  await page.screenshot({ path: o, quality: 88 });
  console.log('saved', o);
}
await browser.close();
