// (the chunk's file name changes when Cork7 ships: take the new one from cork7.com's page source)
(async () => {
  const m = await import('/_next/static/chunks/active-course-CTuUDWGM.js');
  const S = m.x, center = m.O, JUMPS = m.c, jumpCenter = m.F;
  const MODE = window.__MODE || 'cruise';
  const s = new S();
  s.phase = 'skiing';
  const dt = 1 / 60, log = [], jumps = [];
  let t = 0, air = null, spinHold = 0;
  const main = JUMPS.filter((j) => j.main).sort((a, b) => a.z - b.z);
  while (t < 240 && s.phase === 'skiing') {
    // aim down the line of the next main jump (or the run's middle)
    const J = main.find((j) => j.z > s.z - 1);
    const look = Math.max(8, s.speed * 0.9);
    const tz = s.z + look;
    const tx = J && tz > J.z - J.run - 40 && tz <= J.z ? jumpCenter(J, Math.min(tz, J.z)) : center(tz);
    const want = Math.atan2(tx - s.x, look);
    const err = Math.atan2(Math.sin(want - s.travelHeading), Math.cos(want - s.travelHeading));
    const inp = { steer: s.airborne ? 0 : Math.max(-1, Math.min(1, err * 3)), forward: MODE === 'tuck', brake: false, jump: false, grab: false, board: false, airRoll: 0, cork: false, over: false, butter: false };
    if (s.airborne && window.__SPIN) { if (s.airTime < window.__SPIN) inp.steer = 1; }
    if (s.airborne && window.__FLIP) { if (s.airTime < window.__FLIP) inp.forward = true; }
    const wasAir = s.airborne;
    s.update(dt, inp);
    t += dt;
    if (!wasAir && s.airborne) air = { z: +s.z.toFixed(0), kmh: +(s.speed * 3.6).toFixed(0), vy: +s.vy.toFixed(2), t };
    if (wasAir && !s.airborne) { air.air = +(t - air.t).toFixed(2); air.dist = +s.lastJumpDistance.toFixed(1); air.out = +(s.speed * 3.6).toFixed(0); air.note = s.notice || s.event; air.spin = +(s.spin).toFixed(2); delete air.t; jumps.push(air); air = null; }
    if (Math.abs(t - Math.round(t * 2) / 2) < dt / 2) log.push(`${t.toFixed(1)}s z${s.z.toFixed(0)} ${(s.speed * 3.6).toFixed(0)}`);
  }
  return { mode: MODE, time: +t.toFixed(1), z: +s.z.toFixed(0), crashes: s.crashes, top: +s.topSpeed.toFixed(0), log: log.filter((_, i) => i % 6 === 0).join(' | '), jumps };
})()
