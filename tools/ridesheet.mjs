// A run's first half minute as a contact sheet: node tools/ridesheet.mjs out.jpg [park] [tod] [key=KeyW]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const [out = 'shots/feel/ride.jpg', park = 'yard', tod = 'bluebird', key = 'KeyW'] = process.argv.slice(2);
const dir = out.replace(/\.jpg$/, '_f'); fs.mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));
await p.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?menu=0&mode=run&park=${park}&tod=${tod}&fixdpr=1`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await p.waitForTimeout(2000);
await p.keyboard.down(key);
const n = +(process.env.N ?? 9), gap = +(process.env.GAP ?? 2600), files = [];
for (let i = 0; i < n; i++) { await p.waitForTimeout(gap); const f = `${dir}/${i}.jpg`; await p.screenshot({ path: f, quality: 78 }); files.push(f); console.log(i, await p.evaluate(() => { const q = window.__game.player; return Math.round(q.speed * 3.6) + ' km/h z' + Math.round(q.pos.z) + (q.onGround ? '' : ' air'); })); }
await b.close();
execFileSync('python3', ['-c', `
import sys
from PIL import Image
fs=sys.argv[2:]; ims=[Image.open(f).resize((640,360)) for f in fs]
s=Image.new('RGB',(1920,360*((len(ims)+2)//3)))
for i,m in enumerate(ims): s.paste(m,((i%3)*640,(i//3)*360))
s.save(sys.argv[1],quality=80)`, out, ...files]);
