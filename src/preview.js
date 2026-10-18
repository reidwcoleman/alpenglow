// The rider on the menu: a small renderer of its own that draws your rider standing on
// their skis or board, for the sticker on the Ride tab and the turntable in the Locker
// (drag to turn it round).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SkierModel } from './skiermodel.js';

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

  // show it in el; spin: turns on its own (the sticker) or only when dragged (the locker)
  mount(el, { spin = 0.25, zoom = 1 } = {}) {
    if (this.canvas.parentElement !== el) el.appendChild(this.canvas);
    this.el = el; this.spin = spin; this.zoom = zoom;
  }

  render(dt) {
    if (!this.el || !this.model || !this.el.offsetParent) return;
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    if (this.w !== w || this.h !== h) { this.w = w; this.h = h; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    this.t += dt;
    if (!this.drag) this.yaw += this.spin * dt;
    const m = this.model;
    // standing ready, breathing a little
    m.pose({ crouch: 0.08 + Math.sin(this.t * 1.7) * 0.02, tuck: 0, lean: 0, angulate: 0.5, plow: 0, air: 0, grab: 0, polePlant: 0, poleSide: 1, crash: false, t: this.t, twist: 0, edge: 0, look: Math.sin(this.t * 0.4) * 0.25 });
    // a snowboarder is turned so you see the rider, not the edge of the board
    m.group.rotation.y = this.yaw + (this.board ? Math.PI / 2 : 0);
    const d = 4.4 / (this.zoom || 1);
    this.camera.position.set(0, 1.25, d);
    this.camera.lookAt(0, 0.86, 0);
    this.renderer.render(this.scene, this.camera);
  }
}
