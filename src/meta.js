// Everything that lives between runs: the wallet (flakes), XP and the 100-level season
// pass, the item catalogue (locker + shop), the kit you wear, the daily challenge and the
// best runs per park. All of it is kept in this browser's localStorage.
export const store = {
  get(k, d) { try { const v = localStorage.getItem('alpenglow.' + k); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('alpenglow.' + k, v); } catch { /* private mode */ } },
  json(k, d) { try { const v = localStorage.getItem('alpenglow.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  put(k, v) { this.set(k, JSON.stringify(v)); },
};

export const LEVEL_XP = 400;
export const LEVELS = 100;
export const SEASON = { name: 'Season 01', sub: 'Snowboards for everyone', ends: '2026-12-01' };

// ---------------------------------------------------------------- items
// cat: jacket, pants, head, goggles, skis, deck, gloves
// pat (jackets and pants): 0 solid, 1 chest band, 2 camo, 3 tartan, 4 colour-block sleeves, 5 fade
const I = (id, cat, name, r, price, c, c2 = null, pat = 0, extra = {}) => ({ id, cat, name, r, price, c, c2, pat, ...extra });
export const ITEMS = [
  // free starters
  I('j-ember', 'jacket', 'Ember', 'free', 0, 0xff6a2b), I('j-crimson', 'jacket', 'Crimson', 'free', 0, 0xd8342c),
  I('j-mustard', 'jacket', 'Mustard', 'free', 0, 0xf2b705), I('j-glacier', 'jacket', 'Glacier', 'free', 0, 0x2a7de1),
  I('j-pine', 'jacket', 'Pine', 'free', 0, 0x18a868), I('j-violet', 'jacket', 'Violet', 'free', 0, 0x8e3fd1),
  I('j-flamingo', 'jacket', 'Flamingo', 'free', 0, 0xff4f8b), I('j-chalk', 'jacket', 'Chalk', 'free', 0, 0xf4f4f4),
  I('p-coal', 'pants', 'Coal', 'free', 0, 0x1b1d24), I('p-navy', 'pants', 'Navy', 'free', 0, 0x1f2f4a), I('p-stone', 'pants', 'Stone', 'free', 0, 0x8a8478),
  I('h-white', 'head', 'White Lid', 'free', 0, 0xf4f4f4, null, 0, { helmet: true }), I('h-black', 'head', 'Black Lid', 'free', 0, 0x15161a, null, 0, { helmet: true }),
  I('h-red', 'head', 'Red Lid', 'free', 0, 0xd8342c, null, 0, { helmet: true }),
  I('g-amber', 'goggles', 'Amber', 'free', 0, 0xff8a1e), I('g-sky', 'goggles', 'Sky', 'free', 0, 0x2aa8ff),
  I('s-white', 'skis', 'Whiteout', 'free', 0, 0xffffff), I('s-black', 'skis', 'Blackout', 'free', 0, 0x111111), I('s-red', 'skis', 'Race Red', 'free', 0, 0xe63946),
  I('d-white', 'deck', 'Blank', 'free', 0, 0xffffff), I('d-black', 'deck', 'Shadow', 'free', 0, 0x111111),
  I('gl-black', 'gloves', 'Black', 'free', 0, 0x15161a),
  // the shop
  I('j-teal-band', 'jacket', 'Lift Op', 'epic', 800, 0x22b8c4, 0x1d1f26, 1), I('j-storm', 'jacket', 'Storm Shell', 'legendary', 1200, 0x2c3140, 0xff6a2b, 4),
  I('j-camo', 'jacket', 'Snow Camo', 'epic', 1000, 0xe8e8ea, 0x8a96a8, 2), I('j-tartan', 'jacket', 'Lumber', 'legendary', 1000, 0xc23b2f, 0x1d1f26, 3),
  I('j-sunset', 'jacket', 'Sunset Fade', 'legendary', 1200, 0xffb02e, 0xff3d7f, 5), I('j-sage', 'jacket', 'Sage Hoodie', 'rare', 200, 0x9bb59a),
  I('j-lilac', 'jacket', 'Lilac', 'rare', 200, 0xb39ddb), I('j-block', 'jacket', 'Retro Block', 'epic', 800, 0xf4f1e8, 0x2a7de1, 4),
  I('p-olive', 'pants', 'Olive Groove', 'rare', 200, 0x5d6b3a), I('p-cargo', 'pants', 'Blackout Cargo', 'epic', 800, 0x111214),
  I('p-tartan', 'pants', 'Tartan 06', 'legendary', 1000, 0x2c4a3a, 0xc23b2f, 3), I('p-camo', 'pants', 'Woodland', 'epic', 800, 0x5a6646, 0x2e2a20, 2),
  I('p-white', 'pants', 'Bright White', 'rare', 200, 0xe9e9e9), I('p-knee', 'pants', 'Double Knee', 'epic', 800, 0x8a6a46, 0x3a2c20, 5),
  I('h-beanie-red', 'head', 'Red Beanie', 'rare', 200, 0xd8342c, null, 0, { beanie: true, pom: true }),
  I('h-beanie-moss', 'head', 'Moss Beanie', 'rare', 200, 0x7a9a3a, null, 0, { beanie: true }),
  I('h-beanie-black', 'head', 'Night Beanie', 'epic', 600, 0x1d1f26, null, 0, { beanie: true, pom: true }),
  I('h-gold', 'head', 'Gold Lid', 'legendary', 1000, 0xd9a520, null, 0, { helmet: true }),
  I('g-violet', 'goggles', 'Violet Haze', 'rare', 200, 0xc23bff), I('g-mint', 'goggles', 'Mint', 'rare', 200, 0x22e0a0),
  I('g-gold', 'goggles', 'Gold Chrome', 'epic', 600, 0xffd21e), I('g-fire', 'goggles', 'Fire', 'epic', 600, 0xff3e3e),
  I('s-lime', 'skis', 'Lime Pipe', 'epic', 800, 0xa6e22e), I('s-print', 'skis', 'Fingerprint', 'legendary', 1000, 0xf4a261),
  I('s-purple', 'skis', 'Send It', 'epic', 800, 0x8338ec), I('s-ice', 'skis', 'Nordlys', 'rare', 600, 0x7fd3ff),
  I('d-moon', 'deck', 'Moon Ritual', 'legendary', 1000, 0x3a86ff), I('d-slush', 'deck', 'Slush', 'rare', 600, 0x9be7d8),
  I('d-after', 'deck', 'Afterimage', 'epic', 800, 0xff7a1a), I('d-acid', 'deck', 'Acid', 'epic', 800, 0xc6f432),
  I('gl-orange', 'gloves', 'Hunter', 'rare', 200, 0xff6a2b), I('gl-tan', 'gloves', 'Work Leather', 'rare', 200, 0x9a6a3a),
];
// pass exclusives: one every fifth level
const PASS_DEFS = [
  ['jacket', 'Peak Band', 0x1d1f26, 0xffd36b, 1], ['goggles', 'Rose Gold', 0xff8fa3], ['pants', 'Glacier Fade', 0x2a7de1, 0xe8e8ea, 5],
  ['head', 'Pom Pom', 0xff4f8b, null, 0, { beanie: true, pom: true }], ['skis', 'Alpenglow', 0xff6f61], ['deck', 'Night Shift', 0x1d1f26],
  ['jacket', 'Ice Camo', 0x9fd3ff, 0x3a5f8a, 2], ['gloves', 'Neon', 0xc6f432], ['pants', 'Red Plaid', 0xc23b2f, 0x111111, 3],
  ['jacket', 'Dusk Fade', 0x5b4bd8, 0xff8a3d, 5], ['head', 'Chrome Lid', 0xc9ced6, null, 0, { helmet: true }], ['skis', 'Ghost', 0xe8f0ff],
  ['deck', 'Lava', 0xff3d1f], ['jacket', 'Patrol', 0xd8342c, 0xf4f4f4, 4], ['goggles', 'Black Ice', 0x22262e], ['pants', 'Sand Camo', 0xc8b48a, 0x7a6a4a, 2],
  ['head', 'Tiger Beanie', 0xff8a1e, null, 0, { beanie: true }], ['deck', 'Aurora', 0x22e0a0], ['skis', 'Gold Rush', 0xffd21e], ['jacket', 'Alpenglow Pro', 0xff6f61, 0xffd36b, 1],
];
PASS_DEFS.forEach(([cat, name, c, c2 = null, pat = 0, extra = {}], i) => ITEMS.push(I('pass-' + (i + 1), cat, name, 'pass', 0, c, c2, pat, { ...extra, level: (i + 1) * 5 })));
for (const it of ITEMS) if (it.cat === 'head' && !it.beanie) it.helmet = true;
export const ITEM = Object.fromEntries(ITEMS.map((x) => [x.id, x]));
export const CATS = [['jacket', 'Jackets'], ['pants', 'Pants'], ['head', 'Headwear'], ['goggles', 'Goggles'], ['skis', 'Skis'], ['deck', 'Snowboards'], ['gloves', 'Gloves']];
export const RARITY = { free: 'Starter', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', pass: 'Season Pass' };

// ---------------------------------------------------------------- the profile
export class Meta {
  constructor() {
    this.flakes = Number(store.get('flakes', '300'));
    this.xp = Number(store.get('xp', '0'));
    this.owned = new Set(store.json('owned', []));
    for (const it of ITEMS) if (it.r === 'free') this.owned.add(it.id);
    for (const it of ITEMS) if (it.r === 'pass' && it.level <= this.level) this.owned.add(it.id);
    const old = Number(store.get('jacket', '0'));
    const oldJ = ITEMS.find((x) => x.cat === 'jacket' && x.r === 'free' && x.c === old);
    this.kit = { jacket: oldJ?.id ?? 'j-ember', pants: 'p-coal', head: 'h-white', goggles: 'g-amber', skis: 's-red', deck: 'd-white', gloves: 'gl-black', ...store.json('kit', {}) };
    for (const [k, v] of Object.entries(this.kit)) if (!ITEM[v] || !this.owned.has(v)) delete this.kit[k];
    this.kit = { jacket: 'j-ember', pants: 'p-coal', head: 'h-white', goggles: 'g-amber', skis: 's-red', deck: 'd-white', gloves: 'gl-black', ...this.kit };
    this.day = store.json('day', { d: '', xp: 0, done: false });
    if (this.day.d !== today()) this.day = { d: today(), xp: 0, done: false };
    this.listeners = [];
  }

  onChange(fn) { this.listeners.push(fn); }
  changed() { for (const f of this.listeners) f(this); }
  save() {
    store.set('flakes', String(this.flakes)); store.set('xp', String(this.xp));
    store.put('owned', [...this.owned].filter((id) => ITEM[id]?.r !== 'free')); store.put('kit', this.kit); store.put('day', this.day);
  }

  get level() { return Math.min(LEVELS, 1 + Math.floor(this.xp / LEVEL_XP)); }
  get levelFrac() { return this.level >= LEVELS ? 1 : (this.xp % LEVEL_XP) / LEVEL_XP; }

  // what level L gives: an exclusive every fifth level, 150 flakes every tenth, 25 otherwise
  reward(L) {
    const item = ITEMS.find((x) => x.r === 'pass' && x.level === L);
    if (item) return { item };
    return { flakes: L % 10 === 0 ? 150 : 25 };
  }

  // a run is over: XP (three levels a day at full rate, a quarter after that) and flakes
  payout(score, extraXp = 0) {
    const before = this.level;
    let xp = Math.round(Math.min(1400, 60 + score / 30)) + extraXp;
    const full = Math.max(0, LEVEL_XP * 3 - this.day.xp);
    const got = Math.min(xp, full) + Math.round(Math.max(0, xp - full) * 0.25);
    this.day.xp += got;
    this.xp = Math.min(this.xp + got, LEVEL_XP * (LEVELS - 1));
    let flakes = 20 + Math.round(score / 400);
    const gifts = [];
    for (let L = before + 1; L <= this.level; L++) {
      const r = this.reward(L);
      if (r.item) { this.owned.add(r.item.id); gifts.push(r.item); } else flakes += r.flakes;
    }
    this.flakes += flakes;
    this.save(); this.changed();
    return { xp: got, flakes, levels: this.level - before, level: this.level, gifts };
  }

  buy(id) {
    const it = ITEM[id];
    if (!it || this.owned.has(id) || it.r === 'pass' || this.flakes < it.price) return false;
    this.flakes -= it.price; this.owned.add(id);
    this.kit[it.cat] = id;
    this.save(); this.changed();
    return true;
  }

  wear(id) {
    const it = ITEM[id];
    if (!it || !this.owned.has(id)) return false;
    this.kit[it.cat] = id;
    this.save(); this.changed();
    return true;
  }

  // the kit as a rider outfit (skin, boots, avatar body stay the rider's own)
  outfit(base, board) {
    const k = (c) => ITEM[this.kit[c]];
    const j = k('jacket'), p = k('pants'), h = k('head');
    const o = { ...base, jacket: j.c, jacket2: j.c2 ?? j.c, jpat: j.pat, pants: p.c, pants2: p.c2 ?? p.c, ppat: p.pat,
      goggles: k('goggles').c, skis: k('skis').c, deck: k('deck').c, gloves: k('gloves').c, board: !!board };
    if (h.beanie) { o.beanie = h.c; o.pom = !!h.pom; } else { o.beanie = 0; o.helmet = h.c; }
    if (o.board && o.boots === 0xf0f0f0) o.boots = 0x2a2d35;
    return o;
  }

  // ------------------------------------------------ daily challenge
  daily() {
    const list = [
      ['Land a 720', /\b720\b/], ['Land a Cork', /Cork/], ['Land a Backflip', /Backflip/], ['Land a grab-to-grab', / to /],
      ['Land a Tweaked grab', /Tweaked/], ['Land a 540', /\b540\b/], ['Land a Shifty', /Shifty/], ['Press a rail', /Press/],
      ['Butter a 360', /Butter (360|540)/], ['Land a Rodeo', /Rodeo/], ['Land a 900', /\b900\b/], ['Land a Double', /Double/],
    ];
    const n = Math.floor(Date.now() / 864e5);
    const [name, re] = list[n % list.length];
    return { name, re, done: this.day.done, reward: 150, xp: 300 };
  }

  // a landed trick name: does it beat today's challenge?
  checkDaily(name) {
    const d = this.daily();
    if (d.done || !d.re.test(name)) return null;
    this.day.done = true;
    this.flakes += d.reward;
    this.save(); this.changed();
    return d;
  }

  // ------------------------------------------------ runs
  runs(park) { return store.json('runs.' + park, []); }
  addRun(park, run) {
    const list = this.runs(park);
    list.push(run);
    list.sort((a, b) => b.score - a.score);
    store.put('runs.' + park, list.slice(0, 10));
    return list.indexOf(run);
  }
}

function today() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }

// the mountain's regulars to chase on each park's board (computer riders, marked as such)
export const RIVALS = {
  yard: [['Ana Berg', 96000], ['Kai Lindqvist', 81000], ['Mila Novak', 67000], ['Theo Baumann', 52000], ['Elin Strand', 40000], ['Luca Ferrari', 29000], ['Hanna Aas', 18000]],
  slope: [['Jonas Falk', 64000], ['Sofia Rinaldi', 53000], ['Nils Eriksen', 41000], ['Clara Huber', 31000], ['Felix Gruber', 22000], ['Emil Steiner', 13000]],
  forest: [['Ingrid Dahl', 48000], ['Marco Valli', 39000], ['Lena Moser', 30000], ['Kai Lindqvist', 21000], ['Hanna Aas', 12000]],
  bigair: [['Theo Baumann', 34000], ['Mila Novak', 27000], ['Ana Berg', 20000], ['Jonas Falk', 13000], ['Elin Strand', 7000]],
};
