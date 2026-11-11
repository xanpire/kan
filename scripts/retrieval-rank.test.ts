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

import { convertStateBlock } from '../lib/rpg/stateBlock';
import { applyThreadDiff, classifyThread } from '../lib/rpg/facts';

describe('missions and goals fill in (audit 6.17)', () => {
  test('the tracker types threads and gives them importance', () => {
    const { diff } = convertStateBlock({
      threads: [{ title: 'Deliver the scroll to Tanzaku', description: null, status: 'open', type: 'quest', importance: 4, participants: [] }],
    });
    expect(diff?.threads?.[0]).toMatchObject({ type: 'quest', importance: 4 });
    const db = applyThreadDiff(seed(), diff!.threads![0]);
    const thread = db.threads.find((item) => item.title === 'Deliver the scroll to Tanzaku')!;
    expect(thread.type).toBe('quest');
    expect(thread.importance).toBe(4);
  });

  test('an update without a type never turns a quest into "other"', () => {
    let db = applyThreadDiff(seed(), { action: 'open', title: 'Escort the merchant', type: 'quest' });
    db = applyThreadDiff(db, { action: 'update', title: 'Escort the merchant', description: 'Halfway there.', type: 'other' });
    expect(db.threads.find((item) => item.title === 'Escort the merchant')!.type).toBe('quest');
  });

  test('old untyped threads are classified by their words', () => {
    expect(classifyThread('Deliver the message to Pain')).toBe('quest');
    expect(classifyThread('You promised Hana you would write')).toBe('promise');
    expect(classifyThread('You owe Kakuzu 300 ryō')).toBe('debt');
    expect(classifyThread('What really happened to Shisui?')).toBe('mystery');
    expect(classifyThread('A strange feeling')).toBe('other');
    const db = normalizeDatabase({ ...seed(), threads: [{ ...applyThreadDiff(seed(), { action: 'open', title: 'Find the deserter', type: 'other' }).threads.at(-1)! }] });
    expect(db.threads.at(-1)!.type).toBe('quest');
  });
});

import { retrieveMemories } from '../lib/rpg/retrieval';
import { buildIndices } from '../lib/rpg/db';

describe('retrieval skips what is already on the page (audit 6.6)', () => {
  test('a memory of the scene still in RECENT SCENE is not recalled; one shared with the people here ranks up', () => {
    const db = seed();
    const recent = { ...db.rawLog[0], id: 'log_recent', role: 'assistant' as const, kind: 'story' as const, content: 'You and Itachi argue by the river.' };
    const itachi = db.entities.find((entity) => entity.name === 'Itachi Uchiha')!.id;
    const event = (id: string, summary: string, extra: Record<string, unknown> = {}) => ({
      id,
      chapter: 1,
      scene: 's',
      inStoryDate: db.state.inStoryDate,
      summary,
      importance: 3 as const,
      tags: ['river'],
      pinned: false,
      sourceLogId: null,
      createdAt: 1,
      ...extra,
    });
    let next: AppDatabase = {
      ...db,
      rawLog: [...db.rawLog, recent],
      state: { ...db.state, sceneCast: ['Itachi Uchiha'] },
      events: [
        ...db.events,
        event('ev_now', 'You argue with Itachi by the river.', { turnLogId: 'log_recent' }),
        event('ev_shared', 'Years ago you and Itachi trained at the river.'),
        event('ev_named', 'Someone mentioned Itachi near a river once.'),
      ],
      eventEntities: [
        ...db.eventEntities,
        { eventId: 'ev_shared', entityId: itachi, role: 'present' as const },
        { eventId: 'ev_named', entityId: itachi, role: 'mentioned' as const },
        { eventId: 'ev_now', entityId: itachi, role: 'present' as const },
      ],
    };
    next = { ...next, indices: buildIndices(next) };
    const picked = retrieveMemories(next, { recentMessages: [recent], userMessage: '*I look at the river.*' }, 5).map((item) => item.id);
    expect(picked).not.toContain('ev_now');
    expect(picked.indexOf('ev_shared')).toBeLessThan(picked.indexOf('ev_named'));
  });
});
