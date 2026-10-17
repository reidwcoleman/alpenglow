// Free camera shots: node tools/look.mjs out.jpg "x,y,z" "lx,ly,lz" [fov] [tod]   (y relative to ground)
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [out, p, l, fov = '55', tod = 'golden'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:5260/?menu=0&mode=free&auto=1&fixdpr=1&tod=${tod}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
const info = await page.evaluate(([p, l, fov]) => {
  const g = window.__game;
  const P = p.split(',').map(Number), L = l.split(',').map(Number);
  const h = window.__h;
  P[1] += h(P[0], P[2]); L[1] += h(L[0], L[2]);
  window.__freeCam = { pos: P, look: L, fov: Number(fov) };
  g.player.place(P[0], P[2] + 5, null, 0);
  document.getElementById('hud').classList.add('hidden');
  return { P, L };
}, [p, l, fov]);
await page.waitForTimeout(3000);
await page.screenshot({ path: out, quality: 85 });
console.log('saved', out, JSON.stringify(info));
await browser.close();
