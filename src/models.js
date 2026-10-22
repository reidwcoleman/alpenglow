// The models made in Blender (blender/*.py -> public/models/*.glb, meshopt-packed). Loaded once
// at boot; every mesh comes back as plain geometry in the game's frame (metres, y up, +z forward)
// with its baked colour, keyed by the object's name in Blender.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import MANIFEST from '../public/models/manifest.json';

const BASE = (import.meta.env?.BASE_URL ?? '/') + 'models/';
let loader = null;
const files = new Map();

export function loadGLB(name) {
  if (!files.has(name)) {
    // (the decoding on two worker threads, off the main one)
    if (!loader) { MeshoptDecoder.useWorkers?.(2); loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); }
    files.set(name, loader.loadAsync(BASE + name + '.glb'));
  }
  return files.get(name);
}

// which files there are (written by blender/common.pack), built into the code: nothing to wait for
export const MODELS = MANIFEST;
export function models() { return Promise.resolve(MODELS); }

// a mesh's geometry, de-quantised into plain floats in the scene's frame (positions, normals,
// colour as rgba floats, skinning kept)
export function plainGeometry(mesh) {
  mesh.updateWorldMatrix(true, false);
  const src = mesh.geometry, n = src.getAttribute('position').count;
  const g = new THREE.BufferGeometry();
  const M = mesh.matrixWorld, N = new THREE.Matrix3().getNormalMatrix(M);
  const v = new THREE.Vector3();
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
  const P = src.getAttribute('position'), Nn = src.getAttribute('normal');
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i).applyMatrix4(M); v.toArray(pos, i * 3);
    if (Nn) { v.fromBufferAttribute(Nn, i).applyMatrix3(N).normalize(); v.toArray(nrm, i * 3); }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (Nn) g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); else g.computeVertexNormals();
  const C = src.getAttribute('color');
  if (C) {
    const col = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { col[i * 4] = C.getX(i); col[i * 4 + 1] = C.getY(i); col[i * 4 + 2] = C.getZ(i); col[i * 4 + 3] = C.itemSize > 3 ? C.getW(i) : 1; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  }
  const U = src.getAttribute('uv');
  if (U) {
    const uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { uv[i * 2] = U.getX(i); uv[i * 2 + 1] = U.getY(i); }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  // shape keys (relative): their offsets turned like the mesh, not moved
  const MP = src.morphAttributes.position;
  if (MP?.length) {
    const L = new THREE.Matrix3().setFromMatrix4(M);
    g.morphAttributes.position = MP.map((A) => {
      const d = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { v.fromBufferAttribute(A, i).applyMatrix3(L); v.toArray(d, i * 3); }
      return new THREE.BufferAttribute(d, 3);
    });
    g.morphTargetsRelative = true;
  }
  for (const k of ['skinIndex', 'skinWeight']) {
    const a = src.getAttribute(k);
    if (!a) continue;
    const out = k === 'skinIndex' ? new Uint16Array(n * 4) : new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { out[i * 4] = a.getX(i); out[i * 4 + 1] = a.getY(i); out[i * 4 + 2] = a.getZ(i); out[i * 4 + 3] = a.getW(i); }
    g.setAttribute(k, new THREE.BufferAttribute(out, 4));
  }
  g.setIndex(src.index ? new THREE.BufferAttribute(Uint32Array.from(src.index.array), 1) : null);
  g.computeBoundingSphere();
  return g;
}

// every object in a file as one geometry, by its name in Blender (its pieces, one per material,
// merged back together)
export async function modelParts(name) {
  const gl = await loadGLB(name);
  gl.scene.updateMatrixWorld(true);
  const out = {};
  for (const node of gl.scene.children) {
    const meshes = [];
    node.traverse((o) => { if (o.isMesh) meshes.push(o); });
    if (!meshes.length || !node.name) continue;
    const geos = meshes.map(plainGeometry);
    out[node.name] = geos.length === 1 ? geos[0] : mergeGeometries(geos);
  }
  return out;
}

// every mesh in a file by name (meshes split by material come back merged under the object's name)
export async function modelSet(name) {
  const gl = await loadGLB(name);
  gl.scene.updateMatrixWorld(true);
  const out = {};
  gl.scene.traverse((o) => { if (o.isMesh) (out[o.name] ??= []).push(o); });
  return { gltf: gl, meshes: out };
}

// The material every Blender prop shares: its colour (with the shading baked in) from the vertex
// colour, and what it's made of from the alpha (blender/props_common.py): matte paint, bare steel,
// painted steel, gloss plastic, rough (wood, bark, rubber), glass, lit, snow
let PROP = null;
export function propMaterial() {
  if (PROP) return PROP;
  PROP = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  PROP.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nflat varying float vPropK;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n  vPropK = floor( color.a * 8.0 + 0.5 );');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nflat varying float vPropK;')
      .replace('#include <color_fragment>', '  diffuseColor.rgb *= vColor.rgb;')
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  {
    float k = vPropK;
    roughnessFactor = k < 0.5 ? 0.75 : k < 1.5 ? 0.35 : k < 2.5 ? 0.45 : k < 3.5 ? 0.3 : k < 4.5 ? 0.95 : k < 5.5 ? 0.08 : k < 6.5 ? 0.6 : 0.85;
    metalnessFactor = k > 0.5 && k < 1.5 ? 0.85 : k > 1.5 && k < 2.5 ? 0.45 : k > 4.5 && k < 5.5 ? 0.3 : 0.0;
  }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  if ( vPropK > 5.5 && vPropK < 6.5 ) totalEmissiveRadiance += vColor.rgb * 2.2;');
  };
  PROP.customProgramCacheKey = () => 'prop';
  return PROP;
}

// a file's objects as one mesh in that material (or null when the file isn't there)
export async function propMesh(name) {
  const parts = await modelParts(name).catch(() => null);
  if (!parts) return null;
  const geos = Object.values(parts);
  if (!geos.length) return null;
  const m = new THREE.Mesh(geos.length === 1 ? geos[0] : mergeGeometries(geos), propMaterial());
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
