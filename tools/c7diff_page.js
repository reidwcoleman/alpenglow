async (only) => {
  const m = await import('/_next/static/chunks/' + window.__CHUNK);
  const N = m[window.__NS || 'Q'], REF = N.SkiSimulation;
  const H = N.terrainHeight;
  // (the snow's own queries are the terrain's, not the physics': taken straight from the reference)
  const ride = (N.RAILS || []).filter((r) => r.entry === 'ride');
  // (our rails are all ridden onto: the reference's popped ones are taken out of its list)
  if (N.RAILS) { N.RAILS.length = 0; N.RAILS.push(...ride); }
  // (the reference's own split kickers go in as two lanes, with the gap between them: it keeps that list to itself)
  const lanes = N.JUMPS.flatMap((J) => (window.__SPLIT ?? []).includes(J.name) ? [-1, 1].map((m) => ({ ...J, lane: true, width: (J.width - 6) / 2, offset: J.offset + (m * (J.width + 6)) / 4 })) : [J]);
  const S = {
    h: (x, z) => H(x, z), maxSpeed: window.__VMAX, classic: (window.__NS === 'w'), bounds: window.__NS === 'dt' ? 126 : undefined, snowWalls: window.__WALLS, zMin: -22, zMax: N.COURSE_LENGTH + (window.__ZEND ?? 0),
    center: N.center, centerSlope: (z) => (N.center(z + 1) - N.center(z - 1)) / 2,
    grade: (x, z, hd) => N.snowGrade(x, z, hd),
    frame(x, z, hd, out, grind) { const f = N.riderSurface(x, z, hd, grind); out.slope = f.slope; out.cross = f.crossSlope; return out; },
    deep: (x, z) => (N.lineDistance ? N.lineDistance(x, z) : Math.abs(x - N.center(z))) > 24 && N.parkGrooming(x, z) < .5,
    kickersNear: () => lanes, kickerCenter: (J, z) => J.lane ? N.center(z) + J.offset : N.jumpCenter(J, z),
    onRunIn: (x, z) => N.JUMPS.some((J) => z >= J.z - J.run && z <= J.z && Math.abs(x - N.jumpCenter(J, z)) < J.width / 2),
    railsNear: () => ride,
    railProj(R, x, z, o) { const f = N.railFrame(R, x, z); o.t = f.t; o.side = f.side; return o; },
    railTop: (R, t) => N.railTop(R, t), railPoint(R, t, o) { const p = N.railPoint(R, t); o.x = p.x; o.z = p.z; return o; }, railYaw: (R) => N.railHeading(R),
  };
  const blank = () => ({ steer: 0, forward: false, brake: false, jump: false, grab: false, board: false, airRoll: 0, cork: false, over: false, butter: false });
  const main = [...N.JUMPS].sort((a, b) => a.z - b.z);
  // each scenario: keys as a function of (reference state, time)
  const line = (s) => {
    const J = main.find((j) => j.z > s.z - 1), look = Math.max(8, s.speed * .9), tz = s.z + look;
    const tx = J && tz > J.z - J.run - 40 && tz <= J.z ? N.jumpCenter(J, Math.min(tz, J.z)) : N.center(tz);
    const want = Math.atan2(tx - s.x, look), err = Math.atan2(Math.sin(want - s.travelHeading), Math.cos(want - s.travelHeading));
    return Math.max(-1, Math.min(1, err * 3));
  };
  const SC = {
    straight: { T: 40, keys: (s, t, k) => { k.steer = s.airborne ? 0 : line(s); } },
    tuck: { T: 40, keys: (s, t, k) => { k.steer = s.airborne ? 0 : line(s); k.forward = !s.airborne; } },
    carve: { T: 30, keys: (s, t, k) => { if (t < 11) { k.forward = true; k.steer = s.airborne ? 0 : line(s); return; } k.steer = s.airborne ? 0 : Math.sin(t * 1.3) > 0 ? 1 : -1; } },
    tight: { T: 26, keys: (s, t, k) => { if (t < 11) { k.forward = true; k.steer = s.airborne ? 0 : line(s); return; } k.steer = s.airborne ? 0 : t % 1.2 < .6 ? 1 : -1; k.forward = !s.airborne && t % 4 < 1; } },
    brake: { T: 26, keys: (s, t, k) => { if (t < 11) { k.forward = true; k.steer = s.airborne ? 0 : line(s); return; } k.steer = s.airborne ? 0 : t % 5 < 2 ? 1 : line(s); k.brake = !s.airborne && (t % 6) > 3; } },
    ollie: { T: 25, keys: (s, t, k) => { k.steer = s.airborne ? 0 : line(s); k.jump = !s.airborne && (t % 3) < 0.8; } },
    spin: { T: 40, keys: (s, t, k) => { k.steer = s.airborne ? (s.airTime < .7 ? 1 : 0) : line(s); } },
    flip: { T: 40, keys: (s, t, k) => { k.steer = s.airborne ? 0 : line(s); k.brake = s.airborne && s.airTime < .8; } },
    cork: { T: 40, keys: (s, t, k) => { k.steer = s.airborne ? (s.airTime < .9 ? 1 : 0) : line(s); k.brake = s.airborne && s.airTime < .9; k.cork = s.airborne && s.airTime < .9; } },
    grab: { T: 40, keys: (s, t, k) => { k.steer = s.airborne ? (s.airTime < .6 ? -1 : 0) : line(s); k.grab = s.airborne && s.airTime > .1 && s.airTime < .9; } },
    sw180: { T: 40, keys: (s, t, k) => { k.steer = s.airborne ? (s.airTime < .38 ? 1 : 0) : line(s); k.forward = !s.airborne && s.switchStance; } },
    bail: { T: 40, keys: (s, t, k) => { k.steer = s.airborne ? 0 : line(s); k.forward = s.airborne; } },
    misty: { T: 40, keys: (s, t, k) => { k.steer = s.airborne ? (s.airTime < .9 ? -1 : 0) : line(s); k.forward = s.airborne && s.airTime < .9; k.cork = s.airborne && s.airTime < .9; k.over = k.cork; } },
    charge: { T: 25, keys: (s, t, k) => { k.steer = s.airborne ? 0 : line(s); k.jump = !s.airborne && (t % 4) < 1.2; } },
    butter: { T: 26, keys: (s, t, k) => { if (t < 9) { k.forward = true; k.steer = s.airborne ? 0 : line(s); return; } k.butter = t % 4 < 2; k.steer = t % 4 < 2 ? (t % 8 < 4 ? 1 : -1) : line(s); } },
    butterpop: { T: 26, keys: (s, t, k) => { if (t < 9) { k.forward = true; k.steer = s.airborne ? 0 : line(s); return; } k.butter = t % 5 < 1.6; k.jump = t % 5 > .7 && t % 5 < 1.6; k.steer = k.butter ? 1 : line(s); } },
    butterland: { T: 25, keys: (s, t, k) => { k.steer = s.airborne ? 0 : line(s); k.jump = !s.airborne && t % 3 < .5; k.butter = s.airborne && s.vy < 0; } },
    roll: { T: 40, keys: (s, t, k) => { k.steer = s.airborne ? 0 : line(s); k.airRoll = s.airborne && s.airTime < .7 ? 1 : 0; } },
  };
  // onto a straight bar, from 30 m up its run-in, off the end
  const R0 = ride.find((r) => !r.follow && r.profile !== 'kink' && Math.abs(r.angle ?? 0) < .01 && r.length > 10);
  const railStart = (off) => (a) => {
    const yaw = N.railHeading(R0), p = N.railPoint(R0, -30 / R0.length), hd = yaw + (off || 0);
    a.x = p.x + Math.cos(yaw) * .6; a.z = p.z - Math.sin(yaw) * .6; a.y = H(a.x, a.z); a.heading = a.travelHeading = hd; a.speed = 16; a.velocityX = Math.sin(hd) * 16; a.velocityZ = Math.cos(hd) * 16;
  };
  if (R0) Object.assign(SC, {
    rail: { T: 9, start: railStart(0), keys: () => {} },
    railswap: { T: 9, start: railStart(0), keys: (s, t, k) => { k.steer = s.grind && s.railT > .2 && s.railT < .35 ? 1 : 0; } },
    railpop: { T: 9, start: railStart(0), keys: (s, t, k) => { k.jump = s.grind && s.railT > .3 && s.railT < .55; } },
  });
  const dt = 1 / 60, rows = [];
  for (const name of Object.keys(SC)) {
    if (only !== 'all' && only !== name) continue;
    const sc = SC[name], a = new REF(); a.phase = 'skiing'; a.arrive?.();
    if (sc.start) sc.start(a);
    const b = new RS.RideSim(S);
    b.place(a.x, a.z, a.heading, a.speed); b.y = a.y;
    let t = 0, worst = { pos: 0, sp: 0, hd: 0, q: 0, at: 0 }, first = null, air = 0, lands = 0, crash = 0;
    while (t < sc.T && a.phase === 'skiing') {
      const k = blank(); sc.keys(a, t, k); if (!sc.start && !a.airborne && a.speed < 14 && t < 11) { k.forward = true; k.steer = line(a); }
      a.update(dt, k); b.update(dt, k); t += dt;
      if (a.crashTime > 0 !== b.crashTime > 0 || Math.abs(a.crashTime - b.crashTime) > 1e-6) first ??= { t: +t.toFixed(2), why: 'crash', a: [a.crashTime, a.landingImpact], b: [b.crashTime, b.landingImpact] };
      if (a.crashTime > 0 && b.crashTime > 0) { crash++; for (const n of Object.keys(a.ragdoll.nodes)) worst.body = Math.max(worst.body ?? 0, a.ragdoll.nodes[n].p.distanceTo(b.body.nodes[n].p)); }
      const dp = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), ds = Math.abs(a.speed - b.speed), dh = Math.abs(Math.atan2(Math.sin(a.heading - b.heading), Math.cos(a.heading - b.heading)));
      const qa = a.airOrientation, qb = b.q, dq = a.airborne ? 2 * Math.acos(Math.min(1, Math.abs(qa.x * qb.x + qa.y * qb.y + qa.z * qb.z + qa.w * qb.w))) : 0;
      if (a.airborne) air++;
      if (a.event === 'land') lands++;
      if (dp > worst.pos) worst.at = +t.toFixed(2);
      worst.pos = Math.max(worst.pos, dp); worst.sp = Math.max(worst.sp, ds); worst.hd = Math.max(worst.hd, dh); worst.q = Math.max(worst.q, dq);
      if (!first && (dp > 0.01 || ds > 0.01 || dh > 0.001 || dq > 0.002 || a.airborne !== b.airborne)) first = { t: +t.toFixed(2), z: +a.z.toFixed(1), air: [a.airborne, b.airborne], pos: +dp.toFixed(4), sp: [+a.speed.toFixed(3), +b.speed.toFixed(3)], y: [+a.y.toFixed(3), +b.y.toFixed(3)], vy: [+a.vy.toFixed(3), +b.vy.toFixed(3)], hd: +dh.toFixed(4), q: +dq.toFixed(4) };
    }
    rows.push(`${name.padEnd(9)} crashframes ${crash} ragdoll ${(worst.body ?? 0).toFixed(4)} rail ${b.railTime.toFixed(2)}/${a.railTime.toFixed(2)} t ${t.toFixed(1).padStart(5)} z ${a.z.toFixed(0).padStart(5)} airframes ${String(air).padStart(4)} lands ${lands} | worst pos ${worst.pos.toFixed(4)} m speed ${worst.sp.toFixed(4)} heading ${worst.hd.toFixed(5)} body ${worst.q.toFixed(4)}${first ? '\n   first: ' + JSON.stringify(first) : ''}`);
  }
  return rows.join('\n');
}
