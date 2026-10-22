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
// cat: jacket, pants, head, goggles, skis, deck, gloves, poles, rider
// pat (jackets and pants): 0 solid, 1 chest band, 2 camo, 3 tartan, 4 colour-block sleeves, 5 fade,
//   6 stripes, 7 chevron, 8 split, 9 trims, 10 pixel camo, 11 pinstripe, 12 dots, 13 quilted, 14 sash, 15 checker
// design (skis and decks): a top-sheet graphic, see gear.js
// fin (helmets): 0 gloss, 1 matte, 2 chrome; c2 a racing stripe
const I = (id, cat, name, r, price, c, c2 = null, pat = 0, extra = {}) => ({ id, cat, name, r, price, c, c2, pat, ...extra });
export const PATTERNS = ['Solid', 'Chest Band', 'Camo', 'Tartan', 'Block', 'Fade', 'Stripes', 'Chevron', 'Split', 'Trim', 'Pixel Camo', 'Pinstripe', 'Dots', 'Quilted', 'Sash', 'Checker'];
export const ITEMS = [
  // free starters
  I('j-ember', 'jacket', 'Ember', 'free', 0, 0xff6a2b), I('j-crimson', 'jacket', 'Crimson', 'free', 0, 0xd8342c),
  I('j-mustard', 'jacket', 'Mustard', 'free', 0, 0xf2b705), I('j-glacier', 'jacket', 'Glacier', 'free', 0, 0x2a7de1),
  I('j-pine', 'jacket', 'Pine', 'free', 0, 0x18a868), I('j-violet', 'jacket', 'Violet', 'free', 0, 0x8e3fd1),
  I('j-flamingo', 'jacket', 'Flamingo', 'free', 0, 0xff4f8b), I('j-chalk', 'jacket', 'Chalk', 'free', 0, 0xf4f4f4),
  I('j-tealband', 'jacket', 'Petrol Shell', 'free', 0, 0x286d70, 0x1a1e24, 1), I('p-slate', 'pants', 'Ink', 'free', 0, 0x303946),
  I('p-coal', 'pants', 'Coal', 'free', 0, 0x1b1d24), I('p-navy', 'pants', 'Navy', 'free', 0, 0x1f2f4a), I('p-stone', 'pants', 'Stone', 'free', 0, 0x8a8478),
  I('h-white', 'head', 'White Lid', 'free', 0, 0xf4f4f4, null, 0, { helmet: true }), I('h-black', 'head', 'Black Lid', 'free', 0, 0x14181d, null, 0, { helmet: true, fin: 1 }),
  I('h-red', 'head', 'Red Lid', 'free', 0, 0xd8342c, null, 0, { helmet: true }),
  I('g-amber', 'goggles', 'Amber', 'free', 0, 0xff8a1e), I('g-sky', 'goggles', 'Sky', 'free', 0, 0x2aa8ff), I('g-smoke', 'goggles', 'Smoke', 'free', 0, 0x8e9fb8), I('g-silver', 'goggles', 'Park Silver', 'free', 0, 0xc4d0d8, 0xf3f3f1),
  I('s-white', 'skis', 'Whiteout', 'free', 0, 0xffffff, 0x15161a, 0, { design: 'stripe' }), I('s-black', 'skis', 'Blackout', 'free', 0, 0x111111, 0x8a8f99, 0, { design: 'logo' }),
  I('s-red', 'skis', 'Race Red', 'free', 0, 0xea1018, 0xffffff, 0, { design: 'tip' }),
  I('d-white', 'deck', 'Blank', 'free', 0, 0xffffff, 0x15161a, 0, { design: 'logo' }), I('d-black', 'deck', 'Shadow', 'free', 0, 0x111111, 0x8a8f99, 0, { design: 'stripe' }),
  I('gl-black', 'gloves', 'Black', 'free', 0, 0x15161a),
  I('po-alu', 'poles', 'Alloy', 'free', 0, 0x9ea5b0),
  I('t-none', 'trail', 'Fresh Powder', 'free', 0, 0xffffff, 0xdfeaff, 0, { fx: 'snow' }),
  // riders (all lads; the face is the rider's own)
  I('r-kai', 'rider', 'Kai', 'free', 0, 0xe8b796, null, 0, { body: 0 }), I('r-finn', 'rider', 'Finn', 'free', 0, 0x8d5a3b, null, 0, { body: 1 }),
  I('r-leo', 'rider', 'Leo', 'free', 0, 0xf1c7a8, null, 0, { body: 2 }),
  // the shop's originals
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
  I('h-gold', 'head', 'Gold Lid', 'legendary', 1000, 0xd9a520, null, 0, { helmet: true, fin: 2 }),
  I('g-violet', 'goggles', 'Violet Haze', 'rare', 200, 0xc23bff), I('g-mint', 'goggles', 'Mint', 'rare', 200, 0x22e0a0),
  I('g-gold', 'goggles', 'Gold Chrome', 'epic', 600, 0xffd21e), I('g-fire', 'goggles', 'Fire', 'epic', 600, 0xff3e3e),
  I('s-lime', 'skis', 'Lime Pipe', 'epic', 800, 0xa6e22e, 0x15161a, 0, { design: 'chevron' }), I('s-print', 'skis', 'Fingerprint', 'legendary', 1000, 0xf4a261, 0x3a2418, 0, { design: 'wood' }),
  I('s-purple', 'skis', 'Send It', 'epic', 800, 0x8338ec, 0xffd21e, 0, { design: 'bolt' }), I('s-ice', 'skis', 'Nordlys', 'rare', 600, 0x7fd3ff, 0xffffff, 0, { design: 'peaks' }),
  I('d-moon', 'deck', 'Moon Ritual', 'legendary', 1000, 0x1d2a5a, 0xffe9a8, 0, { design: 'galaxy' }), I('d-slush', 'deck', 'Slush', 'rare', 600, 0x9be7d8, 0xffffff, 0, { design: 'dots' }),
  I('d-after', 'deck', 'Afterimage', 'epic', 800, 0xff7a1a, 0xffd21e, 0, { design: 'fade' }), I('d-acid', 'deck', 'Acid', 'epic', 800, 0xc6f432, 0x15161a, 0, { design: 'checker' }),
  I('gl-orange', 'gloves', 'Hunter', 'rare', 200, 0xff6a2b), I('gl-tan', 'gloves', 'Work Leather', 'rare', 200, 0x9a6a3a),
];

// ---- the big catalogue: colourways x prints, generated so every name is unique
const COL = {
  Ember: 0xff6a2b, Crimson: 0xd8342c, Mustard: 0xf2b705, Glacier: 0x2a7de1, Pine: 0x18a868, Violet: 0x8e3fd1, Flamingo: 0xff4f8b,
  Chalk: 0xf4f4f4, Coal: 0x1b1d24, Navy: 0x1f2f4a, Stone: 0x8a8478, Teal: 0x14b8c4, Lime: 0xa6e22e, Sky: 0x7fc8ff, Sand: 0xd8c39a,
  Olive: 0x5d6b3a, Plum: 0x6a2a5a, Mint: 0x8fe3c0, Rust: 0xa8461e, Cobalt: 0x1f4fd1, Coral: 0xff7a6b, Gold: 0xd9a520, Ice: 0xd6ecff,
  Cherry: 0xb3123a, Moss: 0x7a9a3a, Slate: 0x4a5566, Peach: 0xffb38a, Lilac: 0xb39ddb, Tangerine: 0xff8c1a, Forest: 0x1f4a32,
  Bone: 0xe9e2d0, Berry: 0x8a1f5a, Ocean: 0x0e6aa8, Volt: 0xd6ff2e, Cocoa: 0x5a3a28, Smoke: 0x9aa0aa,
};
const C = (k) => COL[k];
const PR = { rare: 300, epic: 750, legendary: 1250 };
const cost = (r, k = 0) => PR[r] + k * 50;
// [name, rarity, c, c2, pat]
const JACKETS = [
  ['Teal Band', 'rare', 'Teal', 'Navy', 1], ['Cherry Block', 'epic', 'Cherry', 'Chalk', 4], ['Arctic Camo', 'epic', 'Ice', 'Smoke', 2], ['Highland', 'legendary', 'Forest', 'Mustard', 3],
  ['Peach Fade', 'epic', 'Peach', 'Lilac', 5], ['Breton', 'rare', 'Chalk', 'Navy', 6], ['Bumblebee', 'epic', 'Mustard', 'Coal', 6], ['Racer Stripes', 'epic', 'Crimson', 'Chalk', 6],
  ['Zigzag', 'epic', 'Teal', 'Coal', 7], ['Thunder', 'legendary', 'Coal', 'Volt', 7], ['Two Face', 'epic', 'Ember', 'Glacier', 8], ['Yin Yang', 'legendary', 'Chalk', 'Coal', 8],
  ['Patrol Trim', 'rare', 'Crimson', 'Chalk', 9], ['Volt Trim', 'rare', 'Coal', 'Volt', 9], ['Coral Trim', 'rare', 'Navy', 'Coral', 9], ['Digital', 'epic', 'Slate', 'Coal', 10],
  ['Desert Pixel', 'epic', 'Sand', 'Rust', 10], ['Banker', 'rare', 'Navy', 'Smoke', 11], ['Candy Pin', 'rare', 'Chalk', 'Cherry', 11], ['Polka', 'epic', 'Flamingo', 'Chalk', 12],
  ['Night Dots', 'epic', 'Coal', 'Mustard', 12], ['Puffer Black', 'rare', 'Coal', 'Coal', 13], ['Puffer Tangerine', 'epic', 'Tangerine', 'Tangerine', 13], ['Puffer Ice', 'epic', 'Ice', 'Ice', 13],
  ['Puffer Moss', 'rare', 'Moss', 'Moss', 13], ['Sash', 'epic', 'Cobalt', 'Mustard', 14], ['Pageant', 'legendary', 'Berry', 'Gold', 14], ['Picnic', 'epic', 'Chalk', 'Crimson', 15],
  ['Checkmate', 'legendary', 'Coal', 'Chalk', 15], ['Ocean Fade', 'epic', 'Ocean', 'Mint', 5], ['Ember Fade', 'legendary', 'Crimson', 'Mustard', 5], ['Cocoa Band', 'rare', 'Cocoa', 'Bone', 1],
  ['Plum', 'rare', 'Plum'], ['Rust', 'rare', 'Rust'], ['Mint', 'rare', 'Mint'], ['Cobalt', 'rare', 'Cobalt'], ['Bone', 'rare', 'Bone'], ['Volt', 'epic', 'Volt'],
  ['Mountain Camo', 'epic', 'Moss', 'Forest', 2], ['Berry Block', 'epic', 'Berry', 'Peach', 4], ['Slate Chevron', 'rare', 'Slate', 'Ice', 7], ['Sunrise Stripes', 'legendary', 'Peach', 'Crimson', 6],
];
const PANTS = [
  ['Teal', 'rare', 'Teal'], ['Cherry', 'rare', 'Cherry'], ['Mustard', 'rare', 'Mustard'], ['Sand', 'rare', 'Sand'], ['Sky', 'rare', 'Sky'], ['Lilac', 'rare', 'Lilac'],
  ['Moss', 'rare', 'Moss'], ['Bone', 'rare', 'Bone'], ['Slate', 'rare', 'Slate'], ['Cocoa', 'rare', 'Cocoa'],
  ['Arctic Camo', 'epic', 'Ice', 'Smoke', 2], ['Desert Camo', 'epic', 'Sand', 'Cocoa', 2], ['Pixel', 'epic', 'Slate', 'Coal', 10], ['Side Stripe', 'epic', 'Coal', 'Chalk', 9],
  ['Track Stripe', 'epic', 'Navy', 'Ember', 9], ['Glacier Fade', 'epic', 'Navy', 'Sky', 5], ['Lava Fade', 'legendary', 'Coal', 'Ember', 5], ['Check', 'legendary', 'Chalk', 'Coal', 15],
  ['Highland', 'legendary', 'Navy', 'Forest', 3], ['Split', 'epic', 'Coal', 'Mustard', 8], ['Pinstripe', 'rare', 'Coal', 'Smoke', 11], ['Dots', 'epic', 'Navy', 'Chalk', 12],
  ['Quilted', 'epic', 'Coal', 'Coal', 13], ['Volt Block', 'epic', 'Coal', 'Volt', 4], ['Sunset Stripes', 'legendary', 'Plum', 'Peach', 6], ['Chevron', 'epic', 'Olive', 'Sand', 7],
];
const HELMETS = [
  ['Glacier Lid', 'rare', 'Glacier', null, 0], ['Mint Lid', 'rare', 'Mint', null, 1], ['Sand Lid', 'rare', 'Sand', null, 1], ['Volt Lid', 'epic', 'Volt', null, 0],
  ['Matte Navy', 'rare', 'Navy', null, 1], ['Matte Moss', 'rare', 'Moss', null, 1], ['Racer', 'epic', 'Chalk', 'Crimson', 0], ['Night Racer', 'epic', 'Coal', 'Volt', 1],
  ['Patrol', 'epic', 'Crimson', 'Chalk', 0], ['Chrome', 'legendary', 'Smoke', null, 2], ['Rose Chrome', 'legendary', 'Peach', null, 2], ['Ocean Chrome', 'legendary', 'Ocean', null, 2],
  ['Flamingo Lid', 'rare', 'Flamingo', null, 0], ['Tangerine Stripe', 'epic', 'Tangerine', 'Coal', 1],
];
const BEANIES = [
  ['Mustard Beanie', 'rare', 'Mustard', true], ['Chalk Beanie', 'rare', 'Chalk', false], ['Sky Beanie', 'rare', 'Sky', true], ['Teal Beanie', 'rare', 'Teal', false],
  ['Flamingo Beanie', 'epic', 'Flamingo', true], ['Rust Beanie', 'rare', 'Rust', false], ['Volt Beanie', 'epic', 'Volt', true], ['Lilac Beanie', 'rare', 'Lilac', true],
];
const GOGGLES = [
  ['Ice Mirror', 'epic', 'Ice', 'Chalk'], ['Rose', 'rare', 'Peach', 'Chalk'], ['Emerald', 'epic', 'Pine', 'Coal'], ['Cobalt', 'rare', 'Cobalt', 'Coal'], ['Toxic', 'epic', 'Volt', 'Coal'],
  ['Pink Mirror', 'epic', 'Flamingo', 'Chalk'], ['Smoke', 'rare', 'Slate', 'Coal'], ['Sunburst', 'legendary', 'Tangerine', 'Mustard'], ['Aurora', 'legendary', 'Mint', 'Violet'],
  ['Blood Orange', 'epic', 'Ember', 'Chalk'], ['Night Vision', 'rare', 'Lime', 'Coal'], ['Gold Rim', 'legendary', 'Coal', 'Gold'],
];
// [name, rarity, design, c, c2]
const SKIS = [
  ['Flamethrower', 'legendary', 'flames', 'Coal', 'Ember'], ['Checkers', 'epic', 'checker', 'Chalk', 'Coal'], ['Woodie', 'epic', 'wood', 'Sand', 'Cocoa'], ['Tiger', 'legendary', 'tiger', 'Tangerine', 'Coal'],
  ['Night Sky', 'legendary', 'galaxy', 'Navy', 'Ice'], ['Bolt', 'epic', 'bolt', 'Coal', 'Volt'], ['Twin Peaks', 'rare', 'peaks', 'Glacier', 'Chalk'], ['Chevron Red', 'rare', 'chevron', 'Crimson', 'Chalk'],
  ['Mint Fade', 'rare', 'fade', 'Mint', 'Glacier'], ['Arctic Camo', 'epic', 'camo', 'Ice', 'Smoke'], ['Woodland Camo', 'epic', 'camo', 'Moss', 'Forest'], ['Stars', 'epic', 'stars', 'Navy', 'Mustard'],
  ['Polka', 'rare', 'dots', 'Flamingo', 'Chalk'], ['Racing Stripe', 'rare', 'stripe', 'Glacier', 'Chalk'], ['Split Decision', 'epic', 'split', 'Ember', 'Coal'], ['Sunset', 'legendary', 'fade', 'Peach', 'Violet'],
  ['Retro Tip', 'rare', 'tip', 'Chalk', 'Teal'], ['Gold Rush', 'legendary', 'logo', 'Gold', 'Coal'], ['Tropic', 'epic', 'chevron', 'Teal', 'Mustard'], ['Lava Lamp', 'legendary', 'dots', 'Berry', 'Tangerine'],
  ['Stealth', 'rare', 'stripe', 'Coal', 'Slate'], ['Sakura', 'epic', 'stars', 'Peach', 'Chalk'], ['Glacier Pixel', 'epic', 'pixel', 'Ice', 'Glacier'], ['Zebra', 'legendary', 'tiger', 'Chalk', 'Coal'],
];
const DECKS = [
  ['Flame Job', 'legendary', 'flames', 'Coal', 'Ember'], ['Chessboard', 'epic', 'checker', 'Chalk', 'Coal'], ['Old Growth', 'epic', 'wood', 'Sand', 'Cocoa'], ['Bengal', 'legendary', 'tiger', 'Tangerine', 'Coal'],
  ['Night Owl', 'legendary', 'galaxy', 'Plum', 'Ice'], ['Lightning', 'epic', 'bolt', 'Navy', 'Mustard'], ['Summit', 'rare', 'peaks', 'Ocean', 'Chalk'], ['Arrow', 'rare', 'chevron', 'Cherry', 'Chalk'],
  ['Lagoon', 'rare', 'fade', 'Teal', 'Glacier'], ['Snow Camo', 'epic', 'camo', 'Ice', 'Smoke'], ['Jungle Camo', 'epic', 'camo', 'Moss', 'Forest'], ['Constellation', 'epic', 'stars', 'Navy', 'Chalk'],
  ['Bubblegum', 'rare', 'dots', 'Flamingo', 'Chalk'], ['Pinline', 'rare', 'stripe', 'Chalk', 'Crimson'], ['Halves', 'epic', 'split', 'Glacier', 'Mustard'], ['Dusk', 'legendary', 'fade', 'Tangerine', 'Plum'],
  ['Vintage', 'rare', 'tip', 'Bone', 'Rust'], ['Gold Standard', 'legendary', 'logo', 'Coal', 'Gold'], ['8-Bit', 'epic', 'pixel', 'Violet', 'Volt'], ['Zebra', 'legendary', 'tiger', 'Chalk', 'Coal'],
];
const GLOVES = [
  ['Glacier', 'rare', 'Glacier', 'Coal'], ['Crimson', 'rare', 'Crimson', 'Coal'], ['Mustard', 'rare', 'Mustard', 'Coal'], ['Chalk', 'rare', 'Chalk', 'Smoke'], ['Volt', 'epic', 'Volt', 'Coal'],
  ['Pine', 'rare', 'Pine', 'Coal'], ['Flamingo', 'epic', 'Flamingo', 'Chalk'], ['Two Tone', 'epic', 'Ember', 'Navy'], ['Gold Cuff', 'legendary', 'Coal', 'Gold'], ['Mitt Moss', 'rare', 'Moss', 'Bone'],
];
const POLES = [
  ['Carbon', 'rare', 'Coal'], ['Red Line', 'rare', 'Crimson'], ['Volt', 'epic', 'Volt'], ['Gold', 'legendary', 'Gold'], ['Glacier', 'rare', 'Glacier'], ['Flamingo', 'epic', 'Flamingo'], ['Chalk', 'rare', 'Chalk'],
];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
JACKETS.forEach(([n, r, a, b = null, pat = 0], i) => ITEMS.push(I('jx-' + slug(n), 'jacket', n, r, cost(r, i % 4), C(a), b && C(b), pat)));
PANTS.forEach(([n, r, a, b = null, pat = 0], i) => ITEMS.push(I('px-' + slug(n), 'pants', n, r, cost(r, i % 3), C(a), b && C(b), pat)));
HELMETS.forEach(([n, r, a, b, fin], i) => ITEMS.push(I('hx-' + slug(n), 'head', n, r, cost(r, i % 3), C(a), b && C(b), 0, { helmet: true, fin })));
BEANIES.forEach(([n, r, a, pom], i) => ITEMS.push(I('bx-' + slug(n), 'head', n, r, cost(r, i % 2) - 100, C(a), null, 0, { beanie: true, pom })));
GOGGLES.forEach(([n, r, a, b], i) => ITEMS.push(I('gx-' + slug(n), 'goggles', n, r, cost(r, i % 3), C(a), C(b))));
SKIS.forEach(([n, r, d, a, b], i) => ITEMS.push(I('sx-' + slug(n), 'skis', n, r, cost(r, i % 4), C(a), C(b), 0, { design: d })));
DECKS.forEach(([n, r, d, a, b], i) => ITEMS.push(I('dx-' + slug(n), 'deck', n, r, cost(r, i % 4), C(a), C(b), 0, { design: d })));
GLOVES.forEach(([n, r, a, b], i) => ITEMS.push(I('glx-' + slug(n), 'gloves', n, r, cost(r, i % 2) - 100, C(a), C(b))));
POLES.forEach(([n, r, a], i) => ITEMS.push(I('pox-' + slug(n), 'poles', n, r, cost(r, i % 2) - 100, C(a))));
// trails: what your skis leave in the air behind you (fx: solid, fade, rainbow, sparkle, fire)
const TRAILS = [
  ['Ice Blue', 'rare', 'Sky', 'Chalk', 'fade'], ['Neon Volt', 'rare', 'Volt', 'Lime', 'fade'], ['Bubblegum', 'rare', 'Flamingo', 'Chalk', 'fade'], ['Tangerine', 'rare', 'Tangerine', 'Mustard', 'fade'],
  ['Inferno', 'epic', 'Mustard', 'Crimson', 'fire'], ['Toxic Smoke', 'epic', 'Lime', 'Pine', 'fire'], ['Royal', 'epic', 'Violet', 'Gold', 'sparkle'], ['Frostbite', 'epic', 'Ice', 'Cobalt', 'sparkle'],
  ['Rainbow Road', 'legendary', 'Crimson', 'Violet', 'rainbow'], ['Gold Dust', 'legendary', 'Gold', 'Mustard', 'sparkle'], ['Aurora', 'legendary', 'Mint', 'Violet', 'fade'], ['Comet', 'legendary', 'Chalk', 'Sky', 'sparkle'],
];
TRAILS.forEach(([n, r, a, b, fx], i) => ITEMS.push(I('tx-' + slug(n), 'trail', n, r, cost(r, i % 3) + 100, C(a), C(b), 0, { fx })));

// pass exclusives: one every fifth level
const PASS_DEFS = [
  ['jacket', 'Peak Band', 0x1d1f26, 0xffd36b, 1], ['goggles', 'Rose Gold', 0xff8fa3, 0xd9a520], ['pants', 'Glacier Fade', 0x2a7de1, 0xe8e8ea, 5],
  ['head', 'Pom Pom', 0xff4f8b, null, 0, { beanie: true, pom: true }], ['skis', 'Alpenglow', 0xff6f61, 0xffd36b, 0, { design: 'peaks' }], ['deck', 'Night Shift', 0x1d1f26, 0xff6f61, 0, { design: 'galaxy' }],
  ['jacket', 'Ice Camo', 0x9fd3ff, 0x3a5f8a, 2], ['gloves', 'Neon', 0xc6f432, 0x15161a], ['pants', 'Red Plaid', 0xc23b2f, 0x111111, 3],
  ['jacket', 'Dusk Fade', 0x5b4bd8, 0xff8a3d, 5], ['head', 'Chrome Lid', 0xc9ced6, null, 0, { helmet: true, fin: 2 }], ['skis', 'Ghost', 0xe8f0ff, 0x9fb3d0, 0, { design: 'camo' }],
  ['deck', 'Lava', 0xff3d1f, 0x1d1f26, 0, { design: 'flames' }], ['jacket', 'Patrol', 0xd8342c, 0xf4f4f4, 4], ['goggles', 'Black Ice', 0x22262e, 0x9fd8ff], ['pants', 'Sand Camo', 0xc8b48a, 0x7a6a4a, 2],
  ['head', 'Tiger Beanie', 0xff8a1e, null, 0, { beanie: true }], ['deck', 'Aurora', 0x22e0a0, 0x5b4bd8, 0, { design: 'fade' }], ['skis', 'Gold Rush Pro', 0xffd21e, 0x15161a, 0, { design: 'tiger' }], ['jacket', 'Alpenglow Pro', 0xff6f61, 0xffd36b, 1],
];
PASS_DEFS.forEach(([cat, name, c, c2 = null, pat = 0, extra = {}], i) => ITEMS.push(I('pass-' + (i + 1), cat, name, 'pass', 0, c, c2, pat, { ...extra, level: (i + 1) * 5 })));
// the Gold Pass track: an exclusive every fourth level for riders who bought it
export const GOLD_PRICE = 950;
const GOLD_DEFS = [
  ['trail', 'Glacier Glow', 0x9fe8ff, 0x5b8cff, 0, { fx: 'sparkle' }], ['jacket', 'Gold Rush', 0xd9a520, 0x1b1d24, 14], ['deck', 'Solar Flare', 0xff8a1e, 0xffe14d, 0, { design: 'flames' }],
  ['goggles', 'Liquid Gold', 0xffd21e, 0x1b1d24], ['pants', 'Midnight Fade', 0x1b1d24, 0x5b4bd8, 5], ['head', 'Gold Chrome Lid', 0xffd36b, null, 0, { helmet: true, fin: 2 }],
  ['skis', 'Aurora Pro', 0x22e0a0, 0x5b4bd8, 0, { design: 'galaxy' }], ['trail', 'Phoenix', 0xffe14d, 0xff3d1f, 0, { fx: 'fire' }], ['jacket', 'Neon Grid', 0x111214, 0x22f0ff, 10],
  ['gloves', 'Gold Mitts', 0xd9a520, 0x1b1d24], ['deck', 'Deep Space', 0x0b0d2a, 0xb39ddb, 0, { design: 'stars' }], ['pants', 'Gold Pin', 0x1b1d24, 0xd9a520, 11],
  ['trail', 'Prism', 0xff4f8b, 0x22e0ff, 0, { fx: 'rainbow' }], ['jacket', 'Vapor', 0xff7ad9, 0x5bd8ff, 5], ['skis', 'Tiger King', 0xffd21e, 0x1b1d24, 0, { design: 'tiger' }],
  ['head', 'Halo Beanie', 0xfff2b0, null, 0, { beanie: true, pom: true }], ['goggles', 'Prism Mirror', 0xb39ddb, 0x22e0ff], ['deck', 'Molten', 0x1b1d24, 0xff6a12, 0, { design: 'split' }],
  ['jacket', 'Royal Puffer', 0x3b2a8a, 0xd9a520, 13], ['pants', 'Royal Camo', 0x3b2a8a, 0x1b1d24, 2], ['trail', 'Supernova', 0xffffff, 0xffd36b, 0, { fx: 'sparkle' }],
  ['skis', 'Gold Standard Pro', 0xd9a520, 0xffffff, 0, { design: 'chevron' }], ['jacket', 'Shredline Gold', 0xd9a520, 0xffffff, 1], ['deck', 'Crown', 0xd9a520, 0x1b1d24, 0, { design: 'logo' }],
  ['trail', 'Legend', 0xffd21e, 0xff4f8b, 0, { fx: 'rainbow' }],
];
GOLD_DEFS.forEach(([cat, name, c, c2 = null, pat = 0, extra = {}], i) => ITEMS.push(I('gold-' + (i + 1), cat, name, 'gold', 0, c, c2, pat, { ...extra, level: i * 4 + 2 })));
// event medals unlock a few things too (see events.js)
ITEMS.push(
  I('ev-gold-j', 'jacket', 'Podium Gold', 'event', 0, 0xd9a520, 0x1b1d24, 9, { how: 'Win any event on Pro' }),
  I('ev-gold-s', 'skis', 'Champion', 'event', 0, 0xd9a520, 0x1b1d24, 0, { design: 'logo', how: 'Win any event on Pro' }),
  I('ev-gold-d', 'deck', 'Champion', 'event', 0, 0xd9a520, 0x1b1d24, 0, { design: 'logo', how: 'Win any event on Pro' }),
  I('ev-legend-h', 'head', 'Legend Lid', 'event', 0, 0xd9a520, 0x1b1d24, 0, { helmet: true, fin: 2, how: 'Win an event on Legend' }),
);
for (const it of ITEMS) if (it.cat === 'head' && !it.beanie) it.helmet = true;
export const ITEM = Object.fromEntries(ITEMS.map((x) => [x.id, x]));
export const CATS = [['rider', 'Rider'], ['jacket', 'Jackets'], ['pants', 'Pants'], ['head', 'Headwear'], ['goggles', 'Goggles'], ['skis', 'Skis'], ['deck', 'Snowboards'], ['gloves', 'Gloves'], ['poles', 'Poles'], ['trail', 'Trails']];
export const RARITY = { free: 'Starter', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', pass: 'Season Pass', gold: 'Gold Pass', event: 'Event' };
// the outfit sets in the shop: a whole look for less than its parts
export const SETS = [
  { id: 'set-patrol', name: 'Ski Patrol', items: ['jx-patrol-trim', 'p-coal', 'hx-patrol', 'glx-crimson'] },
  { id: 'set-arctic', name: 'Arctic Ops', items: ['jx-arctic-camo', 'px-arctic-camo', 'hx-matte-navy', 'sx-arctic-camo'] },
  { id: 'set-volt', name: 'Night Volt', items: ['jx-thunder', 'px-volt-block', 'hx-night-racer', 'gx-toxic', 'glx-volt'] },
  { id: 'set-highland', name: 'Highlander', items: ['jx-highland', 'px-highland', 'bx-rust-beanie', 'dx-old-growth'] },
  { id: 'set-sunset', name: 'Golden Hour', items: ['jx-sunrise-stripes', 'px-sunset-stripes', 'gx-sunburst', 'dx-dusk'] },
  { id: 'set-checker', name: 'Checkmate', items: ['jx-checkmate', 'px-check', 'sx-checkers', 'dx-chessboard'] },
  { id: 'set-tiger', name: 'Big Cat', items: ['jx-bumblebee', 'sx-tiger', 'dx-bengal', 'bx-mustard-beanie'] },
  { id: 'set-puffer', name: 'Puffer Club', items: ['jx-puffer-tangerine', 'px-quilted', 'bx-chalk-beanie', 'glx-chalk'] },
  { id: 'set-inferno', name: 'Inferno', items: ['jx-ember-fade', 'px-lava-fade', 'gx-blood-orange', 'dx-flame-job', 'tx-inferno'], blurb: 'Leave the mountain on fire behind you.' },
  { id: 'set-rainbow', name: 'Rainbow Road', items: ['jx-sunrise-stripes', 'px-sunset-stripes', 'gx-pink-mirror', 'sx-lava-lamp', 'tx-rainbow-road'], blurb: 'Every colour at once, and a rainbow trail.' },
  { id: 'set-frost', name: 'Frostbite', items: ['jx-puffer-ice', 'px-glacier-fade', 'hx-ocean-chrome', 'gx-ice-mirror', 'sx-glacier-pixel', 'tx-frostbite'], blurb: 'Ice blue head to toe, frost sparkling behind.' },
  { id: 'set-gold', name: 'Gold Dust', items: ['jx-pageant', 'px-check', 'hx-chrome', 'gx-gold-rim', 'glx-gold-cuff', 'tx-gold-dust'], blurb: 'Gold everything. Gold dust in the air.' },
  { id: 'set-aurora', name: 'Northern Lights', items: ['jx-ocean-fade', 'px-glacier-fade', 'gx-aurora', 'dx-night-owl', 'tx-aurora'], blurb: 'The night sky, worn.' },
].map((s) => ({ ...s, price: Math.round(s.items.reduce((a, id) => a + (ITEM[id]?.price ?? 0), 0) * 0.7 / 50) * 50 }));

// ---------------------------------------------------------------- the profile
const KIT0 = { rider: 'r-kai', jacket: 'j-tealband', pants: 'p-slate', head: 'h-black', goggles: 'g-silver', skis: 's-red', deck: 'd-white', gloves: 'gl-black', poles: 'po-alu', trail: 't-none' };
export class Meta {
  constructor() {
    this.load();
    this.listeners = [];
  }

  // everything from this browser's storage
  load() {
    this.flakes = Number(store.get('flakes', '300'));
    this.xp = Number(store.get('xp', '0'));
    this.owned = new Set(store.json('owned', []));
    this.medals = store.json('medals', {});
    this.lessons = new Set(store.json('lessons', []));
    this.quick = store.json('quick', null);
    this.rev = Number(store.get('rev', '0'));
    const old = Number(store.get('jacket', '0'));
    const oldJ = ITEMS.find((x) => x.cat === 'jacket' && x.r === 'free' && x.c === old);
    this.kit = { ...KIT0, ...(oldJ ? { jacket: oldJ.id } : {}), ...store.json('kit', {}) };
    // (once: riders still in the old starter kit move to the new one)
    if (store.get('kit7', '0') !== '1') {
      const K = this.kit;
      if (K.jacket === 'j-ember' && K.pants === 'p-coal' && K.head === 'h-white' && K.goggles === 'g-amber') Object.assign(K, { jacket: KIT0.jacket, pants: KIT0.pants, head: KIT0.head, goggles: KIT0.goggles });
      store.set('kit7', '1');
    }
    // (once more: the Cork7 rider's smoke lenses instead of the blue ones)
    if (store.get('kit8', '0') !== '1') {
      const K = this.kit;
      if (K.jacket === KIT0.jacket && K.goggles === 'g-sky') K.goggles = 'g-smoke';
      store.set('kit8', '1');
    }
    // (and once more: the white park goggles the Cork7 starter rides in)
    if (store.get('kit9', '0') !== '1') {
      const K = this.kit;
      if (K.jacket === KIT0.jacket && (K.goggles === 'g-smoke' || K.goggles === 'g-sky')) K.goggles = 'g-silver';
      store.set('kit9', '1');
    }
    this.day = store.json('day', { d: '', xp: 0, done: false });
    this.gold = store.get('gold', '0') === '1';
    this.fix();
  }

  // free things are always yours, pass items up to your level; the kit only holds what you own
  fix() {
    for (const it of ITEMS) if (it.r === 'free') this.owned.add(it.id);
    for (const it of ITEMS) if ((it.r === 'pass' || (it.r === 'gold' && this.gold)) && it.level <= this.level) this.owned.add(it.id);
    for (const [k, v] of Object.entries(this.kit)) if (!ITEM[v] || !this.owned.has(v) || ITEM[v].cat !== k) delete this.kit[k];
    this.kit = { ...KIT0, ...this.kit };
    if (this.day.d !== today()) {
      // (Cork7: a day you miss waits for you: its three full-rate levels carry over, a week's worth at most)
      const D = LEVEL_XP * 3, last = this.day.d ? new Date(this.day.d.replace(/-/g, '/')) : null;
      const gap = last ? Math.max(0, Math.round((new Date(today().replace(/-/g, '/')) - last) / 864e5) - 1) : 0;
      const left = last ? Math.max(0, D + (this.day.carry ?? 0) - this.day.xp) : 0;
      this.day = { d: today(), xp: 0, done: false, carry: Math.min(D * 7, left + gap * D) };
    }
  }

  onChange(fn) { this.listeners.push(fn); }
  changed() { for (const f of this.listeners) f(this); }
  save() {
    this.rev = Date.now();
    store.set('flakes', String(this.flakes)); store.set('xp', String(this.xp)); store.set('rev', String(this.rev));
    store.put('owned', [...this.owned].filter((id) => ITEM[id]?.r !== 'free')); store.put('kit', this.kit); store.put('day', this.day); store.put('medals', this.medals);
    store.put('lessons', [...this.lessons]); store.put('quick', this.quick); store.set('gold', this.gold ? '1' : '0');
    this.onSave?.();
  }

  // the cloud save: what goes up, and taking one back
  export() {
    return { gold: this.gold, flakes: this.flakes, xp: this.xp, owned: [...this.owned].filter((id) => ITEM[id]?.r !== 'free'), kit: this.kit, day: this.day, medals: this.medals, rev: this.rev,
      lessons: [...this.lessons], quick: this.quick,
      runs: Object.fromEntries(['yard', 'slope', 'forest', 'bigair'].map((p) => [p, this.runs(p).slice(0, 10).map(({ rid, ...r }) => r)])) };
  }

  // merge: true keeps the best of both (a guest's progress joins the account it signs into)
  import(d, merge = false) {
    if (!d) return;
    if (merge) {
      this.flakes = Math.max(this.flakes, d.flakes ?? 0);
      this.xp = Math.max(this.xp, d.xp ?? 0);
      this.gold = this.gold || !!d.gold;
      for (const id of d.owned ?? []) this.owned.add(id);
      for (const [k, v] of Object.entries(d.medals ?? {})) this.medals[k] = Math.max(this.medals[k] ?? 0, v);
      for (const id of d.lessons ?? []) this.lessons.add(id);
    } else {
      this.lessons = new Set(d.lessons ?? []);
      this.quick = d.quick ?? null;
      this.flakes = d.flakes ?? 300; this.xp = d.xp ?? 0; this.gold = !!d.gold;
      this.owned = new Set(d.owned ?? []);
      this.kit = { ...KIT0, ...(d.kit ?? {}) };
      this.day = d.day ?? { d: '', xp: 0, done: false };
      this.medals = d.medals ?? {};
    }
    for (const [park, list] of Object.entries(d.runs ?? {})) {
      const mine = this.runs(park);
      const all = merge ? [...mine, ...list.filter((r) => !mine.some((m) => m.date === r.date))] : list;
      store.put('runs.' + park, all.sort((a, b) => b.score - a.score).slice(0, 10));
    }
    this.fix();
    this.save();
    this.changed();
  }

  // a brand new rider (after signing out)
  reset() {
    for (const k of ['gold', 'flakes', 'xp', 'owned', 'kit', 'day', 'medals', 'lessons', 'quick', 'rev', 'runs.yard', 'runs.slope', 'runs.forest', 'runs.bigair']) { try { localStorage.removeItem('alpenglow.' + k); } catch { /* */ } }
    this.load();
    this.changed();
  }

  get level() { return Math.min(LEVELS, 1 + Math.floor(this.xp / LEVEL_XP)); }
  get levelFrac() { return this.level >= LEVELS ? 1 : (this.xp % LEVEL_XP) / LEVEL_XP; }

  // what level L gives: an exclusive every fifth level, 150 flakes every tenth, 25 otherwise
  reward(L) {
    const item = ITEMS.find((x) => x.r === 'pass' && x.level === L);
    if (item) return { item };
    return { flakes: L % 10 === 0 ? 150 : 25 };
  }

  // the Gold Pass track: an exclusive every fourth level, flakes between
  goldReward(L) {
    const item = ITEMS.find((x) => x.r === 'gold' && x.level === L);
    if (item) return { item };
    return { flakes: L % 10 === 0 ? 200 : 40 };
  }

  // buy the Gold Pass: everything on its track up to your level is yours at once
  buyGold() {
    if (this.gold || this.flakes < GOLD_PRICE) return null;
    this.flakes -= GOLD_PRICE;
    this.gold = true;
    const gifts = [];
    let back = 0;
    for (let L = 2; L <= this.level; L++) { const r = this.goldReward(L); if (r.item) { this.owned.add(r.item.id); gifts.push(r.item); } else back += r.flakes; }
    this.flakes += back;
    this.save(); this.changed();
    return { gifts, flakes: back };
  }

  // a run is over: XP (three levels a day at full rate, plus any days missed; a fifth after
  // that, so there's never a wall) and flakes
  payout(score, extraXp = 0) {
    const before = this.level;
    let xp = Math.round(Math.min(1400, 60 + score / 30)) + extraXp;
    const full = Math.max(0, LEVEL_XP * 3 + (this.day.carry ?? 0) - this.day.xp);
    const got = Math.min(xp, full) + Math.round(Math.max(0, xp - full) * 0.2);
    this.day.xp += got;
    this.xp = Math.min(this.xp + got, LEVEL_XP * (LEVELS - 1));
    let flakes = 20 + Math.round(score / 400);
    const gifts = [];
    for (let L = before + 1; L <= this.level; L++) {
      const r = this.reward(L);
      if (r.item) { this.owned.add(r.item.id); gifts.push(r.item); } else flakes += r.flakes;
      if (this.gold) { const gr = this.goldReward(L); if (gr.item) { this.owned.add(gr.item.id); gifts.push(gr.item); } else flakes += gr.flakes; }
    }
    this.flakes += flakes;
    this.save(); this.changed();
    return { xp: got, flakes, levels: this.level - before, level: this.level, gifts };
  }

  price(id) { const it = ITEM[id], f = this.featured(); return f.includes(id) ? Math.round(it.price * 0.8 / 10) * 10 : it.price; }

  buy(id) {
    const it = ITEM[id], price = it && this.price(id);
    if (!it || this.owned.has(id) || it.r === 'pass' || it.r === 'gold' || it.r === 'event' || this.flakes < price) return false;
    this.flakes -= price; this.owned.add(id);
    this.kit[it.cat] = id;
    this.save(); this.changed();
    return true;
  }

  // a set: everything in it you don't own yet, worn at once
  setPrice(set) {
    const missing = set.items.filter((id) => !this.owned.has(id));
    if (!missing.length) return 0;
    return Math.round(set.price * missing.reduce((a, id) => a + ITEM[id].price, 0) / set.items.reduce((a, id) => a + ITEM[id].price, 0) / 10) * 10;
  }

  buySet(set) {
    const p = this.setPrice(set);
    if (!p || this.flakes < p) return false;
    this.flakes -= p;
    for (const id of set.items) { this.owned.add(id); this.kit[ITEM[id].cat] = id; }
    this.save(); this.changed();
    return true;
  }

  // the spotlight set this week (the shop's banner)
  spotlight() {
    const w = Math.floor(Date.now() / 6048e5);
    return SETS[(w * 7 + 3) % SETS.length];
  }

  // six things on offer today, 20% off
  featured() {
    const n = Math.floor(Date.now() / 864e5);
    if (this._feat?.n === n) return this._feat.ids;
    let h = (n * 2654435761) >>> 0;
    const pool = ITEMS.filter((it) => it.price > 0 && ['rare', 'epic', 'legendary'].includes(it.r) && it.cat !== 'rider');
    const ids = [];
    while (ids.length < 6) { h = (h * 1103515245 + 12345) >>> 0; const it = pool[h % pool.length]; if (!ids.includes(it.id)) ids.push(it.id); }
    this._feat = { n, ids };
    return ids;
  }

  // an event result: medal 1 gold, 2 silver, 3 bronze; returns unlocked items
  medal(eventId, tier, place) {
    const key = eventId + ':' + tier;
    const prev = this.medals[key] ?? 0;
    const m = place <= 3 ? 4 - place : 0;
    const gifts = [];
    if (m > prev) this.medals[key] = m;
    if (place === 1 && tier >= 1) for (const id of ['ev-gold-j', 'ev-gold-s', 'ev-gold-d']) if (!this.owned.has(id)) { this.owned.add(id); gifts.push(ITEM[id]); }
    if (place === 1 && tier >= 2 && !this.owned.has('ev-legend-h')) { this.owned.add('ev-legend-h'); gifts.push(ITEM['ev-legend-h']); }
    this.save(); this.changed();
    return { gifts, better: m > prev };
  }

  wear(id) {
    const it = ITEM[id];
    if (!it || !this.owned.has(id)) return false;
    this.kit[it.cat] = id;
    this.save(); this.changed();
    return true;
  }

  // the kit as a rider outfit (skin and body come from the rider you picked)
  outfit(base, board, over = null) {
    const kit = over ? { ...this.kit, ...over } : this.kit;
    const k = (c) => ITEM[kit[c]] ?? ITEM[KIT0[c]];
    const j = k('jacket'), p = k('pants'), h = k('head'), sk = k('skis'), dk = k('deck'), gg = k('goggles'), gl = k('gloves'), r = k('rider');
    const o = { ...base, jacket: j.c, jacket2: j.c2 ?? j.c, jpat: j.pat, pants: p.c, pants2: p.c2 ?? p.c, ppat: p.pat,
      goggles: gg.c, goggles2: gg.c2 ?? 0x16171c, skis: sk.c, skis2: sk.c2 ?? 0xffffff, skiDesign: sk.design ?? 'logo',
      deck: dk.c, deck2: dk.c2 ?? 0x15161a, deckDesign: dk.design ?? 'logo', gloves: gl.c, gloves2: gl.c2 ?? gl.c, poles: k('poles').c,
      board: !!board, skin: r.c, avatar: r.body, male: true, nopack: true, trail: k('trail').fx === 'snow' ? null : { c: k('trail').c, c2: k('trail').c2, fx: k('trail').fx } };
    if (h.beanie) { o.beanie = h.c; o.pom = !!h.pom; } else { o.beanie = 0; o.helmet = h.c; o.helmet2 = h.c2 ?? null; o.helmetFin = h.fin ?? 0; }
    // (grey ski boots under the kit, dark ones with a board)
    o.boots = o.board ? 0x2a2d35 : 0x70767c;
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
  yard: [['Ana Berg', 144000], ['Kai Lindqvist', 121500], ['Mila Novak', 100500], ['Theo Baumann', 78000], ['Elin Strand', 60000], ['Luca Ferrari', 43500], ['Hanna Aas', 27000]],
  slope: [['Jonas Falk', 96000], ['Sofia Rinaldi', 79500], ['Nils Eriksen', 61500], ['Clara Huber', 46500], ['Felix Gruber', 33000], ['Emil Steiner', 19500]],
  forest: [['Ingrid Dahl', 72000], ['Marco Valli', 58500], ['Lena Moser', 45000], ['Kai Lindqvist', 31500], ['Hanna Aas', 18000]],
  bigair: [['Theo Baumann', 51000], ['Mila Novak', 40500], ['Ana Berg', 30000], ['Jonas Falk', 19500], ['Elin Strand', 10500]],
};
