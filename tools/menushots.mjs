import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:5260/?fixdpr=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(i === 0 ? 2000 : 4600);
  console.log(await page.evaluate(() => { const r = window.__game.rig; const s = r.subject; return JSON.stringify({ shot: r.shot, style: s?.ai?.style, d: s ? +r.cam.position.distanceTo(s.pos).toFixed(1) : null, v: s ? +s.speed.toFixed(1) : null }); }));
  await page.screenshot({ path: `shots/menu_${i}.jpg`, quality: 80 });
}
await browser.close();
