# Marvel Kombat — Godot 4 port

A Godot 4.7 version of the 2-player 3D fighting game in this repo. The web version (`../index.html`,
`../src/*.js`) is unchanged. This port uses the same rules, numbers and character models.

## Setup

The character models are your own local files in `../assets/models/`. They are not in git. Link
them into the Godot project and copy the CC0 sounds:

```bash
godot/tools/link_assets.sh
```

Then open `godot/project.godot` in Godot 4.7 or later. The first import takes about 35 seconds.
From the command line:

```bash
godot --path godot
```

Character select lists every hero whose model file is present.

## Controls

| | Player 1 | Player 2 | Gamepad (pad 1 = P1, pad 2 = P2) |
|---|---|---|---|
| Move / crouch / jump | W A S D | Arrow keys | D-pad or left stick, Cross jumps |
| Light attack | F | K or Num 1 | Square |
| Heavy attack | G | L or Num 2 | Triangle |
| Special | H | ; or Num 3 | L1 / R1 |
| Block | R | O or Num 4 | Circle |
| Ultimate (meter full) | T | P or Num 5 | L2 / R2 |
| Pause | Esc | | Options |

- Crouch + light is a sweep (low). Crouch + heavy is an uppercut (launcher).
- Light → light → light chains jab, cross, kick. A light hit can cancel into heavy, special or ultimate.
- Block high or low. Lows must be crouch-blocked, and overheads (air attacks, Thor's and Hulk's heavies) must be blocked standing.
- On character select, press Tab (or P2's Special button) to make P2 a CPU. Shift+Tab changes the CPU difficulty.

The match is best of 3 rounds with a 99-second timer. There is no music.

## What's ported

| Area | Status |
|---|---|
| Roster stats, attack tables | Generated from `src/heroes.js` and `src/moves.js`, so the numbers match the web game exactly (`scripts/data.gd`). |
| Pose library | All 58 poses generated from `src/rig.js` (`scripts/poses.gd`). |
| Fighter state machine | Port of `fighter.js`: walk with foot planting, jump, air attacks, double/triple jump, Iron Man hover, chains, cancels, lunges, armor, block/blockstun, hit/knockdown/launch, get-up, wall bounce, regen passives. |
| Match | Port of `game.js`: hitboxes vs. hurtboxes, chip damage, combo scaling, asymmetric hit-stop, projectiles and projectile clashes, push-apart, arena bounds and ceiling, intro, rounds, timer, KO slow motion, time-out and draw, camera with intro, KO and win shots. |
| Specials | All 11, with the web game's timings, damage, hit properties and projectile behaviour. The visuals are simpler. |
| Ultimates | All 11, using the web game's opener → lock → scripted combo structure, with damage close to the originals. The cinematics are much shorter than the web versions (no void silhouette, no Bifröst dragon, and so on). |
| CPU opponent | Port of `ai.js` (easy / normal / hard). |
| Stage | One stage: Tower Rooftop at night. |
| HUD | Health with a damage trail, ultimate meter, special cooldown, round pips, timer, announcer text, combo counter, intro cards, ultimate banner. |
| Sound | The repo's CC0 samples (hits, whooshes, hurt and KO voices for six heroes) plus a few synthesised sounds. The web game's synthesised voices and announcer are not ported. |

## How the models are animated

`scripts/model_rig.gd` does the same thing as the web game's `models.js`:

1. **Map the bones.** `scripts/bones.gd` maps any humanoid skeleton to the game's joints by
   name. It handles Mixamo, 3ds Max Biped (`Bip01 L UpperArm`), Unreal/Fortnite (`upperarm_l`),
   Venom's `Right elbow`-style names, and Groot's bone-chain arms.
2. **Stand the model up.** Each model is turned so its head is up and it faces +Z. It is then
   scaled to the hero's height using its skinned rest-pose vertices.
3. **Drive it from the pose library.** An invisible driver skeleton is posed from the pose
   library. Each mapped bone copies the driver joint's world rotation relative to the rest pose.
   This is the same transfer Godot's skeleton retargeter does between two profiles. It is done at
   runtime, not with import-time `BoneMap` resources, because 10 different rigs share one
   procedural pose library.
4. **Blend in the files' own clips.** The MUA Captain America, Thor and Hulk files ship attack
   clips (listed in `../assets/manifest.json`). These clips are sampled straight from the imported
   `Animation`s and blended over the retargeted pose for attacks, block and specials.
5. **Grip Gamora's sword.** Her sword is skinned to its own skeleton. It is moved into her right
   fist and attached with a `BoneAttachment3D`.

## Known gaps

- **Iron Man** has no skeleton in his FBX. The web game auto-rigs that mesh, but this port does
  not yet. He moves as a rigid statue that leans, lies down and turns. His textures are applied
  from the `textures/` maps.
- **MUA clips** (Cap, Thor, Hulk) contribute their limb motion and their hips turn, tilt and rise
  relative to each clip's first frame. Their absolute root facing and travel are ignored, because
  the clips' root bones use their own convention.
- **Gamepad support** is coded (pad 1 is P1, pad 2 is P2, PlayStation layout, rumble on heavy
  hits) but hasn't been tried with a real controller.
- No spring-bone capes or hair, no gaze tracking, no facial expressions, and no fist curl (hands
  stay open).
- Only one of the web game's four stages has been ported. There is no settings menu (rounds, time,
  rebinding).

## Testing from the command line

```bash
# CPU vs CPU, logging every hit, special, ultimate, KO and round
godot --headless --path godot --fixed-fps 60 --quit-after 5400 -- --fight=thor,hulk --cpu-both --log
# P1 human vs a CPU, straight into a match
godot --path godot -- --fight=cap,venom --cpu
# window screenshot after N seconds
godot --path godot -- --fight=spiderman,deadpool --cpu-both --shot=/tmp/shot.png --shot-at=8
```

`-- --flowtest=<dir>` drives title → select → fight → pause with injected key presses and saves
screenshots into `<dir>`. `tools/dump_models.gd` prints each model's bones, mapping and clips.
`tools/clip_test.tscn` shows Cap, Thor and Hulk playing a file clip (`-- --key=punch`). `tools/viewer.tscn` lines up
every hero and cycles through poses (`godot --path godot res://tools/viewer.tscn`).
