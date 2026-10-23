// Loading phases, median of N loads (ms from the first step): N=5 CPU=4 MBPS=20 node tools/bootbench.mjs [url]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const url = process.argv[2] ?? 'http://127.0.0.1:5261/?park=canyon&menu=0&mode=run';
const N = Number(process.env.N ?? 5);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const runs = [];
for (let n = 0; n < N; n++) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const c = await ctx.newCDPSession(page);
  if (process.env.CPU) await c.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU) });
  if (process.env.MBPS) { await c.send('Network.enable'); await c.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: Number(process.env.MBPS) * 125000, uploadThroughput: 1e6 }); }
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ready === true && !window.__game.warming && window.__loadT.some((x) => x[1] === 'shown'), null, { timeout: 300000 });
  await page.waitForTimeout(Number(process.env.SETTLE ?? 0));
  // the first frames of the run (or the menu) too
  const f = await page.evaluate(() => new Promise((res) => { const a = []; let l = performance.now(); const go = (t) => { a.push(t - l); l = t; if (a.length < 30) requestAnimationFrame(go); else res(a); }; requestAnimationFrame(go); }));
  const T = await page.evaluate(() => window.__loadT);
  const t0 = T[0][0], row = {};
  let prev = t0;
  T.sort((a, b) => a[0] - b[0]);
  for (const [t, p, m] of T) { row[(p === 'warm' ? 'w ' : '') + m] = t - prev; prev = t; if (p === 'shown') row.SHOWN = t - t0; }
  row.TOTAL = prev - t0;
  row.WALL = prev;
  row['frames>50'] = f.filter((x) => x > 50).reduce((a, b) => a + b, 0);
  runs.push(row);
  await ctx.close();
}
const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
for (const k of Object.keys(runs[0])) console.log(String(Math.round(med(runs.map((r) => r[k] ?? 0)))).padStart(6), k);
await browser.close();
