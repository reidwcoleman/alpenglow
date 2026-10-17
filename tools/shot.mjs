// Headless screenshot of the running dev server.
//   node tools/shot.mjs <out.jpg> "<query>" [waitMs]
// e.g. node tools/shot.mjs shots/a.jpg "menu=0&mode=free&z=1200&auto=1" 4000
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
import fs from 'node:fs';
import path from 'node:path';

const [out = 'shots/shot.jpg', query = '', waitMs = '3000'] = process.argv.slice(2);
fs.mkdirSync(path.dirname(out), { recursive: true });
const port = process.env.PORT ?? 5260;
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 1280), height: Number(process.env.H ?? 720) }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 600)); });
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/?${query}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
console.log('boot ms', Date.now() - t0);
await page.waitForTimeout(Number(waitMs));
if (process.env.EVAL) console.log('eval', JSON.stringify(await page.evaluate(process.env.EVAL)));
const fps = await page.evaluate(() => window.__fps);
await page.screenshot({ path: out, quality: 85 });
console.log('saved', out, 'fps', fps?.toFixed?.(1));
await browser.close();
