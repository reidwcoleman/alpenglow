// Everything built by people: the chairlift, race gates, start house,
// finish arena and crowd, village chalets, piste markers, safety nets,
// plus rocks and terrain-park dressing.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildClinic, waveFlags, Kit } from './clinic.js';
import { tower, terminal, liftMaterials } from './liftworks.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { heightAt, centerX, halfWidth, GATES, KICKERS, LIFT, START_Z, FINISH_Z, SECTIONS, ZONES, slopeAt, MAP, JUMPS, RAILS, HOSPITAL } from './course.js';
import { mulberry32, makeSimplex, smoothstep } from './noise.js';
import { pbr } from './terrain.js';
import { crowd, bodies } from './people.js';
import { LO } from './gfx.js';
import { surface, stone, larch, roofMetal } from './proctex.js';

// rock: scanned rock (triplanar) worked over in the shader into bedded stone: a granite or
// limestone tint per rock, strata bands, the cracks and undercuts the geometry carries (aAO)
// darkened, lichen in patches on the bare faces, damp streaks down them, and snow lying on
// the ledges and tops (aSnow, from the geometry) broken up at its edges
function rockMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const u = {
    uRockC: { value: pbr('rock_face_04_c.webp', true) }, uRockN: { value: pbr('rock_face_04_n.webp', false) },
    uSnowC: { value: pbr('snow_02_c.webp', true) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAO; attribute float aSnow; varying vec3 vRW; varying vec3 vRN; varying vec3 vRL; varying vec3 vTint; varying float vAO; varying float vSnowA;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        mat4 rM = modelMatrix;
        #ifdef USE_INSTANCING
          rM = modelMatrix * instanceMatrix;
        #endif
        vRW = (rM * vec4(transformed, 1.0)).xyz;
        vRN = normalize(mat3(rM) * objectNormal);
        vRL = transformed;
        vAO = aAO; vSnowA = aSnow;
        {
          float th = fract(sin(dot(mod(rM[3].xz, 997.0), vec2(12.9898, 78.233))) * 43758.5453);
          // warm grey granite .. cold blue-grey .. pale limestone
          vTint = th < 0.4 ? mix(vec3(1.02, 0.97, 0.9), vec3(0.9, 0.86, 0.8), th / 0.4)
                : th < 0.75 ? mix(vec3(0.8, 0.82, 0.86), vec3(0.7, 0.72, 0.76), (th - 0.4) / 0.35)
                : mix(vec3(1.12, 1.08, 1.0), vec3(1.2, 1.15, 1.06), (th - 0.75) / 0.25);
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uRockC, uRockN, uSnowC; varying vec3 vRW; varying vec3 vRN; varying vec3 vRL; varying vec3 vTint; varying float vAO; varying float vSnowA; float rSnow; vec3 rW;
        float rkH(vec3 p) { p = mod(p, 289.0); return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float rkN(vec3 p) {
          vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(rkH(i), rkH(i + vec3(1, 0, 0)), f.x), mix(rkH(i + vec3(0, 1, 0)), rkH(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(rkH(i + vec3(0, 0, 1)), rkH(i + vec3(1, 0, 1)), f.x), mix(rkH(i + vec3(0, 1, 1)), rkH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 n = normalize(vRN);
          rW = pow(abs(n), vec3(4.0)); rW /= rW.x + rW.y + rW.z;
          vec3 q = vRW / 2.6;
          vec3 rc = texture2D(uRockC, q.zy).rgb * rW.x + texture2D(uRockC, q.xz).rgb * rW.y + texture2D(uRockC, q.xy).rgb * rW.z;
          float lum = dot(rc, vec3(0.3, 0.59, 0.11));
          vec3 base = mix(vec3(lum), rc, 0.55) * vTint;
          // the beds: bands of lighter and darker stone up the rock
          float sb = rkN(vec3(vRL.y * 7.0, vRL.x * 0.8, vRL.z * 0.8));
          base *= 0.8 + 0.34 * sb;
          // cracks and the shadowed undercut under each bed
          base *= 1.0 - clamp(vAO, 0.0, 1.0) * 0.62;
          float side = 1.0 - smoothstep(0.35, 0.8, n.y);
          #ifndef ROCK_LO
          // damp streaks running down the faces
          float st = rkN(vec3(vRW.x * 2.6, vRW.y * 0.22, vRW.z * 2.6));
          base *= 1.0 - smoothstep(0.55, 0.85, st) * 0.32 * side;
          // lichen: yellow-green and rust patches, crusts of black
          float ln = rkN(vRW * 3.4) * 0.55 + rkN(vRW * 11.0) * 0.45;
          float lich = smoothstep(0.64, 0.7, ln) * side * smoothstep(0.3, 0.6, rkN(vRW * 0.45 + 3.0));
          float lk = rkN(vRW * 0.6 + 7.0);
          vec3 lc = lk < 0.45 ? vec3(0.6, 0.62, 0.42) : lk < 0.75 ? vec3(0.7, 0.52, 0.3) : vec3(0.2, 0.2, 0.19);
          base = mix(base, lc * (0.6 + 0.6 * lum), lich * 0.45);
          #endif
          // snow on the ledges and tops (from the geometry), its edge broken up
          float sj = rkN(vRW * 2.3) - 0.5;
          rSnow = smoothstep(0.35, 0.7, vSnowA + sj * 0.5) * smoothstep(0.45, 0.75, n.y + sj * 0.25);
          vec3 sc = texture2D(uSnowC, vRW.xz / 3.1).rgb * 1.15;
          diffuseColor.rgb = mix(base * 1.05, sc, rSnow);
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.86, 0.62, rSnow);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 q = vRW / 2.6;
          vec2 tx = texture2D(uRockN, q.zy).xy * 2.0 - 1.0, ty = texture2D(uRockN, q.xz).xy * 2.0 - 1.0, tz = texture2D(uRockN, q.xy).xy * 2.0 - 1.0;
          vec3 rn = vec3(0.0, tx.y, tx.x) * rW.x + vec3(ty.x, 0.0, -ty.y) * rW.y + vec3(tz.x, tz.y, 0.0) * rW.z;
          vec3 nW = normalize(normalize(vRN) + rn * 1.3 * (1.0 - rSnow * 0.85));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`);
  };
  // (the phone setting skips the lichen and the streaks)
  if (LO) m.defines = { ROCK_LO: '' };
  m.customProgramCacheKey = () => 'rock2' + (LO ? 'lo' : '');
  return m;
}

// a rock's shape: a lumpy ball cut flat by fracture planes, stacked into beds that each stand
// out a little differently with a shadowed undercut beneath, split by vertical joints, then
// snow settled on whatever faces up. type 0 granite block, 1 bedded limestone, 2 cliff slab.
// Carries aAO (crack/undercut depth) and aSnow (how much snow lies there).
function rockShape(detail, type, seed) {
  const noise = makeSimplex(seed), rnd = mulberry32(seed * 7 + 3);
  const ico = new THREE.IcosahedronGeometry(1, detail);
  ico.deleteAttribute('normal'); ico.deleteAttribute('uv');
  const g = mergeVertices(ico);
  const p = g.attributes.position, n = p.count;
  const planes = [];
  const np = type === 0 ? 10 : 7;
  for (let k = 0; k < np; k++) {
    const a = rnd() * Math.PI * 2, el = (rnd() - 0.2) * (type === 0 ? 1.6 : 0.7);
    planes.push([new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)), 0.7 + rnd() * 0.22]);
  }
  // a flattish top
  planes.push([new THREE.Vector3((rnd() - 0.5) * 0.5, 1, (rnd() - 0.5) * 0.5).normalize(), type === 2 ? 0.55 : 0.74 + rnd() * 0.15]);
  const beds = [1.4, 3.0, 2.4][type], amp = [0.5, 1, 1.1][type], squash = [0.9, 0.66, 0.6][type];
  const bedOut = Array.from({ length: 64 }, () => rnd());
  const ao = new Float32Array(n), snow = new Float32Array(n);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(p, i);
    const r = 1 + noise(v.x * 1.1, v.y * 1.1 + v.z * 0.7) * 0.24 + noise(v.x * 2.7, v.z * 2.7 + v.y * 1.9) * 0.09;
    v.multiplyScalar(r);
    for (const [pn, d] of planes) { const s = v.dot(pn); if (s > d) v.addScaledVector(pn, -(s - d) * 0.94); }
    v.y *= squash;
    // beds: dipping a little, each standing proud or set back, undercut at its foot
    const t = (v.y + 1) * beds + v.x * 0.18 + noise(v.x * 0.9 + 3, v.z * 0.9) * 0.25;
    const f = Math.floor(t), fr = t - f;
    const out = 1 + ((bedOut[(f + 32) & 63] - 0.5) * 0.16 + noise(v.x * 1.7 + f * 3.1, v.z * 1.7) * 0.05) * amp;
    const notch = (1 - smoothstep(0, 0.2, fr)) * 0.085 * amp;
    // vertical joints
    const ang = Math.atan2(v.z, v.x);
    const jn = Math.abs(noise(Math.cos(ang) * 2.4 + seed, Math.sin(ang) * 2.4 + v.y * 0.5));
    const joint = 1 - smoothstep(0, 0.08, jn);
    const k = out - notch - joint * 0.07;
    v.x *= k; v.z *= k;
    ao[i] = (notch / 0.085) * 0.7 * Math.min(1, amp) + joint * 0.75;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // snow on what faces up, banked a little thicker there (then the normals again)
  const nr = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    const s = smoothstep(0.6, 0.9, nr.getY(i));
    snow[i] = s;
    p.setY(i, p.getY(i) + s * 0.05);
  }
  g.computeVertexNormals();
  g.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
  g.setAttribute('aSnow', new THREE.BufferAttribute(snow, 1));
  g.computeBoundingSphere();
  return g;
}

// ---------------- alpine buildings ----------------
// the materials the chalets share: rubble stone, larch boards, standing-seam metal, snow, dark
// timber and paint (vertex colour), icicles, and the lit windows
function hutMaterials(windowMat) {
  return {
    stone: surface(stone), larch: surface(larch), roof: surface(roofMetal),
    snow: new THREE.MeshStandardMaterial({ color: 0xf3f6fb, vertexColors: true, roughness: 0.74 }),
    wood: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.82 }),
    ice: new THREE.MeshStandardMaterial({ color: 0xdcecff, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.78, envMapIntensity: 1.8 }),
    window: windowMat,
  };
}

// the window glass: warm rooms behind four panes, curtains drawn back at the sides
function windowTex() {
  return canvasTex(128, 128, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ffe2a8'); g.addColorStop(0.55, '#e9a85c'); g.addColorStop(1, '#6b3f22');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // a lamp's pool, the curtains
    const r = c.createRadialGradient(w * 0.6, h * 0.35, 4, w * 0.6, h * 0.35, w * 0.5);
    r.addColorStop(0, 'rgba(255,245,215,0.9)'); r.addColorStop(1, 'rgba(255,245,215,0)');
    c.fillStyle = r; c.fillRect(0, 0, w, h);
    c.fillStyle = '#8a2f24'; c.fillRect(0, 0, 18, h); c.fillRect(w - 18, 0, 18, h);
    c.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 3; x < 18; x += 5) { c.fillRect(x, 0, 1.5, h); c.fillRect(w - x, 0, 1.5, h); }
    // the cross bars
    c.fillStyle = '#2a1a10'; c.fillRect(w / 2 - 4, 0, 8, h); c.fillRect(0, h / 2 - 4, w, 8);
    c.fillRect(0, 0, w, 5); c.fillRect(0, h - 5, w, 5); c.fillRect(0, 0, 5, h); c.fillRect(w - 5, 0, 5, h);
  });
}

// One chalet into the kit, in its own frame (ridge along z, gable ends facing +-z) then turned
// by yaw and set at (x, gy, z): a rubble-stone plinth dug into the slope, larch walls with dark
// corner posts, a standing-seam roof under a thick, rounded load of snow with a cornice off the
// eaves and icicles hanging from them, shuttered windows with snow on the sills, a balcony with
// board railings, the door, a stone chimney. o: { w, d, h, rh, wood, roof, shutter, rnd,
// plinth, balcony, start }
function chalet(K, wins, x, gy, z, yaw, o) {
  const { w, d, h, rh, rnd } = o;
  const P = o.plinth ?? 1.2;
  const put = (key, g, opts) => { g.rotateY(yaw); g.translate(x, gy, z); return K.add(key, g, opts); };
  const B = (sx, sy, sz, px, py, pz) => new THREE.BoxGeometry(sx, sy, sz).translate(px, py, pz);
  const RB = (sx, sy, sz, r, px, py, pz) => new RoundedBoxGeometry(sx, sy, sz, 2, r).translate(px, py, pz);
  const DARK = 0x3a2416;
  // plinth, walls, the gable ends up to the ridge
  put('stone', B(w + 0.3, P + 3, d + 0.3, 0, (P - 3) / 2, 0), { tint: 0xd8d2c8, size: 1.6 });
  put('larch', B(w, h, d, 0, P + h / 2, 0), { tint: o.wood, size: 1.4 });
  const tri = new THREE.Shape();
  tri.moveTo(-w / 2, 0); tri.lineTo(0, rh); tri.lineTo(w / 2, 0); tri.lineTo(-w / 2, 0);
  put('larch', new THREE.ExtrudeGeometry(tri, { depth: d, bevelEnabled: false }).translate(0, P + h, -d / 2), { tint: o.wood, size: 1.4 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put('wood', B(0.3, h + 0.1, 0.3, sx * (w / 2 - 0.1), P + h / 2, sz * (d / 2 - 0.1)), { tint: DARK });
  put('wood', B(w + 0.12, 0.22, d + 0.12, 0, P + 0.11, 0), { tint: DARK });
  if (h > 5.4) put('wood', B(w + 0.12, 0.2, d + 0.12, 0, P + h * 0.52, 0), { tint: DARK });
  // the roof: two standing-seam planes (seams running down the slope), then the snow on them
  const oh = 0.9, ohz = 0.8, a = Math.atan2(rh, w / 2), run = w / 2 + oh, L = run / Math.cos(a) + 0.1;
  const top = P + h + rh, eaveY = top - run * Math.tan(a);
  const snowT = 0.38 + rnd() * 0.3;
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(L, 0.16, d + ohz * 2);
    const pp = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pp.count; i++) uv.setXY(i, pp.getZ(i) / 2, pp.getX(i) / 2);
    g.rotateZ(-s * a).translate(s * run / 2, top - (run / 2) * Math.tan(a) + 0.12, 0);
    put('roof', g, { tint: o.roof, uv: true });
    // the fascia board under the eave
    put('wood', B(0.08, 0.3, d + ohz * 2, s * (run + 0.02), eaveY - 0.05, 0), { tint: DARK });
    // the load of snow, thick and rounded, a little short of the eave, then the cornice curling off it
    const sn = RB(L - 0.25, snowT, d + ohz * 2 - 0.1, Math.min(0.16, snowT / 2.2), 0, 0, 0);
    sn.rotateZ(-s * a).translate(s * (run / 2 - 0.1), top - (run / 2 - 0.1) * Math.tan(a) + 0.2 + snowT / 2 / Math.cos(a), 0);
    put('snow', sn);
    const cor = new THREE.CylinderGeometry(snowT * 0.55, snowT * 0.5, d + ohz * 2 - 0.3, 10, 1).rotateX(Math.PI / 2).scale(1, 0.75, 1);
    cor.translate(s * (run - 0.12), eaveY + 0.14 + snowT * 0.35, 0);
    put('snow', cor);
    // icicles off the eave, long and short
    for (let zz = -d / 2 - ohz + 0.2; zz < d / 2 + ohz - 0.2; zz += 0.16 + rnd() * 0.3) {
      if (rnd() < 0.25) continue;
      const len = 0.12 + Math.pow(rnd(), 2) * (o.start ? 0.5 : 1.0), r = 0.03 + len * 0.05;
      put('ice', new THREE.ConeGeometry(r, len, 5, 1).rotateX(Math.PI).translate(s * (run - 0.05), eaveY - 0.08 - len / 2, zz));
    }
  }
  // the ridge: snow heaped along it
  put('snow', new THREE.CylinderGeometry(snowT * 0.9, snowT * 0.9, d + ohz * 2 - 0.1, 10, 1).rotateX(Math.PI / 2).scale(1.2, 0.6, 1).translate(0, top + 0.16 + snowT * 0.6, 0));
  // the gable trim: barge boards along both roof edges at each end
  for (const sz of [-1, 1]) for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(L, 0.32, 0.08);
    g.rotateZ(-s * a).translate(s * run / 2, top - (run / 2) * Math.tan(a) + 0.02, sz * (d / 2 + ohz));
    put('wood', g, { tint: DARK });
  }
  // windows: a frame, the lit glass, painted shutters, a sill with snow on it
  const win = (u, y, face, ww = 1.0, wh = 1.2, shut = true) => {
    // face: 0 +z, 1 -z, 2 +x, 3 -x; u along the wall
    const turn = [0, Math.PI, Math.PI / 2, -Math.PI / 2][face];
    const depth = face < 2 ? d / 2 : w / 2;
    const parts = [];
    parts.push(['wood', B(ww + 0.22, wh + 0.22, 0.1, u, y, depth + 0.03), DARK]);
    parts.push(['wood', B(ww + 0.4, 0.07, 0.3, u, y - wh / 2 - 0.13, depth + 0.12), DARK]);
    parts.push(['snow', RB(ww + 0.32, 0.12, 0.24, 0.05, u, y - wh / 2 - 0.05, depth + 0.13), 0xffffff]);
    if (shut) for (const sd of [-1, 1]) {
      parts.push(['wood', B(ww * 0.55, wh + 0.1, 0.05, u + sd * (ww * 0.5 + 0.11 + ww * 0.275), y, depth + 0.05), o.shutter]);
      parts.push(['snow', RB(ww * 0.55, 0.06, 0.08, 0.02, u + sd * (ww * 0.5 + 0.11 + ww * 0.275), y + wh / 2 + 0.08, depth + 0.05), 0xffffff]);
    }
    for (const [k, g, t] of parts) { g.rotateY(turn); put(k, g, { tint: t }); }
    const gl = new THREE.PlaneGeometry(ww, wh).translate(u, y, depth + 0.085).rotateY(turn);
    gl.rotateY(yaw); gl.translate(x, gy, z);
    wins.push(gl);
  };
  const floors = h > 5.4 ? 2 : 1;
  if (o.start) {
    for (let k = 0; k < 4; k++) win(-w / 2 + 1.6 + k * ((w - 3.2) / 3), P + 1.25, 0, 1.3, 0.9, false);
    win(-1.2, P + 1.6, 1, 1.0, 1.0); win(1.2, P + 1.6, 1, 1.0, 1.0);
  } else {
    for (let f = 0; f < floors; f++) {
      const y = P + 1.55 + f * (h / floors);
      for (const face of [0, 1]) {
        const n = Math.max(1, Math.floor((w - 1.4) / 2.6));
        for (let k = 0; k < n; k++) {
          const u = -((n - 1) * 2.6) / 2 + k * 2.6;
          if (f === 0 && face === 0 && k === Math.floor(n / 2)) continue; // the door goes there
          if (rnd() < 0.15) continue;
          win(u, y, face);
        }
      }
      for (const face of [2, 3]) {
        const n = Math.max(1, Math.floor((d - 1.6) / 3.2));
        for (let k = 0; k < n; k++) if (rnd() < 0.75) win(-((n - 1) * 3.2) / 2 + k * 3.2, y, face);
      }
    }
    // a small window up in each gable
    for (const face of [0, 1]) win(0, P + h + rh * 0.38, face, 0.8, 0.9, false);
    // the door, its little roof
    const dx = (() => { const n = Math.max(1, Math.floor((w - 1.4) / 2.6)); return -((n - 1) * 2.6) / 2 + Math.floor(n / 2) * 2.6; })();
    put('wood', B(1.15, 2.1, 0.12, dx, P + 1.05, d / 2 + 0.04), { tint: 0x5a3520 });
    put('wood', B(1.4, 2.25, 0.08, dx, P + 1.1, d / 2 + 0.01), { tint: DARK });
    put('stone', B(1.8, P + 0.1, 0.6, dx, (P + 0.1) / 2 - 0.05, d / 2 + 0.3), { tint: 0xcfc8bc, size: 1.6 });
    // the balcony across the front, upstairs: deck, brackets, board railings, snow on it all
    if (o.balcony && floors === 2) {
      const by = P + h / 2 + 0.05, bw = w * 0.82, bd = 1.3;
      put('wood', B(bw, 0.16, bd, 0, by, d / 2 + bd / 2), { tint: 0x4a2e1b });
      put('snow', RB(bw - 0.1, 0.14, bd - 0.25, 0.06, 0, by + 0.13, d / 2 + bd / 2 - 0.05));
      for (const sx of [-0.45, 0, 0.45]) {
        const br = new THREE.BoxGeometry(0.14, 0.14, 1.5).rotateX(-0.75).translate(sx * bw, by - 0.55, d / 2 + 0.5);
        put('wood', br, { tint: DARK });
      }
      put('wood', B(bw, 0.1, 0.12, 0, by + 1.0, d / 2 + bd - 0.06), { tint: DARK });
      put('snow', RB(bw, 0.12, 0.16, 0.05, 0, by + 1.1, d / 2 + bd - 0.06));
      for (let sx = -bw / 2 + 0.1; sx <= bw / 2 - 0.05; sx += 0.2) put('larch', B(0.14, 0.92, 0.04, sx, by + 0.52, d / 2 + bd - 0.06), { tint: o.wood, size: 1.4 });
      for (const sx of [-1, 1]) for (let zz = 0.15; zz < bd; zz += 0.2) put('larch', B(0.04, 0.92, 0.14, sx * bw / 2, by + 0.52, d / 2 + zz), { tint: o.wood, size: 1.4 });
    }
    // the chimney through the roof, snow on its cap
    const cx = w * 0.22, cz = -d * 0.2, ch = P + h + rh * (1 - (cx / (w / 2))) + 1.1;
    put('stone', B(0.85, ch - P - h + 0.4, 0.85, cx, (ch + P + h - 0.4) / 2, cz), { tint: 0xc8c0b4, size: 1.6 });
    put('wood', B(1.05, 0.12, 1.05, cx, ch + 0.06, cz), { tint: 0x2a2a2a });
    put('snow', RB(1.0, 0.22, 1.0, 0.08, cx, ch + 0.22, cz));
    // firewood stacked under the eave on one side
    if (rnd() < 0.7) {
      const sx = (rnd() < 0.5 ? -1 : 1) * (w / 2 + 0.35);
      for (let r = 0; r < 6; r++) for (let k = 0; k < 9; k++) {
        const lg = new THREE.CylinderGeometry(0.11, 0.11, 0.6, 6).rotateZ(Math.PI / 2).translate(sx, 0.11 + r * 0.21, -1.0 + k * 0.23 + (r % 2) * 0.1);
        put('wood', lg, { tint: [0x8a6a4a, 0x7a5a3c, 0x9a7a58][(r + k) % 3] });
      }
      put('snow', RB(0.7, 0.12, 2.2, 0.05, sx, 1.42, 0));
    }
  }
}
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function colorize(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
// snow on upward faces
function snowCap(geo, base, thresh = 0.55) {
  const c = new THREE.Color(base), s = new THREE.Color(0xf2f5fb);
  const n = geo.attributes.normal, cnt = n.count;
  const a = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) {
    const k = smoothstep(thresh, thresh + 0.2, n.getY(i));
    a[i * 3] = c.r + (s.r - c.r) * k; a[i * 3 + 1] = c.g + (s.g - c.g) * k; a[i * 3 + 2] = c.b + (s.b - c.b) * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
function nonIndexed(g) { return g.index ? g.toNonIndexed() : g; }
function merge(list) {
  return mergeGeometries(list.map((g) => {
    g = nonIndexed(g);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    return g;
  }), false);
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// a run's difficulty from its name: blue, red or black
export function trailDiff(n) {
  if (/^(Drop In|Finish|Village)$/.test(n)) return 'blue';
  return /Wall|Glacier|Chute|Couloir|Face|Cornice|Steep|Drop|Pillow|Mega|Big Air|XXL|Gap/.test(n) ? 'black'
    : /Start|Drop In|Village|Run-out|Green|Flats|Cat|Long Road|Road|Inrun|Finish/.test(n) ? 'blue' : 'red';
}

export class Props {
  constructor(scene, forest, env, smash) {
    this.scene = scene;
    this.forest = forest;
    this.smash = smash;
    this.rnd = mulberry32(555);
    this.vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    this.metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.7 });
    this.windowMat = new THREE.MeshStandardMaterial({ color: 0x1a1410, emissive: 0xffb45a, emissiveIntensity: 1.2, roughness: 0.3 });
    this.hutKit = new Kit(); this.hutWins = [];
    this.buildLift();
    this.buildGates();
    this.buildStart();
    this.buildFinish();
    this.buildHospital();
    this.buildVillage();
    this.finishHuts();
    this.buildMarkers();
    this.buildNets();
    this.buildRocks();
    this.buildFences();
    this.buildPark();
    this.buildSnowGuns();
    this.buildCats();
    this.buildSigns();
    this.buildSnowNames();
  }

  // ---------------- grooming machines ----------------
  // piste groomers parked off the snow by the lift stations: wide rubber-and-steel tracks with
  // their cleats, the red body and cab with dark glass, the blade out front, the tiller and its
  // comb behind, a beacon and work lights on the roof, snow lying on the cab and the hood
  buildCats() {
    const P = [];
    const C = (g, c, x, y, z) => { g.translate(x, y, z); P.push(colorize(g, c)); };
    const red = 0xc8302a, dark = 0x1d1f24, steel = 0xb4b9c0, glass = 0x2a3a48, snow = 0xf2f5fb;
    for (const sx of [-1.3, 1.3]) {
      C(new RoundedBoxGeometry(0.95, 0.95, 5.0, 3, 0.4), dark, sx, 0.48, 0);
      for (let k = 0; k < 20; k++) C(new THREE.BoxGeometry(1.0, 0.05, 0.08), 0x6b7078, sx, 0.97, -2.2 + k * 0.23);
      for (const z of [-2.0, -0.7, 0.6, 1.9]) C(new THREE.CylinderGeometry(0.3, 0.3, 0.98, 12).rotateZ(Math.PI / 2), 0x3a3e45, sx, 0.42, z);
    }
    C(new THREE.BoxGeometry(1.7, 0.6, 4.4), red, 0, 1.05, 0);
    C(new RoundedBoxGeometry(3.4, 0.5, 2.0, 2, 0.1), red, 0, 1.5, -1.3);
    C(new RoundedBoxGeometry(2.2, 0.9, 1.4, 2, 0.12), red, 0, 2.15, -1.25);
    // the cab: frame, then the glass set into it
    C(new RoundedBoxGeometry(2.1, 1.55, 2.0, 3, 0.12), red, 0, 2.35, 0.75);
    C(new THREE.BoxGeometry(1.9, 0.95, 0.06), glass, 0, 2.5, 1.76);
    for (const sx of [-1, 1]) C(new THREE.BoxGeometry(0.06, 0.85, 1.6), glass, sx * 1.06, 2.5, 0.75);
    C(new THREE.BoxGeometry(1.7, 0.8, 0.06), glass, 0, 2.5, -0.26);
    // roof: snow, the beacon, a bar of work lights
    C(new RoundedBoxGeometry(2.0, 0.18, 1.9, 2, 0.08), snow, 0, 3.18, 0.75);
    C(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 10), 0xff8a1a, -0.6, 3.36, 0.4);
    C(new THREE.BoxGeometry(1.4, 0.12, 0.14), dark, 0.2, 3.3, 1.55);
    for (const lx of [-0.35, 0.15, 0.65]) C(new THREE.BoxGeometry(0.22, 0.14, 0.04), 0xfff3d0, lx, 3.3, 1.63);
    C(new RoundedBoxGeometry(2.1, 0.14, 1.3, 2, 0.06), snow, 0, 2.66, -1.25);
    // the blade on its push arms, its cutting edge, the corner wings
    for (const sx of [-0.9, 0.9]) C(new THREE.BoxGeometry(0.16, 0.18, 1.6), steel, sx, 0.75, 2.85);
    // (a curved mouldboard: three strips bending back toward the top)
    C(new THREE.BoxGeometry(4.6, 0.5, 0.1).rotateX(-0.45), 0xe0e2e5, 0, 0.32, 3.86);
    C(new THREE.BoxGeometry(4.6, 0.5, 0.1), 0xe0e2e5, 0, 0.78, 3.72);
    C(new THREE.BoxGeometry(4.6, 0.45, 0.1).rotateX(0.5), 0xe0e2e5, 0, 1.2, 3.62);
    C(new THREE.BoxGeometry(4.6, 0.08, 0.22), dark, 0, 0.06, 3.98);
    C(new THREE.BoxGeometry(4.0, 0.14, 0.4), steel, 0, 0.8, 3.45);
    for (const sx of [-1, 1]) C(new THREE.BoxGeometry(0.08, 1.3, 0.7).rotateY(sx * 0.35), 0xe0e2e5, sx * 2.38, 0.68, 3.65);
    // the tiller and its comb, a little snow on the housing
    for (const sx of [-0.7, 0.7]) C(new THREE.BoxGeometry(0.14, 0.16, 1.4), steel, sx, 0.85, -2.9);
    C(new THREE.CylinderGeometry(0.5, 0.5, 4.4, 16).rotateZ(Math.PI / 2), 0x3a3e45, 0, 0.55, -3.7);
    C(new THREE.BoxGeometry(4.4, 0.12, 0.6), red, 0, 1.0, -3.7);
    C(new THREE.BoxGeometry(4.4, 0.05, 1.0).rotateX(0.12), 0x2a2c30, 0, 0.1, -4.4);
    C(new RoundedBoxGeometry(4.2, 0.1, 0.5, 2, 0.04), snow, 0, 1.1, -3.7);
    const geo = merge(P);
    const spots = [];
    // how it would sit there: nose down / side up from the ground under its tracks
    const sit = (x, z, yaw) => {
      const fx = Math.sin(yaw) * 2.4, fz = Math.cos(yaw) * 2.4, sx = Math.cos(yaw) * 1.4, sz = -Math.sin(yaw) * 1.4;
      return [Math.atan2(heightAt(x - fx, z - fz) - heightAt(x + fx, z + fz), 4.8), Math.atan2(heightAt(x - sx, z - sz) - heightAt(x + sx, z + sz), 2.8),
        Math.max(heightAt(x, z), (heightAt(x + fx, z + fz) + heightAt(x - fx, z - fz)) / 2)];
    };
    const flat = (x, z, yaw) => { const [p, r] = sit(x, z, yaw); return Math.abs(p) < 0.14 && Math.abs(r) < 0.1; };
    const yawL = Math.atan2(LIFT.x1 - LIFT.x0, LIFT.z1 - LIFT.z0);
    const dx = Math.cos(yawL), dz = -Math.sin(yawL);
    // beside each lift terminal, nose toward the line; one parked up near the start house
    // (side by side, parked along the line on whichever side is off the piste)
    for (const [bx, bz] of [[LIFT.x0, LIFT.z0], [LIFT.x1, LIFT.z1]]) {
      const got = [];
      for (let k = 15; k < 60 && got.length < 2; k += 1) for (let a = 0; a < 24 && got.length < 2; a++) {
        const an = (a / 24) * Math.PI * 2, x = bx + Math.cos(an) * k, z = bz + Math.sin(an) * k;
        const yaw = yawL + Math.PI + (a % 2 ? 0.15 : -0.1);
        // (off the piste, clear of the station and the line, not on top of the other one)
        const along = (x - bx) * Math.sin(yawL) + (z - bz) * Math.cos(yawL), across = (x - bx) * dx + (z - bz) * dz;
        if (Math.abs(across) < 9 && along > -20 && along < 30) continue;
        if (Math.abs(x - centerX(z)) < halfWidth(z) + 14 || !flat(x, z, yaw)) continue;
        if (got.some((g) => Math.hypot(g[0] - x, g[1] - z) < 6)) continue;
        got.push([x, z, yaw]);
      }
      spots.push(...got);
    }
    { const z = START_Z + 4, x = centerX(z) + halfWidth(z) + 12; spots.push([x, z, Math.PI * 0.8]); }
    const ok = spots.filter(([x, z, yaw]) => flat(x, z, yaw));
    if (!ok.length) return;
    const im = new THREE.InstancedMesh(geo, this.vc, ok.length);
    const e = new THREE.Euler();
    ok.forEach(([x, z, yaw], i) => {
      const [pitch, roll, gy] = sit(x, z, yaw);
      tmpM.compose(tmpP.set(x, gy - 0.12, z), tmpQ.setFromEuler(e.set(pitch, yaw, -roll, 'YXZ')), tmpS.set(1, 1, 1));
      im.setMatrixAt(i, tmpM);
      // as solid as it looks: the cab in the middle and both ends
      for (const k of [-1.1, 0, 1.1]) this.forest.addCollider(x + Math.sin(yaw) * k * 2.2, z + Math.cos(yaw) * k * 2.2, 2.2, 'station');
    });
    im.castShadow = true; im.receiveShadow = true;
    im.computeBoundingSphere();
    this.scene.add(im);
  }

  // ---------------- snowmaking ----------------
  // fan guns on short towers along the piste edge, aimed across the run
  buildSnowGuns() {
    const yellow = 0xf2c419, grey = 0x3a3e46, dark = 0x16181d;
    const housing = colorize(new THREE.CylinderGeometry(0.52, 0.56, 1.15, 20, 1, false).rotateX(Math.PI / 2), yellow);
    const ring = colorize(new THREE.TorusGeometry(0.5, 0.06, 8, 24).translate(0, 0, 0.6), dark);
    const grill = colorize(new THREE.CylinderGeometry(0.47, 0.47, 0.02, 20).rotateX(Math.PI / 2).translate(0, 0, 0.6), 0x2a2d33);
    const back = colorize(new THREE.CylinderGeometry(0.3, 0.45, 0.35, 16).rotateX(Math.PI / 2).translate(0, 0, -0.72), grey);
    const head = merge([housing, ring, grill, back]);
    // tilt the barrel up and lift it onto the yoke
    head.rotateX(-0.42); head.translate(0, 3.25, 0);
    const tower = colorize(new THREE.CylinderGeometry(0.09, 0.12, 3.0, 8).translate(0, 1.5, 0), grey);
    const yoke = colorize(new THREE.BoxGeometry(0.16, 0.5, 0.16).translate(0, 3.0, 0), grey);
    const base = colorize(new THREE.BoxGeometry(1.1, 0.25, 0.9).translate(0, 0.12, 0), grey);
    const box = colorize(new THREE.BoxGeometry(0.4, 0.55, 0.3).translate(0.45, 0.6, 0), 0xc7c9cc);
    const hydrant = colorize(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 8).translate(-0.9, 0.45, 0.4), 0xd23a2a);
    const geo = merge([head, tower, yoke, base, box, hydrant]);
    const list = [];
    let side = 1;
    for (let z = START_Z + 40; z < FINISH_Z - 140; z += 150) {
      const hw = halfWidth(z);
      let dx = side * (hw + 4.2);
      const blocked = (d) => JUMPS.some((J) => z > J.z - 12 && z < J.z + J.len + 8 && Math.abs(d - J.dx) < J.w / 2 + 6)
        || RAILS.some((R) => z > R.z - 8 && z < R.z + R.len + 6 && Math.abs(d - R.dx) < 6);
      if (blocked(dx)) dx = -dx;
      side = -side;
      if (blocked(dx)) continue;
      const x = centerX(z) + dx;
      // pointed back across the run, a little down the hill
      list.push([x, z, Math.atan2(-Math.sign(dx) * 0.9, 0.45)]);
    }
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 }), list.length);
    list.forEach((p, i) => {
      tmpM.compose(tmpP.set(p[0], heightAt(p[0], p[1]) - 0.1, p[1]), tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p[2]), tmpS.set(1, 1, 1));
      im.setMatrixAt(i, tmpM);
    });
    im.castShadow = true;
    this.scene.add(im);
    for (const p of list) this.forest.addCollider(p[0], p[1], 0.7, 'pole');
  }

  // the name of each part of the run sprayed on the snow in piste-marker dye, stretched long
  // so it reads from a skier's eye height as you ride onto it
  buildSnowNames() {
    let z0 = START_Z;
    for (const Z of ZONES) {
      const za = z0; z0 = Z.z1;
      // (not at the very top: the start is right on it and it reads as a slab)
      if (Z.name === 'Finish' || za > FINISH_Z - 80 || za < START_Z + 60) continue;
      const hw = halfWidth(za + 20);
      const W = Math.min(hw * 0.75, 15), L = W * 0.25 * 7;
      // somewhere clear of jumps and rails, near the top of it
      let z = Math.max(za, START_Z + 4) + 16;
      const busy = (zz) => [...JUMPS, ...RAILS].some((f) => f.z + (f.len ?? f.L ?? 10) + 8 > zz - L / 2 && f.z - 12 < zz + L / 2 && Math.abs(f.dx ?? 0) < W / 2 + 4);
      for (let k = 0; k < 8 && busy(z); k++) z += 12;
      if (busy(z) || z > Z.z1 - L) continue;
      const d = trailDiff(Z.name);
      const col = d === 'blue' ? '#2a5fe0' : d === 'red' ? '#e0393e' : '#2a2f3a';
      const tex = canvasTex(1024, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = col;
        let fs = 150, t = Z.name.toUpperCase();
        g.font = `900 ${fs}px Helvetica, Arial`;
        while (g.measureText(t).width > w - 210 && fs > 70) { fs -= 6; g.font = `900 ${fs}px Helvetica, Arial`; }
        const tw = g.measureText(t).width, x0 = (w - tw - 170) / 2;
        // the difficulty symbol, then the name
        g.save(); g.translate(x0 + 70, h / 2);
        if (d === 'blue') { g.beginPath(); g.arc(0, 0, 62, 0, Math.PI * 2); g.fill(); }
        else if (d === 'red') g.fillRect(-56, -56, 112, 112);
        else { g.rotate(Math.PI / 4); g.fillRect(-50, -50, 100, 100); }
        g.restore();
        g.textBaseline = 'middle';
        g.fillText(t, x0 + 170, h / 2 + 8);
        // sprayed dye: soft speckled edges where the snow shows through
        g.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 1800; i++) { g.globalAlpha = Math.random() * 0.4; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      });
      const NX = 24, NZ = 24, pos = [], uv = [], idx = [];
      for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
        const u = i / NX, v = j / NZ;
        const zz = z - L / 2 + v * L;
        // (it follows the piste's curve; looking down the hill, screen right is -x)
        const x = centerX(zz) + W / 2 - u * W;
        pos.push(x, heightAt(x, zz) + 0.14, zz);
        uv.push(u, v);
      }
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i;
        // (x runs right to left, so this winding faces up)
        idx.push(a, a + 1, a + NX + 1, a + 1, a + NX + 2, a + NX + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0.72, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      m.receiveShadow = true;
      m.renderOrder = 1;
      this.scene.add(m);
    }
  }

  // trail signs at the top of every section: name and difficulty
  buildSigns() {
    const diff = trailDiff;
    const post = colorize(new THREE.CylinderGeometry(0.06, 0.07, 2.4, 8).translate(0, 1.2, 0), 0x5b3d24);
    const postM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    // the post, the board's timber and its cap of snow in one; the painted face on the front
    const frame = merge([post, colorize(new THREE.BoxGeometry(2.6, 0.81, 0.06), 0x5b3d24).translate(0, 2.0, 0.06), colorize(new THREE.BoxGeometry(2.62, 0.05, 0.1), 0xf4f6fb).translate(0, 2.43, 0.06)]);
    const face = new THREE.PlaneGeometry(2.6, 0.81).translate(0, 2.0, 0.092);
    for (const sec of SECTIONS) {
      const z = Math.max(sec.z0 + 6, START_Z + 12);
      if (z > FINISH_Z - 60) continue;
      const d = diff(sec.name);
      const tex = canvasTex(512, 160, (g, w, h) => {
        g.fillStyle = '#f3efe4'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#5b3d24'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
        // the difficulty symbol: blue circle, red square, black diamond
        g.fillStyle = d === 'blue' ? '#1f5fd0' : d === 'red' ? '#d42a2a' : '#111';
        g.save(); g.translate(78, h / 2);
        if (d === 'blue') { g.beginPath(); g.arc(0, 0, 44, 0, Math.PI * 2); g.fill(); }
        else if (d === 'red') g.fillRect(-40, -40, 80, 80);
        else { g.rotate(Math.PI / 4); g.fillRect(-36, -36, 72, 72); }
        g.restore();
        g.fillStyle = '#1b1d22'; g.font = 'bold 58px Helvetica, Arial'; g.textBaseline = 'middle';
        let t = sec.name.toUpperCase(), fs = 58;
        while (g.measureText(t).width > w - 160 && fs > 30) { fs -= 4; g.font = `bold ${fs}px Helvetica, Arial`; }
        g.fillText(t, 140, h / 2 + 3);
      });
      const hw = halfWidth(z);
      const faceM = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
      for (const s of [-1, 1]) {
        const x = centerX(z) + s * (hw + 2.4);
        const y = heightAt(x, z);
        const grp = new THREE.Group();
        grp.position.set(x, y - 0.15, z);
        const p = new THREE.Mesh(frame, postM); p.castShadow = true; grp.add(p);
        grp.add(new THREE.Mesh(face, faceM));
        // face the riders coming down, turned a little in toward the run
        grp.rotation.y = Math.PI + s * 0.35;
        this.scene.add(grp);
        this.smash?.add(x, z, 0.45, [grp], { h: 2.5, slow: 0.08, kind: 'sign' });
      }
    }
  }

  // ---------------- chairlift ----------------
  buildLift() {
    const { x0, z0, x1, z1 } = LIFT;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const at = (t) => [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t];
    const H = 11;
    const top = (t) => { const [x, z] = at(t); return heightAt(x, z) + H; };
    const onPiste = (t) => { const [x, z] = at(t); return Math.abs(x - centerX(z)) < halfWidth(z) + 4; };
    const towers = [0, 1];
    const split = (a, b, depth) => {
      if (depth > 12) return;
      const ya = top(a), yb = top(b);
      let worst = 0, wt = -1;
      const n = Math.max(4, Math.ceil(((b - a) * len) / 5));
      for (let i = 1; i < n; i++) {
        const t = a + ((b - a) * i) / n;
        const [x, z] = at(t);
        const cy = ya + (yb - ya) * (i / n);
        const clear = cy - heightAt(x, z);
        if (7 - clear > worst) { worst = 7 - clear; wt = t; }
      }
      if (wt < 0 && (b - a) * len > 230) wt = (a + b) / 2;
      if (wt < 0) return;
      // nudge the tower off the piste
      for (let d = 0; d < 0.05 && onPiste(wt); d += 0.002) {
        if (!onPiste(wt + d)) { wt += d; break; }
        if (!onPiste(wt - d)) { wt -= d; break; }
      }
      if (wt - a < 0.004 || b - wt < 0.004) return;
      towers.push(wt);
      split(a, wt, depth + 1); split(wt, b, depth + 1);
    };
    split(0, 1, 0);
    towers.sort((a, b) => a - b);
    const dir = new THREE.Vector3(x1 - x0, 0, z1 - z0).normalize();
    const side = new THREE.Vector3().crossVectors(UP, dir).normalize();
    // the steelwork and both terminals (liftworks.js), one mesh per material
    const LK = new Kit();
    const lq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.liftPoints = [];
    let towerNo = 0;
    for (const t of towers) {
      const [x, z] = at(t);
      const gy = heightAt(x, z);
      if (t !== 0 && t !== 1) {
        tower(LK, H, lq, new THREE.Vector3(x, gy, z), ++towerNo);
        this.forest.addCollider(x, z, 0.6, 'tower');
      }
      this.liftPoints.push(new THREE.Vector3(x, gy + H + 0.3, z));
    }
    const signs = [];
    for (const t of [0, 1]) {
      const [x, z] = at(t);
      const gy = heightAt(x, z);
      const back = t === 0 ? -1 : 1; // the bullwheel end
      terminal(LK, H, lq, new THREE.Vector3(x, gy, z), back);
      this.forest.addCollider(x, z, 7, 'station');
      // the lift's name along the canopy
      signs.push({ x, y: gy + H + 2.25, z, back });
    }
    const liftTex = canvasTex(1024, 128, (c, w, h) => {
      c.fillStyle = '#1f5a9e'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff'; c.font = 'bold 74px Helvetica, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('SHREDLINE EXPRESS', w / 2, h / 2 + 4);
      c.fillStyle = '#ff8a3d'; c.fillRect(0, h - 10, w, 10);
    });
    const liftSignM = new THREE.MeshStandardMaterial({ map: liftTex, roughness: 0.5, emissive: 0xffffff, emissiveMap: liftTex, emissiveIntensity: 0.15 });
    for (const sg of signs) for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.25), liftSignM);
      m.position.set(s * 4.95, 0, sg.back * 4.5).applyQuaternion(lq).add(new THREE.Vector3(sg.x, sg.y, sg.z));
      m.quaternion.copy(lq).multiply(new THREE.Quaternion().setFromAxisAngle(UP, s * Math.PI / 2));
      this.scene.add(m);
    }
    LK.build(liftMaterials(), this.scene);

    // cables (up and down lines)
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.5, metalness: 0.8 });
    const cables = [];
    this.cableLines = [[], []];
    for (const [li, off] of [[0, 2.4], [1, -2.4]]) {
      const tops = this.liftPoints.map((p) => p.clone().addScaledVector(side, off));
      // the rope sags between towers (a parabola, about 2% of the span)
      const pts = [tops[0]];
      for (let i = 0; i < tops.length - 1; i++) {
        const a = tops[i], b = tops[i + 1], L = a.distanceTo(b), n = Math.max(2, Math.ceil(L / 12));
        for (let k = 1; k <= n; k++) { const t = k / n; pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -4 * t * (1 - t) * Math.min(3, L * 0.02), 0))); }
      }
      this.cableLines[li] = pts;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const l = a.distanceTo(b);
        const g = new THREE.CylinderGeometry(0.035, 0.035, l, 5, 1, true);
        g.applyQuaternion(tmpQ.setFromUnitVectors(UP, tmpP.subVectors(b, a).normalize()));
        g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        cables.push(g);
      }
    }
    this.scene.add(new THREE.Mesh(mergeGeometries(cables.map((g) => { g.deleteAttribute('uv'); return g; })), cableMat));

    // chairs: a detachable grip on the rope, a tube hanger curving down behind the back, four
    // padded seats with backs, tube armrests and the safety bar up with its footrest
    const steelC = 0x9ea5b0, frameC = 0x3a3f46, pad = 0x1f5fa8, padD = 0x173f72;
    const cp = [];
    const tubeG = (pts, r, c) => colorize(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 8, false), c);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const grip = colorize(new RoundedBoxGeometry(0.34, 0.3, 0.8, 2, 0.06), 0x2b2f36); grip.translate(0, -0.06, 0); cp.push(grip);
    const gcov = colorize(new RoundedBoxGeometry(0.4, 0.16, 0.5, 2, 0.05), 0xd8b84a); gcov.translate(0, 0.08, 0); cp.push(gcov);
    cp.push(tubeG([V(0, -0.2, 0), V(0, -0.6, -0.12), V(0, -1.3, -0.42), V(0, -1.7, -0.5)], 0.055, frameC));
    // the back frame: a cross tube the hanger meets, and the seat rail
    cp.push(colorize(new THREE.CylinderGeometry(0.045, 0.045, 2.78, 10).rotateZ(Math.PI / 2).translate(0, -1.7, -0.5), frameC));
    for (const sx of [-1.39, 1.39]) cp.push(tubeG([V(sx, -1.7, -0.5), V(sx, -2.2, -0.36), V(sx, -2.5, -0.15), V(sx, -2.52, 0.32)], 0.04, frameC));
    const frame = colorize(new THREE.BoxGeometry(2.76, 0.06, 0.62), frameC); frame.translate(0, -2.55, 0.08); cp.push(frame);
    for (let i = 0; i < 4; i++) {
      const dx = -1.0 + i * 0.667;
      const c = colorize(new RoundedBoxGeometry(0.62, 0.14, 0.6, 2, 0.05), i % 2 ? pad : padD); c.translate(dx, -2.45, 0.1); cp.push(c);
      const b = colorize(new RoundedBoxGeometry(0.62, 0.68, 0.12, 2, 0.05).rotateX(-0.22), i % 2 ? pad : padD); b.translate(dx, -2.03, -0.24); cp.push(b);
    }
    // armrests and the bar: pivots at the sides, swung up over the heads, footrest on it
    for (const sx of [-1.4, 1.4]) cp.push(tubeG([V(sx, -2.5, -0.2), V(sx, -2.2, -0.1), V(sx, -2.18, 0.3), V(sx, -2.4, 0.42)], 0.03, steelC));
    for (const sx of [-1.43, 1.43]) cp.push(tubeG([V(sx, -2.15, -0.15), V(sx, -1.6, 0.05), V(sx, -1.25, 0.42)], 0.03, steelC));
    const topBar = colorize(new THREE.CylinderGeometry(0.035, 0.035, 2.86, 8).rotateZ(Math.PI / 2), steelC); topBar.translate(0, -1.25, 0.42); cp.push(topBar);
    const foot = colorize(new THREE.BoxGeometry(2.4, 0.04, 0.22), steelC); foot.translate(0, -1.0, 0.72); cp.push(foot);
    for (const sx of [-0.8, 0, 0.8]) cp.push(tubeG([V(sx, -1.25, 0.42), V(sx, -1.1, 0.6), V(sx, -1.0, 0.72)], 0.02, steelC));
    // a number plate on the hanger
    const num = colorize(new THREE.BoxGeometry(0.05, 0.22, 0.3), 0xf2f2f2); num.translate(0, -0.9, -0.24); cp.push(num);
    // snow caught along the tops of the backrests, on the grip cover and the footrest
    const snowC = 0xf2f5fb;
    for (let i = 0; i < 4; i++) { const sn = colorize(new RoundedBoxGeometry(0.58, 0.07, 0.15, 2, 0.03), snowC); sn.translate(-1.0 + i * 0.667, -1.67, -0.31); cp.push(sn); }
    { const sn = colorize(new RoundedBoxGeometry(0.36, 0.06, 0.44, 2, 0.025), snowC); sn.translate(0, 0.18, 0); cp.push(sn); }
    { const sn = colorize(new RoundedBoxGeometry(2.3, 0.04, 0.18, 2, 0.015), snowC); sn.translate(0, -0.96, 0.72); cp.push(sn); }
    const chairGeo = merge(cp);
    this.chairGeo = chairGeo;
    const riders = [];
    for (const dx of [-0.55, 0.55]) {
      const body = new THREE.CapsuleGeometry(0.17, 0.32, 4, 8); body.translate(dx, -2.0, 0.02);
      const head = new THREE.SphereGeometry(0.13, 10, 8); head.translate(dx, -1.55, 0.05);
      const legs = new THREE.BoxGeometry(0.3, 0.16, 0.55); legs.translate(dx, -2.38, 0.42);
      const shin = new THREE.BoxGeometry(0.26, 0.5, 0.16); shin.translate(dx, -2.7, 0.66);
      const ski = new THREE.BoxGeometry(0.1, 0.03, 1.6); ski.translate(dx, -2.95, 0.75);
      riders.push(body, head, legs, shin, ski);
    }
    const riderGeo = merge(riders.map((g) => colorize(g, 0xffffff)));
    const total = 0; let totalLen = [0, 0];
    for (const li of [0, 1]) {
      const pts = this.cableLines[li];
      let L = 0;
      for (let i = 0; i < pts.length - 1; i++) L += pts[i].distanceTo(pts[i + 1]);
      totalLen[li] = L;
    }
    const spacing = 34;
    this.chairs = [];
    for (const li of [0, 1]) for (let d = 0; d < totalLen[li]; d += spacing) this.chairs.push({ li, d, ride: this.rnd() < 0.55 });
    this.chairMesh = new THREE.InstancedMesh(chairGeo, this.vc, this.chairs.length);
    // off in the distance a chair is a few boxes: the whole line of them in one cheap draw
    const fp = [];
    const fb = (w, h, d, c, x, y, z, rx = 0) => { const g = colorize(new THREE.BoxGeometry(w, h, d).rotateX(rx), c); g.translate(x, y, z); fp.push(g); };
    fb(0.34, 0.3, 0.8, 0x2b2f36, 0, -0.06, 0);
    fb(0.1, 1.6, 0.1, frameC, 0, -0.95, -0.25, 0.3);
    fb(2.78, 0.09, 0.09, frameC, 0, -1.7, -0.5);
    for (const sx of [-1.39, 1.39]) fb(0.08, 0.9, 0.08, frameC, sx, -2.1, -0.3, 0.35);
    fb(2.7, 0.16, 0.62, pad, 0, -2.45, 0.1);
    fb(2.7, 0.66, 0.12, padD, 0, -2.03, -0.24, -0.22);
    fb(2.86, 0.07, 0.07, steelC, 0, -1.25, 0.42);
    fb(2.4, 0.05, 0.22, steelC, 0, -1.0, 0.72);
    this.chairFar = new THREE.InstancedMesh(merge(fp), this.vc, this.chairs.length);
    // the close chairs' bubbles: tinted acrylic hoods, raised back over the riders' heads
    const bub = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI, 0, Math.PI / 2);
    bub.rotateY(-Math.PI / 2); bub.scale(1.55, 0.95, 0.8); bub.rotateX(-0.95); bub.translate(0, -1.52, -0.18);
    this.bubbleMesh = new THREE.InstancedMesh(bub, new THREE.MeshPhysicalMaterial({ color: 0xff7a1a, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.5, envMapIntensity: 1.5, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }), this.chairs.length);
    this.bubbleMesh.frustumCulled = false;
    this.scene.add(this.bubbleMesh);
    this.chairFar.receiveShadow = true;
    this.riderMesh = new THREE.InstancedMesh(riderGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), this.chairs.length);
    this.riderMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.chairs.length * 3), 3);
    this.jackets = [0xd8342c, 0xf2b705, 0x2a7de1, 0x18a868, 0xf06d1a, 0x8e3fd1, 0x1d1f26, 0xff4f8b].map((c) => new THREE.Color(c));
    this.chairMesh.castShadow = this.riderMesh.castShadow = true;
    this.chairMesh.frustumCulled = this.riderMesh.frustumCulled = this.chairFar.frustumCulled = false;
    this.scene.add(this.chairMesh, this.chairFar, this.riderMesh);
    // each chair's pose this frame (the riders on it and the rescue read it)
    this.chairM = new Float32Array(this.chairs.length * 16);
    // the cable as distances along each line, for finding a point on it quickly
    this.cline = [0, 1].map((li) => {
      const pts = li === 0 ? this.cableLines[0] : [...this.cableLines[1]].reverse();
      const cum = new Float32Array(pts.length);
      for (let k = 1; k < pts.length; k++) cum[k] = cum[k - 1] + pts[k - 1].distanceTo(pts[k]);
      return { pts, cum };
    });
    this.totalLen = totalLen;
    this.liftDir = dir;
    this.liftV = 4.6; // m/s along the cable
    this.mine = -1;
    this.updateLift(0);
  }

  // how far along its line chair i is now
  chairD(i) { const c = this.chairs[i]; return (c.d + (this.liftT ?? 0) * this.liftV) % this.totalLen[c.li]; }

  cablePoint(li, d, out) {
    // line 0 runs bottom -> top, line 1 returns top -> bottom
    const { pts, cum } = this.cline[li];
    const n = pts.length;
    if (d >= cum[n - 1]) return out.copy(pts[n - 1]);
    if (d <= 0) return out.copy(pts[0]);
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
    return out.lerpVectors(pts[lo], pts[hi], (d - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]));
  }

  updateLift(time, cam) {
    this.liftT = time;
    if (cam) this.updateRocks(cam);
    const v = this.liftV;
    const yawUp = Math.atan2(this.liftDir.x, this.liftDir.z);
    // close chairs in full detail, the rest as the simple ones; the stand-in riders only where
    // the real ones aren't sitting and not so far off that they'd be a pixel
    const near2 = 210 * 210, real2 = 280 * 280, far2 = 1100 * 1100;
    let nN = 0, nF = 0, nR = 0;
    const one = tmpS.set(1, 1, 1);
    this.chairs.forEach((c, i) => {
      const d = (c.d + time * v) % this.totalLen[c.li];
      this.cablePoint(c.li, d, tmpP);
      tmpQ.setFromAxisAngle(UP, c.li === 0 ? yawUp : yawUp + Math.PI);
      tmpM.compose(tmpP, tmpQ, one);
      tmpM.toArray(this.chairM, i * 16);
      const d2 = cam ? tmpP.distanceToSquared(cam) : 0;
      c.near = !!(this.seats && cam && d2 < real2);
      // (the chair you're riding is drawn by the rescue, with you on it)
      if (i === this.mine) { c.near = false; return; }
      if (d2 < near2) { this.bubbleMesh.setMatrixAt(nN, tmpM); this.chairMesh.setMatrixAt(nN++, tmpM); } else this.chairFar.setMatrixAt(nF++, tmpM);
      if (c.ride && c.li === 0 && !c.near && d2 < far2) { this.riderMesh.setMatrixAt(nR, tmpM); this.riderMesh.setColorAt(nR++, this.jackets[i % 8]); }
    });
    const done = (im, n) => {
      im.count = n;
      im.instanceMatrix.clearUpdateRanges(); im.instanceMatrix.addUpdateRange(0, n * 16); im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) { im.instanceColor.clearUpdateRanges(); im.instanceColor.addUpdateRange(0, n * 3); im.instanceColor.needsUpdate = true; }
    };
    done(this.chairMesh, nN); done(this.bubbleMesh, nN); done(this.chairFar, nF); done(this.riderMesh, nR);
    if (this.seats) {
      const off = new THREE.Matrix4();
      for (const im of this.seatMeshes) if (im) im.userData.n = 0;
      let nS = 0;
      for (const st of this.seats) {
        if (!this.chairs[st.ci].near || st.ci === this.mine) continue;
        tmpM.fromArray(this.chairM, st.ci * 16).multiply(off.makeTranslation(st.dx, 0, 0));
        const k = st.im.userData.n++;
        st.im.setMatrixAt(k, tmpM); st.im.setColorAt(k, st.col);
        this.seatSkis.setMatrixAt(nS, tmpM); this.seatSkis.setColorAt(nS++, st.skiCol);
      }
      for (const im of this.seatMeshes) if (im) done(im, im.userData.n);
      done(this.seatSkis, nS);
    }
  }

  // ---------------- race gates ----------------
  buildGates() {
    const panel = (color) => canvasTex(128, 96, (g, w, h) => {
      g.fillStyle = color; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(0, h * 0.42, w, h * 0.16);
      g.fillStyle = color; g.font = 'bold 15px Helvetica'; g.textAlign = 'center'; g.fillText('SHREDLINE', w / 2, h * 0.54);
    });
    const red = new THREE.MeshStandardMaterial({ map: panel('#d42a2a'), side: THREE.DoubleSide, roughness: 0.7 });
    const blue = new THREE.MeshStandardMaterial({ map: panel('#1f4fc9'), side: THREE.DoubleSide, roughness: 0.7 });
    const poleG = new THREE.CylinderGeometry(0.022, 0.022, 1.9, 6); poleG.translate(0, 0.95, 0);
    const poleM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const cloth = new THREE.PlaneGeometry(1.15, 0.85);
    this.gateGroup = new THREE.Group();
    this.gateObjs = [];
    for (const gt of GATES) {
      const grp = new THREE.Group();
      const mat = gt.i % 2 ? blue : red;
      for (const s of [-1, 1]) {
        const px = gt.x + s * (gt.width / 2 + 0.6);
        // breakaway poles: clip one and the panel folds over
        const side = new THREE.Group();
        side.position.set(px, heightAt(px, gt.z) - 0.1, gt.z);
        for (const o of [-0.6, 0.6]) {
          const pole = new THREE.Mesh(poleG, poleM);
          pole.position.set(o, heightAt(px + o, gt.z) - heightAt(px, gt.z), 0);
          pole.castShadow = true;
          side.add(pole);
        }
        const c = new THREE.Mesh(cloth, mat);
        c.position.set(0, 1.4, 0);
        c.castShadow = true;
        side.add(c);
        grp.add(side);
        this.smash?.add(px, gt.z, 0.75, [side], { h: 1.9, slow: 0.02, kind: 'gate', off: true });
      }
      this.gateGroup.add(grp);
      this.gateObjs.push(grp);
    }
    this.gateGroup.visible = false;
    this.scene.add(this.gateGroup);
  }

  // ---------------- start house ----------------
  // a timber hut across the top of the run: the same build as the village chalets, low and
  // wide, a row of lit windows along the front, the start wand between its posts
  buildStart() {
    const z = START_Z - 7, x = centerX(z);
    const gy = heightAt(x, z);
    chalet(this.hutKit, this.hutWins, x, gy - 0.3, z - 2, 0, { w: 12, d: 5, h: 3.4, rh: 1.6, plinth: 0.3, wood: 0xc7ab90, roof: 0xffffff, shutter: 0x8a2b22, start: true, rnd: mulberry32(77) });
    const wood = 0x3a2416;
    const postL = colorize(new THREE.BoxGeometry(0.4, 3.4, 0.4), wood); postL.translate(-5.6, 1.7, 0.6);
    const postR = postL.clone(); postR.translate(11.2, 0, 0);
    const wand = colorize(new THREE.BoxGeometry(10.5, 0.08, 0.08), 0xd42a2a); wand.translate(0, 0.6, 0.8);
    const g = merge([postL, postR, wand]);
    g.translate(x, gy, z);
    const m = new THREE.Mesh(g, this.vc); m.castShadow = m.receiveShadow = true;
    this.scene.add(m);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.1), new THREE.MeshStandardMaterial({
      map: canvasTex(1024, 104, (c, w, h) => {
        const gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#ff6a3d'); gr.addColorStop(1, '#ffb347');
        c.fillStyle = gr; c.fillRect(0, 0, w, h);
        c.fillStyle = '#fff'; c.font = 'bold 64px Helvetica'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('SHREDLINE  ·  START', w / 2, h / 2 + 3);
      }), roughness: 0.6,
    }));
    banner.position.set(x, gy + 3.0, z + 0.55);
    this.scene.add(banner);
  }

  // ---------------- finish arena ----------------
  buildFinish() {
    const z = FINISH_Z, cx = centerX(z), hw = halfWidth(z);
    const gy = heightAt(cx, z);
    // inflatable arch
    const archW = 26;
    const arch = new THREE.TorusGeometry(archW / 2, 0.9, 12, 40, Math.PI);
    const archMesh = new THREE.Mesh(arch, new THREE.MeshStandardMaterial({ color: 0xe8432e, roughness: 0.55 }));
    archMesh.position.set(cx, gy - 1, z);
    archMesh.castShadow = true;
    this.scene.add(archMesh);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(12, 2.2, 0.4), [
      ...Array(4).fill(new THREE.MeshStandardMaterial({ color: 0xe8432e })),
      new THREE.MeshStandardMaterial({ map: canvasTex(512, 96, (c, w, h) => {
        c.fillStyle = '#111'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#fff'; c.font = 'bold 70px Helvetica'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('FINISH', w / 2, h / 2 + 4);
      }) }),
      new THREE.MeshStandardMaterial({ map: canvasTex(512, 96, (c, w, h) => {
        c.fillStyle = '#111'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#ffb347'; c.font = 'bold 60px Helvetica'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SHREDLINE CUP', w / 2, h / 2 + 4);
      }) }),
    ]);
    sign.position.set(cx, gy + archW / 2 - 2.2, z);
    sign.rotation.y = Math.PI;
    this.scene.add(sign);
    this.forest.addCollider(cx - archW / 2, z, 1.0, 'arch');
    this.forest.addCollider(cx + archW / 2, z, 1.0, 'arch');

    // A-board fences + banners on both sides of the last 260 m, then the finish corral
    const boardTex = canvasTex(1024, 128, (c, w, h) => {
      const brands = [['#1f4fc9', 'SUMMIT'], ['#e8432e', 'SHREDLINE'], ['#111', 'FRESH TRACKS'], ['#f2b705', 'POWDER CO.'], ['#18a868', 'GLACIER']];
      const bw = w / brands.length;
      brands.forEach(([col, t], i) => {
        c.fillStyle = col; c.fillRect(i * bw, 0, bw, h);
        c.fillStyle = col === '#f2b705' ? '#111' : '#fff'; c.font = 'bold 34px Helvetica'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(t, i * bw + bw / 2, h / 2 + 2);
      });
    });
    boardTex.wrapS = THREE.RepeatWrapping;
    const boards = [];
    for (const s of [-1, 1]) {
      for (let zz = z - 260; zz < z + 60; zz += 4) {
        const za = zz, zb = zz + 4;
        const xa = centerX(za) + s * (halfWidth(za) * (zz < z ? 0.92 : 1) + 2), xb = centerX(zb) + s * (halfWidth(zb) * (zz < z ? 0.92 : 1) + 2);
        const ya = heightAt(xa, za), yb = heightAt(xb, zb);
        const pts = [xa, ya + 0.05, za, xb, yb + 0.05, zb, xa, ya + 1.0, za - s * 0.0, xb, yb + 1.0, zb];
        boards.push({ pts, u0: (zz - (z - 260)) / 40, u1: (zz + 4 - (z - 260)) / 40 });
      }
    }
    const pos = [], uv = [], idx = [];
    boards.forEach((b, i) => {
      const p = b.pts;
      pos.push(...p);
      uv.push(b.u0, 0, b.u1, 0, b.u0, 1, b.u1, 1);
      const v = i * 4;
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    });
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    bg.setIndex(idx); bg.computeVertexNormals();
    const bm = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ map: boardTex, side: THREE.DoubleSide, roughness: 0.6 }));
    bm.castShadow = true; bm.receiveShadow = true;
    this.scene.add(bm);

    // crowd behind the fences near the finish
    // (seen from up the hill only: close up the real spectators stand there instead)
    const body = new THREE.CapsuleGeometry(0.22, 0.75, 2, 6); body.translate(0, 0.62 + 0.22, 0);
    const head = new THREE.SphereGeometry(0.14, 6, 5); head.translate(0, 1.55, 0);
    const hat = new THREE.SphereGeometry(0.15, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2); hat.translate(0, 1.6, 0);
    const person = merge([colorize(body, 0xffffff), colorize(head, 0xe0b89a), colorize(hat, 0xffffff)]);
    const people = [];
    for (const s of [-1, 1]) for (let zz = z - 150; zz < z + 30; zz += 1.1) {
      for (let row = 0; row < 3; row++) {
        if (this.rnd() < 0.25) continue;
        const off = halfWidth(zz) * (zz < z ? 0.92 : 1) + 3.2 + row * 1.0 + this.rnd() * 0.4;
        const x = centerX(zz) + s * off;
        people.push([x, heightAt(x, zz) + row * 0.15, zz + this.rnd() * 0.5]);
      }
    }
    this.crowd = new THREE.InstancedMesh(person, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), people.length);
    const cols = [0xd8342c, 0xf2b705, 0x2a7de1, 0x18a868, 0xf06d1a, 0x8e3fd1, 0xe8e8ea, 0x1d1f26, 0xff4f8b, 0x14b8c4];
    this.crowdData = people;
    people.forEach((p, i) => {
      // facing the course, turned a little up the hill toward who's coming
      p[3] = (p[0] > cx ? -1 : 1) * (Math.PI / 2 - 0.35) + (this.rnd() - 0.5) * 0.6;
      p[4] = 0.92 + this.rnd() * 0.16;
      tmpM.compose(tmpP.set(p[0], p[1], p[2]), tmpQ.setFromAxisAngle(UP, p[3]), tmpS.setScalar(p[4]));
      this.crowd.setMatrixAt(i, tmpM);
      this.crowd.setColorAt(i, new THREE.Color(cols[Math.floor(this.rnd() * cols.length)]));
    });
    this.crowd.castShadow = true;
    this.scene.add(this.crowd);
    this.finishX = cx;
  }

  // the whole people at the finish when you're near it, the simple figures from far away
  updatePeople(cam) {
    if (!this.crowdNear) return;
    const near = Math.hypot(cam.x - this.finishX, cam.z - FINISH_Z) < 420;
    if (near === this.crowdIsNear) return;
    this.crowdIsNear = near;
    for (const im of this.crowdNear) im.visible = near;
    this.crowd.visible = !near;
  }

  cheer(t, k) {
    // the crowd bounces when someone crosses the line
    if (!this.crowd && !this.crowdSlots) return;
    if (k <= 0 && this._still) return;
    this._still = k <= 0;
    this.crowdData.forEach((p, i) => {
      const hop = k > 0 ? Math.max(0, Math.sin(t * 9 + i * 1.7)) * 0.18 * k : 0;
      const im = this.crowdSlots ? this.crowdSlots[i].im : this.crowd, j = this.crowdSlots ? this.crowdSlots[i].k : this.crowdIdx?.[i] ?? i;
      im.getMatrixAt(j, tmpM);
      tmpM.decompose(tmpP, tmpQ, tmpS);
      tmpP.y = p[1] + hop;
      tmpM.compose(tmpP, tmpQ, tmpS);
      im.setMatrixAt(j, tmpM);
      im.instanceMatrix.needsUpdate = true;
    });
  }

  // once the people have loaded: real spectators at the finish and real riders on the chairs
  buildPeople() {
    const rnd = mulberry32(808);
    // two rows at the fences is plenty (every one of them is a whole person)
    const keep = this.crowdData.map((p, i) => i).filter((i) => this.crowdData[i][2] > FINISH_Z - 130 && rnd() < 0.52);
    this.crowdIdx = keep;
    this.crowdData = keep.map((i) => this.crowdData[i]);
    const c = crowd(this.scene, this.crowdData.map((p) => ({ x: p[0], y: p[1], z: p[2], yaw: p[3], s: p[4] })), ['stand', 'cheer', 'clap'], rnd);
    if (c) {
      // the simple figures stay for the crowd seen from far off
      this.crowdSlots = c.slots;
      this.crowdNear = c.meshes;
      this.crowd.visible = false;
    }
    // chair riders: everyone sitting back with their skis on
    const B = bodies(['sit'], rnd);
    if (!B.length) return;
    const seatY = -2.45 + 0.19;
    for (const b of B) {
      const pel = b.kit.bindP[b.kit.I('Bip01_Pelvis')];
      b.geo.translate(0, seatY - pel.y, 0.12 - pel.z);
    }
    const seats = [];
    // two to four on each chair going up
    this.chairs.forEach((ch, ci) => { if (ch.ride && ch.li === 0) for (const dx of [-1.0, -0.333, 0.333, 1.0]) if (rnd() < 0.62) seats.push({ ci, dx, b: Math.floor(rnd() * B.length) }); });
    this.seatMeshes = B.map((b, bi) => {
      const n = seats.filter((s) => s.b === bi).length;
      if (!n) return null;
      const im = new THREE.InstancedMesh(b.geo, b.mat, n);
      im.castShadow = true;
      this.scene.add(im);
      return im;
    });
    const skiCols = [0xd8342c, 0x1d1f26, 0xf2b705, 0x2a7de1].map((c) => new THREE.Color(c));
    seats.forEach((st, i) => {
      st.im = this.seatMeshes[st.b];
      st.col = this.jackets[Math.floor(rnd() * this.jackets.length)];
      st.skiCol = skiCols[i % 4];
    });
    for (const im of this.seatMeshes) if (im) { im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(im.instanceMatrix.count * 3), 3); im.frustumCulled = false; }
    this.seats = seats;
    // their skis hanging off the boots
    const ski = colorize(new THREE.BoxGeometry(0.09, 0.03, 1.65), 0xffffff);
    const skis = merge([ski.clone().translate(0.11, seatY - 0.56, 0.62), ski.clone().translate(-0.11, seatY - 0.56, 0.62)]);
    this.seatSkis = new THREE.InstancedMesh(skis, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }), seats.length);
    this.seatSkis.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(seats.length * 3), 3);
    this.seatSkis.castShadow = true; this.seatSkis.frustumCulled = false;
    this.scene.add(this.seatSkis);
    this.updateLift(this.liftT ?? 0);
  }

  // ---------------- the hospital ----------------
  // the slope-side clinic the rescue helicopter flies you to (clinic.js)
  buildHospital() {
    const c = buildClinic(this.scene, this.forest, () => this.ambulance());
    this.hospital = c.info;
    this.sock = c.sock;
    this.clinicFlags = c.flags;
  }

  // an ambulance: a white box van with a red and yellow check down the side and a light bar
  ambulance() {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.3, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1b2633, roughness: 0.05, metalness: 0.9 });
    const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = true; g.add(m); return m; };
    add(new RoundedBoxGeometry(2.3, 2.5, 4.2, 3, 0.12), white, 0, 1.75, -0.7);
    add(new RoundedBoxGeometry(2.2, 1.5, 1.9, 3, 0.25), white, 0, 1.25, 2.3);
    add(new THREE.BoxGeometry(2.1, 0.7, 0.05).rotateX(-0.45), glass, 0, 1.72, 3.18);
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.6, 1.1), glass, sx * 1.11, 1.6, 2.3);
    const chk = canvasTex(512, 64, (c, w, h) => { for (let k = 0; k < 16; k++) for (let r = 0; r < 2; r++) { c.fillStyle = (k + r) % 2 ? '#ffd21e' : '#d3232c'; c.fillRect((k * w) / 16, (r * h) / 2, w / 16 + 1, h / 2 + 1); } });
    const band = new THREE.MeshStandardMaterial({ map: chk, roughness: 0.4 });
    for (const sx of [-1, 1]) { const b = add(new THREE.PlaneGeometry(6, 0.42), band, sx * 1.16, 1.15, 0.3); b.rotation.y = sx * Math.PI / 2; }
    for (const [wx, wz] of [[-1, 2.2], [1, 2.2], [-1, -1.9], [1, -1.9]]) add(new THREE.CylinderGeometry(0.42, 0.42, 0.32, 18).rotateZ(Math.PI / 2), dark, wx * 1.0, 0.42, wz);
    // the light bar
    add(new THREE.BoxGeometry(1.6, 0.16, 0.32), new THREE.MeshStandardMaterial({ color: 0x3a6dff, emissive: 0x2b5cff, emissiveIntensity: 2 }), 0, 3.08, 1.1);
    add(new THREE.BoxGeometry(0.5, 0.17, 0.33), new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2020, emissiveIntensity: 2 }), 0, 3.09, 1.1);
    return g;
  }

  // ---------------- village ----------------
  buildVillage() {
    const K = this.hutKit, wins = this.hutWins;
    const placed = [];
    const woods = [0xffffff, 0xe2cfba, 0xc7ab90, 0xa08672];
    const roofs = [0xffffff, 0xd2a898, 0xb4c2b4, 0xe8e8e8];
    const shutters = [0x2f5d3a, 0x8a2b22, 0x3a2416, 0x2d4a6b, 0xb8862e];
    let tries = 0;
    while (placed.length < 46 && tries++ < 3000) {
      const z = FINISH_Z + 60 + this.rnd() * 520;
      const s = this.rnd() < 0.5 ? -1 : 1;
      const off = 55 + this.rnd() * 230;
      const x = centerX(z) + s * off;
      if (slopeAt(x, z) > 0.35) continue;
      const w = 8 + this.rnd() * 7, d = 9 + this.rnd() * 8, h = 4 + this.rnd() * 4;
      if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < Math.max(w, d) + p[2] + 4)) continue;
      if (this.hospital && Math.hypot(this.hospital.at.x - x, this.hospital.at.z - z) < 48 + Math.max(w, d)) continue;
      placed.push([x, z, Math.max(w, d)]);
      const gy = Math.min(heightAt(x - w / 2, z - d / 2), heightAt(x + w / 2, z + d / 2), heightAt(x, z));
      const yaw = Math.round(this.rnd() * 3) * Math.PI / 2 + (this.rnd() - 0.5) * 0.3;
      const pick = (a) => a[Math.floor(this.rnd() * a.length)];
      chalet(K, wins, x, gy, z, yaw, { w, d, h, rh: w * 0.42, wood: pick(woods), roof: pick(roofs), shutter: pick(shutters), balcony: this.rnd() < 0.7, rnd: this.rnd });
      this.forest.addCollider(x, z, Math.max(w, d) * 0.55, 'chalet');
    }
  }

  // every chalet and hut (and the start house) gathered in one kit: one mesh per material
  finishHuts() {
    const K = this.hutKit;
    if (!K) return;
    this.windowMat.map = this.windowMat.emissiveMap = windowTex();
    this.windowMat.color.set(0x3e3833); this.windowMat.emissive.set(0xffc27a); this.windowMat.roughness = 0.15;
    K.build(hutMaterials(this.windowMat), this.scene);
    if (this.hutWins.length) this.scene.add(new THREE.Mesh(mergeGeometries(this.hutWins), this.windowMat));
    this.hutKit = null;
  }

  setDusk(k) { this.windowMat.emissiveIntensity = 0.1 + k * 2.3; }

  // ---------------- piste markers ----------------
  buildMarkers() {
    const pole = colorize(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 6).translate(0, 0.95, 0), 0xf26a1b);
    const cap = new THREE.CylinderGeometry(0.045, 0.045, 0.35, 6).translate(0, 1.75, 0);
    const list = [];
    const diff = (z) => { const n = SECTIONS.find((s) => z < s.z1)?.name; return n === 'The Wall' || n === 'Glacier Bowl' ? 0x111111 : n === 'Run-out' || n === 'Village' || n === 'Summit Start' ? 0x2a6fe0 : 0xd42a2a; };
    for (let z = 40; z < FINISH_Z - 260; z += 42) for (const s of [-1, 1]) {
      const x = centerX(z) + s * (halfWidth(z) + 1.5);
      list.push([x, z, diff(z)]);
    }
    const geo = merge([pole, colorize(cap, 0xffffff)]);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), list.length);
    list.forEach((p, i) => {
      tmpM.compose(tmpP.set(p[0], heightAt(p[0], p[1]) - 0.2, p[1]), tmpQ.identity(), tmpS.set(1, 1, 1));
      im.setMatrixAt(i, tmpM);
      im.setColorAt(i, new THREE.Color(1, 1, 1));
    });
    im.castShadow = true;
    this.scene.add(im);
    // difficulty caps as a second instanced set
    const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.32, 8).translate(0, 1.72, 0), new THREE.MeshStandardMaterial({ roughness: 0.5 }), list.length);
    list.forEach((p, i) => {
      tmpM.compose(tmpP.set(p[0], heightAt(p[0], p[1]) - 0.2, p[1]), tmpQ.identity(), tmpS.set(1, 1, 1));
      caps.setMatrixAt(i, tmpM);
      caps.setColorAt(i, new THREE.Color(p[2]));
    });
    this.scene.add(caps);
    list.forEach((p, i) => this.smash?.add(p[0], p[1], 0.22, [{ im, i }, { im: caps, i }], { h: 1.8, slow: 0.025 }));
  }

  // ---------------- course nets ----------------
  // blue mesh fencing down both sides of the whole run (the skier physics bounces off it)
  buildNets() {
    const tex = canvasTex(128, 64, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.strokeStyle = 'rgba(40,120,235,1)'; c.lineWidth = 3;
      c.beginPath();
      for (let i = -w; i < w * 2; i += 8) { c.moveTo(i, 0); c.lineTo(i + h, h); c.moveTo(i, h); c.lineTo(i + h, 0); }
      c.stroke();
      c.fillStyle = 'rgba(30,96,215,1)'; c.fillRect(0, 0, w, 7); c.fillRect(0, h - 4, w, 4);
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.75 });
    // ride into it and it gives: the mesh bulges out round the rider and wobbles back
    this.netHits = [0, 1, 2, 3].map(() => ({ z: 0, s: 0, a: 0, v: 0, push: 0 }));
    const uHit = { value: this.netHits.map(() => new THREE.Vector4()) };
    this.netU = uHit;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uHit = uHit;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec4 uHit[4]; attribute vec2 aOut; attribute float aSide; attribute float aH;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float bulge = 0.0;
          for (int i = 0; i < 4; i++) {
            vec4 h = uHit[i];
            float dz = position.z - h.x;
            bulge += step(abs(aSide - h.z), 0.5) * h.y * exp(-dz * dz / 7.0);
          }
          transformed.xz += aOut * bulge * (0.3 + 0.7 * sin(aH * 2.8));`);
    };
    const runs = [[64, FINISH_Z - 262]];
    const H = 1.25, seg = 1.5, rows = 3;
    const pos = [], uv = [], idx = [], out = [], sides = [], hs = [];
    let v = 0;
    for (const [za, zb] of runs) for (const s of [-1, 1]) {
      let u = 0;
      for (let z = za; z < zb; z += seg) {
        const x0 = centerX(z) + s * (halfWidth(z) + 2.8), x1 = centerX(z + seg) + s * (halfWidth(z + seg) + 2.8);
        const y0 = heightAt(x0, z), y1 = heightAt(x1, z + seg);
        const d = Math.hypot(x1 - x0, seg) / 2.6;
        const ox = s * seg / Math.hypot(x1 - x0, seg), oz = -s * (x1 - x0) / Math.hypot(x1 - x0, seg);
        // a few rows up the height so it can bulge in the middle
        for (let r = 0; r <= rows; r++) {
          const k = r / rows, yy = -0.12 + k * (H + 0.12);
          pos.push(x0, y0 + yy, z, x1, y1 + yy, z + seg);
          uv.push(u, k, u + d, k);
          out.push(ox, oz, ox, oz); sides.push(s, s); hs.push(k, k);
        }
        for (let r = 0; r < rows; r++) {
          const a = v + r * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
        u += d;
        v += (rows + 1) * 2;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aOut', new THREE.Float32BufferAttribute(out, 2));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(sides, 1));
    g.setAttribute('aH', new THREE.Float32BufferAttribute(hs, 1));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    this.scene.add(m);
    // posts
    const posts = [];
    for (const [za, zb] of runs) for (const s of [-1, 1]) for (let z = za; z < zb; z += 6) {
      const x = centerX(z) + s * (halfWidth(z) + 2.8);
      posts.push([x, z]);
    }
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, H + 0.3, 5).translate(0, (H + 0.3) / 2 - 0.15, 0), new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.6 }), posts.length);
    posts.forEach((p, i) => { tmpM.makeTranslation(p[0], heightAt(p[0], p[1]), p[1]); im.setMatrixAt(i, tmpM); });
    im.castShadow = true;
    this.scene.add(im);
    this.netRuns = runs;
  }

  // a rider pushing pen metres into the net on side s at z
  netHit(s, z, pen) {
    let slot = this.netHits.find((h) => h.s === s && Math.abs(h.z - z) < 4);
    if (!slot) slot = this.netHits.reduce((a, b) => (Math.abs(b.a) + Math.abs(b.v) * 0.1 < Math.abs(a.a) + Math.abs(a.v) * 0.1 ? b : a));
    if (slot.s !== s || Math.abs(slot.z - z) >= 4) { slot.s = s; slot.z = z; slot.a = 0; slot.v = 0; }
    slot.z += (z - slot.z) * 0.3;
    slot.push = Math.max(slot.push, pen);
  }

  updateNets(dt, cam) {
    // the clinic's flags, when anyone's near enough to see them
    this.flagT = (this.flagT ?? 0) + dt;
    if (this.clinicFlags && cam && this.hospital && cam.distanceToSquared(this.hospital.at) < 300 * 300) waveFlags(this.clinicFlags, this.flagT);
    if (!this.netHits) return;
    this.netHits.forEach((h, i) => {
      // a damped spring toward however far it's being pushed (then back to flat, wobbling)
      const k = 120, c = 6;
      const n = Math.max(1, Math.ceil(dt / 0.01)), st = dt / n;
      for (let j = 0; j < n; j++) { h.v += (k * (h.push - h.a) - c * h.v) * st; h.a += h.v * st; }
      h.push = 0;
      this.netU.value[i].set(h.z, h.a, h.s, 0);
    });
  }

  // ---------------- rocks ----------------
  buildRocks() {
    // three kinds of stone, each at two densities (close up and off in the distance): a jointed
    // granite block, bedded limestone, and the long layered slabs the cliff bands are made of
    const near = LO ? 3 : 4;
    this.rockGeo = [0, 1, 2].map((type) => [rockShape(near, type, 31 + type * 17), rockShape(1, type, 31 + type * 17)]);
    const list = [];
    for (let i = 0; i < 2600 && list.length < 900; i++) {
      const z = -200 + this.rnd() * (FINISH_Z + 180);
      const s = this.rnd() < 0.5 ? -1 : 1;
      const off = halfWidth(z) + 6 + Math.pow(this.rnd(), 2) * 320;
      const x = centerX(z) + s * off;
      const sl = slopeAt(x, z);
      if (sl < 0.35 && this.rnd() < 0.75) continue;
      const size = 0.6 + Math.pow(this.rnd(), 2.5) * 5;
      list.push([x, z, size]);
      if (off < halfWidth(z) + 150 && size > 0.7) this.forest.addCollider(x, z, size * 0.8, 'rock');
    }
    // cliff bands: long bedded outcrops across the steep ground off the piste, laid along the
    // contour (each a row of colliders down its length where you could ride into it)
    const cliffs = [];
    for (let i = 0; i < 4000 && cliffs.length < (LO ? 40 : 70); i++) {
      const z = -150 + this.rnd() * (FINISH_Z + 120);
      const s = this.rnd() < 0.5 ? -1 : 1;
      const off = halfWidth(z) + 30 + this.rnd() * 300;
      const x = centerX(z) + s * off;
      if (slopeAt(x, z) < 0.62) continue;
      const size = 3.5 + Math.pow(this.rnd(), 1.5) * 6, len = 1.8 + this.rnd() * 1.4;
      if (cliffs.some((c) => Math.hypot(c[0] - x, c[1] - z) < (c[2] * c[3] + size * len) * 0.9)) continue;
      // along the contour: across the fall line
      const gx = heightAt(x + 1, z) - heightAt(x - 1, z), gz = heightAt(x, z + 1) - heightAt(x, z - 1);
      const yaw = Math.atan2(gx, gz);
      // (only where the ground runs level along it: on a ridge or a gully side it would hang out
      // over the drop at its ends)
      const ex = Math.cos(yaw) * size * len * 0.85, ez = -Math.sin(yaw) * size * len * 0.85, h0 = heightAt(x, z);
      if (Math.abs(heightAt(x + ex, z + ez) - h0) > size * 0.4 || Math.abs(heightAt(x - ex, z - ez) - h0) > size * 0.4) continue;
      cliffs.push([x, z, size, len, yaw, slopeAt(x, z)]);
      if (off < halfWidth(z) + 150) {
        const cx = Math.cos(yaw), cz = -Math.sin(yaw);
        for (let k = -1; k <= 1; k++) this.forest.addCollider(x + cx * k * size * len * 0.62, z + cz * k * size * len * 0.62, size * 0.85, 'rock');
      }
    }
    // in blocks down the hill, so the ones out of view aren't drawn at all; each block one kind
    // of stone (so the hill side changes from granite to limestone without more draws)
    this.cliffs = cliffs;
    const mat = rockMaterial(), blocks = new Map();
    const key = (x, z, c) => Math.floor(z / 260) * 4 + (x > centerX(z) ? 1 : 0) + (c ? 2 : 0);
    for (const r of list) { const k = key(r[0], r[1], false); (blocks.get(k) ?? blocks.set(k, []).get(k)).push(r); }
    for (const r of cliffs) { const k = key(r[0], r[1], true); (blocks.get(k) ?? blocks.set(k, []).get(k)).push(r); }
    this.rockBlocks = [];
    const e = new THREE.Euler();
    for (const [k, rs] of blocks) {
      const cliff = (k & 2) !== 0, type = cliff ? 2 : (Math.floor(k / 4) % 2 ? 1 : 0);
      const im = new THREE.InstancedMesh(this.rockGeo[type][0], mat, rs.length);
      im.userData.geos = this.rockGeo[type];
      rs.forEach((r, i) => {
        if (cliff) {
          // its top leaning half way with the hill, the downhill face a wall of beds
          tmpM.compose(tmpP.set(r[0], heightAt(r[0], r[1]) - r[2] * 0.8, r[1]),
            tmpQ.setFromEuler(e.set(-0.3 * Math.atan(r[5]) + (this.rnd() - 0.5) * 0.1, r[4], (this.rnd() - 0.5) * 0.1, 'YXZ')),
            tmpS.set(r[2] * r[3], r[2] * (2.1 + this.rnd() * 0.5), r[2] * 0.75));
        } else {
          tmpM.compose(tmpP.set(r[0], heightAt(r[0], r[1]) - r[2] * 0.25, r[1]),
            tmpQ.setFromEuler(e.set((this.rnd() - 0.5) * 0.4, this.rnd() * 6, (this.rnd() - 0.5) * 0.4)),
            tmpS.set(r[2] * (0.8 + this.rnd() * 0.5), r[2] * (type === 0 ? 1 : 0.85), r[2] * (0.8 + this.rnd() * 0.5)));
        }
        im.setMatrixAt(i, tmpM);
      });
      im.computeBoundingSphere();
      im.castShadow = true; im.receiveShadow = true;
      im.matrixAutoUpdate = false;
      this.scene.add(im);
      this.rockBlocks.push(im);
    }
  }

  // rocks far off as the plain lumps (called with the lift, every frame)
  updateRocks(cam) {
    if (!this.rockBlocks) return;
    for (const im of this.rockBlocks) {
      const d = im.boundingSphere.center.distanceTo(cam) - im.boundingSphere.radius;
      im.geometry = im.userData.geos[d > 240 ? 1 : 0];
      im.castShadow = d < 240;
    }
  }

  // ---------------- closure fences ----------------
  // orange barrier fence on bamboo poles strung along the top of the cliff bands near the runs
  // (inside the cliffs' own colliders, so it stops you where they do)
  buildFences() {
    const tex = canvasTex(128, 64, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = '#ff6a14';
      c.fillRect(0, 0, w, 6); c.fillRect(0, h - 5, w, 5);
      // the stretched oval holes of barrier mesh: solid bands with lenses cut out
      c.fillRect(0, 6, w, h - 11);
      c.globalCompositeOperation = 'destination-out';
      for (let row = 0; row < 3; row++) for (let k = -1; k < 5; k++) {
        const cx = k * 32 + (row % 2) * 16 + 16, cy = 14 + row * 17;
        c.beginPath(); c.ellipse(cx, cy, 13, 6, 0, 0, Math.PI * 2); c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    });
    tex.wrapS = THREE.RepeatWrapping;
    const pos = [], uv = [], idx = [], poles = [];
    for (const cl of this.cliffs ?? []) {
      const [x, z, size, len, yaw] = cl;
      if (Math.abs(x - centerX(z)) - halfWidth(z) > 140) continue;
      const ax = Math.cos(yaw), az = -Math.sin(yaw), ux = Math.sin(yaw), uz = Math.cos(yaw);
      const half = size * len * 0.55, n = Math.max(2, Math.round((half * 2) / 2.6));
      let u = 0, prev = null;
      for (let i = 0; i <= n; i++) {
        const t = -half + (i / n) * half * 2;
        const px = x + ax * t + ux * size * 0.45, pz = z + az * t + uz * size * 0.45;
        const gy = heightAt(px, pz);
        if (prev) u += Math.hypot(px - prev[0], pz - prev[1]) / 2.0;
        const v = pos.length / 3;
        pos.push(px, gy + 0.05, pz, px, gy + 1.2, pz);
        uv.push(u, 0, u, 1);
        if (i > 0) idx.push(v - 2, v, v - 1, v - 1, v, v + 1);
        poles.push([px, gy, pz]);
        prev = [px, pz];
      }
    }
    if (!poles.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7 }));
    m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m);
    // bamboo: tan canes with darker nodes, a little lean each
    const cane = [];
    cane.push(colorize(new THREE.CylinderGeometry(0.022, 0.028, 1.6, 6).translate(0, 0.65, 0), 0xc9a964));
    for (const y of [0.2, 0.6, 1.0, 1.35]) cane.push(colorize(new THREE.CylinderGeometry(0.03, 0.03, 0.035, 6).translate(0, y, 0), 0x7a6232));
    const im = new THREE.InstancedMesh(merge(cane), this.vc, poles.length);
    const e = new THREE.Euler();
    poles.forEach((p, i) => {
      tmpM.compose(tmpP.set(p[0], p[1] - 0.15, p[2]), tmpQ.setFromEuler(e.set((this.rnd() - 0.5) * 0.08, 0, (this.rnd() - 0.5) * 0.08)), tmpS.set(1, 1, 1));
      im.setMatrixAt(i, tmpM);
    });
    im.castShadow = true;
    im.computeBoundingSphere();
    this.scene.add(im);
  }

  // ---------------- terrain park dressing ----------------
  buildPark() {
    // blue dye lines on the lips + orange marker poles + an entry banner
    const lip = new THREE.MeshBasicMaterial({ color: 0x2a6fe0, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const poles = [];
    for (const k of KICKERS) {
      if (k.kind !== 'park') continue;
      const pos = [];
      for (let i = 0; i <= 10; i++) {
        const x = k.x - k.w / 2 + 0.5 + ((k.w - 1) * i) / 10;
        pos.push(x, heightAt(x, k.z - 0.3) + 0.04, k.z - 0.3, x, heightAt(x, k.z + 0.3) + 0.04, k.z + 0.3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const idx = [];
      for (let i = 0; i < 10; i++) { const v = i * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
      g.setIndex(idx);
      this.scene.add(new THREE.Mesh(g, lip));
      for (const s of [-1, 1]) for (const dz of [-k.ramp, 0]) poles.push([k.x + s * (k.w / 2 + 0.8), k.z + dz]);
    }
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6).translate(0, 0.7, 0), new THREE.MeshStandardMaterial({ color: 0xf26a1b }), poles.length);
    poles.forEach((p, i) => { tmpM.makeTranslation(p[0], heightAt(p[0], p[1]), p[1]); im.setMatrixAt(i, tmpM); });
    im.castShadow = true;
    this.scene.add(im);
    poles.forEach((p, i) => this.smash?.add(p[0], p[1], 0.22, [{ im, i }], { h: 1.4, slow: 0.02 }));
  }

  setRaceMode(on) { this.gateGroup.visible = on; this.smash?.setOff('gate', !on); }
}
