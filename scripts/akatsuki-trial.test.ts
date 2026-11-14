/**
 * Kan is on trial before he is a member (audit 8, decided by Xan, 13 Nov
 * 2026): the cloak first, two or three missions judged by importance and
 * outcome, the ring and Kakuzu within a couple of months at most.
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

import {
  formatTrialLine,
  formatTrialTracking,
  trialActive,
  trialDue,
  trialOpen,
  trialReady,
  trialSkipLimit,
  TRIAL_MAX_DAYS,
} from '../lib/rpg/akatsukiTrial';
import { advanceSeconds, SECONDS_PER_DAY } from '../lib/rpg/calendar';
import { normalizeDatabase } from '../lib/rpg/db';
import { resolveCharacterRefs } from '../lib/rpg/entities';
import { appendStoryMessage } from '../lib/rpg/log';
import { applyStateStep } from '../lib/rpg/memoryJobs';
import { trackedCanonBeats } from '../lib/rpg/newsDelivery';
import { buildNarrationPrompt, worldAreasForTurn } from '../lib/rpg/prompt';
import { seedDatabase } from '../lib/rpg/seed';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import { skipLimit } from '../lib/rpg/timeSkip';
import type { AppDatabase, TrialMission } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_trial', 'Trial'));

function play(db: AppDatabase, narration: string, state: Record<string, unknown>): AppDatabase {
  let next = appendStoryMessage(db, 'user', 'I keep going.', null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  const diff = resolveCharacterRefs(next, convertStateBlock(state).diff);
  return applyStateStep(next, diff, { turnLogId, userMessage: 'I keep going.', narration }, new Set()).db;
}

function underway(db: AppDatabase, id: string): AppDatabase {
  const progress = db.state.canonProgress!;
  return { ...db, state: { ...db.state, canonProgress: { ...progress, active: [id], engaged: [...progress.engaged, id] } } };
}

function cloaked(): AppDatabase {
  return play(underway(seed(), 'kan-joins-akatsuki'), 'The pierced man hands you the cloak. No ring.', {
    characters_present: ['pain', 'itachi-uchiha'],
    canon_completed: ['kan-joins-akatsuki'],
  });
}

function withMissions(db: AppDatabase, missions: TrialMission[]): AppDatabase {
  return { ...db, state: { ...db.state, akatsukiTrial: { since: db.state.inStoryDate, missions } } };
}

function later(db: AppDatabase, days: number): AppDatabase {
  return { ...db, state: { ...db.state, inStoryDate: advanceSeconds(db.state.inStoryDate, days * SECONDS_PER_DAY) } };
}

describe('the cloak is a trial, not membership', () => {
  test('taking the cloak starts the trial, with no ring and no Kakuzu', () => {
    const db = cloaked();
    expect(trialActive(db)).toBe(true);
    expect(trialOpen(db)).toBe(false);
    expect(db.facts.some((fact) => fact.validTo === null && fact.text === 'Pain paired you with Kakuzu.')).toBe(false);
    expect(db.facts.some((fact) => fact.validTo === null && fact.text.includes('no Akatsuki ring yet'))).toBe(true);
  });

  test('the narrator is told plainly while it runs', () => {
    const db = cloaked();
    const line = formatTrialLine(db);
    expect(line).toContain('not a member yet');
    expect(line).toContain("Itachi's responsibility");
    expect(line).toContain('Jūzō');
    const prompt = buildNarrationPrompt(db, '*I wait.*').messages.map((message) => message.content).join('\n');
    expect(prompt).toContain('AKATSUKI TRIAL');
  });

  test('the acceptance is not offered before a mission went well', () => {
    const db = cloaked();
    expect(trackedCanonBeats(db).offered.some((beat) => beat.id === 'kan-accepted-akatsuki')).toBe(false);
    const done = withMissions(db, [{ title: 'Scout the border', importance: 2, outcome: 'well' }]);
    expect(trialOpen(done)).toBe(true);
  });
});

describe('missions decide when', () => {
  test('two or three ordinary missions done well make it ready', () => {
    const db = cloaked();
    expect(trialReady(withMissions(db, [{ title: 'A', importance: 3, outcome: 'well' }]))).toBe(false);
    expect(trialReady(withMissions(db, [{ title: 'A', importance: 3, outcome: 'well' }, { title: 'B', importance: 3, outcome: 'well' }]))).toBe(true);
    expect(
      trialReady(withMissions(db, [{ title: 'A', importance: 2, outcome: 'well' }, { title: 'B', importance: 2, outcome: 'well' }, { title: 'C', importance: 2, outcome: 'well' }]))
    ).toBe(true);
  });

  test('a major mission done well ends it early; a botched one counts against him', () => {
    const db = cloaked();
    expect(trialReady(withMissions(db, [{ title: 'The Waterfall job', importance: 4, outcome: 'well' }]))).toBe(true);
    expect(
      trialReady(withMissions(db, [{ title: 'A', importance: 3, outcome: 'well' }, { title: 'B', importance: 3, outcome: 'badly' }, { title: 'C', importance: 2, outcome: 'well' }]))
    ).toBe(false);
  });

  test('two months at most, whatever happened', () => {
    const db = withMissions(cloaked(), [{ title: 'A', importance: 3, outcome: 'badly' }]);
    expect(trialDue(later(db, TRIAL_MAX_DAYS - 1))).toBe(false);
    expect(trialDue(later(db, TRIAL_MAX_DAYS))).toBe(true);
    expect(trialReady(later(db, TRIAL_MAX_DAYS))).toBe(true);
    expect(formatTrialLine(later(db, TRIAL_MAX_DAYS))).toContain('The trial is over');
  });

  test('the tracker reports a mission, and the state step records it', () => {
    const db = cloaked();
    expect(worldAreasForTurn(db, '*I go.*', 'You and Itachi set out.')).toContain('canon');
    expect(formatTrialTracking(db)).toContain('trial_mission');
    const after = play(db, 'The courier is dead before he reaches the pass.', {
      characters_present: ['itachi-uchiha'],
      trial_mission: { title: 'Stop the courier', importance: 3, outcome: 'well' },
    });
    expect(after.state.akatsukiTrial?.missions.map((mission) => mission.title)).toEqual(['Stop the courier']);
    expect(trialOpen(after)).toBe(true);
  });

  test('accepted: the trial ends, Kakuzu is the partner', () => {
    const db = withMissions(cloaked(), [{ title: 'A', importance: 4, outcome: 'well' }]);
    const after = play(underway(db, 'kan-accepted-akatsuki'), 'The pierced man drops a ring in your palm.', {
      characters_present: ['pain', 'kakuzu'],
      canon_completed: ['kan-accepted-akatsuki'],
    });
    expect(trialActive(after)).toBe(false);
    expect(formatTrialLine(after)).toBe('');
    expect(after.facts.some((fact) => fact.validTo === null && fact.text === 'Pain paired you with Kakuzu.')).toBe(true);
  });
});

describe('a skip stops before the acceptance', () => {
  test('never past the two months; one day once he is ready', () => {
    const db = cloaked();
    const limit = trialSkipLimit(db)!;
    expect(limit).toBeLessThanOrEqual(TRIAL_MAX_DAYS * SECONDS_PER_DAY);
    expect(skipLimit(db, 365 * SECONDS_PER_DAY).seconds).toBeLessThanOrEqual(limit);
    const ready = withMissions(db, [{ title: 'A', importance: 4, outcome: 'well' }]);
    expect(trialSkipLimit(ready)).toBe(SECONDS_PER_DAY);
    expect(skipLimit(ready, 90 * SECONDS_PER_DAY).seconds).toBe(SECONDS_PER_DAY);
  });
});

describe('older saves', () => {
  test('a save already paired with Kakuzu counts as accepted', () => {
    const db = cloaked();
    const old = {
      ...db,
      facts: [...db.facts, { ...db.facts[0], id: 'fact_old_pair', text: 'Pain paired you with Kakuzu.', validTo: null }],
    };
    expect(trialActive(normalizeDatabase(old))).toBe(false);
  });
});
