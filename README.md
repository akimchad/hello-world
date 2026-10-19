# Marvel Kombat

A 3D superhero fighting game in the style of modern Mortal Kombat, built with Three.js. Two players share one keyboard, or you can play against the CPU.

> Non-commercial fan prototype. Every hero, costume and arena is generated in code: sculpted, skinned bodies with painted costumes, and faces with moving jaws, eyelids and brows. The audio is synthesized in code too. There are no official Marvel or DC models, textures or sounds, and all characters and names belong to their owners.

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
| Doomsday | Bone Charge: armored shoulder charge | Extinction Rampage: grab, pummel and crater slam | Regenerates when not hit |
| Sentry | Solar Flare: heavy golden blast | Million Exploding Suns: arena-wide nova | Triple jump (flight) |

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
src/rig.js        pose library and pose blending
src/arenas.js     procedural 3D stages and environment lighting
src/effects.js    particles, lightning, shockwaves, light pool
src/audio.js      synthesized sound effects, music and announcer
src/ai.js         CPU opponent
src/input.js      two-player keyboard handling and bindings
vendor/three/     Three.js r160 (MIT), vendored so the game runs offline
```
