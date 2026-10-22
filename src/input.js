// Keyboard, gamepad and touch merged into one control state.

// Settings > Controls (Cork7: change any key): every action's own key. A rebound key stands in for
// the default one, so the rest of the game keeps reading the default codes
export const ACTIONS = [
  ['steerL', 'Carve / spin left', 'KeyA'], ['steerR', 'Carve / spin right', 'KeyD'],
  ['front', 'Tuck · frontflip', 'KeyW'], ['back', 'Brake · backflip', 'KeyS'],
  ['pop', 'Load / pop', 'Space'], ['mute', 'Mute grab', 'ShiftLeft'], ['tail', 'Tail grab', 'KeyQ'],
  ['japan', 'Japan grab', 'KeyE'], ['butter', 'Butter', 'KeyB'], ['rodeo', 'Rodeo / misty', 'ArrowUp'],
  ['rollL', 'Air roll left', 'ArrowLeft'], ['rollR', 'Air roll right', 'ArrowRight'],
  ['restart', 'Restart (hold)', 'KeyR'], ['cam', 'Camera', 'KeyC'],
];

export const keyLabel = (c) => !c ? '—' : c.startsWith('Key') ? c.slice(3) : c.startsWith('Digit') ? c.slice(5)
  : c.startsWith('Numpad') ? 'NUM ' + c.slice(6) : ({ ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'SHIFT', ShiftRight: 'R SHIFT', ControlLeft: 'CTRL', ControlRight: 'R CTRL', AltLeft: 'ALT', AltRight: 'R ALT', Space: 'SPACE' }[c] ?? c.toUpperCase());

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.steer = 0;
    // 'arrows': the arrow keys ride (left/right carve and spin, up tuck / front flip, down
    // brake / backflip) and the number keys do the tricks; 'classic': WASD rides, arrows roll
    try { this.scheme = localStorage.getItem('alpenglow.scheme') || 'arrows'; } catch { this.scheme = 'arrows'; }
    this.touch = { left: false, right: false, tuck: false, brake: false, jump: false, grab: false };
    try { this.binds = JSON.parse(localStorage.getItem('alpenglow.binds') || '{}') || {}; } catch { this.binds = {}; }
    this.remapKeys();
    addEventListener('keydown', (e) => {
      // typing in a text field (chat, name, room) isn't riding
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      // (Settings is listening for a new key)
      if (this.listen) { e.preventDefault(); e.stopPropagation(); const f = this.listen; this.listen = null; f(e.code); return; }
      const code = this.mapKey(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code) || /^Numpad/.test(e.code) || code !== e.code) e.preventDefault();
      if (!code) return;
      if (!this.keys.has(code)) this.pressed.add(code);
      this.keys.add(code);
    }, true);
    addEventListener('keyup', (e) => { const code = this.mapKey(e.code); if (code) this.keys.delete(code); });
    addEventListener('blur', () => this.keys.clear());
    this.padPrev = [];
    this.bindTouch();
  }

  // the on-screen buttons press the same keys a keyboard would (so taps make combos too)
  bindTouch() {
    const map = { 'tc-left': 'ArrowLeft', 'tc-right': 'ArrowRight', 'tc-tuck': 'ArrowUp', 'tc-brake': 'ArrowDown', 'tc-jump': 'Space', 'tc-grab': 'ShiftLeft', 'tc-turn': 'KeyG' };
    for (const [id, code] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (!el) continue;
      const on = (e) => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); if (!this.keys.has(code)) this.pressed.add(code); this.keys.add(code); el.classList.add('on'); navigator.vibrate?.(8); };
      const off = (e) => { e.preventDefault(); this.keys.delete(code); el.classList.remove('on'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('lostpointercapture', off);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  // the key that stands for each default one, and the defaults that something else took
  remapKeys() {
    this.remap = new Map(); this.off = new Set();
    const bound = new Set(ACTIONS.map(([id, , def]) => this.binds[id] ?? def));
    for (const [id, , def] of ACTIONS) {
      const k = this.binds[id];
      if (!k || k === def) continue;
      this.remap.set(k, def);
      if (!bound.has(def)) this.off.add(def);
    }
  }

  mapKey(code) { return this.remap.get(code) ?? (this.off.has(code) ? null : code); }

  setBind(id, code) {
    // (a key can only do one thing: whatever had it goes back to its own default)
    for (const [o, , def] of ACTIONS) if (o !== id && (this.binds[o] ?? def) === code) this.binds[o] = '';
    const def = ACTIONS.find(([a]) => a === id)?.[2];
    if (code === def) delete this.binds[id]; else this.binds[id] = code;
    this.saveBinds();
  }

  resetBinds() { this.binds = {}; this.saveBinds(); }

  saveBinds() {
    this.remapKeys(); this.keys.clear();
    try { localStorage.setItem('alpenglow.binds', JSON.stringify(this.binds)); } catch { /* */ }
  }

  bindOf(id) { return this.binds[id] ?? ACTIONS.find(([a]) => a === id)?.[2]; }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(code) { return this.pressed.has(code); }

  pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  // returns controls for the player's skier this frame.
  // A/D carve (spin in the air), W tuck (front flip), S brake (backflip), arrows roll in the air,
  // Space load and pop, grabs on Shift / Q / E / F / X / Z, B butter, up arrow for rodeos and
  // mistys (alone: a shifty), down arrow alone: a daffy
  read(dt, airborne, rail = false) {
    const t = this.touch;
    let target = 0;
    const A = this.scheme === 'arrows';
    if (this.down('KeyA') || t.left || ((A || !airborne) && this.down('ArrowLeft'))) target -= 1;
    if (this.down('KeyD') || t.right || ((A || !airborne) && this.down('ArrowRight'))) target += 1;
    // keyboard steering ramps like a real edge roll (in the air it's straight on/off)
    const rate = airborne || rail ? 30 : target === 0 ? 7 : Math.sign(target) !== Math.sign(this.steer) ? 9 : 4.5;
    this.steer += Math.max(-rate * dt, Math.min(rate * dt, target - this.steer));
    let steer = this.steer;
    let tuck = this.down('KeyW') || ((A || !airborne) && this.down('ArrowUp')) || t.tuck ? 1 : 0;
    let brake = this.down('KeyS') || ((A || !airborne) && this.down('ArrowDown')) || t.brake ? 1 : 0;
    // (keypad 0 pops too, so a run needs nothing but the arrows and the keypad)
    let jump = this.down('Space') || this.down('Numpad0') || t.jump;
    let grabKind = this.down('ShiftLeft', 'ShiftRight') || t.grab ? 'mute' : this.down('KeyQ') ? 'tail' : this.down('KeyE') ? 'japan'
      : this.down('KeyF') ? 'safety' : this.down('KeyX') ? 'critical' : this.down('KeyZ') ? 'nose' : null;
    let roll = airborne && !A ? (this.down('ArrowRight') ? 1 : 0) - (this.down('ArrowLeft') ? 1 : 0) : 0;
    let up = airborne && !A && this.down('ArrowUp');
    let down = airborne && !A && this.down('ArrowDown');
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
      else if (b(14)) grabKind = 'safety'; // d-pad left
      else if (b(15)) grabKind = 'critical'; // d-pad right
      else if (b(13)) grabKind = 'nose'; // d-pad down
      if (b(1)) up = true; // B: rodeo / misty
      if (b(10)) butter = true; // LS
      if (airborne && Math.abs(rx) > 0.45) roll = Math.sign(rx);
      const ry = gp.axes[3] ?? 0;
      if (airborne && ry < -0.6 && Math.abs(rx) < 0.45) up = true;
      if (airborne && ry > 0.6 && Math.abs(rx) < 0.45) down = true;
      gp.buttons.forEach((btn, i) => { if (btn.pressed && !this.padPrev[i]) this.padHit[i] = true; this.padPrev[i] = btn.pressed; });
    }
    if (airborne) {
      if (tuck) flip = 1;
      if (brake) flip = -1;
      tuck = 0; brake = 0;
    }
    return { steer, tuck, brake, jump, grab: !!grabKind, grabKind, flip, roll, up, down, butter };
  }

  setScheme(s) { this.scheme = s; try { localStorage.setItem('alpenglow.scheme', s); } catch { /* */ } }

  endFrame() { this.pressed.clear(); }
}
