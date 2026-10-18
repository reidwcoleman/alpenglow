// Chunked, distance-LOD terrain mesh over the shared height function, plus a
// coarse far mesh for the surrounding ranges. The snow material adds wind
// ripples, groomer corduroy, exposed rock on steep faces and sun glints.
import * as THREE from 'three';
import { heightAt, PARK_ID } from './course.js';
import { buildChunkArrays } from './chunkbuild.js';
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

// scanned PBR textures (Poly Haven, CC0; tools/build_assets.py)
const TEX = import.meta.env.BASE_URL + 'tex/';
const texLoader = new THREE.TextureLoader();
export function pbr(name, srgb) {
  const t = texLoader.load(TEX + name);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 16;
  return t;
}

export function makeSnowMaterial(env) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0 });
  mat.userData.shared = {
    uNoise: { value: noiseTex },
    uSunDir: { value: env.sunDir },
    uSunCol: { value: env.sun.color },
    uSnowC: { value: pbr('snow_02_c.webp', true) },
    uSnowN: { value: pbr('snow_02_n.webp', false) },
    uSnowR: { value: pbr('snow_02_arm.webp', false) },
    uRockC: { value: pbr('rock_face_04_c.webp', true) },
    uRockN: { value: pbr('rock_face_04_n.webp', false) },
    uRockR: { value: pbr('rock_face_04_arm.webp', false) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, mat.userData.shared);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aPiste; attribute float aIce;
        varying vec3 vWPos; varying vec3 vWNrm; varying float vPiste; varying float vIce;`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNrm = normalize(mat3(modelMatrix) * objectNormal);
        vPiste = aPiste; vIce = aIce;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uNoise; uniform vec3 uSunDir; uniform vec3 uSunCol;
        uniform sampler2D uSnowC, uSnowN, uSnowR, uRockC, uRockN, uRockR;
        varying vec3 vWPos; varying vec3 vWNrm; varying float vPiste; varying float vIce;
        float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float gRock; float gSnowRough; float gRockRough; vec2 gSnowUv1; vec2 gSnowUv2; float gSnowMix; vec3 gTriW;
        mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }`)
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
          gRock *= 1.0 - smoothstep(0.62, 0.75, nS.b + (0.55 - slope)); // snow ledges on rock faces
          // scanned snow at two scales, the larger one turned so the repeats never line up
          gSnowUv1 = wp / 3.1;
          gSnowUv2 = rot2(0.61) * wp / 13.7;
          gSnowMix = clamp(0.35 + (nM.r - 0.5) * 1.4 + smoothstep(40.0, 160.0, dist) * 0.5, 0.0, 1.0);
          vec3 sc1 = texture2D(uSnowC, gSnowUv1).rgb, sc2 = texture2D(uSnowC, gSnowUv2).rgb;
          vec3 sTex = mix(sc1, sc2, gSnowMix);
          // (the scan has dark drag marks in its albedo: keep its grain, drop the marks)
          float sl = dot(sTex, vec3(0.3333));
          sTex *= (0.39 + clamp(sl - 0.39, -0.035, 0.04)) / max(sl, 1e-3);
          // the scan is a little grey: lift it to fresh-snow albedo, keep its relief
          vec3 snow = clamp(sTex * 1.18, 0.0, 1.0) * vec3(0.97, 0.985, 1.0);
          snow = mix(snow, vec3(0.92, 0.94, 0.97), smoothstep(150.0, 600.0, dist) * 0.6);
          snow = mix(snow, snow * vec3(0.9, 0.95, 1.0), smoothstep(0.55, 0.8, nL.b) * 0.4 * (1.0 - vPiste));
          float band = abs(fract(wp.x / 4.6 + nL.g * 0.6) - 0.5);
          snow *= 1.0 - vPiste * (0.03 + 0.02 * smoothstep(0.42, 0.5, band));
          // fresh corduroy: groomer ribs down the fall line, each pass a touch brighter or duller
          float pass = floor(wp.x / 4.6 + nL.g * 0.6);
          snow *= 1.0 + smoothstep(0.8, 1.0, vPiste) * (fract(sin(pass * 12.9898) * 43758.5453) - 0.5) * 0.05;
          float rib = wp.x * 6.2832 / 0.21;
          float ribFade = 1.0 - smoothstep(0.12, 0.45, fwidth(rib) / 6.2832);
          snow *= 1.0 + smoothstep(0.8, 1.0, vPiste) * ribFade * 0.028 * sin(rib) * (0.7 + 0.3 * nM.b);
          gSnowRough = mix(texture2D(uSnowR, gSnowUv1).g, texture2D(uSnowR, gSnowUv2).g, gSnowMix);
          // scanned rock, triplanar so cliffs don't smear
          vec3 rock = vec3(0.2);
          gRockRough = 0.8;
          gTriW = pow(abs(normalize(vWNrm)), vec3(4.0));
          gTriW /= (gTriW.x + gTriW.y + gTriW.z);
          if (gRock > 0.01) {
            vec3 q = vWPos / 9.0;
            rock = texture2D(uRockC, q.zy).rgb * gTriW.x + texture2D(uRockC, q.xz).rgb * gTriW.y + texture2D(uRockC, q.xy).rgb * gTriW.z;
            vec3 q2 = vWPos / 41.0;
            rock *= 0.75 + 0.5 * (texture2D(uRockC, q2.zy + 0.3).r * gTriW.x + texture2D(uRockC, q2.xz + 0.3).r * gTriW.y + texture2D(uRockC, q2.xy + 0.3).r * gTriW.z);
            rock = mix(rock, rock * vec3(0.85, 0.9, 1.0), 0.3);
            gRockRough = texture2D(uRockR, q.xz).g;
          }
          diffuseColor.rgb = mix(snow, rock, gRock);
          // scraped ice: grey-blue, polished
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.50, 0.58, 0.70), smoothstep(0.0, 0.6, vIce) * 0.9);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(mix(mix(0.35 + gSnowRough * 0.5, 0.45, vPiste * 0.5), gRockRough, gRock), 0.18, smoothstep(0.0, 0.6, vIce));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 wp = vWPos.xz;
          float dist = length(cameraPosition - vWPos);
          vec3 nW = normalize(vWNrm);
          float e = 1.0 / 256.0;
          vec2 g = vec2(0.0);
          float cw = wp.x * 6.2832 / 0.075;
          float fade = 1.0 - smoothstep(0.05, 0.22, fwidth(cw) / 6.2832);
          // scanned snow relief
          vec2 n1 = texture2D(uSnowN, gSnowUv1).xy * 2.0 - 1.0;
          vec2 n2 = rot2(-0.61) * (texture2D(uSnowN, gSnowUv2).xy * 2.0 - 1.0);
          vec2 sn = mix(n1, n2, gSnowMix) * (1.0 - smoothstep(60.0, 380.0, dist) * 0.7);
          g += vec2(sn.x, -sn.y) * mix(0.55, 0.32, vPiste);
          if (dist < 260.0) {
            vec2 u1 = vec2(wp.x * 0.07 + wp.y * 0.02, wp.y * 0.09);
            float h0 = texture2D(uNoise, u1).a, hx = texture2D(uNoise, u1 + vec2(e, 0.)).a, hz = texture2D(uNoise, u1 + vec2(0., e)).a;
            g += vec2(h0 - hx, h0 - hz) * (1.0 - vPiste) * 1.3 * (1.0 - smoothstep(60.0, 260.0, dist));
            g.x += cos(cw) * 0.045 * vPiste * fade;
            float rib = wp.x * 6.2832 / 0.21;
            g.x += cos(rib) * 0.075 * smoothstep(0.8, 1.0, vPiste) * (1.0 - smoothstep(0.12, 0.45, fwidth(rib) / 6.2832));
          }
          g *= 1.0 - gRock;
          g *= 1.0 - vIce * 0.85;
          nW = normalize(nW + vec3(g.x, 0.0, g.y) * 1.6);
          if (gRock > 0.01) {
            vec3 q = vWPos / 9.0;
            vec2 tx = texture2D(uRockN, q.zy).xy * 2.0 - 1.0;
            vec2 ty = texture2D(uRockN, q.xz).xy * 2.0 - 1.0;
            vec2 tz = texture2D(uRockN, q.xy).xy * 2.0 - 1.0;
            vec3 rn = vec3(0.0, tx.y, tx.x) * gTriW.x + vec3(ty.x, 0.0, -ty.y) * gTriW.y + vec3(tz.x, tz.y, 0.0) * gTriW.z;
            nW = normalize(nW + rn * gRock * 1.4);
          }
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
          if (r > 0.93 && dist < 70.0 && vIce < 0.3) {
            vec3 gn = normalize(vec3(hash12(cell + 3.1) - 0.5, 0.9, hash12(cell + 9.7) - 0.5));
            vec3 V = normalize(cameraPosition - vWPos);
            vec3 H = normalize(V + uSunDir);
            float s = pow(max(dot(gn, H), 0.0), 900.0);
            vec2 fc = fract(vWPos.xz * 26.0) - 0.5;
            s *= smoothstep(0.32, 0.0, length(fc));
            reflectedLight.directSpecular += uSunCol * s * 26.0 * sh * agSun * (1.0 - gRock) * (1.0 - smoothstep(25.0, 70.0, dist));
          }
          // a whisper of subsurface blue in the shade
          reflectedLight.indirectDiffuse += vec3(0.010, 0.018, 0.04) * (1.0 - sh * agSun) * (1.0 - gRock);
        }`);
  };
  return mat;
}

function toGeometry(a) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.nrm, 3));
  g.setAttribute('aPiste', new THREE.BufferAttribute(a.pst, 1));
  g.setAttribute('aIce', new THREE.BufferAttribute(a.ice, 1));
  g.setIndex(new THREE.BufferAttribute(a.idx, 1));
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
    // fine chunks are built off the main thread
    this.inflight = new Map();
    try {
      this.worker = new Worker(new URL('./terrainWorker.js', import.meta.url), { type: 'module', name: 'park=' + PARK_ID });
      this.worker.onmessage = (e) => {
        const job = this.inflight.get(e.data.id);
        this.inflight.delete(e.data.id);
        if (!job) return;
        const { c, l } = job;
        if (!c.geos[l]) c.geos[l] = toGeometry(e.data);
        if (c.want === l) this.show(c, l);
      };
    } catch { this.worker = null; }
    this.jobId = 0;
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
      g.setAttribute('aIce', new THREE.BufferAttribute(new Float32Array(nx * nz), 1));
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
    if (!c.geos[l]) c.geos[l] = toGeometry(buildChunkArrays(c.cx, c.cz, LODS[l], CHUNK));
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
      if (this.worker) {
        if (this.inflight.size >= 6) break;
        const key = c.cx + ',' + c.cz + ',' + c.want;
        if ([...this.inflight.values()].some((j) => j.key === key)) continue;
        const id = ++this.jobId;
        this.inflight.set(id, { c, l: c.want, key });
        this.worker.postMessage({ id, cx: c.cx, cz: c.cz, segs: LODS[c.want], size: CHUNK });
        continue;
      }
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
