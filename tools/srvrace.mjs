// Two riders on one server: one calls a race, both race it on autopilot, both see the results.
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const out = process.env.OUT ?? 'shots';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const room = 'race' + Math.floor(Math.random() * 1e5);
const open = async () => {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?tod=bluebird&room=${room}&auto=1&q=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  return page;
};
const a = await open(), b = await open();
await a.waitForFunction(() => window.__game.room?.status === 'live' && window.__game.room.peers.size > 0, null, { timeout: 30000 });
console.log('linked', await a.evaluate(() => window.__game.room.label), await b.evaluate(() => window.__game.room?.peers.size));
await a.evaluate(() => window.__game.callRace());
await a.waitForFunction(() => window.__game.mode === 'race', null, { timeout: 30000 });
await b.waitForFunction(() => window.__game.mode === 'race', null, { timeout: 30000 });
console.log('both racing', await a.evaluate(() => [window.__game.state, window.__game.countdown.toFixed(1)]), await b.evaluate(() => [window.__game.state, window.__game.countdown.toFixed(1)]));
await a.screenshot({ path: `${out}/sr_start.jpg`, quality: 75 });
for (const p of [a, b]) await p.waitForFunction(() => !document.getElementById('results').classList.contains('hidden'), null, { timeout: 420000, polling: 1000 });
await a.waitForTimeout(4000);
console.log('A', await a.evaluate(() => document.getElementById('rescard').innerText.replace(/\n+/g, ' | ')));
console.log('B', await b.evaluate(() => document.getElementById('rescard').innerText.replace(/\n+/g, ' | ')));
await a.screenshot({ path: `${out}/sr_results.jpg`, quality: 75 });
await browser.close();
