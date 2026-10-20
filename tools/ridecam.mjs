// Film the rider through a run of turns, frame by frame in game time:
//   PORT=5303 node tools/ridecam.mjs <outdir> [z] [plan]
// plan: comma list of key+ms of game time, e.g. "U3000,L700,R700,L700,D1500,_800"
//   U tuck, L/R turn, D brake (skid stop), _ nothing, J jump. Shots every CAP ms (default 100)
//   from FROM ms on (default: after the first step). The game runs at a fixed 1/60 step, paused
//   between shots, so the frames are evenly spaced however slow the machine is.
// VIEW=[yawDeg, dist, height] round the line of travel (0 = from ahead, 180 = from behind).
// MODE (default free), Q extra query, GEAR=board for a snowboarder.
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
import fs from 'node:fs';
const [out = '/tmp/ridecam', z = '900', plan = 'U3000,L700,R700,L700,R700'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (/^f\d+\.jpg$/.test(f)) fs.unlinkSync(`${out}/${f}`);
const port = process.env.PORT ?? 5260;
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 960), height: Number(process.env.H ?? 720) }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const gear = process.env.GEAR ? `&gear=${process.env.GEAR}` : '';
await page.goto(`http://127.0.0.1:${port}/?menu=0&mode=${process.env.MODE ?? 'free'}&fixdpr=1&tod=${process.env.TOD ?? 'bluebird'}&z=${z}${gear}${process.env.Q ?? ''}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(1500);
const view = JSON.parse(process.env.VIEW ?? '[150,3.6,1.2]');
await page.evaluate((view) => {
  const g = window.__game, p = g.player;
  document.getElementById('hud')?.classList.add('hidden');
  g.clock.getDelta = () => 1 / 60;
  // the camera rides along: round the (smoothed) line of travel, aimed at the body
  const d = { x: Math.sin(p.heading), z: Math.cos(p.heading) };
  const cam = { pos: [0, 0, 0], look: [0, 0, 0], fov: 40 };
  const upd = () => {
    const v = p.vel, l = Math.hypot(v.x, v.z);
    if (l > 1.5) { d.x += (v.x / l - d.x) * 0.06; d.z += (v.z / l - d.z) * 0.06; }
    const n = Math.hypot(d.x, d.z) || 1, a = Math.atan2(d.x / n, d.z / n) + (view[0] * Math.PI) / 180;
    cam.pos[0] = p.pos.x + Math.sin(a) * view[1]; cam.pos[1] = p.pos.y + view[2]; cam.pos[2] = p.pos.z + Math.cos(a) * view[1];
    cam.look[0] = p.pos.x; cam.look[1] = p.pos.y + 0.75; cam.look[2] = p.pos.z;
  };
  window.__freeCam = { get pos() { upd(); return cam.pos; }, get look() { return cam.look; }, fov: 40 };
  g.paused = true;
}, view);
// HOLD=1: the rider stands still where he is (to watch him stopped)
if (process.env.HOLD) await page.evaluate(() => {
  const p = window.__game.player, step = p.step.bind(p), at = p.pos.clone();
  p.step = (dt) => { step(dt); p.vel.set(0, 0, 0); p.pos.x = at.x; p.pos.z = at.z; };
});
const KEYS = { U: 'ArrowUp', L: 'ArrowLeft', R: 'ArrowRight', D: 'ArrowDown', J: 'Space', _: null };
const step = (k) => page.evaluate((k) => new Promise((res) => {
  const g = window.__game; g.paused = false; let n = 0;
  const tick = () => { if (++n >= k) { g.paused = true; requestAnimationFrame(() => res()); } else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}), k);
const steps = plan.split(',').map((s) => ({ key: KEYS[s[0]], ms: Number(s.slice(1)) }));
const cap = Number(process.env.CAP ?? 100), from = Number(process.env.FROM ?? steps[0].ms);
let t = 0, i = 0, nextShot = from;
for (const s of steps) {
  if (s.key) await page.keyboard.down(s.key);
  const end = t + s.ms;
  while (t < end) {
    const ms = Math.min(end - t, Math.max(1000 / 60, t < nextShot ? nextShot - t : cap));
    const k = Math.max(1, Math.round(ms / (1000 / 60)));
    await step(k);
    t += (k * 1000) / 60;
    if (t >= nextShot - 1) {
      if (process.env.DBG === '2') console.log(Math.round(t), await page.evaluate(() => { const m = window.__game.player.model, G = m.gm, p = window.__game.player; return [p.lean, p.edge, G.susp, G.trans, G.pl, G.plS, G.skid, G.sp].map((v) => +(+v).toFixed(3)).join(' '); }));
      if (process.env.NOSHOT) i++;
      else await page.screenshot({ path: `${out}/f${String(i++).padStart(3, '0')}.jpg`, quality: 85 });
      nextShot += cap;
    }
  }
  if (s.key) await page.keyboard.up(s.key);
}
if (process.env.DBG) console.log(await page.evaluate(() => { const m = window.__game.player.model, G = m.gm; return JSON.stringify({ sp: G.sp, slip: G.slip, skid: G.skid, skidL: G.skidL, stop: G.stop, susp: G.susp, trans: G.trans, pl: G.pl, vl: G.vl, tw: m.twistNow }); }));
// END=[[yaw, dist, height], ...]: the last moment frozen and shot from round the rider (v0.jpg ...)
let vi = 0;
for (const v of JSON.parse(process.env.END ?? '[]')) {
  await page.evaluate((v) => {
    const p = window.__game.player, d = window.__freeCam;
    const a = Math.atan2(p.vel.x, p.vel.z) + (v[0] * Math.PI) / 180;
    window.__freeCam = { pos: [p.pos.x + Math.sin(a) * v[1], p.pos.y + v[2], p.pos.z + Math.cos(a) * v[1]], look: [p.pos.x, p.pos.y + 0.7, p.pos.z], fov: 40 };
  }, v);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${out}/v${vi++}.jpg`, quality: 88 });
}
console.log(await page.evaluate(() => { const p = window.__game.player; return `lean ${p.lean.toFixed(2)} speed ${p.speed.toFixed(1)} edge ${p.edge.toFixed(2)}`; }), 'frames', i);
await browser.close();
