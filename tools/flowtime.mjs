// Front page -> RIDE -> map -> RIDE (from the top) -> riding, timed. CPU=4 MBPS=20 node tools/flowtime.mjs [url] [park]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const url = process.argv[2] ?? 'http://127.0.0.1:5261/';
const park = process.argv[3] ?? 'yard';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const c = await ctx.newCDPSession(page);
if (process.env.CPU) await c.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU) });
if (process.env.MBPS) { await c.send('Network.enable'); await c.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: Number(process.env.MBPS) * 125000, uploadThroughput: 1e6 }); }
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const t0 = Date.now();
const lap = (m) => console.log(String(Date.now() - t0).padStart(7), m);
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !document.getElementById('menu')?.classList.contains('hidden') && document.getElementById('loading')?.style.display !== 'flex', null, { timeout: 300000 }).catch(() => {});
lap('front page visible');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
lap('__ready');
await page.click('#b-ride');
await page.waitForSelector('#parks:not(.hidden)');
lap('map open');
if (park !== 'yard') { await page.click(`.pk-pin[data-id="${park}"]`); }
await page.click('#pk-ride');
if (park !== 'yard') { await page.waitForURL(/menu=0/); lap('reload'); await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 }); lap('__ready (new park)'); }
await page.waitForFunction(() => window.__game?.state === 'free', null, { timeout: 300000 });
lap('riding');
const f = await page.evaluate(() => new Promise((res) => { const a = []; let l = performance.now(); const go = (t) => { a.push(t - l); l = t; if (a.length < 90) requestAnimationFrame(go); else res(a); }; requestAnimationFrame(go); }));
lap('90 frames');
console.log('first frames', f.slice(0, 8).map((x) => x.toFixed(0)).join(' '), ' max', Math.max(...f).toFixed(0), ' >50ms', f.filter((x) => x > 50).length);
await browser.close();
