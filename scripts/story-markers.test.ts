/**
 * The story reads like a book (audit 11b): chapter cards where a chapter
 * opens, and thin lines for a new day or a new place.
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
import { PAINT_STAGE_LABEL, storyMarkers } from '../lib/rpg/storyMarkers';
import type { AppDatabase, CalendarDate } from '../lib/rpg/types';

function turn(db: AppDatabase, date: CalendarDate, chapter = db.state.chapter) {
  let next = { ...db, state: { ...db.state, inStoryDate: date, chapter } };
  next = appendStoryMessage(next, 'user', '*I walk on.*', null, 0, 0);
  next = appendStoryMessage(next, 'assistant', 'The road goes on.', null, 0, 0);
  return next;
}

const at = (db: AppDatabase, day: number, hour = 9): CalendarDate => ({ ...db.state.inStoryDate, day, hour, minute: 0 });
const userIds = (db: AppDatabase) => db.rawLog.filter((entry) => entry.kind === 'story' && entry.role === 'user').map((entry) => entry.id);

describe('story markers', () => {
  test('the first turn gets nothing; a new day gets a line with the full month', () => {
    let db = normalizeDatabase(seedDatabase('slot_markers', 'Markers'));
    db = turn(db, at(db, 10, 9));
    db = turn(db, at(db, 10, 15));
    db = turn(db, at(db, 11, 8));
    const ids = userIds(db);
    const markers = storyMarkers(db);

    expect(markers.has(ids[0])).toBe(false);
    expect(markers.has(ids[1])).toBe(false);
    expect(markers.get(ids[2])?.day).toMatch(/^11 [A-Z][a-z]+$/);
  });

  test('a place reached since the last action gets its own line', () => {
    let db = normalizeDatabase(seedDatabase('slot_markers2', 'Markers'));
    db = turn(db, at(db, 10, 9));
    db = { ...db, state: { ...db.state, travelLog: [...(db.state.travelLog ?? []), { place: 'The gorge road, Land of Rain', date: at(db, 10, 18) }] } };
    db = turn(db, at(db, 10, 19));

    expect(storyMarkers(db).get(userIds(db)[1])?.place).toBe('The gorge road, Land of Rain');
  });

  test('a new chapter gets a card with its title, not a day line', () => {
    let db = normalizeDatabase(seedDatabase('slot_markers3', 'Markers'));
    db = turn(db, at(db, 10, 9));
    db = { ...db, state: { ...db.state, chapterTitle: 'Into the Rain' } };
    db = turn(db, at(db, 16, 9), db.state.chapter + 1);
    db = { ...db, state: { ...db.state, chapter: db.state.chapter } };
    const marker = storyMarkers(db).get(userIds(db)[1]);

    expect(marker?.chapter?.title).toBe('Into the Rain');
    expect(marker?.chapter?.line).toMatch(/^16 [A-Z][a-z]+/);
    expect(marker?.day).toBeUndefined();
  });
});

describe('painting stages', () => {
  test('are named in the words the mockup showed', () => {
    expect(Object.values(PAINT_STAGE_LABEL)).toEqual(['Framing the shot', 'Painting', 'Checking']);
  });
});
