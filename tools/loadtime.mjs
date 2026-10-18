// How long the loading screen takes, phase by phase: node tools/loadtime.mjs [url] [phone]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const url = process.argv[2] ?? 'http://127.0.0.1:5261/';
const phone = process.argv[3] === 'phone';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(phone ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
if (process.env.CPU) { const c = await ctx.newCDPSession(page); await c.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU) }); }
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const t0 = Date.now();
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
const T = await page.evaluate(() => window.__loadT);
let prev = 0;
for (const [t, p, m] of T) { console.log(String(t).padStart(6), ('+' + (t - prev)).padStart(7), String(p).padStart(4) + '%', m); prev = t; }
console.log('ready after', Date.now() - t0, 'ms wall');
// frame pacing on the menu right after
const f = await page.evaluate(() => new Promise((res) => { const a = []; let l = performance.now(); const go = (t) => { a.push(t - l); l = t; if (a.length < 120) requestAnimationFrame(go); else res(a); }; requestAnimationFrame(go); }));
f.sort((a, b) => a - b);
console.log('menu frames: median', f[60].toFixed(1), 'p95', f[114].toFixed(1), 'max', f[119].toFixed(1));
await browser.close();
