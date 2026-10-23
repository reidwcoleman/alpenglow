// Snow in the air: what the skis throw (crystals, mist, clumps), the wind lifting snow off the
// ground and the ridges, falling snow, and diamond dust.
import * as THREE from 'three';
import { heightAt, normalAt } from './course.js';
import { LO } from './gfx.js';

// what a particle is: a crystal streak, a mist puff, a clump of snow, a wind-blown wisp
const GRAIN = 0, MIST = 1, CHUNK = 2, WISP = 3;

// spray: every throw is a mix. Grains (a crust's crystals) fly their own ballistic arcs, fall
// fast and glint; the mist (the fine powder) billows, hangs and drifts off on the wind; clumps
// tumble out, land and roll. All are camera-facing quads lit by the sun and the sky like snow
// is: a puff's side away from the sun sits in its own blue shade, a thick young cloud is
// darker in its core than its thin edges, and looking toward the sun the edges glow (the ice
// throws the light forward). That shade is what makes white spray read against white snow.
const sprayVert = /* glsl */`
  attribute vec3 iPos; attribute vec3 iVel; attribute float aSize; attribute float aAlpha; attribute float aSeed; attribute float aKT; attribute vec2 aSh;
  varying float vAlpha; varying vec2 vSh; varying float vSeed; varying vec2 vUv; varying float vLen; varying float vKind; varying float vT;
  varying vec3 vViewDir; varying vec2 vRot;
  #include <fog_pars_vertex>
  void main() {
    vAlpha = aAlpha;
    // (a dead one costs nothing: off the screen)
    if (aAlpha <= 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float kind = floor(aKT + 0.001), fr = aKT - kind;
    vKind = kind; vT = fr; vSeed = aSeed; vSh = aSh;
    vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
    vec2 c = position.xy;
    vUv = c; vLen = 1.0; vRot = vec2(1.0, 0.0);
    if (kind < 0.5 || kind > 2.5) {
      // a streak (the distance flown in a sixtieth of a second) or a wisp (smeared out along the wind)
      vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
      float sp = length(vv.xy);
      vec2 d = sp > 1e-3 ? vv.xy / sp : vec2(1.0, 0.0);
      float L = kind < 0.5 ? aSize + min(sp * 0.008, aSize * 2.5) : aSize * (1.0 + min(sp * 0.3, 2.2));
      float w = kind < 0.5 ? aSize : aSize * 0.5;
      vLen = L / w;
      mvPosition.xy += d * c.x * L * 0.5 + vec2(-d.y, d.x) * c.y * w * 0.5;
      if (kind < 0.5) {
        // (a streak thinner than a pixel still shows, fainter)
        float px = aSize * 700.0 / max(0.1, -mvPosition.z);
        vAlpha *= min(1.0, px / 1.6);
        mvPosition.xy += vec2(-d.y, d.x) * c.y * max(0.0, 1.6 / 700.0 * -mvPosition.z - aSize) * 0.5;
      }
      vRot = d;
    } else {
      // a puff turned by its seed (and slowly as it churns); a clump by how far it has rolled
      float a = kind > 1.5 ? fr * 6.2831853 : aSeed * 40.0 + fr * (aSeed - 0.5) * 3.0;
      vRot = vec2(cos(a), sin(a));
      mvPosition.xy += mat2(vRot.x, vRot.y, -vRot.y, vRot.x) * c * aSize * 0.5;
    }
    vViewDir = normalize(mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const sprayFrag = /* glsl */`
  uniform vec3 uSun; uniform vec3 uSky; uniform vec3 uBounce; uniform vec3 uSunW; uniform float uTime;
  varying float vAlpha; varying float vSeed; varying vec2 vUv; varying float vLen; varying float vKind; varying float vT;
  varying vec3 vViewDir; varying vec2 vRot; varying vec2 vSh;
  #include <fog_pars_fragment>
  float sh(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float sn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(sh(i), sh(i + vec2(1, 0)), f.x), mix(sh(i + vec2(0, 1)), sh(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    vec3 col; float a;
    vec3 uSunV = normalize((viewMatrix * vec4(uSunW, 0.0)).xyz), uUpV = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
    // looking toward the sun: snow in the air throws its light forward
    float toSun = max(dot(vViewDir, uSunV), 0.0);
    float fwd = pow(toSun, 10.0), fwdW = toSun * toSun * toSun;
    mat2 R = mat2(vRot.x, vRot.y, -vRot.y, vRot.x);
    if (vKind < 0.5) {
      // a crystal's streak with round ends, brightest at its head
      vec2 q = vec2(vUv.x * vLen, vUv.y);
      float dx = max(0.0, abs(q.x) - (vLen - 1.0));
      float r2 = dx * dx + q.y * q.y;
      if (r2 > 1.0) discard;
      a = smoothstep(1.0, 0.3, r2) * mix(0.4, 1.0, (vUv.x + 1.0) * 0.5) / max(1.0, vLen * 0.6);
      // each is a facet turned its own way: some face the sun, some are in their own shade
      float facet = fract(vSeed * 53.7);
      col = uSky * 0.72 * vSh.y + uSun * vSh.x * (0.08 + 0.85 * facet * facet + fwd * 2.4);
      float tw = fract(vSeed * 91.7 + uTime * (2.0 + vSeed * 9.0));
      col += uSun * vSh.x * smoothstep(0.94, 1.0, tw) * (0.8 + 3.0 * fwdW);
    } else if (vKind < 1.5) {
      // the mist: cauliflower-edged, churning as it grows
      float r2 = dot(vUv, vUv);
      if (r2 > 1.0) discard;
      vec2 p = vUv * 2.1 + vSeed * 31.0 + vec2(vT * 0.8, -vT * 0.55);
      float n1 = sn(p), n2 = sn(vUv * 4.7 - vSeed * 17.0 - vT * 1.2), n3 = sn(vUv * 9.3 + vSeed * 5.0 + vT * 1.7);
      float n = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
      float body = 1.0 - r2;
      a = smoothstep(0.0, 0.55, body * (0.45 + 0.9 * n) - 0.2) * (0.55 + 0.45 * body);
      // the puff as a lumpy ball
      vec2 g = vec2(sn(p + vec2(0.2, 0.0)) - n1, sn(p + vec2(0.0, 0.2)) - n1) * 3.0;
      vec3 nn = normalize(vec3(R * (vUv + g * 0.4), sqrt(body) * 0.8));
      float ndl = dot(nn, uSunV), up = dot(nn, uUpV);
      // vSh: how much sun gets through the cloud to it (x), how much sky (y); its own lumps shade
      // their far sides a little more
      float sunVis = vSh.x * mix(1.0, smoothstep(-0.5, 0.7, ndl), 0.5) * (0.85 + 0.15 * n);
      vec3 amb = (uSky * (0.85 + 0.3 * up) + uBounce * max(0.0, -up) * 0.3) * (0.5 + 0.5 * vSh.y);
      // backlit: its thin edges glow
      float thin = 1.0 - clamp(a * 1.6, 0.0, 1.0);
      col = amb + uSun * (sunVis * 0.9 + vSh.x * (fwd * (0.5 + 1.8 * thin) * 1.3 + fwdW * 0.25));
    } else if (vKind < 2.5) {
      // a clump: a lumpy ball of snow, lit on top, its underside in shade
      vec2 u = vUv;
      float ang = atan(u.y, u.x);
      float rr = 0.74 + 0.26 * sn(vec2(ang * 1.3 + vSeed * 20.0, vSeed * 9.0)) * (0.7 + 0.3 * sin(ang * 3.0 + vSeed * 12.0));
      float r = length(u) / rr;
      if (r > 1.0) discard;
      a = smoothstep(1.0, 0.82, r);
      vec2 p = u * 3.2 + vSeed * 13.0;
      float n1 = sn(p);
      vec2 g = vec2(sn(p + vec2(0.15, 0.0)) - n1, sn(p + vec2(0.0, 0.15)) - n1) * 4.0;
      vec3 nn = normalize(vec3(R * (u / rr + g * 0.4), sqrt(max(0.0, 1.0 - r * r))));
      float ndl = dot(nn, uSunV), up = dot(nn, uUpV);
      col = (uSky * (0.8 + 0.3 * up) + uBounce * max(0.0, -up) * 0.4) * (0.7 + 0.3 * vSh.y) + uSun * (0.35 + 0.65 * vSh.x) * (max(0.0, ndl * 0.8 + 0.2) * 0.95 + fwd * 0.5 * (1.0 - a));
      col *= 0.9 + 0.14 * sn(u * 7.0 + vSeed * 5.0);
      // a sugar of crystals on it, glinting
      float gl = sh(floor(u * 9.0) + floor(vSeed * 50.0));
      col += uSun * step(0.93, gl) * max(0.0, ndl) * 0.7;
    } else {
      // a wisp blown along the snow: thin, soft, smeared out along the wind
      vec2 q = vec2(vUv.x * vLen, vUv.y);
      float dx = max(0.0, abs(q.x) - (vLen - 1.0));
      float r2 = (dx * dx + q.y * q.y) / 1.0;
      if (r2 > 1.0) discard;
      float n = sn(vec2(vUv.x * vLen * 1.4 - uTime * 2.0, vUv.y * 2.0) + vSeed * 23.0);
      a = (1.0 - r2) * (1.0 - r2) * (0.3 + 0.9 * n);
      col = uSky * 0.85 * (0.5 + 0.5 * vSh.y) + uSun * vSh.x * (0.55 + fwd * 1.8 + fwdW * 0.3);
    }
    gl_FragColor = vec4(col, a * vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

const _n = new THREE.Vector3();
const TAU = Math.PI * 2;
const DH = 8192, DC = 1 / 0.9;
const dhash = (x, y, z) => (Math.imul(Math.floor(x * DC), 73856093) ^ Math.imul(Math.floor(y * DC), 19349663) ^ Math.imul(Math.floor(z * DC), 83492791)) & (DH - 1);

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
    this.amp = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.kt = new Float32Array(max);
    this.kind = new Uint8Array(max);
    this.rot = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.gy = new Float32Array(max);
    this.seed = new Float32Array(max);
    this.sh = new Float32Array(max * 2).fill(1);
    for (let i = 0; i < max; i++) this.seed[i] = Math.random();
    // self-shadow: the cloud's density in a hashed grid of 0.9 m cells
    this.dens = new Float32Array(DH);
    // one quad, drawn once per particle
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const inst = (a, n) => new THREE.InstancedBufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    this.aP = inst(this.p, 3);
    this.aV = inst(this.v, 3);
    this.aS = inst(this.size, 1);
    this.aA = inst(this.alpha, 1);
    this.aK = inst(this.kt, 1);
    this.aSh = inst(this.sh, 2);
    g.setAttribute('iPos', this.aP);
    g.setAttribute('iVel', this.aV);
    g.setAttribute('aSize', this.aS);
    g.setAttribute('aAlpha', this.aA);
    g.setAttribute('aKT', this.aK);
    g.setAttribute('aSh', this.aSh);
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(this.seed, 1));
    g.instanceCount = max;
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uSun: { value: new THREE.Color(1, 1, 1) },
      uSky: { value: new THREE.Color(0.5, 0.55, 0.6) },
      uBounce: { value: new THREE.Color(0.8, 0.8, 0.8) },
      uSunW: { value: new THREE.Vector3(0, 1, 0) },
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
    this.frameN = 0;
    this.wind = { x: 0, z: 0 };
    // clumps roll on the real ground every frame: only so many at once
    this.chunkMax = LO ? 110 : 280;
    this.chunks = 0;
    // spindrift
    this.accG = 0; this.ridgeT = 0; this.ridges = [];
  }

  // one particle of a kind
  spawn(kind, x, y, z, vx, vy, vz, size, life, amp = 1, grow = 1) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.max;
    if (this.kind[i] === CHUNK && this.age[i] < this.life[i]) this.chunks--;
    const k = i * 3;
    this.p[k] = x; this.p[k + 1] = y; this.p[k + 2] = z;
    this.v[k] = vx; this.v[k + 1] = vy; this.v[k + 2] = vz;
    this.kind[i] = kind; this.life[i] = life; this.age[i] = 0;
    this.base[i] = size; this.size[i] = size; this.amp[i] = amp; this.grow[i] = grow;
    this.rot[i] = Math.random(); this.spin[i] = (Math.random() - 0.5) * 14;
    this.gy[i] = -1e9;
    if (kind === CHUNK) this.chunks++;
    return i;
  }

  // a mixed throw of crystals and mist (jit: how far round the point they start; grainK > 1 makes
  // more of them crystals; hang > 1: the mist lingers longer)
  emit(x, y, z, vx, vy, vz, spread, size, life, n = 1, jit = 0.3, grainK = 1, hang = 1, amp = 1) {
    const pg = 1 - 0.55 / Math.max(0.5, grainK);
    for (let k = 0; k < n; k++) {
      const grain = Math.random() < pg;
      // grains leave faster and stay together; the mist puffs out wider
      const sp = grain ? spread * 0.75 : spread;
      const kick = grain ? 1.15 : 0.9;
      this.spawn(grain ? GRAIN : MIST,
        x + (Math.random() - 0.5) * jit, y + Math.random() * jit * 0.5, z + (Math.random() - 0.5) * jit,
        vx * kick + (Math.random() - 0.5) * sp, vy * kick + Math.random() * sp * 0.7, vz * kick + (Math.random() - 0.5) * sp,
        size * (0.5 + Math.random()) * (grain ? 0.035 + Math.random() * 0.04 : 0.42),
        life * (0.6 + Math.random() * 0.6) * (grain ? 0.8 : 1.15 * hang), grain ? 1 : amp, grain ? 1 : 0.85 + 0.15 * hang);
    }
  }

  // clumps of snow (size: across, metres)
  emitChunks(x, y, z, vx, vy, vz, spread, size, n = 1) {
    for (let k = 0; k < n && this.chunks < this.chunkMax; k++) {
      this.spawn(CHUNK, x + (Math.random() - 0.5) * 0.3, y + Math.random() * 0.1, z + (Math.random() - 0.5) * 0.3,
        vx + (Math.random() - 0.5) * spread, vy + Math.random() * spread * 0.4, vz + (Math.random() - 0.5) * spread,
        size * (0.35 + Math.random() * Math.random() * 1.3), 3.5 + Math.random() * 3);
    }
  }

  // something hits the snow (a landing, a fall): a ring of crystals out low and fast, a cloud that
  // billows up and hangs, clumps knocked out to tumble away. k 0..1 how hard, pw how deep the snow
  impact(x, y, z, vx, vz, k, pw = 0, spread = 3) {
    k = Math.min(1.2, Math.max(0.1, k));
    const ng = Math.round((24 + 90 * k) * (1 - pw * 0.4)), nm = Math.round(7 + 18 * k + pw * 18), nc = Math.round(2 + 10 * k + pw * 10);
    for (let i = 0; i < ng; i++) {
      const a = Math.random() * TAU, s = (1.5 + Math.random() * 4.5) * (0.5 + k) * (spread / 3);
      this.spawn(GRAIN, x + Math.cos(a) * 0.3, y + 0.05, z + Math.sin(a) * 0.3,
        vx * 0.3 + Math.cos(a) * s, 0.8 + Math.random() * 3 * (0.4 + k), vz * 0.3 + Math.sin(a) * s,
        0.55 * (0.5 + Math.random()) * (0.035 + Math.random() * 0.04), 0.5 + Math.random() * 0.6);
    }
    for (let i = 0; i < nm; i++) {
      const a = Math.random() * TAU, s = (0.6 + Math.random() * 2.2) * (0.6 + k) * (spread / 3);
      this.spawn(MIST, x + Math.cos(a) * 0.4, y + Math.random() * 0.4, z + Math.sin(a) * 0.4,
        vx * 0.25 + Math.cos(a) * s, 0.6 + Math.random() * (1.5 + 2 * k + pw * 1.5), vz * 0.25 + Math.sin(a) * s,
        (0.22 + Math.random() * 0.3) * (0.8 + k * 0.3 + pw * 0.3), (1.0 + Math.random() * 0.9) * (1 + pw * 0.5), 1, 1.05 + pw * 0.3);
    }
    this.emitChunks(x, y + 0.1, z, vx * 0.35, 1 + 1.5 * k, vz * 0.35, 2 + 2.5 * k, 0.045 + 0.05 * k + pw * 0.04, nc);
  }

  setLight(L) {
    if (!L) return;
    const U = this.uniforms;
    U.uSun.value.copy(L.sun); U.uSky.value.copy(L.sky); U.uBounce.value.copy(L.bounce);
  }

  update(dt, L, sunDir, camera, wind) {
    this.setLight(L);
    const U = this.uniforms;
    U.uTime.value += dt;
    this.frameN++;
    if (sunDir) U.uSunW.value.copy(sunDir);
    const wx = wind ? wind.x * wind.s : 0, wz = wind ? wind.z * wind.s : 0;
    this.wind.x = wx; this.wind.z = wz;
    // grains: little drag, real gravity; the mist: heavy drag, carried off on the wind, sinking slowly
    const dG = Math.exp(-0.7 * dt), dM = Math.exp(-2.4 * dt), dW = Math.exp(-3 * dt);
    const P = this.p, V = this.v, f = this.frameN, t0 = U.uTime.value;
    let chunks = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.age[i] >= this.life[i]) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.age[i] += dt;
      const t = Math.min(0.999, this.age[i] / this.life[i]);
      const k = i * 3, kind = this.kind[i];
      // the ground under it, looked up now and then
      if (kind === CHUNK || ((i + f) & 3) === 0 || this.gy[i] < -1e8) this.gy[i] = heightAt(P[k], P[k + 2]);
      const gy = this.gy[i];
      if (kind === GRAIN) {
        V[k] = wx * 0.4 + (V[k] - wx * 0.4) * dG; V[k + 2] = wz * 0.4 + (V[k + 2] - wz * 0.4) * dG;
        V[k + 1] = V[k + 1] * dG - 9.0 * dt;
        P[k] += V[k] * dt; P[k + 1] += V[k + 1] * dt; P[k + 2] += V[k + 2] * dt;
        // grains land and lie there a moment
        if (P[k + 1] < gy) { P[k + 1] = gy; V[k + 1] = 0; V[k] *= 0.3; V[k + 2] *= 0.3; this.age[i] = Math.max(this.age[i], this.life[i] * 0.8); }
        this.size[i] = this.base[i];
        this.alpha[i] = (1 - t * t) * Math.min(1, t * 12) * 0.85;
        this.kt[i] = GRAIN + t;
      } else if (kind === MIST || kind === WISP) {
        const s = this.seed[i] * 40, a = this.age[i];
        // a puff relaxes to the wind, churns, and settles toward a slow sink
        const drag = kind === WISP ? dW : dM;
        V[k] = wx + (V[k] - wx) * drag + Math.sin(a * 2.1 + s) * 0.7 * dt;
        V[k + 2] = wz + (V[k + 2] - wz) * drag + Math.cos(a * 1.7 + s * 1.3) * 0.7 * dt;
        V[k + 1] = (kind === WISP ? 0.05 : -0.22) + (V[k + 1] - (kind === WISP ? 0.05 : -0.22)) * drag + Math.sin(a * 1.3 + s * 0.7) * 0.25 * dt;
        P[k] += V[k] * dt; P[k + 1] += V[k + 1] * dt; P[k + 2] += V[k + 2] * dt;
        // (it rolls over the snow rather than through it)
        const floor = gy + this.size[i] * (kind === WISP ? 0.08 : 0.22);
        if (P[k + 1] < floor) { P[k + 1] += (floor - P[k + 1]) * Math.min(1, dt * 8); if (V[k + 1] < 0) V[k + 1] *= 0.5; }
        if (kind === MIST) {
          // it billows: quickly at first, then slowly as it hangs
          this.size[i] = this.base[i] * (0.55 + 1.9 * this.grow[i] * Math.sqrt(t));
          this.alpha[i] = Math.pow(1 - t, 1.3) * Math.min(1, t * 10) * 0.8 * this.amp[i];
        } else {
          this.size[i] = this.base[i] * (0.8 + 0.6 * t);
          this.alpha[i] = Math.sin(t * Math.PI) * 0.32 * this.amp[i];
        }
        this.kt[i] = kind + t;
      } else {
        // a clump: thrown, lands, bounces, rolls down the fall line until it stops, then lies there
        const r = this.base[i] * 0.42;
        V[k + 1] -= 9.81 * dt;
        const dA = Math.exp(-0.15 * dt);
        V[k] *= dA; V[k + 2] *= dA;
        P[k] += V[k] * dt; P[k + 1] += V[k + 1] * dt; P[k + 2] += V[k + 2] * dt;
        if (P[k + 1] < gy + r) {
          P[k + 1] = gy + r;
          normalAt(P[k], P[k + 2], _n, 0.4);
          let vn = V[k] * _n.x + V[k + 1] * _n.y + V[k + 2] * _n.z;
          if (vn < 0) {
            // a hard hit breaks it up a little
            if (vn < -4 && this.base[i] > 0.06 && Math.random() < 0.6) {
              this.base[i] *= 0.7;
              this.emit(P[k], P[k + 1], P[k + 2], V[k] * 0.4, 0.8, V[k + 2] * 0.4, 1.2, 0.35, 0.6, 3, 0.1, 1.6);
            }
            V[k] -= _n.x * vn * 1.22; V[k + 1] -= _n.y * vn * 1.22; V[k + 2] -= _n.z * vn * 1.22;
            vn = 0;
          }
          // down the slope (a rolling ball: 5/7 g along it), snow friction slowing it
          const gt = 9.81 * (5 / 7);
          V[k] += _n.x * _n.y * gt * dt; V[k + 1] += (_n.y * _n.y - 1) * gt * dt; V[k + 2] += _n.z * _n.y * gt * dt;
          const sp = Math.hypot(V[k], V[k + 1], V[k + 2]);
          const fr = Math.max(0, 1 - (2.2 + 1.5 / (sp + 0.3)) * dt / Math.max(0.05, sp));
          V[k] *= fr; V[k + 1] *= fr; V[k + 2] *= fr;
          // rolling turns it
          this.rot[i] += (sp * dt) / (TAU * Math.max(0.01, r)) * (this.spin[i] > 0 ? 1 : -1);
          if (sp < 0.05) { V[k] = 0; V[k + 1] = 0; V[k + 2] = 0; }
        } else this.rot[i] += this.spin[i] * dt / TAU;
        this.rot[i] -= Math.floor(this.rot[i]);
        this.size[i] = this.base[i];
        this.alpha[i] = Math.min(1, t * 30) * (1 - Math.max(0, (t - 0.75) / 0.25)) * 0.97;
        this.kt[i] = CHUNK + Math.min(0.999, this.rot[i]);
        chunks++;
      }
    }
    this.chunks = chunks;
    this.shade(sunDir);
    this.aP.needsUpdate = true; this.aV.needsUpdate = true; this.aS.needsUpdate = true; this.aA.needsUpdate = true; this.aK.needsUpdate = true; this.aSh.needsUpdate = true;
  }

  // the cloud shades itself: splat every puff's density into the grid, then look from each
  // particle toward the sun (how much sun gets through) and straight up (how much sky)
  shade(sunDir) {
    const D = this.dens, P = this.p, A = this.alpha, S = this.size, K = this.kind, SH = this.sh;
    D.fill(0);
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (A[i] <= 0.002 || (K[i] !== MIST && K[i] !== WISP)) continue;
      const k = i * 3;
      D[dhash(P[k], P[k + 1], P[k + 2])] += A[i] * Math.min(2.5, S[i]) * 0.9;
      any = true;
    }
    const sx = sunDir ? sunDir.x : 0, sy = sunDir ? Math.max(0.05, sunDir.y) : 1, sz = sunDir ? sunDir.z : 0;
    for (let i = 0; i < this.max; i++) {
      if (A[i] <= 0.002) continue;
      if (!any) { SH[i * 2] = 1; SH[i * 2 + 1] = 1; continue; }
      const k = i * 3, x = P[k], y = P[k + 1], z = P[k + 2];
      let ds = 0, du = 0;
      for (let j = 1; j <= 4; j++) ds += D[dhash(x + sx * 0.8 * j, y + sy * 0.8 * j, z + sz * 0.8 * j)];
      for (let j = 1; j <= 2; j++) du += D[dhash(x, y + 0.9 * j, z)];
      // (its own cell: inside a thick cloud the sky is dimmer too)
      const own = D[dhash(x, y, z)];
      SH[i * 2] = Math.exp(-ds * 1.1);
      SH[i * 2 + 1] = Math.exp(-(du * 0.8 + own * 0.25));
    }
  }

  // the wind lifting snow: wisps streaming over the snow round you, and spindrift smoking off the
  // crests that face into it
  weather(dt, cam, wind) {
    if (!wind || wind.s < 1.5) { this.ridges.length = 0; return; }
    const s = wind.s, dx = wind.x, dz = wind.z, wx = dx * s, wz = dz * s;
    this.accG += dt * Math.min(9, s - 1.5) * (LO ? 5 : 11);
    while (this.accG >= 1) {
      this.accG -= 1;
      // (more of them upwind, where they come from)
      const r = 3 + Math.random() * 38, a = Math.random() * TAU;
      const x = cam.x + Math.cos(a) * r - dx * 10, z = cam.z + Math.sin(a) * r - dz * 10;
      const gy = heightAt(x, z);
      const k = 0.8 + Math.random() * 0.5;
      this.spawn(WISP, x, gy + 0.04 + Math.random() * Math.random() * 0.5, z, wx * k, 0.05 + Math.random() * 0.25, wz * k,
        0.5 + Math.random() * 1.1, 1.2 + Math.random() * 1.6, Math.min(1.3, 0.35 + s / 9));
    }
    // look for crests: higher than the ground either side along the wind, dropping off to the lee
    this.ridgeT -= dt;
    if (this.ridgeT <= 0) {
      this.ridgeT = 0.2;
      for (let j = 0; j < 5; j++) {
        const r = 25 + Math.random() * 150, a = Math.random() * TAU;
        const x = cam.x + Math.cos(a) * r, z = cam.z + Math.sin(a) * r;
        const h0 = heightAt(x, z), hUp = heightAt(x - dx * 6, z - dz * 6), hDn = heightAt(x + dx * 6, z + dz * 6);
        if (h0 - (hUp + hDn) / 2 > 0.7 && h0 - hDn > 1.0) {
          if (this.ridges.length >= (LO ? 6 : 12)) this.ridges.shift();
          this.ridges.push({ x, z, y: h0, k: Math.min(1.5, (h0 - (hUp + hDn) / 2) / 1.5) });
        }
      }
      this.ridges = this.ridges.filter((q) => Math.hypot(q.x - cam.x, q.z - cam.z) < 190);
    }
    if (s < 3) return;
    for (const q of this.ridges) {
      const n = Math.random() < dt * (s - 2.5) * q.k * (LO ? 1.5 : 3) ? 1 : 0;
      if (!n) continue;
      // a plume off the lip, streaming out downwind and up
      const o = (Math.random() - 0.5) * 8;
      const x = q.x - dz * o, z = q.z + dx * o;
      const k = 1 + Math.random() * 0.4;
      this.spawn(MIST, x, q.y + 0.2, z, wx * k, 0.4 + Math.random() * 1.4, wz * k,
        1.2 + Math.random() * 2.2, 2.5 + Math.random() * 2.5, 0.55 + Math.random() * 0.35, 1.6);
      if (Math.random() < 0.5) this.spawn(WISP, x, q.y + 0.1, z, wx * k * 1.2, 0.3 + Math.random() * 0.6, wz * k * 1.2, 1.5 + Math.random() * 2, 2 + Math.random() * 1.5, 1.2);
    }
  }
}

// Falling snow: flakes in three nested boxes round the camera (near, middle and far), moved on
// the GPU (each its own fall rate and flutter, all riding the wind), wrapped round the camera,
// and drawn as the streak each flake leaves in a frame as it and the camera move, so a fast run
// pulls them into lines and a still camera sees them drift. Big soft discs right at the lens.
const fallVert = /* glsl */`
  attribute vec3 iBase; attribute vec4 iProp;
  uniform vec3 uCam, uDrift, uWindV, uCamV, uBoxes; uniform vec2 uRes; uniform float uTime, uExpo, uSizeK;
  varying vec2 vUv; varying float vLen; varying float vA;
  #include <fog_pars_vertex>
  void main() {
    float layer = iProp.w;
    float B = layer < 0.5 ? uBoxes.x : layer < 1.5 ? uBoxes.y : uBoxes.z;
    float H = B * 0.6;
    float size = iProp.x * uSizeK, fall = iProp.y, ph = iProp.z;
    // a flake flutters side to side as it falls (the small ones most)
    float fl = (0.15 + 0.35 * fract(ph * 7.13)) * (1.0 - min(1.0, size * 25.0) * 0.5);
    float w1 = 0.9 + 1.4 * fract(ph * 3.31), w2 = 0.7 + 1.1 * fract(ph * 5.71);
    float a1 = uTime * w1 + ph * 6.2831, a2 = uTime * w2 + ph * 4.0;
    vec3 flut = vec3(sin(a1), 0.0, cos(a2)) * fl;
    vec3 flutV = vec3(cos(a1) * w1, 0.0, -sin(a2) * w2) * fl;
    vec3 w = iBase * vec3(B, H, B) + uDrift * (0.8 + 0.4 * fract(ph * 11.3)) + vec3(0.0, -uTime * fall, 0.0) + flut;
    // (the box sits mostly above the camera: below it is mostly snow)
    vec3 o = uCam - vec3(B * 0.5, H * 0.3, B * 0.5);
    w = mod(w - o, vec3(B, H, B)) + o;
    vec3 q = abs(w - o - vec3(B * 0.5, H * 0.5, B * 0.5)) / vec3(B * 0.5, H * 0.5, B * 0.5);
    float edge = 1.0 - smoothstep(0.72, 0.98, max(q.x, max(q.y, q.z)));
    vec4 mvPosition = viewMatrix * vec4(w, 1.0);
    float d = -mvPosition.z;
    vA = 0.0; vUv = position.xy; vLen = 1.0;
    if (d < 0.12 || edge <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    // where it was a moment ago, relative to the moving camera
    vec3 rel = vec3(uWindV.x * (0.8 + 0.4 * fract(ph * 11.3)), -fall, uWindV.z * (0.8 + 0.4 * fract(ph * 11.3))) + flutV - uCamV;
    vec4 v1 = viewMatrix * vec4(w - rel * uExpo, 1.0);
    v1.z = min(v1.z, -0.1);
    vec4 c0 = projectionMatrix * mvPosition, c1 = projectionMatrix * v1;
    vec2 s0 = c0.xy / c0.w, s1 = c1.xy / c1.w;
    vec2 dpx = (s0 - s1) * 0.5 * uRes;
    float len = min(length(dpx), 90.0);
    vec2 dir = len > 1e-3 ? normalize(dpx) : vec2(1.0, 0.0);
    // (a trail that ran back past the lens is cut short)
    s1 = s0 - dir * len / (0.5 * uRes);
    // its radius in pixels; out of focus right by the lens, a bigger, fainter disc
    float rad = size * 0.5 * projectionMatrix[1][1] * 0.5 * uRes.y / d;
    float r = max(rad, 0.6) + max(0.0, 1.1 - d) * 7.0;
    float a = min(1.0, (rad * rad + 0.15) / (r * r));
    // a long streak spreads the same light thinner
    a *= r / (r + len * 0.45);
    vLen = (len * 0.5 + r) / r;
    vec2 off = dir * position.x * (len * 0.5 + r) + vec2(-dir.y, dir.x) * position.y * r;
    vec2 ndc = (s0 + s1) * 0.5 + off / (0.5 * uRes);
    gl_Position = vec4(ndc * c0.w, c0.z, c0.w);
    vA = a * edge * (0.55 + 0.45 * fract(ph * 17.7));
    #include <fog_vertex>
  }`;
const fallFrag = /* glsl */`
  uniform vec3 uColor;
  varying vec2 vUv; varying float vLen; varying float vA;
  #include <fog_pars_fragment>
  void main() {
    vec2 q = vec2(vUv.x * vLen, vUv.y);
    float dx = max(0.0, abs(q.x) - (vLen - 1.0));
    float r2 = dx * dx + q.y * q.y;
    if (r2 > 1.0 || vA < 0.004) discard;
    gl_FragColor = vec4(uColor, smoothstep(1.0, 0.2, r2) * vA);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export class Snowfall {
  constructor(scene, n = LO ? 6000 : 14000) {
    this.n = n;
    this.boxes = new THREE.Vector3(14, 40, 110);
    const base = new Float32Array(n * 3), prop = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      base[i * 3] = Math.random(); base[i * 3 + 1] = Math.random(); base[i * 3 + 2] = Math.random();
      const r = Math.random();
      const layer = r < 0.3 ? 0 : r < 0.74 ? 1 : 2;
      // most flakes small, a few big wet clumps (1-5 cm)
      const size = 0.01 + Math.pow(Math.random(), 2.6) * 0.04;
      prop[i * 4] = size;
      prop[i * 4 + 1] = 0.75 + Math.random() * 0.55 + size * 9;
      prop[i * 4 + 2] = Math.random();
      prop[i * 4 + 3] = layer;
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('iBase', new THREE.InstancedBufferAttribute(base, 3));
    g.setAttribute('iProp', new THREE.InstancedBufferAttribute(prop, 4));
    g.instanceCount = n;
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uColor: { value: new THREE.Color(1, 1, 1) },
      uCam: { value: new THREE.Vector3() }, uDrift: { value: new THREE.Vector3() }, uWindV: { value: new THREE.Vector3() },
      uCamV: { value: new THREE.Vector3() }, uBoxes: { value: this.boxes }, uRes: { value: new THREE.Vector2(1280, 720) },
      uTime: { value: 0 }, uExpo: { value: 1 / 55 }, uSizeK: { value: 1 },
    }]);
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: fallVert, fragmentShader: fallFrag, transparent: true, depthWrite: false, fog: true });
    this.points = new THREE.Mesh(g, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
    this.k = 1;
    this.last = null;
    this._v = new THREE.Vector3();
  }

  // how hard it's snowing (0.45 showers, 1 a powder day, 1.6 a whiteout)
  setAmount(k) {
    this.k = k;
    this.points.geometry.instanceCount = Math.round(this.n * Math.min(1, Math.max(0.15, k * 0.85)));
    // (a storm's flakes are bigger, wet clumps driven by the wind)
    this.uniforms.uSizeK.value = 1 + Math.max(0, k - 1) * 0.5;
  }

  // cam: the camera's position; wind: the world's wind (or null); col: the light on the snow
  update(dt, cam, wind, col, res) {
    if (!this.points.visible) return;
    const U = this.uniforms;
    U.uTime.value += dt;
    if (U.uTime.value > 4000) U.uTime.value -= 4000;
    const s = wind ? wind.s : 0.5, wx = wind ? wind.x * s : 0.4, wz = wind ? wind.z * s : 0.3;
    U.uWindV.value.set(wx, 0, wz);
    U.uDrift.value.x = (U.uDrift.value.x + wx * dt) % 4400;
    U.uDrift.value.z = (U.uDrift.value.z + wz * dt) % 4400;
    // how fast the camera's moving (for the streaks), ignoring cuts
    if (this.last && dt > 0) {
      this._v.subVectors(cam, this.last).divideScalar(dt);
      if (this._v.length() > 60) this._v.set(0, 0, 0);
      U.uCamV.value.lerp(this._v, Math.min(1, dt * 12));
    }
    (this.last ??= new THREE.Vector3()).copy(cam);
    U.uCam.value.copy(cam);
    if (col) U.uColor.value.copy(col);
    if (res) U.uRes.value.copy(res);
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
