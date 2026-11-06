// What's drawn of the body on the snow. RagBody keeps the joints where the fall puts them; the
// hands and feet here hang off those joints with a little weight of their own, so they trail
// behind a slide, whip round a turn of the body and flop to the snow when it stops. It's drawn
// only: nothing in here touches the physics.
//
// out: the body's turn (0-3), how far the drawing has gone over to it (4), the height of the hips
// (5), then the hand and foot on +x and on -x in the body's own frame, from the hips (6-17). That's
// all a stand-in needs, so it's what snap.js sends.
import * as THREE from 'three';

// joint, spring, weight on it, and how it lies once it's let go: not held to the side like a plank
// but thrown out, one arm up past the head, the knees giving (x out, y toward the head, z to the front)
const ENDS = [['Hand_R', 58, 4, [0.3, 0.4, -0.02]], ['Hand_L', 58, 4, [-0.34, 0.1, 0.06]], ['Foot_R', 120, 2, [0.11, 0.13, -0.17]], ['Foot_L', 120, 2, [-0.07, 0.05, -0.06]]];
const DAMP = 9, TRAIL = 0.75, MOST = 0.42, CLEAR = 0.07, LOOSE = 6;
const _d = new THREE.Vector3(), _at = new THREE.Vector3(), _inv = new THREE.Quaternion();

export class RagDraw {
  constructor() {
    this.out = new Float32Array(18);
    this.ends = ENDS.map(([name, spring, drop, lay]) => ({ name, spring, drop, lay, p: new THREE.Vector3(), v: new THREE.Vector3(), last: new THREE.Vector3(), rest: new THREE.Vector3(), phase: 0 }));
    this.age = 0;
  }

  // from wherever the joints are, moving with the body
  start(B) {
    this.age = 0;
    // (no two falls lie the same: which way round, and by how much)
    const flip = Math.random() < 0.5 ? 1 : -1;
    this.ends.forEach((e, i) => {
      e.p.copy(B.nodes[e.name].p); e.last.copy(e.p); e.v.copy(B.velocity);
      const from = this.ends[flip > 0 ? i : i ^ 1].lay, k = 0.7 + Math.random() * 0.6;
      e.rest.set(Math.abs(from[0]) * Math.sign(e.lay[0]) * k, from[1] * k, from[2] * k);
      e.phase = Math.random() * 6.28;
    });
  }

  // feetHeld: strapped to something (a board), so the feet stay on their joints
  update(dt, B, ground, feetHeld, weight) {
    const o = this.out, hips = B.nodes.Hips.p;
    this.age += dt;
    const loose = 1 - Math.exp(-this.age * LOOSE), rough = Math.min(1, B.velocity.length() / 18);
    _inv.copy(B.q).invert();
    o[0] = B.q.x; o[1] = B.q.y; o[2] = B.q.z; o[3] = B.q.w; o[4] = weight; o[5] = hips.y;
    this.ends.forEach((e, i) => {
      const J = B.nodes[e.name].p;
      if (feetHeld && i > 1) { e.p.copy(J); e.v.copy(B.velocity); } else if (dt > 0) {
        // (and knocked about by the snow going past, until it stops)
        const shake = rough * (i < 2 ? 0.13 : 0.06) * Math.sin(this.age * (i < 2 ? 7 : 9) + e.phase);
        const T = _at.copy(e.rest).multiplyScalar(loose).addScalar(shake).applyQuaternion(B.q).add(J);
        // (pulled to its joint, but it's the air and the snow that slow it, not the body: the
        // faster the slide the further it trails)
        const tx = (J.x - e.last.x) / dt, ty = (J.y - e.last.y) / dt, tz = (J.z - e.last.z) / dt;
        e.v.x += (e.spring * (T.x - e.p.x) - DAMP * (e.v.x - tx * TRAIL)) * dt;
        e.v.y += (e.spring * (T.y - e.p.y) - DAMP * (e.v.y - ty * TRAIL) - e.drop) * dt;
        e.v.z += (e.spring * (T.z - e.p.z) - DAMP * (e.v.z - tz * TRAIL)) * dt;
        e.p.addScaledVector(e.v, dt);
        const off = _d.subVectors(e.p, T).length();
        if (off > MOST) { e.p.copy(T).addScaledVector(_d, MOST / off); e.v.lerp(B.velocity, 0.5); }
        const y = ground(e.p.x, e.p.z) + CLEAR;
        if (e.p.y < y) { e.p.y = y; if (e.v.y < 0) e.v.y = 0; }
      }
      e.last.copy(J);
      _d.subVectors(e.p, hips).applyQuaternion(_inv);
      o[6 + i * 3] = _d.x; o[7 + i * 3] = _d.y; o[8 + i * 3] = _d.z;
    });
    return o;
  }
}
