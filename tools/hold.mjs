// Held tricks (Cork7 style): ride a park kicker, carry the pop through the lip, hold keys in the air.
// node tools/hold.mjs <keys e.g. ArrowLeft+ArrowDown> <holdMs> [jump=Large] [delayMs=0]   (SHOTS=prefix: screenshots)
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [keys = 'ArrowLeft', hold = '900', jump = 'Large', delay = '0'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?menu=0&mode=${process.env.MODE ?? 'park'}&tod=bluebird&gear=${process.env.GEAR ?? 'ski'}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
const lip = await page.evaluate((jump) => {
  const g = window.__game, J = window.__jumps.find((j) => j.name === jump), z = J.z - 30;
  for (const o of [...g.skiers]) if (o !== g.player) { o.dispose(); g.skiers.splice(g.skiers.indexOf(o), 1); }
  g.ais.length = 0;
  g.player.place(window.__cx(z) + J.dx, z, null, J.pspeed ?? J.speed);
  g.rig.snap = true;
  window.__calls = []; window.__tr = [];
  const orig = g.say.bind(g);
  g.say = (n, p, s2, c, ms, ch) => { window.__calls.push([n, p, s2, ...(ch ?? [])].filter(Boolean).map((x) => String(x).replace(/<[^>]+>/g, '')).join(' · ')); return orig(n, p, s2, c, ms, ch); };
  return J.lip;
}, jump);
await page.keyboard.down('Space');
const SH = process.env.SHOTS; let si = 0;
if (SH) { await page.waitForTimeout(250); await page.screenshot({ path: `${SH}_${si++}.jpg`, quality: 85 }); }
for (let i = 0; i < 600; i++) { if (!(await page.evaluate(() => window.__game.player.onGround))) break; await page.waitForTimeout(10); }
await page.keyboard.up('Space');
await page.waitForTimeout(+delay);
if (process.env.TRACE) await page.evaluate(() => { const g = window.__game, p = g.player; window.__tr = []; const iv = setInterval(() => { if (p.onGround && p.airTime > 0.3) clearInterval(iv); window.__tr.push([p.airTime.toFixed(2), p.spin.toFixed(2), p.spinVel.toFixed(2), p.controls.steer.toFixed(2), (p.auto ? 'A' : '') + (p.magnet ? 'M' : '') + (p.assist ? 'S' : ''), p.c7G?.toFixed(2)].join(' ')); }, 50); });
const K = keys.split('+').filter(Boolean);
for (const k of K) await page.keyboard.down(k);
if (SH) { const n = 3; for (let j = 0; j < n; j++) { await page.waitForTimeout(+hold / n); await page.screenshot({ path: `${SH}_${si++}.jpg`, quality: 85 }); } }
else await page.waitForTimeout(+hold);
for (const k of K) await page.keyboard.up(k);
const r = await page.evaluate(async () => {
  const g = window.__game, p = g.player; let air = 0; const t0 = performance.now(); let sp0 = 0;
  while (performance.now() - t0 < 6000) { await new Promise((r) => setTimeout(r, 30)); if (!p.onGround) { air = Math.max(air, p.airTime); sp0 = p.speed; } else if (air > 0.3) break; }
  await new Promise((r) => setTimeout(r, 250));
  return { calls: window.__calls, air: +air.toFixed(2), crash: p.crash > 0, speedIn: +(sp0 * 3.6).toFixed(0), speedOut: +(p.speed * 3.6).toFixed(0) };
});
if (SH) await page.screenshot({ path: `${SH}_${si++}.jpg`, quality: 85 });
console.log(keys, hold, jump, JSON.stringify(r));
if (process.env.TRACE) console.log((await page.evaluate(() => window.__tr)).join('\n'));
await browser.close();
