# Alpenglow

A big-mountain skiing game in the browser. One 3.4 km run from the summit to the village (~1 km of vertical), a mountain full of AI skiers, and every mesh, texture and sound generated in code.

**Play:** https://reidwcoleman.github.io/alpenglow/

## Modes
- **Race the Cup**: mass-start downhill against 7 AI racers through 39 gates. A missed gate costs 2 s.
- **Free Ride**: 32 AI skiers (experts, carvers, cruisers, beginners, park riders), a terrain park with four kickers, spins, flips and grabs, near-miss bonuses.

Four conditions: Bluebird Morning, Golden Hour, Alpenglow Dusk and Powder Day (snowfall).

## Controls
| | Keyboard | Gamepad |
|---|---|---|
| Carve / spin in the air | A D or ← → | Left stick |
| Tuck, skate / front flip | W | RT / stick up |
| Hockey stop / backflip | S | LT / stick down |
| Pop (hold, release) | Space | A |
| Grab | Shift / E | X / RB |
| Camera (chase, action, helmet, TV) | C | Y |
| Reset to piste | R | Select |
| Pause / mute | Esc / M | Start |

Touch controls appear on phones and tablets.

## How it works
- `src/course.js`: one deterministic height function for the whole mountain (piste profile by section, valley walls, domain-warped ridges, moguls, kickers), plus race gates and a Catmull-Rom racing line.
- `src/skier.js`: ski physics shared by player and AI: gravity, snow friction, air drag (upright vs tuck), edge grip that bends velocity through a carve and turns into a speed-scrubbing skid past its limit, ballistic airtime, crash rules.
- `src/ai.js`: AI skiers drive the same physics through the same controls. Racers track the racing line (Stanley controller) with curvature-based speed checks, and everyone else follows pursuit lines with speed control, avoidance and park tricks.
- `src/terrain.js`: chunked LOD terrain + mid/far rings, snow shader (wind ripples, corduroy, rock on steep faces, sun glints).
- `src/trees.js`, `src/props.js`: instanced spruce forest, chairlift with moving chairs, gates, start house, finish arena + crowd, village, nets, rocks.

## Dev
```
npm install
npm run dev            # http://127.0.0.1:5260
node tools/sim.mjs race   # headless race: finish times, missed gates, crashes
node tools/tour.mjs shots/tour free golden   # screenshots around the mountain
```
URL flags: `?menu=0&mode=race|free&auto=1&tod=bluebird|golden|alpenglow|storm&z=1200&cam=chase|action|helmet|tv&q=low|high|ultra`.

Pushing `main` deploys to GitHub Pages.
