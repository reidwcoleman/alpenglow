// The new physics against Cork7's own simulation, frame by frame: same snow, same keys.
// Bundles src/ridesim.js, loads it beside the reference on cork7.com, and rides scripted runs in
// both. node tools/c7diff.mjs [scenario]. The surface here is the reference's own terrain, so any
// difference is a difference in the physics.
import { chromium } from 'playwright-core';
import { CHROME } from './chrome.mjs';
import { build } from 'vite';
import fs from 'node:fs';

const out = await build({ configFile: false, logLevel: 'error', build: { write: false, lib: { entry: new URL('../src/ridesim.js', import.meta.url).pathname, formats: ['iife'], name: 'RS', fileName: 'x' }, minify: false } });
const code = (Array.isArray(out) ? out[0] : out).output[0].code;
const runner = fs.readFileSync(new URL('./c7diff_page.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('https://cork7.com/about', { waitUntil: 'domcontentloaded', timeout: 60000 });
// (the course chunk's name changes every time the reference ships: read it off its front page; tools/c7ns.mjs lists the namespaces)
const chunk = (await (await fetch('https://cork7.com/')).text()).match(/active-course-[\w-]+\.js/)[0];
await page.evaluate(code + ';window.RS=RS;window.__CHUNK=' + JSON.stringify(chunk) + ';window.__SPLIT=' + JSON.stringify((process.env.SPLIT ?? '').split('|').filter(Boolean)) + ';window.__WALLS=' + (process.env.WALLS !== '0') + ';window.__ZEND=' + (process.env.ZEND ?? 0) + ';window.__VMAX=' + (process.env.VMAX ?? 43) + ';window.__NS=' + JSON.stringify(process.env.NS ?? 'Q') + ';');
const res = await page.evaluate(`(${runner})(${JSON.stringify(process.argv[2] ?? 'all')})`);
console.log(typeof res === 'string' ? res : JSON.stringify(res, null, 1));
await browser.close();
