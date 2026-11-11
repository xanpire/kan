/**
 * Audit section 4: the clock. Every row of the brief's repro table, run through
 * the real detectNarrationTime + resolveTurnClock, plus the fixes around it.
 */
import { describe, expect, test } from 'bun:test';

import { advanceSeconds, secondsBetween } from '../lib/rpg/calendar';
import { resolveTurnClock } from '../lib/rpg/pacing';
import { detectNarrationTime } from '../lib/rpg/timeparse';
import type { CalendarDate, ScenePace } from '../lib/rpg/types';

const at = (hour: number, minute = 0): CalendarDate => ({ year: 13, month: 10, day: 4, hour, minute, second: 0 });

function step(
  narration: string,
  current: CalendarDate,
  options: { pace?: ScenePace; reportedSeconds?: number; reportedClock?: { hour: number; minute: number } } = {}
) {
  const result = resolveTurnClock({
    reportedSeconds: options.reportedSeconds ?? 0,
    reportedClock: options.reportedClock,
    detected: detectNarrationTime(narration, current),
    pace: options.pace ?? 'conversation',
    sceneEnded: false,
    current,
  });
  return { seconds: result.elapsedSeconds, after: advanceSeconds(current, result.elapsedSeconds) };
}

const HOUR = 3600;

describe('the repro table (audit 4)', () => {
  test('"The first may be a decoy." does not jump to May', () => {
    expect(step('The first may be a decoy.', at(15)).seconds).toBeLessThan(HOUR);
  });

  test('"…as the second march begins." does not jump to March', () => {
    expect(step('The drums sound as the second march begins.', at(15)).seconds).toBeLessThan(HOUR);
  });

  test('"At one point the rain eases" is not one o\'clock', () => {
    expect(step('At one point the rain eases and you can hear the river.', at(15)).seconds).toBeLessThan(HOUR);
  });

  test('"watched by two guards" is not two o\'clock', () => {
    expect(step('The gate is watched by two guards.', at(15)).seconds).toBeLessThan(HOUR);
  });

  test('"meet at seven" at 5 PM means 7 PM today', () => {
    const digits = step('You agree to meet at 7:00 by the old well.', at(17));
    expect(digits.after.hour).toBe(19);
    expect(digits.after.day).toBe(4);

    const words = step("You agree to meet at seven o'clock by the well.", at(17));
    expect(words.after.hour).toBe(19);
    expect(words.after.day).toBe(4);

    // A bare number word with no suffix is not a time at all.
    expect(step('You agree to meet at seven.', at(17)).seconds).toBeLessThan(HOUR);
  });

  test('"quiet at night" and "by morning" do not move the clock', () => {
    expect(step('The village is quiet at night.', at(15)).seconds).toBeLessThan(HOUR);
    expect(step('You would need to reach the border by morning.', at(15)).seconds).toBeLessThan(HOUR);
  });

  test('"stranger" does not contain the marker "ran"', () => {
    expect(step('The stranger has three days of stubble.', at(15)).seconds).toBeLessThan(HOUR);
  });

  test('"The next morning" at 1 AM is later the same day', () => {
    const result = step('The next morning, the mist lifts off the river.', at(1), { pace: 'downtime' });
    expect(result.after.day).toBe(4);
    expect(result.after.hour).toBe(7);
  });

  test('"The next morning" in the evening is tomorrow', () => {
    const result = step('The next morning, the mist lifts off the river.', at(21), { pace: 'downtime' });
    expect(result.after.day).toBe(5);
    expect(result.after.hour).toBe(7);
  });

  test('present tense and years are read (the pace cap still applies until 4.4)', () => {
    const now = at(15);
    expect(detectNarrationTime('Three months pass in training.', now).elapsedSeconds).toBe(3 * 2592000);
    expect(detectNarrationTime('Two years later, the mountains are white again.', now).elapsedSeconds).toBe(2 * 31536000);
    expect(detectNarrationTime('You walk for two hours along the ridge.', now).elapsedSeconds).toBe(2 * HOUR);
    expect(detectNarrationTime('An hour passes before he speaks.', now).elapsedSeconds).toBe(HOUR);
    expect(detectNarrationTime('You wait three hours in the rain.', now).elapsedSeconds).toBe(3 * HOUR);
    expect(detectNarrationTime('Another two hours pass.', now).elapsedSeconds).toBe(2 * HOUR);
    expect(detectNarrationTime('You spend four days in the hideout.', now).elapsedSeconds).toBe(4 * 86400);
  });
});

describe('what still must not count', () => {
  const now = at(10);

  test.each([
    'The graves will be watched for a week.',
    'You would need two days to reach the border.',
    'The contract was signed four months ago.',
    'It was a two-day march to the quarry.',
    'He had been walking for three days before he found you.',
    'In two days you could be across the border.',
    'The ferry runs every two hours.',
    'Itachi is three years older than the boy.',
    'The stranger has three days of stubble.',
  ])('%s', (text) => {
    expect(detectNarrationTime(text, now).elapsedSeconds).toBe(0);
  });
});

describe('event-shaped periods and named hours still work', () => {
  test.each<[string, number]>([
    ['Dawn breaks over the river.', 6],
    ['Night falls over the camp.', 22],
    ['It is evening now.', 19],
    ['The sun sets behind the ridge.', 19],
    ['At 3:40 PM she finally answers.', 15],
    ['By nine in the evening, the inn is empty.', 21],
  ])('%s', (text, hour) => {
    expect(detectNarrationTime(text, at(4)).clock?.hour).toBe(hour);
  });

  test('a period word lets a matching tracker clock through, and only a matching one', () => {
    const now = at(15);
    const agrees = step('You walk until nightfall.', now, { pace: 'travel', reportedClock: { hour: 20, minute: 30 } });
    expect(agrees.after.hour).toBe(20);
    expect(agrees.after.minute).toBe(30);

    // A tracker clock far from the period is not trusted through the hint.
    const far = step('You walk until nightfall.', now, { pace: 'travel', reportedClock: { hour: 9, minute: 0 } });
    expect(far.after.hour).toBe(15);
    expect(secondsBetween(now, far.after)).toBe(1800);
  });
});

// ---------------------------------------------------------------------------
// Audit 4.6: a failed state step is never silently dropped.
// ---------------------------------------------------------------------------

import { mock } from 'bun:test';

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

const { normalizeDatabase } = await import('../lib/rpg/db');
const { seedDatabase } = await import('../lib/rpg/seed');
const { appendStoryMessage } = await import('../lib/rpg/log');
const { OpenRouterError, isTransientError } = await import('../lib/openrouter');
const { setTransientRetryDelaysForTests, withTransientRetry } = await import('../lib/rpg/services');
const { applyStateFallback, failedStateJob, isJobValid, markJobFailed, queueStateRetry, retryableSummaryJobs } =
  await import('../lib/rpg/memoryJobs');

function playedTurn() {
  let db = normalizeDatabase(seedDatabase('slot_test', 'Test'));
  db = appendStoryMessage(db, 'user', '*I walk north.*', null, 0, 0);
  db = appendStoryMessage(db, 'assistant', 'You walk north for two hours along the river. Itachi keeps pace beside you.', null, 0, 0);
  const reply = db.rawLog[db.rawLog.length - 1];
  return { db, turn: { turnLogId: reply.id, userMessage: '*I walk north.*', narration: reply.content } };
}

describe('state step retries and fallback (audit 4.6)', () => {
  test('transient errors are retried, others are not', async () => {
    setTransientRetryDelaysForTests([1, 1]);
    expect(isTransientError(new OpenRouterError('slow down', 429))).toBe(true);
    expect(isTransientError(new OpenRouterError('no provider', 503))).toBe(true);
    expect(isTransientError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isTransientError(new OpenRouterError('bad key', 401))).toBe(false);
    expect(isTransientError(Object.assign(new Error('stop'), { name: 'AbortError' }))).toBe(false);

    let calls = 0;
    const ok = await withTransientRetry(async () => {
      calls += 1;
      if (calls < 3) throw new OpenRouterError('rate limited', 429);
      return 'done';
    });
    expect(ok).toBe('done');
    expect(calls).toBe(3);

    calls = 0;
    await expect(
      withTransientRetry(async () => {
        calls += 1;
        throw new OpenRouterError('bad key', 401);
      })
    ).rejects.toThrow('bad key');
    expect(calls).toBe(1);

    calls = 0;
    await expect(
      withTransientRetry(async () => {
        calls += 1;
        throw new OpenRouterError('down', 502);
      })
    ).rejects.toThrow('down');
    expect(calls).toBe(3);
  });

  test('a failed state job is found, and the prose fallback still moves the clock', () => {
    const { db, turn } = playedTurn();
    const failed = queueStateRetry(db, turn, new Error('429'));
    const job = failedStateJob(failed);
    expect(job?.turnLogId).toBe(turn.turnLogId);

    const result = applyStateFallback(failed, job!, new Set());
    expect(result).not.toBeNull();
    const before = db.state.inStoryDate;
    const after = result!.db.state.inStoryDate;
    expect(secondsBetween(before, after)).toBe(2 * HOUR);
    expect(result!.db.rawLog.find((entry) => entry.id === turn.turnLogId)?.stateFromFallback).toBe(true);
    expect(failedStateJob(result!.db)).toBeUndefined();
  });

  test('once another turn is narrated the old state job is no longer valid (so it must be settled first)', () => {
    const { db, turn } = playedTurn();
    let failed = queueStateRetry(db, turn, new Error('429'));
    const job = failedStateJob(failed)!;
    failed = appendStoryMessage(failed, 'user', 'next', null, 0, 0);
    failed = appendStoryMessage(failed, 'assistant', 'Next reply.', null, 0, 0);
    expect(isJobValid(failed, job)).toBe(false);
  });

  test('failed summaries get up to three automatic attempts', () => {
    const { db, turn } = playedTurn();
    const scene = {
      id: 'job_scene', kind: 'scene', status: 'failed', turnLogId: turn.turnLogId,
      logIds: db.rawLog.map((entry) => entry.id), attempts: 1, createdAt: 1,
    } as any;
    let withJob = { ...db, memoryJobs: [scene] };
    expect(retryableSummaryJobs(withJob, new Set()).map((job) => job.id)).toEqual(['job_scene']);
    withJob = markJobFailed(markJobFailed(withJob, 'job_scene', 'x'), 'job_scene', 'x');
    expect(retryableSummaryJobs(withJob, new Set())).toEqual([]);
  });
});
