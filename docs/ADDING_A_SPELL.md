# Adding a spell

Adding a spell should touch only content files. If it forces a change to the engine, the scene, or a UI component, the model is missing a concept. Raise that instead of special-casing the spell.

```text
Definition → effect configuration → (optional) new outcome/target → registry → verify
```

## 1. Check it belongs

- It is cast with a spoken incantation in a work in `src/data/works.ts`. For a new book, add a work entry first.
- You have a source for where it appears (book chapter, or film).
- You can describe it in your own words. Never paste text from a book or script.

## 2. Write the definition

Add an object to the dataset of the work where the spell **first** appears, for example `src/data/spells/philosophers-stone.ts`:

```ts
{
  id: "example-charm",               // kebab-case; becomes the URL
  name: "Example Charm",
  incantation: "Exemplum",
  pronunciation: "ex-EM-plum",
  summary: "One line, ≤140 characters.",
  description: "Two or three original sentences, ≤600 characters.",
  category: "charms",                // an id from src/config/categories.ts
  difficulty: "beginner",
  appearances: [{ medium: "book", workId: "philosophers-stone", chapter: 7 }],
  notes: "Required when it appears in only one medium.",
  wandMotion: { type: "flick", duration: 0.5, easing: "snap" },
  // Or a custom path (−1..1, +y up), which needs a description for the diagram:
  // wandMotion: { type: "custom", points: [{ x: 0, y: -0.5 }, { x: 0.4, y: 0.5 }],
  //               description: "Lift the wand up and to the right.", duration: 0.6 },
  timeline: { preparing: 0.3, casting: 1, projectile: 0.5, impact: 0.3, effect: 3 },
  visualEffect: {
    palette: { core: "#FFFFFF", glow: "#9CC3DF" },
    projectile: { kind: "spark", size: 0.08, trail: true, glow: 0.7 },
    particles: ["sparkles"],
    outcome: { kind: "unlock" },
  },
  environmentEffects: [{ kind: "candle-flicker", intensity: 0.3 }],
  sound: { cast: "cast-click" },
  target: { model: "warded-door" },
}
```

Rules that tests enforce:

- The total timeline must be ≤10 seconds, and `casting` must be greater than 0.
- `projectile: null` requires `timeline.projectile: 0`.
- Ids and incantations must be unique, and every `workId` must exist.

## 3. Reuse before you invent

Before adding anything new, try to build the spell from existing presets: wand motion presets, projectile kinds, particle presets, outcomes, environment reactions, and target models.

If the spell truly needs a new **outcome** (say, `shrink`):

1. Add a variant to `spellOutcomeSchema` in `src/domain/spells/spell.schema.ts`. Until it has a performer, casts use the generic swell, so nothing breaks.
2. Put its timing in `src/domain/casting/outcomes.ts` as pure functions of time, with tests. If it holds for a while, return its wind-down time from `outcomeReleaseAt` and any sounds from `outcomeSoundEvents`.
3. Write a performer component in `src/three/casting/outcomes/` that samples that timing each frame (see `Levitation.tsx`), and register it in `OUTCOME_PERFORMERS` in `TargetOutcome.tsx`.
4. Document it in `docs/SPELL_SYSTEM.md`.

**Sounds:** each `sound` id must exist in `src/features/spell-casting/audio/cues.ts`, and a test enforces it. Leave a moment out to use the default cue, or add a recipe (layers of `hum`, `tone`, `pad`, `sparkle`, `drop`, `rumble`, `creak`, `crackle`, and `noise`; see the Sound section of `SPELL_SYSTEM.md`). `ambient` and `settle` play only for outcomes that schedule them.

A new **target model** works the same way: add it to `TARGET_MODELS`, then add an original asset (see `docs/ASSETS.md`).

## 4. Registry

There's nothing to do. `src/data/spells/index.ts` already includes every spell in an existing dataset file. For a new work's file, add it to the `allSpells` array there.

## 5. Verify

```bash
npm run check        # schema, registry integrity, types, lint
npm run build        # the new /spells/<id> page is prerendered
```

Open `/spells/<id>` and confirm the page reads well without JavaScript.
