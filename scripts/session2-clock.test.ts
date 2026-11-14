/**
 * Session 2 clock bugs (audit 4.10 to 4.13): replies played on v1.24.77
 * that moved the clock wrongly, fed through the app's own parser and resolver.
 */
import { describe, expect, test } from 'bun:test';

import { advanceSeconds } from '../lib/rpg/calendar';
import { paceOfTurn, resolveTurnClock, validateScenePace } from '../lib/rpg/pacing';
import { detectNarrationTime } from '../lib/rpg/timeparse';
import type { CalendarDate, ScenePace } from '../lib/rpg/types';

const HOUR = 3600;
const DAY = 86400;
const date = (day: number, hour: number, minute = 0): CalendarDate => ({ year: 13, month: 10, day, hour, minute, second: 0 });

function land(
  narration: string,
  current: CalendarDate,
  options: {
    pace: ScenePace;
    reportedSeconds?: number;
    reportedClock?: { hour: number; minute: number };
    skipSeconds?: number;
    sceneEnded?: boolean;
    action?: string;
  }
) {
  const detected = detectNarrationTime(narration, current, { action: options.action });
  const pace = paceOfTurn(options.pace, narration, undefined, detected.sleptNight);
  const result = resolveTurnClock({
    reportedSeconds: options.reportedSeconds ?? 0,
    reportedClock: options.reportedClock,
    detected,
    pace,
    sceneEnded: options.sceneEnded ?? false,
    current,
    skipSeconds: options.skipSeconds,
  });
  return advanceSeconds(current, result.elapsedSeconds);
}

const SLEEP =
  'You settle against the cold stone. Itachi keeps watch. Eight hours pass in the freezing dark, broken only by the drip of the trees. ' +
  'When your eyes open, dawn has broken over the ridge, grey and wet, the fourth of October.';

describe('sleeping until morning lands in the morning (audit 4.10)', () => {
  test('the Session 2 reply, tracker said conversation, lands between 5 and 7 AM on 4 Oct', () => {
    const at = land(SLEEP, date(3, 22, 9), {
      pace: 'conversation',
      reportedSeconds: 8 * HOUR,
      reportedClock: { hour: 6, minute: 0 },
      sceneEnded: true,
      action: 'I sit against the rock and sleep until morning',
    });
    expect(at.day).toBe(4);
    expect(at.hour).toBeGreaterThanOrEqual(5);
    expect(at.hour).toBeLessThanOrEqual(7);
  });

  test('the wording counts as a night slept, and the turn as downtime', () => {
    const detected = detectNarrationTime(SLEEP, date(3, 22, 9));
    expect(detected.sleptNight).toBe(true);
    expect(paceOfTurn('conversation', SLEEP, undefined, detected.sleptNight)).toBe('downtime');
  });

  test('the action alone counts when the prose wakes Kan', () => {
    const reply = 'The rain thins. Somewhere an owl calls, then nothing. Grey morning finds you stiff against the rock.';
    expect(detectNarrationTime(reply, date(3, 22, 9), { action: 'I sleep until morning' }).sleptNight).toBe(true);
  });

  test('an afternoon nap is not a night', () => {
    const nap = 'You doze in the shade. Two hours pass. You wake to the sound of Itachi sharpening a kunai.';
    expect(detectNarrationTime(nap, date(3, 14, 0)).sleptNight).toBeFalsy();
  });

  test('when the tracker and the prose agree on a length, the pace cap does not cut it', () => {
    const reply = 'You talk through the night. Six hours pass before either of you notices the cold.';
    const at = land(reply, date(3, 20, 0), { pace: 'conversation', reportedSeconds: 6 * HOUR, sceneEnded: true });
    expect(at.day).toBe(4);
    expect(at.hour).toBe(2);
  });

  test('a fight still cannot skip time, agreement or not', () => {
    const reply = 'Six hours pass in a blur of steel.';
    const at = land(reply, date(3, 20, 0), { pace: 'combat', reportedSeconds: 6 * HOUR });
    expect(at.hour).toBe(20);
  });
});

const JOURNEY =
  'You run. For nearly two full days—thirty-six hours broken only by brief halts to drink from streams—Itachi sets a pace that turns your legs to fire. ' +
  'It is early morning of the third of October when the border stone passes beneath you.';

describe('"nearly two full days—thirty-six hours" is 36 hours (audit 4.11)', () => {
  test('the parser takes the exact length over the rounded one', () => {
    expect(detectNarrationTime(JOURNEY, date(1, 22, 6)).elapsedSeconds).toBe(36 * HOUR);
  });

  test('"thirty-six" is one number', () => {
    expect(detectNarrationTime('You walk for thirty-six hours.', date(1, 8)).elapsedSeconds).toBe(36 * HOUR);
    expect(detectNarrationTime('Twenty-one days pass.', date(1, 8)).elapsedSeconds).toBe(21 * DAY);
  });

  test('"It is early morning … when" counts as the arrival', () => {
    expect(detectNarrationTime(JOURNEY, date(1, 22, 6)).arrival).toEqual({ hour: 6, minute: 0 });
  });

  test('the journey lands on the morning of 3 Oct', () => {
    const at = land(JOURNEY, date(1, 22, 6), { pace: 'travel', reportedSeconds: 36 * HOUR, reportedClock: { hour: 6, minute: 0 } });
    expect(at.day).toBe(3);
    expect(at.hour).toBeGreaterThanOrEqual(5);
    expect(at.hour).toBeLessThanOrEqual(8);
  });

  test('when the two lengths disagree, the one nearer the named time of day wins', () => {
    const reply = 'Two days of hard running. It is early morning when the border stone passes beneath you.';
    const at = land(reply, date(1, 22, 6), { pace: 'travel', reportedSeconds: 32 * HOUR });
    expect(at.day).toBe(3);
    expect(at.hour).toBeLessThanOrEqual(8);
  });
});

const TRUTH =
  '"Before the strike could happen," Itachi says, "Danzō ambushed him and took his eye. The elders would fight over what remained." ' +
  'He does not look at you. The rain keeps falling.';

describe('talk about violence is not a fight (audit 4.12)', () => {
  test('fighting words inside speech do not count', () => {
    expect(validateScenePace('conversation', TRUTH)).toBe('conversation');
  });

  test('two fighting words in the narration itself still make a fight', () => {
    const fight = 'He lunges. You dodge the first blade and parry the second.';
    expect(validateScenePace('conversation', fight)).toBe('combat');
    expect(validateScenePace('travel', fight)).toBe('combat');
  });

  test('the tracker said conversation and reported no fight: it stands', () => {
    const told = 'He tells it flatly: an ambush, a strike in the night, a fight over the remains.';
    expect(validateScenePace('conversation', told, { fightOptions: 0, jutsuUsed: 0 })).toBe('conversation');
    expect(validateScenePace('conversation', told, { fightOptions: 4, jutsuUsed: 0 })).toBe('combat');
    // Travel is still overridden, so a fight is never skipped as a journey.
    expect(validateScenePace('travel', told, { fightOptions: 0, jutsuUsed: 0 })).toBe('combat');
  });
});

describe('a skip lands at the time of day the prose names (audit 4.13)', () => {
  const MONTH = 26 * DAY + 20 * HOUR;

  test('a reply that ends "by evening" lands in the evening of the end date', () => {
    const reply = 'Four weeks pass in the rain. By evening on the last of them, Itachi finds you on the roof.';
    const at = land(reply, date(4, 4, 13), { pace: 'downtime', reportedSeconds: MONTH, skipSeconds: MONTH });
    expect(at.day).toBe(31);
    expect(at.hour).toBe(19);
  });

  test('a reply that ends on a morning lands in the morning', () => {
    const reply = 'Four weeks pass. On a grey morning at the end of them, a bird finds the window.';
    const at = land(reply, date(4, 4, 13), { pace: 'downtime', reportedSeconds: MONTH, skipSeconds: MONTH });
    expect(at.hour).toBeGreaterThanOrEqual(6);
    expect(at.hour).toBeLessThanOrEqual(10);
  });

  test('no time of day anywhere: the start time of day, never midnight', () => {
    const reply = 'Four weeks pass. By the start of November, the cloak no longer feels strange.';
    const at = land(reply, date(4, 4, 13), { pace: 'downtime', reportedSeconds: MONTH, skipSeconds: MONTH });
    expect(at.hour).toBe(4);
    expect(at.minute).toBe(13);
  });

  test('the tracker clock_time is used when the prose names none', () => {
    const reply = 'Four weeks pass. By the start of November, the cloak no longer feels strange.';
    const at = land(reply, date(4, 4, 13), { pace: 'downtime', reportedSeconds: MONTH, skipSeconds: MONTH, reportedClock: { hour: 15, minute: 0 } });
    expect(at.hour).toBe(15);
  });
});
