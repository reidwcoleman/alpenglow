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
        attribute float aPiste; attribute float aIce; attribute float aWind; attribute float aFace; varying float vFace; attribute vec2 aMorph; uniform vec2 uCamXZ; uniform vec4 uLodD;
        varying vec3 vWPos; varying vec3 vWNrm; varying float vPiste; varying float vIce; varying float vWind;`)
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
        vPiste = aPiste; vIce = aIce; vWind = aWind; vFace = aFace;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        #define OLD_LAYERS ${LO ? 2 : 3}
        #define SNOW_HQ ${LO ? 0 : 1}
        uniform sampler2D uNoise; uniform vec3 uSunDir; uniform vec3 uSunCol;
        uniform sampler2D uSnowC, uSnowN, uSnowR, uRockC, uRockN, uRockR; uniform vec3 uCond; uniform vec4 uClouds;
        ${CLOUD_GLSL}
        varying vec3 vWPos; varying vec3 vWNrm; varying float vPiste; varying float vIce; varying float vWind; varying float vFace;
        // the prevailing wind (blowing toward +x, a little down the valley) and across it
        const vec2 WD = vec2(0.9285, 0.3714);
        const vec2 WDP = vec2(-0.3714, 0.9285);
        // fresh snow covers the grooming
        float pk() { return vPiste * (1.0 - uCond.x * 0.85); }
        float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        vec3 hash32(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
        float gRock; float gRockRelief; vec3 gRockN; float gSnowRough; float gRockRough; vec2 gSnowUv1; vec2 gSnowUv2; float gSnowMix; vec3 gTriW;
        float gOld; float gOldG; float gExp; float gPx; vec4 gNS; vec4 gNM; vec4 gNL; vec3 gNW;
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
        mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
        float ssd(float x, float e0, float e1) { float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0); return 6.0 * t * (1.0 - t) / (e1 - e0); }
        // one field of sastrugi: lobes in bands down the wind. Returns height and its slope along
        // (y) and across (z) the wind, faded out where a pixel would cover a prow
        vec3 sastrugi(vec2 wp, float warp) {
          float a = dot(wp, WD), bb = (dot(wp, WDP) + warp) / 1.7;
          float band = floor(bb), fb = bb - band;
          float rb = hash12(vec2(band, 7.3));
          float L = 2.6 + rb * 4.5;
          float aa = a / L + rb * 13.7;
          float lobe = floor(aa), t = aa - lobe;
          vec3 rl = hash32(vec2(band * 1.7, lobe + 0.5));
          if (rl.x < 0.6) return vec3(0.0);
          float q = max(fwidth(aa) / 0.12, fwidth(bb) / 0.16);
          float fade = 1.0 - smoothstep(0.3, 0.8, q);
          if (fade < 0.01) return vec3(0.0);
          float w0 = 0.08 + 0.25 * rl.y, w1 = 0.92 - 0.25 * rl.z;
          float s1 = smoothstep(w0, w0 + 0.16, fb), s2 = smoothstep(w1 - 0.16, w1, fb);
          float c = s1 * (1.0 - s2), dc = ssd(fb, w0, w0 + 0.16) * (1.0 - s2) - s1 * ssd(fb, w1 - 0.16, w1);
          float rise = smoothstep(0.0, 0.12, t), fall = max(1.0 - t / 0.9, 0.0);
          float p = rise * fall, dp = ssd(t, 0.0, 0.12) * fall - rise * step(t, 0.9) / 0.9;
          float A = (0.06 + 0.08 * rl.y) * fade;
          return vec3(A * c * p, A * c * dp / L, A * dc * p / 1.7);
        }
        // one level of sun glints: in cells cs metres across, a few ice facets turned just so
        // (each a sharp point, there or not: never a grey smear)
        float glintLevel(vec2 wp, float cs, vec3 N, vec3 H, float salt, float rad) {
          vec2 q = wp / cs;
          vec2 c = floor(q);
          vec3 r = hash32(c + salt);
          // the facet: tipped up to ~40 degrees off the surface
          vec3 t = normalize(cross(N, vec3(0.0, 0.0, 1.0)));
          vec3 b = cross(N, t);
          vec2 tilt = (r.xy - 0.5) * 1.6;
          vec3 f = normalize(N + t * tilt.x + b * tilt.y);
          // aligned within ~2.3 degrees
          float s = smoothstep(0.9992, 0.99988, dot(f, H));
          // a point somewhere in its cell, about a pixel across, not the whole cell
          vec2 o = fract(q) - 0.25 - fract(r.zx * 7.31) * 0.5;
          s *= 1.0 - smoothstep(rad * 0.45, rad, length(o));
          return s;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 wp = vWPos.xz;
          float dist = length(cameraPosition - vWPos);
          vec4 nL = texture2D(uNoise, wp * 0.0019);
          vec4 nM = texture2D(uNoise, wp * 0.017);
          vec4 nS = texture2D(uNoise, wp * 0.13);
          gNL = nL; gNM = nM; gNS = nS;
          gPx = length(fwidth(wp));
          float slope = 1.0 - vWNrm.y;
          // (the wind scours its crests thin: rock shows through there first)
          float rk = slope + (nM.g - 0.5) * 0.28 + (nL.r - 0.5) * 0.16 - pk() + max(vWind, 0.0) * 0.13 * smoothstep(0.45, 0.7, nM.b);
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
          // how exposed to the wind: crests and windward slopes scoured and packed (crust,
          // ripples, sastrugi), hollows and lee slopes filled soft. Off the groomed runs only.
          float windward = dot(vWNrm.xz, -WD);
          gExp = smoothstep(0.3, 0.75, vWind * 0.55 + windward * 1.4 + (nL.b - 0.5) * 0.9 + (nM.a - 0.5) * 0.35 + 0.3) * (1.0 - pk()) * (1.0 - vIce);
          // scanned snow at two scales, the larger one turned so the repeats never line up
          gSnowUv1 = wp / 3.1;
          gSnowUv2 = rot2(0.61) * wp / 13.7;
          gSnowMix = clamp(0.35 + (nM.r - 0.5) * 1.4 + smoothstep(40.0, 160.0, dist) * 0.5, 0.0, 1.0);
          vec3 sc1 = texture2D(uSnowC, gSnowUv1).rgb, sc2 = texture2D(uSnowC, gSnowUv2).rgb;
          vec3 sTex = mix(sc1, sc2, gSnowMix);
          // (the scan has dark drag marks in its albedo: keep its grain, drop the marks)
          float sl = dot(sTex, vec3(0.3333));
          sTex *= (0.45 + clamp(sl - 0.45, -0.04, 0.045)) / max(sl, 1e-3);
          // the scan is a little grey: lift it to fresh-snow albedo, keep its relief
          vec3 snow = clamp(sTex * 1.18, 0.0, 1.0) * vec3(0.97, 0.985, 1.0);
          snow = mix(snow, vec3(0.92, 0.94, 0.97), smoothstep(150.0, 600.0, dist) * 0.48);
          snow = mix(snow, snow * vec3(0.9, 0.95, 1.0), smoothstep(0.55, 0.8, nL.b) * 0.4 * (1.0 - pk()));
          // wind-packed crust a shade greyer and cooler; the soft snow in the hollows brighter
          snow *= mix(vec3(1.0), vec3(0.94, 0.96, 0.985), gExp * 0.8);
          snow *= 1.0 + 0.035 * clamp(-vWind, 0.0, 1.0) * (1.0 - pk());
          float band = abs(fract(wp.x / 4.6 + nL.g * 0.6) - 0.5);
          snow *= 1.0 - pk() * (0.03 + 0.02 * smoothstep(0.42, 0.5, band));
          // fresh corduroy: groomer ribs down the fall line, each pass a touch brighter or duller
          float pass = floor(wp.x / 4.6 + nL.g * 0.6);
          snow *= 1.0 + smoothstep(0.8, 1.0, pk()) * (fract(sin(pass * 12.9898) * 43758.5453) - 0.5) * 0.05;
          float rib = wp.x * 6.2832 / 0.21;
          float ribFade = 1.0 - smoothstep(0.07, 0.24, fwidth(rib) / 6.2832);
          snow *= 1.0 + smoothstep(0.8, 1.0, pk()) * ribFade * 0.028 * sin(rib) * (0.7 + 0.3 * nM.b);
          gSnowRough = mix(texture2D(uSnowR, gSnowUv1).g, texture2D(uSnowR, gSnowUv2).g, gSnowMix);
          // earlier riders' lines (more on the piste, fewer under fresh snow; the ice is scraped bare)
          gOld = 0.0; gOldG = 0.0;
          if (dist < 110.0) {
            vec2 ot = oldTracks(wp, mix(0.3, 0.62, vPiste) * (1.0 - uCond.x * 0.55), gPx);
            float fo = (1.0 - smoothstep(55.0, 110.0, dist)) * (1.0 - gRock) * (1.0 - vIce);
            gOld = clamp(ot.x, 0.0, 1.0) * fo; gOldG = ot.y * fo;
            snow *= 1.0 - gOld * 0.16;
          }
          // scanned rock, triplanar so cliffs don't smear
          vec3 rock = vec3(0.2);
          gRockRough = 0.8;
          gRockRelief = gRock;
          gRockN = vec3(0.0);
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
            // cartoon: the scan's grain melts into flat slate bands
            rock = mix(rock, vec3(0.34, 0.37, 0.43) * (0.82 + 0.36 * strata), uToon * 0.75);
            gRockRough = texture2D(uRockR, q.xz).g;
            // the rock's own relief (used for the light too): snow stays on whatever of it faces up,
            // so the edge of a rock band breaks into snowy ledges and dusted knobs
            vec2 tx = texture2D(uRockN, q.zy).xy * 2.0 - 1.0;
            vec2 ty = texture2D(uRockN, q.xz).xy * 2.0 - 1.0;
            vec2 tz = texture2D(uRockN, q.xy).xy * 2.0 - 1.0;
            gRockN = vec3(0.0, tx.y, tx.x) * gTriW.x + vec3(ty.x, 0.0, -ty.y) * gTriW.y + vec3(tz.x, tz.y, 0.0) * gTriW.z;
            float up = normalize(vWNrm + gRockN * 1.4).y;
            float dust = smoothstep(0.62, 0.86, up + (nS.g - 0.5) * 0.35) * (1.0 - smoothstep(0.85, 1.0, gRock) * 0.45);
            gRock *= 1.0 - dust * 0.85;
          }
          // spring slush: wet, a touch grey and glossy; hard days: a little bluer
          snow *= mix(vec3(1.0), vec3(0.86, 0.87, 0.88), uCond.y);
          snow *= mix(vec3(1.0), vec3(0.97, 0.985, 1.02), uCond.z);
          diffuseColor.rgb = mix(snow, rock, gRock);
          // scraped ice: grey-blue, polished
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.66, 0.72, 0.82), smoothstep(0.0, 0.6, vIce) * 0.4);
          // a feature's faces (kicker ramps, knuckles, landings, pipe walls) a shade bluer than the
          // run, so their shape reads in flat light and at noon when everything else is one white
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.82, 0.885, 0.975), vFace);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        // (wind crust is packed smooth: a soft sheen across it in low light)
        roughnessFactor = mix(mix(mix(0.52 + gSnowRough * 0.38, 0.64, pk() * 0.6) * (1.0 - 0.3 * uCond.y - 0.15 * uCond.z) * (1.0 - 0.22 * gExp), gRockRough, gRock), 0.34, smoothstep(0.0, 0.6, vIce) * 0.7);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 wp = vWPos.xz;
          float dist = length(cameraPosition - vWPos);
          vec3 nW = normalize(vWNrm);
          float e = 1.0 / 256.0;
          vec2 g = vec2(0.0);
          float cw = wp.x * 6.2832 / 0.075;
          float fade = 1.0 - smoothstep(0.04, 0.16, fwidth(cw) / 6.2832);
          float off = 1.0 - pk();
          // scanned snow relief
          vec2 n1 = texture2D(uSnowN, gSnowUv1).xy * 2.0 - 1.0;
          vec2 n2 = rot2(-0.61) * (texture2D(uSnowN, gSnowUv2).xy * 2.0 - 1.0);
          vec2 sn = mix(n1, n2, gSnowMix) * (1.0 - smoothstep(60.0, 380.0, dist) * 0.7);
          g += vec2(sn.x, -sn.y) * mix(0.55, 0.32, pk()) * (1.0 - 0.35 * gExp);
          #if SNOW_HQ
          // the lie of the snow at two broad scales (drifts, swells, the groomer's long rolls),
          // from one set of lookups; it carries to the far slopes, where the mips smooth it out
          {
            vec2 uM = wp * 0.0085 + vec2(0.37, 0.11);
            vec4 m0 = texture2D(uNoise, uM), mx = texture2D(uNoise, uM + vec2(e * 2.0, 0.0)), mz = texture2D(uNoise, uM + vec2(0.0, e * 2.0));
            vec2 big = vec2(m0.r - mx.r, m0.r - mz.r) * 1.3 + vec2(m0.b - mx.b, m0.b - mz.b) * 0.75;
            g += big * mix(1.0, 0.45, pk()) * (1.0 - 0.6 * smoothstep(600.0, 1800.0, dist));
          }
          #endif
          if (dist < 260.0) {
            vec2 u1 = vec2(wp.x * 0.07 + wp.y * 0.02, wp.y * 0.09);
            float h0 = texture2D(uNoise, u1).a, hx = texture2D(uNoise, u1 + vec2(e, 0.)).a, hz = texture2D(uNoise, u1 + vec2(0., e)).a;
            // soft pillows, fullest in the hollows and lee where the wind drops its snow
            g += vec2(h0 - hx, h0 - hz) * off * 1.3 * (1.0 - 0.55 * gExp) * (1.0 - smoothstep(60.0, 260.0, dist));
            g.x += cos(cw) * 0.045 * pk() * fade;
            float rib = wp.x * 6.2832 / 0.21;
            g.x += cos(rib) * 0.075 * smoothstep(0.8, 1.0, pk()) * (1.0 - smoothstep(0.07, 0.24, fwidth(rib) / 6.2832));
            #if SNOW_HQ
            if (gExp > 0.02) {
              // wind ripples: long low crests across the wind, a gentle windward back and a short steep
              // lee face, wandering and dying out in patches (gone before they could shimmer)
              float lam = 0.6 + 0.45 * gNM.b;
              float s = dot(wp, WD) / lam + (gNS.r - 0.5) * 0.9 + (gNM.a - 0.5) * 5.0;
              float p = fract(s);
              float dh = mix(0.75, -1.75, smoothstep(0.55, 0.68, p) * (1.0 - smoothstep(0.88, 1.0, p)));
              float rf = 1.0 - smoothstep(0.05, 0.18, fwidth(s));
              float rm = smoothstep(0.35, 0.6, gNS.a + gExp * 0.35) * gExp * rf;
              g -= WD * dh * (0.03 / lam) * rm;
              // sastrugi: wind-carved lobes on the crests, a sharp prow into the wind tapering away
              // down it (worked out exactly, so their edges stay crisp; gone before they'd alias)
              float sm = smoothstep(0.55, 0.9, gExp + (gNL.a - 0.5) * 0.6 + (gNS.b - 0.5) * 0.5) * (1.0 - smoothstep(90.0, 200.0, dist));
              if (sm > 0.01) {
                vec3 sz = sastrugi(wp, (gNM.a - 0.5) * 7.0 + (gNS.r - 0.5) * 0.7);
                g -= (WD * sz.y + WDP * sz.z) * sm;
              }
            }
            #endif
          }
          g *= 1.0 - gRockRelief;
          g *= 1.0 - vIce * 0.85;
          // the old grooves' walls
          g.x += clamp(gOldG * 0.012, -0.5, 0.5);
          nW = normalize(nW + vec3(g.x, 0.0, g.y) * 1.6);
          if (gRockRelief > 0.01) nW = normalize(nW + gRockN * gRockRelief * 1.4 * (1.0 - 0.7 * uToon));
          gNW = nW;
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          float sh = 1.0;
          #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
            DirectionalLightShadow dls = directionalLightShadows[0];
            sh = getShadow(directionalShadowMap[0], dls.shadowMapSize, dls.shadowIntensity, dls.shadowBias, dls.shadowRadius, vDirectionalShadowCoord[0]);
          #endif
          // a cloud's shadow passing over
          float cs = cloudSun(vWPos.xz);
          reflectedLight.directDiffuse *= cs; reflectedLight.directSpecular *= cs;
          sh *= cs;
          float lit = sh * agSun;
          vec3 sunE = uSunCol;
          #if NUM_DIR_LIGHTS > 0
            sunE = directionalLights[0].color;
          #endif
          float dist = length(cameraPosition - vWPos);
          vec3 V = normalize(cameraPosition - vWPos);
          float snowy = (1.0 - gRock) * (1.0 - smoothstep(0.0, 0.6, vIce) * 0.8);
          float ndl = dot(gNW, uSunDir);
          // light carried a little way through the snow: the edge of the light softens and goes blue
          float wrap = clamp((ndl + 0.35) / 1.35, 0.0, 1.0) - clamp(ndl, 0.0, 1.0);
          reflectedLight.directDiffuse += sunE * diffuseColor.rgb * vec3(0.38, 0.62, 0.9) * wrap * 0.32 * lit * snowy;
          // snow throws light forward: looking toward the sun, a low bright sheen across it
          float fwd = pow(max(dot(-V, uSunDir), 0.0), 5.0) * pow(1.0 - max(dot(gNW, V), 0.0), 4.0);
          reflectedLight.directSpecular += sunE * fwd * clamp(ndl * 2.0, 0.0, 1.0) * 0.16 * lit * snowy;
          // sun glints: ice facets catching the sun, sharp single points that come and go as you move
          // (cells never smaller than about a pixel and a half, so far off they are fewer, not a shimmer)
          if (dist < 160.0 && lit > 0.05 && snowy > 0.3 && ndl > 0.0) {
            vec3 H = normalize(V + uSunDir);
            vec3 Nf = normalize(vWNrm * 0.5 + gNW * 0.5);
            float lev = log2(max(gPx * 1.6, 0.025));
            float l0 = floor(lev), lt = lev - l0;
            float c0 = exp2(l0), c1 = c0 * 2.0;
            float gl = glintLevel(vWPos.xz, c0, Nf, H, l0 * 17.0, max(0.14, 0.6 * gPx / c0)) * (1.0 - lt);
            #if SNOW_HQ
              gl += glintLevel(vWPos.xz, c1, Nf, H, l0 * 17.0 + 17.0, max(0.14, 0.6 * gPx / c1)) * lt;
            #endif
            float dens = 1.0 + uCond.x * 0.6 - uCond.y * 0.6;
            reflectedLight.directSpecular += sunE * gl * dens * 9.0 * lit * snowy * (1.0 - smoothstep(90.0, 160.0, dist));
          }
          // the shade takes the blue of the sky above it, a little stronger than the sky alone gives
          float shade = (1.0 - lit) * (1.0 - gRock);
          // (and the faint blue glow that keeps moonlit snow from going black)
          reflectedLight.indirectDiffuse *= mix(vec3(1.0), vec3(0.92, 0.985, 1.07), shade);
          reflectedLight.indirectDiffuse += vec3(0.016, 0.03, 0.068) * shade;
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
  if (a.wnd) g.setAttribute('aWind', new THREE.BufferAttribute(a.wnd, 1));
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
