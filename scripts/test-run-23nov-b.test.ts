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
