// CPU vs GPU split: times simulate(), visual update and a synced render.
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?menu=0&mode=free&auto=1&fixdpr=1&z=2000`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(2500);
console.log(await page.evaluate(() => {
  const g = window.__game, gl = g.renderer.getContext(), px = new Uint8Array(4);
  const T = (f, n = 20) => { const t = performance.now(); for (let i = 0; i < n; i++) f(); return ((performance.now() - t) / n).toFixed(2); };
  const sim = T(() => { for (let k = 0; k < 2; k++) g.simulate(0.01); });
  const vis = T(() => { for (const s of g.skiers) s.updateVisual(0.016, g.camera.position); });
  const part = T(() => g.particles.update(0.016, g.sunLit));
  const terr = T(() => g.terrain.update(g.camera.position.x, g.camera.position.z, 4));
  const render = T(() => { g.post.render(0.016); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }, 10);
  const plain = T(() => { g.renderer.render(g.scene, g.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }, 10);
  return JSON.stringify({ sim2steps: sim, visual: vis, particles: part, terrainUpd: terr, postRenderSync: render, plainRenderSync: plain, programs: g.renderer.info.programs.length });
}));
await browser.close();
