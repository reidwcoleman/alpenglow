// Sky and light for each condition. The sky is a photographed Poly Haven HDRI (CC0) drawn
// as a background dome (radiance recovered from the stored x scale sRGB, tools/build_assets.py),
// which also lights the scene through a PMREM environment. The sun is a directional light
// placed where the HDRI's sun (or its glow) is, the dome turned so it sits over the valley.
import * as THREE from 'three';
import { AG } from './atmos.js';

// az: where the sun should end up (deg, three's spherical theta), elev overrides the HDRI's when
// the sun is hidden; sunOverSky: direct sun relative to the sky's light when the HDRI has none
export const PRESETS = {
  bluebird: {
    label: 'Bluebird Morning', hdri: 'bluebird', az: 70, sun: 0xfff3e4, sunScale: 1.0,
    fogD: 0.000075, fogFall: 1 / 1000, sunFog: 0xfff0dc, key: 4.2, haze: 0.28, snow: 0, shafts: 0.1,
  },
  golden: {
    label: 'Golden Hour', hdri: 'golden', az: 8, elev: 9, sun: 0xffb46e, sunOverSky: 1.9,
    fogD: 0.00005, fogFall: 1 / 900, sunFog: 0xffc58e, sunFogK: 0.6, key: 2.3, haze: 0.12, snow: 0, shafts: 0.32,
  },
  alpenglow: {
    label: 'Alpenglow Dusk', hdri: 'alpenglow', az: 334, elev: 3.2, sun: 0xff9a78, sunOverSky: 0.9,
    fogD: 0.00006, fogFall: 1 / 850, sunFog: 0xffa98a, sunFogK: 0.5, key: 2.2, haze: 0.1, snow: 0, shafts: 0.28,
  },
  night: {
    label: 'Night Session', hdri: 'night', az: 205, elev: 34, sun: 0xa9bcff, sunOverSky: 0.22,
    fogD: 0.00011, fogFall: 1 / 900, sunFog: 0x5d6f96, sunFogK: 0.25, key: 0.62, haze: 0.12, snow: 0, night: true,
    envK: 0.1, moonK: 0.18, domeK: 0.55, fogK: 0.35,
  },
  storm: {
    label: 'Powder Day', hdri: 'storm', az: 60, elev: 40, sun: 0xeef2ff, sunOverSky: 0.08,
    fogD: 0.0011, fogFall: 1 / 2200, sunFog: 0xdde3ee, key: 3.0, haze: 0.95, snow: 1,
  },
};

const BASE = import.meta.env.BASE_URL + 'sky/';
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

const DOME_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }`;
const DOME_FRAG = /* glsl */`
  uniform sampler2D map;
  uniform float scale, yaw, rowsFrac, uHaze, uBright;
  uniform vec3 ground, uHazeCol;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float c = cos(yaw), s = sin(yaw);
    vec3 r = vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
    float u = atan(r.z, r.x) * 0.15915494 + 0.5;
    float v = asin(clamp(r.y, -1.0, 1.0)) * 0.31830989 + 0.5;
    float t = (1.0 - v) / rowsFrac;
    vec3 col = ground;
    if (t < 1.0) {
      col = textureLod(map, vec2(u, 1.0 - t), 0.0).rgb;
      col = col * col * (col * 0.2 + 0.8); // sRGB -> linear (the jpg holds sRGB-encoded radiance x scale)
      col /= scale;
      col *= uBright;
      col = mix(col, ground, smoothstep(0.97, 1.0, t));
    }
    // melt the horizon into the scene's haze so far ridges and sky agree
    float hz = uHaze * (1.0 - smoothstep(-0.04, 0.06 + uHaze * 0.45, d.y));
    col = mix(col, uHazeCol, clamp(hz, 0.0, 1.0));
    gl_FragColor = vec4(col, 0.0); // alpha 0 marks the sky for the sun shafts
  }`;

export class Environment {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: null }, scale: { value: 1 }, yaw: { value: 0 }, rowsFrac: { value: 0.53 }, uBright: { value: 1 },
        ground: { value: new THREE.Color(0.5, 0.52, 0.56) }, uHaze: { value: 0 }, uHazeCol: { value: new THREE.Color() },
      },
      vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(30000, 64, 32), this.mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    // a copy of the dome for capturing the image-based light
    this.envScene = new THREE.Scene();
    this.envDome = new THREE.Mesh(new THREE.SphereGeometry(100, 64, 32), this.mat);
    this.envScene.add(this.envDome);

    this.sunDir = new THREE.Vector3();
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 900;
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 2;
    scene.add(this.sun, this.sun.target);
    // (kept for API compatibility; the HDRI does the sky light now)
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xb9cde6, 0.0001);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this.meta = null;
    this.tex = new Map();
    this.time = 0;
  }

  async load() {
    this.meta = await (await fetch(BASE + 'sky.json')).json();
    const tl = new THREE.TextureLoader();
    await Promise.all(Object.keys(PRESETS).map(async (k) => {
      const t = await tl.loadAsync(BASE + PRESETS[k].hdri + '_bg.jpg');
      t.colorSpace = THREE.NoColorSpace; // decoded by hand in the shader
      t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.anisotropy = 4;
      this.tex.set(k, t);
    }));
  }

  apply(name) {
    const p = PRESETS[name] ?? PRESETS.bluebird;
    this.preset = p; this.presetName = name;
    const m = this.meta[p.hdri];
    const u = this.mat.uniforms;
    u.map.value = this.tex.get(name);
    u.scale.value = m.scale;
    u.rowsFrac.value = m.bgRows / m.rows;
    // the HDRI's sun azimuth in the dome's frame
    const phi = (m.sunUV[0] - 0.5) * Math.PI * 2;
    const elev = THREE.MathUtils.degToRad(p.elev ?? m.sunElevDeg);
    const az = THREE.MathUtils.degToRad(p.az);
    // our sun direction (three spherical: x = sin(az), z = cos(az))
    this.sunDir.set(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az));
    // the dome looks up r = R(yaw) d with the sun at (cos phi, ., sin phi): turn it so they meet
    const want = Math.atan2(this.sunDir.z, this.sunDir.x);
    u.yaw.value = phi - want;
    // light: the HDRI's own sun irradiance, or a fraction of its sky's for hidden suns
    const skyL = lum(m.skyE);
    const sunL = p.sunOverSky != null ? skyL * p.sunOverSky : lum(m.sunE) * (p.sunScale ?? 1);
    this.sun.color.set(p.sun);
    this.sun.intensity = sunL * (p.moonK ?? 1);
    u.uBright.value = p.domeK ?? 1;
    const horiz = sunL * Math.max(0, this.sunDir.y) + skyL;
    this.renderer.toneMappingExposure = p.key / horiz;
    this.exposure = this.renderer.toneMappingExposure;
    // haze in the same radiance units as the dome
    const hc = new THREE.Color(m.horizon[0], m.horizon[1], m.horizon[2]);
    hc.multiplyScalar(p.fogK ?? 1);
    this.scene.fog.color.copy(hc);
    this.scene.fog.density = p.fogD;
    u.uHaze.value = p.haze;
    u.uHazeCol.value.copy(hc);
    u.ground.value.copy(hc).multiplyScalar(0.8);
    AG.uSunDirA.value.copy(this.sunDir);
    AG.uSunFog.value.set(p.sunFog).multiplyScalar(lum(m.horizon) * 1.6 * (p.sunFogK ?? 1));
    AG.uFogFall.value = p.fogFall;
    // image-based light from the same dome (haze off: the fog is applied per surface)
    const hz = u.uHaze.value;
    u.uHaze.value = 0;
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 500);
    u.uHaze.value = hz;
    this.scene.environment = this.envRT.texture;
    // at night the sky only fills in a little: the floodlights carry the scene
    this.scene.environmentIntensity = p.envK ?? 1;
    this.skyL = skyL; this.sunL = sunL;
  }

  // keep the shadow frustum centred on the player, snapped to texels to avoid shimmer
  follow(target, dt) {
    this.time += dt;
    const d = this.sunDir;
    const size = this.sun.shadow.camera.right - this.sun.shadow.camera.left;
    const texel = size / this.sun.shadow.mapSize.x;
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), d.clone().negate(), new THREE.Vector3(0, 1, 0));
    const inv = m.clone().invert();
    const p = target.clone().applyMatrix4(inv);
    p.x = Math.round(p.x / texel) * texel;
    p.y = Math.round(p.y / texel) * texel;
    p.applyMatrix4(m);
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(d, 400);
    this.sun.target.updateMatrixWorld();
    this.sky.position.copy(target);
  }
}
