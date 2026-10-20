// Ride a park rail with real key presses: node tools/rail.mjs <outdir> [rail name] [swaps]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
import fs from 'node:fs';
const [out = 'shots/rail', name = 'Long Tube', swaps = '2'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?menu=0&mode=${process.env.MODE ?? 'park'}&fixdpr=1&tod=${process.env.TOD ?? 'bluebird'}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.evaluate((name) => {
  const g = window.__game;
  for (const o of [...g.skiers]) if (o !== g.player) { o.dispose(); g.skiers.splice(g.skiers.indexOf(o), 1); }
  g.ais.length = 0;
  const R = window.__rails.find((r) => r.name === name);
  const z = R.a.z - 9;
  g.player.place(R.a.x - R.dir.x * 9, z, R.yaw, 8.5);
  g.rig.snap = true;
}, name);
const st = () => page.evaluate(() => { const p = window.__game.player; return { g: p.onGround, grind: p.grind ? p.grind.kind + ' ' + p.grind.t.toFixed(2) : null, z: +p.pos.z.toFixed(1), v: +(p.speed * 3.6).toFixed(0), crash: p.crash, call: document.getElementById('callout').innerText.replace(/\n/g, ' | ') }; });
let i = 0, sw = 0, phase = 0;
for (let f = 0; f < 90; f++) {
  const s = await st();
  console.log(JSON.stringify(s));
  if (s.grind) {
    phase++;
    if (sw < Number(swaps) && phase % 3 === 1) { await page.keyboard.down('KeyD'); await page.waitForTimeout(80); await page.keyboard.up('KeyD'); sw++; }
  }
  await page.screenshot({ path: `${out}/f${String(i++).padStart(2, '0')}.jpg`, quality: 70 });
  if (phase && !s.grind && s.g) { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/f${String(i++).padStart(2, '0')}.jpg`, quality: 75 }); console.log(JSON.stringify(await st())); break; }
}
console.log('score', await page.evaluate(() => window.__game.sc.score));
await browser.close();
