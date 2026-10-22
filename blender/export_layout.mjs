// The placed features of every park, for the Blender scripts: node blender/export_layout.mjs
// Each park's course.js is evaluated with ?park=<id> (a fresh process per park: the module
// reads the park once), writing blender/data/layout_<id>.json.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.PARK) {
  const { MAPS } = await import('../src/maps.js').catch(() => ({ MAPS: null }));
  const ids = MAPS ? Object.keys(MAPS) : ['yard'];
  for (const id of ids) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, PARK: id }, encoding: 'utf8' });
    process.stdout.write(r.stdout); process.stderr.write(r.stderr);
  }
  process.exit(0);
}
globalThis.location = { search: '?park=' + process.env.PARK, hostname: 'localhost', href: 'http://localhost/?park=' + process.env.PARK };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.innerWidth = 1280; globalThis.innerHeight = 720; globalThis.devicePixelRatio = 1;
const C = await import('../src/course.js');
const fs = await import('node:fs');
const r = { s: 0, lat: 0, y: 0, slope: 0 };
const rails = C.RAILS.map((R) => {
  const n = R.ys.length;
  const pts = Array.from(R.ys).map((y, i) => { const s = (i / (n - 1)) * R.L; return [R.a.x + R.dir.x * s, y, R.a.z + R.dir.z * s]; });
  const legs = [];
  const nl = Math.max(2, Math.round(R.L / 2.6) + 1);
  for (let k = 0; k < nl; k++) {
    const s = 0.25 + (k / (nl - 1)) * (R.L - 0.5);
    const x = R.a.x + R.dir.x * s, z = R.a.z + R.dir.z * s;
    C.railAt(R, x, z, r);
    legs.push([x, z, r.y, C.heightAt(x, z)]);
  }
  return { name: R.name, kind: R.kind ?? 'rail', shape: R.shape, hw: R.hw, yaw: R.yaw, dir: [R.dir.x, R.dir.z], L: R.L, pts, legs, ground: pts.map(([x, , z]) => C.heightAt(x, z)) };
});
fs.writeFileSync(path.join(here, 'data', `layout_${C.PARK_ID}.json`), JSON.stringify({ park: C.PARK_ID, rails }));
console.log(C.PARK_ID, rails.length, 'rails');
