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

**Character models (GLB, FBX or decimated sculpts):**
- List one model per hero in `assets/manifest.json` (example below). Model files stay local: `assets/models/` is git-ignored.
- **Rigged models** work whatever the skeleton naming: Mixamo, 3ds Max Biped (`Bip01 L UpperArm`), Unreal/Fortnite (`upperarm_l`, `spine_03`) or Rigify. The game's own pose system is retargeted onto the bones, so every move, hit reaction and K.O. animates. The rest pose (T-pose, A-pose or relaxed) is measured from the bones.
- On load each model is turned to face forward, scaled to the hero's height (this also sets the hurtbox and attack reach), centred, and placed with its feet on the floor.
- Load-time fixes:
  - Skins whose bind data is in another space than the bones are re-bound.
  - Unskinned parts (belts, clasps) are attached to the nearest bone.
  - Bone chains outside the body (capes hung off the scene root) are hung on the body.
- **Static meshes with no skeleton** get auto-rigged when their entry has `"autorig": true`. The game detects orientation, fits a skeleton, computes skin weights and animates the mesh with the built-in moves.
  - `"upAxis"`, `"flip"` and `"turn"` fix an unusual orientation.
  - `"weldedArms": true` helps sculpts whose arms touch the body.
  - Multi-part sculpts use their part names: leg/belt parts never follow the arms, and head and eye parts move with the head.
- **Textures:**
  - FBX-embedded textures load automatically.
  - `"textures"` points at a folder for external ones.
  - `"maps"` adds maps the file doesn't reference: `map`, `normalMap`, `specularMap`, `emissiveMap`.
  - Legacy specular maps become PBR roughness/metalness maps.
  - Non-standard (game-ripped) normal maps are converted.
  - Every hero has a material recipe in `src/models.js` (metal armour, fabric sheen, skin scattering, emissive glows). All parts cast and receive shadows.
- **Hero clips over the pose system:** `"clips": { "punch": "attack_light1", "block": "blocking" }` plays a model's own animations for those game keys and blends them over the retargeted pose. Cap and Thor use their MUA attack animations this way. Keys: `idle`, `walk`, `block`, `punch`, `punch2`, `kick`, `heavy`, `sweep`, `uppercut`, `special`.
- **Full Mixamo clip sets** (embedded or listed under `"animations"`) replace retargeting when they cover punches, kicks, hits and knockdowns. Clips are matched by name (*Fighting Idle, Walk, Jab, Cross, Roundhouse, Hook, Uppercut, Hit Reaction, Knocked Down, Getting Up, Death, Victory…*), made "in place", crossfaded and time-scaled to each move.
- **Huge sculpts:** `python3 tools/glb_to_mkm.py big.glb assets/models/name.mkm 100000` decimates a GLB (e.g. a Nomad Sculpt export) into a game-ready `.mkm`, keeping named parts and vertex paint. Use `tools/decimate_stl.py` for STL files. Hulk's skin, purple pants, hair and eyes are split by that paint.
- A hero whose model is missing or unusable keeps its built-in version, so the public build works without any model files.

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
  "models": {
    "thor": { "url": "models/thor/thor.fbx", "clips": { "punch": "attack_light1", "special": "power_2" } },
    "hulk": { "url": "models/hulk.mkm", "autorig": true, "weldedArms": true },
    "ironman": { "url": "models/ironman.fbx", "autorig": true, "textures": "models/ironman/textures/", "maps": { "map": "body_D.png", "emissiveMap": "body_E.png" } }
  },
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
src/models.js     imported characters: loading, skeleton mapping, retargeting, clips, PBR
src/autorig.js    auto-rigging for static meshes and sculpts
tools/            offline mesh decimators (STL / GLB → .mkm)
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
