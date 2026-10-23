// Cork7's own simulation run headless on cork7.com: node tools/c7sim.mjs tools/c7run.js (a script evaluated in the page;
// c7run.js rides The Yard hands-off and lists every jump: takeoff speed, lift, air, distance)
import { chromium } from 'playwright-core';
import { CHROME } from './chrome.mjs';
import fs from 'node:fs';
const script = fs.readFileSync(process.argv[2], 'utf8');
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('https://cork7.com/about', { waitUntil: 'domcontentloaded', timeout: 60000 });
const out = await page.evaluate(script);
console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
await browser.close();
