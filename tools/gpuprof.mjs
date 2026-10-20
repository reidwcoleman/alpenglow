// GPU cost by subsystem: synced render time with each part hidden.
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?menu=0&mode=free&auto=1&fixdpr=1&z=${process.argv[2] ?? 2000}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(3000);
console.log(await page.evaluate(() => {
  const g = window.__game, gl = g.renderer.getContext(), px = new Uint8Array(4);
  g.renderer.setAnimationLoop(null);
  const T = () => { g.post.render(0.016); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const t = performance.now(); for (let i = 0; i < 8; i++) { g.post.render(0.016); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return +((performance.now() - t) / 8).toFixed(1); };
  const res = { all: T() };
  const hide = (list, on) => list.forEach((o) => { o.visible = on; });
  const terr = [...g.terrain.chunks.map((c) => c.mesh), g.terrain.mid, g.terrain.far];
  const trees = []; for (const c of g.forest.cells.values()) for (const l of c.meshes) for (const m of l) trees.push(m);
  const treeVis = trees.map((m) => m.visible);
  hide(terr, false); res.noTerrain = T(); hide(terr, true);
  trees.forEach((m) => { m.visible = false; }); res.noTrees = T(); trees.forEach((m, i) => { m.visible = treeVis[i]; });
  const sk = g.skiers.map((s) => s.model.group); hide(sk, false); res.noSkiers = T(); hide(sk, true);
  g.renderer.shadowMap.autoUpdate = false; res.noShadowPass = T(); g.renderer.shadowMap.autoUpdate = true;
  g.post.bloom.enabled = false; res.noBloom = T(); g.post.bloom.enabled = true;
  g.tracks.mesh.visible = false; g.particles.points.visible = false; res.noTracksParticles = T();
  return JSON.stringify(res);
}));
await browser.close();
