// Rider portraits from the menu's preview renderer: node tools/portrait.mjs <out.jpg> [zoom] [lookY] [eyeY] [yawDeg]
//   OUTFITS='[{...kit overrides}]' renders one tile per entry (kit item ids by category)
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [out, zoom = '4', look = '1.62', eye = '1.66', yaw = '20'] = process.argv.slice(2);
const kits = JSON.parse(process.env.OUTFITS ?? '[{}]');
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 360 * Math.min(kits.length, 5), height: 440 * Math.ceil(kits.length / 5) }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?tod=bluebird${process.env.Q ?? ''}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.evaluate(async ([kits, zoom, look, eye, yaw, gear]) => {
  const g = window.__game;
  const { Preview } = await import('/src/preview.js');
  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;display:flex;flex-wrap:wrap;background:#c9d6e6';
  g.renderer.setAnimationLoop(null);
  for (const k of kits) {
    const el = document.createElement('div');
    el.style.cssText = 'width:360px;height:440px;position:relative';
    document.body.appendChild(el);
    const p = new Preview();
    const kit = g.meta.kit; const save = { ...kit };
    for (const id of Object.values(k)) g.meta.owned.add(id);
    Object.assign(kit, k);
    p.setOutfit(g.meta.outfit(g.myOutfit, (k.gear ?? gear) === 'board'));
    Object.assign(kit, save);
    p.mount(el, { spin: 0, zoom, look, eye });
    p.yaw = (yaw * Math.PI) / 180;
    p.canvas.style.cssText = 'width:100%;height:100%';
    p.render(0.016); p.render(0.016);
  }
}, [kits, Number(zoom), Number(look), Number(eye), Number(yaw), process.env.GEAR ?? 'ski']);
await page.waitForTimeout(500);
await page.screenshot({ path: out, quality: 90 });
console.log('saved', out);
await browser.close();
