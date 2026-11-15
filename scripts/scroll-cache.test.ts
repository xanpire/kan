/**
 * Section 13 of claude/before-variety-ideas.md (14 Nov 2026): the scroll cache
 * under Hazuki's floor. The story can reach it (SCROLL CACHE line), the tracker
 * names the bundle when Kan takes it, and Root's search of the sealed district
 * decides who is waiting.
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
import { isPinnedItem } from '../lib/rpg/inventory';
import { knowsKanLine } from '../lib/rpg/knowsKan';
import { placeIdOf } from '../lib/rpg/mapData';
import { buildExtractionPrompt, buildNarrationPrompt } from '../lib/rpg/prompt';
import {
  ROOT_FINDS_IT,
  SCROLLS_ITEM,
  applyScrollCache,
  formatScrollCacheLine,
  scrollCacheOf,
} from '../lib/rpg/scrollCache';
import { seedDatabase } from '../lib/rpg/seed';
import type { AppDatabase, CalendarDate } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_scroll_cache', 'Scroll cache'));
const HOUSE = 'Hazuki’s house in the Uchiha district, Hidden Leaf';
const with_ = (db: AppDatabase, state: Partial<AppDatabase['state']>): AppDatabase => ({ ...db, state: { ...db.state, ...state } });
const date = (year: number, month: number, day = 1): CalendarDate => ({ year, month, day, hour: 23, minute: 0, second: 0 });
const happened = (db: AppDatabase, id: string): AppDatabase =>
  with_(db, { canonProgress: { ...db.state.canonProgress!, completed: [...(db.state.canonProgress?.completed ?? []), id] } });
const take = (db: AppDatabase, item = SCROLLS_ITEM) => applyScrollCache(with_(db, { inventory: [...db.state.inventory, item] }));
const danzo = (db: AppDatabase) => knowsKanLine(db, { ...db.entities.find((e) => e.name === 'Danzo Shimura')!, met: true }) ?? '';
const narration = (db: AppDatabase, input: string) => buildNarrationPrompt(db, input).messages.map((m) => m.content).join('\n');
const tracker = (db: AppDatabase) => buildExtractionPrompt(db, 'I pry up the boards.', 'The chest is there.').messages.map((m) => m.content).join('\n');

describe('the scroll cache under Hazuki’s floor', () => {
  test('Hazuki’s house is a place in the Leaf, read before the district', () => {
    expect(placeIdOf(HOUSE)).toBe('hazuki-house');
    expect(placeIdOf('the Uchiha district')).toBe('uchiha-district');
  });

  test('nothing on an ordinary turn away from the district', () => {
    const db = seed();
    expect(scrollCacheOf(db).status).toBe('hidden');
    expect(formatScrollCacheLine(db, 'I wait in the rain.')).toBe('');
    expect(narration(db, 'I wait in the rain.')).not.toContain('SCROLL CACHE');
  });

  test('in the district before Root finds it: the chest, what is in it, Root still searching', () => {
    const db = with_(seed(), { location: HOUSE, inStoryDate: date(13, 11) });
    const line = formatScrollCacheLine(db, 'I slip into the house.');
    expect(line).toContain('SCROLL CACHE (here)');
    expect(line).toContain('blood-locked Uzumaki seal');
    expect(line).toContain('No S-rank seals');
    expect(line).toContain('still combing');
    expect(line).not.toContain('sensing seal');
    expect(narration(db, 'I slip into the house.')).toContain('SCROLL CACHE (here)');
    expect(tracker(db)).toContain(`"${SCROLLS_ITEM}" in inventory_added`);
  });

  test('words reaching for the scrolls from elsewhere bring the line', () => {
    const db = with_(seed(), { location: 'a cave in the Land of Rain', inStoryDate: date(14, 3) });
    expect(formatScrollCacheLine(db, 'I think about going back for my father’s scrolls.')).toContain('where your words reach');
    expect(tracker(db)).not.toContain('SCROLL CACHE');
  });

  test('Root finds the chest on its day; Danzō keeps it watched', () => {
    const db = applyScrollCache(with_(seed(), { location: HOUSE, inStoryDate: date(14, 2) }));
    expect(scrollCacheOf(db).rootFound).toEqual(ROOT_FINDS_IT);
    expect(scrollCacheOf(db).rootKnows).toBeUndefined();
    expect(formatScrollCacheLine(db, 'I look at the floor.')).toContain('Root sensing seal');
    expect(danzo(db)).toContain('sealed Uzumaki chest');
    expect(danzo(db)).not.toContain('wants you more');
  });

  test('taking it under Root’s seal tells Root you are alive', () => {
    const found = applyScrollCache(with_(seed(), { location: HOUSE, inStoryDate: date(14, 4) }));
    const db = take(found);
    expect(scrollCacheOf(db).status).toBe('taken');
    expect(scrollCacheOf(db).rootKnows).toEqual(date(14, 4));
    expect(danzo(db)).toContain('sure it was you');
    expect(danzo(db)).toContain('wants you more');
    expect(isPinnedItem(SCROLLS_ITEM)).toBe(true);
    // Once taken, the cache line is gone and the tracker is no longer asked.
    expect(formatScrollCacheLine(db, 'I look around.')).toBe('');
    expect(tracker(db)).not.toContain('SCROLL CACHE');
  });

  test('taken before Root came: the empty hiding place tells them the same', () => {
    const early = take(with_(seed(), { location: HOUSE, inStoryDate: date(13, 11) }));
    expect(scrollCacheOf(early).rootKnows).toBeUndefined();
    const later = applyScrollCache(with_(early, { location: 'the Hidden Rain', inStoryDate: date(14, 2) }));
    expect(scrollCacheOf(later).rootFound).toEqual(ROOT_FINDS_IT);
    expect(scrollCacheOf(later).rootKnows).toEqual(ROOT_FINDS_IT);
  });

  test('with Danzō dead nobody is listening', () => {
    const found = applyScrollCache(with_(seed(), { location: HOUSE, inStoryDate: date(14, 2) }));
    const after = happened(with_(found, { inStoryDate: date(23, 3) }), 'sasuke-rampage');
    expect(formatScrollCacheLine(after, 'I kneel by the boards.')).toContain('nobody is listening');
    expect(scrollCacheOf(take(after)).rootKnows).toBeUndefined();
  });

  test('sealing scrolls bought elsewhere are not the cache', () => {
    const db = take(with_(seed(), { location: 'Tanzaku Town', inStoryDate: date(14, 3) }), 'Sealing scrolls (3)');
    expect(scrollCacheOf(db).status).toBe('hidden');
  });

  test('carrying them: a reading line only when Kan studies', () => {
    const db = take(with_(seed(), { location: HOUSE, inStoryDate: date(13, 11) }));
    expect(formatScrollCacheLine(db, 'I eat in silence.')).toBe('');
    expect(formatScrollCacheLine(db, 'I unroll one of the scrolls by the fire.')).toContain('BANRI’S SCROLLS');
  });
});
