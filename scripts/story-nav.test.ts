/**
 * Finding your way in a long story (audit 10): the chapter list and the
 * "Where you left off" card. Both read only what the save holds.
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
import { appendStoryMessage } from '../lib/rpg/log';
import { seedDatabase } from '../lib/rpg/seed';
import { chapterJumps, entriesToShow, LEFT_OFF_AFTER_MS, whereYouLeftOff } from '../lib/rpg/storyNav';
import type { AppDatabase, CalendarDate, SummaryRecord, ThreadRecord } from '../lib/rpg/types';

function turn(db: AppDatabase, date: CalendarDate, chapter = db.state.chapter) {
  let next = { ...db, state: { ...db.state, inStoryDate: date, chapter } };
  next = appendStoryMessage(next, 'user', '*I walk on.*', null, 0, 0);
  next = appendStoryMessage(next, 'assistant', 'The road goes on.', null, 0, 0);
  return next;
}

const at = (db: AppDatabase, day: number, hour = 9): CalendarDate => ({ ...db.state.inStoryDate, day, hour, minute: 0 });
const userIds = (db: AppDatabase) => db.rawLog.filter((entry) => entry.kind === 'story' && entry.role === 'user').map((entry) => entry.id);

function threeChapters() {
  let db = normalizeDatabase(seedDatabase('slot_nav', 'Nav'));
  db = { ...db, state: { ...db.state, chapterTitle: 'The Rain' } };
  db = turn(db, at(db, 10, 9));
  db = turn(db, at(db, 10, 12));
  db = {
    ...db,
    state: { ...db.state, chapters: [{ chapter: 1, title: 'The Rain', from: at(db, 10, 9), to: at(db, 10, 12) }], chapterTitle: 'North' },
  };
  db = turn(db, at(db, 12, 9), 2);
  db = turn(db, at(db, 12, 14), 2);
  db = {
    ...db,
    state: {
      ...db.state,
      chapters: [...(db.state.chapters ?? []), { chapter: 2, title: 'North', from: at(db, 12, 9), to: at(db, 12, 14) }],
      chapterTitle: 'The Gorge',
      chapter: 3,
    },
  };
  db = turn(db, at(db, 14, 9), 3);
  return db;
}

describe('chapter list', () => {
  test('every chapter that has begun, oldest first, opening on its first action', () => {
    const db = threeChapters();
    const ids = userIds(db);
    const jumps = chapterJumps(db);

    expect(jumps.map((jump) => jump.number)).toEqual([1, 2, 3]);
    expect(jumps.map((jump) => jump.title)).toEqual(['The Rain', 'North', 'The Gorge']);
    expect(jumps.map((jump) => jump.entryId)).toEqual([ids[0], ids[2], ids[4]]);
    expect(jumps[0].line).toMatch(/^10 [A-Z][a-z]+, year \d+$/);
  });

  test('a story not yet begun has no chapters to jump to', () => {
    expect(chapterJumps(normalizeDatabase(seedDatabase('slot_nav0', 'Nav')))).toEqual([]);
  });

  test('the window opens far enough to draw the chapter start', () => {
    const db = threeChapters();
    const jumps = chapterJumps(db);
    const story = db.rawLog.filter((entry) => entry.kind === 'story').length;

    expect(entriesToShow(db, jumps[0].entryId)).toBe(story);
    expect(entriesToShow(db, jumps[2].entryId)).toBe(2);
    expect(entriesToShow(db, 'nope')).toBeNull();
  });
});

describe('where you left off', () => {
  const summary = (db: AppDatabase, chapter: number, title: string, text: string): SummaryRecord => ({
    id: `sum_${chapter}`,
    level: 'chapter',
    range: { fromEventId: 'a', toEventId: 'b', from: db.state.inStoryDate, to: db.state.inStoryDate },
    text,
    title,
    chapter,
    tokenCount: 10,
    createdAt: chapter,
  } as SummaryRecord);

  const thread = (id: string, title: string, importance: ThreadRecord['importance'], type: ThreadRecord['type'] = 'quest'): ThreadRecord => ({
    id,
    type,
    title,
    description: '',
    status: 'open',
    openedAt: { year: 1, month: 1, day: 1, hour: 0, minute: 0 } as CalendarDate,
    resolvedAt: null,
    importance,
    participants: [],
    sourceEventId: null,
  });

  test('nothing within a day of the last turn, or before the story begins', () => {
    const db = threeChapters();
    const last = db.rawLog[db.rawLog.length - 1].createdAt;

    expect(whereYouLeftOff(db, last + LEFT_OFF_AFTER_MS - 1000)).toBeNull();
    expect(whereYouLeftOff(normalizeDatabase(seedDatabase('slot_nav0', 'Nav')), Date.now() + 10 * LEFT_OFF_AFTER_MS)).toBeNull();
  });

  test('after days away: the newest chapter summary, the place, and the threads that matter most', () => {
    let db = threeChapters();
    db = {
      ...db,
      summaries: [summary(db, 1, 'The Rain', 'You wait.'), summary(db, 2, 'North', 'You follow Itachi north.')],
      threads: [
        thread('t1', 'Find out who the masked man is', 3),
        thread('t2', 'Receive your rings', 5),
        thread('t3', 'Write to Hana', 2),
        thread('t4', 'Learn the water walk', 4),
        thread('t5', 'He will pay for that', 5, 'grudge'),
        { ...thread('t6', 'Done already', 5), status: 'resolved' },
      ],
    };
    const last = db.rawLog[db.rawLog.length - 1].createdAt;
    const card = whereYouLeftOff(db, last + 3 * LEFT_OFF_AFTER_MS + 60_000);

    expect(card?.away).toBe('3 days');
    expect(card?.chapter).toEqual({ title: 'North', text: 'You follow Itachi north.' });
    // The hidden grudge and the finished thread stay off; three at most, most important first.
    expect(card?.threads).toEqual(['Receive your rings', 'Learn the water walk', 'Find out who the masked man is']);
    expect(card?.place).toBeTruthy();
  });

  test('weeks and months read as weeks and months', () => {
    const db = threeChapters();
    const last = db.rawLog[db.rawLog.length - 1].createdAt;

    expect(whereYouLeftOff(db, last + 1 * LEFT_OFF_AFTER_MS)?.away).toBe('a day');
    expect(whereYouLeftOff(db, last + 15 * LEFT_OFF_AFTER_MS)?.away).toBe('2 weeks');
    expect(whereYouLeftOff(db, last + 95 * LEFT_OFF_AFTER_MS)?.away).toBe('3 months');
    expect(whereYouLeftOff(db, last + 95 * LEFT_OFF_AFTER_MS)?.chapter).toBeNull();
  });
});
