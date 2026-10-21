// Ride the run with a key plan and screenshot along the way: node tools/ridesnap.mjs out_prefix "ArrowUp:8000,shot,ArrowLeft:700,shot"
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [out = '/tmp/ride', plan = 'ArrowUp:8000,shot'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: +(process.env.W ?? 1280), height: +(process.env.H ?? 720) } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?menu=0&mode=${process.env.MODE ?? 'run'}&tod=${process.env.TOD ?? 'bluebird'}&fixdpr=1${process.env.Q ?? ''}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(1500);
let i = 0;
for (const step of plan.split(',')) {
  if (step === 'shot') { await page.screenshot({ path: `${out}_${i++}.jpg`, quality: 80 }); console.log(await page.evaluate(() => { const p = window.__game.player; return `${(p.speed * 3.6).toFixed(0)} km/h lean ${p.lean.toFixed(2)} ${p.onGround ? '' : 'AIR'}`; })); continue; }
  const [k, ms] = step.split(':');
  const ks = k.split('+').filter(Boolean);
  for (const kk of ks) await page.keyboard.down(kk);
  await page.waitForTimeout(+ms);
  for (const kk of ks) await page.keyboard.up(kk);
}
await b.close();
