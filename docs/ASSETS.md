# Assets and intellectual property

Lumora is an unofficial fan project. The rules below keep it that way, and keep it replaceable with original lore if it is ever commercialised.

## Never use

- Film footage, stills, screenshots, trailers, or posters
- Film score, dialogue, or sound effects
- Official logos, typography (including the film title lettering), or Wizarding World branding
- Actor or character likenesses, including recognisable costumes or props such as specific wands
- 3D models ripped or extracted from games, films, or theme parks
- Scanned book pages or passages quoted from books or scripts

Facts are fine: spell names, incantations, chapter numbers, and which film a spell appears in.

## Allowed sources

| Asset type | Source                                                               | Licence                 |
| ---------- | -------------------------------------------------------------------- | ----------------------- |
| Fonts      | IM Fell English, Alegreya Sans (Google Fonts, served by `next/font`) | SIL Open Font License   |
| 3D models  | Made for this project, or CC0 (for example Poly Haven, Kenney)       | CC0 or original         |
| Textures   | Made for this project, or CC0 (for example Poly Haven, ambientCG)    | CC0 or original         |
| Audio      | Made for this project, or CC0/CC-BY with attribution recorded below  | CC0, CC-BY, or original |

## Current 3D assets

As of Phase 4, the chamber contains no downloaded models or textures. The room, bookshelves, candles, pedestal, wand, and all six target props (tome, warded door, practice mannequin, spectacles, potted vines, cloak stand) are built from three.js primitives in `src/three/`. They are original, and none is modelled on a film prop.

## Current audio

No audio files. Every spell sound is synthesised in the browser from recipes in `src/features/spell-casting/audio/cues.ts` (oscillators and filtered noise), so the sounds are original by construction and there is nothing to license.

## Conventions for future binary assets

```text
public/
├── models/<target-model>.glb     Draco/Meshopt compressed, ≤ 300 KB each
├── textures/<name>.ktx2          ≤ 1024² unless justified
└── audio/<cue-id>.webm           Opus, mono unless spatial, ≤ 100 KB per cue
```

- File names match schema ids: target model `tome` loads `models/tome.glb`, sound cue `cast-chime` loads `audio/cast-chime.webm`.
- Every asset gets a row in the register below before it is merged.

## Asset register

| File                                                        | Author / source                                         | Licence                   | Notes                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------ |
| `node_modules/@fontsource/im-fell-english` (dev dependency) | IM Fell English by Igino Marini, packaged by Fontsource | SIL Open Font License 1.1 | Read at build time to render spell share images. Not served to browsers. |
