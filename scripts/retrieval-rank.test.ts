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
import { relevantFacts } from '../lib/rpg/retrieval';
import { buildNarrationPrompt } from '../lib/rpg/prompt';
import type { AppDatabase, FactRecord, ThreadRecord } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_rank', 'Rank story'));
const date = (year: number, month = 1) => ({ year, month, day: 1, hour: 8, minute: 0, second: 0 });

function fact(id: string, text: string, extra: Partial<FactRecord> = {}): FactRecord {
  return {
    id,
    subjectEntityId: null,
    type: 'other',
    text,
    whoKnows: [],
    validFrom: date(13),
    validTo: null,
    confidence: 'confirmed',
    ...extra,
  } as FactRecord;
}

describe('facts are ranked (audit 6.3)', () => {
  test("Kan's wound and the people in the scene come first; the text match is case-blind", () => {
    const db = seed();
    const kan = db.entities.find((entity) => entity.name === 'Kan')!.id;
    const itachi = db.entities.find((entity) => entity.name === 'Itachi Uchiha')!.id;
    const facts = [
      ...Array.from({ length: 12 }, (_, index) => fact(`old_${index}`, `An old unrelated rumour number ${index} about distant harvests.`, { validFrom: date(5) })),
      fact('wound', 'Your left arm is cut deep and bandaged.', { subjectEntityId: kan, type: 'injury' }),
      fact('itachi', 'Itachi hides a cough from everyone.', { subjectEntityId: itachi, type: 'secret' }),
      fact('lantern', 'The Lantern Festival in Tanzaku Town draws gamblers every autumn.'),
    ];
    const withFacts: AppDatabase = { ...db, facts: [...db.facts, ...facts] };
    const picked = relevantFacts(withFacts, new Set([itachi]), 'You reach TANZAKU town as the lantern festival begins.', new Set([itachi]));
    const ids = picked.map((item) => item.id);
    expect(ids[0]).toBe('wound');
    expect(ids).toContain('itachi');
    expect(ids).toContain('lantern');
    expect(ids.indexOf('itachi')).toBeLessThan(ids.indexOf('lantern'));
    expect(ids).not.toContain('old_0');
  });

  test('with nothing to go on, the newest facts, not the oldest', () => {
    const db = seed();
    const facts = Array.from({ length: 8 }, (_, index) => fact(`f_${index}`, `Plain note ${index}.`, { validFrom: date(5 + index) }));
    const picked = relevantFacts({ ...db, facts }, new Set(), 'Nothing here matches.');
    expect(picked[0].id).toBe('f_7');
    expect(picked.map((item) => item.id)).not.toContain('f_0');
  });
});

describe('threads are ranked (audit 6.4)', () => {
  test('an old important promise stays on the list', () => {
    const db = seed();
    const thread = (id: string, title: string, importance: 1 | 2 | 3 | 4 | 5, year: number): ThreadRecord => ({
      id,
      type: 'promise',
      title,
      description: title,
      status: 'open',
      openedAt: date(year),
      resolvedAt: null,
      importance,
      participants: [],
      sourceEventId: null,
    });
    const threads = [
      thread('vow', 'The vow at Izumi grave', 5, 13),
      ...Array.from({ length: 10 }, (_, index) => thread(`small_${index}`, `Small errand ${index}`, 2, 15)),
    ];
    const text = buildNarrationPrompt({ ...db, threads }, '*I wait.*').messages.map((message) => message.content).join('\n');
    expect(text).toContain('The vow at Izumi grave');
  });
});
