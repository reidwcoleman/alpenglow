// Menu flows: park picker, multiplayer with two browsers, replay. node tools/ui2.mjs <outdir>
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
import fs from 'node:fs';
const out = process.argv[2] ?? 'shots/ui2';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const open = async (q) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?${q}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  await page.waitForTimeout(2500);
  return page;
};
const a = await open('tod=bluebird');
await a.click('#b-park-pick');
await a.waitForTimeout(800);
await a.screenshot({ path: `${out}/parks.jpg`, quality: 80 });
await a.click('.pk-pin[data-id="forest"]');
await a.click('#pk-tod button[data-n="1"]');
await a.waitForTimeout(800);
await a.screenshot({ path: `${out}/parks_night.jpg`, quality: 80 });
await a.click('#pk-back');
await a.close();
// multiplayer: two riders in the same room on The Yard
const room = 'test' + Math.floor(Math.random() * 1e5);
const b = await open(`menu=0&mode=run&tod=bluebird&room=${room}&z=300&v=12`);
const c = await open(`menu=0&mode=run&tod=bluebird&room=${room}&z=310&x=4&v=12`);
await b.waitForTimeout(9000);
const st = (p) => p.evaluate(() => ({ who: window.__game.who, st: window.__game.room?.status, state: window.__game.state, live: document.getElementById('livelbl').textContent, peers: window.__game.room ? [...window.__game.room.peers.values()].map((x) => x.name + '@' + x.skier.pos.z.toFixed(0)) : null }));
for (let i = 0; i < 30; i++) { const n = await b.evaluate(() => window.__game.room?.peers.size ?? 0); if (n) { console.log('peer seen after', 9 + i, 's'); break; } await b.waitForTimeout(1000); }
console.log('B', JSON.stringify(await st(b)));
console.log('C', JSON.stringify(await st(c)));
await c.keyboard.press('KeyT'); await c.waitForTimeout(200); await c.keyboard.type('hello from C'); await c.keyboard.press('Enter');
await b.waitForTimeout(1500);
console.log('B feed', await b.evaluate(() => document.getElementById('feed').innerText));
await b.keyboard.down('Tab'); await b.waitForTimeout(300);
await b.screenshot({ path: `${out}/mp.jpg`, quality: 80 });
await b.keyboard.up('Tab');
// replay
await b.keyboard.press('KeyV'); await b.waitForTimeout(1500);
console.log('replay on', await b.evaluate(() => window.__game.replay.on), await b.evaluate(() => document.getElementById('rp-time').textContent));
await b.screenshot({ path: `${out}/replay.jpg`, quality: 80 });
await b.keyboard.press('KeyC'); await b.keyboard.press('KeyC'); await b.keyboard.press('KeyC'); await b.waitForTimeout(1200);
await b.screenshot({ path: `${out}/replay_orbit.jpg`, quality: 80 });
await b.keyboard.press('Escape'); await b.waitForTimeout(300);
console.log('replay closed', !(await b.evaluate(() => window.__game.replay.on)));
await browser.close();
