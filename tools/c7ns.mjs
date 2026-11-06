// Which parks Cork7's current build carries: node tools/c7ns.mjs. Prints the live course chunk and
// every namespace in it with a SkiSimulation (c7diff needs both: CHUNK=... NS=...).
import { chromium } from 'playwright-core';
import { CHROME } from './chrome.mjs';
const html = await (await fetch('https://cork7.com/')).text();
const chunk = html.match(/active-course-[\w-]+\.js/)?.[0];
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await b.newPage();
await page.goto('https://cork7.com/about', { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log(chunk, await page.evaluate(async (c) => {
  const m = await import('/_next/static/chunks/' + c);
  return Object.keys(m).filter((k) => m[k] && typeof m[k] === 'object' && m[k].SkiSimulation).map((k) => `${k}: jumps ${m[k].JUMPS?.length ?? 0} rails ${m[k].RAILS?.length ?? 0} keys ${Object.keys(m[k]).length}`);
}, chunk));
await b.close();
