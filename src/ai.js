// AI skiers drive the exact same physics as the player through the same
// controls (steer / tuck / brake / jump). Each has a style: racers attack
// gates, experts rip fast GS turns, cruisers and beginners make wide
// speed-controlling turns, park rats hunt the kickers and throw spins.
import { centerX, halfWidth, GATES, FINISH_Z, START_Z, heightAt, lineX, lineCurv, JUMPS, RAILS, PIPE, PARK } from './course.js';
import { wrapAngle } from './skier.js';
import { clamp, smoothstep } from './noise.js';

export const STYLES = {
  racer: { grip: [1.62, 1.85], speed: [99, 99], turnLen: 0, amp: 0, tuck: 1 },
  expert: { grip: [1.5, 1.7], speed: [21, 27], turnLen: [20, 26], amp: [0.28, 0.4], tuck: 0.5 },
  carver: { grip: [1.35, 1.55], speed: [15, 20], turnLen: [24, 32], amp: [0.38, 0.55], tuck: 0.2 },
  cruiser: { grip: [1.1, 1.3], speed: [10, 14], turnLen: [30, 40], amp: [0.5, 0.7], tuck: 0 },
  beginner: { grip: [0.9, 1.05], speed: [5.5, 8], turnLen: [38, 50], amp: [0.6, 0.8], tuck: 0 },
  park: { grip: [1.4, 1.6], speed: [14, 18], turnLen: [26, 32], amp: [0.3, 0.45], tuck: 0.3 },
};

const r = (rnd, v) => (Array.isArray(v) ? v[0] + rnd() * (v[1] - v[0]) : v);

export class AIController {
  constructor(skier, style, rnd, world) {
    this.s = skier;
    this.style = style;
    this.world = world;
    const S = STYLES[style];
    skier.grip = r(rnd, S.grip);
    this.targetSpeed = r(rnd, S.speed);
    this.turnLen = r(rnd, S.turnLen) || 25;
    this.amp = r(rnd, S.amp);
    this.tuckPref = S.tuck;
    this.bias = (rnd() - 0.5) * 0.6;
    this.phase = rnd() * Math.PI * 2;
    this.lastErr = 0;
    this.gate = 0;
    this.trick = null;
    this.rnd = rnd;
    this.skill = style === 'racer' ? 0.85 + rnd() * 0.15 : 0.7;
    this.finished = false;
    this.restTimer = 0;
    this.lastZ = skier.pos.z;
    this.wobble = rnd() * 10;
    this.lineBias = (rnd() - 0.5) * 4; // racers each hold their own line through the gates
    this.ampBoost = 1;
    // park riders each stick to a line: the jumps, the rails or the pipe
    this.line = style === 'park' ? (rnd() < 0.5 ? 'jumps' : rnd() < 0.5 ? 'rails' : 'pipe') : null;
    this.pipeSide = rnd() < 0.5 ? 1 : -1;
  }

  // where a park rider is heading, and how fast it wants to be going
  parkLine(z, tz, speed) {
    this.want = null; this.inPipe = false;
    const s = this.s;
    if (this.line === 'jumps') {
      for (const J of JUMPS) {
        if (J.lip < z - 1) continue;
        const dz = J.z - z;
        if (dz > 90) break;
        this.want = J.speed + (this.skill - 0.7) * 1.5;
        const lipX = centerX(J.lip) + J.dx;
        if (z > J.z - 4 && !this.trick) {
          const spins = [Math.PI * 2, Math.PI * 3, Math.PI * 2, Math.PI, Math.PI * 4, 0];
          this.trick = { spin: spins[Math.floor(this.rnd() * spins.length)], dir: this.rnd() < 0.5 ? 1 : -1, grab: this.rnd() < 0.7, grabEnd: 0.5 + this.rnd() * 0.5 };
          if (J.name === 'Small') this.trick.spin = Math.min(this.trick.spin, Math.PI * 2);
        }
        return { tx: lipX, tz: Math.max(J.lip, z + 6) };
      }
    } else if (this.line === 'rails') {
      for (const R of RAILS) {
        if (R.a.z + R.L < z - 1) continue;
        const dz = R.a.z - z;
        if (dz > 70) break;
        this.want = R.kind === 'box' ? 7.5 : 8.5;
        if (dz > 0 && dz < 6) this.popOff = this.rnd() < 0.45;
        const along = Math.max(tz, R.a.z + 2);
        return { tx: R.a.x + R.dir.x * (along - R.a.z) / R.dir.z, tz: along };
      }
    } else if (this.line === 'pipe') {
      const ax = centerX(tz) + PIPE.dx;
      if (z < PIPE.z0 + 12) { this.want = 12; return { tx: ax + this.pipeSide * 2, tz }; }
      if (z < PIPE.z1 - 10) {
        this.inPipe = true;
        const spins = [Math.PI, Math.PI, Math.PI * 2, 0, Math.PI * 3];
        this.trick = { spin: spins[Math.floor(this.rnd() * spins.length)], dir: this.pipeSide, grab: this.rnd() < 0.6, grabEnd: 0.4 + this.rnd() * 0.4 };
        this.want = 13;
        // once a wall turns us back in, aim at the other one
        const off = s.pos.x - ax;
        if (Math.abs(off) > PIPE.flat + 0.3) this.pipeSide = -Math.sign(off);
        else if (Math.abs(s.vel.x) > 1.5) this.pipeSide = Math.sign(s.vel.x);
        // carve hard across the flat bottom into the next wall
        return { tx: ax + this.pipeSide * (PIPE.flat + 6), tz: z + 4 };
      }
    }
    return null;
  }

  laneAt(z) {
    return this.bias + this.amp * this.ampBoost * Math.sin(this.phase + ((z - this.lastZ) / this.turnLen) * Math.PI);
  }

  update(dt, others) {
    const s = this.s, c = s.controls;
    if (s.crash > 0) { c.steer = 0; c.tuck = 0; c.brake = 0; c.jump = false; return; }
    // on a rail: catch the balance, sometimes pop a spin off the end
    if (s.grind) {
      const g = s.grind;
      c.steer = clamp(g.bal * 2.6 + Math.sin(this.wobble * 5) * (1 - this.skill) * 0.4, -1, 1);
      c.tuck = 0; c.brake = 0; c.grab = false; c.flip = 0;
      c.jump = g.s > g.R.L - 1.2 && this.popOff;
      if (c.jump && !this.trick) this.trick = { spin: Math.PI, dir: this.rnd() < 0.5 ? 1 : -1, grab: false, grabEnd: 0 };
      return;
    }
    const speed = s.speed;
    const x = s.pos.x, z = s.pos.z;
    // turn phase advances with distance travelled down the hill
    this.phase += ((z - this.lastZ) / this.turnLen) * Math.PI;
    this.lastZ = z;
    this.wobble += dt;

    // in the air: tricks for the park crowd, otherwise stay neutral
    if (!s.onGround) {
      c.brake = 0; c.jump = false;
      if (this.trick) {
        c.steer = Math.abs(s.spin) < this.trick.spin - 0.35 ? this.trick.dir : 0;
        c.grab = this.trick.grab && s.airTime > 0.15 && s.airTime < this.trick.grabEnd;
        c.flip = 0;
      } else { c.steer = 0; c.grab = false; c.flip = 0; }
      return;
    }
    this.trick = null; c.grab = false; c.flip = 0;
    this.want = null; this.inPipe = false;

    // finished: slow down and stop in the village
    if (z > FINISH_Z + 8) {
      this.finished = true;
      c.steer = clamp(-wrapAngle(Math.atan2(centerX(z + 10) + this.bias * 30 - x, 10) - s.heading) * 1.5, -1, 1);
      c.tuck = 0; c.brake = speed > 1.5 ? 1 : 0;
      if (speed < 1.5) this.restTimer += dt;
      return;
    }

    const over = speed - this.targetSpeed;
    this.ampBoost = 1 + clamp(over / 5, 0, 1.2);
    const L = clamp(speed * 1.05, 7, 28);
    let tz = z + L;
    const hw = halfWidth(tz);
    let tx;

    let speedCap = Infinity;
    if (this.style === 'racer' && this.world.race) {
      // pure pursuit along the racing line, with a little rhythm error per racer
      const err = Math.sin(this.wobble * 0.9) * (1 - this.skill) * 2.5;
      tx = lineX(tz) + err;
      // speed check: the tightest bend in the next couple of seconds sets the limit
      let kmax = 0;
      for (let d = 4; d < speed * 2.2 + 10; d += 3) kmax = Math.max(kmax, lineCurv(z + d));
      if (kmax > 1e-4) speedCap = Math.sqrt((s.grip * 9.81 * (0.62 + this.skill * 0.25)) / kmax);
    } else {
      tx = centerX(tz) + hw * clamp(this.laneAt(tz), -0.85, 0.85);
      // park rats ride their line
      if (this.style === 'park' && z > PARK.z0 - 80 && z < PARK.z1) {
        const r = this.parkLine(z, tz, speed);
        if (r) { tx = r.tx; tz = r.tz; }
      }
    }

    // avoid other skiers ahead (and alongside: elbows out in the pack)
    let avoid = 0;
    for (const o of others) {
      if (o === s) continue;
      const dz = o.pos.z - z;
      if (dz < -2 || dz > L + 10) continue;
      const dx = o.pos.x - x;
      if (Math.abs(dx) > 9) continue;
      const closing = speed - o.speed * 0.9;
      if (closing <= 0 && dz > 3) continue;
      // which side to pass: away from the other, toward the piste centre if tied
      const side = Math.abs(dx) < 0.5 ? Math.sign(centerX(z) - x) || 1 : -Math.sign(dx);
      const push = (4.5 - Math.abs(dx)) * smoothstep(L + 10, 0, dz);
      if (push > 0) avoid += side * push * 1.4;
    }
    tx += avoid;
    // stay inside the piste
    const c0 = centerX(tz), h0 = halfWidth(tz);
    tx = clamp(tx, c0 - h0 * 0.9, c0 + h0 * 0.9);

    // steering: racers track the line Stanley-style (tangent + cross-track),
    // everyone else steers at a pursuit point
    let want = Math.atan2(tx - x, Math.max(tz - z, 2));
    if (this.style === 'racer' && this.world.race && z < FINISH_Z) {
      const za = z + speed * 0.28;
      const slope = (lineX(za + 1.5) - lineX(za - 1.5)) / 3;
      // close to a gate the gate wins over elbowing
      while (this.gate < GATES.length && GATES[this.gate].z < z) this.gate++;
      const toGate = this.gate < GATES.length ? GATES[this.gate].z - z : 99;
      const e = clamp(avoid, -3, 3) * 0.7 * smoothstep(3, 26, toGate) + lineX(z + 0.5) + this.lineBias * smoothstep(START_Z, START_Z + 120, z) * Math.min(1, halfWidth(z + 40) / 55) + Math.sin(this.wobble * 0.9) * (1 - this.skill) * 2 - x;
      want = Math.atan(slope) + Math.atan((1.6 * e) / (speed + 3));
    }
    const err = wrapAngle(want - s.heading);
    const dErr = (err - this.lastErr) / Math.max(dt, 1e-3);
    this.lastErr = err;
    c.steer = clamp(-(err * 2.4 + dErr * 0.18), -1, 1);

    // speed: racers tuck the straights, recreational skiers skid when too fast
    const straight = Math.abs(c.steer) < 0.3;
    c.tuck = 0;
    if (this.style === 'racer') c.tuck = straight && this.world.raceStarted && speed < speedCap - 2 ? 1 : 0;
    else if (this.tuckPref > 0 && straight && over < -3) c.tuck = this.rnd() < this.tuckPref ? 1 : c.tuck;
    if (speed < 4) c.tuck = 1; // skate on the flats
    c.brake = 0;
    if (this.style === 'racer' && speed > speedCap + 1.5) c.brake = clamp((speed - speedCap) / 8, 0.15, 0.7);
    if (this.style !== 'racer') {
      if (over > 5) c.brake = clamp((over - 5) / 6, 0, 0.8);
      if (this.style === 'beginner' && over > 0) c.brake = clamp(over / 3, 0.3, 1);
    }
    c.jump = false;
    // park lines hold the speed their next feature wants
    if (this.want != null) {
      const d = speed - this.want;
      c.brake = d > 0.6 ? clamp(d / 3, 0.2, 0.9) : 0;
      c.tuck = d < -1 ? 1 : 0;
      if (this.inPipe) { c.brake = 0; c.tuck = speed < 13 ? 1 : 0; }
    }
    if (this.world.race && !this.world.raceStarted) { c.steer = 0; c.tuck = 0; c.brake = 1; }
  }
}
