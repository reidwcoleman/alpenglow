// What the game registers for Blender to bake light onto (src/bake.js), written out as the game
// builds it, in every park (what differs between them is baked for each):
// node tools/dumpbake.mjs [park ...]  ->  blender/data/bake_<name>.bin
//   uint32 header length, the header (JSON: each mesh's vertex and triangle count, options, the
//   ground round it as a height grid), then per mesh its positions (float32, in the world) and
//   triangles (uint32)
import { chromium } from 'playwright-core';
import { CHROME, ANGLE } from './chrome.mjs';
import fs from 'node:fs';
const all = ['yard', 'slope', 'forest', 'bigair', 'timber', 'grand', 'mega', 'canyon', 'cloud'];
const parks = process.argv.slice(2).length ? process.argv.slice(2) : all;
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: [ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'] });
const done = new Set();
for (const park of parks) {
const page = await b.newPage({ viewport: { width: 320, height: 240 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 5260}/?park=${park}&menu=0&mode=run`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
const names = await page.evaluate(async (skip) => {
  const BAKE = window.__bake;
  const { heightAt } = await import('/src/course.js');
  const out = {};
  window.__bakeOut = out;
  for (const [name, { list, opts }] of BAKE) {
    if (skip.includes(name)) continue;
    const head = { meshes: [], apart: !!opts.apart };
    const chunks = [];
    for (const { geo, m } of list) {
      const p = geo.attributes.position, n = p.count;
      const P = new Float32Array(n * 3);
      const e = m.elements;
      for (let i = 0; i < n; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        P[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; P[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; P[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      }
      const I = geo.index ? Uint32Array.from(geo.index.array) : Uint32Array.from({ length: n - (n % 3) }, (_, i) => i);
      head.meshes.push({ n, t: I.length / 3 });
      chunks.push(P, I);
    }
    if (opts.ground) {
      const [x, z, r] = opts.ground, N = 48, ys = [];
      for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) ys.push(heightAt(x - r + (2 * r * i) / N, z - r + (2 * r * j) / N));
      head.ground = { x, z, r, N, ys };
    }
    out[name] = { head, chunks };
  }
  return Object.keys(out);
}, [...done]);
fs.mkdirSync('blender/data', { recursive: true });
for (const name of names) {
  const { head, chunks } = await page.evaluate((n) => {
    const { head, chunks } = window.__bakeOut[n];
    // (the arrays as base64, to come out of the page)
    const enc = (a) => { const u = new Uint8Array(a.buffer); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
    return { head, chunks: chunks.map(enc) };
  }, name);
  const hb = Buffer.from(JSON.stringify(head));
  const len = Buffer.alloc(4); len.writeUInt32LE(hb.length);
  fs.writeFileSync(`blender/data/bake_${name}.bin`, Buffer.concat([len, hb, ...chunks.map((c) => Buffer.from(c, 'base64'))]));
  done.add(name);
  console.log(name, head.meshes.length, 'meshes', head.meshes.reduce((s, m) => s + m.n, 0), 'vertices');
}
await page.close();
}
await b.close();
