// The player's stance as it rides: knee bend (degrees short of straight), hip height over the feet
// (fraction of standing), the spine's forward pitch. node tools/stance.mjs ["ArrowLeft:1200,none:1500,..."]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const plan = process.argv[2] ?? 'none:4000,ArrowLeft:1500,ArrowRight:1500,none:1500';
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 640, height: 360 } });
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?menu=0&mode=run&tod=bluebird&lift=0${process.env.Q ?? ''}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(1000);
const probe = () => page.evaluate(() => {
  const p = window.__game.player, r = p.model.rig, ix = r.ix;
  const ang = (s) => { const h = r.wp[ix.thigh[s]], k = r.wp[ix.calf[s]], f = r.wp[ix.foot[s]]; const a = h.clone().sub(k).normalize(), c = f.clone().sub(k).normalize(); return 180 - Math.acos(Math.max(-1, Math.min(1, a.dot(c)))) * 57.3; };
  const hipY = (r.wp[ix.thigh[0]].y + r.wp[ix.thigh[1]].y) / 2 - (r.wp[ix.foot[0]].y + r.wp[ix.foot[1]].y) / 2;
  const stand = r.kit.bindP[ix.thigh[0]].y - r.kit.bindP[ix.foot[0]].y;
  return `${(p.speed * 3.6).toFixed(0)} km/h lean ${p.lean.toFixed(2)} knees ${ang(0).toFixed(0)}/${ang(1).toFixed(0)} deg hip ${(hipY / stand).toFixed(2)}`;
});
for (const step of plan.split(',')) {
  const [k, ms] = step.split(':');
  if (k !== 'none') await page.keyboard.down(k);
  for (let t = 0; t < +ms; t += 500) { await page.waitForTimeout(500); console.log(k.padEnd(10), await probe()); }
  if (k !== 'none') await page.keyboard.up(k);
}
await b.close();
