// Force a high-speed crash and capture the tumble / yard sale / get-up sequence.
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
import fs from 'node:fs';
fs.mkdirSync('shots/crash', { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:5260/?menu=0&mode=free&fixdpr=1&tod=bluebird&z=500&v=22`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { const p = window.__game.player; p.startCrash('landing'); });
const times = [250, 700, 1300, 2200, 3300, 4300];
let last = 0;
for (const [i, t] of times.entries()) {
  await page.waitForTimeout(t - last); last = t;
  const st = await page.evaluate(() => { const p = window.__game.player; return { phase: p.crashPhase, v: +p.speed.toFixed(1), debris: window.__game.debris.items.length, lie: +p.lie.toFixed(2) }; });
  console.log(t, JSON.stringify(st));
  await page.screenshot({ path: `shots/crash/c${i}.jpg`, quality: 80 });
}
await browser.close();
