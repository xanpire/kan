/**
 * Session 1 knowledge leaks and the weather (audit 6b, 7): what the UI shows
 * must pass "Kan only knows what Kan could know", and the sky must match the
 * prose.
 */
import { describe, expect, mock, test } from 'bun:test';

mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
    getAllKeys: async () => [],
    multiGet: async () => [],
    multiSet: async () => undefined,
    multiRemove: async () => undefined,
  },
}));

import { normalizeDatabase } from '../lib/rpg/db';
import { knownCanonPoint } from '../lib/rpg/canon';
import { resolveCharacterRefs, resolveEntity } from '../lib/rpg/entities';
import { applyStoryHooks } from '../lib/rpg/hooks';
import { appendStoryMessage } from '../lib/rpg/log';
import { applyStateStep } from '../lib/rpg/memoryJobs';
import { loreTitle } from '../lib/rpg/names';
import { buildExtractionPrompt, trackerPromptText } from '../lib/rpg/prompt';
import { resolveTurnMode } from '../lib/rpg/sceneMode';
import { seedDatabase } from '../lib/rpg/seed';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import { currentWeather, weatherFromNarration } from '../lib/rpg/weather';
import type { AppDatabase } from '../lib/rpg/types';
import { ambienceMix, type AmbienceInput } from '../lib/rpg/ambience';

const seed = () => normalizeDatabase(seedDatabase('slot_s1know', 'Session 1 knowledge'));

function play(db: AppDatabase, input: string, narration: string, state: Record<string, unknown> | null) {
  let next = appendStoryMessage(db, 'user', input, null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  const diff = state ? resolveCharacterRefs(next, convertStateBlock(state).diff) : null;
  return applyStateStep(next, diff, { turnLogId, userMessage: input, narration }, new Set()).db;
}

describe('the scene cast strip prints names Kan knows', () => {
  test('the masked man is not "Tobi" before anyone says it', () => {
    const base = seed();
    const tobi = resolveEntity(base, 'Tobi')!;
    const db: AppDatabase = { ...base, state: { ...base.state, sceneCast: ['Itachi Uchiha', tobi.name], scenePace: 'combat', sceneClosed: false } };
    const shown = resolveTurnMode(db, '*You raise your guard.*').with;
    expect(shown).toContain('Itachi Uchiha');
    expect(shown).not.toContain('Tobi');
    expect(shown.some((name) => /masked man/i.test(name))).toBe(true);
  });
});

describe('Goals only rest on what Kan knows', () => {
  test('a fresh story has neither the Kakuzu nor the grave goal', () => {
    const db = applyStoryHooks(seed());
    const titles = db.threads.filter((thread) => thread.status === 'open').map((thread) => thread.title);
    expect(titles).not.toContain('Survive Kakuzu');
    expect(titles).not.toContain("Visit Izumi's grave");
  });

  test('a hook goal an older build opened too early is withdrawn', () => {
    const base = seed();
    const early: AppDatabase = {
      ...base,
      threads: [
        ...base.threads,
        {
          id: 'thread_hook_survive-kakuzu',
          type: 'goal',
          title: 'Survive Kakuzu',
          description: 'Kakuzu has killed every partner he has ever had.',
          status: 'open',
          openedAt: base.state.inStoryDate,
          resolvedAt: null,
          importance: 4,
          participants: ['Kan', 'Kakuzu'],
          participantIds: [],
          sourceEventId: null,
        },
      ],
    };
    expect(applyStoryHooks(early).threads.some((thread) => thread.title === 'Survive Kakuzu')).toBe(false);
  });
});

describe('Lore and Timeline do not spoil', () => {
  test('the nine-tails entry does not show the name Kurama, and the typo is gone', () => {
    const db = seed();
    const nineTails = db.loreEntries.find((lore) => lore.keywords.includes('nine-tails'))!;
    expect(nineTails.keywords).not.toContain('kurma');
    expect(loreTitle(db, nineTails.keywords).toLowerCase()).not.toContain('kurama');
    expect(loreTitle(db, nineTails.keywords)).toBe('Nine-tails, attack');

    // An old save keeps the typo until it is normalised.
    const old = { ...db, loreEntries: db.loreEntries.map((lore) => (lore.id === nineTails.id ? { ...lore, keywords: ['nine-tails', 'kurma', 'kurama', 'attack'] } : lore)) };
    expect(normalizeDatabase(old).loreEntries.find((lore) => lore.id === nineTails.id)!.keywords).not.toContain('kurma');
  });

  test('the Timeline row shows only a canon point Kan has heard', () => {
    const db = seed();
    expect(knownCanonPoint(db)).toBe(db.state.canonPoint);

    // The bingo-book page fired in the world, nobody has told Kan yet.
    const progress = db.state.canonProgress!;
    const fired: AppDatabase = {
      ...db,
      state: { ...db.state, canonPoint: 'Itachi Uchiha is listed in every bingo book.', canonProgress: { ...progress, completed: [...progress.completed, 'itachi-bingo-book'] } },
      events: [
        ...db.events,
        { id: 'event_canon_itachi-bingo-book', chapter: 1, scene: '', inStoryDate: db.state.inStoryDate, summary: 'Bingo book', importance: 3, tags: ['canon'], pinned: false, sourceLogId: null, createdAt: 0 },
      ],
    };
    expect(knownCanonPoint(fired)).not.toContain('bingo');

    const told: AppDatabase = {
      ...fired,
      state: {
        ...fired.state,
        canonProgress: { ...fired.state.canonProgress!, heard: { 'event_canon_itachi-bingo-book': { from: 'Madara Uchiha', date: db.state.inStoryDate } } },
      },
    };
    expect(knownCanonPoint(told).toLowerCase()).toContain('bingo');
  });
});

describe('the weather matches the rain', () => {
  test('a new story opens in a downpour', () => {
    expect(currentWeather(seed()).condition).toBe('downpour');
  });

  test('rain in the prose wins over a cloudy roll; the Rain as a place does not', () => {
    const base = seed();
    const cloudy: AppDatabase = { ...base, state: { ...base.state, weather: { ...base.state.weather!, condition: 'cloudy', source: 'world' } } };
    expect(weatherFromNarration(cloudy, 'Rain hammers the canopy and runs down your collar.')).toBeTruthy();
    expect(weatherFromNarration(cloudy, 'You set out for the Rain at first light. The road is dry.')).toBeUndefined();
    expect(weatherFromNarration(cloudy, '"It will rain tomorrow," Itachi says.')).toBeUndefined();
    expect(weatherFromNarration(cloudy, 'There is no rain tonight.')).toBeUndefined();

    // Already raining: nothing to change.
    expect(weatherFromNarration(base, 'The downpour keeps on.')).toBeUndefined();

    // Through the state step, with the tracker leaving weather null.
    const after = play(cloudy, '*You wait.*', 'The downpour soaks you to the bone while you wait under the cedars.', { scene_pace: 'conversation', characters_present: [] });
    expect(['rain', 'downpour']).toContain(currentWeather(after).condition);
  });

  test('rain with mist in it is rain, not fog (audit 7.2)', () => {
    const base = seed();
    const fog: AppDatabase = { ...base, state: { ...base.state, weather: { ...base.state.weather!, condition: 'fog', source: 'world' } } };
    // Raining already: "the mist" over the stones does not turn it to fog.
    expect(weatherFromNarration(base, 'Rain runs off the stones and the mist hangs low over the cistern.')).toBeUndefined();
    // Fog held, rain in the prose: the rain wins.
    expect(weatherFromNarration(fog, 'Rain runs off the stones and the mist hangs low.')).toBeTruthy();
  });

  test('the prose wins over the tracker when the two disagree (audit 7.2)', () => {
    const after = play(seed(), '*You wait.*', 'The downpour keeps hammering the roof while you wait.', {
      scene_pace: 'conversation',
      characters_present: [],
      weather: 'thick fog',
    });
    expect(['rain', 'downpour', 'storm']).toContain(currentWeather(after).condition);
  });

  test('the world does not roll new weather in a scene still going (audit 7.2)', () => {
    let db = seed();
    for (let turn = 0; turn < 6; turn += 1) {
      db = play(db, '*You wait.*', 'You wait under the cedars. Two hours pass.', {
        scene_pace: 'conversation',
        characters_present: [],
        time: { elapsed: 2, unit: 'hours', clock_time: null },
      });
    }
    expect(currentWeather(db).condition).toBe('downpour');
  });

  test('the World tracker is told to report weather that differs, not only changes', () => {
    const text = trackerPromptText(buildExtractionPrompt(seed(), '*You wait.*', 'The rain falls hard on the cedars.'));
    expect(text).toContain('differs from WEATHER NOW');
  });

  test('no birds after dark in October', () => {
    const base: AmbienceInput = {
      condition: 'clear', period: 'evening', hour: 19, month: 10, season: 'autumn', region: 'fire',
      kind: 'wilderness', place: 'a gorge in the Land of Fire', placeId: null, fight: false,
    };
    expect(ambienceMix(base).beds['forest-day'] ?? 0).toBe(0);
    expect(ambienceMix({ ...base, hour: 17 }).beds['forest-day'] ?? 0).toBeGreaterThan(0);
    // Midsummer light lasts.
    expect(ambienceMix({ ...base, hour: 19, month: 6, season: 'summer' }).beds['forest-day'] ?? 0).toBeGreaterThan(0);
  });
});
