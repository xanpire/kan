// Session 3 (15 Nov 2026, v1.25.8): by the third turn of a new story the
// narrator had two exchanges of scene, no memories and no opening briefing,
// because the prompt budget counted the fixed rules and sheet. Itachi attacked
// instead of defending and never told the truth. These guard the fixes.
import { describe, expect, test } from 'bun:test';
import { normalizeDatabase } from '../lib/rpg/db';
import { DEFAULT_SETTINGS, PROMPT_BUDGET_OPTIONS, normalizePromptBudget } from '../lib/rpg/defaults';
import { firstNight, formatOpeningBlock, kanRankNow, openingActive, openingBeats } from '../lib/rpg/opening';
import { buildNarrationPrompt } from '../lib/rpg/prompt';
import { seedDatabase } from '../lib/rpg/seed';
import { appendStoryMessage } from '../lib/rpg/log';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_night', 'Night'));
const dynamic = (db: AppDatabase, action = '*You hit him.*') => buildNarrationPrompt(db, action).messages[1].content as string;

function fightTurns(db: AppDatabase, turns: number) {
  let next = db;
  for (let i = 0; i < turns; i += 1) {
    next = appendStoryMessage(next, 'user', `I strike at him again, turn ${i}.`, 'm', 0, 0);
    next = appendStoryMessage(next, 'assistant', `Itachi turns your blow aside in the rain, turn ${i}. `.repeat(12), 'm', 0, 0);
  }
  return next;
}

describe('the budget is for the per-turn part', () => {
  test('the default is one of the choices, and an old whole-prompt number is replaced', () => {
    expect(PROMPT_BUDGET_OPTIONS).toContain(DEFAULT_SETTINGS.promptTokenBudget as never);
    expect(normalizePromptBudget(9500, undefined)).toBe(DEFAULT_SETTINGS.promptTokenBudget);
    expect(normalizePromptBudget(12000, 2)).toBe(12000);

    const old = seedDatabase('slot_old', 'Old');
    const loaded = normalizeDatabase({ ...old, settings: { ...old.settings, promptTokenBudget: 9500, budgetVersion: undefined } });
    expect(loaded.settings.promptTokenBudget).toBe(DEFAULT_SETTINGS.promptTokenBudget);
    expect(loaded.settings.budgetVersion).toBe(2);
  });

  test('eight turns into the first fight the narrator still has the scene and the opening', () => {
    const db = fightTurns(seed(), 8);
    const prompt = buildNarrationPrompt(db, '*You hit him.*');

    expect(prompt.recentMessages.length).toBeGreaterThanOrEqual(12);
    expect(prompt.contextTokens).toBeLessThanOrEqual(db.settings.promptTokenBudget);
    expect(prompt.estimatedTokens).toBeGreaterThan(prompt.contextTokens);
    expect(prompt.messages[1].content).toContain('THE FIRST NIGHT');
  });
});

describe('the first night block', () => {
  test('it is sent from the first turn and lists every step still to come', () => {
    const db = seed();
    expect(firstNight(db)).toBe(true);
    expect(openingBeats(db)).toEqual({ deathsTold: false, sharingan: false, truthTold: false });

    const block = formatOpeningBlock(db);
    expect(block).toContain('1. He says it in plain words');
    expect(block).toMatch(/2\. Your Sharingan wakes/);
    expect(block).toMatch(/3\. He tells you why/);
    expect(block).toMatch(/4\. His offer/);
    expect(block).toMatch(/does not fight back/);
    expect(block).toMatch(/never the Mangekyō/);
    expect(block).toMatch(/Shisui/);
    expect(dynamic(db)).toContain(block);
  });

  test('a step that happened leaves the list', () => {
    let db = seed();
    db = {
      ...db,
      entities: db.entities.map((entity) =>
        entity.name === 'Izumi Uchiha' || entity.name === 'Hazuki Uchiha'
          ? { ...entity, deceased: { ...entity.deceased!, known: true } }
          : entity
      ),
    };
    expect(openingBeats(db).deathsTold).toBe(true);
    expect(formatOpeningBlock(db)).not.toContain('He says it in plain words');
    expect(formatOpeningBlock(db)).toMatch(/1\. Your Sharingan wakes/);
  });

  test('it ends with the night once the truth is told, and stays while it is owed', () => {
    const base = seed();
    const morning = { ...base, state: { ...base.state, inStoryDate: { ...base.state.inStoryDate, day: 2, hour: 9 } } };
    expect(firstNight(morning)).toBe(false);
    expect(openingActive(morning)).toBe(true);
    expect(formatOpeningBlock(morning)).toContain('WHAT ITACHI STILL OWES YOU');

    const told: AppDatabase = {
      ...morning,
      entities: morning.entities.map((entity) =>
        entity.name === 'Izumi Uchiha' || entity.name === 'Hazuki Uchiha'
          ? { ...entity, deceased: { ...entity.deceased!, known: true } }
          : entity
      ),
      state: {
        ...morning.state,
        loreKnown: { 'uchiha-massacre': { version: 'truth', how: 'told', date: morning.state.inStoryDate } },
      },
    };
    expect(openingActive(told)).toBe(false);
    expect(formatOpeningBlock(told)).toBe('');
  });

  test('an old save (no opening) never gets it', () => {
    const db = seed();
    const old = { ...db, state: { ...db.state, opening: undefined } };
    expect(formatOpeningBlock(old)).toBe('');
  });

  test('the opening memory no longer carries the briefing into later years', () => {
    expect(dynamic(seed())).not.toContain('For you, the narrator, not Kan: Tonight Itachi');
  });
});

describe('who Kan is on the first night', () => {
  test('still the Leaf’s ANBU until he knows, then former ANBU until the cloak', () => {
    const db = seed();
    expect(kanRankNow(db)).toBe('Hidden Leaf ANBU');
    expect(dynamic(db)).toContain('Tonight the Leaf still counts you as one of its own');
    expect(dynamic(db)).not.toContain('The Leaf believes you dead');

    const morning = { ...db, state: { ...db.state, inStoryDate: { ...db.state.inStoryDate, day: 2, hour: 9 } } };
    // v1.25.23: not a listed missing-nin until the cloak (Session 3 slip).
    expect(kanRankNow(morning)).toBe('Former Hidden Leaf ANBU');
  });

  test('the cloak and the ring show in his rank', () => {
    const db = seed();
    const withDone = (ids: string[]): AppDatabase => ({
      ...db,
      state: { ...db.state, canonProgress: { ...db.state.canonProgress!, completed: ids } },
    });
    expect(kanRankNow(withDone(['kan-joins-akatsuki']))).toBe('Akatsuki, on trial · missing-nin');
    expect(kanRankNow(withDone(['kan-joins-akatsuki', 'kan-accepted-akatsuki']))).toBe('Akatsuki · missing-nin');
  });
});
