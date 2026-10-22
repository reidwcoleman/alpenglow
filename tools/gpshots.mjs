// Gameplay screenshot set: node tools/gpshots.mjs <outdir>
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [out = 'shots/gp'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const boot = async (mode, tod) => {
  await page.goto(`http://127.0.0.1:5260/?menu=0&mode=${mode}&tod=${tod}&fixdpr=1&gear=${process.env.GEAR ?? 'ski'}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  await page.waitForTimeout(1200);
};
const shot = (n) => page.screenshot({ path: `${out}/${n}.jpg`, quality: 85 });
const air = () => page.evaluate(() => !window.__game.player.onGround);
// 1-4: big kicker, 540 with a mute grab
await boot('park', 'bluebird');
await page.evaluate(() => {
  const g = window.__game, J = window.__jumps.find((j) => j.name === 'Large'), z = J.z - 30;
  for (const o of [...g.skiers]) if (o !== g.player) { o.dispose(); g.skiers.splice(g.skiers.indexOf(o), 1); }
  g.ais.length = 0;
  g.player.place(window.__cx(z) + J.dx, z, null, J.pspeed ?? J.speed); g.rig.snap = true;
  window.__lip = J.lip ?? J.z;
});
console.log('lip', await page.evaluate(() => [window.__lip, window.__game.player.pos.z]));
await page.keyboard.down('Space');
await page.waitForTimeout(250); await shot('1_approach');
for (let i = 0; i < 600 && !(await air()); i++) await page.waitForTimeout(10);
console.log('takeoff z', await page.evaluate(() => window.__game.player.pos.z));
await page.keyboard.up('Space');
await page.keyboard.down('ArrowLeft'); await page.keyboard.down('ShiftLeft');
await page.waitForTimeout(450); await shot('2_spin_grab');
await page.waitForTimeout(400); await shot('3_spin_grab_late');
await page.keyboard.up('ShiftLeft');
for (let i = 0; i < 400 && (await air()); i++) { await page.waitForTimeout(10); }
await page.keyboard.up('ArrowLeft');
await page.waitForTimeout(250); await shot('4_landing');
// 5-6: rail
await page.evaluate(() => {
  const g = window.__game, R = window.__rails.find((r) => r.name === 'Long Tube');
  g.player.place(R.a.x - R.dir.x * 9, R.a.z - 9, R.yaw, 8.5); g.rig.snap = true;
});
for (let i = 0; i < 300 && !(await page.evaluate(() => !!window.__game.player.grind)); i++) await page.waitForTimeout(10);
await page.waitForTimeout(350); await shot('5_rail');
await page.keyboard.down('KeyD'); await page.waitForTimeout(80); await page.keyboard.up('KeyD');
await page.waitForTimeout(600); await shot('6_rail_swap');
// 7-8: the run at golden hour
await boot('run', 'golden');
await page.keyboard.down('ArrowUp'); await page.waitForTimeout(5000); await page.keyboard.up('ArrowUp');
await shot('7_run');
await page.keyboard.down('ArrowRight'); await page.waitForTimeout(900); await shot('8_carve'); await page.keyboard.up('ArrowRight');
await b.close();
