// The soundtrack, made as it plays: drums, a bass line, warm pads and a plucked arpeggio
// over a few chord progressions, scheduled a moment ahead on the audio clock. Three moods:
// 'chill' (the menu, the chairlift: pads and a soft beat), 'ride' (the full groove) and
// 'calm' (after a bad crash: pads only).
const PROGS = [
  // [root semitones from A, minor?] four bars each
  [[0, 1], [-4, 0], [3, 0], [-2, 0]], // Am F C G
  [[-7, 1], [-2, 0], [3, 0], [0, 1]], // Dm G C Am
  [[0, 1], [5, 1], [-2, 0], [3, 0]], // Am Dm G C
  [[-4, 0], [3, 0], [-2, 0], [0, 1]], // F C G Am
];
const A2 = 110;
const hz = (semi) => A2 * Math.pow(2, semi / 12);

export class Music {
  constructor(audio) {
    this.a = audio;
    this.on = true;
    this.mood = 'chill';
    this.bpm = 112;
    this.step = 0; this.bar = 0; this.prog = 0;
    this.timer = null;
  }

  // once the audio is running
  start() {
    const ctx = this.a.ctx;
    if (!ctx || this.timer) return;
    this.bus = ctx.createGain();
    this.bus.gain.value = this.on ? 0.42 : 0;
    // a touch of space on everything
    const delay = ctx.createDelay(1); delay.delayTime.value = (60 / this.bpm) * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const wet = ctx.createGain(); wet.gain.value = 0.22;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    this.send = ctx.createGain(); this.send.gain.value = 1;
    this.send.connect(delay); delay.connect(lp).connect(fb).connect(delay); lp.connect(wet).connect(this.bus);
    this.bus.connect(this.a.master);
    this.next = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.tick(), 25);
  }

  setOn(on) {
    this.on = on;
    if (this.bus) this.bus.gain.setTargetAtTime(on ? 0.42 : 0, this.a.ctx.currentTime, 0.3);
  }

  setMood(m) { this.mood = m; }

  tick() {
    const ctx = this.a.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const spb = 60 / this.bpm / 4; // a sixteenth
    while (this.next < ctx.currentTime + 0.12) {
      if (this.on) this.play(this.step, this.next, spb);
      this.next += spb;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) {
        this.bar++;
        if (this.bar % 4 === 0) this.prog = (this.prog + (this.bar % 16 === 0 ? 1 : 0)) % PROGS.length;
      }
    }
  }

  play(st, t, spb) {
    const mood = this.mood;
    const chord = PROGS[this.prog][this.bar % 4];
    const root = chord[0], minor = chord[1];
    const third = minor ? 3 : 4;
    const ride = mood === 'ride', chill = mood === 'chill';
    const section = Math.floor(this.bar / 8) % 4; // 0 build, 1 groove, 2 lift, 3 break
    // pads on every bar
    if (st === 0) this.pad([root + 12, root + 12 + third, root + 19, root + 24], t, spb * 16);
    if (mood === 'calm') return;
    // drums
    const kick = ride ? (st % 4 === 0 || (section === 2 && st === 14)) : st === 0 || st === 10;
    if (kick && section !== 3) this.kick(t, chill ? 0.55 : 0.9);
    if ((st === 4 || st === 12) && (ride || section > 0)) this.snare(t, chill ? 0.25 : 0.5);
    if (st % 2 === 0 || (ride && section === 2)) this.hat(t, st % 4 === 2 ? 0.22 : 0.12, chill ? 0.6 : 1);
    // bass: root and fifth, syncopated
    if (ride || section > 0) {
      const pat = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
      if (pat[st]) this.bass(hz(root - 12 + (st === 11 || st === 13 ? 7 : 0)), t, spb * 1.6);
    }
    // the arpeggio, in the lifting sections
    if ((section === 1 || section === 2) && st % 2 === 0) {
      const notes = [0, third, 7, 12, 7, third, 12, 15];
      this.pluck(hz(root + 24 + notes[(st / 2) % 8]), t, chill ? 0.06 : 0.09);
    }
  }

  // ---- instruments ----
  env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }

  kick(t, v) {
    const ctx = this.a.ctx;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = ctx.createGain(); this.env(g, t, 0.004, v, 0.3);
    o.connect(g).connect(this.bus); o.start(t); o.stop(t + 0.35);
  }

  snare(t, v) {
    const ctx = this.a.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.a.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    const g = ctx.createGain(); this.env(g, t, 0.002, v, 0.16);
    n.connect(f).connect(g).connect(this.bus); g.connect(this.send);
    n.start(t, Math.random()); n.stop(t + 0.2);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const og = ctx.createGain(); this.env(og, t, 0.002, v * 0.5, 0.09);
    o.connect(og).connect(this.bus); o.start(t); o.stop(t + 0.12);
  }

  hat(t, v, k) {
    const ctx = this.a.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.a.noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = ctx.createGain(); this.env(g, t, 0.001, v * k, 0.045);
    n.connect(f).connect(g).connect(this.bus);
    n.start(t, Math.random()); n.stop(t + 0.06);
  }

  bass(f0, t, d) {
    const ctx = this.a.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(180, t + d);
    const g = ctx.createGain(); this.env(g, t, 0.006, 0.32, d);
    o.connect(f).connect(g).connect(this.bus); o.start(t); o.stop(t + d + 0.05);
  }

  pad(semis, t, d) {
    const ctx = this.a.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + d * 0.25); g.gain.linearRampToValueAtTime(0.0001, t + d * 1.05);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1300;
    f.connect(g); g.connect(this.bus); g.connect(this.send);
    for (const s of semis) for (const det of [-6, 6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(s); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + d * 1.1);
    }
  }

  pluck(f0, t, v) {
    const ctx = this.a.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f0;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = f0 * 2;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(600, t + 0.25);
    const g = ctx.createGain(); this.env(g, t, 0.003, v, 0.3);
    const g2 = ctx.createGain(); g2.gain.value = 0.15;
    o.connect(f); o2.connect(g2).connect(f); f.connect(g); g.connect(this.bus); g.connect(this.send);
    o.start(t); o.stop(t + 0.35); o2.start(t); o2.stop(t + 0.35);
  }
}
