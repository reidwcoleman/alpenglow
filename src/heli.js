// The rescue helicopter: a red and white air ambulance with a spinning four-blade rotor,
// a tail rotor, skids, a winch on the right-hand side and an orange basket stretcher on
// the end of its cable. Everything is built here; the rescue (rescue.js) flies it.
import * as THREE from 'three';

function label(text, w, h, bg, fg) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = fg; g.font = `900 ${Math.round(h * 0.62)}px Helvetica, Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function crossTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d6202a'; g.fillRect(50, 18, 28, 92); g.fillRect(18, 50, 92, 28);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Helicopter {
  constructor(scene) {
    const red = new THREE.MeshStandardMaterial({ color: 0xd3232c, roughness: 0.32, metalness: 0.2 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f3f5, roughness: 0.35, metalness: 0.1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x24272d, roughness: 0.5, metalness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x16212e, roughness: 0.05, metalness: 0.9, envMapIntensity: 1.6 });
    const orange = new THREE.MeshStandardMaterial({ color: 0xff6a12, roughness: 0.45, metalness: 0.05 });
    const G = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
    const root = (this.group = new THREE.Group());
    // fuselage: a rounded pod, white belly, a glass nose
    const pod = new THREE.CapsuleGeometry(0.95, 2.6, 8, 20).rotateX(Math.PI / 2).scale(0.92, 1.05, 1);
    root.add(G(pod, red, 0, 1.55, 0));
    const belly = new THREE.CapsuleGeometry(0.96, 2.4, 6, 20, 1).rotateX(Math.PI / 2).scale(0.93, 0.6, 0.98);
    root.add(G(belly, white, 0, 1.18, 0.05));
    const nose = new THREE.SphereGeometry(0.98, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2 - 0.35).scale(0.9, 0.95, 1.1);
    root.add(G(nose, glass, 0, 1.75, 1.45));
    // side windows
    for (const s of [-1, 1]) root.add(G(new THREE.BoxGeometry(0.02, 0.55, 1.3), glass, s * 0.86, 1.95, 0.35));
    // tail boom, fin, tailplane, the tail rotor
    root.add(G(new THREE.CylinderGeometry(0.2, 0.42, 5.2, 14).rotateX(Math.PI / 2), red, 0, 1.85, -4.0));
    root.add(G(new THREE.BoxGeometry(0.1, 1.5, 0.9).translate(0, 0.45, 0).applyMatrix4(new THREE.Matrix4().makeShear(0, 0, 0, 0, -0.45, 0)), red, 0, 1.95, -6.45));
    root.add(G(new THREE.BoxGeometry(1.9, 0.07, 0.5), white, 0, 1.9, -5.7));
    this.tailRotor = new THREE.Group();
    for (let i = 0; i < 2; i++) this.tailRotor.add(G(new THREE.BoxGeometry(0.03, 1.1, 0.12).rotateX(i * Math.PI / 2), dark));
    this.tailRotor.position.set(0.16, 2.35, -6.6);
    root.add(this.tailRotor);
    // engine cowl, mast, the main rotor and its blur
    root.add(G(new THREE.BoxGeometry(1.0, 0.45, 1.8).translate(0, 0, -0.3), white, 0, 2.55, -0.4));
    root.add(G(new THREE.CylinderGeometry(0.08, 0.1, 0.55, 10), dark, 0, 2.95, -0.2));
    this.rotor = new THREE.Group();
    this.rotor.position.set(0, 3.2, -0.2);
    for (let i = 0; i < 4; i++) {
      const b = G(new THREE.BoxGeometry(5.1, 0.04, 0.3).translate(2.6, 0, 0), dark);
      b.rotation.y = (i * Math.PI) / 2;
      this.rotor.add(b);
    }
    this.rotor.add(G(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 12), dark));
    root.add(this.rotor);
    this.blur = new THREE.Mesh(new THREE.CircleGeometry(5.3, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1a1c20, transparent: true, opacity: 0.16, depthWrite: false }));
    this.blur.position.set(0, 3.21, -0.2);
    root.add(this.blur);
    // skids
    for (const s of [-1, 1]) {
      root.add(G(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 8).rotateX(Math.PI / 2), dark, s * 0.95, 0.06, 0.1));
      for (const z of [-0.8, 0.9]) root.add(G(new THREE.CylinderGeometry(0.04, 0.04, 0.95, 6).rotateZ(s * 0.35), dark, s * 0.82, 0.48, z));
    }
    // livery: RESCUE down both sides, a red cross on the doors
    const word = label('RESCUE', 512, 96, null, '#ffffff');
    const cross = crossTex();
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.42), new THREE.MeshBasicMaterial({ map: word, transparent: true }));
      w.position.set(s * 0.875, 1.5, -2.6); w.rotation.y = s * Math.PI / 2;
      root.add(w);
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshStandardMaterial({ map: cross, transparent: true, roughness: 0.4 }));
      c.position.set(s * 0.88, 1.5, -0.6); c.rotation.y = s * Math.PI / 2;
      root.add(c);
    }
    // the winch on its arm over the right-hand door, the cable and the stretcher
    root.add(G(new THREE.BoxGeometry(0.9, 0.12, 0.12), dark, -1.2, 2.45, 0.2));
    this.winch = new THREE.Vector3(-1.62, 2.4, 0.2);
    this.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 5).translate(0, -0.5, 0), dark);
    this.cable.position.copy(this.winch);
    root.add(this.cable);
    // basket stretcher: an orange tub with rails, slung from a ring on four lines
    const sx = new THREE.Group();
    sx.add(G(new THREE.BoxGeometry(0.62, 0.06, 2.1), orange, 0, 0, 0));
    for (const s of [-1, 1]) {
      sx.add(G(new THREE.BoxGeometry(0.05, 0.22, 2.1), orange, s * 0.31, 0.11, 0));
      sx.add(G(new THREE.CylinderGeometry(0.025, 0.025, 2.1, 6).rotateX(Math.PI / 2), dark, s * 0.33, 0.24, 0));
    }
    for (const z of [-1.04, 1.04]) sx.add(G(new THREE.BoxGeometry(0.62, 0.22, 0.05), orange, 0, 0.11, z));
    const slings = new THREE.BufferGeometry().setFromPoints([0.31, -0.31].flatMap((x) => [-0.95, 0.95].flatMap((z) => [new THREE.Vector3(x, 0.24, z), new THREE.Vector3(0, 1.3, 0)])));
    sx.add(new THREE.LineSegments(slings, new THREE.LineBasicMaterial({ color: 0x222222 })));
    this.stretcher = sx;
    root.add(sx);
    this.setCable(1);
    this.spin = 0;
    root.visible = false;
    scene.add(root);
  }

  // let the stretcher out to len metres under the winch
  setCable(len) {
    this.len = len;
    this.cable.scale.y = Math.max(0.01, len);
    this.stretcher.position.copy(this.winch).add(new THREE.Vector3(0, -len - 1.3, 0));
  }

  // the stretcher's bed, in the world
  bed(out) { return this.stretcher.localToWorld(out.set(0, 0.08, 0)); }

  update(dt, rpm = 1) {
    this.spin += dt * 38 * rpm;
    this.rotor.rotation.y = this.spin;
    this.tailRotor.rotation.x = this.spin * 2.3;
    this.blur.material.opacity = 0.16 * rpm;
  }
}
