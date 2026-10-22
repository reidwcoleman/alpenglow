// Ski vs board handling with real keys: node tools/handling.mjs
// From a set speed on the open run: a hard turn (slash), a gentle carve, a stop, pushing off from still.
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const gear of ['ski', 'board']) {
  const page = await b.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:5260/?menu=0&mode=run&tod=bluebird&gear=${gear}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  await page.waitForTimeout(800);
  const set = (v) => page.evaluate((v) => { const g = window.__game, p = g.player, z = 2350; p.place(window.__cx(z), z, null, v); p.c7T = null; p.c7E = 0; p.c7Slash = 0; p.c7Skid = 0; }, v);
  const st = () => page.evaluate(() => { const p = window.__game.player, v = p.vel; return { sp: Math.hypot(v.x, v.z), hv: Math.atan2(v.x, v.z), hd: p.heading, slash: p.c7Slash ?? 0, skid: p.skid, edge: p.edge }; });
  const run = async (keys, ms, v) => {
    await set(v); await page.waitForTimeout(150);
    const a = await st();
    for (const k of keys) await page.keyboard.down(k);
    let maxSlash = 0, maxOff = 0; const t0 = Date.now(); let stopT = null;
    while (Date.now() - t0 < ms) {
      const s = await st(); maxSlash = Math.max(maxSlash, Math.abs(s.slash));
      const off = Math.atan2(Math.sin(s.hd - s.hv), Math.cos(s.hd - s.hv)); if (Math.abs(off) > Math.abs(maxOff)) maxOff = off;
      if (stopT == null && s.sp < 1) stopT = Date.now() - t0;
      await page.waitForTimeout(40);
    }
    for (const k of keys) await page.keyboard.up(k);
    const z = await st();
    const turned = Math.atan2(Math.sin(z.hv - a.hv), Math.cos(z.hv - a.hv));
    return `v ${(a.sp * 3.6).toFixed(0)}->${(z.sp * 3.6).toFixed(0)} km/h  turned ${(turned * 57.3).toFixed(0)}deg  slash ${maxSlash.toFixed(2)}  skis-vs-line ${(maxOff * 57.3).toFixed(0)}deg${stopT != null ? '  stopped ' + stopT + 'ms' : ''}`;
  };
  console.log(gear, 'hard right 1.2s @60 :', await run(['ArrowRight'], 1200, 60 / 3.6));
  console.log(gear, 'hard right 1.2s @20 :', await run(['ArrowRight'], 1200, 20 / 3.6));
  console.log(gear, 'brake 2.5s @50     :', await run(['ArrowDown'], 2500, 50 / 3.6));
  console.log(gear, 'push 3s from still :', await run(['ArrowUp'], 3000, 0.01));
  await page.close();
}
await b.close();
