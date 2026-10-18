// Alpenglow: boot, game modes (The Run / Ski Park / Race the Cup), scoring, loop, HUD.
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
import { AG, ShadeField, patchTree, patchMaterial } from './atmos.js';
import { Debris } from './debris.js';
import { Park } from './park.js';
import { Floodlights } from './night.js';
import { Replay } from './replay.js';
import { Room, myId } from './net.js';
import { MAPS, MAP_IDS } from './maps.js';
import { preloadAvatars } from './avatar.js';
import { mulberry32, clamp, smoothstep } from './noise.js';
import { START_Z, FINISH_Z, GATES, centerX, halfWidth, sectionName, heightAt, PARK, JUMPS, RAILS, PARK_JUMPS, PARK_RAILS, PIPE, ROLLERS, zoneAt, PARK_ID, MAP } from './course.js';

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
const BASE = import.meta.env.BASE_URL ?? '/';
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// run clock, mm:ss
const clock = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
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
    this.selMode = store.get('mode', 'run');
    if (!['run', 'park', 'race'].includes(this.selMode)) this.selMode = 'run';
    this.selPark = PARK_ID;
    store.set('park', PARK_ID);
    // multiplayer: who you are, which room
    this.id = myId();
    this.who = params.get('room') ? 'multi' : store.get('who', 'solo');
    this.roomName = params.get('room') ?? store.get('room', '');
    this.nick = store.get('name', '') || 'Rider ' + this.id.slice(0, 3).toUpperCase();
    // the same rider every time on this browser (the jacket comes from the locker)
    let h = 0;
    for (const ch of this.id) h = (h * 31 + ch.charCodeAt(0)) | 0;
    this.myOutfit = randomOutfit(mulberry32(h));
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
    setLoad(4, 'Loading the sky…');
    await this.env.load();
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
    setLoad(62, 'Planting the forest…');
    await this.forest.buildRender(r, patchMaterial, this.quality);
    setLoad(75, 'Building the lift and the village…');
    await nextFrame();
    this.props = new Props(scene, this.forest, this.env);
    setLoad(80, 'Shaping the park…');
    this.park = new Park(scene, this.terrain.material);
    await this.park.build();
    this.lights = new Floodlights(scene, this.quality);
    this.tracks = new Tracks(scene);
    this.particles = new Particles(scene);
    this.snowfall = new Snowfall(scene);
    this.debris = new Debris(scene);
    this.world = { scene, forest: this.forest, tracks: this.tracks, particles: this.particles, race: false, raceStarted: false, skiers: this.skiers, arcade: true, glades: !!MAP.glades };
    this.shade = new ShadeField(r);
    patchTree(scene);
    this.post = new Post(r, scene, this.camera, { ...QUALITY[this.quality], ...JSON.parse(params.get('post') ?? '{}') });
    this.post.setPixelRatio(this.maxDpr);
    this.post.setSize(innerWidth, innerHeight);
    this.input = new Input();
    this.audio = new Audio();
    this.audio.setMuted(store.get('muted', '0') === '1');
    this.rig = new CameraRig(this.camera);
    this.applyConditions();
    setLoad(86, 'Waking up the skiers…');
    await preloadAvatars((k) => setLoad(86 + k * 8)).catch((e) => console.warn('avatars', e));
    await nextFrame();
    this.populateFree(true);
    // compile shaders before the first visible frame
    this.rig.menu(0.016, 0, this.skiers);
    this.terrain.update(this.camera.position.x, this.camera.position.z, 1e9);
    this.forest.update(this.camera, 0, this.env.sunDir);
    this.renderer.compile(scene, this.camera);
    setLoad(100, 'Ready');
    addEventListener('resize', () => this.resize());
    this.bindUI();
    this.replay = new Replay(this);
    this.clock = new THREE.Timer();
    this.renderer.setAnimationLoop(() => this.frame());
    setTimeout(() => { $('loading').style.opacity = 0; setTimeout(() => $('loading').classList.add('hidden'), 800); }, 150);
    const mode = params.get('mode');
    if (params.get('menu') === '0' && mode) this.start(mode === 'race' ? 'race' : mode === 'park' ? 'park' : 'run');
    else this.showMenu();
    window.__game = this;
    window.__cx = centerX;
    window.__parkJumps = PARK_JUMPS;
    window.__rails = RAILS;
    window.__jumps = JUMPS;
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
    this.shade?.compute(this.env.sunDir);
    const night = !!PRESETS[this.tod].night;
    this.lights?.setActive(night);
    AG.uAgDirect.value = night ? 0 : 1;
    const dusk = { bluebird: 0.05, golden: 0.45, alpenglow: 1, storm: 0.35, night: 1 }[this.tod] ?? 0;
    this.props.setDusk(dusk);
    this.snowfall.points.visible = !!PRESETS[this.tod].snow;
    const warm = { bluebird: [1.0, 1.0, 1.02], golden: [1.04, 1.0, 0.95], alpenglow: [1.05, 0.98, 1.0], storm: [0.98, 1.0, 1.03], night: [0.98, 1.0, 1.06] }[this.tod];
    this.post.lens.uniforms.uWarm.value.set(...warm);
    this.post.shafts.uniforms.uTint.value.set(PRESETS[this.tod].sun ?? 0xffffff).multiplyScalar(0.9);
    const p = PRESETS[this.tod];
    // snow spray: lit like snow (albedo ~0.9 over pi) by the sun and the sky
    const e = this.env;
    this.sunLit = new THREE.Color(p.sun).multiplyScalar(e.sunL * Math.max(0.15, e.sunDir.y) * 0.29).addScalar(e.skyL * 0.29);
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
    // tabs: ride (the mode cards), locker, how to ride
    const tabs = [...document.querySelectorAll('#tabs button')];
    for (const t of tabs) t.onclick = () => {
      tabs.forEach((x) => x.classList.toggle('on', x === t));
      for (const k of ['ride', 'locker', 'how']) $('tab-' + k).classList.toggle('hidden', k !== t.dataset.tab);
    };
    // the ride tab: the park, the mode, solo or multiplayer
    const chips = [...document.querySelectorAll('.mchip')];
    const pick = (m) => {
      if (m !== 'run' && this.selPark !== 'yard') m = 'run';
      this.selMode = m; store.set('mode', m);
      chips.forEach((c) => { c.classList.toggle('on', c.dataset.mode === m); c.disabled = c.dataset.mode !== 'run' && this.selPark !== 'yard'; });
      $('ridelbl').textContent = { run: 'RIDE', park: 'RIDE THE PARK', race: 'RACE' }[m];
      this.showBest();
    };
    this.pickMode = pick;
    for (const c of chips) c.onclick = () => pick(c.dataset.mode);
    this.showParkCard();
    pick(this.selMode);
    $('b-park-pick').onclick = () => this.openParks();
    const whos = [...document.querySelectorAll('.who button')];
    const setWho = (w) => {
      this.who = w; store.set('who', w);
      whos.forEach((b) => b.classList.toggle('on', b.dataset.who === w));
      $('mp-panel').classList.toggle('hidden', w !== 'multi');
      if (w === 'multi' && this.state === 'menu') this.joinRoom();
      if (w === 'solo') this.leaveRoom();
    };
    for (const b of whos) b.onclick = () => setWho(b.dataset.who);
    $('mp-name').value = this.nick;
    $('mp-room').value = this.roomName;
    $('mp-name').onchange = () => { this.nick = $('mp-name').value.trim().slice(0, 16) || this.nick; store.set('name', this.nick); if (this.room) { this.room.me.name = this.nick; this.room.hello(); } };
    $('mp-room').onchange = () => { this.roomName = $('mp-room').value.trim(); store.set('room', this.roomName); if (this.room) { this.leaveRoom(); this.joinRoom(); } };
    $('mp-copy').onclick = () => {
      const url = `${location.origin}${location.pathname}?park=${this.selPark}&room=${encodeURIComponent(this.roomName || 'public')}`;
      navigator.clipboard?.writeText(url).then(() => { $('mp-copy').textContent = 'Copied'; setTimeout(() => ($('mp-copy').textContent = 'Copy invite'), 1500); });
    };
    setWho(this.who);
    $('b-ride').onclick = () => this.go();
    $('pk-ride').onclick = () => this.go();
    $('pk-back').onclick = () => this.closeParks();
    for (const b of document.querySelectorAll('#pk-tod button')) b.onclick = () => this.setNight(b.dataset.n === '1');
    addEventListener('resize', () => this.layoutParks());
    $('menubtn').onclick = () => this.setPaused(true);
    $('p-resume').onclick = () => this.setPaused(false);
    $('p-restart').onclick = () => { this.setPaused(false); this.start(this.mode); };
    $('p-menu').onclick = () => { this.setPaused(false); this.showMenu(); };
    $('tc-cam').onclick = () => this.cycleCam();
    if (matchMedia('(pointer: coarse)').matches) { document.body.classList.add('touch'); $('tc-cam').classList.remove('hidden'); }
    this.buildMinimap();
  }

  showBest() {
    const m = this.selMode;
    const best = m === 'race' ? Number(store.get('best', '0')) : Number(store.get(m === 'run' ? 'best.run.' + this.selPark : 'best.park', '0'));
    $('best').innerHTML = best ? (m === 'race' ? `Best Cup time<b>${fmt(best)}</b>` : `Best ${m === 'run' ? MAPS[this.selPark].name : 'park session'}<b>${best.toLocaleString()}</b>`) : 'No score yet<b>Send it</b>';
  }

  outfit() { return { ...this.myOutfit, jacket: this.jacket }; }

  showParkCard() {
    const M = MAPS[this.selPark];
    const i = MAP_IDS.indexOf(this.selPark) + 1;
    $('pc-num').textContent = 'PARK 0' + i;
    $('pc-name').textContent = M.name;
    $('pc-sub').textContent = `${M.tag} · ${M.km} km${this.selPark === PARK_ID ? '' : ' · loads when you ride'}`;
    $('b-park-pick').style.backgroundImage = `url(${BASE}art/${this.selPark}.webp)`;
  }

  // Cork7-style park chooser over the illustrated mountain
  openParks() {
    $('parks').classList.remove('hidden');
    const pins = $('pk-pins');
    if (!pins.children.length) {
      const POS = { yard: [15, 40], slope: [45, 47], forest: [57, 38], bigair: [76, 17] };
      const COL = { yard: '#7fe0c4', slope: '#ff8a5c', forest: '#9fd36b', bigair: '#ff5c7a' };
      MAP_IDS.forEach((id, i) => {
        const M = MAPS[id];
        const b = document.createElement('button');
        b.className = 'pk-pin'; b.dataset.id = id;
        b.style.left = POS[id][0] + '%'; b.style.top = POS[id][1] + '%';
        b.style.setProperty('--c', COL[id]);
        b.innerHTML = `<span class="n">0${i + 1}</span><span><div class="nm">${M.name.toUpperCase()}</div><div class="tg">${M.tag}</div></span>`;
        b.onclick = () => this.selectPark(id);
        b.ondblclick = () => { this.selectPark(id); this.go(); };
        pins.appendChild(b);
      });
    }
    this.layoutParks();
    this.selectPark(this.selPark);
    this.setNight(!!PRESETS[this.tod].night);
  }
  closeParks() { $('parks').classList.add('hidden'); }

  // the map covers the screen like a background image, the pins ride on it
  layoutParks() {
    const st = $('pk-stage');
    if (!st) return;
    const r = 16 / 9, W = innerWidth, H = innerHeight;
    const w = W / H > r ? W : H * r, h = w / r;
    st.style.width = w + 'px'; st.style.height = h + 'px';
  }

  selectPark(id) {
    this.selPark = id;
    const M = MAPS[id];
    for (const b of document.querySelectorAll('.pk-pin')) b.classList.toggle('on', b.dataset.id === id);
    $('pk-name').textContent = M.name.toUpperCase();
    $('pk-tag').textContent = M.tag;
    $('pk-blurb').textContent = M.blurb;
    const nJ = (M.runJumps?.length ?? 0) + (M.parkJumps?.length ?? 0), nR = (M.runRails?.length ?? 0) + (M.parkRails?.length ?? 0);
    $('pk-facts').innerHTML = `<span>${M.km} km</span><span>${nJ} jumps</span><span>${nR} ${id === 'forest' ? 'logs' : 'rails'}</span>`;
    this.showParkCard();
    this.pickMode?.(this.selMode);
  }

  setNight(on) {
    if (on && !PRESETS[this.tod].night) { store.set('dayTod', this.tod); this.tod = 'night'; }
    else if (!on && PRESETS[this.tod].night) this.tod = store.get('dayTod', 'bluebird');
    store.set('tod', this.tod);
    for (const b of document.querySelectorAll('#pk-tod button')) b.classList.toggle('on', (b.dataset.n === '1') === on);
    for (const b of $('tod').children) b.classList.toggle('on', b.textContent === PRESETS[this.tod].label);
    $('pk-img').src = `${BASE}art/${on ? 'map_night' : 'map'}.webp`;
    if (this.selPark === PARK_ID) this.applyConditions();
  }

  // ride: the chosen park is already loaded, or load it
  go() {
    let mode = this.selMode;
    if (this.selPark !== 'yard') mode = 'run';
    if (this.selPark !== PARK_ID) {
      store.set('park', this.selPark);
      const q = new URLSearchParams({ park: this.selPark, menu: '0', mode, tod: this.tod });
      if (this.who === 'multi') q.set('room', this.roomName || 'public');
      location.search = q.toString();
      return;
    }
    this.closeParks();
    this.start(mode);
  }

  // ---------------- multiplayer ----------------
  async joinRoom() {
    if (this.room) return;
    const room = (this.room = new Room(this, PARK_ID, this.roomName || 'public', { id: this.id, name: this.nick, outfit: this.outfit() }));
    room.on('status', (st) => this.mpStatus());
    room.on('join', (p) => { this.feed(`<b style="color:${p.color}">${esc(p.name)}</b> dropped in`); this.mpStatus(); });
    room.on('leave', (p) => { this.feed(`<b style="color:${p.color}">${esc(p.name)}</b> left`); this.mpStatus(); });
    room.on('chat', (e) => this.feed(`<b style="color:${e.peer.color}">${esc(e.peer.name)}</b> ${esc(e.text)}`, 7000));
    room.on('trick', (e) => this.feed(`<b style="color:${e.peer.color}">${esc(e.peer.name)}</b> ${esc(e.name)} <b>+${Number(e.pts).toLocaleString()}</b>`));
    await room.connect();
    this.mpStatus();
  }

  leaveRoom() { if (this.room) { this.room.close(); this.room = null; } this.mpStatus(); }

  mpStatus() {
    const r = this.room;
    const n = r ? r.peers.size + 1 : 0;
    $('mp-count').textContent = !r ? 'Live rooms, free' : r.status === 'live' ? `${n} riding · ${MAP.name} · ${r.room}` : r.status === 'offline' ? 'Offline, retrying' : 'Connecting…';
    $('live').classList.toggle('hidden', !r);
    $('live').classList.toggle('off', r?.status !== 'live');
    $('livelbl').textContent = r ? (r.status === 'live' ? `Live · ${r.room} · ${n} rider${n > 1 ? 's' : ''}` : 'Reconnecting') : '';
  }

  feed(html, ms = 5000) {
    const el = $('feed');
    const d = document.createElement('div');
    d.innerHTML = html;
    el.appendChild(d);
    while (el.children.length > 5) el.firstChild.remove();
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 500); }, ms);
  }

  showPlayers(on) {
    const el = $('players');
    el.classList.toggle('hidden', !on);
    if (!on) return;
    const rows = [{ name: this.nick + ' (you)', color: hex(this.jacket), score: this.sc?.score ?? 0 }, ...[...(this.room?.peers.values() ?? [])].map((p) => ({ name: p.name, color: p.color, score: p.score ?? 0 }))]
      .sort((a, b) => b.score - a.score);
    el.innerHTML = `<h4>${this.room ? `${MAP.name} · ${this.room.room}` : 'Solo'}</h4>` + rows.map((r) => `<div class="r"><i style="background:${r.color}"></i>${esc(r.name)}<b>${r.score.toLocaleString()}</b></div>`).join('');
  }

  showMenu() {
    this.state = 'menu';
    this.mode = null;
    $('menu').classList.remove('hidden');
    $('hud').classList.add('hidden');
    $('results').classList.add('hidden');
    this.world.arcade = true;
    this.populateFree(true);
    this.menuT = 0;
    this.showBest();
  }

  setPaused(p) {
    if (this.state === 'menu') return;
    this.paused = p;
    $('pause').classList.toggle('hidden', !p);
  }

  cycleCam() {
    const m = this.rig.cycle();
    const names = { chase: 'Chase cam', action: 'Action cam', helmet: 'Helmet cam', tv: 'TV cam' };
    const l = $('camlbl');
    l.textContent = names[m] + ' · C';
    l.classList.add('show');
    clearTimeout(this.camT); this.camT = setTimeout(() => l.classList.remove('show'), 1600);
  }

  // the big trick call-out on the left: one at a time, newest wins
  say(name, pts = '', sub = '', cls = '', ms = 2300) {
    const el = $('callout');
    el.innerHTML = `<div class="c ${cls}"><div class="n">${name}</div>${pts ? `<div class="p">${pts}</div>` : ''}${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
    this.liveCall = false;
    clearTimeout(this.sayT);
    this.sayT = setTimeout(() => { el.firstChild?.classList.add('out'); }, ms);
  }
  popup(html, cls = '') {
    const [name, sub] = html.split('<small>');
    this.say(name, '', (sub ?? '').replace('</small>', ''), cls);
  }

  // ---------------- population ----------------
  clearSkiers() {
    for (const s of this.skiers) s.dispose();
    this.skiers.length = 0; this.ais = []; this.player = null;
    this.debris.items.forEach((it) => this.scene.remove(it.mesh)); this.debris.items = [];
    if (this.rig) this.rig.subject = null;
  }

  addSkier(opts, style) {
    const s = new Skier(this.world, opts);
    patchTree(s.model.group);
    s.on('yardsale', () => { if (this.camera.position.distanceTo(s.pos) < 200) { this.debris.spawn(s); s.model.gearOff = true; } });
    s.on('gear', () => { this.debris.clear(s); s.model.gearOff = false; });
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
    // fewer riders on the shorter parks
    const crowd = Math.min(1, Math.max(0.35, MAP.km / 3.4));
    for (const [style, all] of styles) for (let i = 0, count = Math.max(1, Math.round(all * crowd)); i < count; i++) {
      const s = this.addSkier({ outfit: randomOutfit(this.rnd), name: NAMES[n % NAMES.length] }, style);
      let z = 60 + this.rnd() * (FINISH_Z - 200);
      if (style === 'park' && PARK_ID === 'yard') z = 900 + this.rnd() * 450;
      if (style === 'beginner') z = FINISH_Z * (0.85 - (i % 2) * 0.75) + this.rnd() * FINISH_Z * 0.1;
      const x = centerX(z) + (this.rnd() - 0.5) * halfWidth(z) * 1.4;
      s.place(x, z, null, s.ai.targetSpeed * 0.7);
      s.ai.lastZ = z;
      n++;
    }
    if (!menu) {
      const p = this.addSkier({ outfit: this.outfit(), name: 'You', isPlayer: true, grip: 1.75, sidecut: 16 });
      p.place(centerX(START_Z), START_Z, null, 0);
      this.player = p;
      this.hookPlayer(p);
    }
  }

  // the park: riders on every line, you at the gate
  populatePark() {
    this.clearSkiers();
    this.world.race = false; this.world.raceStarted = false;
    this.props.setRaceMode(false);
    const lines = [['jumps', 6], ['rails', 4], ['pipe', 4]];
    let n = 0;
    for (const [line, count] of lines) for (let i = 0; i < count; i++) {
      const s = this.addSkier({ outfit: randomOutfit(this.rnd), name: NAMES[n % NAMES.length] }, 'park');
      s.ai.line = line;
      this.parkSpawn(s, line, this.rnd() * 0.85);
      n++;
    }
    for (let i = 0; i < 4; i++) {
      const s = this.addSkier({ outfit: randomOutfit(this.rnd), name: NAMES[n++ % NAMES.length] }, i < 2 ? 'cruiser' : 'carver');
      this.parkSpawn(s, 'middle', this.rnd() * 0.8);
    }
    const p = this.addSkier({ outfit: this.outfit(), name: 'You', isPlayer: true, grip: 1.75, sidecut: 16 });
    this.player = p;
    this.hookPlayer(p);
    this.parkSpawn(p, 'gate', 0);
  }

  // drop a skier at the top of a park line (k: how far down it, 0..1)
  parkSpawn(s, line, k = 0) {
    const L = {
      jumps: [PARK_JUMPS[0].dx, PARK_JUMPS[0].z - 40, PARK_JUMPS[3].z - 30],
      rails: [PARK_RAILS[0].dx, PARK_RAILS[0].z - 30, PARK_RAILS[5].z - 25],
      pipe: [PIPE.dx, PIPE.z0 - 18, PIPE.z0 - 6],
      rollers: [ROLLERS.dx, ROLLERS.z0 - 20, ROLLERS.z0 - 20],
      middle: [0, PARK.top - 20, PARK.z1 - 40],
      gate: [0, PARK.top - 14, PARK.top - 14],
    }[line];
    const z = L[1] + (L[2] - L[1]) * k;
    s.place(centerX(z) + L[0], z, null, s.isPlayer ? 0 : 6);
    if (s.ai) { s.ai.lastZ = z; s.ai.finished = false; }
    s.parkLine = line;
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
      const s = this.addSkier({ outfit, name: isP ? 'You' : names[i], isPlayer: isP, bib: bib++, grip: isP ? 1.75 : undefined, sidecut: 24 }, isP ? null : 'racer');
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
      const sc = this.sc;
      if (sc) {
        sc.crashes++;
        const lost = Math.round(sc.pend * this.lineMult());
        sc.pend = 0; sc.n = 0; sc.names = [];
        this.say('BAIL', '', lost > 0 ? `line lost · ${lost.toLocaleString()}` : { landing: 'land it straight', tree: 'that tree did not move', skier: 'watch the traffic', rail: 'stay on top of it', net: 'into the nets' }[e.reason] ?? '', 'bad', 1800);
        this.status('BAIL');
      } else this.say('WIPEOUT', '', e.reason === 'landing' ? 'land it straight' : '', 'bad');
    });
    p.on('recover', () => { if (this.sc) this.say('BACK ON YOUR FEET', '', '', '', 1300); });
    p.on('grindStart', () => this.audio.thump(0.35));
    p.on('grindEnd', (g) => this.onPlayerGrind(g));
    p.on('railSwap', () => this.audio.beep(880, 0.05, 0.08));
    p.on('butter', (b) => this.onPlayerButter(b));
    p.on('pop', (e) => { if (e.perfect) { this.status(e.late ? 'LATE POP' : 'PERFECT POP'); this.audio.beep(1500, 0.05, 0.1); } });
  }

  // ---------------- scoring ----------------
  // Spins pay by the square of the turns (a 720 is four 360s), flips count as turns, grabs
  // multiply, every feature in a row adds x0.25 to the line, landing on snow banks it and a
  // bail loses it. Repeating the same trick pays less each time.
  resetScore() {
    this.sc = { score: 0, shown: 0, pend: 0, n: 0, names: [], last: -99, reps: new Map(), clean: 0, best: { pts: 0, name: '—' }, top: 0, crashes: 0, t: 0, laps: 0, air: 0, started: false, done: false };
  }

  lineMult() { return 1 + 0.25 * Math.max(0, this.sc.n - 1); }

  repeat(key) {
    const n = this.sc.reps.get(key) ?? 0;
    this.sc.reps.set(key, n + 1);
    return [1, 0.75, 0.55, 0.4][Math.min(n, 3)];
  }

  status(txt) { this.statusTxt = txt; this.statusT = 2.2; }

  trickName(t) {
    const N = { cork: 'Cork', bio: 'Bio', rodeo: 'Rodeo', misty: 'Misty', flatspin: 'Flatspin', backflip: 'Backflip', frontflip: 'Frontflip', sideflip: 'Sideflip' };
    const mult = ['', '', 'Double ', 'Triple ', 'Quad '][Math.min(t.flips, 4)];
    let core = '';
    if (t.flips && t.type) core = `${mult}${N[t.type]}${t.spin >= 180 ? ' ' + t.spin : ''}`;
    else if (t.flips) core = `${mult}${t.flipDir > 0 ? 'Frontflip' : 'Backflip'}`;
    else if (t.spin >= 180) core = String(t.spin);
    if (core && t.switchIn) core = 'Switch ' + core;
    const G = { mute: 'Mute', tail: 'Tail', japan: 'Japan' };
    const grabs = t.grabs.map(([k]) => G[k] ?? 'Grab').join(' + ');
    let name = core && grabs ? `${core} ${grabs}` : core || (grabs ? `${grabs} Grab` : '');
    if (!name && t.pipe) name = t.rise > 1.5 ? 'Big Pipe Air' : 'Pipe Air';
    return name;
  }

  addFeature(pts, name) {
    const sc = this.sc;
    sc.pend += pts; sc.n++; sc.last = this.time;
    if (name) sc.names.push(name);
  }

  // landing on snow banks the line
  bank(name, sketchy, air, stomp = false) {
    const sc = this.sc;
    const mult = this.lineMult();
    let award = sc.pend * mult * (sketchy ? 0.5 : 1);
    const bonus = air >= 0.5 ? 450 + award * 0.15 : 0;
    const total = Math.round(award + bonus);
    sc.pend = 0;
    if (total <= 0) return;
    sc.score += total; sc.clean++;
    const title = name || (sketchy ? 'SKETCHY LANDING' : stomp ? 'STOMPED' : 'CLEAN LANDING');
    if (total > sc.best.pts && name) sc.best = { pts: total, name };
    const prev = name && sc.names[sc.names.length - 1] === name ? sc.names.slice(0, -1) : sc.names.filter((x) => x !== name);
    const line = prev.length ? prev.join(' · ') + ' · ' : '';
    sc.names = [];
    const big = total > 6000 || mult >= 1.5;
    this.replay?.mark(title);
    if (this.room && total >= 1500) this.room.event({ type: 'trick', name: title, pts: total });
    if (total >= 2500) this.tipUntil = this.time + 3.5;
    this.say(title, `+${total.toLocaleString()}${mult > 1 ? `<em>×${mult.toFixed(2).replace(/0$/, '')}</em>` : ''}`, sketchy ? 'sketchy' : line ? line.slice(0, -3) : '', big ? 'gold' : '');
    this.status(sketchy ? 'SKETCHY' : stomp ? 'STOMPED' : 'CLEAN LANDING');
    if (big) this.audio.chime();
  }

  onPlayerGrind(g) {
    const sc = this.sc;
    if (!sc || g.fell || g.t < 0.25) return;
    // a press (skis crossed, Space held) pays a quarter more while it's held
    let pts = 750 * g.t + 450 * g.swaps + (g.spinIn >= 180 ? 300 : 0) + 190 * Math.min(g.press, g.t);
    if (g.switchIn) pts *= 1.25;
    const name = `${g.spinIn >= 180 ? g.spinIn + ' on ' : ''}${g.switchIn && g.kind === '50-50' ? 'Switch 50-50' : g.kind}`;
    pts *= this.repeat(name + g.rail);
    this.addFeature(pts, name);
    this.liveCall = false;
  }

  onPlayerButter(b) {
    const sc = this.sc;
    if (!sc) return;
    const name = `${b.tail ? 'Tail' : 'Nose'} Butter${b.spin ? ' 180' : ''}`;
    const pts = Math.round((b.spin ? 300 : 150) * this.repeat(name));
    sc.score += pts;
    this.say(name, `+${pts}`, '', '', 1500);
  }

  onPlayerLand(t) {
    const p = this.player;
    this.audio.thump(Math.min(1, t.vn / 8));
    this.rig.bump(Math.min(0.6, t.vn / 20));
    this.burst(p, 20 + t.vn * 4, 2);
    const sc = this.sc;
    if (!sc) return;
    sc.air += t.air;
    const trick = t.spin >= 180 || t.flips > 0 || t.grabs.length > 0;
    // little hops on the flat don't count
    if (t.air < 0.5 && !trick) { if (sc.pend > 0) this.bank(sc.names[sc.names.length - 1] ?? '', t.sketchy, 0); return; }
    const turns = t.spin / 360 + t.flips;
    const rot = turns > 0 ? 900 * turns * turns * (1 + 0.15 * t.flips) * (t.switchIn ? 1.25 : 1) : 0;
    let pts = rot + 135 * t.air + 36 * Math.max(0, t.height);
    if (t.grabs.length) pts *= (1.25 + 0.25 * smoothstep(0.25, 1, t.grabs[0][1])) * (t.grabs.length > 1 ? 1.3 : 1);
    if (t.pipe) pts += Math.max(0, t.rise) * 90;
    // stomped it: a landing that matched the slope pays 15% more
    if (t.stomp) pts *= 1.15;
    const name = this.trickName(t);
    // riding off the end of a rail is part of the rail, not a feature of its own
    if (t.fromRail && !trick) { sc.pend += pts; this.bank(sc.names[sc.names.length - 1] ?? '', t.sketchy, t.air); return; }
    pts *= this.repeat(name || 'air');
    this.addFeature(pts, name);
    this.bank(name, t.sketchy, t.air, t.stomp);
  }

  // ---------------- modes ----------------
  start(mode) {
    if (mode === 'free') mode = 'run';
    if (mode !== 'run' && PARK_ID !== 'yard') mode = 'run';
    this.replay?.close();
    this.replay?.reset();
    if (this.who === 'multi') { this.joinRoom(); if (this.room) this.room.me.outfit = this.outfit(); }
    this.audio.start();
    this.mode = mode;
    $('menu').classList.add('hidden');
    $('results').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('callout').innerHTML = '';
    this.raceTime = 0;
    this.finishShown = false;
    this.cheerT = 0;
    this.sc = null;
    this.holdR = 0;
    this.world.arcade = mode !== 'race';
    $('scorebox').classList.toggle('hidden', mode === 'race');
    $('racebox').classList.toggle('hidden', mode !== 'race');
    $('course').classList.toggle('hidden', mode === 'park');
    $('botbar').classList.toggle('hidden', mode === 'park');
    if (mode === 'race') {
      this.populateRace();
      this.state = 'countdown';
      this.countdown = 3.6;
      this.lastBeep = 4;
    } else if (mode === 'park') {
      this.populatePark();
      this.state = 'free';
      this.resetScore();
      this.say('SKI PARK', '', 'jumps left · rails right · pipe far right · 1–4 pick a line', '', 3200);
    } else {
      this.populateFree(false);
      this.state = 'free';
      this.resetScore();
      this.say('DROP IN', '', 'summit to village · hold R to restart', '', 3000);
    }
    if (params.get('auto') === '1') {
      this.player.ai = new AIController(this.player, mode === 'race' ? 'racer' : 'park', this.rnd, this.world); this.player.ai.skill = 0.95;
      if (params.get('line')) { this.player.ai.line = params.get('line'); this.parkSpawn(this.player, params.get('line')); }
    }
    const z = Number(params.get('z'));
    if (z) this.player.place(centerX(z) + Number(params.get('x') ?? 0), z, null, Number(params.get('v') ?? 15));
    if (params.get('cam')) while (this.rig.mode !== params.get('cam')) this.cycleCam();
    this.rig.snap = true;
    this.secName = '';
    this.startAt = this.time;
  }

  // hold R: back to the top (the whole run, or your park line), score wiped
  restart() {
    if (this.mode === 'park') { this.parkSpawn(this.player, this.player.parkLine ?? 'gate'); this.say('BACK TO THE TOP', '', '', '', 1200); }
    else { this.start(this.mode); return; }
    this.rig.snap = true;
  }

  buildMinimap() {
    const svg = $('minimap');
    let mx = 0;
    const cx0 = centerX(START_Z);
    const pts = [];
    for (let z = START_Z; z <= FINISH_Z; z += 40) pts.push([centerX(z) - cx0, z]);
    for (const [x] of pts) mx = Math.max(mx, Math.abs(x));
    const k = 16 / Math.max(mx, 40);
    this.mm = { k, cx0 };
    const P = (x, z) => [(22 + x * k).toFixed(1), (4 + ((z - START_Z) / (FINISH_Z - START_Z)) * 120).toFixed(1)];
    const d = pts.map(([x, z], i) => (i ? 'L' : 'M') + P(x, z).join(' ')).join(' ');
    const feats = JUMPS.map((J) => P(centerX(J.z) - cx0 + J.dx * 0.15, J.z)).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="rgba(255,255,255,.75)"/>`).join('');
    svg.innerHTML = `<path d="${d}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="5" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>${feats}<circle id="mmdot" r="4.5" fill="#fff" stroke="#10141c" stroke-width="2"/>`;
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
      <div class="row"><button class="btn p" id="r-again">Race again</button><button class="btn" id="r-replay">Watch replay</button><button class="btn" id="r-menu">Menu</button></div>`;
    $('results').classList.remove('hidden');
    $('r-again').onclick = () => this.start('race');
    $('r-replay').onclick = () => { if (this.replay.open('all')) $('results').classList.add('hidden'); };
    $('r-menu').onclick = () => this.showMenu();
    const best = Number(store.get('best', '0'));
    const mine = this.racers.find((r) => r.s === this.player).finish;
    if (mine && (!best || mine < best)) store.set('best', mine);
  }

  finishRun() {
    this.state = 'results';
    const sc = this.sc;
    const prev = Number(store.get('best.run.' + PARK_ID, '0'));
    const isBest = sc.score > prev;
    if (isBest) store.set('best.run.' + PARK_ID, sc.score);
    $('rescard').innerHTML = `<h2>RUN COMPLETE</h2>
      <div class="bigscore">${sc.score.toLocaleString()}</div><p class="lead" style="margin-top:0">${isBest ? 'New best run.' : prev ? `Best ${prev.toLocaleString()}` : ''}</p>
      <div class="stats">
        <div class="stat"><b>${clock(sc.t)}</b><span>Time</span></div>
        <div class="stat"><b>${Math.round(sc.top * 3.6)} km/h</b><span>Top speed</span></div>
        <div class="stat"><b>${sc.clean}</b><span>Clean landings</span></div>
        <div class="stat"><b>${sc.crashes}</b><span>Bails</span></div>
      </div>
      <p class="lead" style="margin-top:16px">Best trick <b style="color:var(--gold)">${sc.best.name}</b>${sc.best.pts ? ' · ' + sc.best.pts.toLocaleString() : ''}</p>
      <div class="row"><button class="btn p" id="r-lift">Ride again</button><button class="btn" id="r-replay">Watch replay</button><button class="btn" id="r-menu">Menu</button></div>`;
    $('results').classList.remove('hidden');
    $('r-lift').onclick = () => this.start('run');
    $('r-replay').onclick = () => { if (this.replay.open('all')) $('results').classList.add('hidden'); };
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
    // run / park bookkeeping
    if ((this.state === 'free' || this.state === 'results') && this.player && this.sc) {
      const p = this.player, sc = this.sc;
      if (!sc.started && (p.speed > 1.2 || this.mode === 'park')) sc.started = true;
      if (sc.started && !sc.done) sc.t += h;
      sc.top = Math.max(sc.top, p.speed);
      // a line stays open while the features keep coming
      if (sc.n > 0 && p.onGround && !p.grind && this.time - sc.last > 6) sc.n = 0;
      if (this.mode === 'run' && !sc.done && p.pos.z > FINISH_Z) {
        sc.done = true;
        this.finishAt = this.time;
        this.say('FINISH', clock(sc.t), `${sc.score.toLocaleString()} points`, 'gold', 2400);
        this.audio.cheer(); this.cheerT = 3;
      }
      if (this.mode === 'run' && sc.done && !this.finishShown && this.time - this.finishAt > 2.6) { this.finishShown = true; this.finishRun(); }
      // the park loops: through the bottom and you're back at the top of your line
      if (this.mode === 'park' && p.pos.z > PARK.z1 + 45 && p.crash <= 0) {
        sc.laps++;
        const dx = p.pos.x - centerX(p.pos.z);
        const line = dx < -44 ? 'rollers' : dx < -12 ? 'jumps' : dx < 38 ? (dx > 12 ? 'rails' : 'middle') : 'pipe';
        this.parkSpawn(p, line === 'middle' ? 'gate' : line);
        this.rig.snap = true;
        const prev = Number(store.get('best.park', '0'));
        if (sc.score > prev) store.set('best.park', sc.score);
        this.say(`LAP ${sc.laps}`, '', 'back to the top', '', 1600);
      }
    }
    if (this.mode === 'park') {
      for (const ai of this.ais) {
        const s = ai.s;
        if (s.pos.z > PARK.z1 + 30 || s.stuck > 4 || (ai.finished && ai.restTimer > 1)) this.parkSpawn(s, ai.line ?? 'middle', 0);
      }
    }
    // AI who reached the village ride the lift back up
    for (const ai of this.ais) {
      if ((this.mode === 'race' || this.mode === 'park') && this.state !== 'menu') continue;
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
      const pw = s.surf.powder, ice = s.surf.ice;
      // powder throws plumes, ice barely sprays at all
      const rate = (s.skid * 10 + Math.max(0, carve - 8) * 0.9 + (s.controls.brake ? 8 : 0) + pw * sp * 1.6) * Math.min(1, sp / 10) * (sp > 6 ? 1 : 0.3) * (1 - ice * 0.75);
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
        1.6 + pw * 1.5, 0.32 + Math.min(s.skid, 3) * 0.08 + pw * 0.35, 0.85 + pw * 0.6, n);
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
    // watching a replay: the world holds still
    if (this.replay?.on) {
      this.replay.keys(inp);
      if (this.replay.on) { this.replay.update(dt); this.renderWorld(dt, true); inp.endFrame(); return; }
    }
    if (this.state !== 'menu' && this.player && !this.paused && inp.hit('KeyV') && this.replay.open('last')) { inp.endFrame(); return; }
    // multiplayer: hold Tab for the room, T to chat
    if (this.state !== 'menu') this.showPlayers(inp.down('Tab'));
    if (this.room && this.state !== 'menu' && inp.hit('KeyT')) {
      const box = $('chatbox'), el = $('chatin');
      box.classList.remove('hidden'); el.value = ''; setTimeout(() => el.focus(), 0);
      el.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { const t = el.value.trim(); if (t) { this.room.event({ type: 'chat', text: t.slice(0, 80) }); this.feed(`<b>${esc(this.nick)}</b> ${esc(t)}`, 7000); } }
        if (e.key === 'Enter' || e.key === 'Escape') { box.classList.add('hidden'); el.blur(); }
      };
    }
    if (inp.hit('Escape') || inp.hit('KeyP') || inp.padHit?.[9]) this.setPaused(!this.paused);
    if (inp.hit('KeyM')) { this.audio.setMuted(!this.audio.muted); store.set('muted', this.audio.muted ? '1' : '0'); }
    if (inp.hit('KeyC') || inp.padHit?.[12]) this.cycleCam();
    if (inp.hit('Enter') || inp.padHit?.[0]) {
      if (this.state === 'menu') this.go();
      else if (this.state === 'results' && !$('results').classList.contains('hidden')) this.start(this.mode);
    }

    if (!this.paused) {
      if (this.player && !this.player.ai) {
        const c = inp.read(dt, !this.player.onGround && !this.player.grind);
        Object.assign(this.player.controls, c);
        if (this.state === 'countdown' || this.state === 'results') { this.player.controls.steer = 0; this.player.controls.tuck = 0; this.player.controls.brake = this.state === 'results' ? 1 : 0; this.player.controls.jump = false; }
        if (this.mode === 'race') {
          if ((inp.hit('KeyR') || inp.padHit?.[8]) && this.state !== 'countdown') { this.player.respawn(); this.rig.snap = true; }
        } else {
          // hold R (or View) to restart
          const held = inp.down('KeyR') || !!inp.pad()?.buttons[8]?.pressed;
          this.holdR = held ? (this.holdR ?? 0) + dt : 0;
          const need = this.mode === 'park' ? 0.7 : 2;
          if (this.holdR >= need) { this.holdR = -99; this.restart(); }
        }
        if (this.mode === 'park') {
          const keys = { Digit1: 'jumps', Digit2: 'rails', Digit3: 'pipe', Digit4: 'rollers' };
          const names = { jumps: 'JUMP LINE', rails: 'RAIL GARDEN', pipe: 'HALFPIPE', rollers: 'ROLLERS' };
          for (const [k, line] of Object.entries(keys)) if (inp.hit(k)) { this.parkSpawn(this.player, line); this.rig.snap = true; this.say(names[line], '', '', '', 1200); }
        }
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

    // the replay records what you ride
    if (this.player && !this.paused && this.state !== 'menu' && this.state !== 'countdown') this.replay.record(dt, this.player);
    this.renderWorld(dt, false);
    inp.endFrame();
  }

  renderWorld(dt, replaying) {
    const cam = this.camera;
    if (replaying) { /* the replay placed the camera */ }
    else if (this.state === 'menu') { this.menuT = (this.menuT ?? 0) + dt; this.rig.menu(dt, this.menuT, this.skiers); }
    else if (this.player) this.rig.update(dt, this.player);
    if (window.__freeCam) { const f = window.__freeCam; cam.position.set(...f.pos); cam.lookAt(...f.look); cam.fov = f.fov ?? 55; cam.updateProjectionMatrix(); }
    if (!replaying) for (const s of this.skiers) s.updateVisual(dt, cam.position);
    this.room?.update(dt, this.state === 'menu' || replaying ? null : this.player, cam.position);
    // never let another skier block the view of the player
    if (!replaying && this.player && this.state !== 'menu' && this.rig.mode !== 'tv') {
      const P = this.player.pos, C = cam.position;
      const dPC = C.distanceTo(P);
      for (const s of this.skiers) {
        if (s === this.player || !s.model.group.visible) continue;
        const dC = C.distanceTo(s.pos);
        const between = dC < dPC + 0.5 && s.pos.distanceTo(P) < dPC + 0.5;
        if (dC < 2.5 || (between && dC < dPC)) {
          const t = new THREE.Vector3().subVectors(s.pos, C).dot(new THREE.Vector3().subVectors(P, C).normalize());
          const closest = new THREE.Vector3().subVectors(P, C).normalize().multiplyScalar(t).add(C);
          if (dC < 2.5 || closest.distanceTo(s.pos) < 1.6) s.model.group.visible = false;
        }
      }
    }
    if (!this.paused && !replaying) {
      this.spray(dt);
      this.particles.update(dt, this.sunLit);
      this.debris.update(dt);
      this.snowfall.update(dt, cam.position);
    }
    const focus = this.player && this.state !== 'menu' ? this.player.pos : cam.position;
    this.terrain.update(cam.position.x, cam.position.z, 4);
    this.forest.update(cam, this.time, this.env.sunDir);
    this.props.updateLift(this.time);
    this.lights.update(cam, focus);
    this.cheerT = Math.max(0, (this.cheerT ?? 0) - dt);
    const nearFinish = smoothstep(260, 40, Math.abs(cam.position.z - FINISH_Z));
    this.props.cheer(this.time, this.cheerT > 0 ? 1 : 0);
    this.env.follow(focus, dt);
    this.audio.update(this.state === 'menu' ? null : this.player, nearFinish * (0.25 + (this.cheerT > 0 ? 0.75 : 0)));
    if (this.state !== 'menu' && this.player && !replaying) this.hud(dt);
    const sp = replaying ? this.replay.ghost.speed : this.player && this.state !== 'menu' ? this.player.speed : 0;
    this.post.lens.uniforms.uSpeed.value = smoothstep(14, 40, sp) * (this.rig.mode === 'tv' ? 0 : 1);
    this.post.lens.uniforms.uFlash.value *= 0.9;
    cam.updateMatrixWorld();
    AG.uCamWorld.value.copy(cam.matrixWorld);
    this.post.sun(cam, this.env.sunDir, PRESETS[this.tod].shafts ?? 0);
    this.post.render(dt);
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
        // ignore throttled/background tabs (a few fps) - that's the browser, not the GPU
        if (this.fps < 48 && this.fps > 15) this.dprScale = Math.max(0.55, this.dprScale - 0.1);
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
    const name = this.mode === 'race' ? sectionName(p.pos.z) : zoneAt(p.pos.x, p.pos.z);
    if (name !== this.secName) { this.secName = name; $('zone').textContent = name; }
    // speed, or air time while flying
    const kmh = Math.round(p.speed * 3.6);
    const flying = !p.onGround && !p.grind && p.crash <= 0 && p.airTime > 0.2;
    if (flying !== this.wasFlying) {
      this.wasFlying = flying;
      $('spdl').textContent = flying ? 'Air time' : 'Speed';
      $('spdu').textContent = flying ? 'S' : 'KM/H';
    }
    $('spd').textContent = flying ? p.airTime.toFixed(1) : kmh;
    $('spdbar').firstChild.style.width = Math.min(100, (kmh / 140) * 100).toFixed(1) + '%';
    this.statusT = Math.max(0, (this.statusT ?? 0) - dt);
    $('air2').textContent = flying ? `${kmh} KM/H · ${Math.round(Math.max(0, p.maxAirY))} M` : this.statusT > 0 ? this.statusTxt : '';
    // run progress: the minimap, altitude, distance left, the bar along the bottom
    if (this.mode !== 'park') {
      const k = clamp((p.pos.z - START_Z) / (FINISH_Z - START_Z), 0, 1);
      const dot = $('mmdot');
      if (dot) { dot.setAttribute('cx', (22 + (p.pos.x - this.mm.cx0) * this.mm.k).toFixed(1)); dot.setAttribute('cy', (4 + k * 120).toFixed(1)); }
      $('alt').textContent = `${Math.round(1650 + p.pos.y).toLocaleString()} M`;
      $('kmleft').textContent = `${Math.max(0, (FINISH_Z - p.pos.z) / 1000).toFixed(1)} KM LEFT`;
      $('botbar').firstChild.style.width = (k * 100).toFixed(2) + '%';
    }
    if (this.mode === 'race') {
      const rs = this.standings();
      const me = rs.findIndex((r) => r.s === p) + 1;
      $('pos').innerHTML = `${me}<sup>${ord(me)}</sup> <small>/ ${rs.length}</small>`;
      const r = this.racers.find((x) => x.s === p);
      $('gates').textContent = `Gate ${Math.min(r.gate + 1, GATES.length)} / ${GATES.length}`;
      this.boardT = (this.boardT ?? 0) - dt;
      if (this.boardT <= 0) {
        this.boardT = 0.25;
        const show = rs.map((x, i) => [x, i]).filter(([x, i]) => i < 3 || x.s === p);
        $('board').innerHTML = show.map(([x, i]) => `<div class="${x.s === p ? 'me' : ''}"><i style="background:${hex(x.color)}"></i>${x.s.name}<b>${i + 1}</b></div>`).join('');
      }
      const t = r.finish ?? this.raceTime + r.pen;
      $('timer').textContent = fmt(t);
      this.penFlash = Math.max(0, (this.penFlash ?? 0) - dt);
      $('timer').style.color = this.penFlash > 0 ? '#ff8d7a' : '';
    } else if (this.sc) {
      const sc = this.sc;
      $('timer').textContent = clock(sc.t);
      // the score rolls up to the new total
      sc.shown += (sc.score - sc.shown) * Math.min(1, dt * 6);
      if (Math.abs(sc.score - sc.shown) < 1) sc.shown = sc.score;
      $('score').textContent = Math.round(sc.shown).toLocaleString();
      const live = sc.n > 0 && (sc.pend > 0 || this.time - sc.last < 6);
      $('combo').textContent = live && sc.n > 1 ? `LINE ×${this.lineMult().toFixed(2).replace(/0$/, '')}` : this.mode === 'park' && sc.laps ? `LAP ${sc.laps + 1}` : '';
      // on a rail: the slide and its points tick up live
      if (p.grind && p.grind.t > 0.12) {
        const g = p.grind;
        const pts = Math.round((750 * g.t + 450 * g.swaps) * (g.switchIn ? 1.25 : 1));
        const el = $('callout');
        if (!this.liveCall) { el.innerHTML = `<div class="c"><div class="n"></div><div class="p"></div></div>`; this.liveCall = true; clearTimeout(this.sayT); }
        el.querySelector('.n').textContent = g.kind;
        el.querySelector('.p').textContent = '+' + pts.toLocaleString();
      } else if (this.liveCall && p.onGround) { this.liveCall = false; $('callout').firstChild?.classList.add('out'); }
    }
    // hints: load the pop, restart, the speed each park table wants
    let hint = '';
    if ((p.onGround || p.grind) && p.jumpCharge > 0.12 && p.crash <= 0) hint = 'Release to pop';
    else if (p.grind && p.grind.t < 1.2) hint = 'A / D to swap · space to pop';
    const h = $('hint');
    if (hint !== this.hintTxt) { this.hintTxt = hint; h.textContent = hint; h.classList.toggle('hidden', !hint); }
    let tip = '';
    const stuck = p.stuck > 3 && this.state !== 'countdown';
    if (stuck) tip = this.mode === 'race' ? 'Press R to get back on the piste' : 'Hold R to go back to the top';
    if (!tip && this.mode !== 'race' && p.onGround && p.crash <= 0) {
      const dx = p.pos.x - centerX(p.pos.z);
      for (const J of JUMPS) {
        if (J.drop) continue;
        const dz = J.z - p.pos.z;
        if (dz > 0 && dz < 45 && Math.abs(dx - J.dx) < J.w / 2 + 3) {
          const want = Math.round(J.speed * 3.6), now = kmh;
          tip = `${J.name} · ${want - 2}–${want + 3} km/h${now < want - 6 ? ' · tuck!' : now > want + 8 ? ' · scrub some speed' : ' · good speed'}`;
          break;
        }
      }
    }
    if (!tip && this.time < (this.tipUntil ?? 0)) tip = 'V · instant replay';
    if (!tip && this.sc && this.time - (this.startAt ?? 0) < 10 && !document.body.classList.contains('touch')) tip = 'A/D spin · W/S flip · arrows roll · Shift/Q/E grab · hold Space, release to pop';
    const tp = $('tip');
    if (tip !== this.tipTxt) { this.tipTxt = tip; tp.textContent = tip; tp.classList.toggle('hidden', !tip); }
    // hold-to-restart ring
    const need = this.mode === 'park' ? 0.7 : 2;
    const hk = this.holdR > 0.15 ? Math.min(1, this.holdR / need) : 0;
    $('hold').classList.toggle('hidden', !hk);
    if (hk) { $('holdring').setAttribute('stroke-dashoffset', (94.25 * (1 - hk)).toFixed(1)); $('holdlbl').textContent = this.mode === 'park' ? 'Top of the line' : 'Restart run'; }
  }
}

const game = new Game();
game.boot().catch((e) => { console.error(e); $('loadmsg').textContent = 'Error: ' + e.message; });
