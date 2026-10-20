// The helicopter on its pad and the hospital, from a few angles: node tools/heli.mjs <out-prefix>
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [out = 'shots/heli'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack?.split('\n')[1]));
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?park=yard&menu=0&mode=run&tod=bluebird&fixdpr=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const g = window.__game, h = g.props.hospital, H = g.rescue.heli;
  H.group.visible = true; H.group.position.copy(h.pad); H.group.rotation.set(0, h.yaw + 0.6, 0); H.setCable(0.3);
  g.player.frozen = true; g.player.hidden = true; g.state = 'rescue'; document.getElementById('hud').classList.add('hidden');
});
const views = (await page.evaluate(() => { const h = window.__game.props.hospital; const P = h.pad, A = h.door, o = h.out;
  const s = [-o.z, 0, o.x];
  return [
    [[A.x + o.x * 34 + s[0] * 14, A.y + 9, A.z + o.z * 34 + s[2] * 14], [A.x, A.y + 4, A.z]],
    [[A.x + o.x * 10 - s[0] * 6, A.y + 2, A.z + o.z * 10 - s[2] * 6], [A.x, A.y + 2.5, A.z]],
    [[P.x + 7, P.y + 2.5, P.z + 7], [P.x, P.y + 1.6, P.z]],
    [[P.x - 6, P.y + 1.2, P.z - 4], [P.x, P.y + 1.8, P.z]],
  ]; }));
let i = 0;
for (const [pos, look] of views) {
  await page.evaluate(([pos, look]) => { window.__freeCam = { pos, look, fov: 50 }; }, [pos, look]);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}_${i++}.jpg`, quality: 80 });
}
await browser.close();
