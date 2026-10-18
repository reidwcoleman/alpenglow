// The shop up close: deals scrolled into view, an item opened, a trail opened. node tools/shopshots.mjs <out-prefix>
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://127.0.0.1:5260/', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await p.click('#tabs button[data-tab="shop"]'); await p.waitForTimeout(800);
await p.evaluate(() => document.querySelector('#tab-shop').scrollTop = 600);
await p.evaluate(() => { const s = document.querySelector('#shop .items.feat'); s?.scrollIntoView(); });
await p.waitForTimeout(500); await p.screenshot({ path: out + '_scroll.jpg', quality: 80 });
await p.click('#shop .items.feat .item'); await p.waitForTimeout(1200);
await p.screenshot({ path: out + '_dlg.jpg', quality: 80 });
await p.click('#it-x'); await p.click('#shop .sh-cats button[data-c="trail"]'); await p.waitForTimeout(400);
await p.click('#shop .item'); await p.waitForTimeout(1200);
await p.screenshot({ path: out + '_trail.jpg', quality: 80 });
await b.close();
