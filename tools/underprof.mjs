// Self time under one function (UNDER=name): UNDER=frame node tools/underprof.mjs [url]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const url = process.argv[2] ?? 'http://127.0.0.1:5261/';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
await cdp.send('Profiler.start');
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
const { profile } = await cdp.send('Profiler.stop');
const dt = new Map();
for (let i = 0; i < profile.samples.length; i++) dt.set(profile.samples[i], (dt.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i] ?? 0));
// inclusive time too: walk the tree
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const incl = new Map();
const tot = (n) => { let t = (dt.get(n.id) ?? 0) / 1000; for (const c of n.children ?? []) t += tot(byId.get(c)); const f = n.callFrame, k = `${f.functionName || '(anon)'} ${(f.url.split('/').pop() || '').split('?')[0]}:${f.lineNumber + 1}`; incl.set(k, Math.max(incl.get(k) ?? 0, 0) + t); return t; };
tot(profile.nodes[0]);
const self = new Map();
for (const n of profile.nodes) { const f = n.callFrame, k = `${f.functionName || '(anon)'} ${(f.url.split('/').pop() || '').split('?')[0]}:${f.lineNumber + 1}`; self.set(k, (self.get(k) ?? 0) + (dt.get(n.id) ?? 0) / 1000); }
const under = new Map(); const walk = (n, inF) => { const f = n.callFrame; const k = (f.functionName||'(anon)') + ' ' + (f.url.split('/').pop()||'').split('?')[0] + ':' + (f.lineNumber+1); const now = inF || (f.functionName === process.env.UNDER); if (now) under.set(k, (under.get(k) ?? 0) + (dt.get(n.id) ?? 0) / 1000); for (const c of n.children ?? []) walk(byId.get(c), now); }; walk(profile.nodes[0], false);
const show = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(0).padStart(6)} ms  ${k}`).join('\n');
console.log('--- under ' + process.env.UNDER + '\n' + show(under, 40));
await browser.close();
