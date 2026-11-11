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
import { applyStateStep } from '../lib/rpg/memoryJobs';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import { resolveCharacterRefs } from '../lib/rpg/entities';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_cast', 'Cast story'));

function play(db: AppDatabase, narration: string, state: Record<string, unknown>) {
  let next = appendStoryMessage(db, 'user', '*I go.*', null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  const diff = resolveCharacterRefs(next, convertStateBlock(state).diff);
  const result = applyStateStep(next, diff, { turnLogId, userMessage: '*I go.*', narration }, new Set());
  return { db: result.db, entry: result.db.rawLog.find((item) => item.id === turnLogId)! };
}

describe('the scene cast follows Kan (audit 6.10)', () => {
  test('walking away alone leaves Itachi behind', () => {
    const first = play(seed(), 'Itachi stands beside you at the river.', {
      characters_present: ['itachi-uchiha'],
      location: 'A riverbank, Land of Fire',
      time: { elapsed: 5, unit: 'minutes' },
    });
    expect(first.db.state.sceneCast).toEqual(['Itachi Uchiha']);

    const second = play(first.db, 'You walk north alone for an hour. The forest thins.', {
      characters_present: [],
      location: 'A forest trail north of the river, Land of Fire',
      time: { elapsed: 1, unit: 'hours' },
    });
    expect(second.db.state.sceneCast).toEqual([]);
    expect(second.entry.sceneCastIds ?? []).toEqual([]);
  });

  test('a new place with no cast listed keeps only companions', () => {
    const first = play(seed(), 'Itachi stands beside you at the river.', {
      characters_present: ['itachi-uchiha'],
      location: 'A riverbank, Land of Fire',
    });
    const second = play(first.db, 'You reach the inn at dusk.', { location: 'An inn in Tanzaku Town' });
    expect(second.db.state.sceneCast).toEqual([]);
  });

  test('a missing field in the same place changes nothing', () => {
    const first = play(seed(), 'Itachi stands beside you at the river.', {
      characters_present: ['itachi-uchiha'],
      location: 'A riverbank, Land of Fire',
    });
    const second = play(first.db, 'The water runs on.', { mood: 'quiet' });
    expect(second.db.state.sceneCast).toEqual(['Itachi Uchiha']);
  });
});
