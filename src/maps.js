// The parks you can choose. Each is its own line down the mountain: a slope profile by
// section, how it winds, its features (kickers, rails, logs, drops), its named zones and
// how the forest grows around it. course.js builds the one active park from this.
import { smoothstep } from './noise.js';

export const MAPS = {
  yard: {
    name: 'The Yard', tag: 'Open session', blurb: 'Summit to village: wall hits, a rail yard, the terrain park and pipe, big air and a kicker line.',
    start: 30, finish: 3420, km: 3.4,
    sections: [
      { name: 'Summit Start', z0: -200, z1: 150, grad: 0.12, width: 70 },
      { name: 'The Wall', z0: 150, z1: 700, grad: 0.44, width: 80 },
      { name: 'Meadow Rollers', z0: 700, z1: 950, grad: 0.21, width: 90 },
      { name: 'Terrain Park', z0: 950, z1: 1490, grad: 0.2, width: 150 },
      { name: 'Glacier Bowl', z0: 1490, z1: 1900, grad: 0.39, width: 110 },
      { name: 'Pine Chute', z0: 1900, z1: 2400, grad: 0.27, width: 46 },
      { name: 'The Express', z0: 2400, z1: 2950, grad: 0.31, width: 70 },
      { name: 'Run-out', z0: 2950, z1: 3350, grad: 0.14, width: 80 },
      { name: 'Village', z0: 3350, z1: 9000, grad: 0.025, width: 120 },
    ],
    curve: (z) => 95 * Math.sin(z / 470 + 0.4) + 42 * Math.sin(z / 190 + 1.7) + 14 * Math.sin(z / 77),
    curveClamp: [90, 3260],
    crests: [
      { z: 2620, off: 0, h: 1.25, w: 64, ramp: 22 }, // full-width roller on The Express
      { z: 820, off: 0, h: 0.9, w: 80, ramp: 18 },
    ],
    park: { top: 1032, z0: 1040, z1: 1400 },
    race: true,
    parkJumps: [
      // speed: the approach (m/s at the foot of the ramp) that lands in the sweet spot (tools/parkjump.mjs)
      { name: 'Small', zone: 'Jump Line', z: 1062, dx: -28, h: 1.6, ramp: 6.5, table: 4, land: 8, w: 7, speed: 10.5 },
      { name: 'Medium', zone: 'Jump Line', z: 1130, dx: -28, h: 2.5, ramp: 8.5, table: 7, land: 11, w: 9, speed: 12.5 },
      { name: 'Large', zone: 'Jump Line', z: 1205, dx: -28, h: 3.3, ramp: 10.5, table: 10, land: 14, w: 11, speed: 14.6 },
      { name: 'XL', zone: 'Jump Line', z: 1290, dx: -28, h: 4.1, ramp: 12, table: 13, land: 17, w: 12, speed: 16.2 },
    ],
    // the rest of the run's kickers, each off to one side so the race line stays clear
    runJumps: [
      { name: 'Drop In', zone: 'Drop In', z: 112, dx: -22, h: 1.3, ramp: 6, table: 3, land: 7, w: 7 },
      { name: 'Wall Hit', zone: 'The Wall', z: 330, dx: -24, h: 1.5, ramp: 7, table: 2, land: 8, w: 8 },
      { name: 'Wall Hit', zone: 'The Wall', z: 450, dx: 24, h: 1.5, ramp: 7, table: 2, land: 8, w: 8 },
      { name: 'Wall Hit', zone: 'The Wall', z: 570, dx: -24, h: 1.5, ramp: 7, table: 2, land: 8, w: 8 },
      { name: 'Big Air', zone: 'Big Air', z: 1585, dx: 30, h: 4.6, ramp: 15, table: 6, land: 26, w: 14 },
      { name: 'Express', zone: 'Kicker Line', z: 2480, dx: -22, h: 2.2, ramp: 8, table: 5, land: 10, w: 9 },
      { name: 'Express', zone: 'Kicker Line', z: 2560, dx: 22, h: 2.4, ramp: 8.5, table: 5, land: 11, w: 9 },
      { name: 'Express', zone: 'Kicker Line', z: 2700, dx: -22, h: 2.6, ramp: 9, table: 6, land: 12, w: 10 },
      { name: 'Express', zone: 'Kicker Line', z: 2790, dx: 22, h: 2.8, ramp: 9.5, table: 6, land: 12, w: 10 },
      { name: 'Last Call', zone: 'Last Call', z: 3230, dx: -24, h: 2.4, ramp: 9, table: 6, land: 11, w: 10 },
    ],
    parkRails: [
      { name: 'Butter Box', z: 1062, dx: 26, len: 7, h: 0.45, kind: 'box', shape: 'down', color: 0x2a7de1 },
      { name: 'Down Rail', z: 1108, dx: 24, len: 9, h: 0.6, kind: 'rail', shape: 'down', color: 0xf2b705 },
      { name: 'Rainbow Box', z: 1155, dx: 28, len: 8, h: 0.5, kind: 'box', shape: 'rainbow', color: 0xff4f8b },
      { name: 'Kinked Rail', z: 1205, dx: 24, len: 11, h: 0.65, kind: 'rail', shape: 'kink', color: 0xd8342c },
      { name: 'Flat Box', z: 1258, dx: 28, len: 7, h: 0.5, kind: 'box', shape: 'flat', color: 0x18a868 },
      { name: 'Long Tube', z: 1305, dx: 25, len: 14, h: 0.8, kind: 'rail', shape: 'down', color: 0xff6a2b },
    ].map((r) => ({ ...r, zone: 'Rail Garden' })),
    runRails: [
      { name: 'Start Box', zone: 'Drop In', z: 116, dx: 22, len: 8, h: 0.5, kind: 'box', shape: 'flat', color: 0x2a7de1 },
      { name: 'Yard Rail', zone: 'Rail Yard', z: 740, dx: 24, len: 10, h: 0.7, kind: 'rail', shape: 'down', color: 0xf2b705 },
      { name: 'Yard Box', zone: 'Rail Yard', z: 775, dx: -24, len: 9, h: 0.5, kind: 'box', shape: 'flat', color: 0x18a868 },
      { name: 'Yard Kink', zone: 'Rail Yard', z: 860, dx: 24, len: 12, h: 0.7, kind: 'rail', shape: 'kink', color: 0xd8342c },
      { name: 'Yard Rainbow', zone: 'Rail Yard', z: 900, dx: -24, len: 9, h: 0.55, kind: 'box', shape: 'rainbow', color: 0xff4f8b },
      { name: 'Forest Rail', zone: 'Forest Line', z: 2050, dx: 17, len: 10, h: 0.6, kind: 'rail', shape: 'down', color: 0xff6a2b },
      { name: 'Forest Box', zone: 'Forest Line', z: 2200, dx: -17, len: 10, h: 0.5, kind: 'box', shape: 'down', color: 0x8e3fd1 },
      { name: 'Last Box', zone: 'Last Call', z: 3020, dx: 24, len: 10, h: 0.5, kind: 'box', shape: 'flat', color: 0x2a7de1 },
      { name: 'Last Tube', zone: 'Last Call', z: 3080, dx: -24, len: 14, h: 0.75, kind: 'rail', shape: 'down', color: 0xf2b705 },
      { name: 'Last Kink', zone: 'Last Call', z: 3150, dx: 24, len: 11, h: 0.7, kind: 'rail', shape: 'kink', color: 0xd8342c },
    ],
    zones: [
      { name: 'Drop In', z1: 170 }, { name: 'The Wall', z1: 700 }, { name: 'Rail Yard', z1: 950 }, { name: 'Terrain Park', z1: 1490 },
      { name: 'Big Air', z1: 1680 }, { name: 'Glacier Bowl', z1: 1900 }, { name: 'Forest Line', z1: 2400 }, { name: 'Kicker Line', z1: 2950 },
      { name: 'Last Call', z1: 3410 }, { name: 'Finish', z1: 3480 },
    ],
    signs: { 'Drop In': 'BOX · KICKER', 'The Wall': 'WALL HITS', 'Rail Yard': 'RAILS · BOXES · KINK', 'Big Air': 'ONE BIG KICKER', 'Forest Line': 'TREE RAILS', 'Kicker Line': 'FOUR TABLES', 'Last Call': 'RAILS · ONE MORE TABLE' },
    moguls: { z0: 1530, z1: 1860 },
    icy: [[180, 690], [1500, 1870], [2450, 2900]],
    // forest rules on top of the tree line and patchiness
    trees(z, s, d) {
      if (z > 1450 && z < 1900) d *= 0.25 + 0.75 * smoothstep(60, 160, s); // the glacier bowl is open
      if (z > 1880 && z < 2420) d = Math.max(d, 1.0); // Pine Chute: a wall of trees right at the edge
      return d;
    },
  },

  // a compact pro slopestyle line: a rail zone, three stepped kickers, then a huge big air
  slope: {
    name: 'Trick Zone', tag: 'Slopestyle', blurb: 'A pro slopestyle line: a rail zone, three big step-up kickers and a huge big air to finish.',
    start: 30, finish: 1420, km: 1.4,
    sections: [
      { name: 'Start', z0: -200, z1: 110, grad: 0.12, width: 60 },
      { name: 'Rail Zone', z0: 110, z1: 500, grad: 0.18, width: 76 },
      { name: 'Kicker Line', z0: 500, z1: 1050, grad: 0.26, width: 72 },
      { name: 'Big Air', z0: 1050, z1: 1330, grad: 0.34, width: 76 },
      { name: 'Finish', z0: 1330, z1: 1500, grad: 0.1, width: 90 },
      { name: 'Base', z0: 1500, z1: 9000, grad: 0.025, width: 120 },
    ],
    curve: (z) => 26 * Math.sin(z / 330 + 0.6) + 10 * Math.sin(z / 140 + 2),
    curveClamp: [90, 1300],
    crests: [],
    runJumps: [
      { name: 'Step One', zone: 'Kicker Line', z: 560, dx: 0, h: 2.8, ramp: 9, table: 8, land: 13, w: 14 },
      { name: 'Step Two', zone: 'Kicker Line', z: 710, dx: 0, h: 3.5, ramp: 10.5, table: 11, land: 15, w: 14 },
      { name: 'Step Three', zone: 'Kicker Line', z: 875, dx: 0, h: 4.2, ramp: 12, table: 13, land: 18, w: 15 },
      { name: 'Big Air', zone: 'Big Air', z: 1110, dx: 0, h: 6, ramp: 18, table: 8, land: 32, w: 18 },
    ],
    runRails: [
      { name: 'Entry Box', z: 150, dx: -13, len: 8, h: 0.5, kind: 'box', shape: 'flat', color: 0x2a7de1 },
      { name: 'Down Bar', z: 150, dx: 13, len: 9, h: 0.6, kind: 'rail', shape: 'down', color: 0xf2b705 },
      { name: 'Rainbow', z: 215, dx: 0, len: 9, h: 0.55, kind: 'box', shape: 'rainbow', color: 0xff4f8b },
      { name: 'Kink', z: 285, dx: -13, len: 12, h: 0.7, kind: 'rail', shape: 'kink', color: 0xd8342c },
      { name: 'Down Box', z: 285, dx: 13, len: 10, h: 0.5, kind: 'box', shape: 'down', color: 0x18a868 },
      { name: 'Big Tube', z: 355, dx: 0, len: 16, h: 0.85, kind: 'rail', shape: 'down', color: 0xff6a2b },
      { name: 'Flat Box', z: 430, dx: -13, len: 9, h: 0.5, kind: 'box', shape: 'flat', color: 0x8e3fd1 },
      { name: 'Flat Bar', z: 430, dx: 13, len: 10, h: 0.7, kind: 'rail', shape: 'flat', color: 0x2a7de1 },
    ].map((r) => ({ ...r, zone: 'Rail Zone' })),
    zones: [{ name: 'Drop In', z1: 110 }, { name: 'Rail Zone', z1: 500 }, { name: 'Kicker Line', z1: 1050 }, { name: 'Big Air', z1: 1330 }, { name: 'Finish', z1: 1480 }],
    signs: { 'Rail Zone': 'BOXES · BARS · KINK', 'Kicker Line': 'THREE STEP-UPS', 'Big Air': 'SEND IT' },
    icy: [],
    trees(z, s, d) { return d * 0.8; },
  },

  // tree skiing: open glades of powder between the pines, a winding trail, pillow drops and logs
  forest: {
    name: 'Forest Line', tag: 'Tree skiing', blurb: 'Powder glades between the pines, a winding tree trail, pillow drops and a log jam.',
    start: 30, finish: 2300, km: 2.3,
    sections: [
      { name: 'Start', z0: -200, z1: 140, grad: 0.12, width: 50 },
      { name: 'Upper Glades', z0: 140, z1: 760, grad: 0.3, width: 120 },
      { name: 'Tree Trail', z0: 760, z1: 1260, grad: 0.22, width: 36 },
      { name: 'Pillow Glade', z0: 1260, z1: 1700, grad: 0.34, width: 100 },
      { name: 'Log Jam', z0: 1700, z1: 2060, grad: 0.2, width: 52 },
      { name: 'Run-out', z0: 2060, z1: 2380, grad: 0.1, width: 70 },
      { name: 'Base', z0: 2380, z1: 9000, grad: 0.025, width: 120 },
    ],
    curve: (z) => 60 * Math.sin(z / 300 + 1.1) + 34 * Math.sin(z / 125 + 0.3),
    curveClamp: [110, 2200],
    crests: [
      { z: 900, off: 0, h: 1.0, w: 40, ramp: 14 },
      { z: 1080, off: 0, h: 1.2, w: 40, ramp: 14 },
    ],
    runJumps: [
      { name: 'Side Hit', zone: 'Upper Glades', z: 300, dx: -30, h: 1.4, ramp: 6, table: 2, land: 6, w: 6 },
      { name: 'Side Hit', zone: 'Upper Glades', z: 450, dx: 34, h: 1.6, ramp: 6, table: 2, land: 7, w: 6 },
      { name: 'Roller Kick', zone: 'Upper Glades', z: 600, dx: -10, h: 1.8, ramp: 7, table: 3, land: 9, w: 9 },
      { name: 'Trail Booter', zone: 'Tree Trail', z: 1180, dx: 0, h: 2.0, ramp: 8, table: 4, land: 10, w: 8 },
      // pillow drops: a short rise, a flat top, then a sharp ledge down to the natural slope
      { name: 'Pillow Drop', zone: 'Pillow Glade', z: 1350, dx: -25, h: 2.2, ramp: 3, table: 7, land: 2.5, w: 10, drop: true },
      { name: 'Pillow Drop', zone: 'Pillow Glade', z: 1470, dx: 22, h: 2.6, ramp: 3, table: 8, land: 2.5, w: 10, drop: true },
      { name: 'Big Pillow', zone: 'Pillow Glade', z: 1600, dx: -10, h: 3.0, ramp: 3.5, table: 9, land: 3, w: 12, drop: true },
    ],
    runRails: [
      { name: 'Trail Log', zone: 'Tree Trail', z: 1000, dx: 10, len: 8, h: 0.42, kind: 'log', shape: 'down' },
      { name: 'Fallen Log', zone: 'Log Jam', z: 1740, dx: -12, len: 9, h: 0.45, kind: 'log', shape: 'down' },
      { name: 'Flat Log', zone: 'Log Jam', z: 1800, dx: 12, len: 11, h: 0.5, kind: 'log', shape: 'flat' },
      { name: 'Log Ride', zone: 'Log Jam', z: 1880, dx: 0, len: 14, h: 0.55, kind: 'log', shape: 'down' },
      { name: 'Twin Log', zone: 'Log Jam', z: 1960, dx: -14, len: 9, h: 0.45, kind: 'log', shape: 'down' },
      { name: 'Twin Log', zone: 'Log Jam', z: 1960, dx: 14, len: 9, h: 0.45, kind: 'log', shape: 'down' },
    ].map((r) => ({ ...r, color: 0x6b4a32 })),
    zones: [
      { name: 'Drop In', z1: 140 }, { name: 'Upper Glades', z1: 760 }, { name: 'Tree Trail', z1: 1260 }, { name: 'Pillow Glade', z1: 1700 },
      { name: 'Log Jam', z1: 2060 }, { name: 'Run-out', z1: 2290 }, { name: 'Finish', z1: 2360 },
    ],
    signs: { 'Upper Glades': 'POWDER · TREES · SIDE HITS', 'Tree Trail': 'ROLLERS · A LOG', 'Pillow Glade': 'THREE DROPS', 'Log Jam': 'LOGS' },
    // trees grow inside the glades too: weave through them
    glades: [[170, 740, 0.14], [1290, 1690, 0.11]],
    // ungroomed: soft snow on the trail, powder in the glades
    soft(z) {
      for (const [a, b] of [[160, 750], [1280, 1700]]) if (z > a - 30 && z < b + 30) return 0.65 * smoothstep(a - 30, a + 10, z) * (1 - smoothstep(b - 10, b + 30, z)) + 0.25;
      return z > 150 && z < 2060 ? 0.35 : 0;
    },
    icy: [],
    trees(z, s, d) { return d * 0.7; },
  },

  // one huge kicker off a steep inrun
  bigair: {
    name: 'Big Air', tag: 'One huge kicker', blurb: 'A steep inrun, one gigantic kicker and a landing hill that goes on for ever.',
    start: 30, finish: 760, km: 0.8,
    sections: [
      { name: 'Start', z0: -200, z1: 70, grad: 0.1, width: 46 },
      { name: 'Inrun', z0: 70, z1: 300, grad: 0.5, width: 34 },
      { name: 'Big Air', z0: 300, z1: 560, grad: 0.4, width: 70 },
      { name: 'Run-out', z0: 560, z1: 820, grad: 0.1, width: 80 },
      { name: 'Base', z0: 820, z1: 9000, grad: 0.025, width: 120 },
    ],
    curve: () => 0,
    curveClamp: [0, 800],
    crests: [],
    runJumps: [
      { name: 'Mega Kicker', zone: 'Big Air', z: 312, dx: 0, h: 6.5, ramp: 20, table: 8, land: 36, w: 18 },
    ],
    runRails: [],
    zones: [{ name: 'Drop In', z1: 70 }, { name: 'Inrun', z1: 300 }, { name: 'Big Air', z1: 560 }, { name: 'Finish', z1: 820 }],
    signs: { 'Big Air': 'MEGA KICKER' },
    icy: [],
    trees(z, s, d) { return d; },
  },
};

export const MAP_IDS = Object.keys(MAPS);

// which park this page (or worker, or node tool) is running
export function resolveParkId() {
  let id = null;
  try {
    if (typeof window !== 'undefined' && window.location) {
      id = new URLSearchParams(window.location.search).get('park');
      if (!id) id = window.localStorage?.getItem('alpenglow.park');
    } else if (typeof self !== 'undefined' && typeof self.name === 'string' && self.name.startsWith('park=')) {
      id = self.name.slice(5);
    } else if (typeof process !== 'undefined') {
      id = process.env?.PARK;
    }
  } catch { /* storage blocked */ }
  return MAPS[id] ? id : 'yard';
}
