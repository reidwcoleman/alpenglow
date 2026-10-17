// Keyboard, gamepad and touch merged into one control state.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.steer = 0;
    this.touch = { left: false, right: false, tuck: false, brake: false, jump: false, grab: false };
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
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

  // returns controls for the player's skier this frame.
  // A/D carve (spin in the air), W tuck (front flip), S brake (backflip), arrows roll in the air,
  // Space load and pop, Shift mute / Q tail / E japan grab, B butter, up arrow for rodeos and mistys
  read(dt, airborne) {
    const t = this.touch;
    let target = 0;
    if (this.down('KeyA') || t.left || (!airborne && this.down('ArrowLeft'))) target -= 1;
    if (this.down('KeyD') || t.right || (!airborne && this.down('ArrowRight'))) target += 1;
    // keyboard steering ramps like a real edge roll (in the air it's straight on/off)
    const rate = airborne ? 30 : target === 0 ? 7 : Math.sign(target) !== Math.sign(this.steer) ? 9 : 4.5;
    this.steer += Math.max(-rate * dt, Math.min(rate * dt, target - this.steer));
    let steer = this.steer;
    let tuck = this.down('KeyW') || (!airborne && this.down('ArrowUp')) || t.tuck ? 1 : 0;
    let brake = this.down('KeyS') || (!airborne && this.down('ArrowDown')) || t.brake ? 1 : 0;
    let jump = this.down('Space') || t.jump;
    let grabKind = this.down('ShiftLeft', 'ShiftRight') || t.grab ? 'mute' : this.down('KeyQ') ? 'tail' : this.down('KeyE') ? 'japan' : null;
    let roll = airborne ? (this.down('ArrowRight') ? 1 : 0) - (this.down('ArrowLeft') ? 1 : 0) : 0;
    let up = airborne && this.down('ArrowUp');
    let butter = this.down('KeyB');
    let flip = 0;
    const gp = this.pad();
    this.padHit = {};
    if (gp) {
      const ax = gp.axes[0] ?? 0, rx = gp.axes[2] ?? 0;
      if (Math.abs(ax) > 0.12) steer = Math.sign(ax) * Math.pow((Math.abs(ax) - 0.12) / 0.88, 1.3);
      const b = (i) => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.3);
      if (b(7) || b(5)) tuck = 1; // RT / RB: tuck, front
      if (b(6)) brake = 1; // LT: brake, back
      if (b(0)) jump = true; // A: pop
      if (b(4)) grabKind = 'mute'; // LB
      else if (b(2)) grabKind = 'tail'; // X
      else if (b(3)) grabKind = 'japan'; // Y
      if (b(1)) up = true; // B: rodeo / misty
      if (b(10)) butter = true; // LS
      if (airborne && Math.abs(rx) > 0.45) roll = Math.sign(rx);
      gp.buttons.forEach((btn, i) => { if (btn.pressed && !this.padPrev[i]) this.padHit[i] = true; this.padPrev[i] = btn.pressed; });
    }
    if (airborne) {
      if (tuck) flip = 1;
      if (brake) flip = -1;
      tuck = 0; brake = 0;
    }
    return { steer, tuck, brake, jump, grab: !!grabKind, grabKind, flip, roll, up, butter };
  }

  endFrame() { this.pressed.clear(); }
}
