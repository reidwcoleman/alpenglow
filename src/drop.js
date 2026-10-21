// Pick your drop: after RIDE, a trail map of the loaded run (or the park's lines) with every
// place you can start from. Choose one and the run starts there.
import { START_Z, FINISH_Z, ZONES, JUMPS, RAILS, centerX, PARK, PARK_ID, PIPE, ROLLERS, PARK_JUMPS, PARK_RAILS, MAP } from './course.js';
import { trailDiff } from './props.js';

const $ = (id) => document.getElementById(id);
const DIFF = { blue: '#2a63e0', red: '#d8282e', black: '#11161f' };

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

  // a portrait trail map: the run as a white piste with its nets, trees either side, the
  // features on it and a numbered pin at every place
  drawMap() {
    const park = this.mode === 'park';
    const zA = park ? PARK.top - 60 : START_Z, zB = park ? PARK.z1 + 40 : FINISH_Z;
    const W = 360, H = 1000, cx0 = centerX(zA);
    const pts = [];
    for (let z = zA; z <= zB; z += (zB - zA) / 120) pts.push([centerX(z) - cx0, z]);
    let mx = 1;
    for (const [x] of pts) mx = Math.max(mx, Math.abs(x));
    if (park) mx = Math.max(mx, 70);
    const k = (park ? 130 : 110) / Math.max(mx, 60);
    const X = (x) => W / 2 + x * k, Y = (z) => 40 + ((z - zA) / (zB - zA)) * (H - 80);
    const P = (dx, z) => [X(centerX(z) - cx0 + dx), Y(z)];
    const d = pts.map(([x, z], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(z).toFixed(1)}`).join(' ');
    const pw = park ? 150 * k : 34;
    // trees: either side of the piste, a deterministic scatter
    let r = 7, trees = '';
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      const z = zA + rnd() * (zB - zA), side = rnd() < 0.5 ? -1 : 1;
      const [x, y] = P(side * ((pw / 2 + 10 + rnd() * 60) / k), z);
      if (x < 8 || x > W - 8) continue;
      const s = 7 + rnd() * 6;
      trees += `<path d="M${x.toFixed(1)} ${(y - s * 1.6).toFixed(1)} l${s * 0.7} ${s * 1.6} h${-s * 1.4} z" fill="#2c5a5e"/><path d="M${x.toFixed(1)} ${(y - s * 1.6).toFixed(1)} l${s * 0.3} ${s * 0.7} h${-s * 0.6} z" fill="#fff"/>`;
    }
    const feats = [...JUMPS, ...RAILS].filter((f) => f.z > zA && f.z < zB).map((f) => {
      const [x, y] = P(f.dx * (park ? 1 : 0.25), f.z);
      return RAILS.includes(f) ? `<rect x="${(x - 1.6).toFixed(1)}" y="${(y - 5).toFixed(1)}" width="3.2" height="10" rx="1.2" fill="#252a30"/>`
        : `<path d="M${(x - 6).toFixed(1)} ${(y + 3).toFixed(1)} q5 0 6 -7 l1 7 z" fill="#fff" stroke="#2a86ae" stroke-width="1.4"/>`;
    }).join('');
    // a coloured stripe down the middle for each stretch's difficulty
    let stripes = '';
    this.spots.forEach((s, i) => {
      if (park) return;
      const z1 = this.spots[i + 1]?.z ?? zB;
      const seg = pts.filter(([, z]) => z >= s.z - 6 && z <= z1);
      if (seg.length < 2) return;
      stripes += `<path d="${seg.map(([x, z], j) => `${j ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(z).toFixed(1)}`).join(' ')}" fill="none" stroke="${DIFF[s.diff]}" stroke-width="3" stroke-linecap="round" opacity=".55" stroke-dasharray="1 7"/>`;
    });
    const pins = this.spots.map((s, i) => {
      const [x, y] = P(s.dx * (park ? 1 : 0.25), s.z);
      let right = park ? s.dx >= 0 : i % 2 === 0;
      // (kept on the map: flipped to the other side if it would run off the edge)
      const tw = s.name.length * 9 + 8;
      if (!right && x - 20 - tw < 4) right = true; else if (right && x + 20 + tw > W - 4) right = false;
      const lx = x + (right ? 20 : -20);
      return `<g class="pin" data-i="${i}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle class="ring" r="15"/><circle class="dot" r="11"/><text class="num" y="4">${i + 1}</text></g>
        <text class="lab" data-i="${i}" x="${lx.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${right ? 'start' : 'end'}">${s.name}</text>`;
    }).join('');
    $('dr-svg').setAttribute('viewBox', `0 0 ${W} ${H}`);
    $('dr-svg').innerHTML = `<defs><linearGradient id="dr-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfdcf0"/><stop offset=".35" stop-color="#e9f0f9"/><stop offset="1" stop-color="#f7fafe"/></linearGradient></defs>
      <rect width="${W}" height="${H}" rx="22" fill="url(#dr-sky)"/>
      ${trees}
      <path d="${d}" fill="none" stroke="#2a7de1" stroke-width="${pw + 6}" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>
      <path d="${d}" fill="none" stroke="#ffffff" stroke-width="${pw}" stroke-linecap="round" stroke-linejoin="round"/>
      ${stripes}${feats}
      <g transform="translate(${P(0, zB)[0].toFixed(1)} ${P(0, zB)[1].toFixed(1)})"><rect x="-1.2" y="-26" width="2.4" height="26" fill="#2b3a52"/><path d="M1.2 -26 h14 l-3.5 4.5 l3.5 4.5 h-14 z" fill="#ff8a3d"/></g>
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
