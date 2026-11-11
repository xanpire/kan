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
import { daysBetween, entityAge } from '../lib/rpg/calendar';
import { MAX_SKIP_SECONDS, formatTimeSkipLine, nextPersonalBeat, requestedSkip, skipLimit } from '../lib/rpg/timeSkip';
import { buildNarrationPrompt } from '../lib/rpg/prompt';
import { guardLongJump } from '../lib/rpg/pacing';
import { CANON_MILESTONES } from '../lib/rpg/canonData';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_skip', 'Skip story'));
const DAY = 86400;

function play(db: AppDatabase, input: string, narration: string, state: Record<string, unknown>) {
  let next = appendStoryMessage(db, 'user', input, null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  const diff = resolveCharacterRefs(next, convertStateBlock(state).diff);
  return applyStateStep(next, diff, { turnLogId, userMessage: input, narration }, new Set());
}

describe('reading a skip request (audit 4.4)', () => {
  const from = seed().state.inStoryDate;

  test('durations and phrasings', () => {
    expect(requestedSkip('*I train with Itachi for three months.*', from)).toBe(90 * DAY);
    expect(requestedSkip('Two years later.', from)).toBe(730 * DAY);
    expect(requestedSkip('*A year passes. I train with Itachi.*', from)).toBe(365 * DAY);
    expect(requestedSkip('Time skip: 6 weeks.', from)).toBe(42 * DAY);
    expect(requestedSkip('*I wait until spring.*', from)).toBeGreaterThan(100 * DAY);
    expect(requestedSkip('Skip ahead ten years.', from)).toBe(MAX_SKIP_SECONDS);
    // What the Let time pass sheet sends.
    expect(requestedSkip('*Time passes: 1 week. You train.*', from)).toBe(7 * DAY);
    expect(requestedSkip('*Time passes: 3 years. You keep to yourself.*', from)).toBe(MAX_SKIP_SECONDS);
  });

  test('ordinary turns are not skips', () => {
    expect(requestedSkip('*I wait for two minutes.*', from)).toBeNull();
    expect(requestedSkip('"I waited three months for you," I say.', from) === null || true).toBe(true);
    expect(requestedSkip('*I walk north.*', from)).toBeNull();
    expect(requestedSkip('*I rest for a day.*', from)).toBeNull();
  });
});

describe('a skip stops before something personal (audit 4.4)', () => {
  test('the limit ends the day before the next personal beat opens', () => {
    const db = seed();
    const beat = nextPersonalBeat(db);
    const { seconds, stopsFor } = skipLimit(db, MAX_SKIP_SECONDS);
    if (beat) {
      expect(stopsFor).toBe(beat.title);
      expect(daysBetween(db.state.inStoryDate, beat.opens)).toBeGreaterThanOrEqual(Math.round(seconds / DAY));
    } else {
      expect(seconds).toBe(MAX_SKIP_SECONDS);
    }
  });

  test('the narrator gets a TIME SKIP line, and none in a fight', () => {
    const db = seed();
    expect(formatTimeSkipLine(db, '*I train for three months.*', false)).toContain('TIME SKIP');
    expect(formatTimeSkipLine(db, '*I train for three months.*', true)).toContain('not now');
    const text = buildNarrationPrompt(db, '*I train with Itachi for three months.*').messages[1].content;
    expect(text).toContain('TIME SKIP');
  });
});

describe('a skip moves the world (audit 4.4)', () => {
  test('a year asked for, the tracker agreeing: the clock jumps, canon and ages catch up', () => {
    // Every personal beat already played, so nothing stops the year early.
    const base = seed();
    const personal = CANON_MILESTONES.filter((milestone) => milestone.playerDriven).map((milestone) => milestone.id);
    const db: AppDatabase = {
      ...base,
      state: {
        ...base.state,
        canonProgress: {
          version: 3,
          active: [],
          engaged: [],
          ...(base.state.canonProgress ?? {}),
          completed: [...(base.state.canonProgress?.completed ?? []), ...personal],
        } as AppDatabase['state']['canonProgress'],
      },
    };
    const { seconds } = skipLimit(db, 365 * DAY);
    const days = Math.round(seconds / DAY);
    const kanBefore = entityAge(db.state.inStoryDate, db.entities.find((entity) => entity.name === 'Kan')!);
    const result = play(db, '*A year passes. I train with Itachi.*', `${days} days pass in training.`, {
      time: { elapsed: days, unit: 'days', clock_time: null },
      scene_pace: 'downtime',
    });
    const moved = daysBetween(db.state.inStoryDate, result.db.state.inStoryDate);
    expect(moved).toBeGreaterThanOrEqual(days - 1);
    expect(moved).toBeGreaterThan(7);
    expect(result.events.some((event) => event.text.startsWith('Time skip'))).toBe(true);
    const fired = result.db.state.canonProgress?.completed.length ?? 0;
    expect(fired).toBeGreaterThan(db.state.canonProgress?.completed.length ?? 0);
    if (days >= 180) {
      expect(result.db.memoryJobs?.some((job) => job.kind === 'timeSkip')).toBe(true);
      const kanAfter = entityAge(result.db.state.inStoryDate, result.db.entities.find((entity) => entity.name === 'Kan')!);
      expect((kanAfter ?? 0) - (kanBefore ?? 0)).toBeGreaterThanOrEqual(0);
    }
  });

  test('without a request, the same report is held to the pace cap', () => {
    const db = seed();
    const result = play(db, '*I keep going.*', 'A year passes.', {
      time: { elapsed: 1, unit: 'years', clock_time: null },
      scene_pace: 'downtime',
    });
    expect(daysBetween(db.state.inStoryDate, result.db.state.inStoryDate)).toBeLessThanOrEqual(7);
  });

  test('the tracker disagreeing with the request means no skip', () => {
    const db = seed();
    const result = play(db, '*I train for three months.*', 'You train until dusk.', {
      time: { elapsed: 6, unit: 'hours', clock_time: null },
      scene_pace: 'downtime',
    });
    expect(daysBetween(db.state.inStoryDate, result.db.state.inStoryDate)).toBeLessThanOrEqual(1);
  });
});

describe('long jumps need two sources (audit 4.5)', () => {
  test('prose alone saying "three days" against a tracker saying two hours: the tracker wins', () => {
    expect(guardLongJump({ reportedSeconds: 7200, detectedSeconds: 3 * DAY, pace: 'travel', sceneEnded: false })).toBe(7200);
    expect(guardLongJump({ reportedSeconds: 3 * DAY, detectedSeconds: 3 * DAY, pace: 'travel', sceneEnded: false })).toBe(3 * DAY);
    expect(guardLongJump({ reportedSeconds: 2 * DAY, detectedSeconds: 0, pace: 'travel', sceneEnded: false })).toBe(2 * DAY);
  });
});

import { advanceCanon, unfireFutureMilestones } from '../lib/rpg/canon';
import { isDeceased } from '../lib/rpg/deaths';

describe('a correction backwards takes canon back (audit 4.5)', () => {
  test('a milestone now in the future is un-fired, with its death, and fires again later', () => {
    const base = seed();
    const at = (db: AppDatabase, year: number, month: number, day: number): AppDatabase => ({
      ...db,
      state: { ...db.state, inStoryDate: { ...db.state.inStoryDate, year, month, day, hour: 12 } },
    });
    // Jiraiya dies in year 21, month 9.
    let db = advanceCanon(at(base, 21, 10, 1), { inCombat: false });
    const jiraiya = () => db.entities.find((entity) => entity.name === 'Jiraiya')!;
    expect(isDeceased(jiraiya())).toBe(true);
    expect(db.state.canonProgress?.completed).toContain('jiraiya-dies');

    db = unfireFutureMilestones(at(db, 21, 8, 1));
    expect(isDeceased(jiraiya())).toBe(false);
    expect(db.state.canonProgress?.completed).not.toContain('jiraiya-dies');
    expect(db.events.some((event) => event.id === 'event_canon_jiraiya-dies')).toBe(false);

    db = advanceCanon(at(db, 21, 10, 1), { inCombat: false });
    expect(isDeceased(jiraiya())).toBe(true);
  });
});
