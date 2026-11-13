# Kan — Interactive Naruto RPG

A single-page **Progressive Web App** (Expo + React Native Web) that plays like an interactive novel set in the Naruto world. The player controls **Kan**, an original Uchiha-Uzumaki character, and an LLM narrator streams the story while a deterministic engine keeps memory, canon, time, bonds, jutsu, images and saves consistent.

There is **no backend**. Everything runs in the browser: saves and images live in IndexedDB (`kan-saves`, with small settings in `localStorage` through `AsyncStorage`). The only external service is the **OpenRouter API** (chat completions + image generation) using a key the player enters in Settings.

---

## Quick start

```bash
bun install
bun run dev          # Expo dev server on port 4000
```

Then open the app, go to **Settings → OpenRouter API key**, paste a key from https://openrouter.ai/keys, and pick models.

### Useful commands

| Command | What it does |
|---|---|
| `bun run typecheck` | TypeScript check (fast, no build) |
| `bun run test` | Full test suite, every `scripts/*.test.ts` file (71), with strict invariants on |
| `bun run build:web` | Regenerates the service worker and exports the static PWA to `dist/` |
| `bun run dev` | Expo dev server on port 4000 |

### Deploy / PWA

- `bun run build:web` writes a static site to `dist/` — deploy that folder anywhere (Vercel etc.).
- The service worker (`public/sw.js`) is generated from `package.json`'s version; bump the version to invalidate caches.
- Icons and the manifest live in `public/`. The app icon is the red vulture mark.
- On Android, installing from the browser and re-adding the shortcut is needed after an icon change.

---

## What it is made of

| Area | Files |
|---|---|
| Screens (Expo Router) | `app/(tabs)/index.tsx` (Story), `kan.tsx` (portrait + Bonds / Jutsu / Journal), `bond/[id].tsx`, `settings.tsx`; shared list kit in `components/List.tsx`, Kan sections in `components/kan/` |
| Game engine | `lib/rpg/game.tsx`, `services.ts` (applies a turn), `entities.ts`, `bonds.ts`, `facts.ts`, `clock.ts`, `log.ts`, `stateBlock.ts`, `db.ts`, `prompt.ts`, `retrieval.ts`, `seed.ts` |
| Simulation systems | `calendar.ts` (clock), `timeparse.ts` (narration time), `pacing.ts` (scene tempo), `canonData.ts` / `canonDataMore.ts` (221 canon milestones, data only) + `canon.ts` (scheduler + news queue) + `newsDelivery.ts` (bearers, delivery styles, catch-up reports) + `letters.ts` (personal letters), `encounters.ts` (location/time realism), `romance.ts` (hearts + lore), `reputation.ts` (bingo books, bounties, Akatsuki standing, bounty hunters), `grudges.ts` (enemies who hunt you) |
| AI client | `lib/openrouter.ts` (streaming chat, JSON completion, image generation, model lists) |
| Images | `lib/rpg/image.ts`, `referenceImages.ts`, `portrait.ts` (Kan's portraits), `imageStore.ts` (IndexedDB storage) |
| Shared UI | `components/*`, `constants/theme.ts` |
| Tests | `scripts/*.test.ts` (71 files; replay fixtures in `scripts/fixtures/`), run on every push by `.github/workflows/ci.yml` |
| Docs | `docs/PROJECT_GUIDE.md` (deep engineering handoff) |

**Read `docs/PROJECT_GUIDE.md` first** if you are an AI or developer picking this project up — it documents the data model, turn lifecycle, prompt composition, canon engine, clock rules, image pipeline and invariants.
