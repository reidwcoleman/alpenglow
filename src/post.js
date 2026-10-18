// Post stack: HDR render -> bloom -> tone map -> lens (speed blur, vignette, grain).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

const LensShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSpeed: { value: 0 },
    uTime: { value: 0 },
    uVignette: { value: 0.32 },
    uWarm: { value: new THREE.Vector3(1, 1, 1) },
    uSat: { value: 1.08 },
    uCon: { value: 1.05 },
    uFlash: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uSpeed, uTime, uVignette, uFlash, uSat, uCon; uniform vec3 uWarm;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r = length(c);
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      // radial speed blur toward the edges
      float k = uSpeed * smoothstep(0.18, 0.75, r);
      if (k > 0.001) {
        vec3 acc = col; float w = 1.0;
        for (int i = 1; i <= 7; i++) {
          float s = float(i) / 7.0;
          vec2 uv = vUv - c * s * k * 0.09;
          acc += texture2D(tDiffuse, uv).rgb * (1.0 - s * 0.5); w += 1.0 - s * 0.5;
        }
        col = acc / w;
      }
      // subtle chromatic fringe at the edges
      float ca = 0.0006 * smoothstep(0.25, 0.8, r);
      col.r = mix(col.r, texture2D(tDiffuse, vUv + c * ca).r, 0.6);
      col.b = mix(col.b, texture2D(tDiffuse, vUv - c * ca).b, 0.6);
      col *= uWarm;
      // grade: a touch more colour and snap
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uCon + 0.5;
      col *= 1.0 - uVignette * smoothstep(0.3, 0.95, r * 1.25);
      col += (h(vUv * 931.0 + uTime) - 0.5) * 0.022;
      col = mix(col, vec3(1.0), uFlash);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// sun shafts: the sky (depth at the far plane) near the sun, smeared toward it and added on.
// Runs in HDR before tone mapping, so it blooms with the rest.
const ShaftShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSun: { value: new THREE.Vector2(0.5, 0.5) }, uK: { value: 0 }, uTint: { value: new THREE.Color(1, 0.9, 0.75) }, uAspect: { value: 1.7 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uK, uAspect; uniform vec3 uTint;
    varying vec2 vUv;
    // the sky dome writes alpha 0, everything solid writes 1
    float sky(vec2 uv) {
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
      vec4 c = texture2D(tDiffuse, uv);
      vec2 o = (uv - uSun) * vec2(uAspect, 1.0);
      return (1.0 - step(0.02, c.a)) * min(dot(c.rgb, vec3(0.3333)), 3.0) * exp(-dot(o, o) * 11.0);
    }
    void main(){
      vec4 c0 = texture2D(tDiffuse, vUv);
      vec3 col = c0.rgb;
      if (uK > 0.001) {
        vec2 dir = (vUv - uSun) / 40.0;
        vec2 uv = vUv;
        float acc = 0.0, w = 1.0;
        for (int i = 0; i < 40; i++) { acc += sky(uv) * w; w *= 0.965; uv -= dir; }
        // solid things in front only catch a little of the haze
        col += uTint * acc * uK / 40.0 * mix(0.28, 1.0, 1.0 - step(0.02, c0.a));
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera, opts) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: opts.msaa });
    this.composer = new EffectComposer(renderer, rt);
    // the scene renders into its own target with a depth texture the shafts can read
    this.sceneRT = rt;
    this.composer.addPass(new RenderPass(scene, camera));
    this.shafts = new ShaderPass(ShaftShader);
    this.composer.addPass(this.shafts);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.22, 0.45, 2.6);
    this.bloom.enabled = opts.bloom;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.lens = new ShaderPass(LensShader);
    this.composer.addPass(this.lens);
    if (opts.smaa) this.composer.addPass(new SMAAPass());
  }

  setSize(w, h) { this.composer.setSize(w, h); }
  setPixelRatio(r) { this.composer.setPixelRatio(r); }
  // place the sun on screen for the shafts (k: strength for these conditions)
  sun(camera, dir, k) {
    const v = this._v ??= new THREE.Vector3();
    v.copy(dir).multiplyScalar(10000).add(camera.position).project(camera);
    const behind = new THREE.Vector3().copy(dir).dot(camera.getWorldDirection(new THREE.Vector3())) < 0;
    const u = this.shafts.uniforms;
    u.uSun.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
    u.uAspect.value = camera.aspect;
    const off = Math.max(Math.abs(v.x), Math.abs(v.y));
    u.uK.value = behind ? 0 : k * (1 - Math.min(1, Math.max(0, off - 1) / 0.6));
    this.shafts.enabled = u.uK.value > 0.001;
  }

  render(dt) {
    this.lens.uniforms.uTime.value = (this.lens.uniforms.uTime.value + dt) % 100;
    this.composer.render(dt);
  }
}
