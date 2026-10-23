// Ski physics shared by the player and every AI. Gravity, snow friction,
// air drag (upright vs tuck), edge grip that bends the velocity through a
// carve and turns into a speed-scrubbing skid past its limit, ballistic
// airtime off any crest or kicker, and crashes on bad landings or impacts.
// The player's skis carve the sidecut's arc while the snow holds it (pressure
// building through the turn, a little rebound out of it) and slip into a skid
// past it; the load on them follows the terrain's curve (rollers unweight, dips
// press). tools/groundbench.mjs measures it all without a browser.
import * as THREE from 'three';
import { heightAt, normalAt, centerX, halfWidth, centerSlope, surfaceAt, RAILS, railAt, PIPE, pipeWalls, FINISH_Z, JUMPS } from './course.js';
import { SkierModel, BOARD_NAME } from './skiermodel.js';
import { clamp, smoothstep } from './noise.js';

const GRAV = 9.81;
const UP = new THREE.Vector3(0, 1, 0);
const BLOB = {}; const _bn = new THREE.Vector3(), _bq = new THREE.Quaternion();
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

// Cork7's numbers, for the player in the run and the park: the slope pulls at 1.7 g, the air at
// 17.5 m/s^2 (the same jumps fly the same distance, a third quicker), rolling friction and
// v^2 drag (less tucked), what a held edge costs, a 17 m/s^2 brake, a 43 m/s cap; spins and
// flips build to 6.3 rad/s, 6.8 held hard, 9.5 held with a grab
const C7 = {
  slopeG: 9.81 * 1.7, airG: 17.5, roll: 0.13, kTuck: 0.0024, kRide: 0.0028, deep: 1.38, edgeDrag: 0.38, brake: 17, vmax: 43,
  spin0: 6.3, spin1: 6.3 * 1.08, spinGrab: 6.3 * 1.08 * 1.4, spinUp: 6.5, spinRev: 18, spinDown: 6.5,
  // (a calm pace: past ~83 km/h riding, ~100 tucked, the snow holds you back more; lined up for a
  // kicker the pace goes to the speed that kicker's built for, so it lands you on its landing as
  // Cork7's do)
  vSoft: 23, vSoftTuck: 28, gov: 0.2, govMax: 6,
};
// the player's riding runs at this pace of real time (main.js steps him at h * pace; the HUD
// shows real speed and air time). Below 1 everything goes the same way, only slower; Cork7's own
// timing is 1 (slowed to 0.78 it read as floaty, not calm: the calm is in the camera and the body)
export const PACE = 1;
// exponential approach (k per second)
const ease = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// Off-axis tricks: the flip turns about the body's side axis tilted toward its nose
// (a: how far), over the leading shoulder for the way it spins.
const TRICKS = {
  backflip: { a: 0, rate: 5.6, back: true }, frontflip: { a: 0, rate: 5.6 },
  cork: { a: 0.8, rate: 4.0, back: true }, bio: { a: 0.8, rate: 4.0 },
  rodeo: { a: 0.42, rate: 4.4, back: true }, misty: { a: 0.42, rate: 4.4 },
  sideflip: { roll: true, rate: 5.0 }, flatspin: { roll: true, rate: 4.2 },
};

// A trick's rotation over its time (u 0..1 -> 0..1): a cubic that starts turning at w times the
// average rate and comes to rest at the end (monotone for w <= 3), blended by b with a steady turn
function herm(u, e) {
  const h = e.w * (u * u * u - 2 * u * u + u) + 3 * u * u - 2 * u * u * u;
  return (1 - e.b) * u + e.b * h;
}
// its quickest rate, as a multiple of the average
function hermPeak(w) {
  let m = 0;
  for (let i = 0; i <= 20; i++) { const u = i / 20; m = Math.max(m, (1 - u) * (w + u * (6 - 3 * w))); }
  return m;
}

export class Skier {
  // how far off another rider is still drawn (the phone settings draw less)
  static drawDist = 1400;
  // and from how far that's the shared simple figure (FarRiders)
  static farDist = 200;

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
    this.spin = 0; this.pitch = 0; this.flipAcc = 0; this.flipVel = 0; this.grabTime = 0;
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
    const T = this.isPlayer && world.myTracks ? world.myTracks : world.tracks;
    this.trackSlot = T ? T.alloc() : null;
    this.maxAirY = 0;
    this.grind = null; this.grindCool = 0;
    this.pipeAir = false; this.takeoffY = 0; this.maxY = 0; this.takeoffSwitch = false;
  }

  on(evt, fn) { (this.listeners[evt] ??= []).push(fn); }
  emit(evt, data) { for (const fn of this.listeners[evt] ?? []) fn(data); }

  get speed() { return this.vel.length(); }
  // only the player rides switch on skis (the computer riders always turn round)
  // the player riding himself: no landing assist, no auto-finished spins
  get strict() { return this.isPlayer && !this.ai && this.world.arcade; }
  get pace() { return this.strict ? PACE : 1; }
  // what the air pulls at: Cork7's for the player (not in the pipe, which keeps its own walls)
  get airG() { return this.strict && !this.pipeAir ? C7.airG : GRAV; }
  get canSwitch() { return this.isPlayer && !this.board && !this.ai; }

  place(x, z, heading = null, speed = 0) {
    this.pos.set(x, heightAt(x, z), z);
    const h = heading ?? Math.atan2(centerSlope(z), 1);
    this.heading = h; this.avgHeading = h;
    normalAt(x, z, this.normal);
    this.forward(_f);
    this.vel.copy(_f).multiplyScalar(speed);
    // (Cork7's model goes the way it's put, not the way the slope tips the velocity)
    this.c7T = h; this.c7Hv = Math.atan2(this.vel.x, this.vel.z); this.c7On = true;
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
    if (this.frozen) return;
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
        if (out > 10 && this.crash <= 0) this.startCrash('boards', out);
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
    if (out > 12 && this.crash <= 0) this.startCrash('net', out);
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

    // the player rides the full carve / skid model below; the computer riders keep the simpler
    // one their lines are tuned on
    const P = this.isPlayer;
    // --- the load on the skis: the snow's curve along the way they're going. A hollow presses
    // the legs (more grip, more friction), a crest or a roller unweights them (light, loose skis)
    const hs = Math.hypot(v.x, v.z);
    let load = Math.max(n.y, 0.2);
    if (P && hs > 2) {
      const L = 1.4, ux = v.x / hs, uz = v.z / hs, x = this.pos.x, z = this.pos.z;
      const ha = heightAt(x + ux * L, z + uz * L), hb = heightAt(x - ux * L, z - uz * L), h0 = heightAt(x, z);
      const s1 = (ha - hb) / (2 * L);
      const kap = (ha + hb - 2 * h0) / (L * L) / Math.pow(1 + s1 * s1, 1.5);
      load += (speed * speed * kap) / GRAV;
    }
    // (the legs soak up the sharpest of it)
    this.load = (this.load ?? 1) + (clamp(load, 0.1, 3.2) - (this.load ?? 1)) * Math.min(1, dt * 7);
    const N = P ? GRAV * Math.max(this.load, 0.1) : GRAV * Math.max(n.y, 0.2);
    // (the edges' hold follows the load, but the legs keep the skis on the snow over a crest and
    // stiffen against a compression: it doesn't swing all the way with it)
    const Ng = P ? GRAV * clamp(this.load, 0.45, 1.7) : N;

    const inPipe = pipeAt(this.pos.x, this.pos.z);
    // the player rides Cork7's model (outside the pipe, whose walls need the full one)
    const c7 = this.strict && inPipe === null;
    this.c7 = c7;
    let vLong0;
    if (c7) vLong0 = this.groundC7(dt, c, n, powder, ice, W);
    else {
      // --- edging: skis roll onto edge progressively, release quicker ---
      const edgeT = clamp(c.steer, -1, 1) * EDGE_MAX * (1 - c.brake * 0.5);
      const rolling = Math.abs(edgeT) > Math.abs(this.edge) && Math.sign(edgeT) === Math.sign(this.edge || edgeT);
      const rate = rolling ? 3.2 : 5.5;
      this.edge += clamp(edgeT - this.edge, -rate * dt, rate * dt);
      const e = Math.abs(this.edge);
      // carved arc from the sidecut (R = Rsc / tan(edge)); rotary pivot when slow
      // (in powder the skis sink and can't bend into as clean an arc)
      const carveRate = (speed * Math.tan(Math.min(e, 1.2))) / this.sidecut * (1 - powder * 0.35);
      const pivot = 2.3 * (1 - smoothstep(0, 10, speed)) * Math.abs(c.steer);
      const dir = Math.sign(this.edge || c.steer);
      // what the snow will hold: peak grip in g, on the edge you've got, under the load there is
      // (ice lets go, powder is soft, a bent and pressured ski bites harder)
      const edgeHold = 0.3 + 0.7 * smoothstep(0.03, 0.55, e); // flat skis drift
      this.press = this.press ?? 0;
      let maxGrip = this.grip * Ng * edgeHold * (1 - ice * 0.55) * (1 - powder * 0.2) * (1 - c.brake * 0.6) * (W?.grip ?? 1) * (1 + (P ? 0.15 * this.press : 0));
      // a board holds a little less on its heel edge (regular stance: steering left)
      if (this.board && this.edge < 0) maxGrip *= 0.93;
      let slipT = 0;
      if (!P || c.brake > 0.05) {
        // braking (or a computer rider): the skis pivot as far as asked and skid round
        this.heading += -dir * Math.max(carveRate, pivot) * (1 - c.brake * 0.3) * dt;
      } else {
        // Carve or skid. The edge asks for the sidecut's arc (a = v^2 / R); the rider tips only as
        // far as he can balance (~1.2x the corduroy's grip). If the snow holds what's asked, the
        // skis run clean in their own groove; if not, they slip: the line bends only as hard as the
        // grip allows and the skis pivot past it into a skid, which scrubs speed (F sin slip)
        const aDem = speed * carveRate;
        // (fast, the hard turn asks more than the edges hold: they wash out a little and scrub it off)
        const r = Math.min(aDem, this.grip * Ng * (1.2 + 0.6 * smoothstep(17, 30, speed))) / Math.max(maxGrip, 0.1);
        slipT = r > 1 ? 0.42 * (1 - Math.exp(-(r - 1) * 1.2)) : 0;
        const hv = Math.atan2(v.x, v.z);
        // (riding switch the tails lead: the slip is measured from the other way)
        const ref = Math.abs(wrapAngle(this.heading - hv)) > Math.PI / 2 ? hv + Math.PI : hv;
        const slip = wrapAngle(this.heading - ref);
        const tsg = -dir;
        const wTurn = Math.min(aDem, maxGrip * Math.cos(slipT)) / Math.max(speed, 1);
        // (how much the rider is steering the skis' angle to the line: only on an edge, and moving)
        // (a butter pivots the skis on purpose: leave them be)
        const ctrl = this.butter ? 0 : smoothstep(0.05, 0.4, e) * smoothstep(1.5, 4, speed);
        const want = tsg * wTurn * dt + (tsg * slipT - slip) * Math.min(1, dt * 7) * ctrl;
        const piv = tsg * pivot * dt;
        this.heading += Math.abs(piv) > Math.abs(want) ? piv : want;
        // catching an edge: sliding well sideways and rolling onto the downhill edge, it bites and
        // throws you forward over the skis (a stumble, not a fall)
        this.catchCool = Math.max(0, (this.catchCool ?? 0) - dt);
        if (ctrl > 0.5 && speed > 10 && Math.abs(slip) > 0.3 && e > 0.45 && Math.sign(this.edge) === Math.sign(slip) && !this.catchCool) {
          this.catchCool = 1.5; this.flailT = Math.max(this.flailT, 0.45);
          v.multiplyScalar(0.95); this.springV -= 1.2;
          this.emit('edgeCatch', { speed });
        }
      }
      this.avgHeading += wrapAngle(this.heading - this.avgHeading) * Math.min(1, dt / 1.1);
      // in the pipe the skis go where the speed goes: up a wall, over, and back down
      const onWall = inPipe !== null && Math.abs(inPipe) > PIPE.flat + 0.4;
      if (inPipe !== null && speed > 1.5) {
        const hv = Math.atan2(v.x, v.z);
        this.heading += wrapAngle(hv - this.heading) * Math.min(1, dt * (onWall ? 8 : 2.5 * (1 - Math.abs(c.steer))));
      }

      const f = this.forward(_f);
      const side = _s.crossVectors(n, f).normalize(); // skier's left
      // --- forces ---
      _a.set(0, -GRAV, 0);
      if (speed > 0.05) {
        // groomed ~0.045, ice glides, powder bogs down until the skis plane
        // (you ride on fast wax off-piste and in the parks: speed comes easily; the computer
        // riders and races keep the plain snow)
        const fast = this.isPlayer && this.world.arcade;
        const mu = ((fast ? 0.032 : 0.045) * (1 - ice * 0.45) + powder * (fast ? 0.075 - 0.04 * smoothstep(8, 22, speed) : 0.11 - 0.055 * smoothstep(8, 22, speed)) * (this.board ? 0.7 : 1)) * (W?.mu ?? 1);
        _a.addScaledVector(v, -(mu * N) / speed);
        this.updateDraft(dt);
        // a snowboarder can't tuck as small as a skier: standing sideways is more frontal area
        const tk = this.board ? 0.62 : 1;
        const CdA = (this.world.arcade ? (fast ? 0.4 - 0.25 * c.tuck * tk : 0.44 - 0.26 * c.tuck * tk) : 0.56 - 0.34 * c.tuck * tk) * (1 - this.draft * 0.38) + powder * (this.board ? 0.02 : 0.04) * (fast ? 1 : 1.5);
        const k = (0.5 * RHO * CdA) / this.mass;
        _a.addScaledVector(v, -k * speed);
      }
      // skating stride to get going on the flats
      vLong0 = v.dot(f);
      // (tuck on the flats and you skate hard to get going)
      const skMax = this.isPlayer ? 10 : 7;
      this.skating = c.tuck > 0.5 && vLong0 > -0.5 && vLong0 < skMax && c.brake < 0.1 && powder < 0.6 ? 1 : 0;
      if (this.skating) {
        this.skatePhase += dt * (5 + vLong0 * 0.4);
        const stroke = 0.55 + 0.9 * Math.max(0, Math.sin(this.skatePhase * 2));
        _a.addScaledVector(f, (this.isPlayer ? 3.8 : 2.5) * (1 - vLong0 / skMax) * stroke);
      }
      // hockey stop / snowplough: the skis thrown across, the edges scraping. Sideways friction on
      // corduroy is ~0.6 g; ice gives far less, powder and slush pile up against the skis
      if (c.brake > 0 && speed > 0.1) {
        const b = P ? c.brake * (((this.board ? 0.48 : 0.64) + powder * 0.25 + (W?.wet ?? 0) * 0.1) * N + 0.0025 * speed * speed) * (1 - ice * 0.75)
          : c.brake * (0.55 * N + 0.004 * speed * speed) * (1 - ice * 0.45);
        _a.addScaledVector(v, -Math.min(b, speed / dt) / speed);
      }
      v.addScaledVector(_a, dt);

      // --- edge grip: bend velocity toward the ski, skid when it can't ---
      const vLat = v.dot(side);
      if (onWall) {
        maxGrip *= 0.12; // on a wall: let it fall back down
        // and riders pump the transition on the way down
        if (v.dot(n) <= 0 && Math.sign(v.x) !== Math.sign(inPipe) && speed > 2) v.multiplyScalar(1 + 0.3 * dt);
      }
      const need = -vLat / dt;
      const applied = clamp(need, -maxGrip, maxGrip);
      const sp0 = v.length();
      v.addScaledVector(side, applied * dt);
      const rem = Math.abs(vLat + applied * dt);
      // carving turns your speed, it doesn't take it away: the edge bends the line. A skid's
      // grip pushes across skis that point off the line, so part of it pushes back against the
      // way you're going (F sin slip): that's what a skid costs
      // (thrown sideways to stop, the brake below does the stopping: on ice it hardly can)
      if (P && !onWall && sp0 > 0.5) {
        // (a butter's pivot is a press, not a skid: it has its own drag)
        const kS = this.butter ? 0 : c.brake > 0.05 ? 0.5 * (1 - ice * 0.7) : 1;
        const keep = Math.max(0, sp0 - Math.abs(applied) * Math.min(1, Math.abs(vLat) / sp0) * (rem > 0.02 ? kS : 0) * dt);
        v.multiplyScalar(keep / Math.max(1e-3, v.length()));
      }
      this.latAcc = this.latAcc * 0.8 + applied * 0.2;
      // skidding scrubs speed (little on ice, a lot in powder)
      let skid;
      if (P && c.brake < 0.05) {
        // (the player's skid has paid its F sin slip already: what's left is the snow the skis
        // shove sideways, a lot of it in powder and slush)
        skid = Math.min(rem, 6) * (onWall ? 0.08 : inPipe !== null ? 0.35 : 1);
        const plough = this.butter ? 0 : skid * (0.12 * (1 - ice * 0.7) + powder * 0.9 + (W?.wet ?? 0) * 0.15);
        const sp = v.length();
        if (plough > 0.01 && sp > 0.01) v.multiplyScalar(Math.max(0, sp - plough * dt) / sp);
      } else {
        skid = Math.min(rem, 6) * (onWall ? 0.08 : inPipe !== null ? 0.35 : 1) * (c.brake > 0.05 && P ? 0.15 : 1);
        if (skid > 0.05) {
          const sp = v.length();
          const scrub = 0.9 * GRAV * 0.55 * (1 - ice * 0.5 + powder * 0.4);
          if (sp > 0.01) v.multiplyScalar(Math.max(0, sp - skid * scrub * dt) / sp);
        }
      }
      if (P) {
        // pressure builds through a clean carve (the ski bends deeper into its groove and bites
        // harder) and is lost in a skid; let it go at the transition and the ski's rebound and the
        // legs' pump send you out of the turn a touch quicker
        const clean = c.brake < 0.05 && e > 0.3 && speed > 6 ? Math.min(1, e / 0.8) * (1 - smoothstep(0.05, 0.16, slipT)) : 0;
        this.press += (clean - this.press) * Math.min(1, dt * (clean > this.press ? 1.6 : 4));
        this.pressPeak = Math.max(this.pressPeak ?? 0, this.press);
        const es = e > 0.15 ? Math.sign(this.edge) : 0;
        if (es && es !== this.edgeSide) {
          if (this.edgeSide && this.pressPeak > 0.35 && speed > 5 && speed < 30 && !onWall) {
            v.addScaledVector(f, 0.7 * this.pressPeak * (1 - smoothstep(20, 30, speed)));
            this.springV += 0.6 * this.pressPeak; // the unweighting at the cross-over
          }
          this.edgeSide = es; this.pressPeak = 0;
        }
      }
      // (a crooked landing skids out for a moment)
      this.landSkid = Math.max(0, (this.landSkid ?? 0) - dt * 6);
      // (how much the skis are sliding: the spray, the smear and the scraping sound)
      const skidVis = P ? (c.brake > 0.05 ? skid / 0.15 : skid * 0.45) : skid;
      this.skid = this.skid * 0.85 + (skidVis + this.landSkid + c.brake * Math.min(speed, 12) * 0.25) * 0.15;
      this.scrape = this.scrape * 0.9 + ice * Math.min(1, this.skid / 1.5 + e * speed / 40) * 0.1;
    }
    // going backwards: the computer riders turn round; the player can ride it out switch
    if (vLong0 < -1 && !this.canSwitch) this.heading += wrapAngle(Math.atan2(v.x, v.z) - this.heading) * dt * 2;
    this.skiSwitch = this.canSwitch && vLong0 < -0.5;
    // riding backwards the tails lead: a little less edge to hold a line with
    if (this.skiSwitch) this.edge *= 1 - dt * 0.6;

    // butters: press a ski end into the snow, pivot on it, spring out of it
    this.butterCool = Math.max(0, this.butterCool - dt);
    if (this.world.arcade) this.stepButter(dt, c, speed);

    // jump (ollie) on release
    if (c.jump) this.jumpCharge = Math.min(1, this.jumpCharge + dt * (c7 ? 1.7 : 2.5));
    let pop = 0;
    let ramp = null;
    if (c7) {
      // Cork7's pop: 3.6-6.2 m/s off the snow. On a kicker's ramp the charge goes into the lip's
      // launch instead (held through it, or let go up to 0.3 s before it); let go earlier and
      // you hop off the ramp there and then
      const J = this.lipAhead(-0.5, 30);
      ramp = J && J.lip - this.pos.z <= J.ramp + 0.5 ? J : null;
      if (!c.jump && this.jumpCharge > 0) {
        if (ramp) { this.c7Buf = this.jumpCharge; this.c7BufT = 0.3; } else pop = 3.6 + 2.6 * this.jumpCharge;
        this.jumpCharge = 0;
      }
      if (this.c7BufT > 0 && (this.c7BufT -= dt) <= 0) { if (ramp) pop = 1.2 + 2.2 * this.c7Buf; this.c7Buf = 0; }
      this.perfectPop = false;
    } else if (!c.jump && this.jumpCharge > 0) {
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
    const z0 = this.pos.z;
    this.pos.addScaledVector(v, dt);
    if (pop > 0) { v.addScaledVector(n, pop); this.pos.addScaledVector(n, 0.05); }
    // Cork7's kickers launch you off the lip along its angle, with a kick of 1.2 m/s and up
    // to 2.2 more from a charged pop
    let launched = false;
    if (c7 && pop <= 0 && speed > 5) {
      for (const J of JUMPS) {
        if (J.drop || z0 >= J.lip || this.pos.z < J.lip || Math.abs(this.pos.x - centerX(J.lip) - J.dx) > J.w / 2 + 0.5) continue;
        const ch = Math.max(c.jump ? this.jumpCharge : 0, this.c7Buf || 0);
        const T = this.c7T, dx = Math.sin(T), dz = Math.cos(T);
        const lx = this.pos.x - dx * (this.pos.z - J.lip) / Math.max(0.2, dz), lz = J.lip;
        // (Cork7 throws you out at the kicker's own angle up, less if you hit it across)
        const jd = Math.atan2(centerX(J.lip + 1) - centerX(J.lip - 1), 2);
        const sl = J.lipAngle ? Math.tan((J.lipAngle * Math.PI) / 180) * Math.max(0.2, Math.cos(wrapAngle(T - jd)))
          : (heightAt(lx - dx * 0.05, lz - dz * 0.05) - heightAt(lx - dx * 0.65, lz - dz * 0.65)) / 0.6;
        const i = Math.atan(sl), a = 1.2 + 2.2 * ch, sp = v.length();
        const hor = sp * Math.cos(i), vert = sp * Math.sin(i) + a;
        v.set(dx * hor, vert, dz * hor);
        this.pos.y = Math.max(this.pos.y, heightAt(this.pos.x, this.pos.z) + 0.05);
        this.jumpCharge = 0; this.c7Buf = 0; this.c7BufT = 0;
        launched = ch > 0.05 ? 'pop' : 'kick';
        break;
      }
    }
    const gy = heightAt(this.pos.x, this.pos.z);
    let gInst = 1;
    let leave = this.pos.y > gy + 0.03 || !!launched;
    // Cork7 keeps you on the snow over a roll: only a lip, or snow falling away faster than the
    // air would drop you, throws you off it
    if (leave && c7 && pop <= 0 && this.pos.y - gy < 0.5 * C7.airG * dt * dt + 0.02 && !this.lipAhead(-1.6, 0.6)) leave = false;
    if (leave) {
      this.onGround = false; this.airTime = 0; this.spin = 0; this.pitch = 0; this.flipAcc = 0; this.flipVel = 0;
      this.trickType = null; this.flipAxis.set(1, 0, 0); this.flipDir = 0; this.grabs = {}; this.butter = null;
      this.grabTime = 0; this.maxAirY = this.pos.y - gy; this.takeoffZ = this.pos.z; this.popped = pop > 0 || launched === 'pop';
      this.shiftyT = 0; this.daffyT = 0; this.assist = null; this.tLand = 9; this.landProbe = 0; this.magnet = null; this.guide = null; this.released = 0;
      this.offKicker = !!this.lipAhead(-1.6, 0.6);
      // an armed quick trick goes on a real jump, not every little hop
      this.auto = null;
      if (this.autoArm && this.flightTime() > 0.55) { this.auto = this.autoArm; this.autoArm = null; }
      if (this.turnArm) { this.auto = { spin: 180, dir: this.turnArm, turn: true }; this.turnArm = 0; }
      if (pop <= 0) this.perfectPop = false;
      // wound up on the way in: the spin starts already turning
      this.spinVel = this.world.arcade ? -c.steer * (c7 ? C7.spin0 : 7.4) * 0.7 * (Math.abs(c.steer) > 0.3 ? 1 : 0) : 0;
      this.spinTight = Math.abs(c.steer) > 0.3 ? 0.7 : 0;
      this.fromRail = false;
      this.takeoffY = this.maxY = this.pos.y; this.takeoffX = this.pos.x; this.takeoffZ = this.pos.z;
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
      // (the player feels the snow's curve ahead of time: light over a roller, pressed in a dip)
      if (P) gInst = vn < 0 ? Math.max(gInst, this.load) : this.load;
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
    // (Cork7's model turns the skis themselves across in a skid)
    const skidT = c7 ? 0 : c.brake * (this.skidSide ?? 1) * 1.15;
    this.skidYaw += (skidT - this.skidYaw) * Math.min(1, dt * 7);
    if (c.brake === 0) this.skidSide = Math.sign(c.steer || this.lean || 1) * -1;
    this.compress = Math.max(0, this.compress - dt * 2.5);

    // ski tracks
    this.trackDist += speed * dt;
    if (this.trackSlot && this.trackDist > (this.isPlayer ? 0.3 : 0.45)) {
      this.trackDist = 0;
      // (how far the skis are turned across the way they're going: a skid's smear is that wide)
      const slip = speed > 1 ? wrapAngle(this.heading + this.skidYaw - Math.atan2(v.x, v.z)) : 0;
      this.trackSlot.add(this.pos, this.forward(_t), n, this.skid, powder, this.board, Math.abs(slip) > Math.PI / 2 ? Math.PI - Math.abs(slip) : slip, this.lean);
    }
    this.stuck = speed < 0.6 ? this.stuck + dt : 0;
    if (this.switchStance && (this.switchT += dt) > 4) this.switchStance = false;
  }

  // Cork7's ground model: one speed along the way you're going, the slope pulling at 1.7 g, a
  // little rolling friction, v^2 drag and what a held edge costs. The edge rolls toward the
  // stick at a rate (quicker slow, and quicker again cross-over to cross-over) and turns the line
  // at up to ~1.2 rad/s; the brake throws the skis across and stops you at 17 m/s^2; W pushes
  // on the poles until you're going (held 1.25 s, or past 18 m/s, it's a tuck).
  // Returns the speed along the skis (negative riding switch).
  groundC7(dt, c, n, powder, ice, W) {
    const v = this.vel;
    let speed = v.length();
    const hv = Math.atan2(v.x, v.z);
    // (a net, a tree, a landing or a butter moved us: take the line from the velocity again)
    if (this.c7T == null || !this.c7On || Math.abs(wrapAngle(hv - (this.c7Hv ?? hv))) > 0.02) this.c7T = speed > 0.3 ? hv : this.heading;
    this.c7On = true;
    let T = this.c7T;
    const brake = c.brake > 0.05 && !this.butter;
    const fwd = c.tuck > 0.5 && !this.butter && !brake && !c.jump;
    this.c7Fwd = fwd ? (this.c7Fwd ?? 0) + dt : 0;
    const tucking = fwd && (this.c7Fwd >= 1.25 || speed >= 18);
    this.c7Tuck = tucking;
    const s = Math.abs(c.steer) > 0.05 && !this.butter ? clamp(c.steer, -1, 1) : 0;
    // edge to edge: the cross-over loads the next turn (a quicker, tighter one)
    this.c7X = (this.c7X ?? 0) * Math.exp(-6 * dt);
    const E0 = this.c7E ?? 0;
    if (!brake && (this.c7Prev ?? 0) * s < 0) this.c7X = Math.abs(E0) * clamp(speed / 18, 0, 1);
    this.c7Prev = !s && Math.abs(E0) < 0.1 ? 0 : s || this.c7Prev || 0;
    // (just down from a jump the edges come back over ~0.2 s)
    this.c7Land = Math.max(0, (this.c7Land ?? 0) - dt * 3.4);
    const settle = smoothstep(0, 1, (1 - this.c7Land) / 0.68);
    // skis and a board ride differently. A board is wide and rolls edge to edge slower, pivots
    // round easily when slow, and has two different edges: on the toes (regular stance: turning
    // right) you kneel into a tighter arc, on the heels you sit back into a rounder one.
    const B = this.board;
    const E = this.c7E = ease(E0, s * settle, s ? (11 + this.c7X * 11) * clamp(13 / Math.max(speed, 1), 0.45, 1) * (B ? 0.78 : 1) : (B ? 7.5 : 9), dt);
    const slow = 1 - clamp(speed / 8, 0, 1);
    const heelToe = B ? (E * (this.boardSwitch ? -1 : 1) > 0 ? 1.08 : 0.93) : 1;
    // carve or skid: lean hard into it at speed and the edges can't hold the arc, the tails
    // break loose into a slash, the snow sprays and it scrubs speed (a board lets go sooner and
    // further than skis, which keep biting)
    const slashT = !brake && s ? smoothstep(0.78, 1, Math.abs(E)) * smoothstep(B ? 10 : 13, B ? 18 : 22, speed) * (B ? 1 : 0.65) * (1 - ice * 0.4) : 0;
    this.c7Slash = ease(this.c7Slash ?? 0, slashT * Math.sign(E), slashT > Math.abs(this.c7Slash ?? 0) ? 6 : 4, dt);
    const slash = Math.abs(this.c7Slash);
    const w = E * (0.8 + clamp(speed / 85, 0, 0.44)) * (1 + this.c7X * 0.14) * (brake ? 0.7 : 1) * (1 + slow * (B ? 0.6 : 0.3)) * heelToe * (1 + slash * 0.12);
    T -= w * dt; // (steering right turns the heading down)
    // the slope the way you're going (rise per metre)
    const sx = Math.sin(T) * 0.5, sz = Math.cos(T) * 0.5;
    const r = heightAt(this.pos.x + sx, this.pos.z + sz) - heightAt(this.pos.x - sx, this.pos.z - sz);
    // (deep snow off the piste, or a powder day, drags harder)
    const k = (tucking ? C7.kTuck : C7.kRide) * (powder > 0.5 ? C7.deep : 1);
    const Ja = this.lipAhead(0, 110, 0.25);
    const vs = Ja?.pspeed ? Ja.pspeed * (tucking ? 1.12 : 1.06) : tucking ? C7.vSoftTuck : C7.vSoft;
    const over = Math.max(0, speed - vs);
    // (a board floats in powder where skis sink; it stops a little slower, sideways on its heels)
    const deep = powder > 0.5 && B ? 0.72 : 1;
    const acc = C7.slopeG * Math.sin(Math.atan(-r)) - C7.roll - k * deep * speed * speed - Math.abs(E) * C7.edgeDrag - (brake ? C7.brake * (B ? 0.9 : 1) * clamp(c.brake, 0, 1) : 0)
      - Math.min(C7.govMax, C7.gov * over * over) - slash * (B ? 3.4 : 2.6) * (1 + powder);
    speed = clamp(speed + acc * dt, 0, C7.vmax);
    // poling: a push every 0.95 s, weaker the faster you're already going. A board has no poles:
    // the back foot comes out of its binding and skates, a smaller push, only to get going
    const poling = fwd && !tucking && (!B || speed < 7);
    if (poling) {
      const p0 = this.c7Pole ?? 0;
      this.c7Pole = (p0 + dt / (B ? 0.8 : 0.95)) % 1;
      if (p0 < 0.34 && this.c7Pole >= 0.34) speed = Math.min(C7.vmax, speed + (B ? 1.15 * (1 - speed / 7) + 0.2 : 1.65 * clamp(1 - speed / 52, 0.25, 1)));
    } else this.c7Pole = 0;
    // braking, the skis go across (the way you last steered) and the body slides a touch outward
    // (a board goes right across, on its heel edge; skis into a hockey stop)
    const across = B ? 1.85 : 1.2;
    this.c7Skid = ease(this.c7Skid ?? 0, brake ? (B ? (this.boardSwitch ? 1 : -1) : -(this.skidSide ?? -1)) * across * clamp(speed / 9, 0, 1) : this.c7Slash * 0.55, B ? 6 : 7, dt);
    // (the slide sideways bends the way you go, it doesn't add to the speed)
    const u = speed / Math.hypot(1, r), lat = this.c7Skid * 0.1, hk = 1 / Math.hypot(1, lat);
    v.set(u * hk * (Math.sin(T) + lat * Math.cos(T)), r * u, u * hk * (Math.cos(T) - lat * Math.sin(T)));
    this.c7T = T; this.c7Hv = Math.atan2(v.x, v.z);
    // the skis follow the line (tails first riding switch), turned across in a skid
    const sw = Math.abs(wrapAngle(this.heading - T)) > Math.PI / 2;
    if (!this.butter) this.heading += wrapAngle(T + (sw ? Math.PI : 0) - this.c7Skid * 0.72 - this.heading) * (1 - Math.exp(-12 * dt));
    this.avgHeading += wrapAngle(this.heading - this.avgHeading) * Math.min(1, dt / 1.1);
    // what the model and the snow see: the edge tipped, the turn's pull, the skid, the poles
    // (tipped further the faster you go: a slow turn is a flat pivot, a fast one is laid over)
    this.edge = E * EDGE_MAX * (0.55 + 0.4 * clamp(speed / 16, 0, 1)) * (1 - slash * 0.35);
    this.latAcc = -speed * w * 0.62;
    this.press = ease(this.press ?? 0, brake ? 0 : Math.abs(E) * clamp(speed / 15, 0, 1), 3, dt);
    this.skating = poling ? 1 : 0;
    this.skatePhase = this.c7Pole * Math.PI;
    this.landSkid = Math.max(0, (this.landSkid ?? 0) - dt * 6);
    this.skid = this.skid * 0.85 + (Math.abs(this.c7Skid) * Math.min(speed, 12) * 0.35 + slash * Math.min(speed, 16) * 0.3 + this.landSkid + Math.abs(E) * speed * 0.012) * 0.15;
    this.scrape = this.scrape * 0.9 + ice * Math.min(1, this.skid / 1.5 + Math.abs(this.edge) * speed / 40) * 0.1;
    this.updateDraft(dt);
    return v.dot(this.forward(_f));
  }

  stepAir(dt, c) {
    const v = this.vel;
    this.c7On = false;
    this.airTime += dt;
    this.gload = 0;
    this.edge *= 1 - Math.min(1, dt * 3);
    v.y -= this.airG * dt;
    const sp = v.length();
    const k = (0.5 * RHO * (0.6 - 0.2 * c.tuck)) / this.mass;
    // (Cork7's air hardly slows you at all)
    if (this.strict) { const d = Math.exp(-0.003 * dt); v.x *= d; v.z *= d; } else v.addScaledVector(v, -k * sp * dt);
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
        v.y += this.strict ? (this.offKicker ? 2.2 * this.jumpCharge : 0) : (1.9 + this.jumpCharge * 2.0) * (this.offKicker ? 1.18 : 0.85);
        this.popped = true;
        if (this.offKicker) { this.perfectPop = true; this.emit('pop', { perfect: true, late: true }); }
        this.jumpCharge = 0;
      }
      if (this.airTime > 0.22) this.jumpCharge = 0;
      // the body has inertia: spins build up and wind down instead of switching on and off
      const maxR = 7.4 * (c.grab ? 1.12 : 1) * (this.popped ? 1.06 : 1);
      // (let go of everything and the trick carries itself round to a clean landing)
      if (this.strict && !this.auto && !this.pipeAir) this.landGuide(dt, c);
      if (this.assist) { /* the landing assist has the rotation now */ }
      else if (this.strict && this.auto && !this.auto.turn) { /* a combo is flying the spin */ }
      else if (this.strict) {
        // Cork7's spin: held, it builds toward 6.3 rad/s (6.8 held hard, 9.5 with a grab), a
        // little slower than Cork7's 10/s so the body has some weight (18 the other way); let go,
        // it winds down at 6.5/s
        const s = Math.abs(c.steer) > 0.06 ? clamp(c.steer, -1, 1) : 0;
        this.spinTight = ease(this.spinTight ?? 0, Math.abs(s), s ? 12 : 10, dt);
        this.airGrab = ease(this.airGrab ?? 0, c.grab ? 1 : 0, 12, dt);
        const g = C7.spin0 + (C7.spin1 + (C7.spinGrab - C7.spin1) * this.airGrab - C7.spin0) * this.spinTight;
        this.c7G = g;
        const tgt = -s * g;
        if (!s && this.guide) { /* the guide has the spin */ }
        else {
          this.spinVel = ease(this.spinVel, tgt, s ? (tgt * this.spinVel < 0 ? C7.spinRev : C7.spinUp) : C7.spinDown, dt);
          if (!s && Math.abs(this.spinVel) < 0.015) this.spinVel = 0;
        }
      } else if (Math.abs(c.steer) > 0.15) {
        const tgt = -Math.sign(c.steer) * maxR * Math.min(1, Math.abs(c.steer) * 1.2);
        this.spinVel += clamp(tgt - this.spinVel, -dt * 30, dt * 30);
      } else if (this.strict) {
        // the player's own spin: let go and it carries on with its momentum, slowing (about a
        // sixth of a turn more from full speed); land it crooked and he goes down
        this.spinVel -= Math.sign(this.spinVel) * Math.min(Math.abs(this.spinVel), dt * 24);
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
    // (Cork7 turns you over the moment the key goes down; a straight flip that a spin joins inside
    // the first quarter second is made off-axis after all)
    const retype = this.strict && this.airTime <= 0.25 && (this.trickType === 'backflip' || this.trickType === 'frontflip') && Math.abs(c.steer) > 0.4 && fIn;
    if ((!this.trickType || retype) && !this.assist && this.airTime > (this.strict ? 0 : 0.04) && (fIn || rIn)) {
      // (Cork7: an off-axis flip has to be set at the lip, the spin and the flip together inside
      // 0.25 s; a flip started later while spinning is a flip, the spin just tilts it)
      const spinning = (Math.abs(c.steer) > 0.4 || Math.abs(this.spin) > 0.7) && (!this.strict || this.airTime <= 0.25);
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
    if (this.trickType && this.airTime > (this.strict ? 0 : 0.08) && !this.assist && !(this.strict && this.auto)) {
      const T = TRICKS[this.trickType];
      const held = T.roll ? rIn : fIn;
      if (this.strict) {
        // the same for flips: held it turns over, let go and it keeps turning, slowing
        // (Cork7's flips run like its spins: the same rates, the same build and wind-down; the
        // off-axis ones go over a little slower, the spin carrying the rest)
        const r = (this.c7G ?? C7.spin0) * T.rate / TRICKS.backflip.rate;
        const on = held && Math.sign(held) === Math.sign(this.flipDir);
        const want = on ? this.flipDir * r : 0;
        if (!on && this.guide?.pitch != null) { /* the guide has the flip */ }
        else this.flipVel = ease(this.flipVel, want, on ? (want * this.flipVel < 0 ? 3.2 : C7.spinUp) : C7.spinDown, dt);
        this.pitch += this.flipVel * dt;
        this.flipAcc += this.flipVel * dt;
      } else if (held && Math.sign(held) === Math.sign(this.flipDir)) {
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
    if (arc && !this.strict) this.landAssist(dt);
    else if (this.strict && !this.guide) this.landMagnet(dt);
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
    if (this.strict) {
      // Cork7: only the body tipped more than ~75 degrees off the landing (and coming down onto
      // it, or from a real air), or a huge hit, goes down. Sideways never does: it's SAVED IT
      const up = Math.cos(Math.min(pErr, Math.PI));
      crash = (up < 0.25 && (up < 0 || vn > 3 || this.airTime > 0.3)) || (vn > 33 && this.airTime > 0.35);
      // (on your tails or tips still stomps, up to 45 degrees)
      sketchy = !crash && big && (Math.abs(Math.sin(off)) >= 0.3 || pErr > Math.PI / 4);
    } else if (arc) {
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
    // ride away straight: the skis come onto the line of travel, but a crooked landing skids
    // round to it (the skis swing through what's left, scrubbing speed and throwing snow)
    if (!crash && arc) {
      const rel = wrapAngle(this.heading + this.skidYaw - hor - (back ? Math.PI : 0));
      this.heading = hor + (back ? Math.PI : 0); this.avgHeading = this.heading;
      if (Math.abs(rel) > 0.1) {
        this.skidYaw = rel;
        this.landSkid = Math.min(4, Math.abs(rel) * v.length() * 0.35);
        if (!this.strict) v.multiplyScalar(1 - Math.min(0.15, Math.abs(Math.sin(rel)) * 0.2));
      }
    }
    if (!crash) { this.switchStance = switchOut; this.switchT = 0; }
    // a snowboarder who lands a half turn rides away the other foot forward
    if (!crash && this.board && switchOut) this.boardSwitch = !this.boardSwitch;
    v.addScaledVector(n, Math.max(0, vn));
    // Cork7: the speed along the landing carries; sideways or tipped costs a few percent, and a
    // stomp onto a downslope sends you (+2.6 m/s)
    const stompC7 = this.strict && !crash && !sketchy && this.airTime > 0.65;
    if (this.strict && !crash) {
      const sp = v.length();
      const hx = sp > 0.1 ? v.x / sp : 0, hz = sp > 0.1 ? v.z / sp : 1;
      const d = heightAt(this.pos.x + hx * 0.5, this.pos.z + hz * 0.5) - heightAt(this.pos.x - hx * 0.5, this.pos.z - hz * 0.5);
      const kept = stompC7 ? 1 : 0.975 - Math.abs(Math.sin(off)) * 0.065 - clamp(pErr, 0, 1) * 0.045;
      const boost = stompC7 && sp > 3 && d < -0.15 ? 2.6 : 0;
      if (sp > 0.01) v.multiplyScalar(Math.min(C7.vmax, sp * kept + boost) / sp);
      this.c7Land = 1;
      this.landBoost = boost;
    }
    // flat landings cost speed (less so when sketchy is the worst of it)
    else v.multiplyScalar(1 - clamp((vn - 4) * (arc ? 0.02 : 0.03), 0, 0.35) - (sketchy ? 0.08 : 0));
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
      stomp: this.strict ? stompC7 : !crash && !sketchy && vn < 3.2 && this.airTime > 0.7, perfectPop: !!this.perfectPop,
      // (how sideways it came down, 0..1: Cork7 pays a sideways landing down to half)
      side: Math.abs(Math.sin(off)), boost: this.landBoost ?? 0,
      rise: this.maxY - this.takeoffY, pipe: this.pipeAir, switchIn: this.takeoffSwitch, switchOut, fromRail: !!this.fromRail,
      board: this.board, shifty: this.shiftyT >= 0.22, daffy: this.daffyT >= 0.22,
      // (off plain snow: no kicker, rail or pipe under the takeoff)
      hop: !this.offKicker && !this.fromRail && !this.pipeAir, vz: v.z,
    };
    if (sketchy) { this.flailT = 0.7; this.wobT = 0; this.wobS = Math.sign(wrapAngle(this.heading + this.skidYaw - hor) || Math.random() - 0.5); }
    this.landSpin = this.spinVel;
    this.pipeAir = false; this.perfectPop = false; this.spinVel = 0; this.assist = null;
    // the legs soak it up: a spring that dips and comes back (and the body folds a little over them)
    this.springV -= Math.min(vn, 14) * 0.16;
    if (!crash && big) { this.landT = 0; this.landA = clamp(0.3 + vn / 11, 0.3, 1) * (sketchy ? 1.15 : 1); }
    // (a flip a touch short or long comes the rest of the way round on the snow, not in one frame)
    if (!crash && this.pitch) this.landTilt = clamp(wrapAngle(this.trickType ? this.pitch : -this.pitch), -0.7, 0.7);
    if (!crash) { this.pitch = 0; this.spin = 0; this.flipAcc = 0; this.trickType = null; }
    if (this.trackSlot) {
      this.trackSlot.break();
      // the skis slap a dent into the landing (the harder, the deeper and longer)
      if (this.airTime > 0.25 && vn > 1.5) this.trackSlot.dent(this.pos, v, n, this.board ? 0.4 : 0.36, 0.9 + Math.min(vn, 14) * 0.06, 0.4 + Math.min(vn, 12) / 14);
    }
    // how hard: on the head (upside down) is what really hurts
    const hit = vn + (pErr > 2.2 ? v.length() * 0.5 : pErr > 1.6 ? v.length() * 0.3 : 0);
    // B held as you touch down: off a bump, a roller or a small hop you land straight into a
    // butter that keeps the spin going; off a real jump the nose digs in and you faceplant
    const intoButter = arc && this.strict && !crash && this.controls.butter && !this.board && this.butterCool <= 0 && this.airTime > 0.12;
    if (intoButter && (this.airTime > 1.0 || vn > 7)) { this.startCrash('faceplant', Math.min(vn, 8)); return; }
    if (crash) this.startCrash('landing', hit); else this.emit('land', trick);
    if (intoButter && v.length() > 2.5) {
      const sv = this.landSpin ?? 0;
      this.butter = { t: 0, tail: this.controls.brake > 0, turn: 0, dir: 0, carry: Math.abs(sv) > 1.5 ? Math.sign(sv) : 0, landed: true };
      this.butterHeld = true;
    }
  }

  // The last moments before touchdown: whatever rotation is closest to a clean landing gets
  // finished on time (spins to the nearest half turn, flips to the nearest whole one, the way
  // they were already going if well into it). Too far off to save is still a bail.
  landAssist(dt) {
    if (this.airTime < 0.2 || this.pipeAir) return;
    this.probeLand(dt);
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

  // time to touchdown along the ballistic path (re-checked every few frames)
  probeLand(dt) {
    this.tLand -= dt;
    if (--this.landProbe > 0) return;
    this.landProbe = 4;
    const p = this.pos, v = this.vel, G = this.airG;
    let t = 0.04;
    for (; t < 1.6; t += 0.04) {
      const x = p.x + v.x * t, z = p.z + v.z * t, y = p.y + v.y * t - 0.5 * G * t * t;
      if (y <= heightAt(x, z)) break;
    }
    this.tLand = t;
  }

  // Cork7's landing assist: let go of the keys in the air and the spin and flip wind down on
  // their own (6.5/s); once the turning has slowed under 2.8 rad/s the body is steered to the
  // nearest clean landing from where it's coasting to (the nearest half spin, upright), at up to
  // 4.8 rad/s, eased in at 30 rad/s^2. Holding a key again hands the rotation straight back.
  landGuide(dt, c) {
    // (nor straight off the lip, still rising)
    if (Math.abs(c.steer) > 0.06 || c.flip || c.roll || (this.airTime < 0.22 && this.vel.y > 0)) { this.guide = null; this.released = 0; return; }
    this.released = (this.released ?? 0) + dt;
    const hor = Math.atan2(this.vel.x, this.vel.z);
    if (!this.guide) {
      if (this.released <= 0.035 || Math.hypot(this.spinVel, this.flipVel) >= 2.8) return;
      // (where the spin coasts to, if it isn't flipping too)
      const carry = Math.abs(this.flipVel) < 0.1 ? this.spinVel / C7.spinDown : 0;
      const spin = Math.round((this.heading - hor + carry) / Math.PI);
      const pitch = this.trickType ? Math.round(this.pitch / TAU) * TAU : null;
      this.guide = { spin, pitch };
    }
    const G = this.guide;
    const drive = (d, vel) => {
      const want = Math.sign(d) * Math.min(4.8, Math.abs(d) * 8);
      return Math.abs(d) < 0.002 && Math.abs(vel) < 0.05 ? 0 : vel + clamp(want - vel, -dt * 30, dt * 30);
    };
    this.spinVel = drive(G.spin * Math.PI + hor - this.heading, this.spinVel);
    if (G.pitch != null) this.flipVel = drive(G.pitch - this.pitch, this.flipVel);
  }

  // The player's near misses: in the last half second, a trick that's nearly round (the skis
  // within ~85 degrees of straight, the flip within ~155 of upright) is pulled in to land.
  // Further off than that nothing saves it.
  landMagnet(dt) {
    if (this.airTime < 0.2 || this.pipeAir) { this.magnet = null; return; }
    // (Cork7: nothing takes the rotation off you while you're still holding it round)
    const c = this.controls;
    if (!this.auto && (Math.abs(c.steer) > 0.06 || c.flip || c.roll)) { this.magnet = null; this.probeLand(dt); return; }
    this.probeLand(dt);
    if (this.tLand > 0.45) { this.magnet = null; return; }
    const hor = Math.atan2(this.vel.x, this.vel.z);
    // (a combo can still be upgraded by another tap: follow what it's aiming for now)
    if (this.magnet == null || (this.auto?.plan && this.assist)) {
      const f = (this.heading - hor) / Math.PI;
      // (a combo aims for the trick it was asked for; otherwise the nearest clean landing)
      const spin = this.auto?.plan && this.assist ? this.assist.spin : Math.round(f);
      let pitch = null, reach = 2.75;
      if (this.trickType) {
        if (this.auto?.plan && this.assist?.pitch != null) pitch = this.assist.pitch;
        else {
          // halfway round or so, it goes on round the way it's turning rather than back
          const near = Math.round(this.pitch / TAU) * TAU;
          const ahead = (this.flipDir > 0 ? Math.ceil(this.pitch / TAU) : Math.floor(this.pitch / TAU)) * TAU;
          const dA = Math.abs(ahead - this.pitch), dN = Math.abs(near - this.pitch);
          if (dA < 3.6 && dA <= dN + 0.8) { pitch = ahead; reach = 3.6; } else pitch = near;
        }
      }
      // (off the end of a rail slide the skis swing back round from right across: a quarter turn
      // with nothing done about it still rides away)
      const ok = Math.abs((spin - f) * Math.PI) < (this.fromRail ? 1.75 : 1.5) && (pitch == null || Math.abs(pitch - this.pitch) < reach);
      this.magnet = ok ? { spin, pitch } : false;
    }
    const m = this.magnet;
    if (!m) return;
    const k = Math.min(1, dt / Math.max(this.tLand - 0.03, dt * 1.5));
    const dS = clamp((m.spin * Math.PI + hor - this.heading) * k, -16 * dt, 16 * dt);
    this.heading += dS; this.spin += dS; this.spinVel = dS / dt;
    if (m.pitch != null) {
      const dP = clamp((m.pitch - this.pitch) * k, -16 * dt, 16 * dt);
      this.pitch += dP; this.flipAcc += dP; this.flipVel = 0;
    }
  }

  // time to touchdown along the ballistic path from here
  flightTime() {
    const p = this.pos, v = this.vel, G = this.airG;
    let t = 0.04;
    for (; t < 3.2; t += 0.04) {
      const x = p.x + v.x * t, z = p.z + v.z * t, y = p.y + v.y * t - 0.5 * G * t * t;
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
      // (no more than a body can really turn in the air there is: Cork7's own rates, ~545
      // degrees a second at the most spinning, ~390 flipping; a bigger ask comes out smaller)
      // (what's still to turn: a combo upgraded mid-spin has some of it done already)
      const sd = A.dir ?? 1;
      const f0 = A.f0 ?? (this.heading - hor) / Math.PI;
      const doneS = Math.abs((this.heading - hor) / Math.PI - f0) * Math.PI, doneF = Math.abs(this.pitch);
      const capSp = this.strict ? C7.spinGrab : 13.5, capFl = this.strict ? C7.spin1 : 12.5;
      while (spin > 0 && !A.turn && ((spin / 180) * Math.PI - doneS) / avail > capSp) spin -= 180;
      while (flips > 0 && (flips * TAU - doneF) / avail > capFl) flips--;
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
      A.plan = { spin, flips, T, end: this.airTime + T, f0 };
      this.spinVel = 0;
      this.assist = { spin: Math.round(f0) + sd * (spin / 180), pitch: type ? fDir * flips * TAU : null };
    }
    c.steer = 0; c.flip = 0; c.roll = 0;
    const a = this.assist;
    const tl = A.plan.end - this.airTime;
    if (a && !A.turn && (this.strict || (tl > 0.45 && this.tLand > 0.45))) {
      // the body turns at its own pace: done before touchdown, or a crash
      this.easeTrick(A, a, hor, dt, tl);
    } else if (a && (A.turn || (tl > 0.45 && this.tLand > 0.45))) {
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

  // A planned trick's rotation, eased the way a body really turns: it leaves the lip already
  // turning, is quickest through the middle and slows to a stop with time left to spot the
  // landing. It's done no later than a steady turn would be (the window ends before touchdown),
  // and never quicker than the body can turn; past that the shape flattens toward a steady rate.
  easeTrick(A, a, hor, dt, tl) {
    const rel = this.heading - hor;
    let E = A.ease;
    if (!E) {
      const strict = this.strict;
      const win = Math.max(0.12, tl - (strict ? 0.2 : 0.4));
      const dS = a.spin * Math.PI - rel, dP = a.pitch != null ? a.pitch - this.pitch : 0;
      const gk = A.grab ? 1.12 : 1;
      const rS = 7.4 * gk * (this.popped ? 1.06 : 1);
      const fr = TRICKS[this.trickType]?.rate ?? 5.6, rP = fr * gk * (this.perfectPop ? 1.08 : 1);
      const capS = strict ? C7.spinGrab : 14, capP = strict ? C7.spin1 : 13;
      // its natural length peaks near the body's own rate; a big air stretches it over most of the flight
      const D = Math.min(win, Math.max(Math.abs(dS) * 1.3 / rS, Math.abs(dP) * 1.3 / rP, win * 0.55));
      // (already turning: wound up off the lip, or a combo upgraded mid-spin, carries straight on)
      const shape = (d, v, cap) => {
        if (Math.abs(d) < 1e-3) return { w: 1, b: 0 };
        const w = clamp((v * Math.sign(d) * D) / Math.abs(d), 0.45, 2);
        const pk = hermPeak(w), avg = Math.abs(d) / D;
        return { w, b: pk > 1 ? clamp((cap / avg - 1) / (pk - 1), 0, 1) : 1 };
      };
      E = A.ease = { t0: this.airTime, D, rel0: rel, p0: this.pitch, dS, dP, s: shape(dS, this.spinVel, capS), p: shape(dP, this.flipVel, capP), capS, capP };
    }
    const u = clamp((this.airTime + dt - E.t0) / E.D, 0, 1);
    // (the landing pull may already be ahead of it: never drag it back)
    let dS = E.rel0 + E.dS * herm(u, E.s) - rel;
    if (dS * E.dS < 0) dS = 0;
    dS = clamp(dS, -E.capS * dt, E.capS * dt);
    this.heading += dS; this.spin += dS; this.spinVel = dS / dt;
    if (a.pitch != null) {
      let dP = E.p0 + E.dP * herm(u, E.p) - this.pitch;
      if (dP * E.dP < 0) dP = 0;
      dP = clamp(dP, -E.capP * dt, E.capP * dt);
      this.pitch += dP; this.flipAcc += dP; this.flipVel = dP / dt;
    }
  }

  // What the body is doing for the trick, for the pose (skiermodel.js reads it as model.trk):
  // shoulders leading a spin with the hips following, the head spotting the landing, knees to
  // the chest through a flip, the legs snapping straight at the pop, the knees soaking up a
  // landing, the wobble of a sketchy one, and a rail slide's balance.
  trickPose(dt) {
    const T = (this.trk ??= { lead: 0, look: 0, lookW: 0, tuck: 0, pop: 0, land: 0, wob: 0, rail: 0, bal: 0, tweak: 0, gh: 0, sr: 0, sa: 0, fr: 0, lh: null, lp: 0 });
    const c = this.controls, g = this.grind;
    const air = !this.onGround && !g && this.crash <= 0;
    if (dt > 0) {
      // the rotation the body actually made (whatever flew it: a combo, the keys, the assist)
      const sr = air && T.lh != null ? wrapAngle(this.heading - T.lh) / dt : 0;
      const fr = air && T.lh != null ? clamp((this.pitch - T.lp) / dt, -20, 20) : 0;
      const k = Math.min(1, dt * 12), sr0 = T.sr;
      T.sr += (sr - T.sr) * k;
      T.sa += (clamp((T.sr - sr0) / dt, -60, 60) - T.sa) * Math.min(1, dt * 8);
      T.fr += (fr - T.fr) * k;
    }
    T.lh = this.heading; T.lp = this.pitch;
    const ease = (key, to, rate) => { T[key] += (to - T[key]) * Math.min(1, dt * rate); };
    // the shoulders throw the spin and the hips follow; slowing to spot, the shoulders stop first.
    // Loading the pop with a turn held, they wind up the other way first
    let lead = 0, look = 0, lookW = 0;
    if (air) lead = clamp(T.sr * 0.05 + T.sa * 0.012, -0.55, 0.55);
    else if (g) lead = clamp(wrapAngle(-g.side), -0.65, 0.65); // (sliding: the chest faces down the rail)
    else if (this.world.arcade && this.jumpCharge > 0.05 && Math.abs(c.steer) > 0.3) lead = Math.sign(c.steer) * 0.5 * Math.min(1, this.jumpCharge * 2.5);
    ease('lead', lead, air || g ? 10 : 7);
    // the head leads into a spin, looking for the next half turn, then spots the landing
    if (air && this.airTime > 0.08) {
      const f = (this.heading - Math.atan2(this.vel.x, this.vel.z)) / Math.PI;
      const tgt = T.sr > 1 ? Math.ceil(f - 0.02) : T.sr < -1 ? Math.floor(f + 0.02) : Math.round(f);
      const rem = (tgt - f) * Math.PI;
      look = clamp(rem, -1.25, 1.25);
      lookW = 1 - smoothstep(1.3, 2.3, Math.abs(rem));
    } else if (g) { look = clamp(wrapAngle(-g.side), -1.2, 1.2); lookW = 0.8; }
    ease('look', look, 12); ease('lookW', lookW, 8);
    // knees to the chest through a flip, opening out to spot the landing
    ease('tuck', air && this.trickType ? clamp(Math.abs(T.fr) / 4.5, 0, 1) : 0, 9);
    // the legs snap straight as he pops off the lip, then draw up
    T.pop = air && this.popped && !this.fromRail ? 1 - smoothstep(0.02, 0.26, this.airTime) : 0;
    // a grab held long gets tweaked out further
    T.gh = air && c.grab ? T.gh + dt : 0;
    ease('tweak', smoothstep(0.3, 1.0, T.gh), 5);
    // touchdown: a quick dip the knees soak up, then back up; a sketchy one wobbles
    if (this.landT != null) {
      this.landT += dt;
      T.land = (this.landA ?? 0.5) * (this.landT < 0.07 ? this.landT / 0.07 : Math.exp(-(this.landT - 0.07) * 5.5));
      if (this.landT > 1.2 || !this.onGround) { this.landT = null; T.land = 0; }
    } else T.land = 0;
    if (this.wobT != null) {
      this.wobT += dt;
      T.wob = (this.wobS ?? 1) * Math.sin(this.wobT * 13) * Math.exp(-this.wobT * 3.2);
      if (this.wobT > 1.3 || !this.onGround) { this.wobT = null; T.wob = 0; }
    } else T.wob = 0;
    ease('rail', g ? 1 : 0, 10);
    T.bal = g ? g.bal + Math.sin(this.time * 3.3) * 0.25 : 0;
    // what's left of a flip that came down a touch short or long, eased out instead of snapped
    if (this.landTilt) { this.landTilt *= Math.exp(-dt * 14); if (Math.abs(this.landTilt) < 0.005 || !this.onGround) this.landTilt = 0; }
    return T;
  }

  // a kicker whose lip is between a and b metres ahead of us (and we're on it; cone: how much
  // wider the window opens per metre still to go, for one we're only heading for)
  lipAhead(a, b, cone = 0) {
    const z = this.pos.z;
    for (const J of JUMPS) {
      const d = J.lip - z;
      if (d < a || d > b) continue;
      if (Math.abs(this.pos.x - centerX(J.lip) - J.dx) < J.w / 2 - 0.3 + d * cone) return J;
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
    // (landed into it with a spin on: the spin carries the pivot on round)
    if (!b.dir && b.carry) b.dir = b.carry;
    if (!b.dir && Math.abs(c.steer) > 0.5) b.dir = -Math.sign(c.steer);
    // keep holding the turn to carry the pivot on round (Cork7: A/D drives one half turn; a spin
    // you landed into it with carries it on to a 360)
    const cap = (this.strict ? (b.carry ? 2 : 1) : 3) * Math.PI;
    const more = b.dir && Math.abs(c.steer) > 0.5 && b.turn < cap - 0.05;
    const goal = more ? cap : Math.min(cap, Math.max(Math.PI, Math.ceil((b.turn - 0.4) / Math.PI) * Math.PI));
    if (b.dir && b.turn < goal) {
      const d = Math.min(goal - b.turn, dt * 5.6);
      b.turn += d; this.heading += b.dir * d;
    }
    // the press drags: you slow while it's held
    this.vel.multiplyScalar(1 - dt * 0.35);
    c.tuck = 0; c.brake = 0;
    const spinning = b.dir && b.turn % Math.PI > 0.05 && b.turn < goal;
    // (Cork7: a press lasts up to 1.5 s, a pivot gets to finish its half turn, then a second's
    // rest before the next B)
    if ((!c.butter && !spinning) || b.t > (spinning ? 2.4 : 1.5)) {
      this.butter = null; this.butterHeld = c.butter; this.butterCool = this.strict ? 1 : 0.6;
      // let go early and the skis spring back
      this.butterPop = b.t < 1.4 ? 2.2 : 0;
      if (b.t >= 0.25 && speed > (this.strict ? 3 : 1.5)) this.emit('butter', { tail: b.tail, spin: Math.round((b.turn - 0.3) / Math.PI) * 180, t: b.t, board: this.board, landed: !!b.landed });
      if (b.turn > Math.PI / 2) this.heading = Math.atan2(this.vel.x, this.vel.z) + (Math.abs(wrapAngle(this.heading - Math.atan2(this.vel.x, this.vel.z))) > Math.PI / 2 ? Math.PI : 0);
      if (this.board && Math.round(b.turn / Math.PI) % 2 === 1) this.boardSwitch = !this.boardSwitch;
    }
  }

  // ---- crashes: tumble and slide, lie there a moment, get up where you stopped ----
  // hit: how hard it was (m/s into the thing, or into the snow)
  startCrash(reason, hit = 0) {
    if (this.crash > 0) return;
    const sp = this.speed;
    this.crash = 1; this.crashPhase = 'tumble'; this.crashT = 0; this.crashSpeed = sp;
    this.ragSeed = Math.random() * 6; this.halfTurns = 0;
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
    this.emit('crash', { reason, speed: sp, hit });
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
      // the body ploughs a trench down the snow
      this.trackDist += sp * dt;
      if (this.trackSlot && sp > 0.6 && this.trackDist > 0.35) { this.trackDist = 0; this.trackSlot.add(this.pos, _t.copy(v).normalize(), n, 2, 1); }
    } else if (this.trackSlot?.last) this.trackSlot.break();
    const sp = v.length();
    if (this.crashPhase === 'tumble') {
      this.tumble += this.tumbleRate * dt;
      // every half turn over, the body slams the snow and bounces
      const ht = Math.floor(Math.abs(this.tumble) / Math.PI);
      if (ht !== this.halfTurns) {
        this.halfTurns = ht;
        if (sp > 4 && this.pos.y <= gy + 0.05) {
          v.y += 0.8 + Math.min(sp, 30) * 0.07;
          this.emit('tumbleHit', { speed: sp });
          this.trackSlot?.dent(this.pos, v, n, 0.55, 1.2, 1);
        }
      }
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
      // (the player's catch is wider, Cork7-style: ride up the ramp close to the line and you're on)
      if (_r.s < 0.05 || _r.s > R.L - 0.4 || Math.abs(_r.lat) > R.hw + (this.strict ? 0.6 : 0.32)) continue;
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
      // (Cork7: two swaps a bar, and they lock in; a turn in a hop is the hop's own, up to 180)
      if (st && st !== g.lastSt && g.hop && this.strict) {
        if (g.hop.q < 2) { g.hop.q++; g.sideT -= st * Math.PI / 2; this.emit('railSwap', g); }
      } else if (st && st !== g.lastSt && (!this.strict || g.swaps < 2)) {
        g.sideT -= st * Math.PI / 2; g.swaps++;
        this.emit('railSwap', g);
      }
      const q = Math.round(wrapAngle(g.sideT) / (Math.PI / 2));
      g.kind = q === 0 ? '50-50' : Math.abs(q) === 2 ? 'Switch 50-50' : R.kind === 'box' ? 'Boardslide' : 'Lipslide';
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
    // a hop on the rail: up off the bar and back down onto it, still the same slide
    if (g.hop) {
      g.hop.vy -= this.airG * dt; g.hop.y += g.hop.vy * dt;
      if (g.hop.y <= 0) {
        // (Cork7: a hop pays 450 a quarter turn turned in it, for the first two hops of a bar)
        if (g.hop.q > 0 && (g.hopTurns ??= []).length < 2) g.hopTurns.push(g.hop.q * 90);
        g.hop = null; this.emit('railHopLand', g);
      }
    }
    const hy = g.hop ? g.hop.y : 0;
    this.pos.set(R.a.x + R.dir.x * g.s + R.dir.z * g.lat, _r.y + hy, R.a.z + R.dir.z * g.s - R.dir.x * g.lat);
    this.vel.set(R.dir.x * g.v * il, sl * g.v * il + (g.hop ? g.hop.vy : 0), R.dir.z * g.v * il);
    this.edge = 0; this.skid = 0; this.compress = g.hop ? 0.1 : 0.35; this.gload = 1;
    if (c.jump && !g.hop) { this.jumpCharge = Math.min(1, this.jumpCharge + dt * 2.5); g.press = (g.press ?? 0) + dt; }
    // W / S on a rail: nose or tail press
    if (c.flip > 0) g.nose = (g.nose ?? 0) + dt;
    else if (c.flip < 0) g.tail = (g.tail ?? 0) + dt;
    let pop = !c.jump && this.jumpCharge > 0;
    // (Cork7: a pop with rail still to go is a small hop that comes back down on the same rail;
    // only from the last few metres does it take you off)
    if (pop && this.strict && !g.hop && R.L - g.s > Math.max(4, g.v * 0.5)) {
      g.hop = { y: 0, vy: 2.6 + this.jumpCharge * 1.2, q: 0 };
      g.hops = (g.hops ?? 0) + 1;
      this.jumpCharge = 0; pop = false;
      this.emit('railHop', g);
    }
    const fell = Math.abs(g.bal) > 1;
    if (g.s >= R.L || g.v < 0.4 || pop || fell) this.endGrind(pop, fell);
  }

  // the trick so far, mid-air: what the landing would call it if it came down now (only the
  // rotation already finished counts)
  airTrick() {
    const grabs = Object.entries(this.grabs).filter(([, t]) => t >= 0.25).sort((a, b) => b[1] - a[1]);
    const sp = Math.abs(this.spin), fl = Math.abs(this.trickType ? this.pitch : this.flipAcc);
    return {
      air: this.airTime, height: this.maxAirY,
      spin: Math.floor((sp + 0.35) / Math.PI) * 180, spinDir: Math.sign(this.spin), spin90: Math.floor((sp + 0.2) / (Math.PI / 2)) * 90,
      flips: Math.floor((fl + 0.6) / TAU), flipDir: this.trickType ? this.flipDir : Math.sign(this.flipAcc), type: this.trickType,
      grabs, rise: this.maxY - this.takeoffY, pipe: this.pipeAir, switchIn: this.takeoffSwitch, fromRail: !!this.fromRail,
      board: this.board, shifty: this.shiftyT >= 0.22, daffy: this.daffyT >= 0.22,
    };
  }

  endGrind(pop, fell) {
    const g = this.grind;
    this.grind = null; this.grindCool = 0.35;
    const dist = Math.max(0, g.s - g.d0);
    this.onGround = false; this.airTime = 0.13; this.spin = 0; this.pitch = 0; this.flipAcc = 0; this.flipVel = 0; this.grabTime = 0; this.guide = null;
    this.takeoffY = this.maxY = this.pos.y; this.maxAirY = 0; this.takeoffX = this.pos.x; this.takeoffZ = this.pos.z;
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
      if (g.v > 3) this.startCrash('rail', g.v);
    }
    this.emit('grindEnd', { kind: g.kind, rail: g.R.name, dist, t: g.t, fell, spinIn: g.spinIn, swaps: g.swaps, hops: g.hops ?? 0, hopTurns: g.hopTurns ?? [], switchIn: g.switchIn, pop, press: g.press ?? 0, nose: g.nose ?? 0, tail: g.tail ?? 0, board: this.board });
  }

  collide() {
    const w = this.world;
    if (!w.forest) return;
    w.forest.query(this.pos.x, this.pos.z, near);
    // through a tree's branches: they catch you and drag you back, then let you go
    let bough = null;
    for (const o of near) {
      if (!o.br || this.crash > 0 || !this.isPlayer || this.ai) continue;
      const d = Math.hypot(this.pos.x - o.x, this.pos.z - o.z);
      if (d > o.br || this.pos.y > heightAt(o.x, o.z) + o.th * 0.9) continue;
      const k = 1 - d / o.br;
      const sp = this.speed;
      if (sp > 0.5) this.vel.multiplyScalar(Math.max(0, 1 - (1.6 + sp * 0.12) * k * (1 / 100)));
      bough = o;
    }
    if (bough && bough !== this.bough) this.emit('branches', { x: bough.x, z: bough.z, h: bough.th, speed: this.speed });
    this.bough = bough;
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
        const sp = this.speed;
        this.vel.multiplyScalar(1 - o.slow);
        this.flailT = Math.max(this.flailT, o.slow > 0.05 ? 0.45 : 0.2);
        this.world.smash?.hit(o, this.vel);
        this.emit('smash', { kind: o.kind, speed: sp });
        // a pole or a sign to the body at speed takes you down with it (gates break away)
        if (o.kind !== 'gate' && sp > (o.kind === 'sign' ? 7 : 9) && this.crash <= 0 && this.onGround) {
          this.startCrash(o.kind, sp);
          this.emit('impact', { kind: o.kind, x: o.x, z: o.z, speed: sp });
        }
        continue;
      }
      const d = Math.sqrt(d2) || 0.01;
      const nx = dx / d, nz = dz / d;
      const into = -(this.vel.x * nx + this.vel.z * nz);
      this.pos.x = o.x + nx * minD; this.pos.z = o.z + nz * minD;
      if (into > 0) {
        // a trunk, a rock, a tower: there's no riding into one and carrying on
        if (into > (o.kind === 'tree' ? 3.2 : 4.5) && this.crash <= 0) {
          this.startCrash(o.kind, into);
          this.emit('impact', { kind: o.kind, x: o.x, z: o.z, speed: into });
        }
        this.vel.x += nx * into * 1.15; this.vel.z += nz * into * 1.15;
      }
    }
  }

  // ---- visuals ----
  updateVisual(dt, camPos) {
    this.contact(camPos);
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
    } else if (this.landTilt && this.onGround) {
      g.quaternion.multiply(_q2.setFromAxisAngle(this.flipAxis, this.landTilt));
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
    // (only a whisker: the skis stay on top of the snow you can see)
    if (this.onGround && !this.grind) {
      const sink = this.surf.powder * clamp(0.05 - this.speed * 0.003, 0, 0.05) * (this.crash > 0 ? 0.5 : 1);
      this.sinkV = (this.sinkV ?? 0) + (sink - (this.sinkV ?? 0)) * Math.min(1, dt * 6);
    } else this.sinkV = (this.sinkV ?? 0) * (1 - Math.min(1, dt * 8));
    g.position.y -= this.sinkV;
    // the slope bends under a 1.7 m ski: lift him so neither the tip nor the tail is in the snow
    if (this.onGround && !this.grind && !this.crash) {
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const reach = this.board ? 0.8 : 0.9;
      let lift = 0;
      for (const k of [-1, -0.5, 0.5, 1]) {
        const x = this.pos.x + fx * reach * k, z = this.pos.z + fz * reach * k;
        // height of the plane the skis lie in there, against the snow itself
        const plane = this.pos.y - (this.normal.x * (x - this.pos.x) + this.normal.z * (z - this.pos.z)) / Math.max(0.3, this.normal.y);
        lift = Math.max(lift, heightAt(x, z) - plane);
      }
      this.liftV = (this.liftV ?? 0) + (Math.min(lift, 0.35) + 0.015 - (this.liftV ?? 0)) * Math.min(1, dt * 14);
      g.position.y += this.liftV;
    } else this.liftV = 0;

    const dist = camPos ? camPos.distanceTo(this.pos) : 0;
    m.setDetail(dist < 70);
    m.setReal?.(dist < 160);
    // a long way off another rider is drawn with the rest of them in one go (main.js)
    this.far = !this.isPlayer && dist > Skier.farDist && dist < Skier.drawDist;
    m.group.visible = dist < Skier.drawDist && !this.far;
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
    m.trk = this.trickPose(vdt);
    const free = !this.onGround && !crashed && !this.trickType && !c.grab && Math.abs(c.steer) < 0.3;
    this.shiftyS += ((free && c.up ? 1 : 0) - this.shiftyS) * Math.min(1, vdt * 9);
    this.daffyS += ((free && c.down ? 1 : 0) - this.daffyS) * Math.min(1, vdt * 9);
    const gCrouch = clamp((this.gload - 1) * 0.32, -0.12, 0.5);
    // fore-aft acceleration, smoothed, for the body's rock
    const spNow = this.speed;
    if (this.lastSp != null && vdt > 0) this.accelS = (this.accelS ?? 0) + ((spNow - this.lastSp) / vdt - (this.accelS ?? 0)) * Math.min(1, vdt * 6);
    this.lastSp = spNow;
    // riding backwards: he turns his shoulders and looks back over one of them to see where he's going
    const back = this.skiSwitch && this.onGround && !crashed && !this.grind;
    if (back && Math.abs(c.steer) > 0.3) this.lookSide = -Math.sign(c.steer);
    this.backK = (this.backK ?? 0) + ((back ? 1 : 0) - (this.backK ?? 0)) * Math.min(1, vdt * 6);
    const lookS = (this.lookSide ?? 1) * this.backK;
    // (the player stands tall like a Cork7 rider; the computer riders sit lower)
    let crouch = (this.strict ? 0.07 : 0.18) + Math.abs(this.lean) * (this.board ? 0.26 : 0.12) + this.compress * 0.35 + gCrouch * (this.board ? 1 : 0.7) + this.jumpCharge * 0.5 + (c.brake > 0 ? 0.25 : 0) - this.spring * 1.6;
    if (crashed) crouch = this.crashPhase === 'up' ? 0.9 * this.lie + 0.3 : 0.55;
    // (the player's rider drawn a size up, like Cork7's: easier to read on the hill and in a trick)
    const sc = this.strict ? 1.13 : 1;
    if (m.group.scale.x !== sc) m.group.scale.setScalar(sc);
    m.pose({
      // (the body's tilt eases off past ~40 degrees: angulation takes the rest)
      lean: crashed ? 0 : 0.85 * Math.tanh(this.lean / 0.85),
      angulate: this.board ? 0.55 : 0.7,
      tall: this.strict && !this.board ? 1 : 0,
      // the skis speeding up under him (+) or checked (-): the upper body rocks with it
      // (deep and slow in powder he sits back a little to keep the tips up)
      fore: crashed || !this.onGround ? 0 : clamp(this.accelS ?? 0, -6, 6) / 6 - this.surf.powder * 0.25 * (1 - smoothstep(6, 16, sp)),
      crouch: clamp(crouch, 0, 1),
      // (a Cork7 rider tucking only hunches over a little, eased into)
      tuck: (this.tuckPose = ease(this.tuckPose ?? 0, crashed || (this.skating && !this.board) ? 0 : clamp((this.c7 && this.onGround ? (this.c7Tuck ? 1 : 0) : c.tuck) * smoothstep(5, 9, sp), 0, 1) * (1 - airK * 0.5) * (this.strict ? 0.18 : 1), 4, dt)),
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
      // how wild the limbs are: thrown about while it tumbles, sprawled once it stops
      rag: crashed ? clamp(Math.abs(this.tumbleRate ?? 0) / 7 + this.speed / 30, 0, 1) * (this.crashPhase === 'tumble' ? 1 : 0.15) : 0,
      ragT: this.crashT * 1.0, ragSeed: this.ragSeed ?? 0,
      twist: crashed ? 0 : clamp(wrapAngle(this.avgHeading - this.heading) * 0.85, -0.7, 0.7) * (1 - this.backK) + lookS * 0.62,
      skate: this.skating && !crashed && !this.board ? 1 : 0,
      skatePhase: this.skatePhase,
      // (skidding, the skis come off their edges a little: flatter, sliding)
      edge: this.onGround && !crashed ? this.edge * (1 - 0.3 * smoothstep(0.6, 2.5, this.skid)) : 0,
      // the ski bends deeper as the pressure builds through a clean carve
      flex: this.onGround && !crashed ? clamp(Math.abs(this.lean) * 1.1 * this.gload + (this.press ?? 0) * 0.25, 0, 1) + clamp(Math.abs(this.spring) * 4, 0, 0.5) : 0,
      // (and chatters at speed on hard snow, and when the edges skip across it in a skid)
      chatter: this.onGround && !crashed ? smoothstep(15, 30, sp) * (0.25 + this.surf.ice * 2.5) * (0.6 + 0.4 * Math.abs(this.lean))
        + smoothstep(0.5, 2.5, this.skid) * smoothstep(5, 14, sp) * (0.3 + this.surf.ice * 1.2) * (1 - this.surf.powder) : 0,
      wind: crashed ? 0 : smoothstep(3, 22, Math.hypot(this.vel.x, this.vel.y, this.vel.z)),
      slap: this.onGround && !crashed ? clamp(Math.abs(this.springV) * 0.12, 0, 0.6) : 0,
      switch: !!this.boardSwitch,
      t: this.time,
    });
  }

  // a soft dark patch on the snow under the rider: the sky light the body and skis block.
  // Fades as he leaves the ground
  contact(camPos) {
    if (typeof document === 'undefined') return;
    if (!this.blob) {
      if (!BLOB.tex) {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
        r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.6)'); r.addColorStop(0.65, 'rgba(255,255,255,0.15)'); r.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = r; g.fillRect(0, 0, 64, 64);
        BLOB.tex = new THREE.CanvasTexture(c);
        BLOB.geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      }
      this.blob = new THREE.Mesh(BLOB.geo, new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: BLOB.tex, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      this.blob.renderOrder = 1;
      this.world.scene.add(this.blob);
    }
    const b = this.blob;
    const gy = heightAt(this.pos.x, this.pos.z), h = Math.max(0, this.pos.y - gy);
    b.visible = !this.hidden && !this.held && !this.frozen && h < 4 && (!camPos || this.pos.distanceToSquared(camPos) < 70 * 70);
    if (!b.visible) return;
    normalAt(this.pos.x, this.pos.z, _bn);
    b.position.set(this.pos.x, gy + 0.03, this.pos.z);
    b.quaternion.setFromUnitVectors(UP, _bn).multiply(_bq.setFromAxisAngle(UP, this.heading));
    const lying = this.crash > 0 ? 1 : 0;
    // (just the contact darkening under the skis: the sun casts the real shadow)
    b.scale.set(0.6 + h * 0.4 + lying * 0.7, 1, (this.board ? 1.3 : 1.75) + h * 0.4 + lying * 0.3);
    b.material.opacity = 0.26 * Math.max(0, 1 - h / 2);
  }

  dispose() {
    if (this.blob) this.world.scene.remove(this.blob);
    this.world.scene.remove(this.model.group);
  }
}
