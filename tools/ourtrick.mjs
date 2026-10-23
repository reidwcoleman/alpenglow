// Our side of tools/c7trick.js: the same trick off a park kicker, logged every 0.1 s of air.
//   node tools/ourtrick.mjs [jump=XL] [trick=spingrab|spin|flip|cork]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [jump = 'XL', TR = 'spingrab'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?menu=0&mode=park&fixdpr=1&tod=bluebird&lift=0`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
const out = await page.evaluate(async ([jump, TR]) => {
  const g = window.__game, p = g.player;
  const J = window.__jumps.find((j) => j.name === jump);
  const z = J.z - 30;
  p.place(window.__cx(z) + J.dx, z, null, J.pspeed ?? J.speed);
  const rows = [];
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  while (p.onGround) await frame();
  rows.push(`takeoff ${(p.speed * 3.6).toFixed(0)} km/h`);
  const key = (k, on) => dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: k, key: k }));
  const ks = TR === 'flip' ? ['KeyW'] : TR === 'cork' ? ['ArrowLeft', 'KeyW'] : ['ArrowLeft'];
  for (const k of ks) key(k, true);
  let next = 0, grabbed = false;
  while (!p.onGround) {
    await frame();
    if (!grabbed && TR !== 'spin' && TR !== 'flip' && p.airTime > 0.15) { key('ShiftLeft', true); grabbed = true; }
    if (p.airTime >= next) { rows.push(`${p.airTime.toFixed(1)} spin ${(p.spin * 57.3).toFixed(0)} flip ${(p.pitch * 57.3).toFixed(0)} h ${(p.pos.y - p.takeoffY || 0).toFixed?.(1) ?? ''} v ${(p.speed * 3.6).toFixed(0)}`); next += 0.1; }
  }
  for (const k of [...ks, 'ShiftLeft']) key(k, false);
  await new Promise((r) => setTimeout(r, 300));
  rows.push(`land ${p.airTime.toFixed(2)} spin ${(p.spin * 57.3).toFixed(0)} ${document.getElementById('callout').innerText.replace(/\n/g, ' | ')}`);
  return rows;
}, [jump, TR]);
console.log(out.join('\n'));
await b.close();
