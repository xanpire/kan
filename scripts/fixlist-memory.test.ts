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

import { dateSortValue, shiftSeconds } from '../lib/rpg/calendar';
import { normalizeDatabase } from '../lib/rpg/db';
import { resolveCharacterRefs } from '../lib/rpg/entities';
import { factRef } from '../lib/rpg/facts';
import { appendStoryMessage } from '../lib/rpg/log';
import { loreActive } from '../lib/rpg/lore';
import { applyStateStep, correctTurnTime } from '../lib/rpg/memoryJobs';
import { buildNarrationPrompt } from '../lib/rpg/prompt';
import { seedDatabase } from '../lib/rpg/seed';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_fix', 'Fix'));

function play(db: AppDatabase, narration: string, state: Record<string, unknown> | null): AppDatabase {
  let next = appendStoryMessage(db, 'user', 'I keep going.', null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  const reply = state ? convertStateBlock(state).diff : null;
  const diff = reply ? resolveCharacterRefs(next, reply) : null;

  return applyStateStep(next, diff, { turnLogId, userMessage: 'I keep going.', narration }, new Set()).db;
}

const fact = (db: AppDatabase, text: string) => db.facts.find((item) => item.text.includes(text));
const person = (db: AppDatabase, name: string) => db.entities.find((entity) => entity.name === name)!;
const lastAssistant = (db: AppDatabase) => [...db.rawLog].reverse().find((entry) => entry.role === 'assistant')!;
const promptText = (db: AppDatabase) => buildNarrationPrompt(db, '*You wait.*').messages.map((m) => m.content).join('\n');

describe('5. one clock', () => {
  test('correcting a turn moves everything it stamped, and nothing from before', () => {
    let db = seed();
    const before = fact(db, 'Your parents')!.validFrom;
    db = play(db, 'Pain steps out of the rain. "So you are the Uchiha."', {
      time: { elapsed: 10, unit: 'minutes', clock_time: null },
      characters_present: ['pain'],
      facts: [{ entity: 'pain', fact: 'Pain met you in the Rain tower.', type: 'event', who_knows: ['kan', 'pain'], supersedes: [], claimed_by: null, lasts: null, days: null }],
    });
    const turn = lastAssistant(db);
    const stamped = fact(db, 'Pain met you')!.validFrom;
    const end = db.state.inStoryDate;
    expect(stamped).toEqual(end);

    const corrected = correctTurnTime(db, turn.id, 70 * 60)!;
    const delta = (70 - (turn.elapsedSeconds ?? 0) / 60) * 60;
    const shiftedEnd = shiftSeconds(end, delta);

    expect(corrected.state.inStoryDate).toEqual(shiftedEnd);
    expect(fact(corrected, 'Pain met you')!.validFrom).toEqual(shiftedEnd);
    expect(person(corrected, 'Pain').lastSeen).toEqual(shiftedEnd);
    expect(corrected.bonds.find((bond) => bond.entityId === person(corrected, 'Pain').id)?.updatedInStoryDate).toEqual(shiftedEnd);
    // Stamped before the turn: untouched.
    expect(fact(corrected, 'Your parents')!.validFrom).toEqual(before);
  });
});

describe('6. facts can expire or be replaced', () => {
  test('supersedes and facts_ended end the old fact', () => {
    let db = seed();
    const forest = fact(db, 'You left for the forest')!;
    const crush = fact(db, 'crush on Hana')!;
    db = play(db, 'Itachi tells you everything.', {
      characters_present: ['itachi-uchiha'],
      facts: [{ entity: 'kan', fact: 'Itachi told you he carried out the massacre on the Leaf’s orders.', type: 'knowledge', who_knows: ['kan', 'itachi-uchiha'], supersedes: [factRef(forest)], claimed_by: null, lasts: null, days: null }],
      facts_ended: [factRef(crush)],
    });

    expect(fact(db, 'You left for the forest')!.validTo).toEqual(db.state.inStoryDate);
    expect(fact(db, 'crush on Hana')!.validTo).not.toBeNull();
    expect(fact(db, 'Leaf’s orders')!.supersedes).toBe(forest.id);
    expect(promptText(db)).not.toContain('You left for the forest');
  });

  test('a "does not know yet" ends when you learn it', () => {
    let db = seed();
    const izumi = person(db, 'Izumi Uchiha');
    db = play(db, 'Itachi tells you Izumi is dead.', {
      characters_present: ['itachi-uchiha'],
      deaths: [{ character_id: 'izumi-uchiha', cause: 'the massacre' }],
    });

    expect(db.entities.find((entity) => entity.id === izumi.id)?.deceased?.known).toBe(true);
    expect(fact(db, 'Izumi Uchiha, your cousin and former teammate')!.validTo).not.toBeNull();
  });

  test('a passing condition ends at the next rest; an injury after its days', () => {
    let db = seed();
    db = play(db, 'Your chakra is drained and your arm is cut.', {
      facts: [
        { entity: 'kan', fact: 'You are drained of chakra.', type: 'condition', who_knows: ['kan'], supersedes: [], claimed_by: null, lasts: 'until_rest', days: null },
        { entity: 'kan', fact: 'A shallow cut runs down your left forearm.', type: 'injury', who_knows: ['kan'], supersedes: [], claimed_by: null, lasts: 'days', days: 2 },
      ],
    });
    expect(fact(db, 'drained of chakra')!.untilRest).toBe(true);

    db = play(db, 'You sleep through the night.', { time: { elapsed: 8, unit: 'hours', clock_time: null }, scene_pace: 'downtime' });
    expect(fact(db, 'drained of chakra')!.validTo).not.toBeNull();
    expect(fact(db, 'shallow cut')!.validTo).toBeNull();

    db = play(db, 'Two days on the road.', { time: { elapsed: 2, unit: 'days', clock_time: null }, scene_pace: 'travel' });
    expect(fact(db, 'shallow cut')!.validTo).not.toBeNull();
  });

  test('a claim is stored as a claim, with who said it', () => {
    let db = seed();
    db = play(db, '"Sixty miles before nightfall," Kakuzu says.', {
      characters_present: ['kakuzu'],
      facts: [{ entity: 'kakuzu', fact: 'Kakuzu says you ran sixty miles with him.', type: 'event', who_knows: ['kan', 'kakuzu'], supersedes: [], claimed_by: 'kakuzu', lasts: null, days: null }],
    });
    const claim = fact(db, 'sixty miles')!;
    expect(claim.confidence).toBe('claimed');
    expect(claim.claimedBy).toBe(person(db, 'Kakuzu').id);
    expect(claim.subjectEntityId).toBe(person(db, 'Kakuzu').id);
    expect(claim.whoKnows).toEqual([person(db, 'Kan').id, person(db, 'Kakuzu').id]);
  });

  test('the budget cuts memories and facts before the recent scene', () => {
    let db = seed();
    for (let i = 0; i < 14; i += 1) {
      db = play(db, `Turn ${i}: you walk on through the rain with Itachi, saying little.`, { characters_present: ['itachi-uchiha'] });
    }
    const full = buildNarrationPrompt(db, '*You walk.*');
    const tight = buildNarrationPrompt({ ...db, settings: { ...db.settings, promptTokenBudget: full.estimatedTokens - 120 } }, '*You walk.*');

    expect(tight.recentMessages.length).toBe(full.recentMessages.length);
    expect(tight.estimatedTokens).toBeLessThan(full.estimatedTokens);
  });
});

describe('7. lore with conditions', () => {
  test('lore turns off when the story passes it, and geography is always on', () => {
    let db = seed();
    const noSharingan = db.loreEntries.find((lore) => lore.text === 'You have not awakened the Sharingan.')!;
    const holdsBack = db.loreEntries.find((lore) => lore.text.startsWith('When Itachi reaches you'))!;
    const izumiUnknown = db.loreEntries.find((lore) => lore.text.includes('You do NOT know she is dead'))!;

    expect(loreActive(db, noSharingan)).toBe(true);
    expect(loreActive(db, holdsBack)).toBe(true);
    expect(promptText(db)).toContain('GEOGRAPHY');

    db = {
      ...db,
      state: {
        ...db.state,
        player: { ...db.state.player, abilities: [{ name: 'Sharingan', stage: '1 tomoe', acquiredOn: db.state.inStoryDate, stageOn: db.state.inStoryDate }] },
      },
      threads: db.threads.map((thread) => (thread.title === 'Make Itachi explain' ? { ...thread, status: 'resolved' } : thread)),
      entities: db.entities.map((entity) => (entity.name === 'Izumi Uchiha' ? { ...entity, deceased: { ...entity.deceased, known: true } } : entity)),
    };

    expect(loreActive(db, noSharingan)).toBe(false);
    expect(loreActive(db, holdsBack)).toBe(false);
    expect(loreActive(db, izumiUnknown)).toBe(false);
    expect(db.loreEntries.some((lore) => lore.text.startsWith('Izumi Uchiha, your cousin and former Team 3 teammate, died') && !lore.text.includes('NOT') && loreActive(db, lore))).toBe(true);
  });
});

describe('8. canon milestones complete at the right moment', () => {
  test('saying yes only accepts the beat; the cloak completes it with the people there', () => {
    let db = seed();
    db = play(db, '"Sure," you tell Itachi.', { characters_present: ['itachi-uchiha'], canon_engaged: ['kan-joins-akatsuki'] });

    expect(db.state.canonProgress?.engaged).toContain('kan-joins-akatsuki');
    expect(db.facts.some((item) => item.text.includes('You went into the Akatsuki'))).toBe(false);
    expect(db.threads.some((thread) => thread.title === 'Prove yourself to the Akatsuki')).toBe(false);

    db = play(db, 'Pain hands you the cloak. "Kakuzu will be your partner."', {
      time: { elapsed: 18, unit: 'hours', clock_time: null },
      characters_present: ['itachi-uchiha', 'pain', 'kakuzu'],
      canon_completed: ['kan-joins-akatsuki'],
    });

    const joined = fact(db, 'You went into the Akatsuki')!;
    expect(joined.validFrom).toEqual(db.state.inStoryDate);
    expect(joined.subjectEntityId).toBe(person(db, 'Kan').id);
    expect(joined.whoKnows).toEqual(
      expect.arrayContaining([person(db, 'Kan').id, person(db, 'Pain').id, person(db, 'Kakuzu').id, person(db, 'Itachi Uchiha').id])
    );

    const thread = db.threads.find((item) => item.title === 'Prove yourself to the Akatsuki')!;
    // On trial (audit 8): Itachi's word, not Kakuzu's partnership, yet.
    expect(thread.participants).toEqual(['Kan', 'Itachi Uchiha']);
    expect(thread.participantIds).toContain(person(db, 'Itachi Uchiha').id);
    expect(dateSortValue(thread.openedAt)).toBe(dateSortValue(db.state.inStoryDate));
  });
});
