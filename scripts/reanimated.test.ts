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
import { seedDatabase } from '../lib/rpg/seed';
import { appendStoryMessage } from '../lib/rpg/log';
import { advanceCanon } from '../lib/rpg/canon';
import { applyStateStep } from '../lib/rpg/memoryJobs';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import { resolveCharacterRefs } from '../lib/rpg/entities';
import { isDeceased, isReanimated, markDeceased, markReanimated } from '../lib/rpg/deaths';
import { buildNarrationPrompt } from '../lib/rpg/prompt';
import { romanceBlock } from '../lib/rpg/bondGuard';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_edo', 'Edo story'));
const at = (db: AppDatabase, year: number, month: number, day: number): AppDatabase => ({
  ...db,
  state: { ...db.state, inStoryDate: { ...db.state.inStoryDate, year, month, day, hour: 12 } },
});
const itachi = (db: AppDatabase) => db.entities.find((entity) => entity.name === 'Itachi Uchiha')!;

function play(db: AppDatabase, narration: string, state: Record<string, unknown>) {
  let next = appendStoryMessage(db, 'user', '*I look at him.*', null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  const diff = resolveCharacterRefs(next, convertStateBlock(state).diff);
  return applyStateStep(next, diff, { turnLogId, userMessage: '*I look at him.*', narration }, new Set()).db;
}

describe('the reanimated (audit 6.9)', () => {
  test('canon brings Itachi back through Edo Tensei, and Izanami lets him go', () => {
    let db = advanceCanon(at(seed(), 23, 1, 10), { inCombat: false });
    expect(isDeceased(itachi(db))).toBe(true);
    expect(isReanimated(itachi(db))).toBe(true);
    expect(itachi(db).reanimated?.by).toBe('Kabuto');

    db = advanceCanon(at(db, 23, 1, 12), { inCombat: false });
    expect(isReanimated(itachi(db))).toBe(false);
    expect(isDeceased(itachi(db))).toBe(true);
  });

  test('a reanimated person can be in the scene, is seen, and their card says what they are', () => {
    let db = at(seed(), 23, 1, 10);
    db = markDeceased(db, itachi(db).id, { cause: 'illness', known: false });
    db = markReanimated(db, [itachi(db).id], { by: 'Kabuto' });
    db = play(db, 'Itachi stands in front of you, his skin cracked like old paper.', {
      characters_present: ['itachi-uchiha'],
    });
    expect(db.state.sceneCast).toContain('Itachi Uchiha');
    expect(itachi(db).deceased?.known).toBe(true);
    const text = buildNarrationPrompt(db, '*I step closer.*').messages[1].content;
    expect(text).toContain('[REANIMATED: dead, here through Edo Tensei');
    expect(romanceBlock(db, itachi(db))).toBe('they are dead');
  });

  test('the tracker can reanimate and release', () => {
    let db = at(seed(), 23, 1, 10);
    db = markDeceased(db, itachi(db).id, { cause: 'illness', known: true });
    db = play(db, 'The coffin opens and Itachi steps out.', { reanimated: ['itachi-uchiha'], characters_present: ['itachi-uchiha'] });
    expect(isReanimated(itachi(db))).toBe(true);
    db = play(db, 'The light takes him. He is gone.', { released: ['itachi-uchiha'], characters_present: [] });
    expect(isReanimated(itachi(db))).toBe(false);
  });
});
