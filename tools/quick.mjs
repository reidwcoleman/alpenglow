// Trick keys: hold a number on the way up a park kicker and let go at the lip (real key
// presses). node tools/quick.mjs <lessonId> [jump=Large] [releaseAt=lip offset m, e.g. -1.2]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [id = 'cork', jump = 'Large', rel = '-1.0'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:5260/?menu=0&mode=park&tod=bluebird&gear=${process.env.GEAR ?? 'ski'}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
const lip = await page.evaluate(([id, jump]) => {
  const g = window.__game;
  const J = window.__jumps.find((j) => j.name === jump);
  const z = J.z - 30;
  for (const o of [...g.skiers]) if (o !== g.player) { o.dispose(); g.skiers.splice(g.skiers.indexOf(o), 1); }
  g.ais.length = 0;
  g.player.place(window.__cx(z) + J.dx, z, null, J.speed ?? 16);
  g.rig.snap = true;
  g.setQuick(0, id);
  window.__calls = [];
  const orig = g.say.bind(g);
  g.say = (n, p, s2, c, ms) => { window.__calls.push(String(n).replace(/<[^>]+>/g, '')); return orig(n, p, s2, c, ms); };
  return J.lip;
}, [id, jump]);
await page.keyboard.down('Digit1');
let z = 0;
for (let i = 0; i < 400; i++) { z = await page.evaluate(() => window.__game.player.pos.z); if (z > lip + Number(rel)) break; await page.waitForTimeout(15); }
await page.keyboard.up('Digit1');
const r = await page.evaluate(async () => {
  const g = window.__game; let air = 0; const t0 = performance.now();
  while (performance.now() - t0 < 8000) { await new Promise((r) => setTimeout(r, 50)); if (!g.player.onGround) air = Math.max(air, g.player.airTime); else if (air > 0.3 && window.__calls.length) break; }
  return { calls: window.__calls, air: +air.toFixed(2), perfect: g.player.perfectPop, crash: g.player.crash > 0 };
});
console.log(id, jump, 'release', (z - lip).toFixed(1), JSON.stringify(r));
await browser.close();
