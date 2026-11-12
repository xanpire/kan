// Audit section 9: performance on long saves.

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
import {
  SNAPSHOT_LIMIT,
  SNAPSHOT_TAIL,
  appendStoryMessage,
  isCurrentSnapshot,
  pushSnapshot,
  restoreLastSnapshot,
} from '../lib/rpg/log';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_perf', 'Perf story'));
const line = 'Rain hisses on the river while Itachi watches the far bank in silence. '.repeat(20);

function playTurn(db: AppDatabase, i: number) {
  const withSnapshot = pushSnapshot(db);
  const withUser = appendStoryMessage(withSnapshot, 'user', `*Step ${i}.*`, null, 0, 0);
  return appendStoryMessage(withUser, 'assistant', `${line} (${i})`, 'm', 0, 0);
}

function longStory(turns: number) {
  let db = seed();
  for (let i = 0; i < turns; i += 1) db = playTurn(db, i);
  return db;
}

describe('9.1 snapshots hold what a turn can change, not the whole story', () => {
  test('a snapshot keeps the log length and the last entries only', () => {
    const db = longStory(30);
    const snapshot = db.snapshots.at(-1)!;
    expect(isCurrentSnapshot(snapshot)).toBe(true);
    expect('rawLog' in snapshot.database).toBe(false);
    expect(snapshot.rawLogTail).toHaveLength(SNAPSHOT_TAIL);
    expect(snapshot.rawLogLength).toBe(db.rawLog.length - 2);
    expect(snapshot.rawLogTail.at(-1)!.id).toBe(db.rawLog[db.rawLog.length - 3].id);
  });

  test('snapshots no longer grow with the story', () => {
    const short = longStory(40);
    const long = longStory(240);
    const size = (db: AppDatabase) => JSON.stringify(db.snapshots).length;
    expect(long.snapshots).toHaveLength(SNAPSHOT_LIMIT);
    // Before: every snapshot held the whole log, so 200 more turns added 5 copies of them.
    const addedLog = JSON.stringify(long.rawLog).length - JSON.stringify(short.rawLog).length;
    expect(size(long) - size(short)).toBeLessThan(addedLog / 20);
  });

  test('undo cuts the log back and restores the state from before the turn', () => {
    const before = longStory(10);
    const after = playTurn({ ...before, state: { ...before.state, scene: 'before' } }, 99);
    const changed = { ...after, state: { ...after.state, scene: 'after' } };
    const restored = restoreLastSnapshot(changed)!;

    expect(restored.rawLog.map((entry) => entry.id)).toEqual(before.rawLog.map((entry) => entry.id));
    expect(restored.state.scene).toBe('before');
    expect(restored.snapshots).toHaveLength(changed.snapshots.length - 1);
  });

  test('undo twice in a row walks back two turns', () => {
    const base = longStory(6);
    const one = playTurn(base, 100);
    const two = playTurn(one, 101);
    const back1 = restoreLastSnapshot(two)!;
    const back2 = restoreLastSnapshot(back1)!;
    expect(back1.rawLog.map((entry) => entry.id)).toEqual(one.rawLog.map((entry) => entry.id));
    expect(back2.rawLog.map((entry) => entry.id)).toEqual(base.rawLog.map((entry) => entry.id));
  });

  test('a change the turn made to the newest entries is undone with it', () => {
    const base = longStory(4);
    const turned = playTurn(base, 7);
    const last = base.rawLog.length - 1;
    // The state step stamps the reply before this turn (e.g. a time correction).
    const stamped = {
      ...turned,
      rawLog: turned.rawLog.map((entry, index) => (index === last ? { ...entry, content: 'changed' } : entry)),
    };
    const restored = restoreLastSnapshot(stamped)!;
    expect(restored.rawLog[last].content).toBe(base.rawLog[last].content);
  });

  test('an image painted after the snapshot stays after undo', () => {
    const base = longStory(4);
    const turned = playTurn(base, 7);
    const last = base.rawLog.length - 1;
    const painted = {
      ...turned,
      rawLog: turned.rawLog.map((entry, index) => (index === last ? { ...entry, image: 'img:pic_1' } : entry)),
    };
    expect(restoreLastSnapshot(painted)!.rawLog[last].image).toBe('img:pic_1');
  });

  test('a log that no longer matches the snapshot gives nothing to undo', () => {
    const turned = playTurn(longStory(4), 7);
    expect(restoreLastSnapshot({ ...turned, rawLog: turned.rawLog.slice(0, 3) })).toBeNull();
    const swapped = turned.rawLog.map((entry, index) => (index === 6 ? { ...entry, id: 'other' } : entry));
    expect(restoreLastSnapshot({ ...turned, rawLog: swapped })).toBeNull();
  });

  test('old snapshots holding the whole log are dropped when the save loads', () => {
    const db = longStory(3);
    const legacy = {
      id: 'snapshot_old',
      turn: 1,
      database: { ...db, snapshots: [] },
      createdAt: 1,
    };
    const loaded = normalizeDatabase({ ...db, snapshots: [legacy as any, ...db.snapshots] });
    expect(loaded.snapshots).toHaveLength(db.snapshots.length);
    expect(loaded.snapshots.every(isCurrentSnapshot)).toBe(true);
  });

  test('a story from the very first turn can be undone', () => {
    const empty = { ...seed(), rawLog: [] };
    const turned = playTurn(empty, 0);
    expect(turned.snapshots.at(-1)!.rawLogTail).toHaveLength(0);
    expect(restoreLastSnapshot(turned)!.rawLog).toHaveLength(0);
  });
});

import { applyTurnDiff } from '../lib/rpg/services';
import { buildIndices } from '../lib/rpg/db';
import { emptyIndex } from '../lib/rpg/defaults';

describe('9.3 a turn copies only what it can change', () => {
  test('the story log and snapshots are shared, and the input save is left alone', () => {
    const db = longStory(5);
    const before = JSON.stringify(db);
    const next = applyTurnDiff(db, { state: { mood: 'wary', location: 'The river' } } as any);
    expect(next.rawLog).toBe(db.rawLog);
    expect(next.snapshots).toBe(db.snapshots);
    expect(next.state.location).toBe('The river');
    expect(next.state).not.toBe(db.state);
    expect(JSON.stringify(db)).toBe(before);
  });
});

describe('9.4 indices in one pass', () => {
  // The old version: every link read for every event, `includes` for duplicates.
  function oldIndices(db: AppDatabase) {
    const index = emptyIndex();
    const push = (record: Record<string, string[]>, key: string, value: string) => {
      if (!record[key]) record[key] = [];
      if (!record[key].includes(value)) record[key].push(value);
    };
    for (const event of db.events) {
      const d = event.inStoryDate;
      push(index.eventsByDate, `${String(d.year).padStart(2, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`, event.id);
      for (const tag of event.tags) push(index.eventsByTag, tag.toLowerCase(), event.id);
      for (const link of db.eventEntities) if (link.eventId === event.id) push(index.eventsByEntity, link.entityId, event.id);
    }
    for (const fact of db.facts) if (fact.subjectEntityId) push(index.factsBySubject, fact.subjectEntityId, fact.id);
    for (const thread of db.threads) push(index.threadsByStatus, thread.status, thread.id);
    for (const lore of db.loreEntries) for (const keyword of lore.keywords) push(index.loreByKeyword, keyword.toLowerCase(), lore.id);
    return index;
  }

  test('gives the same index as before, duplicates included', () => {
    const db = seed();
    const template = db.events[0];
    const events = Array.from({ length: 300 }, (_, i) => ({
      ...template,
      id: `ev_${i}`,
      tags: [`Tag${i % 7}`, `tag${i % 7}`, 'Rain'],
      inStoryDate: { ...template.inStoryDate, day: 1 + (i % 28) },
    }));
    const entities = db.entities.slice(0, 20);
    const eventEntities = events.flatMap((event, i) => [
      { ...(db.eventEntities[0] ?? {}), eventId: event.id, entityId: entities[i % 20].id },
      { ...(db.eventEntities[0] ?? {}), eventId: event.id, entityId: entities[(i * 3) % 20].id },
      { ...(db.eventEntities[0] ?? {}), eventId: event.id, entityId: entities[i % 20].id },
    ]);
    const big = { ...db, events, eventEntities } as AppDatabase;
    expect(buildIndices(big)).toEqual(oldIndices(big));
    expect(buildIndices(db)).toEqual(oldIndices(db));
  });
});

describe('9.6 stray JSON is cleaned once, not on every load', () => {
  test('an old reply with a state block is cleaned on load; a clean reply is left as saved', () => {
    let db = seed();
    db = appendStoryMessage(db, 'assistant', 'Rain falls.\n\n```json\n{"state": {"mood": "wary"}}\n```', 'm', 0, 0);
    db = appendStoryMessage(db, 'assistant', 'Itachi says nothing.', 'm', 0, 0);
    const loaded = normalizeDatabase(db);
    const [dirty, clean] = loaded.rawLog.slice(-2);
    expect(dirty.content).toBe('Rain falls.');
    expect(clean).toBe(db.rawLog[db.rawLog.length - 1]);
  });
});
