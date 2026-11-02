# Audio sample credits

All samples below come from OpenGameArt.org items whose licence field reads **CC0 1.0 (public domain)**,
checked on each item's page on 2026-11-01. CC0 needs no attribution; this file records provenance.
Files were converted/trimmed to onset, faded and peak-normalised to 16-bit mono 44.1 kHz WAV
(no other processing). Pitch/length are otherwise unchanged.

| File(s) | Used for (key in `src/audio.js`) | Source item | Author | Licence |
|---|---|---|---|---|
| `hit_sharp.wav` | bright hit transient (`hit_sharp`) | "37 hits/punches" (`hit17`) https://opengameart.org/content/37-hitspunches | supergamez2014 | CC0 |
| `heavy_bass.wav` | low impact boom (`heavy_bass`) | "37 hits/punches" (`hit22`) https://opengameart.org/content/37-hitspunches | supergamez2014 | CC0 |
| `whoosh.wav` | swing whoosh (`whoosh`) | "Swishes Sound Pack" (`swish-9`) https://opengameart.org/content/swishes-sound-pack | qubodup | CC0 |
| `<hero>_hurt.wav`, `<hero>_ko.wav` for cap, ironman, spiderman, thor, deadpool, sentry | per-hero pain / knockout voice (`<hero>_hurt`, `<hero>_ko`), registered in `assets/manifest.json` under `audio` | "5 Hit Sounds + Dying" (`hit1`-`hit5`, `die1`) https://opengameart.org/content/5-hit-sounds-dying | alket | CC0 |

Heroes without a sample (Hulk, Groot, Venom, Gamora, Doom) keep the synthesized voices. `effort` grunts
(attack shouts) are still synthesized for everyone. To go back to fully synthesized sound, delete the
files and/or the `audio` block in `assets/manifest.json`.
