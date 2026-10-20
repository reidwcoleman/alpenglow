// Freeze the player mid-turn and look at him: node tools/carvecam.mjs out.jpg [z] [turnMs] [key]
// Tucks for TUCK ms (default 3500) to get going, holds the turn key for turnMs, then pauses and
// shoots each of VIEWS ([yawDeg from his heading, dist, height]) round him. Q adds to the URL.
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [out, z = '900', turnMs = '900', key = 'ArrowLeft'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:5260/?menu=0&mode=free&fixdpr=1&tod=${process.env.TOD ?? 'bluebird'}&z=${z}${process.env.Q ?? ''}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(Number(process.env.TUCK ?? 3500));
await page.keyboard.up('ArrowUp');
await page.keyboard.down(key);
await page.waitForTimeout(Number(turnMs));
console.log(await page.evaluate(() => { const p = window.__game.player; return `lean ${p.lean.toFixed(2)} speed ${p.speed.toFixed(1)} skid ${p.skid.toFixed(2)}`; }));
if (process.env.EVAL) await page.evaluate(process.env.EVAL);
const views = JSON.parse(process.env.VIEWS ?? '[[150,3.4,1.1],[60,3.2,0.9],[-100,3.6,1.3],[180,4,1.0]]');
let i = 0;
for (const [yaw, dist, h] of views) {
  await page.evaluate(([yaw, dist, h]) => {
    const g = window.__game, p = g.player;
    document.getElementById('hud').classList.add('hidden');
    g.paused = true;
    const a = p.heading + (yaw * Math.PI) / 180;
    window.__freeCam = { pos: [p.pos.x + Math.sin(a) * dist, p.pos.y + h, p.pos.z + Math.cos(a) * dist], look: [p.pos.x, p.pos.y + 0.7, p.pos.z], fov: 40 };
  }, [yaw, dist, h]);
  await page.waitForTimeout(450);
  const o = out.replace('.jpg', `_${i++}.jpg`);
  await page.screenshot({ path: o, quality: 88 });
}
console.log('saved', views.length);
await browser.close();
