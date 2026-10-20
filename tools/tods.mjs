// Same spot under every condition: node tools/tods.mjs <outdir> z cam (TODS=night,arctic picks them)
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
import fs from 'node:fs';
const [dir = 'shots/tods', z = '420', cam = 'chase'] = process.argv.slice(2);
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?menu=0&mode=free&auto=1&fixdpr=1&z=${z}&cam=${cam}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
for (const tod of (process.env.TODS ?? 'bluebird,golden,alpenglow,storm').split(',')) {
  await page.evaluate(`(() => { const g = window.__game; g.tod='${tod}'; g.applyConditions(); g.player.place(window.__cx(${z}), ${z}, null, 16); g.player.ai.lastZ=${z}; g.rig.snap=true; })()`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${dir}/${tod}.jpg`, quality: 85 });
}
await browser.close();
