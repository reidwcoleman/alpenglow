// An event on autopilot to its results: node tools/eventtest.mjs <eventId> [tier] [park]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [id = 'sprint', tier = '0', park = 'yard'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?park=${park}&event=${id}&tier=${tier}&auto=1&q=low`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await p.waitForTimeout(3000);
console.log('started', await p.evaluate(() => ({ mode: window.__game.mode, ev: window.__game.event?.ev.id, racers: window.__game.racers?.length, z: Math.round(window.__game.player.pos.z), tag: document.getElementById('evtag').textContent })));
if (process.env.OUT) await p.screenshot({ path: `${process.env.OUT}/ev_${id}.jpg`, quality: 75 });
await p.waitForFunction(() => !document.getElementById('results').classList.contains('hidden'), null, { timeout: 500000, polling: 1000 });
await p.waitForTimeout(1000);
console.log(id, await p.evaluate(() => document.getElementById('rescard').innerText.replace(/\n+/g, ' | ')));
console.log('medals', await p.evaluate(() => JSON.stringify(window.__game.meta.medals)));
await b.close();
