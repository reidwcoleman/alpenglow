// One boot, many shots: node tools/tour.mjs <outdir> [mode] [tod]
// Teleports the (autopiloted) player around the mountain and captures each spot.
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
import fs from 'node:fs';
const [dir = 'shots/tour', mode = 'free', tod = 'golden'] = process.argv.slice(2);
fs.mkdirSync(dir, { recursive: true });
const SPOTS = JSON.parse(process.env.SPOTS ?? JSON.stringify([
  { n: 'wall', z: 300, cam: 'chase', w: 2500 },
  { n: 'park', z: 1150, cam: 'chase', w: 3000 },
  { n: 'bowl_tv', z: 1550, cam: 'tv', w: 3000 },
  { n: 'chute_action', z: 2000, cam: 'action', w: 2500 },
  { n: 'express_helmet', z: 2500, cam: 'helmet', w: 2500 },
  { n: 'finish', z: 3250, cam: 'chase', w: 4000 },
]));
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 1280), height: Number(process.env.H ?? 720) }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[error]', m.text().slice(0, 400)); });
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?menu=0&mode=${mode}&auto=1&tod=${tod}&fixdpr=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
for (const s of SPOTS) {
  await page.evaluate((s) => {
    const g = window.__game;
    const p = g.player;
    const { centerX } = g.__course ?? {};
    p.place(p.pos.x * 0 + (window.__cx ? window.__cx(s.z) : 0) + (s.x ?? 0), s.z, null, s.v ?? 18);
    p.ai.lastZ = s.z;
    while (g.rig.mode !== s.cam) g.cycleCam();
    g.rig.snap = true;
  }, s);
  await page.waitForTimeout(s.w);
  await page.screenshot({ path: `${dir}/${s.n}.jpg`, quality: 85 });
  console.log(s.n, 'fps', (await page.evaluate(() => window.__fps))?.toFixed(1));
}
await browser.close();
