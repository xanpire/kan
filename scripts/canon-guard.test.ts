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
import { applyStateStep } from '../lib/rpg/memoryJobs';
import { filterCanonMarks, newsOffer, trackedCanonBeats } from '../lib/rpg/newsDelivery';
import { isDeceased } from '../lib/rpg/deaths';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_canon_guard', 'Canon guard'));
const lastReply = (db: AppDatabase) => db.rawLog.filter((entry) => entry.role === 'assistant').at(-1)?.id ?? 'log_x';

describe('canon marks (audit 6.18)', () => {
  test('a tracker reply cannot kill Jiraiya or grant the Mangekyō years early', () => {
    const db = seed();
    const turn = { turnLogId: lastReply(db), userMessage: '*I keep walking.*', narration: 'You walk on through the rain. The road is empty.' };
    const result = applyStateStep(
      db,
      { canonCompleted: ['jiraiya-dies', 'kan-mangekyo'] },
      turn,
      new Set()
    );

    const jiraiya = result.db.entities.find((entity) => entity.name === 'Jiraiya');
    expect(jiraiya && isDeceased(jiraiya)).toBe(false);
    expect(JSON.stringify(result.db.state)).not.toContain('"kan-mangekyo"');
    expect(result.events.filter((event) => event.kind === 'dropped')).toHaveLength(2);
    expect(result.events[0].text).toContain('jiraiya-dies');
  });

  test('beats the tracker was shown are still accepted', () => {
    const db = seed();
    const { active, offered } = trackedCanonBeats(db);
    const shown = [...active, ...offered].map((milestone) => milestone.id);
    const marks = filterCanonMarks(db, { completed: [...shown, 'jiraiya-dies'], engaged: shown });
    expect(marks.completed).toEqual(shown);
    expect(marks.engaged).toEqual(shown);
    expect(marks.dropped.map((drop) => drop.id)).toEqual(['jiraiya-dies']);
  });

  test('news sent as completed is read as relayed news, not a witnessed beat', () => {
    const db = seed();
    const offer = newsOffer(db, { ignoreCombat: true });

    if (!offer) {
      // The seed offers no news: the rule still holds for an id outside the offer.
      expect(filterCanonMarks(db, { completed: ['jiraiya-dies'] }).relayed).toEqual([]);
      return;
    }

    const id = offer.items[0].milestoneId;
    const marks = filterCanonMarks(db, { completed: [id] });
    expect(marks.completed).toEqual([]);
    expect(marks.relayed).toEqual([{ id }]);
  });

  test('canon_passed only for an active beat', () => {
    const db = seed();
    expect(filterCanonMarks(db, { passed: ['jiraiya-dies'] }).passed).toEqual([]);
  });
});
