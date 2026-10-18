// Quick tricks: arm one before a park kicker (keys 1-4 are quick tricks off the park; here we
// arm through the game) and see what lands. node tools/quick.mjs <lessonId> [jump=Large]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
import fs from 'node:fs';
const [id = 'cork', jump = 'Large'] = process.argv.slice(2);
const out = process.env.OUT; if (out) fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:5260/?menu=0&mode=park&tod=bluebird&gear=${process.env.GEAR ?? 'ski'}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
const r = await page.evaluate(async ([id, jump]) => {
  const g = window.__game;
  const J = window.__jumps.find((j) => j.name === jump);
  const z = J.z - 30;
  for (const o of [...g.skiers]) if (o !== g.player) { o.dispose(); g.skiers.splice(g.skiers.indexOf(o), 1); }
  g.ais.length = 0;
  g.player.place(window.__cx(z) + J.dx, z, null, J.speed ?? 16);
  g.rig.snap = true;
  g.setQuick(0, id);
  g.quickKey(0);
  const calls = [];
  const orig = g.say.bind(g);
  g.say = (n, p, s2, c, ms) => { calls.push(String(n).replace(/<[^>]+>/g, '')); return orig(n, p, s2, c, ms); };
  const t0 = performance.now();
  let air = 0;
  while (performance.now() - t0 < 9000) { await new Promise((r) => setTimeout(r, 100)); air = Math.max(air, g.player.airTime); if (calls.length && g.player.onGround && air > 0.3) break; }
  return { calls, air: +air.toFixed(2), crash: g.player.crash > 0, score: g.sc.score };
}, [id, jump]);
console.log(id, jump, JSON.stringify(r));
if (out) await page.screenshot({ path: `${out}/q_${id}.jpg`, quality: 75 });
await browser.close();
