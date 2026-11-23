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
import { applyStateStep, applySummaryJob } from '../lib/rpg/memoryJobs';
import { presentFromProse } from '../lib/rpg/proseFallback';
import { seedDatabase } from '../lib/rpg/seed';
import { sharedMemories } from '../lib/rpg/sharedMemories';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import type { AppDatabase, EntityRecord, MemoryJob } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_met', 'Met'));

/** One full turn: the player's message, the narration, then the state reply applied. */
function play(db: AppDatabase, narration: string, state: Record<string, unknown> | null): AppDatabase {
  let next = appendStoryMessage(db, 'user', 'I keep going.', null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  const reply = state ? convertStateBlock(state).diff : null;
  const diff = reply ? resolveCharacterRefs(next, reply) : null;

  return applyStateStep(next, diff, { turnLogId, userMessage: 'I keep going.', narration }, new Set()).db;
}

const person = (db: AppDatabase, name: string) => db.entities.find((entity) => entity.name === name)!;
const bondOf = (db: AppDatabase, entity: EntityRecord) => db.bonds.find((bond) => bond.entityId === entity.id);

function summarizeNext(db: AppDatabase, text: string): AppDatabase {
  const job = (db.memoryJobs ?? []).find((item) => item.kind === 'scene') as MemoryJob;
  expect(job).toBeDefined();
  const result = applySummaryJob(db, job, { text, title: text.split('.')[0], memory: text, logIds: job.logIds });
  expect(result).not.toBeNull();
  return result!.db;
}

function memoryTitled(db: AppDatabase, title: string) {
  return db.events.find((event) => event.tags.includes('summary') && event.title === title)!;
}

function linked(db: AppDatabase, eventId: string) {
  return db.eventEntities
    .filter((link) => link.eventId === eventId)
    .map((link) => ({ name: db.entities.find((entity) => entity.id === link.entityId)?.name, role: link.role }))
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
}

describe('only the scene cast meets people', () => {
  test('mentioned only: unmet, no bond — even with a bond change, a grudge and an update', () => {
    let db = seed();
    db = play(db, 'Kakuzu unrolls a bounty flyer. "Sōta Mibu. A deserter, worth twenty thousand ryō."', {
      characters_present: ['kakuzu'],
      new_characters: [{ is_new: true, name: 'Sōta Mibu', age: 24, role: 'Deserter with a bounty', personality: 'reckless', speech_style: 'loud', appearance: 'scarred jaw' }],
      bonds: [{ character_id: 'Sōta Mibu', affinity_change: -2, status: 'Target', note: 'Your bounty', relationship: null, attraction: null, romance_note: null }],
      grudges: [{ character_id: 'Sōta Mibu', event: 'wronged', reason: 'You are hunting him' }],
      character_updates: [{ character_id: 'Sōta Mibu', mood: 'hunted', appearance: null }],
    });

    const sota = person(db, 'Sōta Mibu');
    expect(sota.met).toBe(false);
    expect(sota.status).toBe('Not yet met');
    expect(sota.lastSeen).toBeUndefined();
    expect(bondOf(db, sota)).toBeUndefined();

    // Kakuzu was there: met, "Newly met", and a bond.
    const kakuzu = person(db, 'Kakuzu');
    expect(kakuzu.met).toBe(true);
    expect(kakuzu.status).toBe('Newly met');
    expect(bondOf(db, kakuzu)).toBeDefined();
  });

  test('mentioned and present: "Newly met" with a bond', () => {
    let db = seed();
    db = play(db, 'A man with a scarred jaw steps out of the reeds. "You must be the one hunting me."', {
      characters_present: ['Sōta Mibu'],
      new_characters: [{ is_new: true, name: 'Sōta Mibu', age: 24, role: 'Deserter', personality: 'reckless', speech_style: 'loud', appearance: 'scarred jaw' }],
    });

    const sota = person(db, 'Sōta Mibu');
    expect(sota.met).toBe(true);
    expect(sota.status).toBe('Newly met');
    expect(sota.lastSeen).toEqual(db.state.inStoryDate);
    expect(bondOf(db, sota)?.status).toBe('Newly met');
  });

  test('someone met before is met later by stepping into a scene', () => {
    let db = seed();
    db = play(db, 'Kakuzu talks about the deserter Sōta.', {
      characters_present: ['kakuzu'],
      new_characters: [{ is_new: true, name: 'Sōta Mibu', age: 24, role: 'Deserter', personality: null, speech_style: null, appearance: null }],
    });
    expect(person(db, 'Sōta Mibu').met).toBe(false);

    db = play(db, 'Sōta Mibu drops from the bridge in front of you.', { characters_present: ['kakuzu', 'sota-mibu'] });
    expect(person(db, 'Sōta Mibu').status).toBe('Newly met');
    expect(bondOf(db, person(db, 'Sōta Mibu'))).toBeDefined();
  });

  test('"the masked man" said about Kakuzu never touches Tobi', () => {
    let db = seed();
    const narration = 'The masked man counts his coins. The masked man does not look up. Kakuzu grunts.';
    db = play(db, narration, {
      characters_present: ['kakuzu', 'the masked man'],
      bonds: [{ character_id: 'the masked man', affinity_change: -1, status: 'Wary', note: 'Cold', relationship: null, attraction: null, romance_note: null }],
      character_updates: [{ character_id: 'Masked man', mood: 'bored', appearance: null }],
      facts: [{ entity: 'the masked man', fact: 'Kakuzu collects bounties.', type: 'knowledge', who_knows: ['kan', 'the masked man'] }],
      new_characters: [{ is_new: true, name: 'The masked man', age: null, role: 'Bounty hunter', personality: null, speech_style: null, appearance: null }],
    });

    const tobi = person(db, 'Tobi');
    expect(tobi.met).toBe(false);
    expect(tobi.lastSeen).toBeUndefined();
    expect(tobi.mood).not.toBe('bored');
    expect(bondOf(db, tobi)).toBeUndefined();
    expect(db.facts.some((fact) => fact.whoKnows.includes('Tobi'))).toBe(false);
    expect(db.entities.some((entity) => /masked man/i.test(entity.name))).toBe(false);
    expect(presentFromProse(db, narration)).not.toContain('Tobi');
    expect(person(db, 'Kakuzu').met).toBe(true);
  });

  test('a failed state reply meets no one and keeps the scene cast', () => {
    let db = seed();
    db = play(db, 'Kakuzu waits.', { characters_present: ['kakuzu'] });
    db = play(db, 'Kisame Hoshigaki grins at you. Kisame Hoshigaki hefts his sword.', null);

    expect(person(db, 'Kisame Hoshigaki').met).toBe(false);
    expect(db.state.sceneCast).toEqual(['Kakuzu']);
  });
});

describe('shared memories', () => {
  test('three people in a room all get the memory, named in its text or not', () => {
    let db = seed();
    db = play(db, 'Itachi, Kisame and Kakuzu stand with you in the tower.', {
      location: 'Rain tower, upper hall',
      characters_present: ['itachi-uchiha', 'kisame-hoshigaki', 'kakuzu'],
    });
    db = play(db, 'Kisame shifts his sword. Kakuzu counts coins.', {});
    // A scene that ends is summed up once three turns wait (test run §12.4).
    db = play(db, 'No one speaks. The rain hammers the glass.', { scene_ended: true });

    db = summarizeNext(db, 'You wait in the tower hall while Itachi watches the rain.');
    const memory = memoryTitled(db, 'You wait in the tower hall while Itachi watches the rain');

    expect(linked(db, memory.id)).toEqual([
      { name: 'Itachi Uchiha', role: 'present' },
      { name: 'Kakuzu', role: 'present' },
      { name: 'Kisame Hoshigaki', role: 'present' },
    ]);

    for (const name of ['Itachi Uchiha', 'Kisame Hoshigaki', 'Kakuzu']) {
      expect(sharedMemories(db, person(db, name).id).map((event) => event.id)).toContain(memory.id);
    }
  });

  test('a memory never takes in a neighbouring scene or its cast', () => {
    let db = seed();
    // The platform: Kakuzu is there.
    db = play(db, 'Pain hands you a cloak on the platform. Kakuzu watches.', {
      location: 'Rain tower platform',
      characters_present: ['itachi-uchiha', 'kakuzu'],
    });
    db = play(db, 'Kakuzu turns away into the rain.', { characters_present: ['itachi-uchiha', 'kakuzu'], scene_ended: true });
    // The cell: only Itachi.
    db = play(db, 'The cell door closes behind you and Itachi.', {
      location: 'Rain tower, holding cell',
      characters_present: ['itachi-uchiha'],
    });
    db = play(db, 'Itachi finally tells you the truth. Kakuzu’s name never comes up again tonight.', {
      characters_present: ['itachi-uchiha'],
      scene_ended: true,
    });

    // Two scenes: summed up one at a time, never together.
    const pending = (db.memoryJobs ?? []).filter((job) => job.kind === 'scene');
    expect(pending).toHaveLength(1);
    const platformTurns = new Set(db.rawLog.filter((entry) => entry.sceneSeq === db.rawLog.find((e) => e.kind === 'story' && e.sceneSeq !== undefined)?.sceneSeq).map((e) => e.id));
    expect(pending[0].logIds?.every((id) => platformTurns.has(id))).toBe(true);

    db = summarizeNext(db, 'Pain gives you the cloak while Kakuzu watches.');
    db = summarizeNext(db, 'A bitter night in the cell with Itachi, though Kakuzu is on your mind.');

    const platform = memoryTitled(db, 'Pain gives you the cloak while Kakuzu watches');
    const cell = memoryTitled(db, 'A bitter night in the cell with Itachi, though Kakuzu is on your mind');

    expect(linked(db, platform.id)).toEqual([
      { name: 'Itachi Uchiha', role: 'present' },
      { name: 'Kakuzu', role: 'present' },
    ]);
    // Named in the cell memory's text, but not there: not linked.
    expect(linked(db, cell.id)).toEqual([{ name: 'Itachi Uchiha', role: 'present' }]);

    const kakuzu = person(db, 'Kakuzu');
    const shared = sharedMemories(db, kakuzu.id).map((event) => event.id);
    expect(shared).toContain(platform.id);
    expect(shared).not.toContain(cell.id);

    // The scene-end memories were folded into their own scene's memory only.
    expect(db.events.filter((event) => event.sourceLogId === null && event.turnLogId)).toHaveLength(0);
  });

  test('the bond page leaves out memories someone is only mentioned in', () => {
    let db = seed();
    db = play(db, 'Kakuzu waits outside.', { characters_present: ['kakuzu'] });
    const kakuzu = person(db, 'Kakuzu');
    const event = db.events[db.events.length - 1];
    db = {
      ...db,
      eventEntities: [...db.eventEntities, { eventId: event.id, entityId: kakuzu.id, role: 'mentioned' }],
    };

    expect(sharedMemories(db, kakuzu.id).map((item) => item.id)).not.toContain(event.id);
  });
});
