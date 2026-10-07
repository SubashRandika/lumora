# Spell system

## Domain model

Source of truth: [`src/domain/spells/spell.schema.ts`](../src/domain/spells/spell.schema.ts). Types are inferred from the Zod schemas, and every dataset is validated in `src/data/spells/dataset.test.ts`.

```text
SpellDefinition
├── id, name, incantation, pronunciation?     identity and speech
├── summary (≤140), description (≤600)        original prose only
├── category          → config/categories.ts
├── difficulty        beginner | intermediate | advanced
├── appearances[]     { medium: "book", workId, chapter } | { medium: "film", workId }
├── notes?            book/film differences, spelling variants
├── wandMotion        { type: preset, duration } | { type: "custom", points[], duration }
├── timeline          seconds per phase: preparing, casting, projectile, impact, effect
├── visualEffect
│   ├── palette       { core, glow }
│   ├── projectile    { kind, size, trail, glow } | null
│   ├── particles[]   sparkles | dust | energy | smoke | embers | magic-trail | impact-burst
│   └── outcome       levitate | unlock | petrify | leg-lock | mend | sunburst | ignite
├── environmentEffects[]  { kind: candle-flicker | dust-rise | chamber-brighten | …, intensity }
├── sound?            cue ids (charge, cast, impact, ambient, settle, moments{}) → audio/cues.ts recipes
└── target            { model: tome | warded-door | practice-mannequin | … }
```

Definitions describe **what** happens. The 3D layer decides **how** to render it. `outcome` is a discriminated union, so each outcome carries only its own settings (for example, `levitate.liftHeight`).

## Dataset: Philosopher’s Stone

Inclusion rule: the spell is cast with a spoken incantation in the book, the 2001 film, or both.

| Incantation        | Name                    | Book   | Film |
| ------------------ | ----------------------- | ------ | ---- |
| Wingardium Leviosa | Levitation Charm        | ch. 10 | ✓    |
| Alohomora          | Unlocking Charm         | ch. 9  | ✓    |
| Petrificus Totalus | Full Body-Bind Curse    | ch. 16 | ✓    |
| Locomotor Mortis   | Leg-Locker Curse        | ch. 13 |      |
| Oculus Reparo      | Spectacle-Mending Charm |        | ✓    |
| Lumos Solem        | Sunlight Charm          |        | ✓    |
| Lacarnum Inflamari | Fire-Making Spell       |        | ✓    |

Excluded: Ron’s rat-yellowing rhyme (a failed joke spell) and wordless magic (Hermione’s bluebell flames, Quirrell’s ropes). _Lacarnum Inflamari_ is only whispered on screen, so its spelling is not canonical; the entry notes this.

A spell lives in the dataset of the work where it **first** appears. When a later book reuses it, append another entry to its `appearances` rather than duplicating the definition.

## Registry

[`createSpellRegistry(spells, works)`](../src/domain/spells/registry.ts) builds indexed, frozen lookups and throws on duplicate ids, duplicate incantations, or unknown works.

```ts
spellRegistry.getById("alohomora");
spellRegistry.getByWork("philosophers-stone");
spellRegistry.getByCategory("curses");
spellRegistry.findByIncantation("wingardium leviosa!"); // punctuation- and case-insensitive
spellRegistry.getAdjacent("alohomora"); // { previous, next } in library order
```

## Search and filters

[`src/domain/spells/query.ts`](../src/domain/spells/query.ts) is pure and shared by any UI that lists spells.

- `filterSpells(spells, query)`: filters are OR within a group and AND across groups. Free text must match every word. Matches in the incantation rank above matches in the name, then category, then summary.
- `parseSpellQuery` and `serializeSpellQuery` convert to and from the URL. Unknown values are dropped and the order is canonical, so a shared link always reproduces the same view:

```text
/spells?q=lock&category=charms&category=curses&difficulty=beginner&medium=film
```

The `/spells` page prerenders the full list. The client component reads the URL inside a `<Suspense>` boundary and updates it with `history.replaceState`, so typing doesn't add history entries.

## Wand motion paths

[`src/domain/casting/wandPath.ts`](../src/domain/casting/wandPath.ts) turns a `wandMotion` into points in a −1..1 square (+y up, z toward the target).

- `resolveWandPath(motion)` returns the preset path or the custom points. It is the source for the spell-page diagram, card sigils, share images, and the 3D wand's gesture during a cast.
- `describeWandMotion(motion)` returns a plain sentence that is also the diagram's accessible name. Custom motions can supply their own `description`.
- `fitGesture(points)` is for drawings only. It scales small gestures up to fill an icon. Never apply it to the 3D wand.

## Cast state machine

[`src/domain/casting/castMachine.ts`](../src/domain/casting/castMachine.ts): a pure `transition(state, event)` function.

```text
          CAST                ADVANCE      ADVANCE       ADVANCE    ADVANCE
  idle ─────────▶ preparing ─────────▶ casting ─────▶ projectile ─────▶ impact ─────▶ effect ──ADVANCE──▶ completed
   ▲  ◀─CANCEL──  (any in-progress phase)  ──FAIL──▶ failed                                                  │
   └───────────────────────── RESET ◀──────────────── failed / completed ◀──────────────────────────────────┘
                              CAST from completed/failed starts a new cast directly
```

Illegal events return the current state unchanged, so double clicks and key repeats are harmless. A phase with a duration of 0 still passes through its state, which keeps performer logic uniform.

## Spell Engine

Contract: [`src/domain/casting/engine.types.ts`](../src/domain/casting/engine.types.ts). Implementation: [`src/features/spell-casting/SpellEngine.ts`](../src/features/spell-casting/SpellEngine.ts), pure TypeScript with a fake-clock test suite.

```text
input sources ──cast({spellId, input})──▶ SpellEngine ──PhaseCue──▶ SpellPerformer[]
button · Space · (voice, gesture later)    state machine, clock,       wand · effects · target
                                           AbortSignal on cancel       environment · camera · audio
```

- **Advancing:** in each phase, the engine calls every performer's `perform(cue)`. It advances only when the planned duration has elapsed **and** every performer has settled. A performer that overruns by more than 3 s is abandoned, so one stuck animation can't freeze a cast.
- **Cancel and failure:** cancel (Esc) and failure abort the cue's `AbortSignal` and call `reset()` on every performer. A performer that throws fails the cast with `unknown`; a rejected `preload` fails it with `assets-unavailable`.
- **Safety:** a second `cast` during a running cast is ignored. `reset()` returns from completed or failed to idle.
- **Events:** each state event carries the phase's duration and where it starts and ends as a fraction of the whole cast, which the HUD uses for its progress bar.
- **Reduced motion:** it is passed per request (`cast({ …, reducedMotion })`) and handed to performers in every cue.

### Performers

Each registers with `usePerformer` while mounted (or with `registerPerformer` outside React) and has no knowledge of the others.

| Performer   | Where                                | What it does                                                                                                                                             |
| ----------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| wand        | `src/three/objects/Wand.tsx`         | GSAP timeline: lift → anticipation and tremble → the spell's actual gesture path (`resolveWandPath`) → release flash                                     |
| effects     | `src/three/casting/SpellEffects.tsx` | Particles converging on the tip, orb, spark, or beam projectile with trail, impact burst and flash, lingering sparkles or embers, one moving spell light |
| outcome     | `src/three/casting/outcomes/`        | What happens to the target, chosen by `outcome.kind` (see [Outcomes](#outcomes)). Kinds without a performer get a generic swell on impact                |
| environment | `src/three/casting/reactions.tsx`    | Tweens `rig.fx` from `environmentEffects`: candle flicker, dust rise, brighten or dim, tremor. Holds until the outcome releases, then settles            |
| camera      | `src/three/casting/reactions.tsx`    | Leans toward the wand, pushes toward the target, follows a moving target, jolts on impact. Skipped with reduced motion                                   |
| audio       | `src/features/spell-casting/audio/`  | Synthesised charge, cast, and impact cues, plus outcome sounds scheduled on the audio clock, from `sound` ids with defaults when a spell names none      |

Scene components never import the engine. They read shared values from the **cast rig** (`src/three/casting/CastRig.tsx`):

- `fx`: candleFlicker, dustRise, brighten, dim, tremor, wandFocus, targetFocus, shake.
- The wand tip and the target group.
- `targetFocus`: where spells land on the target at rest, set per model in `TARGETS[…].focus`.
- `targetOffset`: how far an outcome has moved the target. Outcome performers write it; `getTargetPosition()` adds it to the focus, so lingering sparkles, the spell light, the halo, and the camera follow a floating book.

### Outcomes

An outcome's timing is pure TypeScript in [`src/domain/casting/outcomes.ts`](../src/domain/casting/outcomes.ts). The 3D performer samples it every frame against the wall clock, and the audio performer schedules sounds from it, so picture and sound agree without knowing about each other. Two shared hooks let the rest of the cast fit a long outcome:

- `outcomeReleaseAt(outcome, effectSeconds)`: when the room, camera, and spell light start to wind down. Every outcome sets its own moment (an unknown kind falls back to 40% of the effect).
- `outcomeSoundEvents(outcome, effectSeconds)`: `sustain` and `finish` sounds, played from `sound.ambient` and `sound.settle`, plus the outcome's own named moments, played from `sound.moments`.
- `blendPoseToRest(from, rest, k)`: eases any all-number pose back to its rest pose after a cancel.

`TargetOutcome` mounts the performer registered for the spell's `outcome.kind` in `OUTCOME_PERFORMERS`, or `TargetSwell` if none is registered.

**Levitate** (`liftHeight`, `hoverSeconds`, `spinTurns`), used by _Wingardium Leviosa_:

```text
impact        effect phase ───────────────────────────────────────────────────────▶
shiver   │ rise 1.5 s  │ hover hoverSeconds (bob, tilt)   │ descend 1.5 s │ settle 0.45 s
         │ cover eases open, turns spinTurns               │ turns on to a whole turn │ bounce + dust puff
         │ sparkles orbit and follow, glow underneath, contact shadow fades │ landing sound
         └─ float shimmer ─────────────────────────────────────────────────┘
```

- **Fitting the phase:** segments keep their lengths when the effect phase is long enough (Leviosa's is 6.5 s) and shrink proportionally when it isn't.
- **Turning:** the object always lands after whole turns, so it faces the way it started.
- **Cancel:** Esc mid-float glides the object back to rest in 0.6 s, turning to the nearest whole turn. The next impact always starts from rest.
- **Reduced motion:** it still rises, hovers, and lands, but doesn't shiver, spin, bob, tilt, or bounce, and the camera holds still.
- **Low graphics:** the contact shadow is a textured quad, so the lift reads without shadow maps.

**Unlock** (no settings), used by _Alohomora_ on the warded door. The effect phase is 3.5 s, and the door **stays open** afterwards:

```text
impact    effect phase ──────────────────────────────────────────────▶  after the cast
resist │ ward break 0.55 │ unlatch 0.35   │ drop 0.4 │ open 1.2    │ settle 0.9    │ held open (UNLOCK_OPEN)
ward   │ flares, cracks, │ shackle        │ padlock  │ door swings │ drifts wider  │ light spills,
flickers pieces drift   │ springs, turns │ swings   │ ~54° away   │ and back      │ motes drift
       │ ward-break      │ unlatch        │          │ swing-open (creak)          │
                                                     camera and room release ──▶
```

- **Staying open:** `unlockPose` returns `UNLOCK_OPEN` from `total` on, and the performer holds it. The engine resets every performer when a cast starts, so **Cast again** eases the door shut and re-warded (0.8 s, during the wand gesture) before the spell lands and plays from the beginning. Switching spells remounts the door shut, so coming back starts from the beginning too. Cancel (Esc) and reset (R) also ease it shut.
- **Parts:** `WardedDoor` names its moving groups (`DOOR_PARTS`): the leaf hinged at the left jamb, the padlock pivoting on its hasp, the shackle pivoting about one leg, and a ward ring built from ten pieces that can drift apart.
- **Light without lights:** two additive shader quads. One lights only the part of the doorway the swinging leaf no longer covers, brightest at its edge. The other throws a wedge across the floor by projecting each floor point back through the gap. Both are boosted where bloom is off, so Low still reads. Shader maths avoids undefined GLSL (`pow` with a negative base, reversed `smoothstep` edges): on real GPUs it produces NaN, which bloom smears into a black frame.
- **Sound:** the outcome's moments play cues named in `sound.moments`: `ward-shatter`, `shackle-spring`, and `door-creak` (a `creak` layer: a sawtooth chopped into a rasp with a wavering pitch). A moment without a cue stays silent.
- **Release:** the room and camera settle once the door has swung open.
- **Reduced motion:** the ward still breaks and the door still opens, but the padlock doesn't rattle, swing, or sway, the shackle doesn't overshoot, the door doesn't drift, and the light doesn't flicker.
- **E2E:** `rig.getOutcomeAmount()` (0 shut and warded, 1 fully open) is exposed as `window.__chamberProbe.outcomeAmount`.

**Petrify** (no settings), used by _Petrificus Totalus_ on the practice dummy. The effect phase is 3.2 s, the freeze is the hero moment, and the dummy **stays frozen** afterwards:

```text
impact     effect phase ──────────────────────────────────────────────▶  after the cast
cold     │ bind 0.25   │ freeze 1.5                    │ rock 0.9       │ hold 0.4 │ held frozen (PETRIFY_FROZEN)
shiver   │ arms clamp, │ grey stone-like frost climbs  │ one stiff rock │ still    │ glints keep orbiting
         │ body jolts  │ base → head, glowing edge,    │ on the base    │          │
         │             │ ice glints orbit              │                │          │
         │ bind        │ freeze (crackle)              │ rock (knock)   │          │
                                                         camera and room release ──▶
```

- **Staying frozen:** `petrifyPose` returns `PETRIFY_FROZEN` from `total` on, and the performer holds it with the ice glints still circling. The engine resets every performer when a cast starts, so **Cast again** thaws it (0.8 s, during the wand gesture: the frost line recedes, the arms relax, and cold mist puffs from the base) before the curse lands and plays from the beginning. Switching spells remounts the dummy unfrozen, so coming back starts from the beginning too. Cancel (Esc) and reset (R) thaw it the same way.
- **Frost without lights:** [`three/materials/frost.ts`](../src/three/materials/frost.ts) patches the dummy's standard materials (`onBeforeCompile`) with shared uniforms. Below `uFrostLine`, a world height with a ragged noise edge, the surface turns cold grey stone with pale rime flecks; the edge glows while it moves. At `uFrost` 0 the materials look unchanged, so Locomotor Mortis's dummy is unaffected. The stone is kept dark and cool because the spell light sits close in front of the target and the candles are warm.
- **Parts:** `PracticeMannequin` names its shoulder-pivoted arms and chalk circle (`MANNEQUIN_PARTS`) and keeps its `FrostUniforms` on the root's `userData.frost`. The target group pivots about the base for the jolt and the rock.
- **Sound:** `sound.moments` plays `limb-clack`, `frost-crackle` (a `crackle` layer: sparse clicks whose density ramps over the sound), and `stone-knock`.
- **Release:** the room and camera settle once the rock has died away.
- **Reduced motion:** the arms still clamp and the frost still climbs, but the body doesn't jolt or rock.
- **E2E:** `outcomeAmount` is the larger of the arm clamp and how much of the body is frosted.

**Leg-lock** (no settings), used by _Locomotor Mortis_ on the practice dummy. The effect phase is 3.7 s, and the legs **stay bound** afterwards:

```text
impact     effect phase ───────────────────────────────────────────▶  after the cast
glow at  │ bind 0.6            │ hop 1.8                  │ teeter 0.8   │ settle 0.3 │ held bound (LEG_LOCK_BOUND)
the base │ bands spiral up,    │ three hops, each lower,  │ leans over,  │ still      │ bands glowing
         │ cinch with a flare  │ sway + arm flap, dust    │ arms flail,  │            │
         │                     │ puff on each landing     │ rights itself│            │
         │ bands · cinch       │ hop · hop · hop          │ teeter       │            │
                                                                 camera and room release ──▶
```

- **Staying bound:** `legLockPose` returns `LEG_LOCK_BOUND` from `total` on. The engine resets every performer when a cast starts, so **Cast again** loosens the bands into drifting violet sparks (0.8 s, during the wand gesture) before the curse lands and plays from the beginning. Switching spells remounts the dummy unbound. Cancel (Esc) and reset (R) release it the same way.
- **Bands without lights:** two counter-spiralling ribbons in [`LegLock.tsx`](../src/three/casting/outcomes/LegLock.tsx). A vertex shader places every vertex on its helix, so loosening and cinching is one uniform (`uCinch`), and the fragment shader reveals them from the base up (`uReveal`). The mesh copies the target group's world matrix each frame, so the bands hop and lean with the dummy. They are boosted where bloom is off.
- **Body:** the target group lifts for the hops and pivots about the base for the sway and teeter; the shoulder-pivoted arms (`MANNEQUIN_PARTS.arm`) flap for balance. `rig.targetOffset` follows the hop height.
- **Sound:** `sound.moments` plays `band-wrap`, `band-cinch`, `hop-thud` once per landing, and `teeter-creak`.
- **Release:** the room and camera settle once it stops teetering.
- **Reduced motion:** the bands still wrap, cinch, and glow, but it doesn't hop, lean, or flail, and the bands' shimmer holds still.
- **E2E:** `outcomeAmount` is how far the bands have wrapped (1 when bound).

**Mend** (no settings), used by _Oculus Reparo_ on the cracked spectacles. The effect phase is 3 s, and the spectacles **stay mended** afterwards:

```text
impact     effect phase ───────────────────────────────────────────────────────▶  after the cast
crack    │ lift 0.45   │ glow 0.45        │ gather 0.55    │ seal 0.5          │ ring 0.6        │ settle │ held mended
flickers │ rise, turn  │ the crack glows  │ shards fly up  │ crack closes end  │ rings sweep     │ still  │ (MEND_MENDED)
         │ to face you │ from end to end  │ into the lens  │ to end, lens      │ both frames as  │        │
         │             │                  │                │ clears, a glint   │ they settle     │        │
         │             │ crack-glow (hum) │ shards         │ seal (chime)      │ ring            │        │
                                                                         camera and room release ──▶
```

- **Staying mended:** `mendPose` returns `MEND_MENDED` from `total` on. The engine resets every performer when a cast starts, so **Cast again** cracks the lens again (0.8 s, during the wand gesture): the crack reappears, the glass turns hazy, and the shards drop back onto the case before the charm lands and plays from the beginning. Switching spells remounts the spectacles cracked. Cancel (Esc) and reset (R) crack them the same way.
- **Parts:** `CrackedSpectacles` names its parts (`SPECTACLES_PARTS`): the frames, the right lens's glass, crack segments with `userData.along` so the glow and the seal travel from end to end, fallen shards with `userData.home` in the lens, a ring and a running spark round each lens, and a glint. Shards are flown in the prop's space toward their home in the lens's space, so they arrive wherever the lifted frames are.
- **No lights, no custom shaders:** everything is basic and standard materials driven per frame. The crack swells slightly while it glows so a hairline still reads.
- **Sound:** `sound.moments` plays `glass-hum`, `shard-tinkle` (a `crackle` layer of high clicks), `lens-seal`, and `ring-sweep`.
- **Release:** the room and camera settle as the rings sweep round.
- **Reduced motion:** the crack still glows and seals and the lens clears, but the spectacles don't lift or turn, and the shards fade on the case instead of flying.
- **E2E:** `outcomeAmount` is how clear the lens is (1 when mended).

**Sunburst** (`intensity`), used by _Lumos Solem_ on the creeping vines. The effect phase is 3.5 s, and the vines **stay withered back** afterwards:

```text
impact     effect phase ──────────────────────────────────────────────────▶  after the cast
startled │ flare 0.5        │ recoil 0.8          │ retreat 1.5               │ fade 0.7      │ held withered
shiver   │ sun blooms over  │ vines splay away,   │ shrink into the pot from  │ light sinks   │ (SUNBURST_WITHERED):
         │ the vines, rays  │ shiver, leaves      │ the tips, leaves close    │ to a warm     │ stubs under a
         │ turn, gold motes │ flutter             │ and drop, dry flecks puff │ glow over pot │ warm glow
         │ flare (bloom)    │ recoil (rustle)     │ retreat (slither)         │               │
             (the vines start to flinch 40% into the flare)   camera and room release ──▶
```

- **Staying withered:** `sunburstPose` returns `SUNBURST_WITHERED` from `total` on: each vine a short stub (`VINE_STUB`) under a small gold glow (`SUN_GLOW`). The engine resets every performer when a cast starts, so **Cast again** grows the vines back out of the pot and fades the glow (0.8 s, during the wand gesture) before the charm lands and plays from the beginning. Switching spells remounts the vines fully grown. Cancel (Esc) and reset (R) grow them back the same way.
- **Parts:** `CreepingVines` names its parts (`VINES_PARTS`): each vine is a group pivoting where it leaves the soil, with `userData.angle` so it can splay outward. Its stem's tube is indexed from the soil up, so shortening the draw range pulls the tip in, and each leaf's `userData.along` closes it just before the shrinking tip reaches it. Stubs and closing leaves turn dry brown.
- **Light without lights:** a camera-facing additive quad draws the sun: a white-hot core, a halo, and two sets of turning rays built from powers of the direction as a complex number, so there is no `atan` (undefined at the centre). As the rays die it sinks to the pot, shrinks, and turns gold. A second quad pools warm light on the pedestal top. Both scale with `intensity` and are boosted where bloom is off. The room brightens through the spell's `chamber-brighten` reaction.
- **Sound:** `sound.moments` plays `sun-bloom` (a warm pad with an airy swell), `leaf-rustle` (dense `crackle` over a band of noise), and `vine-slither` (a low `creak` with thinning crackle).
- **Release:** the room and camera settle 40% of the way into the retreat, as the light wanes.
- **Reduced motion:** the light still flares and the vines still retreat into the pot, but they don't splay, shiver, or flutter, the rays don't turn, and no flecks puff out.
- **E2E:** `outcomeAmount` is how far the vines have withered back (`witheredAmount`: 0 grown, 1 stubs).

**Ignite** (`flameSeconds`), used by _Lacarnum Inflamari_ on the cloak on its stand. The effect phase is 3.6 s, and the cloak **stays charred** afterwards:

```text
impact    effect phase ─────────────────────────────────────────────────────▶  after the cast
hem     │ catch 0.4       │ burn flameSeconds (2.5)              │ die 0.5      │ settle │ held burnt
glows   │ flame kindles   │ flames climb hem → hood, charring    │ flames go    │ still  │ (IGNITE_BURNT):
hot     │ at the hem      │ behind them, the hem burns away,     │ out, smoke   │        │ charred, ragged hem
        │                 │ embers rise, firelight flickers      │ curls up     │        │ glowing, smoke wisp
        │ kindle (catch)  │ blaze (crackling roar) ─────────────▶│ douse (hiss) │        │
                                                        camera and room release ──▶
```

- **Staying burnt:** `ignitePose` returns `IGNITE_BURNT` from `total` on: charred to the top, the hem burnt away to `HEM_BURNT` with embers glowing along its edge (`EMBER_HOLD`), and a thin wisp of smoke still rising. The engine resets every performer when a cast starts, so **Cast again** restores the cloak (0.8 s, during the wand gesture: the char fades and the hem grows back) before the spell lands and plays from the beginning. Switching spells remounts the cloak whole. Cancel (Esc) and reset (R) restore it the same way.
- **Fitting the phase:** the burn keeps the data's `flameSeconds` when the effect phase has room and shrinks with the other segments when it doesn't.
- **Scorch without lights:** [`three/materials/scorch.ts`](../src/three/materials/scorch.ts) patches the cloth's standard material (`onBeforeCompile`) with shared uniforms, kept on the stand's `userData.scorch` (`CLOAK_PARTS`). Below `uScorchLine` the cloth chars dark with glowing flecks; below `uEaten`, a ragged world height, it is discarded, with an ember rim along the edge.
- **Flames without lights:** [`Ignition.tsx`](../src/three/casting/outcomes/Ignition.tsx) adds a flame shell per piece of cloth that shares its geometry, pushed out away from the stand's axis (the cloak is a two-sided lathe, so its normals can face either way). Upward-scrolling, stretched noise makes separate tongues above the climbing front, thinning out behind it but still licking along the burning hem. A floor quad throws flickering firelight around the stand. Both are boosted where bloom is off; the candles flicker through the spell's `candle-flicker` reaction.
- **Sound:** `sound.moments` plays `flame-catch`, `fire-roar` (layered `crackle` over low noise, lasting the whole burn), and `fire-hiss`.
- **Release:** the firelight and camera settle as the flames die down.
- **Reduced motion:** the flames still climb, char the cloak, and burn the hem, but they drift slowly instead of flickering, and neither the firelight nor the embers pulse.
- **E2E:** `outcomeAmount` is how far the hem has burnt away (`burntAmount`: 0 whole, 1 burnt).

### Sound

Every cue is a recipe in [`audio/cues.ts`](../src/features/spell-casting/audio/cues.ts), and `SpellAudio` synthesises it with Web Audio. The palette aims at film magic rather than a synth: `hum` (a rising, pulsing chord with breath, for the charge), `tone` (detuned bell partials with a metallic strike; triangles are knocks), `pad` (`glass` or an "ah" `choir`), `sparkle` (celesta twinkles on a pentatonic scale), `drop` (a falling whomp or zap under impacts), `rumble` (fluttering brown noise for fire), `creak`, `crackle`, and filtered `noise` that can sweep across the stereo field. Every layer plays through one bus: dry, plus a send (`space`, defaulted per kind) into a synthesised stone-hall reverb, into a glue compressor. Noisy kinds get makeup gain so recipe gains stay comparable. Sparkle, crackle, and rumble buffers are rendered in JavaScript at 24 kHz and cached, three random takes per layer and length, so a cast costs at most a few milliseconds; the hall is built on unlock. Each play detunes by up to a third of a semitone so repeats never sound identical. `play(recipe, duration, delay)` schedules ahead on the audio clock, and stopping cancels sounds that haven't started yet. There are no audio files. The audio context is created on the first cast click or key press, which satisfies autoplay rules. Volume is `masterVolume²` and silent when Sound effects is off.

### Voice casting

Press the microphone in the HUD (or V) and say an incantation. The browser's own recogniser transcribes the phrase — Web Speech API, unprefixed in Edge and prefixed in Chrome and Safari; Firefox has none, and the button hides itself there. Nothing is sent anywhere by this app, though Chrome's recogniser transcribes in the cloud, which the Settings copy says. The microphone opens only while a session is running: one press, one phrase, then it closes on a match, on silence, or after `VOICE.listenTimeoutMs`.

Matching is pure and lives in [`domain/voice/incantationMatch.ts`](../src/domain/voice/incantationMatch.ts). Every alternative the recogniser offers is scored against all seven incantations two ways — character similarity, and similarity of a phonetic key that folds vowels, doubled letters, and sound-alike consonants together — and the better score wins, so "petrificus totalis" and "aloha mora" still land. Because people say more than the words, every run of words in the transcript is scored and the best span wins; half an incantation ("leviosa") scores too low to cast. Anything at or above `VOICE.matchThreshold` (0.75) is cast, and anything short of it is shown struck through so the caster can see what the machine heard.

A spell that isn't the one on screen switches the chamber first: `changeSpell` swaps the target, and the cast follows `VOICE.switchDelayMs` later, so the wand turns to the new object before it goes up. Casts arrive at the engine as `cast({ input: "voice" })` — the engine, performers, and outcomes are unchanged. Voice casting can be switched off in Settings, and the button carries `data-voice` with its state for tests, because its accessible name changes while it listens.

### Inputs

- **Button:** Cast, Cast again, Cancel.
- **Keyboard:** Space casts, Escape cancels, R resets, V opens the microphone. Keys are ignored while typing or with modifiers, and Space on a focused button is left to that button.
- **Voice:** the microphone button in the HUD listens for one phrase and casts the spell it matches. See below.
