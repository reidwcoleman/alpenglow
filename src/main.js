// Alpenglow: boot, game modes (Race the Cup / Free Ride), loop, HUD.
import * as THREE from 'three';
import { Environment, PRESETS } from './sky.js';
import { Terrain } from './terrain.js';
import { Forest } from './trees.js';
import { Props } from './props.js';
import { Tracks } from './tracks.js';
import { Particles, Snowfall } from './particles.js';
import { Skier } from './skier.js';
import { AIController } from './ai.js';
import { randomOutfit } from './skiermodel.js';
import { Input } from './input.js';
import { CameraRig } from './camera.js';
import { Audio } from './audio.js';
import { Post } from './post.js';
import { mulberry32, clamp, smoothstep } from './noise.js';
import { START_Z, FINISH_Z, GATES, centerX, halfWidth, sectionName, heightAt, SECTIONS } from './course.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const store = {
  get(k, d) { try { const v = localStorage.getItem('alpenglow.' + k); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('alpenglow.' + k, v); } catch { /* private mode */ } },
};

const JACKETS = [0xff6a2b, 0xd8342c, 0xf2b705, 0x2a7de1, 0x18a868, 0x8e3fd1, 0xff4f8b, 0xf4f4f4];
const NAMES = ['Ana Berg', 'Jonas Falk', 'Lena Moser', 'Marco Valli', 'Ingrid Dahl', 'Felix Gruber', 'Sofia Rinaldi', 'Kai Lindqvist', 'Elin Strand', 'Theo Baumann', 'Mila Novak', 'Nils Eriksen', 'Clara Huber', 'Luca Ferrari', 'Hanna Aas', 'Emil Steiner'];
const QUALITY = {
  low: { label: 'Fast', dpr: 1, shadow: 2048, msaa: 0, bloom: false, smaa: true },
  high: { label: 'High', dpr: 1.25, shadow: 4096, msaa: 0, bloom: true, smaa: true },
  ultra: { label: 'Ultra', dpr: 2, shadow: 4096, msaa: 4, bloom: true, smaa: false },
};

function fmt(t) {
  if (t == null || !isFinite(t)) return '—';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
const ord = (n) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
const hex = (c) => '#' + new THREE.Color(c).getHexString();

class Game {
  constructor() {
    this.state = 'loading';
    this.tod = params.get('tod') ?? store.get('tod', 'golden');
    if (!PRESETS[this.tod]) this.tod = 'golden';
    this.quality = params.get('q') ?? store.get('quality', 'high');
    if (!QUALITY[this.quality]) this.quality = 'high';
    this.jacket = Number(store.get('jacket', JACKETS[0]));
    this.skiers = [];
    this.ais = [];
    this.player = null;
    this.time = 0;
    this.paused = false;
    this.rnd = mulberry32(Date.now() & 0xffff);
    this.fpsAcc = 0; this.fpsN = 0; this.fps = 60;
    this.dprScale = 1;
  }

  async boot() {
    const setLoad = (p, m) => { $('loadbar').style.width = p + '%'; if (m) $('loadmsg').textContent = m; };
    const canvas = $('gl');
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false }));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.maxDpr = Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].dpr);
    r.setPixelRatio(this.maxDpr);
    r.setSize(innerWidth, innerHeight, false);
    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 70000);
    this.env = new Environment(r, scene);
    this.env.sun.shadow.mapSize.setScalar(QUALITY[this.quality].shadow);
    this.env.apply(this.tod);
    setLoad(8, 'Shaping the mountain…');
    await nextFrame();
    this.terrain = new Terrain(scene, this.env);
    setLoad(30, 'Grooming the piste…');
    await nextFrame();
    this.terrain.prime(centerX(START_Z), START_Z);
    setLoad(55, 'Growing the forest…');
    await nextFrame();
    this.forest = new Forest(scene);
    setLoad(75, 'Building the lift and the village…');
    await nextFrame();
    this.props = new Props(scene, this.forest, this.env);
    this.tracks = new Tracks(scene);
    this.particles = new Particles(scene);
    this.snowfall = new Snowfall(scene);
    this.world = { scene, forest: this.forest, tracks: this.tracks, particles: this.particles, race: false, raceStarted: false };
    this.post = new Post(r, scene, this.camera, { ...QUALITY[this.quality], ...JSON.parse(params.get('post') ?? '{}') });
    this.post.setPixelRatio(this.maxDpr);
    this.post.setSize(innerWidth, innerHeight);
    this.input = new Input();
    this.audio = new Audio();
    this.audio.setMuted(store.get('muted', '0') === '1');
    this.rig = new CameraRig(this.camera);
    this.applyConditions();
    setLoad(90, 'Waking up the skiers…');
    await nextFrame();
    this.populateFree(true);
    // compile shaders before the first visible frame
    this.rig.menu(0.016, 0, this.skiers);
    this.terrain.update(this.camera.position.x, this.camera.position.z, 1e9);
    this.forest.update(this.camera.position.x, this.camera.position.z, 0);
    this.renderer.compile(scene, this.camera);
    setLoad(100, 'Ready');
    addEventListener('resize', () => this.resize());
    this.bindUI();
    this.clock = new THREE.Timer();
    this.renderer.setAnimationLoop(() => this.frame());
    setTimeout(() => { $('loading').style.opacity = 0; setTimeout(() => $('loading').classList.add('hidden'), 800); }, 150);
    const mode = params.get('mode');
    if (params.get('menu') === '0' && mode) this.start(mode === 'race' ? 'race' : 'free');
    else this.showMenu();
    window.__game = this;
    window.__cx = centerX;
    window.__h = heightAt;
    window.__lift = this.props.liftPoints;
    window.__ready = true;
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.post.setSize(innerWidth, innerHeight);
  }

  applyConditions() {
    this.env.apply(this.tod);
    const dusk = { bluebird: 0.05, golden: 0.45, alpenglow: 1, storm: 0.35 }[this.tod] ?? 0;
    this.props.setDusk(dusk);
    this.snowfall.points.visible = !!PRESETS[this.tod].snow;
    const warm = { bluebird: [1.0, 1.0, 1.02], golden: [1.04, 1.0, 0.95], alpenglow: [1.05, 0.98, 1.0], storm: [0.98, 1.0, 1.03] }[this.tod];
    this.post.lens.uniforms.uWarm.value.set(...warm);
    const p = PRESETS[this.tod];
    this.sunLit = new THREE.Color(p.sun).multiplyScalar(p.sunI * 0.22 * Math.min(1, Math.sin(p.elev * Math.PI / 180) * 3 + 0.3))
      .add(new THREE.Color(p.hemiSky).multiplyScalar(0.55 + p.hemiI * 0.4));
  }

  // ---------------- UI ----------------
  bindUI() {
    const tod = $('tod');
    for (const [k, p] of Object.entries(PRESETS)) {
      const b = document.createElement('button');
      b.textContent = p.label; b.className = k === this.tod ? 'on' : '';
      b.onclick = () => { this.tod = k; store.set('tod', k); [...tod.children].forEach((c) => c.classList.toggle('on', c === b)); this.applyConditions(); };
      tod.appendChild(b);
    }
    const jk = $('jackets');
    for (const c of JACKETS) {
      const b = document.createElement('button');
      b.style.background = hex(c); b.className = c === this.jacket ? 'on' : '';
      b.onclick = () => { this.jacket = c; store.set('jacket', c); [...jk.children].forEach((x) => x.classList.toggle('on', x === b)); };
      jk.appendChild(b);
    }
    const q = $('qual');
    for (const [k, v] of Object.entries(QUALITY)) {
      const b = document.createElement('button');
      b.textContent = v.label; b.className = k === this.quality ? 'on' : '';
      b.onclick = () => { if (k === this.quality) return; store.set('quality', k); location.reload(); };
      q.appendChild(b);
    }
    $('b-race').onclick = () => this.start('race');
    $('b-free').onclick = () => this.start('free');
    $('p-resume').onclick = () => this.setPaused(false);
    $('p-restart').onclick = () => { this.setPaused(false); this.start(this.mode); };
    $('p-menu').onclick = () => { this.setPaused(false); this.showMenu(); };
    $('tc-cam').onclick = () => this.cycleCam();
    if (matchMedia('(pointer: coarse)').matches) { document.body.classList.add('touch'); $('tc-cam').classList.remove('hidden'); }
  }

  showMenu() {
    this.state = 'menu';
    this.mode = null;
    $('menu').classList.remove('hidden');
    $('hud').classList.add('hidden');
    $('results').classList.add('hidden');
    this.populateFree(true);
    this.menuT = 0;
  }

  setPaused(p) {
    if (this.state === 'menu') return;
    this.paused = p;
    $('pause').classList.toggle('hidden', !p);
  }

  cycleCam() {
    const m = this.rig.cycle();
    const names = { chase: 'Chase cam', action: 'Action cam', helmet: 'Helmet cam', tv: 'TV cam' };
    $('camlbl').textContent = names[m] + ' · C';
  }

  popup(html, cls = '') {
    const d = document.createElement('div');
    d.className = 'popi ' + cls; d.innerHTML = html;
    const pop = $('pop');
    while (pop.children.length > 2) pop.firstChild.remove();
    pop.appendChild(d);
    setTimeout(() => d.remove(), 1900);
  }

  // ---------------- population ----------------
  clearSkiers() {
    for (const s of this.skiers) s.dispose();
    this.skiers = []; this.ais = []; this.player = null;
  }

  addSkier(opts, style) {
    const s = new Skier(this.world, opts);
    this.skiers.push(s);
    if (style) { const ai = new AIController(s, style, this.rnd, this.world); s.ai = ai; this.ais.push(ai); }
    return s;
  }

  populateFree(menu = false) {
    this.clearSkiers();
    this.world.race = false; this.world.raceStarted = false;
    this.props.setRaceMode(false);
    const styles = [['expert', 5], ['carver', 9], ['cruiser', 8], ['beginner', 4], ['park', 6]];
    let n = 0;
    for (const [style, count] of styles) for (let i = 0; i < count; i++) {
      const s = this.addSkier({ outfit: randomOutfit(this.rnd), name: NAMES[n % NAMES.length] }, style);
      let z = 60 + this.rnd() * (FINISH_Z - 200);
      if (style === 'park') z = 900 + this.rnd() * 450;
      if (style === 'beginner') z = 2900 + this.rnd() * 400 - (i % 2) * 2600;
      const x = centerX(z) + (this.rnd() - 0.5) * halfWidth(z) * 1.4;
      s.place(x, z, null, s.ai.targetSpeed * 0.7);
      s.ai.lastZ = z;
      n++;
    }
    if (!menu) {
      const p = this.addSkier({ outfit: { ...randomOutfit(this.rnd), jacket: this.jacket }, name: 'You', isPlayer: true, grip: 1.75 });
      p.place(centerX(START_Z), START_Z, null, 0);
      this.player = p;
      this.hookPlayer(p);
    }
  }

  populateRace() {
    this.clearSkiers();
    this.world.race = true; this.world.raceStarted = false;
    this.props.setRaceMode(true);
    const lanes = [-10.5, -7.5, -4.5, -1.5, 1.5, 4.5, 7.5, 10.5];
    const playerLane = 3 + Math.floor(this.rnd() * 2);
    const names = [...NAMES].sort(() => this.rnd() - 0.5);
    let bib = 1;
    this.racers = [];
    lanes.forEach((off, i) => {
      const isP = i === playerLane;
      const outfit = randomOutfit(this.rnd, true);
      if (isP) { outfit.jacket = this.jacket; outfit.pants = this.jacket; }
      const s = this.addSkier({ outfit, name: isP ? 'You' : names[i], isPlayer: isP, bib: bib++, grip: isP ? 1.75 : undefined }, isP ? null : 'racer');
      s.place(centerX(START_Z) + off, START_Z, null, 0);
      if (isP) { this.player = s; this.hookPlayer(s); }
      this.racers.push({ s, gate: 0, pen: 0, missed: 0, finish: null, color: outfit.jacket });
    });
    // skill spread: a couple of rivals are genuinely quick
    this.ais.forEach((ai, i) => { ai.skill = 0.78 + (i / this.ais.length) * 0.2 + this.rnd() * 0.04; ai.s.grip = 1.6 + ai.skill * 0.22; });
  }

  hookPlayer(p) {
    p.on('land', (t) => this.onPlayerLand(t));
    p.on('crash', (e) => {
      this.audio.thump(1.2); this.rig.bump(1);
      this.burst(p, 90, 5);
      this.popup('WIPEOUT<small>' + (e.reason === 'landing' ? 'land it straight' : e.reason === 'tree' ? 'that tree did not move' : e.reason === 'skier' ? 'watch the traffic' : 'ouch') + '</small>', 'bad');
      this.freeStats && (this.freeStats.crashes++);
    });
    p.on('takeoff', () => {});
  }

  onPlayerLand(t) {
    const p = this.player;
    this.audio.thump(Math.min(1, t.vn / 8));
    this.rig.bump(Math.min(0.6, t.vn / 20));
    this.burst(p, 20 + t.vn * 4, 2);
    if (t.air < 0.55) return;
    const parts = [];
    if (t.flips) parts.push((t.flips > 1 ? (t.flips === 2 ? 'Double ' : 'Triple ') : '') + (t.flipDir > 0 ? 'Front Flip' : 'Backflip'));
    if (t.spin >= 180) parts.push(String(t.spin));
    if (t.grab) parts.push('Mute Grab');
    const pts = Math.round(t.air * 120 + (t.spin / 180) * 220 + t.flips * 700 + (t.grab ? 180 : 0) + t.height * 25);
    const name = parts.length ? parts.join(' · ') : t.height > 3 ? 'Big Air' : 'Air';
    const big = pts > 900;
    this.popup(`${name}<small>${t.air.toFixed(1)}s air · +${pts}</small>`, big ? 'gold' : '');
    if (big) this.audio.chime();
    if (this.freeStats) {
      this.freeStats.score += pts;
      if (pts > this.freeStats.best.pts) this.freeStats.best = { pts, name };
    }
  }

  // ---------------- modes ----------------
  start(mode) {
    this.audio.start();
    this.mode = mode;
    $('menu').classList.add('hidden');
    $('results').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('pop').innerHTML = '';
    this.raceTime = 0;
    this.finishShown = false;
    this.cheerT = 0;
    if (mode === 'race') {
      this.populateRace();
      this.state = 'countdown';
      this.countdown = 3.6;
      this.lastBeep = 4;
      $('score').classList.add('hidden');
      $('pos').classList.remove('hidden');
      $('sub').textContent = 'Race the Cup · Downhill';
    } else {
      this.populateFree(false);
      this.state = 'free';
      this.freeStats = { score: 0, best: { pts: 0, name: '—' }, top: 0, crashes: 0, t: 0, nearT: 0 };
      $('score').classList.remove('hidden');
      $('pos').classList.add('hidden');
      $('gates').textContent = 'Trick score';
      $('sub').textContent = 'Free Ride';
      this.popup('FREE RIDE<small>terrain park ~1 km down · spin with ←/→ in the air</small>');
    }
    if (params.get('auto') === '1') { this.player.ai = new AIController(this.player, mode === 'race' ? 'racer' : 'park', this.rnd, this.world); this.player.ai.skill = 0.95; }
    const z = Number(params.get('z'));
    if (z) this.player.place(centerX(z) + Number(params.get('x') ?? 0), z, null, Number(params.get('v') ?? 15));
    if (params.get('cam')) while (this.rig.mode !== params.get('cam')) this.cycleCam();
    this.rig.snap = true;
    this.buildProgress();
    this.secName = '';
  }

  buildProgress() {
    const tr = $('progtrack');
    tr.innerHTML = '';
    this.progDots = [];
    const list = this.mode === 'race' ? this.racers.map((r) => r.s) : [this.player];
    for (const s of list) {
      const i = document.createElement('i');
      if (s === this.player) i.className = 'me';
      else i.style.background = hex(this.racers.find((r) => r.s === s).color);
      tr.appendChild(i);
      this.progDots.push([s, i]);
    }
  }

  finishRace() {
    this.state = 'results';
    const rs = this.standings();
    const winner = rs[0];
    const me = rs.findIndex((r) => r.s === this.player) + 1;
    const rows = rs.map((r, i) => {
      const t = r.finish ?? null;
      const gap = i === 0 || t == null || winner.finish == null ? (t == null ? 'DNF' : fmt(t)) : '+' + (t - winner.finish).toFixed(2);
      return `<tr class="${r.s === this.player ? 'me' : ''}"><td>${i + 1}</td><td><span class="sw" style="background:${hex(r.color)}"></span>${r.s.name}${r.missed ? ` <small style="opacity:.6">(${r.missed} missed)</small>` : ''}</td><td class="t">${i === 0 ? fmt(t) : gap}</td></tr>`;
    }).join('');
    const title = me === 1 ? 'VICTORY' : me <= 3 ? 'PODIUM' : 'FINISHED';
    $('rescard').innerHTML = `<h2>${title}</h2><p class="lead">You finished ${me}${ord(me)} of ${rs.length}${this.racers.find((r) => r.s === this.player).missed ? ', with ' + this.racers.find((r) => r.s === this.player).missed + ' missed gates' : ''}.</p>
      <table class="res">${rows}</table>
      <div class="row"><button class="btn p" id="r-again">Race again</button><button class="btn" id="r-free">Free ride</button><button class="btn" id="r-menu">Menu</button></div>`;
    $('results').classList.remove('hidden');
    $('r-again').onclick = () => this.start('race');
    $('r-free').onclick = () => this.start('free');
    $('r-menu').onclick = () => this.showMenu();
    const best = Number(store.get('best', '0'));
    const mine = this.racers.find((r) => r.s === this.player).finish;
    if (mine && (!best || mine < best)) store.set('best', mine);
  }

  finishFree() {
    this.state = 'results';
    const f = this.freeStats;
    $('rescard').innerHTML = `<h2>RUN COMPLETE</h2><p class="lead">Summit to village in ${fmt(f.t)}.</p>
      <div class="stats">
        <div class="stat"><b>${f.score}</b><span>Trick score</span></div>
        <div class="stat"><b>${Math.round(f.top * 3.6)}</b><span>Top km/h</span></div>
        <div class="stat"><b>${f.crashes}</b><span>Wipeouts</span></div>
      </div>
      <p class="lead" style="margin-top:14px">Best trick: <b style="color:#ffc36b">${f.best.name}</b>${f.best.pts ? ' (' + f.best.pts + ')' : ''}</p>
      <div class="row"><button class="btn p" id="r-lift">Ride the lift</button><button class="btn" id="r-race">Race the Cup</button><button class="btn" id="r-menu">Menu</button></div>`;
    $('results').classList.remove('hidden');
    $('r-lift').onclick = () => { $('results').classList.add('hidden'); this.state = 'free'; this.freeStats = { score: 0, best: { pts: 0, name: '—' }, top: 0, crashes: 0, t: 0, nearT: 0 }; this.player.place(centerX(START_Z), START_Z, null, 0); this.rig.snap = true; };
    $('r-race').onclick = () => this.start('race');
    $('r-menu').onclick = () => this.showMenu();
  }

  standings() {
    return [...this.racers].sort((a, b) => {
      if (a.finish != null && b.finish != null) return a.finish - b.finish;
      if (a.finish != null) return -1;
      if (b.finish != null) return 1;
      return b.s.pos.z - a.s.pos.z;
    });
  }

  // ---------------- simulation ----------------
  simulate(h) {
    const racing = this.state === 'race' || this.state === 'countdown' || (this.state === 'results' && this.mode === 'race');
    for (const ai of this.ais) ai.update(h, this.skiers);
    if (this.player?.ai) this.player.ai.update(h, this.skiers);
    for (const s of this.skiers) s.step(h);
    this.collideSkiers();
    if (racing && this.world.raceStarted) {
      this.raceTime += h;
      for (const r of this.racers) {
        const s = r.s;
        while (r.gate < GATES.length && s.pos.z >= GATES[r.gate].z) {
          const g = GATES[r.gate];
          const ok = Math.abs(s.pos.x - g.x) <= g.width / 2 + 0.3;
          if (!ok && r.finish == null) {
            r.pen += 2; r.missed++;
            if (s === this.player) { this.popup('MISSED GATE<small>+2.00 s</small>', 'bad'); this.audio.buzz(); this.penFlash = 1; }
          } else if (s === this.player) this.audio.beep(1250, 0.06, 0.12);
          r.gate++;
        }
        if (r.finish == null && s.pos.z >= FINISH_Z) {
          r.finish = this.raceTime + r.pen;
          this.cheerT = 3;
          if (s === this.player) {
            const pos = this.standings().findIndex((x) => x === r) + 1;
            this.popup(`${fmt(r.finish)}<small>${pos}${ord(pos)} place</small>`, pos === 1 ? 'gold' : '');
            this.audio.cheer();
            this.playerFinishAt = this.time;
          }
        }
      }
    }
    // free ride bookkeeping
    if (this.state === 'free' && this.player) {
      const p = this.player, f = this.freeStats;
      f.t += h; f.top = Math.max(f.top, p.speed);
      // near misses: zip past another skier at speed
      f.nearT -= h;
      if (f.nearT <= 0 && p.onGround && p.crash <= 0 && p.speed > 12) {
        for (const o of this.skiers) {
          if (o === p || o.crash > 0) continue;
          const d = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
          if (d < 2.0 && d > 0.9) { f.score += 75; f.nearT = 2.5; this.popup('NEAR MISS<small>+75</small>'); break; }
        }
      }
      if (p.pos.z > FINISH_Z + 25 && p.speed < 4 && !this.finishShown) { this.finishShown = true; this.finishFree(); }
    }
    // AI who reached the village ride the lift back up
    for (const ai of this.ais) {
      if (this.mode === 'race' && this.state !== 'menu') continue;
      if (ai.finished && ai.restTimer > 1.5) {
        const z = 40 + this.rnd() * 60;
        ai.s.place(centerX(z) + (this.rnd() - 0.5) * 40, z, null, 2);
        ai.finished = false; ai.restTimer = 0; ai.lastZ = z;
      }
      if (ai.s.stuck > 4) { ai.s.respawn(); ai.lastZ = ai.s.pos.z; }
    }
  }

  collideSkiers() {
    const list = this.skiers;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const dz = a.pos.z - b.pos.z;
        if (dz > 1.2 || dz < -1.2) continue;
        const dx = a.pos.x - b.pos.x;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.81 || Math.abs(a.pos.y - b.pos.y) > 1.4) continue;
        const d = Math.sqrt(d2) || 0.01;
        const nx = dx / d, nz = dz / d;
        const rel = (a.vel.x - b.vel.x) * nx + (a.vel.z - b.vel.z) * nz;
        const push = (0.9 - d) / 2;
        a.pos.x += nx * push; a.pos.z += nz * push; b.pos.x -= nx * push; b.pos.z -= nz * push;
        if (rel < 0) {
          // equal masses swap the normal components
          a.vel.x -= rel * nx; a.vel.z -= rel * nz; b.vel.x += rel * nx; b.vel.z += rel * nz;
          if (-rel > 5.5) {
            for (const s of [a, b]) if (s.crash <= 0) { s.startCrash('skier'); this.burst(s, 50, 4); }
          }
        }
      }
    }
  }

  burst(s, n, spread) {
    if (this.camera.position.distanceTo(s.pos) > 160) return;
    const v = s.vel;
    this.particles.emit(s.pos.x, s.pos.y + 0.1, s.pos.z, v.x * 0.35, 1.5, v.z * 0.35, spread + 2, 0.55, 1.2, Math.round(n));
  }

  spray(dt) {
    const cam = this.camera.position;
    for (const s of this.skiers) {
      if (!s.onGround || s.crash > 0) continue;
      const sp = s.speed;
      if (sp < 3) continue;
      const d = cam.distanceTo(s.pos);
      if (d > 130) continue;
      const carve = Math.abs(s.lean) * sp;
      const rate = (s.skid * 10 + Math.max(0, carve - 8) * 0.9 + (s.controls.brake ? 8 : 0)) * Math.min(1, sp / 10) * (sp > 6 ? 1 : 0.3);
      let n = rate * dt;
      n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
      if (!n) continue;
      // spray flies to the outside of the turn
      const sx = Math.cos(s.heading), sz = -Math.sin(s.heading); // skier's left
      const out = -Math.sign(s.latAcc || 1);
      const k = 1.8 + s.skid * 1.4;
      this.particles.emit(
        s.pos.x + sx * out * 0.3 - Math.sin(s.heading) * 0.3, s.pos.y + 0.05, s.pos.z + sz * out * 0.3 - Math.cos(s.heading) * 0.3,
        s.vel.x * 0.4 + sx * out * k, 1.4 + s.skid * 0.5, s.vel.z * 0.4 + sz * out * k,
        1.6, 0.32 + Math.min(s.skid, 3) * 0.08, 0.85, n);
    }
  }

  // ---------------- frame ----------------
  frame() {
    this.clock.update();
    const dtRaw = this.clock.getDelta();
    const dt = Math.min(dtRaw, 1 / 20);
    this.time += dt;
    this.trackFps(dtRaw);
    const inp = this.input;
    if (inp.hit('Escape') || inp.hit('KeyP') || inp.padHit?.[9]) this.setPaused(!this.paused);
    if (inp.hit('KeyM')) { this.audio.setMuted(!this.audio.muted); store.set('muted', this.audio.muted ? '1' : '0'); }
    if (inp.hit('KeyC') || inp.padHit?.[3]) this.cycleCam();

    if (!this.paused) {
      if (this.player && !this.player.ai) {
        const c = inp.read(dt, !this.player.onGround);
        Object.assign(this.player.controls, c);
        if (this.state === 'countdown' || this.state === 'results') { this.player.controls.steer = 0; this.player.controls.tuck = 0; this.player.controls.brake = this.state === 'results' ? 1 : 0; this.player.controls.jump = false; }
        if ((inp.hit('KeyR') || inp.padHit?.[8]) && this.state !== 'countdown') { this.player.respawn(); this.rig.snap = true; }
      }
      if (this.state === 'countdown') {
        this.countdown -= dt;
        const n = Math.ceil(this.countdown);
        if (n !== this.lastBeep && n <= 3 && n >= 1) { this.lastBeep = n; this.audio.beep(660, 0.18, 0.3); }
        $('count').classList.remove('hidden');
        $('count').textContent = this.countdown > 3 ? 'READY' : n;
        if (this.countdown <= 0) {
          this.state = 'race'; this.world.raceStarted = true;
          this.audio.beep(1320, 0.4, 0.35);
          $('count').textContent = 'GO!';
          setTimeout(() => $('count').classList.add('hidden'), 700);
          this.player.vel.addScaledVector(this.player.forward(new THREE.Vector3()), 3.5); // push out of the gate
          for (const ai of this.ais) ai.s.vel.addScaledVector(ai.s.forward(new THREE.Vector3()), 3 + this.rnd());
        }
      }
      // fixed-step physics
      const H = 1 / 100;
      this.acc = (this.acc ?? 0) + dt;
      let steps = 0;
      while (this.acc >= H && steps < 8) { this.simulate(H); this.acc -= H; steps++; }
      if (steps === 8) this.acc = 0;
      if (this.mode === 'race' && this.state === 'race' && this.playerFinishAt != null) {
        const allIn = this.racers.every((r) => r.finish != null);
        if (allIn || this.time - this.playerFinishAt > 12) { this.playerFinishAt = null; this.finishRace(); }
      }
      this.tracks.flush();
    }

    // visuals
    const cam = this.camera;
    if (this.state === 'menu') { this.menuT = (this.menuT ?? 0) + dt; this.rig.menu(dt, this.menuT, this.skiers); }
    else if (this.player) this.rig.update(dt, this.player);
    if (window.__freeCam) { const f = window.__freeCam; cam.position.set(...f.pos); cam.lookAt(...f.look); cam.fov = f.fov ?? 55; cam.updateProjectionMatrix(); }
    for (const s of this.skiers) s.updateVisual(dt, cam.position);
    if (!this.paused) {
      this.spray(dt);
      this.particles.update(dt, this.sunLit);
      this.snowfall.update(dt, cam.position);
    }
    const focus = this.player && this.state !== 'menu' ? this.player.pos : cam.position;
    this.terrain.update(cam.position.x, cam.position.z, 4);
    this.forest.update(cam.position.x, cam.position.z, dt);
    this.props.updateLift(this.time);
    this.cheerT = Math.max(0, (this.cheerT ?? 0) - dt);
    const nearFinish = smoothstep(260, 40, Math.abs(cam.position.z - FINISH_Z));
    this.props.cheer(this.time, this.cheerT > 0 ? 1 : 0);
    this.env.follow(focus, dt);
    this.audio.update(this.state === 'menu' ? null : this.player, nearFinish * (0.25 + (this.cheerT > 0 ? 0.75 : 0)));
    if (this.state !== 'menu' && this.player) this.hud(dt);
    const sp = this.player && this.state !== 'menu' ? this.player.speed : 0;
    this.post.lens.uniforms.uSpeed.value = smoothstep(14, 40, sp) * (this.rig.mode === 'tv' ? 0 : 1);
    this.post.lens.uniforms.uFlash.value *= 0.9;
    this.post.render(dt);
    inp.endFrame();
  }

  trackFps(dt) {
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc >= 1) {
      this.fps = this.fpsN / this.fpsAcc;
      window.__fps = this.fps;
      this.fpsAcc = 0; this.fpsN = 0;
      // adaptive resolution
      if (params.get('fixdpr') !== '1') {
        const prev = this.dprScale;
        if (this.fps < 48) this.dprScale = Math.max(0.55, this.dprScale - 0.1);
        else if (this.fps > 58 && this.dprScale < 1) this.dprScale = Math.min(1, this.dprScale + 0.05);
        if (prev !== this.dprScale) {
          const r = this.maxDpr * this.dprScale;
          this.renderer.setPixelRatio(r);
          this.post.setPixelRatio(r);
          this.resize();
        }
      }
    }
  }

  hud(dt) {
    const p = this.player;
    $('spd').textContent = Math.round(p.speed * 3.6);
    const name = sectionName(p.pos.z);
    if (name !== this.secName) {
      this.secName = name;
      const sec = SECTIONS.find((s) => s.name === name);
      const diff = { 'The Wall': 'Black', 'Glacier Bowl': 'Black', 'Run-out': 'Blue', Village: 'Blue', 'Summit Start': 'Blue' }[name] ?? 'Red';
      $('sec').innerHTML = `${name}<small>${diff}${sec ? '' : ''}</small>`;
    }
    if (this.mode === 'race') {
      const rs = this.standings();
      const me = rs.findIndex((r) => r.s === p) + 1;
      $('pos').innerHTML = `${me}<sup>${ord(me)}</sup> <small>/ ${rs.length}</small>`;
      const r = this.racers.find((x) => x.s === p);
      $('gates').textContent = `Gate ${Math.min(r.gate + 1, GATES.length)} / ${GATES.length}`;
      const t = r.finish ?? this.raceTime + r.pen;
      $('timer').textContent = fmt(t);
      this.penFlash = Math.max(0, (this.penFlash ?? 0) - dt);
      $('timer').classList.toggle('pen', this.penFlash > 0);
    } else {
      $('timer').textContent = fmt(this.freeStats.t);
      $('score').textContent = this.freeStats.score.toLocaleString();
    }
    for (const [s, el] of this.progDots) {
      const k = clamp((s.pos.z - START_Z) / (FINISH_Z - START_Z), 0, 1);
      el.style.left = (k * 100).toFixed(2) + '%';
    }
    const stuck = p.stuck > 3 && this.state !== 'countdown' && p.pos.z < FINISH_Z;
    const offPiste = Math.abs(p.pos.x - centerX(p.pos.z)) > halfWidth(p.pos.z) + 120;
    const hint = $('hint');
    if (stuck || offPiste) { hint.textContent = 'Press R (or ⟲) to get back on the piste'; hint.classList.remove('hidden'); }
    else hint.classList.add('hidden');
  }
}

const game = new Game();
game.boot().catch((e) => { console.error(e); $('loadmsg').textContent = 'Error: ' + e.message; });
