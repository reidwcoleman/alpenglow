// Ski physics shared by the player and every AI. Gravity, snow friction,
// air drag (upright vs tuck), edge grip that bends the velocity through a
// carve and turns into a speed-scrubbing skid past its limit, ballistic
// airtime off any crest or kicker, and crashes on bad landings or impacts.
import * as THREE from 'three';
import { heightAt, normalAt, centerX, halfWidth, centerSlope, surfaceAt, RAILS, railAt, PIPE, pipeWalls, FINISH_Z, JUMPS } from './course.js';
import { SkierModel, BOARD_NAME } from './skiermodel.js';
import { clamp, smoothstep } from './noise.js';

const GRAV = 9.81;
const UP = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3(), _f = new THREE.Vector3(), _s = new THREE.Vector3(), _a = new THREE.Vector3();
const _t = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const near = [];
const _r = { s: 0, lat: 0, y: 0, slope: 0 };

// where (x, z) sits in the halfpipe: signed offset from its axis, or null outside it
function pipeAt(x, z) {
  if (z < PIPE.z0 + 8 || z > PIPE.z1 - 6) return null;
  const off = x - centerX(z) - PIPE.dx;
  if (Math.abs(off) > PIPE.flat + PIPE.lip + 0.6 || pipeWalls(z) < 0.6) return null;
  return off;
}

export function wrapAngle(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

const EDGE_MAX = 1.15; // ~66 degrees of edge angle at full input
const RHO = 1.0; // air density at ~2000 m
const TAU = Math.PI * 2;

// Off-axis tricks: the flip turns about the body's side axis tilted toward its nose
// (a: how far), over the leading shoulder for the way it spins.
const TRICKS = {
  backflip: { a: 0, rate: 5.6, back: true }, frontflip: { a: 0, rate: 5.6 },
  cork: { a: 0.8, rate: 4.0, back: true }, bio: { a: 0.8, rate: 4.0 },
  rodeo: { a: 0.42, rate: 4.4, back: true }, misty: { a: 0.42, rate: 4.4 },
  sideflip: { roll: true, rate: 5.0 }, flatspin: { roll: true, rate: 4.2 },
};

export class Skier {
  constructor(world, opts) {
    this.world = world;
    this.name = opts.name ?? 'Skier';
    this.isPlayer = !!opts.isPlayer;
    this.board = !!opts.outfit?.board; // a snowboard instead of skis
    this.grip = opts.grip ?? 1.45; // peak edge grip, in g
    // sidecut radius, m: a snowboard's is about half a ski's, so it turns much tighter
    this.sidecut = this.board ? Math.min(opts.sidecut ?? 7.5, 8) : opts.sidecut ?? 16;
    this.mass = 80;
    this.model = new SkierModel(opts.outfit, opts.bib ?? 0);
    world.scene.add(this.model.group);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.avgHeading = 0;
    this.edge = 0;
    this.normal = new THREE.Vector3(0, 1, 0);
    this.controls = { steer: 0, tuck: 0, brake: 0, jump: false, grab: false, grabKind: null, flip: 0, roll: 0, up: false, down: false, butter: false };
    this.trickType = null; this.flipAxis = new THREE.Vector3(1, 0, 0); this.flipDir = 0; this.grabs = {};
    this.butter = null; this.butterCool = 0;
    this.spinVel = 0; this.perfectPop = false; this.offKicker = false; this.sinkV = 0;
    this.shiftyT = 0; this.daffyT = 0; this.assist = null; this.tLand = 9; this.landProbe = 0;
    this.shiftyS = 0; this.daffyS = 0; this.flailT = 0; this.spring = 0; this.springV = 0;
    this.surf = { powder: 0, ice: 0 };
    this.onGround = true;
    this.airTime = 0;
    this.spin = 0; this.pitch = 0; this.flipAcc = 0; this.grabTime = 0;
    this.crash = 0; this.crashPhase = null; this.crashT = 0;
    this.tumble = 0; this.tumbleAxis = new THREE.Vector3(1, 0, 0); this.lie = 0;
    this.lean = 0; this.latAcc = 0; this.skid = 0; this.skidYaw = 0; this.compress = 0;
    this.gload = 1; this.draft = 0; this.draftT = 0; this.scrape = 0;
    this.skatePhase = 0; this.skating = 0;
    this.polePlant = 0; this.poleSide = 1; this.lastLeanSign = 0;
    this.trackDist = 0;
    this.stuck = 0;
    this.jumpCharge = 0;
    this.time = Math.random() * 10;
    this.listeners = {};
    this.trackSlot = world.tracks ? world.tracks.alloc() : null;
    this.maxAirY = 0;
    this.grind = null; this.grindCool = 0;
    this.pipeAir = false; this.takeoffY = 0; this.maxY = 0; this.takeoffSwitch = false;
  }

  on(evt, fn) { (this.listeners[evt] ??= []).push(fn); }
  emit(evt, data) { for (const fn of this.listeners[evt] ?? []) fn(data); }

  get speed() { return this.vel.length(); }
  // only the player rides switch on skis (the computer riders always turn round)
  get canSwitch() { return this.isPlayer && !this.board && !this.ai; }

  place(x, z, heading = null, speed = 0) {
    this.pos.set(x, heightAt(x, z), z);
    const h = heading ?? Math.atan2(centerSlope(z), 1);
    this.heading = h; this.avgHeading = h;
    normalAt(x, z, this.normal);
    this.forward(_f);
    this.vel.copy(_f).multiplyScalar(speed);
    this.onGround = true; this.airTime = 0;
    if (this.crash > 0) this.endCrash();
    this.spin = 0; this.pitch = 0; this.flipAcc = 0; this.trickType = null; this.flipAxis.set(1, 0, 0); this.butter = null;
    this.stuck = 0; this.lean = 0; this.skid = 0; this.edge = 0; this.gload = 1;
    this.grind = null; this.pipeAir = false; this.jumpCharge = 0;
    if (this.trackSlot) this.trackSlot.break();
  }

  // ski direction projected onto the slope
  forward(out) {
    out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    out.addScaledVector(this.normal, -out.dot(this.normal)).normalize();
    return out;
  }

  respawn() {
    const z = Math.max(this.pos.z - 6, 20);
    const hw = halfWidth(z);
    const x = centerX(z) + clamp(this.pos.x - centerX(z), -hw * 0.55, hw * 0.55);
    const dir = Math.atan2(centerSlope(z), 1);
    this.place(x, z, dir, 3);
    this.emit('respawn');
  }

  step(dt) {
    this.time += dt;
    const c = this.controls;
    if (this.crash > 0) return this.stepCrash(dt);
    this.grindCool = Math.max(0, this.grindCool - dt);
    if (this.grind) return this.stepGrind(dt, c);
    if (this.onGround) this.stepGround(dt, c); else this.stepAir(dt, c);
    if (!this.grind && this.crash <= 0) this.tryGrind();
    this.collide();
    this.netIn = Math.max(0, (this.netIn ?? 0) - dt);
    this.nets(dt);
  }

  // the course is netted on both sides: ride into it and it gives, catches you and throws you
  // back in (hit it hard and you go down in it). The finish straight has solid boards instead.
  nets(dt) {
    const z = this.pos.z;
    if (z < 60 || z > FINISH_Z + 60) return;
    const boards = z > FINISH_Z - 250;
    const c = centerX(z), lim = boards ? halfWidth(z) * (z < FINISH_Z ? 0.92 : 1) + 1.7 : halfWidth(z) + 2.6;
    const dx = this.pos.x - c;
    if (Math.abs(dx) < lim) return;
    const sg = Math.sign(dx);
    const cs = centerSlope(z), il = 1 / Math.hypot(1, cs);
    const nx = sg * il, nz = -sg * cs * il; // outward, across the piste
    const pen = (Math.abs(dx) - lim) * il;
    const out = this.vel.x * nx + this.vel.z * nz;
    if (boards) {
      // boards don't give: bounce off them
      this.pos.x -= nx * pen; this.pos.z -= nz * pen;
      if (out > 0) {
        this.vel.x -= nx * out * 1.3; this.vel.z -= nz * out * 1.3;
        if (out > 4) this.emit('impact', { kind: 'boards', x: this.pos.x, z: this.pos.z, speed: out });
        if (out > 10 && this.crash <= 0) this.startCrash('boards');
      }
      return;
    }
    // the net stretches about a metre before it's tight
    const MAX = 1.1;
    if (pen > MAX) { this.pos.x -= nx * (pen - MAX); this.pos.z -= nz * (pen - MAX); }
    const k = 70, damp = out > 0 ? 7 : 2;
    const push = (k * Math.min(pen, MAX) + damp * out) * dt;
    this.vel.x -= nx * push; this.vel.z -= nz * push;
    // the mesh drags along you a little
    this.vel.multiplyScalar(1 - Math.min(0.6, pen) * 0.5 * dt);
    if (pen > MAX - 0.05 && out > 0) { this.vel.x -= nx * out * 1.2; this.vel.z -= nz * out * 1.2; }
    this.world.netHit?.(sg, z, Math.min(pen, MAX) + 0.15);
    if (!this.netIn && out > 3) this.emit('impact', { kind: 'net', x: this.pos.x, z: this.pos.z, speed: out });
    this.netIn = 0.3;
    if (out > 12 && this.crash <= 0) this.startCrash('net');
  }

  // slipstream: a skier close ahead on our line cuts our drag
  updateDraft(dt) {
    this.draftT -= dt;
    if (this.draftT > 0) return;
    this.draftT = 0.1;
    let best = 0;
    const list = this.world.skiers;
    const sp = this.speed;
    if (list && sp > 12) {
      const dx = this.vel.x / sp, dz = this.vel.z / sp;
      for (const o of list) {
        if (o === this || o.crash > 0 || !o.onGround) continue;
        const rx = o.pos.x - this.pos.x, rz = o.pos.z - this.pos.z;
        const along = rx * dx + rz * dz;
        if (along < 1.5 || along > 16) continue;
        const lat = Math.abs(rx * dz - rz * dx);
        if (lat > 1.6) continue;
        best = Math.max(best, (1 - lat / 1.6) * (1 - (along - 1.5) / 14.5));
      }
    }
    this.draft = best;
  }

  stepGround(dt, c) {
    const v = this.vel, n = normalAt(this.pos.x, this.pos.z, this.normal);
    const speed = v.length();
    let { powder, ice } = surfaceAt(this.pos.x, this.pos.z, this.surf);
    // the day's snow: fresh powder on the piste, hard ice, sticky spring slush
    const W = this.world.snow;
    if (W) {
      powder = Math.min(1, powder + W.powder * (1 - powder * 0.5));
      ice = Math.min(1, ice + W.ice * (1 - powder));
      this.surf.powder = powder; this.surf.ice = ice;
    }

    // --- edging: skis roll onto edge progressively, release quicker ---
    const edgeT = clamp(c.steer, -1, 1) * EDGE_MAX * (1 - c.brake * 0.5);
    const rolling = Math.abs(edgeT) > Math.abs(this.edge) && Math.sign(edgeT) === Math.sign(this.edge || edgeT);
    const rate = rolling ? 3.2 : 5.5;
    this.edge += clamp(edgeT - this.edge, -rate * dt, rate * dt);
    const e = Math.abs(this.edge);
    // carved arc from the sidecut (R = Rsc / tan(edge)); rotary pivot when slow
    const carveRate = (speed * Math.tan(Math.min(e, 1.2))) / this.sidecut * (1 - powder * 0.35);
    const pivot = 2.3 * (1 - smoothstep(0, 10, speed)) * Math.abs(c.steer);
    const dir = Math.sign(this.edge || c.steer);
    this.heading += -dir * Math.max(carveRate, pivot) * (1 - c.brake * 0.3) * dt;
    this.avgHeading += wrapAngle(this.heading - this.avgHeading) * Math.min(1, dt / 1.1);
    // in the pipe the skis go where the speed goes: up a wall, over, and back down
    const inPipe = pipeAt(this.pos.x, this.pos.z);
    const onWall = inPipe !== null && Math.abs(inPipe) > PIPE.flat + 0.4;
    if (inPipe !== null && speed > 1.5) {
      const hv = Math.atan2(v.x, v.z);
      this.heading += wrapAngle(hv - this.heading) * Math.min(1, dt * (onWall ? 8 : 2.5 * (1 - Math.abs(c.steer))));
    }

    const f = this.forward(_f);
    const side = _s.crossVectors(n, f).normalize(); // skier's left
    // --- forces ---
    _a.set(0, -GRAV, 0);
    const N = GRAV * Math.max(n.y, 0.2);
    if (speed > 0.05) {
      // groomed ~0.045, ice glides, powder bogs down until the skis plane
      const mu = (0.045 * (1 - ice * 0.45) + powder * (0.11 - 0.055 * smoothstep(8, 22, speed)) * (this.board ? 0.7 : 1)) * (W?.mu ?? 1);
      _a.addScaledVector(v, -(mu * N) / speed);
      this.updateDraft(dt);
      // a snowboarder can't tuck as small as a skier: standing sideways is more frontal area
      const tk = this.board ? 0.62 : 1;
      const CdA = (this.world.arcade ? 0.44 - 0.26 * c.tuck * tk : 0.56 - 0.34 * c.tuck * tk) * (1 - this.draft * 0.38) + powder * (this.board ? 0.03 : 0.06);
      const k = (0.5 * RHO * CdA) / this.mass;
      _a.addScaledVector(v, -k * speed);
    }
    // skating stride to get going on the flats
    const vLong0 = v.dot(f);
    this.skating = c.tuck > 0.5 && vLong0 > -0.5 && vLong0 < 7 && c.brake < 0.1 && powder < 0.5 ? 1 : 0;
    if (this.skating) {
      this.skatePhase += dt * (5 + vLong0 * 0.4);
      const stroke = 0.55 + 0.9 * Math.max(0, Math.sin(this.skatePhase * 2));
      _a.addScaledVector(f, 2.5 * (1 - vLong0 / 7) * stroke);
    }
    // hockey stop / snowplough (weaker on ice)
    if (c.brake > 0 && speed > 0.1) {
      const b = c.brake * (0.55 * N + 0.004 * speed * speed) * (1 - ice * 0.45);
      _a.addScaledVector(v, -Math.min(b, speed / dt) / speed);
    }
    v.addScaledVector(_a, dt);

    // --- edge grip: bend velocity toward the ski, skid when it can't ---
    const vLat = v.dot(side);
    const edgeHold = 0.3 + 0.7 * smoothstep(0.03, 0.55, e); // flat skis drift
    let maxGrip = this.grip * N * edgeHold * (1 - ice * 0.55) * (1 - powder * 0.2) * (1 - c.brake * 0.6) * (W?.grip ?? 1);
    // a board holds a little less on its heel edge (regular stance: steering left)
    if (this.board && this.edge < 0) maxGrip *= 0.93;
    if (onWall) {
      maxGrip *= 0.12; // on a wall: let it fall back down
      // and riders pump the transition on the way down
      if (v.dot(n) <= 0 && Math.sign(v.x) !== Math.sign(inPipe) && speed > 2) v.multiplyScalar(1 + 0.3 * dt);
    }
    const need = -vLat / dt;
    const applied = clamp(need, -maxGrip, maxGrip);
    v.addScaledVector(side, applied * dt);
    const rem = Math.abs(vLat + applied * dt);
    this.latAcc = this.latAcc * 0.8 + applied * 0.2;
    // skidding scrubs speed (little on ice, a lot in powder)
    const skid = Math.min(rem, 6) * (onWall ? 0.08 : inPipe !== null ? 0.35 : 1);
    if (skid > 0.05) {
      const sp = v.length();
      const scrub = 0.9 * GRAV * 0.55 * (1 - ice * 0.5 + powder * 0.4);
      if (sp > 0.01) v.multiplyScalar(Math.max(0, sp - skid * scrub * dt) / sp);
    }
    this.skid = this.skid * 0.85 + (skid + c.brake * Math.min(speed, 12) * 0.25) * 0.15;
    this.scrape = this.scrape * 0.9 + ice * Math.min(1, this.skid / 1.5 + e * speed / 40) * 0.1;
    // going backwards: the computer riders turn round; the player can ride it out switch
    if (vLong0 < -1 && !this.canSwitch) this.heading += wrapAngle(Math.atan2(v.x, v.z) - this.heading) * dt * 2;
    this.skiSwitch = this.canSwitch && vLong0 < -0.5;
    // riding backwards the tails lead: a little less edge to hold a line with
    if (this.skiSwitch) this.edge *= 1 - dt * 0.6;

    // butters: press a ski end into the snow, pivot on it, spring out of it
    this.butterCool = Math.max(0, this.butterCool - dt);
    if (this.world.arcade) this.stepButter(dt, c, speed);

    // jump (ollie) on release
    if (c.jump) this.jumpCharge = Math.min(1, this.jumpCharge + dt * 2.5);
    let pop = 0;
    if (!c.jump && this.jumpCharge > 0) {
      // a real ollie is a metre or so: legs can add ~2-4 m/s, a little more timed off a lip
      pop = (this.world.arcade ? 2.2 : 2.0) + this.jumpCharge * (this.world.arcade ? 2.3 : 2.2);
      this.jumpCharge = 0;
      // timed at the lip, the legs' extension adds to the kicker's: a bigger pop
      if (this.world.arcade && this.lipAhead(-0.5, 2.6)) { pop *= 1.28; this.perfectPop = true; this.emit('pop', { perfect: true }); }
    }
    if (this.butterPop) { pop = Math.max(pop, this.butterPop); this.butterPop = 0; }
    // hop turn: a quick pop and a half turn, to ride the other way round
    if (this.turnReq && !this.butter) { pop = Math.max(pop, 3.3); this.turnArm = this.turnReq; this.jumpCharge = 0; }
    this.turnReq = 0;

    // integrate and follow the ground (leaving it over crests)
    this.pos.addScaledVector(v, dt);
    if (pop > 0) { v.addScaledVector(n, pop); this.pos.addScaledVector(n, 0.05); }
    const gy = heightAt(this.pos.x, this.pos.z);
    let gInst = 1;
    if (this.pos.y > gy + 0.03) {
      this.onGround = false; this.airTime = 0; this.spin = 0; this.pitch = 0; this.flipAcc = 0;
      this.trickType = null; this.flipAxis.set(1, 0, 0); this.flipDir = 0; this.grabs = {}; this.butter = null;
      this.grabTime = 0; this.maxAirY = this.pos.y - gy; this.takeoffZ = this.pos.z; this.popped = pop > 0;
      this.shiftyT = 0; this.daffyT = 0; this.assist = null; this.tLand = 9; this.landProbe = 0;
      this.offKicker = !!this.lipAhead(-1.6, 0.6);
      // an armed quick trick goes on a real jump, not every little hop
      this.auto = null;
      if (this.autoArm && this.flightTime() > 0.55) { this.auto = this.autoArm; this.autoArm = null; }
      if (this.turnArm) { this.auto = { spin: 180, dir: this.turnArm, turn: true }; this.turnArm = 0; }
      if (pop <= 0) this.perfectPop = false;
      // wound up on the way in: the spin starts already turning
      this.spinVel = this.world.arcade ? -c.steer * 7.4 * 0.7 * (Math.abs(c.steer) > 0.3 ? 1 : 0) : 0;
      this.fromRail = false;
      this.takeoffY = this.maxY = this.pos.y;
      this.takeoffSwitch = this.board ? !!this.boardSwitch : Math.abs(wrapAngle(this.heading - Math.atan2(v.x, v.z))) > Math.PI / 2 || !!this.switchStance;
      this.switchStance = false;
      this.pipeAir = false;
      // out over a pipe lip: the real wall is vertical, so the flight goes straight up and back in
      if (inPipe !== null && Math.abs(inPipe) > PIPE.flat + PIPE.amax - 0.8) {
        const sg = Math.sign(inPipe);
        const sl = centerSlope(this.pos.z), il = 1 / Math.hypot(1, sl);
        const ax = il, az = -sl * il; // across the pipe
        const out = (v.x * ax + v.z * az) * sg;
        if (out > -0.6) {
          v.x -= ax * sg * (out + 0.6); v.z -= az * sg * (out + 0.6);
          v.y = Math.sqrt(Math.max(0, v.y) ** 2 + out * out * 0.85);
        }
        this.pipeAir = true;
      }
      if (this.trackSlot) this.trackSlot.break();
      this.emit('takeoff', { pop: pop > 0 });
    } else {
      // the legs soak up whatever velocity the slope takes away: that's the g-load
      const below = gy - this.pos.y;
      this.pos.y = gy;
      normalAt(this.pos.x, this.pos.z, n);
      const vn = v.dot(n);
      if (vn < 0) { v.addScaledVector(n, -vn); gInst = n.y + -vn / dt / GRAV; }
      else gInst = n.y - Math.min(0.6, below * 0); // light over crests
    }
    this.gload += (clamp(gInst, 0, 4) - this.gload) * Math.min(1, dt * 9);

    // visual lean from lateral acceleration (inclination balances the turn)
    const leanT = clamp(Math.atan2(-this.latAcc, GRAV) * 0.9, -0.95, 0.95) * smoothstep(1.5, 6, speed);
    this.lean += (leanT - this.lean) * Math.min(1, dt * 10);
    const sgn = Math.sign(this.lean);
    if (Math.abs(this.lean) > 0.25 && sgn !== this.lastLeanSign) {
      this.lastLeanSign = sgn;
      this.polePlant = 1; this.poleSide = sgn > 0 ? -1 : 1; // inside hand
    }
    this.polePlant = Math.max(0, this.polePlant - dt * 3);
    const skidT = c.brake * (this.skidSide ?? 1) * 1.15;
    this.skidYaw += (skidT - this.skidYaw) * Math.min(1, dt * 7);
    if (c.brake === 0) this.skidSide = Math.sign(c.steer || this.lean || 1) * -1;
    this.compress = Math.max(0, this.compress - dt * 2.5);

    // ski tracks
    this.trackDist += speed * dt;
    if (this.trackSlot && this.trackDist > 0.45) {
      this.trackDist = 0;
      this.trackSlot.add(this.pos, this.forward(_t), n, this.skid, powder);
    }
    this.stuck = speed < 0.6 ? this.stuck + dt : 0;
    if (this.switchStance && (this.switchT += dt) > 4) this.switchStance = false;
  }

  stepAir(dt, c) {
    const v = this.vel;
    this.airTime += dt;
    this.gload = 0;
    this.edge *= 1 - Math.min(1, dt * 3);
    v.y -= GRAV * dt;
    const sp = v.length();
    const k = (0.5 * RHO * (0.6 - 0.2 * c.tuck)) / this.mass;
    v.addScaledVector(v, -k * sp * dt);
    // wind (a storm's gusts): drag toward the air's own velocity, felt most in the air
    const W = this.world.wind;
    if (W && W.s > 0) { v.x += W.x * W.s * k * 7 * dt; v.z += W.z * W.s * k * 7 * dt; }
    // a quick trick flies itself (sized to the air there is)
    if (this.auto && this.world.arcade && this.airTime > 0.05) this.autoTrick(dt, c);
    // spins (A/D) about the vertical; grabbing tucks you up and spins you faster
    const arc = this.world.arcade;
    let spinRate;
    if (arc) {
      // a late pop just off the lip still counts
      if (this.airTime < 0.22 && !this.popped && !c.jump && this.jumpCharge > 0) {
        v.y += (1.9 + this.jumpCharge * 2.0) * (this.offKicker ? 1.18 : 0.85);
        this.popped = true;
        if (this.offKicker) { this.perfectPop = true; this.emit('pop', { perfect: true, late: true }); }
        this.jumpCharge = 0;
      }
      if (this.airTime > 0.22) this.jumpCharge = 0;
      // the body has inertia: spins build up and wind down instead of switching on and off
      const maxR = 7.4 * (c.grab ? 1.12 : 1) * (this.popped ? 1.06 : 1);
      if (this.assist) { /* the landing assist has the rotation now */ }
      else if (Math.abs(c.steer) > 0.15) {
        const tgt = -Math.sign(c.steer) * maxR * Math.min(1, Math.abs(c.steer) * 1.2);
        this.spinVel += clamp(tgt - this.spinVel, -dt * 30, dt * 30);
      } else if (this.airTime > 0.08) {
        // let go: carry on to the next half turn if well past the last one, then stop on it
        const hor = Math.atan2(v.x, v.z);
        const f = (this.heading - hor) / Math.PI;
        const dir = Math.sign(this.spinVel);
        const tgtF = Math.abs(this.spinVel) < 0.5 ? Math.round(f) : dir > 0 ? Math.floor(f + 0.72) : Math.ceil(f - 0.72);
        const d = (tgtF - f) * Math.PI;
        const want = Math.sign(d) * Math.min(maxR, Math.sqrt(2 * 26 * Math.abs(d)));
        this.spinVel += clamp(want - this.spinVel, -dt * 45, dt * 45);
        if (Math.abs(d) < 0.004) this.spinVel = 0;
      }
      spinRate = this.assist ? 0 : this.spinVel;
    } else spinRate = -c.steer * 6.6;
    this.heading += spinRate * dt;
    this.spin += spinRate * dt;
    // flips (W front, S back) and rolls (arrows): the axis is set the moment one starts,
    // and spinning at that moment makes it off-axis (cork, bio, rodeo, misty, flatspin)
    const fIn = arc ? c.flip || 0 : c.flip, rIn = arc ? c.roll || 0 : 0;
    if (!this.trickType && !this.assist && this.airTime > 0.04 && (fIn || rIn)) {
      const spinning = Math.abs(c.steer) > 0.4 || Math.abs(this.spin) > 0.7;
      const sd = Math.sign(spinRate || this.spin || 1);
      let t;
      if (rIn) t = spinning ? 'flatspin' : 'sideflip';
      else if (spinning) t = c.up ? (fIn < 0 ? 'rodeo' : 'misty') : (fIn < 0 ? 'cork' : 'bio');
      else t = fIn < 0 ? 'backflip' : 'frontflip';
      const T = TRICKS[t];
      this.trickType = t;
      this.flipDir = rIn ? rIn : fIn;
      if (T.roll) this.flipAxis.set(0, 0, 1);
      else this.flipAxis.set(Math.cos(T.a), 0, Math.sin(T.a) * sd * (fIn < 0 ? 1 : -1)).normalize();
    }
    if (this.trickType && this.airTime > 0.08 && !this.assist) {
      const T = TRICKS[this.trickType];
      const held = T.roll ? rIn : fIn;
      if (held && Math.sign(held) === Math.sign(this.flipDir)) {
        // tucked up (grabbing) the body turns over faster, like a diver
        const r = T.rate * (this.perfectPop ? 1.08 : 1) * (c.grab ? 1.12 : 1);
        this.pitch += this.flipDir * r * dt;
        this.flipAcc += this.flipDir * r * dt;
      } else {
        // let go: carry on round if it's well into the turn, otherwise come back level
        const f = this.pitch / TAU;
        const target = (this.flipDir > 0 ? Math.floor(f + 0.62) : Math.ceil(f - 0.62)) * TAU;
        const d = target - this.pitch;
        this.pitch += Math.sign(d) * Math.min(Math.abs(d), dt * T.rate * 0.9);
      }
    } else if (!arc) {
      if (this.airTime > 0.12) {
        this.pitch += c.flip * 6.0 * dt;
        this.flipAcc += c.flip * 6.0 * dt;
      }
      if (c.flip === 0) {
        const target = Math.round(this.pitch / TAU) * TAU;
        this.pitch += (target - this.pitch) * Math.min(1, dt * 4);
      }
    }
    // a released spin finishes at the nearest half turn (lands forward or switch)
    if (!arc && Math.abs(c.steer) < 0.15 && this.airTime > 0.15) {
      const hor = Math.atan2(v.x, v.z);
      const rel = this.heading - hor;
      const target = hor + Math.round(rel / Math.PI) * Math.PI;
      const d = target - this.heading;
      const step = Math.sign(d) * Math.min(Math.abs(d), dt * (arc ? 7.5 : 5.5));
      this.heading += step; this.spin += step;
    }
    if (c.grab) {
      this.grabTime += dt;
      const k = this.board ? BOARD_NAME[c.grabKind || 'mute'] ?? 'indy' : c.grabKind || 'mute';
      this.grabs[k] = (this.grabs[k] || 0) + dt;
    }
    // style without rotation: a shifty (up) twists the skis across and back, a daffy (down) splits them
    if (arc && !this.trickType && Math.abs(this.spinVel) < 2.5 && !c.grab) {
      if (c.up) this.shiftyT += dt;
      if (c.down) this.daffyT += dt;
    }
    if (arc) this.landAssist(dt);
    if (this.pipeAir) {
      // never drift out over the deck
      const off = pipeAt(this.pos.x, this.pos.z);
      if (off !== null && Math.abs(off) > PIPE.flat + PIPE.amax - 0.4) v.x -= Math.sign(off) * 6 * dt;
    }
    this.pos.addScaledVector(v, dt);
    this.maxY = Math.max(this.maxY, this.pos.y);
    const gy = heightAt(this.pos.x, this.pos.z);
    this.maxAirY = Math.max(this.maxAirY, this.pos.y - gy);
    this.lean *= 1 - Math.min(1, dt * 4);
    if (this.pos.y <= gy) this.land(gy);
  }

  land(gy) {
    this.auto = null;
    const v = this.vel;
    const arc = this.world.arcade;
    this.pos.y = gy;
    const n = normalAt(this.pos.x, this.pos.z, this.normal);
    const vn = -v.dot(n);
    const hor = Math.atan2(v.x, v.z);
    const mis = Math.abs(wrapAngle(this.heading - hor));
    const pErr = Math.abs(wrapAngle(this.pitch));
    const big = this.airTime > 0.3;
    // how far off straight (forward or switch) the skis come down
    const off = Math.min(mis, Math.PI - mis);
    let crash, sketchy = false;
    if (arc) {
      // forgiving: a bit sideways still rides away, just sketchy
      crash = big && (pErr > 1.15 || off > 1.25 || vn > 26);
      sketchy = !crash && big && (off > 0.55 || pErr > 0.6);
    } else {
      // landing into a flat bottom from height is what breaks people, not big air onto a slope
      const sideways = this.pipeAir ? mis > 1.3 && mis < 1.85 : mis > 0.95 && mis < 2.25;
      crash = big && (pErr > 0.75 || sideways || vn > 15.5 || (this.controls.grab && vn > 6));
    }
    const switchOut = arc ? mis >= Math.PI / 2 : mis >= 2.25;
    // skis that come down backwards ride away backwards (the computer riders turn straight round)
    const back = switchOut && this.canSwitch;
    if (!crash && switchOut && !back) { this.heading += Math.PI; this.avgHeading = this.heading; }
    // ride away straight: the skis snap onto the line of travel
    if (!crash && arc) { this.heading = hor + (back ? Math.PI : 0); this.avgHeading = this.heading; }
    if (!crash) { this.switchStance = switchOut; this.switchT = 0; }
    // a snowboarder who lands a half turn rides away the other foot forward
    if (!crash && this.board && switchOut) this.boardSwitch = !this.boardSwitch;
    v.addScaledVector(n, Math.max(0, vn));
    // flat landings cost speed (less so when sketchy is the worst of it)
    v.multiplyScalar(1 - clamp((vn - 4) * (arc ? 0.02 : 0.03), 0, 0.35) - (sketchy ? 0.08 : 0));
    this.onGround = true;
    this.compress = clamp(vn / 9, 0.2, 1);
    this.gload = 1 + vn / 5;
    const grabs = Object.entries(this.grabs).filter(([, t]) => t >= 0.25).sort((a, b) => b[1] - a[1]);
    const trick = {
      air: this.airTime, height: this.maxAirY, vn,
      spin: Math.round(Math.abs(this.spin) / Math.PI) * 180, spinDir: Math.sign(this.spin), spin90: Math.round(Math.abs(this.spin) / (Math.PI / 2)) * 90,
      flips: Math.round(Math.abs(this.trickType ? this.pitch : this.flipAcc) / TAU),
      flipDir: this.trickType ? this.flipDir : Math.sign(this.flipAcc), type: this.trickType,
      grab: this.grabTime > 0.25, grabTime: this.grabTime, grabs, clean: !crash, sketchy, popped: !!this.popped,
      // stomped: came down along the landing, barely any hit to soak up
      stomp: !crash && !sketchy && vn < 3.2 && this.airTime > 0.7, perfectPop: !!this.perfectPop,
      rise: this.maxY - this.takeoffY, pipe: this.pipeAir, switchIn: this.takeoffSwitch, switchOut, fromRail: !!this.fromRail,
      board: this.board, shifty: this.shiftyT >= 0.22, daffy: this.daffyT >= 0.22,
    };
    if (sketchy) this.flailT = 0.7;
    this.pipeAir = false; this.perfectPop = false; this.spinVel = 0; this.assist = null;
    // the legs soak it up: a spring that dips and comes back
    this.springV -= Math.min(vn, 14) * 0.16;
    if (!crash) { this.pitch = 0; this.spin = 0; this.flipAcc = 0; this.trickType = null; }
    if (this.trackSlot) this.trackSlot.break();
    if (crash) this.startCrash('landing'); else this.emit('land', trick);
  }

  // The last moments before touchdown: whatever rotation is closest to a clean landing gets
  // finished on time (spins to the nearest half turn, flips to the nearest whole one, the way
  // they were already going if well into it). Too far off to save is still a bail.
  landAssist(dt) {
    if (this.airTime < 0.2 || this.pipeAir) return;
    this.tLand -= dt;
    if (--this.landProbe <= 0) {
      // time to touchdown along the ballistic path
      this.landProbe = 4;
      const p = this.pos, v = this.vel;
      let t = 0.04;
      for (; t < 1.6; t += 0.04) {
        const x = p.x + v.x * t, z = p.z + v.z * t, y = p.y + v.y * t - 0.5 * GRAV * t * t;
        if (y <= heightAt(x, z)) break;
      }
      this.tLand = t;
    }
    if (this.tLand > 0.45) return;
    const v = this.vel;
    const hor = Math.atan2(v.x, v.z);
    if (!this.assist) {
      const f = (this.heading - hor) / Math.PI, sv = this.spinVel;
      const spin = Math.abs(sv) < 2 ? Math.round(f) : sv > 0 ? Math.floor(f + 0.62) : Math.ceil(f - 0.62);
      let pitch = null;
      if (this.trickType) {
        const fp = this.pitch / TAU;
        pitch = (this.flipDir > 0 ? Math.floor(fp + 0.55) : Math.ceil(fp - 0.55)) * TAU;
      }
      this.assist = { spin, pitch };
    }
    const a = this.assist;
    const k = Math.min(1, dt / Math.max(this.tLand, dt * 1.5));
    const dS = clamp((a.spin * Math.PI + hor - this.heading) * k, -16 * dt, 16 * dt);
    this.heading += dS; this.spin += dS; this.spinVel = dS / dt;
    if (a.pitch != null) {
      const dP = clamp((a.pitch - this.pitch) * k, -15 * dt, 15 * dt);
      this.pitch += dP; this.flipAcc += dP;
    }
  }

  // time to touchdown along the ballistic path from here
  flightTime() {
    const p = this.pos, v = this.vel;
    let t = 0.04;
    for (; t < 3.2; t += 0.04) {
      const x = p.x + v.x * t, z = p.z + v.z * t, y = p.y + v.y * t - 0.5 * GRAV * t * t;
      if (y <= heightAt(x, z)) break;
    }
    return t;
  }

  // a quick trick: { spin (deg), type, flips, dir, grab, shifty, daffy }. The first frame plans
  // it (the biggest version that fits the air), then the rotation runs at the rate that
  // finishes on touchdown; the landing assist holds the target for the last moment.
  autoTrick(dt, c) {
    const A = this.auto, v = this.vel;
    const hor = Math.atan2(v.x, v.z);
    if (!A.plan) {
      const T = this.flightTime(), avail = Math.max(0.05, T - 0.3);
      let spin = A.spin ?? 0, flips = A.flips ?? 0;
      while (spin > 0 && !A.turn && (spin / 180) * Math.PI / avail > 13.5) spin -= 180;
      while (flips > 0 && (flips * TAU) / avail > 12.5) flips--;
      const sd = A.dir ?? 1;
      const f0 = (this.heading - hor) / Math.PI;
      let type = flips ? A.type : null;
      // a cork with no spin left is just a flip
      if (type && !spin && !['backflip', 'frontflip', 'sideflip'].includes(type)) type = TRICKS[type].back ? 'backflip' : 'frontflip';
      const fDir = type ? (TRICKS[type].roll ? A.roll ?? 1 : TRICKS[type].back ? -1 : 1) : 0;
      if (type) {
        const Tt = TRICKS[type];
        this.trickType = type; this.flipDir = fDir;
        if (Tt.roll) this.flipAxis.set(0, 0, 1);
        else this.flipAxis.set(Math.cos(Tt.a), 0, Math.sin(Tt.a) * sd * (fDir < 0 ? 1 : -1)).normalize();
      }
      A.plan = { spin, flips, T, end: this.airTime + T };
      this.spinVel = 0;
      this.assist = { spin: Math.round(f0) + sd * (spin / 180), pitch: type ? fDir * flips * TAU : null };
    }
    c.steer = 0; c.flip = 0; c.roll = 0;
    const a = this.assist;
    const tl = A.plan.end - this.airTime;
    if (a && (A.turn || (tl > 0.45 && this.tLand > 0.45))) {
      const left = Math.max(A.turn ? 0.05 : 0.12, tl - (A.turn ? 0.12 : 0.4));
      const dS = clamp((a.spin * Math.PI + hor - this.heading) / left * dt, -14 * dt, 14 * dt);
      this.heading += dS; this.spin += dS;
      if (a.pitch != null) { const dP = clamp((a.pitch - this.pitch) / left * dt, -13 * dt, 13 * dt); this.pitch += dP; this.flipAcc += dP; }
    }
    // the grab (or the style) through the middle of the flight
    const mid = this.airTime > 0.1 && tl > 0.22;
    if (A.grab) { c.grab = mid; c.grabKind = A.grab; }
    if (A.shifty && !A.plan.spin && !A.plan.flips) c.up = mid;
    if (A.daffy && !A.plan.spin && !A.plan.flips) c.down = mid;
  }

  // a kicker whose lip is between a and b metres ahead of us (and we're on it)
  lipAhead(a, b) {
    const z = this.pos.z;
    for (const J of JUMPS) {
      const d = J.lip - z;
      if (d < a || d > b) continue;
      if (Math.abs(this.pos.x - centerX(J.lip) - J.dx) < J.w / 2 - 0.3) return J;
    }
    return null;
  }

  // B: press the nose (or with S, the tail) into the snow; A/D pivot round a half turn
  stepButter(dt, c, speed) {
    const b = this.butter;
    if (!b) {
      if (c.butter && !this.butterHeld && this.butterCool <= 0 && speed > 2.5) {
        this.butter = { t: 0, tail: c.brake > 0, turn: 0, dir: 0 };
      }
      this.butterHeld = c.butter;
      return;
    }
    b.t += dt;
    if (!b.dir && Math.abs(c.steer) > 0.5) b.dir = -Math.sign(c.steer);
    // keep holding the turn to carry the pivot on round: 180, 360, 540
    const more = b.dir && Math.abs(c.steer) > 0.5 && b.turn < 3 * Math.PI - 0.05;
    const goal = more ? 3 * Math.PI : Math.max(Math.PI, Math.ceil((b.turn - 0.4) / Math.PI) * Math.PI);
    if (b.dir && b.turn < goal) {
      const d = Math.min(goal - b.turn, dt * 5.6);
      b.turn += d; this.heading += b.dir * d;
    }
    // the press drags: you slow while it's held
    this.vel.multiplyScalar(1 - dt * 0.35);
    c.tuck = 0; c.brake = 0;
    const spinning = b.dir && b.turn % Math.PI > 0.05 && b.turn < goal;
    if ((!c.butter && !spinning) || b.t > (b.turn > 0.1 ? 3 : 1.5)) {
      this.butter = null; this.butterHeld = c.butter; this.butterCool = 0.6;
      // let go early and the skis spring back
      this.butterPop = b.t < 1.4 ? 2.2 : 0;
      if (b.t >= 0.25 && speed > 1.5) this.emit('butter', { tail: b.tail, spin: Math.round((b.turn - 0.3) / Math.PI) * 180, t: b.t, board: this.board });
      if (b.turn > Math.PI / 2) this.heading = Math.atan2(this.vel.x, this.vel.z) + (Math.abs(wrapAngle(this.heading - Math.atan2(this.vel.x, this.vel.z))) > Math.PI / 2 ? Math.PI : 0);
      if (this.board && Math.round(b.turn / Math.PI) % 2 === 1) this.boardSwitch = !this.boardSwitch;
    }
  }

  // ---- crashes: tumble and slide, lie there a moment, get up where you stopped ----
  startCrash(reason) {
    if (this.crash > 0) return;
    const sp = this.speed;
    this.crash = 1; this.crashPhase = 'tumble'; this.crashT = 0; this.crashSpeed = sp;
    // tumble around the horizontal axis across the direction of travel
    const hx = this.vel.x, hz = this.vel.z, hl = Math.hypot(hx, hz) || 1;
    this.tumbleAxis.set(hz / hl, 0, -hx / hl);
    this.tumble = this.pitch;
    this.tumbleRate = Math.min(sp / 0.75, 11) * (Math.random() < 0.75 ? 1 : -1);
    this.cartwheel = (Math.random() - 0.5) * Math.min(sp / 3, 5);
    this.cartAngle = 0;
    this.lie = 0;
    this.onGround = true;
    if (this.trackSlot) this.trackSlot.break();
    this.emit('crash', { reason, speed: sp });
    if (sp > 10) this.emit('yardsale', { speed: sp });
  }

  stepCrash(dt) {
    const v = this.vel;
    this.crashT += dt;
    v.y -= GRAV * dt;
    this.pos.addScaledVector(v, dt);
    const gy = heightAt(this.pos.x, this.pos.z);
    const n = normalAt(this.pos.x, this.pos.z, this.normal);
    if (this.pos.y <= gy + 0.02) {
      this.pos.y = gy;
      const vn = v.dot(n);
      if (vn < 0) v.addScaledVector(n, -vn * (vn < -3 ? 1.3 : 1)); // a little bounce on hard hits
      // a body sliding on snow: heavy friction, more in powder
      const sp = v.length();
      // (a rider who falls at speed keeps sliding: he's back up while still moving)
      const mu = (this.crashPhase === 'tumble' ? 0.42 : 0.6) + this.surf.powder * 0.25 - this.surf.ice * 0.15;
      if (sp > 0.01) v.multiplyScalar(Math.max(0, sp - (mu * GRAV * n.y + 0.035 * sp * sp) * dt) / sp);
    }
    const sp = v.length();
    if (this.crashPhase === 'tumble') {
      this.tumble += this.tumbleRate * dt;
      this.cartAngle += this.cartwheel * dt;
      const k = Math.exp(-dt * 1.5);
      this.tumbleRate *= k; this.cartwheel *= k;
      this.tumbleRate = Math.sign(this.tumbleRate) * Math.min(Math.abs(this.tumbleRate), sp / 0.6 + 1);
      // once the tumbling dies down you're sliding on your back or front
      if (Math.abs(this.tumbleRate) < 2.5) {
        const lying = Math.round((this.tumble - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
        this.tumble += (lying - this.tumble) * Math.min(1, dt * 4);
        this.cartAngle += (Math.round(this.cartAngle / Math.PI) * Math.PI - this.cartAngle) * Math.min(1, dt * 4);
      }
      this.lie = Math.min(1, this.lie + dt * 2);
      // a short tumble, then straight back up (a big one tumbles a little longer)
      const tMax = 0.75 + Math.min(0.55, (this.crashSpeed ?? 0) * 0.02);
      if ((sp < 1.2 && this.crashT > 0.6) || this.crashT > tMax) { this.crashPhase = 'down'; this.crashT = 0; }
    } else if (this.crashPhase === 'down') {
      // a beat on the snow
      const lying = Math.round((this.tumble - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
      this.tumble += (lying - this.tumble) * Math.min(1, dt * 8);
      this.cartAngle += (Math.round(this.cartAngle / Math.PI) * Math.PI - this.cartAngle) * Math.min(1, dt * 8);
      if (this.crashT > 0.18) { this.crashPhase = 'up'; this.crashT = 0; }
    } else {
      // springing up while still sliding
      v.multiplyScalar(Math.exp(-dt * 0.8));
      const up = Math.round(this.tumble / (Math.PI * 2)) * Math.PI * 2;
      this.tumble += (up - this.tumble) * Math.min(1, dt * 9);
      this.cartAngle += (Math.round(this.cartAngle / (Math.PI * 2)) * Math.PI * 2 - this.cartAngle) * Math.min(1, dt * 9);
      this.lie = Math.max(0, this.lie - dt * 2.6);
      if (this.crashT > 0.42) this.recover();
    }
  }

  recover() {
    const off = Math.abs(this.pos.x - centerX(this.pos.z)) / halfWidth(this.pos.z);
    this.world.forest?.query(this.pos.x, this.pos.z, near);
    const stuckInTrees = near.some((o) => Math.hypot(o.x - this.pos.x, o.z - this.pos.z) < o.r + 0.8);
    this.endCrash();
    if (off > 1.3 || stuckInTrees) this.respawn();
    else {
      // back on the skis with some of the speed he fell with, along the way he was sliding
      // if that's down the hill, otherwise down the fall line
      const fall = Math.atan2(centerSlope(this.pos.z), 1);
      const hv = Math.hypot(this.vel.x, this.vel.z), dir = Math.atan2(this.vel.x, this.vel.z);
      const heading = hv > 2 && Math.abs(wrapAngle(dir - fall)) < 1.2 ? dir : fall;
      const keep = Math.min(22, Math.max(hv, (this.crashSpeed ?? 0) * 0.4));
      this.place(this.pos.x, this.pos.z, heading, keep);
    }
    this.emit('recover');
  }

  endCrash() {
    this.crash = 0; this.crashPhase = null; this.tumble = 0; this.lie = 0; this.cartAngle = 0;
    this.pitch = 0; this.spin = 0; this.flipAcc = 0;
    this.emit('gear');
  }

  // ---- rails and boxes ----
  tryGrind() {
    if (this.grindCool > 0) return;
    const p = this.pos;
    for (const R of RAILS) {
      if (p.z < R.a.z - 1 || p.z > R.a.z + R.L + 1) continue;
      railAt(R, p.x, p.z, _r);
      if (_r.s < 0.05 || _r.s > R.L - 0.4 || Math.abs(_r.lat) > R.hw + 0.32) continue;
      const dy = p.y - _r.y;
      if (dy < -0.32 || dy > 0.5) continue;
      const vs = this.vel.x * R.dir.x + this.vel.z * R.dir.z;
      if (vs < 1.2) continue;
      const rel = wrapAngle(this.heading - R.yaw);
      const ar = Math.abs(rel);
      let kind;
      if (this.world.arcade) {
        // any way you come in, the skis lock to the nearest quarter turn
        const q = Math.round(rel / (Math.PI / 2));
        kind = q === 0 ? '50-50' : Math.abs(q) === 2 ? 'Switch 50-50' : R.kind === 'box' ? 'Boardslide' : 'Lipslide';
      } else if (ar < 0.7) kind = '50-50';
      else if (ar > Math.PI - 0.7) kind = 'Switch 50-50';
      else if (Math.abs(ar - Math.PI / 2) < 0.75) kind = R.kind === 'box' ? 'Boardslide' : 'Lipslide';
      else continue;
      const side = this.world.arcade ? Math.round(rel / (Math.PI / 2)) * (Math.PI / 2)
        : kind === '50-50' ? 0 : kind === 'Switch 50-50' ? Math.PI : Math.sign(rel) * Math.PI / 2;
      this.grind = { R, s: _r.s, v: vs, kind, side, sideT: side, lastSt: Math.sign(Math.round(this.controls.steer)), swaps: 0, lat: _r.lat, bal: clamp(_r.lat / (R.hw + 0.4), -0.5, 0.5) * 0.5, t: 0, d0: _r.s, spinIn: Math.round(Math.abs(this.spin) / (Math.PI / 2)) * 90, switchIn: this.takeoffSwitch || this.switchStance };
      this.onGround = false; this.airTime = 0; this.pipeAir = false;
      this.spin = 0; this.pitch = 0; this.flipAcc = 0;
      if (this.trackSlot) this.trackSlot.break();
      this.emit('grindStart', this.grind);
      return;
    }
  }

  stepGrind(dt, c) {
    const g = this.grind, R = g.R;
    g.t += dt;
    railAt(R, R.a.x + R.dir.x * g.s, R.a.z + R.dir.z * g.s, _r);
    const sl = _r.slope, il = 1 / Math.sqrt(1 + sl * sl);
    const arc = this.world.arcade;
    // gravity along the rail, sliding friction on the metal (or the box's plastic);
    // in the park game the bars carry your speed and down rails add to it
    const mu = arc ? (R.kind === 'box' ? 0.02 : 0.012) : R.kind === 'box' ? 0.075 : 0.05;
    g.v += (-GRAV * sl * il - mu * GRAV * il - 0.002 * g.v * g.v) * dt;
    if (arc) g.v = Math.max(g.v, 3);
    g.s += g.v * il * dt;
    if (arc) {
      // A/D turn the slide a quarter at a time: every turn is a swap
      const st = c.steer > 0.5 ? 1 : c.steer < -0.5 ? -1 : 0;
      if (st && st !== g.lastSt) {
        g.sideT -= st * Math.PI / 2; g.swaps++;
        const q = Math.round(wrapAngle(g.sideT) / (Math.PI / 2));
        g.kind = q === 0 ? '50-50' : Math.abs(q) === 2 ? 'Switch 50-50' : R.kind === 'box' ? 'Boardslide' : 'Lipslide';
        this.emit('railSwap', g);
      }
      g.lastSt = st;
      g.side += clamp(g.sideT - g.side, -dt * 11, dt * 11);
      g.bal = Math.sin(this.time * 5.1 + R.z) * 0.12;
    } else {
      // balance: it wants to fall off; steering catches it
      const wob = Math.sin(this.time * 7.3 + R.z) * 0.32 + Math.sin(this.time * 3.1) * 0.22;
      g.bal += (g.bal * 1.5 + wob * (R.kind === 'box' ? 0.6 : 1)) * dt - c.steer * 2.2 * dt;
    }
    g.lat *= Math.exp(-dt * 10);
    this.heading = R.yaw + g.side + g.bal * 0.12;
    this.lean = -g.bal * 0.5;
    this.pos.set(R.a.x + R.dir.x * g.s + R.dir.z * g.lat, _r.y, R.a.z + R.dir.z * g.s - R.dir.x * g.lat);
    this.vel.set(R.dir.x * g.v * il, sl * g.v * il, R.dir.z * g.v * il);
    this.edge = 0; this.skid = 0; this.compress = 0.35; this.gload = 1;
    if (c.jump) { this.jumpCharge = Math.min(1, this.jumpCharge + dt * 2.5); g.press = (g.press ?? 0) + dt; }
    // W / S on a rail: nose or tail press
    if (c.flip > 0) g.nose = (g.nose ?? 0) + dt;
    else if (c.flip < 0) g.tail = (g.tail ?? 0) + dt;
    const pop = !c.jump && this.jumpCharge > 0;
    const fell = Math.abs(g.bal) > 1;
    if (g.s >= R.L || g.v < 0.4 || pop || fell) this.endGrind(pop, fell);
  }

  endGrind(pop, fell) {
    const g = this.grind;
    this.grind = null; this.grindCool = 0.35;
    const dist = Math.max(0, g.s - g.d0);
    this.onGround = false; this.airTime = 0.13; this.spin = 0; this.pitch = 0; this.flipAcc = 0; this.grabTime = 0;
    this.takeoffY = this.maxY = this.pos.y; this.maxAirY = 0;
    this.takeoffSwitch = this.board ? !!this.boardSwitch : Math.abs(wrapAngle(this.heading - g.R.yaw)) > Math.PI / 2;
    this.fromRail = true;
    this.popped = false; this.spinVel = 0; this.perfectPop = false; this.offKicker = false;
    if (pop) { this.vel.y += 2.4 + this.jumpCharge * 2; this.jumpCharge = 0; this.popped = true; }
    else this.vel.y += this.world.arcade ? 1.4 : 0.6;
    if (this.world.arcade) {
      // the slide's rotation carries on off the end: spin out of it to land straight
      this.spin = 0;
      this.grabs = {}; this.trickType = null; this.flipAxis.set(1, 0, 0);
    } else if (Math.abs(g.side) === Math.PI / 2) this.heading = g.R.yaw + (Math.random() < 0.5 ? 0 : Math.PI); // ride away facing down the hill
    if (fell) {
      this.pos.x += Math.sign(g.bal) * 0.4;
      this.vel.x += Math.sign(g.bal) * 1.5;
      if (g.v > 3) this.startCrash('rail');
    }
    this.emit('grindEnd', { kind: g.kind, rail: g.R.name, dist, t: g.t, fell, spinIn: g.spinIn, swaps: g.swaps, switchIn: g.switchIn, pop, press: g.press ?? 0, nose: g.nose ?? 0, tail: g.tail ?? 0, board: this.board });
  }

  collide() {
    const w = this.world;
    if (!w.forest) return;
    w.forest.query(this.pos.x, this.pos.z, near);
    for (const o of near) {
      const dx = this.pos.x - o.x, dz = this.pos.z - o.z;
      const minD = o.r + 0.35;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minD * minD) continue;
      const gy = heightAt(o.x, o.z);
      if (o.top && this.pos.y > gy + o.top) continue;
      // poles, gates and signs: knock them over and carry on, a little slower
      if (o.soft) {
        if (o.down || o.off || this.pos.y > gy + o.h || this.speed < 1.5) continue;
        this.vel.multiplyScalar(1 - o.slow);
        this.flailT = Math.max(this.flailT, o.slow > 0.05 ? 0.45 : 0.2);
        this.world.smash?.hit(o, this.vel);
        this.emit('smash', { kind: o.kind, speed: this.speed });
        continue;
      }
      const d = Math.sqrt(d2) || 0.01;
      const nx = dx / d, nz = dz / d;
      const into = -(this.vel.x * nx + this.vel.z * nz);
      this.pos.x = o.x + nx * minD; this.pos.z = o.z + nz * minD;
      if (into > 0) {
        if (into > 6.5 && this.crash <= 0) {
          this.startCrash(o.kind);
          this.emit('impact', { kind: o.kind, x: o.x, z: o.z });
        }
        this.vel.x += nx * into * 1.15; this.vel.z += nz * into * 1.15;
      }
    }
  }

  // ---- visuals ----
  updateVisual(dt, camPos) {
    const m = this.model;
    const g = m.group;
    const airK = this.onGround ? 0 : smoothstep(0.05, 0.35, this.airTime);
    _t.copy(this.normal).lerp(UP, this.onGround && !this.crash ? 0.15 : 0.8).normalize();
    _q.setFromUnitVectors(UP, _t);
    _q2.setFromAxisAngle(UP, this.heading + this.skidYaw);
    g.quaternion.copy(_q).multiply(_q2);
    let lie = 0;
    if (this.crash > 0) {
      // world-space tumble across the line of travel plus a cartwheel along it
      _q2.setFromAxisAngle(this.tumbleAxis, -this.tumble);
      _m.makeRotationAxis(_n.set(-this.tumbleAxis.z, 0, this.tumbleAxis.x), this.cartAngle);
      g.quaternion.premultiply(new THREE.Quaternion().setFromRotationMatrix(_m)).premultiply(_q2);
      lie = this.lie;
    } else if (this.pitch !== 0) {
      g.quaternion.multiply(_q2.setFromAxisAngle(this.flipAxis, this.trickType ? this.pitch : -this.pitch));
    } else if (this.butter && this.onGround) {
      // butter: rock onto the nose or tail, pivoting on that ski end
      const k = Math.min(1, this.butter.t * 6) * (this.board ? 0.2 : 0.32);
      const a = this.butter.tail ? -k : k;
      g.quaternion.multiply(_q2.setFromAxisAngle(_n.set(1, 0, 0), a));
    } else if (this.grind && this.controls.flip) {
      // nose / tail press on a rail
      g.quaternion.multiply(_q2.setFromAxisAngle(_n.set(1, 0, 0), this.controls.flip * (this.board ? 0.1 : 0.2)));
    }
    (this.visPos ??= new THREE.Vector3()).copy(this.pos);
    // rotate about the body's centre, not the feet
    const ch = 0.8 * (1 - lie) + 0.24 * lie;
    _n.set(0, 0.8, 0).applyQuaternion(g.quaternion);
    g.position.copy(this.pos).addScaledVector(_t, ch).sub(_n);
    if (this.butter && this.onGround && !this.crash) g.position.y += Math.sin(Math.min(1, this.butter.t * 6) * 0.32) * 0.82;
    // deep snow: the skis ride under the surface, planing up as the speed builds
    if (this.onGround && !this.grind) {
      const sink = this.surf.powder * clamp(0.3 - this.speed * 0.012, 0.06, 0.3) * (this.crash > 0 ? 0.5 : 1);
      this.sinkV = (this.sinkV ?? 0) + (sink - (this.sinkV ?? 0)) * Math.min(1, dt * 6);
    } else this.sinkV = (this.sinkV ?? 0) * (1 - Math.min(1, dt * 8));
    g.position.y -= this.sinkV;

    const dist = camPos ? camPos.distanceTo(this.pos) : 0;
    m.setDetail(dist < 70);
    m.setReal?.(dist < 160);
    m.group.visible = dist < 1400;
    if (!m.group.visible) return;
    if (dist > 180 && (Math.floor(this.time * 60) % 3) !== 0) return; // pose far skiers less often
    const sp = this.speed;
    const c = this.controls;
    const crashed = this.crash > 0;
    // landings: the legs are a spring that dips and comes back up
    const vdt = Math.min(dt, 0.05);
    this.springV += (-150 * this.spring - 15 * this.springV) * vdt;
    this.spring += this.springV * vdt;
    this.flailT = Math.max(0, this.flailT - vdt);
    const free = !this.onGround && !crashed && !this.trickType && !c.grab && Math.abs(c.steer) < 0.3;
    this.shiftyS += ((free && c.up ? 1 : 0) - this.shiftyS) * Math.min(1, vdt * 9);
    this.daffyS += ((free && c.down ? 1 : 0) - this.daffyS) * Math.min(1, vdt * 9);
    const gCrouch = clamp((this.gload - 1) * 0.32, -0.12, 0.5);
    // riding backwards: he turns his shoulders and looks back over one of them to see where he's going
    const back = this.skiSwitch && this.onGround && !crashed && !this.grind;
    if (back && Math.abs(c.steer) > 0.3) this.lookSide = -Math.sign(c.steer);
    this.backK = (this.backK ?? 0) + ((back ? 1 : 0) - (this.backK ?? 0)) * Math.min(1, vdt * 6);
    const lookS = (this.lookSide ?? 1) * this.backK;
    let crouch = 0.18 + Math.abs(this.lean) * (this.board ? 0.26 : 0.42) + this.compress * 0.35 + gCrouch + this.jumpCharge * 0.5 + (c.brake > 0 ? 0.25 : 0) - this.spring * 1.6;
    if (crashed) crouch = this.crashPhase === 'up' ? 0.9 * this.lie + 0.3 : 0.55;
    m.pose({
      lean: crashed ? 0 : this.lean,
      angulate: 0.55,
      crouch: clamp(crouch, 0, 1),
      tuck: crashed || (this.skating && !this.board) ? 0 : clamp(c.tuck * smoothstep(5, 9, sp), 0, 1) * (1 - airK * 0.5),
      plow: c.brake > 0 && sp < 9 && !this.isPlayer && !this.board ? 1 : 0,
      air: crashed ? 0 : airK,
      grab: c.grab && airK > 0 ? 1 : 0,
      grabTip: c.grab && airK > 0 ? 1 : 0,
      grabKind: c.grabKind || 'mute',
      cross: this.grind && c.jump ? 1 : 0,
      press: this.board ? (this.butter && this.onGround ? (this.butter.tail ? -1 : 1) * Math.min(1, this.butter.t * 6) : this.grind ? c.flip || 0 : 0) : 0,
      shifty: this.shiftyS, daffy: this.daffyS,
      flail: crashed ? 0 : smoothstep(0, 0.3, this.flailT),
      spinRate: this.onGround ? 0 : this.spinVel,
      look: crashed ? 0 : this.onGround ? clamp(-this.edge * 0.3, -0.35, 0.35) * (1 - this.backK) + lookS * 1.15 : clamp(this.spinVel * 0.07, -0.6, 0.6),
      polePlant: Math.sin(this.polePlant * Math.PI),
      poleSide: this.poleSide,
      crash: crashed && this.crashPhase !== 'up',
      twist: crashed ? 0 : clamp(wrapAngle(this.avgHeading - this.heading) * 0.85, -0.7, 0.7) * (1 - this.backK) + lookS * 0.62,
      skate: this.skating && !crashed && !this.board ? 1 : 0,
      skatePhase: this.skatePhase,
      edge: this.onGround && !crashed ? this.edge : 0,
      switch: !!this.boardSwitch,
      t: this.time,
    });
  }

  dispose() {
    this.world.scene.remove(this.model.group);
  }
}
