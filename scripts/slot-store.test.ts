import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { IDBFactory } from 'fake-indexeddb';

// In-memory AsyncStorage with an optional size cap, standing in for localStorage.
const local = new Map<string, string>();
let localCap = Infinity;

mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => local.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      let used = value.length;
      for (const [k, v] of local) if (k !== key) used += v.length;
      if (used > localCap) throw new Error('QuotaExceededError');
      local.set(key, value);
    },
    removeItem: async (key: string) => {
      local.delete(key);
    },
    getAllKeys: async () => [...local.keys()],
    multiGet: async () => [],
    multiSet: async () => undefined,
    multiRemove: async () => undefined,
  },
}));

import { loadSlot, saveSlot } from '../lib/rpg/db';
import { pushSnapshot } from '../lib/rpg/log';
import { seedDatabase } from '../lib/rpg/seed';
import { readSlotJson, resetSlotStoreForTests, slotBackend } from '../lib/rpg/slotStore';

const KEY = 'kan.slot.slot_test.v1';

function bigStory(turns: number) {
  let db = seedDatabase('slot_test', 'Test');
  const line = 'Rain hisses on the river while Itachi watches the far bank in silence. '.repeat(40);
  db = {
    ...db,
    rawLog: Array.from({ length: turns }, (_, i) => ({
      ...({} as any),
      id: `log_${i}`,
      turn: i,
      kind: 'story',
      role: i % 2 ? 'assistant' : 'user',
      content: line,
      model: null,
      promptTokens: 0,
      completionTokens: 0,
      chapter: 1,
      scene: 'river',
      inStoryDate: db.state.date,
      createdAt: i,
    })) as any,
  };
  for (let k = 0; k < 3; k += 1) db = pushSnapshot(db, 3);
  return db;
}

describe('slot storage', () => {
  beforeEach(() => {
    local.clear();
    localCap = Infinity;
    (globalThis as any).indexedDB = new IDBFactory();
    resetSlotStoreForTests();
  });

  afterEach(() => {
    delete (globalThis as any).indexedDB;
    resetSlotStoreForTests();
  });

  test('saves go to IndexedDB, not localStorage', async () => {
    expect(await slotBackend()).toBe('indexeddb');
    await saveSlot(seedDatabase('slot_test', 'Test'));
    expect(local.has(KEY)).toBe(false);
    expect((await loadSlot('slot_test')).meta.slotName).toBe('Test');
  });

  test('an old localStorage save is moved over and removed', async () => {
    const old = seedDatabase('slot_test', 'Old story');
    local.set(KEY, JSON.stringify(old));
    const loaded = await loadSlot('slot_test');
    expect(loaded.meta.slotName).toBe('Old story');
    expect(local.has(KEY)).toBe(false);
    expect(await readSlotJson(KEY)).not.toBeNull();
  });

  test('when both copies exist, the newer one wins', async () => {
    const older = seedDatabase('slot_test', 'Older');
    await saveSlot(older);
    const newer = { ...older, meta: { ...older.meta, slotName: 'Newer', updatedAt: Date.now() + 60_000 } };
    local.set(KEY, JSON.stringify(newer));
    expect((await loadSlot('slot_test')).meta.slotName).toBe('Newer');
    expect(local.has(KEY)).toBe(false);
  });

  test('a long story with undo snapshots that would overflow localStorage saves whole', async () => {
    localCap = 5_000_000;
    const db = bigStory(1200);
    const size = JSON.stringify(db).length;
    expect(size).toBeGreaterThan(localCap);
    await saveSlot(db);
    const back = await loadSlot('slot_test');
    expect(back.rawLog.length).toBe(1200);
    expect(back.snapshots.length).toBe(3);
  });

  test('without IndexedDB it falls back to AsyncStorage', async () => {
    delete (globalThis as any).indexedDB;
    resetSlotStoreForTests();
    expect(await slotBackend()).toBe('asyncstorage');
    await saveSlot(seedDatabase('slot_test', 'Native'));
    expect(local.has(KEY)).toBe(true);
    expect((await loadSlot('slot_test')).meta.slotName).toBe('Native');
  });
});

// ---------------------------------------------------------------------------
// Audit 3.1: a stored save that fails to open is never replaced by a fresh one.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import {
  SlotLoadError,
  clearBrokenSlot,
  isSlotBroken,
  listSlots,
  loadStoredSlot,
  normalizeDatabase,
} from '../lib/rpg/db';
import { BACKEND_KEY, conflictBackupKey, listStoredKeys, pickSlotCopy, writeSlotJson } from '../lib/rpg/slotStore';

function storyWith(turns: number, name: string, updatedAt: number) {
  const db = bigStory(turns);
  return { ...db, snapshots: [], meta: { ...db.meta, slotName: name, updatedAt } };
}

describe('a save that fails to open (audit 3.1)', () => {
  beforeEach(() => {
    local.clear();
    localCap = Infinity;
    (globalThis as any).indexedDB = new IDBFactory();
    resetSlotStoreForTests({ retryDelayMs: 1 });
    clearBrokenSlot('slot_test');
  });

  afterEach(() => {
    delete (globalThis as any).indexedDB;
    resetSlotStoreForTests();
    clearBrokenSlot('slot_test');
  });

  test('a slot that was never saved still starts a fresh story', async () => {
    const db = await loadSlot('slot_test');
    expect(db.rawLog.length).toBe(0);
    expect(isSlotBroken('slot_test')).toBe(false);
  });

  test('unreadable JSON throws a typed error, sets the raw text aside, and blocks writes', async () => {
    await writeSlotJson(KEY, '{"schemaVersion":1, "meta": broken');
    const caught = await loadSlot('slot_test').catch((error) => error);
    expect(caught).toBeInstanceOf(SlotLoadError);
    expect(caught.kind).toBe('unreadable');
    expect(caught.raw).toContain('broken');
    expect(isSlotBroken('slot_test')).toBe(true);

    const keys = await listStoredKeys();
    const backup = keys.find((key) => key.startsWith('kan.slot.slot_test.broken.'));
    expect(backup).toBeDefined();
    expect(await readSlotJson(backup!)).toContain('broken');

    // A settings change or any other commit can't overwrite the real save.
    await expect(saveSlot(seedDatabase('slot_test', 'Blank'))).rejects.toThrow();
    expect(await readSlotJson(KEY)).toContain('broken');
  });

  test('a normalize failure is its own error kind, and loadStoredSlot throws too', async () => {
    const db = seedDatabase('slot_test', 'Test');
    // entities that are not objects make the normalizers throw.
    await writeSlotJson(KEY, JSON.stringify({ ...db, entities: [null] }));
    const caught = await loadSlot('slot_test').catch((error) => error);
    expect(caught).toBeInstanceOf(SlotLoadError);
    expect(caught.kind).toBe('normalize');
    clearBrokenSlot('slot_test');
    expect(await loadStoredSlot('slot_test').catch((error) => error)).toBeInstanceOf(SlotLoadError);
  });

  test('the story list shows a broken slot as a placeholder without hiding the rest', async () => {
    await saveSlot(seedDatabase('slot_main', 'Main'));
    local.set('kan.meta.v1', JSON.stringify({ activeSlotId: 'slot_main', slotOrder: ['slot_main', 'slot_test'] }));
    await writeSlotJson(KEY, 'not json');
    const slots = await listSlots();
    expect(slots.map((slot) => slot.meta.slotName)).toEqual(['Main', 'A story that could not be opened']);
    expect(isSlotBroken('slot_test')).toBe(true);
    expect(await readSlotJson(KEY)).toBe('not json');
  });

  test('retry after the slot is readable again opens it and allows writes', async () => {
    await writeSlotJson(KEY, 'not json');
    await loadSlot('slot_test').catch(() => undefined);
    await writeSlotJson(KEY, JSON.stringify(seedDatabase('slot_test', 'Fixed')));
    clearBrokenSlot('slot_test');
    expect((await loadSlot('slot_test')).meta.slotName).toBe('Fixed');
    await saveSlot(seedDatabase('slot_test', 'Saved'));
    expect((await loadSlot('slot_test')).meta.slotName).toBe('Saved');
  });
});

// ---------------------------------------------------------------------------
// Audit 3.2: an IndexedDB hiccup never rolls a save back to a blank one.
// ---------------------------------------------------------------------------

describe('IndexedDB failing to open (audit 3.2)', () => {
  beforeEach(() => {
    local.clear();
    localCap = Infinity;
    (globalThis as any).indexedDB = new IDBFactory();
    resetSlotStoreForTests({ retryDelayMs: 1 });
    clearBrokenSlot('slot_test');
  });

  afterEach(() => {
    delete (globalThis as any).indexedDB;
    resetSlotStoreForTests();
    clearBrokenSlot('slot_test');
  });

  function failingOpens(times: number) {
    const real = (globalThis as any).indexedDB as IDBFactory;
    let left = times;
    (globalThis as any).indexedDB = {
      open: (...args: Parameters<IDBFactory['open']>) => {
        if (left > 0) {
          left -= 1;
          const request: any = {};
          setTimeout(() => request.onerror?.(), 0);
          return request;
        }
        return real.open(...args);
      },
    };
    resetSlotStoreForTests({ retryDelayMs: 1 });
  }

  test('the first IndexedDB write sets the backend flag', async () => {
    await saveSlot(seedDatabase('slot_test', 'Test'));
    expect(local.get(BACKEND_KEY)).toBe('indexeddb');
  });

  test('a failed open is retried before anything else happens', async () => {
    await saveSlot(seedDatabase('slot_test', 'Real'));
    failingOpens(2);
    expect((await loadSlot('slot_test')).meta.slotName).toBe('Real');
  });

  test('once IndexedDB was used, a lasting failure is an error, never an AsyncStorage fallback', async () => {
    await saveSlot(seedDatabase('slot_test', 'Real'));
    failingOpens(99);
    const caught = await loadSlot('slot_test').catch((error) => error);
    expect(caught).toBeInstanceOf(SlotLoadError);
    expect(caught.kind).toBe('storage');
    await expect(saveSlot(seedDatabase('slot_test', 'Blank'))).rejects.toThrow();
    expect(local.has(KEY)).toBe(false);
  });

  test('a device that never used IndexedDB still falls back', async () => {
    failingOpens(99);
    expect(await slotBackend()).toBe('asyncstorage');
  });

  test('a copy with fewer turns never beats one with more just because it is newer', async () => {
    const real = storyWith(40, 'Real', 1_000);
    const blank = storyWith(2, 'Blank', 9_000_000_000_000);
    expect(JSON.parse(pickSlotCopy(JSON.stringify(real), JSON.stringify(blank))).meta.slotName).toBe('Real');

    await writeSlotJson(KEY, JSON.stringify(real));
    local.set(KEY, JSON.stringify(blank));
    expect((await loadSlot('slot_test')).meta.slotName).toBe('Real');
    expect(local.has(KEY)).toBe(false);

    const backups = (await listStoredKeys()).filter((key) => key.startsWith(`${KEY}.conflict.`));
    expect(backups.length).toBe(1);
    expect(JSON.parse((await readSlotJson(backups[0]))!).meta.slotName).toBe('Blank');
    expect(conflictBackupKey(KEY, 5)).toBe(`${KEY}.conflict.5`);
  });
});

// ---------------------------------------------------------------------------
// Audit 3.4: every GameState field survives a load.
// ---------------------------------------------------------------------------

/** The field names of GameState, read from types.ts so a new field fails this test until it is covered. */
function gameStateFields(): string[] {
  const source = readFileSync(new URL('../lib/rpg/types.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export type GameState = {');
  const body = source.slice(start, source.indexOf('\n};', start));
  return [...body.matchAll(/^  ([a-zA-Z]+)\??:/gm)].map((match) => match[1]);
}

describe('load keeps every GameState field (audit 3.4)', () => {
  test('a state with every field set survives a round trip, and so does an unknown future field', () => {
    const db = seedDatabase('slot_test', 'Test');
    const date = db.state.inStoryDate;
    const full = {
      ...db.state,
      locationKind: 'road',
      turnsWithoutTimeChange: 2,
      canonProgress: db.state.canonProgress ?? {
        version: 3, baselineDate: date, baselineTurn: 0, completed: [], active: [], engaged: [], expired: [], heard: {},
      },
      chapterTitle: 'The river',
      chapterStart: { turn: 1, date },
      chapters: [{ chapter: 1, title: 'Ash', from: date, to: date }],
      scenePace: 'travel',
      sceneCast: ['Itachi Uchiha'],
      sceneMode: { current: 'normal', exchangeStreak: 0, partners: [] },
      sceneSeq: 3,
      sceneClosed: true,
      post: { letters: [] },
      reputation: db.state.reputation ?? {},
      yearly: { knownBirthdays: [], offered: {} },
      renown: { deeds: [], epithets: [] },
      consequences: [],
      weather: { region: 'fire', condition: 'rain', since: date, source: 'world' },
      travelLog: [{ place: 'The road north', date }],
      flashbacks: { played: [], offered: {} },
      safehouses: { places: [{ id: 'sh_1', name: 'the cave above the falls', kind: 'camp', place: 'Falls', since: date, status: 'active' }] },
      purse: { ryo: 120, history: [] },
      namesVersion: 2,
      futureField: { kept: true },
    } as any;

    const fields = gameStateFields();
    expect(fields.length).toBeGreaterThan(30);
    // The test itself must set every field, so a new GameState field can't slip past it.
    expect(fields.filter((field) => !(field in full))).toEqual([]);

    const back = normalizeDatabase(JSON.parse(JSON.stringify({ ...db, state: full }))).state as any;
    expect(fields.filter((field) => back[field] === undefined)).toEqual([]);
    expect(back.futureField).toEqual({ kept: true });
    expect(back.chapterTitle).toBe('The river');
    expect(back.sceneClosed).toBe(true);
  });
});
