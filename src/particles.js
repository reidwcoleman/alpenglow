// Snow spray (skids, carves, landings, crashes) and falling snow.
import * as THREE from 'three';
import { heightAt } from './course.js';

const vert = /* glsl */`
  attribute float aSize; attribute float aAlpha;
  varying float vAlpha;
  uniform float uScale;
  #include <fog_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * uScale / max(0.1, -mvPosition.z);
    vAlpha = aAlpha;
    #include <fog_vertex>
  }`;
const frag = /* glsl */`
  uniform vec3 uColor;
  varying float vAlpha;
  #include <fog_pars_fragment>
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    gl_FragColor = vec4(uColor * (0.92 + 0.08 * (1.0 - d)), a * vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export class Particles {
  constructor(scene, max = 9000) {
    this.max = max;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.size = new Float32Array(max);
    this.base = new Float32Array(max);
    this.alpha = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aP = new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage);
    this.aS = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aA = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aP);
    g.setAttribute('aSize', this.aS);
    g.setAttribute('aAlpha', this.aA);
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uColor: { value: new THREE.Color(1, 1, 1) },
      uScale: { value: 600 },
    }]);
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag,
      transparent: true, depthWrite: false, fog: true,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
    this.cursor = 0;
    this.live = 0;
  }

  emit(x, y, z, vx, vy, vz, spread, size, life, n = 1) {
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.p[i * 3] = x + (Math.random() - 0.5) * 0.3;
      this.p[i * 3 + 1] = y + Math.random() * 0.15;
      this.p[i * 3 + 2] = z + (Math.random() - 0.5) * 0.3;
      this.v[i * 3] = vx + (Math.random() - 0.5) * spread;
      this.v[i * 3 + 1] = vy + Math.random() * spread * 0.7;
      this.v[i * 3 + 2] = vz + (Math.random() - 0.5) * spread;
      this.life[i] = life * (0.6 + Math.random() * 0.6);
      this.age[i] = 0;
      this.base[i] = size * (0.5 + Math.random());
    }
  }

  update(dt, sunLit) {
    this.uniforms.uColor.value.copy(sunLit);
    for (let i = 0; i < this.max; i++) {
      if (this.age[i] >= this.life[i]) { this.alpha[i] = 0; continue; }
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      const k = i * 3;
      // light powder: strong drag, mild gravity
      const drag = Math.exp(-2.4 * dt);
      this.v[k] *= drag; this.v[k + 2] *= drag;
      this.v[k + 1] = this.v[k + 1] * drag - 4.5 * dt;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      this.size[i] = this.base[i] * (0.6 + t * 1.6);
      this.alpha[i] = (1 - t) * Math.min(1, t * 8) * 0.42;
      if ((i & 7) === 0) {
        const gy = heightAt(this.p[k], this.p[k + 2]);
        if (this.p[k + 1] < gy) { this.p[k + 1] = gy; this.v[k + 1] = 0; }
      }
    }
    this.aP.needsUpdate = true; this.aS.needsUpdate = true; this.aA.needsUpdate = true;
  }
}

// Falling snow box that follows the camera (Powder Day preset)
export class Snowfall {
  constructor(scene) {
    const n = 7000;
    this.n = n;
    this.box = 70;
    const p = new Float32Array(n * 3), s = new Float32Array(n), a = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      p[i * 3] = (Math.random() - 0.5) * this.box; p[i * 3 + 1] = Math.random() * 40; p[i * 3 + 2] = (Math.random() - 0.5) * this.box;
      s[i] = 0.07 + Math.random() * 0.08; a[i] = 0.55 + Math.random() * 0.45;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(s, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(a, 1));
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uColor: { value: new THREE.Color(1, 1, 1) }, uScale: { value: 600 },
    }]);
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, fog: true });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
    this.t = 0;
  }

  // how hard it's snowing (0.45 showers, 1 a powder day, 1.6 a whiteout)
  setAmount(k) {
    this.k = k;
    this.points.geometry.setDrawRange(0, Math.round(this.n * Math.min(1, Math.max(0.15, k))));
    this.mat.uniforms.uScale.value = 600 * (k > 1.2 ? 1.15 : 1);
  }

  update(dt, cam, vel) {
    if (!this.points.visible) return;
    const fall = 1 + Math.max(0, (this.k ?? 1) - 1) * 0.8, drift = 1.2 * (this.k > 1.2 ? 3.5 : 1);
    this.t += dt;
    const p = this.points.geometry.attributes.position;
    const arr = p.array, B = this.box, H = 40;
    const cx = cam.x, cy = cam.y - 15, cz = cam.z;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      arr[k + 1] -= (1.1 + (i % 7) * 0.12) * fall * dt;
      arr[k] += Math.sin(this.t * 0.7 + i) * 0.4 * dt + drift * dt;
      // wrap into the box around the camera
      let x = arr[k] - cx, y = arr[k + 1] - cy, z = arr[k + 2] - cz;
      x = ((x + B / 2) % B + B) % B - B / 2;
      y = ((y % H) + H) % H;
      z = ((z + B / 2) % B + B) % B - B / 2;
      arr[k] = x + cx; arr[k + 1] = y + cy; arr[k + 2] = z + cz;
    }
    p.needsUpdate = true;
  }
}
