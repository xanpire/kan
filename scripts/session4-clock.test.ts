/**
 * Session 4 (v1.25.31): "Nearly twenty-four hours pass … By twenty past five
 * the following evening" from 5:55 PM landed at 5:20 AM (+11 h 25 min).
 */
import { describe, expect, test } from 'bun:test';

import { advanceSeconds } from '../lib/rpg/calendar';
import { paceOfTurn, resolveTurnClock } from '../lib/rpg/pacing';
import { detectNarrationTime } from '../lib/rpg/timeparse';
import type { CalendarDate } from '../lib/rpg/types';

const date = (day: number, hour: number, minute = 0): CalendarDate => ({ year: 13, month: 10, day, hour, minute, second: 0 });

const SPIRE =
  'Nearly twenty-four hours pass in a hollow, grinding blur. The night leaves you isolated in the lower chambers while the blood dries stiff against your skin. When the next afternoon bleeds toward dusk, you take to the maintenance conduits.\n\n' +
  'By twenty past five the following evening, you crouch on the narrow copper finial of the monolith’s highest spire. The storm canopy overhead tears open, letting a pale, bruised orange sunset cut through the gloom.';

describe('"the following evening" is an evening (Session 4)', () => {
  test('the clock reads 17:20, not 5:20', () => {
    expect(detectNarrationTime(SPIRE, date(10, 17, 55)).clock).toEqual({ hour: 17, minute: 20 });
  });

  test('the spire lands at 5:20 PM the next day', () => {
    const current = date(10, 17, 55);
    const detected = detectNarrationTime(SPIRE, current, {});
    const result = resolveTurnClock({
      reportedSeconds: 23 * 3600,
      detected,
      pace: paceOfTurn('travel', SPIRE, undefined, detected.sleptNight),
      sceneEnded: true,
      current,
    });
    expect(advanceSeconds(current, result.elapsedSeconds)).toMatchObject({ day: 11, hour: 17, minute: 20 });
  });

  test('"that night" and "the next morning" also count', () => {
    expect(detectNarrationTime('You reach the gate at ten that night.', date(10, 12)).clock).toEqual({ hour: 22, minute: 0 });
    expect(detectNarrationTime('By half past six the next morning you are moving.', date(10, 20)).clock).toEqual({ hour: 6, minute: 30 });
  });
});
