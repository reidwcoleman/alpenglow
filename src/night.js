// Night riding: floodlight towers down both sides of the run. Every tower has a lamp head,
// a glow you see from far away and a faint beam in the air; a small pool of real spot
// lights (two with shadows) follows the camera to the towers that matter.
import * as THREE from 'three';
import { heightAt, centerX, halfWidth, START_Z, FINISH_Z, JUMPS, RAILS, PIPE, ROLLERS, MAP } from './course.js';

const _v = new THREE.Vector3();

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,248,230,1)'); gr.addColorStop(0.12, 'rgba(255,236,200,0.85)');
  gr.addColorStop(0.35, 'rgba(255,210,150,0.22)'); gr.addColorStop(1, 'rgba(255,200,140,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Floodlights {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'floodlights';
    this.group.visible = false;
    scene.add(this.group);
    this.towers = [];
    // towers every ~50 m, alternating sides, kept out of the features' way
    let side = 1;
    for (let z = START_Z + 15; z < FINISH_Z - 40; z += 50) {
      const hw = halfWidth(z);
      let dx = side * (hw + 6.5);
      const blocked = (d) => JUMPS.some((J) => z > J.z - 8 && z < J.z + J.len + 6 && Math.abs(d - J.dx) < J.w / 2 + 4)
        || RAILS.some((R) => z > R.z - 6 && z < R.z + R.len + 4 && Math.abs(d - R.dx) < 4);
      if (blocked(dx)) dx = -dx;
      if (blocked(dx)) { side = -side; continue; }
      const x = centerX(z) + dx, y = heightAt(x, z);
      const H = 12.5;
      const head = new THREE.Vector3(x, y + H, z);
      // aim across and down the run
      const tz = z + 22, tx = centerX(tz) - Math.sign(dx) * hw * 0.15;
      const target = new THREE.Vector3(tx, heightAt(tx, tz), tz);
      this.towers.push({ x, z, y, head, target, side: Math.sign(dx) });
      side = -side;
    }
    // wide sections (the terrain park) get towers out among the lines too
    const inPipe = (z, d) => MAP.park && z > PIPE.z0 - 10 && z < PIPE.z1 + 10 && Math.abs(d - PIPE.dx) < 22;
    const inRoll = (z, d) => MAP.park && z > ROLLERS.z0 - 10 && z < ROLLERS.z1 + 10 && Math.abs(d - ROLLERS.dx) < 12;
    for (let z = START_Z + 40; z < FINISH_Z - 60; z += 70) {
      const hw = halfWidth(z);
      if (hw < 52) continue;
      for (const f of [-0.6, 0.6, 0]) {
        const dx = f * hw + (f === 0 ? 40 : 0);
        const hit = JUMPS.some((J) => z > J.z - 10 && z < J.z + J.len + 8 && Math.abs(dx - J.dx) < J.w / 2 + 5)
          || RAILS.some((R) => z > R.z - 8 && z < R.z + R.len + 5 && Math.abs(dx - R.dx) < 5) || inPipe(z, dx) || inRoll(z, dx);
        if (hit || Math.abs(dx) < 16) continue;
        const x = centerX(z) + dx, y = heightAt(x, z);
        const head = new THREE.Vector3(x, y + 12.5, z);
        const tz = z + 20, tx = centerX(tz) + dx * 0.7;
        this.towers.push({ x, z, y, head, target: new THREE.Vector3(tx, heightAt(tx, tz), tz), side: Math.sign(dx) || 1 });
      }
    }
    this.build();
    // the moving pool of real lights
    const n = quality === 'low' ? 4 : quality === 'ultra' ? 8 : 6;
    const shadows = quality === 'low' ? 0 : quality === 'ultra' ? 2 : 1;
    this.spots = [];
    for (let i = 0; i < n; i++) {
      const s = new THREE.SpotLight(0xfff3e2, 0, 160, 0.72, 0.6, 1.6);
      s.castShadow = i < shadows;
      if (s.castShadow) {
        s.shadow.mapSize.set(1024, 1024);
        s.shadow.bias = -0.0004; s.shadow.normalBias = 0.04;
        s.shadow.camera.near = 2; s.shadow.camera.far = 90;
      }
      s.visible = false;
      this.group.add(s, s.target);
      this.spots.push(s);
    }
    this.intensity = 1700;
    this.t = 0;
  }

  build() {
    const T = this.towers;
    // (Cork7's masts: grey steel on an orange padded foot, standing there by day too)
    const poleM = new THREE.MeshStandardMaterial({ color: 0x6b737b, roughness: 0.45, metalness: 0.7 });
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.17, 12.5, 8).translate(0, 6.25, 0), poleM, T.length);
    const pad = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.36, 1.7, 12).translate(0, 0.85, 0), new THREE.MeshStandardMaterial({ color: 0xe8673a, roughness: 0.75 }), T.length);
    const headG = new THREE.BoxGeometry(1.7, 0.55, 0.5);
    this.lampM = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff1d8, emissiveIntensity: 0, roughness: 0.4 });
    const heads = new THREE.InstancedMesh(headG, this.lampM, T.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    T.forEach((t, i) => {
      pole.setMatrixAt(i, m.makeTranslation(t.x, t.y - 0.3, t.z));
      pad.setMatrixAt(i, m.makeTranslation(t.x, t.y - 0.3, t.z));
      // the head faces its target
      const d = _v.copy(t.target).sub(t.head).normalize();
      q.setFromRotationMatrix(new THREE.Matrix4().lookAt(t.head, t.target, new THREE.Vector3(0, 1, 0)));
      heads.setMatrixAt(i, m.compose(t.head, q, sc));
      t.dir = d.clone();
    });
    pole.castShadow = true;
    this.group.add(pole, pad, heads);
    // far glow: one additive point per lamp
    const pos = new Float32Array(T.length * 3);
    T.forEach((t, i) => { pos[i * 3] = t.head.x; pos[i * 3 + 1] = t.head.y; pos[i * 3 + 2] = t.head.z; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.glowM = new THREE.PointsMaterial({ map: glowTexture(), size: 7, sizeAttenuation: true, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff, fog: false });
    this.glow = new THREE.Points(g, this.glowM);
    this.glow.frustumCulled = false;
    this.group.add(this.glow);
    // beams: a soft cone of lit air under each lamp
    const coneG = new THREE.ConeGeometry(7.5, 20, 24, 1, true).translate(0, -10, 0).rotateX(-Math.PI / 2);
    const beamM = new THREE.ShaderMaterial({
      uniforms: { uK: { value: 0 } },
      vertexShader: `varying float vL; varying vec3 vN; varying vec3 vV;
        void main() { vL = position.z / 20.0; vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * mat3(instanceMatrix) * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uK; varying float vL; varying vec3 vN; varying vec3 vV;
        void main() { float rim = pow(abs(dot(vN, vV)), 1.5); float a = (1.0 - vL) * (1.0 - vL) * rim * 0.012 * uK;
          gl_FragColor = vec4(vec3(1.0, 0.9, 0.75) * a, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.beamM = beamM;
    const beams = new THREE.InstancedMesh(coneG, beamM, T.length);
    T.forEach((t, i) => {
      q.setFromRotationMatrix(new THREE.Matrix4().lookAt(t.head, t.target, new THREE.Vector3(0, 1, 0)));
      // lookAt points -Z at the target for objects; the cone runs along -Z from the lamp
      beams.setMatrixAt(i, m.compose(t.head, q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)), sc));
    });
    beams.frustumCulled = false;
    this.beams = beams;
    this.group.add(beams);
  }

  setActive(on) {
    this.on = on;
    // the masts stand all day; the lamps, their glow and beams only at night
    this.group.visible = true;
    this.glow.visible = on; this.beams.visible = on;
    this.lampM.emissiveIntensity = on ? 5 : 0;
    this.beamM.uniforms.uK.value = on ? 1 : 0;
    for (const s of this.spots) { s.visible = on; s.intensity = on ? this.intensity : 0; }
    this.assigned = null;
  }

  // the towers nearest the camera (and the ground ahead of it) get the real lights
  update(camera, focus) {
    if (!this.on) return;
    this.t++;
    if (this.assigned && this.t % 6) return;
    const fx = focus.x, fz = focus.z;
    const scored = this.towers.map((t) => [t, Math.hypot(t.x - fx, (t.z - fz) * (t.z < fz ? 1.6 : 1))]).sort((a, b) => a[1] - b[1]);
    const near = scored.slice(0, this.spots.length).map((x) => x[0]);
    near.forEach((t, i) => {
      const s = this.spots[i];
      s.position.copy(t.head);
      s.target.position.copy(t.target);
      s.target.updateMatrixWorld();
    });
    const next = near;
    this.assigned = next;
  }
}
