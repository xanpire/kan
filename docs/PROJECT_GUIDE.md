# Kan — Engineering & AI Handoff Guide

This document is the complete technical map of the app. It is written so a developer **or an AI coding agent** can understand, debug and extend it without prior context.

Read it top to bottom once. Then use the file map and invariants as a checklist when changing anything.

---

## 0. File map (`lib/rpg/`)

| File | What lives there |
|---|---|
| `game.tsx` | `GameProvider`: the turn loop, undo/regenerate, slot switching |
| `memoryJobs.ts` | `applyStateStep` (phase 1) and the summary job queue (phase 2) |
| `services.ts` | `applyTurnDiff` (applies one `TurnDiff` by calling the modules below) and the model calls: `extractTurnDiff`, `summarizeScene`, `summarizeTimeSkip`, `rollArcSummary` |
| `stateBlock.ts` | Reading the state model's reply: `parseJsonObject`, `convertStateBlock` (snake_case → `TurnDiff`) |
| `entities.ts` | People/places: `resolveEntity`, identity groups, `resolveCharacterRefs`, `applyEntityDiff`, presence, `mergeDuplicateEntities`, `mergeEntityPair` |
| `bonds.ts` | `applyBondDiff`: affinity, status, relationship stage, attraction |
| `companions.ts` | People travelling with Kan: `startCompanion`, `endCompanion`, `setCompanion`, `applyCompanionChanges`, `castWithCompanions`, `applySharedScene` (§6a) |
| `facts.ts` | `applyFactDiff`, `applyThreadDiff`, `recordSceneEvent` |
| `deaths.ts` | Who is dead: `isDeceased`, `kanKnowsDeath`, `markDeceased`, `markDeathsByName` (canon, exact names only), `markAlive`, `normalizeDeaths` (load-time backfill) |
| `clock.ts` | `applyClockChange` (date/elapsed/clock from the diff, ageing across years), `applyClockTick` (stall counter) |
| `jutsu.ts` | Chakra natures (`normalizeJutsuNature`: exact name first, then whole-word keywords, longest first, so "Yin-Yang" is never "Yin"), grouping, and `applyJutsuDiff` (the permanent jutsu library; the same user's "Fireball Jutsu" and "Fire Style: Fireball Technique" are one record via `sameJutsu`, keeping the first name) |
| `log.ts` | Story log + undo snapshots: `appendStoryMessage`, `pushSnapshot`, `restoreLastSnapshot`, `cloneDatabase`, `storyMessagesSinceLastSummary` |
| `util.ts` | `trimToSentence`, `uniqueList`, `clamp` |
| `canonData.ts` / `canonDataMore.ts` | **Data only**: the 220 milestones (dates, place, who could know), sorted by opening date on export, canon types, courier tables, era order. `canonDataMore.ts` holds the living-world Stage 2 additions (`STAGE_TWO_WORLD`, `STAGE_TWO_PERSONAL`) |
| `canon.ts` | **Canon engine**: scheduling (`advanceCanon`), state-tracker marks (`applyCanonMarks`), the unheard-news queue and its escalation (`unheardCanonNews`, `newsUrgency`), world clock |
| `newsDelivery.ts` | How news reaches Kan this turn: `newsOffer` (bearers in the scene first, the living fallbacks, one delivery style, catch-up reports), `newsAllowance`, the narrator/tracker text |
| `reputation.ts` | Bingo books and Akatsuki standing (`state.reputation`): `applyReputationChanges`, `ensureLeafListing`, `bingoListings`, `currentHeat`, `territoryOf`, `formatReputationBlock` (YOUR NAME OUT THERE), `hunterOffer` (§9b) |
| `grudges.ts` | Grudges, the dark mirror of romance (`BondRecord.grudge`): `applyGrudgeChanges`, `grudgeStage`, `grudgeHeat`, `grudgeOffer` (SOMEONE WANTS YOU TO PAY), `GRUDGE_RULES` (§10a) |
| `letters.ts` | Personal letters to and from Kan (`state.post`): `letterOffer`, `sendLetters`, `receiveLetters`, `deliverLetters`, `lettersInTransit`, `letterArchive`, `interceptionRisks`, `tidyLetter` (§8c) |
| `geography.ts` | Regions and shinobi travel days from the geography lore: `regionOf`, `travelDaysBetween`, `whereaboutsRegion` (§8c) |
| `lives.ts` | People with their own lives (§8c): `advanceLives`, `applyLifeEvents`, `markReunions`, `sinceYouLastSaw`, `reunionNotes`, `knownLife` |
| `consequences.ts` | Delayed consequences (`state.consequences`, §8c): `plantSeed`, `applyConsequences`, `advanceConsequences`, `canReturn`, `consequenceOffer` (SOMETHING COMES BACK), `waitingConsequences` |
| `renown.ts` | Deeds, rumours, posters and Kan's epithets (`state.renown`, §8c): `recordDeeds`, `applyEpithet`, `markEpithetsSeen`, `localEpithet`, `knownEpithets`, `rumourOffer` (TALK OF YOU), `posterLine` |
| `povMemories.ts` | Memories from each person's point of view (`EventRecord.povs`, §8c): `povCandidates`, `parsePovLines`, `resolvePovs`, `povOf`, `latestPov` |
| `weather.ts` | Seasons and weather (§8d): `weatherAt` (per save, region and 6-hour block), `currentWeather` (the scene's held weather), `applyWeather`, `conditionFromText`, `formatWeatherLine` (WEATHER), `formatWeatherTracking`, `seasonLabel`, `CLIMATES` |
| `mapData.ts` | The map (§8d): `MAP_PLACES`, `REGION_SHAPES`, `placeIdOf`, `recordTravel` (`state.travelLog`), `routePoints`, `placeVisits`, `travelEstimate`, `knownWhereabouts` (as far as Kan knows) |
| `mapShapes.ts` | The map's outlines (§8d): shared-border country polygons `REGION_SHAPES`, `UNCLAIMED_LAND`, `BRIDGES`, `regionAt` (point in country) |
| `ambience.ts` | Ambient sound (§8e): `ambienceInputOf`, `ambienceMix` (bed levels from weather, place, clock, season, region, scene mode), `currentAmbience`, `isIndoors`, `describeAmbience`. Pure; the player lives in `lib/audio/` |
| `scrapbook.ts` | The scrapbook (§8d): `scrapbook` (photos by era and chapter; flashback photos under `MEMORY_ERA`), `eraOfDate`, `captionOf`, `placeAt` |
| `flashbackData.ts` / `flashbacks.ts` | Playable flashbacks (§8f): the 18 memories and Kan's parents (data), and the engine: `flashbackOffer`, `beginFlashback`, `applyFlashbackMarks`, `applyFlashbackTurn`, `endFlashback`, `applyFlashbackWriteUp`, `flashbackView` (the memory's date, place and weather), `formatFlashbackBlock` / `formatFlashbackOffer` / `formatFlashbackReturn`, `flashbackTrackingLines`, `flashbackImageNote`, `rememberChip` |
| `safehouses.ts` | Safehouses (§8g, `state.safehouses`): `applySafehouses` (tagging, leaving and coming back, stash, upgrades, residents, who knows, rest), `advanceSafehouses` (rooms running out, hosts, residents, found places searched), `currentSafehouse`, `restQuality` / `restBlocked`, `formatSafehouseLine` (SAFEHOUSE), `placesLine`, `formatSafehouseTracking` (SAFEHOUSES), `letterAddress`, `headingTo` |
| `names.ts` / `nameData.ts` | Names Kan knows (§8i): `displayName` (the one name everything shows), `alsoKnownAs`, `searchableNames`, `narratorName`, `labelOf` / `ensureLabels`, `learnName`, `applyNameStep` (tracker names, names told, recognition on sight, names said aloud, identities from canon), `nameKnownBy` / `identityLine` (who calls whom what), `kanKnowsLine`, `nameLeaks`, `ensureNames` (load-time setup); data: `KNOWN_AT_START`, `IDENTITIES`, `FAME`, `LABELS`, `NAME_PARTS` |
| `money.ts` | Kan's money (§8h, `state.purse`): `applyPurse` (the tracker's changes and stated totals; never below zero), `formatPurseLine` (Purse in CURRENT STATE), `PRICE_GUIDE` (one price scale for narrator and tracker), `normalizePurse`, `readRyo`, `formatChange`, `purseFeel` |
| `yearly.ts` / `yearlyData.ts` | The yearly calendar (§8b, `state.yearly`): birthdays, anniversaries, New Year and festivals: `yearlyOffer`, `applyYearly`, `knowsBirthday`, `upcomingBirthdays`, `todayNotes`; habits and festivals are data in `yearlyData.ts` |
| `prompt.ts` | Narrator and state prompts |
| `calendar.ts` / `timeparse.ts` / `pacing.ts` | Clock arithmetic, reading time from prose, the per-turn clock step (`resolveTurnClock`) |
| `sceneMode.ts` | Conversation and fight mode (§8a): `readKanInput`, `resolveTurnMode`, `applySceneBeat`, `setSceneModeOverride`, the SCENE MODE prompt lines |
| `encounters.ts` | Location kind and crowd level (`ENCOUNTER CONDITIONS`) |
| `returning.ts` | Characters who come back: the occasional optional `A FAMILIAR FACE` offer |
| `db.ts` / `slotStore.ts` / `seed.ts` / `canonCast.ts` / `canonCastMore.ts` | Persistence + migration (slots in IndexedDB), new saves, the canon cast (`canonCastMore.ts`: the 67 people added in Stage 2) |
| `retrieval.ts` | Memory/fact/lore retrieval |
| `romance.ts` | Hearts, lore locks, era notes |
| `canonEndgame.ts` | Canon-bound hearts: winnable, then settled with their canon partner (§10) |
| `image*.ts`, `reference*.ts`, `portrait.ts` | Image pipeline |
| `debug.ts` | Debug log (outside the save) |

Dependency direction: `services.ts` → `entities/bonds/facts/clock/jutsu/log/stateBlock` → `util/calendar/characterRefs/id`. `canon.ts` → `canonData.ts`. The leaf modules never import `services.ts`.

---

## 1. What the app is

- A **client-only** interactive Naruto RPG/PWA. Player = **Kan** (original Uchiha-Uzumaki, ANBU-trained, missing-nin, age 13 at the start, same age as Itachi).
- An LLM **narrator** writes the story in second person and emits a fenced JSON **state diff** at the end of every turn.
- A deterministic engine applies that diff, advances the clock, runs canon milestones, delivers news, records memories, updates bonds/jutsu, and persists everything.
- No server, no database service: `AsyncStorage` (localStorage on web) + OpenRouter API.

Tech: Expo SDK 54, Expo Router, React Native Web, TypeScript, `bun` as package manager.

---

## 2. Persistence

`lib/rpg/db.ts`

| Key | Where | Contents |
|---|---|---|
| `kan.meta.v1` | AsyncStorage (localStorage) | `StorageMeta`: active slot id, slot list |
| `kan.slot.<slotId>.v1` | IndexedDB `kan-saves` / `slots` (`slotStore.ts`) | One `AppDatabase` JSON per save slot |
| `kan.apiKey.v1` | AsyncStorage (localStorage) | OpenRouter API key (never stored in slots or exports) |

Slots live in IndexedDB because localStorage is ~5 MB for the whole app, shared by every slot, and a long story with its undo snapshots (each a full copy) outgrows that after a few hundred turns. `slotStore.ts` picks the backend once per session (IndexedDB, or AsyncStorage on native / when IndexedDB was never used and can't open), moves an old localStorage copy into IndexedDB on first read and then removes it, and asks for `navigator.storage.persist()` so the browser doesn't evict the data under storage pressure. Images are in a separate IndexedDB (`kan-images`, `imageStore.ts`).

**A save is never silently replaced.**

- `loadSlot` seeds a fresh story only for a slot that has never been saved. A stored slot whose JSON is unreadable, whose `schemaVersion` is wrong, or whose `normalizeDatabase` throws raises a `SlotLoadError` (`kind`: `unreadable` / `normalize` / `storage`). The raw text is set aside first under `kan.slot.<id>.broken.<timestamp>`, the slot is marked broken, and `saveSlot` refuses to write to a broken slot until it loads again (`clearBrokenSlot` on Retry). `loadStoredSlot` throws the same error.
- The app shows the blocking `BrokenSaveGate` screen (download the save as it is, try again, or open another story). `listSlots` lists a broken slot as a placeholder named "A story that could not be opened".
- Once a slot has been written to IndexedDB, `kan.backend = indexeddb` is set in AsyncStorage. After that a failed `indexedDB.open` is retried (3 attempts) and then reported as a `storage` error, never answered with an AsyncStorage fallback.
- If an IndexedDB copy and a localStorage copy both exist, `pickSlotCopy` keeps the one with more story turns (then the newer); the other is kept under `kan.slot.<id>.v1.conflict.<timestamp>`.
- **Daily backup.** The first save of each real-world day (per slot, per session) copies the stored version, if it was saved on an earlier day, to `kan.slot.<id>.bak` (`keepDailyBackup`). Settings → Stories → "Restore yesterday's backup" calls `restoreBackup`, which keeps the replaced copy under `kan.slot.<id>.before-restore.<timestamp>`.
- **Storage row.** `storageStatus()` reports `navigator.storage.persisted()` and `estimate()`; Settings shows protected / not protected (with the home-screen hint) and the space used.
- **Export reminder.** `meta.exportedAtTurn` / `meta.exportedAt` are set on export (and on import, since the file was an export). `turnsSinceExport` ≥ `EXPORT_REMINDER_TURNS` (50) shows a dot on the Settings tab and on the "Your last export" row. No popup.
- **One tab per story.** `tabLock.ts` holds a Web Lock (`kan-slot-<id>`) for the open slot. A tab that can't get it is read-only (`setSlotReadOnly`; `saveSlot` and `commitDb` refuse, sending is blocked, the Story tab says "Kan is open in another tab") and waits in line; when it gets the lock it reloads the save from storage.
- `normalizeState` starts from `{ ...state }` and repairs fields on top, so a field added to `GameState` survives a load even without a repair line (test: `slot-store.test.ts`, which reads the field list from `types.ts`).

Important functions:

- `loadSlot`, `saveSlot`, `createSlot`, `duplicateSlot`, `deleteSlot`, `renameSlot`, `switchSlot`, `listSlots`, `loadActiveSlot`
- Export / import (`saveFile.ts`): "Export with images" builds a zip (`buildExportZip`: compact `save.json` plus each referenced image as `images/<key>.<ext>`, added one at a time into a Blob). "Export without images" is compact JSON (`saveJson`). `deliverFile` hands the file to the share sheet on phones / installed apps (`navigator.share` with files) and downloads elsewhere; success is shown only after that resolves, a cancelled share shows nothing, a failure shows the real error. Import (`pickSaveFile`, which settles with null on cancel) accepts the zip or any JSON save (`readSaveFile` puts a zip's images back into the image store under their own keys, inlining any it can't store), then `importDatabase(json, name?)` → new slot
- `deleteSlot` moves the story to Recently deleted (`kan.slot.<id>.trash.<deletedAt>`) for `TRASH_DAYS` (7); `listTrash`, `restoreFromTrash` (back as a new slot id), `purgeTrash` (on start: drops old trash and every other copy of that slot). Deleting the last story starts a fresh one under a new id
- `normalizeDatabase(db)` → migration + repair + JSON stripping + default fields. **Every load/import passes through it.**
- `buildIndices(db)` → the `MemoryIndex` used by retrieval

### Storage quota strategy

`saveSlot` tries progressively smaller writes until one succeeds (a safety net; with IndexedDB it should practically never trigger):

1. full database
2. max 3 assistant images, 1 snapshot (`MAX_STORED_IMAGES`, `MAX_SNAPSHOTS`)
3. 1 image, 0 snapshots
4. 0 images, 0 snapshots

Images are normally stored as `img:` references, so only inline data URIs (native / no IndexedDB) are trimmed.

### Images (`imageStore.ts`)

- `storeImage` resolves only when the IndexedDB transaction commits (`tx.oncomplete`), so a write aborted afterwards (quota) never leaves a reference to a missing image.
- Display goes through `useStoredImage`, which hands out `blob:` object URLs shared by every mounted view, with an LRU of 40 unused ones (a URL on screen is never revoked). Data URIs (for model references and exports) sit in a separate LRU of 24. The image viewer may hold a `blob:` URL, so `retouchSceneImage` converts it back with `toDataUri`, and `downloadImage` accepts it.
- **Garbage collection.** `freeUpImageSpace(extra)` (db.ts) gathers every `img:` key from every stored slot-ish key (slots, snapshots inside them, `.bak`, `.conflict.*`, `.broken.*`, `.before-restore.*`, trash) plus the open story in memory, and `collectImageGarbage` deletes the rest. Images younger than an hour (by their `pic_` key's timestamp) are always kept, since a painting may not be saved into a story yet. If any copy can't be read, nothing is deleted. It runs after a story is deleted and from Settings → Stories → "Free up space".

---

## 3. Data model (`lib/rpg/types.ts`)

```ts
AppDatabase {
  schemaVersion: number
  meta: StorageMeta
  settings: Settings
  rawLog: RawLogEntry[]          // story messages (user/assistant) with dates, tokens, image
  entities: EntityRecord[]       // characters/places/organizations + lore + lastSeen
  jutsuRecords: JutsuRecord[]    // permanent jutsu library
  events: EventRecord[]          // memories, canon world events, time skips
  eventEntities: EventEntityRecord[]
  bonds: BondRecord[]            // affinity, status, relationship, attraction, romanceNote
  facts: FactRecord[]            // permanent facts with whoKnows + validity
  threads: ThreadRecord[]        // open/resolved plot threads
  loreEntries: LoreRecord[]      // keyword-triggered world lore
  summaries: SummaryRecord[]     // chapter / arc summaries and the one rolling saga (old saves may hold year summaries; nothing reads them)
  state: GameState
  indices: MemoryIndex
  snapshots: TurnSnapshot[]
}
```

### `CalendarDate` — the clock

```ts
{ year, month, day, hour, minute, second? }
```

No `timeOfDay` field. Period labels (`morning/afternoon/evening/night`) are derived with `timeOfDayOf(date)` (05–11 morning, 12–16 afternoon, 17–20 evening, otherwise night).

### `GameState`

```ts
{
  player: PlayerSheet
  mood: string
  worldDescription: string
  jutsu: string[]              // name list shown to the narrator (capped)
  inventory: string[]          // includes Akatsuki cloak detection
  location: string
  locationKind?: 'settlement' | 'road' | 'wilderness' | 'structure'
  inStoryDate: CalendarDate
  turnsWithoutTimeChange?: number   // turns where only the pace minimum moved the clock; drives a prompt nudge
  canonPoint: string
  canonProgress?: CanonProgress
  chapter: number
  scene: string
  scenePace?: 'combat' | 'chase' | 'conversation' | 'travel' | 'downtime'
  sceneCast?: string[]
  sceneMode?: { current, exchangeStreak, partners, lastBeat?, override? }   // §8a
  yearly?: { knownBirthdays: string[], offered: Record<key, year> }        // §8b
  weather?: { region, condition, text?, since, sceneSeq?, source: 'world'|'story' }   // §8d
  travelLog?: [{ place, region?, placeId?, date }]                          // §8d, last 400
  flashbacks?: { played, offered, lastOfferOn?, pending?, active?, returned? } // §8f
  safehouses?: { places: Safehouse[], current? }                            // §8g
  purse?: { ryo, history: [{ date, change, reason, counted? }], estimatedStart? }  // §8h, last 40
}
```

`EntityRecord.birthdayInvented?: true` marks a birthday the app chose (canon gives none).

`RawLogEntry.flashback?: { id, date }` marks a turn played inside a flashback (both entries, with the memory's clock when it began); `RawLogEntry.flashbackOffer?: id` marks a reply whose prompt offered one (§8f).

`EntityRecord.companion?: { since, sinceLocation?, reason?, sharedScenes, bondPoints }` — set while that person travels with Kan (§6a).

### `CanonProgress`

```ts
{
  version: 3
  baselineDate: CalendarDate
  baselineTurn: number          // legacy; no longer used (canon follows dates only)
  completed: string[]           // milestone ids (including expired/silent)
  active: string[]              // open encounter windows
  engaged: string[]             // personal beats started but not finished
  expired: string[]             // windows that closed before they could happen
  heard: Record<eventId, { from: string; date: CalendarDate }>
  heldForCombat?: boolean       // last advance was held because Kan was mid-fight
}
```

### `state.post` (personal letters, `letters.ts`)

```ts
{
  letters: [{
    id, direction: 'to-kan' | 'from-kan', entityId, name,
    sentOn, arrivesOn, gist?, text?,           // text: the letter's words, for the archive
    status: 'travelling' | 'delivered' | 'lost' | 'unsent',   // unsent: a letter to the dead
    lostReason?, carrier?: 'bird'|'ninken'|'summon'|'courier'|'dead-drop'|'hand',
    coded?, toRegion?, interceptedBy?: 'root'|'akatsuki'|village, occasion?: 'birthday',
    replyTo?, deliveredOn?
  }],                            // everything travelling + the last 200 done with words + 40 without
  lastLetterIn?: CalendarDate    // when a letter last reached Kan
}
```

### `state.reputation` (`reputation.ts`)

```ts
{
  villages: { leaf?|sand?|mist?|cloud?|stone?: {
    heat: number,                // 0-100 before cooling
    listedOn?: CalendarDate,     // in the bingo book since; never removed
    lastDeedOn?: CalendarDate,   // cooling counts from here
    lastReason?: string,
    known: boolean               // Kan has seen or been told of it
  } },
  akatsuki?: { standing: number /* -100..100 */, lastReason?, updatedOn? },
  recent: [{ faction, change, reason?, date }]   // last 12
}
```

### `state.renown` and `state.consequences` (§8c)

```ts
renown: {
  deeds: [{ id, date, text, faction?, region?, weight }],          // last 40
  epithets: { leaf?|sand?|mist?|cloud?|stone?|akatsuki?|rain?|underworld?: {
    name, since, theme /* or 'story' */, known, history?: [{ name, since }]
  } }
}
consequences: [{
  id, kind: 'spared'|'lie'|'helped'|'witness'|'betrayal'|'humiliated'|'promise'|'debt'|'intercepted'|'found',
  createdOn, entityId?, who, what, want?, witnesses: string[], faction?, region?,
  after, before, status: 'waiting'|'returned'|'faded', letterId?, safehouseId?, offeredOn?, resolvedOn?
}]                               // up to 24 waiting + 20 ended
```

`EntityRecord.lifeEvents?: [{ date, text, kind, source: 'world'|'story', known? }]` (last 8) and `EntityRecord.reunion?: { on, lastSeen, lastSeenAt?, seq? }`. `EventRecord.povs?: [{ entityId, text }]` (up to 3).

`BondRecord.grudge?: { since, reason, heat, updatedOn, lastStrike?, strikes }` — set while that person holds a grudge against Kan (§10a).

### `TurnDiff` (what the state call produces)

```ts
{
  state?: {
    mood?, worldDescription?, jutsuAdded?, jutsuRemoved?,
    inventoryAdded?, inventoryRemoved?, location?, locationKind?,
    inStoryDate?, elapsedSeconds?, clockTime?: {hour,minute},
    scenePace?, canonPoint?, chapter?, scene?, sceneCast?
  },
  imageWorthy?: boolean,
  beat?: { kind: 'exchange'|'instruction'|'remark'|'action'|'travel'|'combat', with: string[] },
  fightOptions?: string[],
  entities?: [{ entityId?, isNew?, name, age?, role?, personality?, speechStyle?, mood?, appearance? }],
  jutsuUsed?: [{ name, user, chakraNature?, effect?, visual? }],
  bonds?: [{ entityId?, character, affinityDelta?, status?, note?, isMajor?, relationship?, attraction?, romanceNote? }],
  facts?: [{ action, type?, text, subject?, whoKnows?, validFrom?, ... }],
  threads?: [{ action, title, description?, type?, importance?, participants? }],   // type and importance from the tracker (quest, goal, promise, debt, mystery, grudge, other; 1-5). An untyped new thread is classified by its words (classifyThread); "other" never overwrites a real type on update; old "other" threads are reclassified on load. The Journal's Missions show quests, Goals show goals.
  canonCompleted?: string[], canonEngaged?: string[], canonPassed?: string[],
  newsRelayed?: [{ id, from? }],
  lettersSent?: [{ entityId?, name, gist?, text?, carrier?, coded? }], lettersReceived?: [{ entityId?, name, text? }],
  lifeEvents?: [{ entityId?, name, text }], epithet?: { audience, name },
  consequences?: [{ kind, entityId?, who, what, want?, witnesses?, faction?, when? }], consequencesReturned?: string[],
  birthdaysLearned?: [{ entityId?, name }], weather?: string, flashback?: 'offered'|'started'|'ended',
  safehouse?: { id?, name?, kind?, paidNights?, host?, stored?, taken?, upgrade?, shownTo?, residentsJoined?, residentsLeft?, ended? },
  money?: [{ amount /* ryō, negative when Kan pays */, reason }], moneyCounted?: number,
  companionsJoined?: [{ entityId?, name, reason? }], companionsLeft?: [{ entityId?, name, reason? }],
  scene?: { ended, summary?, tags?, entities?, importance? }
}
```

Note: the state model returns **snake_case** JSON matching `TURN_STATE_SCHEMA` (`lib/rpg/stateSchema.ts`): flat `location`, `time.elapsed`, `affinity_change`, `characters_present`, `character_updates`, `scene_ended`, `image_worthy`, `news_relayed`, `canon_completed`, … Strict mode means every field is always present, with `null` / `[]` for “unchanged”. `convertStateBlock` (`stateBlock.ts`) ignores those and translates the rest → `TurnDiff` camelCase. It still accepts the older nested `state: { location, … }` shape.

---

## 4. Turn lifecycle

Main file: `lib/rpg/game.tsx` (`GameProvider`).

### `sendTurn(input)`

1. Validate API key and action text.
2. Snapshot the database (undo).
3. Append the player message to `rawLog`.
4. `buildNarrationPrompt(db, action)` → messages + estimated tokens. The narrator prompt contains **no JSON instructions and no canon ids**; it only asks for prose and for time, place, people and outcomes to be legible in it.
5. **Call 1 — narrator.** `streamChatCompletion` (SSE) with the story model. Text streams to the screen live (`streamingText`, throttled to ~60 ms; `streamingPreview` hides anything from a stray ``` or `{"` onwards). Kan's line is shown meanwhile via `pendingAction`.
   - **Stop.** While narrating, the send button is a stop button (`stopNarration` aborts the stream). A reply that is stopped, stalls or breaks off mid-stream is kept if it holds two complete sentences or more (`keepablePartial`, trimmed to the last full sentence) and goes on to the state step like any reply; otherwise it is discarded. A failed or stopped turn with nothing kept puts Kan's action back in the input box (`returnedAction`), and the input box is kept per story in localStorage (`draft.ts`), so a reload never loses it. A press of Stop shows no error card.
   - **Failures.** OpenRouter reports mid-stream failures as an `error` object in a `data:` line; `createSseParser` throws it as an `OpenRouterError` with its status (502 when the code isn't numeric), and also reads what is left in the buffer when the stream ends. HTTP failures keep their status too. A 429, 408, 5xx or network failure before any text has streamed gets one automatic retry after 1.5 s. The error card shows `describeCallError`: one second-person sentence with the fix (key rejected, out of credits, rate-limited, provider trouble, context too long, content refused, no provider, offline, timed out).
   - **Timeouts** (`CALL_TIMEOUTS` in `openrouter.ts`, through `timeoutSignal`): a stream that sends no chunk for 45 s, a state call after 60 s, a summary after 90 s, an image after 180 s. A timeout throws `OpenRouterTimeoutError` (status 408), so it is retried like a dropped call; a press of Stop stays an `AbortError` and is never retried.
6. `stripNarrationJson` runs once on the final text as a safety net only. If the finish reason is `length` or the prose ends mid-sentence, it is trimmed to the last complete sentence (`trimToSentence`). There is no continuation request.
7. Snapshot + append the player and assistant messages onto the **latest** copy of the slot (`updateLatest`), not the copy the prompt was built from.
8. **Call 2 — state.** `runStateStep(...)` starts in the background; the next turn, undo and regenerate wait for it.

### Saving a turn: two phases (`lib/rpg/memoryJobs.ts`)

**Phase 1 — state step (`runStateStep` → `applyStateStep`)**, saved immediately:

1. `extraction = extractTurnDiff(...)`: the memory model (`settings.extractionModel`, a cheap one) gets `buildExtractionPrompt` — `STATE_SYSTEM` rules, current state/characters/jutsu/bonds/facts/threads, `TIME BEFORE THIS TURN`, `CANON TRACKING` (active/personal beat ids and the offered news ids with the rule for each), `LETTERS` (the letters_sent rule, and the offered letter's sender id), the previous beat for context, then this turn's player line and prose. It is sent with OpenRouter structured output (`response_format: json_schema`, `strict: true`, `provider.require_parameters: true`). If no provider for that model supports it, `completeChat` falls back to `json_object`, then to a plain reply (the result's `responseMode` says which answered; the Debug panel shows it on the call as "strict schema", "JSON mode (schema refused)" or "plain reply (JSON refused)"); `parseJsonObject` + `convertStateBlock` read whatever comes back. If the call fails, a `state` job is stored as pending and nothing else changes; an unreadable reply applies `null` (the prose clock parser still runs).
2. **Narration clock**: `detectNarrationTime`, pace via `extraction.state.scenePace ?? inferScenePace`, then `resolveTurnClock(...)` returns the one forward step for the turn (largest of reported, parsed and the pace minimum; combat cannot skip days; a full night's sleep jumps to morning). The diff carries only that `elapsedSeconds`; the applied seconds are stored on the reply as `rawLog[].elapsedSeconds` for the time chip.
3. `applyTurnDiff` (`services.ts`) in this order: state + clock (`clock.ts`), entities (`entities.ts`), revivals and deaths (`deaths.ts`), jutsu (`jutsu.ts`), companion joins/partings (`companions.ts`), bonds incl. romance (`bonds.ts`), facts and threads (`facts.ts`), scene event (with companions) + shared-scene bond step, duplicate merge, presence (companions always included), stall counter.
4. `applyCanonMarks` → `markNewsHeard` (up to `newsAllowance(latest)`: 1, or the size of the catch-up report the prompt offered) → `advanceCanon` → letters: `receiveLetters` → `sendLetters` → `deliverLetters`.
5. Queue follow-up jobs in `db.memoryJobs`:
   - `timeSkip` if `daysBetween(before, after) >= 180`,
   - `scene` when `imageWorthy`, `scene.ended`, or `storyMessagesSinceLastSummary >= autoSummarizeThreshold`. It covers only story messages no chapter summary covers yet (`unsummarizedStory`, oldest first, up to 16; at least 4 unless the scene ended). A pending scene job is re-pointed at those instead of stacking a new one.
6. Commit. The clock, bonds, facts and canon are now saved.

**Phase 2 — summary jobs (`drainJobs`)**, one at a time, never blocking the next turn:

- Each job reads the latest save, calls the model (`runSummaryJob`), then `applySummaryJob` applies the result to the save **as it is at that moment**. If the turn it came from was undone or the job was removed, the result is discarded.
- Summary replies are `TITLE:` / `MEMORY:` (chapter only) / `SUMMARY:` lines, read by `parseTitledSummary` (`util.ts`); a reply without labels is taken as the summary. Caps: 2000 tokens (2400 for arc/year), low reasoning excluded, and one retry with 1.75× room if a reply is cut off.
- A chapter summary is saved only for messages no other summary covers (a job that ran twice, or overlapped one that landed, saves nothing) and never with the same text twice; `normalizeDatabase` drops duplicate summaries from older saves. It stores its `title` and the `chapter` it closes, and moves `state.chapter` on by one.
- A finished chapter summary queues an `arc` roll-up every 3 chapters, deduplicated by `sourceSummaryIds`. Each arc that lands queues a `saga` job that folds it into the one rolling **saga** summary (`buildSagaPrompt`, 250 words at most, older events shorter, deaths, betrayals, open promises, debts and secrets kept); only the newest saga is kept, and STORY SO FAR shows it first ("The whole story: …", then "Latest arc" and the chapters). `year` summaries are no longer made (nothing read them); queued year jobs are dropped.
- The scene summariser gets each message's opening and ending (`headAndTail`, 1400), a WHEN AND WHERE line (the stretch's in-story dates, its scene name, where you are now), and is told to keep every promise, debt, secret, injury, death and who knows what.
- Every step has its own error handling: a failure marks just that job `failed` (with `attempts` and `error`); the rest still run.
- Jobs are stored in the save, so a step interrupted by closing the tab survives a reload.
- Story screen: "Memory updating…" while any step runs; "Memory pending · N" with **Retry** when a step failed (`pendingMemoryCount`, `retryPendingMemory`).
- A `state` job only stays valid while its turn is the newest, so it is **settled before the next turn is narrated** (`settlePreviousState` in `sendTurnInner`): one more try, and if that fails too, `applyStateFallback` runs `applyStateStep(latest, null, turn)` (the prose fallback: clock, people present, Kan's jutsu) and marks the reply `stateFromFallback` (shown in Debug). A turn's state is never dropped.
- `extractTurnDiff` retries passing failures itself (`withTransientRetry`: network errors, 408, 429, 5xx; three attempts with 1.5 s and 4 s waits). `completeChat` throws `OpenRouterError` with the HTTP status; `isTransientError` decides.
- If `applyStateStep` itself throws, `runStateStep` records the real error in Debug and queues a state retry instead of reporting a storage problem.
- After a turn whose state step applied, failed summary jobs with fewer than `SUMMARY_AUTO_ATTEMPTS` (3) attempts are queued again automatically.

**Write ordering**: `commitDb` updates `dbRef` synchronously and saves through a serial queue, so an older copy can never be written last. Writes to a slot that isn't open go through `updateLatest`'s inactive path (load → mutate → save, serialized).

### `undoLastTurn` / `regenerate`

- Undo restores the most recent snapshot (taken just before the turn was saved), then `carryOverMemory` keeps summaries that finished later if everything they were written from still exists (`sourceLogIds` / `sourceSummaryIds`), plus pending jobs that still apply.
- `carryOverMemory` also keeps the live `settings` and `meta`: undo takes back story, not the model you just picked, the story's name or when you last exported.
- Undo keeps the last 5 turns (`SNAPSHOT_LIMIT`). After an undo a toast offers **Redo** for 8 s (`REDO_WINDOW_MS`, `redoLastUndo`): the save as it was before the undo is held in memory and put back only if no new turn happened since and the same story is open.
- Regenerate re-sends the last user message from the pre-turn state (same carry-over).
- Without a snapshot (an imported or duplicated save starts with none, and undo can use them up) Retry and Undo are hidden under the last reply, and `regenerate` does nothing, so a turn can never be sent twice.
- Undo and Redo do nothing while a reply is being written.

---

## 5. Prompt composition (`lib/rpg/prompt.ts`)

`buildNarrationPrompt` returns `{ messages, estimatedTokens, memories, recentMessages, arcSummary }`.

The prompt is ordered from never-changing to changing-every-turn, so its front is a stable prefix that providers can cache (cache reads cost a fraction of fresh input; see Settings → Debug for cached tokens per call).

### System message (two cacheable blocks)

1. **Rules** — `NARRATION_SYSTEM`, identical on every turn of every story (~1.3k tokens):
   - **CORE** — never control Kan, place-name rule (English names), date/rank/knowledge discipline, supplied context is truth, binding threads.
   - **TIME** — TIME block is the only date, relative time only, durations made explicit and honest.
   - **CANON** — never invent canon; news only through bearers; identity rules (the man in the orange mask is one person whose card says which identity he uses, real Madara separate; Pain = one mind in six bodies; Zetsu = one being; other masked people are not him).
   - **NAMES** — narration uses only the names Kan knows; strangers keep one description; characters say names aloud as they would, each with the name they know; a name Kan says that he couldn't know gets a reaction (§8i).
   - **STYLE** — plain English, 2–4 paragraphs, no repeats, rare encounters, new characters, Kan's `"speech"` / `*action*` markers.
   - **ROMANCE** (from `romance.ts`): lore-locked vs winnable, adults deflect under 17, explicit intimacy only 18+, rejections hold by default but can slowly thaw when the story earns it.
   - **OUTPUT** — prose only, changes legible in the prose.
2. **Slow context** — `formatCharacterSheet`, `formatStorySoFar` (latest arc summary + up to 3 newest chapter summaries the arc doesn't cover, never fewer than 2), `formatJutsu` (KAN’S JUTSU: all of Kan's own, signature first then most used, up to 20, one line each with nature, effect and times used; then up to 3 each for people in the scene cast; nobody else's), `formatBonds` is ranked by major, strength of feeling either way, then most recently touched (enemies are no longer cut for being negative); it stays the same whoever is in the scene, so the cached block doesn't move every time someone walks in. `formatThreads` (8 open threads: those with someone in the scene first, then by importance, then newest), `formatBonds`, `formatTheDead` (everyone dead, flagged when Kan does not know yet). Changes only when a summary lands, a jutsu is used, a thread or bond moves. The scene cast holds up to 12 people (`SCENE_CAST_LIMIT`, `sceneLimits.ts`), the same everywhere it is capped.

Each block is sent as a text part with `cache_control` for models that need explicit breakpoints (`anthropic/`, `google/`, `qwen/` — see `toWireMessages` in `lib/openrouter.ts`; Gemini uses only the last one). Other providers (OpenAI, DeepSeek, …) cache a repeated prefix automatically and get plain string content. `OpenRouterMessage.content` is always the full text; `parts` is only the split.

### Dynamic user block (in order)

1. `formatState` (date, place, mood, world, inventory (all of it), purse, canon point)
1a. `formatCompanions` — `TRAVELLING WITH KAN`: each companion, how long together, why/where they joined, shared scenes, how they feel (only when someone travels with Kan). Their character cards are always in `CHARACTERS IN SCENE`, companions first.
2. `formatTimeLine` — `Year 13 · Day 4, October · 9:40 PM` plus a nudge to state durations once `turnsWithoutTimeChange >= 2`
2a. `formatWeatherLine` — `WEATHER (the Land of Rain, late autumn; it almost never stops raining here): steady rain. …` with what it does, shaped by the mode (§8d)
3. `formatMatchedEntities` (with lore hearts + era notes; ordered companions → the scene cast → people named in the last reply or Kan's input → others by when Kan last saw them; full cards for 8 (`FULL_CARD_LIMIT`), anyone else present gets a line under ALSO HERE; every card carries that person's bond line, feeling both ways, relationship, status, notes, grudge stage), `formatFacts` (≤10), `formatLore` (triggered lore only; lore marked `always`, like the geography, sits in the cached front after the rules as `WORLD (fixed reference)`)
4. `formatNewsBlock` — `newsOffer`: the next unheard event (or one catch-up report), with location, bearers in the scene first, the living fallbacks, this turn's delivery style and urgency (none in combat)
4a. `formatLetterBlock` — `A LETTER FOR YOU`: a reply that has arrived, or an unprompted letter (none in combat or during a catch-up report)
5. `formatUpcomingWorldBlock` — planned world events in the next ~10 days (“RUMORS OF WHAT'S COMING”)
6. `formatCanonBlock` — recent heard world events, pending personal beats (“do not assume”), active beats + encounter context, recently concluded (titles only, never ids)
7. `formatMemories` — retrieved events (≤ retrieval limit, 400 chars each), skipping any that repeat a summary already in STORY SO FAR
8. `formatRecentMessages` — last `contextMessages` (default 16). The newest narration is labelled "Narrator (continue directly from here)" and keeps its last 2200 chars (the separate LAST NARRATED BEAT block that repeated its last 450 chars is gone); older narrations keep their **start and end** (`headAndTail`, 1400 chars: ~40% opening, ~60% ending); player input 500 the same way
10. `formatEncounterConditions` — place kind, hour and how crowded it is (inside a structure with people in the scene or residents in the safehouse: "indoors; only those already here"). `classifyLocation` matches whole words (plus plurals and compounds like "marketplace"), so "inn" is not in "inner"
11. `formatReturningCharacter` — occasionally, “A FAMILIAR FACE (optional)”: one original character Kan has not seen in a while who fits the current place (see §9)
12. `CONTINUITY` line + location kind
12a. `formatSceneModeLine` — `SCENE MODE: …` (conversation with whom / talk is building / the conversation ends / fight, with Kan's current wounds and conditions / normal narration chosen by the player). Absent on plain normal turns. See §8a.
13. `YOU (KAN) DO OR SAY: <action>`

There is no dice roll and no repeated-word list. Encounter frequency comes from the STYLE rule (rare, must fit the conditions, never two in a row) plus `ENCOUNTER CONDITIONS`; freshness comes from the STYLE rule against reusing descriptions and the `CONTINUITY` line. (Both blocks were removed: the roll added random events that fought canon pacing, and listing overused words put those words back in front of the model.)

The current action appears **once** (it is excluded from the recent-message block).

### Token budget

`settings.promptTokenBudget` (default 9500; Settings → Advanced → Story context offers 6k / 8k / 9.5k / 12k). After building, the prompt drops the oldest scene messages (never below 4) until `estimateTokens` is under budget.

### State prompt (call 2)

`buildExtractionPrompt` puts `STATE_SYSTEM` first as its own cacheable block (field-by-field rules, ~650 tokens: time, place, people, jutsu, memory, canon, image) and runs after **every** turn against `TURN_STATE_SCHEMA`. The canon ids the narrator no longer sees are given here in `formatCanonTracking`, each with the rule for marking it. News and canon blocks in the narrator prompt describe events in plain words only.

---

## 6. Memory & retrieval (`lib/rpg/retrieval.ts`)

- `retrieveMemories(db, {recentMessages, userMessage}, limit)` scores events by:
  - entity presence in recent text,
  - tag/keyword overlap,
  - importance,
  - recency (in-story date),
  - pinning,
  - +6 when someone in the scene cast (or a companion) was `present` / `participant` in it (sharing it, not just being named).
  A memory whose source turns are still in RECENT SCENE (`sourceLogId`, `turnLogId`, or its chapter summary's `sourceLogIds`) is never recalled: the page already shows it.
- `relevantFacts(db, entityIds, text, sceneIds)` ranks active facts, capped at **10**: Kan's own injuries, conditions and possessions; facts about people in the scene (cast and companions); secrets, plans and relationships they are part of; facts about people named in the recent text; facts whose distinctive words (5+ letters, case-blind, at least two) the text uses; newest first within each rank. With fewer than 4 relevant, the newest others fill in.
- `triggeredLore(db, text)` matches keyword-triggered lore entries, capped at **4**.
- Events (memories) are created by `recordSceneEvent` (on `scene.ended`; raw prose titled with the scene's name until replaced), by **every chapter summary** (`saveSummaryMemory` in `memoryJobs.ts`: tagged `summary`, `title` from the summary, `summary` = the model's one-to-two sentence MEMORY line, `summaryId` back to the chapter summary, linked as `present` to everyone in the scene cast on the turns it was written from (never to people it merely names), folding in the scene-end events made on those same turns), time skips, and canon milestones.
- **One memory, one scene**: `applyStateStep` stamps each turn's two story entries with `sceneSeq` and `sceneCastIds` (the scene cast's entity ids). `state.sceneSeq` moves on the turn after `scene_ended`, or on a turn whose `location` changes. `queueSceneJob` only ever takes the oldest scene's stretch (`firstSceneStretch`), so a summary never spans two scenes; once it lands, a finished scene waiting behind it is queued next. Scene-end events carry `turnLogId`, and a summary takes in only the ones whose turn it was built from (its `sourceLogIds`), never by time. The bond page (`sharedMemories`) shows only `present`/`participant` links. `formatMemories` gives the narrator the full chapter summary behind a `summaryId`.
- The scene name moves through the state schema's `scene_title` (only when a new scene starts) → `state.scene`.
- Summaries: chapter summaries feed the arc summary; the latest arc plus the newest chapters feed the prompt. `storyMessagesSinceLastSummary` is the summarization cadence guard.

### Entity identity resolution (`entities.ts`)

- `resolveEntity(db, name)` — exact name or visible alias only (titles and honorifics allowed: "Lady Tsunade", "Itachi-san"). Descriptions ("the masked man", "the leader", "the woman" — `isGenericDescription`) never match and never become a person. The one group rule left: a bare "Madara" is Tobi until the real Madara exists.
- **Identities** (`EntityRecord.identities`, §8i) replaced the old hidden aliases: an identity Kan hasn't learned (Obito, Nagato, Kurama) is never matched in story text or shown; once he learns it (`learnFromCanon`, the tracker's `names_learned`) it becomes an alias, first word included ("Obito"). The narrator sees it only as a narrator-only truth on the person's card; the state tracker sees every identity in KNOWN CHARACTERS. Canon death data (`markDeathsByName`) uses identities, never a name another person owns (`alias: false`: the claimed "Madara Uchiha"). Older saves' `hiddenAliases` are dropped on load.
- Identity groups (for duplicate merging, visible names only): `masked-man` (Tobi), `real-madara`, `pain` (Pain and the six paths), `zetsu`.
- **Duplicates caught on the way in** (`applyEntityDiff`, audit 6.14): a `new_characters` name whose given name (first word) belongs to exactly one original, living person who is in the scene or was seen in the last 30 in-story days is that person; a fuller name ("Ren" → "Ren Kisaragi") becomes their name and the old one an alias. An unnamed stranger described with two or more of the same words as a single unnamed stranger in this scene (listed, or seen within the last day) is that stranger, and the new description becomes an alias. Each merge is a `merged` event in Debug. `resolveEntity` also finds a stranger written without its "the" ("scarred ferryman" is "the scarred ferryman"). Canon people are never merged by given name.
- `mergeDuplicateEntities` runs on every turn; it and the manual merge both use `mergeEntityPair`, which folds one person into another (names become aliases, bonds combined, facts/event links/threads/jutsu/scene cast moved).
- **Who is here now**: `characters_present` is authoritative whenever the reply has it: `[]` means Kan is alone (companions are added back), and only a missing field means unchanged (`convertStateBlock`). When the location changes and the tracker listed nobody, the cast drops to companions only (`applyStateDiff`). So someone Kan walked away from is no longer stamped into `sceneCastIds`, shares no memory of the walk and gets no "in scene" card.
- **Who someone is never changes by accident** (`applyEntityDiff`): a `new_characters` entry that resolves to a known person only fills fields that are empty or "Unknown" (role, personality, speech, base look, birth year). Canon characters (`isCanonCharacter`, `canonPeople.ts`: the canon cast plus Itachi, Hana, Izumi and Suzume) and Kan never have role, personality, speech style or birth year changed by the tracker; era notes do that. An original character's personality or speech changes only through `character_updates.personality_change` / `speech_style_change` (rare, told so in `STATE_SYSTEM`).
- **Only the scene cast meets people**: `met: true`, `lastSeen` and `lastSeenAt` come only from `characters_present` (plus companions), via `recordPresence` and `settleNewlyMet`. People from `new_characters` start `met: false`, "Not yet met". Character updates, facts, bonds and grudges never meet anyone; a bond, grudge or companion join for someone unmet who isn't in this turn's cast is ignored (`presentIds`). When there is no tracker reply, people in the prose fallback's `suggestedCast` whom Kan has already met (alive) join the scene cast; nobody is taken out (someone silent may still be there) and nobody new is met (a `fallback` event in Debug lists who joined).

### Duplicate characters

- **Canon cast** (`canonCast.ts`): the main canon characters (Sasuke, Kakashi, Kisame, Kakuzu, Pain, Tobi, …) are in every save from the start, each once, with aliases, birthdays and roles as of year 13. They start with `met: false` and stay off the bonds list until they are present in a scene. `ensureCanonCast` runs in `seedDatabase` and `normalizeDatabase`: older saves gain the people they lack, and a person they already have under any name gets the other names as aliases instead of a second entry. Some people enter the save only when a milestone fires (`appearsWith`, added by `fireMilestone` and on load once the milestone is completed): the real Madara (`madara-revived`; until then bare "Madara" stays Tobi), Kaguya (`kaguya-awakens`) and the children born during the story (Mirai, then Boruto, Sarada, Himawari, Shikadai, Inojin, Chōchō, Metal Lee, as small children only). Until then they do not exist for the story. Aliases avoid common words ("Guy", "Leader"). The cast (168 canon people plus the five seeded) covers the Leaf's clans, elders and village life, the dead the story looks back on (Minato, Kushina, Fugaku, Mikoto, Rin, the first two Hokage, Dan, Yahiko — `status: 'Deceased'`), the Sand, Mist, Cloud and Stone (Kage, jonin, the next generation), all nine jinchūriki, Hanzō, Mifune, Fukasaku, Chiriku and Orochimaru's people (Kimimaro, Jūgo, the Sound Four); since Stage 2 also the old Seven Swordsmen, the Uchiha coup plotters, Kagami, Izuna, Mito, the nine tailed beasts (`gender: 'unknown'`, status "Sealed"; Kurama is an identity of the Nine-Tails Kan learns at `naruto-joins-war`, §8i), the summons, and supporting people of every village. Everyone named in a milestone's `deaths` is in the cast (or arrives before it fires), so canon deaths always land on someone; `setsStatus` on a milestone changes a status by name (Kaguya "Sealed", the freed beasts "Free"). Every person has a birthday except the beasts and summons; canon dates where the databooks or official columns give one, otherwise an app-chosen date marked `birthdayInvented`. `BIRTHDAY_FIXES` moves older saves off dates that were wrong, and `ensureCanonCast` backfills missing birthdays. A stranger without a birthday gets an age from the birth year (`entityAge`). The state tracker's KNOWN CHARACTERS roster leaves out people in the background (unmet, and long dead, sealed or a summon) to stay short; when a turn names them they appear with their id under CHARACTERS IN THIS TURN. A new person (`is_new`) only matches an existing one by an exact name or visible alias ("Hayate Moriya" is not Gekko Hayate).
- **IDs for the state tracker** (`characterRefs.ts`): the extraction prompt lists `KNOWN CHARACTERS` as `- kisame-hoshigaki: Kisame Hoshigaki (Kisame, Hoshigaki Kisame) [not met yet]` (cached part), plus `CHARACTERS IN THIS TURN` details (dynamic part). IDs are slugs of the current name, `-2` on collisions. The schema uses `bonds[].character_id`, `character_updates[].character_id`, and IDs in `characters_present`, `facts.entity/who_knows`, `jutsu_used.user`, `news_relayed.from`.
- **Only `is_new: true` adds someone**: `new_characters[]` entries need `is_new: true`; `false` is dropped. `resolveCharacterRefs` (run in `extractTurnDiff`) maps each reference to a person: known ID → exact new name from this turn → name/alias fallback → otherwise dropped (a bond or update for an unknown ID never creates a person). A "new" person whose name resolves to someone known becomes an update.
- **Name mentions** (`mentionsName` / `mentionsEntity`): whole-word, Unicode-aware; "Pain" must be capitalized. Used for narrator scene cards, retrieval, the image cast fallback and memory tags (never memory links), so "asleep" no longer finds Lee and "Sarutobi" no longer finds Tobi.
- **Merge with…** on the bond screen (`components/kan/MergeSheet.tsx`, `mergeCharacters` in `game.tsx`): pick the other person (likely duplicates by shared name words first), choose which name to keep, merge.

---

### 6a. Companions (`companions.ts`)

A companion is someone travelling with Kan: `EntityRecord.companion` is set until the story parts them.

- **Joining / leaving**: the state tracker's `companions_joined` / `companions_left` (`character_id`, `reason`). It sees `TRAVELLING WITH KAN: <ids>` in the dynamic block, `[travelling with Kan]` in `KNOWN CHARACTERS` and `CHARACTERS IN THIS TURN`, and the COMPANIONS rule in `STATE_SYSTEM` (scouting ahead or sleeping in the next room is not leaving). Someone added under `new_characters` can join the same turn. Kan, the dead and a full party (`MAX_COMPANIONS` = 4) never join. Joining creates a bond if there is none and a fact; parting ends the flag, records "parted ways after N days together (reason)" and takes them out of the scene cast. Death ends it automatically (state tracker, canon, or **Mark as dead**).
- **In every scene**: `castWithCompanions` puts them first in `sceneCast` on every applied diff, presence (`lastSeen`/`lastSeenAt`) is stamped for them, and scene-end memories link them, so they show under Shared memories and in images. The narrator gets a CORE rule (in the cached rules) that anyone under TRAVELLING WITH KAN is present every turn with their own voice and only leaves when the story makes it happen.
- **Bond moves with shared events**: the state tracker is told to give companions a `bonds` entry whenever shared events move their feelings (fighting side by side, being protected, secrets, arguments, betrayal). On top of that, `applySharedScene` runs when a scene ends: `sharedScenes += 1`, and if the story did not move that bond this turn, shared time adds `bondPoints` (1, or 2 after combat/chase); every `BOND_POINTS_PER_STEP` (3) points lift affinity by 1 — never above `SHARED_TIME_AFFINITY_CAP` (+6) and never when affinity is below `SHARED_TIME_AFFINITY_FLOOR` (−2), so time alone builds familiarity but cannot fix real hostility. A bond the story moved resets the points.
- **UI**: Bonds lists companions first under "Travelling with you"; the bond screen shows a chip, how long and why, shared scene count, and **Travel together / Part ways** for corrections (`setTravelling` in `game.tsx`); the Story status sheet lists who is with you.
- Not offered as "A FAMILIAR FACE" (`returning.ts`), since they never left.

### Deaths (`deaths.ts`)

A death lives on the person's own record (`EntityRecord.deceased: { date?, cause?, known?, canonEventId? }`), not only as a fact, so it is never lost to the 10-fact cap.

- **Canon**: a milestone's `deaths` are marked when it fires (`fireMilestone`), stamped with its event id. Kan *knows* once that news is heard (or he witnessed it); until then the bonds screen shows them as before, so news is never spoiled.
- **Story**: the state tracker's `deaths[]` (`character_id`, `cause`) marks anyone who dies on screen, whose body Kan sees, or whose death he is told of — known at once. `revived[]` undoes it for a true return to life (never Edo Tensei) and tags the person `revived` so loading never kills them again.
- **Seeded**: Shisui (known) and Izumi (unknown until told, or until her funeral news arrives).
- **Prompts**: narrator gets `THE DEAD` every turn plus `[DECEASED]` on scene cards and bonds, with the rule that the dead never appear alive; the state tracker sees `deceased` in `KNOWN CHARACTERS`.
- **Effects**: the dead never get `lastSeen` stamped; the bonds screen lists known dead under "The dead"; the bond screen has **Mark as dead / Mark as alive** for corrections (`setCharacterDeceased`).
- `normalizeDeaths` runs in `normalizeDatabase`: older saves get records for canon deaths that already fired.

---

## 7. Canon (`canonData.ts` + `canon.ts`)

Data and logic are separate. `canonData.ts` holds only data; `canon.ts` is the engine and never hard-codes an event.

### Milestone shape (`canonData.ts`)

```ts
{
  id, era, title, description, canonPoint?,
  from: {year, month, day?}, to?: {year, month, day?},
  region?, location?,              // where it happens (defaults: "the shinobi world")
  knowledge?,                      // public (default) | village | akatsuki | witnesses | secret
  bearers?,                        // named confidants, only for secret events
  major?, playerDriven?,
  facts: string[],
  deaths?: string[],               // people it kills, by exact name/alias (marked dead on their record)
  setsStatus?: {name: status},     // status changes by exact name ("Sealed", "Free")
  encounter?: { who, where, context },
  attendanceFact?, opensThreads?, resolvesThreadTitles?
}
```

Everything about one event — when, where, who could know — sits in its one record. The courier tables (`BEARERS_BY_KNOWLEDGE`, `CHANNEL_BY_KNOWLEDGE`, `REGION_CHANNEL`) are also in `canonData.ts`.

- **221 milestones** (124 world events, 97 personal beats; `tobi-joins-akatsuki`, Tobi taking Sasori's ring as Deidara's partner, was added with §8i) from the Uchiha massacre aftermath to Naruto's years as Hokage: the core spine plus Kan’s own beats (Thousand Souls, the Uzumaki blood, the Mangekyō at Izumi’s grave with his own ability and Susanoo, its cost to his eyes, Itachi, the Root hunter Nagi, Akatsuki bonds, Team 3 in every era, and endings) and a living-world layer (village news, the Mist's civil war, every beast hunt with an offer for Kan to join, the four-day Fourth War, and the births and weddings after). Stage 2 added the missing canon events (Kimimaro's illness, Root's last test for Sai, Orochimaru's stopgap body, Jiraiya's reports, Hashirama's history lesson, the post-war Hiden stories, every birth the cast needs), personal beats for the long gaps (the Akatsuki years, the Karin arc, Kan's eyes failing in stages, peacetime, romance and family beats behind the `inRomance` flag) and the canon threads (the Naka Shrine tablet, Shisui's other eye, the Uzumaki masks and Uzushio, the Seven Swordsmen's blades).
- Timeline spine: Kan/Itachi 13 at the massacre; Part 1 at 17–18; Shippuden 20–21; war 22–23.
- `playerDriven` = **personal beat** (join Akatsuki, missions, Team 3 reunions, war side, Edo Itachi, epilogue…). These **never auto-fire**; they fire when the narrator marks them.
- World milestones fire on the **in-story date + prerequisites only** — never on turn counts. There is no per-turn cap: a long time skip fires everything that came due, each stamped with the day it happened (clamped to the save's baseline), not the day the clock caught up.
- **Nothing fires during combat.** `advanceCanon(db, { inCombat })` (default: `state.scenePace` is `combat`/`chase`) does nothing but set `heldForCombat`; `applyStateStep` passes `inCombat = combat/chase pace && !scene_ended`. Everything due fires on the first turn after the fight.
- Windows use the **real calendar** (`daysFromCivil`).

### Scheduling (`advanceCanon` in `canon.ts`)

- `baselineDate` prevents a backlog dump on load/import.
- Milestones whose `to` closed before the baseline are marked completed **silently** (no journal entry) and tracked in `expired`.
- Encounter windows go into `active`; the narrator can resolve them.
- Personal beats appear in the prompt as pending offers with their id.

### Narrator marks (`applyCanonMarks`)

Before they are applied, `filterCanonMarks` (`newsDelivery.ts`) keeps only ids the tracker was shown this turn under CANON TRACKING (`trackedCanonBeats`: the first two active beats and the offered personal beats, from the save the turn started on; `formatCanonTracking` prints the same list). `canon_passed` is accepted only for an active beat. A news id sent as `canon_completed` becomes a `news_relayed` (heard, not witnessed). Everything else is dropped and shown in Debug as a `dropped` event, so a confused reply can never kill someone years early or grant a power.

- `canon_completed` → fire if needed, add `attendanceFact`, mark **witnessed**, record facts/threads/canonPoint.
- `canon_engaged` → record the event, add to `active` + `engaged` (not completed).
- `canon_passed` → complete without attendance, log a “never crossed paths” fact.

### Time skips (`timeSkip.ts`, audit 4.4 and 4.5)

Decided by Xan. A turn may cover a long stretch only when the player asks for it: `requestedSkip` reads "time skip", "skip ahead", "let time pass", "N weeks/months/years later / pass", "train/wait/travel/rest/stay/… for N units", "until spring" (2 days at least). The Story status sheet's **Let time pass** asks how long (a week to 3 years) and what Kan does meanwhile, and sends `*Time passes: 3 months. …*`.

- **Limit** (`skipLimit`): at most 3 years (`MAX_SKIP_SECONDS`), and never past the day before the next personal canon beat opens (`nextPersonalBeat`), so nothing personal is lost by accident. Never in a fight or a chase.
- **Narrator**: a `TIME SKIP` line in the dynamic block (compress the stretch into one reply, say plainly how long passed, end at the first moment that needs Kan; if it stops early, say how long actually passed; the world's news still comes only through people). NARRATION_SYSTEM carries the same rule.
- **Clock** (`allowedSkip` in `applyStateStep`): the skip stands only when the tracker's `time.elapsed` agrees within 25% with what was asked or what was allowed; then `resolveTurnClock({ skipSeconds })` replaces the pace cap. A `mode` event in Debug says how long. The tracker's units now include weeks, months and years (`TIME_UNITS`), read up to 3 years.
- **Catching up**: the rest is the ordinary state step on the new date: `advanceCanon` fires every world milestone in the stretch, lives, letters, rent, weather and ages follow the date, a stretch of 180 days or more queues the `timeSkip` summary, and the news comes as a catch-up report on the following turns.
- **Long jumps** (`guardLongJump`, 4.5): without a requested skip, a jump of more than 36 hours stands only when the prose parser and the tracker agree within 25%; otherwise the tracker's value, capped by pace. With no tracker reply (the prose fallback) the prose alone is used, as before.
- **Corrections** (`correctTurnTime`): the time chip goes up to 3 years. Corrected backwards, `unfireFutureMilestones` takes back world milestones whose date is now ahead (their event, facts, threads, deaths and heard record), so they fire again when the clock gets there.

### Canon protects itself (`canonRoles.ts`)

Decided by Xan: anyone with a canon role still ahead cannot die early. `milestoneNeeds` lists who a milestone needs: its own `needs` when set, otherwise the canon people its title and description name plus its `deaths`, leaving out anyone canon has already killed by then. `canonRoleAhead(db, entity)` is the first not-completed milestone (a closed personal beat doesn't count) that needs them; Kan and original characters never have one.

- A tracker death for someone canon still needs is refused (`applyTurnDiff`; a `refused` event in Debug). Someone already dead is only being learned about, so that report always goes through. **Mark as dead** on the bond page is the player's own override and is not guarded.
- In a fight (combat or chase pace, or fight mode) their card in CHARACTERS IN SCENE carries `[CANON: cannot die here; still needed for "…". If this scene would kill them, they get out alive: …]`.
- Safety net for old saves: when a key actor (named in the title, or killed by it) is already dead in the save, `advanceCanon` skips the milestone (completed and expired) instead of firing it as written.
- A data test checks that every milestone's needs and deaths are alive in canon up to it.

### The reanimated (`deaths.ts`, audit 6.9)

Edo Tensei brings the dead back without making them alive. `EntityRecord.reanimated = { since, by?, until? }`; `isReanimated` is dead with a reanimation that has not ended. They stay dead everywhere (THE DEAD, "The dead" on Bonds), but while it holds they may be in the scene cast, are seen (`recordPresence`; seeing one also makes their death known to Kan), share the scene's memories and move a bond. They never become a companion, and `romanceBlock` refuses any romance with the dead.

- Canon: `reanimates: { names, by }` and `releases: { by?, all?, except? }` on milestones. `edo-dead-march` (Zabuza, Haku, Rasa), `edo-itachi` (Itachi, Nagato), `madara-revived` (Madara) are Kabuto's; `hokage-edo` (the four Hokage) is Orochimaru's. `itachi-izanami` releases everything Kabuto holds except Madara; `war-ends` releases everyone.
- Tracker: `reanimated` / `released` (ids), told in the DEATHS rule.
- Narrator: their card reads `[REANIMATED: dead, here through Edo Tensei; cracked, ash-grey skin like old paper, dark sclera]`; THE DEAD adds "(walking again through Edo Tensei)". The image director's people notes carry the same look.

### News & rumors

- Every fired world event is **unheard** until delivered.
- `unheardCanonNews` returns unheard events, most pressing first: priority = (days waiting + 1) × 4 for major news, × 1 for minor, so fresh major news leads but old minor news is never starved.
- **One piece of news per turn** (`NEWS_PER_TURN`): the narrator and the state tracker are shown only the next unheard item, and `markNewsHeard` accepts only one relay per turn. During combat no news (and no "rumors of what's coming") is offered at all.
- **Catch-up reports** (`newsDelivery.ts`): when Kan has heard no news for `CATCH_UP_QUIET_DAYS` (14) in-story days (`lastNewsHeardDate`, ignoring beats he witnessed) and 2+ events piled up, the offer becomes one report of up to `CATCH_UP_MAX` (4) events (8 after 180 quiet days, as after a time skip) — a bundle of letters at an inn, a companion catching him up over a fire, a stuffed dead drop. Secret and eyewitness news never travels in a bundle. `newsAllowance` lets `markNewsHeard` record that many relays for the turn.
- **What happened, and old small news**: each offered item carries one line of the milestone's description (160 chars), so the narrator tells it as this story dates and shapes it. Minor news more than `STALE_MINOR_NEWS_DAYS` (60) days old never demands its own turn: up to 5 such items ride along as `inPassing` ("Also, in one passing sentence, smaller things you would have heard on any road by now: …") and are marked heard `in passing` once the turn relays any news. Only when nothing else is left does one old minor item come on its own, never overdue. Major, secret and eyewitness news is never folded.
- **Bearers**: anyone in the scene (`sceneCast` + companions, alive) who could plausibly know comes first — anyone for public news, Leaf people for village news, Akatsuki members for Akatsuki news, named confidants for secrets — plus a local in a town or a traveler on a road for public news. Then the fixed `BEARERS_BY_KNOWLEDGE` list (now with Kakuzu, Hidan and Tobi), with the dead, anyone already present, and members outside their tenure removed (`livingBearers`). `BEARER_TENURE` (canonData.ts) ties late joiners to their milestones: Kisame from `kisame-joins`, Deidara from `deidara-recruited`, Hidan from `roster-completes` until `hidan-kakuzu` (buried alive, not dead). The same check stops them knowing Akatsuki news in a scene before they join.
- **Delivery style**: one per turn, picked deterministically (slot + player turn + event) from the place (teahouse gossip, a bounty poster, a merchant grumbling about a closed border, a wounded messenger, a dead drop, a summoned animal…) and the kind of news (Itachi's crow, Zetsu, a ring summons, a Leaf hawk…). Secrets are always face to face; overdue news comes looking for Kan.
- Knowledge classes: `public`, `village`, `akatsuki`, `witnesses`, `secret`.
- Channels: Akatsuki → Itachi’s crow / Konan’s paper butterfly / Zetsu; Leaf → hawk/courier; Sand → caravan; Mist → sailor; Cloud → runner; Stone → stone-route courier; Iron → samurai rider; public → merchant/crier/bounty board.
- **Escalation** (`newsUrgency`, weighted days = days × 4 for major): `due` at 12 weighted days (3 for major, 12 for minor) — bring it in if anything fits; `overdue` at 28 (7 for major, 28 for minor) — deliver it this turn, through the courier channel if nobody present could know. Fresh minor news is offered only if it comes up naturally.
- Secrets (mask identity, Itachi’s illness/truth) only travel via named confidants.
- `news_relayed: [{id, from}]` records delivery (`heard` map), and the Journal hides unheard events.

### Personal letters (`letters.ts`)

- Not canon news: people Kan is close to write about their own lives. Everything is delivered on the page, never as an app notification.
- **Unprompted**: once `LETTER_GAP_DAYS` (21) have passed since the last letter reached Kan (or the story began), the warmest `correspondents` candidate writes: a met, living person with affinity ≥ 5 (or a close/romantic/partner stage), not travelling with Kan, not in the scene, not seen for 10+ days, who has not written in 45 days and has no letter on the road.
- **Kan writes**: `letters_sent: [{to, gist, text, carrier, coded}]` (someone not in the scene) sets out for as long as the distance and carrier take (§8c). When it arrives (`deliverLetters`, every turn): +2 affinity (+1 if they are cold toward him, +1 for a birthday letter), a fact that they received it, and — unless affinity is below −3 — a reply sets out the same way. Interception, real losses, letters to the dead and the archive: §8c.
- **Delivery**: `letterOffer` offers an arrived reply first (it waits while the writer is in the scene), else an unprompted letter; never in combat or during a catch-up report. The carrier fits the writer (Itachi's crow, Hana's ninken, Suzume's Team 3 cipher, Konan's paper butterfly, a Leaf hawk, an Akatsuki dead drop, or a generic courier/bird/dead drop). After 5 days waiting, the offer is pressed. `letters_received: [id]` marks it read and sets `lastLetterIn`.
- The hidden world-clock screen lists letters on the road.

### Canon point

`state.canonPoint` is a short world-state line updated only by milestones that define `canonPoint` (the funeral deliberately does not set it).

---

## 8. Calendar, clock & pacing

### `lib/rpg/clock.ts`

- `applyClockChange(db, state)` applies the turn's `inStoryDate` / `elapsedSeconds` / `clockTime` (the step `resolveTurnClock` already chose) and ages characters without a birth year when the year changes.
- `applyClockTick(db, diff)` keeps `turnsWithoutTimeChange` (prompt nudge only).

### `lib/rpg/calendar.ts`

- `CalendarDate` = year/month/day/hour/minute/second.
- Real month lengths + leap years (`daysInMonth`, `isLeapYear`).
- `daysFromCivil` / `civilFromDays` (proleptic Gregorian).
- `advanceSeconds`, `shiftDate`, `setClock` (rolls to next day when the target time is earlier).
- `daysBetween`, `dateSortValue` (full timestamp sort key), `secondsBetween`, `shiftSeconds` (forward or back), `sameDate`, `isBirthday`.
- `formatElapsed(seconds)` — the reply chip label: `+15 s`, `+2 min`, `+1 h 30 min`, `+2 d 4 h`.
- `calculateAge`, `formatClock` (AM/PM), `formatDate`, `formatShortDate`, `formatDay`, `formatStoryDate`, `timeOfDayOf`.
- `paceCapSeconds(pace, sceneEnded)`:
  - combat 600 s (7200 if scene ends), chase 1800 s (7200),
  - conversation 3600 s, travel 3 days, downtime 7 days, default 1 day.

### `lib/rpg/timeparse.ts`

`detectNarrationTime(text, current)` returns `{ elapsedSeconds, clock?, periodHint?, sleptNight? }`:

- Fixed phrases: heartbeat/instant (2 s), few seconds (5 s), short rest/nap (30 min), seconds of fighting (15 s).
- A (good/full/long) night’s sleep or “slept through the night / until dawn” sets `sleptNight` instead of fixed hours.
- Number + unit (seconds … `years`) only with an elapsed marker, matched as whole words: after the duration (`later`, `pass/passes/passed`, `go by`, `of travel`, `in training`…) or a spending verb before it in the same sentence, past or present tense (`spend/spent`, `walk/walks/walked`, `wait`, `rest`, `sleep`, `march`, `run`, `ride`, `train`, `search`, `take`, `for`). Not when it is a plan, a need, the past or a frequency (`will`, `would`, `need`, `had been`, `in two days`, `every`, `ago`, `of stubble`…). “Hours pass” alone counts as 2 h.
- **No calendar dates are read from prose** (the narrator may not write them; “the first may be a decoy” used to jump to May).
- Named hours are strict: digits (`at 7:30`, `by 3:40 PM`) count alone; a number word needs a suffix (`o'clock`, am/pm, `in the evening`, `at night`), so “at one point” and “watched by two guards” are never times. With no am/pm the hour is the **next occurrence** ahead of the clock (“at 7:00” at 5 PM is 7 PM).
- Period words move the clock only as events: “dawn breaks”, “night falls”, “it is evening now”, “the sun sets”. A bare “until nightfall” / “by morning” is only a `periodHint`, which `resolveTurnClock` uses to accept the tracker’s `clock_time` when it lies within 3 h of that period.
- “The next morning” adds a day, except after midnight and before 7 AM, where it is later the same day.

`applyParsedTime(current, parsed)` applies elapsed then clock (rolling days as needed).

### `lib/rpg/pacing.ts`

- `inferScenePace(text)` keyword fallback: combat → chase → downtime → travel → conversation.
- `PACE_MINIMUM_SECONDS` / `paceMinimumSeconds(pace)`: combat 15 s, chase 1 min, conversation 2 min, downtime 10 min, travel 30 min (no pace → conversation).
- `resolveElapsedSeconds({reportedSeconds, detectedSeconds, pace, sceneEnded})` = what the story says: max(reported, detected) capped by pace.
- `secondsUntilMorning(current)` — seconds to the next 7:00; going to bed after 3 AM sleeps 8 h instead.
- `resolveTurnClock({reportedSeconds, reportedClock, detected, pace, sceneEnded, current})` — the single source of truth used by `applyStateStep`. Returns `{ elapsedSeconds, minimumSeconds, storyTimed }`, where `elapsedSeconds` is the whole forward step:
  - story time (capped) → then a stated hour (parser first, then the state model’s `clock_time`) on the day the story reached, or the next occurrence of that hour; an hour up to 60 min behind the clock is treated as a restatement of “now” and ignored;
  - `sleptNight` jumps to the next morning (or later if the story says so);
  - finally `max(minimum, that step)`, so the clock always moves forward;
  - combat/chase with an unfinished scene: no date jumps, no backward hours, no sleep jump.
- `storyTimed` is false when only the minimum moved the clock; it feeds `turnsWithoutTimeChange`.

### Reply time chip

- `applyStateStep` stores the seconds the turn actually moved the clock on the reply (`rawLog[].elapsedSeconds`).
- Story shows it as a `+2 min` chip under each reply (`TimeChip` in `app/(tabs)/index.tsx`); tapping opens a sheet with presets (15 s … 3 days) and a custom amount in min / hours / days.
- `correctTurnTime(db, logId, seconds)` (`memoryJobs.ts`, exposed as `useGame().correctTurnTime`) shifts the clock — and every later log entry’s `inStoryDate` — by the difference, marks the reply `timeCorrected`, and runs `advanceCanon` when time moved forward.

### Rules

Each turn, time passed = the largest of: what the narrator reports, what the text parser finds, or the minimum for the scene type.

- Minimums: combat ~15 s, chase ~1 min, conversation ~2 min, downtime ~10 min, travel ~30 min.
- Fights can’t skip days (10 min cap, 2 h once the scene ends; no date jumps).
- Travel only skips days when the story says so (capped 3 days per turn); otherwise it moves the 30 min minimum.
- A full night’s sleep jumps to morning.
- A `+N min` chip under each reply; tap it to correct the time for that turn.

---

## 8a. Conversation and fight mode (`lib/rpg/sceneMode.ts`)

Living-world Stage 1. The narrator writes a turn in one of three modes: normal prose, **conversation** (mostly speech, short `*action*` lines, length follows the talk, several voices) or **fight** (what Kan's move does, then the opponent's one specific next move, stopping before it lands; aftermath in normal prose when the fight ends). The rules for each live in `NARRATION_SYSTEM` (SCENE MODES, cached); each turn only gets one `SCENE MODE:` line.

- **Deciding the mode** (`resolveTurnMode(db, input)`, run inside `buildNarrationPrompt`, pure): Kan's input is read by `readKanInput` (speech in quotes, an attack, a fight-back move, a scene-changing move like leaving, following, travelling, sleeping; negated attacks and words inside quotes don't count). Order: chip override `fight`/`normal` → a fight going on (`scenePace` combat or last beat combat, scene not closed) or Kan attacking someone (an attack verb starts a fight only with someone in the scene or a companion, and never for "strike a match" or "kick a pebble") → override `conversation` → Kan's scene-changing move (normal, with `ending: 'conversation'` for a short transition if a talk was on) → conversation once `exchangeStreak >= 2`, or `>= 1` and Kan answers in speech → otherwise normal, **leaning** spoken when a talk has started or Kan speaks to someone present.
- **The beat** (state tracker, BEAT rule): `beat` = exchange (talk, including small moves in place and silences), instruction ("follow me"), remark (a passing line), action (a scene-changing move), travel, combat; `beat_with` = ids of who Kan talks with; `fight_options` = 3-4 short moves (verb first, no pronouns) while the fight goes on. The tracker also sees `SCENE MODE THIS TURN`.
- **After the turn** (`applySceneBeat`, in `applyStateStep`): exchange with overlapping people → streak +1 (people joining make it a group); different people → 1; instruction/remark break an unsettled talk but not a settled one; action/travel/combat/scene end → 0. Without a beat, `fallbackBeat` reads pace, input and quotes. `current` = the mode the reply used.
- **Saved on the reply**: `rawLog[].sceneMode` (set by `game.tsx` when the reply is saved) and `rawLog[].fightOptions` (only while the fight goes on).
- **Clock**: a conversation-mode turn at conversation pace has a 20 s minimum (`CONVERSATION_MODE_MINIMUM_SECONDS`, passed as `minimumSeconds` to `resolveTurnClock`) instead of 2 min. Fights keep the combat rules (15 s, no day skips, nothing fires mid-fight).
- **Chip override** (`setSceneModeOverride`, `useGame().setSceneMode`): Automatic / Conversation / Fight / Normal narration. Forced conversation lasts through travel and ends when a fight starts; forced fight ends when the fight does; normal holds until the current talk or fight is over, then automatic resumes.
- **UI** (Story): a mode chip above the composer, read live from what you are typing (Narration / Conversation / Fight, "· set by you", who it's with, "Talk is building"); tap → sheet with the four choices. While a fight goes on, the reply's fight options show as buttons above the composer; a tap sends `*<move>.*`. Narration renders `*…*` in italics.
- Tests: `scripts/scene-mode.test.ts`.

## 8b. Birthdays, anniversaries and festivals (`lib/rpg/yearly.ts`)

Living-world Stage 2. The narrator gets at most one `THE DAY` line per turn, never in a fight, and each offer at most once a year (`state.yearly.offered`: key → year, set by `applyYearly` in `applyStateStep` from the offer the turn's prompt was built on).

- **Order** (`yearlyCandidates`): Kan's own days first (the massacre anniversary on Oct 1, the Nine-Tails night on Oct 10 that took his parents, Itachi's death, joining the Akatsuki, Kan's own birthday with who might remember it), then a birthday of someone in the scene, then remembrance days of the dead he was close to, then festivals and New Year where he is, then (some years, by hash) a close person's birthday far away.
- **Who Kan knows** (`knowsBirthday`): the people he grew up with (Itachi, Izumi, Shisui, Hana, Suzume), anyone with affinity ≥ 6 or a close relationship, and anyone in `state.yearly.knownBirthdays` (the tracker's `birthdays_learned`). Only those are given as his own knowledge; a stranger whose `BIRTHDAY_HABITS` kind is `announces` or `ritual` can let it slip.
- **Habits** (`yearlyData.ts`): how each notable person treats their birthday (announces, hides, hates, ritual, quiet), including the Akatsuki (Kisame finds it funny, Deidara wants a bang, Sasori doesn't age, Kakuzu asks what it costs, Hidan makes it a ritual).
- **Bonds**: the tracker gets a `THE DAY` line for a present birthday: +1 for remembering it, +2 for a real gift, -1 for letting it pass beside them.
- **Festivals** (`FESTIVALS`): canon (the Leaf's winter Rinne Festival) plus a couple invented per village (`invented`), matched to Kan's location; the Mist keeps its quietly until Mei is Mizukage, Paper Flower Day starts with the Rain stronghold. A leap-day birthday (Kabuto) is kept on Feb 28 in other years.
- **UI**: an "Upcoming birthdays" card on the bonds list (next 30 days) and a "Today" row on the Journal's Now view (`todayNotes`).
- Tests: `scripts/living-world-stage2.test.ts`.

## 8c. People and consequences (living-world Stage 3)

Five systems that build on each other. Each only reaches the narrator when it matters this turn, in a line or two. Tests: `scripts/living-world-stage3.test.ts`.

**Geography** (`geography.ts`): coarse regions (a country or the land around a great village) and shinobi travel days between them, the same numbers as the GEOGRAPHY lore. `regionOf(text)` reads a place; `whereaboutsRegion(entity)` = what the story said (`whereabouts`), else where Kan last saw them, else their home village. Used by letters, rumours and consequences.

**People with their own lives** (`lives.ts`, section 8)
- `advanceLives` (every turn): side characters Kan has met (`isSideCharacter`: original characters, and canon people named in fewer than 3 world milestones, like Hana and Suzume) get a small `world` life event every 60–150 days while he is away: a hard mission, an injury, a posting, a new team, a skill. Romance, moves and promotions are for original characters only, so nothing touches a canon path. Deterministic per save and person; 8 kept each.
- `life_events` (tracker): things the page said about someone's own life are kept as `story` events.
- **Reunions** (`markReunions`, after the state step): meeting someone again after 30+ days apart sets `entity.reunion`. The next narrator turns get a "since you last saw them" note on their character card (`sinceYouLastSaw`, at most 2 per turn): fired canon milestones that name them, their life events since, how the era changed them, and, where canon is silent, room for one small change of the narrator's own (which the tracker then keeps). Those events become `known`.
- A letter can carry news of the writer's life (`newsOfTheirLife`), which marks it known.
- UI: a "Their life" list on the bond page (known events only).

**Better letters** (`letters.ts`, section 9)
- **Travel time** (`letterDays`): shinobi days between Kan's region and the reader's × carrier speed (summon 0.3, bird 0.5, ninken 0.9, by hand 1, courier 1.6, dead drop 1.8) plus a fixed 0–2 day jitter; 3–9 days when either end is unknown.
- **Kan's words** (`tidyLetter`, `keepKansWords`): the tracker passes the letter as written; the app fixes spacing, capitals, "i" → "I" and a closing full stop, never wording or tone. Replies keep the words the narrator gave the writer (`letters_received[].text`).
- **Archive** (`letterArchive`): the Journal's Letters view, newest first, tap to read the whole letter; "Never sent" below. 200 letters with words and 40 without are kept.
- **Interception** (`interceptionRisks`, rolled once per letter): Root reads Leaf letters while Danzō lives (22%, else the Leaf 8%); the Akatsuki (Zetsu) reads letters to Akatsuki members (12%, 18% when Kan's standing is suspected/doubted); a village whose land the reader is in reads it when it lists Kan (6% + rank). Summons ×0.3, dead drops ×0.5, by hand ×0.2, coded ×0.5. An interception plants an `intercepted` consequence; a village sometimes seizes the letter outright.
- **Real losses** (`lossOnTheRoad`, when due): wartime roads (25%), a lost bird / killed courier / cleared dead drop / lost trail (grows with distance), the reader moved on (their region changed since it set out), or the reader died.
- **Letters to the dead**: `unsent`, kept, never delivered, no reply.
- **Birthdays**: someone close and far away who knows Kan's birthday writes for it once a year (`birthdayWriter`); a letter Kan sends within 3 days of a close person's birthday is a birthday letter.
- The world-clock screen shows each letter's carrier, coded, and who read it.

**Rumours, posters and Kan's name** (`renown.ts`, section 10)
- **Deeds** (`recordDeeds`): every `reputation` change the tracker reports is kept as a deed with where, when and whose people saw it (last 40).
- **Epithets**: each audience (the five villages' bingo books, the Akatsuki, the Rain, the underworld) names Kan after the theme its deeds weigh most (12+ weight), never one the player picks. A new theme renames him only when it leads by 25% and the old name has stood 120 days; old names go to `history`. The Leaf's first word on him names him; the underworld picks names up from the bingo books. A name the story gives him (`epithet` from the tracker) sticks for that audience and is `known`. Seeing a bingo book (`bounty_seen`) teaches the village's name.
- **Narrator**: one line in YOUR NAME OUT THERE with what strangers here call him (`localEpithet`, by territory), the wanted-poster line (`posterLine`: where a village lists him at B+; sketch poor at B, fair at A, good at S), and now and then (1 turn in 5, places where people talk) an optional TALK OF YOU rumour (`rumourOffer`): a deed whose news could have reached here by now, close to the truth nearby, grown with distance, a monster story far away.
- UI: "What they call you" on the Journal's World view (known names only); the bingo-book rows show the village's name for him.

**Delayed consequences** (`consequences.ts`, section 11)
- **Seeds**: the tracker's `consequences` (spared, lie, helped, witness, betrayal, humiliated, promise, debt; who, what, want, witnesses, faction, when) plus interceptions. `when` sets when it can first return: weeks (14–41 days), months (45–164, the default), years (300–899); it fades `max(120, 3 × that)` days later.
- **Coming back** (`canReturn`): only once the window opens, only if the person is alive, and only where it is realistic: lies, betrayals, promises and debts face to face (the person in the scene); spared or humiliated people on a road or in a town within 2.5 days of where they are; help repaid in the same region; an Akatsuki interception with an Akatsuki member present. A **witness** doesn't need to find Kan: when the time comes, they talk and that village's heat rises (`advanceConsequences`). Seeds fade when the window closes or the person dies.
- **Offer**: one optional SOMETHING COMES BACK line (`turnConsequenceOffer`), never in a fight, pressed after 90 days eligible; canon figures carry "they stay on their canon path; this changes only how they see you". The tracker marks it `consequences_returned`.
- **No notice**: nothing tells you a choice landed; the people involved simply remember it (the seed, the bond, their point-of-view memory).
- UI: a "Could come back" list on the hidden world-clock screen.

**Point-of-view memories** (`povMemories.ts`, section 12, fix 29)
- No extra call: the scene summary asks for one line per person it mattered to (`povCandidates`: present, alive, not minor, a major bond, |affinity| ≥ 5 or a companion; up to 3), in their voice, to Kan as "you", limited to what they saw or heard. Stored as `EventRecord.povs`.
- The narrator gets each person's latest line on their character card ("remembers of you"). It is their inner view, so it is never shown on the bond page.

**Prompt size**: on a quiet turn nothing new reaches the narrator; the 60-turn token sample settles at about 6,770 (6,670 after Stage 2).

## 8d. The world around Kan (living-world Stage 4)

Tests: `scripts/living-world-stage4.test.ts`.

**Seasons and weather** (`weather.ts`)
- Seasons from the month (Dec–Feb winter …), named as people there would say it (`seasonLabel`): "the rainy season" (June) and "monsoon heat" (July–August) in the Land of Fire, "a deep northern winter" in Iron, "early/mid/late <season>" elsewhere.
- Each region has a `CLIMATES` entry: weights per season (per month for the Fire's rainy season and monsoon), how long spells last, and a note (the Rain: it almost never stops raining; the Mist: the fog rarely lifts; the Wind: scorching days, freezing nights). The Rain is never clear, the desert never snows, Iron and Lightning are snowy in winter.
- `weatherAt(seed, region, date)` is deterministic per save (`meta.slotId`), region and 6-hour block. Spells are walked forward from a fixed anchor every 4 days (2 days of warm-up), each block keeping the last one's weather with the region's persistence (0.78 by default), so neighbouring hours agree and the sky changes about once a day or less. Fog gathers around dawn; summer thunder builds in the afternoon.
- The region is `currentRegion(db)` (`geography.ts`): the one the location names, else the last region on Kan's road, else Fire.
- **Held for the scene** (`state.weather`, `applyWeather` after every state step): a new scene holds the world's weather; the same scene keeps it (up to 12 h). The tracker's `weather` (a few words, only when the prose changes it from WEATHER NOW) is read by `conditionFromText` ("the rain stops" → overcast, "thunder" → storm, "the fog lifts" → clear; a word after no / not / without / never / stopped doesn't count, so "a clear night, no wind" is clear) and holds 8 h in that region, across scenes. Another region always gets its own weather.
- **Narrator**: one WEATHER line after TIME (`formatWeatherLine`): region, season, climate note, the weather at this hour (clear nights, cold desert nights), and by mode: normal → how much slower travel is (`CONDITION_INFO.travel`: rain ×1.25, snow ×1.4, sandstorm ×1.8, blizzard ×2), tracks and scent, footing, feel; fight → footing, sight and sound only; conversation or indoors → just the feel ("outside, steady rain"). A STYLE rule says weather follows that line all scene. About 80 tokens.
- **Tracker**: `WEATHER NOW` in the state prompt, the `weather` field in `TURN_STATE_SCHEMA`.
- UI: the Story header's icon shows the weather (sun/moon when clear); the status sheet has a Weather row.

**The map** (`mapData.ts`, `components/kan/MapSection.tsx`)
- A 100 × 100 board traced after the canon maps (Kakashi's scroll, the Chunin Exam board, the Kage summit map, the fanbook's village page) and the anime's Tea/Sea maps, via the r/Naruto research map. Outlines live in `mapShapes.ts`: every land border is one shared path (`B`), coasts are open paths (`C`), and `ring()` joins them, so neighbours always meet exactly. 21 regions: the canon continent fills y 0-57 (Earth NW, Wind SW, Fire in the middle with a long south-east tongue, Lightning NE, the Water islands E; along Fire's north Waterfall, the Mountain Graveyard peninsula with Iron on its snowy tip, the Sound (id `rice`, once the Rice Fields), Hot Water down the north-east coast, Frost against Lightning; west of Fire Grass north of Rain, then Birds and Silence between Earth and Wind; Rivers a strip to the south coast; Waves an island in the bay south of the Leaf with the Great Naruto Bridge; Whirlpools an island in an east-coast bay; Woods on the coast below it). The south: Tea (crescent plus Nagi and Ouza islands) and the Sea's islands (no dashed "anime-only" line or label any more). `animeOnly` regions get dashed borders. `UNCLAIMED_LAND` is unnamed land (the far east), `BRIDGES` are drawn as lines. `MAP_PLACES`: the great and small villages at their reference spots, the Valley of the End, Tenchi Bridge, Hōzuki Castle (inside Grass), Tanzaku, the Fire Temple, Bamboo Village, the Mountain Graveyard, Iron and the Three Wolf Mountains, the Island Turtle, Loran, Ceramic Village, Hidden Valley and Artisans Village, Nadeshiko, Waves and its bridge, Tea's port and shrines, and the Stage 2 places (Karin's Hidden Grass, Uzushio, the Leaf's `parent: 'leaf'` places). The Land of Silence is placed now (Curtain Village, id `silence`); `unplaced` (listed under "Not on any map you know"): the Land of Snow, the Valley of Lies, the Land of Flowers, the Land of the Moon. **What Kan knows** (audit 6b.2): a place with `secret` (the Hidden Sound, from `otogakure-grows`; the Island Turtle, from `killer-bee-training`) is on the map only once Kan has been there, a reply has named it, or that milestone has happened (`placeKnown`); a note that says more than he knows waits the same way (`placeNote`, `noteFrom`). Far countries show their season, not live weather; notes carry no out-of-world labels. `placeIdOf(location)` matches a place (a shrine in the Leaf beats the Leaf). **Places match only on proper names** (audit 6b.1): "Hidden Rain", "Amegakure", "Land of Rain", or the capitalised short form after "the" (`short`, case-sensitive: "the Rain", never "the rain"); bare common words (rain, stone, mist, leaf, sand, cloud, desert, samurai) never match. `regionOf` follows the same rule (plus town names like Tanzaku and the capitalised "Suna", "Kiri", "Kumo", "Iwa"), and `territoryOf` is read from the region (`TERRITORY_OF_REGION`: fire → leaf, wind → sand, water → mist, lightning → cloud, earth → stone). `territoryHere(db)` falls back to `currentRegion` (the last region on Kan's road) when the location names no place. The board draws one tap layer: `regionAt(x, y)` (point in polygon) picks the country, a place within 2.4 units wins over it; a Zoom button shows a 50 × 50 window around the selection or Kan, and only then draws every place's full name ("Hidden Leaf Village") beside its dot (`placeNameSpot`: below, or `nameAt` above/right/left where neighbours crowd). Country labels are full names on two lines (`labelLines`: "Land of" small above the name).
- The geography (`geography.ts` ROADS, 21 regions) and the narrator's GEOGRAPHY lore (`GEOGRAPHY_LORE` in `seed.ts`) follow the same layout: Whirlpools 2 days from Fire and 2.5 by boat to the Mist, Waves 2 days south, Frost 1.5 days past Hot Water and 2.5 to Lightning, Grass 1.5 days to the Waterfall, the Graveyard 2.5 days (1 from the Sound, 1.5 to Iron), Iron 3.5, Tea 2.5, Silence 4.5 (Shikamaru's three days without rest), Birds 1.5 west of Rain. `normalizeDatabase` swaps an older save's GEOGRAPHY lore entry for the current text on load; `formatLore` never cuts the GEOGRAPHY entry short (3,600 characters, other always-on lore 1,400).
- **Kan's road** (`state.travelLog`, `recordTravel` after every state step): each new location once, with its region (a place that names none stays in the last one) and map place; 400 kept. Older saves start the road where Kan is (`normalizeTravelLog`). `routePoints` draws it; `placeVisits` counts visits (a shrine counts for its village too).
- **Travel times** (`travelEstimate`): `travelDaysBetween` from Kan's region, and the same in the worse weather of the two ends.
- **Where people are, as far as Kan knows** (`knownWhereabouts`): met, non-minor people; companions are with him; otherwise what the story said (`whereabouts`, "told"), else where he last saw them (`lastSeenAt`, "seen", with how long ago), else where they would usually be (role or village tags, "assumed"). Someone who died without Kan knowing is still shown where he thinks they are; once he knows, they leave the map. It is never the truth the save holds.
- UI: Kan tab → **Map** (fourth switch). You are here (place, country, weather, season, companions), the board (countries you've been to tinted, your road as a red dashed line, white dots for places you've been, a red dot for you, a count of people you know of per country; tap a country or a place), the selected card (note, travel time, weather, visits, places inside, who is there as far as you know → bond page), everyone by country, and your road (newest first, 12 then "Show all"). Your places and former places (§8g) sit under the selected card.

**The scrapbook** (`scrapbook.ts`, `components/kan/ScrapbookView.tsx`)
- Read from the story log, nothing stored twice: every assistant reply with an `image`, oldest first, grouped by era (`eraOfDate`: the era of the last world milestone that had begun by then, never moving backwards) and chapter (title from `state.chapters` or the current chapter).
- Each photo: the caption (`imageMeta.caption`, written in second person by the same call that writes the image's action line; older images use the reply's first sentence, which the narrator already writes as "you"; the third-person action line is never rewritten into a caption), the in-story date and time, Kan's age, and where he was (`placeAt`, from the road).
- UI: Kan tab → Journal → **Scrapbook**: era headers with counts (era names from inside the world, `eraTitle`: "The new generation" for Part 1, "The hunt for the beasts" for Shippuden; the narrator sees the same), chapter titles, a three-column grid; tap for a full view with caption, date, age and place, and earlier/later buttons.

**Prompt size**: one WEATHER line (~80 tokens) per narrator turn, and two short lines in the state prompt; nothing else new.

## 8e. Ambient sound (living-world Stage 5)

Tests: `scripts/ambience.test.ts`.

Ambience only: no music, no stingers, no recordings. Every sound is synthesised live with Web Audio from noise and oscillators, so nothing is downloaded or licensed, nothing ships with the install, and no loop ever repeats. Web only; on native the player does nothing. The narrator's and the tracker's prompts are untouched.

**The mix** (`lib/rpg/ambience.ts`, pure)
- `ambienceInputOf(db)` reads what the app already tracks: the scene's weather (`currentWeather`, so a held or story-set weather sounds the same as it reads), the time of day and hour, the season, the region, the location kind (`locationKindOf`), the location text (place names localized to English; the scene title is ignored) and its map place (`placeIdOf`), and whether the scene is in fight mode.
- `ambienceMix(input)` returns a level 0–1 for each of 20 beds, plus `indoors` and `fight`:
  - Weather: `rain-light`, `rain-heavy` (by intensity; drizzle → downpour), `rain-roof` (instead of rain when indoors), `storm` (thunder rolls every 18–45 s), `wind-light` (a little wind on roads and in the open even on calm days), `wind-strong` (wind, storms, blizzards, sandstorms), `wind-high` (mountains, passes, cliffs; blizzards), `snow-quiet`.
  - Life: `forest-day` (birds: louder at dawn, fewer in winter, rain, fog and on roads, gone in heavy rain), `forest-night` (crickets and an owl; evenings fade between the two; no insects in winter), `cicadas` (summer afternoons in Fire, Rice, Hot Water and Waves). Never in the desert.
  - Water, tied to places known to have it: the Naka River (river), the Valley of the End and the Hidden Waterfall (waterfall; the village gets it quieter), the Land of Waterfalls' wilds (streams), the coast, Uzushio, the Great Naruto Bridge and the Mist, and the island regions (sea). Elsewhere only when the location names a river, stream, lake, sea, coast or falls.
  - People and places: `village` (street voices, footsteps, wood knocks; markets, ports and festivals louder, nights near silent, heavy weather empties the street), `murmur` (inside an inn, teahouse, tavern or bathhouse), `room` (room tone), `fire` (a hearth, fireplace or campfire, or a camp in the wilds at evening and night), `cave` (dripping stone with an echo).
- **Indoors** (`isIndoors`): the location's own words (room, inn, house, hut, tent, hideout, hall… vs courtyard, street, roof of…), else a `structure` kind. Caves count. Indoors, outside beds drop (wind ×0.35, life ×0.3 or nothing in a cave, water ×0.45) and go through a low-pass.
- **Fight mode** adds nothing and changes no bed: it only sets `fight`, and the player lowers everything to 30 %. The weather stays.
- `key` is a stable string of the mix; the player ignores a new mix with the same key, so a quiet turn changes nothing.
- A flashback (§8f): `currentAmbience` reads `flashbackView(db)`, the memory's date, place and weather, so it never touches the present scene.

**The player** (`lib/audio/`)
- `synth.ts`: the 20 bed builders, three 7-second stereo noise buffers (white, pink, brown; seams cross-faded) made once, and small helpers: steady filtered noise layers, `drifter` (wanders a gain or a filter frequency), `striker` (struck noise for raindrops, crackles, footsteps, one envelope at a time per voice), `tone` (bird notes, bubbles, drips, hoots, a cup set down). Events are scheduled 0.6 s ahead by each bed's `tick`. **Only linear and exponential ramps are chained**, never `setTargetAtTime` (implementations disagree on chained targets), and every parameter is anchored with `setValueAtTime` when made.
- `ambienceEngine.ts` (`AmbienceEngine`, one per app): bed → bed gain → outdoor bus (low-pass, 18 kHz outside → 650 Hz indoors) or indoor bus → fight duck → volume → speakers. A mix change glides every bed to its new level over 4 s (`CROSSFADE_SECONDS`), so place, weather and time of day crossfade, never cut. Levels are squared for loudness and evened out by `BED_TRIM`. A bed silent for 10 s is stopped to save battery. The volume curve is squared too.
- `AmbiencePlayer.tsx` (mounted in `app/_layout.tsx` inside `GameProvider`, renders nothing): builds the audio graph on the first tap or key press (browsers require one), feeds `currentAmbience(db)` whenever the save changes, pauses at once when the app goes to the background (`visibilitychange`, `pagehide`) and resumes when it comes back.
- `ambienceSettings.ts`: on/off and volume (default on, 60 %), kept on the device in AsyncStorage (`kan.ambience.v1`), not in a save, so every story shares them.
- Levels were checked by rendering each bed offline (40 s): all finite and unclipped, roughly −22 dB (waterfall) to −36 dB (room tone) RMS at full level.

UI: Settings → **Sound**: Ambience switch (its line says what's playing now, e.g. "Now: rain on the roof, a quiet room, voices") and a Volume slider (`components/Slider.tsx`) that changes the sound live while dragging.

## 8f. Playable flashbacks (`lib/rpg/flashbacks.ts`, `flashbackData.ts`)

Living-world section 19. Eighteen short scenes from Kan's life before the story (ages 0–13), from the first day with Itachi and Shisui to the fight days before the massacre. Offered, never requested; each plays once. Tests: `scripts/flashbacks.test.ts`.

**Data** (`FLASHBACKS`): id, number, title, date, place and location kind, cast (entity names), the scene, notes on how people were then, a trigger hint, triggers (`people` in the scene, `places` by map id or words, `dates` of the year, `beats` reached in the last 7 days, `words` in the present scene, `afterFight`), what is fixed, what must stay hidden, `requires` (Shisui's last night waits for `shisui-truth`), a one-line memory and its importance. Team 3 flashbacks sit between graduation (9) and ANBU (12). Kan's parents, Erisa Uchiha and Banri Uzumaki (`KAN_PARENTS`), are not in the canon cast: `ensureFlashbackPeople` adds them, dead and met, the first time a memory needs them.

**Offer** (`flashbackOffer`, inside `buildNarrationPrompt`): never while one plays or waits, never in a fight, a chase or on the road (pace downtime or conversation only), never on a turn with a grudge, hunter or other pressure, not before story turn 12 or in the story's first 3 days, and at most once per 30 in-story days (`lastOfferOn`). Each record scores the moment (date or beat 3, place or person 2, words 2, or 1 + 1 after a fight for the `afterFight` ones; people and words only count after a fight there); 2 is enough, the highest wins. A date trigger fits within 2 days of its day; a world beat counts from the day Kan heard it. The narrator gets one optional `A MEMORY` line (let one small trigger touch Kan, don't start the memory); `game.tsx` stamps the reply with `flashbackOffer`.

**Taking it**: the state step marks the offer (`applyFlashbackMarks`): the month gap starts either way; if the tracker says `flashback: "offered"` (the reply showed the trigger), it waits as `pending` for 2 turns and the reply gets a **Remember** chip. Tapping it calls `sendTurn(REMEMBER_INPUT, { remember: id })`, which runs `beginFlashback` on the snapshot it saves (so Undo undoes it) and narrates that turn inside the memory. Kan can also follow it in his own words: the tracker's `"started"` begins it from the next turn. Regenerate re-enters a memory the regenerated turn stepped into.

**Playing**: `state.flashbacks.active` holds the memory's own clock, place, kind, weather, turn count, cast, bond nudges, and the present pace and scene mode to put back. Both story entries of a memory turn carry `flashback: { id, date }`.
- Narrator (`formatFlashbackBlock` instead of the present's dynamic block: no state, news, letters, canon, pressure, encounters): the memory's date and Kan's age, WHERE, its WEATHER line (`formatWeatherLine(flashbackView(db))`), KAN THEN (`kanThen(age)`: a child, an Academy student, a Team 3 genin, an ANBU boy; no Sharingan; his real strength stays hidden; present jutsu, abilities and inventory don't exist there), who is there at their age then (`entityAge` on the memory's date; the dead marked alive here), fixed facts, the hidden list (plus how Shisui died until `shisui-truth`), pacing by turn (begin → play → from turn 6 look for the end → from turn 9 end it this reply, carrying Kan back to the same second), and THE PRESENT frozen with its last line. RECENT SCENE shows the present lead-in and this memory's turns (`getRecentMessages`). Fight mode works; its line leaves out the present's wounds.
- Tracker: THIS TURN IS A MEMORY (report the memory's time and place, who is in it, the dead included, bonds −1..1, everything else empty; `"ended"` when it closes), CURRENT STATE and TIME from the memory, no canon/letters/yearly/enemy tracking.
- State step (`applyMemoryStep` → `applyFlashbackTurn`): `resolveTurnClock` on the memory's clock; place, kind, weather (`conditionFromText`), cast and bond nudges kept on `active`; scene beat and fight options as usual. Nothing in the present moves: clock, location, inventory, jutsu, facts, threads, deaths, canon, letters, travel log, held weather. Memory turns are never chapter material (`unsummarizedStory`, `storyMessagesSinceLastSummary` skip them) and carry no time chip.
- Header, ambience and images read `flashbackView(db)`: the memory's date, place and weather, so `state.weather` and `state.travelLog` are never touched. The Story header shows "Memory · Year 5 · …".

**Ending** (`endFlashback`, on the tracker's `"ended"`, or forced after `FLASHBACK_HARD_CAP` = 12 turns): an `EventRecord` dated on the memory's date, tagged `flashback` + its id, `present`-linked to everyone in it; each living person's bond moves by the sum of its nudges capped at ±1; the id goes to `played`; the present's pace and mode come back; `returned` gives the next present turn one `BACK FROM A MEMORY` line (same second, how it ended, never retold) and is cleared after it. A `flashback` memory job (`runSummaryJob` → `summarizeScene` with a memory note) writes it up: `applyFlashbackWriteUp` puts the MEMORY line on the event and keeps point-of-view lines from the living people in it. In the present, memories show as "(from Year N, before the story)" in RELEVANT MEMORIES; a remembrance day names one lived with the dead.

**UI** (Story): memory turns in a muted warm tint (`colors.memory*`), opened by a date line ("Team 3  Year 9, Sep 20. You are nine."); the Remember chip under the reply that showed the trigger; the live reply is tinted while it streams. Journal → Memories lists it under its own past date. Scrapbook: flashback photos go in "Before the story", grouped by memory title, with the memory's date, place and Kan's age. Images of a memory send no outfit references and tell the model Kan's age and look then (`kanLookAt`) and everyone's age then, in a faded warm tint.

**Prompt size**: nothing on a quiet turn; one line on an offer turn; the memory block replaces the present's dynamic block while one plays.

## 8g. Safehouses (`lib/rpg/safehouses.ts`)

Living-world section 20. Any place Kan stays can become a safehouse by itself, and it goes when it stops working. Tests: `scripts/safehouses.test.ts`.

**Data** (`state.safehouses`): `places` (active and ended; 16 active, 24 former kept) and `current` (the one Kan is at). Each `Safehouse`: id (`sh_…`), name, kind, place (the location when it became his), region, map place, since, lastVisit, nights, `until` (rented), host (borrowed), `knownBy` (entity ids) and `knownGroups` ("the Akatsuki", "the innkeeper", "Root"), stash, upgrades (name + date), residents, `compromised`, `raided` (`lost`, `seen`), status, `ended` (reason + note).

**Kinds**: `own` (a place he takes or builds; lasts until lost), `rented` (an inn or teahouse room; check-out at 10 AM after the last paid night), `borrowed` (someone's home; ends when Kan knows the host died, or the host's grudge is known or they are an enemy), `base` (an organisation's place he belongs to, like an Akatsuki hideout or an army's camp; his room, not his secret: it never plants a found seed). **Belonging** (`belongsTo`): Kan's newest active membership fact naming the owner (`OWNER_KEYS`; "left", "defected", "missing-nin"… mean out); with none, the Akatsuki counts once `kan-joins-akatsuki` is done or while an Akatsuki member travels with him (Itachi before he joins); an owner the words don't name gets the benefit of the doubt; every other owner needs a fact. A base he doesn't belong to: the tracker's tag makes it `borrowed` with the owner as host ("a guest of the Hidden Leaf"; ends when the tracker says withdrawn), an untagged guess makes nothing (a prisoner, an intruder). A base ends `withdrawn` ("you no longer belong to …") once he no longer belongs and has left it. The Akatsuki knowing their own hideout he's a guest in is never a found seed, `camp` (a night in the wild: open ground, a cave, ruins, or an abandoned hut; `campCover` reads which from the place and its name: `cave`, `ruin`, `walls` or `open`).

**Becoming one** (`applySafehouses`, after the consequences in the present state step; never in a fight; never in a flashback):
- The tracker's `safehouse` (schema object, all fields nullable): `id` (a listed one, also when Kan comes back to it in other words), `name`, `kind`, `paid_nights`, `host`, `stored` / `taken`, `upgrade`, `shown_to`, `residents_joined` / `residents_left`, `ended` (expired, destroyed, compromised, withdrawn, given-up). The tracker sees `SAFEHOUSES` (the list with ids, Kan's marked, stashes) and the rule, every present turn (~300 tokens).
- A night's rest without a tag still makes one when the place says what it is: an inn word → rented for one night; an Akatsuki hideout, or an organisation's camp ("the Akatsuki field camp", "a Leaf army camp", "the Allied Forces camp", an encampment) → base, its owner read from the words (`baseOwner`: the Akatsuki, the Allied Shinobi Forces, Root, a village…); a camp of strangers (refugees, merchants, a caravan, bandits) → camp; wilderness or road, wild words, caves and ruins → camp. "Camp" alone only makes a camp outside a settlement or a building. "Rest" here is 5+ hours of `downtime` pace, never a long day of travel. A place made on a rest turn dates from when Kan lay down.
- Where Kan is: the tracker's id, else `matchesSafehouse` (same place text, its name in the location, or 2+ shared words; a different region never matches).
- Leaving a camp ends it (`left`) unless it has upgrades; resting again at the same spot within 60 days brings it back as `own`. A second stay at a camp, or any upgrade there, makes it `own`.
- Everyone in the scene learns where he stays; `shown_to` adds people or groups.

**Its course** (`advanceSafehouses`, every present turn): a rented room past its time ends `expired` once Kan isn't in it (still in it: the line says the innkeeper wants more; `paid_nights` again extends it); a borrowed place ends `withdrawn`; the dead leave `residents`; residents get `whereabouts` = the place while Kan is away (so the map, letters and lives see them there). Overgrown (`isOvergrown`): own, borrowed or base places not visited in 730 days.

**Being found**: someone added to who knows with a reason to come after Kan plants a `found` consequence (`plantSeed`, `when: weeks`, `safehouseId`): a grudge, an enemy or affinity ≤ −10, a Root agent, an Akatsuki member (own or borrowed places only, unless affinity ≥ 10), Root / village groups whose book lists him, or hunter-nin and trackers. It comes back (`canReturn`) only while Kan is at that place, through the usual SOMETHING COMES BACK offer; when the tracker marks it returned, the place is `compromised`. If Kan is away 7+ days after its time comes, they search it instead: the stash goes (`raided.lost`), the place is compromised, and Kan only sees it when he is back (`raided.seen`; until then the Places list shows the old stash).

**Rest** (`restQuality`): safe (own, borrowed, base) heals injuries 2 extra days per night (`restAt`, Kan's injuries only); rough (camp, rented, nowhere) is the ordinary rest; unsafe (compromised) means he may not sleep: `applyTurnDiff` doesn't end the "until rest" conditions there (`restBlocked`).

**Stash**: `stored` items leave the inventory under their inventory name (fuzzy match), `taken` items come back through `addItems`; 30 kept.

**Inventory** (`inventory.ts`): `inventory_added` / `inventory_removed` match loosely (`sameItem`: case, plurals, leading words like "the"), and counts are read in front ("3 kunai") or behind ("Shuriken (10)", "Kunai pouch (6 kunai)"): added counts merge, a removal lowers the count (a bare "kunai" is one) and the item goes at zero (a pouch stays, empty). The list holds 40 (`INVENTORY_LIMIT`); past that the oldest item drops, never the forehead protector, the Akatsuki cloak or a ring (`isPinnedItem`).

**Narrator**: one `SAFEHOUSE (where you are)` line after WEATHER: name, kind, since, who knows, the rented time, stash, upgrades, residents, a search Kan finds, compromised, overgrown, shelter (walls keep the weather out; a camp by its cover: rock overhead but cold and damp in a cave, half a shelter in ruins, walls of a sort in a hut, no roof in the open) and how sleep goes there. `SAFEHOUSE (where you are heading)` when Kan's words head back to one (its name, or "the safehouse/home/my place" with one fitting place). Otherwise only `Places you can go back to: …` in CURRENT STATE (names, up to 4, no camps). Nothing on a story with none.

**Letters**: a writer who knows the place Kan is at (not a camp, not compromised; `letterAddress`): the letter offer says it may have waited for him there.

**Ambience**: `ambienceInputOf` adds `shelter` (the kind) and reads the place's name with the location ("the cave above the falls" gets the cave and the falls); any kind but a camp counts as indoors unless the words say outside. A camp sounds like its cover: a cave is indoors (dripping stone, rain only beyond the mouth through the filter), a hut is indoors (room tone, rain on the roof), ruins stay outdoors but half-sheltered (rain ×0.6 plus some on what's left of the roof and wet-stone drips, wind through the gaps when it isn't pouring, fewer birds, never the street; ruins with no place of Kan's in them sound the same), the open is open. Every camp gets the fire at evening and night.

**UI** (Kan tab → Map): squares on the board for active places (hollow for camps); **Your places** (kind, country, "You are here" or last there, paid until / paid time ran out, Found, Overgrown; place, who knows, living there, stashed, built up, searched while you were away) and **Former places** (what happened and when; 5 then "Show all").

**Prompt size**: nothing on a quiet turn without places; one CURRENT STATE line (~20 tokens) while he has some; the SAFEHOUSE line (~90 tokens) only at or heading to one. The tracker's SAFEHOUSES block (~300 tokens) is in every present tracker prompt.

## 8h. Money (`lib/rpg/money.ts`)

Kan's own money, in ryō. Tests: `scripts/money.test.ts`.

**Data** (`state.purse`): `ryo` (never below 0), `history` (the last 40 changes: date, signed change, reason, `counted` when a stated total set it), `estimatedStart` (an older save: the amount is the starting guess). New stories start with `STARTING_RYO` (4,000: what was in Kan's pouch the night he left the Leaf); older saves get the same amount marked as a guess.

**Tracker**: `money: [{ amount, reason }]` for every change to Kan's own money on the page (negative when he pays, loses, gives away or is robbed; positive when he is paid, given, finds, wins or takes it), and `money_counted` only when the prose states his exact total. Someone else paying for him changes nothing; money only talked about hasn't moved; money is never an inventory item. With no amount in the prose, it estimates from `PRICE_GUIDE`. `readRyo` accepts numbers and strings ("-1,200 ryō", "−300"); zeros are dropped, 6 changes a turn at most.

**Applying** (`applyPurse`, in the present state step just before the safehouses; never in a flashback, whose turns go through `applyMemoryStep`): changes in order, a payment larger than the purse pays what he has; then a stated total sets the count (a `counted` entry for the difference) and clears `estimatedStart`.

**Narrator**: `Purse: 4,000 ryō` in CURRENT STATE (both prompts), with "(nearly empty)" under 1,000 and "(empty: …)" at 0. The CORE rule: he can't pay more than he has (the seller says he is short), say how much whenever money changes hands, someone else may pay; `PRICE_GUIDE` follows it in the cached rules (meals 300-800, a cheap inn 2,000-5,000 a night, kunai 200, mission pay D 5,000-50,000 up to S 1,000,000+, in scale with the bingo-book bounties).

**UI** (Kan tab → Journal → Now): **Your purse**: how it feels ("Enough for the road", "A small fortune"…) with the total, the note on a guessed start, and the changes newest first (4, then "Show all").

**Prompt size**: one CURRENT STATE line (~8 tokens) in both prompts; the rule and prices (~170 tokens) sit in the cached system blocks.

## 8i. Names Kan knows (`lib/rpg/names.ts`, `nameData.ts`)

The narrator and the UI only call someone by a name Kan has actually learned. Strangers are described by how they look until they give their name, someone else says it, a letter or document shows it, or Kan recognises them because they are famous. Tests: `scripts/names.test.ts`.

**Data, per person** (`EntityRecord`):
- `known?: { label?, given?, family?, identities?, history? }` — what Kan knows. **Missing means he knows the name** (older saves, and anyone the story introduced by name); `{}` means nothing yet. `history` (last 12): which name, part, how (`introduced`, `told`, `written`, `overheard`, `recognised`, `news`) and when.
- `nameParts?` (worked out from the name when missing; `NAME_PARTS` for the exceptions: Karin → given Karin, family Uzumaki, full "Karin Uzumaki"; Might Guy, Rock Lee, Gekko Hayate family-first).
- `identities?` (seeded from `IDENTITIES`): `{ name, kind: 'true'|'claimed'|'persona', learnedWith?, knownBy?: [{ who, from?, on?, playsAlong?, note? }], publicFrom?, existsFrom?, renamed?, alias?: false, note? }`.
- `unnamed?: true` — a stranger the story hasn't named: `name` is their label until `names_learned` gives one (then the record, its bond and the scene cast take the name).
- `state.namesVersion` (1): set on new saves and on load (`ensureNames`).

**The display name** (`displayName`, used by every screen and every text the app writes): the best identity Kan knows (true > claimed > persona; a claimed one reads `renamed.name` once that milestone has reached him), else the parts he has heard in canon order (given only "Karin"; both "Karin Uzumaki"; family only "Uzumaki"), else his label. `BondRecord.characterName` is no longer shown. `alsoKnownAs` gives the other names he has learned ("Also known as" on the bond screen); `searchableNames` is all the bonds search and the merge sheet match, so a hidden name never finds or spoils anyone.

**Labels**: `LABELS` for the people whose look would make a poor one or give a name away (Tobi "the masked man", Pain "the pierced man", Karin "the red-haired girl", the tailed beasts, the summons), otherwise built from age, gender and the first feature in their appearance ("the girl with pink hair"). `ensureLabels` stores one for everyone present Kan can't name, unique on the bonds list (`uniqueLabel` adds the place, then a number).

**At the start** (`KNOWN_AT_START`, applied by `castEntity`): Itachi, Team 3 and Suzume, his parents, the Uchiha he grew up with, the Hokage and the council, his ANBU colleagues by their ANBU names (Yamato is **Tenzo**), the Leaf ninja a thirteen-year-old ANBU would know, the Sannin, Naruto, and the Nine-Tails by that name. Everyone else in the cast starts `known: {}`.

**Older saves** (`ensureNames`, when `namesVersion` is missing): everyone already met keeps their name; unmet cast members start from `KNOWN_AT_START`; met people with identities know the identities already on their record (Tobi stays "Tobi"), plus any whose milestone has reached Kan; `hiddenAliases` are dropped. Loading twice changes nothing.

**People with more than one identity** (`IDENTITIES`):
- **Tobi**: persona "Tobi" (exists from `tobi-joins-akatsuki`, known by the Akatsuki then), claimed "Madara Uchiha" (Itachi, Kisame, Pain, Konan and Zetsu from the start; Sasuke, Karin, Suigetsu and Jūgo from `masked-man-truth`; Kabuto from `kabuto-pact`, knowing he is not the real Madara; the Kage and Mifune at `kage-summit`, and the whole world from then; renamed **Masked Madara** once `madara-revived` has happened), true "Obito Uchiha" (Zetsu from the start, playing along; the real Madara from `madara-revived`; Kakashi, Naruto, Guy and Bee at `obito-unmasked`, then everyone). Kan learns Madara with `masked-man-audience` (or from Itachi, via the tracker), Tobi with the news of `tobi-joins-akatsuki` or by meeting the act, Obito at `obito-unmasked`. So he usually reads masked man → Madara Uchiha (Tobi as an alias) → Masked Madara → Obito Uchiha; meeting the act first reads Tobi → Madara.
- **Pain** (persona; the true Nagato Uzumaki, learned at `pain-assault`), **Sasori** (Hiruko the puppet), **Yamato** (Tenzo true, Yamato public from `sai-yamato`, Kinoe for Danzo), the **Nine-Tails** (Kurama at `naruto-joins-war`), **Kabuto** (one name with a narrator-only secret: Orochimaru's spy, once Sasori's).
- `nameKnownBy(db, person, viewer)`: what one person calls them (Deidara "Tobi", Itachi "Madara Uchiha"; someone who plays along uses the name he goes by). Kan's own telling is the tracker's `names_told` (`applyNamesTold`): a dated `knownBy` entry and a secret fact.
- `identityLine` (on the card in CHARACTERS IN SCENE): the truth for the narrator only, the identity in use this scene (the persona whenever anyone who only knows it is present; the claimed name when alone with those who know it; the true name once public), the two voices for Tobi (high, cheerful, third person, pestering Deidara / low, cold, controlled), the note that Kan knows the act is a mask, and what each person present knows him as.

**Recognising the famous** (`FAME`, `fameOf`): `sight` (the Sannin, the Kage in their robes, the dead Hokage, the real Madara, Kisame, Zabuza, the Seven Swordsmen, Hanzō, Leaf faces from his ANBU years), `heard` (Kakuzu, Sasori, Bee, Chiyo, Mifune; Deidara from `deidara-recruited`), or unknown. It follows the date: Gaara is `sight` from `gaara-kage`, Mei from `mei-mizukage`, Naruto from `pain-assault`; Pain is never recognisable. `recogniseOnSight` teaches a `sight` person's name the moment they are in the scene cast; `heard` people are named on their card ("he has heard the name but doesn't know the face") and need the tracker's `recognised` or an introduction.

**Turn flow** (`applyNameStep`, in `applyStateStep` right after the canon advances, on the turn's `sceneCastIds`): the tracker's `names_learned` → `names_told` → recognition on sight → names said aloud (backup: a present person's own, unshared name inside quoted dialogue counts as overheard; a shared name like "Madara" is left to the tracker) → identities from canon news (`learnFromCanon`) → labels. All silent: no notice, as in life.

**The narrator**: the NAMES rules in `NARRATION_SYSTEM` (cached). CHARACTERS IN SCENE is built from the people actually present (`state.sceneCast`) plus names in the text, since a label never matches: each card leads with the name Kan knows, or `label [narrator only: Name]`, then "Kan knows them as …" / "call them "…" every time", and `identityLine` for people with identities. BONDS, THE DEAD (people Kan never knew are marked "unknown to Kan"), ELSEWHERE, TRAVELLING WITH KAN, news bearers, letters, grudges, the familiar face, birthdays, and the names in facts all go through `displayName` / `narratorName`. Summaries, the image action and scrapbook captions are told to name people only as Kan knew them.

**The state tracker**: KNOWN CHARACTERS lists every identity ("identities: Tobi (persona), Madara Uchiha (claimed), Obito Uchiha (true)"); CHARACTERS IN THIS TURN says "you know them as …" or "you don't know their name (you see "…")". The NAMES rule in `STATE_SYSTEM`: `names_learned: [{character_id, name, part: given|family|full|identity, how}]` only for a name spoken, written or recognised within Kan's hearing or reading; `names_told: [{character_id, name, told_to}]`; `new_characters[].name_known: false` adds a stranger under a label; every text it writes uses the names Kan knew at that moment.

**App-written lines** (audit 6b.2) name people as Kan knows them: the safehouse lines (`whoKnows`, `residentNames`, "X died", "X turned on you"), the letter interception line, the grudge styles (`narratorName`) and the grudge thread title, the "something comes back" line, the summariser's POINTS OF VIEW (`povInstruction` with `displayName`; `resolvePovs` reads those names back), and the Jutsu list's users and "from …" natures.

**Leak check**: `nameLeaks` lists names the narration used outside quotes that Kan can't know yet (whole, capitalised words; known names of other people excluded). They are shown on the turn in Settings → Debug ("Names Kan couldn't know yet…"), and `scrubNameLeaks` replaces them in the saved prose with the label Kan knows (outside quotation marks, capitalised at a sentence start), logged as an event.

**Prompt size**: about 180 tokens more in the narrator prompt in the test save (the NAMES rules, cached, and the "unknown to Kan" marks on THE DEAD), plus one or two lines per person on the scene cards; the tracker's rules grow by about 250 tokens (cached).

## 9. Encounter realism (`lib/rpg/encounters.ts`)

- `classifyLocation(text)` uses first-mentioned place word → `settlement | road | wilderness | structure`.
- `state.locationKind` is preferred when set by the diff.
- Risk matrix:
  - settlement: high day, medium evening, low night
  - road: medium day, low evening, very-low night
  - wilderness: low day, none evening/night
  - structure: low day, none night
- `formatEncounterConditions(db)` adds a one-line crowd/time line with the clock (`ENCOUNTER CONDITIONS: wilderness, night (10:00 PM) — isolated …`). The narrator decides from that and the STYLE rule; there is no roll.

### Characters who come back (`lib/rpg/returning.ts`)

- Every character records `lastSeen` **and** `lastSeenAt` (the `state.location` at the time) when they are present or updated (`recordPresence`, `applyEntityDiff`; merges keep the place that goes with the newer date).
- Candidates: original characters only (no `canon` tag, not a `CANON_CAST` name, not Kan), met, alive, not in the scene cast, not named in the recent scene, and unseen for at least `RETURN_MIN_DAYS_AWAY` (14) in-story days.
- Fit to the current place, strongest first: last seen here (a distinctive place word in `lastSeenAt` matches the current location, after English place names) → role/notes tie them to this place → a travelling role (merchant, courier, mercenary, wanderer…) while Kan is on a road or in a town. No fit, no offer. A bond adds weight, a major bond more.
- Cadence: one offer turn per `RETURN_WINDOW_TURNS` (8) player turns, picked by a hash of slot + window, never before turn 6, never in combat/chase, never where `encounterRisk` is `none`. The pick rotates among the top three. Everything is deterministic, so a regenerated turn gets the same offer; once someone resurfaces, their `lastSeen` resets and they leave the pool.
- The block is optional for the narrator: use them only if it fits; if used, they are the turn's encounter.

### 9b. Reputation & bounty hunters (`lib/rpg/reputation.ts`)

- **Bingo books**: each great village keeps a `heat` (0-100). The tracker's `reputation: [{faction, change, reason}]` moves it (one move per faction per turn, clamped to −15..+25) when that village's people saw Kan and lived, he hurt or killed its people, or worked openly in its land. At `LIST_HEAT` (15) he is listed; ranks C 15 / B 35 / A 60 / S 85; bounty `heat² × 6000` ryō rounded to 100k (≈1.4M C, 7M B, 22M A, 43M+ S).
- **Cooling**: after `COOL_AFTER_DAYS` (60) without a new deed, −1 heat per `COOL_DAYS_PER_POINT` (20) days, computed lazily (`currentHeat`) and baked in on the next change. A listed entry never drops below 15 and is never removed.
- **The Leaf**: `ensureLeafListing` (every turn, inside `applyReputationChanges`) writes Kan into the Leaf's book at B-rank (40) once the clock passes the morning after the massacre night (`LEAF_LISTS_ON`, Year 13 · 2 Oct 06:00). Older saves get it on their next turn.
- **What Kan knows**: entries start `known: false`. `bounty_seen: [village]` (a poster, a hunter naming his price, someone telling him) marks one known and shows a news-strip notice. The narrator always sees every entry (so strangers react honestly) plus a line saying which ones Kan has not seen; the Kan tab shows only known ones.
- **Akatsuki standing** (−100..100, `akatsuki` faction, usually ±10): bands suspected / doubted / unproven / trusted / valued. Shown to the narrator only once `kan-joins-akatsuki` is completed.
- **YOUR NAME OUT THERE** (narrator, after ENCOUNTER CONDITIONS): `territoryHere(db)` picks the great village whose land Kan is in (or none for small countries); one line on how its shinobi would react by rank, other villages that want him, civilians (wanted posters only at S), the Akatsuki cloak (feared by everyone from Year 17, by hunter-nin and the underworld before), and the standing line. Skipped where `encounterRisk` is `none`, except the standing line. Recognition needs a good look and someone who would know.
- **A PRICE ON YOUR HEAD (optional)**: `hunterOffer` — one possible turn per `HUNTER_WINDOW_TURNS` (10), never before turn 8, only on roads and in towns, never in combat or empty places, only if Kan is listed somewhere; the chance per window rises with the top rank (C ¼ … S always). Hunter-nin only on their own village's land. Deterministic per slot + window.
- **One pressure per turn**: the prompt takes a due grudge first, else a bounty hunter, else A FAMILIAR FACE (`formatPressure` in `prompt.ts`).

---

## 10. Romance & lore (`lib/rpg/romance.ts`)

- `RelationshipStage`: stranger → friendly → close → romantic interest → partner / rejected.
- `Attraction`: none | warm | strong.
- `normalizeRelationship` / `normalizeAttraction` tolerate model wording.
- `CHARACTER_LORE` holds canon devotions, accessibility (`winnable` / `lore-locked`) and orientation.
- `ERA_NOTES` gives era-specific personality lines keyed by year (`eraKeyForYear`, `eraNoteFor`).
- `ROMANCE_RULES` is injected into the narrator system prompt.
- **Canon-bound hearts** (`canonEndgame.ts`): a winnable heart with `canonEndgame: { partner, from }` (Temari→Shikamaru 24/10, Ino→Sai 25/3, Karui→Choji 25/6) can truly be with Kan, but canon wins. Her scene card says so (`endgameNote`); in the last `ENDGAME_LEAD_MONTHS` (18) it tells the narrator to let it end naturally. From the date, `applyCanonEndgames` (after every turn, canon advance and time correction) turns `partner` into `ex` (relationship stage added for this), cools an unbegun `romantic interest` to `close` and `strong` attraction to `warm`, and stamps the romanceNote; the story cannot set her back. If the canon partner is dead, nothing is forced.
- Bonds store relationship/attraction/romanceNote; a rejection stays until the narrator moves it on (never from affinity alone); a winnable heart that rejected Kan can slowly change its mind over time.
- Adult NPCs deflect while Kan is under 17; explicit intimacy only when both are 18+; the prompt instructs **never to censor** when ages permit.

### 10a. Grudges (`lib/rpg/grudges.ts`)

The dark mirror of romance: slow, earned, lasting.

- **Start**: a bond diff that leaves affinity at or below `GRUDGE_AFFINITY` (−6), or the tracker's `grudges: [{character_id, event: 'wronged', reason}]` (Kan kills or maims someone they love, betrays, humiliates or ruins them; creates a bond if there is none). Opens a `grudge` thread (`<name>'s grudge against you`) and a fact.
- **Heat** (0-100): starts at 30 + 5 per point below −6 (45 for `wronged`; +25 for a further `wronged`); a negative bond move adds 4 per point, a positive one removes 5; left alone it stews +1 per `STEW_DAYS` (10), up to +20 since it last moved (`grudgeHeat`).
- **Stage**: resentful < 40 ≤ vengeful < 70 ≤ hunting. Only original characters can hunt; canon characters (`isOriginalCharacter` false) stop at vengeful and act within their canon path — the mirror of lore-locked hearts.
- **Strikes**: `grudgeOffer` offers one vengeful/hunting grudge (not a companion, not in the scene, not mid-fight) once `STRIKE_GAP_DAYS` passed since the last strike (vengeful 30, hunting 14): on one turn in five, or every turn once `STRIKE_PRESS_DAYS` (10) overdue. The style is deterministic per turn: hunting → ambush (at night in towns), trap, hired blades, signs they are close, or — after a failed strike — a threat against someone Kan cares about; vengeful → his movements sold, a message, paid blades, or them turning up if this place is on their path. `struck` records `lastStrike`.
- **End**: the bond climbing back to `LET_GO_AFFINITY` (−2) → let go; `settled` (a reckoning they accept) or `forgiven` from the tracker; death. Each resolves the thread; all but death add a fact.
- Prompts: `GRUDGE_RULES` (ENEMIES) sits in the narrator rules; BONDS shows `[grudge: stage, reason]`; the state prompt gets REPUTATION & GRUDGES (field rules + the offered grudge's id).
- UI: Bonds → "Your name out there" card (known listings, Akatsuki standing bar), a "Want you to pay" group with a red stage tag; the bond screen shows a Grudge card.

---

## 11. Image pipeline (`lib/rpg/image.ts`, `imageDirection.ts`, `paintScene.ts`, `referenceImages.ts`)

Goal: wide, cinematic anime key frames, not evenly lit mid-shots. `paintScene.ts` runs a scene image start to finish; the Story screen only shows the results.

- Three static references: `kan-face-sheet.jpg`, `kan-outfit-black.jpg`, `kan-outfit-akatsuki.jpg`, plus at most **one** earlier scene image, for rendering style and line quality only, and only when the new shot type matches the last image's (`usePreviousForStyle`), so compositions don't converge.
- **Model capabilities (`imageCaps.ts`, `fetchImageModelCaps`)**: when an image model is picked in Settings, the app reads `GET /api/v1/images/models/{id}/endpoints` and keeps only what *every* endpoint accepts (enum values intersected, ranges narrowed), falling back to the model-level summary. Saved as `settings.imageModelCaps` (`maxReferences` from `input_references.max`) and re-checked when stale or when the model changes. Settings shows a line under Images ("Takes up to N reference images…", red when 0).
- `buildImageRequestBody(caps, …)` sends only accepted fields: `resolution` 1K, `aspect_ratio` (always 16:9 for scenes; closest allowed ratio if not offered), `quality`, `output_format` jpeg/webp + `output_compression`, and at most `maxReferences` references. On a 400/422 it retries once with just prompt + the same references; it never drops references silently.
- **The director (`writeImageAction`)**: on every tap, one call on `settings.imageDirectorModel` (Settings → Advanced → Image director; defaults to the narrator model) at temperature 0.75, falling back to the memory model at 0.5. It picks the most dramatic instant and returns `ACTION:` (who does what to whom, ≤45 words, ≤80 for ensembles), `SHOT:` (shot type, angle, lens, composition, focal person, peak emotion, light and effects) and `CAPTION:` (second person, for the scrapbook), read by `parseImageAction` (missing SHOT is fine; no labels = all action). `directorContext` gives it the reply, Kan's last input, location, outfit, cast with their mood and `currentLook`, `state.mood`, the time and weather, the `visual` of any recorded jutsu named this turn, canon art direction, "This is a key moment: go big" when the reply was `imageWorthy`, a forced shot from a chip, the last 3 shots (variety tracker), and "no impact frame" when one was used among the last five images. Logged in Debug as "Image director". Falls back to the last 700 chars of narration if both calls fail.
- **The prompt (`buildSceneImagePrompt(db, references, action, { shot, shotType })`)**, vision first, rules after: style opener (a widescreen Naruto Shippuden key frame; an inverted 2–3 tone opener for impact frames) → SHOT → ACTION → ART DIRECTION → `Jutsu on screen: <name> — <visual>` → `lightLine` (light from the clock hour: dawn, noon, golden hour, night, lamplight indoors; weather from `currentWeather` or the memory's own; a colour accent from the scene's words — never hard-coded rain) → location → Kan's look/outfit → look tags for the others → reference labels (all **identity only**: copy face, hair, eyes, clothing; ignore pose, expression, framing, lighting, background) → rules (actor rule, who may appear, ensemble focus, compose for 16:9, no text). No `Timeline:` or `Scene:` lines.
- **Shot types (`imageDirection.ts`)**: `shotTypeOf` reads the type from the SHOT line's opening words. Wide / extreme wide / aerial are scale shots: tiny distant faceless figures, rooftops and armies are allowed; only unnamed recognisable faces stay banned. The type is stored as `imageMeta.shot` / `shotType`.
- **Ensembles**: an ensemble shot (or the Ensemble chip) takes up to 10 people from `sceneCast` (5 otherwise). People slots = the model's `maxReferences` minus Kan's face and outfit (`personReferenceSlots`). `sceneCharacterReferences(db, action, limit, originalsFirst)` spends slots on original characters first (`isCanonCharacter`: the canon cast plus Itachi, Hana, Izumi, Suzume), since the model knows the canon cast; every canon person named gets a look tag from `appearance` / `currentLook` (and age). When there are more people than slots, `castSheet.ts` draws up to six faces side by side on one canvas with their names baked in and sends it as one `cast` reference ("left to right …"); without a canvas (native) they go one per slot. The director has five ensemble layouts (line-up, battle lines, circle, depth layers, clash) and always names one focal person.
- **Canon art direction (#13)**: `CanonMilestone.artDirection` (Itachi vs Sasuke, Pain's assault, the war's start, the tailed-beast sealings) and the massacre night when Kan is in the Uchiha district. `canonArtDirection` uses it while Kan has taken on that beat, or for two days after it happened where he is.
- **Swapped-roles check (`imageCheck.ts`, #14)**: after each image (Settings → Check images, on by default) a vision call on the director model asks whether the actor is the one doing it and whether extra people appear. Reversed roles → one retry with `sharperActorRule`; if that is wrong too the better one is kept and flagged (`imageMeta.mightBeOff`, a toast). Logged in Debug as "Image check".
- **Shot chips and two takes**: tap Paint for Auto; long-press it for Auto · Close-up · Jutsu · Impact · Epic wide · Ensemble · Aftermath and the Two takes switch (`settings.imageTwoTakes`, off by default; also in Settings). Two takes paints both, checks both, and lets you keep one. A reply the state tracker flagged `image_worthy` (stamped on its log entry as `imageWorthy`) shows a glowing "Paint this".
- **Retouch (#12)**: in the fullscreen viewer, Retouch opens a one-line field; `retouchSceneImage` sends the image (as an `edit` reference, first) and Kan's face with `Edit this image: <tweak>. Keep everything else the same…`. The new version shows with Keep / Discard; keeping it stores `imageMeta.tweak` and `previous` (the old image).
- `referencePlan.ts` `planReferences` order: **edit → face → outfit → character / cast → previous → alternate**, cut at the model's limit, so Kan's face is the last to go. If the face can't be sent the player gets a warning toast (`faceDroppedWarning`), and the prompt describes Kan in words instead.
- Portraits (`PortraitHeader.tsx`) use the same caps and plan: face → outfit → previous portrait.
- Images are generated **only when the player taps Paint**.
- **Storage (`imageStore.ts`)**: images never live in the save. `storeImage` writes the data URI to IndexedDB (`kan-images`) and returns a short `img:<id>` reference that goes into `rawLog[].image` / `portraits[].image`. `loadImage` / `useStoredImage` resolve references (in-memory cache). On load, switch and import, `externalizeImages` migrates any inline data URIs from older saves. Export inlines images again (`inlineImages`) so save files stay self-contained. Without IndexedDB, `storeImage` returns the data URI unchanged.
- **Portraits (`portrait.ts`)**: `portraitSignature(db)` reduces Kan to age, outfit (Akatsuki cloak in inventory), a coarse expression bucket from `state.mood`, and a setting bucket from `locationKind`. `portraitStaleReason(latest, current)` says why the latest portrait is outdated (outfit → age → expression → setting) or returns null. `buildPortraitPrompt` asks for a 3:4 head-and-shoulders portrait using the face sheet, the current outfit and the previous portrait as references. Portraits are generated only from the Kan tab's Refresh button and stored in `db.portraits` (last 24).
- **Character portraits (`characterPortrait.ts`, `components/kan/CharacterPortraitCard.tsx`)**: portraits of people in your bonds, painted only from the Paint/Repaint button at the top of their bond page. `characterPortraitSignature(db, entity)` = age (frozen at death), expression bucket from `entity.mood`, and `entity.appearance`; `characterPortraitStaleReason` checks face reference added → age → appearance → expression (the dead never go stale otherwise). `buildCharacterPortraitPrompt` sends a 3:4 head-and-shoulders request with references face → previous portrait of that person; without a face reference it asks for the canon design if they are a Naruto character, else follows the appearance text. Stored in `db.characterPortraits` (last `PORTRAITS_PER_CHARACTER` = 4 per person, each with `usedFace`). **Face references** (`db.characterFaces`, one per person) are images the player chooses (`pickImageFile` in `file.ts`, scaled to 768px JPEG) — nothing is fetched from the web and nothing ships in the repo; they live in IndexedDB like every other image and are inlined on export. `mergeEntityPair` moves portraits and the face reference to the person kept (`moveCharacterImages`). The bonds list shows the latest portrait in each avatar circle.

---

## 12. UI

- `app/_layout.tsx` — fonts (Manrope), navigation, GameProvider, toasts, Android nav bar.
Three tabs: **Story / Kan / Settings** (the Kan tab switches Bonds / Jutsu / Journal / Map). All list screens use the shared kit in `components/List.tsx` (`SectionLabel`, `ListCard`, `ListRow`, `FilterPills`, `Segmented`) and the type tokens in `constants/theme.ts` (`sectionLabel`, `rowTitle` 15 bold, `rowBody` 13, `rowMeta` 12, `prose` 16) — use them for new screens instead of one-off styles.

- `app/(tabs)/index.tsx` — Story: narration as plain prose, Kan's turns as tinted blocks (`*actions*` italic), header with clock/date/location (tap → status sheet with mood, date, scene), news strip, a `+N min` time chip under each reply (tap to correct), Image / Retry / Undo under the latest reply (Retry and Undo only when a snapshot exists), the send button turning into Stop while narrating, single-row composer with `"` and `*` markers, fullscreen image viewer.
- `app/(tabs)/kan.tsx` — Kan hub: `components/kan/PortraitHeader.tsx` (current portrait, outdated reason, Refresh, history strip) plus a sticky Bonds / Jutsu / Journal / Map switch.
  - `BondsSection.tsx` — search + compact rows (people you have met; unmet canon cast is hidden) (avatar — their latest portrait when painted, name, Major tag, affinity bar, relationship · last seen), sorted by most recent contact; rows open `app/(tabs)/bond/[id].tsx` (portrait with Paint/Repaint and face reference, bond meter, chips, mood/personality/speech/appearance, shared memories, Merge with…).
  - **Only what Kan could know** (`lib/rpg/disclosure.ts`): the bond meter and list bar show *your* feelings (`yourFeelings`); theirs only as a word ("Toward you they seem warm", `howTheySeem`), with no note, attraction chip or romance note. Mood shows only while they are with you; otherwise "Last you saw them" with the date. A grudge (bond page, list label, enemies group, Journal thread) shows only once they have struck (`grudgeKnown`). Profile fields and portrait prompts use `shownField`: canon secrets in the seed (Sasori inside Hiruko, Tobi, Kabuto the spy, Minato and Kushina as Naruto's parents, Yagura's genjutsu…) show a version Kan could know until the milestone in `DISCLOSURES` is known; text the story itself wrote shows as it is. The narrator still gets everything. The bingo-book card never hints at listings you haven't seen. Tests: `scripts/immersion.test.ts`.
  - `MapSection.tsx` — the map (§8d) and your places (§8g).
  - `JutsuSection.tsx` — jutsu grouped by chakra nature; rows expand for appearance and notes.
  - `JournalSection.tsx` — Now (scene, missions, goals, threads), Recap (timeline of summaries, falls back to recent events), World (heard canon news with source, world state, lore), Memories (events with people), Letters, Scrapbook (§8d). Rows use an event's own `title` when it has one (`memoryTitle`); otherwise `titleAndBody` (`util.ts`) splits the text: "Title: …", a first sentence under 90 characters, or the first words cut at a word boundary with the rest kept as the description. Recap titles come from `summary.title`.
- `app/(tabs)/world-clock.tsx` — hidden **World clock** (Settings → Debug panel → World clock, marked as spoilers; the Story header's long-press no longer opens it; `href: null`, no tab). Read-only view of `worldClock(db)`: running/held-for-combat status, not heard yet (next in line first), due-but-waiting, queued with dates and days until, personal moments open to you, fired (with who told you), and missed beats. Contains spoilers by design.
- `app/(tabs)/settings.tsx` — Narrator (key status that expands into the editor, Story and Images models, Advanced: summary + memory models), Sound (ambience switch and volume, §8e), World (canon toggle), Stories (slots with a ⋯ menu: play, copy, rename, delete; New story), Export / Import, Debug, version and credit.
- `components/settings/DebugPanel.tsx` — Settings → Debug. For each of the last 30 turns: the exact messages the narrator saw (newest 5 only; copyable), the state step's status, raw reply, applied diff and a field-by-field list of what changed in the save, and every call the turn made (narrator, state, summaries, images) with billed tokens, thinking/cached tokens, time and cost. The state step also shows **events** (`DebugEvent`, `debugEvents.ts`): what the engine did on its own (fallback, mode, refused, merged, dropped, retry, violation), each with a coloured tag. Pure steps return them (`StateStepResult.events`); the game context records them.

### Debug log (`lib/rpg/debug.ts`)

- Lives outside the save, in its own IndexedDB store (`kan-debug`), so it never costs save quota or travels with an export. Memory only where IndexedDB is missing.
- A turn is opened with a temporary id when the prompt is built and re-keyed to the narrator reply's log id once saved; background steps (state retries, summaries) record against `job.turnLogId`, so their spend lands on the turn that caused it.
- Costs are never estimated. Every chat request sends `usage: { include: true }`; `CallUsage.cost` comes from the reply, or from `GET /api/v1/generation?id=` when the reply had none. A `+` after a total means a call reported no cost.
- `describeStateChange(before, after)` diffs the save around `applyStateStep` (skips rawLog, snapshots, indices, meta, settings, memoryJobs).

---

## 13. Invariants (do not break these)

1. **Never control Kan.** The narrator stops when the player must act.
2. **The narrator writes prose only.** Never add JSON, field names or canon ids to the narrator prompt; state comes from the separate structured state call. `stripNarrationJson` / `streamingPreview` remain as safety nets. JSON must never appear in the chat.
3. **Canon truth**: no invented canon event, funeral, death or date; only milestones/news/facts count.
4. **Time always moves, by the largest of** the narrator’s report, the narration parser, or the scene-type minimum (combat 15 s, chase 1 min, conversation 2 min — 20 s in conversation mode, downtime 10 min, travel 30 min). Every advance goes through `resolveTurnClock`, never forward-only hacks elsewhere; the player can correct any turn from its time chip.
5. **Combat cannot skip days** around the player; the cap is enforced in `resolveTurnClock`.
6. **Names Kan knows** (§8i): narration, the UI and every text the app writes use `displayName`; a name Kan hasn't learned is shown only as a narrator-only truth, and search finds only known names. Tobi's true name stays unknown to Kan until the mask breaks (or he learns it in the story); the real Madara is separate.
7. **Pain/Nagato** are one entity; six paths are one.
8. **Unheard canon events are invisible in the Journal** until delivered.
9. **Personal beats are offers**, never assumed; they only complete when narrated.
10. **Token ceiling**: prompts over `settings.promptTokenBudget` are trimmed; never add unbounded prompt data. Keep the rules and slow blocks first so the cached prefix survives.
11. **Images only on user action**, with Kan’s face/outfit references and the action brief.
12. **Version sync**: `package.json` → `app.json` → SW cache (`scripts/generate-sw.js`) → Settings display.
13. **A flashback never moves the present**: its turns change only `state.flashbacks.active`; the present's clock, place, inventory, jutsu, facts, canon and weather stand still, and its turns stay out of chapter summaries.
14. **A safehouse comes from the story**: the tracker tags it (or a night's downtime at an inn, a camp or an Akatsuki hideout makes one); upgrades, stash moves and endings only come from what the page shows, never a menu. Its line reaches the narrator only when Kan is at one or heading to one.

---

## 13b. Save-analysis fixes (Nov 2026)

How the fixes from the save-analysis list work, and where they live. Tests: `scripts/fixlist-memory.test.ts` (5–8), `fixlist-people.test.ts` (10–14), `fixlist-world.test.ts` (15–21), `fixlist-story.test.ts` (22–28), `met-and-memories.test.ts` (1–4).

- **One clock** (`correctTurnTime`, `shiftDatesAfter` in calendar.ts): correcting a turn's length shifts every in-story date stamped after the turn began, anywhere in the save.
- **Fact lifecycle** (facts.ts): the state tracker sees `ACTIVE FACTS` with refs (`f-xxxxxx`) and can `supersedes` / `facts_ended` them; a new fact overtakes a matching "does not know yet"; `lasts` gives conditions `untilRest` and injuries/plans an `expiresAt`; `expireFacts` runs every turn (rest = 5+ hours outside a fight). `whoKnows` holds entity ids, `whoKnowsGroups` group tags; claims are `confidence: 'claimed'` with `claimedBy`; every fact has a subject and a `sourceEventId` or `sourceLogId`. The prompt budget cuts memories, then facts and lore, before recent story.
- **Lore conditions** (lore.ts): `activeAfter` / `activeUntil` with a milestone, thread status, fact text or flag (`hasSharingan`, `knowsIzumiDead`, `headbandScratched`…); `always` entries (geography) are always sent. Seed lore is in second person.
- **Milestone stages** (canon.ts): offered → accepted (`canon_engaged`, nothing written) → completed (`canon_completed`, the moment in `completesWhen`): only completion writes facts (real date, subject, who was there), opens threads and grants jutsu/abilities. `requires` gates a beat (the Mangekyō waits until you know Izumi died).
- **Chapters** (`applyChapterBreak` in memoryJobs.ts): summaries never end chapters. A chapter opens on `chapter_title`, a completed major milestone or a 2+ day skip, once the chapter has 6 turns or 12 hours (60 turns closes one anyway). `state.chapterTitle`, `chapterStart`, `chapters`.
- **People**: `gender` on everyone; men are `romanceAccessibility: 'not-applicable'`, Kan has none; new people from `gender` + `attracted_to`. `tier: 'minor'` people get no bond until a second scene. `appearance` is the lasting base look, `currentLook` the look of the moment (cleared by a new scene or rest), `whereabouts` where someone absent is.
- **The bond guard** (`bondGuard.ts`, applied in `applyTurnDiff` before `applyBondDiff`; refusals go to Debug as `refused` events): a turn moves `affinity_change` / `your_change` at most ±3 (±5 when the turn plants a consequence, records a death, or ends a scene of importance 5). The relationship climbs the ladder stranger → acquaintance → friendly → close → romantic interest → lover one rung per scene (`stepSceneSeq`); going down or sideways (teammate, partner, mentor, student, rival, enemy, family, old friend, rejected, ex) is free, and a sideways label climbs from its rung. A romantic stage is refused (`romanceBlock`) for men, lore-locked hearts, a settled canon endgame, and an adult while Kan is under 17; "lover" needs "romantic interest" held 30 in-story days (`romanticSince`). Attraction rises one level per scene and never where romance is blocked.
- **Bonds**: `theirFeelings` (mirrors `affinity`/`note`, kept in step by `syncBondSides`) and `yourFeelings` (`your_change`, `your_note`). Relationship labels are fixed; `partner` is an Akatsuki partner, romance is `lover`. A bond reads "Deceased · …" once you know of the death.
- **Kan's sheet**: `player.natures` (innate / Thousand Souls) and `player.abilities` (stage + history), from `natures_gained` / `abilities_changed`; shown on the Kan tab.
- **Threads**: matched on normalized titles and wording before opening; casing kept; `participantIds`, `sourceEventId`, `sourceLogId`. Story hooks (hooks.ts) open and close Izumi's grave, Survive Kakuzu and the bingo-book thread by condition.
- **Narrator**: exact time and earliest end time, FIGURES ALREADY SAID, ELSEWHERE, VARIETY (question endings, repeated motifs, settled decisions), geography, inventory rule.
- **Images**: WebP recompression (imageCompress.ts) and binary IndexedDB storage; `imageMeta` on scene images; export with or without images; older chat images load on tap; portrait painting lock (`beginPainting`) and duplicate guard.
- **Undo**: snapshots (last 5) survive saves and hold no images; restore takes images from the live save.

## 14. How to extend safely

### Add a canon milestone
Add an object to `CORE_MILESTONES` or `WORLD_EXPANSION` in `canonData.ts` (the exported `CANON_MILESTONES` is sorted by opening date, which is the prerequisite order; give same-day events distinct days when one must come first), with a real date window, `region`/`location`, `knowledge` (+ `bearers` if secret), facts, optional encounter, and `playerDriven` if it depends on Kan. Personal beats can set `priority` (always offered while open), `after` (offered only once another beat has happened) and `grantsJutsu` (signature jutsu Kan gains when it happens). No engine change is needed. Add a test that it opens on the right day.

### Add a canon cast member
Add an entry to `BASE_CAST` in `canonCast.ts` or `CAST_ADDITIONS` in `canonCastMore.ts` (name, aliases without common words or another person's names, a birthday — canon, or a chosen one with `birthdayInvented: true` — birthYear counted from Kan's birth — 17 minus their Part I age — role at year 13, `status: 'Deceased'` if dead by then, `appearsWith` if they only enter the story with a milestone, and their name in `FEMALE_CAST` if she is a woman) and a matching `CHARACTER_LORE` entry in `romance.ts` (the tests require both). Existing saves pick them up on next load.

### Add a character’s lore/heart
Add to `CHARACTER_LORE` (devotion, accessibility, orientation) and optionally `ERA_NOTES`.

### Change pacing
Edit `paceCapSeconds` in `calendar.ts` and `inferScenePace` in `pacing.ts`. Update tests.

### Add a prompt block
Add a `formatX` function and insert it into the `buildDynamic` array. Keep it short and capped; respect the token guard.

### Add a state field
`types.ts` → `db.normalizeState` default → `TURN_STATE_SCHEMA` (stateSchema.ts; add the key to `properties`, it is auto-required) + a rule line in `STATE_SYSTEM` → `convertStateBlock` (`stateBlock.ts`) → the matching apply function (`services.ts` `applyStateDiff`, or `entities/bonds/facts/clock.ts`) → tests.

---

## 15. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Clock only moving by minutes | The story gave no time cue, so only the pace minimum applied. Check the narrator's TIME rules, `time` in the state reply, `scene_pace`, and `detectNarrationTime`; the player can fix a turn from its time chip. |
| Date jumps during a fight | `resolveTurnClock` / `pace` not applied; check `scene_pace`. |
| Too many / too few strangers | Check the STYLE encounter rule in `NARRATION_SYSTEM` and `formatEncounterConditions` / `classifyLocation`. |
| Old acquaintances never come back | `returning.ts`: they need `lastSeenAt` (older saves only have role/notes and the traveller rule), 14+ days away, and a place fit; offers come once per 8 turns. |
| Canon events not appearing | Check `canonProgress.completed` and the hidden World clock screen. World milestones need their date plus every earlier world milestone, and nothing fires mid-fight. Personal beats need state-call marks — check `CANON TRACKING` in the state prompt. |
| Canon event visible too early | Journal only shows `heard` events; check `heard` map and `normalizeDatabase` migration. |
| JSON text in chat | Something put JSON back into the narrator prompt. Safety nets: `streamingPreview` (live), `stripNarrationJson` (save + render). Run tests. |
| Wrong characters in images | The ACTION line is written fresh on tap by `writeImageAction` (memory model); cast comes from `sceneCast`. Check Settings → Debug → Image description. |
| Prompt tokens growing | Budget guard trims recent messages; check `formatFacts`/canon caps. |
| Save quota error | Slots should be in IndexedDB — check `slotBackend()`. On the AsyncStorage fallback `saveSlot` trims images/snapshots; clearing old slots helps. |
| Need to see what really happened | Settings → Debug: prompt, state diff, tokens and cost per turn. |
| PWA stale | Bump version so `generate-sw.js` changes the cache name; rebuild. |

---

## 16. Test coverage map (`scripts/verify-pipeline.test.ts`)

- Save compatibility & normalization
- Slot storage (`scripts/slot-store.test.ts`): IndexedDB backend, localStorage migration, newer-copy-wins, long stories past the localStorage cap, AsyncStorage fallback
- JSON stripping (fenced, truncated, unfenced, labels)
- Identity resolution (Tobi and his unlearned Obito, real Madara, Pain and Nagato, Zetsu, descriptions never matching)
- Meeting and shared memories (`scripts/met-and-memories.test.ts`): mentioned-only stays unmet with no bond, the scene cast meets people, "the masked man" about Kakuzu leaves Tobi alone, a failed state reply meets no one, everyone in the room shares a memory, memories never span two scenes, the bond page drops mentioned-only links
- Duplicate characters (canon cast seeding and migration, ID roster in the state prompt, `is_new` gate, ID resolution, manual merge, whole-word name mentions)
- Time parsing and clock arithmetic (seconds/minutes/days, leap years, month lengths)
- Pacing caps and combat date blocking
- Canon dataset (unique ids, ordered windows, secret events have bearers)
- Canon scheduling (baseline, real dates, personal vs world, passed/completed, news/heard, couriers)
- Romance persistence and lore era notes
- Image brief/cast/action rules
- Prompt composition (blocks, dedupe, no dice roll / style guard, encounter conditions, budget)
- Companions (state reply → diff, always in the scene cast, shared-scene bond steps, cap and hostility floor, parting and death, new person joining, party limit, both prompts, reload and merge)
- Characters who come back (original-only pool, place fit, travellers, cadence, no offers in fights or empty places, `lastSeenAt` recording)
- Reputation & grudges (`scripts/enemies.test.ts`): Leaf listing timing, heat → rank/bounty, per-turn clamp, cooling floor, `bounty_seen`, territory lines, empty places, Akatsuki standing, hunter cadence; grudges from soured bonds and `wronged`, stewing, canon hunt cap, due/pressed/combat/in-scene offers, `struck`, let go / settled / death, schema and reload
- Token stability over 60 turns
- Scene modes (`scripts/scene-mode.test.ts`): input reading, instruction never flips it, lean then settle, small actions stay in, remark carries, leaving ends with a transition, group talk, 20 s conversation turns, attack → fight with options, ambush → fight, options cleared when it ends, overrides and their clearing, reload, prompt and schema
- Living-world Stage 4 (`scripts/living-world-stage4.test.ts`): season names, deterministic weather, the Rain never clear / northern winters snowy / no desert snow / Fire's wet summer / the Mist's fog, spell length, the scene lock and new scenes, other regions, story weather and how long it holds, the narrator line by mode and indoors, the tracker field, old saves; map places and matching, the road (regions inherited, no repeats), visits, travel estimates in weather, whereabouts as Kan knows them (told, seen, unknown deaths, companions); eras, the scrapbook's grouping and captions; prompt size
- Living-world Stage 3 (`scripts/living-world-stage3.test.ts`): geography and whereabouts, letter travel time by distance and carrier, Kan's words kept and tidied, the archive, letters to the dead, Root and Akatsuki interception and safer carriers, interception seeds, real losses, birthday letters, side characters' lives (canon-safe), reunion notes, life events from the page and from letters, epithets per audience (growth, renaming, story names, bingo books), posters and distorted rumours, consequence seeds (window, crossing paths, lies face to face, witnesses talking, fading, offers, returned, the remember notice), point-of-view memories, quiet-turn prompt size
- Living-world Stage 2 (`scripts/living-world-stage2.test.ts`): the 67 new people, birthday fixes and backfill, the unborn / real Madara / Kaguya arriving with their milestones, every canon death landing on someone, beasts and children never romance, the shorter tracker roster, the new milestones' order, the Karin arc, the eyes and Shisui threads, the yearly offers (present, unknown, learned, once a year, anniversaries, remembrance, festivals, none in fights) and upcoming birthdays
- Ambient sound (`scripts/ambience.test.ts`): birds by day and insects at night, dawn and winter, cicadas, rain outside vs on the roof indoors, heavy rain and storms, snow and blizzards, high places, water only where it belongs, village bustle by time, hearths and caves, fight mode adds nothing, indoor detection, levels in range, the description, reading the save (held weather, map place, fight)
- Safehouses (`scripts/safehouses.test.ts`): schema and tracker block, tagging (name, kind, who knows), an untagged inn night → rented, paying on, running out, camps left and come back to, none in fights, stash in and out, upgrades, safe rest healing, residents' whereabouts, the narrator lines (none without places, places line, heading, overgrown), letter address, found seeds (Root, hunter-nin, the Akatsuki; never for a base), coming back → compromised, searched while away, compromised rest, a host's death, ambience, flashbacks, normalize
- Playable flashbacks (`scripts/flashbacks.test.ts`): the 18 records (order, dates before the story, Kan's ages, Team 3 window, cast in the save), the date line, offers (fitting moments, none in fights/on the road/early/without a fit, date windows, once a month, played never again, Shisui's last night gated), the chip and the waiting offer, starting by words or chip, the narrator and tracker blocks, the dead alive at their age, Kan's parents made once, the present standing still, memory weather and ambience, ending (past-dated shared memory, ±1 bond, job, return line, recent scene), the write-up, the hard cap and wrap-up lines, images and scrapbook, old saves, remembrance days
- Money (`scripts/money.test.ts`): new and old saves, schema and both prompts, reading the tracker's amounts, paying and being paid, never below zero, a stated total, flashbacks leave the purse alone
- Names Kan knows (`scripts/names.test.ts`): who he knows at the start (Tenzo, not Yamato), Karin → Karin Uzumaki, the masked man → Madara (Tobi an alias) → Masked Madara → Obito, the act met first, Deidara's Tobi and Itachi's Madara (and Zetsu playing along, the summit), Kisame on sight / Kakuzu heard of / Pain never / Gaara as Kazekage, leaks caught and spoken names learned (shared names left alone), a stranger's label then name, search by known names only, old saves, both prompts and the schema
- Debug log (`scripts/debug-panel.test.ts`): state-change diff, per-turn cost totals, usage parsing from normal and streamed replies

Run: `bun test`.
