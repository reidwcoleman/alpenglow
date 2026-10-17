// Close-up of the player skier: node tools/closeup.mjs out.jpg [z] [yawDeg] [dist] [h] [eval]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [out, z = '600', yaw = '150', dist = '3.2', h = '1.2'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.text()); });
await page.goto(`http://127.0.0.1:5260/?menu=0&mode=free&auto=1&fixdpr=1&tod=bluebird&z=${z}&v=14`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(Number(process.env.WAIT ?? 2500));
if (process.env.EVAL) await page.evaluate(process.env.EVAL);
await page.evaluate(([yaw, dist, h]) => {
  const g = window.__game, p = g.player;
  document.getElementById('hud').classList.add('hidden');
  const a = p.heading + (yaw * Math.PI) / 180;
  const pos = [p.pos.x + Math.sin(a) * dist, p.pos.y + h, p.pos.z + Math.cos(a) * dist];
  window.__freeCam = { pos, look: [p.pos.x, p.pos.y + 0.85, p.pos.z], fov: 40 };
  g.paused = true;
}, [Number(yaw), Number(dist), Number(h)]);
await page.waitForTimeout(600);
await page.screenshot({ path: out, quality: 90 });
console.log('saved', out);
await browser.close();
