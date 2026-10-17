// Toggle subsystems and measure fps at a fixed spot: node tools/perf.mjs [z]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const z = Number(process.argv[2] ?? 2000);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:5260/?menu=0&mode=free&auto=1&fixdpr=1&z=${z}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
const measure = async (label, js) => {
  await page.evaluate(`(() => { const g = window.__game; g.player.place(window.__cx(${z}), ${z}, null, 18); g.player.ai.lastZ=${z}; ${js} })()`);
  await page.waitForTimeout(2600);
  const r = await page.evaluate(() => ({ fps: window.__fps, calls: window.__game.renderer.info.render.calls, tris: window.__game.renderer.info.render.triangles }));
  console.log(label.padEnd(18), 'fps', r.fps.toFixed(1), 'calls', r.calls, 'tris', r.tris);
};
await measure('baseline', '');
await measure('no shadows', 'g.env.sun.castShadow = false;');
await measure('no forest', 'g.env.sun.castShadow = true; g.forest.veg.group.visible = false;');
await measure('no tracks', 'g.tracks.mesh.visible = false;');
await measure('no post', 'g.post.render = () => g.renderer.render(g.scene, g.camera);');
await measure('no skiers', 'for (const s of g.skiers) s.model.group.layers.set(5); for (const s of g.skiers) s.model.group.traverse(o=>o.layers.set(5));');
await measure('no terrain', 'for (const c of g.terrain.chunks) c.mesh.layers.set(5); g.terrain.far.layers.set(5); g.terrain.mid.layers.set(5);');
await browser.close();
