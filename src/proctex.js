// Materials painted in code for the buildings: rough stone, larch boards, plaster, standing-seam
// roof metal, concrete and paving, each a colour map and a normal map worked out from the same
// height field (so the stones stand proud of the mortar and the board gaps sit back in the
// light). boxUV() gives a piece of geometry texture coordinates in metres, projected along
// whichever axis each face looks down.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

function canvas(n) { const c = document.createElement('canvas'); c.width = c.height = n; return c; }

// a normal map from a height canvas (sobel), strength in "pixels of height per unit"
function normalFrom(hc, strength) {
  const n = hc.width, src = hc.getContext('2d').getImageData(0, 0, n, n).data;
  const h = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) h[i] = src[i * 4] / 255;
  const out = canvas(n), ctx = out.getContext('2d'), img = ctx.createImageData(n, n), d = img.data;
  for (let y = 0; y < n; y++) {
    const ym = ((y - 1 + n) % n) * n, y0 = y * n, yp = ((y + 1) % n) * n;
    for (let x = 0; x < n; x++) {
      const xm = (x - 1 + n) % n, xp = (x + 1) % n;
      const dx = (h[ym + xp] + 2 * h[y0 + xp] + h[yp + xp] - h[ym + xm] - 2 * h[y0 + xm] - h[yp + xm]) * strength;
      const dy = (h[yp + xm] + 2 * h[yp + x] + h[yp + xp] - h[ym + xm] - 2 * h[ym + x] - h[ym + xp]) * strength;
      const l = 1 / Math.sqrt(dx * dx + dy * dy + 1), i = (y0 + x) * 4;
      d[i] = (-dx * l * 0.5 + 0.5) * 255; d[i + 1] = (dy * l * 0.5 + 0.5) * 255; d[i + 2] = (l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function tex(c, srgb, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// speckle a canvas with soft noise (count specks of up to size px, at up to alpha), written into
// the pixels directly
function grain(g, n, rnd, count, alpha, size = 3) {
  const img = g.getImageData(0, 0, n, n), d = img.data;
  for (let i = 0; i < count; i++) {
    const v = rnd() < 0.5 ? 255 : 0, a = rnd() * alpha;
    const s = Math.max(1, Math.round(size * (0.5 + rnd()))), x0 = (rnd() * n) | 0, y0 = (rnd() * n) | 0;
    for (let y = y0; y < Math.min(n, y0 + s); y++) for (let x = x0; x < Math.min(n, x0 + s); x++) {
      const k = (y * n + x) * 4;
      d[k] += (v - d[k]) * a; d[k + 1] += (v - d[k + 1]) * a; d[k + 2] += (v - d[k + 2]) * a;
    }
  }
  g.putImageData(img, 0, 0);
}

// each material's numbers, known before its pictures are painted
const META = {
  stone: { size: 1.6, roughness: 0.92 }, larch: { size: 1.4, roughness: 0.86 }, plaster: { size: 3, roughness: 0.9 },
  roof: { size: 2, roughness: 0.45, metalness: 0.55 }, concrete: { size: 3, roughness: 0.88 }, pavers: { size: 2, roughness: 0.8 },
};
// The painting waits: a texture starts as a placeholder and paintTextures() (behind the front
// page, once the game's up) draws the real one into it, so none of this slows the loading.
const cache = new Map(), pending = [];
const once = (k, f) => {
  if (!cache.has(k)) {
    const ph = (col) => { const c = canvas(2), g = c.getContext('2d'); g.fillStyle = col; g.fillRect(0, 0, 2, 2); return c; };
    const out = { map: tex(ph('#9a968f'), true), normalMap: tex(ph('#8080ff'), false), ...META[k] };
    cache.set(k, out);
    pending.push(() => {
      const r = f();
      out.map.image = r.map.image; out.normalMap.image = r.normalMap.image;
      out.map.needsUpdate = true; out.normalMap.needsUpdate = true;
    });
  }
  return cache.get(k);
};

export async function paintTextures(breath) {
  while (pending.length) { pending.shift()(); await breath?.(); }
}

// random-coursed rubble stone, 1.6 m across the tile
export function stone() {
  return once('stone', () => {
    const n = 512, rnd = mulberry32(5), col = canvas(n), hgt = canvas(n);
    const c = col.getContext('2d'), h = hgt.getContext('2d');
    c.fillStyle = '#5a554e'; c.fillRect(0, 0, n, n);
    h.fillStyle = '#202020'; h.fillRect(0, 0, n, n);
    let y = 0;
    while (y < n) {
      const rowH = 34 + rnd() * 30;
      let x = -rnd() * 60;
      while (x < n) {
        const w = 50 + rnd() * 80, gap = 5 + rnd() * 3;
        const tone = 92 + rnd() * 70, warm = rnd() * 16;
        for (const ox of [0, -n, n]) for (const oy of [0, y + rowH > n ? -n : 0]) {
          const px = x + ox + gap / 2, py = y + oy + gap / 2, pw = w - gap, ph = rowH - gap;
          c.fillStyle = `rgb(${tone + warm | 0},${tone + warm * 0.6 | 0},${tone - 4 | 0})`;
          c.beginPath(); c.roundRect(px, py, pw, ph, 9); c.fill();
          // lit from above, the stone's face rounded
          const gr = c.createLinearGradient(0, py, 0, py + ph);
          gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.18)');
          c.fillStyle = gr; c.beginPath(); c.roundRect(px, py, pw, ph, 9); c.fill();
          const hg = h.createRadialGradient(px + pw / 2, py + ph / 2, 2, px + pw / 2, py + ph / 2, Math.max(pw, ph) * 0.62);
          hg.addColorStop(0, '#f0f0f0'); hg.addColorStop(0.7, '#b8b8b8'); hg.addColorStop(1, '#707070');
          h.fillStyle = hg; h.beginPath(); h.roundRect(px, py, pw, ph, 9); h.fill();
        }
        x += w;
      }
      y += rowH;
    }
    grain(c, n, rnd, 9000, 0.12, 2);
    grain(h, n, rnd, 6000, 0.25, 2);
    // lichen and wet streaks
    for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(${90 + rnd() * 40},${100 + rnd() * 30},60,${0.06 + rnd() * 0.08})`; c.beginPath(); c.arc(rnd() * n, rnd() * n, 6 + rnd() * 22, 0, 7); c.fill(); }
    return { map: tex(col, true), normalMap: tex(normalFrom(hgt, 3.2), false), size: 1.6, roughness: 0.92 };
  });
}

// vertical larch cladding, weathered, 1.4 m across (boards about 14 cm)
export function larch() {
  return once('larch', () => {
    const n = 512, rnd = mulberry32(8), col = canvas(n), hgt = canvas(n);
    const c = col.getContext('2d'), h = hgt.getContext('2d');
    const bw = n / 10;
    for (let i = 0; i < 10; i++) {
      const x = i * bw, t = rnd();
      const r = 120 + t * 40, g = 76 + t * 26, b = 44 + t * 16;
      c.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`; c.fillRect(x, 0, bw, n);
      // grain: long wavy streaks
      for (let k = 0; k < 26; k++) {
        const gx = x + rnd() * bw, dark = rnd() < 0.6;
        c.strokeStyle = dark ? `rgba(60,34,18,${0.12 + rnd() * 0.2})` : `rgba(255,220,170,${0.06 + rnd() * 0.1})`;
        c.lineWidth = 0.8 + rnd() * 1.8;
        c.beginPath(); c.moveTo(gx, 0);
        for (let yy = 0; yy <= n; yy += 32) c.lineTo(gx + Math.sin(yy * 0.02 + k) * 2.2, yy);
        c.stroke();
      }
      // a knot or two
      for (let k = 0; k < 2; k++) if (rnd() < 0.6) { const kx = x + 8 + rnd() * (bw - 16), ky = rnd() * n; c.fillStyle = 'rgba(55,30,15,0.55)'; c.beginPath(); c.ellipse(kx, ky, 3 + rnd() * 3, 5 + rnd() * 4, 0, 0, 7); c.fill(); }
      // silvered by the weather toward the bottom of some boards
      const sg = c.createLinearGradient(0, 0, 0, n); sg.addColorStop(0, 'rgba(160,160,160,0)'); sg.addColorStop(1, `rgba(150,150,150,${rnd() * 0.25})`);
      c.fillStyle = sg; c.fillRect(x, 0, bw, n);
      // the gap between boards
      c.fillStyle = 'rgba(25,14,8,0.85)'; c.fillRect(x, 0, 3, n);
      h.fillStyle = '#d8d8d8'; h.fillRect(x, 0, bw, n);
      h.fillStyle = '#303030'; h.fillRect(x, 0, 4, n);
      h.fillStyle = '#9a9a9a'; h.fillRect(x + 4, 0, 2, n); h.fillRect(x + bw - 2, 0, 2, n);
    }
    grain(h, n, rnd, 5000, 0.15, 2);
    return { map: tex(col, true), normalMap: tex(normalFrom(hgt, 2.4), false), size: 1.4, roughness: 0.86 };
  });
}

// white lime plaster, 3 m across
export function plaster() {
  return once('plaster', () => {
    const n = 512, rnd = mulberry32(11), col = canvas(n), hgt = canvas(n);
    const c = col.getContext('2d'), h = hgt.getContext('2d');
    c.fillStyle = '#ebe8e1'; c.fillRect(0, 0, n, n);
    h.fillStyle = '#808080'; h.fillRect(0, 0, n, n);
    for (let i = 0; i < 900; i++) { const v = 200 + rnd() * 55; c.fillStyle = `rgba(${v},${v - 4},${v - 10},0.08)`; c.beginPath(); c.arc(rnd() * n, rnd() * n, 4 + rnd() * 26, 0, 7); c.fill(); }
    grain(c, n, rnd, 12000, 0.05, 2);
    grain(h, n, rnd, 16000, 0.4, 2);
    return { map: tex(col, true), normalMap: tex(normalFrom(hgt, 1.2), false), size: 3, roughness: 0.9 };
  });
}

// standing-seam roof metal, dark, seams every 50 cm (along v)
export function roofMetal() {
  return once('roof', () => {
    const n = 256, rnd = mulberry32(13), col = canvas(n), hgt = canvas(n);
    const c = col.getContext('2d'), h = hgt.getContext('2d');
    c.fillStyle = '#3a3f46'; c.fillRect(0, 0, n, n);
    h.fillStyle = '#404040'; h.fillRect(0, 0, n, n);
    for (let i = 0; i < 4; i++) {
      const x = (i + 0.5) * n / 4;
      c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(x - 2, 0, 2, n);
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, 0, 2, n);
      h.fillStyle = '#f0f0f0'; h.fillRect(x - 3, 0, 6, n);
    }
    grain(c, n, rnd, 3000, 0.06, 2);
    return { map: tex(col, true), normalMap: tex(normalFrom(hgt, 2), false), size: 2, roughness: 0.45, metalness: 0.55 };
  });
}

// board-marked concrete, 3 m across
export function concrete() {
  return once('concrete', () => {
    const n = 512, rnd = mulberry32(17), col = canvas(n), hgt = canvas(n);
    const c = col.getContext('2d'), h = hgt.getContext('2d');
    c.fillStyle = '#9b9a95'; c.fillRect(0, 0, n, n);
    h.fillStyle = '#808080'; h.fillRect(0, 0, n, n);
    for (let y = 0; y < n; y += n / 8) { const v = rnd() < 0.5 ? 255 : 0; c.fillStyle = `rgba(${v},${v},${v},0.035)`; c.fillRect(0, y, n, n / 8); c.fillStyle = 'rgba(0,0,0,0.14)'; c.fillRect(0, y, n, 1.5); h.fillStyle = '#5a5a5a'; h.fillRect(0, y, n, 2); }
    for (let i = 0; i < 500; i++) { const v = rnd() * 255 | 0; c.fillStyle = `rgba(${v},${v},${v},0.05)`; c.beginPath(); c.arc(rnd() * n, rnd() * n, 3 + rnd() * 18, 0, 7); c.fill(); }
    // drip stains
    for (let i = 0; i < 14; i++) { const x = rnd() * n, g = c.createLinearGradient(0, 0, 0, n * 0.6); g.addColorStop(0, 'rgba(40,40,40,0.18)'); g.addColorStop(1, 'rgba(40,40,40,0)'); c.fillStyle = g; c.fillRect(x, 0, 3 + rnd() * 8, n * 0.6); }
    grain(c, n, rnd, 14000, 0.08, 2);
    grain(h, n, rnd, 9000, 0.3, 2);
    return { map: tex(col, true), normalMap: tex(normalFrom(hgt, 1.6), false), size: 3, roughness: 0.88 };
  });
}

// stone paving slabs, 2 m across
export function pavers() {
  return once('pavers', () => {
    const n = 512, rnd = mulberry32(19), col = canvas(n), hgt = canvas(n);
    const c = col.getContext('2d'), h = hgt.getContext('2d');
    c.fillStyle = '#4c4b48'; c.fillRect(0, 0, n, n);
    h.fillStyle = '#303030'; h.fillRect(0, 0, n, n);
    const s = n / 4;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const v = 128 + rnd() * 34;
      c.fillStyle = `rgb(${v | 0},${v - 3 | 0},${v - 8 | 0})`; c.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
      h.fillStyle = '#c8c8c8'; h.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
    }
    grain(c, n, rnd, 9000, 0.1, 2);
    // a dusting of snow in the joints
    for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(240,244,250,${0.2 + rnd() * 0.4})`; const a = rnd() < 0.5; const k = Math.floor(rnd() * 4) * s; c.fillRect(a ? k - 2 : rnd() * n, a ? rnd() * n : k - 2, a ? 5 : 3 + rnd() * 10, a ? 3 + rnd() * 10 : 5); }
    return { map: tex(col, true), normalMap: tex(normalFrom(hgt, 2), false), size: 2, roughness: 0.8 };
  });
}

// a standard material from one of the above, tinted by vertex colour
export function surface(kind, opts = {}) {
  const T = kind();
  return new THREE.MeshStandardMaterial({ map: T.map, normalMap: T.normalMap, normalScale: new THREE.Vector2(1, 1), roughness: T.roughness, metalness: T.metalness ?? 0, vertexColors: true, ...opts });
}

// texture coordinates in metres (/ size), along each face's own axis
export function boxUV(geo, size = 1) {
  const p = geo.attributes.position, nr = geo.attributes.normal, n = p.count;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const ax = Math.abs(nr.getX(i)), ay = Math.abs(nr.getY(i)), az = Math.abs(nr.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z * Math.sign(nr.getX(i) || 1); v = y; } else { u = -x * Math.sign(nr.getZ(i) || 1); v = y; }
    uv[i * 2] = u / size; uv[i * 2 + 1] = v / size;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
