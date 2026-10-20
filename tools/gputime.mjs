// Synced render time of one view (ms/frame, median of 60): node tools/gputime.mjs [port] [z] [tod]
// (EVAL runs first, e.g. to hide a part and see what it costs)
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [port = '5260', z = '1500', tod = 'bluebird'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/?menu=0&mode=free&auto=1&fixdpr=1&tod=${tod}&z=${z}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(4000);
if (process.env.EVAL) await page.evaluate(process.env.EVAL);
const r = await page.evaluate(async () => {
  const g = window.__game, gl = g.renderer.getContext();
  g.paused = true;
  await new Promise((r) => setTimeout(r, 300));
  const t = [];
  for (let i = 0; i < 70; i++) {
    const t0 = performance.now();
    g.post.render(1 / 60);
    gl.finish();
    t.push(performance.now() - t0);
  }
  t.sort((a, b) => a - b);
  return { med: t[35].toFixed(2), p90: t[63].toFixed(2), calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
});
console.log(port, z, tod, JSON.stringify(r));
await browser.close();
