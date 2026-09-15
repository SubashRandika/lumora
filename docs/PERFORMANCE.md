# Performance

## Targets

| Metric                               | Target                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| Chamber frame rate                   | 60 fps on modern desktop; ≥45 fps sustained on mid-range                      |
| LCP, content routes (mobile 4G, p75) | ≤ 2.0 s                                                                       |
| INP                                  | ≤ 200 ms                                                                      |
| CLS                                  | ≤ 0.05                                                                        |
| Client JS on content routes          | No Three.js, R3F, or GSAP; ≤ 185 KiB gzip in total                            |
| Chamber JS                           | ≤ 520 KiB gzip in total on a cast page at high quality (with post-processing) |
| Draw calls in the chamber            | ≤ 150 on high and medium, ≤ 60 on low, in any frame                           |
| Lighthouse                           | Accessibility ≥ 95, Performance ≥ 90 on content routes                        |

The JavaScript and draw-call limits live in [`BUDGETS`](../src/config/performance.ts) and are enforced by [`e2e/budgets.spec.ts`](../e2e/budgets.spec.ts) against a production build, so a change that crosses one fails the E2E run. The limits leave about 10% headroom over what Phase 8 measured.

## Tiers

[`detectTier`](../src/domain/performance/tier.ts) is pure. [`probeDevice`](../src/lib/device/probeDevice.ts) gathers the input from the browser.

| Signal                                                                   | Result                         |
| ------------------------------------------------------------------------ | ------------------------------ |
| No WebGL2                                                                | Unsupported: HTML fallback     |
| Software renderer, data saver, ≤2 GB memory, ≤2 cores, max texture <4096 | low                            |
| Touch device                                                             | medium with ≥6 cores, else low |
| ≥8 cores, ≥8 GB memory (or unknown), max texture ≥8192                   | high (medium above ~4K)        |
| Otherwise                                                                | medium                         |

Users can override the tier in Settings → Graphics. `resolveTier(preference, detected)` applies the override.

## Quality profiles

The 3D layer reads [`QUALITY_PROFILES`](../src/config/performance.ts), never tier names.

| Knob             | low    | medium          | high            |
| ---------------- | ------ | --------------- | --------------- |
| DPR clamp        | 1      | 1–1.5           | 1–2             |
| Antialiasing     | off    | MSAA ×4 (bloom) | MSAA ×4 (bloom) |
| Particle budget  | 600    | 2,500           | 8,000           |
| Shadows          | off    | key light, 1024 | key light, 2048 |
| Dynamic lights   | 2      | 3               | 4               |
| Fog              | off    | on              | on              |
| Bloom / vignette | off    | on              | on              |
| Idle frame rate  | 30 fps | 30 fps          | 30 fps          |

**Adaptive quality:** in auto mode, if the frame rate stays below 45 for 3 seconds while the chamber is drawing at full rate, it drops one tier and never climbs back mid-session. The check is [`createFrameRateMonitor`](../src/domain/performance/framePacing.ts), driven by `FrameDriver`. It replaced drei's `PerformanceMonitor`, which with our settings stopped sampling for good after about 9 seconds at a healthy 60 fps, so a later slowdown was never caught.

## Frame pacing

The canvas uses `frameloop="never"`; [`FrameDriver`](../src/three/performance/FrameDriver.tsx) draws the frames.

- **Full rate** during a cast, while the pointer moves or presses, after a resize or spell switch, and for 2.5 s after any of those, so the camera and wand ease to rest smoothly.
- **Idle rate** (30 fps) otherwise. At rest only the candles, dust, and the camera's slow sway move; their fastest motion is a ~1 Hz flicker, which looks the same at 30 fps and costs half the GPU work, which matters on phones and laptops on battery.
- Hidden tabs draw nothing: the browser stops animation frames.
- Stopping entirely while idle was rejected: the flames and dust would visibly freeze.

## Rules for 3D code

- Repeated geometry is instanced: floor planks, wall stones, shelf boards, books, candle stands, wax, and flames are one draw call each (`InstancedBoxes`, `applyInstances`).
- Motion that doesn't need JavaScript runs in shaders: dust drift and candle-flame flicker only update a `uTime` uniform per frame.
- Only the key spotlight casts shadows. Candle point lights are capped by `maxDynamicLights` (key light plus 1–3 candles), and flames are additive billboards, not lights.
- No transmission or refraction materials. Transparency is limited to flames, dust, lenses, and one ward ring.
- Animate by mutating refs in `useFrame`; never `setState` per frame. Scratch vectors and colours live at module scope; don't parse colour strings or build arrays per frame.
- Something that moves outside a cast must call `rig.wake()`, or it animates at the idle rate.
- Every material must exist when the scene mounts (hidden with `visible={false}` until needed), so `ShaderWarmup` can compile it before the chamber reports ready. A material created mid-cast compiles mid-cast and stalls a frame.
- With post-processing on, the canvas itself has no MSAA: the composer multisamples the scene, and the canvas only receives a full-screen quad.
- Layout randomness uses a seeded PRNG, so quality changes never reshuffle the room.
- Every model is built in code, so there are no model or texture downloads. The only textures are the post-processing buffers and one shared 64×64 glow canvas (`getGlowTexture`).

## Measured (Phase 8)

### Frame times on a real GPU

AMD Radeon 860M (integrated), Direct3D 11, installed Chrome in headless mode against a production build, 60 Hz. Each spell: 4 s idle, then one cast through to 1.5 s after completion. Frame times are the gaps between two drawn frames.

| Spell              | High: draw calls idle / cast | High: triangles | Low: draw calls idle / cast | Low: triangles |
| ------------------ | ---------------------------- | --------------- | --------------------------- | -------------- |
| Wingardium Leviosa | 50 / 55                      | 20.8k–21.1k     | 26 / 31                     | 5.6k–5.9k      |
| Alohomora          | 70 / 74                      | 21.9k–22.2k     | 40 / 44                     | 6.2k–6.5k      |
| Petrificus Totalus | 43 / 47                      | 22.6k–23.0k     | 22 / 26                     | 6.5k–6.9k      |
| Locomotor Mortis   | 43 / 48                      | 22.6k–26.5k     | 22 / 27                     | 6.5k–10.3k     |
| Oculus Reparo      | 65 / 69                      | 23.2k–24.4k     | 42 / 46                     | 6.9k–8.1k      |
| Lumos Solem        | 77 / 83                      | 27.9k–28.3k     | 39 / 45                     | 9.1k–9.5k      |
| Lacarnum Inflamari | 38 / 46                      | 22.0k–22.6k     | 19 / 27                     | 6.2k–6.8k      |

Frame rates, the same for every spell within a few tenths:

| Setup                       | Idle   | During a cast     | p95 frame | p99 frame    |
| --------------------------- | ------ | ----------------- | --------- | ------------ |
| High, 1920×1080, DPR 1      | 30 fps | 59.6–59.8 fps     | 16.8 ms   | 16.8–16.9 ms |
| Low, 1920×1080, DPR 1       | 30 fps | 59.6–59.8 fps     | 16.8 ms   | 16.8–16.9 ms |
| High, 1440×900, DPR 2       | 30 fps | 59.5–59.7 fps     | 16.8 ms   | 16.8–16.9 ms |
| High, uncapped, 1080p       | –      | ~230–250 fps mean | –         | –            |
| High, uncapped, 2880×1800px | –      | ~105–115 fps mean | –         | –            |

Logging every frame over 20 ms (Oculus Reparo and Lumos Solem, high) found none between pressing Cast and the spell completing, apart from the first frame, where the chamber switches from its idle rate to full rate (a 33 ms gap by design). The same 33 ms gaps return 2.5 s after the spell completes. Uncapped runs don't present frames evenly in headless Chrome, so read their means only as rough headroom: about 4 ms of work per frame at 1080p and 9 ms at 2880×1800 on high. Even at DPR 2 this GPU holds 60 fps, so the DPR clamps stay as they are; phones are measured in Phase 9.

### What changed

- **Shader compiles during casts → 0** (from 1 on Oculus Reparo and 4 on Lacarnum Inflamari). Effects hidden until a cast (particles, projectile trail, flame shells, sunbursts) compiled their shaders mid-cast. `ShaderWarmup` now compiles them at load, for the post-processing target as well as the screen (three.js builds different shaders for each). Verified by counting `linkProgram` calls during a cast on every spell, high and low: none.
- **Cast click hitch: ~40 ms of blocking → none with sound off.** The spell audio opened the audio device on the first cue even when muted. It now never opens while sound is off, and with sound on it opens on the first pointer or key press instead of in the cast's first frame.
- **Idle GPU work halved** (60 → 30 frames per second at rest).
- **Adaptive quality** can no longer silently switch itself off (see above).
- **Canvas MSAA** is off when the post-processing composer multisamples (medium, high): at 2880×1800 that avoids a screen-sized ×4 multisampled buffer nobody sees (about 80 MB of colour alone). Edges are unchanged.
- **Smaller:** the three glow textures are one shared texture; the projectile trail and vines no longer allocate or parse colours per frame; drei is no longer a dependency; Alegreya Sans no longer ships its unused 700 weight (one fewer preloaded font on every page).

### JavaScript

Gzip (level 6) totals of every script a route downloads, production build.

| Route                             | Scripts | Gzip      | Budget |
| --------------------------------- | ------- | --------- | ------ |
| `/`, `/spells`, spell pages       | 12      | 166.8 KiB | 185    |
| `/books`, `/about`, `/settings`   | 10      | 149.3 KiB | 185    |
| Cast page, high (post-processing) | 16      | 475.3 KiB | 520    |
| Cast page, low                    | 15      | 452.7 KiB | –      |

Of the cast page's 475 KiB, 228 KiB is three.js with React Three Fiber, 58 KiB is the chamber's own code with GSAP, and 23 KiB is the lazy post-processing chunk. R3F imports three.js as a namespace, so it can't be tree-shaken; shrinking it meaningfully would mean leaving R3F.

### Lighthouse

Lighthouse 13.4, default mobile profile (simulated slow 4G, 4× CPU slowdown), production build, two runs each (identical scores).

| Route                        | Performance | Accessibility | Best practices | SEO  | FCP   | LCP   | TBT      | CLS |
| ---------------------------- | ----------- | ------------- | -------------- | ---- | ----- | ----- | -------- | --- |
| `/`                          | 94          | 100           | 100            | 100  | 0.9 s | 3.0 s | 45–61 ms | 0   |
| `/spells`                    | 94          | 100           | 100            | 100  | 0.8 s | 3.1 s | 22–24 ms | 0   |
| `/spells/wingardium-leviosa` | 95          | 100           | 100            | 100  | 0.8 s | 3.0 s | 45–53 ms | 0   |
| `/books`                     | 95          | 100           | 100            | 100  | 0.8 s | 3.0 s | 51 ms    | 0   |
| `/books/philosophers-stone`  | 95          | 100           | 100            | 100  | 0.8 s | 3.0 s | 44–56 ms | 0   |
| `/about`                     | 95          | 100           | 100            | 100  | 0.8 s | 3.0 s | 49–50 ms | 0   |
| `/settings`                  | 95          | 100           | 100            | 60\* | 0.8 s | 3.0 s | 26 ms    | 0   |

\* `/settings` is deliberately `noindex`.

Both Lighthouse targets are met. **Simulated LCP (3.0 s) is over the 2.0 s field target.** The LCP element is text (the carved wall on `/`, headings elsewhere); unthrottled it paints in about 0.15 s, and under slow 4G it waits on four preloaded font files (~150 KiB, mostly IM Fell regular and italic) and two render-blocking stylesheets. Options, not yet taken: stop preloading the italic face, or subset IM Fell to the glyphs in use.

## Measuring

- **Development overlay:** below the Graphics label, the chamber shows fps, draw calls, and triangles (`src/three/performance/DevStats.tsx`, on `window.__chamberStats`). Excluded from production builds.
- **Probe:** define `window.__chamberProbe = {}` before the page loads, and the chamber fills in `drawCalls`, `triangles`, their maxima, and `frames` (frames drawn) every frame, in production builds too. Counts come from `RenderInfo` and include post-processing passes.
- **Budgets:** `npm run test:e2e` runs `e2e/budgets.spec.ts`. The bundle-boundary test in `e2e/chamber.spec.ts` still checks that three.js stays off content routes.
- **Frame times:** use installed Chrome (`channel: "chrome"` in Playwright) with `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist`. Playwright's default headless shell adds ~100 ms GPU-process stalls on Direct3D 11 that real Chrome doesn't have, and SwiftShader measures the CPU, not the GPU. Time the gaps between changes of `__chamberProbe.frames`, not animation frames, since the chamber skips animation frames while idle.
- **Bundles:** `npx next experimental-analyze` for the module graph.
- **Field data:** `useReportWebVitals`, once there's a place to send it.
