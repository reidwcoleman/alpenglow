// Ride a park table with real key presses and film the trick:
//   node tools/trick.mjs <outdir> "<keys held at the lip, e.g. KeyD,KeyS>" [jump=Large] [grab=ShiftLeft]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
import fs from 'node:fs';
const [out = 'shots/trick', keys = 'KeyD,KeyS', jump = 'Large', grab = 'ShiftLeft'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:5260/?menu=0&mode=${process.env.MODE ?? 'park'}&fixdpr=1&tod=${process.env.TOD ?? 'bluebird'}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.evaluate(([v, jz]) => { window.__v = v; window.__jz = jz; }, [Number(process.env.V ?? 20), Number(process.env.JZ ?? 0)]);
const info = await page.evaluate((jump) => {
  const g = window.__game;
  const J = window.__jumps.find((j) => j.name === jump && (!window.__jz || j.z === window.__jz));
  const z = J.z - 30;
  for (const o of [...g.skiers]) if (o !== g.player) { o.dispose(); g.skiers.splice(g.skiers.indexOf(o), 1); }
  g.ais.length = 0;
  g.player.place(window.__cx(z) + J.dx, z, null, J.speed ?? window.__v);
  g.rig.snap = true;
  return { z: J.z, lip: J.lip, speed: J.speed };
}, jump);
console.log(info);
const st = () => page.evaluate(() => { const p = window.__game.player, c = window.__game.camera.position; return { cd: +c.distanceTo(p.pos).toFixed(1), pull: +(window.__game.rig.pull ?? 0).toFixed(2), maxy: +p.maxAirY.toFixed(1), g: p.onGround, air: +p.airTime.toFixed(2), z: +p.pos.z.toFixed(1), v: +(p.speed * 3.6).toFixed(0), type: p.trickType, pitch: +p.pitch.toFixed(2), spin: +p.spin.toFixed(2), crash: p.crash }; });
// hold the line speed until the lip: tiny brake/tuck taps not needed, the sim is placed at the right speed
let s = await st(), n = 0;
await page.keyboard.down('Space');
while (s.g && n < 400) { await page.waitForTimeout(30); s = await st(); n++; if (s.z > info.lip - 1.2) await page.keyboard.up('Space'); }
await page.keyboard.up('Space');
const ks = keys.split(',').filter(Boolean);
for (const k of ks) await page.keyboard.down(k);
let i = 0, released = false, grabbed = false;
for (let f = 0; f < Number(process.env.FRAMES ?? 60); f++) {
  s = await st();
  if (!grabbed && grab && s.air > 0.25) { await page.keyboard.down(grab); grabbed = true; }
  if (!released && (Math.abs(s.pitch) > Number(process.env.PITCH ?? 4.6) || Math.abs(s.spin) > 11.5 || (s.air > 0.9 && !ks.includes('KeyS') && !ks.includes('KeyW')))) { for (const k of ks) await page.keyboard.up(k); released = true; }
  if (grabbed && s.air > 1.4) await page.keyboard.up(grab);
  if (f % 2 === 0 || s.g) await page.screenshot({ path: `${out}/f${String(i++).padStart(2, '0')}.jpg`, quality: 70 });
  console.log(JSON.stringify(s));
  if (s.g && f > 3) { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/f${String(i++).padStart(2, '0')}.jpg`, quality: 80 }); break; }
}
for (const k of ks) await page.keyboard.up(k);
console.log('callout', await page.evaluate(() => document.getElementById('callout').innerText.replace(/\n/g, ' | ')), 'score', await page.evaluate(() => window.__game.sc.score));
await browser.close();
