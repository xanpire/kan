/**
 * The decluttered Journal (audit 11a, approved by Xan at the step 10
 * mockup): one Story timeline by real chapter, Kan's condition in second
 * person, and what he carries with hand edits and pins (audit 10).
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
import {
  INVENTORY_LIMIT,
  addItems,
  handAddItem,
  handRemoveItem,
  isPinnedItem,
  togglePinnedItem,
} from '../lib/rpg/inventory';
import { chapterDates, kanConditions, storyTimeline } from '../lib/rpg/journal';
import { seedDatabase } from '../lib/rpg/seed';
import type { AppDatabase, CalendarDate, EventRecord, FactRecord } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_journal_views', 'Journal views'));

function on(db: AppDatabase, day: number, month = db.state.inStoryDate.month): CalendarDate {
  return { ...db.state.inStoryDate, day, month, hour: 12, minute: 0 };
}

function memory(db: AppDatabase, id: string, chapter: number, day: number, extra: Partial<EventRecord> = {}): EventRecord {
  return {
    id,
    chapter,
    scene: 'A scene',
    inStoryDate: on(db, day),
    summary: `Memory ${id}: something happened on the road.`,
    importance: 3,
    tags: [],
    pinned: false,
    sourceLogId: null,
    createdAt: day,
    ...extra,
  };
}

function twoChapters(): AppDatabase {
  const db = seed();
  const now = { ...db.state.inStoryDate, day: 20, hour: 19, minute: 12 };

  return {
    ...db,
    events: [
      ...db.events,
      memory(db, 'm1', 1, 10, { title: 'Itachi returns' }),
      memory(db, 'm2', 2, 17, { title: 'The joining' }),
      memory(db, 'f1', 2, 18, { title: 'The last spar', tags: ['flashback'], inStoryDate: { ...on(db, 3), year: db.state.inStoryDate.year - 4 } }),
      memory(db, 'canon_x', 1, 12, { summary: 'The Leaf names you missing-nin: the bingo book is updated.', tags: ['canon'] }),
    ],
    state: {
      ...db.state,
      inStoryDate: now,
      chapter: 2,
      chapterTitle: 'Into the Rain',
      chapterStart: { turn: 10, date: on(db, 16) },
      chapters: [{ chapter: 1, title: 'The rain hasn’t stopped', from: on(db, 9), to: on(db, 15) }],
      canonProgress: {
        ...(db.state.canonProgress ?? ({} as never)),
        heard: { canon_x: { from: 'Itachi Uchiha', date: on(db, 17) } },
      },
    },
  };
}

describe('Story: one timeline by real chapter', () => {
  test('newest chapter first, each holding its own memories, newest first', () => {
    const chapters = storyTimeline(twoChapters());

    expect(chapters.map((chapter) => chapter.chapter)).toEqual([2, 1]);
    expect(chapters[0].title).toBe('Into the Rain');
    expect(chapters[0].current).toBe(true);
    // Newest first; the seed's own opening memory comes after.
    expect(chapters[1].entries[0].title).toBe('Itachi returns');
    expect(chapters[1].entries.some((entry) => entry.title === 'The joining')).toBe(false);
  });

  test('news sits in the chapter during which it reached you, marked with who brought it', () => {
    const [current] = storyTimeline(twoChapters());
    const news = current.entries.find((entry) => entry.kind === 'news');

    expect(news?.title).toBe('The Leaf names you missing-nin');
    expect(news?.meta).toContain('word from Itachi Uchiha');
  });

  test('a flashback keeps its own kind (the warm tint) and says it is remembered', () => {
    const [current] = storyTimeline(twoChapters());
    const flashback = current.entries.find((entry) => entry.id === 'f1');

    expect(flashback?.kind).toBe('flashback');
    expect(flashback?.meta.startsWith('Remembered')).toBe(true);
  });

  test('no engine words reach the player', () => {
    const text = JSON.stringify(storyTimeline(twoChapters()));

    expect(text).not.toMatch(/\bArc\b|\bYear \d/);
  });

  test('news that has not happened yet, or that Kan never heard, stays out', () => {
    const db = twoChapters();
    const unheard = { ...db, events: [...db.events, memory(db, 'canon_y', 2, 18, { tags: ['canon'] })] };
    const ids = storyTimeline(unheard).flatMap((chapter) => chapter.entries.map((entry) => entry.id));

    expect(ids).not.toContain('canon_y');
  });

  test('chapter dates read like a person wrote them', () => {
    const db = seed();
    expect(chapterDates({ from: on(db, 9), to: on(db, 15) })).toMatch(/^9 to 15 [A-Z][a-z]{2}$/);
    expect(chapterDates({ from: on(db, 16), to: null })).toMatch(/^16 [A-Z][a-z]{2} to now$/);
  });
});

describe('Your condition', () => {
  function withFacts(db: AppDatabase, facts: Partial<FactRecord>[]): AppDatabase {
    const base: FactRecord = {
      id: 'x',
      subjectEntityId: null,
      type: 'injury',
      text: '',
      whoKnows: [],
      validFrom: db.state.inStoryDate,
      validTo: null,
      confidence: 'confirmed',
      sourceEventId: null,
    };
    return { ...db, facts: [...db.facts, ...facts.map((fact, index) => ({ ...base, id: `fact_${index}`, ...fact }))] };
  }

  test('Kan’s wounds and conditions, in second person, with how long they last', () => {
    const db = seed();
    const later = { ...db.state.inStoryDate, day: db.state.inStoryDate.day + 3 };
    const list = kanConditions(
      withFacts(db, [
        { text: "Kan's ribs are bruised on the left side", type: 'injury', expiresAt: later },
        { text: 'Kan is soaked to the bone', type: 'condition', untilRest: true },
        { text: 'Itachi is soaked', type: 'condition', subjectEntityId: db.entities.find((entity) => entity.name !== 'Kan')?.id ?? 'someone', untilRest: true },
        { text: 'An old wound', type: 'injury', validTo: db.state.inStoryDate },
      ])
    );

    expect(list.map((item) => item.text)).toEqual(['You are soaked to the bone', 'Your ribs are bruised on the left side']);
    expect(list[0].lasts).toBe('Until you rest');
    expect(list[1].lasts).toBe('About 3 days');
  });
});

describe('What you carry: hand edits and pins', () => {
  const state = { inventory: ['Forehead protector (Hidden Leaf)', 'Kunai (6)', 'Rope'], pinnedItems: [] as string[] };

  test('adding merges counts like the tracker does', () => {
    expect(handAddItem(state, '4 kunai').inventory).toContain('Kunai (10)');
    expect(handAddItem(state, '  ').inventory).toEqual(state.inventory);
  });

  test('removing takes one line off; the protector cannot be removed by hand', () => {
    expect(handRemoveItem(state, 'Rope').inventory).toEqual(['Forehead protector (Hidden Leaf)', 'Kunai (6)']);
    expect(handRemoveItem(state, 'Forehead protector (Hidden Leaf)').inventory).toEqual(state.inventory);
  });

  test('a pinned item survives the 40-item limit; unpinning lets it go again', () => {
    const pinned = togglePinnedItem(state, 'Rope');
    expect(isPinnedItem('Rope', pinned.pinnedItems)).toBe(true);

    const flood = Array.from({ length: INVENTORY_LIMIT }, (_, index) => `Trinket ${index}`);
    expect(addItems(pinned.inventory, flood, pinned.pinnedItems)).toContain('Rope');
    expect(addItems(state.inventory, flood, [])).not.toContain('Rope');

    expect(togglePinnedItem(pinned, 'Rope').pinnedItems).toEqual([]);
  });

  test('removing an item takes its pin with it', () => {
    const pinned = togglePinnedItem(state, 'Rope');
    expect(handRemoveItem(pinned, 'Rope').pinnedItems).toEqual([]);
  });
});
