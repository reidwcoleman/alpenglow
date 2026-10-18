# Alpenglow

A freeski park game in the browser, built around the feel of the indie game Cork7: corks, flips, grabs, rails and butters scored by rotation, with lines that build a multiplier until you land or bail. One 3.4 km run from the summit to the village (~1 km of vertical) lined with kickers and rail zones, a terrain park, a downhill race, and a mountain full of AI skiers, under photographed skies with scanned snow and rock and real people on the skis.

**Play:** https://reidwcoleman.github.io/alpenglow/

## Skis or snowboard
Pick SKIS or SNOWBOARD on the Ride tab. Snowboarders stand sideways on a twin-tip board (left foot forward) with a tighter 7.5 m sidecut, float better in powder, can't tuck as small, and ride switch after landing a half turn. Spins are called by side (FS 360, BS 540, Half Cab, Cab 720, Switch BS), rolls are wildcats and tamedogs, and the grabs are indy, melon, method, stalefish, nose and tail. About a third of the riders on the mountain are snowboarders.

## Parks
Pick one on the illustrated map (Ride > the park card), by day or by night. Each is its own line down the mountain.
- **The Yard** (3.4 km): summit to village. Wall hits, the Rail Yard, the terrain park with its pipe and rollers, Big Air, the Forest Line rails, a four-table Kicker Line and Last Call.
- **Trick Zone** (1.4 km): a groomed slopestyle course. A rail zone with eight features, three stepped kickers, and a big air to finish.
- **Forest Line** (2.3 km): ungroomed tree skiing. Powder glades with pines on the run itself, a winding tree trail with rollers, three pillow drops and a log jam.
- **Big Air** (0.8 km): a steep inrun into one mega kicker. A full tuck gives about 4.5 s of air.

## Modes
- **The Run**: top to bottom with a timer, score, minimap and a results card. Hold R for 2 s to restart.
- **Ski Park** (The Yard): laps of the terrain park. Keys 1-4 jump to a line, and holding R takes you to the top of yours.
- **Race the Cup** (The Yard): mass-start downhill against 7 AI racers through 39 gates, with realistic physics.
- **Multiplayer**: pick Multiplayer before you ride. Same park and same room means the same slope. You get name tags, Tab for the room list, T to chat, a live trick feed, and invite links (`?park=forest&room=abc`). It runs over public MQTT relays: the game connects to all three at once and de-duplicates messages, so there is no server of our own.
- **Replays**: V replays your last trick, and the results card plays the whole run. You get chase, TV, GoPro, orbit and drone cameras, 1/4 to 1x speed, scrubbing, and "Save clip" (records the canvas to a .webm).

Five conditions: Bluebird Morning, Golden Hour, Alpenglow Dusk, Night Session (a moonlit sky with floodlight towers, the nearest ones real spot lights with shadows) and Powder Day (snowfall).

## Controls
| | Keyboard | Gamepad |
|---|---|---|
| Carve / spin in the air | A D | Left stick |
| Tuck / front flip in the air | W | RT / RB |
| Brake / backflip in the air | S | LT |
| Air roll: sideflip, flatspin with a spin | ← → | Right stick |
| Rodeo (with S) / misty (with W) | ↑ + spin + flip | B |
| Pop (hold, release) | Space | A |
| Grabs (skis: mute, tail, japan, safety, critical, nose · board: indy, tail, melon, method, stalefish, nose) | Shift / Q / E / F / X / Z | LB / X / Y / D-pad left, right, down |
| Shifty / daffy (board: boned), in the air on their own | ↑ / ↓ | Right stick up / down |
| Butter (nose, or tail with S); hold A/D to pivot 180, 360, 540 | B | LS |
| Nose / tail press on a rail | W / S | |
| Camera (chase, action, helmet, TV) | C | D-pad up |
| Restart (hold) | R | View |
| Replay | V | |
| Room list / chat (multiplayer) | Tab / T | |
| Pause / mute | Esc / M | Menu |

On a rail, A/D swap the slide a quarter turn and Space pops off. Touch controls appear on phones and tablets.

Landing assist: about 0.45 s before touchdown the rider finishes whatever rotation is closest to a clean landing (the nearest half turn of spin, the nearest whole flip, carrying on if well into it). Way off still bails. The Tricks tab is a trick book that ticks off each family the first time you land it; new tricks call out "NEW TRICK" and count on the results card.

## Scoring
- Rotation pays by the square of the turns: a 720 is worth four 360s, and flips count as turns. Each inversion adds 15%, riding switch 25%.
- Air time and height add a little on every jump. A grab held 0.25 s multiplies the trick by 1.25, held a full second by 1.5 (and is called "Tweaked"); switching grabs mid-air ("Mute to Tail") adds x1.3. A shifty adds 350, a daffy 300.
- Pop at the lip (release Space right at it, or just off it) for a perfect pop: more height and a faster flip. A landing that matches the slope is "stomped" and pays 15% more.
- Each jump or rail in a row adds x0.25 to the line. Landing on snow banks it with +450 and 15% on top; a sketchy (sideways) landing keeps half; a bail loses it.
- Rails pay 750 a second, 450 per swap, and more while you press (hold Space); a nose or tail press held for 40% of the slide pays 30% more. A spin off the end counts in quarters ("270 Out"). Butters pay 150, plus 230 for every half turn of pivot.
- Repeating the same trick pays 75%, then 55%, then 40%.

## How it works
- `src/maps.js`: the parks (sections, curve, features, zones, tree rules). `course.js` builds the active one, picked by `?park=` or the last one ridden. Picking another reloads the page, and the terrain worker gets the park through its name.
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
- `src/night.js`: floodlight towers, glows, beams and the pool of spot lights that follows the camera.
- `src/snap.js`, `src/replay.js`, `src/net.js`: one skier's look as 52 numbers. Replays record them, multiplayer sends them (with a tiny MQTT client), and both pose stand-in skiers from them.
- `src/post.js`: bloom, sun shafts (the sky dome writes alpha 0 as a mask), grade, lens.
- `src/main.js`: modes, the scoring (lines, multipliers, repeats), the HUD (zone, score, speed or air time, run minimap) and the menu.

## Assets
- Skies: Poly Haven HDRIs (CC0): Kloofendal 48d Partly Cloudy (Pure Sky), Kloppenheim 06 (Pure Sky), Qwantani Dusk 2 (Pure Sky), Snow Field (Pure Sky).
- Snow and rock: Poly Haven textures (CC0): Snow 02, Rock Face 04.
- People: Microsoft Rocketbox avatar library (MIT).
- Night sky: Poly Haven Qwantani Night (Pure Sky), CC0.
- Menu art (park map day and night, park cards, loading screens): generated with Higgsfield (Nano Banana Pro). The prompts are in `art/prompts.md`.
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
node tools/ui2.mjs shots/ui2     # park picker, two browsers in one multiplayer room, replay
PARK=forest node tools/sim.mjs free 150   # any park headless
```
URL flags: `?park=yard|slope|forest|bigair&room=name&menu=0&mode=race|run|park&line=jumps|rails|pipe&auto=1&tod=bluebird|golden|alpenglow|night|storm&z=1200&cam=chase|action|helmet|tv&q=low|high|ultra`.

Pushing `main` deploys to GitHub Pages.
