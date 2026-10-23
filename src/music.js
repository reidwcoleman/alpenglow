// The soundtrack, made as it plays: slow lo-fi. Soft swung drums, a round bass, warm pads and
// a mellow electric piano on jazzy seventh chords, a little vinyl crackle, scheduled a moment
// ahead on the audio clock. Three moods: 'chill' (the menu, the chairlift: keys and pads, a
// brush of a beat), 'ride' (the full laid-back groove) and 'calm' (after a bad crash: pads only).
const PROGS = [
  // [root semitones from A, minor?] four bars each
  [[0, 1], [-4, 0], [3, 0], [-2, 0]], // Am F C G
  [[-7, 1], [-2, 0], [3, 0], [0, 1]], // Dm G C Am
  [[0, 1], [5, 1], [-2, 0], [3, 0]], // Am Dm G C
  [[-4, 0], [3, 0], [-2, 0], [0, 1]], // F C G Am
];
// each progression is a 'track' on the in-run player, with its own tempo
export const TRACKS = [
  { name: 'First Chair', by: 'Stomped FM', bpm: 78 },
  { name: 'Corduroy', by: 'Stomped FM', bpm: 72 },
  { name: 'Low Sun', by: 'Stomped FM', bpm: 84 },
  { name: 'Last Lift', by: 'Stomped FM', bpm: 70 },
];
const A2 = 110;
const hz = (semi) => A2 * Math.pow(2, semi / 12);

export class Music {
  constructor(audio) {
    this.a = audio;
    audio.music = this;
    this.vol = 1;
    this.on = true;
    this.mood = 'chill';
    this.bpm = 78;
    this.step = 0; this.bar = 0; this.prog = 0;
    this.timer = null;
  }

  // once the audio is running
  start() {
    const ctx = this.a.ctx;
    if (!ctx || this.timer) return;
    this.bus = ctx.createGain();
    this.bus.gain.value = this.on ? 0.56 * this.vol : 0;
    // a touch of space on everything
    const delay = ctx.createDelay(1); delay.delayTime.value = (60 / this.bpm) * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const wet = ctx.createGain(); wet.gain.value = 0.22;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    this.send = ctx.createGain(); this.send.gain.value = 1;
    this.send.connect(delay); delay.connect(lp).connect(fb).connect(delay); lp.connect(wet).connect(this.bus);
    this.bus.connect(this.a.out);
    this.next = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.tick(), 25);
  }

  setOn(on) {
    this.on = on;
    if (this.bus) this.bus.gain.setTargetAtTime(on ? 0.56 * this.vol : 0, this.a.ctx.currentTime, 0.3);
  }

  setVol(v) { this.vol = v; this.setOn(this.on); }

  setMood(m) { this.mood = m; }

  // the player: what's on, how far through, and skipping
  get track() { return TRACKS[this.prog]; }
  get progress() { return ((this.bar % 16) + this.step / 16) / 16; }
  skip(d = 1) {
    this.prog = (this.prog + d + PROGS.length) % PROGS.length;
    this.bar = 0; this.step = 0;
    this.bpm = TRACKS[this.prog].bpm;
  }

  tick() {
    const ctx = this.a.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const spb = 60 / this.bpm / 4; // a sixteenth
    while (this.next < ctx.currentTime + 0.12) {
      // (the off sixteenths come late: a lazy swing)
      if (this.on) this.play(this.step, this.next + (this.step % 2 ? spb * 0.22 : 0), spb);
      this.next += spb;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) {
        this.bar++;
        if (this.bar % 16 === 0) this.prog = (this.prog + 1) % PROGS.length;
        this.bpm = TRACKS[this.prog].bpm;
      }
    }
  }

  play(st, t, spb) {
    const mood = this.mood;
    const chord = PROGS[this.prog][this.bar % 4];
    const root = chord[0], minor = chord[1];
    const third = minor ? 3 : 4, seventh = minor ? 10 : 11;
    const ride = mood === 'ride', chill = mood === 'chill';
    const section = Math.floor(this.bar / 8) % 4; // 0 intro, 1 groove, 2 lift, 3 break
    // pads on every bar, low and soft; the dust on the record under everything
    if (st === 0) this.pad([root + 12, root + 12 + third, root + 19, root + 12 + seventh], t, spb * 16);
    if (st % 4 === 0) this.crackle(t, spb * 4);
    if (mood === 'calm') return;
    // the keys: the chord laid down on the one, pushed a little on the and-of-two
    const keys = [root + 12, root + 12 + third, root + 19, root + 12 + seventh, root + 26];
    if (st === 0) this.rhodes(keys, t, 0.05, spb * 7);
    if (st === 7 && this.bar % 2 === 1) this.rhodes(keys.slice(1), t, 0.035, spb * 6);
    // drums: a lazy boom-bap, quieter on the menu and through the breaks
    const beat = ride ? (section === 3 ? 0.45 : 1) : chill ? 0.4 : 1;
    if (st === 0 || st === 10 || (ride && st === 7 && this.bar % 2 === 0)) this.kick(t, 0.5 * beat);
    if ((st === 4 || st === 12) && (ride || section > 0)) this.snare(t, 0.2 * beat);
    if (st % 2 === 0) this.hat(t, st % 4 === 2 ? 0.1 : 0.06, beat);
    // bass: round and slow, root then fifth
    if (ride || section > 0) {
      if (st === 0) this.bass(hz(root - 12), t, spb * 5);
      if (st === 6) this.bass(hz(root - 12), t, spb * 3);
      if (st === 10) this.bass(hz(root - 12 + 7), t, spb * 4);
    }
    // a few notes of melody up top in the groove and the lift
    if ((section === 1 || section === 2) && (st === 2 || st === 6 || st === 11) && (this.bar + st) % 3 !== 0) {
      const notes = [12, 12 + third, 19, 12 + seventh, 24];
      this.pluck(hz(root + 24 + notes[(this.bar * 3 + st) % 5]), t, chill ? 0.03 : 0.045);
    }
  }

  // ---- instruments ----
  env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }

  kick(t, v) {
    const ctx = this.a.ctx;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = ctx.createGain(); this.env(g, t, 0.006, v, 0.32);
    o.connect(g).connect(this.bus); o.start(t); o.stop(t + 0.35);
  }

  snare(t, v) {
    const ctx = this.a.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.a.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 0.7;
    const g = ctx.createGain(); this.env(g, t, 0.004, v, 0.2);
    n.connect(f).connect(g).connect(this.bus); g.connect(this.send);
    n.start(t, Math.random()); n.stop(t + 0.2);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const og = ctx.createGain(); this.env(og, t, 0.002, v * 0.5, 0.09);
    o.connect(og).connect(this.bus); o.start(t); o.stop(t + 0.12);
  }

  hat(t, v, k) {
    const ctx = this.a.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.a.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 8000; f.Q.value = 0.6;
    const g = ctx.createGain(); this.env(g, t, 0.002, v * k, 0.04);
    n.connect(f).connect(g).connect(this.bus);
    n.start(t, Math.random()); n.stop(t + 0.06);
  }

  bass(f0, t, d) {
    const ctx = this.a.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1;
    f.frequency.setValueAtTime(420, t); f.frequency.exponentialRampToValueAtTime(160, t + d);
    const g = ctx.createGain(); this.env(g, t, 0.02, 0.3, d);
    o.connect(f).connect(g).connect(this.bus); o.start(t); o.stop(t + d + 0.05);
  }

  pad(semis, t, d) {
    const ctx = this.a.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.03, t + d * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + d * 1.05);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 800;
    f.connect(g); g.connect(this.bus); g.connect(this.send);
    for (const s of semis) for (const det of [-6, 6]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz(s); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + d * 1.1);
    }
  }

  pluck(f0, t, v) {
    const ctx = this.a.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f0;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f0 * 2;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.4);
    const g = ctx.createGain(); this.env(g, t, 0.008, v, 0.5);
    const g2 = ctx.createGain(); g2.gain.value = 0.1;
    o.connect(f); o2.connect(g2).connect(f); f.connect(g); g.connect(this.bus); g.connect(this.send);
    o.start(t); o.stop(t + 0.55); o2.start(t); o2.stop(t + 0.55);
  }

  // a soft electric piano: a sine with a bell of its octave on top, slow to fade, a slow wobble
  rhodes(semis, t, v, d) {
    const ctx = this.a.ctx;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1700;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 4.2; const lg = ctx.createGain(); lg.gain.value = v * 0.25;
    lfo.connect(lg).connect(g.gain); lfo.start(t); lfo.stop(t + d + 0.05);
    f.connect(g); g.connect(this.bus); g.connect(this.send);
    semis.forEach((s, i) => {
      const at = t + i * 0.012; // (rolled a touch, the way a hand lays a chord down)
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz(s);
      const b = ctx.createOscillator(); b.type = 'sine'; b.frequency.value = hz(s) * 2;
      const bg = ctx.createGain(); bg.gain.setValueAtTime(0.25, at); bg.gain.exponentialRampToValueAtTime(0.001, at + 0.4);
      o.connect(f); b.connect(bg).connect(f);
      o.start(at); o.stop(t + d + 0.05); b.start(at); b.stop(at + 0.45);
    });
  }

  // the record's dust: a few faint ticks and a low hiss
  crackle(t, d) {
    const ctx = this.a.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.a.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3000; f.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = 0.006;
    n.connect(f).connect(g).connect(this.bus);
    n.start(t, Math.random()); n.stop(t + d);
    for (let i = 0; i < 3; i++) {
      if (Math.random() < 0.4) continue;
      const at = t + Math.random() * d;
      const c = ctx.createBufferSource(); c.buffer = this.a.noise;
      const cg = ctx.createGain(); this.env(cg, at, 0.0005, 0.02 + Math.random() * 0.03, 0.008);
      c.connect(cg).connect(this.bus); c.start(at, Math.random()); c.stop(at + 0.015);
    }
  }
}
