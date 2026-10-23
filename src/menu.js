// The front page: tabs for Ride, Events, Leaderboard, Locker, Shop, Pass, Replays, Trick
// School and Updates, the rider sticker with its lift pass, the account and the little
// panels behind the top buttons. Game state stays in main.js / meta.js / cloud.js; this
// draws it and passes clicks back.
import { ITEMS, ITEM, CATS, RARITY, LEVELS, LEVEL_XP, SEASON, RIVALS, SETS, GOLD_PRICE, store } from './meta.js';
import { EVENTS, TIERS, field, prize, MEDAL } from './events.js';
import { LESSONS, LESSON, FAMS, comboFor, comboSteps, ARROW } from './school.js';
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
    case 'trail': {
      const stops = it.fx === 'rainbow' ? ['#ff3d5a', '#ffb02e', '#ffe14d', '#3ddc84', '#2aa8ff', '#8e3fd1'] : [a, b];
      const gd = `<linearGradient id="${id}t" x1="0" y1="1" x2="1" y2="0">${stops.map((c, i) => `<stop offset="${i / (stops.length - 1)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
      const dots = it.fx === 'sparkle' ? [[70, 22, 3], [80, 34, 2], [60, 16, 2], [86, 20, 2.5], [74, 44, 1.6]].map(([x, y, r]) => `<path d="M${x} ${y - r * 2}L${x + r * 0.6} ${y - r * 0.6}L${x + r * 2} ${y}L${x + r * 0.6} ${y + r * 0.6}L${x} ${y + r * 2}L${x - r * 0.6} ${y + r * 0.6}L${x - r * 2} ${y}L${x - r * 0.6} ${y - r * 0.6}Z" fill="#fff"/>`).join('')
        : it.fx === 'fire' ? `<path d="M74 40 Q70 26 80 14 Q82 26 90 30 Q92 44 80 48 Q72 48 74 40Z" fill="${b}" opacity=".9"/>` : '';
      return `<svg viewBox="0 0 100 100"><defs>${gd}</defs><path d="M8 88 Q30 82 46 62 Q60 44 82 24" stroke="url(#${id}t)" stroke-width="16" stroke-linecap="round" fill="none" opacity=".35"/><path d="M8 88 Q30 82 46 62 Q60 44 82 24" stroke="url(#${id}t)" stroke-width="8" stroke-linecap="round" fill="none"/>${dots}<circle cx="84" cy="22" r="6" fill="#fff"/></svg>`;
    }
    case 'gloves':
      return S(`<path d="M30 92 V48 Q30 20 52 20 Q74 20 74 46 V92 Z" fill="${a}" stroke="${dark}" stroke-width="3" stroke-linejoin="round"/><path d="M30 56 Q14 50 16 36 Q18 28 28 34" fill="${a}" stroke="${dark}" stroke-width="3"/><rect x="28" y="76" width="48" height="16" fill="${dark}" opacity=".35"/>`);
  }
  return S('');
}

function shortDate(t) { const d = new Date(t); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }).toUpperCase(); }
function clock(s) { const m = Math.floor(s / 60); return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

const NOTES = [
  { d: '23 OCT', t: 'Real rotation, a calmer pace, lo-fi on the radio', p: 'Tricks turn like a body really can. Arrow combos used to whip you round at up to 745 degrees a second to fit whatever you asked for; now they turn no faster than Cork7\'s riders, about 545 a second spinning and 390 flipping, and if the air left after your taps can\'t fit the trick it comes out smaller (a late 1080 lands as a 720). Held spins and flips build up a little slower, so the body has some weight to it. The pace is much calmer: you cruise around 80 km/h instead of 115, and still get up to the right speed lined up for a kicker. Stomped FM is now slow lo-fi, 70 to 84 BPM: soft swung drums, a round bass, warm electric piano on jazzy chords and a little vinyl crackle.', tags: ['TRICKS', 'SPEED', 'MUSIC'] },
  { d: '23 OCT', t: 'Tricks answer at once, a taller rider', p: 'Ran the same tricks through Cork7\'s own physics and ours side by side. The spin and flip speeds already matched, but ours waited a fifth of a second after you pressed before turning you. Now a spin starts the moment you press, and so does a flip on W / S, a pad or touch, just like Cork7. A quick tap of the arrows still makes a combo, and a flip on the up and down arrows waits until you hold it so those taps stay grabs. A straight flip that a spin joins in the first quarter second becomes a cork or bio. Your rider stands like Cork7\'s now: the jacket is cut at the hips so the long, straight, baggy pants show their full length, and the head is a little smaller.', tags: ['TRICKS', 'RIDER'] },
  { d: '23 OCT', t: 'Cork7 speed, softer night lights, baggier kit', p: 'Watched Cork7 runs side by side with ours: they cruise their parks at 140 km/h, and we were holding riders back near 105. Now you run up to Cork7\'s pace, about 137 km/h riding and 150 tucked, still eased down to the right speed lined up for a kicker so the jumps land you where they should. The snow sprays off landings, slashes and deep powder are much lighter, so they no longer white out the screen or fog over your rider, and a tree the camera passes right through now disappears instead of filling the view. At night the floodlights are about a third as bright, with smaller glows: it looks like night again. Your rider has a shorter torso, a looser jacket and sleeves, and much baggier pants.', tags: ['SPEED', 'NIGHT', 'RIDER'] },
  { d: '23 OCT', t: 'Up the chairlift, a shorter rider, quicker loading', p: 'Every run now starts like Cork7\'s: you ride the chairlift up to the top, sat in the chair with the valley below, and step off at the start. Press F, Space or the Skip Ride button to jump straight to the top. Your rider is a bit shorter and more compact, kit and all. Switching parks loads about a fifth quicker: the jump snow and the forest are worked out on every core at once, the crowd builds faster, and the last textures finish while you ride up the lift instead of holding the loading screen. Models now stay saved on your device, so a second visit doesn\'t download them again.', tags: ['LIFT', 'RIDER', 'LOADING'] },
  { d: '23 OCT', t: 'Ride from the mountain map, a Cork7 camera', p: 'RIDE now opens the mountain: every park is pinned on one big painted map, Cork7 style. Pick one and ride it from the top, or pick where to drop in. The camera flies like Cork7\'s: off a kicker it looks up at you against the sky and only comes round to the landing as you drop toward it, and its height holds steady through the air instead of climbing. Every park is laid out gentler, closer to Cork7\'s slope, so the horizon and the mountains stay in view and the jumps fly the way Cork7\'s do. The slow-motion pace is gone: spins and speed are back to Cork7\'s own timing. In the air your rider stays calmer, arms low and close.', tags: ['MAP', 'CAMERA', 'PARKS', 'TRICKS'] },
  { d: '22 OCT', t: 'A calmer ride, a real map, a slimmer rider', p: 'Pick your drop on the real mountain now: the map is the run itself seen from the air, drawn by the game, with the piste, its kickers and rails and a pin at every place you can start. Riding is calmer: everything moves a little slower, so you cruise around 85 km/h, hang longer in the air off the same jumps, and spins and flips wind up gently instead of snapping round. Holding W just hunches you over a little as you speed up, like Cork7\'s rider. Your rider is slimmer through the body, in a longer, looser jacket with baggy sleeves and wide straight pants over the boots.', tags: ['MAP', 'TRICKS', 'SPEED', 'RIDER'] },
  { d: '22 OCT', t: 'Cork7\'s jumps, speed and landings', p: 'We ran Cork7\'s own simulation side by side with ours, and matched it. Every kicker on every park is rebuilt at Cork7\'s size: up to 11 m tall, with a gap behind the lip, a big landing hill and landings up to 120 m long. Kickers now throw you out at their own angle, 22 to 37 degrees up depending on size, like Cork7\'s, so you get 1.5 to 3.5 seconds of air: room for 720s and doubles. The speed cap is gone, so you cruise at Cork7\'s pace, around 100 km/h, and take the big kickers at their sweet-spot speed. Let go of a spin or a flip and it winds down, then settles on the nearest clean landing, as Cork7\'s assist does. The goggles are redone too: a tall silver lens in a thin white frame, low over the eyes.', tags: ['JUMPS', 'SPEED', 'TRICKS', 'GOGGLES'] },
  { d: '22 OCT', t: 'A rider like Cork7\'s, and no more injuries', p: 'Your rider is remodelled in Blender after Cork7\'s: a bigger round head under a bigger helmet, a boxy puffy shell with a high collar, a zip and its hood down on the back, the chest band running round the sleeves too, fat quilted sleeves, big mitts, short hair under the helmet and very baggy pants creased down the legs and stacked over the boots. The goggle lenses show now, a silver mirror in a white frame. Injuries are gone: no blood, no rescue helicopter, no clinic. However hard you slam, you get straight back up and ride on.', tags: ['RIDER', 'BLENDER', 'CRASHES'] },
  { d: '22 OCT', t: 'The mountain, made in Blender', p: 'The world is now modelled and lit in Blender, like Cork7\'s. Your rider and every piece of kit (helmet, goggles, boots, bindings, poles, skis and boards) are Blender models with their shading baked in. So are every park\'s rails, boxes and logs, each village of chalets with snow loads, cornices and icicles, and the whole chairlift: towers with sheave trains and caged ladders, the terminals with their canopy, bullwheel and operator cabin, and the chairs. The groomers, snow guns, trail signs, piste markers, bamboo canes and the start gate are new Blender models too. The clinic, the ambulance, the helicopter and every pine now carry light rendered in Blender, so their corners and the tiers under the snow sit in proper shade. It all streams in compressed, and runs still start as fast as before.', tags: ['BLENDER', 'GRAPHICS', 'LIFT', 'VILLAGE', 'PARK'] },
  { d: '22 OCT', t: 'A new rider, and skis and boards that ride their own way', p: 'Every rider is a new figure drawn the way Cork7\'s are: lanky and upright, a long loose hooded shell with the band across the chest, straight baggy pants stacked over the boots, mitts, flat colour. Skis and a snowboard now ride differently. Lean hard into a turn at speed and the edges let go into a slash that sprays snow and scrubs speed; a board lets go sooner, skis keep biting. A board rolls edge to edge slower, pivots easily when you\'re slow, turns tighter on its toes than its heels, stops sideways on its heel edge, floats in powder and skates with its back foot instead of poling. Skis tip further over the faster you go. The starter board is red now, the planks are chunkier and the bindings dark.', tags: ['RIDER', 'SKIS', 'SNOWBOARD', 'PHYSICS'] },
  { d: '22 OCT', t: 'Shredline is now Stomped, and it opens at once', p: 'New name: Stomped, for the landing you ride away from clean. The front page now opens the moment the page does (about a quarter of a second, ten times sooner on a phone), and the mountain builds behind it; press Ride while it does and you go the moment it\'s ready. The first download is half what it was (5 MB), shaders are built once instead of twice, the village goes up twice as fast, and a run is under way in about four seconds from a cold start. The hills look more like Cork7: pines in groves with open snow between, far peaks low and rounded, orange safety netting.', tags: ['NEW NAME', 'LOADING', 'LOOK'] },
  { d: '22 OCT', t: 'Scored like Cork7, your camera, your keys', p: 'Every score now follows Cork7\'s own rules. Grabs: the longest grab held to a second puts x1.25 on the spin, each other grab 5% more, three grabs at most. A repeat counts against the whole run (75%, 55%, then 40%), judged on the rotation, so a new grab no longer makes an old spin fresh. Butters pay less one after another and steer through one half turn (a spin you land with carries it to 360). Rails pay 750 a second and 450 a swap, and a hop pays 450 for each quarter you turn in it. A hop off flat snow has to last a second and reach 1.3 m to count. A quick tap of A or D on a rail now always swaps. Settings has Cork7\'s camera: height, angle, distance, FOV, stiffness, tilt, speed lens and trick cam. Hold the right mouse button to look around. Change any key under Keys, set the music, wind and effects on their own, and first person now stays in the helmet through a slam. Hold R for 2 seconds to restart everywhere.', tags: ['SCORING', 'CAMERA', 'CONTROLS', 'SOUND'] },
  { d: '22 OCT', t: 'Cork7 pace, butters, rail hops', p: 'Runs now ride at Cork7\'s pace: you cruise around 65 km/h and a tuck takes you to about 80, instead of running away to 150 on the steep parts. Lined up for a kicker you still carry the speed it\'s built for. Hold B in the air and you land straight into a butter off a bump, a roller or a small hop; try it off a big jump and you faceplant. A butter press lasts 1.5 seconds with a second\'s rest after, and your first four butters in a run score. Small hops on plain snow no longer score on their own. On a rail, Space with rail still to go is a small hop back onto the bar (+450), two swaps a bar, and rails ring higher the faster you slide. Flat landings smack. Landing on your tails or tips still stomps up to 45 degrees. Trees between you and the camera turn see-through. Press C for the new Drone camera, and Settings has Camera (chase, first person, drone), Distance, Speed lens, a 30 fps cap and an FPS counter. The finish is a blue line across the snow with a tall marker either side, and the Season Pass keeps the days you miss: their three full levels wait for you, and past them runs still give a fifth.', tags: ['SPEED', 'BUTTERS', 'RAILS', 'CAMERA', 'SETTINGS', 'SEASON PASS'] },
  { d: '21 OCT', t: 'Cork7 rider and forest', p: 'Your rider looks like Cork7\'s: a petrol park shell with a dark band and a hood, ink pants, white park goggles, grey boots and race-red skis, standing taller and narrower with low hands and trailing poles. Every tree on the mountain is now a cartoon pine: four dark-teal tiers with thick snow caps on a short brown trunk (Settings › Look › Realistic brings back the old forest).', tags: ['RIDER', 'GRAPHICS'] },
  { d: '21 OCT', t: 'Cloud Nine, a cleaner HUD', p: 'A new run, Cloud Nine: wide open above the trees, with a playground of rollers and hips, a rail garden of fifteen rails and boxes, a field of waves, three step-up tables, a straight to tuck, one huge air and a last line of rails. The HUD is more like Cork7\'s: no more controls banner along the bottom (they\'re in How to play), just the section name, your score, speed and the run map, with a music player in the corner to skip or pause tracks. The sky is bluer with more cloud, the snow brighter, and the light masts stand by day.', tags: ['CLOUD NINE', 'HUD', 'GRAPHICS', 'MUSIC'] },
  { d: '21 OCT', t: 'Bails cost points', p: 'Bailing now really costs you: the points you had riding (the line you hadn\'t banked and the trick you were in) come off your score, which flashes red as it drops. It never goes below zero.', tags: ['TRICKS'] },
  { d: '21 OCT', t: 'Cork7 sky and trick calls', p: 'Clear days have a drawn sky like Cork7\'s: pale at the horizon, steel blue overhead, with loose wisps of cloud drifting over. In the air the trick builds on screen as you spin and flip, with its points and what\'s multiplying them (inverted, switch, repeat). Landing calls STOMPED, SAVED IT or CLEAN LANDING with the total and the line. Air time shows your speed and how far you\'ve flown, and loading a pop fills a bar under you: let go to jump.', tags: ['GRAPHICS', 'TRICKS', 'HUD'] },
  { d: '21 OCT', t: 'Cork7 park', p: 'Rails and boxes are black painted steel now. Kicker ramps, knuckles and landings are shaded a little bluer than the run so their shape shows in flat light, with blue dye across every lip, down both sides of the run-in and faintly along the landing. Rails get a blue line where you pop on. Each kicker has a tall marker pole on each side with its number and the speed it wants.', tags: ['PARK', 'GRAPHICS'] },
  { d: '21 OCT', t: 'Cork7 look', p: 'The mountain now has Cork7\'s soft, cool look: a gentler film curve, quieter colour, a steel-blue sky, thicker haze so far ridges go pale, blue-grey shade on clean white snow, and deep navy nights. Trees are a lighter blue-green. New riders start in a teal banded jacket, slate pants, a black helmet and light boots, with no backpack (riders still in the old starter kit switch over once).', tags: ['GRAPHICS', 'LOCKER'] },
  { d: '20 OCT', t: 'Cork7 physics', p: 'Riding, jumping and spinning now run on Cork7\'s numbers. The slope pulls harder and the air is snappier: the same jumps fly as far, a third quicker. Speed builds with almost no drag to 155 km/h; W poles you off the line and tucks once you\'re going; the brake stops you dead. Kickers throw you off the lip, and holding the pop through it sends you higher. Spins and flips build up while you hold them and wind down when you let go, faster with a grab. Set a cork at the lip, inside a quarter second. Land sideways and you save it for half the points; only coming down on your back or head takes you out. Scores are Cork7\'s too: 1,500 for a 360, 6,000 for a 720, 450 and 15% more for a stomp. The camera sits where Cork7\'s does and widens with speed.', tags: ['PHYSICS', 'TRICKS', 'SCORING', 'CAMERA'] },
  { d: '19 OCT', t: 'Shred Canyon, no more hand-holding, the app', p: 'A new run, Shred Canyon: ten whoops, a gully of side hits, a canyon pipe, three gaps, a pillow forest, a speed chute and the biggest air on the mountain. Nothing lands your tricks for you any more: let go of a spin where you want it to stop, and if you can\'t finish it you crash. It takes a lot more to get hurt, but when you do it\'s far worse. The stars are gone. A new rescue helicopter, a mountain clinic and better chairs that ride the line with the others. A new Shop with a spotlight set and try-on, Trails that follow you down the hill, and a Gold Pass. Snowboard bindings with highbacks and ratchets. And Shredline is now an app for your phone.', tags: ['SHRED CANYON', 'NO ASSISTS', 'TRAILS', 'GOLD PASS', 'PHONE APP'] },
  { d: '19 OCT', t: 'Bigger parks and boosts', p: 'Trick Zone is now 3 km: a Hip Garden, Jib Street with 16 rails and boxes and a long tube, a Step-Down Line and a Final Jib round the big air. Land a trick clean and it boosts you out of it. Carving no longer costs speed, only braking does. Crashes are wilder, with limbs flying and the body slamming the snow, and bad ones are a lot bloodier (Settings › Injuries). Your rider now wears a pack and a hood, and you can see his breath.', tags: ['TRICK ZONE 3 KM', 'BOOST', 'CARVING', 'CRASHES'] },
  { d: '18 OCT', t: 'Combos, the rescue chopper and music', p: 'Tricks are combos now: tap the arrows in the air. Down down is a mute grab, left left a 360 (more taps, more spin), down down down a backflip, left down right a cork 720, and the biggest ones are secret until you find them. Crash hard enough and you are not getting up: the rescue helicopter winches you onto its orange stretcher and flies you to the mountain hospital, then you pick where to ride and take the chairlift there (Settings has Injuries: Realistic or Off). Tree trunks and poles take you down now, branches drag you back, the snow is faster, the chairlift is all new and there is a soundtrack.', tags: ['COMBOS', 'RESCUE', 'HOSPITAL', 'CHAIRLIFT', 'MUSIC', 'SPEED'] },
  { d: '18 OCT', t: 'Shredline: smash, ride switch, get back up', p: 'Alpenglow is now Shredline. Ride into a piste pole, a gate or a sign and it goes flying; ride into the side nets and they stretch, catch you and throw you back. Keypad . (or G) hops you round to ride backwards, and your rider looks back over his shoulder to see. Wipe out and you are back up in a couple of seconds, still moving. Every part of every run has its name sprayed on the snow, Mega Park is now 4.3 km with Rainbow Road, Triple Threat and a Slopestyle Final, the finish crowd and the chairlift riders are real people, and the mountains have snowy ledges and layered rock.', tags: ['NEW NAME', 'SMASH', 'SWITCH', 'MEGA PARK', 'REAL CROWD'] },
  { d: '18 OCT', t: 'Real ski runs and a new day every drop', p: 'Three new places to ride: Timberline, 5.7 km of glades where you weave through the trees; Grand Descent, 8.5 km and 2.5 km of vertical from a north face and a glacier through a couloir, a giant bowl and treeline steeps down to the village; and Mega Park, 2.8 km with a jib garden, a two-line kicker alley up to XXL, a pipe and a step-down gap. The weather is different every time you drop in, and the snow with it: fresh powder is slow and floaty, hardpack is fast and skates out, spring slush grabs. Tricks are now on the number keys: hold one on the way up a kicker and let go right at the lip. The arrows steer, tuck and brake on the snow and spin and flip in the air. Less glare and more snow-like snow, too.', tags: ['NEW RUNS', 'MEGA PARK', 'WEATHER', 'TRICK KEYS', 'ARROWS'] },
  { d: '18 OCT', t: 'Accounts and the shared server', p: 'Every rider now has an account on the Shredline server. Make it yours with an email and a password and your wallet, pass, locker and trick book follow you to any device. Leaderboards are global and weekly, and every best run can be watched by anyone. Multiplayer runs on our own servers: pick one from the list, or race everyone on it.', tags: ['ACCOUNTS', 'GLOBAL BOARDS', 'SERVERS', 'SERVER RACES'] },
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
    if (k === 'pass') { this.passPick = null; this.passScrolled = false; }
    if (this.dlg) { this.dlg = null; $('itemdlg')?.classList.add('hidden'); }
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
    if (this.preview) this.preview.setOutfit(this.tryOn());
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
    if (this.dlg && $('it-rider')) this.preview.mount($('it-rider'), { spin: 0.5, zoom: 1.1 });
    else if (this.tab === 'shop' && $('sh-hero-rider')) this.preview.mount($('sh-hero-rider'), { spin: 0.45, zoom: 1.05 });
    else if (this.tab === 'pass' && $('ps-rider')) this.preview.mount($('ps-rider'), { spin: 0.45, zoom: 1.05 });
    else if (this.tab === 'ride') this.preview.mount($('stick'), { spin: 0.35, zoom: 1 });
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
    if (c.status === 'offline') { el.innerHTML = who + stats + '<p class="note2">The Stomped server can\'t be reached right now. You can still ride; everything is saved on this device and goes up next time you\'re online.</p>'; return; }
    if (c.status === 'loading') { el.innerHTML = who + '<p class="note2">Connecting to the Stomped server…</p>'; return; }
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
      : `<p class="note2">Sign in to your Stomped account. Anything you've earned as a guest on this device joins it.</p>
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
    const price = !own && (it.r === 'pass' || it.r === 'gold') ? `<span class="pr">${it.r === 'gold' ? 'GOLD ' : ''}TIER ${it.level}</span>` : !own && it.r === 'event' ? '<span class="pr">EVENT</span>' : !own ? `<span class="pr">${FLAKE}${deal ? `<s>${it.price.toLocaleString()}</s>` : ''}${p.toLocaleString()}</span>` : '';
    const tag = on ? '<span class="ow">WEARING</span>' : own && where !== 'locker' ? '<span class="ow">OWNED</span>' : deal && !own ? '<span class="off">-20%</span>' : '';
    return `<button class="item ${it.r}${on ? ' on' : ''}${own ? '' : ' locked'}${where === 'shop' && !own ? ' buyable' : ''}" data-id="${it.id}"><i class="shine"></i>${price}${tag}<div class="ic">${itemIcon(it)}</div><span class="rr">${RARITY[it.r]}</span><span class="nm">${esc(it.name)}</span></button>`;
  }

  pick(id, where) {
    const m = this.meta, it = ITEM[id];
    if (m.owned.has(id)) { m.wear(id); this.g.kitChanged(); return; }
    if (where === 'shop') { this.detail(id); return; }
    if (it.r === 'pass') { this.g.toast(`${esc(it.name)} unlocks at Season Pass tier ${it.level}`); return; }
    if (it.r === 'gold') { this.g.toast(`${esc(it.name)} is on the Gold Pass at tier ${it.level}`); return; }
    if (it.r === 'event') { this.g.toast(`${esc(it.name)}: ${esc(it.how)}`); return; }
    if (where === 'locker') { this.setTab('shop'); return; }
    const p = m.price(id);
    if (m.flakes < p) { this.g.toast(`${FLAKE} ${(p - m.flakes).toLocaleString()} more flakes for ${esc(it.name)}`); return; }
    if (this.confirm !== id) { this.confirm = id; this.g.toast(`Tap again to buy ${esc(it.name)} for ${FLAKE} ${p.toLocaleString()}`); return; }
    this.confirm = null;
    if (m.buy(id)) { this.g.toast(`${esc(it.name)} is yours`); this.g.kitChanged(); }
  }

  // what the rider in the preview wears: your kit, or the thing you're looking at in the shop
  tryOn() {
    const g = this.g, m = this.meta;
    let over = null;
    if (this.dlg) { const it = ITEM[this.dlg]; if (it && it.cat !== 'rider') over = { [it.cat]: it.id }; }
    else if (this.tab === 'shop') { over = {}; for (const id of m.spotlight().items) over[ITEM[id].cat] = id; }
    else if (this.tab === 'pass') { const it = this.passShow(); if (it) over = { [it.cat]: it.id }; }
    // a board item on a skier (or skis on a boarder) is shown on the gear it's for
    const board = over && (over.deck ? true : over.skis ? false : g.gear === 'board');
    return over ? m.outfit(g.myOutfit, over.deck || over.skis ? board : g.gear === 'board', over) : g.outfit();
  }

  // ---------------------------------------------- shop
  shopTimer() {
    const el = $('sh-timer');
    if (!el) return;
    const ms = 864e5 - (Date.now() % 864e5), h = Math.floor(ms / 36e5), mn = Math.floor((ms % 36e5) / 6e4);
    el.textContent = `NEW DEALS IN ${h}H ${mn}M`;
    const wk = $('sh-week');
    if (wk) { const w = 6048e5 - (Date.now() % 6048e5); wk.textContent = `${Math.floor(w / 864e5)}D ${Math.floor((w % 864e5) / 36e5)}H LEFT`; }
  }

  shop() {
    const m = this.meta;
    $('sh-wallet').innerHTML = `${FLAKE}${m.flakes.toLocaleString()} flakes`;
    const cat = (this.shopCat ??= 'all');
    const chips = [['all', 'EVERYTHING'], ['deals', 'DEALS'], ['sets', 'SETS'], ['trail', 'TRAILS'], ...CATS.filter(([c]) => c !== 'rider' && c !== 'trail').map(([c, n]) => [c, n.toUpperCase()])];
    const feat = m.featured().map((id) => ITEM[id]);
    const setCard = (st) => {
      const p = m.setPrice(st), full = st.items.reduce((a, id) => a + ITEM[id].price, 0);
      const top = st.items.map((id) => ITEM[id]).sort((a, b) => b.price - a.price)[0];
      return `<button class="set${p ? '' : ' own'}" data-set="${st.id}" style="--c1:${hex(top.c)};--c2:${hex(top.c2 ?? top.c)}"><div class="nm">${esc(st.name)}</div>${st.blurb ? `<div class="bl">${esc(st.blurb)}</div>` : ''}<div class="row4">${st.items.map((id) => `<div class="${ITEM[id].r}" title="${esc(ITEM[id].name)}">${itemIcon(ITEM[id])}</div>`).join('')}</div>
        ${p ? `<span class="pr">${FLAKE}<s>${full.toLocaleString()}</s>${p.toLocaleString()}</span>` : '<span class="pr">ALL OWNED · WEAR IT</span>'}</button>`;
    };
    const sp = m.spotlight(), spP = m.setPrice(sp), spItems = sp.items.map((id) => ITEM[id]);
    const lead = spItems.slice().sort((a, b) => b.price - a.price)[0];
    const hero = `<div class="sh-hero" style="--c1:${hex(lead.c)};--c2:${hex(lead.c2 ?? lead.c)}">
      <div class="hl"><span class="kick">SPOTLIGHT SET · <b id="sh-week"></b></span><h2>${esc(sp.name)}</h2><p>${esc(sp.blurb ?? 'A whole look for less than its parts.')}</p>
        <div class="hrow">${spItems.map((it) => `<button class="hi ${it.r}" data-id="${it.id}" title="${esc(it.name)}">${itemIcon(it)}<span>${esc(it.name)}</span></button>`).join('')}</div>
        <div class="cta">${spP ? `<button class="buy" data-set="${sp.id}">${FLAKE}${spP.toLocaleString()} · BUY THE SET</button>` : `<button class="buy" data-set="${sp.id}">YOURS · WEAR IT</button>`}<span class="save">${spP ? `SAVE ${FLAKE}${(spItems.reduce((a, it) => a + it.price, 0) - spP).toLocaleString()}` : ''}</span></div></div>
      <div class="hr"><div id="sh-hero-rider"></div><div class="disc"></div><span class="drag">← DRAG →</span></div></div>`;
    const grid = (list) => `<div class="items">${list.map((it) => this.card(it, 'shop')).join('')}</div>`;
    const sale = (it) => it.price > 0 && !['free', 'pass', 'gold', 'event'].includes(it.r);
    let body = '';
    if (cat === 'all' || cat === 'deals') body += `<div class="grp"><span>TODAY'S DEALS · 20% OFF</span><em class="timer" id="sh-timer"></em></div><div class="items feat">${feat.map((it) => this.card(it, 'shop')).join('')}</div>`;
    if (cat === 'all' || cat === 'sets') body += `<div class="grp"><span>OUTFIT SETS · 30% OFF</span></div><div class="sets">${SETS.map(setCard).join('')}</div>`;
    if (cat === 'all' || cat === 'trail') body += `<div class="grp"><span>TRAILS · LEAVE SOMETHING BEHIND</span></div>${grid(ITEMS.filter((it) => it.cat === 'trail' && sale(it)))}`;
    for (const [c, n] of CATS) {
      if (c === 'trail' || c === 'rider' || (cat !== 'all' && cat !== c)) continue;
      const list = ITEMS.filter((it) => it.cat === c && sale(it)).sort((a, b) => ['rare', 'epic', 'legendary'].indexOf(b.r) - ['rare', 'epic', 'legendary'].indexOf(a.r));
      if (list.length) body += `<div class="grp"><span>${n.toUpperCase()} · ${list.length}</span></div>${grid(list)}`;
    }
    $('shop').innerHTML = hero + `<div class="chips sm sh-cats">${chips.map(([c, n]) => `<button data-c="${c}" class="${c === cat ? 'on' : ''}">${n}</button>`).join('')}</div>` + body;
    this.shopTimer();
    for (const b of document.querySelectorAll('#shop .sh-cats button')) b.onclick = () => { this.shopCat = b.dataset.c; this.shop(); };
    for (const b of document.querySelectorAll('#shop .item, #shop .hi')) b.onclick = () => this.detail(b.dataset.id);
    for (const b of document.querySelectorAll('#shop .set, #shop .sh-hero .buy')) b.onclick = () => this.buySet(SETS.find((x) => x.id === b.dataset.set));
  }

  buySet(st) {
    const m = this.meta, p = m.setPrice(st);
    if (!p) { for (const id of st.items) m.kit[ITEM[id].cat] = id; m.save(); m.changed(); this.g.kitChanged(); this.g.toast(`Wearing the ${esc(st.name)} set`); return; }
    if (m.flakes < p) { this.g.toast(`${FLAKE} ${(p - m.flakes).toLocaleString()} more flakes for the ${esc(st.name)} set`); return; }
    if (this.confirm !== st.id) { this.confirm = st.id; this.g.toast(`Tap again to buy the ${esc(st.name)} set for ${FLAKE} ${p.toLocaleString()}`); return; }
    this.confirm = null;
    if (m.buySet(st)) { this.g.toast(`The ${esc(st.name)} set is yours`); this.g.kitChanged(); this.g.audio?.chime?.(); }
  }

  // one item, big: your rider wearing it (turn him round), what it is, buy or wear it
  detail(id) {
    const m = this.meta, it = ITEM[id];
    if (!it) return;
    this.dlg = id;
    const own = m.owned.has(id), on = m.kit[it.cat] === id, p = m.price(id), deal = p < it.price;
    const how = it.r === 'pass' ? `Season Pass · tier ${it.level}` : it.r === 'gold' ? `Gold Pass · tier ${it.level}` : it.r === 'event' ? it.how : '';
    const what = { jacket: 'Jacket', pants: 'Pants', head: it.beanie ? 'Beanie' : 'Helmet', goggles: 'Goggles', skis: 'Skis', deck: 'Snowboard', gloves: 'Gloves', poles: 'Poles', trail: 'Trail', rider: 'Rider' }[it.cat];
    const fxName = { fade: 'Glow', rainbow: 'Rainbow', sparkle: 'Sparkle', fire: 'Fire', snow: 'Snow' }[it.fx] ?? '';
    const el = $('itemdlg');
    el.className = 'itemdlg ' + it.r;
    el.style.setProperty('--c1', hex(it.c)); el.style.setProperty('--c2', hex(it.c2 ?? it.c));
    el.innerHTML = `<div class="card"><button class="x" id="it-x">×</button>
      <div class="l">${it.cat === 'trail' ? `<div class="trailfx ${it.fx}"><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="tic">${itemIcon(it)}</div>` : '<div id="it-rider"></div><div class="disc"></div><span class="drag">← DRAG TO TURN →</span>'}</div>
      <div class="r"><span class="rr">${RARITY[it.r]} · ${what}${fxName ? ' · ' + fxName : ''}</span><h2>${esc(it.name)}</h2>
        <div class="ic">${itemIcon(it)}</div>
        <p>${it.cat === 'trail' ? 'Coloured light your skis leave in the air behind you, carving and flying.' : it.cat === 'deck' ? 'A snowboard with its own printed top sheet.' : it.cat === 'skis' ? 'Twin tips with a printed top sheet.' : 'Try it on: your rider is wearing it.'}</p>
        <div class="buyrow">${own ? `<button class="buy" id="it-go">${on ? 'WEARING ✓' : 'WEAR IT'}</button>` : how ? `<span class="how">${esc(how)}</span>` : `<button class="buy" id="it-go">${FLAKE}${deal ? `<s>${it.price.toLocaleString()}</s>` : ''}${p.toLocaleString()} · BUY</button>`}
        <span class="bal">${FLAKE}${m.flakes.toLocaleString()}</span></div></div></div>`;
    el.classList.remove('hidden');
    const close = () => { this.dlg = null; el.classList.add('hidden'); this.preview?.setOutfit(this.tryOn()); };
    $('it-x').onclick = close;
    el.onclick = (e) => { if (e.target === el) close(); };
    if ($('it-go')) $('it-go').onclick = () => {
      if (own) { m.wear(id); this.g.kitChanged(); close(); return; }
      if (m.flakes < p) { this.g.toast(`${FLAKE} ${(p - m.flakes).toLocaleString()} more flakes for ${esc(it.name)}`); return; }
      if (m.buy(id)) { this.g.toast(`${esc(it.name)} is yours`); this.g.kitChanged(); this.g.audio?.chime?.(); close(); }
    };
    this.preview?.setOutfit(this.tryOn());
  }

  // ---------------------------------------------- season pass
  // the next item reward ahead of you (the gold track's if you have it), for the showcase
  passShow() {
    const m = this.meta;
    if (this.passPick) return ITEM[this.passPick];
    for (let L = m.level + 1; L <= LEVELS; L++) {
      const g = m.goldReward(L).item, f = m.reward(L).item;
      if (m.gold && g && g.cat !== 'trail') return g;
      if (f) return f;
    }
    return null;
  }

  pass() {
    const m = this.meta, L = m.level;
    $('ps-lvl').textContent = L;
    $('ps-bar').style.width = ((L - 1 + m.levelFrac) / (LEVELS - 1) * 100).toFixed(2) + '%';
    const left = Math.max(0, LEVEL_XP * 3 - m.day.xp);
    $('ps-info').innerHTML = `${SEASON.name} · ${SEASON.sub} · ${L >= LEVELS ? 'Pass complete' : `${LEVEL_XP - (m.xp % LEVEL_XP)} XP to level ${L + 1}`}<br>
      Every run pays XP: three levels a day at full rate${left ? ` (${left} XP left today)` : ' (used today: runs give a quarter now)'}, it waits for you if you miss a day`;
    const show = this.passShow();
    const goldItems = ITEMS.filter((x) => x.r === 'gold');
    $('ps-top').innerHTML = `<div class="ps-show">
        <div class="hr"><div id="ps-rider"></div><div class="disc"></div></div>
        <div class="txt">${show ? `<span class="rr">${show.r === 'gold' ? 'GOLD PASS' : 'SEASON PASS'} · TIER ${show.level}</span><h3>${esc(show.name)}</h3><p>${show.level - L > 0 ? `${show.level - L} level${show.level - L === 1 ? '' : 's'} to go` : 'Unlocked'}</p>` : '<h3>All unlocked</h3>'}</div></div>
      <div class="ps-gold${m.gold ? ' have' : ''}">
        <div class="gt"><span class="kick">${m.gold ? 'YOU HAVE THE' : 'UPGRADE TO THE'}</span><h3>GOLD PASS</h3>
        <ul><li>${goldItems.length} gold exclusives: ${goldItems.filter((x) => x.cat === 'trail').length} trails, jackets, boards, skis, chrome lids</li><li>Flakes on every other level, ${FLAKE}200 every tenth</li><li>Everything up to your level unlocks at once</li></ul></div>
        <div class="gi">${goldItems.slice(0, 6).map((it) => `<div class="${it.r}">${itemIcon(it)}</div>`).join('')}</div>
        ${m.gold ? '<span class="own">ACTIVE ✓</span>' : `<button class="buy" id="ps-buy">${FLAKE}${GOLD_PRICE.toLocaleString()} · GET GOLD</button>`}</div>`;
    if ($('ps-buy')) $('ps-buy').onclick = () => {
      if (m.flakes < GOLD_PRICE) { this.g.toast(`${FLAKE} ${(GOLD_PRICE - m.flakes).toLocaleString()} more flakes for the Gold Pass`); return; }
      if (this.confirm !== 'gold') { this.confirm = 'gold'; this.g.toast(`Tap again to buy the Gold Pass for ${FLAKE} ${GOLD_PRICE.toLocaleString()}`); return; }
      this.confirm = null;
      const r = m.buyGold();
      if (r) { this.g.toast(`Gold Pass active${r.gifts.length ? ` · ${r.gifts.length} item${r.gifts.length === 1 ? '' : 's'} unlocked` : ''}`); this.g.audio?.chime?.(); }
    };
    const cell = (r, i, gold) => {
      const got = i <= L && (!gold || m.gold);
      const lock = gold && !m.gold;
      const inner = r.item ? `${itemIcon(r.item)}` : `<span class="q">${FLAKE}${r.flakes}</span>`;
      return `<div class="rw${r.item ? ' item ' + r.item.r : ''}${got && i > 1 ? ' got' : ''}${lock ? ' lock' : ''}"${r.item ? ` data-id="${r.item.id}"` : ''}>${inner}${got && i > 1 ? '<span class="ck">✓</span>' : ''}${lock ? '<span class="lk">🔒</span>' : ''}<span class="nm">${r.item ? esc(r.item.name) : 'Flakes'}</span></div>`;
    };
    let html = '';
    for (let i = 1; i <= LEVELS; i++) {
      html += `<div class="lv${i <= L ? ' past' : ''}${i === L ? ' cur' : ''}"><div class="num">${i}</div>${cell(m.reward(i), i, false)}${i > 1 ? cell(m.goldReward(i), i, true) : '<div class="rw spacer"></div>'}</div>`;
    }
    const tr = $('track');
    tr.innerHTML = `<div class="rows"><span class="f">FREE</span><span class="g">GOLD</span></div>${html}`;
    for (const b of tr.querySelectorAll('.rw[data-id]')) b.onclick = () => { this.passPick = b.dataset.id; this.preview?.setOutfit(this.tryOn()); this.pass(); };
    if (!this.passScrolled) requestAnimationFrame(() => { const cur = tr.querySelector('.cur'); if (cur) tr.scrollLeft = cur.offsetLeft - tr.offsetLeft - 160; this.passScrolled = true; });
    $('ps-prev').onclick = () => tr.scrollBy({ left: -tr.clientWidth * 0.8, behavior: 'smooth' });
    $('ps-next').onclick = () => tr.scrollBy({ left: tr.clientWidth * 0.8, behavior: 'smooth' });
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
    const where = l.where === 'rails' ? 'a rail' : l.lvl >= 4 ? 'the biggest kicker you can find (XL, Big Air)' : l.lvl >= 3 ? 'a large kicker' : 'any kicker';
    const combo = comboFor(l.id), secret = combo?.secret && !ok;
    const num = comboSteps(l, where, secret);
    const keys = combo ? (secret ? '<span class="combo q">? ? ? ?</span>' : `<span class="combo">${[...combo.seq].map((k) => `<kbd>${ARROW[k]}</kbd>`).join('')}</span>`) : '';
    const handHead = num ? `<div class="lv2" style="margin-top:12px">BY HAND${l.classic ? ' · CLASSIC KEYS (MENU › CONTROLS)' : ''}</div>` : '';
    $('howbox').innerHTML = `<div class="lv2">${FAMS.find(([k]) => k === l.fam)?.[1].toUpperCase() ?? ''} LEVEL ${l.lvl} · ${ok ? 'LANDED ✓' : `FIRST LANDING PAYS ${l.reward} FLAKES`}</div><h3>${esc(B ? l.board : l.name)}</h3>
      ${num ? `<div class="lv2" style="margin-top:8px">THE COMBO ${keys}</div><ol>${num.map((st) => `<li><span>${st}</span></li>`).join('')}</ol>` : ''}
      ${handHead}<ol>${l.steps.map((st) => `<li><span>${st}</span></li>`).join('')}</ol><div class="tip">${esc(l.tip)}</div>
      <div class="row"><button class="btn p" id="sc-try">Try it ↗</button></div>`;
    $('demo').innerHTML = `<div class="cap">${esc(B ? l.board : l.name)}</div>`;
    $('sc-try').onclick = () => g.tryLesson(l.id);
  }

  notes() {
    $('notes').innerHTML = NOTES.map((n) => `<div class="note"><div class="d">${n.d}</div><h3>${n.t.toUpperCase()}</h3><p>${n.p}</p><div class="tags">${n.tags.map((t) => `<span>${t}</span>`).join('')}</div></div>`).join('');
  }
}

const fmtT = (t) => { if (t == null) return '—'; const m = Math.floor(t / 60); return `${m}:${(t % 60).toFixed(2).padStart(5, '0')}`; };
