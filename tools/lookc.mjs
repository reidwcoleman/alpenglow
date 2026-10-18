// Free camera relative to the run centre: node tools/lookc.mjs out.jpg z dx h lookZ lookDx [fov] [tod] [query]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [out, z, dx, h, lz, ldx, fov = '55', tod = 'bluebird', q = ''] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:5260/?menu=0&mode=run&auto=1&fixdpr=1&tod=${tod}&${q}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.evaluate(([z, dx, h, lz, ldx, fov]) => {
  const g = window.__game, cx = window.__cx, H = window.__h;
  const x = cx(z) + dx, X = cx(lz) + ldx;
  window.__freeCam = { pos: [x, H(x, z) + h, z], look: [X, H(X, lz) + 1, lz], fov };
  document.getElementById('hud').classList.add('hidden');
  g.player.place(cx(lz + 400), lz + 400, null, 0);
}, [z, dx, h, lz, ldx, fov].map(Number));
await page.waitForTimeout(Number(process.env.WAIT ?? 3500));
await page.screenshot({ path: out, quality: 88 });
console.log('saved', out);
await browser.close();
