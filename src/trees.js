// Snow-loaded spruce forest: procedural tree geometry in three LODs,
// instanced per 128 m cell, plus a spatial hash for collisions.
import * as THREE from 'three';
import { heightAt, treeDensity, slopeAt, LIFT, centerX, halfWidth } from './course.js';
import { mulberry32, makeSimplex } from './noise.js';
import { CHUNK } from './terrain.js';

const GREEN_DARK = new THREE.Color(0x07140c);
const GREEN = new THREE.Color(0x1a3a22);
const SNOW = new THREE.Color(0xf2f6ff);
const SNOW_SHADE = new THREE.Color(0xc9d6ea);
const BARK = new THREE.Color(0x2c2019);

// One spruce of unit height: whorls of drooping, jagged branch skirts with
// patchy snow on their upper faces and dark needles underneath.
function spruceGeometry(tiers, segs, rnd, snowAmt = 0.75, trunk = true) {
  const pos = [], col = [], idx = [];
  const push = (x, y, z, c) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); return pos.length / 3 - 1; };
  const tr = 0.022, tSeg = trunk ? 5 : 0;
  for (let s = 0; s < tSeg; s++) {
    const a0 = (s / tSeg) * Math.PI * 2, a1 = ((s + 1) / tSeg) * Math.PI * 2;
    const p0 = push(Math.cos(a0) * tr, 0, Math.sin(a0) * tr, BARK);
    const p1 = push(Math.cos(a1) * tr, 0, Math.sin(a1) * tr, BARK);
    const p2 = push(Math.cos(a0) * tr * 0.5, 0.35, Math.sin(a0) * tr * 0.5, BARK);
    const p3 = push(Math.cos(a1) * tr * 0.5, 0.35, Math.sin(a1) * tr * 0.5, BARK);
    idx.push(p0, p2, p1, p1, p2, p3);
  }
  const c = new THREE.Color();
  const needle = (k) => c.copy(GREEN_DARK).lerp(GREEN, k).clone();
  let lean = 0;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1 || 1);
    const yBase = 0.08 + 0.8 * Math.pow(t / tiers, 0.95) + (rnd() - 0.5) * 0.02;
    const yTop = Math.min(1, yBase + 0.2 + 0.1 * (1 - f));
    const R = (0.4 * (1 - f * 0.88) + 0.04) * (0.9 + rnd() * 0.2);
    const droop = 0.07 + 0.06 * (1 - f);
    lean += (rnd() - 0.5) * 0.012;
    const ox = lean, oz = (rnd() - 0.5) * 0.01;
    const apex = push(ox, yTop, oz, needle(0.2));
    const rot = rnd() * Math.PI;
    const n2 = segs * 2;
    const rim = [], mid = [];
    for (let s = 0; s < n2; s++) {
      const a = rot + (s / n2) * Math.PI * 2;
      const tip = s % 2 === 0;
      const r = R * (tip ? 1 : 0.62 + rnd() * 0.1) * (0.85 + rnd() * 0.3);
      const y = yBase - droop * (tip ? 1 : 0.55);
      // snow lies in clumps on the inner, flatter part of each whorl
      const snowy = rnd() < snowAmt;
      const mc = snowy ? c.copy(SNOW).lerp(SNOW_SHADE, rnd() * 0.4).clone() : needle(0.6 + rnd() * 0.4);
      const mr = r * (0.45 + rnd() * 0.1);
      mid.push(push(ox + Math.cos(a) * mr, (yTop * 0.45 + y * 0.55) + 0.02, oz + Math.sin(a) * mr, mc));
      const rimSnow = snowy && rnd() < 0.35;
      rim.push(push(ox + Math.cos(a) * r, y, oz + Math.sin(a) * r, rimSnow ? c.copy(SNOW_SHADE).lerp(GREEN, 0.35).clone() : needle(0.5 + rnd() * 0.5)));
    }
    const under = push(ox, yBase + 0.03, oz, GREEN_DARK);
    for (let s = 0; s < n2; s++) {
      const s1 = (s + 1) % n2;
      idx.push(apex, mid[s1], mid[s]);
      idx.push(mid[s], mid[s1], rim[s]);
      idx.push(rim[s], mid[s1], rim[s1]);
      idx.push(under, rim[s], rim[s1]);
    }
  }
  // leader spike
  const top = push(lean, 1.04, 0, GREEN_DARK);
  const ring = [];
  for (let s = 0; s < 4; s++) { const a = (s / 4) * Math.PI * 2; ring.push(push(lean + Math.cos(a) * 0.02, 0.9, Math.sin(a) * 0.02, GREEN)); }
  for (let s = 0; s < 4; s++) idx.push(top, ring[(s + 1) % 4], ring[s]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // bias normals upward a little: soft foliage lighting instead of faceted cones
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    const v = new THREE.Vector3(n.getX(i), n.getY(i) + 0.5, n.getZ(i)).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

export class Forest {
  constructor(scene) {
    this.scene = scene;
    const rnd = mulberry32(99);
    this.geos = [
      [spruceGeometry(11, 6, rnd, 0.5), spruceGeometry(9, 6, rnd, 0.35), spruceGeometry(12, 6, rnd, 0.62)],
      [spruceGeometry(5, 4, rnd, 0.45)],
      [spruceGeometry(2, 3, rnd, 0.4, false)],
    ];
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    this.mat.onBeforeCompile = (sh) => {
      // gentle sway at the crown, translucent-ish foliage brightening on the sun side
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
          float sw = sin(uTime * 1.3 + ip.x * 0.11 + ip.z * 0.07) * 0.012 * position.y * position.y;
          transformed.x += sw;
        #endif`).replace('#include <common>', '#include <common>\nuniform float uTime;');
      sh.uniforms.uTime = this.time;
    };
    this.time = { value: 0 };

    this.hash = new Map();
    this.cells = new Map();
    this.place(rnd);
  }

  key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }

  addCollider(x, z, r, kind = 'tree') {
    const ix = Math.floor(x / 8), iz = Math.floor(z / 8);
    const k = this.key(ix, iz);
    let a = this.hash.get(k);
    if (!a) { a = []; this.hash.set(k, a); }
    a.push({ x, z, r, kind });
  }

  // colliders within radius of (x, z)
  query(x, z, out) {
    out.length = 0;
    const ix = Math.floor(x / 8), iz = Math.floor(z / 8);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const a = this.hash.get(this.key(ix + i, iz + j));
      if (a) for (const o of a) out.push(o);
    }
    return out;
  }

  place(rnd) {
    const X = 880, ZA = -600, ZB = 4400, step = 8.5;
    const noise = makeSimplex(77);
    const liftDir = new THREE.Vector2(LIFT.x1 - LIFT.x0, LIFT.z1 - LIFT.z0);
    const liftLen = liftDir.length(); liftDir.normalize();
    const per = new Map();
    for (let z = ZA; z < ZB; z += step) for (let x = -X; x < X; x += step) {
      const px = x + (rnd() - 0.5) * step * 0.95, pz = z + (rnd() - 0.5) * step * 0.95;
      const d = treeDensity(px, pz);
      if (d <= 0.02 || rnd() > d * 0.85) continue;
      if (slopeAt(px, pz) > 0.9) continue;
      // keep the chairlift corridor clear
      const lx = px - LIFT.x0, lz = pz - LIFT.z0;
      const along = lx * liftDir.x + lz * liftDir.y;
      if (along > -20 && along < liftLen + 20 && Math.abs(lx * liftDir.y - lz * liftDir.x) < 9) continue;
      // clumping
      if (noise(px / 30, pz / 30) < -0.35 && rnd() < 0.6) continue;
      const y = heightAt(px, pz);
      const h = 7 + rnd() * 11 + (d > 0.8 ? 3 : 0);
      const w = h * (0.75 + rnd() * 0.3);
      const cx = Math.floor((px + 896) / CHUNK), cz = Math.floor((pz + 640) / CHUNK);
      const k = cx + ',' + cz;
      let cell = per.get(k);
      if (!cell) { cell = { cx: -896 + cx * CHUNK + CHUNK / 2, cz: -640 + cz * CHUNK + CHUNK / 2, list: [] }; per.set(k, cell); }
      cell.list.push({ x: px, y, z: pz, h, w, rot: rnd() * Math.PI * 2, v: Math.floor(rnd() * 3), tint: 0.85 + rnd() * 0.25 });
      // only trees close to where people ski need colliders
      if (Math.abs(px - centerX(pz)) < halfWidth(pz) + 140) this.addCollider(px, pz, Math.max(0.55, w * 0.05));
    }
    this.count = 0;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    for (const cell of per.values()) {
      const meshes = [];
      // LOD 0 split by variant so each keeps its own geometry
      const lod0 = [[], [], []];
      for (const t of cell.list) lod0[t.v].push(t);
      const build = (geo, list) => {
        const im = new THREE.InstancedMesh(geo, this.mat, list.length);
        list.forEach((t, i) => {
          q.setFromAxisAngle(up, t.rot);
          s.set(t.w, t.h, t.w);
          p.set(t.x, t.y - 0.3, t.z);
          m.compose(p, q, s);
          im.setMatrixAt(i, m);
          col.setScalar(t.tint);
          im.setColorAt(i, col);
        });
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        im.matrixAutoUpdate = false;
        im.visible = false;
        this.scene.add(im);
        return im;
      };
      meshes[0] = lod0.filter((l) => l.length).map((l) => build(this.geos[0][l[0].v], l));
      meshes[1] = [build(this.geos[1][0], cell.list)];
      meshes[2] = [build(this.geos[2][0], cell.list)];
      for (const im of meshes[0]) im.castShadow = true;
      cell.meshes = meshes;
      cell.lod = -1;
      this.count += cell.list.length;
      this.cells.set(cell.cx + ',' + cell.cz, cell);
    }
  }

  update(px, pz, dt) {
    this.time.value += dt;
    for (const cell of this.cells.values()) {
      const d = Math.max(0, Math.hypot(px - cell.cx, pz - cell.cz) - CHUNK * 0.7);
      const l = d < 150 ? 0 : d < 520 ? 1 : 2;
      if (l === cell.lod) continue;
      if (cell.lod >= 0) for (const im of cell.meshes[cell.lod]) im.visible = false;
      for (const im of cell.meshes[l]) im.visible = true;
      cell.lod = l;
    }
  }
}
