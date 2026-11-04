// Cork7's own sim through one trick: node tools/c7sim.mjs tools/c7trick.js, with window.__TRICK
// ('spin' | 'spingrab' | 'flip' | 'cork') and window.__HOLD (seconds the keys are held from the lip).
// Rides the line to the first main kicker hands-off, then logs the air every 0.1 s.
// (the chunk's name changes when Cork7 ships: take the new one from cork7.com's page source;
// the course for the park in the URL is the module's export C)
(async () => {
  const m = await import('/_next/static/chunks/active-course-Ba0pC6nu.js');
  const NS = m.C, S = NS.SkiSimulation, center = NS.center, JUMPS = NS.JUMPS, jumpCenter = NS.jumpCenter;
  const TR = window.__TRICK || 'spin', HOLD = window.__HOLD ?? 0.6;
  const s = new S();
  s.phase = 'skiing';
  const dt = 1 / 60, rows = [];
  let t = 0, at = -1, y0 = 0, done = false;
  const main = JUMPS.filter((j) => j.main).sort((a, b) => a.z - b.z);
  while (t < 200 && s.phase === 'skiing' && !done) {
    const J = main.find((j) => j.z > s.z - 1);
    const look = Math.max(8, s.speed * 0.9), tz = s.z + look;
    const tx = J && tz > J.z - J.run - 40 && tz <= J.z ? jumpCenter(J, Math.min(tz, J.z)) : center(tz);
    const want = Math.atan2(tx - s.x, look);
    const err = Math.atan2(Math.sin(want - s.travelHeading), Math.cos(want - s.travelHeading));
    const inp = { steer: s.airborne ? 0 : Math.max(-1, Math.min(1, err * 3)), forward: false, brake: false, jump: false, grab: false, board: false, airRoll: 0, cork: false, over: false, butter: false };
    if (s.airborne && at >= 0 && t - at < HOLD) {
      if (TR !== 'flip') inp.steer = 1;
      if (TR === 'spingrab') inp.grab = true;
      if (TR === 'flip' || TR === 'cork') inp.brake = true;
      if (TR === 'cork') inp.cork = true;
    }
    const wasAir = s.airborne;
    s.update(dt, inp);
    t += dt;
    if (!wasAir && s.airborne && s.speed > 15) { at = t; y0 = s.y; rows.push(`takeoff ${(s.speed * 3.6).toFixed(0)} km/h vy ${s.vy.toFixed(1)}`); }
    if (at >= 0 && s.airborne && Math.abs((t - at) * 10 - Math.round((t - at) * 10)) < dt * 5)
      rows.push(`${(t - at).toFixed(1)} as ${s.landingAssist.velocity.length().toFixed(2)} L${+s.landingAssist.locked} ty${(s.landingAssist.yaw*57.3).toFixed(0)} rs${s.airRotation.speed.toFixed(2)} spinv ${s.spinVelocity.toFixed(2)} yaw ${(s.airRotation.landingYaw * 57.3).toFixed(0)} up ${s.airRotation.upright.toFixed(2)} inv ${s.airRotation.inversions} h ${(s.y - y0).toFixed(1)}`);
    if (at >= 0 && wasAir && !s.airborne) { rows.push(`land ${(t - at).toFixed(2)} ${s.notice || s.event || ''} out ${(s.speed * 3.6).toFixed(0)}`); done = true; }
  }
  return rows.join('\n');
})()
