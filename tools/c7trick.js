// Cork7's own sim through one trick: node tools/c7sim.mjs tools/c7trick.js (window.__TRICK in the
// page: 'spin' | 'spingrab' | 'cork' | 'flip'). Rides the line to the first big kicker hands-off,
// then logs the air every 0.1 s: spin, flip, height, speed.
(async () => {
  const m = await import('/_next/static/chunks/active-course-CTuUDWGM.js');
  const S = m.x, center = m.O, JUMPS = m.c, jumpCenter = m.F;
  const TR = window.__TRICK || 'spingrab';
  const s = new S();
  s.phase = 'skiing';
  const dt = 1 / 60, rows = [];
  let t = 0, at = -1, y0 = 0, done = false;
  const main = JUMPS.filter((j) => j.main).sort((a, b) => a.z - b.z);
  const keys = Object.keys(s).filter((k) => typeof s[k] === 'number');
  while (t < 200 && s.phase === 'skiing' && !done) {
    const J = main.find((j) => j.z > s.z - 1);
    const look = Math.max(8, s.speed * 0.9), tz = s.z + look;
    const tx = J && tz > J.z - J.run - 40 && tz <= J.z ? jumpCenter(J, Math.min(tz, J.z)) : center(tz);
    const want = Math.atan2(tx - s.x, look);
    const err = Math.atan2(Math.sin(want - s.travelHeading), Math.cos(want - s.travelHeading));
    const inp = { steer: s.airborne ? 0 : Math.max(-1, Math.min(1, err * 3)), forward: false, brake: false, jump: false, grab: false, board: false, airRoll: 0, cork: false, over: false, butter: false };
    if (s.airborne && at >= 0) {
      const a = t - at;
      if (TR !== 'flip') inp.steer = 1;
      if (TR === 'spingrab' || TR === 'cork') inp.grab = a > 0.15;
      if (TR === 'cork') inp.cork = true;
      if (TR === 'flip') inp.forward = true;
    }
    const wasAir = s.airborne;
    s.update(dt, inp);
    t += dt;
    if (!wasAir && s.airborne && s.speed > 15) { at = t; y0 = s.y; rows.push('takeoff ' + (s.speed * 3.6).toFixed(0) + ' km/h'); }
    if (at >= 0 && s.airborne && Math.abs((t - at) * 10 - Math.round((t - at) * 10)) < dt * 5)
      rows.push(`${(t - at).toFixed(1)} spin ${(s.spin * 57.3).toFixed(0)} flip ${((s.flip ?? s.pitch ?? 0) * 57.3).toFixed(0)} h ${(s.y - y0).toFixed(1)} v ${(s.speed * 3.6).toFixed(0)}`);
    if (at >= 0 && wasAir && !s.airborne) { rows.push(`land ${(t - at).toFixed(2)} spin ${(s.spin * 57.3).toFixed(0)} ${s.notice || s.event || ''} out ${(s.speed * 3.6).toFixed(0)}`); done = true; }
  }
  return { rows, keys: keys.filter((k) => /spin|flip|pitch|rot|roll|yaw|cork|grab|trick/i.test(k)) };
})()
