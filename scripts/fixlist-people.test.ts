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
import { resolveCharacterRefs } from '../lib/rpg/entities';
import { appendStoryMessage } from '../lib/rpg/log';
import { applyStateStep, CHAPTER_MIN_TURNS } from '../lib/rpg/memoryJobs';
import { seedDatabase } from '../lib/rpg/seed';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_people', 'People'));

function play(db: AppDatabase, narration: string, state: Record<string, unknown> | null): AppDatabase {
  let next = appendStoryMessage(db, 'user', 'I keep going.', null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  const reply = state ? convertStateBlock(state).diff : null;
  const diff = reply ? resolveCharacterRefs(next, reply) : null;

  return applyStateStep(next, diff, { turnLogId, userMessage: 'I keep going.', narration }, new Set()).db;
}

const person = (db: AppDatabase, name: string) => db.entities.find((entity) => entity.name === name)!;
const bondOf = (db: AppDatabase, name: string) => db.bonds.find((bond) => bond.entityId === person(db, name).id)!;

describe('10. real chapters', () => {
  test('summaries and scene ends never move the chapter; a break needs a real reason and enough story', () => {
    let db = seed();
    expect(db.state.chapterTitle).toBe('The flight from the Leaf');

    // Many scenes ending, and an early chapter title, change nothing.
    db = play(db, 'You run.', { scene_ended: true, chapter_title: 'Too soon' });
    for (let i = 0; i < CHAPTER_MIN_TURNS; i += 1) {
      db = play(db, `Turn ${i}`, { scene_ended: i % 2 === 0, time: { elapsed: 20, unit: 'minutes', clock_time: null } });
    }
    expect(db.state.chapter).toBe(1);

    db = play(db, 'The Rain rises out of the mist.', { chapter_title: 'The road to the Rain', location: 'Hidden Rain outskirts' });
    expect(db.state.chapter).toBe(2);
    expect(db.state.chapterTitle).toBe('The road to the Rain');
    expect(db.state.chapters).toEqual([expect.objectContaining({ chapter: 1, title: 'The flight from the Leaf' })]);
    expect(db.rawLog.at(-1)?.chapter).toBe(2);

    // Right after a break, even a time skip waits for the minimum.
    db = play(db, 'Three days pass.', { time: { elapsed: 3, unit: 'days', clock_time: null } });
    expect(db.state.chapter).toBe(2);
  });
});

describe('12. threads are not opened twice', () => {
  test('a lowercase copy of a seeded thread updates it; new threads keep their casing and people', () => {
    let db = seed();
    const before = db.threads.length;
    db = play(db, 'Itachi asks again.', {
      characters_present: ['itachi-uchiha'],
      threads: [{ title: "itachi's offer: join akatsuki", description: 'He is waiting for your answer.', status: 'open', participants: [] }],
    });
    expect(db.threads.length).toBe(before);
    expect(db.threads.find((thread) => thread.title === 'Itachi’s offer: join Akatsuki')?.description).toBe('He is waiting for your answer.');

    db = play(db, 'Kakuzu names a bounty.', {
      characters_present: ['kakuzu'],
      threads: [{ title: 'collect the bounty on the deserter', description: 'Kakuzu wants the deserter’s head.', status: 'open', participants: [] }],
    });
    const thread = db.threads.at(-1)!;
    expect(thread.title).toBe('Collect the bounty on the deserter');
    expect(thread.participantIds).toEqual([person(db, 'Kan').id, person(db, 'Kakuzu').id]);
    expect(thread.sourceLogId).toBe(db.rawLog.at(-1)?.id);
    expect(thread.sourceEventId).not.toBeNull();
  });
});

describe('13. romance follows who someone is', () => {
  test('men are never romance options; new women by who they are drawn to', () => {
    let db = seed();
    expect(person(db, 'Kakashi Hatake').romanceAccessibility).toBe('not-applicable');
    expect(person(db, 'Itachi Uchiha').romanceAccessibility).toBe('not-applicable');
    expect(person(db, 'Kan').romanceAccessibility).toBeUndefined();

    db = play(db, 'Three travellers share the fire.', {
      new_characters: [
        { is_new: true, name: 'Sōta Mibu', age: 24, role: 'Deserter', personality: null, speech_style: null, appearance: null, gender: 'male', attracted_to: 'women' },
        { is_new: true, name: 'Aiko Mori', age: 18, role: 'Courier', personality: null, speech_style: null, appearance: null, gender: 'female', attracted_to: 'men' },
        { is_new: true, name: 'Rei Kudo', age: 30, role: 'Smith', personality: null, speech_style: null, appearance: null, gender: 'female', attracted_to: null },
      ],
    });
    expect(person(db, 'Sōta Mibu').romanceAccessibility).toBe('not-applicable');
    expect(person(db, 'Aiko Mori').romanceAccessibility).toBe('winnable');
    expect(person(db, 'Rei Kudo').romanceAccessibility).toBeUndefined();
  });
});

describe('14. two-sided bonds', () => {
  test('Itachi starts as an old friend with both sides high', () => {
    const db = seed();
    const itachi = bondOf(db, 'Itachi Uchiha');
    expect(itachi.relationship).toBe('old friend');
    expect(itachi.theirFeelings?.affinity).toBe(8);
    expect(itachi.yourFeelings?.affinity).toBe(7);
  });

  test('your inner thoughts move only your side; what they see moves theirs', () => {
    let db = seed();
    db = play(db, 'You think you will never forgive him.', {
      characters_present: ['itachi-uchiha'],
      bonds: [{ character_id: 'itachi-uchiha', affinity_change: null, status: null, note: null, relationship: null, attraction: null, romance_note: null, your_change: -2, your_note: 'You will never forgive him.' }],
    });
    const after = bondOf(db, 'Itachi Uchiha');
    expect(after.yourFeelings).toEqual({ affinity: 5, note: 'You will never forgive him.' });
    expect(after.theirFeelings?.affinity).toBe(8);
    expect(after.affinity).toBe(8);
    expect(after.relationship).toBe('old friend');
  });
});
