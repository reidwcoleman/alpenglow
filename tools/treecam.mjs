// Look at the trees nearest the player from a few distances: node tools/treecam.mjs out.jpg [z] [tod]
// (DISTS="8,30,90" sets how far the camera stands from the tree it frames)
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [out, z = '1500', tod = 'bluebird'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 800)); });
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?menu=0&mode=free&auto=1&fixdpr=1&tod=${tod}&z=${z}${process.env.Q ?? ''}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(Number(process.env.WAIT ?? 3000));
if (process.env.EVAL) await page.evaluate(process.env.EVAL);
const dists = (process.env.DISTS ?? '9,35,120').split(',').map(Number);
let i = 0;
for (const d of dists) {
  await page.evaluate((d) => {
    const g = window.__game, p = g.player, T = g.forest.trees;
    document.getElementById('hud').classList.add('hidden');
    g.paused = true;
    // the tree nearest a point off the piste beside the rider
    let best = null, bd = 1e18;
    for (const t of T) { const e = (t.x - p.pos.x) ** 2 + (t.z - p.pos.z) ** 2; if (e < bd && e > 100) { bd = e; best = t; } }
    const ax = best.x - p.pos.x, az = best.z - p.pos.z, l = Math.hypot(ax, az);
    const h = best.s * 16;
    // (from the downhill side, so the slope doesn't hide it)
    const cx = best.x - (ax / l) * d * 0.3, cz = best.z + d;
    const cy = Math.max(window.__h(cx, cz) + 1.7, best.y + h * 0.3);
    window.__freeCam = { pos: [cx, cy, cz], look: [best.x, best.y + h * 0.45, best.z], fov: 50 };
  }, d);
  await page.waitForTimeout(700);
  const o = out.replace('.jpg', `_${i++}.jpg`);
  await page.screenshot({ path: o, quality: 88 });
  console.log('saved', o);
}
await browser.close();
