// How far the chase camera sits from the rider through a jump: node tools/camair.mjs [jump=Large]
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
const jump = process.argv[2] ?? 'Large';
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 320, height: 180 } });
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?menu=0&mode=park&q=low&tod=bluebird`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
const r = await page.evaluate(async (jump) => {
  const g = window.__game, p = g.player, J = window.__jumps.find((j) => j.name === jump), z = J.z - 30;
  for (const o of [...g.skiers]) if (o !== p) { o.dispose(); g.skiers.splice(g.skiers.indexOf(o), 1); }
  g.ais.length = 0; p.place(window.__cx(z) + J.dx, z, null, J.pspeed); g.rig.snap = true;
  const rows = []; let n = 0, last = performance.now(), landed = 0;
  return await new Promise((res) => {
    const f = () => {
      const now = performance.now(), dt = now - last; last = now; n++;
      const c = g.camera ?? g.rig.cam, d = c.position.distanceTo(p.pos);
      if (n % 6 === 0) rows.push(`${Math.round(dt)}ms ${p.onGround ? 'G' : 'A'} z${p.pos.z.toFixed(0)} v${(p.speed * 3.6).toFixed(0)} cam ${d.toFixed(1)} dy${(c.position.y - p.pos.y).toFixed(1)} fov${c.fov.toFixed(0)} pull${(g.rig.pull ?? 0).toFixed(2)}`);
      if (p.pos.z > J.lip + 90 || n > 900) return res(rows); requestAnimationFrame(f);
    }; requestAnimationFrame(f);
  });
}, jump);
console.log(r.join('\n'));
await b.close();
