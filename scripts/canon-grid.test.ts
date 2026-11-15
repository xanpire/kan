/**
 * Section 1 of claude/before-variety-ideas.md (15 Nov 2026): era accuracy.
 * Roles move with canon (eraRoles.ts), the Rain's map note waits for the
 * stronghold, Karin's beat names Sasuke's team for both of its names, Tobi
 * carries news only once he is Tobi, and Gaara sounds like the killer he is
 * until the invasion.
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

import { advanceCanon } from '../lib/rpg/canon';
import { CANON_GRID, CANON_MILESTONES } from '../lib/rpg/canonData';
import { normalizeDatabase } from '../lib/rpg/db';
import { seedDatabase } from '../lib/rpg/seed';
import type { AppDatabase, CalendarDate } from '../lib/rpg/types';

const seed = () => seedDatabase('slot_grid', 'Grid');
const date = (year: number, month: number, day = 1): CalendarDate => ({ year, month, day, hour: 12, minute: 0, second: 0 });
const at = (db: AppDatabase, when: CalendarDate): AppDatabase => ({ ...db, state: { ...db.state, inStoryDate: when } });
const byId = (id: string) => CANON_MILESTONES.find((m) => m.id === id)!;
const key = (d: { year: number; month: number; day?: number }) => d.year * 10000 + d.month * 100 + (d.day ?? 1);

describe('the canon date grid (15 Nov 2026)', () => {
  test('the anchors: Part 1 in spring 18, Exams 1 July, back at 15, war ends on the 17th birthday', () => {
    expect(key(byId('team-7-formed').from)).toBeGreaterThanOrEqual(key({ year: 18, month: 3 }));
    expect(key(byId('team-7-formed').from)).toBeLessThan(key({ year: 18, month: 5 }));
    expect(byId('chunin-exams').from).toEqual({ year: 18, month: 7 });
    expect(byId('konoha-invasion').from.month).toBe(8);
    expect(byId('tsunade-hokage').from.month).toBe(9);
    expect(byId('naruto-returns').from).toEqual({ year: 21, month: 6, day: 20 });
    expect(byId('war-begins').from).toEqual({ year: 22, month: 10, day: 8 });
    expect(byId('war-ends').from).toEqual({ year: 22, month: 10, day: 10 });
  });

  test('Mirai after Pain, Shikamaru Hiden before The Last, Himawari two years after Boruto', () => {
    expect(key(byId('mirai-born').from)).toBeGreaterThan(key(byId('pain-assault').from));
    expect(key(byId('mirai-born').from)).toBeLessThan(key(byId('war-begins').from));
    expect(key(byId('shikamaru-silence').from)).toBeLessThan(key(byId('the-falling-moon').from));
    expect(byId('himawari-born').from.year - byId('boruto-born').from.year).toBe(2);
  });

  test('a save fired on the old grid gets back what is now in its future, once', () => {
    // Old grid: Tsunade was Hokage by 18/4. On the new grid she is crowned in 18/9.
    const old = at(seed(), date(18, 5, 1));
    const fired: AppDatabase = {
      ...old,
      state: {
        ...old.state,
        canonProgress: { ...(old.state.canonProgress ?? { completed: [], active: [], engaged: [] }), completed: ['tsunade-hokage'], grid: undefined },
      },
    };
    const loaded = normalizeDatabase(fired);
    expect(loaded.state.canonProgress?.completed).not.toContain('tsunade-hokage');
    expect(loaded.state.canonProgress?.grid).toBe(CANON_GRID);

    const later = advanceCanon(at(loaded, date(18, 9, 20)));
    expect(later.state.canonProgress?.completed).toContain('tsunade-hokage');
    // A save already on the new grid is left alone.
    expect(normalizeDatabase(later).state.canonProgress?.completed).toContain('tsunade-hokage');
  });

  test('a new story starts on the new grid', () => {
    expect(normalizeDatabase(seed()).state.canonProgress?.grid).toBe(CANON_GRID);
  });
});
