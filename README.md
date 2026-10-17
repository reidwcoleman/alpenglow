# Alpenglow

A big-mountain skiing game in the browser. One 3.4 km run from the summit to the village (~1 km of vertical), a terrain park, and a mountain full of AI skiers, under photographed skies with scanned snow and rock and real people on the skis.

**Play:** https://reidwcoleman.github.io/alpenglow/

## Modes
- **Race the Cup**: mass-start downhill against 7 AI racers through 39 gates. A missed gate costs 2 s.
- **Ski Park**: free play in Alpenglow Park. A jump line of four table tops (S, M, L, XL, each with its sweet-spot speed on a board), six rails and boxes (50-50s, boardslides, a kinked rail, a rainbow box), a halfpipe and a roller line. Tricks chain into combos (up to x8); a crash loses the combo. Keys 1-4 jump to a line, R takes you back to the top, and riding out the bottom loops you to the top.
- **Free Ride**: 32 AI skiers (experts, carvers, cruisers, beginners, park riders) on the whole mountain, spins, flips and grabs, near-miss bonuses.

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
- `src/skier.js`: ski physics shared by player and AI: progressive edge roll with sidecut carving (R = Rsc / tan(edge)), flat skis drift, grip in g that turns into a speed-scrubbing skid past its limit, snow surfaces (groomed / deep powder / scraped ice from `surfaceAt`), altitude air drag with tuck and drafting, leg compression from g-load, ballistic airtime, and crashes that tumble and slide (yard sale in `src/debris.js`) before you get up where you stopped.
- `src/atmos.js`: GPU heightfield pass for mountain-cast sun shadows (soft penumbra) and horizon AO, plus an altitude fog with a sun lobe, patched into every material.
- `src/ai.js`: AI skiers drive the same physics through the same controls. Racers track the racing line (Stanley controller) with curvature-based speed checks, and everyone else follows pursuit lines with speed control, avoidance and park tricks.
- `src/terrain.js`: chunked LOD terrain + mid/far rings, snow shader (wind ripples, corduroy, rock on steep faces, sun glints).
- `src/park.js` (+ the park section of `course.js`): table jumps, rollers, halfpipe and rail ramps are part of the shared height function; a fine surface mesh draws them over the coarser terrain, which `meshHeightAt` sinks underneath. Grinds (`Skier.stepGrind`) follow the rail with gravity, friction and a balance you steer to keep; the pipe turns the skis to follow the speed on the walls and sends lip airs straight up and back in.
- `src/avatar.js`: Rocketbox avatars driven from the skier's procedural pose: spine and head from its frames, arms and legs re-solved with the avatar's own bone lengths, clothes re-dyed into jacket, pants and gloves.
- `src/sky.js`: HDRI sky dome, image-based light from it, and a sun placed where the photo's sun is.
- `src/spruce.js`, `src/trees.js`: snow-laden spruces from a painted needle bough with snow settling on the upper faces, three instanced LODs.
- `src/props.js`: chairlift with moving chairs, gates, start house, finish arena + crowd, village, nets, rocks.

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
```
URL flags: `?menu=0&mode=race|free|park&line=jumps|rails|pipe&auto=1&tod=bluebird|golden|alpenglow|storm&z=1200&cam=chase|action|helmet|tv&q=low|high|ultra`.

Pushing `main` deploys to GitHub Pages.
