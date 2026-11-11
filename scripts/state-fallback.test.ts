import { describe, expect, test, mock } from 'bun:test';

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
import { parseJsonObject, repairTruncatedJson } from '../lib/rpg/stateBlock';
import { fallbackDiffFromProse, kanJutsuFromMessage, preferPlayerJutsuNames, presentFromProse } from '../lib/rpg/proseFallback';
import { applyTurnDiff } from '../lib/rpg/services';
import { deleteJutsuRecord, isBareNatureName, renameJutsuRecord } from '../lib/rpg/jutsu';
import { applyStateStep } from '../lib/rpg/memoryJobs';

const seed = () => normalizeDatabase(seedDatabase('slot_test', 'Test story'));

describe('repairTruncatedJson', () => {
  test('keeps the complete part of a cut-off reply', () => {
    const cut = '{"elapsed_seconds": 120, "scene_pace": "conversation", "present": ["Itachi Uchiha", "Kisa';
    expect(parseJsonObject(cut)).toBeNull();
    const repaired = repairTruncatedJson(cut);
    expect(repaired?.elapsed_seconds).toBe(120);
    expect(repaired?.scene_pace).toBe('conversation');
    expect(repaired?.present).toEqual(['Itachi Uchiha']);
  });

  test('handles cuts inside nested objects and strings with braces and commas', () => {
    const cut = '{"bonds": [{"character": "Itachi", "note": "a, {tense} talk", "delta": 2}, {"character": "Kis';
    const repaired = repairTruncatedJson(cut) as { bonds: Array<Record<string, unknown>> };
    expect(repaired.bonds).toHaveLength(2);
    expect(repaired.bonds[0].note).toBe('a, {tense} talk');
  });

  test('gives up on nothing usable', () => {
    expect(repairTruncatedJson('I could not')).toBeNull();
    expect(repairTruncatedJson('{"elap')).toBeNull();
  });
});

describe('prose fallback', () => {
  test('records people the narration shows in the scene', () => {
    const db = seed();
    const narration =
      'Itachi stands at the treeline. Rain beads on his cloak. Itachi does not look back at you.';
    expect(presentFromProse(db, narration)).toContain('Itachi Uchiha');
  });

  test('ignores a single passing mention of someone new', () => {
    const db = seed();
    const present = presentFromProse(db, 'Somewhere far off, people still whisper about Orochimaru.');
    expect(present).not.toContain('Orochimaru');
  });

  test('pulls jutsu from the player message', () => {
    const db = seed();
    expect(kanJutsuFromMessage(db, 'I weave the signs for Fire Style: Fireball Jutsu.')).toEqual([
      'Fire Style: Fireball Jutsu',
    ]);
    expect(kanJutsuFromMessage(db, 'I use Shadow Clone Jutsu and slip away.')).toEqual([
      'Shadow Clone Jutsu',
    ]);
    expect(kanJutsuFromMessage(db, 'I reach for Thousand Souls.')).toEqual(['Thousand Souls']);
    expect(kanJutsuFromMessage(db, 'I ask Itachi about the Shadow Clone Jutsu.')).toEqual([]);
    expect(kanJutsuFromMessage(db, 'I nod and keep walking.')).toEqual([]);
  });

  test('an unreadable turn still records jutsu; who the prose shows is only a suggestion', () => {
    const db = seed();
    const turnLogId = db.rawLog.filter((entry) => entry.role === 'assistant').at(-1)?.id ?? 'log_x';
    const turn = {
      turnLogId,
      userMessage: 'I use Shadow Clone Jutsu.',
      narration: 'Itachi watches your clones scatter. Itachi says nothing.',
    };
    expect(fallbackDiffFromProse(db, turn)?.jutsuUsed?.[0]?.name).toBe('Shadow Clone Jutsu');

    const result = applyStateStep(db, null, turn, new Set());
    expect(result.db.jutsuRecords.some((r) => r.name === 'Shadow Clone Jutsu' && r.user === 'Kan')).toBe(true);
    expect(result.appliedDiff?.suggestedCast).toContain('Itachi Uchiha');
    // Only the state reply's characters_present stamps who was seen.
    const before = db.entities.find((e) => e.name === 'Itachi Uchiha');
    const itachi = result.db.entities.find((e) => e.name === 'Itachi Uchiha');
    expect(itachi?.lastSeen).toEqual(before?.lastSeen);
    // People Kan has met join the scene cast (audit 6.16); nobody new is met.
    const expected = before?.met === false ? (db.state.sceneCast ?? []) : [...(db.state.sceneCast ?? []), 'Itachi Uchiha'];
    expect(result.db.state.sceneCast ?? []).toEqual(expected);
  });
});

describe('state call retry', () => {
  const reply = (content: string, finish: string) =>
    new Response(
      JSON.stringify({
        id: 'gen',
        choices: [{ message: { content }, finish_reason: finish }],
        usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0 },
      }),
      { status: 200 }
    );

  test('retries once with more room when the reply was cut off, and sends low reasoning', async () => {
    const { extractTurnDiff } = await import('../lib/rpg/services');
    const bodies: Array<Record<string, unknown>> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      if (init?.body) bodies.push(JSON.parse(String(init.body)));
      return bodies.length === 1 ? reply('{"scene_pace": "comb', 'length') : reply('{}', 'stop');
    }) as typeof fetch;

    try {
      await extractTurnDiff({ apiKey: 'k', db: seed(), userMessage: 'I wait.', assistantMessage: 'Rain.' });
    } finally {
      globalThis.fetch = original;
    }

    const chat = bodies.filter((body) => 'messages' in body);
    expect(chat).toHaveLength(2);
    expect(chat[0].max_tokens).toBe(3000);
    expect(chat[1].max_tokens).toBe(4500);
    expect(chat[0].reasoning).toEqual({ exclude: true, effort: 'low' });
  });
});

describe('jutsu names stay as the player wrote them', () => {
  test('custom style names are read from the message, any case', () => {
    const db = seed();
    expect(kanJutsuFromMessage(db, 'I use Fire Style: Hell on them.')).toEqual(['Fire Style: Hell']);
    expect(kanJutsuFromMessage(db, 'I use fire style: Hell.')).toEqual(['fire style: Hell']);
    expect(kanJutsuFromMessage(db, 'I slam my palms down. Lava Release: Rubber Wall!')).toEqual([
      'Lava Release: Rubber Wall',
    ]);
    expect(kanJutsuFromMessage(db, 'I breathe out Katon: Gōkakyū no Jutsu.')).toEqual([
      'Katon: Gōkakyū no Jutsu',
    ]);
  });

  test('Style and Release are the same name', () => {
    let db = seed();
    db = applyTurnDiff(db, { jutsuUsed: [{ name: 'Fire Style: Hell', user: 'Kan' }] });
    db = applyTurnDiff(db, { jutsuUsed: [{ name: 'Fire Release: Hell', user: 'Kan' }] });
    const records = db.jutsuRecords.filter((record) => record.user === 'Kan' && /hell/i.test(record.name));
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe('Fire Style: Hell');
    expect(records[0].timesUsed).toBe(2);
    expect(kanJutsuFromMessage(db, 'Again: Fire Release: Hell.')).toEqual(['Fire Style: Hell']);
  });

  test('a generic name from the state model is replaced by the player name', () => {
    const db = seed();
    const diff = preferPlayerJutsuNames(
      db,
      { jutsuUsed: [{ name: 'Fire Release', user: 'Kan', chakraNature: 'Fire', effect: 'a wall of flame' }] },
      'I use Fire Style: Hell.'
    );
    expect(diff.jutsuUsed).toEqual([
      { name: 'Fire Style: Hell', user: 'Kan', chakraNature: 'Fire', effect: 'a wall of flame' },
    ]);
  });

  test('a jutsu the state model missed is added; others are untouched', () => {
    const db = seed();
    const diff = preferPlayerJutsuNames(
      db,
      { jutsuUsed: [{ name: 'Water Prison Jutsu', user: 'Kisame Hoshigaki' }] },
      'I answer with Fire Style: Hell.'
    );
    expect(diff.jutsuUsed?.map((item) => item.name)).toEqual(['Water Prison Jutsu', 'Fire Style: Hell']);
  });
});

describe('meeting someone', () => {
  const unmet = (db: ReturnType<typeof seed>) =>
    db.entities.find((entity) => entity.met === false && entity.status === 'Not yet met' && !entity.deceased)!;

  test('first seen in a scene: "Newly met" and a bond', () => {
    const db = seed();
    const person = unmet(db);
    const next = applyTurnDiff(db, { scene: { ended: false, entities: [person.name] } });
    const after = next.entities.find((entity) => entity.id === person.id)!;
    expect(after.met).toBe(true);
    expect(after.status).toBe('Newly met');
    expect(next.bonds.some((bond) => bond.entityId === person.id)).toBe(true);
  });

  test('a failed state turn meets no one, even someone the prose names', () => {
    const db = seed();
    const person = unmet(db);
    const first = person.name.split(' ')[0];
    const turnLogId = db.rawLog.filter((entry) => entry.role === 'assistant').at(-1)?.id ?? 'log_x';
    const result = applyStateStep(
      db,
      null,
      { turnLogId, userMessage: 'I wait.', narration: `${person.name} steps out of the rain. ${first} studies you.` },
      new Set()
    );
    const after = result.db.entities.find((entity) => entity.id === person.id)!;
    expect(after.met).toBe(false);
    expect(after.status).toBe('Not yet met');
    expect(result.db.bonds.some((bond) => bond.entityId === person.id)).toBe(false);
  });

  test('old saves with a met person stuck on "Not yet met" are repaired', () => {
    const db = seed();
    const person = unmet(db);
    const broken = {
      ...db,
      entities: db.entities.map((entity) => (entity.id === person.id ? { ...entity, met: true } : entity)),
    };
    const fixed = normalizeDatabase(broken);
    expect(fixed.entities.find((entity) => entity.id === person.id)?.status).toBe('Newly met');
    expect(fixed.bonds.some((bond) => bond.entityId === person.id)).toBe(true);
  });
});

describe('fixing jutsu by hand', () => {
  const withJutsu = () => {
    let db = seed();
    db = applyTurnDiff(db, { jutsuUsed: [{ name: 'Fire Style: Hell', user: 'Kan', chakraNature: 'Fire' }] });
    db = applyTurnDiff(db, { jutsuUsed: [{ name: 'Phoenix Flower', user: 'Kan', chakraNature: 'Fire' }] });
    return db;
  };

  test('rename changes the record and Kan\'s list', () => {
    let db = withJutsu();
    db = { ...db, state: { ...db.state, jutsu: [...db.state.jutsu, 'Phoenix Flower'] } };
    const record = db.jutsuRecords.find((item) => item.name === 'Phoenix Flower')!;
    const next = renameJutsuRecord(db, record.id, 'Fire Style: Phoenix Flower Jutsu');
    expect(next.jutsuRecords.find((item) => item.id === record.id)?.name).toBe('Fire Style: Phoenix Flower Jutsu');
    expect(next.state.jutsu).toContain('Fire Style: Phoenix Flower Jutsu');
    expect(next.state.jutsu).not.toContain('Phoenix Flower');
  });

  test('renaming onto an existing name merges the two', () => {
    const db = withJutsu();
    const record = db.jutsuRecords.find((item) => item.name === 'Phoenix Flower')!;
    const next = renameJutsuRecord(db, record.id, 'Fire Release: Hell');
    const hell = next.jutsuRecords.filter((item) => item.user === 'Kan' && /hell/i.test(item.name));
    expect(hell).toHaveLength(1);
    expect(hell[0].timesUsed).toBe(2);
    expect(next.jutsuRecords.some((item) => item.id === record.id)).toBe(false);
  });

  test('delete removes the record', () => {
    const db = withJutsu();
    const record = db.jutsuRecords.find((item) => item.name === 'Fire Style: Hell')!;
    const next = deleteJutsuRecord(db, record.id);
    expect(next.jutsuRecords.some((item) => item.id === record.id)).toBe(false);
  });

  test('bare element names are never kept as jutsu', () => {
    expect(isBareNatureName('Fire Release')).toBe(true);
    expect(isBareNatureName('water style:')).toBe(true);
    expect(isBareNatureName('Fire Style: Hell')).toBe(false);
    expect(isBareNatureName('Shadow Clone Jutsu')).toBe(false);

    const db = seed();
    const fresh = applyTurnDiff(db, { jutsuUsed: [{ name: 'Fire Release', user: 'Kan' }] });
    expect(fresh.jutsuRecords.some((item) => item.name === 'Fire Release')).toBe(false);

    const old = {
      ...db,
      jutsuRecords: [
        ...db.jutsuRecords,
        { ...withJutsu().jutsuRecords.at(-1)!, id: 'jutsu_old', name: 'Fire Release' },
      ],
      state: { ...db.state, jutsu: [...db.state.jutsu, 'Fire Release'] },
    };
    const cleaned = normalizeDatabase(old);
    expect(cleaned.jutsuRecords.some((item) => item.name === 'Fire Release')).toBe(false);
    expect(cleaned.state.jutsu).not.toContain('Fire Release');
  });
});
