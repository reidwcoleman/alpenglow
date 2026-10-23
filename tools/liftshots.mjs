// The chairlift ride before a run: frames along it, then skipped. node tools/liftshots.mjs [park] [outprefix]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const park = process.argv[2] ?? 'yard', out = process.argv[3] ?? '/tmp/lift';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?park=${park}&menu=0&mode=run&lift=1&tod=bluebird`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
const st = () => page.evaluate(() => ({ state: window.__game.state, lift: window.__game.lift && { t: +window.__game.lift.t.toFixed(1), T: +window.__game.lift.T.toFixed(1) } }));
console.log(await st());
for (const [i, w] of (process.env.TIMES ?? '2500,8000,9000').split(',').map((w, i) => [i + 1, Number(w)])) { await page.waitForTimeout(w); await page.screenshot({ path: `${out}_${i}.jpg`, quality: 80 }); console.log(i, await st()); }
await page.keyboard.press('KeyF');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}_9.jpg`, quality: 80 });
console.log('after F', await st(), await page.evaluate(() => { const p = window.__game.player; return { z: +p.pos.z.toFixed(1), held: !!p.held }; }));
await browser.close();
