/**
 * The save doctor (audit 11d): its repairs clear what the checker finds and
 * never lose story.
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
import { markDeceased } from '../lib/rpg/deaths';
import { checkSave } from '../lib/rpg/invariants';
import { appendStoryMessage, pushSnapshot } from '../lib/rpg/log';
import { repairSave } from '../lib/rpg/saveDoctor';
import { seedDatabase } from '../lib/rpg/seed';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_doctor', 'Doctor'));

function broken(): AppDatabase {
  let db = appendStoryMessage(appendStoryMessage(seed(), 'user', '*I wait.*', null, 0, 0), 'assistant', 'You wait.', null, 0, 0);
  db = pushSnapshot(db);
  const itachi = db.entities.find((entity) => entity.name === 'Itachi Uchiha')!;
  db = markDeceased(db, itachi.id, { cause: 'test' });
  const progress = db.state.canonProgress!;
  return {
    ...db,
    entities: db.entities.map((entity) =>
      entity.id === itachi.id ? { ...entity, companion: { since: db.state.inStoryDate, sharedScenes: 0, bondPoints: 0 } } : entity.name === 'Kan' ? { ...entity, deceased: { cause: 'test' } } : entity
    ),
    bonds: [...db.bonds, { ...db.bonds[0], id: 'b-gone', entityId: 'gone' }],
    eventEntities: [...db.eventEntities, { eventId: 'gone', entityId: itachi.id, role: 'participant' as never }],
    facts: [...db.facts, { ...db.facts[0], id: 'f-gone', subjectEntityId: 'gone', whoKnows: ['gone'] }],
    memoryJobs: [{ id: 'j', kind: 'scene', status: 'queued', attempts: 0, turnLogId: 'gone', createdAt: 0 } as never],
    snapshots: [...db.snapshots, { ...db.snapshots[0], id: 's-bad', rawLogLength: db.rawLog.length + 4 }],
    state: {
      ...db.state,
      sceneCast: [itachi.name, 'Nobody At All'],
      purse: { ryo: -30, history: [] },
      canonProgress: { ...progress, active: ['kan-joins-akatsuki'], completed: [...progress.completed, 'kan-joins-akatsuki'] },
    },
  };
}

describe('the save doctor', () => {
  test('a healthy save needs nothing', () => {
    expect(repairSave(seed()).repairs).toEqual([]);
  });

  test('every safe repair clears its rule, and no story is lost', () => {
    const db = broken();
    const before = new Set(checkSave(db).map((item) => item.code));
    for (const code of ['orphan-bond', 'orphan-link', 'orphan-fact', 'orphan-knower', 'orphan-job', 'snapshot-misaligned', 'dead-in-scene', 'dead-companion', 'purse-negative', 'canon-active-and-done', 'kan-dead']) {
      expect(before.has(code)).toBe(true);
    }

    const { db: repaired, repairs } = repairSave(db);
    expect(repairs.length).toBeGreaterThan(5);
    expect(checkSave(normalizeDatabase(repaired)).filter((item) => item.severity === 'error')).toEqual([]);
    // Story stays: the log, the memories, every person, the good snapshot.
    expect(repaired.rawLog).toEqual(db.rawLog);
    expect(repaired.events.length).toBe(db.events.length);
    expect(repaired.entities.length).toBe(db.entities.length);
    expect(repaired.snapshots.length).toBe(1);
    expect(repaired.facts.length).toBe(db.facts.length);
  });

  test('running it twice changes nothing more', () => {
    const once = repairSave(broken()).db;
    expect(repairSave(once).repairs).toEqual([]);
  });
});
