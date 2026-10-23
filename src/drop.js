// Pick your drop: after RIDE, the real mountain from the air (the loaded run, or the park, drawn
// by the game itself like a trail map seen from the valley) with a pin at every place you can
// start from. Choose one and the run starts there.
import * as THREE from 'three';
import { START_Z, FINISH_Z, ZONES, JUMPS, RAILS, centerX, halfWidth, heightAt, PARK, PARK_ID, PIPE, ROLLERS, PARK_JUMPS, PARK_RAILS, MAP } from './course.js';
import { trailDiff } from './props.js';
import { AG } from './atmos.js';

const DIFF = { blue: '#2a63e0', red: '#d8282e', black: '#11161f' };

const $ = (id) => document.getElementById(id);

export class DropPicker {
  constructor(game) {
    this.g = game;
    this.on = false;
    this.sel = 0;
    this.spots = [];
  }

  // the run's places: the top, then the start of every named part of it
  runSpots() {
    const list = [{ name: 'The top', z: START_Z + 4, dx: 0, top: true }];
    let z0 = START_Z;
    for (const Z of ZONES) {
      if (Z.name !== 'Finish' && z0 > START_Z + 30 && z0 < FINISH_Z - 120) list.push({ name: Z.name, z: z0 + 6, dx: 0 });
      z0 = Z.z1;
    }
    // what's in each stretch (down to the next place)
    list.forEach((s, i) => {
      const z1 = list[i + 1]?.z ?? FINISH_Z;
      const nJ = JUMPS.filter((J) => J.z >= s.z && J.z < z1).length, nR = RAILS.filter((R) => R.z >= s.z && R.z < z1).length;
      const bits = [];
      if (nJ) bits.push(`${nJ} jump${nJ > 1 ? 's' : ''}`);
      if (nR) bits.push(`${nR} ${RAILS.find((R) => R.z >= s.z && R.z < z1)?.kind === 'log' ? 'log' : 'rail'}${nR > 1 ? 's' : ''}`);
      s.sub = bits.join(' · ') || (s.top ? 'the whole run' : 'cruise');
      s.diff = s.top ? 'blue' : trailDiff(s.name);
      s.down = Math.round(s.z - START_Z);
    });
    return list;
  }

  // the Ski Park's lines
  parkSpots() {
    const L = [
      { name: 'Park gate', line: 'gate', dx: 0, z: PARK.top - 14, sub: 'pick a line from the top', diff: 'blue' },
      { name: 'Jump line', line: 'jumps', dx: PARK_JUMPS[0].dx, z: PARK_JUMPS[0].z - 40, sub: `${PARK_JUMPS.length} kickers, small to XL`, diff: 'red' },
      { name: 'Rail garden', line: 'rails', dx: PARK_RAILS[0].dx, z: PARK_RAILS[0].z - 30, sub: `${PARK_RAILS.length} rails and boxes`, diff: 'red' },
      { name: 'Halfpipe', line: 'pipe', dx: PIPE.dx, z: PIPE.z0 - 18, sub: 'the superpipe', diff: 'black' },
      { name: 'Rollers', line: 'rollers', dx: ROLLERS.dx, z: ROLLERS.z0 - 20, sub: 'pump and butter', diff: 'blue' },
    ];
    for (const s of L) s.down = Math.round(s.z - START_Z);
    return L;
  }

  open(mode) {
    // (only a park with a Ski Park has its lines)
    if (mode === 'park' && !MAP.park) mode = 'run';
    this.mode = mode;
    this.spots = mode === 'park' ? this.parkSpots() : this.runSpots();
    const last = this.g.lastDrop?.[`${PARK_ID}/${mode}`];
    this.sel = Math.max(0, this.spots.findIndex((s) => s.name === last));
    $('dr-park').textContent = `${MAP.name} · ${mode === 'park' ? 'Ski Park' : MAP.tag}`;
    this.drawMap();
    $('dr-list').innerHTML = this.spots.map((s, i) => `<button data-i="${i}"><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="tx"><b>${s.name}</b><small>${s.sub}</small></span><span class="d"><i class="dif ${s.diff}"></i>${s.down < 30 ? 'top' : (s.down / 1000).toFixed(1) + ' km'}</span></button>`).join('');
    for (const b of $('dr-list').querySelectorAll('button')) {
      b.onclick = () => { if (this.sel === +b.dataset.i) this.choose(); else { this.sel = +b.dataset.i; this.mark(); } };
      b.ondblclick = () => { this.sel = +b.dataset.i; this.choose(); };
      b.onmouseenter = () => { this.sel = +b.dataset.i; this.mark(); };
    }
    $('dr-go').onclick = () => this.choose();
    $('dr-back').onclick = () => this.close();
    $('drop').classList.remove('hidden');
    this.on = true;
    this.mark();
  }

  close() {
    this.on = false;
    $('drop').classList.add('hidden');
  }

  // the mountain from the air: an orthographic camera up over the valley looking up the run,
  // tilted so the slopes show their relief, fitted round the run (or the park); rendered once by
  // the game's own renderer at twice the map's size. Returns the picture and where a point lands
  shoot(W, H) {
    const park = this.mode === 'park';
    const key = park ? 'park' : 'run';
    if (this.shots?.[key]) return this.shots[key];
    const g = this.g, r = g.renderer, scene = g.scene;
    const zA = park ? PARK.top - 40 : START_Z - 30, zB = park ? PARK.z1 + 30 : FINISH_Z + 40;
    const pts = [];
    for (let z = zA; z <= zB; z += (zB - zA) / 60) {
      const c = centerX(z), w = park ? 85 : halfWidth(z) + 45;
      for (const dx of [-w, 0, w]) pts.push(new THREE.Vector3(c + dx, heightAt(c + dx, z), z));
    }
    // (looking up the hill, 32 degrees off straight down)
    const a = 0.56, d = new THREE.Vector3(0, -Math.cos(a), -Math.sin(a));
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 20000);
    const mid = pts[Math.floor(pts.length / 2)];
    cam.position.copy(mid).addScaledVector(d, -6000);
    cam.up.set(0, Math.sin(a), -Math.cos(a));
    cam.lookAt(mid);
    cam.updateMatrixWorld(true);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const v = new THREE.Vector3();
    for (const p of pts) { v.copy(p).applyMatrix4(cam.matrixWorldInverse); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    // (fitted to the map's shape: the narrow way widens to match)
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let hw = (x1 - x0) / 2 * 1.04, hh = (y1 - y0) / 2 * 1.03;
    if (hw / hh < W / H) hw = hh * W / H; else hh = hw * H / W;
    Object.assign(cam, { left: cx - hw, right: cx + hw, top: cy + hh, bottom: cy - hh });
    cam.updateProjectionMatrix();
    // render it into the canvas at the map's size (no haze: it's a clear view), copy it off, put
    // everything back and draw the game's frame again before anyone sees it
    const keep = { size: r.getSize(new THREE.Vector2()), pr: r.getPixelRatio(), fog: scene.fog?.density, target: r.getRenderTarget(), cw: AG.uCamWorld.value.clone(), valley: AG.uValley.value.x };
    const MW = W * 2, MH = H * 2;
    let url = null;
    try {
      r.setPixelRatio(1);
      r.setSize(MW, MH, false);
      if (scene.fog) scene.fog.density = 0;
      // (the haze and shade work out where things are from the camera's place in the world)
      AG.uCamWorld.value.copy(cam.matrixWorld); AG.uValley.value.x = 0;
      r.setRenderTarget(null);
      r.render(scene, cam);
      const c2 = document.createElement('canvas'); c2.width = MW; c2.height = MH;
      c2.getContext('2d').drawImage(r.domElement, 0, 0, MW, MH, 0, 0, MW, MH);
      url = c2.toDataURL('image/jpeg', 0.86);
    } catch (e) { console.warn('drop map', e); }
    if (scene.fog) scene.fog.density = keep.fog;
    AG.uCamWorld.value.copy(keep.cw); AG.uValley.value.x = keep.valley;
    r.setPixelRatio(keep.pr);
    r.setSize(keep.size.x, keep.size.y, false);
    r.setRenderTarget(keep.target);
    g.post?.render(0);
    const at = (x, z, up = 1.5) => {
      v.set(x, heightAt(x, z) + up, z).project(cam);
      return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H];
    };
    (this.shots ??= {})[key] = { url, at };
    return this.shots[key];
  }

  // the map: the mountain as it is from the air, the finish flag, a numbered pin at every place
  drawMap() {
    const park = this.mode === 'park';
    const W = 360, H = 1000;
    const { url, at } = this.shoot(W, H);
    const P = (dx, z) => at(centerX(z) + dx, z);
    // (labels either side; ones that would overlap are spread apart down the map)
    const at2 = this.spots.map((s, i) => {
      const [x, y] = P(s.dx, s.z);
      let right = park ? s.dx >= 0 : i % 2 === 0;
      // (kept on the map: flipped to the other side if it would run off the edge)
      const tw = s.name.length * 9 + 8;
      if (!right && x - 20 - tw < 4) right = true; else if (right && x + 20 + tw > W - 4) right = false;
      return { i, x, y, right, ly: y };
    });
    for (const side of [true, false]) {
      let last = -1e9;
      for (const a of at2.filter((a) => a.right === side).sort((p, q) => p.y - q.y)) { a.ly = Math.max(a.y, last + 30); last = a.ly; }
    }
    const pins = at2.map(({ i, x, y, right, ly }) => {
      const s = this.spots[i], lx = x + (right ? 20 : -20);
      const lead = Math.abs(ly - y) > 2 ? `<path d="M${x.toFixed(1)} ${y.toFixed(1)} L${lx.toFixed(1)} ${ly.toFixed(1)}" stroke="#11161f" stroke-width="1.2" opacity=".5"/>` : '';
      return `${lead}<g class="pin" data-i="${i}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle class="ring" r="15"/><circle class="dot" r="11"/><text class="num" y="4">${i + 1}</text></g>
        <text class="lab" data-i="${i}" x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${right ? 'start' : 'end'}">${s.name}</text>`;
    }).join('');
    const [fx, fy] = park ? [-99, -99] : P(0, FINISH_Z);
    // the run marked over the real snow: its edges, a coloured line down it for each stretch's
    // difficulty, its kickers and rails
    const zA = park ? PARK.top - 20 : START_Z, zB = park ? PARK.z1 + 10 : FINISH_Z;
    const edge = (sgn) => { const o = []; for (let z = zA; z <= zB; z += (zB - zA) / 140) o.push(P(sgn * (park ? 75 : halfWidth(z)), z)); return o; };
    const L = edge(-1), R = edge(1);
    const poly = [...L, ...R.reverse()].map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + 'Z';
    let lines = '';
    this.spots.forEach((s, i) => {
      if (park) return;
      const z1 = this.spots[i + 1]?.z ?? zB, seg = [];
      for (let z = Math.max(zA, s.z - 6); z <= z1; z += 8) seg.push(P(0, z));
      if (seg.length > 1) lines += `<path d="${seg.map(([x, y], j) => `${j ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')}" fill="none" stroke="${DIFF[s.diff]}" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="1 6" opacity=".9"/>`;
    });
    const feats = [...JUMPS, ...RAILS].filter((f) => f.z > zA && f.z < zB).map((f) => {
      const [x, y] = P(f.dx, f.z);
      return RAILS.includes(f) ? `<rect x="${(x - 1.4).toFixed(1)}" y="${(y - 4).toFixed(1)}" width="2.8" height="8" rx="1" fill="#252a30"/>`
        : `<path d="M${(x - 5).toFixed(1)} ${(y + 2.5).toFixed(1)} q4 0 5 -6 l1 6 z" fill="#fff" stroke="#2a86ae" stroke-width="1.2"/>`;
    }).join('');
    $('dr-svg').setAttribute('viewBox', `0 0 ${W} ${H}`);
    $('dr-svg').innerHTML = `<defs><clipPath id="dr-clip"><rect width="${W}" height="${H}" rx="22"/></clipPath></defs>
      <g clip-path="url(#dr-clip)"><rect width="${W}" height="${H}" fill="#dfe8f3"/>${url ? `<image href="${url}" width="${W}" height="${H}" preserveAspectRatio="none" style="filter:contrast(1.18) saturate(1.15)"/>` : ''}
      <path d="${poly}" fill="rgba(255,255,255,.28)" stroke="#2a7de1" stroke-width="1.6" stroke-opacity=".7" stroke-linejoin="round"/>
      ${lines}${feats}
      <rect width="${W}" height="${H}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2" rx="22"/></g>
      <g transform="translate(${fx.toFixed(1)} ${fy.toFixed(1)})"><rect x="-1.2" y="-26" width="2.4" height="26" fill="#2b3a52"/><path d="M1.2 -26 h14 l-3.5 4.5 l3.5 4.5 h-14 z" fill="#ff8a3d"/></g>
      ${pins}`;
    for (const el of $('dr-svg').querySelectorAll('[data-i]')) {
      el.onclick = () => { const i = +el.dataset.i; if (this.sel === i) this.choose(); else { this.sel = i; this.mark(); } };
    }
  }

  mark() {
    $('dr-list').querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === this.sel));
    $('dr-svg').querySelectorAll('[data-i]').forEach((el) => el.classList.toggle('on', +el.dataset.i === this.sel));
    $('dr-list').querySelector('button.on')?.scrollIntoView({ block: 'nearest' });
    const s = this.spots[this.sel];
    $('dr-go').querySelector('span').textContent = s?.top ? 'DROP IN' : 'DROP IN HERE';
  }

  // keys while it's up: up/down to choose, Enter to go, Esc back to the front page
  keys(inp) {
    const n = this.spots.length;
    if (inp.hit('ArrowDown') || inp.hit('Numpad2') || inp.hit('KeyS')) { this.sel = (this.sel + 1) % n; this.mark(); }
    if (inp.hit('ArrowUp') || inp.hit('Numpad8') || inp.hit('KeyW')) { this.sel = (this.sel + n - 1) % n; this.mark(); }
    if (inp.hit('Enter') || inp.hit('NumpadEnter') || inp.hit('Space') || inp.padHit?.[0]) this.choose();
    else if (inp.hit('Escape') || inp.padHit?.[1]) this.close();
  }

  choose() {
    const s = this.spots[this.sel];
    if (!s) return;
    this.close();
    (this.g.lastDrop ??= {})[`${PARK_ID}/${this.mode}`] = s.name;
    this.g.start(this.mode, { drop: s });
  }
}
