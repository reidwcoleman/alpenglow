// Trails (a Shop item): coloured light the skis leave in the air behind the rider, carving or
// flying. fx: 'fade' (c to c2 over its life), 'rainbow' (the hue runs round as you go),
// 'sparkle' (glittering motes that twinkle), 'fire' (rises and burns from c through c2 to
// smoke). Soft points over the snow.
import * as THREE from 'three';

const N = 1800;
const vert = /* glsl */`
  attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
  varying float vAlpha; varying vec3 vColor;
  uniform float uScale;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(64.0, aSize * uScale / max(0.1, -mv.z));
    vAlpha = aAlpha; vColor = aColor;
  }`;
const frag = /* glsl */`
  varying float vAlpha; varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * (0.85 + 0.3 * a), a * vAlpha);
  }`;

const _c = new THREE.Color(), _c2 = new THREE.Color();

export class Trail {
  constructor(scene) {
    const g = new THREE.BufferGeometry();
    this.p = new Float32Array(N * 3).fill(-1e4);
    this.v = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.size = new Float32Array(N);
    this.alpha = new Float32Array(N);
    this.life = new Float32Array(N);
    this.max = new Float32Array(N);
    this.seed = new Float32Array(N);
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: { uScale: { value: 600 } }, transparent: true, depthWrite: false });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.i = 0; this.acc = 0; this.t = 0; this.live = false;
  }

  setScale(h) { this.mat.uniforms.uScale.value = h * 0.8; }

  // the rider (or null) and his trail { c, c2, fx } (or null: none)
  update(dt, s, tr) {
    this.t += dt;
    if (s && tr && !s.hidden && !s.held && s.crash <= 0) {
      const sp = s.speed;
      const rate = sp > 4 ? 90 + sp * 8 : 0;
      this.acc += rate * dt;
      while (this.acc >= 1) { this.acc -= 1; this.emit(s, tr); }
    }
    let any = false;
    const P = this.p, V = this.v;
    for (let k = 0; k < N; k++) {
      if (this.life[k] <= 0) continue;
      any = true;
      this.life[k] -= dt;
      const f = 1 - this.life[k] / this.max[k];
      if (this.life[k] <= 0) { P[k * 3 + 1] = -1e4; this.alpha[k] = 0; continue; }
      P[k * 3] += V[k * 3] * dt; P[k * 3 + 1] += V[k * 3 + 1] * dt; P[k * 3 + 2] += V[k * 3 + 2] * dt;
      const damp = Math.exp(-dt * 2.5);
      V[k * 3] *= damp; V[k * 3 + 2] *= damp; V[k * 3 + 1] = V[k * 3 + 1] * damp + (this.fx === 'fire' ? 1.2 * dt : -0.25 * dt);
      let a = (1 - f) * (1 - f);
      if (this.fx === 'sparkle') a *= 0.45 + 0.55 * Math.max(0, Math.sin(this.t * 22 + this.seed[k] * 40));
      this.alpha[k] = a * 0.9;
      if (this.fx === 'fire') {
        // burns from the first colour through the second to grey smoke
        _c.setRGB(this.base[0], this.base[1], this.base[2]).lerp(_c2.setRGB(this.base[3], this.base[4], this.base[5]), Math.min(1, f * 1.6));
        if (f > 0.6) _c.lerp(_c2.setRGB(0.25, 0.25, 0.27), (f - 0.6) / 0.4);
        this.col[k * 3] = _c.r; this.col[k * 3 + 1] = _c.g; this.col[k * 3 + 2] = _c.b;
        this.size[k] = (0.35 + f * 0.6) * (0.7 + this.seed[k] * 0.6);
      }
    }
    const g = this.points.geometry;
    if (any || this.live) for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) g.attributes[k].needsUpdate = true;
    this.live = any;
  }

  emit(s, tr) {
    const k = this.i++ % N;
    this.fx = tr.fx;
    // from the feet, a little behind and either side
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    const side = (Math.random() - 0.5) * 0.35;
    this.p[k * 3] = s.pos.x - fx * 0.5 + fz * side;
    this.p[k * 3 + 1] = s.pos.y + 0.12 + Math.random() * 0.25;
    this.p[k * 3 + 2] = s.pos.z - fz * 0.5 - fx * side;
    this.v[k * 3] = (Math.random() - 0.5) * 0.8 + s.vel.x * 0.05;
    this.v[k * 3 + 1] = Math.random() * 0.5;
    this.v[k * 3 + 2] = (Math.random() - 0.5) * 0.8 + s.vel.z * 0.05;
    const L = tr.fx === 'fire' ? 0.9 : tr.fx === 'sparkle' ? 1.6 : 1.3;
    this.life[k] = this.max[k] = L * (0.7 + Math.random() * 0.6);
    this.seed[k] = Math.random();
    _c.set(tr.c); _c2.set(tr.c2 ?? tr.c);
    this.base = [_c.r, _c.g, _c.b, _c2.r, _c2.g, _c2.b];
    if (tr.fx === 'rainbow') _c.setHSL((this.t * 1.5) % 1, 1, 0.5);
    else if (tr.fx === 'fade' || tr.fx === 'sparkle') _c.lerp(_c2, Math.random());
    this.col[k * 3] = _c.r; this.col[k * 3 + 1] = _c.g; this.col[k * 3 + 2] = _c.b;
    this.size[k] = tr.fx === 'sparkle' ? 0.14 + Math.random() * 0.12 : 0.32 + Math.random() * 0.25;
    this.alpha[k] = 0.9;
  }

  clear() { this.life.fill(0); this.p.fill(-1e4); this.alpha.fill(0); this.live = true; }
}
