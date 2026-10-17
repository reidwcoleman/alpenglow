# Alpenglow

A freeski park game in the browser, built around the feel of the indie game Cork7: corks, flips, grabs, rails and butters scored by rotation, with lines that build a multiplier until you land or bail. One 3.4 km run from the summit to the village (~1 km of vertical) lined with kickers and rail zones, a terrain park, a downhill race, and a mountain full of AI skiers, under photographed skies with scanned snow and rock and real people on the skis.

**Play:** https://reidwcoleman.github.io/alpenglow/

## Modes
- **The Run**: summit to village through Drop In, wall hits on The Wall, the Rail Yard, the Terrain Park, Big Air (one huge kicker), the Forest Line rails, the four-table Kicker Line and Last Call. 14 jumps, 5 rail zones, a timer, a score and a results card at the bottom. Hold R for 2 s to restart.
- **Ski Park**: session the park in laps: four table tops (S, M, L, XL, each with its sweet-spot speed on a board), six rails and boxes, a halfpipe and a roller line. Keys 1-4 jump to a line, holding R takes you to the top of yours, riding out the bottom loops you back.
- **Race the Cup**: mass-start downhill against 7 AI racers through 39 gates, with realistic physics. A missed gate costs 2 s.

Four conditions: Bluebird Morning, Golden Hour, Alpenglow Dusk and Powder Day (snowfall).

## Controls
| | Keyboard | Gamepad |
|---|---|---|
| Carve / spin in the air | A D | Left stick |
| Tuck / front flip in the air | W | RT / RB |
| Brake / backflip in the air | S | LT |
| Air roll: sideflip, flatspin with a spin | ← → | Right stick |
| Rodeo (with S) / misty (with W) | ↑ + spin + flip | B |
| Pop (hold, release) | Space | A |
| Mute / tail / japan grab | Shift / Q / E | LB / X / Y |
| Butter (nose, or tail with S) | B | LS |
| Camera (chase, action, helmet, TV) | C | D-pad up |
| Restart (hold) | R | View |
| Pause / mute | Esc / M | Menu |

On a rail, A/D swap the slide a quarter turn and Space pops off. Touch controls appear on phones and tablets.

## Scoring
- Rotation pays by the square of the turns: a 720 is worth four 360s, and flips count as turns. Each inversion adds 15%, riding switch 25%.
- Air time and height add a little on every jump. A grab held 0.25 s multiplies the trick by 1.25, held a full second by 1.5; two different grabs add x1.3.
- Each jump or rail in a row adds x0.25 to the line. Landing on snow banks it with +450 and 15% on top; a sketchy (sideways) landing keeps half; a bail loses it.
- Rails pay 750 a second and 450 per swap. Butters pay 150, or 300 for a 180.
- Repeating the same trick pays 75%, then 55%, then 40%.

## How it works
- `src/course.js`: one deterministic height function for the whole mountain (piste profile by section, valley walls, domain-warped ridges, moguls, kickers, every park feature down the run, bucketed by z), plus the named zones, race gates and a Catmull-Rom racing line.
- `src/skier.js`: ski physics shared by player and AI. The run and the park use an arcade flavour (lower drag, bigger pops, forgiving landings that snap straight, rails that carry your speed); the race keeps the full simulation: progressive edge roll with sidecut carving (R = Rsc / tan(edge)), flat skis drift, grip in g that turns into a speed-scrubbing skid past its limit, snow surfaces (groomed / deep powder / scraped ice from `surfaceAt`), altitude air drag with tuck and drafting, leg compression from g-load, ballistic airtime with tricks (the flip or roll axis is set when it starts, tilted off-axis when you're spinning: cork, bio, rodeo, misty, flatspin), course nets that bounce you back in, butters, and crashes that tumble and slide (yard sale in `src/debris.js`) before you get up where you stopped.
- `src/atmos.js`: GPU heightfield pass for mountain-cast sun shadows (soft penumbra) and horizon AO, plus an altitude fog with a sun lobe, patched into every material.
- `src/ai.js`: AI skiers drive the same physics through the same controls. Racers track the racing line (Stanley controller) with curvature-based speed checks, and everyone else follows pursuit lines with speed control, avoidance and park tricks.
- `src/terrain.js`: chunked LOD terrain + mid/far rings, snow shader (wind ripples, corduroy, rock on steep faces, sun glints).
- `src/park.js` (+ the park section of `course.js`): table jumps, rollers, halfpipe and rail ramps are part of the shared height function; a fine surface mesh draws them over the coarser terrain, which `meshHeightAt` sinks underneath. Grinds (`Skier.stepGrind`) follow the rail with gravity and friction (and in the race physics, a balance you steer to keep); the pipe turns the skis to follow the speed on the walls and sends lip airs straight up and back in.
- `src/avatar.js`: Rocketbox avatars driven from the skier's procedural pose: spine and head from its frames, arms and legs re-solved with the avatar's own bone lengths, clothes re-dyed into jacket, pants and gloves.
- `src/sky.js`: HDRI sky dome, image-based light from it, and a sun placed where the photo's sun is.
- `src/spruce.js`, `src/trees.js`: snow-laden spruces from a painted needle bough with snow settling on the upper faces, three instanced LODs.
- `src/props.js`: chairlift with moving chairs, gates, start house, finish arena + crowd, village, blue course nets, rocks.
- `src/main.js`: modes, the scoring (lines, multipliers, repeats), the HUD (zone, score, speed or air time, run minimap) and the menu.

## Assets
- Skies: Poly Haven HDRIs (CC0): Kloofendal 48d Partly Cloudy (Pure Sky), Kloppenheim 06 (Pure Sky), Qwantani Dusk 2 (Pure Sky), Snow Field (Pure Sky).
- Snow and rock: Poly Haven textures (CC0): Snow 02, Rock Face 04.
- People: Microsoft Rocketbox avatar library (MIT).
- `tools/fetch_assets.py` downloads them, and `tools/build_assets.py` bakes the sky domes and game textures.

## Dev
```
npm install
npm run dev            # http://127.0.0.1:5260
node tools/sim.mjs race   # headless race: finish times, missed gates, crashes
node tools/parksim.mjs    # park riders on each line: airs, grinds, crashes
node tools/parkjump.mjs   # table jumps: approach speed -> landing spot
node tools/tour.mjs shots/tour free golden   # screenshots around the mountain
node tools/trick.mjs shots/cork KeyD,KeyS Large   # ride a table with real keys and film the trick
node tools/rail.mjs shots/rail "Long Tube" 2      # ride a rail, swap twice
```
URL flags: `?menu=0&mode=race|run|park&line=jumps|rails|pipe&auto=1&tod=bluebird|golden|alpenglow|storm&z=1200&cam=chase|action|helmet|tv&q=low|high|ultra`.

Pushing `main` deploys to GitHub Pages.
