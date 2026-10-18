// Riders a long way off: past a couple of hundred metres a rider is a few pixels tall, so
// instead of each one's dozen parts they're all one instanced figure (jacket colour per
// rider, pants a shade of it, skis or a board), one draw for the lot.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function tint(g, c) {
  const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
}

function figure(board) {
  const P = [];
  const add = (g, c, x, y, z, rx = 0) => { g.rotateX(rx); g.translate(x, y, z); P.push(tint(g, c)); };
  // crouched: shins forward, thighs back, a leaning torso, a helmet
  for (const s of board ? [-0.2, 0.2] : [-0.12, 0.12]) {
    add(new THREE.BoxGeometry(0.15, 0.5, 0.16), 0x55555c, s, 0.28, board ? s * 0.6 : 0.06, 0.35);
    add(new THREE.BoxGeometry(0.17, 0.48, 0.18), 0x55555c, s, 0.68, board ? s * 0.6 : 0.02, -0.45);
  }
  add(new THREE.CapsuleGeometry(0.2, 0.42, 2, 6), 0xffffff, 0, 1.12, 0.12, 0.35);
  add(new THREE.SphereGeometry(0.14, 6, 5), 0x2a2c33, 0, 1.55, 0.26);
  for (const s of [-0.3, 0.3]) add(new THREE.BoxGeometry(0.1, 0.42, 0.1), 0xffffff, s, 1.05, 0.2, 0.6);
  if (board) add(new THREE.BoxGeometry(0.3, 0.03, 1.5).rotateY(Math.PI / 2), 0x2a2c33, 0, 0.02, 0);
  else for (const s of [-0.12, 0.12]) add(new THREE.BoxGeometry(0.09, 0.03, 1.7), 0x2a2c33, s, 0.02, 0.05);
  return mergeGeometries(P);
}

const _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();

export class FarRiders {
  constructor(scene, n = 96) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    this.meshes = [figure(false), figure(true)].map((g) => {
      const im = new THREE.InstancedMesh(g, mat, n);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      im.count = 0; im.frustumCulled = false; im.receiveShadow = true;
      scene.add(im);
      return im;
    });
    this.n = n;
  }

  update(skiers) {
    const k = [0, 0];
    for (const s of skiers) {
      if (!s.far || s.hidden || s.held) continue;
      const b = s.board ? 1 : 0, im = this.meshes[b];
      if (k[b] >= this.n) continue;
      const g = s.model.group;
      _m.compose(g.position, g.quaternion, _s);
      im.setMatrixAt(k[b], _m);
      im.setColorAt(k[b]++, _c.set(s.model.outfit?.jacket ?? 0xd8342c));
    }
    this.meshes.forEach((im, b) => {
      im.count = k[b];
      im.instanceMatrix.clearUpdateRanges(); im.instanceMatrix.addUpdateRange(0, k[b] * 16); im.instanceMatrix.needsUpdate = true;
      im.instanceColor.clearUpdateRanges(); im.instanceColor.addUpdateRange(0, k[b] * 3); im.instanceColor.needsUpdate = true;
    });
  }
}
