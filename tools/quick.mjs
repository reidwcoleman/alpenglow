// Combos: ride a park kicker, pop at the lip, tap the combo in the air (real key presses).
// node tools/quick.mjs <combo e.g. LDR> [jump=Large]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [seq = 'LDR', jump = 'Large'] = process.argv.slice(2);
const KEY = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' };
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?menu=0&mode=park&tod=bluebird&gear=${process.env.GEAR ?? 'ski'}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
const lip = await page.evaluate((jump) => {
  const g = window.__game;
  const J = window.__jumps.find((j) => j.name === jump);
  const z = J.z - 30;
  for (const o of [...g.skiers]) if (o !== g.player) { o.dispose(); g.skiers.splice(g.skiers.indexOf(o), 1); }
  g.ais.length = 0;
  g.player.place(window.__cx(z) + J.dx, z, null, J.pspeed ?? J.speed ?? 16);
  g.rig.snap = true;
  window.__calls = [];
  const orig = g.say.bind(g);
  g.say = (n, p, s2, c, ms, ch) => { window.__calls.push([n, s2].filter(Boolean).map((x) => String(x).replace(/<[^>]+>/g, '')).join(' · ')); return orig(n, p, s2, c, ms, ch); };
  return J.lip;
}, jump);
// pop at the lip
await page.keyboard.down('Space');
for (let i = 0; i < 400; i++) { const z = await page.evaluate(() => window.__game.player.pos.z); if (z > lip - 0.8) break; await page.waitForTimeout(15); }
await page.keyboard.up('Space');
for (let i = 0; i < 100; i++) { if (!(await page.evaluate(() => window.__game.player.onGround))) break; await page.waitForTimeout(15); }
await page.waitForTimeout(60);
for (const k of seq) { await page.keyboard.down(KEY[k]); await page.waitForTimeout(70); await page.keyboard.up(KEY[k]); await page.waitForTimeout(60); }
const r = await page.evaluate(async () => {
  const g = window.__game; let air = 0; const t0 = performance.now();
  while (performance.now() - t0 < 8000) { await new Promise((r) => setTimeout(r, 50)); if (!g.player.onGround) air = Math.max(air, g.player.airTime); else if (air > 0.3 && window.__calls.length) break; }
  return { calls: window.__calls, air: +air.toFixed(2), crash: g.player.crash > 0, status: g.statusTxt };
});
console.log(seq, jump, JSON.stringify(r));
await browser.close();
