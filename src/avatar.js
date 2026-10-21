// Real people on the skis: Microsoft Rocketbox avatars (MIT; converted GLBs with a 57-bone
// Biped skeleton, a body|head colour atlas, a normal (xy) + specular (b) atlas and a cloth
// mask). The skier's procedural pose (pelvis, spine frames, ankle and hand targets) drives
// the skeleton: spine and head take rotations from the pose's frames, arms and legs are
// solved again with the avatar's own bone lengths so the feet sit in the boots and the hands
// on the poles. The clothes are re-dyed into a ski jacket, pants and gloves, puffed out a
// little over the body.
import * as THREE from 'three';
import { HAIR, KNIT } from './gear.js';
import { LO } from './gfx.js';
import { AG } from './atmos.js';

const BASE = (import.meta.env?.BASE_URL ?? '/') + 'people/';
// the textures at half size on the phone setting (tools/shrink_assets.py)
const TEXB = BASE + (LO ? 'lo/' : '');
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

// clothes don't follow the body's every curve: the jacket and pants bridge the hollows (between
// the pecs, down the spine, the armpits and behind the knees) and soften the muscles, and their
// shading with them. A smoothed copy of the body (split vertices welded so it doesn't tear at
// the UV seams) gives each garment vertex a nudge along its normal and a softened normal; skin,
// hands and feet stay as they are and pin the edges.
const CLOTH_PARTS = new Set([2, 3, 4, 6, 7]);
function drape(geo, part) {
  const pos = geo.getAttribute('position'), nrm = geo.getAttribute('normal'), idx = geo.index.array, n = pos.count;
  const keys = new Map(), id = new Int32Array(n);
  let m = 0;
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 2e4)},${Math.round(pos.getY(i) * 2e4)},${Math.round(pos.getZ(i) * 2e4)}`;
    let w = keys.get(k);
    if (w === undefined) { w = m++; keys.set(k, w); }
    id[i] = w;
  }
  const P = new Float32Array(m * 3), N = new Float32Array(m * 3), free = new Uint8Array(m).fill(1);
  for (let i = 0; i < n; i++) {
    const w = id[i] * 3;
    P[w] = pos.getX(i); P[w + 1] = pos.getY(i); P[w + 2] = pos.getZ(i);
    N[w] += nrm.getX(i); N[w + 1] += nrm.getY(i); N[w + 2] += nrm.getZ(i);
    if (!CLOTH_PARTS.has(part[i])) free[id[i]] = 0;
  }
  // neighbours (CSR) from the triangles' edges
  const deg = new Int32Array(m + 1), E = [];
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = id[idx[t + e]], b = id[idx[t + ((e + 1) % 3)]];
      if (a !== b) { E.push(a, b); deg[a + 1]++; deg[b + 1]++; }
    }
  }
  for (let i = 0; i < m; i++) deg[i + 1] += deg[i];
  const nb = new Int32Array(deg[m]), fill = deg.slice(0, m);
  for (let e = 0; e < E.length; e += 2) { nb[fill[E[e]]++] = E[e + 1]; nb[fill[E[e + 1]]++] = E[e]; }
  const relax = (A, iters, k, normalize) => {
    let S = A.slice(), T = A.slice();
    for (let it = 0; it < iters; it++) {
      for (let v = 0; v < m; v++) {
        const o = v * 3;
        if (!free[v] || deg[v + 1] === deg[v]) { T[o] = S[o]; T[o + 1] = S[o + 1]; T[o + 2] = S[o + 2]; continue; }
        let x = 0, y = 0, z = 0;
        for (let j = deg[v]; j < deg[v + 1]; j++) { const q = nb[j] * 3; x += S[q]; y += S[q + 1]; z += S[q + 2]; }
        const c = 1 / (deg[v + 1] - deg[v]);
        T[o] = S[o] + (x * c - S[o]) * k; T[o + 1] = S[o + 1] + (y * c - S[o + 1]) * k; T[o + 2] = S[o + 2] + (z * c - S[o + 2]) * k;
        if (normalize) { const l = Math.hypot(T[o], T[o + 1], T[o + 2]) || 1; T[o] /= l; T[o + 1] /= l; T[o + 2] /= l; }
      }
      [S, T] = [T, S];
    }
    return S;
  };
  for (let v = 0; v < m; v++) { const o = v * 3, l = Math.hypot(N[o], N[o + 1], N[o + 2]) || 1; N[o] /= l; N[o + 1] /= l; N[o + 2] /= l; }
  const SP = relax(P, 24, 0.6, false), SN = relax(N, 10, 0.7, true);
  for (let i = 0; i < n; i++) {
    const w = id[i], o = w * 3;
    if (!free[w]) continue;
    // along the normal only: in to soften a bulge a little (the clothes stand well off it),
    // out to bridge a hollow
    const d = Math.min(0.03, Math.max(-0.01, (SP[o] - P[o]) * N[o] + (SP[o + 1] - P[o + 1]) * N[o + 1] + (SP[o + 2] - P[o + 2]) * N[o + 2]));
    pos.setXYZ(i, P[o] + N[o] * d, P[o + 1] + N[o + 1] * d, P[o + 2] + N[o + 2] * d);
    // the normal: mostly the smoothed one (on a split vertex, keep its own facing at the seam)
    const nx = nrm.getX(i) * 0.25 + SN[o] * 0.75, ny = nrm.getY(i) * 0.25 + SN[o + 1] * 0.75, nz = nrm.getZ(i) * 0.25 + SN[o + 2] * 0.75;
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(i, nx / l, ny / l, nz / l);
  }
}

async function loadKit(name, loader, tl) {
  const tex = (f, srgb) => tl.loadAsync(TEXB + f).then((t) => {
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
  drape(geo, part);
  geo.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  geo.computeBoundingSphere();
  const I = (n) => names.indexOf(n);
  const len = (a, b) => bindP[I(a)].distanceTo(bindP[I(b)]);
  const sh = ['Bip01_L_UpperArm', 'Bip01_R_UpperArm'].map((n) => bindP[I(n)]);
  const th = ['Bip01_L_Calf', 'Bip01_R_Calf'].map((n) => bindP[I(n)]);
  return {
    name, names, parents, local, boneInverses, bindP, bindQ, geo, map, normal, mask, I,
    // where the garments' panels meet: x the side seams' plane (z) on the jacket, y on the pants,
    // z the shoulders' height, w how far the legs stand off the middle
    body: new THREE.Vector4((sh[0].z + sh[1].z) / 2, (th[0].z + th[1].z) / 2, (sh[0].y + sh[1].y) / 2, (Math.abs(th[0].x) + Math.abs(th[1].x)) / 2),
    neckP: bindP[I('Bip01_Neck')].clone(),
    waistY: bindP[I('Bip01_Pelvis')].y + 0.07,
    skull: bindP[I('Bip01_Head')].clone().add(new THREE.Vector3(0, 0.083, -0.008)),
    feet: ['Bip01_L_Foot', 'Bip01_R_Foot'].map((n) => bindP[I(n)].clone()),
    hands: ['Bip01_L_Hand', 'Bip01_R_Hand'].map((n) => bindP[I(n)].clone()),
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
// crowd: a baked, posed copy (people.js) with the jacket colour per instance and no gear
// the neck gaiters riders pull up over the chin: knit colours, picked per outfit
// (no skin-like tans or browns: on a face they read as a beard)
const GAITERS = [0x2b2d31, 0x5d6066, 0x2f4a3a, 0x1f2a44, 0x5a1e2a, 0x3d5a6e, 0x16171a, 0x4a4f2a, 0x7a1f24];
export function kitMaterial(kit, outfit, crowd = false) {
  // the riders' kit (not the baked crowd, not the phone setting) gets a fabric sheen
  const sheen = !crowd && !LO;
  const opts = { map: kit.map, normalMap: kit.normal, roughness: 1, metalness: 0 };
  const m = sheen ? new THREE.MeshPhysicalMaterial({ ...opts, sheen: 1, sheenRoughness: 0.55, sheenColor: 0xffffff }) : new THREE.MeshStandardMaterial(opts);
  if (crowd) m.defines = { CROWD: '' };
  const c = (x) => new THREE.Color(x);
  const racer = !!outfit.racer;
  const hj = Math.imul(c(outfit.jacket ?? 0).getHex() ^ c(outfit.pants ?? 0).getHex() * 3, 2654435761) >>> 0;
  const gaiter = outfit.gaiter ?? (racer ? null : GAITERS[(hj >>> 7) % GAITERS.length]);
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
    uLmV: { value: new THREE.Vector2(kit.waistY, kit.neckY) },
    // how far the jacket and pants stand off the body (a race suit is skin tight)
    uPuff: { value: racer ? 0.004 : 1 },
    // the wind in the clothes: x the time, y how hard it blows (speed)
    uFlap: { value: new THREE.Vector2() },
    // the hair tucked under the helmet or beanie
    uSkull: { value: kit.skull },
    uHatC: { value: new THREE.Vector3(...(outfit.beanie ? KNIT.c : HAIR.c)) },
    uHatR: { value: new THREE.Vector3(...(outfit.beanie ? KNIT.r.map((r) => r * 0.93) : HAIR.r)) },
    // the feet live inside the boots (gear.js)
    uFootL: { value: kit.feet[0] }, uFootR: { value: kit.feet[1] },
    uHandL: { value: kit.hands[0] }, uHandR: { value: kit.hands[1] },
    uBody: { value: kit.body }, uNeckP: { value: kit.neckP },
    // the gaiter: x on, y its top at the front (over the chin) and z behind (up under the helmet),
    // relative to the neck bone; w a two-tone stripe
    uGait: { value: new THREE.Vector4(gaiter == null ? 0 : 1, 0.09, 0.11, (hj >>> 13) % 3 === 0 ? 1 : 0) },
    uGaitC: { value: c(gaiter ?? 0) },
    // injuries (injury.js): blood on the head, and where a limb came off (rest-pose point, w on)
    uBlood: { value: 0 }, uCut: { value: new THREE.Vector4(0, 0, 0, 0) }, uCut2: { value: new THREE.Vector4(0, 0, 0, 0) }, uCut3: { value: new THREE.Vector4(0, 0, 0, 0) }, uCut4: { value: new THREE.Vector4(0, 0, 0, 0) }, uStain: { value: 0 },
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, { uToonK: AG.uToon });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aPart; varying float vPart; varying vec3 vRest; uniform float uPuff; uniform vec2 uLmV, uFlap; uniform vec3 uSkull, uHatC, uHatR, uFootL, uFootR, uHandL, uHandR, uNeckP; uniform vec4 uGait;
float cvH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float cvN(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cvH(i), cvH(i + vec3(1,0,0)), f.x), mix(cvH(i + vec3(0,1,0)), cvH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(cvH(i + vec3(0,0,1)), cvH(i + vec3(1,0,1)), f.x), mix(cvH(i + vec3(0,1,1)), cvH(i + vec3(1,1,1)), f.x), f.y), f.z);
}
#ifdef CROWD
attribute vec3 aRest;
#endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vPart = aPart;
#ifdef CROWD
vRest = aRest;
#else
vRest = position;
#endif
{
  float pp = floor( aPart + 0.5 );
  // ski pants: roomy, wider toward the hem, which sits on the boot cuff
  float hem = 0.165;
  // (heights on the body at rest: a posed crowd or chair copy is baked already)
  float flare = smoothstep( 0.46, 0.2, vRest.y );
  // the collar stands up round the neck to just under the chin (lower at the front, where it zips)
  float cTop = uLmV.y + 0.06 - 0.025 * smoothstep( 0.0, 0.06, vRest.z );
  float collar = 1.0 - smoothstep( cTop - 0.012, cTop + 0.002, vRest.y );
  // freeride cut: a roomy shell over a midlayer, sleeves cut long and loose with wide cuffs, and
  // baggy pants dropping in a stack over the boots. (the chest's puff eases off up into the
  // collar so the two meet without a step)
  float hemY = uLmV.x - 0.11;
  float cuffD = min( distance( vRest, uHandL ), distance( vRest, uHandR ) );
  float cuff = 1.0 - smoothstep( 0.08, 0.2, cuffD );
  // the jacket's long hem hangs off the hips, away from the pants under it
  float hang = ( pp == 2.0 || pp == 6.0 ) ? smoothstep( hemY + 0.16, hemY + 0.02, vRest.y ) * step( hemY - 0.015, vRest.y ) : 0.0;
  float puff = pp == 2.0 ? mix( 0.06, 0.014, smoothstep( uLmV.y - 0.12, uLmV.y - 0.01, vRest.y ) * ( 1.0 - smoothstep( 0.08, 0.15, length( vRest.xz - uNeckP.xz ) ) ) ) : pp == 3.0 ? 0.052 : pp == 4.0 ? 0.046 + 0.014 * cuff : pp == 6.0 ? 0.058 : pp == 7.0 ? 0.05 + 0.046 * flare : pp == 5.0 ? 0.012 : pp < 1.5 ? 0.012 * collar : 0.0;
  puff += hang * 0.01;
#ifndef CROWD
  if ( pp == 7.0 && uPuff > 0.5 ) transformed.y = max( transformed.y, hem - 0.03 );
#endif
  // the fabric's folds: soft bunching all over, stacked rings where the pants pile on the boots
  // and the sleeves on the wrists
  float cloth = ( pp > 1.5 && pp < 7.5 && pp != 5.0 ) ? step( 0.5, uPuff ) : 0.0;
  if ( pp == 2.0 && vRest.y > uLmV.y - 0.05 ) cloth = 0.0;
  // (only what the mesh can carry: broad drapes hanging down the body and limbs, not lumps; the
  // fine creases are drawn per pixel)
  float fold = ( cvN( vRest * vec3( 12.0, 3.4, 12.0 ) ) - 0.5 ) * 0.02;
  float stack = ( pp == 7.0 ? smoothstep( 0.42, 0.18, vRest.y ) : 0.0 ) + ( pp == 4.0 ? cuff : 0.0 );
  fold += stack * 0.006;
  // and the wind in it: loose hems, cuffs and the pants' legs ripple with speed
  float loose = hang + stack * 0.8 + ( pp == 3.0 || pp == 4.0 ? 0.35 : pp == 6.0 || pp == 7.0 ? 0.3 : pp == 2.0 ? 0.25 : 0.0 );
  float flap = sin( uFlap.x * 24.0 + vRest.y * 31.0 + vRest.x * 17.0 + vRest.z * 13.0 ) * 0.6 + sin( uFlap.x * 41.0 + vRest.y * 57.0 - vRest.x * 23.0 ) * 0.4;
  puff += cloth * ( fold + flap * loose * uFlap.y * 0.009 );
  // the knit gaiter stands a few millimetres off the neck and chin
  if ( pp < 1.5 && uGait.x > 0.5 ) {
    float fr = smoothstep( uNeckP.z - 0.01, uNeckP.z + 0.06, vRest.z );
    float gt = uLmV.y + mix( uGait.z, uGait.y, fr );
    puff = max( puff, 0.005 * ( 1.0 - smoothstep( gt - 0.008, gt + 0.004, vRest.y ) ) );
  }
  transformed += objectNormal * ( uPuff < 0.5 ? min( puff, uPuff ) : puff );
#ifndef CROWD
  // feet shrink a little inside the boot shells
  if ( pp == 8.0 ) { vec3 fc = ( position.x > 0.0 ? uFootL : uFootR ) + vec3( 0.0, -0.035, 0.03 ); transformed = fc + ( transformed - fc ) * 0.55; }
  // hair: anything above the brow squeezed inside the helmet's liner
  if ( pp == 0.0 && position.y > uSkull.y - 0.03 ) {
    vec3 c = uSkull + uHatC;
    vec3 d = ( transformed - c ) / uHatR;
    float L = length( d );
    if ( L > 0.9 ) { float k = 0.9 + 0.1 * ( 1.0 - exp( -( L - 0.9 ) / 0.1 ) ); transformed = c + ( transformed - c ) * ( k / L ); }
  }
#endif
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uMask; uniform vec3 uJacket, uPants, uGloves, uBoots, uJacket2, uPants2, uHandL, uHandR; uniform vec2 uLm, uPat; uniform float uPuff; uniform float uToonK;
uniform float uBlood, uStain; uniform vec4 uCut, uCut2, uCut3, uCut4;
#ifdef CROWD
#define JK vColor.rgb
#else
#define JK uJacket
#endif
varying float vPart; varying vec3 vRest;
uniform vec4 uBody, uGait; uniform vec3 uGaitC, uNeckP;
float gRough; vec4 gNS; float gH; float gNK = 1.0; vec3 gSheen = vec3( 0.0 );
// a line d metres off its centre, w wide either side, over pixels mpp metres wide: never thinner
// than a pixel, fainter instead (a thin line broken into dots reads as noise)
float agL(float d, float w, float mpp) { float W = max(w, mpp * 0.7); return (w / W) * (1.0 - smoothstep(W - 0.5 * mpp, W + 0.5 * mpp, abs(d))); }
float agH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float agN(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(agH(i), agH(i + vec3(1,0,0)), f.x), mix(agH(i + vec3(0,1,0)), agH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(agH(i + vec3(0,0,1)), agH(i + vec3(1,0,1)), f.x), mix(agH(i + vec3(0,1,1)), agH(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// a garment's print: 1 chest band, 2 camo, 3 tartan, 4 colour-block sleeves, 5 fade
vec3 agPat(vec3 a, vec3 b, float pat, float part, vec3 p, vec2 lm) {
  if (pat < 0.5) return a;
  // (Cork7's starter shell: one dark band round the chest, the sleeves the jacket's colour)
  if (pat < 1.5) { float y = (p.y - lm.x) / (lm.y - lm.x); return part > 1.5 && part < 2.5 && y > 0.42 && y < 0.7 ? b : a; }
  if (pat < 2.5) { float n = agN(p * 9.0) * 0.65 + agN(p * 23.0) * 0.35; return n > 0.62 ? b : n > 0.5 ? mix(a, b, 0.5) : a; }
  if (pat < 3.5) {
    float sx = step(0.62, fract(p.x * 9.0)), sy = step(0.62, fract(p.y * 9.0));
    float tx = step(0.94, fract(p.x * 9.0 + 0.3)), ty = step(0.94, fract(p.y * 9.0 + 0.3));
    return mix(mix(a, b, (sx + sy) * 0.42), vec3(0.95), max(tx, ty) * 0.35);
  }
  if (pat < 4.5) return part > 2.5 && part < 4.5 ? b : a;
  if (pat < 5.5) return mix(b, a, smoothstep(lm.x - 0.75, lm.y, p.y));
  if (pat < 6.5) return fract(p.y * 7.0) > 0.62 ? b : a;
  if (pat < 7.5) { float v = fract(p.y * 5.0 + abs(p.x) * 5.0); return v > 0.5 && v < 0.78 ? b : a; }
  if (pat < 8.5) return p.x > 0.0 ? a : b;
  if (pat < 9.5) return (part < 2.5 && abs(p.x) < 0.035 && p.z > 0.0) || (part > 3.5 && part < 4.5) || (part > 5.5 && abs(abs(p.x) - 0.17) < 0.022) ? b : a;
  if (pat < 10.5) { vec3 q = floor(p * 26.0); float n = agH(q) * 0.6 + agH(floor(p * 9.0)) * 0.4; return n > 0.62 ? b : n > 0.48 ? mix(a, b, 0.45) : a; }
  if (pat < 11.5) return fract(p.x * 24.0 + p.z * 24.0) > 0.86 ? mix(a, b, 0.85) : a;
  if (pat < 12.5) { vec2 g = vec2(p.x * 2.0 + p.z * 2.0, p.y) * 14.0; g.x += step(1.0, mod(g.y, 2.0)) * 0.5; return length(fract(g) - 0.5) < 0.24 ? b : a; }
  if (pat < 13.5) return a;
  if (pat < 14.5) { float d = p.y - lm.x - 0.12 + p.x * 1.1; return abs(d) < 0.07 ? b : a; }
  { vec3 q = floor(p * 11.0); return mod(q.x + q.y + q.z, 2.0) > 0.5 ? b : a; }
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
  float det = clamp( ( dot( m3, ${LUM} ) + 0.004 ) / ( dot( m6, ${LUM} ) + 0.004 ), 0.95, 1.04 );
  float fine = clamp( ( dot( a.rgb, ${LUM} ) + 0.004 ) / ( dot( m3, ${LUM} ) + 0.004 ), 0.97, 1.03 );
  gH = 0.0;
  // the rest-pose surface on screen: metres per pixel, which way it faces (for a flat weave
  // coordinate), how fast the body part changes (its edges are the sleeves' set-in seams), and
  // the angle round the neck (the gaiter's ribs)
  vec3 rdx = dFdx( vRest ), rdy = dFdy( vRest );
  float mpp = max( max( length( rdx ), length( rdy ) ), 1e-5 );
  vec3 an = abs( cross( rdx, rdy ) );
  // (how fast z and y change along the surface: a seam on a plane the surface runs along would
  // smear into a wide band, so it is measured along the surface and fades where it grazes)
  vec3 rn = an / max( length( an ), 1e-12 );
  vec2 alongZY = sqrt( max( vec2( 1.0 ) - vec2( rn.z * rn.z, rn.y * rn.y ), vec2( 0.0 ) ) );
  vec2 wuv = an.x > an.y && an.x > an.z ? vRest.zy : an.z > an.y ? vRest.xy : vRest.xz;
  float pw = max( fwidth( vPart ), 1e-4 );
  float nAng = atan( vRest.x - uNeckP.x, vRest.z - uNeckP.z );
  float nAngW = fwidth( nAng );
  vec3 dye = vec3( -1.0 );
  float rough = 0.6, shK = 0.0;
  if ( bodyHalf || part > 0.5 ) {
    if ( part > 7.5 ) { dye = uBoots; rough = 0.35; }
    else if ( part > 5.5 && part < 6.5 && vRest.y > uLm.x - 0.11 && uLm.y > 0.0 ) { dye = agPat( JK, uJacket2, uPat.x, 2.0, vRest, uLm ); rough = 0.64; shK = 0.3; }
    else if ( part > 5.5 ) { dye = agPat( uPants, uPants2, uPat.y, part, vRest, uLm ); rough = 0.76; shK = 0.36; }
    else if ( part > 4.5 ) { dye = uGloves; rough = 0.8; shK = 0.3; }
    else if ( part > 1.5 ) { bool low = vRest.y < uLm.x - 0.11; dye = low ? agPat( uPants, uPants2, uPat.y, 6.0, vRest, uLm ) : agPat( JK, uJacket2, uPat.x, part, vRest, uLm ); rough = low ? 0.76 : 0.64; shK = low ? 0.36 : 0.3;
      // (skin weighted to the chest that reaches up the neck stays skin above the collar line)
      if ( part < 2.5 && uLm.y > 0.0 && vRest.y > uLm.y + 0.064 - 0.025 * smoothstep( 0.0, 0.06, vRest.z ) ) dye = vec3( -1.0 );
    }
  }
  // round the neck: the gaiter, and the jacket's collar standing up over it
  float gaitK = 0.0, skinShade = 0.0;
  // (with the chest skin reaching up the neck above the collar line)
  if ( ( part < 1.5 || ( part < 2.5 && dye.r < 0.0 ) ) && uLm.y > 0.0 ) {
    float top = uLm.y + 0.06 - 0.025 * smoothstep( 0.0, 0.06, vRest.z );
    float c = 1.0 - smoothstep( top - 0.003, top + 0.001 + mpp, vRest.y );
    vec3 under = a.rgb;
    // the gaiter: a knit tube pulled up over the chin and round under the helmet
    if ( uGait.x > 0.5 ) {
      float fr = smoothstep( uNeckP.z - 0.01, uNeckP.z + 0.06, vRest.z );
      float gt = uLm.y + mix( uGait.z, uGait.y, fr );
      float g = 1.0 - smoothstep( gt - 0.0015, gt + mpp, vRest.y );
      // (and its shadow on the skin just above the edge)
      skinShade = smoothstep( gt + 0.014, gt, vRest.y ) * ( 1.0 - g );
      if ( g > 0.0 ) {
        float rf = 1.0 - smoothstep( 0.15, 0.45, nAngW * 14.0 );
        float rib = sin( nAng * 88.0 );
        // a rolled top edge, heathered yarn, and on some a two-tone band
        float roll = smoothstep( gt - 0.012, gt - 0.003, vRest.y );
        float heather = agN( vRest * vec3( 240.0, 70.0, 240.0 ) );
        vec3 gc = uGaitC * ( 0.9 + 0.22 * mix( 0.5, heather, 1.0 - smoothstep( 0.2, 0.5, mpp * 240.0 ) ) );
        if ( uGait.w > 0.5 ) gc = mix( gc, gc * 0.45 + vec3( 0.06 ), step( 0.5, fract( ( vRest.y - gt ) * 28.0 ) ) * step( vRest.y, gt - 0.015 ) );
        under = mix( a.rgb, gc * ( 1.0 - 0.12 * roll ) * ( 1.0 - 0.04 * rib * rf ), g );
        dye = under;
        rough = mix( rough, 0.93, g ); shK = mix( shK, 0.8, g ); gaitK = g;
        gH += g * ( 1.0 - c ) * ( rib * 0.1 * rf + roll * 0.7 );
      }
    }
    if ( c > 0.0 ) {
      // a folded-over edge: a little darker right at the top
      float rim = smoothstep( top - 0.02, top - 0.006, vRest.y ) * c;
      dye = mix( under, agPat( JK, uJacket2, uPat.x, 2.0, vRest, uLm ) * ( 1.0 - rim * 0.2 ), c ); rough = mix( rough, 0.66, c ); shK = mix( shK, 0.3, c ); gH += rim * 0.8; gaitK = max( gaitK, c );
      // the main zip runs on up the collar
      float zc = agL( vRest.x, 0.0035, mpp ) * step( 0.03, vRest.z ) * c;
      dye = mix( dye, vec3( 0.045 ), zc * 0.9 ); gH -= zc * 0.5; rough = mix( rough, 0.32, zc );
    }
  }
  // (the neck's wrap is neck from here on, whichever bone carries it)
  if ( gaitK > 0.0 ) part = 1.0;
  // the garment's make
  if ( dye.r >= 0.0 && part > 1.5 && part < 7.5 && part != 5.0 ) {
    vec3 p = vRest;
    bool jacket = ( ( part > 1.5 && part < 4.5 ) || part == 6.0 ) && p.y > uLm.x - 0.11;
    // ripstop: a grid of heavier threads catching the light, only where a pixel is fine enough to
    // hold it (in the colour, not the bump: screen derivatives of something this fine go blocky)
    float wk = jacket ? 180.0 : 140.0;
    float wf = 1.0 - smoothstep( 0.1, 0.3, mpp * wk );
    if ( wf > 0.0 ) { vec2 gq = abs( fract( wuv * wk ) - 0.5 ); dye *= 1.0 + wf * ( smoothstep( 0.36, 0.5, max( gq.x, gq.y ) ) * 0.07 - 0.02 ); }
    // panel seams, welded and taped: one plane down the ribs and over the shoulders, along the
    // sleeves' top and underside, and the pants' out- and inseams
    float sd = ( p.z - ( jacket ? uBody.x : uBody.y ) ) / max( alongZY.x, 0.2 );
    float seam = agL( sd, 0.0012, mpp ) * smoothstep( 0.2, 0.45, alongZY.x );
    float tape = smoothstep( 0.01, 0.004, abs( sd ) );
    if ( jacket ) {
      // the sleeves set in round the armholes, and a yoke across the shoulder blades
      if ( vPart > 2.0 && vPart < 3.0 && p.y > uLm.y - 0.3 ) seam = max( seam, 1.0 - smoothstep( 0.0012, 0.0012 + mpp, abs( vPart - 2.5 ) / pw * mpp ) );
      if ( part == 2.0 && p.z < uBody.x - 0.03 ) { float yk = ( p.y - ( uBody.z - 0.075 ) ) / max( alongZY.y, 0.2 ); seam = max( seam, agL( yk, 0.0012, mpp ) * smoothstep( 0.2, 0.45, alongZY.y ) ); tape = max( tape, smoothstep( 0.01, 0.004, abs( yk ) ) ); }
    }
    dye *= 1.0 - ( jacket ? 0.22 : 0.14 ) * seam; gH += tape * 0.15 - seam * 0.3; rough = mix( rough, rough - 0.04, tape );
    if ( jacket ) {
      // the centre zip, a storm flap over it
      if ( p.z > 0.0 && p.y < uLm.y - 0.02 ) {
        float zip = agL( p.x, 0.0035, mpp );
        float teeth = sin( p.y * 2400.0 ) * 0.5 * ( 1.0 - smoothstep( 0.2, 0.5, mpp * 380.0 ) );
        dye = mix( dye, vec3( 0.045 ), zip * 0.9 ); gH -= zip * ( 0.5 + 0.15 * teeth ); rough = mix( rough, 0.32, zip );
        float sf = smoothstep( 0.021, 0.017, p.x ) * smoothstep( 0.004, 0.006, p.x );
        gH += sf * 0.45; dye *= 1.0 - 0.2 * agL( p.x - 0.0205, 0.0007, mpp );
      }
      float hemB = 1.0 - smoothstep( 0.0, 0.012, abs( p.y - ( uLm.x - 0.09 ) ) - 0.02 );
      gH += hemB * 0.5;
      float cuff = 1.0 - smoothstep( 0.05, 0.065, min( distance( p, uHandL ), distance( p, uHandR ) ) );
      if ( part > 3.5 ) { dye = mix( dye, dye * 0.55, cuff ); gH += cuff * 0.6; rough = mix( rough, 0.82, cuff ); }
      if ( part == 2.0 && p.z > 0.0 ) {
        // chest pocket zip, left side
        float pz = agL( p.y - ( uLm.y - 0.12 ) + ( p.x - 0.07 ) * 0.5, 0.002, mpp ) * step( 0.04, p.x ) * step( p.x, 0.12 );
        dye = mix( dye, vec3( 0.05 ), pz * 0.85 ); gH -= pz * 0.4; rough = mix( rough, 0.32, pz );
        // two hand pockets, zips angled down to the hips under a welted flap, the pulls hanging at the top
        vec2 q = vec2( abs( p.x ), p.y - uLm.x ), A = vec2( 0.072, 0.075 ), ba = vec2( 0.05, -0.135 );
        vec2 pa = q - A; float h = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 );
        float dz = length( pa - ba * h );
        float hz = agL( dz, 0.0022, mpp );
        float welt = agL( dz - 0.008, 0.0035, mpp ) * step( 0.0, pa.x * ba.y - pa.y * ba.x );
        vec2 pd = abs( q - A - ba * 0.07 );
        float pull = step( pd.x, 0.0045 ) * step( pd.y, 0.012 );
        dye = mix( dye, vec3( 0.05 ), max( hz * 0.85, pull ) ); gH += welt * 0.45 - hz * 0.5 + pull * 0.6; rough = mix( rough, 0.3, max( hz, pull ) );
        // a small woven mountain mark on the right chest
        vec2 lq = vec2( p.x + 0.085, p.y - ( uLm.y - 0.11 ) );
        float mk = agL( lq.y - 0.007 + abs( abs( lq.x ) - 0.009 ) * 1.1, 0.0016, mpp ) * step( abs( lq.x ), 0.019 );
        dye = mix( dye, dot( dye, ${LUM} ) > 0.3 ? vec3( 0.07 ) : vec3( 0.86 ), mk * 0.9 ); gH += mk * 0.35;
      }
      if ( uPat.x > 12.5 && uPat.x < 13.5 ) { float q = fract( p.y * 13.0 ); gH += ( 1.0 - pow( abs( q - 0.5 ) * 2.0, 2.0 ) ) * 1.6; dye *= 0.88 + 0.12 * smoothstep( 0.0, 0.12, min( q, 1.0 - q ) ); }
    } else {
      // pants: a cargo pocket on the outer thigh under a flap with two snaps, knee darts
      float side = abs( p.x );
      float pk = step( 0.12, side ) * step( uLm.x - 0.42, p.y ) * step( p.y, uLm.x - 0.24 );
      float edge = pk * ( 1.0 - smoothstep( 0.0, 0.008, min( min( p.y - ( uLm.x - 0.42 ), ( uLm.x - 0.24 ) - p.y ), 0.03 ) ) );
      gH += pk * 0.5 - edge * 0.5;
      float fy = p.y - ( uLm.x - 0.26 );
      float flap = step( 0.12, side ) * agL( fy, 0.0025, mpp );
      float snap = step( 0.12, side ) * ( 1.0 - smoothstep( 0.004, 0.004 + mpp, length( vec2( fy + 0.012, abs( p.z - uBody.y ) - 0.03 ) ) ) );
      dye = mix( dye, dye * 0.6, flap ); dye = mix( dye, dye * 0.5, snap ); gH += snap * 0.5 - flap * 0.3;
      float knee = ( 1.0 - smoothstep( 0.0, 0.006, abs( fract( p.y * 22.0 ) - 0.5 ) * 0.08 ) ) * step( 0.42, p.y ) * step( p.y, 0.56 ) * step( 0.0, p.z );
      gH -= knee * 0.3;
      // scuff guards: tougher, darker fabric on the inside of the hems where the boots rub
      float kp = smoothstep( 0.24, 0.225, p.y ) * smoothstep( uBody.w - 0.005, uBody.w - 0.02, side );
      dye *= 1.0 - 0.32 * kp; rough = mix( rough, 0.88, kp ); gH += kp * 0.25;
      // and a little snow caught on the hems
      if ( p.y < 0.21 ) {
        float sn = smoothstep( 0.21, 0.1, p.y ) * smoothstep( 0.5, 0.72, agN( p * vec3( 45.0, 28.0, 45.0 ) ) );
        dye = mix( dye, vec3( 0.8, 0.82, 0.86 ), sn * 0.75 ); rough = mix( rough, 0.92, sn ); shK *= 1.0 - sn;
      }
      if ( uPat.y > 12.5 && uPat.y < 13.5 ) { float q = fract( p.y * 11.0 ); gH += ( 1.0 - pow( abs( q - 0.5 ) * 2.0, 2.0 ) ) * 1.4; }
    }
  }
  if ( dye.r >= 0.0 ) {
    // creases: the pants stacked in rings over the boots, the sleeves bunched at the cuffs,
    // and long soft drapes running down the legs and off the shoulders
    if ( part > 1.5 && part < 7.5 && part != 5.0 && uPuff > 0.5 ) {
      vec3 p = vRest;
      float wob = agN( p * vec3( 14.0, 4.0, 14.0 ) ) * 6.0;
      float rings = 0.0;
      if ( part > 6.5 ) rings = smoothstep( 0.46, 0.2, p.y );
      if ( part > 3.5 && part < 4.5 ) rings = 1.0 - smoothstep( 0.06, 0.2, min( distance( p, uHandL ), distance( p, uHandR ) ) );
      float ring = sin( p.y * 70.0 + wob );
      gH += rings * ring * 1.1;
      float drape = sin( ( p.x * 0.7 + p.z ) * 38.0 + agN( p * vec3( 6.0, 2.5, 6.0 ) ) * 7.0 );
      gH += drape * 0.45 * ( part > 5.5 ? 1.0 : 0.6 ) * ( 1.0 - rings );
      // (the fabric goes darker down in a fold, where less light reaches)
      dye *= 1.0 - 0.07 * rings * smoothstep( 0.3, 1.0, -ring ) - 0.025 * drape * ( 1.0 - rings );
    }
    // soft folds in the fabric where it bunches, and the weave catching the light
    if ( part > 1.5 && part < 7.5 && part != 5.0 ) {
      vec3 q = vRest * vec3( 11.0, 5.0, 11.0 );
      float fold = agN( q ) * 0.65 + agN( q * 2.3 + 7.0 ) * 0.35;
      gH += ( fold - 0.5 ) * 2.2;
      dye *= 0.93 + 0.1 * fold;
      rough += ( agN( vRest * 260.0 ) - 0.5 ) * 0.1;
    }
    // under fabric the body's own shading (a fitted shirt's muscles) is mostly gone: keep a
    // little of the texture's folds, and only a touch of its normal map
    float clothK = ( part > 1.5 && part < 7.5 ) || gaitK > 0.5 ? 1.0 : 0.0;
    gNK = mix( 1.0, 0.3, clothK );
    col = min( dye * mix( det * fine, mix( 1.0, fine, 0.6 ), clothK ), vec3( 0.82 ) );
    gRough = rough;
    // a soft sheen off the fibres at grazing angles, tinted by the dye
    gSheen = mix( col, vec3( dot( col, ${LUM} ) ), 0.3 ) * shK + vec3( 0.04 ) * shK;
  } else {
    // skin: fine down catching the light, and the gaiter's shadow
    gSheen = vec3( 0.05, 0.035, 0.03 );
    col *= 1.0 - 0.35 * skinShade;
  }
  // hurt: blood from the crown of the head, running down the face and neck
  if ( uBlood > 0.0 && part < 1.5 ) {
    float hy = vRest.y - uLm.y;
    float streak = agN( vec3( vRest.x * 46.0, vRest.y * 6.0, vRest.z * 46.0 ) );
    float bm = clamp( smoothstep( 0.15, 0.22, hy ) + step( 0.56, streak ) * smoothstep( -0.02, 0.07, hy ), 0.0, 1.0 ) * uBlood;
    col = mix( col, vec3( 0.34, 0.012, 0.018 ), bm );
    gRough = mix( gRough, 0.2, bm );
  }
  // where a limb came away: raw and red round the break, soaked further up the sleeve or leg
  for ( int ci = 0; ci < 4; ci++ ) {
    vec4 cut = ci == 0 ? uCut : ci == 1 ? uCut2 : ci == 2 ? uCut3 : uCut4;
    if ( cut.w <= 0.0 ) continue;
    float d = distance( vRest, cut.xyz );
    float cm = 1.0 - smoothstep( 0.05, 0.11, d );
    float soak = ( 1.0 - smoothstep( 0.1, 0.32, d ) ) * step( 0.45, agN( vRest * 31.0 ) + 0.25 );
    col = mix( col, vec3( 0.42, 0.02, 0.03 ), cm );
    col = mix( col, vec3( 0.26, 0.01, 0.015 ), soak * 0.85 * ( 1.0 - cm ) );
    gRough = mix( gRough, 0.22, max( cm, soak ) );
  }
  // blood soaked into the clothes in patches, and spattered
  if ( uStain > 0.0 && part > 1.5 && part != 5.0 ) {
    float bn = agN( vRest * vec3( 16.0, 12.0, 16.0 ) ) * 0.7 + agN( vRest * 70.0 ) * 0.3;
    float st = smoothstep( 0.6, 0.66, bn ) * uStain;
    col = mix( col, vec3( 0.24, 0.01, 0.015 ), st * 0.9 );
    gRough = mix( gRough, 0.25, st );
  }
  diffuseColor.rgb *= col;
}`)
      .replace('#include <color_fragment>', '#ifndef CROWD\n#include <color_fragment>\n#endif')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_SHEEN\nmaterial.sheenColor = gSheen;\n#endif')
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace(
        'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
        `vec3 mapN = vec3( ( gNS.xy * 2.0 - 1.0 ) * gNK * ( 1.0 - 0.7 * uToonK ), 0.0 );
mapN.z = sqrt( max( 0.0, 1.0 - dot( mapN.xy, mapN.xy ) ) );`) + `
// the garment's seams and quilting, as a bump on top
{
  // (cartoon: the seams and quilting stay, the fine crumple mostly goes)
  float hh = gH * 0.004 * ( 1.0 - 0.6 * uToonK );
  vec3 dpx = dFdx( -vViewPosition ), dpy = dFdy( -vViewPosition );
  float hx = dFdx( hh ), hy = dFdy( hh );
  vec3 r1 = cross( dpy, normal ), r2 = cross( normal, dpx );
  float dt = dot( dpx, r1 );
  vec3 grad = sign( dt ) * ( hx * r1 + hy * r2 );
  normal = normalize( abs( dt ) * normal - grad );
}`);
  };
  m.customProgramCacheKey = () => 'ag-skier-kit' + (crowd ? '-crowd' : '');
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
    this.neckP = new THREE.Vector3();
    this.chestQ = new THREE.Quaternion();
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
    this.neckP.copy(this.wp[ix.neck]);
    this.chestQ.copy(q.chest);
  }
}
