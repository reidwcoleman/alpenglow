// Ski tracks: grooves pressed into the snow behind every rider. Each quad knows where it sits
// across its track (u, -1..1) and along it (metres); the shader works the groove out per pixel
// and lights it like the snow round it. Carves are two sharp trenches with a lip of pushed-up
// snow, a board one wide one, skids a scraped glossy smear with a berm thrown to the outside,
// powder a deep trench, landings and falls a crater. Old track fades out as the ring wraps.
import * as THREE from 'three';
import { heightAt } from './course.js';

// kinds (the shader's profiles)
const CARVE = 0, SKID = 1, POWDER = 2, BOARD = 3, CRATER = 4;
const _side = new THREE.Vector3(), _fw = new THREE.Vector3();

export class Tracks {
  constructor(scene, segs = 36000) {
    this.segs = segs;
    const vCount = segs * 4;
    this.pos = new Float32Array(vCount * 3);
    this.nrm = new Float32Array(vCount * 3);
    this.sid = new Float32Array(vCount * 3);
    this.inf = new Float32Array(vCount * 4);
    const idx = new Uint32Array(segs * 6);
    for (let i = 0; i < segs; i++) {
      const v = i * 4, k = i * 6;
      idx[k] = v; idx[k + 1] = v + 2; idx[k + 2] = v + 1;
      idx[k + 3] = v + 1; idx[k + 4] = v + 2; idx[k + 5] = v + 3;
    }
    const g = new THREE.BufferGeometry();
    const dyn = (a, n) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    this.attrs = [[this.aPos = dyn(this.pos, 3), 3], [this.aNrm = dyn(this.nrm, 3), 3], [this.aSid = dyn(this.sid, 3), 3], [this.aInf = dyn(this.inf, 4), 4]];
    g.setAttribute('position', this.aPos);
    g.setAttribute('normal', this.aNrm);
    g.setAttribute('aSide', this.aSid);
    g.setAttribute('aInfo', this.aInf);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.uHead = { value: 0 };
    this.mat = makeTrackMaterial(this.uHead, segs);
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.next = 0;
    this.dirtyMin = Infinity; this.dirtyMax = -1;
  }

  alloc() {
    const sys = this;
    return {
      last: null, along: 0,
      break() { this.last = null; },
      // skid: how much the skis are sliding sideways (m/s-ish); slip: their angle to the travel
      add(pos, fwd, n, skid, powder = 0, board = false, slip = 0) {
        _side.crossVectors(n, fwd).normalize();
        const cur = { x: pos.x, y: pos.y, z: pos.z, sx: _side.x, sz: _side.z };
        const L = this.last;
        if (L) {
          const d = Math.hypot(cur.x - L.x, cur.z - L.z);
          if (d < 3) {
            const v0 = this.along, v1 = (this.along += d);
            // which way the turn throws its snow: to the outside of the curve
            const turn = Math.sign(L.sx * cur.sz - L.sz * cur.sx) || 1;
            if (powder > 0.5) sys.quad(L, cur, 0, (board ? 0.42 : 0.34) + Math.min(skid, 3) * 0.16, v0, v1, POWDER, 0.95, n, 0);
            else if (skid > 0.6) {
              // the skis sweep a smear as wide as they're turned across the line
              const w = Math.min(0.95, (board ? 0.3 : 0.22) + Math.min(skid, 4) * 0.12 + Math.abs(Math.sin(slip)) * 0.55);
              sys.quad(L, cur, 0, w, v0, v1, SKID, Math.min(1, 0.45 + skid * 0.2), n, turn);
            } else if (board) sys.quad(L, cur, 0, 0.17, v0, v1, BOARD, 1, n, 0);
            else for (const o of [0.1, -0.1]) sys.quad(L, cur, o, 0.065, v0, v1, CARVE, 1, n, 0);
          }
        }
        this.last = cur;
      },
      // a dent: a landing's slap or a body's crater, w wide and len long, centred on pos
      dent(pos, dir, n, w, len, depth = 1) {
        _fw.copy(dir).addScaledVector(n, -dir.dot(n)).normalize();
        _side.crossVectors(n, _fw).normalize();
        const a = { x: pos.x - _fw.x * len / 2, z: pos.z - _fw.z * len / 2, sx: _side.x, sz: _side.z };
        const b = { x: pos.x + _fw.x * len / 2, z: pos.z + _fw.z * len / 2, sx: _side.x, sz: _side.z };
        sys.quad(a, b, 0, w, -1, 1, CRATER, Math.min(1, depth), n, 0);
      },
    };
  }

  quad(a, b, off, w, v0, v1, kind, alpha, n, side) {
    const i = this.next;
    this.next = (this.next + 1) % this.segs;
    const v = i * 4;
    const P = this.pos, N = this.nrm, S = this.sid, I = this.inf;
    for (let k = 0; k < 4; k++) {
      const e = k < 2 ? a : b, s = k & 1 ? -1 : 1;
      const x = e.x + e.sx * (off + w * s), z = e.z + e.sz * (off + w * s);
      const j = (v + k) * 3;
      P[j] = x; P[j + 1] = heightAt(x, z) + 0.03; P[j + 2] = z;
      N[j] = n.x; N[j + 1] = n.y; N[j + 2] = n.z;
      S[j] = e.sx * (side || 1); S[j + 1] = 0; S[j + 2] = e.sz * (side || 1);
      const q = (v + k) * 4;
      // u across (flipped so +1 is the outside of the turn for a skid), along, kind, strength
      I[q] = s * (side || 1); I[q + 1] = k < 2 ? v0 : v1; I[q + 2] = kind; I[q + 3] = alpha;
    }
    this.uHead.value = this.next;
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
  }

  flush() {
    if (this.dirtyMax < 0) return;
    const a = this.dirtyMin * 4, b = (this.dirtyMax + 1) * 4;
    for (const [attr, size] of this.attrs) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(a * size, (b - a) * size);
      attr.needsUpdate = true;
    }
    this.dirtyMin = Infinity; this.dirtyMax = -1;
  }
}

function makeTrackMaterial(uHead, segs) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.6, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHead = uHead;
    sh.uniforms.uSegs = { value: segs };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aSide; attribute vec4 aInfo; uniform float uHead, uSegs;
        varying vec4 vInfo; varying vec3 vSide; varying vec3 vTWPos; varying vec3 vTN; varying float vAge;`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        vInfo = aInfo; vSide = aSide; vTN = normal;
        vTWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        // how far back round the ring this quad was laid (0 newest .. 1 about to be reused)
        vAge = mod(uHead - float(gl_VertexID / 4) - 1.0 + uSegs, uSegs) / uSegs;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vInfo; varying vec3 vSide; varying vec3 vTWPos; varying vec3 vTN; varying float vAge;
        float tHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float tNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(tHash(i), tHash(i + vec2(1, 0)), f.x), mix(tHash(i + vec2(0, 1)), tHash(i + vec2(1, 1)), f.x), f.y);
        }
        // the surface's height across (u) and along (v) a track, in "depths"
        float tProf(float u, float v, float kind) {
          float a = abs(u);
          if (kind < 0.5) { // a carved line: a sharp trench, its lip of pushed-up snow
            return -exp(-pow(u / 0.34, 2.0)) + 0.32 * exp(-pow((a - 0.72) / 0.16, 2.0)) * (0.8 + 0.4 * tNoise(vec2(v * 3.0, u)));
          } else if (kind < 1.5) { // a skid: scraped flat, raked along, a berm thrown to the outside
            float rake = (tNoise(vec2(u * 9.0, v * 0.35)) - 0.5) * 0.18 + (tNoise(vec2(u * 31.0, v * 0.8)) - 0.5) * 0.08;
            return -0.12 * (1.0 - smoothstep(0.6, 0.95, a)) + rake * (1.0 - smoothstep(0.7, 1.0, a))
              + 0.55 * exp(-pow((u - 0.84) / 0.11, 2.0)) * (0.7 + 0.6 * tNoise(vec2(v * 1.7, 3.0)));
          } else if (kind < 2.5) { // powder: a deep trench with crumbling walls
            float wall = smoothstep(0.86, 0.5, a + (tNoise(vec2(v * 2.2, u * 2.0)) - 0.5) * 0.14);
            return -wall * (0.9 + 0.1 * tNoise(vec2(v * 5.0, u * 6.0))) + 0.25 * exp(-pow((a - 0.9) / 0.08, 2.0));
          } else if (kind < 3.5) { // a board's carve: one wide trench, flat-bottomed
            return -smoothstep(0.9, 0.62, a) * 0.8 + 0.3 * exp(-pow((a - 0.9) / 0.07, 2.0));
          }
          // a crater: a bowl, lumpy, with a rim
          float r = length(vec2(u, v)) + (tNoise(vec2(u * 3.0, v * 3.0)) - 0.5) * 0.18;
          return -(1.0 - smoothstep(0.0, 0.85, r)) * (0.8 + 0.4 * tNoise(vec2(u * 6.0, v * 6.0))) + 0.3 * exp(-pow((r - 0.9) / 0.08, 2.0));
        }
        float gTDepth; float gTAlpha;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float u = vInfo.x, v = vInfo.y, kind = vInfo.z;
          float h = tProf(u, v, kind);
          // far off, a thin groove is less than a pixel: its average shade instead of shimmer
          float blur = smoothstep(0.25, 0.9, fwidth(u));
          gTDepth = mix(h, kind < 0.5 ? -0.3 : kind < 1.5 ? -0.08 : kind < 2.5 ? -0.55 : -0.4, blur);
          // the snow down in a groove is in its own shade, a little blue; lips catch the light
          float cav = clamp(-gTDepth, 0.0, 1.0), lip = clamp(gTDepth, 0.0, 1.0);
          // (the slope's own albedo, so the touched snow sits in it)
          vec3 snow = vec3(0.448, 0.458, 0.472);
          float depth = kind < 0.5 ? 0.42 : kind < 1.5 ? 0.3 : kind < 2.5 ? 0.5 : 0.42;
          vec3 col = mix(snow, snow * vec3(0.7, 0.8, 0.95), cav * depth) * (1.0 + lip * 0.04);
          // a skid's scraped snow is a touch greyer and packed
          if (kind > 0.5 && kind < 1.5) col *= 0.96 + 0.04 * tNoise(vec2(u * 14.0, v * 0.5));
          // only where the snow's been touched shows: the flat round it is the slope's own
          float edge = smoothstep(1.0, 0.82, abs(u));
          if (kind > 3.5) edge *= smoothstep(1.0, 0.8, abs(v));
          float touched = kind > 0.5 && kind < 1.5 ? 0.85 : clamp(abs(gTDepth) * 3.0, 0.0, 1.0);
          float fade = 1.0 - smoothstep(0.7, 1.0, vAge);
          gTAlpha = edge * touched * vInfo.w * fade;
          diffuseColor = vec4(col, gTAlpha);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        // an edge polishes the bottom of its groove; a skid buffs the snow it scrapes
        roughnessFactor = vInfo.z < 0.5 || (vInfo.z > 2.5 && vInfo.z < 3.5) ? mix(0.62, 0.32, clamp(-gTDepth, 0.0, 1.0)) : vInfo.z < 1.5 ? 0.42 : 0.72;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float u = vInfo.x, v = vInfo.y, kind = vInfo.z;
          float e = 0.035;
          float du = (tProf(u + e, v, kind) - tProf(u - e, v, kind)) / (2.0 * e);
          float dv = (tProf(u, v + 0.05, kind) - tProf(u, v - 0.05, kind)) / 0.1;
          float blur = smoothstep(0.25, 0.9, fwidth(u));
          // how steep a "depth" per unit u is, for each kind's real size
          float k = (kind < 0.5 ? 0.5 : kind < 1.5 ? 0.18 : kind < 2.5 ? 0.7 : kind < 3.5 ? 0.35 : 0.5) * (1.0 - blur);
          vec3 tn = normalize(vTN), ts = normalize(vSide), tf = normalize(cross(ts, tn));
          vec3 nW = normalize(tn - ts * du * k - tf * dv * k * (kind > 3.5 ? 1.0 : 0.15));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`);
  };
  return mat;
}
