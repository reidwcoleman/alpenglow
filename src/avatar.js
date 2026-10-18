// Real people on the skis: Microsoft Rocketbox avatars (MIT; converted GLBs with a 57-bone
// Biped skeleton, a body|head colour atlas, a normal (xy) + specular (b) atlas and a cloth
// mask). The skier's procedural pose (pelvis, spine frames, ankle and hand targets) drives
// the skeleton: spine and head take rotations from the pose's frames, arms and legs are
// solved again with the avatar's own bone lengths so the feet sit in the boots and the hands
// on the poles. The clothes are re-dyed into a ski jacket, pants and gloves, puffed out a
// little over the body.
import * as THREE from 'three';

const BASE = (import.meta.env?.BASE_URL ?? '/') + 'people/';
export const AVATARS = ['Sports_Male_02', 'Sports_Male_03', 'Sports_Male_04', 'Sports_Female_02', 'Male_Adult_05', 'Male_Adult_08', 'Female_Adult_01', 'Female_Adult_03'];
export const avatarKits = [];

// body part of a bone: 0 head, 1 neck, 2 torso, 3 upper arm, 4 forearm, 5 hand, 6 thigh, 7 calf, 8 foot
function partOf(name) {
  if (/Head|Eye/.test(name)) return 0;
  if (/Neck/.test(name)) return 1;
  if (/UpperArm/.test(name)) return 3;
  if (/Forearm/.test(name)) return 4;
  if (/Hand|Finger/.test(name)) return 5;
  if (/Thigh/.test(name)) return 6;
  if (/Calf/.test(name)) return 7;
  if (/Foot|Toe/.test(name)) return 8;
  return 2;
}

function plain(src) {
  const g = new THREE.BufferGeometry();
  const n = src.getAttribute('position').count;
  for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2], ['skinWeight', 4]]) {
    const a = src.getAttribute(name);
    const out = new Float32Array(n * size);
    for (let i = 0; i < n; i++) for (let c = 0; c < size; c++) out[i * size + c] = a.getComponent(i, c);
    g.setAttribute(name, new THREE.BufferAttribute(out, size));
  }
  const si = src.getAttribute('skinIndex');
  const idx = new Uint16Array(n * 4);
  for (let i = 0; i < n; i++) for (let c = 0; c < 4; c++) idx[i * 4 + c] = si.getComponent(i, c);
  g.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
  g.setIndex(new THREE.BufferAttribute(Uint32Array.from(src.index.array), 1));
  return g;
}

async function loadKit(name, loader, tl) {
  const tex = (f, srgb) => tl.loadAsync(BASE + f).then((t) => {
    t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t;
  });
  const [gl, map, normal, mask] = await Promise.all([loader.loadAsync(BASE + name + '.glb'), tex(name + '_c.webp', true), tex(name + '_n.webp', false), tex(name + '_m.png', false)]);
  let sk = null;
  gl.scene.traverse((o) => { if (o.isSkinnedMesh && o.material.name !== 'hair') sk = o; });
  const bones = sk.skeleton.bones;
  const names = bones.map((b) => b.name);
  const parents = bones.map((b) => bones.indexOf(b.parent));
  const local = bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone() }));
  const boneInverses = sk.skeleton.boneInverses.map((m) => m.clone());
  const bindW = boneInverses.map((m) => m.clone().invert());
  const bindP = bindW.map((m) => new THREE.Vector3().setFromMatrixPosition(m));
  const bindQ = bindW.map((m) => new THREE.Quaternion().setFromRotationMatrix(m));
  const geo = plain(sk.geometry);
  const si = geo.getAttribute('skinIndex'), sw = geo.getAttribute('skinWeight');
  const part = new Float32Array(si.count);
  for (let i = 0; i < si.count; i++) {
    let best = 0, bw = -1;
    for (let c = 0; c < 4; c++) if (sw.getComponent(i, c) > bw) { bw = sw.getComponent(i, c); best = si.getComponent(i, c); }
    part[i] = partOf(names[best]);
  }
  // (some garment trims are weighted to the hands, which hang by the hips in the bind pose)
  const pos = geo.getAttribute('position');
  const hands = ['Bip01_L_Hand', 'Bip01_R_Hand'].map((n) => bindP[names.indexOf(n)]);
  const waist = bindP[names.indexOf('Bip01_Pelvis')].y + 0.07;
  const vp = new THREE.Vector3();
  for (let i = 0; i < part.length; i++) {
    if (part[i] !== 5) continue;
    vp.fromBufferAttribute(pos, i);
    if (Math.min(vp.distanceTo(hands[0]), vp.distanceTo(hands[1])) > 0.26) part[i] = vp.y < waist ? 6 : 2;
  }
  geo.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  geo.computeBoundingSphere();
  const I = (n) => names.indexOf(n);
  const len = (a, b) => bindP[I(a)].distanceTo(bindP[I(b)]);
  return {
    name, names, parents, local, boneInverses, bindP, bindQ, geo, map, normal, mask, I,
    waistY: bindP[I('Bip01_Pelvis')].y + 0.07,
    neckY: bindP[I('Bip01_Neck')].y,
    leg: [len('Bip01_L_Thigh', 'Bip01_L_Calf'), len('Bip01_L_Calf', 'Bip01_L_Foot')],
    arm: [len('Bip01_L_UpperArm', 'Bip01_L_Forearm'), len('Bip01_L_Forearm', 'Bip01_L_Hand')],
  };
}

export async function preloadAvatars(onEach) {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const loader = new GLTFLoader(), tl = new THREE.TextureLoader();
  let n = 0;
  const kits = await Promise.all(AVATARS.map((a) => loadKit(a, loader, tl).then((k) => { onEach?.(++n / AVATARS.length); return k; })));
  avatarKits.push(...kits);
}

// ---------------------------------------------------------------- material: the dyed kit
const LUM = 'vec3( 0.2126, 0.7152, 0.0722 )';
function kitMaterial(kit, outfit) {
  const m = new THREE.MeshStandardMaterial({ map: kit.map, normalMap: kit.normal, roughness: 1, metalness: 0 });
  const c = (x) => new THREE.Color(x);
  const racer = !!outfit.racer;
  const u = {
    uMask: { value: kit.mask },
    uJacket: { value: c(outfit.jacket) },
    uPants: { value: c(outfit.pants) },
    uGloves: { value: c(outfit.gloves) },
    uJacket2: { value: c(outfit.jacket2 ?? outfit.jacket) },
    uPants2: { value: c(outfit.pants2 ?? outfit.pants) },
    uPat: { value: new THREE.Vector2(outfit.jpat ?? 0, outfit.ppat ?? 0) },
    uBoots: { value: c(outfit.boots) },
    uLm: { value: new THREE.Vector2(kit.waistY, kit.neckY) },
    // how far the jacket and pants stand off the body (a race suit is skin tight)
    uPuff: { value: racer ? 0.004 : 1 },
    // snowboard boots are big soft things
    uFoot: { value: outfit.board ? 0.024 : 0.0 },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aPart; varying float vPart; varying vec3 vRest; uniform float uPuff, uFoot;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vPart = aPart; vRest = position;
{
  float pp = floor( aPart + 0.5 );
  float puff = pp == 2.0 ? 0.034 : pp == 3.0 ? 0.03 : pp == 4.0 ? 0.026 : pp == 6.0 ? 0.03 : pp == 7.0 ? 0.034 : pp == 1.0 ? 0.016 : pp == 5.0 ? 0.012 : pp == 8.0 ? uFoot : 0.0;
  transformed += objectNormal * ( uPuff < 0.5 ? min( puff, uPuff ) : puff );
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uMask; uniform vec3 uJacket, uPants, uGloves, uBoots, uJacket2, uPants2; uniform vec2 uLm, uPat;
varying float vPart; varying vec3 vRest;
float gRough; vec4 gNS;
float agH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float agN(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(agH(i), agH(i + vec3(1,0,0)), f.x), mix(agH(i + vec3(0,1,0)), agH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(agH(i + vec3(0,0,1)), agH(i + vec3(1,0,1)), f.x), mix(agH(i + vec3(0,1,1)), agH(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// a garment's print: 1 chest band, 2 camo, 3 tartan, 4 colour-block sleeves, 5 fade
vec3 agPat(vec3 a, vec3 b, float pat, float part, vec3 p, vec2 lm) {
  if (pat < 0.5) return a;
  if (pat < 1.5) { float y = (p.y - lm.x) / (lm.y - lm.x); return (part > 1.5 && part < 2.5 && y > 0.42 && y < 0.7) || (part > 3.5 && part < 4.5) ? b : a; }
  if (pat < 2.5) { float n = agN(p * 9.0) * 0.65 + agN(p * 23.0) * 0.35; return n > 0.62 ? b : n > 0.5 ? mix(a, b, 0.5) : a; }
  if (pat < 3.5) {
    float sx = step(0.62, fract(p.x * 9.0)), sy = step(0.62, fract(p.y * 9.0));
    float tx = step(0.94, fract(p.x * 9.0 + 0.3)), ty = step(0.94, fract(p.y * 9.0 + 0.3));
    return mix(mix(a, b, (sx + sy) * 0.42), vec3(0.95), max(tx, ty) * 0.35);
  }
  if (pat < 4.5) return part > 2.5 && part < 4.5 ? b : a;
  return mix(b, a, smoothstep(lm.x - 0.75, lm.y, p.y));
}`)
      .replace('#include <map_fragment>', `
{
  vec2 uv = vMapUv;
  vec4 a = texture2D( map, uv );
  gNS = texture2D( normalMap, uv );
  bool bodyHalf = uv.x < 0.5;
  float cloth = bodyHalf ? texture2D( uMask, uv ).r : 0.0;
  float part = floor( vPart + 0.5 );
  vec3 col = a.rgb;
  gRough = mix( 0.85, 0.5, gNS.b );
  // keep the fabric's folds, lose its prints: a clamped ratio of two blur levels
  vec3 m3 = texture2D( map, uv, 3.0 ).rgb, m6 = texture2D( map, uv, 6.5 ).rgb;
  float det = clamp( ( dot( m3, ${LUM} ) + 0.004 ) / ( dot( m6, ${LUM} ) + 0.004 ), 0.9, 1.08 );
  float fine = clamp( ( dot( a.rgb, ${LUM} ) + 0.004 ) / ( dot( m3, ${LUM} ) + 0.004 ), 0.93, 1.06 );
  vec3 dye = vec3( -1.0 );
  float rough = 0.6;
  if ( bodyHalf || part > 0.5 ) {
    if ( part > 7.5 ) { dye = uBoots; rough = 0.35; }
    else if ( part > 5.5 ) { dye = agPat( uPants, uPants2, uPat.y, part, vRest, uLm ); rough = 0.7; }
    else if ( part > 4.5 ) { dye = uGloves; rough = 0.75; }
    else if ( part > 1.5 ) { bool low = vRest.y < uLm.x - 0.03; dye = low ? agPat( uPants, uPants2, uPat.y, 6.0, vRest, uLm ) : agPat( uJacket, uJacket2, uPat.x, part, vRest, uLm ); rough = low ? 0.7 : 0.5; }
    else if ( part > 0.5 ) { dye = uJacket * 0.55; rough = 0.8; }
  }
  if ( dye.r >= 0.0 ) {
    col = min( dye * det * fine, vec3( 0.82 ) );
    gRough = rough;
  }
  diffuseColor.rgb *= col;
}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace(
        'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
        `vec3 mapN = vec3( gNS.xy * 2.0 - 1.0, 0.0 );
mapN.z = sqrt( max( 0.0, 1.0 - dot( mapN.xy, mapN.xy ) ) );`));
  };
  m.customProgramCacheKey = () => 'ag-skier-kit';
  return m;
}

// ---------------------------------------------------------------- the rig
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _a1 = new THREE.Vector3(), _a2 = new THREE.Vector3(), _a3 = new THREE.Vector3();

function solve2(A, C, l1, l2, pole, out) {
  const d0 = _v.subVectors(C, A);
  let d = d0.length();
  const dir = d0.multiplyScalar(1 / (d || 1));
  d = Math.min(d, (l1 + l2) * 0.9995);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const perp = _v2.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  return out.copy(A).addScaledVector(dir, a).addScaledVector(perp, h);
}

// rotation taking (dir b, normal nb) onto (dir t, normal nt)
function aim(b, nb, t, nt, out) {
  const bx = _a1.copy(b).normalize();
  const by = _a2.copy(nb).addScaledVector(bx, -_a2.dot(bx)).normalize(), bz = _a3.crossVectors(bx, by);
  _m.makeBasis(bx, by, bz);
  const tx = _a1.copy(t).normalize();
  const ty = _a2.copy(nt).addScaledVector(tx, -_a2.dot(tx)).normalize(), tz = _a3.crossVectors(tx, ty);
  _m2.makeBasis(tx, ty, tz);
  _m2.multiply(_m.transpose());
  return out.setFromRotationMatrix(_m2);
}

export class AvatarRig {
  constructor(kit, outfit) {
    this.kit = kit;
    this.root = new THREE.Group();
    const bones = kit.names.map((n, i) => {
      const b = new THREE.Bone(); b.name = n;
      b.position.copy(kit.local[i].p); b.quaternion.copy(kit.local[i].q);
      return b;
    });
    kit.parents.forEach((p, i) => (p >= 0 ? bones[p].add(bones[i]) : this.root.add(bones[i])));
    this.bones = bones;
    this.skeleton = new THREE.Skeleton(bones, kit.boneInverses);
    this.mesh = new THREE.SkinnedMesh(kit.geo, kitMaterial(kit, outfit));
    this.mesh.bind(this.skeleton, new THREE.Matrix4());
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    const N = bones.length;
    this.wq = Array.from({ length: N }, () => new THREE.Quaternion());
    this.wp = Array.from({ length: N }, () => new THREE.Vector3());
    this.D = new Array(N).fill(null); // per-bone world delta from the bind pose, or null: follow the parent
    const I = kit.I;
    this.ix = {
      root: I('Bip01'), pelvis: I('Bip01_Pelvis'), spine: I('Bip01_Spine'), spine1: I('Bip01_Spine1'), spine2: I('Bip01_Spine2'),
      neck: I('Bip01_Neck'), head: I('Bip01_Head'),
      thigh: [I('Bip01_L_Thigh'), I('Bip01_R_Thigh')], calf: [I('Bip01_L_Calf'), I('Bip01_R_Calf')], foot: [I('Bip01_L_Foot'), I('Bip01_R_Foot')],
      upper: [I('Bip01_L_UpperArm'), I('Bip01_R_UpperArm')], fore: [I('Bip01_L_Forearm'), I('Bip01_R_Forearm')], hand: [I('Bip01_L_Hand'), I('Bip01_R_Hand')],
    };
    // fingers curl round the pole grips
    this.curl = [];
    kit.names.forEach((n, i) => { if (/Finger[1-4]/.test(n)) this.curl.push(i); else if (/Finger0/.test(n)) this.curl.push(-i - 1); });
    this.qs = { pelvis: new THREE.Quaternion(), chest: new THREE.Quaternion(), head: new THREE.Quaternion(), tmp: new THREE.Quaternion() };
    for (const k of ['thigh', 'calf', 'upper', 'fore']) this.qs[k] = [new THREE.Quaternion(), new THREE.Quaternion()];
    this.knee = [new THREE.Vector3(), new THREE.Vector3()];
    this.elbow = [new THREE.Vector3(), new THREE.Vector3()];
    this.palm = [new THREE.Vector3(), new THREE.Vector3()];
    this.skull = new THREE.Vector3();
    this.chestP = new THREE.Vector3();
  }

  // world (rig-local) transforms down the hierarchy; key bones take D * bind, the rest keep their bind offsets
  fk(i) {
    const k = this.kit, p = k.parents[i];
    if (p < 0) { this.wq[i].copy(this.D[i] ?? _q.identity()).multiply(k.bindQ[i]); return; }
    this.wp[i].copy(k.local[i].p).applyQuaternion(this.wq[p]).add(this.wp[p]);
    if (this.D[i]) this.wq[i].copy(this.D[i]).multiply(k.bindQ[i]);
    else this.wq[i].copy(this.wq[p]).multiply(k.local[i].q);
  }

  /**
   * f: { pelvis, hipSide, pelvisUp, side, spine, fwd, headQ, ank: [L, R], hand: [L, R], kneePole: [L, R], elbowPole: [L, R], foot: [qL, qR], grip }
   */
  pose(f) {
    const k = this.kit, ix = this.ix, D = this.D, q = this.qs;
    D.fill(null);
    // trunk
    aim(_v.set(1, 0, 0), _v2.set(0, 1, 0), f.hipSide, f.pelvisUp, q.pelvis);
    aim(_v.set(1, 0, 0), _v2.set(0, 1, 0), f.side, f.spine, q.chest);
    q.head.copy(f.headQ);
    D[ix.root] = q.pelvis; D[ix.pelvis] = q.pelvis;
    const s0 = (this._s0 ??= new THREE.Quaternion()), s1 = (this._s1 ??= new THREE.Quaternion()), nk = (this._nk ??= new THREE.Quaternion());
    D[ix.spine] = s0.copy(q.pelvis).slerp(q.chest, 0.4);
    D[ix.spine1] = s1.copy(q.pelvis).slerp(q.chest, 0.75);
    D[ix.spine2] = q.chest;
    D[ix.neck] = nk.copy(q.chest).slerp(q.head, 0.5);
    D[ix.head] = q.head;
    const N = this.bones.length;
    // root position: the pelvis lands on its target
    this.wp[ix.root].copy(f.pelvis);
    for (let i = 0; i < N; i++) {
      // limbs: once the hip / shoulder is placed, solve the chain with this body's lengths
      for (let s = 0; s < 2; s++) {
        if (i === ix.thigh[s]) {
          this.fk(i);
          const hip = this.wp[i];
          const knee = solve2(hip, f.ank[s], k.leg[0], k.leg[1], f.kneePole[s], this.knee[s]);
          const t1 = _v3.subVectors(knee, hip);
          const t2 = (this._t2 ??= new THREE.Vector3()).subVectors(f.ank[s], knee);
          const nrm = (this._n ??= new THREE.Vector3()).crossVectors(t1, f.kneePole[s]);
          const b1 = (this._b1 ??= new THREE.Vector3()).subVectors(k.bindP[ix.calf[s]], k.bindP[i]);
          const b2 = (this._b2 ??= new THREE.Vector3()).subVectors(k.bindP[ix.foot[s]], k.bindP[ix.calf[s]]);
          const bn = (this._bn ??= new THREE.Vector3()).crossVectors(b1, _v.set(0, 0, 1));
          aim(b1, bn, t1, nrm, q.thigh[s]);
          aim(b2, bn, t2, nrm, q.calf[s]);
          D[i] = q.thigh[s]; D[ix.calf[s]] = q.calf[s]; D[ix.foot[s]] = f.foot[s];
          this.fk(i);
        }
        if (i === ix.upper[s]) {
          this.fk(i);
          const sh = this.wp[i];
          const el = solve2(sh, f.hand[s], k.arm[0], k.arm[1], f.elbowPole[s], this.elbow[s]);
          const t1 = _v3.subVectors(el, sh);
          const t2 = (this._t2 ??= new THREE.Vector3()).subVectors(f.hand[s], el);
          const nrm = (this._n ??= new THREE.Vector3()).crossVectors(t1, f.elbowPole[s]);
          const b1 = (this._b1 ??= new THREE.Vector3()).subVectors(k.bindP[ix.fore[s]], k.bindP[i]);
          const b2 = (this._b2 ??= new THREE.Vector3()).subVectors(k.bindP[ix.hand[s]], k.bindP[ix.fore[s]]);
          const bn = (this._bn ??= new THREE.Vector3()).crossVectors(b1, _v.set(0, 0, -1));
          aim(b1, bn, t1, nrm, q.upper[s]);
          aim(b2, bn, t2, nrm, q.fore[s]);
          D[i] = q.upper[s]; D[ix.fore[s]] = q.fore[s];
          this.fk(i);
        }
      }
      if (i !== ix.thigh[0] && i !== ix.thigh[1] && i !== ix.upper[0] && i !== ix.upper[1]) this.fk(i);
    }
    // fingers closed round a grip
    const g = f.grip ?? 1;
    for (const c of this.curl) {
      const i = c < 0 ? -c - 1 : c;
      const p = k.parents[i];
      _q.setFromAxisAngle(_v.set(0, 0, 1), (c < 0 ? 0.5 : 1.25) * g);
      this.wq[i].copy(this.wq[p]).multiply(k.local[i].q).multiply(_q);
      // (children of a curled finger follow it in the local pass below)
    }
    // locals from the world transforms
    for (let i = 0; i < N; i++) {
      const b = this.bones[i], p = k.parents[i];
      if (p < 0) { b.position.copy(this.wp[i]); b.quaternion.copy(this.wq[i]); continue; }
      b.position.copy(k.local[i].p);
      b.quaternion.copy(_q.copy(this.wq[p]).invert().multiply(this.wq[i]));
    }
    // where the gear goes: palms, the skull, the chest
    for (let s = 0; s < 2; s++) {
      const h = ix.hand[s];
      this.palm[s].copy(this.wp[h]).addScaledVector(_v.set(1, 0, 0).applyQuaternion(this.wq[h]), 0.075);
    }
    this.skull.set(0, 0.083, -0.008).applyQuaternion(q.head).add(this.wp[ix.head]);
    this.chestP.copy(this.wp[ix.spine2]);
  }
}
