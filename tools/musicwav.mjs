// The soundtrack rendered offline to a WAV: node tools/musicwav.mjs <out.wav> [mood=ride] [secs=30] [track=0]
import { chromium } from 'playwright-core';
import { CHROME } from './chrome.mjs';
import fs from 'node:fs';
const [out = 'music.wav', mood = 'ride', secs = '30', track = '0'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await b.newPage();
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/tools/blank.html`).catch(() => {});
const res = await page.evaluate(async ([mood, secs, track]) => {
  const { Music, TRACKS } = await import('/src/music.js');
  const sr = 44100, ctx = new OfflineAudioContext(2, sr * secs, sr);
  const noise = ctx.createBuffer(1, sr * 2, sr); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const a = { ctx, noise, out: ctx.destination };
  const m = new Music(a);
  m.skip(track); m.mood = mood;
  // (the live player's scheduler, run straight through)
  Object.defineProperty(ctx, 'state', { get: () => 'running' });
  m.start(); clearInterval(m.timer);
  let next = 0.1;
  while (next < secs - 0.5) {
    const spb = 60 / m.bpm / 4;
    m.play(m.step, next + (m.step % 2 ? spb * 0.22 : 0), spb);
    next += spb; m.step = (m.step + 1) % 16;
    if (m.step === 0) { m.bar++; if (m.bar % 16 === 0) m.prog = (m.prog + 1) % 4; m.bpm = TRACKS[m.prog].bpm; }
  }
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  let peak = 0, rms = 0;
  const pcm = new Int16Array(L.length * 2);
  for (let i = 0; i < L.length; i++) { peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); rms += L[i] * L[i]; pcm[i * 2] = Math.max(-1, Math.min(1, L[i])) * 32767; pcm[i * 2 + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
  const bytes = new Uint8Array(pcm.buffer); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { pcm: btoa(s), peak, rms: Math.sqrt(rms / L.length), bpm: TRACKS[track].bpm };
}, [mood, +secs, +track]);
const pcm = Buffer.from(res.pcm, 'base64');
const h = Buffer.alloc(44);
h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
h.writeUInt32LE(44100, 24); h.writeUInt32LE(44100 * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
fs.writeFileSync(out, Buffer.concat([h, pcm]));
console.log('wrote', out, 'peak', res.peak.toFixed(2), 'rms', res.rms.toFixed(3), 'bpm', res.bpm);
await b.close();
