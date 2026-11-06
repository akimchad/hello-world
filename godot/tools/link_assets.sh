#!/bin/sh
# Links the hero models from ../assets/models into godot/models/<hero>/ (symlinks, git-ignored)
# and copies the CC0 sounds into godot/audio/. Run from anywhere; safe to re-run.
set -e
G="$(cd "$(dirname "$0")/.." && pwd)"
A="$G/../assets"
M="$A/models"
link() { # hero, relative source path inside assets/models, destination path inside the hero folder
  src="$M/$2"; dst="$G/models/$1/$3"
  [ -e "$src" ] || { echo "missing: $2"; return 0; }
  mkdir -p "$(dirname "$dst")"; ln -sf "$src" "$dst"
}
linkdir() { # hero, source dir, dest dir, file pattern
  [ -d "$M/$2" ] || return 0
  for f in "$M/$2"/$4; do [ -e "$f" ] && link "$1" "$2/$(basename "$f")" "$3/$(basename "$f")"; done
}
link spiderman spiderman-ultimate/spiderman.glb spiderman.glb
link ironman "iron-man-with-no-rig/extracted/iron-man-rig/source/iron man.fbx" "source/ironman.fbx"
linkdir ironman iron-man-with-no-rig/extracted/iron-man-rig/textures textures "M-COC*.png"
link thor 10-thor-mua/source/10_thor.fbx source/thor.fbx
linkdir thor 10-thor-mua/textures textures "*.png"
link hulk hulk-mua/hulk.glb hulk.glb
link cap 07-captain-america-mua/source/07_captamerica.fbx source/cap.fbx
linkdir cap 07-captain-america-mua/textures textures "*.png"
link gamora "fn-gamora-by-sidgara-detqt8i/extracted/FN Gamora/FN Gamora.fbx" gamora.fbx
link doom "dr-doom-v2/extracted/Dr Doom V2/Dr Doom V2 - Visiion.fbx" doom.fbx
linkdir doom "dr-doom-v2/extracted/Dr Doom V2/Textures If Needed" "Textures If Needed" "*.png"
link sentry sentry-by-wilson-neto-oficial-deu1jcb/extracted/Sentry/Sentry_Current_LW.fbx sentry.fbx
linkdir sentry sentry-by-wilson-neto-oficial-deu1jcb/extracted/Sentry . "Sentry_Current_*.png"
link groot groot-king/groot.glb groot.glb
link venom venom/venom.glb venom.glb
link deadpool deadpool/deadpool.glb deadpool.glb
mkdir -p "$G/audio"; cp "$A"/audio/*.wav "$A"/audio/CREDITS.md "$G/audio/" 2>/dev/null || true
echo "linked: $(ls "$G/models" | tr '\n' ' ')"
