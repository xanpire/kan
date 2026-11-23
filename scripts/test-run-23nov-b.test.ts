/**
 * Xan's second set of notes from the test run of 23 Nov 2026 (save
 * slot_mwtlxm6u1pumwg, turns 1-8): Danzō named and never on the bonds
 * screen, Itachi answering a thought, Itachi's sleeves, "Uncle Fugaku".
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

import { mentionsEntity, mentionsName } from '../lib/rpg/characterRefs';
import { migrateItachiLook, normalizeDatabase } from '../lib/rpg/db';
import { backfillHeardOf, canBeHeardOf, markHeardOf } from '../lib/rpg/heardOf';
import { appendStoryMessage } from '../lib/rpg/log';
import { applyStateStep } from '../lib/rpg/memoryJobs';
import { buildNarrationPrompt, FAMILY_TIES, formatKanInput, NARRATION_SYSTEM, splitKanInput } from '../lib/rpg/prompt';
import { ITACHI_YOUNG_LOOK, ITACHI_YOUNG_LOOK_LONG_SLEEVES, seedDatabase } from '../lib/rpg/seed';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_testrun_b', 'Test run b'));
const person = (db: AppDatabase, name: string) => db.entities.find((entity) => entity.name === name)!;
const promptText = (db: AppDatabase, input: string) =>
  buildNarrationPrompt(db, input).messages.map((message) => message.content).join('\n');

const ITACHI_TRUTH =
  '"The Leaf\'s council gave the order. Danzō pressed for eradication, and the elders agreed."';

describe('Danzō named on the page', () => {
  test('a macron in the prose still finds the person', () => {
    expect(mentionsName('Danzō pressed for it.', 'Danzo')).toBe(true);
    expect(mentionsEntity('Danzō pressed for it.', person(seed(), 'Danzo Shimura'))).toBe(true);
    expect(mentionsName('Chōji ate.', 'Choji')).toBe(true);
    expect(mentionsName('Sarutobi', 'Tobi')).toBe(false);
  });

  test('his card reaches the narrator when only "Danzō" is written', () => {
    let db = seed();
    db = appendStoryMessage(db, 'assistant', ITACHI_TRUTH, null, 0, 0);
    expect(promptText(db, 'I stare at him.')).toContain('Danzo Shimura (');
  });

  test('someone you know of comes up and lands under Heard of; a stranger does not', () => {
    let db = seed();
    expect(canBeHeardOf(person(db, 'Danzo Shimura'))).toBe(true);
    expect(canBeHeardOf(person(db, 'Kisame Hoshigaki'))).toBe(false);
    db = markHeardOf(db, `${ITACHI_TRUTH} Kisame waits.`);
    expect(person(db, 'Danzo Shimura').heardOf).toEqual(db.state.inStoryDate);
    expect(person(db, 'Danzo Shimura').met).toBe(false);
    expect(person(db, 'Kisame Hoshigaki').heardOf).toBeUndefined();
    // Long-dead Hokage from a history lesson stay off; people Kan knew do not.
    db = markHeardOf(db, 'Hashirama built the village. Fugaku was to lead it.');
    expect(person(db, 'Hashirama Senju').heardOf).toBeUndefined();
    expect(person(db, 'Fugaku Uchiha').heardOf).toBeDefined();
  });

  test('the state step marks it from the turn', () => {
    let db = seed();
    const input = '"Why?"';
    db = appendStoryMessage(db, 'user', input, null, 0, 0);
    db = appendStoryMessage(db, 'assistant', ITACHI_TRUTH, null, 0, 0);
    const turnLogId = db.rawLog[db.rawLog.length - 1].id;
    const result = applyStateStep(db, null, { turnLogId, userMessage: input, narration: ITACHI_TRUTH }, new Set());
    expect(person(result.db, 'Danzo Shimura').heardOf).toBeDefined();
  });

  test('an old save is read once for people already talked about', () => {
    let db = seed();
    db = appendStoryMessage(db, 'assistant', ITACHI_TRUTH, null, 0, 0);
    db = { ...db, state: { ...db.state, heardOfScanned: undefined } };
    const next = backfillHeardOf(db);
    expect(person(next, 'Danzo Shimura').heardOf).toBeDefined();
    expect(next.state.heardOfScanned).toBe(true);
    expect(normalizeDatabase(next).state.heardOfScanned).toBe(true);
  });
});

describe('Kan\'s thoughts are his own', () => {
  const TURN_5 = '"Itachi, what are you saying right now?" i look at Itachi even more confused. is something wrong with him? is he imagining things?';

  test('speech and thought are told apart', () => {
    const split = splitKanInput(TURN_5);
    expect(split.spoken).toEqual(['Itachi, what are you saying right now?']);
    expect(split.unspoken).toBe('i look at Itachi even more confused. is something wrong with him? is he imagining things?');
    expect(splitKanInput('“Wait.” *I step back*').unspoken).toBe('I step back');
  });

  test('the narrator is told nobody hears the thought', () => {
    const text = formatKanInput(TURN_5);
    expect(text).toContain('- Said aloud (all anyone hears): "Itachi, what are you saying right now?"');
    expect(text).toContain('- Not said aloud: i look at Itachi');
    expect(text).toContain('nobody hears it');
    expect(formatKanInput('"Just talk."')).not.toContain('Not said aloud');
    expect(NARRATION_SYSTEM).toContain("Kan's thoughts are private.");
    expect(promptText(seed(), TURN_5)).toContain('- Not said aloud:');
  });
});

describe('Itachi on the massacre night', () => {
  test('short sleeves, and old saves get them', () => {
    expect(ITACHI_YOUNG_LOOK).toContain('short-sleeved');
    expect(migrateItachiLook(ITACHI_YOUNG_LOOK_LONG_SLEEVES)).toBe(ITACHI_YOUNG_LOOK);
    expect(person(seed(), 'Itachi Uchiha').appearance).toBe(ITACHI_YOUNG_LOOK);
  });

  test('his card says who his family is', () => {
    expect(FAMILY_TIES['Itachi Uchiha']).toContain('his father Fugaku');
    expect(FAMILY_TIES['Itachi Uchiha']).toContain('never "Aunt Hazuki"');
    const text = promptText(seed(), '"Itachi?"');
    expect(text).toContain('family: his father Fugaku and mother Mikoto');
    expect(text).toContain('arm guards on his forearms');
    expect(NARRATION_SYSTEM).toContain('Fugaku is Itachi\'s father, never his uncle');
  });
});

import { isTheirOwnDeed } from '../lib/rpg/grudges';
import { scratchProtectorFromProse } from '../lib/rpg/inventory';
import { repairTestRun23Nov } from '../lib/rpg/repair23nov';
import { ITACHI_AFTER_THE_NIGHT, ITACHI_AFTER_THE_NIGHT_OLD } from '../lib/rpg/bondGuard';

describe('found in the save itself', () => {
  test('water running down your neck is no scratch on the protector', () => {
    const turn2 = 'Water runs down your neck beneath the high collar of your black top, cold against your skin, while the cloth belt carrying your forehead protector sits heavy at your left hip.';
    expect(scratchProtectorFromProse(['Hidden Leaf headband'], turn2)).toBeNull();
    expect(scratchProtectorFromProse(['Hidden Leaf headband'], 'You drag the tip of a kunai across your forehead protector.')).not.toBeNull();
    expect(scratchProtectorFromProse(['Hidden Leaf headband'], 'You scratch a line through the plate of your headband.')).not.toBeNull();
  });

  test('a grudge is their anger at you, never the other way round', () => {
    const itachi = { name: 'Itachi Uchiha' };
    expect(isTheirOwnDeed(itachi, 'He killed Hazuki and Izumi, your aunt and cousin, and admits it to your face.')).toBe(true);
    expect(isTheirOwnDeed(itachi, 'Itachi betrayed your trust.')).toBe(true);
    expect(isTheirOwnDeed(itachi, 'You broke his nose in front of Kisame.')).toBe(false);
    expect(isTheirOwnDeed(itachi, 'He was humiliated by you.')).toBe(false);
  });

  test('an old save is repaired once', () => {
    let db = seed();
    const itachi = person(db, 'Itachi Uchiha');
    db = appendStoryMessage(db, 'assistant', 'Water runs down your neck while your forehead protector sits at your hip.', null, 0, 0);
    db = {
      ...db,
      state: { ...db.state, repaired23Nov: undefined, inventory: ['Hidden Leaf headband, scratched through', 'Shuriken (10)'], alreadySaid: [{ text: "why Itachi killed the clan: the coup", date: db.state.inStoryDate }] },
      bonds: db.bonds.map((bond) => (bond.entityId === itachi.id ? { ...bond, status: ITACHI_AFTER_THE_NIGHT_OLD } : bond)),
      facts: [
        ...db.facts,
        { id: 'fact_g1', subjectEntityId: itachi.id, type: 'other', text: 'Itachi Uchiha holds a grudge against you: He killed Hazuki and Izumi.', whoKnows: [itachi.id], validFrom: db.state.inStoryDate, validTo: null, confidence: 'confirmed', sourceEventId: null },
      ],
      threads: [...db.threads, { id: 'thread_g1', type: 'grudge', title: "Itachi Uchiha's grudge against you", description: '', status: 'resolved', openedAt: db.state.inStoryDate, resolvedAt: db.state.inStoryDate, importance: 3, participants: [], sourceEventId: null }],
    } as AppDatabase;
    const next = repairTestRun23Nov(db);
    expect(next.state.inventory[0]).toBe('Hidden Leaf headband');
    expect(next.facts.some((fact) => fact.id === 'fact_g1')).toBe(false);
    expect(next.threads.some((thread) => thread.id === 'thread_g1')).toBe(false);
    expect(next.bonds.find((bond) => bond.entityId === itachi.id)!.status).toBe(ITACHI_AFTER_THE_NIGHT);
    expect(next.threads.find((thread) => thread.title === 'Make Itachi explain')!.status).toBe('resolved');
    expect(next.state.repaired23Nov).toBe(true);
  });
});

import { eraPersonalityFor, syncEraPersonalities } from '../lib/rpg/eraRoles';
import { VULTURES_FEMALE_LORE, VULTURES_FEMALE_TEXT } from '../lib/rpg/vultures';

describe('the rest of the review (23 Nov, later)', () => {
  test('Sasuke is an eight-year-old on the massacre night, the avenger from April of year 14', () => {
    const db = seed();
    expect(person(db, 'Sasuke Uchiha').personality).toContain('Eight years old');
    expect(eraPersonalityFor('Sasuke Uchiha', { year: 14, month: 5, day: 1 })!.personality).toContain('kill a certain man');
    const old = { ...db, entities: db.entities.map((e) => (e.name === 'Sasuke Uchiha' ? { ...e, personality: 'Proud, intense, lonely; lives for avenging his clan.', speechStyle: 'Curt, cold, dismissive.' } : e)) };
    expect(person(syncEraPersonalities(old), 'Sasuke Uchiha').personality).toContain('Eight years old');
    const later = { ...db, state: { ...db.state, inStoryDate: { ...db.state.inStoryDate, year: 14, month: 6 } } };
    expect(person(syncEraPersonalities(later), 'Sasuke Uchiha').speechStyle).toBe('Curt, cold, dismissive.');
    const written = { ...later, entities: later.entities.map((e) => (e.name === 'Sasuke Uchiha' ? { ...e, personality: 'Softened after meeting you again.' } : e)) };
    expect(person(syncEraPersonalities(written), 'Sasuke Uchiha').personality).toBe('Softened after meeting you again.');
  });

  test('the vultures are female, and only Itachi knows', () => {
    const db = seed();
    const fact = db.facts.find((item) => item.text === VULTURES_FEMALE_TEXT)!;
    expect(fact.whoKnows).toEqual([person(db, 'Kan').id, person(db, 'Itachi Uchiha').id]);
    expect(db.loreEntries.filter((lore) => lore.text === VULTURES_FEMALE_LORE)).toHaveLength(1);
    expect(normalizeDatabase(db).loreEntries.filter((lore) => lore.text === VULTURES_FEMALE_LORE)).toHaveLength(1);
    expect(promptText(db, 'I send Hōmuri up over the trees.')).toContain('never "she" or "her"');
  });
});
