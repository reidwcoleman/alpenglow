// Chunked, distance-LOD terrain mesh over the shared height function, plus a
// coarse far mesh for the surrounding ranges. The snow material adds wind
// ripples, groomer corduroy, exposed rock on steep faces and sun glints.
import * as THREE from 'three';
import { heightAt, PARK_ID, EXTENT_Z } from './course.js';
import { buildChunkArrays } from './chunkbuild.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LO } from './gfx.js';
import { makeSimplex, smoothstep } from './noise.js';

export const CHUNK = 128;
const NEAR_X = 896; // half extent of the chunked region
const Z0 = -640, Z1 = Math.ceil(EXTENT_Z / 128) * 128;
const MID_Z1 = Math.max(8800, Z1 + 4300), FAR_Z1 = Math.max(19000, MID_Z1 + 10200);
const LODS = [96, 48, 24, 12];
const LOD_DIST = [190, 430, 950];

// tileable multi-channel noise texture used by the snow/rock shader (its texels are worked out
// on a loading thread when there is one: fill() puts them in)
function makeNoiseTexture(size = 256) {
  const tex = new THREE.DataTexture(new Uint8Array(size * size * 4), size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.fill = (data) => { tex.image.data.set(data); tex.needsUpdate = true; tex.filled = true; };
  return tex;
}

export const noiseTex = makeNoiseTexture();

// cloud shadows drifting over the mountain: x how dark (0 on a grey day), yz how far they've blown
export const CLOUDS = { value: new THREE.Vector4(0, 0, 0, 0) };
// (GLSL: how much sun gets through the clouds at a world xz)
export const CLOUD_GLSL = `
  float cloudSun(vec2 wp) {
    if (uClouds.x < 0.01) return 1.0;
    vec2 q = wp + uClouds.yz;
    float cl = texture2D(uNoise, q / 1400.0).r * 0.62 + texture2D(uNoise, q / 420.0 + 0.31).g * 0.38;
    return 1.0 - uClouds.x * smoothstep(0.5, 0.64, cl);
  }`;

// scanned PBR textures (Poly Haven, CC0; tools/build_assets.py)
const TEX = import.meta.env.BASE_URL + (LO ? 'tex/lo/' : 'tex/');
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
    // the day's snow: x fresh (covers the corduroy), y wet (spring slush), z hard (ice)
    uCond: { value: new THREE.Vector3() },
    uClouds: CLOUDS,
    // where the chunk LODs are chosen from, and the distances they switch at
    uCamXZ: { value: new THREE.Vector2() },
    uLodD: { value: new THREE.Vector4(LOD_DIST[0], LOD_DIST[1], LOD_DIST[2], 1e9) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, mat.userData.shared);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aPiste; attribute float aIce; attribute vec2 aMorph; uniform vec2 uCamXZ; uniform vec4 uLodD;
        varying vec3 vWPos; varying vec3 vWNrm; varying float vPiste; varying float vIce;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // geomorph: toward the switch distance a chunk eases into the coarser level's shape
        if (aMorph.y > 0.5) {
          float l = aMorph.y - 1.0;
          float far = l < 0.5 ? uLodD.x : l < 1.5 ? uLodD.y : uLodD.z;
          float near = l < 0.5 ? 0.0 : l < 1.5 ? uLodD.x : uLodD.y;
          float d = distance(position.xz, uCamXZ);
          transformed.y = mix(position.y, aMorph.x, smoothstep(far - (far - near) * 0.45, far - 4.0, d));
        }`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNrm = normalize(mat3(modelMatrix) * objectNormal);
        vPiste = aPiste; vIce = aIce;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        #define OLD_LAYERS ${LO ? 2 : 3}
        uniform sampler2D uNoise; uniform vec3 uSunDir; uniform vec3 uSunCol;
        uniform sampler2D uSnowC, uSnowN, uSnowR, uRockC, uRockN, uRockR; uniform vec3 uCond; uniform vec4 uClouds;
        ${CLOUD_GLSL}
        varying vec3 vWPos; varying vec3 vWNrm; varying float vPiste; varying float vIce;
        // fresh snow covers the grooming
        float pk() { return vPiste * (1.0 - uCond.x * 0.85); }
        float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float gRock; float gSnowRough; float gRockRough; vec2 gSnowUv1; vec2 gSnowUv2; float gSnowMix; vec3 gTriW;
        float gOld; float gOldG;
        // the lines earlier riders left: in lanes down the fall line, each a pair of carved
        // grooves (or one wide one) swinging through its turns, broken where it was skied over.
        // Returns the groove (0..1) in x and its slope across in y.
        vec2 oldTracks(vec2 wp, float dens, float px) {
          vec2 acc = vec2(0.0);
          for (int i = 0; i < OLD_LAYERS; i++) {
            float fi = float(i);
            float lane = 6.5 + fi * 2.9;
            vec2 q = wp + vec2(fi * 3.7, fi * 37.0);
            float cell = floor(q.x / lane);
            float r = hash12(vec2(cell, fi * 7.1));
            if (r > dens) continue;
            float r2 = hash12(vec2(cell + 3.3, fi)), r3 = hash12(vec2(cell, fi + 9.9));
            float wl = 11.0 + r2 * 17.0, amp = (0.8 + r3 * 2.2) * (lane * 0.18), ph = r * 40.0;
            float a = q.y * 6.2832 / wl + ph;
            float cx = (cell + 0.5) * lane + sin(a) * amp;
            float sl = cos(a) * amp * 6.2832 / wl;
            float d = (q.x - cx) / sqrt(1.0 + sl * sl);
            // the line comes and goes: skied over, filled in
            float on = smoothstep(0.35, 0.6, texture2D(uNoise, vec2(q.y * 0.004 + cell * 0.37, fi * 0.3 + cell * 0.11)).r);
            if (on < 0.01) continue;
            // (a pixel wider than a groove: its average instead of a shimmer)
            float w = max(0.024, px * 0.7);
            float k = 0.024 / w;
            float g1 = exp(-pow((d - 0.1) / w, 2.0)), g2 = exp(-pow((d + 0.1) / w, 2.0));
            float gg = (g1 + g2) * k * on;
            float dg = (-2.0 * (d - 0.1) / (w * w) * g1 - 2.0 * (d + 0.1) / (w * w) * g2) * k * on;
            acc += vec2(gg, dg);
          }
          return acc;
        }
        mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 wp = vWPos.xz;
          float dist = length(cameraPosition - vWPos);
          vec4 nL = texture2D(uNoise, wp * 0.0019);
          vec4 nM = texture2D(uNoise, wp * 0.017);
          vec4 nS = texture2D(uNoise, wp * 0.13);
          float slope = 1.0 - vWNrm.y;
          float rk = slope + (nM.g - 0.5) * 0.28 + (nL.r - 0.5) * 0.16 - pk();
          gRock = smoothstep(0.44, 0.58, rk);
          gRock *= 1.0 - smoothstep(0.62, 0.75, nS.b + (0.55 - slope)); // snow ledges on rock faces
          // snow-filled gullies streaking down the faces: noise stretched along the fall line
          if (gRock > 0.01) {
            vec3 tw = pow(abs(normalize(vWNrm)), vec3(4.0));
            tw /= tw.x + tw.y + tw.z;
            // projected on the world planes (stable), stretched tall: snow runs down the face
            // (warped sideways so they wander, and broken along their length into couloirs and patches)
            // (one shared warp from the noise already sampled: no extra lookups on the big faces)
            float wq = (nL.a - 0.5) * 1.6 + (nM.g - 0.5) * 0.25;
            float gully = texture2D(uNoise, vec2(vWPos.z * 0.012 + wq, vWPos.y * 0.0018)).g * tw.x
              + texture2D(uNoise, vec2(vWPos.x * 0.012 + wq, vWPos.y * 0.0018 + 0.37)).g * tw.z
              + 0.5 * tw.y;
            gully *= 0.8 + 0.4 * nM.a;
            gRock *= 1.0 - smoothstep(0.6, 0.72, gully) * smoothstep(0.5, 0.85, slope) * 0.8;
            // snow caught on every ledge and bench of a far face
            gRock *= 1.0 - smoothstep(0.55, 0.8, nM.b + (0.66 - slope) * 1.6) * smoothstep(300.0, 1200.0, dist) * 0.55;
          }
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
          snow = mix(snow, snow * vec3(0.9, 0.95, 1.0), smoothstep(0.55, 0.8, nL.b) * 0.4 * (1.0 - pk()));
          float band = abs(fract(wp.x / 4.6 + nL.g * 0.6) - 0.5);
          snow *= 1.0 - pk() * (0.03 + 0.02 * smoothstep(0.42, 0.5, band));
          // fresh corduroy: groomer ribs down the fall line, each pass a touch brighter or duller
          float pass = floor(wp.x / 4.6 + nL.g * 0.6);
          snow *= 1.0 + smoothstep(0.8, 1.0, pk()) * (fract(sin(pass * 12.9898) * 43758.5453) - 0.5) * 0.05;
          float rib = wp.x * 6.2832 / 0.21;
          float ribFade = 1.0 - smoothstep(0.12, 0.45, fwidth(rib) / 6.2832);
          snow *= 1.0 + smoothstep(0.8, 1.0, pk()) * ribFade * 0.028 * sin(rib) * (0.7 + 0.3 * nM.b);
          gSnowRough = mix(texture2D(uSnowR, gSnowUv1).g, texture2D(uSnowR, gSnowUv2).g, gSnowMix);
          // earlier riders' lines (more on the piste, fewer under fresh snow; the ice is scraped bare)
          gOld = 0.0; gOldG = 0.0;
          if (dist < 110.0) {
            float px = length(fwidth(wp));
            vec2 ot = oldTracks(wp, mix(0.3, 0.62, vPiste) * (1.0 - uCond.x * 0.55), px);
            float fo = (1.0 - smoothstep(55.0, 110.0, dist)) * (1.0 - gRock) * (1.0 - vIce);
            gOld = clamp(ot.x, 0.0, 1.0) * fo; gOldG = ot.y * fo;
            snow *= 1.0 - gOld * 0.16;
          }
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
            // alpine limestone and gneiss: greyer and cooler than the scan
            rock = mix(rock, vec3(dot(rock, vec3(0.3, 0.45, 0.25))) * vec3(0.93, 0.96, 1.02), 0.55);
            // bedding: the layers of the rock in bands across the face, light and dark,
            // and rust-warm patches where water runs over it
            float sy = vWPos.y * 0.13 + nL.g * 5.5 + (vWPos.x + vWPos.z) * 0.004;
            float strata = 0.5 + 0.3 * sin(sy) + 0.2 * sin(sy * 2.7 + 1.3);
            rock *= 0.78 + 0.44 * strata;
            rock = mix(rock, rock * vec3(1.1, 0.97, 0.86), smoothstep(0.55, 0.8, nL.a) * 0.55);
            gRockRough = texture2D(uRockR, q.xz).g;
          }
          // spring slush: wet, a touch grey and glossy; hard days: a little bluer
          snow *= mix(vec3(1.0), vec3(0.86, 0.87, 0.88), uCond.y);
          snow *= mix(vec3(1.0), vec3(0.97, 0.985, 1.02), uCond.z);
          diffuseColor.rgb = mix(snow, rock, gRock);
          // scraped ice: grey-blue, polished
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.66, 0.72, 0.82), smoothstep(0.0, 0.6, vIce) * 0.4);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(mix(mix(0.52 + gSnowRough * 0.38, 0.64, pk() * 0.6) * (1.0 - 0.3 * uCond.y - 0.15 * uCond.z), gRockRough, gRock), 0.34, smoothstep(0.0, 0.6, vIce) * 0.7);`)
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
          g += vec2(sn.x, -sn.y) * mix(0.55, 0.32, pk());
          if (dist < 260.0) {
            vec2 u1 = vec2(wp.x * 0.07 + wp.y * 0.02, wp.y * 0.09);
            float h0 = texture2D(uNoise, u1).a, hx = texture2D(uNoise, u1 + vec2(e, 0.)).a, hz = texture2D(uNoise, u1 + vec2(0., e)).a;
            g += vec2(h0 - hx, h0 - hz) * (1.0 - pk()) * 1.3 * (1.0 - smoothstep(60.0, 260.0, dist));
            g.x += cos(cw) * 0.045 * pk() * fade;
            float rib = wp.x * 6.2832 / 0.21;
            g.x += cos(rib) * 0.075 * smoothstep(0.8, 1.0, pk()) * (1.0 - smoothstep(0.12, 0.45, fwidth(rib) / 6.2832));
          }
          g *= 1.0 - gRock;
          g *= 1.0 - vIce * 0.85;
          // the old grooves' walls
          g.x += clamp(gOldG * 0.012, -0.5, 0.5);
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
          // a cloud's shadow passing over
          float cs = cloudSun(vWPos.xz);
          reflectedLight.directDiffuse *= cs; reflectedLight.directSpecular *= cs;
          sh *= cs;
          float dist = length(cameraPosition - vWPos);
          vec2 cell = floor(vWPos.xz * 26.0);
          float r = hash12(cell);
          if (r > 0.955 - 0.025 * uCond.x && dist < 60.0 && vIce < 0.3) {
            vec3 gn = normalize(vec3(hash12(cell + 3.1) - 0.5, 0.9, hash12(cell + 9.7) - 0.5));
            vec3 V = normalize(cameraPosition - vWPos);
            vec3 H = normalize(V + uSunDir);
            float s = pow(max(dot(gn, H), 0.0), 900.0);
            vec2 fc = fract(vWPos.xz * 26.0) - 0.5;
            s *= smoothstep(0.32, 0.0, length(fc));
            reflectedLight.directSpecular += uSunCol * s * 9.0 * sh * agSun * (1.0 - gRock) * (1.0 - smoothstep(25.0, 70.0, dist));
          }
          // a whisper of subsurface blue in the shade
          reflectedLight.indirectDiffuse += vec3(0.016, 0.03, 0.068) * (1.0 - sh * agSun) * (1.0 - gRock);
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
  if (a.mor) g.setAttribute('aMorph', new THREE.BufferAttribute(a.mor, 2));
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
    // far off, a block of 4 x 4 coarse chunks is drawn as one mesh (a few hundred draws fewer)
    const blocks = new Map();
    for (const c of this.chunks) {
      const k = Math.floor((c.cx + NEAR_X) / (CHUNK * 4)) + ',' + Math.floor((c.cz - Z0) / (CHUNK * 4));
      if (!blocks.has(k)) blocks.set(k, { chunks: [], mesh: null, on: false });
      blocks.get(k).chunks.push(c);
    }
    this.blocks = [...blocks.values()];
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

  // the day's snow (sky.js COND) on the shader
  setCondition(c) { this.material.userData.shared.uCond.value.set(c.fresh ?? 0, c.wet ?? 0, c.ice ? 1 : 0); }

  // surrounding ranges: a finer middle ring and a coarse outer ring, each sunk
  // under the finer mesh it surrounds
  static RINGS = [[36, -5200, 5200, -4400, MID_Z1, NEAR_X, Z0, Z1], [160, -16000, 16000, -14000, FAR_Z1, 5200, -4400, MID_Z1]];
  buildRing(a) {
    const n = a.nx * a.nz;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
    g.setAttribute('aPiste', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aIce', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setIndex(new THREE.BufferAttribute(a.idx, 1));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.material);
    m.matrixAutoUpdate = false;
    this.scene.add(m);
    return m;
  }

  lodFor(c, px, pz) {
    const dx = Math.max(Math.abs(px - (c.cx + CHUNK / 2)) - CHUNK / 2, 0);
    const dz = Math.max(Math.abs(pz - (c.cz + CHUNK / 2)) - CHUNK / 2, 0);
    const d = Math.hypot(dx, dz);
    let l = 0;
    while (l < LOD_DIST.length && d > LOD_DIST[l]) l++;
    return l;
  }

  // build everything coarse up front, then refine around the camera: the whole lot as jobs for
  // the loading threads (pool.js), the snow's noise texture and the far ranges with them
  async prime(px, pz, pool, onProgress) {
    const L = LODS.length - 1;
    const jobs = [];
    let done = 0;
    const tick = () => onProgress?.(++done / jobs.length);
    if (!noiseTex.filled) jobs.push(pool.job({ kind: 'noise', size: 256 }).then((r) => noiseTex.fill(r.data)));
    jobs.push(...Terrain.RINGS.map((args, i) => pool.job({ kind: 'ring', args }).then((r) => { this[i ? 'far' : 'mid'] = this.buildRing(r); })));
    for (const c of this.chunks) {
      c.want = this.lodFor(c, px, pz);
      for (const l of new Set([Math.max(c.want, 2), L])) {
        jobs.push(pool.job({ kind: 'chunk', cx: c.cx, cz: c.cz, segs: LODS[l], size: CHUNK, lod: l, coarsest: l === L }).then((r) => { c.geos[l] = toGeometry(r); }));
      }
    }
    for (const j of jobs) j.then(tick);
    await Promise.all(jobs);
    for (const c of this.chunks) this.show(c, Math.max(c.want, 2));
    for (const b of this.blocks) {
      const g = mergeGeometries(b.chunks.map((c) => c.geos[L]));
      g.computeBoundingSphere();
      b.mesh = new THREE.Mesh(g, this.material);
      b.mesh.receiveShadow = true; b.mesh.matrixAutoUpdate = false; b.mesh.visible = false;
      this.scene.add(b.mesh);
    }
    this.update(px, pz, 1e9);
  }

  // build (not show) the chunks round (x, z) at the detail they'll want there: the chairlift
  // ride does this for where you'll drop in. warmDone: how much of it is ready
  warm(x, z, budgetMs = 3) {
    const t0 = performance.now();
    let want = 0, have = 0;
    for (const c of this.chunks) {
      if (Math.abs(c.cx + CHUNK / 2 - x) > 520 || Math.abs(c.cz + CHUNK / 2 - z) > 520) continue;
      const l = this.lodFor(c, x, z);
      want++;
      if (c.geos[l]) { have++; continue; }
      if (performance.now() - t0 < budgetMs) { this.ensure(c, l); have++; }
    }
    this.warmDone = want ? have / want : 1;
  }

  ensure(c, l) {
    if (!c.geos[l]) c.geos[l] = toGeometry(buildChunkArrays(c.cx, c.cz, LODS[l], CHUNK, l, l === LODS.length - 1));
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
    this.material.userData.shared.uCamXZ.value.set(px, pz);
    // the clouds blow up the valley
    const t = performance.now() / 1000;
    CLOUDS.value.y = t * 6.5; CLOUDS.value.z = t * 4.2;
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
        this.worker.postMessage({ id, cx: c.cx, cz: c.cz, segs: LODS[c.want], size: CHUNK, lod: c.want, coarsest: c.want === LODS.length - 1 });
        continue;
      }
      if (performance.now() - t0 > budgetMs) break;
      this.ensure(c, c.want);
      this.show(c, c.want);
    }
    // whole blocks out at the coarsest detail: their one mesh instead of the sixteen
    const L = LODS.length - 1;
    for (const b of this.blocks) {
      if (!b.mesh) continue;
      const on = b.chunks.every((c) => c.want === L);
      if (on === b.on) continue;
      b.on = on;
      b.mesh.visible = on;
      for (const c of b.chunks) c.mesh.visible = !on;
    }
    // free very fine geometry we've moved far from
    for (const c of this.chunks) {
      if (c.geos[0] && c.want >= 2 && c.lod !== 0) { c.geos[0].dispose(); c.geos[0] = null; }
    }
  }
}
