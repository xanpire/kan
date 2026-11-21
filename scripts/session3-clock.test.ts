/**
 * Session 3 (v1.25.10): the run to the border. The tracker reported 55 hours
 * landing at dawn; the app moved the clock 71 h 42 min, to 10:00 PM on 4 Oct.
 */
import { describe, expect, test } from 'bun:test';

import { advanceSeconds } from '../lib/rpg/calendar';
import { paceOfTurn, resolveTurnClock } from '../lib/rpg/pacing';
import { detectNarrationTime } from '../lib/rpg/timeparse';
import type { CalendarDate, ScenePace } from '../lib/rpg/types';

const HOUR = 3600;
const date = (day: number, hour: number, minute = 0): CalendarDate => ({ year: 13, month: 10, day, hour, minute, second: 0 });

function land(
  narration: string,
  current: CalendarDate,
  options: { pace: ScenePace; reportedSeconds?: number; reportedClock?: { hour: number; minute: number }; sceneEnded?: boolean; action?: string }
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
  });
  return { at: advanceSeconds(current, result.elapsedSeconds), detected, result };
}

export const BORDER_RUN =
  'You run without halting through the rest of that terrible night. Dawn brings no sunlight, only a pale, bruised smear along the eastern clouds that confirms the village behind you has awakened to an empty compound. There is no rest. When the rain finally thins near noon, your lungs burn with the steady, grueling rhythm of shinobi transit. You pass abandoned watchtowers and silent logging roads.\n\n' +
  'Night falls a second time, colder and sharper, and still you push across the rocky rises where Fire’s lush timber begins to thin into scrub and jagged limestone.\n\n' +
  'It takes two full days of punishing travel. By the dawn of the third day, the air carries a heavy, iron tang, thick with the perpetual low mist of the western borders. Ahead, jutting out of the mud beside a rushing gorge, stands an ancient stone boundary post.\n\n' +
  'Itachi drops from the canopy, landing soundlessly on the wet shale just a pace beyond the marker. He stands waiting in the gray light, and looks back at you.';

describe('the run to the border lands at dawn (Session 3)', () => {
  test('55 hours to dawn, as the tracker said, lands on 4 Oct between 4 and 7 AM', () => {
    const { at, detected, result } = land(BORDER_RUN, { ...date(1, 22, 17) }, {
      pace: 'travel',
      reportedSeconds: 55 * HOUR,
      reportedClock: { hour: 6, minute: 0 },
      sceneEnded: true,
      action: 'I follow him north-west and we run through the night without stopping until we are over the border of Fire.',
    });
    if (at.hour > 7) console.log(JSON.stringify(detected), JSON.stringify(result));
    expect(at.day).toBe(4);
    expect(at.hour).toBeGreaterThanOrEqual(4);
    expect(at.hour).toBeLessThanOrEqual(7);
  });
});

import { normalizeDatabase } from '../lib/rpg/db';
import { seedDatabase } from '../lib/rpg/seed';
import { applyWeather, currentWeather, proseBacksWeather, weatherFromNarration } from '../lib/rpg/weather';

const BORDER_FULL =
  'Itachi accepts it with a single nod that cuts through the downpour. He turns and takes to the upper branches, vanishing into the grey torrent.\n\n' +
  BORDER_RUN;

describe('the weather a journey ends in (Session 3)', () => {
  const seeded = normalizeDatabase(seedDatabase('slot_wx', 'Wx'));

  test('the tracker’s mist, which the prose shows, is not overridden by the first paragraph’s downpour', () => {
    expect(proseBacksWeather(BORDER_FULL, 'rain easing to a cold low mist')).toBe(true);
    const db = applyWeather(seeded, 'rain easing to a cold low mist');
    expect(currentWeather(db).condition).toBe('fog');
    expect(weatherFromNarration(db, BORDER_FULL)).toBeUndefined();
  });

  test('with no report, the last paragraph that shows weather decides', () => {
    const wet = applyWeather(seeded, 'a hard downpour');
    expect(weatherFromNarration(wet, BORDER_FULL)).toBe('thick fog');
  });

  test('a report the prose never shows is still overridden', () => {
    expect(proseBacksWeather('Snow falls on the pass all afternoon.', 'clear skies')).toBe(true);
    expect(proseBacksWeather('The downpour hammers the pass.', 'thick fog')).toBe(false);
  });

  test('rain with "the mist" in the same paragraph is still rain (audit 7.2)', () => {
    const clear = applyWeather(seeded, 'clear skies');
    expect(weatherFromNarration(clear, 'The rain hammers the canopy and the mist rises off the river.')).toBe('steady rain');
  });
});

describe('spelled-out clock times (Session 3)', () => {
  const morning = { ...date(4, 6, 32) };

  test('"nearly five hours… By twenty past eleven" lands at 11:20, not 23:20', () => {
    const { at } = land(
      'The descent takes nearly five hours of hard pace. By twenty past eleven, the smell of river silt thickens, and Itachi slows, coming to a halt on a wide sandbar.',
      morning,
      { pace: 'travel', reportedSeconds: 5 * HOUR }
    );
    expect([at.day, at.hour, at.minute]).toEqual([4, 11, 20]);
  });

  test('half past, a quarter to, ten past', () => {
    expect(detectNarrationTime('At half past nine you reach the gate.', morning).clock).toEqual({ hour: 9, minute: 30 });
    expect(detectNarrationTime('It is a quarter to four when you stop.', morning).clock).toEqual({ hour: 15, minute: 45 });
    expect(detectNarrationTime('By ten past six in the evening the light is gone.', morning).clock).toEqual({ hour: 18, minute: 10 });
    expect(detectNarrationTime('By ten past midnight the camp is asleep.', morning).clock).toEqual({ hour: 0, minute: 10 });
  });

  test('a minute count is not a clock without a reference to an hour', () => {
    expect(detectNarrationTime('After ten minutes of silence, he speaks.', morning).clock).toBeUndefined();
  });
});

describe('a skip cut short lands on the morning the prose ends on (Session 3)', () => {
  test('"By nightfall… By the grey morning of the next day" lands in the morning, not at nightfall', () => {
    const current = date(4, 11, 36);
    const text =
      'Only one day passes on the road west. By nightfall, the flat wetlands buckle into jagged slate, the border of the Land of Rain weeping under an endless drizzle.\n\n' +
      "By the grey morning of the next day, you are brought deep within Rain's drowned perimeter, into the hollow belly of an immense iron reservoir.";
    const detected = detectNarrationTime(text, current);
    const result = resolveTurnClock({
      reportedSeconds: 86400,
      detected,
      pace: paceOfTurn('travel', text, undefined, detected.sleptNight),
      sceneEnded: false,
      current,
      skipSeconds: 86400,
    });
    const at = advanceSeconds(current, result.elapsedSeconds);
    expect([at.day, at.hour]).toEqual([5, 8]);
  });
});

describe('the past perfect is backstory, not time passing (Session 3)', () => {
  const now = { year: 12, month: 10, day: 21, hour: 16, minute: 0, second: 0 };

  test('a flashback’s "had yielded nothing for two days" does not move the clock', () => {
    expect(
      detectNarrationTime('The assignment—a tracking sweep along the bluffs—had yielded nothing for two days. Ahead of you, Itachi pauses.', now).elapsedSeconds
    ).toBe(0);
    expect(detectNarrationTime('The scout had walked for three days before he found them.', now).elapsedSeconds).toBe(0);
  });

  test('the present tense still counts', () => {
    expect(detectNarrationTime('You walk for two hours before the trees thin.', now).elapsedSeconds).toBe(7200);
  });
});
