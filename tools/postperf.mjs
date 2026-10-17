import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const post of ['{"msaa":4,"bloom":true,"smaa":false}', '{"msaa":0,"bloom":true,"smaa":true}', '{"msaa":0,"bloom":false,"smaa":true}', '{"msaa":0,"bloom":true,"smaa":false}']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:5260/?menu=0&mode=free&auto=1&fixdpr=1&z=2000&post=${encodeURIComponent(post)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  await page.waitForTimeout(4000);
  console.log(post, 'fps', (await page.evaluate(() => window.__fps)).toFixed(1));
  await page.close();
}
await browser.close();
