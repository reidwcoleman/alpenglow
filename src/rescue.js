// After a crash you don't get up from: the run stops, the rescue helicopter comes in low,
// lowers its orange stretcher, winches you up and flies you to the mountain hospital. You
// walk out patched up, pick where you want to ride from, and take the chairlift there: 30
// seconds on the chair, while the terrain at the other end is built so you drop straight in.
import * as THREE from 'three';
import { heightAt, centerX, centerSlope, ZONES, START_Z, FINISH_Z } from './course.js';
import { Helicopter } from './heli.js';
import { posedOne } from './people.js';
import { trailDiff } from './props.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
export const RIDE = 30; // seconds on the chairlift

export class Rescue {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.heli = new Helicopter(game.scene);
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3();
  }

  // the player has gone down hard and isn't getting up
  start(p) {
    const g = this.g;
    this.active = true; this.p = p;
    this.phase = 'down'; this.t = 0; this.T = 0;
    this.prevState = g.state;
    g.state = 'rescue';
    $('hud').classList.add('hidden');
    this.site = p.pos.clone();
    this.camPos.copy(g.camera.position);
    this.camLook.copy(p.pos);
    this.ui('SEVERE WIPEOUT', 'Ski patrol has called the rescue helicopter');
    g.audio.thump(1.4);
  }

  ui(big, small, cls = '') {
    const el = $('rescue');
    el.className = cls;
    el.innerHTML = big ? `<b>${big}</b>${small ? `<span>${small}</span>` : ''}` : '';
    el.classList.toggle('hidden', !big);
  }

  fade(on) { $('fade').classList.toggle('on', on); }

  // the next phase
  go(phase) { this.phase = phase; this.t = 0; }

  update(dt) {
    if (!this.active) return;
    const g = this.g, p = this.p, H = this.heli;
    this.t += dt; this.T += dt;
    if (H.group.visible) H.update(dt, this.phase === 'hospital' ? Math.max(0.15, 1 - this.t * 0.25) : 1);
    // its sound: by how near it is
    g.audio.rotor(H.group.visible && this.phase !== 'hospital' && this.phase !== 'lift' ? Math.max(0, 1 - g.camera.position.distanceTo(H.group.position) / 420) : 0);
    const site = this.site;
    if (this.phase === 'down') {
      // wait for him to come to rest, then the helicopter comes
      if ((p.speed < 0.4 && this.t > 2.2) || this.t > 6) {
        this.site.copy(p.pos);
        // in from up the valley, nose first
        this.from = new THREE.Vector3(site.x + 160, site.y + 120, site.z - 380);
        this.hover = new THREE.Vector3(site.x + 1.6, heightAt(site.x, site.z) + 21, site.z - 0.2);
        H.group.visible = true; H.group.position.copy(this.from);
        H.setCable(0.5);
        this.go('inbound');
        this.ui('RESCUE INBOUND', 'Stay still');
      }
    } else if (this.phase === 'inbound') {
      const k = ease(this.t / 6.5);
      H.group.position.lerpVectors(this.from, this.hover, k);
      // nose down coming in fast, flaring to a hover
      const dir = _v.subVectors(this.hover, this.from).setY(0).normalize();
      H.group.rotation.set(0.22 * (1 - k) * Math.sin(Math.PI * Math.min(1, k * 1.4)) - 0.1 * (k > 0.85 ? (1 - k) * 6 : 0), Math.atan2(dir.x, dir.z), 0);
      if (this.t > 6.5) { this.go('lower'); this.ui('', ''); }
    } else if (this.phase === 'lower') {
      H.group.position.y = this.hover.y + Math.sin(this.T * 1.3) * 0.15;
      H.group.rotation.x *= 0.95;
      // the stretcher down to the snow beside him
      const gy = heightAt(site.x, site.z);
      const full = H.group.position.y + H.winch.y - gy - 1.3 - 0.15;
      H.setCable(0.5 + (full - 0.5) * ease(this.t / 3.5));
      if (this.t > 4.2) {
        this.go('load');
        p.frozen = true; p.held = true;
        this.ui('ON THE STRETCHER', '');
      }
    } else if (this.phase === 'load' || this.phase === 'winch') {
      H.group.position.y = this.hover.y + Math.sin(this.T * 1.3) * 0.15;
      if (this.phase === 'winch') {
        const gy = heightAt(site.x, site.z);
        const full = this.hover.y + H.winch.y - gy - 1.3 - 0.15;
        H.setCable(Math.max(0.4, full * (1 - ease(this.t / 4))));
        if (this.t > 4.3) { this.go('away'); this.ui('', ''); this.awayFrom = H.group.position.clone(); }
      } else if (this.t > 1.4) this.go('winch');
      this.carry();
    } else if (this.phase === 'away') {
      // off toward the hospital, climbing, then the picture fades
      const hosp = g.props.hospital;
      const dir = _v.subVectors(hosp.pad, this.awayFrom).setY(0).normalize();
      const k = this.t;
      H.group.position.copy(this.awayFrom).addScaledVector(dir, 4 * k * k + 2 * k).add(_w.set(0, k * k * 1.2, 0));
      H.group.rotation.set(0.18 * Math.min(1, k), Math.atan2(dir.x, dir.z), 0);
      this.carry();
      if (this.t > 3.2) this.fade(true);
      if (this.t > 4.2) this.toHospital();
    } else if (this.phase === 'hospital') {
      // out of the doors, a few steps, then where to?
      const h = g.props.hospital;
      const walk = Math.min(this.t, 3.2) * 1.0;
      p.pos.copy(h.door).addScaledVector(h.out, walk);
      p.pos.y = h.door.y;
      this.walkPose(dt);
      if (this.t > 0.4) this.fade(false);
      if (this.t > 3.6 && !this.picking) this.pick();
    } else if (this.phase === 'lift') {
      this.ride(dt);
    } else if (this.phase === 'drop') {
      if (this.t > 0.6) this.finish();
    }
  }

  // the rider lying on the stretcher under the helicopter
  carry() {
    const p = this.p, M = p.model, H = this.heli;
    H.group.updateMatrixWorld(true);
    H.bed(_v);
    // on his back along the stretcher, feet first the way the helicopter faces
    M.group.position.copy(_v);
    const yaw = H.group.rotation.y;
    M.group.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, yaw, 0, 'YXZ'));
    M.group.position.addScaledVector(_w.set(0, 1, 0), 0.22).addScaledVector(_w.set(Math.sin(yaw), 0, Math.cos(yaw)), 0.9);
    p.pos.copy(_v);
  }

  // patched up and walking out (skis over the shoulder: they're off for now)
  walkPose(dt) {
    const p = this.p, M = p.model, h = this.g.props.hospital;
    M.group.position.copy(p.pos);
    M.group.quaternion.setFromAxisAngle(_w.set(0, 1, 0), Math.atan2(h.out.x, h.out.z));
    this.walkT = (this.walkT ?? 0) + dt;
    M.pose({ lean: 0, angulate: 0, crouch: 0.05 + Math.abs(Math.sin(this.walkT * 6)) * 0.06, tuck: 0, plow: 0, air: 0, grab: 0, grabTip: 0, grabKind: 'mute', cross: 0, press: 0, shifty: 0, daffy: Math.sin(this.walkT * 6) * 0.35 * (this.t < 3.2 ? 1 : 0), flail: 0, spinRate: 0, look: 0, polePlant: 0, poleSide: 1, crash: false, twist: 0, skate: 0, skatePhase: 0, edge: 0, switch: false, t: this.g.time });
  }

  toHospital() {
    const g = this.g, p = this.p, H = this.heli;
    // healed
    g.injuries.heal();
    p.endCrash();
    const h = g.props.hospital;
    // the helicopter's back on its pad, rotors winding down
    H.group.position.copy(h.pad); H.group.rotation.set(0, h.yaw + 0.6, 0);
    H.setCable(0.3);
    this.go('hospital');
    this.walkT = 0;
    p.held = true; p.frozen = true;
    this.hideSkis(true);
    this.ui('PATCHED UP', 'Shredline Mountain Hospital');
    // a view of the doors
    this.camPos.copy(h.door).addScaledVector(h.out, 9).add(_w.set(-h.out.z * 4, 3.2, h.out.x * 4));
    this.camLook.copy(h.door).add(_w.set(0, 1.4, 0));
    this.snapCam = true;
  }

  hideSkis(on) {
    const P = this.p.model.parts;
    for (const k of ['skiL', 'skiR', 'sbindL', 'sbindR', 'poleL', 'poleR', 'deck', 'bindL', 'bindR']) if (P[k]) P[k].visible = !on;
  }

  // where to? every part of the run, from the top
  pick() {
    this.picking = true;
    const list = [{ name: 'The top', z: START_Z }];
    let z0 = START_Z;
    for (const Z of ZONES) { if (Z.name !== 'Finish' && z0 > START_Z + 30 && z0 < FINISH_Z - 120) list.push({ name: Z.name, z: z0 }); z0 = Z.z1; }
    this.choices = list;
    this.sel = 0;
    const el = $('dest');
    el.innerHTML = `<div class="dh">TAKE THE CHAIRLIFT TO</div>${list.map((c, i) => `<button data-i="${i}"><i class="dif ${trailDiff(c.name)}"></i>${c.name}<small>${Math.round(c.z)} m</small></button>`).join('')}<div class="dn">↑ ↓ to choose · Enter to ride the lift</div>`;
    el.classList.remove('hidden');
    for (const b of el.querySelectorAll('button')) {
      b.onclick = () => this.choose(+b.dataset.i);
      b.onmouseenter = () => { this.sel = +b.dataset.i; this.mark(); };
    }
    this.mark();
    this.ui('', '');
  }

  mark() { [...$('dest').querySelectorAll('button')].forEach((b, i) => b.classList.toggle('on', i === this.sel)); }

  keys(inp) {
    if (!this.picking) return;
    if (inp.hit('ArrowDown') || inp.hit('Numpad2')) { this.sel = Math.min(this.choices.length - 1, this.sel + 1); this.mark(); }
    if (inp.hit('ArrowUp') || inp.hit('Numpad8')) { this.sel = Math.max(0, this.sel - 1); this.mark(); }
    if (inp.hit('Enter') || inp.hit('NumpadEnter') || inp.hit('Space')) this.choose(this.sel);
  }

  // onto the chair: the last stretch of the lift up to beside where you're going
  choose(i) {
    if (!this.picking) return;
    this.picking = false;
    $('dest').classList.add('hidden');
    const g = this.g, props = g.props, c = this.choices[i];
    this.dest = c;
    // the point on the up line nearest that part of the run
    const line = props.cableLines[0], n = line.length;
    let total = 0, at = 0, best = Infinity;
    for (let k = 0; k < n - 1; k++) {
      const a = line[k], b = line[k + 1], L = a.distanceTo(b);
      for (let s = 0; s <= 1; s += 0.05) {
        const z = a.z + (b.z - a.z) * s;
        const d = Math.abs(z - (c.z + 10));
        if (d < best) { best = d; at = total + L * s; }
      }
      total += L;
    }
    const v = 7.5;
    this.d1 = at; this.d0 = Math.max(0, at - v * RIDE); this.v = (this.d1 - this.d0) / RIDE;
    // the chair, with you on it
    const p = this.p;
    if (!this.chair) {
      this.chair = new THREE.Mesh(props.chairGeo, props.vc);
      this.chair.castShadow = true;
      g.scene.add(this.chair);
    }
    if (this.seat) g.scene.remove(this.seat);
    this.seat = p.model.rig ? posedOne(p.model.rig.kit, p.model.outfit, 'sit') : null;
    if (this.seat) {
      const pel = this.seat.userData.pelvis;
      this.seat.geometry.translate(0, -2.26 - pel.y, 0.12 - pel.z);
      this.chair.add(this.seat);
      this.seat.position.x = 0.333;
    }
    // and your skis (or board) hanging off your boots
    if (!this.skis && props.seatSkis) {
      this.skis = new THREE.Mesh(props.seatSkis.geometry, new THREE.MeshStandardMaterial({ color: p.model.outfit.skis ?? 0xd8342c, roughness: 0.4 }));
      this.skis.position.x = 0.333; this.skis.castShadow = true;
      this.chair.add(this.skis);
    }
    this.chair.visible = true;
    p.model.group.visible = false;
    p.hidden = true;
    this.fade(true);
    setTimeout(() => this.fade(false), 450);
    this.go('lift');
    this.liftStart = true;
  }

  ride(dt) {
    const g = this.g, props = g.props;
    const d = this.d0 + this.v * Math.min(this.t, RIDE);
    props.cablePoint(0, d, _v);
    const yaw = Math.atan2(props.liftDir.x, props.liftDir.z);
    this.chair.position.copy(_v);
    // a gentle swing on the hanger
    this.chair.quaternion.setFromEuler(new THREE.Euler(Math.sin(this.T * 0.9) * 0.025, yaw, Math.sin(this.T * 0.6) * 0.02, 'YXZ'));
    // the far end gets built while you ride
    const destX = centerX(this.dest.z), destZ = this.dest.z;
    g.terrain.warm?.(destX, destZ, 3);
    const left = Math.max(0, Math.ceil(RIDE - this.t));
    const k = Math.round(Math.min(1, (g.terrain.warmDone ?? 1)) * 100);
    this.ui(`CHAIRLIFT · ${left}s`, `to ${this.dest.name} · ${k < 100 ? `getting it ready ${k}%` : 'ready'}`, 'lift');
    if (this.t >= RIDE) { this.fade(true); this.go('drop'); this.ui('', ''); }
  }

  // off the chair and onto the snow at the top of where you picked
  finish() {
    const g = this.g, p = this.p;
    this.active = false;
    this.chair.visible = false;
    this.heli.group.visible = false;
    p.model.group.visible = true;
    p.hidden = false; p.held = false; p.frozen = false;
    this.hideSkis(false);
    p.model.lod = -1;
    const z = Math.max(this.dest.z + 12, START_Z + 4);
    p.place(centerX(z), z, Math.atan2(centerSlope(z), 1), 2);
    g.state = this.prevState === 'rescue' ? 'free' : this.prevState;
    $('hud').classList.remove('hidden');
    g.rig.snap = true;
    this.fade(false);
    this.ui('', '');
    g.say('DROP IN', '', this.dest.name, '', 1800);
  }

  // stop wherever it's got to (a restart, the menu)
  abort() {
    if (!this.active) return;
    this.active = false; this.picking = false;
    this.g.audio.rotor(0);
    $('dest').classList.add('hidden');
    this.heli.group.visible = false;
    if (this.chair) this.chair.visible = false;
    const p = this.p;
    if (p) { p.model.group.visible = true; p.hidden = false; p.held = false; p.frozen = false; this.hideSkis(false); }
    this.fade(false); this.ui('', '');
    $('hud').classList.remove('hidden');
  }

  // the rescue's camera
  camera(cam, dt) {
    const p = this.p, H = this.heli, site = this.site;
    let pos = _v, look = _w;
    if (this.phase === 'down') {
      // circling slowly over him
      const a = this.T * 0.25;
      pos.set(p.pos.x + Math.sin(a) * 6, p.pos.y + 2.6, p.pos.z + Math.cos(a) * 6);
      look.copy(p.pos).add(new THREE.Vector3(0, 0.4, 0));
    } else if (this.phase === 'inbound' || this.phase === 'lower' || this.phase === 'load' || this.phase === 'winch') {
      // low on the snow looking up at it coming in
      pos.set(site.x - 16, heightAt(site.x - 16, site.z + 20) + 2.2, site.z + 20);
      look.copy(site).lerp(H.group.position, this.phase === 'inbound' ? 0.6 : 0.42);
    } else if (this.phase === 'away') {
      pos.copy(this.awayFrom).add(new THREE.Vector3(-14, -6, 18));
      pos.y = Math.max(pos.y, heightAt(pos.x, pos.z) + 2);
      look.copy(H.group.position);
    } else if (this.phase === 'hospital') {
      pos.copy(this.camPos); look.copy(this.camLook);
    } else if (this.phase === 'lift' || this.phase === 'drop') {
      // out in front of the chair looking back at you, the valley falling away behind
      const c = this.chair.position, dir = this.g.props.liftDir;
      const sw = Math.sin(this.t * 0.12) * 1.6;
      pos.copy(c).addScaledVector(dir, 4.6).add(new THREE.Vector3(dir.z * (1.6 + sw), -1.4, -dir.x * (1.6 + sw)));
      look.copy(c).add(new THREE.Vector3(dir.z * -0.3, -2.3, -dir.x * -0.3)).addScaledVector(dir, -2);
    }
    const k = this.snapCam || this.phase === 'lift' ? 1 : Math.min(1, dt * (this.phase === 'down' ? 5 : 2.5));
    this.snapCam = false;
    this.camPos.lerp(pos, k); this.camLook.lerp(look, k);
    if (this.phase === 'hospital') { this.camPos.copy(pos); this.camLook.copy(look); }
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    cam.fov = this.phase === 'lift' ? 62 : 55;
    cam.updateProjectionMatrix();
  }
}
