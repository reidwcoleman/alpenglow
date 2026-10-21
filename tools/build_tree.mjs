// The cartoon pine (art/tree: a Higgsfield concept image made into a mesh by its image-to-3D):
// welded, cut down to a few levels of detail with meshoptimizer, its texture baked into flat
// palette colours per face (dark teal tiers, white snow caps, a brown trunk), stood on its base
// and scaled to 1 m tall. Writes public/trees/toon.bin for src/toontrees.js.
// node tools/build_tree.mjs [art/tree/tree_raw.glb]
import fs from 'fs';
import jpeg from 'jpeg-js';
import { MeshoptSimplifier } from 'meshoptimizer';

const src = process.argv[2] ?? 'art/tree/tree_raw.glb';
const b = fs.readFileSync(src);
const jl = b.readUInt32LE(12), J = JSON.parse(b.subarray(20, 20 + jl).toString());
const bin = b.subarray(20 + jl + 8);
const view = (i) => { const v = J.bufferViews[i]; return bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength); };
const acc = (i, T) => { const a = J.accessors[i], v = view(a.bufferView), n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type] * a.count; return new T(v.buffer.slice(v.byteOffset + (a.byteOffset ?? 0), v.byteOffset + (a.byteOffset ?? 0) + n * T.BYTES_PER_ELEMENT)); };
const prim = J.meshes[0].primitives[0];
const P = acc(prim.attributes.POSITION, Float32Array), UV = acc(prim.attributes.TEXCOORD_0, Float32Array);
const ia = J.accessors[prim.indices];
const IDX = ia.componentType === 5125 ? acc(prim.indices, Uint32Array) : Uint32Array.from(acc(prim.indices, Uint16Array));
const img = jpeg.decode(view(J.images[0].bufferView), { useTArray: true });
const tex = (u, v) => {
  const x = Math.min(img.width - 1, Math.max(0, Math.round(u * (img.width - 1)))), y = Math.min(img.height - 1, Math.max(0, Math.round(v * (img.height - 1))));
  const o = (y * img.width + x) * 4;
  return [img.data[o], img.data[o + 1], img.data[o + 2]];
};

// stand it on its base, 1 m tall, centred on the trunk
let y0 = 1e9, y1 = -1e9;
for (let i = 1; i < P.length; i += 3) { y0 = Math.min(y0, P[i]); y1 = Math.max(y1, P[i]); }
let cx = 0, cz = 0, nb = 0;
for (let i = 0; i < P.length; i += 3) if (P[i + 1] < y0 + (y1 - y0) * 0.05) { cx += P[i]; cz += P[i + 2]; nb++; }
cx /= nb; cz /= nb;
const H = y1 - y0;
for (let i = 0; i < P.length; i += 3) { P[i] = (P[i] - cx) / H; P[i + 1] = (P[i + 1] - y0) / H; P[i + 2] = (P[i + 2] - cz) / H; }

// each face's colour off the texture (a few samples inside it), sorted into the palette
const SNOW = [237, 247, 252], TEAL = [35, 78, 80], DEEP = [25, 61, 65], BARK = [130, 100, 82];
const nF = IDX.length / 3, fcol = new Uint8Array(nF);
const raw = [];
for (let f = 0; f < nF; f++) {
  let r = 0, g = 0, bl = 0;
  const W = [[0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6], [1 / 3, 1 / 3, 1 / 3]];
  for (const w of W) {
    let u = 0, v = 0;
    for (let k = 0; k < 3; k++) { const vi = IDX[f * 3 + k]; u += UV[vi * 2] * w[k]; v += UV[vi * 2 + 1] * w[k]; }
    const c = tex(u, v); r += c[0]; g += c[1]; bl += c[2];
  }
  raw.push([r / 4, g / 4, bl / 4]);
}
// (snow: bright and grey-blue; bark: warm; the rest the tiers, split light/dark at their median)
const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const greens = [];
for (let f = 0; f < nF; f++) {
  const c = raw[f], l = lum(c);
  if (l > 120 && Math.max(...c) - Math.min(...c) < 60) fcol[f] = 0;
  else if (c[0] > c[1] + 6 && c[0] > c[2]) fcol[f] = 3;
  else { fcol[f] = 1; greens.push(l); }
}
greens.sort((a, b) => a - b);
const gMid = greens[greens.length >> 1];
for (let f = 0; f < nF; f++) if (fcol[f] === 1 && lum(raw[f]) < gMid * 0.92) fcol[f] = 2;
const PAL = [SNOW, TEAL, DEEP, BARK];

// weld the texture seams, then the levels of detail
await MeshoptSimplifier.ready;
const key = new Map(), remap = new Uint32Array(P.length / 3), WP = [];
for (let i = 0; i < P.length / 3; i++) {
  const k = `${Math.round(P[i * 3] * 1e4)},${Math.round(P[i * 3 + 1] * 1e4)},${Math.round(P[i * 3 + 2] * 1e4)}`;
  let w = key.get(k);
  if (w === undefined) { w = WP.length / 3; key.set(k, w); WP.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); }
  remap[i] = w;
}
const WPf = Float32Array.from(WP), WI = IDX.map((i) => remap[i]);
// face centroids of the original, hashed, for looking a colour up from a simplified face
const cell = 0.02, grid = new Map();
const cent = new Float32Array(nF * 3);
for (let f = 0; f < nF; f++) {
  for (let k = 0; k < 3; k++) { const v = WI[f * 3 + k]; for (let c = 0; c < 3; c++) cent[f * 3 + c] += WPf[v * 3 + c] / 3; }
  const g = `${Math.floor(cent[f * 3] / cell)},${Math.floor(cent[f * 3 + 1] / cell)},${Math.floor(cent[f * 3 + 2] / cell)}`;
  (grid.get(g) ?? grid.set(g, []).get(g)).push(f);
}
const nearestFace = (x, y, z, nx, ny, nz) => {
  let best = -1, bd = 1e9;
  for (let r = 1; r <= 4 && best < 0; r++) {
    const ix = Math.floor(x / cell), iy = Math.floor(y / cell), iz = Math.floor(z / cell);
    for (let a = -r; a <= r; a++) for (let bb = -r; bb <= r; bb++) for (let c = -r; c <= r; c++) {
      for (const f of grid.get(`${ix + a},${iy + bb},${iz + c}`) ?? []) {
        const dx = cent[f * 3] - x, dy = cent[f * 3 + 1] - y, dz = cent[f * 3 + 2] - z;
        // (prefer faces facing the same way: snow lies over the green right under it)
        const d = dx * dx + dy * dy + dz * dz + 0.0004 * (1 - faceDot(f, nx, ny, nz));
        if (d < bd) { bd = d; best = f; }
      }
    }
  }
  return best;
};
const fn = new Float32Array(nF * 3);
const faceNormal = (pos, ind, f, out, o) => {
  const a = ind[f * 3] * 3, b2 = ind[f * 3 + 1] * 3, c = ind[f * 3 + 2] * 3;
  const ux = pos[b2] - pos[a], uy = pos[b2 + 1] - pos[a + 1], uz = pos[b2 + 2] - pos[a + 2];
  const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
  let x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
  const l = Math.hypot(x, y, z) || 1;
  out[o] = x / l; out[o + 1] = y / l; out[o + 2] = z / l;
};
for (let f = 0; f < nF; f++) faceNormal(WPf, WI, f, fn, f * 3);
function faceDot(f, nx, ny, nz) { return fn[f * 3] * nx + fn[f * 3 + 1] * ny + fn[f * 3 + 2] * nz; }

function lod(targetTris) {
  const [ind] = MeshoptSimplifier.simplify(WI, WPf, 3, Math.min(WI.length, targetTris * 3), 0.05, ['LockBorder']);
  const n = ind.length / 3;
  // smooth vertex normals on the simplified mesh (area weighted), split where a crease is sharp
  const vn = new Float32Array(WPf.length), f3 = new Float32Array(n * 3);
  for (let f = 0; f < n; f++) {
    faceNormal(WPf, ind, f, f3, f * 3);
    for (let k = 0; k < 3; k++) { const v = ind[f * 3 + k]; for (let c = 0; c < 3; c++) vn[v * 3 + c] += f3[f * 3 + c]; }
  }
  const pos = new Float32Array(n * 9), nrm = new Int8Array(n * 12), col = new Uint8Array(n * 12);
  for (let f = 0; f < n; f++) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 3; k++) { const v = ind[f * 3 + k]; x += WPf[v * 3] / 3; y += WPf[v * 3 + 1] / 3; z += WPf[v * 3 + 2] / 3; }
    const of = nearestFace(x, y, z, f3[f * 3], f3[f * 3 + 1], f3[f * 3 + 2]);
    const pc = PAL[of < 0 ? 1 : fcol[of]];
    for (let k = 0; k < 3; k++) {
      const v = ind[f * 3 + k], o = f * 3 + k;
      pos.set(WPf.subarray(v * 3, v * 3 + 3), o * 3);
      let nx = vn[v * 3], ny = vn[v * 3 + 1], nz = vn[v * 3 + 2];
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      // (a crease sharper than ~50 degrees keeps the face's own normal)
      if (nx * f3[f * 3] + ny * f3[f * 3 + 1] + nz * f3[f * 3 + 2] < 0.64) { nx = f3[f * 3]; ny = f3[f * 3 + 1]; nz = f3[f * 3 + 2]; }
      nrm[o * 4] = Math.round(nx * 127); nrm[o * 4 + 1] = Math.round(ny * 127); nrm[o * 4 + 2] = Math.round(nz * 127);
      col[o * 4] = pc[0]; col[o * 4 + 1] = pc[1]; col[o * 4 + 2] = pc[2]; col[o * 4 + 3] = of < 0 ? 1 : fcol[of];
    }
  }
  console.log(`lod ${targetTris}: ${n} tris`);
  return { n: n * 3, pos, nrm, col };
}

const L = [lod(2600), lod(700), lod(220)];
const head = new Uint32Array([L.length, ...L.map((l) => l.n)]);
const parts = [Buffer.from(head.buffer)];
for (const l of L) parts.push(Buffer.from(l.pos.buffer), Buffer.from(l.nrm.buffer), Buffer.from(l.col.buffer));
fs.mkdirSync('public/trees', { recursive: true });
fs.writeFileSync('public/trees/toon.bin', Buffer.concat(parts));
console.log('wrote public/trees/toon.bin', Buffer.concat(parts).length, 'bytes; faces', ['snow', 'teal', 'deep', 'bark'].map((k, i) => k + ' ' + fcol.filter((c) => c === i).length).join(', '));
