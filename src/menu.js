// The front page: tabs for Ride, Events, Leaderboard, Locker, Shop, Pass, Replays, Trick
// School and Updates, the rider sticker with its lift pass, the account and the little
// panels behind the top buttons. Game state stays in main.js / meta.js / cloud.js; this
// draws it and passes clicks back.
import { ITEMS, ITEM, CATS, RARITY, LEVELS, LEVEL_XP, SEASON, RIVALS, SETS, store } from './meta.js';
import { EVENTS, TIERS, field, prize, MEDAL } from './events.js';
import { LESSONS, LESSON, FAMS, QUICK0, quickSpec, numSteps } from './school.js';
import { SERVERS, errText } from './cloud.js';
import { designURL } from './gear.js';
import { listRuns, getRun, keepRun, deleteRun } from './vault.js';
import { MAPS, MAP_IDS } from './maps.js';
import { PARK_ID } from './course.js';
import { Preview } from './preview.js';

const $ = (id) => document.getElementById(id);
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const FLAKE = '<svg class="flake" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 1v14M1.9 4.5l12.2 7M1.9 11.5l12.2-7M6 2.6 8 4.4l2-1.8M6 13.4l2-1.8 2 1.8"/></svg>';
const MEDAL_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 1v14M1.9 4.5l12.2 7M1.9 11.5l12.2-7M6 2.6 8 4.4l2-1.8M6 13.4l2-1.8 2 1.8"/></svg>';

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
  // a top sheet as a picture, laid on the outline
  const sheet = (w, h, x, y, rot, board) => `<g transform="rotate(${rot} 50 50)"><clipPath id="${id}s${x}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w / 2}"/></clipPath>
    <image href="${designURL(it.design, it.c, it.c2 ?? 0xffffff, board)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none" clip-path="url(#${id}s${x})"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w / 2}" fill="none" stroke="${dark}" stroke-width="3"/></g>`;
  switch (it.cat) {
    case 'rider':
      return S(`<path d="M18 96 Q20 66 50 64 Q80 66 82 96 Z" fill="#3a4252" stroke="${dark}" stroke-width="3"/><circle cx="50" cy="40" r="20" fill="${a}" stroke="${dark}" stroke-width="3"/>
        <path d="M30 38 Q30 18 50 18 Q70 18 70 38 Q60 30 50 31 Q40 30 30 38 Z" fill="${dark}" opacity=".75"/><circle cx="43" cy="42" r="2.4" fill="${dark}"/><circle cx="57" cy="42" r="2.4" fill="${dark}"/><path d="M44 50 Q50 54 56 50" stroke="${dark}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`);
    case 'poles':
      return S(`<g stroke-linecap="round"><path d="M34 8 L44 92 M66 8 L56 92" stroke="${a}" stroke-width="5"/><path d="M34 8 L36 24 M66 8 L64 24" stroke="${dark}" stroke-width="9"/>
        <ellipse cx="43" cy="82" rx="9" ry="3" fill="none" stroke="${dark}" stroke-width="3"/><ellipse cx="57" cy="82" rx="9" ry="3" fill="none" stroke="${dark}" stroke-width="3"/></g>`);
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
      if (it.design) return S(sheet(13, 88, 32, 6, -10, false) + sheet(13, 88, 55, 6, 10, false));
      return S(`<g transform="rotate(-10 50 50)"><rect x="32" y="6" width="13" height="88" rx="6.5" fill="${a}" stroke="${dark}" stroke-width="3"/><rect x="34" y="44" width="9" height="14" rx="2" fill="${dark}"/></g><g transform="rotate(10 50 50)"><rect x="55" y="6" width="13" height="88" rx="6.5" fill="${a}" stroke="${dark}" stroke-width="3"/><rect x="57" y="44" width="9" height="14" rx="2" fill="${dark}"/></g>`);
    case 'deck':
      if (it.design) return S(sheet(28, 94, 36, 3, -18, true));
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
  { d: '18 OCT', t: 'Real ski runs and a new day every drop', p: 'Three new places to ride: Timberline, 5.7 km of glades where you weave through the trees; Grand Descent, 8.5 km and 2.5 km of vertical from a north face and a glacier through a couloir, a giant bowl and treeline steeps down to the village; and Mega Park, 2.8 km with a jib garden, a two-line kicker alley up to XXL, a pipe and a step-down gap. The weather is different every time you drop in, and the snow with it: fresh powder is slow and floaty, hardpack is fast and skates out, spring slush grabs. Tricks are now on the number keys: hold one on the way up a kicker and let go right at the lip. The arrows steer, tuck and brake on the snow and spin and flip in the air. Less glare and more snow-like snow, too.', tags: ['NEW RUNS', 'MEGA PARK', 'WEATHER', 'TRICK KEYS', 'ARROWS'] },
  { d: '18 OCT', t: 'Accounts and the shared server', p: 'Every rider now has an account on the Alpenglow server. Make it yours with an email and a password and your wallet, pass, locker and trick book follow you to any device. Leaderboards are global and weekly, and every best run can be watched by anyone. Multiplayer runs on our own servers: pick one from the list, or race everyone on it.', tags: ['ACCOUNTS', 'GLOBAL BOARDS', 'SERVERS', 'SERVER RACES'] },
  { d: '18 OCT', t: 'Events, Trick School, 180 new items', p: 'Events: the Alpine Cup, the Express Sprint, a Gate Trial and four trick contests, each at Am, Pro and Legend with medals and prizes. Trick School shows every trick, step by step, with your rider doing it. Set any of them as a quick trick on keys 1 to 4 and it flies itself, sized to the jump. The shop has 180 more things to wear, outfit sets, today\'s deals, skis and boards with printed top sheets, and a whole new look for the riders: real helmets, mirrored goggles, ski boots and roomy kit.', tags: ['EVENTS', 'TRICK SCHOOL', 'QUICK TRICKS', 'SHOP', 'NEW RIDERS'] },
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
    this.lbScope = game.cloud.status === 'offline' ? 'local' : 'global';
    this.cat = 'jacket';
    this.fam = 'basics';
    this.lesson = 'mute';
    this.evTier = Number(store.get('evTier', '1')) || 0;
    this.lobby = {};
    this.preview = null;
    try { this.preview = new Preview(); } catch (e) { console.warn('preview', e); }
    for (const t of document.querySelectorAll('#tabs button')) t.onclick = () => this.setTab(t.dataset.tab);
    $('ib-board').onclick = () => this.setTab('board');
    $('ib-mp').onclick = () => { this.setTab('ride'); game.setWho('multi'); };
    $('ib-menu').onclick = () => this.panel('settings', true);
    $('ib-acct').onclick = () => { this.accMode = null; this.account(); this.panel('account', true); };
    $('acc-close').onclick = () => this.panel('account', false);
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
    setInterval(() => { if (!$('menu').classList.contains('hidden')) { this.daily(); if (this.tab === 'shop') this.shopTimer(); } }, 30000);
    // who's on each server, live
    game.cloud.watchLobby((v) => { this.lobby = v ?? {}; this.servers(); });
    this.account();
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
    this.preview?.demo(k === 'tricks' ? LESSON[this.lesson]?.demo : null);
    this.refresh();
  }

  // everything on screen for the current tab
  refresh() {
    $('flakes').textContent = this.meta.flakes.toLocaleString();
    const g = this.g;
    for (const s of document.querySelectorAll('#gearflip span')) s.classList.toggle('on', s.dataset.g === g.gear);
    for (const b of document.querySelectorAll('#lk-gear button')) b.classList.toggle('on', b.dataset.g === g.gear);
    if (this.preview) this.preview.setOutfit(g.outfit());
    this.chip();
    const t = this.tab;
    if (t === 'ride') this.ride();
    else if (t === 'events') this.events();
    else if (t === 'board') this.board();
    else if (t === 'locker') this.locker();
    else if (t === 'shop') this.shop();
    else if (t === 'pass') this.pass();
    else if (t === 'replays') this.replays();
    else if (t === 'tricks') this.school();
    else if (t === 'updates') this.notes();
    if (store.get('seenNotes', '0') >= String(NOTES.length)) document.querySelector('#tabs .new')?.remove();
  }

  render(dt) {
    if (!this.preview) return;
    if (this.tab === 'ride') this.preview.mount($('stick'), { spin: 0.35, zoom: 1 });
    else if (this.tab === 'locker') this.preview.mount($('turn'), { spin: 0, zoom: 1.05 });
    else if (this.tab === 'tricks') this.preview.mount($('demo'), { spin: 0, zoom: 1 });
    this.preview.render(dt);
  }

  // ---------------------------------------------- the account
  chip() {
    const c = this.g.cloud, nick = this.g.nick;
    $('ac-av').textContent = (nick.trim()[0] ?? 'R').toUpperCase();
    $('ac-name').textContent = nick;
    $('ac-sub').textContent = c.status === 'online' ? (c.guest ? 'GUEST · SAVE YOUR PROGRESS' : `LEVEL ${this.meta.level} · SIGNED IN`) : c.status === 'loading' ? 'CONNECTING…' : 'OFFLINE · SAVED HERE';
    $('ac-dot').classList.toggle('on', c.status === 'online');
  }

  account() {
    this.chip();
    const c = this.g.cloud, el = $('acc-body');
    if (!el) return;
    const g = this.g, m = this.meta;
    const stats = `<div class="stat3"><div><b>${m.level}</b><span>LEVEL</span></div><div><b>${m.flakes.toLocaleString()}</b><span>FLAKES</span></div><div><b>${g.book.size}</b><span>TRICKS</span></div></div>`;
    const who = `<div class="who2"><div class="av">${esc((g.nick[0] ?? 'R').toUpperCase())}</div><div><b>${esc(g.nick)}</b><small>${c.status !== 'online' ? 'Not connected: progress is kept on this device' : c.guest ? 'Guest rider · this device only' : esc(c.email)}</small></div></div>`;
    if (c.status === 'offline') { el.innerHTML = who + stats + '<p class="note2">The Alpenglow server can\'t be reached right now. You can still ride; everything is saved on this device and goes up next time you\'re online.</p>'; return; }
    if (c.status === 'loading') { el.innerHTML = who + '<p class="note2">Connecting to the Alpenglow server…</p>'; return; }
    if (!c.guest) {
      el.innerHTML = who + stats + `<p class="note2">Signed in. Your wallet, pass, locker, trick book and best runs are saved to your account and follow you to any device.</p>
        <div class="f"><label class="note2">Rider name</label><input id="acc-name" maxlength="16" value="${esc(g.nick)}" spellcheck="false" /></div><div class="msg" id="acc-msg"></div>
        <div class="row"><button class="btn" id="acc-out">Sign out</button></div>`;
      $('acc-name').onchange = async () => { await g.rename($('acc-name').value); this.account(); };
      $('acc-out').onclick = async () => { $('acc-out').disabled = true; await g.signOut(); this.account(); };
      return;
    }
    const mode = this.accMode ?? 'create';
    const form = mode === 'create'
      ? `<p class="note2">You're riding as a guest. Make an account to keep everything (and see it on any device). Your progress so far comes with you.</p>
        <div class="f"><input id="acc-n" maxlength="16" placeholder="Rider name" value="${/^Rider [A-Z0-9]{3}$/.test(g.nick) ? '' : esc(g.nick)}" spellcheck="false" /><input id="acc-e" type="email" placeholder="Email" autocomplete="email" /><input id="acc-p" type="password" placeholder="Password (6+ characters)" autocomplete="new-password" /></div>
        <div class="msg" id="acc-msg"></div>
        <div class="row"><button class="btn p" id="acc-go">Create account</button></div>
        <p class="note2" style="margin-top:10px">Already have one? <button class="lnk" id="acc-sw">Sign in</button></p>`
      : `<p class="note2">Sign in to your Alpenglow account. Anything you've earned as a guest on this device joins it.</p>
        <div class="f"><input id="acc-e" type="email" placeholder="Email" autocomplete="email" /><input id="acc-p" type="password" placeholder="Password" autocomplete="current-password" /></div>
        <div class="msg" id="acc-msg"></div>
        <div class="row"><button class="btn p" id="acc-go">Sign in</button></div>
        <p class="note2" style="margin-top:10px"><button class="lnk" id="acc-sw">Make a new account</button> · <button class="lnk" id="acc-fp">Forgot password?</button></p>`;
    el.innerHTML = who + stats + form;
    const msg = (t, ok = false) => { const m2 = $('acc-msg'); if (m2) { m2.textContent = t; m2.classList.toggle('ok', ok); } };
    $('acc-sw').onclick = () => { this.accMode = mode === 'create' ? 'signin' : 'create'; this.account(); };
    if ($('acc-fp')) $('acc-fp').onclick = async () => { const e = $('acc-e').value; if (!e) { msg('Type your email first'); return; } try { await c.resetPassword(e); msg('Password reset email sent', true); } catch (er) { msg(errText(er)); } };
    $('acc-go').onclick = async () => {
      const e = $('acc-e').value, pw = $('acc-p').value;
      if (!e || !pw) { msg('Email and password, please'); return; }
      $('acc-go').disabled = true; msg('');
      try {
        if (mode === 'create') {
          const n = $('acc-n').value.trim();
          if (n && n !== g.nick) { try { await c.claimName(n, g.nick); g.nick = n; store.set('name', n); $('mp-name').value = n; } catch (er) { msg(errText(er)); $('acc-go').disabled = false; return; } }
          await c.signUp(e, pw);
          g.cloudSave();
          this.g.toast('Account made · your progress is saved');
        } else {
          await c.signIn(e, pw);
          this.g.toast('Signed in');
        }
        this.accMode = null;
        this.account();
      } catch (er) { msg(errText(er)); $('acc-go').disabled = false; }
    };
  }

  // ---------------------------------------------- ride
  ride() {
    const m = this.meta;
    $('cp-lvl').textContent = m.level;
    $('cp-bar').style.width = (m.levelFrac * 100).toFixed(1) + '%';
    $('cp-sub').textContent = m.level >= LEVELS ? 'Pass complete' : `${LEVEL_XP - (m.xp % LEVEL_XP)} XP to tier ${m.level + 1}`;
    $('tk-lvl').textContent = m.level;
    this.daily();
    this.servers();
  }

  // the server list for this park, with who's on each
  servers() {
    const el = $('mp-servers');
    if (!el) return;
    const g = this.g, park = g.selPark, list = SERVERS[park] ?? [];
    const online = g.cloud.status === 'online';
    const cur = g.roomName;
    el.innerHTML = `<div class="h">${online ? 'SERVERS · ' + esc(MAPS[park].name.toUpperCase()) : 'ROOMS (PUBLIC RELAYS)'}</div>` + list.map((n) => {
      const k = `${park}-${n.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      const c = this.lobby[k] ?? 0;
      return `<button data-s="${esc(n)}" class="${n === cur ? 'on' : ''}"><span>${esc(n)}</span><i class="${c ? '' : 'z'}">${online ? `${c} riding` : ''}</i></button>`;
    }).join('') + (cur && !list.includes(cur) ? `<button class="on"><span>Private · ${esc(cur)}</span><i class="${this.lobby[`${park}-${cur.toLowerCase().replace(/[^a-z0-9]/g, '')}`] ? '' : 'z'}">${this.lobby[`${park}-${cur.toLowerCase().replace(/[^a-z0-9]/g, '')}`] ?? 0} riding</i></button>` : '');
    for (const b of el.querySelectorAll('[data-s]')) b.onclick = () => g.pickServer(b.dataset.s);
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

  // ---------------------------------------------- events
  events() {
    const T = this.evTier;
    $('ev-tiers').innerHTML = TIERS.map((t, i) => `<button data-t="${i}" class="${i === T ? 'on' : ''}">${t.name}</button>`).join('');
    for (const b of document.querySelectorAll('#ev-tiers button')) b.onclick = () => { this.evTier = Number(b.dataset.t); store.set('evTier', this.evTier); this.events(); };
    const BASE = import.meta.env?.BASE_URL ?? '/';
    $('events').innerHTML = EVENTS.map((ev) => {
      const med = [0, 1, 2].map((i) => this.meta.medals[ev.id + ':' + i] ?? 0);
      const goal = ev.kind === 'contest' ? `BEAT ${field(ev, T, ['x'])[0].score.toLocaleString()}` : ev.kind === 'trial' ? `GOLD ${TIERS[T].trial[0]}S` : `${ev.racers} RACERS`;
      return `<button class="ev" data-e="${ev.id}" style="background-image:url(${BASE}art/${ev.art}_s.webp)"><span class="sticker k">${ev.kind === 'contest' ? 'CONTEST' : ev.kind === 'trial' ? 'TIME TRIAL' : 'RACE'} · ${esc(MAPS[ev.park].name.toUpperCase())}</span>
        <span class="pz">${FLAKE}${prize(T, 1)}</span>
        <div class="bd"><div class="nm">${esc(ev.name)}</div><div class="ds">${esc(ev.blurb)}</div>
        <div class="md">${med.map((x, i) => `<span class="m${x}" title="${TIERS[i].name}: ${x ? MEDAL[x] : 'no medal'}"></span>`).join('')}&nbsp;${goal}</div></div></button>`;
    }).join('');
    for (const b of document.querySelectorAll('#events .ev')) b.onclick = () => this.g.startEvent(b.dataset.e, this.evTier);
  }

  // ---------------------------------------------- leaderboard
  async board() {
    const park = this.lbPark, scope = this.lbScope, c = this.g.cloud;
    const SC = [['global', 'ALL TIME'], ['week', 'THIS WEEK'], ['local', 'MY RUNS']];
    $('lb-scope').innerHTML = SC.map(([k, n]) => `<button data-k="${k}" class="${k === scope ? 'on' : ''}">${n}</button>`).join('');
    for (const b of document.querySelectorAll('#lb-scope button')) b.onclick = () => { this.lbScope = b.dataset.k; this.board(); };
    const BOARDS = [...MAP_IDS.map((id) => [id, MAPS[id].name.toUpperCase()]), ['park-yard', 'PARK LAPS'], ['race-yard', 'ALPINE CUP'], ['ev-sprint', 'EXPRESS SPRINT']];
    if (scope === 'local' && !MAP_IDS.includes(park)) this.lbPark = PARK_ID;
    $('lb-parks').innerHTML = BOARDS.filter(([id]) => scope !== 'local' || MAP_IDS.includes(id)).map(([id, n]) => `<button data-p="${id}" class="${id === this.lbPark ? 'on' : ''}">${n}</button>`).join('');
    for (const b of document.querySelectorAll('#lb-parks button')) b.onclick = () => { this.lbPark = b.dataset.p; this.board(); };
    const race = /^(race|ev)-/.test(this.lbPark);
    const boardId = MAP_IDS.includes(this.lbPark) ? `run-${this.lbPark}` : this.lbPark;
    let rows;
    if (scope === 'local') {
      $('lb-eye').textContent = 'YOUR RUNS ON THIS DEVICE · RIDERS TO CHASE';
      const saved = new Set((await listRuns()).map((r) => r.id));
      const mine = this.meta.runs(this.lbPark).map((r) => ({ ...r, me: true, name: this.g.nick, local: r.rid && saved.has(r.rid) }));
      rows = [...mine, ...(RIVALS[this.lbPark] ?? []).map(([name, score]) => ({ name, score, cpu: true }))].sort((a, b) => b.score - a.score);
    } else {
      $('lb-eye').textContent = c.status === 'online' ? `EVERY RIDER ON THE SERVER · ${scope === 'week' ? 'RESETS MONDAY' : 'ALL TIME'}` : 'THE SERVER IS OFFLINE';
      $('lb-pod').innerHTML = ''; $('lb-list').innerHTML = '<div class="empty"><b>Loading…</b></div>';
      const got = await c.top(boardId, { week: scope === 'week', race });
      if (this.tab !== 'board' || this.lbScope !== scope) return;
      if (!got) { $('lb-list').innerHTML = '<div class="empty"><b>Can\'t reach the server</b>Try again in a moment, or look at MY RUNS.</div>'; return; }
      rows = got.map((r) => ({ ...r, me: r.uid === c.uid }));
      // a quiet board still has the mountain's regulars to chase
      if (rows.length < 8 && RIVALS[this.lbPark]) rows = [...rows, ...RIVALS[this.lbPark].slice(0, 8 - rows.length).map(([name, score]) => ({ name, score, cpu: true }))].sort((a, b) => b.score - a.score);
    }
    const val = (r) => (race ? fmtT(r.time) : r.score.toLocaleString());
    const sub = (r) => [r.gear === 'board' ? 'BOARD' : r.gear ? 'SKIS' : '', r.level ? 'LV ' + r.level : '', r.date ? shortDate(r.date) : ''].filter(Boolean).join(' · ');
    const watch = (r) => (r.rid && !r.cpu && (scope !== 'local' || r.local) ? `<button class="watch" data-rid="${esc(r.rid)}" data-park="${esc(r.park ?? this.lbPark)}" data-src="${scope === 'local' ? 'local' : 'cloud'}">▶ WATCH</button>` : '');
    const pod = (r, i) => !r ? '' : `<div class="pod p${i + 1}"><span class="pl">${['1ST', '2ND', '3RD'][i]}</span><div class="medal">${MEDAL_SVG}</div>
      <div class="nm">${esc(r.name)}${r.cpu ? '<span class="cpu">CPU</span>' : ''}</div><div class="sc">${val(r)}</div>
      <div class="ex">${r.cpu ? 'LOCAL RIDER' : sub(r)}</div>${watch(r)}</div>`;
    $('lb-pod').innerHTML = [pod(rows[1], 1), pod(rows[0], 0), pod(rows[2], 2)].join('');
    $('lb-list').innerHTML = rows.slice(3, 50).map((r, i) => `<div class="lrow${r.me ? ' me' : ''}"><span class="n">${i + 4}</span><span>${esc(r.name)}${r.cpu ? '<span class="cpu">CPU</span>' : ''}</span>
      <span class="x">${r.cpu ? '' : sub(r)}</span><span class="s">${val(r)}</span><span>${watch(r)}</span></div>`).join('')
      || (rows.length ? '' : `<div class="empty"><b>Nobody here yet</b>${race ? 'Race it to set the first time.' : 'Finish a run on this park to get on the board.'}</div>`);
    for (const b of document.querySelectorAll('#tab-board .watch')) b.onclick = () => (b.dataset.src === 'local' ? this.watch(b.dataset.rid, b.dataset.park) : this.watchCloud(b.dataset.rid, b.dataset.park));
  }

  // ---------------------------------------------- locker
  locker() {
    const m = this.meta, g = this.g;
    const cats = CATS.filter(([c]) => (g.gear === 'board' ? c !== 'skis' && c !== 'poles' : c !== 'deck'));
    if (!cats.some(([c]) => c === this.cat)) this.cat = 'jacket';
    $('lk-cats').innerHTML = cats.map(([c, n]) => `<button data-c="${c}" class="${c === this.cat ? 'on' : ''}">${n.toUpperCase()}</button>`).join('');
    for (const b of document.querySelectorAll('#lk-cats button')) b.onclick = () => { this.cat = b.dataset.c; this.locker(); };
    const list = ITEMS.filter((it) => it.cat === this.cat).sort((a, b) => (m.owned.has(b.id) - m.owned.has(a.id)) || 0);
    $('lk-items').innerHTML = list.map((it) => this.card(it, 'locker')).join('');
    for (const b of document.querySelectorAll('#lk-items .item')) b.onclick = () => this.pick(b.dataset.id, 'locker');
  }

  card(it, where) {
    const m = this.meta, own = m.owned.has(it.id), on = m.kit[it.cat] === it.id;
    const p = m.price(it.id), deal = p < it.price;
    const price = !own && it.r === 'pass' ? `<span class="pr">TIER ${it.level}</span>` : !own && it.r === 'event' ? '<span class="pr">EVENT</span>' : !own ? `<span class="pr">${FLAKE}${deal ? `<s>${it.price.toLocaleString()}</s>` : ''}${p.toLocaleString()}</span>` : '';
    const tag = on ? '<span class="ow">WEARING</span>' : own && where !== 'locker' ? '<span class="ow">OWNED</span>' : deal && !own ? '<span class="off">-20%</span>' : '';
    return `<button class="item ${it.r}${on ? ' on' : ''}${own ? '' : ' locked'}" data-id="${it.id}">${price}${tag}<div class="ic">${itemIcon(it)}</div><span class="rr">${RARITY[it.r]}</span><span class="nm">${esc(it.name)}</span></button>`;
  }

  pick(id, where) {
    const m = this.meta, it = ITEM[id];
    if (m.owned.has(id)) { m.wear(id); this.g.kitChanged(); return; }
    if (it.r === 'pass') { this.g.toast(`${esc(it.name)} unlocks at Season Pass tier ${it.level}`); return; }
    if (it.r === 'event') { this.g.toast(`${esc(it.name)}: ${esc(it.how)}`); return; }
    if (where === 'locker') { this.setTab('shop'); return; }
    const p = m.price(id);
    if (m.flakes < p) { this.g.toast(`${FLAKE} ${(p - m.flakes).toLocaleString()} more flakes for ${esc(it.name)}`); return; }
    if (this.confirm !== id) { this.confirm = id; this.g.toast(`Tap again to buy ${esc(it.name)} for ${FLAKE} ${p.toLocaleString()}`); return; }
    this.confirm = null;
    if (m.buy(id)) { this.g.toast(`${esc(it.name)} is yours`); this.g.kitChanged(); }
  }

  // ---------------------------------------------- shop
  shopTimer() {
    const el = $('sh-timer');
    if (!el) return;
    const ms = 864e5 - (Date.now() % 864e5), h = Math.floor(ms / 36e5), mn = Math.floor((ms % 36e5) / 6e4);
    el.textContent = `NEW DEALS IN ${h}H ${mn}M`;
  }

  shop() {
    const m = this.meta;
    $('sh-wallet').innerHTML = `${FLAKE}${m.flakes.toLocaleString()} flakes`;
    const feat = m.featured().map((id) => ITEM[id]);
    const sets = SETS.map((st) => {
      const p = m.setPrice(st), full = st.items.reduce((a, id) => a + ITEM[id].price, 0);
      return `<button class="set${p ? '' : ' own'}" data-set="${st.id}"><div class="nm">${esc(st.name)}</div><div class="row4">${st.items.map((id) => `<div title="${esc(ITEM[id].name)}">${itemIcon(ITEM[id])}</div>`).join('')}</div>
        ${p ? `<span class="pr">${FLAKE}<s>${full.toLocaleString()}</s>${p.toLocaleString()}</span>` : '<span class="pr">ALL OWNED</span>'}</button>`;
    }).join('');
    $('shop').innerHTML = `<div class="grp"><span>TODAY'S DEALS · 20% OFF</span></div><div class="timer" id="sh-timer"></div><div class="items feat">${feat.map((it) => this.card(it, 'shop')).join('')}</div>
      <div class="grp"><span>OUTFIT SETS · 30% OFF</span></div><div class="sets">${sets}</div>` +
      CATS.map(([c, n]) => {
        const list = ITEMS.filter((it) => it.cat === c && it.price > 0 && !['free', 'pass', 'event'].includes(it.r));
        return list.length ? `<div class="grp"><span>${n.toUpperCase()}</span></div><div class="items">${list.map((it) => this.card(it, 'shop')).join('')}</div>` : '';
      }).join('');
    this.shopTimer();
    for (const b of document.querySelectorAll('#shop .item')) b.onclick = () => this.pick(b.dataset.id, 'shop');
    for (const b of document.querySelectorAll('#shop .set')) b.onclick = () => {
      const st = SETS.find((x) => x.id === b.dataset.set), p = m.setPrice(st);
      if (!p) { for (const id of st.items) m.kit[ITEM[id].cat] = id; m.save(); m.changed(); this.g.kitChanged(); return; }
      if (m.flakes < p) { this.g.toast(`${FLAKE} ${(p - m.flakes).toLocaleString()} more flakes for the ${esc(st.name)} set`); return; }
      if (this.confirm !== st.id) { this.confirm = st.id; this.g.toast(`Tap again to buy the ${esc(st.name)} set for ${FLAKE} ${p.toLocaleString()}`); return; }
      this.confirm = null;
      if (m.buySet(st)) { this.g.toast(`The ${esc(st.name)} set is yours`); this.g.kitChanged(); }
    };
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

  // a run from the global boards, off the server
  async watchCloud(rid, park) {
    if (park && park !== PARK_ID && MAPS[park]) { location.href = `${location.pathname}?park=${park}&cwatch=${encodeURIComponent(rid)}`; return; }
    this.g.toast('Loading the run…', 1500);
    const run = await this.g.cloud.replay(rid);
    if (!run) { this.g.toast('That replay is not on the server'); return; }
    const rp = this.g.replay;
    rp.reset(); rp.load({ frames: run.frames, times: run.times, marks: [], outfit: run.outfit ?? this.g.outfit() });
    if (!rp.open('all')) this.g.toast('That replay is too short to watch');
  }

  // ---------------------------------------------- trick school
  school() {
    const g = this.g, B = g.gear === 'board';
    const has = (re) => [...g.book].some((n) => re.test(n));
    $('sc-fams').innerHTML = FAMS.map(([k, n]) => `<button data-f="${k}" class="${k === this.fam ? 'on' : ''}">${n.toUpperCase()}</button>`).join('');
    for (const b of document.querySelectorAll('#sc-fams button')) b.onclick = () => { this.fam = b.dataset.f; const first = LESSONS.find((l) => l.fam === this.fam); if (first) this.lesson = first.id; this.preview?.demo(LESSON[this.lesson].demo); this.school(); };
    const done = LESSONS.filter((l) => has(l.re)).length;
    $('book-n').textContent = `${done}/${LESSONS.length}`;
    $('lessons').innerHTML = LESSONS.filter((l) => l.fam === this.fam).map((l) => {
      const ok = has(l.re);
      return `<button class="lesson${ok ? ' got' : ''}${l.id === this.lesson ? ' on' : ''}" data-l="${l.id}"><span class="st">${ok ? 'LANDED' : `+${l.reward}`}</span><b>${esc(B ? l.board : l.name)}</b>
        <span class="lvl">${[1, 2, 3, 4].map((i) => `<i class="${i <= l.lvl ? 'f' : ''}"></i>`).join('')}</span><small>${l.where === 'rails' ? 'Rails' : l.where === 'any' ? 'Anywhere' : 'Kickers'}</small></button>`;
    }).join('');
    for (const b of document.querySelectorAll('#lessons .lesson')) b.onclick = () => { this.lesson = b.dataset.l; this.preview?.demo(LESSON[this.lesson].demo); this.school(); };
    const l = LESSON[this.lesson] ?? LESSONS[0];
    const ok = has(l.re);
    const slots = g.quickSlots();
    const canQuick = !!quickSpec(l.id);
    const slot = slots.indexOf(l.id);
    const where = l.where === 'rails' ? 'a rail' : l.lvl >= 4 ? 'the biggest kicker you can find (XL, Big Air)' : l.lvl >= 3 ? 'a large kicker' : 'any kicker';
    const num = numSteps(l, slot >= 0 ? slot + 1 : null, where);
    const handHead = num ? `<div class="lv2" style="margin-top:12px">BY HAND${l.classic ? ' · CLASSIC KEYS (MENU › CONTROLS)' : ''}</div>` : '';
    $('howbox').innerHTML = `<div class="lv2">${FAMS.find(([k]) => k === l.fam)?.[1].toUpperCase() ?? ''} LEVEL ${l.lvl} · ${ok ? 'LANDED ✓' : `FIRST LANDING PAYS ${l.reward} FLAKES`}</div><h3>${esc(B ? l.board : l.name)}</h3>
      ${num ? `<div class="lv2" style="margin-top:8px">WITH A TRICK KEY</div><ol>${num.map((st) => `<li><span>${st}</span></li>`).join('')}</ol>` : ''}
      ${handHead}<ol>${l.steps.map((st) => `<li><span>${st}</span></li>`).join('')}</ol><div class="tip">${esc(l.tip)}</div>
      <div class="row"><button class="btn p" id="sc-try">Try it ↗</button></div>
      ${canQuick ? `<div class="lv2" style="margin-top:12px">PUT IT ON A KEY</div><div class="keyrow">${slots.map((id, i) => `<button class="${id === l.id ? 'on' : ''}" data-q="${i}" title="Key ${i + 1}: ${esc(LESSON[id] ? (B ? LESSON[id].board : LESSON[id].name) : '—')}"><b>${i + 1}</b><small>${esc(LESSON[id] ? (B ? LESSON[id].board : LESSON[id].name) : '—')}</small></button>`).join('')}</div>` : ''}`;
    $('demo').innerHTML = `<div class="cap">${esc(B ? l.board : l.name)}</div>`;
    $('sc-try').onclick = () => g.tryLesson(l.id);
    for (const b of document.querySelectorAll('#howbox [data-q]')) b.onclick = () => { g.setQuick(Number(b.dataset.q), l.id); this.school(); g.toast(`${esc(B ? l.board : l.name)} is on key ${Number(b.dataset.q) + 1}`); };
  }

  notes() {
    $('notes').innerHTML = NOTES.map((n) => `<div class="note"><div class="d">${n.d}</div><h3>${n.t.toUpperCase()}</h3><p>${n.p}</p><div class="tags">${n.tags.map((t) => `<span>${t}</span>`).join('')}</div></div>`).join('');
  }
}

const fmtT = (t) => { if (t == null) return '—'; const m = Math.floor(t / 60); return `${m}:${(t % 60).toFixed(2).padStart(5, '0')}`; };
