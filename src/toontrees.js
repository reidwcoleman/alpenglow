// The cartoon forest (the default look): one pine everywhere, Cork7-style. Its mesh was designed
// with Higgsfield (a concept image made into a model by its image-to-3D), then cut to three
// levels of detail and painted in flat palette colours by tools/build_tree.mjs: dark teal tiers,
// thick white snow caps on each, a brown trunk. Far off it's a little stack of cones built here.
// Same interface as SpruceForest: a group, and update(camera, elapsed) choosing what to draw.
import * as THREE from 'three';
import { AG } from './atmos.js';
import { bakeable } from './bake.js';

const SPRUCE_H = 16; // (the placed trees' sizes are in src/spruce.js's units)

const URL_BIN = (import.meta.env?.BASE_URL ?? '/') + 'trees/toon.bin';
// how far each level draws (the last one out to the edge of the forest)
const LODS = { low: [60, 220, 700, 2300], high: [90, 330, 1000, 3200], ultra: [130, 460, 1300, 3600] };
const NL = 4;
// palette (sRGB): snow, teal, deep teal, bark
const PAL = [0xedf7fc, 0x234e50, 0x193d41, 0x826452];

function lodGeometry(n, pos, nrm, col) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const N = new Float32Array(n * 3), C = new Float32Array(n * 3), K = new Float32Array(n);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    N[i * 3] = nrm[i * 4] / 127; N[i * 3 + 1] = nrm[i * 4 + 1] / 127; N[i * 3 + 2] = nrm[i * 4 + 2] / 127;
    c.set(PAL[col[i * 4 + 3]] ?? PAL[1]);
    C[i * 3] = c.r; C[i * 3 + 1] = c.g; C[i * 3 + 2] = c.b;
    K[i] = col[i * 4 + 3];
  }
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.setAttribute('aKind', new THREE.BufferAttribute(K, 1));
  g.computeBoundingSphere();
  return g;
}

// far off: four cones, alternating teal, each with a white cap, on a stub of trunk (1 m tall)
function coneStack(seg = 6) {
  const parts = [];
  const add = (geo, kind) => {
    geo = geo.toNonIndexed();
    const n = geo.getAttribute('position').count, C = new Float32Array(n * 3), K = new Float32Array(n).fill(kind);
    const c = new THREE.Color(PAL[kind]);
    for (let i = 0; i < n; i++) { C[i * 3] = c.r; C[i * 3 + 1] = c.g; C[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    geo.setAttribute('aKind', new THREE.BufferAttribute(K, 1));
    geo.deleteAttribute('uv');
    parts.push(geo);
  };
  add(new THREE.CylinderGeometry(0.025, 0.035, 0.14, 4, 1, true).translate(0, 0.07, 0), 3);
  for (let i = 0; i < 4; i++) {
    const r = 0.26 - i * 0.05, h = 0.36 - i * 0.04, y = 0.1 + i * 0.2;
    add(new THREE.ConeGeometry(r, h, seg, 1, true).translate(0, y + h / 2, 0), i % 2 ? 2 : 1);
    add(new THREE.ConeGeometry(r * 0.8, h * 0.62, seg, 1, true).translate(0, y + h * 0.38 + h * 0.31 + 0.02, 0), 0);
  }
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color', 'aKind']) {
    const arrs = parts.map((p) => p.getAttribute(name).array), size = parts[0].getAttribute(name).itemSize;
    const out = new Float32Array(arrs.reduce((s, a) => s + a.length, 0));
    let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; }
    g.setAttribute(name, new THREE.BufferAttribute(out, size));
  }
  g.computeBoundingSphere();
  return g;
}

// the material: flat colours (the toon light comes from atmos.js's patch), each tree's tint on the
// green only, the snow on it (uTreeSnow: the boughs go green where it's thin) and a slow sway
function toonMaterial(U) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    // (AG.uSee, the rider: a tree standing between the camera and the rider dithers away so you
    // never lose sight of yourself)
    Object.assign(sh.uniforms, U, { uSee: AG.uSee });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aKind; varying float vKind; varying float vSee; uniform float uTime; uniform vec3 uWind; uniform vec3 uSee;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
  // (the tree's tint is for the green only: the snow and bark keep their own colour)
  if ( aKind < 0.5 || aKind > 2.5 ) vColor.rgb /= max( instanceColor.rgb, vec3( 0.05 ) );
#endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vKind = aKind;
{
  // (the crown sways a little, the top most; each tree on its own phase)
  vec3 ip = vec3( instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2] );
  float ph = uTime * 1.3 + ip.x * 0.37 + ip.z * 0.23;
  float k = position.y * position.y * 0.035;
  transformed.xz += uWind.xz * ( sin( ph ) * 0.7 + sin( ph * 2.3 ) * 0.3 ) * k;
  // between the camera and the rider (and tall enough to be in the way): see-through
  float th = length( instanceMatrix[1].xyz );
  vec2 sa = cameraPosition.xz, sd = uSee.xz - sa;
  float st = clamp( dot( ip.xz - sa, sd ) / max( dot( sd, sd ), 1e-3 ), 0.0, 1.0 );
  float sdist = length( ip.xz - ( sa + sd * st ) ), sr = th * 0.27 + 0.6;
  float sy = mix( cameraPosition.y, uSee.y + 1.0, st );
  vSee = ( 1.0 - smoothstep( sr * 0.75, sr * 1.2, sdist ) ) * step( 0.005, st ) * ( 1.0 - smoothstep( 0.92, 0.995, st ) ) * step( sy, ip.y + th );
  // (and one the camera is passing right through goes altogether: it never fills the screen)
  vSee = max( vSee, 1.3 * ( 1.0 - smoothstep( th * 0.3 + 1.5, th * 0.3 + 3.5, length( ip.xz - sa ) ) ) );
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vKind; varying float vSee; uniform float uTreeSnow;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if ( vSee > 0.01 ) {
  // (an ordered 4x4 dither: an even screen of holes, three quarters open at the most)
  vec2 q = floor( gl_FragCoord.xy ), h = floor( q * 0.5 );
  float bay = fract( dot( h, vec2( 0.5, h.y * 0.75 ) ) ) * 0.25 + fract( dot( q, vec2( 0.5, q.y * 0.75 ) ) );
  if ( vSee > 1.2 || bay < vSee * 0.78 ) discard;
}`)
      .replace('#include <color_fragment>', `
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
{
  vec3 base = vColor.rgb;
  // thin snow: the caps go to the tier's green
  if ( vKind < 0.5 ) base = mix( vec3( 0.0164, 0.0762, 0.0802 ), base, smoothstep( 0.15, 0.6, uTreeSnow ) );
  diffuseColor.rgb *= base;
}
#endif`);
  };
  m.customProgramCacheKey = () => 'ag-toontree';
  return m;
}

export async function loadToonTree() {
  const buf = await (await fetch(URL_BIN)).arrayBuffer();
  const head = new Uint32Array(buf, 0, 1), nL = head[0], ns = new Uint32Array(buf, 4, nL);
  let o = 4 + nL * 4;
  const geos = [];
  for (let l = 0; l < nL; l++) {
    const n = ns[l];
    const pos = new Float32Array(buf, o, n * 3); o += n * 12;
    const nrm = new Int8Array(buf, o, n * 4); o += n * 4;
    const col = new Uint8Array(buf, o, n * 4); o += n * 4;
    geos.push(lodGeometry(n, pos, nrm, col));
  }
  // (Blender's occlusion on the modelled levels: the tiers shade the ones under them)
  bakeable('tree', geos.slice(), { apart: true });
  geos.push(coneStack());
  return geos;
}

export class ToonForest {
  /** trees: [{x, y, z, v, s, rot, tint, sx}] (the same list SpruceForest takes) */
  constructor(trees, quality, patch, snow, geos) {
    this.group = new THREE.Group();
    this.U = { uTime: { value: 0 }, uTreeSnow: snow, uWind: { value: new THREE.Vector3(0.8, 0, 0.6) } };
    this.lod = LODS[quality] ?? LODS.high;
    this.maxD = this.lod[NL - 1];
    const mat = toonMaterial(this.U);
    patch(mat);
    const N = trees.length;
    this.N = N;
    this.mats = new Float32Array(N * 16);
    this.cols = new Float32Array(N * 3);
    this.pos = new Float32Array(N * 3);
    this.lk = new Float32Array(N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    const cells = new Map();
    trees.forEach((t, i) => {
      // (one shape for every kind: the cartoon pine's own proportions, a little wider for the
      // squat ones the realistic forest has as snow ghosts)
      const h = t.s * SPRUCE_H;
      q.setFromAxisAngle(Y, t.rot);
      sc.set(h * t.sx, h, h * t.sx);
      p.set(t.x, t.y, t.z);
      m4.compose(p, q, sc).toArray(this.mats, i * 16);
      // (the tint only on the green: a lighter or bluer tree here and there, never off-palette)
      const g = (t.tint.r + t.tint.g + t.tint.b) / 3;
      const k = 0.88 + Math.min(0.24, Math.max(0, g - 0.75) * 0.6);
      this.cols[i * 3] = k * 0.98; this.cols[i * 3 + 1] = k; this.cols[i * 3 + 2] = k * (t.v === 4 || t.v === 5 ? 1.05 : 1);
      this.pos[i * 3] = t.x; this.pos[i * 3 + 1] = t.y + h * 0.5; this.pos[i * 3 + 2] = t.z;
      this.lk[i] = Math.max(1, 0.8 / t.s);
      const key = Math.floor(t.x / 96) + ',' + Math.floor(t.z / 96);
      let c = cells.get(key);
      if (!c) { c = { idx: [], min: new THREE.Vector3(1e9, 1e9, 1e9), max: new THREE.Vector3(-1e9, -1e9, -1e9) }; cells.set(key, c); }
      c.idx.push(i);
      c.min.min(p); p.y += h; c.max.max(p);
    });
    this.cells = [...cells.values()].map((c) => {
      const s = new THREE.Sphere();
      new THREE.Box3(c.min, c.max).getBoundingSphere(s);
      return { idx: Uint32Array.from(c.idx), sphere: s };
    });
    this.meshes = geos.slice(0, NL).map((g, l) => {
      const im = new THREE.InstancedMesh(g, mat, Math.max(1, N));
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, N) * 3), 3);
      im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      im.count = 0; im.visible = false; im.frustumCulled = false;
      im.castShadow = l < 2; im.receiveShadow = l < 2;
      im.name = `toontree_l${l}`;
      this.group.add(im);
      return im;
    });
    this.last = new THREE.Vector3(1e9, 0, 0);
    this.lastDir = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.frust = new THREE.Frustum();
    this.pm = new THREE.Matrix4();
    this.age = 0;
  }

  update(camera, elapsed) {
    this.U.uTime.value = elapsed;
    camera.getWorldDirection(this.dir);
    const cp = camera.position;
    this.age++;
    if (cp.distanceToSquared(this.last) < 4 && this.dir.dot(this.lastDir) > 0.9985 && this.age < 45) return;
    this.age = 0;
    this.last.copy(cp); this.lastDir.copy(this.dir);
    camera.updateMatrixWorld();
    this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frust.setFromProjectionMatrix(this.pm);
    const B = this.lod, cnt = [0, 0, 0, 0];
    const S = new THREE.Sphere();
    const cx = cp.x, cy = cp.y, cz = cp.z;
    for (const c of this.cells) {
      S.copy(c.sphere); S.radius += 25;
      if (S.center.distanceToSquared(cp) > (this.maxD + S.radius) ** 2) continue;
      if (!this.frust.intersectsSphere(S)) continue;
      for (const i of c.idx) {
        const dx = this.pos[i * 3] - cx, dy = this.pos[i * 3 + 1] - cy, dz = this.pos[i * 3 + 2] - cz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) * this.lk[i];
        if (d > this.maxD) continue;
        const l = d < B[0] ? 0 : d < B[1] ? 1 : d < B[2] ? 2 : 3;
        const im = this.meshes[l], k = cnt[l]++;
        im.instanceMatrix.array.set(this.mats.subarray(i * 16, i * 16 + 16), k * 16);
        im.instanceColor.array.set(this.cols.subarray(i * 3, i * 3 + 3), k * 3);
      }
    }
    for (let l = 0; l < NL; l++) {
      const im = this.meshes[l], k = cnt[l];
      im.count = k; im.visible = k > 0;
      im.instanceMatrix.clearUpdateRanges(); im.instanceMatrix.addUpdateRange(0, k * 16); im.instanceMatrix.needsUpdate = true;
      im.instanceColor.clearUpdateRanges(); im.instanceColor.addUpdateRange(0, k * 3); im.instanceColor.needsUpdate = true;
    }
  }
}
