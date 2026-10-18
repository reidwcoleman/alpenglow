// Ride into things: a piste pole, the side nets, a crash at speed, a hop turn to ride switch.
// node tools/hits.mjs <outdir> [park]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
import fs from 'node:fs';
const [out = 'shots/hits', park = 'yard'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
await page.goto(`http://127.0.0.1:5260/?park=${park}&menu=0&mode=run&tod=bluebird&fixdpr=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(4500);
const ev = () => page.evaluate(() => { const p = window.__game.player; const e = window.__ev ?? []; window.__ev = []; return { e, sp: +p.speed.toFixed(1), crash: p.crash, sw: !!p.skiSwitch }; });
await page.evaluate(() => { const p = window.__game.player; window.__ev = []; for (const k of ['smash', 'impact', 'crash', 'recover', 'land']) p.on(k, (d) => window.__ev.push(k + (d?.kind ? ':' + d.kind : d?.reason ? ':' + d.reason : '') + '@' + (performance.now() / 1000).toFixed(2))); });

// 1. a piste pole
const pole = await page.evaluate(() => {
  const g = window.__game, C = window.__course, p = g.player;
  const o = g.smash.all.find((o) => o.kind === 'pole' && !o.off && o.z > 500);
  p.place(o.x, o.z - 14, 0, 14);
  return { x: o.x, z: o.z, i: g.smash.all.indexOf(o) };
});
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/1_pole.jpg`, quality: 78 });
await page.waitForTimeout(800);
console.log('pole', JSON.stringify(await page.evaluate((i) => { const o = window.__game.smash.all[i]; return { down: o.down, ang: +o.ang.toFixed(2) }; }, pole.i)), JSON.stringify(await ev()));

// 2. the side net
await page.evaluate(() => {
  const g = window.__game, C = window.__course, p = g.player;
  const z = 900, x = C.centerX(z) + C.halfWidth(z) - 4;
  p.place(x, z, Math.atan2(1, 0.6), 13);
});
await page.waitForTimeout(450);
await page.screenshot({ path: `${out}/2_net.jpg`, quality: 78 });
await page.waitForTimeout(1200);
console.log('net', JSON.stringify(await ev()), JSON.stringify(await page.evaluate(() => window.__game.props.netHits.map((h) => +h.a.toFixed(2)))));

// 3. a crash at speed: how long down, how fast after
const t0 = await page.evaluate(() => {
  const g = window.__game, C = window.__course, p = g.player;
  const z = 1300; p.place(C.centerX(z), z, null, 20); p.startCrash('test'); window.__t0 = performance.now(); return 0;
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/3_crash.jpg`, quality: 78 });
await page.waitForFunction(() => window.__game.player.crash === 0, null, { timeout: 10000 });
console.log('crash', JSON.stringify(await page.evaluate(() => ({ down: ((performance.now() - window.__t0) / 1000).toFixed(2), speed: window.__game.player.speed.toFixed(1) }))));
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/4_up.jpg`, quality: 78 });
await ev();

// 4. hop turn -> riding backwards, looking over the shoulder
await page.evaluate(() => { const g = window.__game, C = window.__course, p = g.player; const z = 1500; p.place(C.centerX(z), z, null, 10); });
await page.waitForTimeout(400);
await page.keyboard.press('NumpadDecimal');
await page.waitForTimeout(1600);
console.log('turn', JSON.stringify(await ev()), JSON.stringify(await page.evaluate(() => { const p = window.__game.player; return { back: +(p.backK ?? 0).toFixed(2), rel: +Math.abs(((p.heading - Math.atan2(p.vel.x, p.vel.z)) % 6.283)).toFixed(2) }; })));
await page.screenshot({ path: `${out}/5_switch.jpg`, quality: 78 });
await page.evaluate(() => { window.__game.rig.mode = 'tv'; });
await page.keyboard.press('KeyC');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/6_switch_cam.jpg`, quality: 78 });
await page.keyboard.press('NumpadDecimal');
await page.waitForTimeout(1600);
console.log('turn back', JSON.stringify(await ev()));
await browser.close();
