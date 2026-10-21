// Speed over a straight tuck from the top of the run (game time): node tools/tuckrun.mjs [secs=30] [key=ArrowUp]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [secs = '30', key = 'ArrowUp'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 640, height: 360 } });
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?menu=0&mode=run&tod=bluebird${process.env.Q ?? ''}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.keyboard.down(key);
const out = await page.evaluate(async (secs) => {
  const g = window.__game, p = g.player, rows = []; let next = 0;
  const t0 = g.time;
  while (g.time - t0 < secs) {
    await new Promise((r) => setTimeout(r, 20));
    const t = g.time - t0;
    if (t >= next) { rows.push(`${t.toFixed(0)}s ${(p.speed * 3.6).toFixed(0)} km/h z ${p.pos.z.toFixed(0)} y ${p.pos.y.toFixed(0)}${p.onGround ? '' : ' AIR'}${p.crash > 0 ? ' CRASH' : ''}`); next += 1; }
  }
  return rows;
}, +secs);
console.log(out.join('\n'));
await b.close();
