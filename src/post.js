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
    uFlash: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uSpeed, uTime, uVignette, uFlash; uniform vec3 uWarm;
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
      col *= 1.0 - uVignette * smoothstep(0.3, 0.95, r * 1.25);
      col += (h(vUv * 931.0 + uTime) - 0.5) * 0.022;
      col = mix(col, vec3(1.0), uFlash);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera, opts) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: opts.msaa });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
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
  render(dt) {
    this.lens.uniforms.uTime.value = (this.lens.uniforms.uTime.value + dt) % 100;
    this.composer.render(dt);
  }
}
