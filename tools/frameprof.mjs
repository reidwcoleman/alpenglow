// Where the frame time goes while riding: CPU profile of a few seconds of play, self time by
// function and by file. node tools/frameprof.mjs [phone] (CPU=4 throttles like a phone)
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const phone = process.argv[2] === 'phone';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(phone ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${process.env.URL ?? 'http://127.0.0.1:${process.env.PORT ?? 5260}/'}?menu=0&mode=${process.env.MODE ?? 'run'}&auto=1${process.env.Q ?? ''}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
if (process.env.CPU) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU) });
await page.waitForTimeout(3000);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await page.evaluate(() => { window.__ft = []; let l = performance.now(); const go = (t) => { window.__ft.push(t - l); l = t; requestAnimationFrame(go); }; requestAnimationFrame(go); });
await cdp.send('Profiler.start');
await page.waitForTimeout(Number(process.env.SECS ?? 5) * 1000);
const { profile } = await cdp.send('Profiler.stop');
const ft = (await page.evaluate(() => window.__ft)).slice(2).sort((a, b) => a - b);
const self = new Map(), byFile = new Map();
const dt = new Map();
for (let i = 0; i < profile.samples.length; i++) dt.set(profile.samples[i], (dt.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i] ?? 0));
let total = 0;
for (const n of profile.nodes) {
  const t = (dt.get(n.id) ?? 0) / 1000; total += t;
  const f = n.callFrame, file = (f.url.split('/').pop() || '(native)').split('?')[0];
  const k = `${f.functionName || '(anon)'} ${file}:${f.lineNumber + 1}`;
  self.set(k, (self.get(k) ?? 0) + t); byFile.set(file, (byFile.get(file) ?? 0) + t);
}
const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(v / total * 100).toFixed(1).padStart(5)}%  ${k}`).join('\n');
console.log('frames', ft.length, 'median', ft[ft.length >> 1].toFixed(1), 'p90', ft[Math.floor(ft.length * 0.9)].toFixed(1), 'p99', ft[Math.floor(ft.length * 0.99)].toFixed(1), 'fps', (1000 * ft.length / ft.reduce((a, b) => a + b, 0)).toFixed(1));
console.log('--- by file\n' + top(byFile, 16));
console.log('--- by function\n' + top(self, 30));
await browser.close();
