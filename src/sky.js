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
    fogD: 0.00014, fogFall: 1 / 2600, sunFog: 0xfff0dc, key: 3.7, haze: 0.28, snow: 0, shafts: 0.04,
    fogRGB: [0.74, 0.92, 1.28], valley: [0.00012, -40, 140], disc: 1, aureole: 0.25,
  },
  golden: {
    label: 'Golden Hour', hdri: 'golden', az: 8, elev: 9, sun: 0xffb46e, sunOverSky: 1.9,
    fogD: 0.00008, fogFall: 1 / 900, sunFog: 0xffc58e, sunFogK: 0.35, key: 2.15, haze: 0.12, snow: 0, shafts: 0.12,
    fogRGB: [0.8, 0.92, 1.2], valley: [0.0004, -30, 110], mistK: 1.1, disc: 0.6, aureole: 0.5,
  },
  alpenglow: {
    label: 'Alpenglow Dusk', hdri: 'alpenglow', az: 334, elev: 3.2, sun: 0xff9a78, sunOverSky: 1.4, sunset: [1150, 1750], zenith: [0.62, 0.74, 1.16],
    fogD: 0.00008, fogFall: 1 / 850, sunFog: 0xffa98a, sunFogK: 0.3, key: 2.1, haze: 0.1, snow: 0, shafts: 0.1,
    fogRGB: [0.7, 0.85, 1.35], valley: [0.00025, -40, 110], mistK: 0.8, belt: 1, fogTint: [0.72, 0.84, 1.15], envTint: [0.68, 0.94, 1.08],
  },
  night: {
    label: 'Night Session', hdri: 'night', az: 345, elev: 15, domeAz: 205, sun: 0xa9bcff, sunOverSky: 0.22,
    fogD: 0.00011, fogFall: 1 / 900, sunFog: 0x5d6f96, sunFogK: 0.25, key: 0.62, haze: 0.12, snow: 0, night: true,
    envK: 0.15, moonK: 0.3, domeK: 0.6, fogK: 0.4, fogTint: [0.82, 0.9, 1.06], zenith: [0.85, 0.95, 1.2],
    fogRGB: [0.7, 0.88, 1.3], disc: 2.4, discDeg: 0.8, discVis: 1, aureole: 0.5,
  },
  storm: {
    label: 'Powder Day', hdri: 'storm', az: 60, elev: 40, sun: 0xeef2ff, sunOverSky: 0.08,
    fogD: 0.0011, fogFall: 1 / 2200, sunFog: 0xdde3ee, key: 2.85, haze: 0.95, snow: 1, wind: 6,
    fogRGB: [0.96, 1, 1.05],
  },
  // the same skies, other days
  spring: {
    label: 'Spring Sun', hdri: 'bluebird', az: 120, elev: 50, sun: 0xfff6ea, sunScale: 1.0,
    fogD: 0.00015, fogFall: 1 / 2400, sunFog: 0xfff4e4, key: 3.8, haze: 0.32, snow: 0, shafts: 0.03,
    fogRGB: [0.78, 0.93, 1.22], disc: 1, aureole: 0.3,
  },
  arctic: {
    label: 'Arctic Blue', hdri: 'bluebird', az: 30, elev: 15, sun: 0xeef3ff, sunScale: 0.92,
    fogD: 0.00011, fogFall: 1 / 2600, sunFog: 0xe8f0ff, key: 3.5, haze: 0.2, snow: 0, shafts: 0.05,
    fogRGB: [0.68, 0.9, 1.36], valley: [0.0005, -30, 100], mistK: 1.2, disc: 1, discVis: 1, aureole: 0.45,
  },
  flurries: {
    label: 'Snow Showers', hdri: 'storm', az: 75, elev: 38, sun: 0xf4f6ff, sunOverSky: 0.35,
    fogD: 0.00045, fogFall: 1 / 1800, sunFog: 0xe6ebf3, key: 3.0, haze: 0.6, snow: 0.45, wind: 3,
    fogRGB: [0.9, 0.97, 1.12], aureole: 0.6, discDeg: 0.5,
  },
  whiteout: {
    label: 'Whiteout', hdri: 'storm', az: 60, elev: 40, sun: 0xeef2ff, sunOverSky: 0.04,
    fogD: 0.0026, fogFall: 1 / 2600, sunFog: 0xe2e6ee, key: 2.7, haze: 1, snow: 1.6, wind: 11,
    fogRGB: [1, 1, 1.02],
  },
  nightsnow: {
    label: 'Night Snow', hdri: 'night', az: 205, elev: 34, sun: 0xa9bcff, sunOverSky: 0.16,
    fogD: 0.0005, fogFall: 1 / 1400, sunFog: 0x5d6f96, sunFogK: 0.25, key: 0.6, haze: 0.4, snow: 0.8, night: true, wind: 2,
    envK: 0.15, moonK: 0.18, domeK: 0.45, fogK: 0.45, fogTint: [0.74, 0.78, 0.98], overcast: 1, castK: 0.85,
  },
};
// what each sky does to the snow (see COND)
for (const [k, c] of Object.entries({ bluebird: 'groomed', golden: 'groomed', alpenglow: 'packed', night: 'ice', storm: 'powder', spring: 'slush', arctic: 'ice', flurries: 'packed', whiteout: 'powder', nightsnow: 'powder' })) PRESETS[k].cond = c;
// how often each comes up when the weather changes every run
export const WX_WEIGHT = { bluebird: 3, golden: 2, alpenglow: 1.1, storm: 1.4, spring: 1.3, arctic: 1.2, flurries: 1.5, whiteout: 0.6, night: 0.8, nightsnow: 0.6 };
// the snow: friction, edge grip, powder and ice on the piste, and how it looks (fresh, wet)
export const COND = {
  groomed: { name: 'Fresh corduroy', mu: 1, grip: 1, powder: 0, ice: 0, fresh: 0, wet: 0 },
  packed: { name: 'Packed powder', mu: 1.02, grip: 1, powder: 0.12, ice: 0, fresh: 0.45, wet: 0 },
  powder: { name: 'Fresh powder · 30 cm', mu: 1.04, grip: 0.95, powder: 0.32, ice: 0, fresh: 1, wet: 0 },
  ice: { name: 'Hardpack and ice', mu: 0.8, grip: 0.86, powder: 0, ice: 0.28, fresh: 0, wet: 0 },
  slush: { name: 'Spring slush', mu: 1.25, grip: 1.06, powder: 0.14, ice: 0, fresh: 0, wet: 1 },
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
  uniform float scale, yaw, rowsFrac, uHaze, uBright, uDiscR, uDiscVis, uHdriCut, uBelt, uMoon, uOvercast, uTime;
  uniform vec3 ground, uHazeCol, uZenith, uEnvTint, uSunW, uDiscCol, uAurCol, uHdriSun, uCastCol;
  varying vec3 vDir;
  float hash3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  void main() {
    vec3 d = normalize(vDir);
    float c = cos(yaw), s = sin(yaw);
    vec3 r = vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
    float u = atan(r.z, r.x) * 0.15915494 + 0.5;
    float v = asin(clamp(r.y, -1.0, 1.0)) * 0.31830989 + 0.5;
    float t = (1.0 - v) / rowsFrac;
    vec3 col = ground;
    vec3 raw = vec3(0.0);
    if (t < 1.0) {
      raw = textureLod(map, vec2(u, 1.0 - t), 0.0).rgb;
      col = raw * raw * (raw * 0.2 + 0.8); // sRGB -> linear (the jpg holds sRGB-encoded radiance x scale)
      col /= scale;
      // the photo's own sun, where this sky puts the sun somewhere else: its glare goes, the sky stays
      if (uHdriCut > 0.0) {
        float ch = dot(r, uHdriSun);
        float k = uHdriCut * smoothstep(0.9, 0.995, ch);
        float m = max(max(col.r, col.g), col.b);
        col = mix(col, col * min(1.0, 1.4 / max(m, 1e-3)), k);
      }
      col *= uBright;
      col = mix(col, ground, smoothstep(0.97, 1.0, t));
    }
    // dusk: the glow stays on the horizon, the sky overhead goes deep blue
    col *= mix(vec3(1.0), uZenith, smoothstep(0.0, 0.38, d.y));
    col *= uEnvTint;
    float mu = dot(d, uSunW);
    // the earth's shadow rising opposite the sun, under a pink band (the belt of Venus)
    if (uBelt > 0.0) {
      vec2 hs = normalize(uSunW.xz + vec2(1e-5)), hd = normalize(d.xz + vec2(1e-5));
      float anti = smoothstep(-0.1, 0.9, -dot(hs, hd)) * uBelt;
      float e = d.y;
      col *= mix(vec3(1.0), vec3(0.62, 0.7, 0.98), anti * (1.0 - smoothstep(0.015, 0.075, e)) * smoothstep(-0.03, 0.0, e));
      col *= mix(vec3(1.0), vec3(1.16, 0.96, 1.02), anti * exp(-pow((e - 0.11) / 0.05, 2.0)));
    }
    // a lid of cloud: the photo's sky (and its stars) goes under an even grey
    if (uOvercast > 0.0) {
      float n = hash3(floor(d * 60.0)) * 0.04;
      vec3 oc = uCastCol * mix(1.0, 0.72, smoothstep(0.0, 0.7, d.y)) * (0.98 + n);
      col = mix(col, oc, uOvercast);
    }
    // the sun (or moon) itself: a disc, a little limb darkening, the bright forward glow round it
    if (uDiscR > 0.0) {
      float ang = acos(clamp(mu, -1.0, 1.0));
      // hidden behind the photo's clouds: they're whiter than the sky round them
      float sat = (raw.b - raw.r) / max(raw.b, 1e-3);
      float vis = uHdriCut > 0.0 ? smoothstep(0.03, 0.12, sat) : max(smoothstep(0.82, 0.97, max(raw.r, max(raw.g, raw.b))), smoothstep(0.05, 0.14, sat));
      vis = mix(vis, 1.0, uDiscVis) * smoothstep(-0.01, 0.01, d.y);
      float x = clamp(ang / uDiscR, 0.0, 1.0);
      float disc = 1.0 - smoothstep(0.86, 1.0, ang / uDiscR);
      float limb = 0.55 + 0.45 * sqrt(1.0 - x * x);
      if (uMoon > 0.0) {
        // maria: a few darker seas on the moon's face
        vec3 q = (d - uSunW) / uDiscR;
        float mar = hash3(floor(q * 3.0 + 7.0)) * 0.25 + hash3(floor(q * 7.0 + 3.0)) * 0.15;
        limb = 0.75 + 0.25 * sqrt(1.0 - x * x) - mar;
      }
      col += uDiscCol * disc * limb * vis;
      col += uAurCol * (exp(-ang * 55.0) * 0.7 + exp(-ang * 9.0) * 0.22 + exp(-ang * 2.5) * 0.06) * mix(0.35, 1.0, vis);
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
        ground: { value: new THREE.Color(0.5, 0.52, 0.56) }, uHaze: { value: 0 }, uHazeCol: { value: new THREE.Color() }, uZenith: { value: new THREE.Color(1, 1, 1) },
        uSunW: { value: new THREE.Vector3(0, 1, 0) }, uDiscR: { value: 0 }, uDiscVis: { value: 0 }, uEnvTint: { value: new THREE.Color(1, 1, 1) }, uDiscCol: { value: new THREE.Color() }, uAurCol: { value: new THREE.Color() },
        uHdriSun: { value: new THREE.Vector3(0, 1, 0) }, uHdriCut: { value: 0 }, uBelt: { value: 0 }, uMoon: { value: 0 }, uOvercast: { value: 0 }, uCastCol: { value: new THREE.Color() }, uTime: { value: 0 },
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
    // (a texel and a bit: a rider's shadow keeps its arms and helmet instead of going to a blob)
    this.sun.shadow.radius = 1.2;
    scene.add(this.sun, this.sun.target);
    // (kept for API compatibility; the HDRI does the sky light now)
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xb9cde6, 0.0001);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this.meta = null;
    this.tex = new Map();
    this.loading = new Map();
    this.time = 0;
  }

  // the sky you start under (the others load when the weather turns to them)
  async load(name) {
    const [meta] = await Promise.all([fetch(BASE + 'sky.json').then((r) => r.json()), this.ensure((PRESETS[name] ?? PRESETS.bluebird).hdri)]);
    this.meta = meta;
  }

  ensure(h) {
    if (!this.loading.has(h)) this.loading.set(h, new THREE.TextureLoader().loadAsync(BASE + h + '_bg.jpg').then((t) => {
      t.colorSpace = THREE.NoColorSpace; // decoded by hand in the shader
      t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.anisotropy = 4;
      this.tex.set(h, t);
    }));
    return this.loading.get(h);
  }

  apply(name) {
    const p = PRESETS[name] ?? PRESETS.bluebird;
    // not fetched yet: keep the sky there is till it's in
    if (!this.tex.has(p.hdri)) { this.want = name; this.ensure(p.hdri).then(() => { if (this.want === name) this.apply(name); }); return; }
    this.want = name;
    this.preset = p; this.presetName = name;
    const m = this.meta[p.hdri];
    const u = this.mat.uniforms;
    u.map.value = this.tex.get(p.hdri);
    u.scale.value = m.scale;
    u.rowsFrac.value = m.bgRows / m.rows;
    // the HDRI's sun azimuth in the dome's frame
    const phi = (m.sunUV[0] - 0.5) * Math.PI * 2;
    const elev = THREE.MathUtils.degToRad(p.elev ?? m.sunElevDeg);
    const az = THREE.MathUtils.degToRad(p.az);
    // our sun direction (three spherical: x = sin(az), z = cos(az))
    this.sunDir.set(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az));
    // the dome looks up r = R(yaw) d with the sun at (cos phi, ., sin phi): turn it so they meet
    // (domeAz: the photo turned on its own, when its sun isn't what lights the scene: the moon at night)
    const da = THREE.MathUtils.degToRad(p.domeAz ?? p.az);
    const want = Math.atan2(Math.cos(da), Math.sin(da));
    u.yaw.value = phi - want;
    // light: the HDRI's own sun irradiance, or a fraction of its sky's for hidden suns
    const skyL = lum(m.skyE);
    const sunL = p.sunOverSky != null ? skyL * p.sunOverSky : lum(m.sunE) * (p.sunScale ?? 1);
    this.sun.color.set(p.sun);
    this.sun.intensity = sunL * (p.moonK ?? 1);
    u.uBright.value = p.domeK ?? 1;
    u.uZenith.value.setRGB(...(p.zenith ?? [1, 1, 1]));
    const horiz = sunL * Math.max(0, this.sunDir.y) + skyL;
    this.renderer.toneMappingExposure = p.key / horiz;
    this.exposure = this.renderer.toneMappingExposure;
    // haze in the same radiance units as the dome
    const hc = new THREE.Color(m.horizon[0], m.horizon[1], m.horizon[2]);
    hc.multiplyScalar(p.fogK ?? 1);
    if (p.fogTint) hc.multiply(new THREE.Color(...p.fogTint));
    this.scene.fog.color.copy(hc);
    this.scene.fog.density = p.fogD;
    u.uHaze.value = p.haze;
    u.uHazeCol.value.copy(hc);
    u.ground.value.copy(hc).multiplyScalar(0.8);
    AG.uSunDirA.value.copy(this.sunDir);
    AG.uSunFog.value.set(p.sunFog).multiplyScalar(lum(m.horizon) * 1.6 * (p.sunFogK ?? 1));
    AG.uFogFall.value = p.fogFall;
    if (p.sunset) AG.uSunset.value.set(...p.sunset); else AG.uSunset.value.set(-1e5, -9e4);
    // aerial perspective (blue scatters most) and the valley mist
    AG.uFogRGB.value.set(...(p.fogRGB ?? [1, 1, 1]));
    const vl = p.valley ?? [0, 0, 120];
    AG.uValley.value.set(vl[0], vl[1], 1 / vl[2]);
    AG.uValleyCol.value.copy(hc).lerp(new THREE.Color(p.sunFog).multiplyScalar(lum(m.horizon)), 0.5).multiplyScalar(p.mistK ?? 1.3);
    // the sun's disc and glow in the sky (the moon's at night), the photo's own sun put out when it's elsewhere
    u.uSunW.value.copy(this.sunDir);
    const sc = new THREE.Color(p.sun);
    u.uDiscR.value = p.disc || p.aureole ? THREE.MathUtils.degToRad(p.discDeg ?? 0.55) : 0;
    u.uDiscCol.value.copy(sc).multiplyScalar(sunL * (p.disc ?? 0) * 9);
    u.uAurCol.value.copy(sc).multiplyScalar(sunL * (p.aureole ?? 0));
    u.uMoon.value = p.night ? 1 : 0;
    u.uDiscVis.value = p.discVis ?? 0;
    const eH = THREE.MathUtils.degToRad(m.sunElevDeg);
    u.uHdriSun.value.set(Math.cos(phi) * Math.cos(eH), Math.sin(eH), Math.sin(phi) * Math.cos(eH));
    u.uHdriCut.value = p.elev != null && Math.abs(p.elev - m.sunElevDeg) > 8 && lum(m.sunE) > 0.5 ? 1 : 0;
    u.uBelt.value = p.belt ?? 0;
    u.uOvercast.value = p.overcast ?? 0;
    u.uCastCol.value.copy(hc).multiplyScalar(p.castK ?? 1);
    // image-based light from the same dome (haze off: the fog is applied per surface)
    const hz = u.uHaze.value, dr = u.uDiscR.value;
    u.uHaze.value = 0; u.uDiscR.value = 0;
    // (the light the sky throws can be cooler than the sky looks: dusk shade is blue, not pink)
    u.uEnvTint.value.setRGB(...(p.envTint ?? [1, 1, 1]));
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 500);
    u.uHaze.value = hz; u.uDiscR.value = dr; u.uEnvTint.value.setRGB(1, 1, 1);
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
    // most of the map goes where the camera looks: the box slides ahead of the rider
    const f = this._fwd ??= new THREE.Vector3();
    const c = this.cam ? target.clone().addScaledVector(this.cam.getWorldDirection(f).setY(0).normalize(), size * 0.22) : target;
    const p = c.clone().applyMatrix4(inv);
    p.x = Math.round(p.x / texel) * texel;
    p.y = Math.round(p.y / texel) * texel;
    p.applyMatrix4(m);
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(d, 400);
    this.sun.target.updateMatrixWorld();
    this.sky.position.copy(target);
  }
}
