// Jump straight to a stage of the rescue and look at it from anywhere:
//   node tools/rescuecam.mjs <out.jpg> <hospital|lift|heli> ['{"pos":[x,y,z],"look":[x,y,z],"fov":50}'] [relative=1]
// with relative=1 the free camera's pos/look are offsets from the subject (the clinic door, your
// chair, the helicopter)
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const [out = 'shots/rc.jpg', what = 'lift', cam = '', rel = '1'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 1280), height: Number(process.env.H ?? 720) } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack?.split('\n')[1]));
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?park=${process.env.PARK ?? 'yard'}&menu=0&mode=run&tod=${process.env.TOD ?? 'bluebird'}&fixdpr=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.evaluate(() => { const g = window.__game, C = window.__course, p = g.player; const z = 1300; p.place(C.centerX(z), z, null, 20); p.startCrash('tree', 20); });
await page.waitForTimeout(500);
if (what === 'heli') {
  await page.waitForFunction(() => window.__game.rescue.phase === 'lower', null, { timeout: 30000 });
  await page.waitForTimeout(2500);
} else {
  await page.evaluate(() => window.__game.rescue.toHospital());
  await page.waitForFunction(() => window.__game.rescue.picking, null, { timeout: 30000 });
  if (what === 'lift') { await page.evaluate(() => window.__game.rescue.choose(2)); await page.waitForTimeout(2500); }
}
if (cam) {
  const c = JSON.parse(cam);
  await page.evaluate(([c, rel, what]) => {
    const g = window.__game, r = g.rescue;
    const base = what === 'lift' ? r.chair.position : what === 'heli' ? r.heli.group.position : g.props.hospital.door;
    // (round the helicopter the offsets are in its own frame: +z its nose, +x its left)
    const add = (a) => (what === 'heli' && rel === '1' ? r.heli.group.localToWorld(new base.constructor(...a)).toArray() : rel === '1' ? [a[0] + base.x, a[1] + base.y, a[2] + base.z] : a);
    window.__freeCam = { pos: add(c.pos), look: add(c.look), fov: c.fov ?? 50 };
  }, [c, rel, what]);
  await page.waitForTimeout(600);
}
if (process.env.CLEAN !== '0') await page.evaluate(() => { for (const id of ['dest', 'rescue']) document.getElementById(id)?.classList.add('hidden'); });
await page.screenshot({ path: out, quality: 80 });
console.log('saved', out);
await browser.close();
