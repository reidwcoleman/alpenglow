// A run on autopilot, a frame every so often: node tools/frames.mjs <outdir> [park] [n] [everyMs] [query]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
import fs from 'node:fs';
const [out = 'shots/frames', park = 'yard', n = '12', every = '400', q = ''] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
await page.goto(`http://127.0.0.1:5260/?park=${park}&menu=0&mode=run&auto=1&fixdpr=1&tod=bluebird&${q}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(Number(process.env.WAIT ?? 5000));
for (let i = 0; i < +n; i++) {
  await page.screenshot({ path: `${out}/f${String(i).padStart(2, '0')}.jpg`, quality: 70 });
  await page.waitForTimeout(+every);
}
await browser.close();
