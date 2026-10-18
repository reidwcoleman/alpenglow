// Frame times for the first seconds after the loading screen goes: node tools/firstframes.mjs [query]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(() => { window.__ft = []; let l = 0; const go = (t) => { if (window.__ready) { if (l) window.__ft.push([Math.round(t), Math.round(t - l)]); l = t; } requestAnimationFrame(go); }; requestAnimationFrame(go); });
await page.goto(`${process.env.URL ?? 'http://127.0.0.1:5260/'}?${process.argv[2] ?? 'menu=0&mode=run&auto=1&tod=golden'}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
await page.waitForTimeout(3000);
const ft = await page.evaluate(() => window.__ft);
console.log('long frames (>40ms):', ft.filter(([, d]) => d > 40).map(([t, d]) => `${d}ms@${t}`).join(' '));
console.log('frames in 3s', ft.length);
await browser.close();
