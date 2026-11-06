// A fall seen from the side, the camera keeping pace: node tools/crashlook.mjs [hit]. GEAR=board for
// a snowboard; writes shots/crash/look_<gear>_<n>.jpg
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
import fs from 'node:fs';
fs.mkdirSync('shots/crash', { recursive: true });
const hit = process.argv[2] ?? '30', gear = process.env.GEAR ?? 'ski';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?menu=0&mode=free&fixdpr=1&tod=bluebird&z=${process.env.Z ?? 180}&v=${process.env.V ?? 18}&gear=${gear}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(1200);
await page.evaluate((hit) => {
  const g = window.__game, p = g.player;
  document.getElementById('hud')?.classList.add('hidden');
  const look = () => {
    const a = Math.atan2(p.vel.x, p.vel.z) + 1.25, d = 4.2;
    window.__freeCam = { pos: [p.pos.x + Math.sin(a) * d, p.pos.y + 1.5, p.pos.z + Math.cos(a) * d], look: [p.pos.x, p.pos.y + 0.5, p.pos.z], fov: 42 };
    requestAnimationFrame(look);
  };
  look();
  p.startCrash('landing', hit);
}, +hit);
const times = [60, 180, 340, 560, 800, 1100, 1400, 1800];
let last = 0;
for (const [i, t] of times.entries()) {
  await page.waitForTimeout(t - last); last = t;
  const st = await page.evaluate(() => { const p = window.__game.player, B = p.sim.body; return { t: +p.crashT.toFixed(2), left: +p.sim.crashTime.toFixed(2), phase: p.crashPhase, v: +p.speed.toFixed(1), k: +(p.ragOut?.[4] ?? 0).toFixed(2), hip: +(B.nodes.Hips.p.y - p.pos.y).toFixed(2), n: B.contacts }; });
  console.log(t, JSON.stringify(st));
  await page.screenshot({ path: `shots/crash/look_${gear}_${i}.jpg`, quality: 85 });
}
await browser.close();
