// Sky, sun, image-based light and fog for each time of day.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export const PRESETS = {
  bluebird: {
    label: 'Bluebird Morning', elev: 26, azim: 205, turbidity: 2.2, rayleigh: 0.9, mie: 0.004, mieG: 0.8,
    sun: 0xfff2e2, sunI: 3.4, hemiSky: 0xbcd6ff, hemiGround: 0x9aa6b8, hemiI: 0.35, envI: 0.9,
    fog: 0xb9cde6, fogD: 0.000085, exposure: 0.54, clouds: 0.28, snow: 0, haze: 0.35,
  },
  golden: {
    label: 'Golden Hour', elev: 9, azim: 238, turbidity: 3.4, rayleigh: 1.6, mie: 0.006, mieG: 0.86,
    sun: 0xffc48a, sunI: 3.6, hemiSky: 0x9fb8e8, hemiGround: 0x8a7d86, hemiI: 0.32, envI: 1.0,
    fog: 0xd8b9a8, fogD: 0.00009, exposure: 0.62, clouds: 0.36, snow: 0, haze: 0.25,
  },
  alpenglow: {
    label: 'Alpenglow Dusk', elev: 2.6, azim: 252, turbidity: 4.6, rayleigh: 2.6, mie: 0.008, mieG: 0.9,
    sun: 0xff9a70, sunI: 2.6, hemiSky: 0x7f8fcf, hemiGround: 0x6a5a72, hemiI: 0.42, envI: 1.25,
    fog: 0xb898b4, fogD: 0.0001, exposure: 0.95, clouds: 0.42, snow: 0, haze: 0.2,
  },
  storm: {
    label: 'Powder Day', elev: 30, azim: 200, turbidity: 9, rayleigh: 0.4, mie: 0.02, mieG: 0.7,
    sun: 0xe8eefc, sunI: 0.9, hemiSky: 0xd4dcea, hemiGround: 0xaab2c0, hemiI: 1.15, envI: 1.0,
    fog: 0xc6ccd6, fogD: 0.0011, exposure: 0.85, clouds: 0.95, snow: 1, haze: 0.97,
  },
};

export class Environment {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.sky = new Sky();
    this.sky.scale.setScalar(40000);
    this.sky.frustumCulled = false;
    // blend the horizon into the scene fog so far ridges melt into the sky
    const m = this.sky.material;
    m.uniforms.uHaze = { value: 0 };
    m.uniforms.uHazeCol = { value: new THREE.Color() };
    m.fragmentShader = m.fragmentShader
      .replace('void main() {', 'uniform float uHaze; uniform vec3 uHazeCol;\nvoid main() {')
      .replace('gl_FragColor = vec4( texColor, 1.0 );', `
        float el = normalize( vWorldPosition - cameraPosition ).y;
        float hz = uHaze * ( 1.0 - smoothstep( -0.05, 0.08 + uHaze * 0.5, el ) );
        texColor = mix( texColor, uHazeCol, clamp( hz, 0.0, 1.0 ) );
        gl_FragColor = vec4( texColor, 1.0 );`);
    scene.add(this.sky);

    this.sunDir = new THREE.Vector3();
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const sc = this.sun.shadow.camera;
    sc.left = -95; sc.right = 95; sc.top = 95; sc.bottom = -95; sc.near = 1; sc.far = 900;
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 2.5;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbcd6ff, 0x9aa6b8, 0.35);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xb9cde6, 0.0001);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    this.envRT = null;
    this.preset = null;
    this.time = 0;
  }

  apply(name) {
    const p = PRESETS[name] ?? PRESETS.bluebird;
    this.preset = p; this.presetName = name;
    const phi = THREE.MathUtils.degToRad(90 - p.elev);
    const theta = THREE.MathUtils.degToRad(p.azim);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    for (const sky of [this.sky, this.envSky]) {
      const u = sky.material.uniforms;
      u.turbidity.value = p.turbidity;
      u.rayleigh.value = p.rayleigh;
      u.mieCoefficient.value = p.mie;
      u.mieDirectionalG.value = p.mieG;
      u.sunPosition.value.copy(this.sunDir);
      if (u.cloudCoverage) {
        u.cloudCoverage.value = p.clouds;
        u.cloudDensity.value = p.snow ? 0.9 : 0.45;
        u.cloudScale.value = 0.00018;
        u.cloudElevation.value = 0.45;
      }
      if (u.showSunDisc) u.showSunDisc.value = !p.snow;
    }
    this.sun.color.set(p.sun);
    this.sun.intensity = p.sunI;
    this.hemi.color.set(p.hemiSky);
    this.hemi.groundColor.set(p.hemiGround);
    this.hemi.intensity = p.hemiI;
    this.scene.fog.color.set(p.fog);
    this.sky.material.uniforms.uHaze.value = p.haze ?? 0;
    this.sky.material.uniforms.uHazeCol.value.set(p.fog);
    this.scene.fog.density = p.fogD;
    this.renderer.toneMappingExposure = p.exposure;

    // image-based light from the same sky (clouds hidden so the IBL is smooth)
    const eu = this.envSky.material.uniforms;
    const cov = eu.cloudCoverage ? eu.cloudCoverage.value : 0;
    if (eu.cloudCoverage) eu.cloudCoverage.value = Math.min(cov, 0.2);
    if (eu.showSunDisc) eu.showSunDisc.value = false;
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 2000);
    if (eu.cloudCoverage) eu.cloudCoverage.value = cov;
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = p.envI;
  }

  // keep the shadow frustum centred on the player, snapped to texels to avoid shimmer
  follow(target, dt) {
    this.time += dt;
    const u = this.sky.material.uniforms;
    if (u.time) u.time.value = this.time;
    const d = this.sunDir;
    const size = (this.sun.shadow.camera.right - this.sun.shadow.camera.left);
    const texel = size / this.sun.shadow.mapSize.x;
    // snap in light space
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
