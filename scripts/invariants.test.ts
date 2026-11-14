/**
 * The invariant checker (audit 11d): each rule fires on a broken save and is
 * quiet on a healthy one. Plus the Session 1 fixes it caught on the way:
 * quick actions naming jutsu Kan doesn't have, the joining teaching Kakuzu's
 * name, and tracker-written threads scrubbed of unknown names.
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
import { resolveCharacterRefs } from '../lib/rpg/entities';
import { checkSave, checkTurn } from '../lib/rpg/invariants';
import { unknownJutsuInOption } from '../lib/rpg/jutsu';
import { appendStoryMessage, pushSnapshot } from '../lib/rpg/log';
import { applyStateStep } from '../lib/rpg/memoryJobs';
import { displayName } from '../lib/rpg/names';
import { cleanFightOptions } from '../lib/rpg/sceneMode';
import { seedDatabase } from '../lib/rpg/seed';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import { advanceSeconds, shiftSeconds } from '../lib/rpg/calendar';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_inv', 'Invariants'));
const codes = (db: AppDatabase) => checkSave(db).map((item) => item.code);
const person = (db: AppDatabase, name: string) => db.entities.find((entity) => entity.name === name)!;

function withReply(db: AppDatabase, narration: string) {
  let next = appendStoryMessage(db, 'user', '*I wait.*', null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  return { db: next, turnLogId: next.rawLog[next.rawLog.length - 1].id };
}

function play(db: AppDatabase, input: string, narration: string, state: Record<string, unknown> | null) {
  let next = appendStoryMessage(db, 'user', input, null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  const diff = state ? resolveCharacterRefs(next, convertStateBlock(state).diff) : null;
  return applyStateStep(next, diff, { turnLogId, userMessage: input, narration }, new Set());
}

const turn = (turnLogId: string, extra: Partial<Parameters<typeof checkTurn>[2]> = {}) => ({
  turnLogId,
  userMessage: '*I wait.*',
  narration: '',
  pace: 'conversation' as const,
  sceneEnded: false,
  ...extra,
});

describe('a healthy save breaks no rule', () => {
  test('a fresh story', () => {
    expect(checkSave(seed())).toEqual([]);
  });

  test('a played turn', () => {
    const result = play(seed(), '*I wait.*', 'The rain keeps falling on the branches above you.', { characters_present: [] });
    expect(result.events.filter((event) => event.kind === 'violation')).toEqual([]);
  });
});

describe('each rule fires', () => {
  test('the dead in the scene, the dead and the reanimated as companions', () => {
    const base = seed();
    const itachi = person(base, 'Itachi Uchiha');
    const dead = markDeceased(base, itachi.id, { cause: 'test' });
    expect(codes({ ...dead, state: { ...dead.state, sceneCast: [itachi.name] } })).toContain('dead-in-scene');

    const companion = dead.entities.map((entity) =>
      entity.id === itachi.id ? { ...entity, companion: { since: dead.state.inStoryDate, sharedScenes: 0, bondPoints: 0 } } : entity
    );
    expect(codes({ ...dead, entities: companion })).toContain('dead-companion');

    const walking = companion.map((entity) => (entity.id === itachi.id ? { ...entity, reanimated: { since: dead.state.inStoryDate } } : entity));
    expect(codes({ ...dead, entities: walking })).toContain('reanimated-companion');
    // Reanimated and only in the scene is fine.
    const scene = walking.map((entity) => (entity.id === itachi.id ? { ...entity, companion: undefined } : entity));
    expect(codes({ ...dead, entities: scene, state: { ...dead.state, sceneCast: [itachi.name] } })).not.toContain('dead-in-scene');
  });

  test('two people sharing a name', () => {
    const db = seed();
    const entities = db.entities.map((entity) => (entity.name === 'Kisame Hoshigaki' ? { ...entity, aliases: [...entity.aliases, 'Itachi Uchiha'] } : entity));
    expect(codes({ ...db, entities })).toContain('shared-name');
  });

  test('ids that point nowhere', () => {
    const db = seed();
    const bond = { ...db.bonds[0], entityId: 'gone' };
    expect(codes({ ...db, bonds: [bond, ...db.bonds.slice(1)] })).toContain('orphan-bond');
    expect(codes({ ...db, eventEntities: [{ eventId: 'gone', entityId: db.entities[0].id, role: 'participant' as never }] })).toContain('orphan-link');
  });

  test('a negative purse, JSON in a reply, a beat both open and done', () => {
    const db = seed();
    expect(codes({ ...db, state: { ...db.state, purse: { ryo: -5, history: [] } } })).toContain('purse-negative');
    expect(codes(withReply(db, 'You wait. {"state": {"mood": "tense"}}').db)).toContain('json-in-reply');
    const progress = db.state.canonProgress!;
    const both = { ...db, state: { ...db.state, canonProgress: { ...progress, active: ['kan-joins-akatsuki'], completed: [...progress.completed, 'kan-joins-akatsuki'] } } };
    expect(codes(both)).toContain('canon-active-and-done');
  });

  test('a missing image, an orphan job, a snapshot that no longer lines up', () => {
    const { db } = withReply(seed(), 'You wait.');
    const withImage = { ...db, rawLog: db.rawLog.map((entry, index) => (index === db.rawLog.length - 1 ? { ...entry, image: 'img:abc' } : entry)) };
    expect(checkSave(withImage, { imageKeys: new Set() }).map((item) => item.code)).toContain('missing-image');
    expect(checkSave(withImage, { imageKeys: new Set(['abc']) }).map((item) => item.code)).not.toContain('missing-image');

    const job = { id: 'j', kind: 'scene' as const, status: 'queued' as const, attempts: 0, turnLogId: 'gone', createdAt: 0 };
    expect(codes({ ...db, memoryJobs: [job] as never })).toContain('orphan-job');

    const snapped = pushSnapshot(db);
    expect(codes(snapped)).not.toContain('snapshot-misaligned');
    expect(codes({ ...snapped, rawLog: snapped.rawLog.slice(0, -2) })).toContain('snapshot-misaligned');
  });

  test('Kan marked dead', () => {
    const db = seed();
    const entities = db.entities.map((entity) => (entity.name === 'Kan' ? { ...entity, deceased: { cause: 'test' } } : entity));
    expect(codes({ ...db, entities })).toContain('kan-dead');
  });

  test('a goal open before Kan knows what it rests on', () => {
    const db = seed();
    const thread = {
      id: 'thread_hook_survive-kakuzu',
      type: 'goal' as const,
      title: 'Survive Kakuzu',
      description: 'x',
      status: 'open' as const,
      openedAt: db.state.inStoryDate,
      resolvedAt: null,
      importance: 4,
      participants: [],
      sourceEventId: null,
    };
    const broken = codes({ ...db, threads: [...db.threads, thread] });
    expect(broken).toContain('goal-too-early');
    // Kakuzu's name is in it too, and Kan hasn't heard it.
    expect(broken).toContain('ui-name-leak');
  });

  test('a quick action with a jutsu Kan lacks', () => {
    const { db } = withReply(seed(), 'He comes at you.');
    const options = { ...db, rawLog: db.rawLog.map((entry, index) => (index === db.rawLog.length - 1 ? { ...entry, fightOptions: ['Fire Style: Hell to force him off'] } : entry)) };
    expect(codes(options)).toContain('option-unknown-jutsu');
  });
});

describe('turn rules', () => {
  test('the clock going backward, and over its cap', () => {
    const { db, turnLogId } = withReply(seed(), 'You wait.');
    const back = { ...db, state: { ...db.state, inStoryDate: shiftSeconds(db.state.inStoryDate, -60) } };
    expect(checkTurn(db, back, turn(turnLogId)).map((item) => item.code)).toContain('clock-backward');

    const far = { ...db, state: { ...db.state, inStoryDate: advanceSeconds(db.state.inStoryDate, 3 * 86400) } };
    expect(checkTurn(db, far, turn(turnLogId)).map((item) => item.code)).toContain('clock-over-cap');
    // A skip the engine allowed is not over the cap.
    expect(checkTurn(db, far, turn(turnLogId, { skipSeconds: 3 * 86400 })).map((item) => item.code)).not.toContain('clock-over-cap');
  });

  test('a "Time passes" line the clock did not follow is a warning', () => {
    const { db, turnLogId } = withReply(seed(), 'You wait.');
    const found = checkTurn(db, db, turn(turnLogId, { userMessage: '*Time passes: 1 month. You train.*' })).find((item) => item.code === 'skip-not-taken');
    expect(found?.severity).toBe('warning');
  });

  test('the dead gaining a bond', () => {
    const base = seed();
    const itachi = person(base, 'Itachi Uchiha');
    const before = markDeceased(base, itachi.id, { cause: 'test' });
    const after = { ...before, bonds: before.bonds.map((bond) => (bond.entityId === itachi.id ? { ...bond, affinity: bond.affinity + 2 } : bond)) };
    const { turnLogId } = withReply(before, 'You wait.');
    expect(checkTurn(before, after, turn(turnLogId)).map((item) => item.code)).toContain('dead-bond');
  });

  test('a reply in the rain under a clear sky', () => {
    const { db, turnLogId } = withReply(seed(), 'Rain hammers the branches and soaks you through.');
    const clear = { ...db, state: { ...db.state, weather: { ...db.state.weather!, condition: 'clear' as const } } };
    expect(checkTurn(db, clear, turn(turnLogId)).map((item) => item.code)).toContain('weather-mismatch');
  });
});

describe('Session 1: quick actions use only what Kan has (audit 8)', () => {
  test('unknownJutsuInOption', () => {
    const db = seed();
    expect(unknownJutsuInOption(db, 'Fire Style: Hell to force him off')).toBe('Fire Style: Hell');
    expect(unknownJutsuInOption(db, 'Use Water Clone Jutsu to flank')).toBe('Water Clone Jutsu');
    expect(unknownJutsuInOption(db, 'Strike with a Lightning Release blade')).toBe('Lightning Release');
    expect(unknownJutsuInOption(db, 'Duck under the threads and close in')).toBeNull();
    expect(unknownJutsuInOption(db, 'Use Thousand Souls on his arm')).toBeNull();
    expect(unknownJutsuInOption(db, 'Counter with taijutsu')).toBeNull();
  });

  test('a jutsu Kan has learned, and a nature he has, are fine', () => {
    const base = seed();
    const db: AppDatabase = {
      ...base,
      state: { ...base.state, player: { ...base.state.player, natures: [{ nature: 'Fire', source: 'innate', acquiredOn: base.state.inStoryDate }] } },
      jutsuRecords: [
        ...base.jutsuRecords,
        { ...base.jutsuRecords[0], id: 'j-fireball', name: 'Fire Style: Great Fireball', user: 'Kan', chakraNature: 'Fire' },
      ],
    };
    expect(unknownJutsuInOption(db, 'Fire Release: Great Fireball at his feet')).toBeNull();
    expect(unknownJutsuInOption(db, 'Coat the kunai in Fire Style')).toBeNull();
    expect(unknownJutsuInOption(db, 'Fire Style: Hell to force him off')).toBe('Fire Style: Hell');
  });

  test('the options shown drop the move Kan cannot make', () => {
    expect(cleanFightOptions(['Fire Style: Hell to force him off', 'Duck and close in', 'Block with the forearm'], seed())).toEqual([
      'Duck and close in',
      'Block with the forearm',
    ]);
  });
});

describe('Session 1: names in what the Journal shows (audit 11d)', () => {
  test('the cloak introduces Pain; the ring introduces Kakuzu (audit 8)', () => {
    const base = seed();
    const progress = base.state.canonProgress!;
    const db = { ...base, state: { ...base.state, canonProgress: { ...progress, active: ['kan-joins-akatsuki'], engaged: [...progress.engaged, 'kan-joins-akatsuki'] } } };
    const result = play(db, '*I take the cloak.*', 'The pierced man hands you the cloak and nods at the man beside him.', {
      characters_present: ['pain', 'kakuzu'],
      canon_completed: ['kan-joins-akatsuki'],
    });
    expect(displayName(result.db, person(result.db, 'Pain'))).toBe('Pain');
    expect(displayName(result.db, person(result.db, 'Kakuzu'))).not.toBe('Kakuzu');
    expect(result.db.threads.some((thread) => thread.title === 'Survive Kakuzu')).toBe(false);
    expect(result.events.filter((event) => event.kind === 'violation')).toEqual([]);

    const p2 = result.db.state.canonProgress!;
    const onTrial = { ...result.db, state: { ...result.db.state, canonProgress: { ...p2, active: ['kan-accepted-akatsuki'], engaged: [...p2.engaged, 'kan-accepted-akatsuki'] } } };
    const accepted = play(onTrial, '*I take the ring.*', 'The pierced man drops a ring in your palm and names your partner.', {
      characters_present: ['pain', 'kakuzu'],
      canon_completed: ['kan-accepted-akatsuki'],
    });
    expect(displayName(accepted.db, person(accepted.db, 'Kakuzu'))).toBe('Kakuzu');
    expect(accepted.db.threads.some((thread) => thread.title === 'Survive Kakuzu' && thread.status === 'open')).toBe(true);
  });

  test('a thread the tracker writes with a name Kan does not know shows the label', () => {
    const result = play(seed(), '*I listen.*', 'A stitched man counts coins by the fire.', {
      characters_present: ['kakuzu'],
      threads: [{ title: 'Collect the bounty', description: 'Kakuzu wants the deserter’s head.', status: 'open', participants: [] }],
    });
    const thread = result.db.threads.find((item) => item.title === 'Collect the bounty')!;
    expect(thread.description).not.toContain('Kakuzu');
    expect(thread.description).toContain('stitched arms');
  });
});
