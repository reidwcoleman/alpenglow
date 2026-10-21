// Milliseconds per frame by subsystem while riding (CPU side): node tools/parts.mjs [phone]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const phone = process.argv[2] === 'phone';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(phone ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${process.env.URL ?? `http://127.0.0.1:${process.env.PORT ?? 5260}/`}?menu=0&mode=${process.env.MODE ?? 'run'}&auto=1${process.env.Q ?? ''}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
await page.waitForTimeout(2500);
console.log(await page.evaluate(() => new Promise((res) => {
  const g = window.__game, T = {}, wrap = (o, k, name) => { const f = o[k].bind(o); o[k] = (...a) => { const t = performance.now(); const r = f(...a); T[name] = (T[name] ?? 0) + performance.now() - t; return r; }; };
  wrap(g, 'simulate', 'simulate'); wrap(g, 'renderWorld', 'renderWorld(all)'); wrap(g, 'frame', 'frame(all)'); wrap(g, 'spray', 'spray');
  wrap(g.particles, 'update', 'particles'); wrap(g.terrain, 'update', 'terrain'); wrap(g.forest, 'update', 'forest');
  wrap(g.props, 'updateLift', 'lift'); wrap(g.props, 'updatePeople', 'people'); wrap(g.props, 'updateNets', 'nets'); wrap(g, 'hud', 'hud');
  wrap(g.post, 'render', 'post.render'); wrap(g.renderer, 'render', 'renderer.render'); wrap(g.snowfall, 'update', 'snowfall'); wrap(g.lights, 'update', 'lights');
  wrap(g.env, 'follow', 'env.follow'); wrap(g.audio, 'update', 'audio'); wrap(g.trail, 'update', 'trail'); wrap(g.injuries, 'update', 'injuries'); wrap(g.smash, 'update', 'smash');
  wrap(g.rig, 'update', 'camera'); wrap(g.replay, 'record', 'replay');
  for (const s of g.skiers) wrap(s, 'updateVisual', 'skier visuals');
  wrap(g.scene, 'updateMatrixWorld', 'scene.updateMatrixWorld');
  let n = 0; const go = () => { if (++n < 300) requestAnimationFrame(go); else res(Object.entries(T).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${(v / n).toFixed(2).padStart(7)} ms  ${k}`).join('\n') + `\nskiers ${g.skiers.length} programs ${g.renderer.info.programs.length}`); };
  requestAnimationFrame(go);
})));
await browser.close();
