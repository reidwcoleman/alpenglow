// Mountain-scale light: a GPU pass ray-marches a heightfield toward the sun
// to find which slopes the peaks shade (soft penumbra) plus a horizon-based
// ambient occlusion term. Every material is patched to use it, together with
// an exponential height fog that thins with altitude and warms toward the sun.
import * as THREE from 'three';
import { heightAt, EXTENT_Z } from './course.js';

export const AG = {
  uCamWorld: { value: new THREE.Matrix4() },
  uShadeTex: { value: null },
  uShadeBox: { value: new THREE.Vector4(-3200, -2600, 6400, Math.max(9200, EXTENT_Z + 4740)) },
  uSunDirA: { value: new THREE.Vector3(0, 1, 0) },
  uSunFog: { value: new THREE.Color(1, 0.8, 0.6) },
  uFogFall: { value: 1 / 900 },
  uFogBase: { value: 0 },
  // how much the mountain shade darkens direct light (off at night: the floodlights aren't the sun)
  uAgDirect: { value: 1 },
  // dusk: the sun has gone off everything below x and lights all above y (the peaks keep it longest)
  uSunset: { value: new THREE.Vector2(-1e5, -9e4) },
  // aerial perspective: how much more each channel scatters in (blue most: far ridges go blue)
  uFogRGB: { value: new THREE.Vector3(1, 1, 1) },
  // valley mist (an inversion layer): x density at its base, y base height, z 1 / thickness
  uValley: { value: new THREE.Vector3(0, 0, 1 / 120) },
  uValleyCol: { value: new THREE.Color(1, 1, 1) },
  // the cartoon look (Cork7's): 1 = soft two-tone light, flatter surfaces, little gloss; 0 = the
  // photographic look
  uToon: { value: 1 },
};

// (the sun's light on a surface: a soft cel ramp, nearly full light as soon as it faces the sun
// at all, then a quick soft fall into its own shade)
const TOON_DIRECT = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
  'vec3 irradiance = dotNL * directLight.color;',
  'vec3 irradiance = mix(dotNL, 0.16 * dotNL + 0.84 * smoothstep(0.0, 0.3, dotNL), uToon) * directLight.color;');
// (bumps and grain from normal maps, softened)
const TOON_NMAP = THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * (1.0 - 0.65 * uToon);');

const FOG_PARS_V = `varying vec3 vAgW; uniform mat4 uCamWorld;
#ifdef USE_FOG
  varying float vFogDepth;
#endif`;
const FOG_V = `vAgW = (uCamWorld * mvPosition).xyz;
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
#endif`;
const FOG_PARS_F = `varying vec3 vAgW;
uniform float uToon;
uniform vec3 uSunDirA; uniform vec3 uSunFog; uniform vec3 uFogRGB; uniform vec3 uValley; uniform vec3 uValleyCol; uniform float uFogFall; uniform float uFogBase; uniform float uAgDirect; uniform vec2 uSunset;
uniform sampler2D uShadeTex; uniform vec4 uShadeBox;
float agSun = 1.0;
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear; uniform float fogFar;
  #endif
#endif
vec2 agShade() {
  vec2 suv = (vAgW.xz - uShadeBox.xy) / uShadeBox.zw;
  if (suv.x <= 0.0 || suv.y <= 0.0 || suv.x >= 1.0 || suv.y >= 1.0) return vec2(1.0);
  return texture2D(uShadeTex, suv).rg;
}`;
const FOG_F = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float agDen = fogDensity;
  #else
    float agDen = 2.0 / max(fogFar, 1.0);
  #endif
  vec3 agRd = vAgW - cameraPosition;
  float agD = length(agRd);
  agRd /= max(agD, 1e-3);
  // haze that thins with height, integrated along the ray
  float agK = agRd.y * uFogFall;
  float agB = agDen * exp(-(cameraPosition.y - uFogBase) * uFogFall);
  float agF = abs(agK) < 1e-6 ? agB * agD : agB * (1.0 - exp(-agD * agK)) / agK;
  agF = max(agF, 0.0);
  // the valley mist: a thin dense layer lying in the low ground
  float agVK = agRd.y * uValley.z;
  float agVB = uValley.x * exp(min(-(cameraPosition.y - uValley.y) * uValley.z, 1.0));
  float agV = uValley.x <= 0.0 ? 0.0 : max(abs(agVK) < 1e-6 ? agVB * agD : agVB * (1.0 - exp(-agD * agVK)) / agVK, 0.0);
  // in-scatter: the sky's blue over distance (bluer than it dims), warmer toward the sun
  float agMu = max(dot(agRd, uSunDirA), 0.0);
  float agS = pow(agMu, 10.0) * 0.6 + agMu * agMu * 0.12;
  vec3 agIn = (1.0 - exp(-agF * uFogRGB)) * mix(fogColor, uSunFog, agS);
  float agT = exp(-agF - agV);
  float fogFactor = 1.0 - agT;
  vec3 agMist = (1.0 - exp(-agV)) * mix(uValleyCol, uSunFog * 1.2, agS * 0.8);
  gl_FragColor.rgb = gl_FragColor.rgb * agT + agIn * exp(-agV) + agMist;
#endif`;
const LIGHT_F = `#include <lights_fragment_end>
  {
    vec2 agSh = agShade();
    agSh.r *= smoothstep(uSunset.x, uSunset.y, vAgW.y);
    agSun = agSh.r;
    reflectedLight.directDiffuse *= mix(1.0, agSh.r, uAgDirect);
    reflectedLight.directSpecular *= mix(1.0, agSh.r, uAgDirect);
    reflectedLight.indirectDiffuse *= mix(1.0, agSh.g, 0.85);
    reflectedLight.indirectSpecular *= agSh.g;
    // (matte, like painted plastic: little shine)
    reflectedLight.directSpecular *= 1.0 - 0.55 * uToon;
    reflectedLight.indirectSpecular *= 1.0 - 0.4 * uToon;
  }`;

export function patchMaterial(mat) {
  if (!mat || mat.userData.ag || mat.fog === false) return;
  mat.userData.ag = true;
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    Object.assign(sh.uniforms, AG);
    sh.vertexShader = sh.vertexShader.replace('#include <fog_pars_vertex>', FOG_PARS_V).replace('#include <fog_vertex>', FOG_V);
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_pars_fragment>', FOG_PARS_F).replace('#include <fog_fragment>', FOG_F);
    if (sh.fragmentShader.includes('#include <lights_fragment_end>')) sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', LIGHT_F);
    if (sh.fragmentShader.includes('uniform float uToon;')) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', TOON_DIRECT).replace('#include <normal_fragment_maps>', TOON_NMAP);
    }
  };
  mat.customProgramCacheKey = () => 'ag|' + prevKey;
  mat.needsUpdate = true;
}

export function patchTree(obj) {
  obj.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) patchMaterial(m);
  });
}

const SHADE_FRAG = `
uniform sampler2D uH; uniform vec3 uSun; uniform vec4 uBox;
varying vec2 vUv;
float H(vec2 xz) { return texture2D(uH, (xz - uBox.xy) / uBox.zw).r; }
void main() {
  vec2 xz = uBox.xy + vUv * uBox.zw;
  float h0 = H(xz) + 1.5;
  vec2 sd = normalize(uSun.xz + vec2(1e-5));
  float tanE = uSun.y / max(length(uSun.xz), 1e-4);
  float vis = 1.0;
  float t = 12.0;
  for (int i = 0; i < 80; i++) {
    vec2 p = xz + sd * t;
    vec2 uv = (p - uBox.xy) / uBox.zw;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
    float d = H(p) - (h0 + t * tanE);
    // penumbra widens with distance to the occluder
    vis = min(vis, clamp(0.5 - d / (t * 0.018 + 4.0), 0.0, 1.0));
    t = t * 1.06 + 6.0;
  }
  // ambient occlusion: how far the surrounding horizon rises
  float occ = 0.0;
  for (int r = 0; r < 3; r++) {
    float rad = 22.0 * pow(3.2, float(r));
    for (int k = 0; k < 8; k++) {
      float a = float(k) * 0.7854 + float(r) * 0.39;
      float rise = (H(xz + vec2(cos(a), sin(a)) * rad) - h0) / rad;
      occ += clamp(rise, 0.0, 1.2);
    }
  }
  float ao = clamp(1.0 - occ / 24.0 * 1.25, 0.4, 1.0);
  gl_FragColor = vec4(vis, ao, 0.0, 1.0);
}`;

export class ShadeField {
  // the heights on its grid (gridHeights), worked out on a loading thread
  static grid() {
    const box = AG.uShadeBox.value, S = 20;
    return [box.x, box.y, S, Math.round(box.z / S) + 1, Math.round(box.w / S) + 1];
  }

  constructor(renderer, data) {
    this.renderer = renderer;
    const box = AG.uShadeBox.value;
    const [, , , nx, nz] = ShadeField.grid();
    const linear = renderer.extensions.has('OES_texture_float_linear');
    this.hTex = new THREE.DataTexture(data, nx, nz, THREE.RedFormat, THREE.FloatType);
    this.hTex.magFilter = this.hTex.minFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
    this.hTex.needsUpdate = true;
    this.rt = new THREE.WebGLRenderTarget(nx * 2, nz * 2, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rt.texture.minFilter = this.rt.texture.magFilter = THREE.LinearFilter;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uH: { value: this.hTex }, uSun: { value: new THREE.Vector3() }, uBox: { value: box } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: SHADE_FRAG,
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    AG.uShadeTex.value = this.rt.texture;
  }

  compute(sunDir) {
    this.mat.uniforms.uSun.value.copy(sunDir);
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.render(this.scene, this.cam);
    r.setRenderTarget(prev);
  }
}
