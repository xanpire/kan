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
import { entityAge } from '../lib/rpg/calendar';
import { guardBondDiff, romanceBlock } from '../lib/rpg/bondGuard';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_bonds', 'Bond story'));

function play(db: AppDatabase, state: Record<string, unknown>, narration = 'Hana laughs at something you said.') {
  let next = appendStoryMessage(db, 'user', '*I talk with her.*', null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  const diff = resolveCharacterRefs(next, convertStateBlock(state).diff);
  return applyStateStep(next, diff, { turnLogId, userMessage: '*I talk with her.*', narration }, new Set());
}

const hanaBond = (db: AppDatabase) => {
  const hana = db.entities.find((entity) => entity.name === 'Hana Inuzuka')!;
  return db.bonds.find((bond) => bond.entityId === hana.id);
};

const withSceneSeq = (db: AppDatabase, seq: number): AppDatabase => ({ ...db, state: { ...db.state, sceneSeq: seq } });

describe('love and trust have a guard (audit 6.12)', () => {
  test('one reply cannot take Hana to 10/10 and lover with Kan aged 13', () => {
    const db = seed();
    const before = hanaBond(db);
    const result = play(db, {
      characters_present: ['hana-inuzuka'],
      bonds: [{ character_id: 'hana-inuzuka', affinity_change: 10, relationship: 'lover', attraction: 'strong' }],
    });
    const after = hanaBond(result.db)!;
    expect(after.affinity - (before?.affinity ?? 0)).toBeLessThanOrEqual(3);
    expect(after.relationship).not.toBe('lover');
    expect(after.relationship).not.toBe('romantic interest');
    expect(result.events.some((event) => event.kind === 'refused')).toBe(true);
  });

  test('a relationship climbs one rung per scene', () => {
    let db = seed();
    db = play(db, { characters_present: ['hana-inuzuka'], bonds: [{ character_id: 'hana-inuzuka', relationship: 'close' }] }).db;
    const first = hanaBond(db)!.relationship;
    db = play(db, { characters_present: ['hana-inuzuka'], bonds: [{ character_id: 'hana-inuzuka', relationship: 'close' }] }).db;
    expect(hanaBond(db)!.relationship).toBe(first);

    db = play(withSceneSeq(db, (db.state.sceneSeq ?? 0) + 1), {
      characters_present: ['hana-inuzuka'],
      bonds: [{ character_id: 'hana-inuzuka', relationship: 'close' }],
    }).db;
    expect(['friendly', 'close']).toContain(hanaBond(db)!.relationship);
  });

  test('romance waits until Kan is 17 with an adult, and lover waits 30 days after romantic interest', () => {
    let db = seed();
    const hana = db.entities.find((entity) => entity.name === 'Hana Inuzuka')!;
    const kan = db.entities.find((entity) => entity.name === 'Kan')!;
    const hanaAge = entityAge(db.state.inStoryDate, hana) ?? 0;
    const kanAge = entityAge(db.state.inStoryDate, kan) ?? 0;
    // Both grown: move the clock so Kan is 18.
    const year = db.state.inStoryDate.year + (18 - kanAge) + 1;
    db = {
      ...db,
      state: { ...db.state, inStoryDate: { ...db.state.inStoryDate, year } },
      bonds: db.bonds.map((bond) => (bond.entityId === hana.id ? { ...bond, relationship: 'close' as const } : bond)),
    };
    expect(hanaAge).toBeGreaterThan(0);

    db = play(db, { characters_present: ['hana-inuzuka'], bonds: [{ character_id: 'hana-inuzuka', relationship: 'romantic interest' }] }).db;
    expect(hanaBond(db)!.relationship).toBe('romantic interest');
    expect(hanaBond(db)!.romanticSince).toBeDefined();

    db = play(withSceneSeq(db, (db.state.sceneSeq ?? 0) + 1), {
      characters_present: ['hana-inuzuka'],
      bonds: [{ character_id: 'hana-inuzuka', relationship: 'lover' }],
    }).db;
    expect(hanaBond(db)!.relationship).toBe('romantic interest');

    const later = { ...db.state.inStoryDate, month: ((db.state.inStoryDate.month + 1) % 12) + 1 };
    db = withSceneSeq({ ...db, state: { ...db.state, inStoryDate: { ...later, year: later.month < db.state.inStoryDate.month ? year + 1 : year } } }, (db.state.sceneSeq ?? 0) + 2);
    db = play(db, { characters_present: ['hana-inuzuka'], bonds: [{ character_id: 'hana-inuzuka', relationship: 'lover' }] }).db;
    expect(hanaBond(db)!.relationship).toBe('lover');
  });

  test('a lore-locked heart never turns romantic, and men never do', () => {
    const db = seed();
    const kurenai = db.entities.find((entity) => entity.name.startsWith('Kurenai'))!;
    const itachi = db.entities.find((entity) => entity.name === 'Itachi Uchiha')!;
    expect(romanceBlock(db, kurenai)).toContain('lore-locked');
    expect(romanceBlock(db, itachi)).toContain('not possible');

    const guarded = guardBondDiff(
      db,
      kurenai,
      { relationship: 'close', attraction: 'none' } as never,
      { character: kurenai.name, relationship: 'romantic interest', attraction: 'warm' },
      { bigTurn: false }
    );
    expect(guarded.bond.relationship).toBeUndefined();
    expect(guarded.bond.attraction).toBeUndefined();
    expect(guarded.refused).toHaveLength(2);
  });
});
