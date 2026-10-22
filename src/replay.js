// Replays: the player's run is recorded 30 times a second as snapshots (src/snap.js).
// Watching one freezes the world, poses a stand-in skier from the recording and films
// it with a choice of cameras: chase, TV, GoPro, orbit and drone. A range can be saved
// as a video clip.
import * as THREE from 'three';
import { Skier } from './skier.js';
import { snap, applySnap, SNAP_N } from './snap.js';
import { heightAt } from './course.js';
import { patchTree } from './atmos.js';

const MAX = 30 * 60 * 8; // eight minutes
const CAMS = [['chase', 'Chase'], ['tv', 'TV'], ['helmet', 'GoPro'], ['orbit', 'Orbit'], ['drone', 'Drone']];
const $ = (id) => document.getElementById(id);

export class Replay {
  constructor(game) {
    this.g = game;
    this.frames = [];
    this.times = [];
    this.marks = []; // tricks worth jumping to: { t, name }
    this.acc = 0;
    this.on = false;
    this.t = 0; this.speed = 1; this.playing = true; this.cam = 0;
    this.bind();
  }

  reset() { this.frames = []; this.times = []; this.marks = []; this.clock = 0; this.outfitFor = null; }

  // called every rendered frame while riding
  record(dt, s) {
    this.clock = (this.clock ?? 0) + dt;
    this.acc += dt;
    if (this.acc < 1 / 30) return;
    this.acc = 0;
    const f = this.frames.length >= MAX ? this.frames.shift() : new Float32Array(SNAP_N);
    if (this.times.length >= MAX) this.times.shift();
    snap(s, f);
    this.frames.push(f); this.times.push(this.clock);
  }

  // the whole recording, flat, for the vault
  pack() {
    const n = this.frames.length, f = new Float32Array(n * SNAP_N);
    this.frames.forEach((x, i) => f.set(x, i * SNAP_N));
    const t0 = this.times[0] ?? 0;
    return { frames: f, times: Float32Array.from(this.times, (t) => t - t0), marks: this.marks.map((m) => ({ t: m.t - t0, name: m.name })) };
  }

  // a saved run from the vault, to watch in place of the live recording
  load(run) {
    this.frames = [];
    for (let i = 0; i < run.times.length; i++) this.frames.push(run.frames.subarray(i * SNAP_N, (i + 1) * SNAP_N));
    this.times = Array.from(run.times);
    this.marks = run.marks.map((m) => ({ ...m }));
    this.outfitFor = run.outfit;
    this.clock = this.times[this.times.length - 1] ?? 0;
  }

  mark(name) { this.marks.push({ t: this.clock, name }); if (this.marks.length > 60) this.marks.shift(); }

  get length() { return this.times.length ? this.times[this.times.length - 1] - this.times[0] : 0; }

  // range: 'last' (the last trick, or the last 15 s) or 'all'
  open(range = 'last') {
    if (this.times.length < 10 || this.on) return false;
    const g = this.g;
    this.on = true;
    this.t1 = this.times[this.times.length - 1];
    this.t0 = this.times[0];
    if (range === 'last') {
      const m = this.marks[this.marks.length - 1];
      this.from = m && this.t1 - m.t < 25 ? Math.max(this.t0, m.t - 5) : Math.max(this.t0, this.t1 - 15);
    } else this.from = this.t0;
    this.t = this.from;
    this.playing = true; this.speed = range === 'last' ? 0.5 : 1;
    // a stand-in skier wearing the player's outfit
    const outfit = this.outfitFor ?? g.outfit();
    // a different board/skis or kit: dress a new stand-in
    const key = JSON.stringify(outfit);
    if (this.ghost && this.ghostKey !== key) { this.ghost.dispose(); this.ghost = null; }
    this.ghostKey = key;
    if (!this.ghost) {
      this.ghost = new Skier({ scene: g.scene, tracks: null, skiers: [] }, { outfit, isPlayer: true });
      patchTree(this.ghost.model.group);
    }
    this.ghost.model.group.visible = true;
    this.hidden = g.skiers.filter((s) => s.model.group.visible);
    for (const s of g.skiers) s.model.group.visible = false;
    this.camMode = g.rig.mode;
    this.fromMenu = g.state === 'menu';
    if (this.fromMenu) $('menu').classList.add('hidden');
    $('replay').classList.remove('hidden');
    $('hud').classList.add('hidden');
    this.setCam(0);
    this.syncUI();
    return true;
  }

  close() {
    if (!this.on) return;
    if (this.rec) this.stopClip(false);
    this.on = false;
    const g = this.g;
    this.ghost.model.group.visible = false;
    for (const s of this.hidden) s.model.group.visible = true;
    g.rig.mode = this.camMode; g.rig.snap = true;
    $('replay').classList.add('hidden');
    if (g.state !== 'menu') $('hud').classList.remove('hidden');
    if (this.fromMenu) { $('menu').classList.remove('hidden'); g.menuTab?.('replays'); }
    if (g.state === 'results') $('results').classList.remove('hidden');
  }

  frameAt(t) {
    const T = this.times;
    let lo = 0, hi = T.length - 1;
    if (t <= T[0]) return [0, 0, 0];
    if (t >= T[hi]) return [hi, hi, 0];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
    return [lo, hi, (t - T[lo]) / (T[hi] - T[lo] || 1)];
  }

  setCam(i) {
    this.cam = (i + CAMS.length) % CAMS.length;
    const k = CAMS[this.cam][0];
    if (['chase', 'tv', 'helmet'].includes(k)) this.g.rig.mode = k;
    this.g.rig.snap = true; this.g.rig.tvSpot = null;
    this.orbitA = 0;
    $('rp-cam').textContent = CAMS[this.cam][1];
  }

  update(dt) {
    const g = this.g, gh = this.ghost;
    if (this.playing) {
      this.t += dt * this.speed;
      if (this.t >= this.t1) {
        this.t = this.t1;
        if (this.rec) this.stopClip(true);
        this.playing = false;
      }
    }
    const [a, b, k] = this.frameAt(this.t);
    applySnap(gh, this.frames[a], this.frames[b], k);
    gh.updateVisual(dt * this.speed, g.camera.position);
    gh.model.group.visible = true;
    // cameras
    const cam = g.camera, key = CAMS[this.cam][0];
    if (key === 'orbit' || key === 'drone') {
      this.orbitA += dt * (key === 'orbit' ? 0.35 : 0.08);
      const p = gh.pos;
      const dir = Math.atan2(gh.vel.x, gh.vel.z) + (key === 'orbit' ? this.orbitA + 1.2 : Math.PI);
      const r = key === 'orbit' ? 6.5 : 16, h = key === 'orbit' ? 1.6 : 11;
      const tx = p.x + Math.sin(dir) * r, tz = p.z + Math.cos(dir) * r;
      const ty = Math.max(p.y + h, heightAt(tx, tz) + 1);
      this.cp = this.cp ?? new THREE.Vector3(tx, ty, tz);
      if (g.rig.snap) { this.cp.set(tx, ty, tz); g.rig.snap = false; }
      this.cp.lerp(new THREE.Vector3(tx, ty, tz), Math.min(1, dt * 4));
      cam.position.copy(this.cp);
      cam.up.set(0, 1, 0);
      cam.lookAt(p.x, p.y + 0.9, p.z);
      cam.fov = key === 'orbit' ? 55 : 48;
      cam.updateProjectionMatrix();
    } else g.rig.update(dt * Math.max(this.speed, 0.25), gh);
    this.syncUI();
  }

  syncUI() {
    const span = this.t1 - this.t0 || 1;
    $('rp-bar').value = String(Math.round(((this.t - this.t0) / span) * 1000));
    $('rp-play').textContent = this.playing ? '❚❚' : '▶';
    $('rp-time').textContent = `${(this.t - this.t0).toFixed(1)} / ${span.toFixed(1)} s`;
    for (const b of document.querySelectorAll('#rp-speeds button')) b.classList.toggle('on', Number(b.dataset.s) === this.speed);
  }

  bind() {
    $('rp-play').onclick = () => { if (this.t >= this.t1) this.t = this.from; this.playing = !this.playing; };
    $('rp-cam').onclick = () => this.setCam(this.cam + 1);
    $('rp-exit').onclick = () => this.close();
    $('rp-bar').oninput = (e) => { this.t = this.t0 + (Number(e.target.value) / 1000) * (this.t1 - this.t0); };
    for (const b of document.querySelectorAll('#rp-speeds button')) b.onclick = () => { this.speed = Number(b.dataset.s); };
    $('rp-clip').onclick = () => (this.rec ? this.stopClip(true) : this.startClip());
  }

  // keys while watching: Space play/pause, arrows scrub, C camera, 1-3 speed, V/Esc out
  keys(inp) {
    if (inp.hit('Space')) { if (this.t >= this.t1) this.t = this.from; this.playing = !this.playing; }
    if (inp.hit('ArrowLeft')) this.t = Math.max(this.t0, this.t - 2);
    if (inp.hit('ArrowRight')) this.t = Math.min(this.t1, this.t + 2);
    if (inp.hit('KeyC')) this.setCam(this.cam + 1);
    if (inp.hit('Digit1')) this.speed = 0.25;
    if (inp.hit('Digit2')) this.speed = 0.5;
    if (inp.hit('Digit3')) this.speed = 1;
    if (inp.hit('Escape') || inp.hit('KeyV')) this.close();
  }

  // save what plays from here to the end as a video (the HUD isn't in it)
  startClip() {
    const canvas = this.g.renderer.domElement;
    if (!canvas.captureStream || typeof MediaRecorder === 'undefined') { $('rp-clip').textContent = 'Not supported'; return; }
    const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
    this.chunks = [];
    this.rec = new MediaRecorder(canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: 10e6 });
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.onstop = () => {
      if (!this.keep) return;
      const blob = new Blob(this.chunks, { type: this.rec?.mimeType ?? type });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `stomped-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      this.rec = null;
    };
    if (this.t >= this.t1 - 0.1) this.t = this.from;
    this.playing = true;
    this.rec.start(250);
    $('rp-clip').textContent = '■ Stop';
    $('rp-clip').classList.add('rec');
  }

  stopClip(keep) {
    this.keep = keep;
    try { this.rec.stop(); } catch { /* already stopped */ }
    if (!keep) this.rec = null;
    $('rp-clip').textContent = '● Save clip';
    $('rp-clip').classList.remove('rec');
  }
}
