// Procedural sound: wind with speed, edge hiss when carving, scrape when
// skidding, thumps, gate ticks, crowd roar at the finish.
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    // pinkish noise
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    this.noise = buf;
    const loop = (type, f, q) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const filt = ctx.createBiquadFilter(); filt.type = type; filt.frequency.value = f; filt.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(filt).connect(g).connect(this.master);
      src.start(0, Math.random());
      return { filt, g };
    };
    this.wind = loop('bandpass', 400, 0.5);
    this.windHi = loop('highpass', 2500, 0.7);
    this.carve = loop('bandpass', 2600, 1.4);
    this.skid = loop('bandpass', 700, 0.9);
    this.crowd = loop('bandpass', 1100, 0.7);
    this.scrape = loop('bandpass', 3400, 3.5); // edges chattering on ice
    this.powder = loop('lowpass', 420, 0.8); // soft roar of deep snow
    this.ambient = loop('lowpass', 300, 0.5);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.8;
  }

  update(s, crowdK = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const sp = s ? s.speed : 0;
    const air = s && !s.onGround;
    const ramp = (p, v) => { if (Number.isFinite(v)) p.setTargetAtTime(v, t, 0.06); };
    const w = Math.min(1, sp / 32);
    ramp(this.wind.g.gain, 0.04 + w * w * 0.75);
    ramp(this.wind.filt.frequency, 280 + sp * 22);
    ramp(this.windHi.g.gain, w * w * 0.18);
    const grounded = s && s.onGround && s.crash <= 0 ? 1 : 0;
    const carve = grounded * Math.min(1, Math.abs(s ? s.lean : 0) * 1.4) * Math.min(1, sp / 15);
    ramp(this.carve.g.gain, carve * 0.35 + grounded * Math.min(1, sp / 25) * 0.06);
    ramp(this.carve.filt.frequency, 2000 + sp * 40);
    const ice = s ? s.surf?.ice ?? 0 : 0, powder = s ? s.surf?.powder ?? 0 : 0;
    const skid = grounded * Math.min(1, (s ? s.skid : 0) / 2.5);
    ramp(this.skid.g.gain, skid * 0.75 * (1 - powder * 0.7));
    ramp(this.skid.filt.frequency, 700 + ice * 900);
    ramp(this.scrape.g.gain, grounded * Math.min(1, (s ? s.scrape : 0) * 2.2) * 0.55);
    ramp(this.powder.g.gain, grounded * powder * Math.min(1, sp / 14) * 0.6);
    ramp(this.crowd.g.gain, crowdK * 0.5);
    ramp(this.ambient.g.gain, 0.06);
    void air;
  }

  thump(k = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9 * k, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f).connect(g).connect(this.master); src.start(t, Math.random()); src.stop(t + 0.4);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.5 * k, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(og).connect(this.master); o.start(t); o.stop(t + 0.32);
  }

  // a pole or a sign whacked: a hollow knock with a rattle (wood: lower and duller)
  clack(k = 1, wood = false) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = wood ? 900 : 2200; f.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7 * k, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(f).connect(g).connect(this.master); src.start(t, Math.random()); src.stop(t + 0.2);
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(wood ? 210 : 520, t); o.frequency.exponentialRampToValueAtTime(wood ? 120 : 330, t + 0.12);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.35 * k, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(og).connect(this.master); o.start(t); o.stop(t + 0.18);
  }

  // into the netting: a soft whump and the mesh rustling
  netHit(k = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * k, t + 0.04); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(f).connect(g).connect(this.master); src.start(t, Math.random()); src.stop(t + 0.55);
    this.thump(0.35 * k);
  }

  beep(freq = 880, dur = 0.12, vol = 0.25, type = 'sine') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  chime() { [660, 880, 1320].forEach((f, i) => setTimeout(() => this.beep(f, 0.22, 0.14, 'triangle'), i * 70)); }
  buzz() { this.beep(140, 0.35, 0.25, 'sawtooth'); }

  cheer() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.3); g.gain.exponentialRampToValueAtTime(0.001, t + 3.2);
    src.connect(f).connect(g).connect(this.master); src.start(t, Math.random()); src.stop(t + 3.3);
  }
}
