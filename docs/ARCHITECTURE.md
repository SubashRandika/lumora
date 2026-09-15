# Architecture

## Principles

1. **Spells are data.** No spell has its own component. A spell is a validated definition that generic systems interpret.
2. **Dependencies point inward.** The domain doesn't know React, Next.js, or Three.js exists. ESLint enforces this (see `eslint.config.mjs`).
3. **WebGL is a progressive enhancement.** Every spell is fully readable as server-rendered HTML. The 3D chamber is a client-only island loaded on demand.
4. **Animation doesn't run through React.** Per-frame work lives in `useFrame` and GSAP timelines that mutate refs. React re-renders only when UI state changes (for example, a new cast phase).

## Layers

```text
┌────────────────────────────────────────────────────────────────────┐
│ UI          src/app, src/components                                │
│             Routes (RSC by default), design system, client islands │
├────────────────────────────────────────────────────────────────────┤
│ 3D          src/three                                              │
│             Scene, environment, targets, performers, particles     │
├────────────────────────────────────────────────────────────────────┤
│ Features    src/features/spell-casting                             │
│             SpellEngine, spell audio (Web Audio synth)             │
├────────────────────────────────────────────────────────────────────┤
│ State       src/stores                                             │
│             Zustand: settings (persisted), casting (ephemeral)     │
├────────────────────────────────────────────────────────────────────┤
│ Infra       src/lib                                                │
│             Device probe, utilities                                │
├────────────────────────────────────────────────────────────────────┤
│ Domain      src/domain                                             │
│             Schemas, registry, cast state machine, engine contract,│
│             performance tiering. Pure TypeScript.                  │
├────────────────────────────────────────────────────────────────────┤
│ Content     src/data   ·   Config  src/config                      │
│             Spell datasets, works  ·  categories, quality, site    │
└────────────────────────────────────────────────────────────────────┘
```

Each layer may import only from layers below it. (Config and domain reference each other's _types_; neither has runtime dependencies on outer layers.) `src/domain`, `src/data`, and `src/config` may not import React, Next.js, Three.js, components, or stores.

## Folder structure

```text
src/
├── app/                         Routes
│   ├── layout.tsx               Fonts, skip link, settings hydration
│   ├── page.tsx                 / (full-bleed hero; renders its own overlay header)
│   ├── not-found.tsx
│   ├── (pages)/                 Route group: shared header + footer (PageShell)
│   │   ├── spells/page.tsx      /spells
│   │   ├── spells/[spellId]/    /spells/:id (SSG, metadata, share image)
│   │   ├── books/  books/[workId]/
│   │   └── settings/  about/
│   └── (chamber)/               Route group: full-screen 3D, overlay header, no footer
│       ├── chamber/             /chamber
│       └── spells/[spellId]/cast/   /spells/:id/cast
├── components/
│   ├── ui/                      Design system primitives
│   ├── landing/                 WandlightHero, EnterChamberLink, SpellIndex
│   ├── chamber/                 ChamberExperience, HUD, CastControls, useSpellCasting, useCastingKeys
│   ├── navigation/  spells/  settings/  providers/
├── features/spell-casting/      SpellEngine; audio/ (cue recipes, Web Audio synth, audio performer)
├── hooks/                       useReducedMotion, useDeviceTier
├── three/                       The 3D layer. Nothing outside may import it statically.
│   ├── scene/MagicChamber.tsx   Canvas root (the dynamic-import entry point)
│   ├── casting/                 CastRig (shared fx + refs), SpellEffects, reactions, GSAP helpers
│   │   └── outcomes/            TargetOutcome picks a performer per outcome kind: Levitation, TargetSwell
│   ├── environment/             Room (instanced floor + stone walls), Bookshelves, Candles
│   ├── objects/                 Pedestal, Wand (camera-attached), targets (six original props)
│   ├── lighting/  camera/  particles/  postprocessing/
│   ├── performance/             FrameDriver (render loop, idle rate, adaptive quality), RenderInfo, DevStats (dev overlay), SceneProbe (opt-in values for E2E tests)
│   ├── utils/                   seeded random, instancing helpers, shared glow texture
│   └── palette.ts               Scene colours
├── config/
│   ├── categories.ts            Spell categories (configurable)
│   ├── performance.ts           Quality profiles per tier, performance budgets
│   └── site.ts                  Name, URL, disclaimer
├── data/
│   ├── works.ts                 Books/films in the content pack
│   ├── spells/                  One dataset per work + index
│   └── registry.ts              App registry instance
├── domain/
│   ├── spells/                  spell.schema, work.schema, registry, format
│   ├── casting/                 castMachine, engine.types, wandPath, outcomes (timing as pure functions)
│   └── performance/             tier detection, frame pacing (idle rate, frame-rate monitor)
├── lib/                         cn, device probe
└── stores/                      settingsStore, castingStore
```

## Rendering strategy

| Route                           | Rendering                      | Why                                  |
| ------------------------------- | ------------------------------ | ------------------------------------ |
| `/`, `/spells`, `/about`        | Static                         | No request data                      |
| `/spells/[spellId]`             | SSG via `generateStaticParams` | SEO: full text, metadata, Open Graph |
| `/books/[workId]`               | SSG                            | SEO                                  |
| `/spells/[id]/cast`, `/chamber` | Static shell + client island   | WebGL can't render on the server     |
| `/settings`                     | Static shell + client panel    | Reads persisted local preferences    |

`dynamicParams = false` on dynamic routes, so unknown ids return a 404 without doing any work.

## Landing page wand-light

The hero is two copies of the same carved text: an engraved layer, and a lit layer masked to a radial pool of light. A small client loop writes `--light-x` and `--light-y` on the hero element, so the light moves without React re-renders. It eases toward the pointer, drifts slowly when idle, and pauses when the hero is off screen or the tab is hidden. With reduced motion it doesn't drift or lag.

**Enter the Chamber** is a real link. A plain click animates registered CSS properties (`--light-radius`, the lit fade) to flare the light, fades to ink, then navigates. The chamber page fades in (`animate-emerge`). Modified clicks, no-JS visits and reduced motion navigate immediately.

## 3D loading strategy

```text
User opens /chamber or /spells/:id/cast
  → server HTML: "Preparing the Chamber" screen + HUD (+ <noscript> link to the spell page)
  → client: useDeviceTier() → probeDevice() → detectTier()      [step: Checking your device]
       unsupported → ChamberFallback ("can't show the 3D chamber" + link to spell details)
       supported   → next/dynamic(() => import("@/three/scene/MagicChamber"), { ssr: false })
  → Canvas renders; after 3 frames every shader compiles, then onReady   [step: Lighting the candles]
  → loading screen fades; chamber is interactive
```

- **Boundary enforcement:** an ESLint rule forbids static imports of `three`, `@react-three/*`, `postprocessing`, or `@/three/*` outside `src/three` (type-only imports are allowed). An E2E test confirms that `/`, `/spells`, and spell pages never download three.js, and that the chamber does.
- **Post-processing** (bloom and vignette) is a separate lazy chunk that low-tier devices never download.
- **Quality:** `effectiveTier(settings.graphics, detectedTier, runtimeDowngrades)` picks a `QUALITY_PROFILES` entry. Changing the Settings value re-renders live. Changes to antialiasing or shadows remount the canvas, because both are fixed when the WebGL context is created. `FrameDriver` reports sustained low frame rates (only while drawing at full rate); in auto mode, after a 4-second warm-up, the chamber steps down one tier.
- **Render loop:** the canvas uses `frameloop="never"`, and `FrameDriver` calls `advance()` from its own animation-frame loop. It draws every frame during a cast, while the pointer moves, and for 2.5 s after either; otherwise it draws at the profile's `idleFrameRate`. Performers can call `rig.wake()` when something moves outside a cast.
- **Shader warm-up:** before reporting ready, and again after each spell switch, `ShaderWarmup` compiles every material (including effects hidden until a cast) for both the screen and the post-processing target, so casts never compile shaders mid-animation.
- **Switching spells** swaps the target prop and rewrites the URL with `history.replaceState`, without a Next.js navigation, so the WebGL context survives.
- **Failure handling:** an error boundary around the canvas catches render and shader errors, and a `webglcontextlost` listener catches GPU resets. Both show `ChamberFallback` with "Reload the chamber". The rest of the page keeps working.
- **Casting:** `useSpellCasting` creates the Spell Engine and audio outside the canvas. The canvas receives the engine as a prop, and its performers register when they mount. GSAP is restricted to `src/three`, so it ships only in the chamber chunk.

## State

- **settingsStore** (persisted to `localStorage`, `skipHydration`): graphics, motion, sound, music, volume. `SettingsHydrator` rehydrates after mount to avoid SSR mismatches.
- **castingStore** (ephemeral): selected spell id, cast state, last input, failure reason. In the chamber the Spell Engine owns the lifecycle and mirrors it here through `syncFromEngine`.
- Three.js objects never enter a store. Scene state lives in refs inside the 3D layer.

## Content packs and IP

All franchise-specific content lives in `src/data` (works, spells) and `src/config/site.ts` (name, disclaimer). Target models are generic props (`tome`, `warded-door`). To replace the franchise with original lore, swap those files. The engine, 3D layer, and UI need no changes.
