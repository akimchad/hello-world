# Marvel Kombat

A 3D superhero fighting game in the style of modern Mortal Kombat, built with Three.js. Two players share one keyboard, or you can play against the CPU.

> Non-commercial fan prototype. Every hero, costume and arena is generated in code: sculpted, skinned bodies with painted costumes, and faces with moving jaws, eyelids and brows. The audio is synthesized in code too. There are no official Marvel models, textures or sounds, and all characters and names belong to their owners.

## Run it

You need Python 3, which macOS already includes:

```bash
python3 serve.py
```

That opens http://localhost:8000 in your browser. ES modules don't load from `file://`, so opening `index.html` directly won't work.

## Controls

| Action        | Player 1 | Player 2 (numpad) | Player 2 (laptop alt) |
|---------------|----------|-------------------|-----------------------|
| Move          | A / D    | ← / →             | ← / →                 |
| Jump          | W        | ↑                 | ↑                     |
| Crouch        | S        | ↓                 | ↓                     |
| Light attack  | F        | Num 1             | K                     |
| Heavy attack  | G        | Num 2             | L                     |
| Special       | H        | Num 3             | ;                     |
| Block (hold)  | R        | Num 4             | O                     |
| Ultimate      | T        | Num 5             | P                     |

`Esc` pauses. You can rebind every key under **Controls**, and your bindings are saved in the browser.

## How fighting works

- **Light** chains up to 3 hits (jab → cross → kick). **Heavy** is slower and hits harder.
- **Crouch + Light** is a low sweep that knocks the opponent down. **Crouch + Heavy** is an uppercut launcher.
- Attacking in the air does a jump-in. Jump-ins and some heavies are *overheads*: block them standing, not crouching.
- **Block** cuts damage down to chip damage. Low attacks and Hulk's shockwave must be blocked crouching.
- Crouching ducks under high punches.
- A **Special** costs no meter but has a cooldown (the blue bar). Specials can cancel a light attack that hits.
- The **Ultimate** meter (gold) fills as you deal and take damage. When it's full, press Ultimate for a cinematic super move.

## Roster

| Hero | Special | Ultimate | Trait |
|------|---------|----------|-------|
| Spider-Man | Web Pull: yanks the foe in | Web Barrage: web lock + combo | Double jump |
| Iron Man | Repulsor Blast: fast projectile | Unibeam: full-screen beam | Hover (hold Jump while falling) |
| Thor | Lightning Strike: bolt from the sky | God of Thunder: lightning storm | Hammer heavy is an overhead |
| Hulk | Ground Smash: low shockwave | Hulk Smash: leaping slam | Super armor on heavies, most HP |
| Captain America | Shield Throw: returns like a boomerang | Avengers Assemble: shield rush combo | Shield block takes almost no chip |
| Gamora | Godslayer Dash: dash-through slash | Blade Fury: teleporting slash flurry | Longest light attacks |
| Doctor Doom | Mystic Bolt: crackling green sorcery blast | Science & Sorcery: binds the foe in green lightning and detonates | Force field: half chip damage when blocking |
| Sentry | Solar Flare: heavy golden blast | The Void: turns into his dark side, and shadow tendrils seize and slam the foe | Triple jump (flight) |

**Arenas:** Tower Rooftop (a rainy night city with lightning), Knowhere Outpost (a mining deck before a giant skull station) and Rainbow Bridge (a crystal bridge before the golden city).

## Visuals

- **Bodies:** each hero is a skinned 3D body with sculpted muscles and a unique physique, so joints bend smoothly.
- **Costumes:** painted color plus normal maps for fabric, armor plating, scale mail, rocky skin and veins.
- **Faces:** the expressions change with the fight: focused, gritting teeth, shouting on attacks, wincing when hit, dazed when knocked down, smiling or laughing on a win, and a roar during ultimates. Eyes blink and track the opponent.
- **Capes:** Thor's and Sentry's capes are simulated cloth.
- **Cinematics:** round 1 opens with face close-ups and name cards, and ultimates zoom in on the hero's face.
- **Rendering:** MSAA anti-aliasing, bloom, image-based lighting and light color grading. If the game runs slowly, set Graphics quality to Medium or Low in Settings.

## Settings

Volume (master, music, effects), announcer voice, round time, rounds to win, graphics quality (Low turns off bloom and shadows for slower computers), screen shake and CPU difficulty.

## Adding realistic models and sounds (optional)

The game runs fully without these files. If you add them, they're picked up automatically on the next load. Only use files you have the rights to use.

**Character models (GLB or FBX + Mixamo):**
- `.fbx` files work too. List them in `assets/manifest.json`. For example, Spider-Man currently uses `models/raimisuit+-+mixamorig.fbx`.
- Put an FBX's texture PNGs in `assets/models/textures/` using their original file names. `*_BaseColor`, `*_Normal`, `*_Roughness` and `*_Metallic` are wired up automatically.
- Models **without animation clips** still work if they have a Mixamo skeleton. The game's own pose system is retargeted onto the bones, so every move, hit reaction and K.O. animates.
- Put a model at `assets/models/spiderman_realistic.glb` (or `spiderman.glb`) and `assets/models/sentry_realistic.glb` (or `sentry.glb`).
- For other heroes, list them in `assets/manifest.json` (example below).
- The model needs a skeleton, ideally rigged on Mixamo, and animations. Animations can be embedded in the GLB or kept as separate GLBs listed in the manifest.
- Clips are matched by name: *Idle / Fighting Idle, Walk, Walk Back, Crouch, Block, Jump, Jab / Punch, Cross, Kick / Roundhouse, Hook, Uppercut, Sweep, Flying Kick, Hit Reaction, Knocked Down, Getting Up, Death, Victory, Taunt*. Missing clips fall back to the closest match.
- Clips are made "in place" automatically (horizontal root motion is removed).
- Clips crossfade between states, and attack clips are time-scaled to each move's timing.
- Models are scaled to the hero's height, placed on the floor, and get PBR materials with skin sheen, sweat and rim light.
- A model without animations is ignored, and that hero keeps the built-in version.

**Sounds:**
- `assets/audio/hit_sharp.wav` is the high-frequency slap layer.
- `assets/audio/heavy_bass.wav` is the sub-bass layer.
- `assets/audio/stage_ambience.mp3` is a looping stage ambience.
- `assets/audio/whoosh.wav` is optional.
- Grunts are optional too: add them through the manifest as `grunt_hurt`, `grunt_effort` and `grunt_ko` (`_1`, `_2`… for variations), or per hero as `spiderman_hurt` and so on.
- Hits are layered (sharp + body + bass), each layer with ±5% random pitch. Any missing file is replaced by a synthesized layer.

Example `assets/manifest.json`:

```json
{
  "models": { "thor": "models/thor.glb" },
  "animations": { "idle": "animations/Fighting Idle.glb", "punch": "animations/Punching.glb", "hit": "animations/Hit Reaction.glb" },
  "audio": { "grunt_hurt_1": "audio/hurt1.wav", "ambience_space": "audio/space_hum.mp3" }
}
```

## Project layout

```
index.html        screens and HUD markup
css/style.css     UI styling
src/main.js       app flow: menus, character/stage select, settings, render loop
src/game.js       a match: hit resolution, projectiles, camera, rounds, cinematics
src/fighter.js    fighter state machine, physics, inputs → moves, animation
src/moves.js      attack tables, specials and ultimates
src/heroes.js     roster stats, costumes, props and hair for each hero
src/anatomy.js    skinned, sculpted body builder and painted part materials
src/face.js       sculpted heads, eyes, teeth, brows and the expression rig
src/cloth.js      Verlet cloth for capes
src/textures.js   procedural noise and normal-map generation
src/models.js     optional GLB/Mixamo characters: loading, cloning, crossfades, PBR
src/post.js       depth of field, SSAO, motion/radial blur, film grade
src/reflect.js    planar floor reflections (Ultra)
src/enhance.js    character rim light, skin shading and sweat
src/rig.js        pose library and pose blending
src/arenas.js     procedural 3D stages and environment lighting
src/effects.js    particles, lightning, shockwaves, light pool
src/audio.js      synthesized sound effects, music and announcer
src/ai.js         CPU opponent
src/input.js      two-player keyboard handling and bindings
vendor/three/     Three.js r160 (MIT), vendored so the game runs offline
```
