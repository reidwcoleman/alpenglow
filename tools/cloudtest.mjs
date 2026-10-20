// The shared server end to end as a guest: autopilot run -> results -> global board shows it
// -> watch it off the server -> the cloud save has the run. node tools/cloudtest.mjs [park]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const park = process.argv[2] ?? 'bigair';
const out = process.env.OUT ?? 'shots';
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 300)); });
await p.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?park=${park}&menu=0&mode=run&auto=1&gear=${process.env.GEAR ?? 'ski'}`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
console.log('cloud', await p.evaluate(async () => { await window.__game.cloud.ready; return { st: window.__game.cloud.status, uid: window.__game.cloud.uid, guest: window.__game.cloud.guest }; }));
await p.waitForFunction(() => !document.getElementById('results').classList.contains('hidden'), null, { timeout: 400000, polling: 1000 });
await p.waitForTimeout(800);
await p.screenshot({ path: `${out}/ct_results.jpg`, quality: 80 });
console.log('results', await p.evaluate(() => document.getElementById('rescard').innerText.replace(/\n+/g, ' | ')));
await p.waitForTimeout(6000);
await p.click('#r-menu');
await p.waitForTimeout(1000);
await p.evaluate((park) => { const m = window.__game.menu; m.lbPark = park; m.lbScope = 'global'; m.setTab('board'); }, park);
await p.waitForTimeout(3000);
await p.screenshot({ path: `${out}/ct_board.jpg`, quality: 80 });
console.log('board', await p.evaluate(() => document.getElementById('tab-board').innerText.replace(/\n+/g, ' | ').slice(0, 500)));
const w = await p.$('#tab-board .watch[data-src="cloud"]');
if (w) {
  await w.click();
  await p.waitForFunction(() => window.__game.replay.on, null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(2500);
  console.log('watching', await p.evaluate(() => ({ on: window.__game.replay.on, frames: window.__game.replay.frames.length })));
  await p.screenshot({ path: `${out}/ct_watch.jpg`, quality: 80 });
  await p.keyboard.press('Escape');
} else console.log('no cloud watch button');
await p.waitForTimeout(2500);
console.log('profile', await p.evaluate(async () => { const d = await window.__game.cloud.loadProfile(); return d && { flakes: d.flakes, xp: d.xp, runs: Object.fromEntries(Object.entries(d.runs ?? {}).map(([k, v]) => [k, v.length])), name: d.name, book: d.book?.length }; }));
await b.close();
