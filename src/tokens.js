// Gold stars to collect: over the table of every kicker (you have to go big to reach them),
// along every rail (grind it to get it), above the halfpipe lips, in a line leading into each
// jump, and scattered down every run. Each pays points; get every one on a run for a bonus.
import * as THREE from 'three';
import { heightAt, centerX, halfWidth, JUMPS, RAILS, railAt, PIPE, pipeWalls, START_Z, FINISH_Z, MAP } from './course.js';
import { mulberry32 } from './noise.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);
const _r = { s: 0, lat: 0, y: 0, slope: 0 };

function starGeometry() {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.2 : 0.46;
    if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
  g.translate(0, 0, -0.05);
  return g;
}

export class Tokens {
  constructor(scene) {
    const rnd = mulberry32(4242);
    const list = [];
    const add = (x, y, z, r = 1.7, pts = 150) => list.push({ x, y, z, r, pts, got: false });
    // over each kicker's table, and three leading in
    for (const J of JUMPS) {
      const cx = (z) => centerX(z) + J.dx;
      if (!J.drop) {
        const z = J.lip + J.table * 0.55 + 2;
        add(cx(z), heightAt(cx(z), z) + 1.8 + J.h * 0.35, z, 2.2, 300);
      } else add(cx(J.lip + 4), heightAt(cx(J.lip + 4), J.lip + 4) + 2.2, J.lip + 4, 2.2, 250);
      for (const d of [36, 26, 16]) { const z = J.z - d; if (z > START_Z + 20) add(cx(z), heightAt(cx(z), z) + 1.0, z, 1.6, 100); }
    }
    // along each rail
    for (const R of RAILS) for (const k of [0.3, 0.75]) {
      const x = R.a.x + R.dir.x * R.L * k, z = R.a.z + R.dir.z * R.L * k;
      railAt(R, x, z, _r);
      add(x, _r.y + 1.0, z, 1.5, 200);
    }
    // above both lips of the pipe
    if (MAP.park) for (let z = PIPE.z0 + 30, s = 1; z < PIPE.z1 - 20; z += 26, s = -s) {
      if (pipeWalls(z) < 1) continue;
      const x = centerX(z) + PIPE.dx + s * (PIPE.flat + PIPE.lip - 0.4);
      add(x, heightAt(x, z) + 2.4, z, 2.2, 300);
    }
    // and scattered down the run
    for (let z = START_Z + 60; z < FINISH_Z - 40; z += 70 + rnd() * 60) {
      if (JUMPS.some((J) => Math.abs(z - J.z) < 50) || RAILS.some((R) => Math.abs(z - R.z) < 30)) continue;
      const x = centerX(z) + (rnd() - 0.5) * halfWidth(z) * 1.2;
      add(x, heightAt(x, z) + 1.0, z, 1.6, 100);
    }
    this.list = list;
    this.mesh = new THREE.InstancedMesh(starGeometry(), new THREE.MeshStandardMaterial({ color: 0xffc928, emissive: 0xffa000, emissiveIntensity: 0.55, metalness: 0.6, roughness: 0.25 }), list.length);
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.got = 0;
    this.t = 0;
    this.reset();
  }

  reset() {
    for (const k of this.list) { k.got = false; k.pop = 0; }
    this.got = 0;
    this.place();
  }

  place() {
    const spin = this.t * 2.4;
    this.list.forEach((k, i) => {
      const s = k.got ? (k.pop > 0 ? 1 + (0.35 - k.pop) * 3 : 0) : 1;
      _q.setFromAxisAngle(UP, spin + i * 0.7);
      _m.compose(_p.set(k.x, k.y + Math.sin(this.t * 2 + i) * 0.12 + (k.got ? (0.35 - k.pop) * 3 : 0), k.z), _q, _s.setScalar(Math.max(0, s)));
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  // the player at pos: anything he went through. Returns the stars picked up this frame
  update(dt, pos) {
    this.t += dt;
    const out = [];
    if (pos) for (const k of this.list) {
      if (k.got) { if (k.pop > 0) k.pop = Math.max(0, k.pop - dt); continue; }
      const dz = k.z - pos.z;
      if (dz > 3 || dz < -3) continue;
      const dx = k.x - pos.x, dy = k.y - (pos.y + 0.9);
      if (dx * dx + dy * dy + dz * dz < k.r * k.r) { k.got = true; k.pop = 0.35; this.got++; out.push(k); }
    }
    this.place();
    return out;
  }
}
