// Weather on every drop-in: starts a run N times and shoots each sky. node tools/wx.mjs <outdir> [park] [n]
// or name the skies: node tools/wx.mjs <outdir> grand whiteout,nightsnow
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
import fs from 'node:fs';
const [out = 'shots/wx', park = 'timber', n = '6'] = process.argv.slice(2);
const skies = /^\d+$/.test(n) ? null : n.split(',');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?park=${park}&menu=0&mode=run&auto=1&fixdpr=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
for (let i = 0; i < (skies?.length ?? +n); i++) {
  if (skies) await page.evaluate((k) => { const g = window.__game; g.tod = k; g.wxPinned = true; g.applyConditions(); g.start('run'); }, skies[i]);
  else if (i) await page.evaluate(() => window.__game.start('run'));
  await page.waitForTimeout(6000);
  const s = await page.evaluate(() => { const g = window.__game; return { tod: g.tod, line: g.weatherLine(), tag: document.getElementById('wxtag').textContent, wind: g.world.wind, snow: g.world.snow?.name, z: g.player?.pos.z | 0 }; });
  console.log(i, JSON.stringify(s));
  await page.screenshot({ path: `${out}/wx${i}_${s.tod}.jpg`, quality: 78 });
}
await browser.close();
