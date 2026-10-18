// The rider on the menu: a small renderer of its own that draws your rider standing on
// their skis or board, for the sticker on the Ride tab and the turntable in the Locker
// (drag to turn it round).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SkierModel } from './skiermodel.js';

const TRICKS = { backflip: [0, -1], frontflip: [0, 1], cork: [0.8, -1], bio: [0.8, 1], rodeo: [0.42, -1], misty: [0.42, 1], sideflip: [null, 1], flatspin: [null, 1] };
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Preview {
  constructor() {
    const c = (this.canvas = document.createElement('canvas'));
    c.className = 'preview';
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, premultipliedAlpha: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    const key = new THREE.DirectionalLight(0xfff4e6, 2.2);
    key.position.set(2.5, 4, 3);
    const rim = new THREE.DirectionalLight(0xb9d4ff, 1.6);
    rim.position.set(-3, 2.5, -3);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xdfeaff, 0x40465a, 0.6));
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
    this.yaw = 0.55; this.spin = 0.25; this.t = 0;
    this.drag = null;
    c.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, yaw: this.yaw }; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (this.drag) this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.012; });
    c.addEventListener('pointerup', () => { this.drag = null; });
  }

  setOutfit(outfit) {
    const key = JSON.stringify(outfit);
    if (key === this.key) return;
    this.key = key;
    if (this.model) this.scene.remove(this.model.group);
    this.model = new SkierModel(outfit);
    this.model.setDetail(true);
    this.model.setReal(true);
    this.scene.add(this.model.group);
    this.board = !!outfit.board;
  }

  // the Trick School: the rider does a trick over and over (null: stand still again)
  demo(spec) {
    this.demoSpec = spec;
    this.demoT = 0;
    if (!this.rail) {
      this.rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 3.4), new THREE.MeshStandardMaterial({ color: 0xffb02e, roughness: 0.35, metalness: 0.6 }));
      this.scene.add(this.rail);
    }
    this.rail.visible = !!spec?.rail;
    this.board = !!this.model?.board;
  }

  // show it in el; spin: turns on its own (the sticker) or only when dragged (the locker)
  mount(el, { spin = 0.25, zoom = 1, look = 0.86, eye = 1.25 } = {}) {
    if (this.canvas.parentElement !== el) el.appendChild(this.canvas);
    this.el = el; this.spin = spin; this.zoom = zoom; this.look = look; this.eye = eye;
  }

  render(dt) {
    if (!this.el || !this.model || !this.el.offsetParent) return;
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    if (this.w !== w || this.h !== h) { this.w = w; this.h = h; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    this.t += dt;
    if (!this.drag) this.yaw += this.spin * dt;
    const m = this.model;
    if (this.demoSpec && this.el.id === 'demo') { this.renderDemo(dt); return; }
    if (this.rail) this.rail.visible = false;
    // standing ready, breathing a little
    m.pose({ crouch: 0.08 + Math.sin(this.t * 1.7) * 0.02, tuck: 0, lean: 0, angulate: 0.5, plow: 0, air: 0, grab: 0, polePlant: 0, poleSide: 1, crash: false, t: this.t, twist: 0, edge: 0, look: Math.sin(this.t * 0.4) * 0.25 });
    // a snowboarder is turned so you see the rider, not the edge of the board
    m.group.position.set(0, 0, 0);
    m.group.quaternion.identity();
    m.group.rotation.y = this.yaw + (this.board ? Math.PI / 2 : 0);
    const d = 4.4 / (this.zoom || 1);
    this.camera.position.set(0, this.eye ?? 1.25, d);
    this.camera.lookAt(0, this.look ?? 0.86, 0);
    this.renderer.render(this.scene, this.camera);
  }

  renderDemo(dt) {
    const m = this.model, D = this.demoSpec, g = m.group;
    this.demoT += dt;
    const spinRad = ((D.spin ?? 0) / 180) * Math.PI, flips = D.flips ?? 0;
    const air = D.rail || D.butter ? 0 : Math.min(2.2, 1.0 + 0.22 * ((D.spin ?? 0) / 360) + 0.35 * flips);
    const T = D.rail || D.butter ? 3.2 : air + 1.6;
    const t = this.demoT % T;
    const sd = D.dir ?? 1;
    // seen from the side, a little in front
    const base = 0.6 + (this.board ? Math.PI / 2 : 0);
    let y = 0, crouch = 0.15, inAir = 0, grab = 0, yaw = 0, pitch = 0, press = 0, shifty = 0, daffy = 0;
    const q = new THREE.Quaternion();
    if (D.rail) {
      y = 0.5;
      yaw = D.rail === 'side' || D.spin ? Math.PI / 2 : 0;
      if (D.spin && t > 2.2) { const u = ss(2.2, 3.0, t); yaw += sd * ((D.spin / 180) * Math.PI - Math.PI / 2) * u; y = 0.5 + Math.sin(u * Math.PI) * 0.35; inAir = u < 1 ? 1 : 0; }
      press = D.rail === 'press' ? 0.8 : 0;
      crouch = 0.3;
      this.rail.position.set(0, 0.47, 0);
      this.rail.rotation.y = 0.6;
    } else if (D.butter) {
      press = 1; crouch = 0.25;
      yaw = sd * ss(0.6, 2.6, t) * Math.PI * 2;
    } else {
      const t0 = 0.7, t1 = t0 + air;
      if (t < t0) crouch = 0.15 + ss(0, t0 * 0.8, t) * 0.4 - ss(t0 * 0.8, t0, t) * 0.4;
      else if (t < t1) {
        const u = (t - t0) / air;
        inAir = 1;
        y = 4 * (0.45 + air * 0.55) * u * (1 - u);
        const r = ss(0.04, 0.88, u);
        yaw = sd * spinRad * r;
        pitch = flips * Math.PI * 2 * r;
        grab = D.grab && u > 0.12 && u < 0.85 ? 1 : 0;
        shifty = D.shifty ? Math.sin(Math.min(1, u * 1.2) * Math.PI) : 0;
        daffy = D.daffy ? Math.sin(Math.min(1, u * 1.2) * Math.PI) : 0;
        crouch = 0.25;
      } else {
        const u = (t - t1) / 0.6;
        crouch = 0.15 + Math.max(0, 0.5 - u * 0.6);
        yaw = sd * spinRad; pitch = flips * Math.PI * 2;
      }
    }
    m.pose({ crouch, tuck: 0, lean: 0, angulate: 0.5, plow: 0, air: inAir, grab, grabKind: D.grab ?? 'mute', polePlant: 0, poleSide: 1, crash: false, t: this.t, twist: 0, edge: 0, look: 0,
      shifty, daffy, press, spinRate: inAir && D.spin ? 8 : 0, switch: false });
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), base + yaw);
    const tr = D.type && TRICKS[D.type];
    if (tr && pitch) {
      const [a, dirF] = tr;
      const ax = a == null ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(Math.cos(a), 0, Math.sin(a) * sd * (dirF < 0 ? 1 : -1)).normalize();
      q.multiply(new THREE.Quaternion().setFromAxisAngle(ax, dirF * pitch * (a == null ? D.roll ?? 1 : 1)));
    }
    if (press) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), press * 0.3));
    g.quaternion.copy(q);
    // about the middle of the body, not the feet
    const c = new THREE.Vector3(0, 0.8, 0).applyQuaternion(q);
    g.position.set(0, y + 0.8, 0).sub(c);
    this.camera.position.set(0, 1.45, 5.6);
    this.camera.lookAt(0, 1.05, 0);
    this.renderer.render(this.scene, this.camera);
  }
}
