// The front page, every tab: node tools/fronttabs.mjs <outdir> [W] [H]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
import fs from 'node:fs';
const [out = 'shots/front', W = '1280', H = '720'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: Number(W), height: Number(H) } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('[error]', m.text().slice(0, 300)); });
await p.goto(`http://127.0.0.1:5260/?${process.env.Q ?? ''}`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await p.evaluate(() => { document.getElementById('loading').classList.add('hidden'); if (window.__seed) window.__seed(); });
if (process.env.EVAL) await p.evaluate(process.env.EVAL);
for (const t of (process.env.TABS ?? 'ride,board,locker,shop,pass,replays,tricks,updates').split(',')) {
  await p.evaluate((t) => window.__game.menu.setTab(t), t);
  await p.waitForTimeout(t === 'ride' || t === 'locker' ? 1500 : 500);
  await p.screenshot({ path: `${out}/${t}.jpg`, quality: 82 });
}
await b.close();
console.log('ok');
