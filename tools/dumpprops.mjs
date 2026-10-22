// Every park's placed props, as the game places them, for the Blender scripts:
// node tools/dumpprops.mjs [park ...]  ->  blender/data/props_<park>.json
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
import fs from 'node:fs';
const all = ['yard', 'slope', 'forest', 'bigair', 'timber', 'grand', 'mega', 'canyon', 'cloud'];
const parks = process.argv.slice(2).length ? process.argv.slice(2) : all;
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const park of parks) {
  const page = await b.newPage({ viewport: { width: 320, height: 240 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?park=${park}&menu=0&mode=run&q=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
  const L = await page.evaluate(() => JSON.stringify(window.__game.props.layout));
  fs.writeFileSync(`blender/data/props_${park}.json`, L);
  console.log(park, Object.entries(JSON.parse(L)).map(([k, v]) => `${k} ${v.length}`).join(', '));
  await page.close();
}
await b.close();
