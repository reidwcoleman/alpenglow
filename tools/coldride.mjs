// Cold start to riding, the way a player does it: node tools/coldride.mjs [url] [phone]
// Times the front page appearing, then presses RIDE and Enter as soon as each is on screen,
// until the rider is moving. Cache off (a first visit).
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const url = process.argv[2] ?? 'http://127.0.0.1:5260/';
const phone = process.argv[3] === 'phone';
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext(phone ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
if (process.env.CPU) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU) });
if (process.env.NET) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: Number(process.env.NET) * 125000, uploadThroughput: 1e6 });
let bytes = 0; cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
const t0 = Date.now();
const mark = (m) => console.log(String(Date.now() - t0).padStart(6), 'ms', (bytes / 1e6).toFixed(1).padStart(5), 'MB ', m);
await page.goto(url, { waitUntil: 'commit' });
await page.waitForFunction(() => { const m = document.getElementById('menu'); return m && !m.classList.contains('hidden') && m.getBoundingClientRect().width > 0; }, null, { timeout: 120000, polling: 16 });
mark('front page up');
await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 20000, polling: 16 }).catch(() => {});
mark('fonts in');
await page.click('#b-ride');
mark('RIDE pressed');
await page.waitForFunction(() => !!window.__game?.drop?.on, null, { timeout: 120000, polling: 16 });
mark('drop picker up');
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game?.state === 'free', null, { timeout: 120000, polling: 16 });
mark('run started');
await page.waitForFunction(() => window.__game.player?.speed > 1, null, { timeout: 120000, polling: 16 });
mark('riding');
if (process.env.T) console.log((await page.evaluate(() => (window.__loadT ?? []).map((r) => r.join(' ')).join('\n'))));
await page.screenshot({ path: process.env.SHOT ?? '/tmp/coldride.jpg', quality: 70 });
await b.close();
