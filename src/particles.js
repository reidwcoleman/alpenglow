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

// spray: two kinds of snow in every throw. Grains (a crust's crystals and clumps) fly on
// their own ballistic arcs, fall fast and glint; the mist (the fine powder) hangs, spreads and
// drifts down slowly. Each is a camera-facing quad: a grain is drawn stretched along the way it
// is flying (the streak it leaves in a frame), the mist as a ragged puff.
const sprayVert = /* glsl */`
  attribute vec3 iPos; attribute vec3 iVel; attribute float aSize; attribute float aAlpha; attribute float aSeed;
  varying float vAlpha; varying float vSeed; varying vec2 vUv; varying float vLen;
  #include <fog_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
    vec2 c = position.xy;
    vSeed = aSeed; vAlpha = aAlpha; vUv = c; vLen = 1.0;
    if (aSeed < 0.45) {
      // a streak: the size across, the distance flown in a sixtieth of a second along
      vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
      float sp = length(vv.xy);
      vec2 d = sp > 1e-3 ? vv.xy / sp : vec2(1.0, 0.0);
      float L = aSize + min(sp * 0.008, aSize * 2.5);
      vLen = L / aSize;
      mvPosition.xy += d * c.x * L * 0.5 + vec2(-d.y, d.x) * c.y * aSize * 0.5;
      // (a streak thinner than a pixel still shows, fainter)
      float px = aSize * 700.0 / max(0.1, -mvPosition.z);
      vAlpha *= min(1.0, px / 1.6);
      mvPosition.xy += vec2(-d.y, d.x) * c.y * max(0.0, 1.6 / 700.0 * -mvPosition.z - aSize) * 0.5;
    } else {
      // a puff, turned by its seed so no two are alike
      float a = aSeed * 40.0;
      mat2 r = mat2(cos(a), sin(a), -sin(a), cos(a));
      mvPosition.xy += r * c * aSize * 0.5;
    }
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const sprayFrag = /* glsl */`
  uniform vec3 uColor; uniform vec3 uSunV; uniform float uTime;
  varying float vAlpha; varying float vSeed; varying vec2 vUv; varying float vLen;
  #include <fog_pars_fragment>
  float sh(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float sn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(sh(i), sh(i + vec2(1, 0)), f.x), mix(sh(i + vec2(0, 1)), sh(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    vec3 col; float a;
    if (vSeed < 0.45) {
      // a streak with round ends: brightest at its head
      vec2 q = vec2(vUv.x * vLen, vUv.y);
      float dx = max(0.0, abs(q.x) - (vLen - 1.0));
      float r2 = dx * dx + q.y * q.y;
      if (r2 > 1.0) discard;
      a = smoothstep(1.0, 0.3, r2) * mix(0.4, 1.0, (vUv.x + 1.0) * 0.5) / vLen;
      float ndl = 0.5 + 0.5 * uSunV.y;
      col = uColor * (0.75 + 0.45 * ndl);
      // now and then one catches the sun
      float tw = fract(vSeed * 91.7 + uTime * (2.0 + vSeed * 9.0));
      col += uColor * smoothstep(0.93, 1.0, tw) * 2.2;
    } else {
      // the mist: soft, ragged at the edges, lit a little on the sun's side
      float r2 = dot(vUv, vUv);
      if (r2 > 1.0) discard;
      float n = sn(vUv * 2.3 + vSeed * 31.0) * 0.6 + sn(vUv * 5.1 - vSeed * 17.0) * 0.4;
      a = max(0.0, (1.0 - r2) * (1.0 - r2) * (0.35 + 0.95 * n) - 0.08);
      vec3 nn = vec3(vUv.x, -vUv.y, sqrt(1.0 - r2));
      col = uColor * (0.85 + 0.25 * max(dot(nn, uSunV), 0.0));
    }
    gl_FragColor = vec4(col, a * vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

const _sv = new THREE.Vector3();

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
    this.seed = new Float32Array(max);
    for (let i = 0; i < max; i++) this.seed[i] = Math.random();
    // one quad, drawn once per particle
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const inst = (a, n) => new THREE.InstancedBufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    this.aP = inst(this.p, 3);
    this.aV = inst(this.v, 3);
    this.aS = inst(this.size, 1);
    this.aA = inst(this.alpha, 1);
    g.setAttribute('iPos', this.aP);
    g.setAttribute('iVel', this.aV);
    g.setAttribute('aSize', this.aS);
    g.setAttribute('aAlpha', this.aA);
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(this.seed, 1));
    g.instanceCount = max;
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uColor: { value: new THREE.Color(1, 1, 1) },
      uSunV: { value: new THREE.Vector3(0, 1, 0) },
      uTime: { value: 0 },
    }]);
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: sprayVert, fragmentShader: sprayFrag,
      transparent: true, depthWrite: false, fog: true,
    });
    this.points = new THREE.Mesh(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
    this.cursor = 0;
    this.live = 0;
  }

  // (jit: how far round the point they start; grainK > 1 makes more of them grains than mist)
  emit(x, y, z, vx, vy, vz, spread, size, life, n = 1, jit = 0.3, grainK = 1) {
    for (let k = 0; k < n; k++) {
      let i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      // a carve's fan is mostly crystals: skip on to a grain slot now and then
      if (grainK > 1 && this.seed[i] >= 0.45 && Math.random() < 1 - 1 / grainK) { i = this.cursor; this.cursor = (this.cursor + 1) % this.max; }
      const grain = this.seed[i] < 0.45;
      this.p[i * 3] = x + (Math.random() - 0.5) * jit;
      this.p[i * 3 + 1] = y + Math.random() * jit * 0.5;
      this.p[i * 3 + 2] = z + (Math.random() - 0.5) * jit;
      // grains leave faster and stay together; the mist puffs out wider
      const sp = grain ? spread * 0.75 : spread;
      const kick = grain ? 1.15 : 0.9;
      this.v[i * 3] = vx * kick + (Math.random() - 0.5) * sp;
      this.v[i * 3 + 1] = vy * kick + Math.random() * sp * 0.7;
      this.v[i * 3 + 2] = vz * kick + (Math.random() - 0.5) * sp;
      this.life[i] = life * (0.6 + Math.random() * 0.6) * (grain ? 0.8 : 1.15);
      this.age[i] = 0;
      // (the mist starts as small puffs and spreads)
      this.base[i] = size * (0.5 + Math.random()) * (grain ? 0.035 + Math.random() * 0.04 : 0.6);
    }
  }

  update(dt, sunLit, sunDir, camera) {
    this.uniforms.uColor.value.copy(sunLit);
    this.uniforms.uTime.value += dt;
    if (sunDir && camera) this.uniforms.uSunV.value.copy(_sv.copy(sunDir).transformDirection(camera.matrixWorldInverse));
    // grains: little drag, real gravity; the mist: heavy drag, sinks slowly
    const dG = Math.exp(-0.7 * dt), dM = Math.exp(-2.8 * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.age[i] >= this.life[i]) { this.alpha[i] = 0; continue; }
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      const k = i * 3;
      const grain = this.seed[i] < 0.45;
      const drag = grain ? dG : dM;
      this.v[k] *= drag; this.v[k + 2] *= drag;
      this.v[k + 1] = this.v[k + 1] * drag - (grain ? 9.0 : 2.4) * dt;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      if (grain) {
        this.size[i] = this.base[i];
        this.alpha[i] = (1 - t * t) * Math.min(1, t * 12) * 0.85;
      } else {
        this.size[i] = this.base[i] * (0.6 + t * 1.9);
        this.alpha[i] = (1 - t) * Math.min(1, t * 8) * 0.46;
      }
      if ((i & 7) === 0 || (grain && (i & 1) === 0)) {
        const gy = heightAt(this.p[k], this.p[k + 2]);
        // grains land and lie there a moment; the mist settles on the snow
        if (this.p[k + 1] < gy) { this.p[k + 1] = gy; this.v[k + 1] = 0; if (grain) { this.v[k] *= 0.3; this.v[k + 2] *= 0.3; this.age[i] = Math.max(this.age[i], this.life[i] * 0.8); } }
      }
    }
    this.aP.needsUpdate = true; this.aV.needsUpdate = true; this.aS.needsUpdate = true; this.aA.needsUpdate = true;
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

// Diamond dust: on a cold clear day, ice crystals hang in the air around you and flash as they
// turn through the sun (brightest looking toward it).
const dustVert = /* glsl */`
  attribute float aSeed;
  uniform float uTime, uScale; uniform vec3 uSunDir;
  varying float vA;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    vec3 dir = normalize(wp.xyz - cameraPosition);
    float toward = pow(max(dot(dir, uSunDir), 0.0), 3.0);
    // each crystal turns at its own rate and catches the sun for a moment each turn
    float ph = fract(aSeed * 17.31 + uTime * (0.35 + fract(aSeed * 7.7) * 1.1));
    float flash = smoothstep(0.84, 0.95, ph) * smoothstep(1.0, 0.95, ph);
    float d = -mvPosition.z;
    vA = flash * (0.25 + 1.6 * toward) * smoothstep(1.0, 3.0, d) * (1.0 - smoothstep(18.0, 30.0, d));
    gl_PointSize = max(2.0, uScale * (0.05 + 0.04 * fract(aSeed * 3.1)) / max(0.1, d) * (0.6 + flash));
    #include <fog_vertex>
  }`;
const dustFrag = /* glsl */`
  uniform vec3 uColor;
  varying float vA;
  #include <fog_pars_fragment>
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    // a tiny star: a bright core with a cross of glare
    float core = smoothstep(0.5, 0.0, length(c) * 2.2);
    float cross = smoothstep(0.08, 0.0, abs(c.x)) * smoothstep(0.5, 0.0, abs(c.y)) + smoothstep(0.08, 0.0, abs(c.y)) * smoothstep(0.5, 0.0, abs(c.x));
    float a = clamp(core + cross * 0.6, 0.0, 1.0) * vA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * 2.2, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export class DiamondDust {
  constructor(scene, n = 1600) {
    this.n = n; this.box = 50;
    const p = new Float32Array(n * 3), s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      p[i * 3] = (Math.random() - 0.5) * this.box; p[i * 3 + 1] = Math.random() * 20; p[i * 3 + 2] = (Math.random() - 0.5) * this.box;
      s[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uColor: { value: new THREE.Color(1, 1, 1) }, uScale: { value: 600 }, uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    }]);
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: dustVert, fragmentShader: dustFrag, transparent: true, depthWrite: false, fog: true, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
  }

  // how much hangs in the air today (0 none)
  setAmount(k) {
    this.points.visible = k > 0;
    this.points.geometry.setDrawRange(0, Math.round(this.n * Math.min(1, k)));
  }

  update(dt, cam, sunDir, sunCol) {
    if (!this.points.visible) return;
    const U = this.uniforms;
    U.uTime.value += dt; U.uSunDir.value.copy(sunDir); U.uColor.value.copy(sunCol);
    const p = this.points.geometry.attributes.position, arr = p.array, B = this.box, H = 20;
    const cx = cam.x, cy = cam.y - 8, cz = cam.z, t = U.uTime.value;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      // drifting down slowly on the air
      arr[k + 1] -= (0.12 + (i % 5) * 0.03) * dt;
      arr[k] += Math.sin(t * 0.3 + i) * 0.15 * dt + 0.25 * dt;
      let x = arr[k] - cx, y = arr[k + 1] - cy, z = arr[k + 2] - cz;
      x = ((x + B / 2) % B + B) % B - B / 2;
      y = ((y % H) + H) % H;
      z = ((z + B / 2) % B + B) % B - B / 2;
      arr[k] = x + cx; arr[k + 1] = y + cy; arr[k + 2] = z + cz;
    }
    p.needsUpdate = true;
  }
}
