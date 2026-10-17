// AI skiers drive the exact same physics as the player through the same
// controls (steer / tuck / brake / jump). Each has a style: racers attack
// gates, experts rip fast GS turns, cruisers and beginners make wide
// speed-controlling turns, park rats hunt the kickers and throw spins.
import { centerX, halfWidth, GATES, KICKERS, FINISH_Z, START_Z, heightAt, lineX, lineCurv } from './course.js';
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
  }

  laneAt(z) {
    return this.bias + this.amp * this.ampBoost * Math.sin(this.phase + ((z - this.lastZ) / this.turnLen) * Math.PI);
  }

  update(dt, others) {
    const s = this.s, c = s.controls;
    if (s.crash > 0) { c.steer = 0; c.tuck = 0; c.brake = 0; c.jump = false; return; }
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
      // park rats line up the kickers
      if (this.style === 'park') {
        for (const k of KICKERS) {
          if (k.kind !== 'park') continue;
          const dz = k.z - z;
          if (dz > -2 && dz < 70) {
            tx = k.x; tz = Math.max(k.z, z + 6);
            if (dz < 1.2 && dz > -1 && !this.trick) {
              const spins = [Math.PI * 2, Math.PI * 3, Math.PI * 2, Math.PI, 0];
              this.trick = { spin: spins[Math.floor(this.rnd() * spins.length)], dir: this.rnd() < 0.5 ? 1 : -1, grab: this.rnd() < 0.6, grabEnd: 0.6 + this.rnd() * 0.4 };
            }
            break;
          }
        }
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
    // park: pop off the lip
    c.jump = false;
    if (this.style === 'park') {
      for (const k of KICKERS) {
        const dz = k.z - z;
        if (k.kind === 'park' && dz > 0.2 && dz < 2.2 && Math.abs(x - k.x) < k.w / 2) c.jump = true;
      }
    }
    if (this.world.race && !this.world.raceStarted) { c.steer = 0; c.tuck = 0; c.brake = 1; }
  }
}
