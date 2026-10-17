// Keyboard, gamepad and touch merged into one control state.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.steer = 0;
    this.touch = { left: false, right: false, tuck: false, brake: false, jump: false, grab: false };
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.padPrev = [];
    this.bindTouch();
  }

  bindTouch() {
    const map = { 'tc-left': 'left', 'tc-right': 'right', 'tc-tuck': 'tuck', 'tc-brake': 'brake', 'tc-jump': 'jump', 'tc-grab': 'grab' };
    for (const [id, k] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (!el) continue;
      const on = (e) => { e.preventDefault(); this.touch[k] = true; el.classList.add('on'); };
      const off = (e) => { e.preventDefault(); this.touch[k] = false; el.classList.remove('on'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointerleave', off);
      el.addEventListener('pointercancel', off);
    }
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(code) { return this.pressed.has(code); }

  pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  // returns controls for the player's skier this frame
  read(dt, airborne) {
    const t = this.touch;
    let target = 0;
    if (this.down('ArrowLeft', 'KeyA') || t.left) target -= 1;
    if (this.down('ArrowRight', 'KeyD') || t.right) target += 1;
    // keyboard steering ramps like a real edge roll
    const rate = target === 0 ? 7 : Math.sign(target) !== Math.sign(this.steer) ? 9 : 4.5;
    this.steer += Math.max(-rate * dt, Math.min(rate * dt, target - this.steer));
    let steer = this.steer;
    let tuck = this.down('ArrowUp', 'KeyW') || t.tuck ? 1 : 0;
    let brake = this.down('ArrowDown', 'KeyS') || t.brake ? 1 : 0;
    let jump = this.down('Space') || t.jump;
    let grab = this.down('ShiftLeft', 'ShiftRight', 'KeyE') || t.grab;
    let flip = 0;
    const gp = this.pad();
    this.padHit = {};
    if (gp) {
      const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0;
      if (Math.abs(ax) > 0.12) steer = Math.sign(ax) * Math.pow((Math.abs(ax) - 0.12) / 0.88, 1.3);
      const b = (i) => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.3);
      if (b(7)) tuck = 1;
      if (b(6)) brake = 1;
      if (b(0)) jump = true;
      if (b(2) || b(5)) grab = true;
      if (airborne && Math.abs(ay) > 0.4) flip = ay < 0 ? 1 : -1;
      gp.buttons.forEach((btn, i) => { if (btn.pressed && !this.padPrev[i]) this.padHit[i] = true; this.padPrev[i] = btn.pressed; });
    }
    if (airborne) {
      if (tuck) flip = 1;
      if (brake) flip = -1;
      tuck = 0; brake = 0;
    }
    return { steer, tuck, brake, jump, grab, flip };
  }

  endFrame() { this.pressed.clear(); }
}
