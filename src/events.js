// Events: races, a time trial and trick contests, each at three levels. Races are against
// computer racers, contests against a field of computer scores, the trial against medal
// times. Winning pays flakes (more at the higher levels), medals stay in the profile and a
// Pro win unlocks the Champion kit.
export const TIERS = [
  { key: 'am', name: 'AM', skill: [0.7, 0.8], field: 0.55, pay: 1, trial: [178, 192, 210] },
  { key: 'pro', name: 'PRO', skill: [0.82, 0.95], field: 1, pay: 1.7, trial: [163, 172, 184] },
  { key: 'legend', name: 'LEGEND', skill: [0.93, 1.0], field: 1.55, pay: 2.6, trial: [154, 160, 168] },
];

// what the computer field scores in each contest, at Pro
const FIELD = { yard: 42000, slope: 52000, forest: 21000, bigair: 15000 };
const SPREAD = [1, 0.88, 0.77, 0.66, 0.56, 0.46, 0.36];

export const EVENTS = [
  { id: 'cup', name: 'Alpine Cup', park: 'yard', kind: 'race', racers: 8, blurb: 'Eight racers, forty gates, summit to village. Miss a gate: two seconds.', art: 'yard' },
  { id: 'sprint', name: 'Express Sprint', park: 'yard', kind: 'race', racers: 6, from: 2390, blurb: 'Six racers down the fast bottom third: The Express and the run-out.', art: 'yard' },
  { id: 'trial', name: 'Gate Trial', park: 'yard', kind: 'trial', blurb: 'Just you and the clock through every gate. Beat the medal times.', art: 'yard' },
  { id: 'jam', name: 'Yard Jam', park: 'yard', kind: 'contest', blurb: 'One run top to bottom. Every jump and rail on the way counts.', art: 'yard' },
  { id: 'slopestyle', name: 'Slopestyle Open', park: 'slope', kind: 'contest', blurb: 'Rails, step-ups, hips, Jib Street, step-downs and the big air. Best score takes it.', art: 'slope' },
  { id: 'freeride', name: 'Forest Freeride', park: 'forest', kind: 'contest', blurb: 'Pillows, logs and powder lines through the pines.', art: 'forest' },
  { id: 'bigair', name: 'Big Air Showdown', park: 'bigair', kind: 'contest', blurb: 'The biggest kicker on the mountain. Go big, land clean.', art: 'bigair' },
];
export const EVENT = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

// the computer scores to beat in a contest
export function field(ev, tier, names) {
  const top = (FIELD[ev.park] ?? 20000) * TIERS[tier].field;
  return SPREAD.map((k, i) => ({ name: names[i % names.length], score: Math.round((top * k) / 50) * 50, cpu: true }));
}

// the prize for a place (1-based) at a level
export function prize(tier, place) {
  const base = [300, 180, 100][place - 1] ?? 30;
  return Math.round((base * TIERS[tier].pay) / 10) * 10;
}

export const MEDAL = ['', 'BRONZE', 'SILVER', 'GOLD'];
