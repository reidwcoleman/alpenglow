// Stomped: boot, game modes (The Run / Ski Park / Race the Cup), scoring, loop, HUD.
import * as THREE from 'three';
import { Environment, PRESETS, COND, WX_WEIGHT } from './sky.js';
import { Terrain, CLOUDS } from './terrain.js';
import { Forest } from './trees.js';
import { Props } from './props.js';
import { Smash } from './smash.js';
import { Injuries } from './injury.js';
import { Trail } from './trail.js';
import { Rescue } from './rescue.js';
import { DropPicker } from './drop.js';
import { Music } from './music.js';
import { Tracks } from './tracks.js';
import { Particles, Snowfall, DiamondDust } from './particles.js';
import { Skier } from './skier.js';
import { FarRiders } from './farriders.js';
import { batchStatic } from './batch.js';
import { QUALITY_NAME, LO } from './gfx.js';
import { Pool } from './pool.js';
import { paintTextures } from './proctex.js';
import { AIController } from './ai.js';
import { randomOutfit } from './skiermodel.js';
import { Input, ACTIONS, keyLabel } from './input.js';
import { CameraRig, CAM_DEFAULTS, CAM_RANGE } from './camera.js';
import { Audio } from './audio.js';
import { Post } from './post.js';
import { AG, ShadeField, patchTree, patchMaterial } from './atmos.js';
import { Debris } from './debris.js';
import { Park } from './park.js';
import { Floodlights } from './night.js';
import { Replay } from './replay.js';
import { Room, myId } from './net.js';
import { Meta } from './meta.js';
import { Cloud, SERVERS, packReplay, errText } from './cloud.js';
import { SNAP_N } from './snap.js';
import { EVENT, TIERS, field, prize, MEDAL } from './events.js';
import { LESSONS, LESSON, quickSpec, COMBOS, ARROW, comboFor, comboSteps } from './school.js';
import { Menu, FLAKE } from './menu.js';
import { saveRun, getRun } from './vault.js';
import { MAPS, MAP_IDS } from './maps.js';
import { preloadAvatars, preloadRiders } from './avatar.js';
import { mulberry32, clamp, smoothstep } from './noise.js';
import { START_Z, FINISH_Z, GATES, centerX, halfWidth, sectionName, heightAt, PARK, JUMPS, RAILS, PARK_JUMPS, PARK_RAILS, PIPE, ROLLERS, zoneAt, PARK_ID, MAP } from './course.js';
import { modelParts, models } from './models.js';
import { startBakes } from './bake.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
// hidden things (far riders, race gates outside a race) skip the per-frame matrix walk; they
// catch up the frame they're shown, or whenever their parent moves
const umw = THREE.Object3D.prototype.updateMatrixWorld;
THREE.Object3D.prototype.updateMatrixWorld = function (force) { if (this.visible || force) umw.call(this, force); };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const _v = new THREE.Vector3();
const store = {
  get(k, d) { try { const v = localStorage.getItem('alpenglow.' + k); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('alpenglow.' + k, v); } catch { /* private mode */ } },
};

const NAMES = ['Ana Berg', 'Jonas Falk', 'Lena Moser', 'Marco Valli', 'Ingrid Dahl', 'Felix Gruber', 'Sofia Rinaldi', 'Kai Lindqvist', 'Elin Strand', 'Theo Baumann', 'Mila Novak', 'Nils Eriksen', 'Clara Huber', 'Luca Ferrari', 'Hanna Aas', 'Emil Steiner'];
const QUALITY = {
  low: { label: 'Fast', dpr: 1, shadow: 2048, msaa: 0, bloom: false, smaa: true, riders: 650, far: 140 },
  high: { label: 'High', dpr: 1.25, shadow: 4096, msaa: 0, bloom: true, smaa: true, riders: 1000, far: 200 },
  ultra: { label: 'Ultra', dpr: 2, shadow: 4096, msaa: 4, bloom: true, smaa: false, riders: 1400, far: 280 },
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
    // a sky asked for in the address (screenshots, shared links) holds for the first run
    this.wxPinned = params.has('tod');
    if (!PRESETS[this.tod]) this.tod = 'golden';
    this.quality = QUALITY_NAME;
    // the wallet, the pass, the kit; the shared server keeps a copy of it all
    this.meta = new Meta();
    this.cloud = new Cloud();
    this.meta.onSave = () => this.cloudSave();
    this.cloud.on('user', (u) => this.onCloudUser(u));
    this.cloud.on('status', () => this.menu?.account());
    // skis or a snowboard
    this.gear = params.get('gear') ?? store.get('gear', 'ski');
    if (!['ski', 'board'].includes(this.gear)) this.gear = 'ski';
    // every trick name ever landed on this browser
    try { this.book = new Set(JSON.parse(store.get('book', '[]'))); } catch { this.book = new Set(); }
    this.selMode = store.get('mode', 'run');
    if (!['run', 'park', 'race'].includes(this.selMode)) this.selMode = 'run';
    this.selPark = PARK_ID;
    store.set('park', PARK_ID);
    // multiplayer: who you are, which room
    this.id = myId();
    this.who = params.get('room') ? 'multi' : store.get('who', 'solo');
    this.roomName = params.get('room') ?? store.get('room.' + PARK_ID, SERVERS[PARK_ID]?.[0] ?? 'public');
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
    const setLoad = (p, m) => { if (m) $('loadmsg').textContent = m; this.loadPart('steps', p / 100); (window.__loadT ??= []).push([Math.round(performance.now()), p, m ?? '']); };
    const canvas = $('gl');
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false }));
    r.toneMapping = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping }[params.get('tm') ?? 'aces'];
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.maxDpr = Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].dpr);
    Skier.drawDist = QUALITY[this.quality].riders;
    Skier.farDist = QUALITY[this.quality].far;
    r.setPixelRatio(this.maxDpr);
    r.setSize(innerWidth, innerHeight, false);
    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 70000);
    this.env = new Environment(r, scene);
    this.env.sun.shadow.mapSize.setScalar(QUALITY[this.quality].shadow);
    // everything that's only arithmetic goes out to the loading threads now, all at once, and
    // the downloads start with it; the rest is built here while they work
    const pool = new Pool();
    // which Blender sets there are for this park (blender/*.py): the scenery ones stream in once
    // the game is up, and what they replace isn't built here meanwhile
    const blendP = models().then(async (M) => ({
      village: !!M['village_' + PARK_ID],
      ...Object.fromEntries(await Promise.all(['lift', 'props'].map(async (k) => [k, M[k] ? await modelParts(k).catch(() => null) : null]))),
    }));
    const treesP = pool.job({ kind: 'trees' });
    const shadeP = pool.job({ kind: 'grid', args: ShadeField.grid() });
    const avatarsP = preloadRiders();
    // (the scanned crowd: not needed until the people go up, behind the front page)
    this.crowdP = avatarsP.then(() => preloadAvatars((k) => this.loadPart('riders', k))).catch((e) => console.warn('avatars', e));
    this.terrain = new Terrain(scene, this.env);
    const terrainP = this.terrain.prime(centerX(START_Z), START_Z, pool, (k) => this.loadPart('mountain', k));
    setLoad(4, 'Loading the sky…');
    await this.env.load(this.tod);
    this.env.apply(this.tod);
    setLoad(20, 'Growing the forest…');
    this.forest = new Forest(scene, await treesP);
    await this.forest.buildRender(r, patchMaterial, this.quality, (params.get('look') ?? store.get('look', 'cartoon')) === 'cartoon');
    setLoad(40, 'Building the lift and the village…');
    await nextFrame();
    this.smash = new Smash(this.forest);
    this.props = new Props(scene, this.forest, this.env, this.smash, await blendP);
    setLoad(55, 'Shaping the park…');
    this.park = new Park(scene, this.terrain.material, this.smash);
    await this.park.build();
    this.lights = new Floodlights(scene, this.quality);
    this.tracks = new Tracks(scene);
    // (your own line keeps a ring of its own, so it stays down the hill behind you)
    this.myTracks = new Tracks(scene, 16000);
    this.particles = new Particles(scene, LO ? 8000 : 14000);
    this.snowfall = new Snowfall(scene);
    this.dust = new DiamondDust(scene);
    this.debris = new Debris(scene);
    this.debris.fx = this.particles;
    this.world = { scene, forest: this.forest, tracks: this.tracks, myTracks: this.myTracks, particles: this.particles, race: false, raceStarted: false, skiers: this.skiers, arcade: true, glades: !!MAP.glades,
      smash: this.smash, netHit: (s, z, pen) => this.props.netHit(s, z, pen) };
    // a pole or a sign goes down: a knock, a puff of snow (and a jolt if it was you)
    this.injuries = new Injuries(scene);
    this.trail = new Trail(scene);
    this.farRiders = new FarRiders(scene);
    this.rescue = new Rescue(this);
    this.smash.onHit = (o, sp) => {
      const d = this.camera.position.distanceTo(_v.set(o.x, heightAt(o.x, o.z), o.z));
      if (d < 60) this.audio.clack(Math.min(1, 0.4 + sp / 25) * (1 - d / 60), o.kind === 'sign');
      if (d < 120) this.particles.emit(o.x, heightAt(o.x, o.z) + 0.3, o.z, 0, 1.2, 0, 2.5, 0.45, 1, 18);
    };
    this.shade = new ShadeField(r, (await shadeP).data);
    patchTree(scene);
    this.post = new Post(r, scene, this.camera, { ...QUALITY[this.quality], ...JSON.parse(params.get('post') ?? '{}') });
    this.post.setPixelRatio(this.maxDpr);
    this.post.setSize(innerWidth, innerHeight);
    this.input = new Input();
    this.audio = new Audio();
    this.audio.setMuted(store.get('muted', '0') === '1');
    this.music = new Music(this.audio);
    // sound can only start from a click or a key: the first one starts it (and the music)
    const wake = () => { this.audio.start(); removeEventListener('pointerdown', wake); removeEventListener('keydown', wake); };
    addEventListener('pointerdown', wake); addEventListener('keydown', wake);
    this.music.on = store.get('music', 'on') !== 'off';
    this.rig = new CameraRig(this.camera);
    this.applyConditions();
    setLoad(75, 'Grooming the piste…');
    await terrainP;
    setLoad(86, 'Waking up the skiers…');
    await avatarsP;
    pool.close();
    const direct = params.get('event') || (params.get('menu') === '0' && params.get('mode')) || params.get('watch') || params.get('cwatch');
    // the people on the hill, the riders, the park's batching and the shaders: none of it shows
    // on the front page (it's art over the world), so that opens now and this finishes behind
    // it; going straight into a run waits for it here
    const wmark = (m) => (window.__loadT ??= []).push([Math.round(performance.now()), 'warm', m]);
    const warm = async () => {
      await nextFrame();
      wmark('start');
      await this.crowdP;
      try { this.props.buildPeople(); } catch (e) { console.warn('people', e); }
      this.populateFree(true);
      wmark('people');
      // the park never moves (bar what you knock over): its matrices are worked out once
      const live = new Set();
      for (const o of this.smash.all) for (const q of o.parts) q.obj?.traverse((x) => live.add(x));
      batchStatic(this.park.group, live);
      this.park.group.updateMatrixWorld(true);
      this.park.group.traverse((o) => { if (!live.has(o)) o.matrixAutoUpdate = false; });
      wmark('batch');
      await nextFrame();
      // compile the shaders (in parallel where the browser can) before the first frame of a run
      this.rig.menu(0.016, 0, this.skiers);
      this.terrain.update(this.camera.position.x, this.camera.position.z, 1e9);
      this.forest.update(this.camera, 0, this.env.sunDir);
      // (into the post-processing's buffer, as a real frame draws them: compiled for the canvas
      // they'd be the wrong variant, sRGB out with tone mapping, and the first frame would build
      // every one again)
      this.renderer.setRenderTarget(this.post.composer.readBuffer);
      await this.renderer.compileAsync(scene, this.camera).catch(() => this.renderer.compile(scene, this.camera));
      this.renderer.setRenderTarget(null);
      wmark('compile');
      // the buildings' painted stone, timber and concrete (proctex.js)
      await paintTextures(nextFrame);
      wmark('paint');
      // and every texture up to the GPU a few at a time (the first frame would otherwise do the
      // lot at once, a second or more of nothing on a phone)
      await this.uploadTextures();
      wmark('upload');
      // behind the front page, one whole frame unseen: whatever's left to set up (the shadow
      // pass's shaders, the post-processing's) happens now, not on the first frame of a run
      if (!direct) {
        await nextFrame();
        this.post.render(0.016);
        wmark('first frame');
      }
      // the Blender scenery for this park, as it comes down
      if (this.props.blend.village) modelParts('village_' + PARK_ID).then((B) => { const m = this.props.addVillage(B); if (m) patchMaterial(m.material); }).catch((e) => console.warn('village', e));
      startBakes();
      // and the other skies, for when the weather turns
      setTimeout(() => { for (const p of Object.values(PRESETS)) this.env.ensure(p.hdri); }, 2500);
    };
    if (direct) { setLoad(92, 'Waking up the skiers…'); await warm(); }
    else this.warming = warm().catch((e) => console.warn('warm', e)).finally(() => { this.warming = null; });
    setLoad(100, 'Ready');
    addEventListener('resize', () => this.resize());
    this.bindUI();
    this.replay = new Replay(this);
    this.drop = new DropPicker(this);
    this.clock = new THREE.Timer();
    this.renderer.setAnimationLoop(() => this.frame());
    // the loading screen goes once there's something to see: straight into a run, after its
    // first few frames (the slow ones, setting up); otherwise with the front page
    this.unveil = direct ? 4 : 1;
    const mode = params.get('mode');
    if (params.get('event') && EVENT[params.get('event')]) this.startEvent(params.get('event'), Math.max(0, Math.min(2, Number(params.get('tier') ?? 1))));
    else if (params.get('menu') === '0' && mode) this.start(mode === 'race' ? 'race' : mode === 'park' ? 'park' : 'run');
    else {
      this.showMenu();
      // (just switched park from the menu: straight on to where to drop in)
      if (params.get('drop') === 'run' || params.get('drop') === 'park') this.drop.open(params.get('drop'));
    }
    // ?cwatch=<replay id>: a run from the global leaderboard
    if (params.get('cwatch')) this.menu.watchCloud(params.get('cwatch'), PARK_ID);
    // ?watch=<id>: a saved run from the Replays tab
    if (params.get('watch')) getRun(params.get('watch')).then((run) => { if (run) { this.menu.setTab('replays'); this.replay.reset(); this.replay.load(run); this.replay.open('all'); } });
    window.__game = this;
    window.__course = { centerX, halfWidth, heightAt, FINISH_Z, JUMPS, RAILS };
    window.__cx = centerX;
    window.__parkJumps = PARK_JUMPS;
    window.__rails = RAILS;
    window.__jumps = JUMPS;
    window.__h = heightAt;
    window.__lift = this.props.liftPoints;
    window.__ready = true;
    // (the front page opened before any of this: a button pressed meanwhile goes through now)
    $('menu').classList.remove('warming');
    const early = window.__early;
    if (early) { window.__early = null; early.classList.remove('queued'); setTimeout(() => early.click(), 0); }
    this.cloud.start();
    // keep the game on the device for next time (sw.js; the published site only)
    if (import.meta.env.PROD && 'serviceWorker' in navigator) setTimeout(() => navigator.serviceWorker.register(BASE + 'sw.js').catch(() => {}), 3000);
  }

  async uploadTextures() {
    const seen = new Set();
    const take = (v) => { if (v?.isTexture && !seen.has(v)) seen.add(v); };
    this.scene.traverse((o) => {
      for (const m of [o.material].flat()) {
        if (!m) continue;
        for (const k in m) take(m[k]);
        if (m.uniforms) for (const k in m.uniforms) take(m.uniforms[k]?.value);
        if (m.userData?.shared) for (const k in m.userData.shared) take(m.userData.shared[k]?.value);
      }
    });
    let t = performance.now();
    for (const tex of seen) {
      // (not downloaded yet: it goes up when it arrives)
      const img = tex.image;
      if (!img || (img.width ?? img.data?.length) === undefined || (img.complete === false)) continue;
      this.renderer.initTexture(tex);
      if (performance.now() - t > 24) { await nextFrame(); t = performance.now(); }
    }
  }

  // the loading bar: the steps here, the mountain on the loading threads and the riders
  // downloading all count towards it
  loadPart(k, v) {
    const P = (this.parts ??= { steps: 0, mountain: 0, riders: 0 });
    P[k] = Math.max(P[k], v);
    const all = P.steps * 0.45 + P.mountain * 0.35 + P.riders * 0.2;
    window.__loadProgress?.(all);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.post.setSize(innerWidth, innerHeight);
  }

  applyConditions() {
    this.env.cam = this.camera;
    this.env.apply(this.tod);
    this.shade?.compute(this.env.sunDir);
    const night = !!PRESETS[this.tod].night;
    const P0 = PRESETS[this.tod];
    // wind: gusts across the run on the snowy days
    if (this.world) this.world.wind = P0.wind ? { x: 0.8, z: 0.6, s: 0, base: P0.wind } : null;
    // the snow under you that day
    const cond = COND[P0.cond] ?? COND.groomed;
    if (this.world) this.world.snow = cond;
    this.terrain?.setCondition?.(cond);
    // fair-weather clouds throw their shadows across the mountain
    CLOUDS.value.x = { bluebird: 0.45, spring: 0.38, arctic: 0.3, golden: 0.32, alpenglow: 0.2 }[this.tod] ?? 0;
    this.lights?.setActive(night);
    AG.uAgDirect.value = night ? 0 : 1;
    const dusk = { bluebird: 0.05, golden: 0.45, alpenglow: 1, storm: 0.35, night: 1, nightsnow: 1, whiteout: 0.4, flurries: 0.25, arctic: 0.15, spring: 0 }[this.tod] ?? 0;
    this.props.setDusk(dusk);
    this.snowfall.points.visible = !!P0.snow;
    this.snowfall.setAmount?.(P0.snow ?? 0);
    // diamond dust: ice crystals in the air on the cold clear days
    this.dust?.setAmount(({ arctic: 1, bluebird: 0.7, golden: 0.5, night: 0.25, spring: 0.2 }[this.tod] ?? 0) * 0.35);
    const warm = { bluebird: [1.0, 1.0, 1.02], golden: [1.04, 1.0, 0.95], alpenglow: [1.05, 0.98, 1.0], storm: [0.98, 1.0, 1.03], night: [0.98, 1.0, 1.06], nightsnow: [0.97, 1.0, 1.07],
      spring: [1.02, 1.0, 0.98], arctic: [0.97, 1.0, 1.05], flurries: [0.99, 1.0, 1.03], whiteout: [0.98, 1.0, 1.02] }[this.tod] ?? [1, 1, 1];
    // (and the house look leans cool: blue-grey shade, clean white snow)
    this.post.lens.uniforms.uWarm.value.set(warm[0] * 0.975, warm[1] * 1.0, warm[2] * 0.99);
    // shade and light tints, and how much S-curve each day gets
    const G = {
      bluebird: [[0.93, 0.98, 1.07], [1.0, 1.0, 1.0], 0.22], golden: [[0.9, 0.95, 1.08], [1.06, 1.0, 0.9], 0.3],
      alpenglow: [[0.92, 0.95, 1.05], [1.07, 0.97, 0.96], 0.42, 0.94], storm: [[0.97, 0.99, 1.03], [1.0, 1.0, 0.99], 0.12],
      night: [[0.9, 0.97, 1.1], [1.04, 1.0, 0.94], 0.25], nightsnow: [[0.92, 0.97, 1.08], [1.03, 1.0, 0.96], 0.18],
      spring: [[0.96, 0.98, 1.04], [1.04, 1.01, 0.96], 0.2], arctic: [[0.92, 0.98, 1.09], [1.0, 1.0, 1.01], 0.25],
      flurries: [[0.96, 0.99, 1.04], [1.01, 1.0, 0.99], 0.12], whiteout: [[0.98, 0.99, 1.02], [1.0, 1.0, 1.0], 0.05],
    }[this.tod] ?? [[1, 1, 1], [1, 1, 1], 0];
    this.post.lens.uniforms.uShadowT.value.set(...G[0]);
    this.post.lens.uniforms.uHighT.value.set(...G[1]);
    // (a soft, muted grade: pale snow, a quiet sky, gentle contrast)
    this.post.lens.uniforms.uCurve.value = G[2] * 0.5;
    this.post.lens.uniforms.uSat.value = (G[3] ?? 1.08) * 0.84;
    this.post.lens.uniforms.uCon.value = 0.97;
    // (nights go deep navy, the shade lifted only a little and toward blue)
    this.post.lens.uniforms.uLift.value.set(...(night ? [0.006, 0.014, 0.034] : [0.02, 0.03, 0.036]));
    if (night) this.post.lens.uniforms.uWarm.value.multiply(new THREE.Vector3(0.82, 0.94, 1.16));
    this.post.shafts.uniforms.uTint.value.set(PRESETS[this.tod].sun ?? 0xffffff).multiplyScalar(0.9);
    const p = PRESETS[this.tod];
    // snow spray: lit like snow (albedo ~0.9 over pi) by the sun and the sky
    const e = this.env;
    this.sunLit = new THREE.Color(p.sun).multiplyScalar(e.sunL * Math.max(0.15, e.sunDir.y) * 0.29).addScalar(e.skyL * 0.29);
    // (and its parts, for snow in the air: the sun full on, the sky's blue fill, the light the
    // slope throws back up under it)
    const sunI = e.sun.intensity, skyI = e.skyL * (p.envK ?? 1);
    const sky = new THREE.Color(0.86, 0.94, 1.1).multiplyScalar(skyI * 0.29);
    this.sprayLight = {
      sun0: new THREE.Color(p.sun).multiplyScalar(sunI * 0.29), sun: new THREE.Color(), sky,
      bounce: new THREE.Color(p.sun).multiplyScalar(sunI * Math.max(0, e.sunDir.y) * 0.29).addScalar(skyI * 0.29).multiplyScalar(0.85),
      sunset: p.sunset ?? null,
      // falling flakes: the sky's light and some of the sun's (at night the floodlights catch them)
      flake: sky.clone().add(new THREE.Color(p.sun).multiplyScalar(sunI * 0.29 * 0.45)).multiplyScalar(night ? 2.2 : 1),
    };
    // (at night the spray is thrown up into the floodlights over the piste, not the moonlight:
    // without this it comes out as dark smoke over the lit snow)
    if (night) { sky.multiplyScalar(3.4); this.sprayLight.bounce.multiplyScalar(3.4); }
  }

  // a random sky and snow for this run
  rollWeather() {
    const list = Object.entries(WX_WEIGHT).filter(([k]) => k !== this.tod || Math.random() < 0.15);
    let r = Math.random() * list.reduce((a, [, w]) => a + w, 0);
    let pick = list[0][0];
    for (const [k, w] of list) { r -= w; if (r <= 0) { pick = k; break; } }
    this.tod = pick;
    this.applyConditions();
    for (const b of $('tod').children) b.classList.toggle('on', b.textContent === PRESETS[this.tod].label);
  }

  weatherLine() {
    const p = PRESETS[this.tod];
    return `${p.label} · ${(COND[p.cond] ?? COND.groomed).name}`;
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
    const sc = $('ctrl');
    for (const [k, label] of [['arrows', 'Arrows + numbers'], ['classic', 'Classic (WASD)']]) {
      const b = document.createElement('button');
      b.textContent = label; b.className = k === this.input.scheme ? 'on' : '';
      b.onclick = () => { this.input.setScheme(k); [...sc.children].forEach((c) => c.classList.toggle('on', c === b)); };
      sc.appendChild(b);
    }
    this.buildKeys();
    // Cork7's sound sliders: music, wind, effects
    for (const [k, label] of [['music', 'MUSIC'], ['wind', 'WIND'], ['fx', 'EFFECTS']]) {
      const v = clamp(+store.get('vol_' + k, 100) || 0, 0, 100);
      this.audio.setVol(k, v / 100);
      const row = document.createElement('div'); row.className = 'rig-sl';
      row.innerHTML = `<label>${label}</label><input type="range" min="0" max="100" step="5" value="${v}"><b>${v}%</b>`;
      const inp = row.querySelector('input'), out = row.querySelector('b');
      inp.oninput = () => { out.textContent = inp.value + '%'; store.set('vol_' + k, +inp.value); this.audio.setVol(k, inp.value / 100); };
      $('vols').appendChild(row);
    }
    const mus = $('mus');
    for (const [k, label] of [['on', 'On'], ['off', 'Off']]) {
      const b = document.createElement('button');
      b.textContent = label; b.className = k === store.get('music', 'on') ? 'on' : '';
      b.onclick = () => { store.set('music', k); this.music.setOn(k === 'on'); this.audio.start(); [...mus.children].forEach((c) => c.classList.toggle('on', c === b)); $('np').classList.toggle('off', k !== 'on'); };
      mus.appendChild(b);
    }
    const gore = $('gore');
    for (const [k, label] of [['on', 'Realistic'], ['off', 'Off']]) {
      const b = document.createElement('button');
      b.textContent = label; b.className = k === store.get('gore', 'on') ? 'on' : '';
      b.onclick = () => { store.set('gore', k); [...gore.children].forEach((c) => c.classList.toggle('on', c === b)); };
      gore.appendChild(b);
    }
    // the look: Cork7's cartoon shading (default) or the photographic one
    const look = $('look');
    AG.uToon.value = (params.get('look') ?? store.get('look', 'cartoon')) === 'cartoon' ? 1 : 0;
    for (const [k, label] of [['cartoon', 'Cartoon'], ['real', 'Realistic']]) {
      const b = document.createElement('button');
      b.textContent = label; b.className = k === store.get('look', 'cartoon') ? 'on' : '';
      b.onclick = () => { store.set('look', k); AG.uToon.value = k === 'cartoon' ? 1 : 0; this.forest?.setLook(k === 'cartoon'); [...look.children].forEach((c) => c.classList.toggle('on', c === b)); };
      look.appendChild(b);
    }
    // Cork7's camera and stats settings
    const segOpt = (id, key, def, opts, apply) => {
      const el = $(id);
      apply(store.get(key, def));
      for (const [k, label] of opts) {
        const b = document.createElement('button');
        b.textContent = label; b.className = k === store.get(key, def) ? 'on' : '';
        b.onclick = () => { store.set(key, k); apply(k); [...el.children].forEach((c) => c.classList.toggle('on', c === b)); };
        el.appendChild(b);
      }
    };
    this.buildCamRig();
    segOpt('camm', 'camMode', 'chase', [['chase', 'Chase'], ['helmet', 'First person'], ['drone', 'Drone']], (k) => { this.rig.mode = k; this.rig.snap = true; });
    segOpt('fpsc', 'fpsCap', 'max', [['max', 'Max'], ['30', '30']], (k) => { this.cap30 = k === '30'; });
    segOpt('statsc', 'stats', 'off', [['off', 'Off'], ['on', 'FPS']], (k) => { this.showStats = k === 'on'; $('stats').classList.toggle('hidden', k !== 'on'); });
    const wx = $('wx');
    for (const [k, label] of [['change', 'New every run'], ['fixed', 'Keep what I pick']]) {
      const b = document.createElement('button');
      b.textContent = label; b.className = k === store.get('wx', 'change') ? 'on' : '';
      b.onclick = () => { store.set('wx', k); [...wx.children].forEach((c) => c.classList.toggle('on', c === b)); };
      wx.appendChild(b);
    }
    const q = $('qual');
    for (const [k, v] of Object.entries(QUALITY)) {
      const b = document.createElement('button');
      b.textContent = v.label; b.className = k === this.quality ? 'on' : '';
      b.onclick = () => { if (k === this.quality) return; store.set('quality', k); location.reload(); };
      q.appendChild(b);
    }
    // the ride tab: the park, the mode, solo or multiplayer
    const chips = [...document.querySelectorAll('#modes button')];
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
    this.setWho = (w) => {
      this.who = w; store.set('who', w);
      whos.forEach((b) => b.classList.toggle('on', b.dataset.who === w));
      $('mp-panel').classList.toggle('hidden', w !== 'multi');
      if (w === 'multi' && this.state === 'menu') this.joinRoom();
      if (w === 'solo') this.leaveRoom();
    };
    for (const b of whos) b.onclick = () => this.setWho(b.dataset.who);
    $('mp-name').value = this.nick;
    $('mp-room').value = this.roomName;
    $('mp-name').onchange = () => this.rename($('mp-name').value);
    $('mp-room').onchange = () => { const v = $('mp-room').value.trim(); if (v) this.pickServer(v); };
    $('mp-race').onclick = () => this.callRace();
    $('mp-copy').onclick = () => {
      const url = `${location.origin}${location.pathname}?park=${this.selPark}&room=${encodeURIComponent(this.roomName || 'public')}`;
      navigator.clipboard?.writeText(url).then(() => { $('mp-copy').textContent = 'Copied'; setTimeout(() => ($('mp-copy').textContent = 'Copy invite'), 1500); });
    };
    this.setWho(this.who);
    $('b-ride').onclick = () => this.go();
    $('pk-ride').onclick = () => this.go();
    $('pk-back').onclick = () => this.closeParks();
    for (const b of document.querySelectorAll('#pk-tod button')) b.onclick = () => { this.wxPinned = true; this.setNight(b.dataset.n === '1'); };
    addEventListener('resize', () => this.layoutParks());
    $('menubtn').onclick = () => this.setPaused(true);
    // the music player in the corner (pausing it is the same as Music off in the menu)
    const npSync = () => { $('np').classList.toggle('off', !this.music.on); [...$('mus').children].forEach((c, i) => c.classList.toggle('on', (i === 0) === this.music.on)); };
    $('np-play').onclick = () => { const on = !this.music.on; store.set('music', on ? 'on' : 'off'); this.music.setOn(on); this.audio.start(); npSync(); };
    $('np-next').onclick = () => { this.music.skip(1); this.audio.start(); };
    $('np-prev').onclick = () => { this.music.skip(-1); this.audio.start(); };
    $('np-open').onclick = () => this.setPaused(true);
    npSync();
    $('p-resume').onclick = () => this.setPaused(false);
    $('p-restart').onclick = () => { this.setPaused(false); this.start(this.mode); };
    $('p-menu').onclick = () => { this.setPaused(false); this.showMenu(); };
    $('tc-cam').onclick = () => this.cycleCam();
    if (matchMedia('(pointer: coarse)').matches) { document.body.classList.add('touch'); $('tc-cam').classList.remove('hidden'); }
    this.buildMinimap();
    this.menu = new Menu(this);
  }

  setGear(g) {
    this.gear = g; store.set('gear', g);
    this.kitChanged();
    this.cloudSave();
  }

  // ---------------- accounts and the shared server ----------------
  saveBook() { store.set('book', JSON.stringify([...this.book].slice(-400))); this.cloudSave(); }

  // the profile goes up a moment after anything changes
  cloudSave() {
    if (this.cloud.status !== 'online' || !this.cloudReady) return;
    this.cloud.saveProfile({ ...this.meta.export(), name: this.nick, gear: this.gear, book: [...this.book].slice(-400) });
  }

  // signed in (a guest on first visit): take the cloud save, or send ours up
  async onCloudUser(u) {
    const prev = store.get('cloudUid', '');
    const doc = await this.cloud.loadProfile();
    if (this.cloud.uid !== u.uid) return;
    if (doc && prev === u.uid) {
      if ((doc.rev ?? 0) > this.meta.rev) this.applyProfile(doc, false);
    } else if (doc) this.applyProfile(doc, true);
    store.set('cloudUid', u.uid);
    this.cloudReady = true;
    this.cloudSave();
    this.menu?.account();
    this.menu?.refresh();
  }

  applyProfile(d, merge) {
    this.meta.import(d, merge);
    if (Array.isArray(d.book)) { if (!merge) this.book = new Set(); for (const n of d.book) this.book.add(n); store.set('book', JSON.stringify([...this.book].slice(-400))); }
    if (d.name && (!merge || /^Rider [A-Z0-9]{3}$/.test(this.nick))) { this.nick = d.name; store.set('name', this.nick); $('mp-name').value = this.nick; }
    if (d.gear && !merge) { this.gear = d.gear; store.set('gear', this.gear); }
    this.kitChanged();
  }

  // a new rider name: claimed on the server so nobody else has it
  async rename(v) {
    const name = v.trim().replace(/\s+/g, ' ').slice(0, 16);
    if (!name || name === this.nick) { $('mp-name').value = this.nick; return; }
    if (this.cloud.status === 'online') {
      try { await this.cloud.claimName(name, this.nick); } catch (e) { this.toast(esc(errText(e))); $('mp-name').value = this.nick; return; }
    }
    this.nick = name; $('mp-name').value = name; store.set('name', name);
    if (this.room) { this.room.me.name = name; this.room.hello(); }
    this.cloudSave();
    this.menu?.account();
  }

  async signOut() {
    await this.cloud.flush();
    store.set('cloudUid', '');
    this.cloudReady = false;
    this.meta.reset();
    this.book = new Set(); store.set('book', '[]');
    this.nick = 'Rider ' + Math.random().toString(36).slice(2, 5).toUpperCase(); store.set('name', this.nick); $('mp-name').value = this.nick;
    await this.cloud.signOut();
    this.kitChanged();
  }

  // a finished run on the global boards (and its replay for anyone to watch)
  submit(board, entry, pk) {
    if (this.cloud.status !== 'online') return;
    const o = this.outfit();
    const e = { name: this.nick, gear: this.gear, level: this.meta.level, park: PARK_ID, jacket: o.jacket, outfit: o, ...entry };
    this.cloud.submit(board, e, pk && pk.times.length > 30 ? () => packReplay(pk, SNAP_N) : null).then((r) => {
      if (r?.allTime) this.toast(`New personal best on the ${esc(MAPS[PARK_ID].name)} board`, 3000);
    });
  }

  // the kit or the gear changed: the menu, the sticker and the room all see it
  kitChanged() {
    if (this.room) { this.room.me.outfit = this.outfit(); this.room.hello(); }
    this.menu?.refresh();
  }

  setMuted(m) { this.audio.setMuted(m); store.set('muted', m ? '1' : '0'); }

  menuTab(k) { this.menu?.setTab(k); }

  toast(html, ms = 2600) {
    const t = $('toast');
    t.innerHTML = html; t.classList.remove('hidden');
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.add('hidden'), ms);
  }

  showBest() {
    const m = this.selMode;
    const best = m === 'race' ? Number(store.get('best', '0')) : Number(store.get(m === 'run' ? 'best.run.' + this.selPark : 'best.park', '0'));
    $('best').style.visibility = '';
    $('best').innerHTML = best ? (m === 'race' ? `Best Cup time<b>${fmt(best)}</b>` : `Best ${m === 'run' ? MAPS[this.selPark].name : 'park session'}<b>${best.toLocaleString()}</b>`) : 'No score yet<b>Send it</b>';
  }

  outfit() { return this.meta.outfit(this.myOutfit, this.gear === 'board'); }

  // a rider for the mountain: about a third ride a snowboard (more in the park)
  aiOutfit(style) {
    const o = randomOutfit(this.rnd);
    o.board = style !== 'racer' && this.rnd() < (style === 'park' ? 0.45 : style === 'beginner' ? 0.4 : 0.3);
    if (o.board && o.boots === 0xf0f0f0) o.boots = 0x2a2d35;
    return o;
  }

  // the trick book: families of tricks, ticked once one's been landed
  showBook() {
    const B = this.gear === 'board';
    const has = (re) => [...this.book].some((n) => re.test(n));
    const fam = [
      ['Spins', B ? [['FS 360', /^(Switch )?FS 360/], ['BS 360', /^(Switch )?BS 360/], ['Half Cab', /Half Cab/], ['540', /\b540\b/], ['720', /\b720\b/], ['900', /\b900\b/], ['1080', /\b1080\b/], ['1260+', /\b(1260|1440|1620|1800)\b/]]
        : [['360', /\b360\b/], ['540', /\b540\b/], ['720', /\b720\b/], ['900', /\b900\b/], ['1080', /\b1080\b/], ['1260+', /\b(1260|1440|1620|1800)\b/], ['Switch', /^Switch/], ['Spin out of a rail', /Out$/]]],
      ['Flips', [['Backflip', /Backflip/], ['Frontflip', /Frontflip/], B ? ['Wildcat', /Wildcat/] : ['Sideflip', /Sideflip/], B ? ['Tamedog', /Tamedog/] : ['Flatspin', /Flatspin/], ['Double', /Double/], ['Triple', /Triple|Quad/]]],
      ['Off-axis', [['Cork', /Cork/], [B ? 'Misty' : 'Bio', B ? /Misty/ : /Bio/], ['Rodeo', /Rodeo/], ['Double Cork', /Double Cork/], [B ? 'Flatspin' : 'Misty', B ? /Flatspin/ : /Misty/]]],
      ['Grabs', (B ? [['Indy', /Indy/], ['Melon', /Melon/], ['Method', /Method/], ['Stalefish', /Stalefish/], ['Nose Grab', /Nose(?! Butter| Press)/], ['Tail Grab', /Tail(?! Butter| Press)/]]
        : [['Mute', /Mute/], ['Japan', /Japan/], ['Safety', /Safety/], ['Critical', /Critical/], ['Nose Grab', /Nose(?! Butter| Press)/], ['Tail Grab', /Tail(?! Butter| Press)/]]).concat([['Grab to grab', / to /], ['Tweaked', /Tweaked/]])],
      ['Style', [['Shifty', /Shifty/], [B ? 'Boned' : 'Daffy', B ? /Boned/ : /Daffy/], ['Butter', /Butter/], ['Butter 360', /Butter 360|Butter 540/]]],
      ['Rails', [['50-50', /50-50/], ['Lipslide', /Lipslide/], ['Boardslide', /Boardslide/], ['Nose Press', /Nose Press/], ['Tail Press', /Tail Press/], ['Spin on', /\bon /]]],
    ];
    let got = 0, all = 0;
    $('book').innerHTML = fam.map(([h, list]) => `<div class="h">${h}</div>` + list.map(([n, re]) => {
      const ok = has(re); all++; if (ok) got++;
      return `<div class="t${ok ? ' got' : ''}"><b>${n}</b>${ok ? 'landed' : 'not yet'}</div>`;
    }).join('')).join('');
    $('book-n').textContent = `${got}/${all} · ${this.book.size} tricks`;
  }

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
      const POS = { yard: [15, 40], slope: [45, 47], forest: [57, 38], bigair: [76, 17], timber: [48, 80], grand: [30, 14], mega: [36, 64], canyon: [62, 62], cloud: [84, 34] };
      const COL = { yard: '#7fe0c4', slope: '#ff8a5c', forest: '#9fd36b', bigair: '#ff5c7a', timber: '#c6e36b', grand: '#8ec8ff', mega: '#d68cff', canyon: '#ffb347', cloud: '#bfe8ff' };
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
      // (a race starts straight away; otherwise the new park opens on the drop picker)
      const q = new URLSearchParams(mode === 'race' ? { park: this.selPark, menu: '0', mode, tod: this.tod } : { park: this.selPark, drop: mode, tod: this.tod });
      if (this.who === 'multi') q.set('room', this.roomName || 'public');
      location.search = q.toString();
      return;
    }
    this.closeParks();
    // pick where to drop in (a race always starts in the gate)
    if (mode === 'race') this.start(mode); else this.drop.open(mode);
  }

  // ---------------- multiplayer ----------------
  async joinRoom() {
    if (this.room) return;
    if (this.cloud.status === 'loading') await Promise.race([this.cloud.ready, new Promise((r) => setTimeout(r, 6000))]);
    if (this.room) return;
    const room = (this.room = new Room(this, PARK_ID, this.roomName || 'public', { id: this.id, name: this.nick, outfit: this.outfit(), level: this.meta.level }, this.cloud));
    room.on('status', (st) => this.mpStatus());
    room.on('join', (p) => { this.feed(`<b style="color:${p.color}">${esc(p.name)}</b> dropped in`); this.mpStatus(); });
    room.on('leave', (p) => { this.feed(`<b style="color:${p.color}">${esc(p.name)}</b> left`); this.mpStatus(); });
    room.on('chat', (e) => this.feed(`<b style="color:${e.peer.color}">${esc(e.peer.name)}</b> ${esc(e.text)}`, 7000));
    room.on('trick', (e) => this.feed(`<b style="color:${e.peer.color}">${esc(e.peer.name)}</b> ${esc(e.name)} <b>+${Number(e.pts).toLocaleString()}</b>`));
    room.on('raceDone', (e) => this.feed(`<b style="color:${e.peer.color}">${esc(e.peer.name)}</b> finished the race · <b>${fmt(e.time)}</b>`, 7000));
    room.on('raceCall', (v) => this.onRaceCall(v));
    await room.connect();
    this.mpStatus();
  }

  leaveRoom() { if (this.room) { this.room.close(); this.room = null; } this.mpStatus(); }

  // a server from the list, or a private code
  pickServer(name) {
    this.roomName = name.slice(0, 16);
    store.set('room.' + PARK_ID, this.roomName);
    $('mp-room').value = SERVERS[PARK_ID]?.includes(this.roomName) ? '' : this.roomName;
    if (this.room) { this.leaveRoom(); this.joinRoom(); }
    this.menu?.servers();
  }

  mpStatus() {
    const r = this.room;
    const n = r ? r.peers.size + 1 : 0;
    $('mp-count').textContent = !r ? (this.cloud.status === 'online' ? 'Live servers' : 'Live rooms, free') : r.status === 'live' ? `${n} riding · ${r.label}` : r.status === 'offline' ? 'Offline, retrying' : 'Connecting…';
    $('live').classList.toggle('hidden', !r);
    $('live').classList.toggle('off', r?.status !== 'live');
    $('livelbl').textContent = r ? (r.status === 'live' ? `Live · ${r.label} · ${n} rider${n > 1 ? 's' : ''}` : 'Reconnecting') : '';
    $('mp-race').classList.toggle('hidden', !(r?.fire && PARK_ID === 'yard'));
    this.menu?.servers();
  }

  // everyone on this server races the Alpine Cup course from the same moment
  callRace() {
    if (!this.room?.fire) return;
    if (this.state !== 'menu' && this.mode === 'race') return;
    this.room.callRace(this.cloud.now() + 15000)?.catch(() => this.toast('Could not reach the server'));
  }

  onRaceCall(v) {
    if (!v || !v.at || v.at < this.cloud.now() - 3000 || v.at === this.raceAt) return;
    this.raceAt = v.at;
    const left = Math.round((v.at - this.cloud.now()) / 1000);
    this.feed(`<b>${esc(v.by ?? 'Someone')}</b> called a race · starts in ${left}s`, 6000);
    this.toast(`RACE ON ${esc(this.room?.label ?? 'THIS SERVER').toUpperCase()} IN ${left}S`, 4000);
    clearTimeout(this.raceCallT);
    // line up four seconds before the gun
    this.raceCallT = setTimeout(() => {
      if (!this.room || PARK_ID !== 'yard' || this.replay?.on) return;
      this.event = null;
      this.start('race', { online: v.at });
    }, Math.max(0, v.at - this.cloud.now() - 4500));
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
    const rows = [{ name: this.nick + ' (you)', color: hex(this.outfit().jacket), score: this.sc?.score ?? 0 }, ...[...(this.room?.peers.values() ?? [])].map((p) => ({ name: p.name, color: p.color, score: p.score ?? 0 }))]
      .sort((a, b) => b.score - a.score);
    el.innerHTML = `<h4>${this.room ? `${MAP.name} · ${this.room.room}` : 'Solo'}</h4>` + rows.map((r) => `<div class="r"><i style="background:${r.color}"></i>${esc(r.name)}<b>${r.score.toLocaleString()}</b></div>`).join('');
  }

  showMenu() {
    // a park session pays when you leave it
    if (this.mode === 'park' && this.sc) { const pay = this.reward('park'); if (pay) this.toast(`Park session ${pay}`, 3800); }
    this.rescue?.abort(); this.injuries?.clear();
    this.state = 'menu';
    this.mode = null;
    this.event = null; this.online = null; this.coach = null;
    this.showCoach();
    // on a server, stay on it in the menu (its race calls still reach you)
    if (this.who === 'multi') this.joinRoom();
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

  // Settings > Controls: click a key, press the new one (Esc cancels)
  buildKeys() {
    const el = $('keys'), inp = this.input;
    const draw = () => {
      el.innerHTML = '';
      for (const [id, label] of ACTIONS) {
        const row = document.createElement('div'); row.className = 'kb';
        row.innerHTML = `<span>${label}</span><button>${keyLabel(inp.bindOf(id))}</button>`;
        const b = row.querySelector('button');
        b.onclick = () => {
          b.textContent = 'PRESS A KEY'; b.classList.add('wait');
          inp.listen = (code) => { if (code !== 'Escape') inp.setBind(id, code); draw(); };
        };
        el.appendChild(row);
      }
      const rs = document.createElement('button'); rs.className = 'kreset'; rs.textContent = 'Reset keys';
      rs.onclick = () => { inp.resetBinds(); draw(); };
      el.appendChild(rs);
    };
    draw();
  }

  // Settings > Camera: Cork7's sliders (height, angle, distance, FOV, stiffness, tilt) and its
  // speed lens and trick cam switches, saved together
  buildCamRig() {
    const el = $('camrig'), O = this.rig.opt;
    let saved = {};
    try { saved = JSON.parse(store.get('camRig', '{}')) || {}; } catch { /* */ }
    if (store.get('speedFov', '') === 'off' && saved.speedFov === undefined) saved.speedFov = false;
    for (const k of Object.keys(CAM_DEFAULTS)) {
      const v = saved[k];
      if (typeof CAM_DEFAULTS[k] === 'boolean') O[k] = typeof v === 'boolean' ? v : CAM_DEFAULTS[k];
      else { const [lo, hi] = CAM_RANGE[k]; O[k] = Number.isFinite(v) ? clamp(v, lo, hi) : CAM_DEFAULTS[k]; }
    }
    const save = () => store.set('camRig', JSON.stringify(O));
    const fmt = { height: (v) => v.toFixed(1) + ' M', distance: (v) => v.toFixed(1) + ' M', angle: (v) => v + '°', fov: (v) => v + '°', stiffness: (v) => v + '%', slopeTilt: (v) => v + '%' };
    const draw = () => {
      el.innerHTML = '';
      const rows = [['height', 'HEIGHT'], ['angle', 'ANGLE'], ['distance', 'DISTANCE'], ['fov', 'FOV'], ['stiffness', 'STIFFNESS'], ['slopeTilt', 'TILT']];
      for (const [k, label] of rows) {
        const [lo, hi, st] = CAM_RANGE[k];
        const row = document.createElement('div'); row.className = 'rig-sl';
        row.innerHTML = `<label>${label}</label><input type="range" min="${lo}" max="${hi}" step="${st}" value="${O[k]}"><b>${fmt[k](O[k])}</b>`;
        const inp = row.querySelector('input'), out = row.querySelector('b');
        inp.oninput = () => { O[k] = +(+inp.value).toFixed(1); out.textContent = fmt[k](O[k]); save(); };
        el.appendChild(row);
      }
      for (const [k, label] of [['speedFov', 'Speed lens'], ['trickCam', 'Trick cam']]) {
        const row = document.createElement('div'); row.className = 'opt';
        row.innerHTML = `<label>${label}</label><div class="seg"><button>On</button><button>Off</button></div>`;
        const [on, off] = row.querySelectorAll('button');
        const set = (v) => { O[k] = v; on.className = v ? 'on' : ''; off.className = v ? '' : 'on'; save(); };
        on.onclick = () => set(true); off.onclick = () => set(false);
        on.className = O[k] ? 'on' : ''; off.className = O[k] ? '' : 'on';
        el.appendChild(row);
      }
      const rs = document.createElement('button'); rs.className = 'rig-reset'; rs.textContent = 'Reset camera';
      rs.onclick = () => { Object.assign(O, CAM_DEFAULTS); save(); draw(); };
      el.appendChild(rs);
    };
    draw();
  }

  cycleCam() {
    const m = this.rig.cycle();
    const names = { chase: 'Chase cam', action: 'Action cam', helmet: 'First person', drone: 'Drone', tv: 'TV cam' };
    const l = $('camlbl');
    l.textContent = names[m] + ' · C';
    l.classList.add('show');
    clearTimeout(this.camT); this.camT = setTimeout(() => l.classList.remove('show'), 1600);
  }

  // the big trick call-out on the left: one at a time, newest wins
  say(name, pts = '', sub = '', cls = '', ms = 2300, chips = []) {
    const el = $('callout');
    const f = chips.length ? `<span class="f">${chips.map((c) => `<i>${c}</i>`).join('')}</span>` : '';
    el.innerHTML = `<div class="c ${cls}"><div class="n">${name}</div>${pts || f ? `<div class="p">${pts}${f}</div>` : ''}${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
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
    s.on('yardsale', () => { if (!s.board && this.camera.position.distanceTo(s.pos) < 200) { this.debris.spawn(s); s.model.gearOff = true; } });
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
      const s = this.addSkier({ outfit: this.aiOutfit(style), name: NAMES[n % NAMES.length] }, style);
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
      const s = this.addSkier({ outfit: this.aiOutfit('park'), name: NAMES[n % NAMES.length] }, 'park');
      s.ai.line = line;
      this.parkSpawn(s, line, this.rnd() * 0.85);
      n++;
    }
    for (let i = 0; i < 4; i++) {
      const s = this.addSkier({ outfit: this.aiOutfit('carver'), name: NAMES[n++ % NAMES.length] }, i < 2 ? 'cruiser' : 'carver');
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

  // from: start further down the course; n: racers in the gate (1: a trial); tier: how quick they are
  populateRace({ from = null, n = 8, tier = 1 } = {}) {
    this.clearSkiers();
    this.world.race = true; this.world.raceStarted = false;
    this.props.setRaceMode(true);
    const z0 = from ?? START_Z;
    this.raceZ0 = z0;
    this.gate0 = GATES.findIndex((g) => g.z > z0 + 4);
    const all = [-10.5, -7.5, -4.5, -1.5, 1.5, 4.5, 7.5, 10.5];
    const lanes = all.slice((8 - n) >> 1, ((8 - n) >> 1) + n);
    const playerLane = n === 1 ? 0 : Math.floor(n / 2) - 1 + Math.floor(this.rnd() * 2);
    const names = [...NAMES].sort(() => this.rnd() - 0.5);
    let bib = 1;
    this.racers = [];
    lanes.forEach((off, i) => {
      const isP = i === playerLane;
      let outfit = randomOutfit(this.rnd, true);
      // you race in your own kit, as a speed suit
      if (isP) { const o = this.outfit(); outfit = { ...o, racer: true, pants: o.jacket, pants2: o.jacket2, ppat: o.jpat, beanie: 0, helmet: o.helmet ?? 0xf4f4f4 }; }
      const s = this.addSkier({ outfit, name: isP ? 'You' : names[i], isPlayer: isP, bib: bib++, grip: isP ? 1.75 : undefined, sidecut: 24 }, isP ? null : 'racer');
      s.place(centerX(z0) + off, z0, null, 0);
      if (s.ai) s.ai.lastZ = z0;
      if (isP) { this.player = s; this.hookPlayer(s); }
      this.racers.push({ s, gate: this.gate0, pen: 0, missed: 0, finish: null, color: outfit.jacket });
    });
    // skill spread by level: a couple of rivals are genuinely quick
    const [lo, hi] = TIERS[tier].skill;
    this.ais.forEach((ai, i) => { ai.skill = lo + (i / Math.max(1, this.ais.length - 1)) * (hi - lo) + this.rnd() * 0.02; ai.s.grip = 1.6 + ai.skill * 0.22; ai.gate = this.gate0; });
  }

  hookPlayer(p) {
    p.on('land', (t) => this.onPlayerLand(t));
    p.on('crash', (e) => {
      this.audio.thump(1.2); this.rig.bump(1);
      this.burst(p, 90, 5);
      const sc = this.sc;
      // a crash you don't get up from: injuries (unless they're turned off) and the rescue
      // a bail costs what you had riding: the unbanked line and the trick you were in, taken off
      // your score (Cork7 only shows it; here it really goes)
      const lost = sc ? this.bailLoss() : 0;
      if (e.injured) {
        if (sc) { sc.crashes++; sc.pend = 0; sc.n = 0; sc.names = []; }
        const gore = store.get('gore', 'on') !== 'off';
        this.injuries.hurt(p, gore);
        if (gore) this.audio.crack(0.6 + (e.severity ?? 0.5) * 0.4);
        this.rescue.start(p);
        return;
      }
      if (sc) {
        sc.crashes++;
        sc.pend = 0; sc.n = 0; sc.names = [];
        this.say('BAIL', lost > 0 ? `−${lost.toLocaleString()}` : '', lost > 0 ? '' : { landing: 'land it straight', tree: 'that tree did not move', skier: 'watch the traffic', rail: 'stay on top of it', net: 'into the nets', faceplant: 'too big to butter' }[e.reason] ?? '', 'bad', 1800);
        this.status('BAIL');
      } else this.say('WIPEOUT', '', e.reason === 'landing' ? 'land it straight' : '', 'bad');
    });
    p.on('smash', (e) => { this.rig.bump(e.kind === 'sign' ? 0.5 : 0.2); });
    p.on('impact', (e) => {
      if (e.kind === 'net') { this.audio.netHit(Math.min(1, e.speed / 10)); this.rig.bump(Math.min(0.6, e.speed / 18)); this.burst(p, 20 + e.speed * 3, 3); }
      else if (e.kind === 'boards') { this.audio.thump(Math.min(1, e.speed / 10)); this.rig.bump(0.5); }
    });
    // tumbling over: each slam into the snow throws it up (and, hurt, blood)
    p.on('tumbleHit', (e) => {
      this.burst(p, 30 + e.speed * 2, 3);
      this.audio.thump(Math.min(1, 0.3 + e.speed / 30));
      this.rig.bump(Math.min(0.7, e.speed / 25));
      this.injuries.slam(p);
    });
    p.on('branches', (e) => {
      // shoved through a tree: its snow comes down on you
      this.particles.emit(e.x, heightAt(e.x, e.z) + e.h * 0.5, e.z, 0, -1, 0, 2.8, 0.9, 1.6, 40);
      this.audio.branches?.(Math.min(1, e.speed / 12));
      this.rig.bump(0.25);
    });
    p.on('recover', () => { if (this.sc) this.say('BACK ON YOUR FEET', '', '', '', 1300); });
    p.on('grindStart', () => this.audio.thump(0.35));
    p.on('grindEnd', (g) => this.onPlayerGrind(g));
    p.on('railSwap', () => this.audio.beep(880, 0.05, 0.08));
    p.on('railHopLand', () => this.audio.thump(0.3));
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

  // takes a bail's points off the score (never below zero) and says how many went
  bailLoss() {
    const sc = this.sc;
    // (the trick in the air counts if it was on screen a moment ago)
    const air = this.time - (this.liveAt ?? -9) < 0.3 ? this.livePts ?? 0 : 0;
    this.livePts = 0;
    const lost = Math.min(sc.score, Math.round((sc.pend + air) * this.lineMult()));
    if (lost <= 0) return 0;
    sc.score -= lost;
    const el = $('score');
    el.classList.remove('drop'); void el.offsetWidth; el.classList.add('drop');
    return lost;
  }

  // Cork7: the same trick again pays 75%, 55%, then 40%, counted over the whole run (in the pipe,
  // only against your last three airs); the other way round, switch or another flip is a
  // different trick
  repeat(key, pipe = false) {
    const n = this.repeatCount(key, pipe);
    const sc = this.sc;
    (sc.recent ??= []).push(key);
    if (sc.recent.length > 3) sc.recent.shift();
    sc.reps.set(key, (sc.reps.get(key) ?? 0) + 1);
    return [1, 0.75, 0.55, 0.4][Math.min(n, 3)];
  }

  repeatCount(key, pipe = false) {
    return pipe ? (this.sc.recent ?? []).filter((k) => k === key).length : this.sc.reps.get(key) ?? 0;
  }

  // (what repeat() would give, without counting it)
  peekRepeat(key, pipe = false) {
    return [1, 0.75, 0.55, 0.4][Math.min(this.repeatCount(key, pipe), 3)];
  }

  // what a repeat is judged on: the rotation (and which way, and switch), not the grabs
  airKey(t) {
    const core = this.trickName({ ...t, grabs: [], shifty: false, daffy: false, pipe: false });
    return (core || 'STRAIGHT AIR') + (t.spin >= 180 ? (t.spinDir > 0 ? ' L' : ' R') : '') + (t.fromRail ? ' OFF' : '');
  }

  status(txt) { this.statusTxt = txt; this.statusT = 2.2; }

  trickName(t) {
    const B = t.board;
    const N = { cork: 'Cork', bio: B ? 'Misty' : 'Bio', rodeo: 'Rodeo', misty: 'Misty', flatspin: 'Flatspin', backflip: 'Backflip', frontflip: 'Frontflip', sideflip: B ? (t.flipDir < 0 ? 'Wildcat' : 'Tamedog') : 'Sideflip' };
    const mult = ['', '', 'Double ', 'Triple ', 'Quad '][Math.min(t.flips, 4)];
    // off a rail the spin counts in quarters: 270 out
    const spin = t.fromRail ? t.spin90 : t.spin;
    const spun = spin >= (t.fromRail ? 90 : 180);
    let core = '';
    if (t.flips && t.type) core = `${mult}${N[t.type]}${spun ? ' ' + spin : ''}`;
    else if (t.flips) core = `${mult}${t.flipDir > 0 ? 'Frontflip' : 'Backflip'}`;
    else if (spun) core = String(spin);
    // snowboarders call a spin by the way it turns: frontside, backside, cab (switch frontside)
    if (core && B && spun) {
      // (facing the other edge when switch: the same turn is the other side)
      const fs = (t.spinDir > 0) !== !!t.switchIn;
      if (t.switchIn) core = fs ? (core === '180' ? 'Half Cab' : 'Cab ' + core) : 'Switch BS ' + core;
      else core = (fs ? 'FS ' : 'BS ') + core;
    } else if (core && t.switchIn) core = 'Switch ' + core;
    if (core && t.fromRail && spun && !t.flips) core += ' Out';
    const SHORT = { mute: 'Mute', tail: 'Tail', japan: 'Japan', safety: 'Safety', critical: 'Critical', nose: 'Nose', indy: 'Indy', melon: 'Melon', method: 'Method', stalefish: 'Stalefish' };
    const LONE = { mute: 'Mute Grab', tail: 'Tail Grab', japan: 'Japan', safety: 'Safety Grab', critical: 'Critical', nose: 'Nose Grab', indy: 'Indy', melon: 'Melon', method: 'Method', stalefish: 'Stalefish' };
    const gl = t.grabs.map(([k]) => (core || t.grabs.length > 1 ? SHORT : LONE)[k] ?? 'Grab');
    let grabs = gl.join(' to ');
    // one grab held a long time is a tweaked one
    if (t.grabs.length === 1 && t.grabs[0][1] >= 1) grabs = 'Tweaked ' + grabs;
    const style = [t.shifty && 'Shifty', t.daffy && (B ? 'Boned' : 'Daffy')].filter(Boolean).join(' ');
    let name = [core, style, grabs].filter(Boolean).join(' ');
    if (!name && t.pipe) name = t.rise > 1.5 ? 'Big Pipe Air' : 'Pipe Air';
    return name;
  }

  addFeature(pts, name) {
    const sc = this.sc;
    sc.pend += pts; sc.n++; sc.last = this.time;
    if (name) sc.names.push(name);
  }

  // landing on snow banks the line
  // side: how sideways a saved landing came down (0..1); Cork7 pays it down to half, and only a
  // stomp (clean, from a real air) adds 450 and 15% of the line
  bank(name, sketchy, air, stomp = false, side = 1) {
    const sc = this.sc;
    const mult = this.lineMult();
    let award = sc.pend * mult * (sketchy ? 1 - 0.5 * clamp(side, 0, 1) : 1);
    const bonus = stomp ? 450 + award * 0.15 : 0;
    const total = Math.round(award + bonus);
    sc.pend = 0;
    if (total <= 0) return;
    sc.score += total; sc.clean++;
    const title = name || (sketchy ? 'SAVED IT' : stomp ? 'STOMPED' : 'CLEAN LANDING');
    // (Cork7 calls the landing, the trick having been on screen all through the air)
    const notice = sketchy ? 'SAVED IT' : stomp ? 'STOMPED' : 'CLEAN LANDING';
    const chips = [...(this.chips ?? []), ...(mult > 1 ? [`LINE ×${mult.toFixed(2).replace(/0$/, '')}`] : []), ...(sketchy && side > 0.05 ? [`SIDEWAYS ×${(1 - 0.5 * clamp(side, 0, 1)).toFixed(2)}`] : [])];
    this.chips = null;
    // a trick never landed before on this browser goes in the book
    const fresh = [...sc.names, name].filter((n) => n && !this.book.has(n));
    if (!sketchy) this.checkLessons([...sc.names, name].filter(Boolean));
    if (fresh.length && !sketchy) {
      for (const n of fresh) this.book.add(n);
      this.saveBook();
      sc.fresh = (sc.fresh ?? 0) + fresh.length;
    }
    if (total > sc.best.pts && name) sc.best = { pts: total, name };
    const prev = name && sc.names[sc.names.length - 1] === name ? sc.names.slice(0, -1) : sc.names.filter((x) => x !== name);
    const line = prev.length ? prev.join(' · ') + ' · ' : '';
    sc.names = [];
    const big = total > 6000 || mult >= 1.5;
    this.replay?.mark(title);
    if (this.room && total >= 1500) this.room.event({ type: 'trick', name: title, pts: total });
    this.say(notice, `+${total.toLocaleString()}`, (line + (name ?? '')).replace(/ · $/, ''), (big ? 'gold ' : '') + 'landed', 2300, chips);
    this.status(fresh.length && !sketchy ? 'NEW TRICK' : sketchy ? 'SKETCHY' : stomp ? 'STOMPED' : 'CLEAN LANDING');
    if (big || (fresh.length && !sketchy)) this.audio.chime();
    const daily = !sketchy && name && this.meta.checkDaily(name);
    if (daily) { this.toast(`DAILY CHALLENGE DONE · ${FLAKE} +${daily.reward}`, 3500); this.status('DAILY DONE'); }
  }

  onPlayerGrind(g) {
    const sc = this.sc;
    if (!sc || g.fell || g.t < 0.25) return;
    // Cork7: 750 a second on the bar and 450 a swap; a hop pays 450 for every quarter turned in
    // it; a spin onto the bar is scored as the air it was (1,500 x turns^2)
    let pts = this.railPts(g);
    for (const h of g.hopTurns ?? []) pts += (h / 90) * 450 * this.repeat(`HOP ${h}`);
    // held a nose or tail press for a good part of it (named, Cork7 pays no more for it)
    const press = g.nose >= g.t * 0.4 ? 'Nose Press' : g.tail >= g.t * 0.4 ? 'Tail Press' : '';
    let kind = g.switchIn && g.kind === '50-50' ? 'Switch 50-50' : g.kind;
    if (press) kind = g.kind === '50-50' ? (g.switchIn ? 'Switch ' : '') + press : `${kind} ${press}`;
    const hops = (g.hopTurns ?? []).map((h) => ` + Hop ${h}`).join('');
    const name = `${g.spinIn >= 90 ? g.spinIn + ' on ' : ''}${kind}${hops}`;
    this.addFeature(pts, name);
    this.liveCall = false;
  }

  railPts(g) {
    const on = g.spinIn >= 90 ? Math.round(1500 * (g.spinIn / 360) ** 2 * (g.switchIn ? 1.25 : 1)) : 0;
    return Math.round(750 * g.t) + 450 * g.swaps + on;
  }

  onPlayerButter(b) {
    const sc = this.sc;
    if (!sc) return;
    const name = `${b.tail ? 'Tail' : 'Nose'} Butter${b.spin ? ' ' + b.spin : ''}`;
    // (Cork7: each butter pays less than the one before, 100/75/55/40%, and only the first four
    // in a run score)
    const nb = sc.butters ?? 0;
    sc.butters = nb + 1;
    const pts = nb >= 4 ? 0 : Math.round((b.spin >= 360 ? 600 : b.spin >= 180 ? 300 : 150) * [1, 0.75, 0.55, 0.4][nb]);
    this.checkLessons([name]);
    if (!this.book.has(name)) { this.book.add(name); this.saveBook(); sc.fresh = (sc.fresh ?? 0) + 1; this.status('NEW TRICK'); }
    sc.score += pts;
    this.say(name, pts ? `+${pts}` : '', pts ? (b.landed ? 'LANDED IN A BUTTER' : '') : 'four butters a run score', '', 1500);
  }

  // Cork7: 1,500 x turns^2 (a 720 is four 360s); flips count as turns, but an off-axis one's
  // inversion is already in its spin; +15% for every time upside down, x1.25 switch. Returns the
  // points and the bonuses that made them (for the call-out's chips)
  trickPoints(t, rep = 1) {
    const spinT = (t.fromRail ? t.spin90 : t.spin) / 360;
    const offAxis = ['cork', 'bio', 'rodeo', 'misty', 'flatspin'].includes(t.type);
    const inv = offAxis ? Math.min(t.flips, Math.max(1, Math.floor((spinT * 360) / 450))) : t.flips;
    const turns = spinT + (offAxis ? 0 : t.flips);
    const rot = turns > 0 ? Math.round(1500 * turns * turns * (1 + 0.15 * inv) * (t.switchIn ? 1.25 : 1)) : 0;
    let pts = (rot + 135 * t.air + 36 * Math.max(0, t.height)) * rep;
    // grabs: 840 a second held, and (paid less on a repeat) 300 a grab, up to three, with the
    // rotation x(1 + 25% for the longest grab held to a second + 5% for each other grab)
    let gm = 1;
    if (t.grabs.length) {
      const n = Math.min(3, t.grabs.length);
      const hold = t.grabs.reduce((a, [, s]) => a + Math.min(1, s), 0);
      const longest = Math.min(1, Math.max(...t.grabs.map(([, s]) => s)));
      gm = 1 + 0.25 * longest + 0.05 * (n - 1);
      pts += hold * 840 + (n * 300 + rot * (gm - 1)) * rep;
    }
    if (t.pipe) pts += Math.max(0, t.rise) * 90;
    if (t.shifty) pts += 350;
    if (t.daffy) pts += 300;
    const chips = [];
    if (inv && rot) chips.push(`INVERTED ×${(1 + 0.15 * inv).toFixed(2).replace(/0$/, '')}`);
    if (t.switchIn && rot) chips.push('SWITCH ×1.25');
    if (t.grabs.length) chips.push(`${Math.min(3, t.grabs.length)} ${t.grabs.length > 1 ? 'GRABS' : 'GRAB'} ${rot ? '×' + gm.toFixed(2).replace(/0$/, '') : '+' + Math.min(3, t.grabs.length) * 300}`);
    return { pts, chips };
  }

  onPlayerLand(t) {
    this.livePts = 0;
    const p = this.player;
    // (a flat landing smacks; a landing down the slope is a soft thud)
    if (t.vn > 6.5 && t.air > 0.4) this.audio.smack(Math.min(1, t.vn / 12)); else this.audio.thump(Math.min(1, t.vn / 8));
    this.rig.bump(Math.min(0.6, t.vn / 20));
    this.burst(p, 20 + t.vn * 4, 2);
    const sc = this.sc;
    if (!sc) return;
    sc.air += t.air;
    const trick = t.spin >= 180 || t.flips > 0 || t.grabs.length > 0 || t.shifty || t.daffy || (t.fromRail && t.spin90 >= 90);
    // Cork7 only judges an air going down the hill, and off plain snow only one of over 1.05 s
    // and 1.3 m: small hops on the flat and quick taps don't count, trick or no trick
    const counts = (t.pipe || (t.vz ?? 1) > 0.5) && (!t.hop || t.pipe || (t.air >= 1.05 && t.height >= 1.3));
    if (!counts || (t.air < 0.5 && !trick)) { if (sc.pend > 0) this.bank(sc.names[sc.names.length - 1] ?? '', t.sketchy, 0); return; }
    const name = this.trickName(t);
    // riding off the end of a rail is part of the rail, not a feature of its own
    if (t.fromRail && !trick) { sc.pend += this.trickPoints(t).pts; this.bank(sc.names[sc.names.length - 1] ?? '', t.sketchy, t.air, t.stomp, t.side); return; }
    const rep = this.repeat(this.airKey(t), t.pipe);
    const { pts, chips } = this.trickPoints(t, rep);
    this.addFeature(pts, name);
    this.chips = [...chips, ...(rep < 1 ? [`REPEAT ×${rep}`] : [])];
    this.bank(name, t.sketchy, t.air, t.stomp, t.side);
    // Cork7: a stomp onto a downslope sends you (the skier gives the 2.6 m/s)
    if (p.strict) {
      if (t.boost > 0) { this.burst(p, 40, 2.5); this.audio.beep(660, 0.12, 0.08, 'sawtooth'); this.status(`BOOST +${Math.round(t.boost * 3.6)} KM/H`); }
    } else if (!t.sketchy && trick) {
      // land it clean and it sends you: a boost out of every trick, bigger for bigger tricks
      const boost = clamp(1.2 + pts / 1800, 1.2, 4.5) * (t.stomp ? 1.2 : 1);
      p.vel.addScaledVector(p.forward(_v), boost * (p.skiSwitch ? -1 : 1));
      this.burst(p, 40, 2.5);
      this.audio.beep(660, 0.12, 0.08, 'sawtooth');
      this.status(`BOOST +${Math.round(boost * 3.6)} KM/H`);
    }
  }

  // ---------------- modes ----------------
  // opts: { online: race start time (server clock) }; this.event: { ev, tier } for an event
  start(mode, opts = {}) {
    // (still finishing the mountain behind the front page: in a moment)
    if (this.warming) { this.warming.then(() => this.start(mode, opts)); return; }
    this.rescue?.abort(); this.injuries?.clear();
    if (mode === 'free') mode = 'run';
    if (mode === 'trial' || mode === 'contest') mode = mode === 'trial' ? 'race' : 'run';
    if (mode !== 'run' && PARK_ID !== 'yard') mode = 'run';
    this.online = opts.online ?? null;
    if (this.online) this.event = null;
    // a new day every time you drop in (unless the weather is fixed in the menu)
    if (store.get('wx', 'change') === 'change' && !opts.keepWeather && !this.wxPinned) this.rollWeather();
    this.wxPinned = false;
    this.smash.reset();
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
    $('hud').classList.toggle('nomap', mode === 'park');
    $('evtag').classList.toggle('hidden', !this.event && !this.online);
    $('wxtag').textContent = this.weatherLine();
    if (!this.coach) this.showCoach();
    if (this.event) $('evtag').textContent = `${this.event.ev.name} · ${TIERS[this.event.tier].name}`;
    if (this.online) $('evtag').textContent = `Server race · ${this.room?.label ?? ''}`;
    if (mode === 'race') {
      const ev = this.event?.ev;
      this.populateRace({ from: ev?.from, n: this.online || ev?.kind === 'trial' ? 1 : ev?.racers ?? 8, tier: this.event?.tier ?? 1 });
      // the full course (a race or the trial) shares one board; the sprint has its own
      this.raceBoard = ev?.from ? `ev-${ev.id}` : `race-${PARK_ID}`;
      this.state = 'countdown';
      this.countdown = this.online ? Math.max(1.5, (this.online - this.cloud.now()) / 1000) : 3.6;
      this.lastBeep = 4;
    } else if (mode === 'park') {
      this.populatePark();
      this.state = 'free';
      this.resetScore();
      this.say('SKI PARK', '', 'jumps left · rails right · pipe far right · L for the next line', '', 3200);
    } else {
      this.populateFree(false);
      this.state = 'free';
      this.resetScore();
      const ev = this.event?.ev;
      if (ev) this.say(ev.name.toUpperCase(), '', `score to beat · ${field(ev, this.event.tier, NAMES)[0].score.toLocaleString()}`, 'gold', 3400);
      else this.say('DROP IN', '', this.weatherLine(), '', 3200);
    }
    if (params.get('auto') === '1') {
      this.player.ai = new AIController(this.player, mode === 'race' ? 'racer' : 'park', this.rnd, this.world); this.player.ai.skill = 0.95;
      if (params.get('line')) { this.player.ai.line = params.get('line'); this.parkSpawn(this.player, params.get('line')); }
    }
    // where they picked to drop in (kept for a restart)
    const drop = opts.drop === undefined ? (opts.keepWeather ? this.curDrop : null) : opts.drop;
    this.curDrop = drop;
    if (drop && !drop.top) {
      if (drop.line) this.parkSpawn(this.player, drop.line);
      else this.player.place(centerX(drop.z) + drop.dx, drop.z, null, 4);
      this.terrain.warm?.(this.player.pos.x, this.player.pos.z, 400);
      if (mode !== 'race' && !this.event) this.say('DROP IN', '', drop.name, '', 2600);
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
    else { this.start(this.mode, { keepWeather: true }); return; }
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
    // (Cork7's: a pale line with the features as small blue beads, you as a ring)
    const feats = [...JUMPS, ...RAILS].map((J) => P(centerX(J.z) - cx0 + J.dx * 0.15, J.z)).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.5" fill="#a9e2f5"/>`).join('');
    svg.innerHTML = `<path d="${d}" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="5" stroke-linecap="round"/><path d="${d}" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="1.5" stroke-linecap="round"/>${feats}<circle id="mmdot" r="3.6" fill="rgba(16,20,28,.35)" stroke="#fff" stroke-width="1.6"/>`;
  }

  finishRace() {
    this.state = 'results';
    const rs = this.standings();
    const winner = rs[0];
    const me = rs.findIndex((r) => r.s === this.player) + 1;
    const mineR = this.racers.find((r) => r.s === this.player);
    const mine = mineR.finish;
    const ev = this.event?.ev, tier = this.event?.tier ?? 1;
    const rows = rs.map((r, i) => {
      const t = r.finish ?? null;
      const gap = i === 0 || t == null || winner.finish == null ? (t == null ? 'DNF' : fmt(t)) : '+' + (t - winner.finish).toFixed(2);
      return `<tr class="${r.s === this.player ? 'me' : ''}"><td>${i + 1}</td><td><span class="sw" style="background:${hex(r.color)}"></span>${r.s.name}${r.missed ? ` <small style="opacity:.6">(${r.missed} missed)</small>` : ''}</td><td class="t">${i === 0 ? fmt(t) : gap}</td></tr>`;
    }).join('');
    let title = me === 1 ? 'VICTORY' : me <= 3 ? 'PODIUM' : 'FINISHED', lead = `You finished ${me}${ord(me)} of ${rs.length}`, table = `<table class="res">${rows}</table>`;
    // a trial: the clock against the medal times
    let place = me;
    if (ev?.kind === 'trial' || this.online) {
      const T = TIERS[tier].trial;
      place = mine == null ? 4 : T.findIndex((t) => mine <= t) + 1 || 4;
      title = this.online ? 'SERVER RACE' : place <= 3 ? MEDAL[4 - place] : 'FINISHED';
      lead = mine == null ? 'Did not finish' : `${fmt(mine)}`;
      table = this.online ? '<table class="res" id="srvres"><tr><td colspan="3">Waiting for the others…</td></tr></table>'
        : `<table class="res">${T.map((t, i) => `<tr class="${place === i + 1 ? 'me' : ''}"><td>${MEDAL[3 - i]}</td><td>${TIERS[tier].name}</td><td class="t">${fmt(t)}</td></tr>`).join('')}</table>`;
    }
    if (mineR.missed) lead += `, with ${mineR.missed} missed gate${mineR.missed > 1 ? 's' : ''}`;
    // the race pays by finishing place; an event adds its prize and a medal
    this.sc = { score: Math.max(2000, 26000 - (place - 1) * 3000), paid: false };
    let pay = this.reward('race');
    if (ev && mine != null) pay += this.eventPrize(ev, tier, place);
    $('rescard').innerHTML = `<h2>${title}</h2>${ev ? `<div class="evline">${esc(ev.name)} · ${TIERS[tier].name}</div>` : ''}<p class="lead">${lead}.</p>
      ${table}${pay}
      <div class="row"><button class="btn p" id="r-again">${this.online ? 'Call another race' : 'Race again'}</button><button class="btn" id="r-replay">Watch replay</button><button class="btn" id="r-menu">Menu</button></div>`;
    $('results').classList.remove('hidden');
    $('r-again').onclick = () => { if (this.online) { this.showMenu(); this.callRace(); } else this.start('race'); };
    $('r-replay').onclick = () => { if (this.replay.open('all')) $('results').classList.add('hidden'); };
    $('r-menu').onclick = () => this.showMenu();
    const best = Number(store.get('best', '0'));
    if (mine && !ev && !this.online && (!best || mine < best)) store.set('best', mine);
    if (mine && !this.online) this.submit(this.raceBoard ?? `race-${PARK_ID}`, { time: Math.round(mine * 100) / 100, place: me }, this.replay.pack());
    if (this.online) this.serverResults(mine);
  }

  // a server race: post our time, show everyone's as they come in
  serverResults(mine) {
    const at = this.online, room = this.room;
    if (!room?.fire) return;
    const c = this.cloud, D = c.D;
    const ref = c.ref(`rooms/${room.key}/results`);
    if (mine != null) { D.set(c.ref(`rooms/${room.key}/results/${c.uid}`), { name: this.nick, time: mine, at }).catch(() => {}); room.event({ type: 'raceDone', time: mine }); }
    const off = D.onValue(ref, (snap) => {
      const el = $('srvres');
      if (!el) { off(); return; }
      const list = Object.entries(snap.val() ?? {}).map(([u, r]) => ({ ...r, me: u === c.uid })).filter((r) => r.at === at).sort((a, b) => a.time - b.time);
      el.innerHTML = list.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td class="t">${i ? '+' + (r.time - list[0].time).toFixed(2) : fmt(r.time)}</td></tr>`).join('') || '<tr><td colspan="3">No finishers yet</td></tr>';
    });
    setTimeout(() => off(), 120000);
  }

  // an event's prize and medal
  eventPrize(ev, tier, place) {
    const flakes = place <= 3 ? prize(tier, place) : 0;
    if (flakes) { this.meta.flakes += flakes; this.meta.save(); this.meta.changed(); }
    const m = this.meta.medal(ev.id, tier, place);
    const gifts = m.gifts.map((g) => g.name).join(', ');
    return flakes || gifts ? `<div class="payout">${place <= 3 ? `<span class="hi">${MEDAL[4 - place]} MEDAL</span>` : ''}${flakes ? `<span>${FLAKE}+${flakes} PRIZE</span>` : ''}${gifts ? `<span class="hi">UNLOCKED ${esc(gifts)}</span>` : ''}</div>` : '';
  }

  // ---------------- trick school ----------------
  // combos: quick arrow taps in the air. A match fires the trick (sized to the air left);
  // if a longer combo starts the same way it waits a beat for more taps first
  combos(inp, dt) {
    const P = this.player;
    const air = !P.onGround && !P.grind && P.crash <= 0;
    const st = (this.cst ??= { buf: '', last: 0, down: {}, shown: 0 });
    if (!air) { st.fired = null; if (st.buf) { st.buf = ''; this.comboHud(); } return; }
    const now = this.time;
    for (const [k, code] of [['U', 'ArrowUp'], ['D', 'ArrowDown'], ['L', 'ArrowLeft'], ['R', 'ArrowRight']]) {
      const d = inp.down(code);
      if (d && !st.down[k]) st.down[k] = now;
      else if (!d && st.down[k]) {
        // a tap, not a hold
        if (now - st.down[k] < 0.22) { st.buf += k; st.last = now; this.comboStep(); }
        st.down[k] = 0;
      }
    }
    if (st.buf && now - st.last > 0.3) this.comboFire(true);
  }

  comboStep() {
    const st = this.cst;
    const exact = COMBOS.find((c) => c.seq === st.buf);
    const longer = COMBOS.some((c) => c.seq.length > st.buf.length && c.seq.startsWith(st.buf));
    // a combo starts on the tap that makes it (no waiting to see if more are coming: that cost
    // the air to finish it); another tap that makes a longer one upgrades it in the air
    if (exact) this.comboFire(false, longer);
    else if (!longer) { const had = !!st.fired; if (!had) this.status('NO SUCH COMBO'); st.buf = ''; st.fired = null; this.comboHud(!had); }
    else this.comboHud();
  }

  comboFire(timeout, keep = false) {
    const st = this.cst, P = this.player;
    // (the pause after the taps: whatever they made has started already)
    if (timeout && st.fired && st.fired === st.buf) { st.buf = ''; st.fired = null; this.comboHud(false, st.firedName); return; }
    const c = COMBOS.find((x) => x.seq === st.buf);
    if (!keep) st.buf = '';
    if (!c) { this.comboHud(); return; }
    const spec = quickSpec(c.id), l = LESSON[c.id];
    const name = (this.gear === 'board' ? l?.board : l?.name)?.toUpperCase() ?? '';
    if (!spec) { this.comboHud(); return; }
    const up = !!(st.fired && P.auto?.combo === st.fired && c.seq.startsWith(st.fired));
    if ((P.auto || P.trickType) && !up) this.status('ONE AT A TIME');
    else if (P.flightTime() < (P.strict ? 0.12 : 0.45)) this.status('TOO LATE · ' + name);
    else {
      // an upgrade carries on from where the first one started turning
      P.auto = { ...spec, id: c.id, dir: c.dir ?? spec.dir, combo: c.seq, f0: up ? P.auto.plan?.f0 : undefined };
      st.fired = keep ? c.seq : null; st.firedName = name;
      if (c.secret) this.status('SECRET COMBO · ' + name);
      this.audio.beep(1180, 0.05, 0.08);
    }
    this.comboHud(false, name);
  }

  // the taps so far under the rider, and what they made
  comboHud(bad = false, made = '') {
    const el = $('combo');
    if (!el) return;
    const buf = this.cst?.buf ?? '';
    el.innerHTML = buf ? [...buf].map((k) => `<kbd>${ARROW[k]}</kbd>`).join('') : made ? `<b>${esc(made)}</b>` : bad ? '<b class="x">✕</b>' : '';
    el.classList.toggle('on', !!(buf || made || bad));
    clearTimeout(this.comboT);
    if (!buf) this.comboT = setTimeout(() => el.classList.remove('on'), 900);
  }

  // Try it: to the right line of the park with the lesson on screen
  tryLesson(id) {
    const l = LESSON[id];
    if (!l) return;
    this.coach = l;
    this.event = null;
    if (PARK_ID === 'yard' && l.where !== 'any') {
      this.start('park');
      this.parkSpawn(this.player, l.where === 'rails' ? 'rails' : 'jumps');
      this.rig.snap = true;
    } else this.start('run');
    this.showCoach();
  }

  showCoach() {
    const el = $('coach'), l = this.coach;
    if (!el) return;
    el.classList.toggle('hidden', !l);
    if (!l) return;
    const B = this.gear === 'board';
    const c = comboFor(l.id);
    const steps = comboSteps(l, 'a kicker', c?.secret && ![...this.book].some((n) => l.re.test(n))) ?? l.steps;
    el.innerHTML = `<div class="ct">TRICK SCHOOL · ${esc(B ? l.board : l.name)}<button id="coach-x">×</button></div><ol>${steps.map((s2) => `<li>${s2}</li>`).join('')}</ol>`;
    $('coach-x').onclick = () => { this.coach = null; this.showCoach(); };
  }

  // a new trick in the book: lessons it passes pay out once
  checkLessons(names) {
    for (const l of LESSONS) {
      if (this.meta.lessons.has(l.id) || !names.some((n) => l.re.test(n))) continue;
      this.meta.lessons.add(l.id);
      this.meta.flakes += l.reward;
      this.meta.save(); this.meta.changed();
      const B = this.gear === 'board';
      this.toast(`LESSON PASSED · ${esc(B ? l.board : l.name)} · ${FLAKE} +${l.reward}`, 3500);
      if (this.coach?.id === l.id) { this.coach = null; this.showCoach(); }
    }
  }

  // the menu starts an event: its park loads if it isn't this one
  startEvent(id, tier) {
    const ev = EVENT[id];
    if (!ev) return;
    store.set('evTier', tier);
    if (ev.park !== PARK_ID) {
      store.set('park', ev.park);
      location.search = new URLSearchParams({ park: ev.park, menu: '0', event: id, tier, tod: this.tod }).toString();
      return;
    }
    this.event = { ev, tier };
    this.leaveRoom();
    this.start(ev.kind === 'race' || ev.kind === 'trial' ? 'race' : 'run');
  }

  finishRun() {
    this.state = 'results';
    const sc = this.sc;
    const prev = Number(store.get('best.run.' + PARK_ID, '0'));
    const isBest = sc.score > prev;
    if (isBest) store.set('best.run.' + PARK_ID, sc.score);
    let pay = this.reward('run');
    // a contest: where the run puts you among the field
    const ev = this.event?.ev, tier = this.event?.tier ?? 1;
    let board = '', title = 'RUN COMPLETE';
    if (ev) {
      const rows = [...field(ev, tier, NAMES), { name: this.nick, score: sc.score, me: true }].sort((a, b) => b.score - a.score);
      const place = rows.findIndex((r) => r.me) + 1;
      title = place === 1 ? 'CHAMPION' : place <= 3 ? MEDAL[4 - place] + ' MEDAL' : `${place}${ord(place)} PLACE`;
      pay += this.eventPrize(ev, tier, place);
      board = `<div class="evline">${esc(ev.name)} · ${TIERS[tier].name}</div><table class="res">${rows.slice(0, 6).map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}${r.cpu ? ' <small style="opacity:.55">CPU</small>' : ''}</td><td class="t">${r.score.toLocaleString()}</td></tr>`).join('')}${place > 6 ? `<tr class="me"><td>${place}</td><td>${esc(this.nick)}</td><td class="t">${sc.score.toLocaleString()}</td></tr>` : ''}</table>`;
    }
    $('rescard').innerHTML = `<h2>${title}</h2>${board}
      <div class="bigscore">${sc.score.toLocaleString()}</div><p class="lead" style="margin-top:0">${isBest ? 'New best run.' : prev ? `Best ${prev.toLocaleString()}` : ''}</p>${pay}
      <div class="stats">
        <div class="stat"><b>${clock(sc.t)}</b><span>Time</span></div>
        <div class="stat"><b>${Math.round(sc.top * 3.6)} km/h</b><span>Top speed</span></div>
        <div class="stat"><b>${sc.clean}</b><span>Clean landings</span></div>
        <div class="stat"><b>${sc.crashes}</b><span>Bails</span></div>
        <div class="stat"><b>${sc.fresh ?? 0}</b><span>New tricks</span></div>
      </div>
      <p class="lead" style="margin-top:16px">Best trick <b style="color:var(--gold)">${sc.best.name}</b>${sc.best.pts ? ' · ' + sc.best.pts.toLocaleString() : ''}</p>
      <div class="row"><button class="btn p" id="r-lift">Ride again</button><button class="btn" id="r-replay">Watch replay</button><button class="btn" id="r-menu">Menu</button></div>`;
    $('results').classList.remove('hidden');
    $('r-lift').onclick = () => this.start('run');
    $('r-replay').onclick = () => { if (this.replay.open('all')) $('results').classList.add('hidden'); };
    $('r-menu').onclick = () => this.showMenu();
  }

  // a run is over: XP and flakes, a line on the leaderboard, the run into the replay vault
  reward(kind) {
    const sc = this.sc;
    if (!sc || sc.paid || (kind !== 'run' && sc.score <= 0)) return '';
    sc.paid = true;
    const r = this.meta.payout(sc.score);
    if (kind === 'run') {
      const rid = `${PARK_ID}-${Date.now().toString(36)}`;
      const pk = this.replay.pack();
      const best = sc.best.name !== '—' ? sc.best.name : '';
      if (pk.times.length > 30) saveRun({ id: rid, park: PARK_ID, gear: this.gear, outfit: this.outfit(), score: sc.score, time: sc.t, date: Date.now(), best, keep: false, ...pk });
      this.meta.addRun(PARK_ID, { score: sc.score, time: sc.t, date: Date.now(), gear: this.gear, rid });
      if (sc.score > 0) this.submit(`run-${PARK_ID}`, { score: sc.score, secs: Math.round(sc.t), best }, pk);
    } else if (kind === 'park' && sc.score > 0) this.submit('park-yard', { score: sc.score, secs: Math.round(sc.t), best: sc.best?.name !== '—' ? sc.best?.name : '' }, null);
    this.cloudSave();
    const gifts = r.gifts.map((g) => g.name).join(', ');
    return `<div class="payout"><span>+${r.xp.toLocaleString()} XP</span><span>${FLAKE}+${r.flakes.toLocaleString()}</span>${r.levels ? `<span class="hi">PASS TIER ${r.level}</span>` : ''}${gifts ? `<span class="hi">UNLOCKED ${esc(gifts)}</span>` : ''}</div>`;
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
    const W = this.world.wind;
    if (W) W.s = Math.max(0, W.base * (0.55 + 0.35 * Math.sin(this.time * 0.6) + 0.25 * Math.sin(this.time * 1.7 + 1.3)));
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
    // a ring of crystals, a cloud that hangs, clumps knocked loose (more of all of it in deep snow)
    this.particles.impact(s.pos.x, s.pos.y + 0.05, s.pos.z, v.x, v.z, n / 80, s.surf?.powder ?? 0, spread);
  }

  spray(dt) {
    const cam = this.camera.position;
    const rnd = (n) => { n = Math.max(0, n); return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); };
    for (const s of this.skiers) {
      if (!s.onGround || s.crash > 0) continue;
      const sp = s.speed;
      if (sp < 3) continue;
      const d = cam.distanceTo(s.pos);
      if (d > 130) continue;
      const near = d < 18 ? 1.6 : d < 45 ? 1 : 0.45;
      const pw = s.surf.powder, ice = s.surf.ice;
      const h = s.heading, fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
      // the outside of the turn (where the snow goes): the way the skis are tipped away from
      const out = Math.sign(s.lean || -(s.latAcc || 1)) || 1;
      const vx = s.vel.x, vz = s.vel.z;
      const y = s.pos.y + 0.03;
      // a hard carve: the tails of both skis peel a thin fan of crystals off the edge, most from
      // the outside ski (it carries the weight), flying out and back low over the snow
      const edge = smoothstep(0.22, 0.75, Math.abs(s.lean)) * smoothstep(7, 18, sp) * (1 - ice * 0.7);
      if (edge > 0.01 && !s.board) {
        for (const [o, w] of [[out, 1], [-out, 0.45]]) {
          const n = rnd(edge * w * (55 + sp * 6) * dt * near * (1 + pw * 1.5));
          if (!n) continue;
          const ox = s.pos.x - fx * 0.72 + lx * o * 0.095 + lx * out * 0.06, oz = s.pos.z - fz * 0.72 + lz * o * 0.095 + lz * out * 0.06;
          const k = 1.2 + edge * 2.6 + pw * 1.5;
          this.particles.emit(ox, y, oz, vx * 0.55 + lx * out * k, 0.7 + edge * 1.1 + pw * 1.2, vz * 0.55 + lz * out * k,
            0.6 + pw * 1.2, 0.36 + pw * 0.3, 0.75 + pw * 0.5, n, 0.1, 2.2 - pw, 1 + pw, 0.3 + pw * 0.3);
        }
      } else if (edge > 0.01) {
        // a board's carve: one long rooster tail off the tail edge
        const n = rnd(edge * (70 + sp * 7) * dt * near * (1 + pw * 1.5));
        const k = 1.4 + edge * 2.8 + pw * 1.5;
        if (n) this.particles.emit(s.pos.x - fx * 0.6 + lx * out * 0.1, y, s.pos.z - fz * 0.6 + lz * out * 0.1, vx * 0.55 + lx * out * k, 0.9 + edge * 1.2 + pw * 1.2, vz * 0.55 + lz * out * k,
          0.6 + pw * 1.2, 0.28 + pw * 0.3, 0.75 + pw * 0.5, n, 0.1, 2.2 - pw, 1 + pw, 0.3 + pw * 0.3);
      }
      // Cork7's ride: soft round puffs kicked up off the ski tails the whole way down, more and
      // bigger with speed and through a turn, hanging a moment behind the rider
      if (s.isPlayer && s.strict && pw < 0.15) {
        const n = rnd((3 + sp * 0.18 + edge * 12) * dt * near * (1 - ice * 0.5));
        for (let i = 0; i < n; i++) {
          const o = Math.random() < 0.5 ? 1 : -1;
          const ox = s.pos.x - fx * 0.8 + lx * o * 0.1, oz = s.pos.z - fz * 0.8 + lz * o * 0.1;
          this.particles.emit(ox, y + 0.06, oz, vx * 0.5 + lx * out * edge * 1.6, 0.3 + edge * 0.5, vz * 0.5 + lz * out * edge * 1.6,
            0.4, 0.7 + sp * 0.008 + edge * 0.35, 0.55 + edge * 0.25, 1, 0.2, 0.5, 1.2, 0.7);
        }
      }
      // skids and stops: the whole length of the edges scrapes, a curtain of snow thrown out
      const skid = Math.min(4, s.skid) + (s.controls.brake ? 1.2 : 0);
      if (skid > 0.25) {
        const n = rnd((skid * 85 + pw * sp * 3) * Math.min(1, sp / 8) * dt * near * (1 - ice * 0.6));
        for (let i = 0; i < n; i++) {
          const along = Math.random() * 1.4 - 0.65;
          const ox = s.pos.x + fx * along + lx * out * 0.16, oz = s.pos.z + fz * along + lz * out * 0.16;
          const k = 1.6 + skid * 1.1 + pw;
          this.particles.emit(ox, y, oz, vx * 0.35 + lx * out * k, 1.1 + skid * 0.45 + pw * 0.8, vz * 0.35 + lz * out * k,
            1.0 + pw * 1.5 + skid * 0.25, 0.3 + Math.min(skid, 3) * 0.07 + pw * 0.35, 0.8 + pw * 0.6, 1, 0.12, 1, 1.3 + pw, 0.6 + pw * 0.2);
        }
        // a hard stop in soft snow scrapes up clumps that tumble out ahead of the skis
        const nc = rnd(skid * Math.min(1, sp / 10) * (1 - ice) * (0.25 + pw * 1.6) * 7 * dt * near);
        if (nc) {
          const k = 1.4 + skid * 0.8;
          this.particles.emitChunks(s.pos.x + lx * out * 0.25, y + 0.05, s.pos.z + lz * out * 0.25, vx * 0.45 + lx * out * k, 1.2 + skid * 0.4, vz * 0.45 + lz * out * k, 1.6, 0.05 + pw * 0.06, nc);
        }
      }
      // deep snow: the boots plough through it, throwing a plume up past the knees that billows
      // and hangs in the air behind; a turn sends a wave of it to the outside; clumps break off
      // the trench walls and roll
      if (pw > 0.15) {
        const n = rnd(pw * sp * 6 * dt * near);
        if (n) this.particles.emit(s.pos.x + fx * 0.2, y + 0.2, s.pos.z + fz * 0.2, vx * 0.35, 1.2 + pw, vz * 0.35, 1.8, 0.26 + pw * 0.16, 1.3, n, 0.6, 1.5, 1.6 + pw, 0.42);
        const turn = smoothstep(0.15, 0.7, Math.abs(s.lean));
        const nw = rnd(pw * turn * sp * 3 * dt * near);
        if (nw) this.particles.emit(s.pos.x + lx * out * 0.35, y + 0.1, s.pos.z + lz * out * 0.35, vx * 0.4 + lx * out * (2 + pw * 2), 2 + pw * 1.6, vz * 0.4 + lz * out * (2 + pw * 2),
          1.4, 0.4 + pw * 0.25, 1.1, nw, 0.4, 1.5, 1.4 + pw, 0.6);
        const nc = rnd(pw * sp * 0.5 * dt * near);
        if (nc) this.particles.emitChunks(s.pos.x + lx * out * 0.35, y + 0.1, s.pos.z + lz * out * 0.35, vx * 0.35 + lx * out * 1.5, 1.4 + pw, vz * 0.35 + lz * out * 1.5, 1.8, 0.06 + pw * 0.06, nc);
      }
    }
  }

  // ---------------- frame ----------------
  frame() {
    // Settings > Frame rate: 30 (an even frame rate, a cooler laptop)
    if (this.cap30) {
      const now = performance.now();
      if (now - (this.lastF ?? 0) < 1000 / 30 - 3) return;
      this.lastF = now;
    }
    if (this.unveil && --this.unveil === 0) {
      window.__loadProgress?.(1);
      setTimeout(() => { $('loading').classList.add('out'); setTimeout(() => $('loading').classList.add('hidden'), 460); }, 120);
    }
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
    const typing = document.activeElement?.tagName === 'INPUT';
    if (this.drop.on) { this.drop.keys(inp); inp.endFrame?.(); }
    else if (this.state === 'menu' && (inp.hit('Escape') || inp.padHit?.[9])) {
      // Esc on the front page: close whatever's open, or open the menu
      const open = ['account', 'howto', 'credits', 'settings', 'parks'].find((id) => !$(id).classList.contains('hidden'));
      if (open === 'parks') this.closeParks(); else if (open) $(open).classList.add('hidden'); else $('settings').classList.remove('hidden');
    } else if (inp.hit('Escape') || inp.hit('KeyP') || inp.padHit?.[9]) this.setPaused(!this.paused);
    if (inp.hit('KeyM')) { this.setMuted(!this.audio.muted); this.menu?.sound(); }
    if (inp.hit('KeyC') || inp.padHit?.[12]) this.cycleCam();
    if (!this.drop.on && (inp.hit('Enter') || inp.padHit?.[0])) {
      if (this.state === 'menu' && !typing && ['settings', 'howto', 'account', 'credits'].every((id) => $(id).classList.contains('hidden'))) this.go();
      else if (this.state === 'results' && !$('results').classList.contains('hidden')) this.start(this.mode);
    }

    if (!this.paused && this.rescue.active) { this.rescue.keys(inp); this.rescue.update(dt); }
    // the soundtrack: once there's sound at all, in the mood of what's happening
    if (this.audio.ctx && !this.music.timer) this.music.start();
    this.music.setMood(this.rescue.active ? (this.rescue.phase === 'lift' || this.rescue.phase === 'hospital' ? 'chill' : 'calm') : this.state === 'menu' || this.state === 'loading' ? 'chill' : 'ride');
    if (!this.paused) this.injuries.update(dt);
    // your trail (a Shop item) in the air behind you
    if (!this.paused) { const P = this.player; this.trail.update(dt, P && this.state !== 'menu' && !this.rescue.active ? P : null, P?.model?.outfit?.trail); }
    // breath in the cold air, every couple of seconds
    const BP = this.player;
    if (BP && !this.paused && BP.crash <= 0 && !BP.held && this.state !== 'menu' && BP.model.rig && BP.model.real && ((this.breathT = (this.breathT ?? 1) - dt) <= 0)) {
      this.breathT = 1.5 + Math.random() * 0.9;
      const r = BP.model.rig;
      r.root.updateMatrixWorld(true);
      const m = r.root.localToWorld(r.skull.clone());
      const fx = Math.sin(BP.heading), fz = Math.cos(BP.heading);
      this.particles.emit(m.x + fx * 0.14, m.y - 0.1, m.z + fz * 0.14, BP.vel.x * 0.85 + fx * 0.5, 0.25, BP.vel.z * 0.85 + fz * 0.5, 0.2, 0.1, 0.8, 5);
    }
    if (!this.paused) {
      if (this.player && !this.player.ai && !this.rescue.active) {
        // (on a rail a quick tap of A/D is a whole swap: the steer is on at once, as in the air)
        const c = inp.read(dt, !this.player.onGround && !this.player.grind, !!this.player.grind);
        // in the air the arrows spin and flip by hand only once held: a quick tap is a combo
        if (!this.player.onGround && !this.player.grind && this.world.arcade) {
          this.holdS = Math.abs(c.steer) > 0.15 ? (this.holdS ?? 0) + dt : 0;
          this.holdF = c.flip || c.roll ? (this.holdF ?? 0) + dt : 0;
          if (this.holdS < 0.17) c.steer = 0;
          if (this.holdF < 0.17) { c.flip = 0; c.roll = 0; }
        } else this.holdS = this.holdF = 0;
        Object.assign(this.player.controls, c);
        if (this.state === 'countdown' || this.state === 'results') { this.player.controls.steer = 0; this.player.controls.tuck = 0; this.player.controls.brake = this.state === 'results' ? 1 : 0; this.player.controls.jump = false; }
        if (this.mode === 'race') {
          if ((inp.hit('KeyR') || inp.padHit?.[8]) && this.state !== 'countdown') { this.player.respawn(); this.rig.snap = true; }
        } else {
          // hold R (or View) to restart
          const held = inp.down('KeyR') || !!inp.pad()?.buttons[8]?.pressed;
          this.holdR = held ? (this.holdR ?? 0) + dt : 0;
          const need = 2;
          if (this.holdR >= need) { this.holdR = -99; this.restart(); }
        }
        // L: the next park line; arrow taps in the air: combos
        const P = this.player;
        if (this.mode === 'park' && inp.hit('KeyL') && P.onGround) {
          const order = ['jumps', 'rails', 'pipe', 'rollers'];
          const line = order[(order.indexOf(P.parkLine) + 1) % order.length] ?? 'jumps';
          const names = { jumps: 'JUMP LINE', rails: 'RAIL GARDEN', pipe: 'HALFPIPE', rollers: 'ROLLERS' };
          this.parkSpawn(P, line); this.rig.snap = true; this.say(names[line], '', 'L for the next line', '', 1200);
        }
        if (this.mode !== 'race' && this.state !== 'countdown') this.combos(inp, dt);
        // keypad . (or G): hop round to ride the other way, backwards or forwards again
        if ((inp.hit('NumpadDecimal') || inp.hit('KeyG') || inp.hit('NumpadEnter')) && P.onGround && !P.grind && P.crash <= 0 && this.state !== 'countdown') {
          P.turnReq = -Math.sign(P.controls.steer) || (this.turnDir = -(this.turnDir || -1));
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
      this.tracks.flush(); this.myTracks.flush();
    }

    // the replay records what you ride
    if (this.player && !this.paused && this.state !== 'menu' && this.state !== 'countdown' && !this.rescue.active) this.replay.record(dt, this.player);
    // the front page is art over a still world: only the rider sticker draws
    if (this.state === 'menu' && !$('menu').classList.contains('hidden') && $('parks').classList.contains('hidden')) {
      this.room?.update(dt, null, this.camera.position);
      this.menu.render(dt);
    } else this.renderWorld(dt, false);
    inp.endFrame();
  }

  renderWorld(dt, replaying) {
    const cam = this.camera;
    if (replaying) { /* the replay placed the camera */ }
    else if (this.state === 'menu') { this.menuT = (this.menuT ?? 0) + dt; this.rig.menu(dt, this.menuT, this.skiers); }
    else if (this.rescue.active) this.rescue.camera(cam, dt);
    else if (this.player) this.rig.update(dt, this.player);
    if (window.__freeCam) { const f = window.__freeCam; cam.position.set(...f.pos); cam.lookAt(...f.look); cam.fov = f.fov ?? 55; cam.updateProjectionMatrix(); }
    if (!replaying) for (const s of this.skiers) if (!s.held) s.updateVisual(dt, cam.position);
    this.farRiders.update(replaying ? [] : this.skiers);
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
      // snow in the air: the sun only where it still reaches (an alpenglow evening leaves the runs in shade)
      const SL = this.sprayLight;
      if (SL) SL.sun.copy(SL.sun0).multiplyScalar(SL.sunset ? smoothstep(SL.sunset[0], SL.sunset[1], cam.position.y) : 1);
      this.particles.update(dt, SL, this.env.sunDir, this.camera, this.world.wind);
      this.particles.weather(dt, cam.position, this.world.wind);
      this.dust.update(dt, this.camera.position, this.env.sunDir, this.env.sun.color);
      this.debris.update(dt);
      this.snowfall.update(dt, cam.position, this.world.wind, SL?.flake, this.renderer.getDrawingBufferSize(this._fallRes ??= new THREE.Vector2()));
    }
    const focus = this.player && this.state !== 'menu' ? this.player.pos : cam.position;
    this.terrain.update(cam.position.x, cam.position.z, 4);
    // (trees between the camera and the rider turn see-through; not from inside the helmet)
    const seen = replaying ? this.replay.ghost?.pos : this.player && this.state !== 'menu' && this.rig.mode !== 'helmet' && !this.rescue.active ? this.player.pos : null;
    AG.uSee.value.copy(seen ?? cam.position);
    this.forest.update(cam, this.time, this.env.sunDir);
    this.props.updateLift(this.time, cam.position);
    this.props.updatePeople(cam.position);
    this.props.updateNets(dt, cam.position);
    this.smash.update(dt);
    this.lights.update(cam, focus);
    this.cheerT = Math.max(0, (this.cheerT ?? 0) - dt);
    const nearFinish = smoothstep(260, 40, Math.abs(cam.position.z - FINISH_Z));
    this.props.cheer(this.time, this.cheerT > 0 ? 1 : 0);
    this.env.follow(focus, dt);
    this.audio.update(this.state === 'menu' ? null : this.player, nearFinish * (0.25 + (this.cheerT > 0 ? 0.75 : 0)));
    if (this.state !== 'menu' && this.player && !replaying) this.hud(dt);
    const sp = replaying ? this.replay.ghost.speed : this.player && this.state !== 'menu' ? this.player.speed : 0;
    // (only a whisper of speed blur: Cork7 keeps the picture calm and sharp at any speed)
    this.post.lens.uniforms.uSpeed.value = smoothstep(20, 45, sp) * 0.2 * (this.rig.mode === 'tv' ? 0 : 1);
    this.post.lens.uniforms.uFlash.value *= 0.9;
    cam.updateMatrixWorld();
    AG.uCamWorld.value.copy(cam.matrixWorld);
    this.post.sun(cam, this.env.sunDir, PRESETS[this.tod].shafts ?? 0);
    this.post.render(dt);
  }

  trackFps(dt) {
    this.fpsAcc += dt; this.fpsN++;
    this.fpsWorst = Math.max(this.fpsWorst ?? 0, dt);
    if (this.fpsAcc < 1) return;
    this.fps = this.fpsN / this.fpsAcc;
    window.__fps = this.fps;
    // Settings > Stats: the frame rate (and the slowest frame of the last second) up top
    if (this.showStats) $('stats').textContent = `${Math.round(this.fps)} FPS · ${(this.fpsWorst * 1000).toFixed(0)} MS MAX`;
    this.fpsWorst = 0;
    this.fpsAcc = 0; this.fpsN = 0;
    // adaptive resolution, slow and steady: every change of size is a hitch of its own, so it
    // drops only after two slow seconds, comes back up only after five smooth ones, and if a
    // drop didn't buy any frames (the processor's the limit, not the pixels) it goes back up
    // and leaves it alone for a while
    if (params.get('fixdpr') === '1' || this.state === 'menu') return;
    // ignore throttled/background tabs (a few fps): that's the browser, not the GPU
    if (this.fps < 15) return;
    const A = (this.dprA ??= { slow: 0, fast: 0, hold: 0, before: 0, judge: 0 });
    A.hold = Math.max(0, A.hold - 1);
    if (A.judge > 0 && --A.judge === 0 && this.fps < A.before + 3) {
      this.setDprScale(Math.min(1, this.dprScale + 0.1));
      A.hold = 30;
      return;
    }
    A.slow = this.fps < 50 ? A.slow + 1 : 0;
    A.fast = this.fps > 58 ? A.fast + 1 : 0;
    if (A.slow >= 2 && A.hold === 0 && this.dprScale > 0.6) {
      A.before = this.fps; A.judge = 2; A.slow = 0;
      this.setDprScale(Math.max(0.6, this.dprScale - 0.1));
    } else if (A.fast >= 5 && this.dprScale < 1) {
      A.fast = 0;
      this.setDprScale(Math.min(1, this.dprScale + 0.05));
    }
  }

  setDprScale(k) {
    if (k === this.dprScale) return;
    this.dprScale = k;
    const r = this.maxDpr * k;
    this.renderer.setPixelRatio(r);
    this.post.setPixelRatio(r);
    this.resize();
  }

  hud(dt) {
    const p = this.player;
    const name = this.mode === 'race' ? sectionName(p.pos.z) : zoneAt(p.pos.x, p.pos.z);
    if (name !== this.secName) {
      // a new part of the run: its name and difficulty, as on the trail signs and the snow
      this.secName = name;
      const z = $('zone');
      z.textContent = name;
      z.classList.remove('in'); void z.offsetWidth; z.classList.add('in');
    }
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
    // (in the air, Cork7's: the speed and how far you've flown)
    const dist = flying ? Math.hypot(p.pos.x - (p.takeoffX ?? p.pos.x), p.pos.z - (p.takeoffZ ?? p.pos.z)) : 0;
    $('air2').textContent = flying ? `${kmh} KM/H · ${Math.round(dist)} M` : this.statusT > 0 ? this.statusTxt : '';
    // loading the pop: a bar under the rider fills, let go to jump
    const ch = (p.onGround || p.grind) && p.crash <= 0 ? p.jumpCharge ?? 0 : 0;
    const cb = $('charge');
    if ((ch > 0.06) !== !cb.classList.contains('hidden')) cb.classList.toggle('hidden', !(ch > 0.06));
    if (ch > 0.06) cb.firstChild.style.width = Math.round(Math.min(1, ch) * 100) + '%';
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
      $('gates').textContent = `Gate ${Math.min(r.gate - (this.gate0 ?? 0) + 1, GATES.length - (this.gate0 ?? 0))} / ${GATES.length - (this.gate0 ?? 0)}`;
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
      $('linex').textContent = live && sc.n > 1 ? `LINE ×${this.lineMult().toFixed(2).replace(/0$/, '')}` : this.mode === 'park' && sc.laps ? `LAP ${sc.laps + 1}` : '';
      // on a rail: the slide and its points tick up live
      if (p.grind && p.grind.t > 0.12) {
        const g = p.grind;
        const pts = this.railPts(g) + (g.hopTurns ?? []).reduce((a, h) => a + Math.round((h / 90) * 450 * this.peekRepeat(`HOP ${h}`)), 0);
        const el = $('callout');
        if (!this.liveCall) { el.innerHTML = `<div class="c"><div class="n"></div><div class="p"></div></div>`; this.liveCall = true; clearTimeout(this.sayT); }
        el.querySelector('.n').textContent = g.kind;
        el.querySelector('.p').textContent = '+' + pts.toLocaleString();
      } else if (!p.onGround && !p.grind && p.crash <= 0 && p.airTime > 0.2 && p.isPlayer) {
        // in the air: the trick so far, its points and what's multiplying them, live (Cork7)
        const t = p.airTrick();
        const name = this.trickName(t);
        if (name) {
          const rep = this.peekRepeat(this.airKey(t), t.pipe);
          const { pts, chips } = this.trickPoints(t, rep);
          if (rep < 1) chips.push(`REPEAT ×${rep}`);
          const el = $('callout');
          if (!this.liveCall || !el.querySelector('.live')) { el.innerHTML = `<div class="c live"><div class="n"></div><div class="p"><b></b><span class="f"></span></div></div>`; this.liveCall = true; this.liveName = ''; clearTimeout(this.sayT); }
          if (name !== this.liveName) {
            // each new rotation stamps the name in again
            const n = el.querySelector('.n'), n2 = n.cloneNode(); n2.textContent = name; n.replaceWith(n2);
            this.liveName = name;
          }
          this.livePts = Math.round(pts); this.liveAt = this.time;
          el.querySelector('.p b').textContent = '+' + this.livePts.toLocaleString();
          const f = chips.map((c) => `<i>${c}</i>`).join('');
          const fe = el.querySelector('.p .f');
          if (fe.innerHTML !== f) fe.innerHTML = f;
        }
      } else if (this.liveCall && p.onGround) { this.liveCall = false; $('callout').firstChild?.classList.add('out'); }
    }
    // hints: load the pop, restart, the speed each park table wants
    let hint = '';
    if (p.grind && p.grind.t < 1.2) hint = 'A / D to swap · space to pop';
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
          const want = Math.round((p.strict ? J.pspeed : J.speed) * 3.6), now = kmh;
          tip = `${J.name} · ${want - 2}–${want + 3} km/h${now < want - 6 ? ' · tuck' : now > want + 8 ? ' · scrub speed' : ''}`;
          break;
        }
      }
    }
    // (the conditions under the section name go after a few seconds)
    $('wxtag').classList.toggle('gone', this.time - (this.startAt ?? 0) > 6);
    // the music player: what's playing and how far through
    const mu = this.music;
    if (mu.track !== this.npTrack) { this.npTrack = mu.track; $('np-t').textContent = mu.track.name; $('np-a').textContent = mu.track.by; }
    $('np-p').style.width = (mu.progress * 100).toFixed(1) + '%';
    const tp = $('tip');
    if (tip !== this.tipTxt) { this.tipTxt = tip; tp.textContent = tip; tp.classList.toggle('hidden', !tip); }
    // hold-to-restart ring
    const need = 2;
    const hk = this.holdR > 0.15 ? Math.min(1, this.holdR / need) : 0;
    $('hold').classList.toggle('hidden', !hk);
    if (hk) { $('holdring').setAttribute('stroke-dashoffset', (94.25 * (1 - hk)).toFixed(1)); $('holdlbl').textContent = this.mode === 'park' ? 'Top of the line' : 'Restart run'; }
  }
}

const game = new Game();
game.boot().catch((e) => { console.error(e); $('loadmsg').textContent = 'Error: ' + e.message; });
