/**
 * Session 1 clock bugs (audit 4.7, 4.8, 4.9): replies played on v1.24.44
 * that landed on the wrong time of day, and a skip offered in a fight.
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

import { advanceSeconds, secondsBetween } from '../lib/rpg/calendar';
import { normalizeDatabase } from '../lib/rpg/db';
import { resolveCharacterRefs } from '../lib/rpg/entities';
import { appendStoryMessage } from '../lib/rpg/log';
import { applyStateStep } from '../lib/rpg/memoryJobs';
import { resolveTurnClock } from '../lib/rpg/pacing';
import { timeSkipBlocked } from '../lib/rpg/sceneMode';
import { seedDatabase } from '../lib/rpg/seed';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import { detectNarrationTime } from '../lib/rpg/timeparse';
import type { AppDatabase, CalendarDate, ScenePace } from '../lib/rpg/types';

const DAY = 86400;
const HOUR = 3600;
const date = (day: number, hour: number, minute = 0): CalendarDate => ({ year: 13, month: 10, day, hour, minute, second: 0 });

function land(
  narration: string,
  current: CalendarDate,
  options: { pace?: ScenePace; reportedSeconds?: number; reportedClock?: { hour: number; minute: number }; skipSeconds?: number } = {}
) {
  const result = resolveTurnClock({
    reportedSeconds: options.reportedSeconds ?? 0,
    reportedClock: options.reportedClock,
    detected: detectNarrationTime(narration, current),
    pace: options.pace ?? 'travel',
    sceneEnded: false,
    current,
    skipSeconds: options.skipSeconds,
  });
  return advanceSeconds(current, result.elapsedSeconds);
}

// The shape of Session 1's run to the border: two days, a dusk and another
// dawn on the way, and the arrival in the last sentence.
const BORDER_RUN =
  'You run beside him for two days, stopping only to drink. Dusk bleeds into night, and then another dawn breaks over the canopy. ' +
  'Your legs burn. Itachi never slows. By the late afternoon of the second day, you reach the border.';

describe('travel lands on the arrival time (audit 4.7)', () => {
  test('the run to the border lands in the late afternoon, not at dawn', () => {
    for (const reportedClock of [undefined, { hour: 7, minute: 0 }, { hour: 16, minute: 0 }]) {
      const after = land(BORDER_RUN, date(2, 22), { reportedSeconds: 2 * DAY, reportedClock });
      expect(after.hour).toBeGreaterThanOrEqual(16);
      expect(after.hour).toBeLessThanOrEqual(17);
      expect(after.day).toBe(4);
    }
  });

  test('with a shorter tracker report the arrival still sets the hour', () => {
    const after = land(BORDER_RUN, date(2, 22), { reportedSeconds: DAY + 9 * HOUR });
    expect(after.hour).toBe(16);
  });

  test('of several period events, the last one wins', () => {
    const after = land('Dusk falls as you walk. Later, the sun rises over the ridge.', date(4, 15), { reportedSeconds: 15 * HOUR });
    expect(after.hour).toBe(6);
  });

  test('a planned arrival is not an arrival', () => {
    const after = land('You would need to reach the border by the late afternoon.', date(4, 9), { pace: 'conversation' });
    expect(after.hour).toBe(9);
    expect(detectNarrationTime('If you reach the river by evening, you can rest.', date(4, 9)).clock).toBeUndefined();
  });

  test('a stated arrival with no duration moves to that hour', () => {
    const after = land('By nightfall you reach an empty shrine.', date(4, 15));
    expect(after.hour).toBe(21);
    expect(after.day).toBe(4);
  });
});

describe('a skip lands on the prose time of day (audit 4.8)', () => {
  const SKIP = 'A month passes in the rain. You train, you watch, you say little. On the morning of the twenty-ninth day, a paper crane lands on your sill.';

  test('the one-month skip lands in the morning, not at midnight', () => {
    // Session 1: the skip began on the evening of 3 Oct and ran +27 d 5 h.
    const start = date(3, 18, 55);
    const skip = 27 * DAY + 5 * HOUR;

    for (const reportedClock of [undefined, { hour: 0, minute: 0 }]) {
      const after = land(SKIP, start, { pace: 'downtime', reportedSeconds: skip, reportedClock, skipSeconds: skip });
      // The skip's length ends at 23:55 on 30 Oct. Since audit 4.13 the
      // narrator is told that end date and the skip lands on it (it was the
      // nearest morning, 31 Oct, before).
      expect(after.month).toBe(10);
      expect(after.day).toBe(30);
      expect(after.hour).toBe(8);
    }
  });

  test('without a time of day in the prose, the tracker clock is used', () => {
    const start = date(3, 18, 55);
    const after = land('A month passes.', start, { pace: 'downtime', reportedSeconds: 27 * DAY, reportedClock: { hour: 14, minute: 0 }, skipSeconds: 27 * DAY });
    expect(after.hour).toBe(14);
    expect(after.day).toBe(30);
  });

  test('ordinary turns ignore the loose landing word', () => {
    const after = land('You think of the morning you left the Leaf.', date(4, 15), { pace: 'conversation' });
    expect(after.hour).toBe(15);
  });
});

const seed = () => normalizeDatabase(seedDatabase('slot_s1clock', 'Session 1 clock'));

function play(db: AppDatabase, input: string, narration: string, state: Record<string, unknown>) {
  let next = appendStoryMessage(db, 'user', input, null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  const diff = resolveCharacterRefs(next, convertStateBlock(state).diff);
  return applyStateStep(next, diff, { turnLogId, userMessage: input, narration }, new Set());
}

describe('Let time pass in a fight (audit 4.9)', () => {
  const fighting = (db: AppDatabase): AppDatabase => ({ ...db, state: { ...db.state, scenePace: 'combat', sceneClosed: false } });

  test('the sheet is closed in a fight and says why, in second person', () => {
    const calm: AppDatabase = { ...seed(), state: { ...seed().state, scenePace: 'conversation' } };
    expect(timeSkipBlocked(calm)).toBeNull();
    const why = timeSkipBlocked(fighting(seed()));
    expect(why).toBeTruthy();
    expect(why).not.toMatch(/\bKan\b/);
  });

  test('a skip asked for in a fight is refused, and Debug says so', () => {
    const db = fighting(seed());
    const result = play(db, '*Time passes: 1 month. You keep to yourself.*', 'He lunges. You twist aside; the blade strikes stone.', {
      time: { elapsed: 30, unit: 'days', clock_time: null },
      scene_pace: 'combat',
    });
    // Held to the fight's pace cap (ten minutes), not a month.
    expect(secondsBetween(db.state.inStoryDate, result.db.state.inStoryDate)).toBeLessThanOrEqual(600);
    expect(result.events.some((event) => event.kind === 'refused' && event.text.startsWith('Time skip refused'))).toBe(true);
  });
});
