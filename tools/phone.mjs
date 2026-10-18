// The game on a phone (iPhone 13 landscape, touch): front page tabs and a run with the
// on-screen controls. node tools/phone.mjs <out-prefix>
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [out = 'shots/phone'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://127.0.0.1:5260/', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}_ride.jpg`, quality: 75 });
for (const t of ['shop', 'pass', 'locker']) { await p.evaluate((t) => document.querySelector(`#tabs button[data-tab="${t}"]`).click(), t); await p.waitForTimeout(900); await p.screenshot({ path: `${out}_${t}.jpg`, quality: 75 }); }
await p.goto('http://127.0.0.1:5260/?menu=0&mode=run&park=yard&tod=bluebird', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await p.waitForTimeout(2500);
// hold right, then tap down down in the air
const tap = async (id, ms = 90) => { const r = await p.locator('#' + id).boundingBox(); await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(ms); };
await tap('tc-tuck', 50);
await p.screenshot({ path: `${out}_run.jpg`, quality: 75 });
console.log(JSON.stringify(await p.evaluate(() => ({ q: window.__game.quality, fps: window.__fps, speed: window.__game.player.speed.toFixed(1), touch: document.body.classList.contains('touch') }))));
await b.close();
