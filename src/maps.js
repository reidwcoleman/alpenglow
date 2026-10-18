// The parks you can choose. Each is its own line down the mountain: a slope profile by
// section, how it winds, its features (kickers, rails, logs, drops), its named zones and
// how the forest grows around it. course.js builds the one active park from this.
import { smoothstep } from './noise.js';

export const MAPS = {
  yard: {
    name: 'The Yard', tag: 'Open session', blurb: 'Summit to village: wall hits, a rail yard, the terrain park and pipe, big air and a kicker line.',
    start: 30, finish: 3420, km: 3.4,
    sections: [
      { name: 'Summit Start', z0: -200, z1: 150, grad: 0.16, width: 70 },
      { name: 'The Wall', z0: 150, z1: 700, grad: 0.44, width: 80 },
      { name: 'Meadow Rollers', z0: 700, z1: 950, grad: 0.21, width: 90 },
      { name: 'Terrain Park', z0: 950, z1: 1490, grad: 0.2, width: 150 },
      { name: 'Glacier Bowl', z0: 1490, z1: 1900, grad: 0.39, width: 110 },
      { name: 'Pine Chute', z0: 1900, z1: 2400, grad: 0.27, width: 46 },
      { name: 'The Express', z0: 2400, z1: 2950, grad: 0.31, width: 70 },
      { name: 'Run-out', z0: 2950, z1: 3350, grad: 0.13, width: 80 },
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
    name: 'Trick Zone', tag: 'Slopestyle · 3 km', blurb: 'A pro slopestyle course top to bottom: a rail zone, three step-ups, a garden of hips, Jib Street, a step-down line, a huge big air and a last rail section.',
    start: 30, finish: 3040, km: 3.0, calm: true,
    sections: [
      { name: 'Start', z0: -200, z1: 110, grad: 0.16, width: 60 },
      { name: 'Rail Zone', z0: 110, z1: 500, grad: 0.18, width: 76 },
      { name: 'Kicker Line', z0: 500, z1: 1050, grad: 0.26, width: 72 },
      { name: 'Hip Garden', z0: 1050, z1: 1450, grad: 0.23, width: 110 },
      { name: 'Jib Street', z0: 1450, z1: 1950, grad: 0.18, width: 92 },
      { name: 'Step-Down Line', z0: 1950, z1: 2350, grad: 0.27, width: 90 },
      { name: 'Big Air', z0: 2350, z1: 2650, grad: 0.34, width: 80 },
      { name: 'Final Jib', z0: 2650, z1: 2950, grad: 0.16, width: 90 },
      { name: 'Finish', z0: 2950, z1: 3120, grad: 0.13, width: 100 },
      { name: 'Base', z0: 3120, z1: 9000, grad: 0.025, width: 120 },
    ],
    curve: (z) => 26 * Math.sin(z / 330 + 0.6) + 10 * Math.sin(z / 140 + 2),
    curveClamp: [90, 2930],
    crests: [],
    runJumps: [
      { name: 'Step One', zone: 'Kicker Line', z: 560, dx: 0, h: 2.8, ramp: 9, table: 8, land: 13, w: 14 },
      { name: 'Step Two', zone: 'Kicker Line', z: 710, dx: 0, h: 3.5, ramp: 10.5, table: 11, land: 15, w: 14 },
      { name: 'Step Three', zone: 'Kicker Line', z: 875, dx: 0, h: 4.2, ramp: 12, table: 13, land: 18, w: 15 },
      // hip garden: hips left and right, a spine down the middle, a medium to finish it
      ...[[1100, -26], [1160, 26], [1230, -24], [1300, 24]].map(([z, dx], i) => ({ name: 'Hip', zone: 'Hip Garden', z, dx, h: 2.2 + (i % 2) * 0.4, ramp: 8, table: 3, land: 10, w: 10 })),
      { name: 'Spine', zone: 'Hip Garden', z: 1190, dx: 0, h: 1.9, ramp: 7, table: 1.5, land: 8, w: 12 },
      { name: 'Medium', zone: 'Hip Garden', z: 1370, dx: 0, h: 2.6, ramp: 8.5, table: 7, land: 11, w: 12 },
      // step-downs, then a gap, then one more
      { name: 'Step-Down', zone: 'Step-Down Line', z: 1990, dx: -18, h: 2.4, ramp: 3, table: 7, land: 2.5, w: 12, drop: true },
      { name: 'Step-Down', zone: 'Step-Down Line', z: 2070, dx: 16, h: 3.0, ramp: 3, table: 8, land: 3, w: 12, drop: true },
      { name: 'Gap', zone: 'Step-Down Line', z: 2150, dx: 0, h: 3.6, ramp: 11, table: 18, land: 16, w: 13 },
      { name: 'Step-Down', zone: 'Step-Down Line', z: 2260, dx: -16, h: 3.4, ramp: 3.5, table: 9, land: 3, w: 12, drop: true },
      { name: 'Big Air', zone: 'Big Air', z: 2410, dx: 0, h: 6, ramp: 18, table: 8, land: 32, w: 18 },
      { name: 'Small', zone: 'Final Jib', z: 2800, dx: 18, h: 1.7, ramp: 6.5, table: 4, land: 8, w: 9 },
    ],
    runRails: [
      ...[
        { name: 'Entry Box', z: 150, dx: -13, len: 8, h: 0.5, kind: 'box', shape: 'flat', color: 0x2a7de1 },
        { name: 'Down Bar', z: 150, dx: 13, len: 9, h: 0.6, kind: 'rail', shape: 'down', color: 0xf2b705 },
        { name: 'Rainbow', z: 215, dx: 0, len: 9, h: 0.55, kind: 'box', shape: 'rainbow', color: 0xff4f8b },
        { name: 'Kink', z: 285, dx: -13, len: 12, h: 0.7, kind: 'rail', shape: 'kink', color: 0xd8342c },
        { name: 'Down Box', z: 285, dx: 13, len: 10, h: 0.5, kind: 'box', shape: 'down', color: 0x18a868 },
        { name: 'Big Tube', z: 355, dx: 0, len: 16, h: 0.85, kind: 'rail', shape: 'down', color: 0xff6a2b },
        { name: 'Flat Box', z: 430, dx: -13, len: 9, h: 0.5, kind: 'box', shape: 'flat', color: 0x8e3fd1 },
        { name: 'Flat Bar', z: 430, dx: 13, len: 10, h: 0.7, kind: 'rail', shape: 'flat', color: 0x2a7de1 },
      ].map((r) => ({ ...r, zone: 'Rail Zone' })),
      // jib street: three lanes, every kind of rail and box, then the long tube down the middle
      ...[[1490, 'box', 'flat'], [1570, 'rail', 'down'], [1650, 'box', 'rainbow'], [1730, 'rail', 'kink'], [1810, 'box', 'down']]
        .flatMap(([z, kind, shape], i) => [-26, 0, 26].map((dx, j) => ({
          name: ['Street Box', 'Street Bar', 'Street Rainbow', 'Street Kink', 'Street Down'][i] + ' ' + 'ABC'[j], zone: 'Jib Street', z: z + j * 10, dx,
          len: 9 + j * 2 + (shape === 'kink' ? 3 : 0), h: kind === 'box' ? 0.5 : 0.65, kind: shape === 'kink' ? 'rail' : j === 1 ? (kind === 'box' ? 'rail' : 'box') : kind, shape,
          color: [0x2a7de1, 0xf2b705, 0xff4f8b, 0xd8342c, 0x18a868, 0x8e3fd1][(i + j * 2) % 6],
        }))),
      { name: 'The Long Tube', zone: 'Jib Street', z: 1885, dx: 0, len: 24, h: 0.9, kind: 'rail', shape: 'down', color: 0xff6a2b },
      { name: 'Last Box', zone: 'Final Jib', z: 2700, dx: -16, len: 12, h: 0.5, kind: 'box', shape: 'flat', color: 0x2a7de1 },
      { name: 'Last Kink', zone: 'Final Jib', z: 2740, dx: 14, len: 13, h: 0.7, kind: 'rail', shape: 'kink', color: 0xd8342c },
      { name: 'Last Rainbow', zone: 'Final Jib', z: 2860, dx: -14, len: 10, h: 0.55, kind: 'box', shape: 'rainbow', color: 0xff4f8b },
      { name: 'Last Tube', zone: 'Final Jib', z: 2900, dx: 12, len: 14, h: 0.8, kind: 'rail', shape: 'down', color: 0xf2b705 },
    ],
    zones: [{ name: 'Drop In', z1: 110 }, { name: 'Rail Zone', z1: 500 }, { name: 'Kicker Line', z1: 1050 }, { name: 'Hip Garden', z1: 1450 }, { name: 'Jib Street', z1: 1950 },
      { name: 'Step-Down Line', z1: 2350 }, { name: 'Big Air', z1: 2650 }, { name: 'Final Jib', z1: 2950 }, { name: 'Finish', z1: 3060 }],
    signs: { 'Rail Zone': 'BOXES · BARS · KINK', 'Kicker Line': 'THREE STEP-UPS', 'Hip Garden': 'HIPS · A SPINE', 'Jib Street': '16 RAILS & BOXES', 'Step-Down Line': 'STEP-DOWNS · GAP', 'Big Air': 'SEND IT', 'Final Jib': 'RAILS · ONE KICKER' },
    icy: [],
    trees(z, s, d) { return d * 0.8; },
  },

  // tree skiing: open glades of powder between the pines, a winding trail, pillow drops and logs
  forest: {
    name: 'Forest Line', tag: 'Tree skiing', blurb: 'Powder glades between the pines, a winding tree trail, pillow drops and a log jam.',
    start: 30, finish: 2300, km: 2.3,
    sections: [
      { name: 'Start', z0: -200, z1: 140, grad: 0.16, width: 50 },
      { name: 'Upper Glades', z0: 140, z1: 760, grad: 0.3, width: 120 },
      { name: 'Tree Trail', z0: 760, z1: 1260, grad: 0.22, width: 36 },
      { name: 'Pillow Glade', z0: 1260, z1: 1700, grad: 0.34, width: 100 },
      { name: 'Log Jam', z0: 1700, z1: 2060, grad: 0.2, width: 52 },
      { name: 'Run-out', z0: 2060, z1: 2380, grad: 0.13, width: 70 },
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
    start: 30, finish: 760, km: 0.8, calm: true,
    sections: [
      { name: 'Start', z0: -200, z1: 70, grad: 0.16, width: 46 },
      { name: 'Inrun', z0: 70, z1: 300, grad: 0.5, width: 34 },
      { name: 'Big Air', z0: 300, z1: 560, grad: 0.4, width: 70 },
      { name: 'Run-out', z0: 560, z1: 820, grad: 0.13, width: 80 },
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

  // a long tree run: glades where the pines stand on the run itself, slalom woods, a creek trail
  timber: {
    name: 'Timberline', tag: 'Tree run · 5.7 km', blurb: 'Five and a half kilometres through the forest: weave the glades, thread the slalom woods, follow the creek trail and pop the pillows.',
    start: 30, finish: 5700, km: 5.7,
    sections: [
      { name: 'Start', z0: -200, z1: 140, grad: 0.16, width: 50 },
      { name: 'Spruce Glades', z0: 140, z1: 1100, grad: 0.28, width: 110 },
      { name: 'Slalom Woods', z0: 1100, z1: 1800, grad: 0.25, width: 70 },
      { name: 'Creek Trail', z0: 1800, z1: 2500, grad: 0.17, width: 32 },
      { name: 'Old Growth', z0: 2500, z1: 3400, grad: 0.31, width: 120 },
      { name: 'Birch Run', z0: 3400, z1: 4300, grad: 0.26, width: 64 },
      { name: 'Lumber Yard', z0: 4300, z1: 4900, grad: 0.2, width: 56 },
      { name: 'Lower Woods', z0: 4900, z1: 5500, grad: 0.22, width: 90 },
      { name: 'Run-out', z0: 5500, z1: 5800, grad: 0.13, width: 70 },
      { name: 'Base', z0: 5800, z1: 99999, grad: 0.025, width: 120 },
    ],
    curve: (z) => 80 * Math.sin(z / 380 + 1.1) + 40 * Math.sin(z / 160 + 0.3) + 12 * Math.sin(z / 64 + 2),
    curveClamp: [110, 5600],
    crests: [
      { z: 2000, off: 0, h: 1.0, w: 34, ramp: 14 }, { z: 2180, off: 0, h: 1.2, w: 34, ramp: 14 }, { z: 2380, off: 0, h: 1.1, w: 34, ramp: 14 },
    ],
    runJumps: [
      { name: 'Side Hit', zone: 'Spruce Glades', z: 380, dx: -32, h: 1.4, ramp: 6, table: 2, land: 6, w: 6 },
      { name: 'Side Hit', zone: 'Spruce Glades', z: 720, dx: 30, h: 1.6, ramp: 6, table: 2, land: 7, w: 6 },
      { name: 'Root Kicker', zone: 'Slalom Woods', z: 1500, dx: 0, h: 1.8, ramp: 7, table: 3, land: 9, w: 8 },
      { name: 'Pillow Drop', zone: 'Old Growth', z: 2700, dx: -28, h: 2.2, ramp: 3, table: 7, land: 2.5, w: 10, drop: true },
      { name: 'Pillow Drop', zone: 'Old Growth', z: 2900, dx: 26, h: 2.6, ramp: 3, table: 8, land: 2.5, w: 10, drop: true },
      { name: 'Big Pillow', zone: 'Old Growth', z: 3150, dx: -6, h: 3.0, ramp: 3.5, table: 9, land: 3, w: 12, drop: true },
      { name: 'Stump Jump', zone: 'Birch Run', z: 3800, dx: 14, h: 2.0, ramp: 8, table: 4, land: 10, w: 8 },
      { name: 'Creek Gap', zone: 'Lower Woods', z: 5200, dx: 0, h: 2.4, ramp: 8, table: 6, land: 11, w: 10 },
    ],
    runRails: [
      { name: 'Creek Log', zone: 'Creek Trail', z: 2100, dx: 8, len: 9, h: 0.42, kind: 'log', shape: 'down' },
      { name: 'Fallen Log', zone: 'Lumber Yard', z: 4380, dx: -12, len: 9, h: 0.45, kind: 'log', shape: 'down' },
      { name: 'Flat Log', zone: 'Lumber Yard', z: 4480, dx: 12, len: 11, h: 0.5, kind: 'log', shape: 'flat' },
      { name: 'Log Ride', zone: 'Lumber Yard', z: 4600, dx: 0, len: 14, h: 0.55, kind: 'log', shape: 'down' },
      { name: 'Twin Log', zone: 'Lumber Yard', z: 4740, dx: -14, len: 9, h: 0.45, kind: 'log', shape: 'down' },
      { name: 'Twin Log', zone: 'Lumber Yard', z: 4740, dx: 14, len: 9, h: 0.45, kind: 'log', shape: 'down' },
    ].map((r) => ({ ...r, color: 0x6b4a32 })),
    zones: [
      { name: 'Drop In', z1: 140 }, { name: 'Spruce Glades', z1: 1100 }, { name: 'Slalom Woods', z1: 1800 }, { name: 'Creek Trail', z1: 2500 },
      { name: 'Old Growth', z1: 3400 }, { name: 'Birch Run', z1: 4300 }, { name: 'Lumber Yard', z1: 4900 }, { name: 'Lower Woods', z1: 5500 },
      { name: 'Run-out', z1: 5690 }, { name: 'Finish', z1: 5760 },
    ],
    signs: { 'Spruce Glades': 'TREES ON THE RUN', 'Slalom Woods': 'WEAVE', 'Creek Trail': 'NARROW · ROLLERS', 'Old Growth': 'PILLOWS', 'Birch Run': 'TREES · A KICKER', 'Lumber Yard': 'LOGS', 'Lower Woods': 'CREEK GAP' },
    // the pines grow on the run: [z0, z1, density]
    glades: [[170, 1080, 0.12], [1120, 1780, 0.19], [2520, 3380, 0.1], [3420, 4280, 0.15], [4920, 5480, 0.09]],
    soft(z) {
      for (const [a, b] of [[160, 1090], [2510, 3390], [4910, 5490]]) if (z > a - 30 && z < b + 30) return 0.6 * smoothstep(a - 30, a + 10, z) * (1 - smoothstep(b - 10, b + 30, z)) + 0.25;
      return z > 150 && z < 5500 ? 0.3 : 0;
    },
    icy: [],
    trees(z, s, d) { return Math.max(d, 0.6) * 0.85; },
  },

  // the big mountain: summit ridge to the village, 8.5 km and ~2.5 km of vertical
  grand: {
    name: 'Grand Descent', tag: 'Big mountain · 8.5 km', blurb: 'From the summit ridge to the village: a north face, the glacier, a couloir, a giant bowl, cornices and treeline steeps, then the long road home.',
    start: 30, finish: 8500, km: 8.5,
    sections: [
      { name: 'Summit Ridge', z0: -200, z1: 200, grad: 0.14, width: 60 },
      { name: 'North Face', z0: 200, z1: 900, grad: 0.46, width: 96 },
      { name: 'The Glacier', z0: 900, z1: 1900, grad: 0.29, width: 180 },
      { name: 'The Couloir', z0: 1900, z1: 2300, grad: 0.52, width: 36 },
      { name: 'Big Bowl', z0: 2300, z1: 3400, grad: 0.36, width: 200 },
      { name: 'Cornice Traverse', z0: 3400, z1: 3900, grad: 0.2, width: 54 },
      { name: 'Treeline Steeps', z0: 3900, z1: 5000, grad: 0.35, width: 84 },
      { name: 'Valley Glades', z0: 5000, z1: 6200, grad: 0.26, width: 100 },
      { name: 'The Long Road', z0: 6200, z1: 7600, grad: 0.19, width: 46 },
      { name: 'Village Run', z0: 7600, z1: 8550, grad: 0.15, width: 90 },
      { name: 'Village', z0: 8550, z1: 99999, grad: 0.025, width: 120 },
    ],
    curve: (z) => 150 * Math.sin(z / 760 + 0.5) + 60 * Math.sin(z / 280 + 1.9) + 18 * Math.sin(z / 95),
    curveClamp: [120, 8380],
    crests: [
      { z: 1300, off: -30, h: 1.4, w: 90, ramp: 22 }, { z: 1600, off: 30, h: 1.6, w: 90, ramp: 24 },
      { z: 6600, off: 0, h: 1.0, w: 40, ramp: 16 }, { z: 7000, off: 0, h: 1.1, w: 40, ramp: 16 }, { z: 7300, off: 0, h: 0.9, w: 40, ramp: 16 },
    ],
    runJumps: [
      { name: 'Wind Lip', zone: 'The Glacier', z: 1100, dx: -50, h: 1.8, ramp: 8, table: 3, land: 10, w: 10 },
      { name: 'Wind Lip', zone: 'The Glacier', z: 1750, dx: 45, h: 2.2, ramp: 9, table: 4, land: 12, w: 12 },
      { name: 'Bowl Kicker', zone: 'Big Bowl', z: 2700, dx: -40, h: 3.0, ramp: 10, table: 8, land: 14, w: 12 },
      { name: 'Cornice', zone: 'Cornice Traverse', z: 3500, dx: -10, h: 2.4, ramp: 3, table: 6, land: 2.5, w: 14, drop: true },
      { name: 'Cornice', zone: 'Cornice Traverse', z: 3700, dx: 12, h: 3.2, ramp: 3, table: 7, land: 3, w: 14, drop: true },
      { name: 'Rock Drop', zone: 'Treeline Steeps', z: 4300, dx: 20, h: 2.8, ramp: 3, table: 6, land: 3, w: 10, drop: true },
      { name: 'Road Gap', zone: 'Valley Glades', z: 5600, dx: 0, h: 2.6, ramp: 9, table: 7, land: 12, w: 12 },
    ],
    runRails: [],
    zones: [
      { name: 'Summit Ridge', z1: 200 }, { name: 'North Face', z1: 900 }, { name: 'The Glacier', z1: 1900 }, { name: 'The Couloir', z1: 2300 },
      { name: 'Big Bowl', z1: 3400 }, { name: 'Cornice Traverse', z1: 3900 }, { name: 'Treeline Steeps', z1: 5000 }, { name: 'Valley Glades', z1: 6200 },
      { name: 'The Long Road', z1: 7600 }, { name: 'Village Run', z1: 8490 }, { name: 'Finish', z1: 8560 },
    ],
    signs: { 'North Face': 'STEEP · ICY', 'The Glacier': 'WIDE OPEN', 'The Couloir': 'EXPERTS ONLY', 'Big Bowl': 'BOWL · MOGULS', 'Cornice Traverse': 'CORNICE DROPS', 'Treeline Steeps': 'STEEP TREES', 'Valley Glades': 'GLADES', 'The Long Road': 'CAT TRACK' },
    moguls: { z0: 2500, z1: 3200 },
    glades: [[5050, 6150, 0.07]],
    // (above the tree line it's open mountain: only the glades grow trees on the run)
    forestEdge: false,
    soft(z) {
      if (z > 900 && z < 1900) return 0.35;
      if (z > 2300 && z < 3400) return 0.45;
      if (z > 5000 && z < 6200) return 0.5;
      return 0;
    },
    icy: [[220, 880], [1920, 2280], [4000, 4700]],
    trees(z, s, d) { return d; },
  },

  // the big park: a jib garden, two kicker lines, a pipe, two big airs, step-downs
  mega: {
    name: 'Mega Park', tag: 'The big park · 4.3 km', blurb: 'The biggest park on the mountain, top to bottom: a jib garden, two kicker lines up to XXL, a halfpipe, twin big airs, step-downs, Rainbow Road, three lines of tables and a slopestyle finale.',
    start: 30, finish: 4240, km: 4.3, calm: true,
    sections: [
      { name: 'Drop In', z0: -200, z1: 120, grad: 0.16, width: 70 },
      { name: 'Jib Garden', z0: 120, z1: 650, grad: 0.17, width: 150 },
      { name: 'Kicker Alley', z0: 650, z1: 1330, grad: 0.24, width: 160 },
      { name: 'The Pipe', z0: 1330, z1: 1660, grad: 0.19, width: 170 },
      { name: 'Big Air Duo', z0: 1660, z1: 2060, grad: 0.33, width: 140 },
      { name: 'Step-Down Line', z0: 2060, z1: 2400, grad: 0.27, width: 120 },
      { name: 'Rainbow Road', z0: 2400, z1: 2800, grad: 0.17, width: 140 },
      { name: 'Triple Threat', z0: 2800, z1: 3340, grad: 0.26, width: 160 },
      { name: 'Slopestyle Final', z0: 3340, z1: 3880, grad: 0.26, width: 130 },
      { name: 'Last Jib', z0: 3880, z1: 4180, grad: 0.15, width: 120 },
      { name: 'Finish', z0: 4180, z1: 4330, grad: 0.13, width: 120 },
      { name: 'Base', z0: 4330, z1: 99999, grad: 0.025, width: 120 },
    ],
    curve: (z) => 30 * Math.sin(z / 520 + 0.4) + 10 * Math.sin(z / 210 + 2),
    curveClamp: [90, 4130],
    crests: [],
    park: { top: 1335, z0: 1345, z1: 1650 },
    pipe: { z0: 1370, z1: 1640, dx: 4 },
    rollers: { z0: 1360, z1: 1640, dx: -60 },
    runJumps: [
      // kicker alley: two lines side by side, small to XXL
      ...[['Small', 1.6, 6.5, 4, 8, 7, 680], ['Medium', 2.5, 8.5, 7, 11, 9, 770], ['Large', 3.3, 10.5, 10, 14, 11, 870], ['XL', 4.1, 12, 13, 17, 12, 990], ['XL', 4.1, 12, 13, 17, 12, 1120]]
        .map(([n, h, ramp, table, land, w, z]) => ({ name: n, zone: 'Kicker Alley', z, dx: -34, h, ramp, table, land, w })),
      ...[['Medium', 2.5, 8.5, 7, 11, 9, 700], ['Large', 3.3, 10.5, 10, 14, 11, 800], ['XL', 4.1, 12, 13, 17, 12, 920], ['XXL', 5, 14, 16, 22, 14, 1060], ['XXL', 5, 14, 16, 22, 14, 1210]]
        .map(([n, h, ramp, table, land, w, z]) => ({ name: n, zone: 'Kicker Alley', z, dx: 34, h, ramp, table, land, w })),
      { name: 'Hip', zone: 'Kicker Alley', z: 1260, dx: 0, h: 2.2, ramp: 8, table: 3, land: 10, w: 10 },
      { name: 'Big Air', zone: 'Big Air Duo', z: 1720, dx: -32, h: 6, ramp: 18, table: 8, land: 32, w: 18 },
      { name: 'Mega Air', zone: 'Big Air Duo', z: 1760, dx: 34, h: 6.8, ramp: 20, table: 9, land: 36, w: 18 },
      { name: 'Step-Down', zone: 'Step-Down Line', z: 2090, dx: -26, h: 2.4, ramp: 3, table: 7, land: 2.5, w: 12, drop: true },
      { name: 'Step-Down', zone: 'Step-Down Line', z: 2170, dx: 24, h: 3.0, ramp: 3, table: 8, land: 3, w: 12, drop: true },
      { name: 'Gap', zone: 'Step-Down Line', z: 2250, dx: -4, h: 3.6, ramp: 11, table: 18, land: 16, w: 13 },
      { name: 'Step-Down', zone: 'Step-Down Line', z: 2340, dx: -24, h: 3.4, ramp: 3.5, table: 9, land: 3, w: 12, drop: true },
      // triple threat: three lines of three tables, easy on the right to huge in the middle
      ...[['Medium', 2.5, 8.5, 7, 11, 9, 2850], ['Medium', 2.5, 8.5, 7, 11, 9, 2950], ['Large', 3.3, 10.5, 10, 14, 11, 3050]]
        .map(([n, h, ramp, table, land, w, z]) => ({ name: n, zone: 'Triple Threat', z, dx: 44, h, ramp, table, land, w })),
      ...[['XL', 4.1, 12, 13, 17, 12, 2840], ['XL', 4.1, 12, 13, 17, 12, 2960], ['XXL', 5, 14, 16, 22, 14, 3090]]
        .map(([n, h, ramp, table, land, w, z]) => ({ name: n, zone: 'Triple Threat', z, dx: 0, h, ramp, table, land, w })),
      ...[['Large', 3.3, 10.5, 10, 14, 11, 2870], ['Large', 3.3, 10.5, 10, 14, 11, 2980], ['XL', 4.1, 12, 13, 17, 12, 3100]]
        .map(([n, h, ramp, table, land, w, z]) => ({ name: n, zone: 'Triple Threat', z, dx: -44, h, ramp, table, land, w })),
      { name: 'Hip', zone: 'Triple Threat', z: 3230, dx: 30, h: 2.4, ramp: 8, table: 3, land: 10, w: 10 },
      // slopestyle final: rail, kicker, rail, kicker, box, then the biggest table in the park
      { name: 'Large', zone: 'Slopestyle Final', z: 3440, dx: 12, h: 3.3, ramp: 10.5, table: 10, land: 14, w: 11 },
      { name: 'XL', zone: 'Slopestyle Final', z: 3600, dx: -2, h: 4.1, ramp: 12, table: 13, land: 17, w: 12 },
      { name: 'Final Air', zone: 'Slopestyle Final', z: 3750, dx: 0, h: 5.6, ramp: 16, table: 12, land: 28, w: 16 },
    ],
    runRails: [
      ...[[170, 'box', 'flat', 8], [260, 'rail', 'down', 10], [350, 'box', 'rainbow', 9], [440, 'rail', 'kink', 12], [530, 'box', 'down', 11], [610, 'rail', 'flat', 10]]
        .flatMap(([z, kind, shape, len], i) => [-40, 0, 40].map((dx, j) => ({
          name: ['Flat Box', 'Down Rail', 'Rainbow', 'Kink', 'Down Box', 'Flat Bar'][i] + ' ' + 'ABC'[j], zone: 'Jib Garden', z: z + j * 12, dx,
          len: len + j * 2, h: kind === 'box' ? 0.5 : 0.65, kind: j === 1 && kind === 'rail' && shape !== 'kink' ? 'box' : kind, shape,
          color: [0x2a7de1, 0xf2b705, 0xff4f8b, 0xd8342c, 0x18a868, 0x8e3fd1][(i + j) % 6],
        }))),
      // rainbow road: four rows of three, rainbows and kinks
      ...[[2450, 'rainbow', 'box'], [2530, 'kink', 'rail'], [2610, 'rainbow', 'rail'], [2690, 'down', 'box']]
        .flatMap(([z, shape, kind], i) => [-36, 0, 36].map((dx, j) => ({
          name: ['Rainbow', 'Kink', 'Rainbow Bar', 'Down Box'][i] + ' ' + 'ABC'[j], zone: 'Rainbow Road', z: z + j * 8, dx,
          len: 10 + j * 2 + (shape === 'kink' ? 2 : 0), h: kind === 'box' ? 0.5 : 0.65, kind: shape === 'kink' ? 'rail' : j === 1 ? (kind === 'box' ? 'rail' : 'box') : kind, shape,
          color: [0xff4f8b, 0xf2b705, 0x2a7de1, 0x18a868, 0xff6a2b, 0x8e3fd1][(i * 2 + j) % 6],
        }))),
      { name: 'Final Rail', zone: 'Slopestyle Final', z: 3380, dx: -12, len: 14, h: 0.7, kind: 'rail', shape: 'down', color: 0xff6a2b },
      { name: 'Final Kink', zone: 'Slopestyle Final', z: 3520, dx: 14, len: 15, h: 0.7, kind: 'rail', shape: 'kink', color: 0xd8342c },
      { name: 'Final Box', zone: 'Slopestyle Final', z: 3690, dx: -20, len: 11, h: 0.5, kind: 'box', shape: 'rainbow', color: 0x18a868 },
      { name: 'Last Tube', zone: 'Last Jib', z: 3920, dx: -20, len: 16, h: 0.8, kind: 'rail', shape: 'down', color: 0xff6a2b },
      { name: 'Last Box', zone: 'Last Jib', z: 3920, dx: 20, len: 12, h: 0.5, kind: 'box', shape: 'flat', color: 0x2a7de1 },
      { name: 'Wall Kink', zone: 'Last Jib', z: 4020, dx: 0, len: 13, h: 0.7, kind: 'rail', shape: 'kink', color: 0xd8342c },
      { name: 'Rainbow', zone: 'Last Jib', z: 4100, dx: -18, len: 10, h: 0.55, kind: 'box', shape: 'rainbow', color: 0xff4f8b },
      { name: 'Down Rail', zone: 'Last Jib', z: 4100, dx: 18, len: 11, h: 0.65, kind: 'rail', shape: 'down', color: 0xf2b705 },
    ],
    zones: [
      { name: 'Drop In', z1: 120 }, { name: 'Jib Garden', z1: 650 }, { name: 'Kicker Alley', z1: 1330 }, { name: 'The Pipe', z1: 1660 },
      { name: 'Big Air Duo', z1: 2060 }, { name: 'Step-Down Line', z1: 2400 }, { name: 'Rainbow Road', z1: 2800 }, { name: 'Triple Threat', z1: 3340 },
      { name: 'Slopestyle Final', z1: 3880 }, { name: 'Last Jib', z1: 4170 }, { name: 'Finish', z1: 4260 },
    ],
    signs: { 'Jib Garden': '18 RAILS & BOXES', 'Kicker Alley': 'TWO LINES · S TO XXL', 'The Pipe': 'HALFPIPE · ROLLERS', 'Big Air Duo': 'TWIN BIG AIRS', 'Step-Down Line': 'STEP-DOWNS · GAP',
      'Rainbow Road': 'RAINBOWS · KINKS', 'Triple Threat': 'THREE LINES OF TABLES', 'Slopestyle Final': 'RAIL · KICKER · FINAL AIR', 'Last Jib': 'ONE MORE' },
    icy: [],
    trees(z, s, d) { return d * 0.8; },
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
