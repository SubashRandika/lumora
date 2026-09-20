# Lumora

An unofficial, fan-made 3D spell-casting experience. Pick a spell from _Harry Potter and the Philosopher’s Stone_, learn it, and cast it in a candlelit chamber.

**[Live demo](https://lumora-tau-mauve.vercel.app/)**

> Not affiliated with or endorsed by J.K. Rowling, Warner Bros., or Wizarding World Digital. All 3D art, sound, and writing are original. See [docs/ASSETS.md](docs/ASSETS.md).

## Status

| Phase | Scope                                                                               | State   |
| ----- | ----------------------------------------------------------------------------------- | ------- |
| 1     | Foundation: tooling, domain model, dataset, registry, stores, design system, routes | Done    |
| 2     | Cinematic landing page: wand-light hero, enter-the-chamber transition, spell index  | Done    |
| 3     | Spell library: search, URL filters, wand-motion diagrams, sigils, SEO, /books       | Done    |
| 4     | 3D chamber: candlelit room, six target props, wand, quality tiers, fallbacks        | Done    |
| 5     | Spell Engine: cast any spell (gesture, projectile, impact, room reactions, sound)   | Done    |
| 6     | Wingardium Leviosa end to end: the book lifts, floats, turns, and settles back      | Done    |
| 7     | Each remaining spell's own outcome                                                  | Done    |
| 8     | Performance: real-GPU measurements, budgets enforced in E2E, idle frame rate        | Done    |
| 9–10  | Mobile, polish                                                                      | Planned |

## Getting started

Requires Node.js 22.13 or later.

```bash
npm install
npm run dev          # http://localhost:3000
```

In production, set `NEXT_PUBLIC_SITE_URL` (the deployment uses `https://lumora-tau-mauve.vercel.app`) so canonical links, structured data, and share images use the real domain.

| Script              | What it does                                             |
| ------------------- | -------------------------------------------------------- |
| `npm run check`     | Type check, lint, format check, and unit tests           |
| `npm run typecheck` | Generates route types, then runs `tsc --noEmit`          |
| `npm run lint`      | ESLint, including layer-boundary rules                   |
| `npm test`          | Vitest unit and component tests                          |
| `npm run test:e2e`  | Playwright on desktop and mobile Chromium (builds first) |
| `npm run format`    | Prettier with Tailwind class sorting                     |

For the first E2E run, install the browser with `npx playwright install chromium`.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Zustand · Zod · Vitest + Testing Library · Playwright. Three.js, React Three Fiber, and postprocessing load only on chamber routes. GSAP (cast timelines) is also chamber-only.

## Documentation

- [Architecture](docs/ARCHITECTURE.md): layers, folder structure, rendering and loading strategy
- [Spell system](docs/SPELL_SYSTEM.md): domain model, state machine, engine contract
- [Adding a spell](docs/ADDING_A_SPELL.md): step-by-step
- [Performance](docs/PERFORMANCE.md): tiers, budgets, measurement
- [Assets](docs/ASSETS.md): IP rules and licensing
