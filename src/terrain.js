// Chunked, distance-LOD terrain mesh over the shared height function, plus a
// coarse far mesh for the surrounding ranges. The snow material adds wind
// ripples, groomer corduroy, exposed rock on steep faces and sun glints.
import * as THREE from 'three';
import { heightAt, centerX, halfWidth } from './course.js';
import { makeSimplex, smoothstep } from './noise.js';

export const CHUNK = 128;
const NEAR_X = 896; // half extent of the chunked region
const Z0 = -640, Z1 = 4480;
const LODS = [96, 48, 24, 12];
const LOD_DIST = [190, 430, 950];

// tileable multi-channel noise texture used by the snow/rock shader
function makeNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const nA = makeSimplex(3), nB = makeSimplex(5), nC = makeSimplex(11), nD = makeSimplex(13);
  const TAU = Math.PI * 2;
  // periodic noise via sampling a torus in 4D-ish: blend two 2D lookups
  const per = (n, x, y, f) => {
    const a = (x / size) * TAU, b = (y / size) * TAU;
    const r = f / TAU;
    return (n(Math.cos(a) * r + 10, Math.sin(a) * r + 10) + n(Math.cos(b) * r + 40, Math.sin(b) * r + 40) +
      n((Math.cos(a) + Math.sin(b)) * r * 0.7 + 70, (Math.sin(a) + Math.cos(b)) * r * 0.7 + 70)) / 3;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    let r = 0, g = 0, b = 0, a = 0, amp = 1, tot = 0;
    for (let o = 0; o < 4; o++) {
      const f = 4 * Math.pow(2, o);
      r += per(nA, x, y, f) * amp; g += per(nB, x, y, f) * amp;
      b += per(nC, x, y, f * 2) * amp; a += per(nD, x, y, f * 1.5) * amp;
      tot += amp; amp *= 0.5;
    }
    data[i] = Math.max(0, Math.min(255, (r / tot * 1.6 + 0.5) * 255));
    data[i + 1] = Math.max(0, Math.min(255, (g / tot * 1.6 + 0.5) * 255));
    data[i + 2] = Math.max(0, Math.min(255, (b / tot * 1.6 + 0.5) * 255));
    data[i + 3] = Math.max(0, Math.min(255, (a / tot * 1.6 + 0.5) * 255));
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export const noiseTex = makeNoiseTexture();

export function makeSnowMaterial(env) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0 });
  mat.userData.shared = {
    uNoise: { value: noiseTex },
    uSunDir: { value: env.sunDir },
    uSunCol: { value: env.sun.color },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, mat.userData.shared);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aPiste;
        varying vec3 vWPos; varying vec3 vWNrm; varying float vPiste;`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNrm = normalize(mat3(modelMatrix) * objectNormal);
        vPiste = aPiste;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uNoise; uniform vec3 uSunDir; uniform vec3 uSunCol;
        varying vec3 vWPos; varying vec3 vWNrm; varying float vPiste;
        float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float gRock;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 wp = vWPos.xz;
          float dist = length(cameraPosition - vWPos);
          vec4 nL = texture2D(uNoise, wp * 0.0019);
          vec4 nM = texture2D(uNoise, wp * 0.017);
          vec4 nS = texture2D(uNoise, wp * 0.13);
          float slope = 1.0 - vWNrm.y;
          float rk = slope + (nM.g - 0.5) * 0.28 + (nL.r - 0.5) * 0.16 - vPiste;
          gRock = smoothstep(0.44, 0.58, rk);
          // snow ledges on rock faces
          gRock *= 1.0 - smoothstep(0.62, 0.75, nS.b + (0.55 - slope));
          vec3 snow = vec3(0.93, 0.955, 1.0);
          snow *= 0.955 + 0.06 * nM.r + 0.025 * nS.g;
          // wind-packed patches pick up a faint blue cast, fresh drifts are brighter
          snow = mix(snow, vec3(0.86, 0.91, 1.0), smoothstep(0.55, 0.8, nL.b) * 0.5 * (1.0 - vPiste));
          // groomed piste: compacted, slightly grey bands from the groomer passes
          float band = abs(fract(wp.x / 4.6 + nL.g * 0.6) - 0.5);
          snow *= 1.0 - vPiste * (0.035 + 0.025 * smoothstep(0.42, 0.5, band));
          vec3 rock = mix(vec3(0.085, 0.08, 0.08), vec3(0.23, 0.21, 0.2), nS.r);
          rock = mix(rock, vec3(0.30, 0.26, 0.22), smoothstep(0.6, 0.8, nM.a) * 0.6);
          diffuseColor.rgb = mix(snow, rock, gRock);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(mix(0.66, 0.5, vPiste), 0.85, gRock);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 wp = vWPos.xz;
          float dist = length(cameraPosition - vWPos);
          vec3 nW = normalize(vWNrm);
          // wind ripples (sastrugi) off piste
          float e = 1.0 / 256.0;
          vec2 u1 = vec2(wp.x * 0.07 + wp.y * 0.02, wp.y * 0.09);
          float h0 = texture2D(uNoise, u1).a, hx = texture2D(uNoise, u1 + vec2(e, 0.)).a, hz = texture2D(uNoise, u1 + vec2(0., e)).a;
          vec2 g = vec2(h0 - hx, h0 - hz) * (1.0 - vPiste) * 1.3 * (1.0 - smoothstep(60.0, 260.0, dist));
          // fine crust
          vec2 u2 = wp * 0.55;
          float f0 = texture2D(uNoise, u2).b, fx = texture2D(uNoise, u2 + vec2(e, 0.)).b, fz = texture2D(uNoise, u2 + vec2(0., e)).b;
          g += vec2(f0 - fx, f0 - fz) * 0.9 * (1.0 - smoothstep(10.0, 45.0, dist));
          // groomer corduroy runs down the fall line
          float cw = wp.x * 6.2832 / 0.075;
          float fade = 1.0 - smoothstep(0.05, 0.22, fwidth(cw) / 6.2832);
          g.x += cos(cw) * 0.045 * vPiste * fade;
          // rock gets coarser relief
          vec2 u3 = wp * 0.21;
          float r0 = texture2D(uNoise, u3).r, rx = texture2D(uNoise, u3 + vec2(e, 0.)).r, rz = texture2D(uNoise, u3 + vec2(0., e)).r;
          g += vec2(r0 - rx, r0 - rz) * gRock * 6.0;
          nW = normalize(nW + vec3(g.x, 0.0, g.y) * 2.2);
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          // sun glints: tiny ice facets catching the sun
          float sh = 1.0;
          #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
            DirectionalLightShadow dls = directionalLightShadows[0];
            sh = getShadow(directionalShadowMap[0], dls.shadowMapSize, dls.shadowIntensity, dls.shadowBias, dls.shadowRadius, vDirectionalShadowCoord[0]);
          #endif
          float dist = length(cameraPosition - vWPos);
          vec2 cell = floor(vWPos.xz * 26.0);
          float r = hash12(cell);
          if (r > 0.93 && dist < 70.0) {
            vec3 gn = normalize(vec3(hash12(cell + 3.1) - 0.5, 0.9, hash12(cell + 9.7) - 0.5));
            vec3 V = normalize(cameraPosition - vWPos);
            vec3 H = normalize(V + uSunDir);
            float s = pow(max(dot(gn, H), 0.0), 900.0);
            vec2 fc = fract(vWPos.xz * 26.0) - 0.5;
            s *= smoothstep(0.32, 0.0, length(fc));
            reflectedLight.directSpecular += uSunCol * s * 26.0 * sh * (1.0 - gRock) * (1.0 - smoothstep(25.0, 70.0, dist));
          }
          // a whisper of subsurface blue in the shade
          reflectedLight.indirectDiffuse += vec3(0.010, 0.018, 0.04) * (1.0 - sh) * (1.0 - gRock);
        }`);
  };
  return mat;
}

function pisteWeight(x, z) {
  const hw = halfWidth(z);
  const adx = Math.abs(x - centerX(z));
  return 1 - smoothstep(hw - 3, hw + 6, adx);
}

function buildChunkGeometry(cx, cz, segs) {
  const step = CHUNK / segs;
  const n = segs + 1;
  const gn = n + 2; // one-sample border for normals
  const H = new Float32Array(gn * gn);
  for (let j = 0; j < gn; j++) for (let i = 0; i < gn; i++) {
    H[j * gn + i] = heightAt(cx + (i - 1) * step, cz + (j - 1) * step);
  }
  const vCount = n * n + 4 * n;
  const pos = new Float32Array(vCount * 3);
  const nrm = new Float32Array(vCount * 3);
  const pst = new Float32Array(vCount);
  let v = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = cx + i * step, z = cz + j * step;
    const k = (j + 1) * gn + (i + 1);
    const hx = H[k + 1] - H[k - 1], hz = H[k + gn] - H[k - gn];
    let nx = -hx, ny = 2 * step, nz = -hz;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    pos[v * 3] = x; pos[v * 3 + 1] = H[k]; pos[v * 3 + 2] = z;
    nrm[v * 3] = nx; nrm[v * 3 + 1] = ny; nrm[v * 3 + 2] = nz;
    pst[v] = pisteWeight(x, z);
    v++;
  }
  const idx = [];
  for (let j = 0; j < segs; j++) for (let i = 0; i < segs; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // skirts hide cracks between neighbouring LODs
  const drop = step * 1.5 + 1.5;
  const edges = [];
  for (let i = 0; i < n; i++) edges.push(i); // north
  const sides = [
    Array.from({ length: n }, (_, i) => i),
    Array.from({ length: n }, (_, i) => (n - 1) * n + i),
    Array.from({ length: n }, (_, j) => j * n),
    Array.from({ length: n }, (_, j) => j * n + n - 1),
  ];
  const flips = [false, true, true, false];
  sides.forEach((side, s) => {
    const base = v;
    for (const k of side) {
      pos[v * 3] = pos[k * 3]; pos[v * 3 + 1] = pos[k * 3 + 1] - drop; pos[v * 3 + 2] = pos[k * 3 + 2];
      nrm[v * 3] = nrm[k * 3]; nrm[v * 3 + 1] = nrm[k * 3 + 1]; nrm[v * 3 + 2] = nrm[k * 3 + 2];
      pst[v] = pst[k];
      v++;
    }
    for (let i = 0; i < n - 1; i++) {
      const a = side[i], b = side[i + 1], c = base + i, d = base + i + 1;
      if (flips[s]) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aPiste', new THREE.BufferAttribute(pst, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export class Terrain {
  constructor(scene, env) {
    this.scene = scene;
    this.material = makeSnowMaterial(env);
    this.chunks = [];
    for (let cz = Z0; cz < Z1; cz += CHUNK) for (let cx = -NEAR_X; cx < NEAR_X; cx += CHUNK) {
      const mesh = new THREE.Mesh(undefined, this.material);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.chunks.push({ cx, cz, lod: -1, want: 3, geos: [], mesh });
    }
    this.buildFar();
  }

  // surrounding ranges: a finer middle ring and a coarse outer ring, each sunk
  // under the finer mesh it surrounds
  buildFar() {
    const ring = (S, X0, X1, ZA, ZB, holeX, holeZ0, holeZ1) => {
      const nx = Math.floor((X1 - X0) / S) + 1, nz = Math.floor((ZB - ZA) / S) + 1;
      const pos = new Float32Array(nx * nz * 3);
      const pst = new Float32Array(nx * nz);
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const x = X0 + i * S, z = ZA + j * S;
        let y = heightAt(x, z);
        if (x > -holeX + S && x < holeX - S && z > holeZ0 + S && z < holeZ1 - S) y -= 40;
        const k = (j * nx + i) * 3;
        pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      }
      const idx = [];
      for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aPiste', new THREE.BufferAttribute(pst, 1));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.material);
      m.matrixAutoUpdate = false;
      this.scene.add(m);
      return m;
    };
    this.mid = ring(36, -5200, 5200, -4400, 8800, NEAR_X, Z0, Z1);
    this.far = ring(160, -16000, 16000, -14000, 19000, 5200, -4400, 8800);
  }

  lodFor(c, px, pz) {
    const dx = Math.max(Math.abs(px - (c.cx + CHUNK / 2)) - CHUNK / 2, 0);
    const dz = Math.max(Math.abs(pz - (c.cz + CHUNK / 2)) - CHUNK / 2, 0);
    const d = Math.hypot(dx, dz);
    let l = 0;
    while (l < LOD_DIST.length && d > LOD_DIST[l]) l++;
    return l;
  }

  // build everything coarse up front (fast), then refine around the camera
  prime(px, pz) {
    for (const c of this.chunks) {
      c.want = this.lodFor(c, px, pz);
      const l = Math.max(c.want, 2);
      this.ensure(c, l);
      this.show(c, l);
    }
    this.update(px, pz, 1e9);
  }

  ensure(c, l) {
    if (!c.geos[l]) c.geos[l] = buildChunkGeometry(c.cx, c.cz, LODS[l]);
    return c.geos[l];
  }

  show(c, l) {
    if (c.lod === l) return;
    c.mesh.geometry = c.geos[l];
    if (c.lod === -1) this.scene.add(c.mesh);
    c.lod = l;
  }

  update(px, pz, budgetMs = 5) {
    const t0 = performance.now();
    // nearest-first refinement
    const pending = [];
    for (const c of this.chunks) {
      c.want = this.lodFor(c, px, pz);
      if (c.lod !== c.want) {
        if (c.geos[c.want]) this.show(c, c.want);
        else pending.push(c);
      }
    }
    pending.sort((a, b) => a.want - b.want);
    for (const c of pending) {
      if (performance.now() - t0 > budgetMs) break;
      this.ensure(c, c.want);
      this.show(c, c.want);
    }
    // free very fine geometry we've moved far from
    for (const c of this.chunks) {
      if (c.geos[0] && c.want >= 2 && c.lod !== 0) { c.geos[0].dispose(); c.geos[0] = null; }
    }
  }
}
