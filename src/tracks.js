// Ski tracks: a shared ring of thin grooves laid behind every skier. Carves
// leave two pencil lines; skids leave wide scraped smears.
import * as THREE from 'three';
import { heightAt } from './course.js';

const SEGS = 36000; // quads in the ring
const _side = new THREE.Vector3(), _p = new THREE.Vector3();

export class Tracks {
  constructor(scene) {
    const vCount = SEGS * 4;
    this.pos = new Float32Array(vCount * 3);
    this.nrm = new Float32Array(vCount * 3);
    this.col = new Float32Array(vCount * 4);
    const idx = new Uint32Array(SEGS * 6);
    for (let i = 0; i < SEGS; i++) {
      const v = i * 4, k = i * 6;
      idx[k] = v; idx[k + 1] = v + 2; idx[k + 2] = v + 1;
      idx[k + 3] = v + 1; idx[k + 4] = v + 2; idx[k + 5] = v + 3;
    }
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aNrm = new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('normal', this.aNrm);
    g.setAttribute('color', this.aCol);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mat = new THREE.MeshStandardMaterial({
      vertexColors: true, transparent: true, depthWrite: false, roughness: 0.45,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
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
      last: null,
      break() { this.last = null; },
      add(pos, fwd, n, skid, powder = 0) {
        _side.crossVectors(n, fwd).normalize();
        const cur = { x: pos.x, y: pos.y, z: pos.z, sx: _side.x, sz: _side.z, skid };
        if (this.last) {
          const d = Math.hypot(cur.x - this.last.x, cur.z - this.last.z);
          if (d < 3) {
            if (powder > 0.5) sys.quad(this.last, cur, 0, 0.32 + Math.min(skid, 3) * 0.2, 0.85, n, 0.72); // trench through the powder
            else if (skid > 0.6) sys.quad(this.last, cur, 0, 0.18 + Math.min(skid, 4) * 0.22, 0.32, n);
            else for (const o of [0.105, -0.105]) sys.quad(this.last, cur, o, 0.055, 0.6, n);
          }
        }
        this.last = cur;
      },
    };
  }

  quad(a, b, off, w, alpha, n, deep = 0) {
    const i = this.next;
    this.next = (this.next + 1) % SEGS;
    const v = i * 4;
    const P = this.pos, N = this.nrm, C = this.col;
    const pts = [
      [a.x + a.sx * (off + w), a.z + a.sz * (off + w), 1],
      [a.x + a.sx * (off - w), a.z + a.sz * (off - w), -1],
      [b.x + b.sx * (off + w), b.z + b.sz * (off + w), 1],
      [b.x + b.sx * (off - w), b.z + b.sz * (off - w), -1],
    ];
    const fadeIn = [Math.min(a.skid > 0.6 ? 1 : 1, 1)];
    for (let k = 0; k < 4; k++) {
      const [x, z, s] = pts[k];
      const y = heightAt(x, z) + 0.035;
      P[(v + k) * 3] = x; P[(v + k) * 3 + 1] = y; P[(v + k) * 3 + 2] = z;
      // groove walls face inward: tilt the normal across the track
      const tilt = deep ? 1.1 : 0.55;
      _p.set(n.x - a.sx * s * tilt, n.y, n.z - a.sz * s * tilt).normalize();
      N[(v + k) * 3] = _p.x; N[(v + k) * 3 + 1] = _p.y; N[(v + k) * 3 + 2] = _p.z;
      const shade = deep ? deep : w > 0.1 ? 0.97 : 0.86;
      C[(v + k) * 4] = shade * 0.94; C[(v + k) * 4 + 1] = shade * 0.965; C[(v + k) * 4 + 2] = shade;
      C[(v + k) * 4 + 3] = alpha * fadeIn[0];
    }
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
  }

  flush() {
    if (this.dirtyMax < 0) return;
    const a = this.dirtyMin * 4, b = (this.dirtyMax + 1) * 4;
    for (const [attr, size] of [[this.aPos, 3], [this.aNrm, 3], [this.aCol, 4]]) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(a * size, (b - a) * size);
      attr.needsUpdate = true;
    }
    this.dirtyMin = Infinity; this.dirtyMax = -1;
  }
}
