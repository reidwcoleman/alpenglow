// The front page: tabs for Ride, Leaderboard, Locker, Shop, Pass, Replays, Tricks and
// Updates, the rider sticker with its lift pass, and the little panels behind the top
// buttons. Game state stays in main.js / meta.js; this draws it and passes clicks back.
import { ITEMS, ITEM, CATS, RARITY, LEVELS, LEVEL_XP, SEASON, RIVALS, store } from './meta.js';
import { listRuns, getRun, keepRun, deleteRun } from './vault.js';
import { MAPS, MAP_IDS } from './maps.js';
import { PARK_ID } from './course.js';
import { Preview } from './preview.js';

const $ = (id) => document.getElementById(id);
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const FLAKE = '<svg class="flake" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 1v14M1.9 4.5l12.2 7M1.9 11.5l12.2-7M6 2.6 8 4.4l2-1.8M6 13.4l2-1.8 2 1.8"/></svg>';
const MEDAL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 1v14M1.9 4.5l12.2 7M1.9 11.5l12.2-7M6 2.6 8 4.4l2-1.8M6 13.4l2-1.8 2 1.8"/></svg>';

// ---------------------------------------------------------------- item pictures
let uid = 0;
export function itemIcon(it) {
  const id = 'ic' + uid++;
  const a = hex(it.c), b = hex(it.c2 ?? it.c);
  const dark = '#1b1d22';
  // the print laid over a garment's outline
  const print = (clip) => {
    if (!it.pat) return '';
    if (it.pat === 1) return `<rect x="0" y="46" width="100" height="14" fill="${b}" clip-path="url(#${clip})"/>`;
    if (it.pat === 2) return `<g clip-path="url(#${clip})" fill="${b}">${[[30, 30, 9], [62, 40, 11], [44, 62, 10], [70, 74, 8], [26, 78, 9], [52, 24, 6]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r * 1.4}" ry="${r}" transform="rotate(${x} ${x} ${y})"/>`).join('')}</g>`;
    if (it.pat === 3) return `<g clip-path="url(#${clip})" fill="${b}" opacity=".6">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<rect x="${i * 12}" y="0" width="5" height="100"/><rect x="0" y="${i * 12}" width="100" height="5"/>`).join('')}</g>`;
    if (it.pat === 5) return '';
    return '';
  };
  const fill = it.pat === 5 ? `url(#${id}g)` : a;
  const grad = it.pat === 5 ? `<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>` : '';
  const S = (inner) => `<svg viewBox="0 0 100 100"><defs>${grad}</defs>${inner}</svg>`;
  switch (it.cat) {
    case 'jacket': {
      const body = 'M31 20 L43 14 Q50 22 57 14 L69 20 L90 42 L80 54 L72 46 L72 90 L28 90 L28 46 L20 54 L10 42 Z';
      const sleeves = it.pat === 4 ? `<path d="M31 20 L10 42 L20 54 L28 46 Z M69 20 L90 42 L80 54 L72 46 Z" fill="${b}"/>` : '';
      return S(`<clipPath id="${id}"><path d="${body}"/></clipPath><path d="${body}" fill="${fill}" stroke="${dark}" stroke-width="3" stroke-linejoin="round"/>${print(id)}${sleeves}<path d="M50 22 V88" stroke="${dark}" stroke-width="2" opacity=".5"/><path d="${body}" fill="none" stroke="${dark}" stroke-width="3" stroke-linejoin="round"/>`);
    }
    case 'pants': {
      const p = 'M28 10 H72 L78 92 H57 L50 38 L43 92 H22 Z';
      return S(`<clipPath id="${id}"><path d="${p}"/></clipPath><path d="${p}" fill="${fill}"/>${print(id)}<path d="${p}" fill="none" stroke="${dark}" stroke-width="3" stroke-linejoin="round"/><path d="M28 18 H72" stroke="${dark}" stroke-width="2" opacity=".5"/>`);
    }
    case 'skis':
      return S(`<g transform="rotate(-10 50 50)"><rect x="32" y="6" width="13" height="88" rx="6.5" fill="${a}" stroke="${dark}" stroke-width="3"/><rect x="34" y="44" width="9" height="14" rx="2" fill="${dark}"/></g><g transform="rotate(10 50 50)"><rect x="55" y="6" width="13" height="88" rx="6.5" fill="${a}" stroke="${dark}" stroke-width="3"/><rect x="57" y="44" width="9" height="14" rx="2" fill="${dark}"/></g>`);
    case 'deck':
      return S(`<g transform="rotate(-18 50 50)"><rect x="36" y="3" width="28" height="94" rx="14" fill="${a}" stroke="${dark}" stroke-width="3"/><rect x="38" y="27" width="24" height="9" rx="2" fill="${dark}"/><rect x="38" y="63" width="24" height="9" rx="2" fill="${dark}"/><path d="M50 10 V20 M50 80 V90" stroke="${dark}" stroke-width="3" opacity=".4"/></g>`);
    case 'head':
      if (it.beanie) return S(`<path d="M20 66 Q20 18 50 18 Q80 18 80 66 Z" fill="${a}" stroke="${dark}" stroke-width="3"/><rect x="17" y="60" width="66" height="18" rx="6" fill="${a}" stroke="${dark}" stroke-width="3"/><path d="M30 26 V58 M40 22 V58 M50 20 V58 M60 22 V58 M70 26 V58" stroke="${dark}" stroke-width="1.5" opacity=".35"/>${it.pom ? `<circle cx="50" cy="15" r="9" fill="${a}" stroke="${dark}" stroke-width="3"/>` : ''}`);
      return S(`<path d="M16 68 Q16 18 50 18 Q84 18 84 68 Z" fill="${a}" stroke="${dark}" stroke-width="3"/><path d="M30 30 Q50 22 70 30" stroke="#fff" stroke-width="4" opacity=".35" fill="none"/><rect x="14" y="62" width="72" height="10" rx="5" fill="${dark}"/>`);
    case 'goggles':
      return S(`<rect x="6" y="44" width="88" height="10" rx="4" fill="${dark}"/><rect x="14" y="30" width="72" height="38" rx="18" fill="${dark}"/><rect x="19" y="35" width="62" height="28" rx="14" fill="${a}"/><path d="M26 42 Q40 36 52 40" stroke="#fff" stroke-width="4" opacity=".5" fill="none"/>`);
    case 'gloves':
      return S(`<path d="M30 92 V48 Q30 20 52 20 Q74 20 74 46 V92 Z" fill="${a}" stroke="${dark}" stroke-width="3" stroke-linejoin="round"/><path d="M30 56 Q14 50 16 36 Q18 28 28 34" fill="${a}" stroke="${dark}" stroke-width="3"/><rect x="28" y="76" width="48" height="16" fill="${dark}" opacity=".35"/>`);
  }
  return S('');
}

function shortDate(t) { const d = new Date(t); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }).toUpperCase(); }
function clock(s) { const m = Math.floor(s / 60); return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

const NOTES = [
  { d: '17 OCT', t: 'The front page', p: 'A new home for the mountain: a Season Pass with 100 levels, an Item Shop and a Locker to dress your rider, flakes for every run, a daily challenge, leaderboards for every park and your last five runs saved to watch again.', tags: ['SEASON PASS', 'SHOP', 'LOCKER', 'REPLAYS'] },
  { d: '17 OCT', t: 'Snowboards for everyone', p: 'Pick SNOWBOARD and ride sideways: FS and BS spins, cabs, wildcats, indy, melon, method and stalefish. Six grabs a side, shiftys, butters to 540, rail presses, and a landing assist that finishes the closest clean rotation.', tags: ['SNOWBOARDS', 'TRICKS', 'TRICK BOOK'] },
  { d: '17 OCT', t: 'Four parks and night riding', p: 'The Yard, Trick Zone, Forest Line and Big Air, each by day or under the floodlights. Multiplayer rooms, replays with five cameras and clips you can save.', tags: ['PARKS', 'NIGHT', 'MULTIPLAYER'] },
  { d: '17 OCT', t: 'Corks and lines', p: 'Corks, bios, rodeos and mistys, grabs, rails with swaps, butters, perfect pops and stomped landings. Every feature in a row builds the line, land it to bank it.', tags: ['TRICKS', 'SCORING'] },
];

export class Menu {
  constructor(game) {
    this.g = game;
    this.meta = game.meta;
    this.tab = 'ride';
    this.lbPark = PARK_ID;
    this.cat = 'jacket';
    this.preview = null;
    try { this.preview = new Preview(); } catch (e) { console.warn('preview', e); }
    for (const t of document.querySelectorAll('#tabs button')) t.onclick = () => this.setTab(t.dataset.tab);
    $('ib-board').onclick = () => this.setTab('board');
    $('ib-mp').onclick = () => { this.setTab('ride'); game.setWho('multi'); setTimeout(() => $('mp-room').focus(), 0); };
    $('ib-menu').onclick = () => this.panel('settings', true);
    $('s-close').onclick = () => this.panel('settings', false);
    $('s-how').onclick = () => { this.panel('settings', false); this.panel('howto', true); };
    $('h-close').onclick = () => this.panel('howto', false);
    $('c-close').onclick = () => this.panel('credits', false);
    $('f-how').onclick = () => this.panel('howto', true);
    $('f-updates').onclick = () => this.setTab('updates');
    $('f-credits').onclick = () => this.panel('credits', true);
    $('c-pass').onclick = () => this.setTab('pass');
    $('c-daily').onclick = () => this.setTab('tricks');
    $('gearflip').onclick = () => game.setGear(game.gear === 'ski' ? 'board' : 'ski');
    for (const b of document.querySelectorAll('#lk-gear button')) b.onclick = () => game.setGear(b.dataset.g);
    for (const b of document.querySelectorAll('#snd button')) b.onclick = () => { game.setMuted(b.dataset.m === '1'); this.sound(); };
    this.sound();
    this.code();
    this.meta.onChange(() => this.refresh());
    setInterval(() => { if (!$('menu').classList.contains('hidden')) this.daily(); }, 30000);
    this.refresh();
  }

  panel(id, on) { $(id).classList.toggle('hidden', !on); }
  get settingsOpen() { return !$('settings').classList.contains('hidden'); }

  sound() { for (const b of document.querySelectorAll('#snd button')) b.classList.toggle('on', (b.dataset.m === '1') === !!this.g.audio?.muted); }

  setTab(k) {
    this.tab = k;
    for (const t of document.querySelectorAll('#tabs button')) t.classList.toggle('on', t.dataset.tab === k);
    for (const s of document.querySelectorAll('#menu .tab')) s.classList.toggle('hidden', s.id !== 'tab-' + k);
    $('menu').classList.toggle('deep', k !== 'ride');
    if (k === 'updates') { store.set('seenNotes', NOTES.length); document.querySelector('#tabs .new')?.remove(); }
    this.refresh();
  }

  // everything on screen for the current tab
  refresh() {
    $('flakes').textContent = this.meta.flakes.toLocaleString();
    const g = this.g;
    for (const s of document.querySelectorAll('#gearflip span')) s.classList.toggle('on', s.dataset.g === g.gear);
    for (const b of document.querySelectorAll('#lk-gear button')) b.classList.toggle('on', b.dataset.g === g.gear);
    if (this.preview) this.preview.setOutfit(g.outfit());
    const t = this.tab;
    if (t === 'ride') this.ride();
    else if (t === 'board') this.board();
    else if (t === 'locker') this.locker();
    else if (t === 'shop') this.shop();
    else if (t === 'pass') this.pass();
    else if (t === 'replays') this.replays();
    else if (t === 'tricks') g.showBook();
    else if (t === 'updates') this.notes();
    if (store.get('seenNotes', '0') >= String(NOTES.length)) document.querySelector('#tabs .new')?.remove();
  }

  render(dt) {
    if (!this.preview) return;
    if (this.tab === 'ride') this.preview.mount($('stick'), { spin: 0.35, zoom: 1 });
    else if (this.tab === 'locker') this.preview.mount($('turn'), { spin: 0, zoom: 1.05 });
    this.preview.render(dt);
  }

  // ---------------------------------------------- ride
  ride() {
    const m = this.meta;
    $('cp-lvl').textContent = m.level;
    $('cp-bar').style.width = (m.levelFrac * 100).toFixed(1) + '%';
    $('cp-sub').textContent = m.level >= LEVELS ? 'Pass complete' : `${LEVEL_XP - (m.xp % LEVEL_XP)} XP to tier ${m.level + 1}`;
    $('tk-lvl').textContent = m.level;
    this.daily();
  }

  daily() {
    const d = this.meta.daily();
    const left = new Date(); left.setHours(24, 0, 0, 0);
    const ms = left - Date.now(), h = Math.floor(ms / 36e5), mn = Math.floor((ms % 36e5) / 6e4);
    $('cd-name').textContent = d.name;
    $('cd-when').textContent = d.done ? 'DAILY CHALLENGE · DONE' : `DAILY CHALLENGE · ENDS IN ${h ? h + 'H ' : ''}${mn}M`;
    $('cd-tag').innerHTML = d.done ? '✓ DONE' : `+${d.reward} FLAKES`;
    $('c-daily').classList.toggle('done', d.done);
  }

  // a lift-pass barcode from the rider id
  code() {
    let h = 7;
    for (const ch of this.g.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    let x = 0, out = '';
    while (x < 60) { const w = 1 + (h % 3); h = (h * 1103515245 + 12345) >>> 0; if (h % 5 > 1) out += `<rect x="${x}" y="0" width="${w}" height="36" fill="#10141c"/>`; x += w + 1; }
    $('tk-code').innerHTML = out;
  }

  // ---------------------------------------------- leaderboard
  async board() {
    const park = this.lbPark;
    $('lb-parks').innerHTML = MAP_IDS.map((id) => `<button data-p="${id}" class="${id === park ? 'on' : ''}">${MAPS[id].name.toUpperCase()}</button>`).join('');
    for (const b of document.querySelectorAll('#lb-parks button')) b.onclick = () => { this.lbPark = b.dataset.p; this.board(); };
    const saved = new Set((await listRuns()).map((r) => r.id));
    const mine = this.meta.runs(park).map((r) => ({ ...r, me: true, name: this.g.nick }));
    const rows = [...mine, ...(RIVALS[park] ?? []).map(([name, score]) => ({ name, score, cpu: true }))].sort((a, b) => b.score - a.score);
    const watch = (r) => (r.me && r.rid && saved.has(r.rid) ? `<button class="watch" data-rid="${r.rid}" data-park="${park}">▶ WATCH</button>` : '');
    const pod = (r, i) => !r ? '' : `<div class="pod p${i + 1}"><span class="pl">${['1ST', '2ND', '3RD'][i]}</span><div class="medal">${MEDAL}</div>
      <div class="nm">${esc(r.name)}${r.cpu ? '<span class="cpu">CPU</span>' : ''}</div><div class="sc">${r.score.toLocaleString()}</div>
      <div class="ex">${r.me ? `${shortDate(r.date)} · ${r.gear === 'board' ? 'BOARD' : 'SKIS'}${r.time ? ' · ' + clock(r.time) : ''}` : 'LOCAL RIDER'}</div>${watch(r)}</div>`;
    $('lb-pod').innerHTML = [pod(rows[1], 1), pod(rows[0], 0), pod(rows[2], 2)].join('');
    $('lb-list').innerHTML = rows.slice(3, 16).map((r, i) => `<div class="lrow${r.me ? ' me' : ''}"><span class="n">${i + 4}</span><span>${esc(r.name)}${r.cpu ? '<span class="cpu">CPU</span>' : ''}</span>
      <span class="x">${r.me ? (r.gear === 'board' ? 'BOARD' : 'SKIS') + (r.time ? ' · ' + clock(r.time) : '') : ''}</span><span class="s">${r.score.toLocaleString()}</span><span>${watch(r)}</span></div>`).join('')
      || (mine.length ? '' : '<div class="empty"><b>No runs here yet</b>Finish a run on this park to get on the board.</div>');
    for (const b of document.querySelectorAll('#tab-board .watch')) b.onclick = () => this.watch(b.dataset.rid, b.dataset.park);
  }

  // ---------------------------------------------- locker
  locker() {
    const m = this.meta, g = this.g;
    const cats = CATS.filter(([c]) => (g.gear === 'board' ? c !== 'skis' : c !== 'deck'));
    if (!cats.some(([c]) => c === this.cat)) this.cat = 'jacket';
    $('lk-cats').innerHTML = cats.map(([c, n]) => `<button data-c="${c}" class="${c === this.cat ? 'on' : ''}">${n.toUpperCase()}</button>`).join('');
    for (const b of document.querySelectorAll('#lk-cats button')) b.onclick = () => { this.cat = b.dataset.c; this.locker(); };
    const list = ITEMS.filter((it) => it.cat === this.cat).sort((a, b) => (m.owned.has(b.id) - m.owned.has(a.id)) || 0);
    $('lk-items').innerHTML = list.map((it) => this.card(it, 'locker')).join('');
    for (const b of document.querySelectorAll('#lk-items .item')) b.onclick = () => this.pick(b.dataset.id, 'locker');
  }

  card(it, where) {
    const m = this.meta, own = m.owned.has(it.id), on = m.kit[it.cat] === it.id;
    const price = !own && it.r !== 'pass' ? `<span class="pr">${FLAKE}${it.price.toLocaleString()}</span>` : !own && it.r === 'pass' ? `<span class="pr">TIER ${it.level}</span>` : '';
    const tag = on ? '<span class="ow">WEARING</span>' : own && where === 'shop' ? '<span class="ow">OWNED</span>' : '';
    return `<button class="item ${it.r}${on ? ' on' : ''}${own ? '' : ' locked'}" data-id="${it.id}">${price}${tag}<div class="ic">${itemIcon(it)}</div><span class="rr">${RARITY[it.r]}</span><span class="nm">${esc(it.name)}</span></button>`;
  }

  pick(id, where) {
    const m = this.meta, it = ITEM[id];
    if (m.owned.has(id)) { m.wear(id); this.g.kitChanged(); return; }
    if (it.r === 'pass') { this.g.toast(`${esc(it.name)} unlocks at Season Pass tier ${it.level}`); return; }
    if (where === 'locker') { this.setTab('shop'); return; }
    if (m.flakes < it.price) { this.g.toast(`${FLAKE} ${(it.price - m.flakes).toLocaleString()} more flakes for ${esc(it.name)}`); return; }
    if (this.confirm !== id) { this.confirm = id; this.g.toast(`Tap again to buy ${esc(it.name)} for ${FLAKE} ${it.price.toLocaleString()}`); return; }
    this.confirm = null;
    if (m.buy(id)) { this.g.toast(`${esc(it.name)} is yours`); this.g.kitChanged(); }
  }

  // ---------------------------------------------- shop
  shop() {
    $('sh-wallet').innerHTML = `${FLAKE}${this.meta.flakes.toLocaleString()} flakes`;
    $('shop').innerHTML = CATS.map(([c, n]) => {
      const list = ITEMS.filter((it) => it.cat === c && it.r !== 'free' && it.r !== 'pass');
      return list.length ? `<div class="grp"><span>${n.toUpperCase()}</span></div><div class="items">${list.map((it) => this.card(it, 'shop')).join('')}</div>` : '';
    }).join('');
    for (const b of document.querySelectorAll('#shop .item')) b.onclick = () => this.pick(b.dataset.id, 'shop');
  }

  // ---------------------------------------------- season pass
  pass() {
    const m = this.meta, L = m.level;
    $('ps-lvl').textContent = L;
    $('ps-bar').style.width = ((L - 1 + m.levelFrac) / (LEVELS - 1) * 100).toFixed(2) + '%';
    const left = Math.max(0, LEVEL_XP * 3 - m.day.xp);
    $('ps-info').innerHTML = `${SEASON.name} · ${SEASON.sub} · ${L >= LEVELS ? 'Pass complete' : `${LEVEL_XP - (m.xp % LEVEL_XP)} XP to level ${L + 1}`}<br>
      Every run pays XP: three levels a day at full rate${left ? ` (${left} XP left today)` : ' (used today: runs give a quarter now)'}, it waits for you if you miss a day`;
    let html = '';
    for (let i = 1; i <= LEVELS; i++) {
      const r = m.reward(i), got = i <= L;
      const tile = r.item ? `<div class="rw">${itemIcon(r.item)}${got ? '<span class="ck">✓</span>' : ''}</div>` : `<div class="rw"><span class="q">${FLAKE}${r.flakes}</span>${got && i > 1 ? '<span class="ck">✓</span>' : ''}</div>`;
      html += `<div class="lv${got && i > 1 ? ' got' : ''}${i === L ? ' cur' : ''}${r.item ? ' item' : ''}"><div class="num">${i}</div>${tile}<div class="nm">${r.item ? esc(r.item.name) : 'Flakes'}</div></div>`;
    }
    const tr = $('track');
    tr.innerHTML = html;
    requestAnimationFrame(() => { const cur = tr.querySelector('.cur'); if (cur) tr.scrollLeft = cur.offsetLeft - tr.offsetLeft - 120; });
  }

  // ---------------------------------------------- replays
  async replays() {
    const list = await listRuns();
    const el = $('reps');
    if (!list.length) { el.innerHTML = '<div class="empty"><b>No replays yet</b>Your last five runs appear here. Keep one after a run to save it for good.</div>'; return; }
    el.innerHTML = list.map((r) => `<div class="rep"><div class="ttl">${esc(MAPS[r.park]?.name ?? r.park)}</div>
      <div class="meta">${r.score.toLocaleString()} pts · ${r.gear === 'board' ? 'Snowboard' : 'Skis'} · ${clock(r.time ?? 0)} · ${shortDate(r.date)}${r.best ? ' · ' + esc(r.best) : ''}</div>
      <div class="row"><button class="btn p" data-w="${r.id}" data-p="${r.park}">Watch</button><button class="btn" data-k="${r.id}" data-on="${r.keep ? 1 : 0}">${r.keep ? 'Kept ✓' : 'Keep'}</button><button class="btn" data-x="${r.id}">Delete</button></div></div>`).join('');
    for (const b of el.querySelectorAll('[data-w]')) b.onclick = () => this.watch(b.dataset.w, b.dataset.p);
    for (const b of el.querySelectorAll('[data-k]')) b.onclick = async () => { await keepRun(b.dataset.k, b.dataset.on !== '1'); this.replays(); };
    for (const b of el.querySelectorAll('[data-x]')) b.onclick = async () => { await deleteRun(b.dataset.x); this.replays(); };
  }

  // a saved run plays on its own park (another park reloads the page onto it)
  async watch(id, park) {
    if (park !== PARK_ID) { location.href = `${location.pathname}?park=${park}&watch=${encodeURIComponent(id)}`; return; }
    const run = await getRun(id);
    if (!run) { this.g.toast('That replay is gone'); return; }
    const rp = this.g.replay;
    rp.reset(); rp.load(run);
    rp.open('all');
  }

  notes() {
    $('notes').innerHTML = NOTES.map((n) => `<div class="note"><div class="d">${n.d}</div><h3>${n.t.toUpperCase()}</h3><p>${n.p}</p><div class="tags">${n.tags.map((t) => `<span>${t}</span>`).join('')}</div></div>`).join('');
  }
}
