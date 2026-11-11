// Real time skips (audit 4.4, decided by Xan). The story spans about twenty
// years, but an ordinary turn can move the clock at most a few days. When
// the player asks for time to pass ("I train for three months", "two years
// later", the Let time pass action), one turn may cover it:
//
// - at most 3 years;
// - never past the day before a personal canon beat opens, so nothing
//   personal is lost by accident (the reply ends there and says how long
//   actually passed);
// - never in a fight or a chase;
// - only when the state tracker's time.elapsed agrees with what was asked
//   (within 25%).
//
// World events inside the skip happen as usual (advanceCanon fires them all)
// and reach Kan through the catch-up news report.

import { advanceSeconds, dateSortValue, secondsBetween, SECONDS_PER_DAY } from './calendar';
import { CANON_MILESTONES } from './canonData';
import type { AppDatabase, CalendarDate } from './types';

/** The longest single skip: three years. */
export const MAX_SKIP_SECONDS = 3 * 365 * SECONDS_PER_DAY;
/** Shorter than this is an ordinary turn, not a skip. */
export const MIN_SKIP_SECONDS = 2 * SECONDS_PER_DAY;
/** How far the tracker's elapsed time may be from the request and still agree. */
export const SKIP_AGREEMENT = 0.25;

const UNIT_SECONDS: Record<string, number> = {
  day: SECONDS_PER_DAY,
  week: 7 * SECONDS_PER_DAY,
  month: 30 * SECONDS_PER_DAY,
  season: 91 * SECONDS_PER_DAY,
  year: 365 * SECONDS_PER_DAY,
};

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, couple: 2, 'a couple of': 2, few: 3, 'a few': 3, several: 5, half: 0.5,
};

const AMOUNT = '(\\d+(?:\\.\\d+)?|a couple of|a few|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple|few|several|half an?)';
const UNIT = '(days?|weeks?|months?|seasons?|years?)';
const DURATION = new RegExp(`\\b${AMOUNT}\\s+${UNIT}\\b`, 'i');

function amountOf(word: string) {
  const lower = word.toLowerCase().trim();
  if (/^\d/.test(lower)) return Number(lower);
  if (lower.startsWith('half')) return 0.5;
  return NUMBER_WORDS[lower] ?? NaN;
}

function durationSeconds(text: string): number | null {
  const match = DURATION.exec(text);
  if (!match) return null;
  const amount = amountOf(match[1]);
  const unit = UNIT_SECONDS[match[2].toLowerCase().replace(/s$/, '')];
  return Number.isFinite(amount) && unit ? Math.round(amount * unit) : null;
}

const SEASON_START: Record<string, number> = { spring: 3, summer: 6, autumn: 9, fall: 9, winter: 12 };

function untilSeason(word: string, from: CalendarDate): number | null {
  const month = SEASON_START[word.toLowerCase()];
  if (!month) return null;
  const year = month > from.month || (month === from.month && from.day < 1) ? from.year : from.year + 1;
  const target: CalendarDate = { ...from, year, month, day: 1, hour: 8, minute: 0, second: 0 };
  return secondsBetween(from, target);
}

/**
 * How long the player asked to skip, in seconds, or null when the input is
 * not a skip request. `from` is the clock before the turn.
 */
export function requestedSkip(input: string, from: CalendarDate): number | null {
  const text = input.replace(/[*_]/g, ' ');
  const asksToSkip = /\b(time skip|skip (?:ahead|forward|to|until|a|the)|let time pass|time passes|let (?:the )?(?:days|weeks|months|years) pass)\b/i.test(text);
  const later = new RegExp(`\\b${AMOUNT}\\s+${UNIT}\\s+(?:later|pass(?:es|ed)?|go(?:es)? by|went by)\\b`, 'i').test(text);
  const spendsTime = new RegExp(
    `\\b(train|training|wait|waiting|travel|travelling|traveling|rest|resting|stay|staying|study|studying|recover|recovering|heal|healing|hide|hiding|live|living|work|working|practise|practice|practicing|practising)\\b[^.!?]{0,40}?\\bfor\\s+${AMOUNT}\\s+${UNIT}\\b`,
    'i'
  ).test(text);
  const season = /\buntil (spring|summer|autumn|fall|winter)\b/i.exec(text);

  let seconds: number | null = null;

  if (season && (asksToSkip || /\b(wait|rest|stay|train|hide|live|winter|lie low)\b/i.test(text))) {
    seconds = untilSeason(season[1], from);
  } else if (asksToSkip || later || spendsTime) {
    seconds = durationSeconds(text);
  }

  if (!seconds || seconds < MIN_SKIP_SECONDS) {
    return null;
  }

  return Math.min(seconds, MAX_SKIP_SECONDS);
}

/** The next personal canon beat that has not opened yet, and when it opens. */
export function nextPersonalBeat(db: AppDatabase) {
  const now = dateSortValue(db.state.inStoryDate);
  const done = new Set([...(db.state.canonProgress?.completed ?? []), ...(db.state.canonProgress?.engaged ?? [])]);
  let best: { title: string; opens: CalendarDate } | null = null;

  for (const milestone of CANON_MILESTONES) {
    if (!milestone.playerDriven || done.has(milestone.id)) continue;

    const opens: CalendarDate = {
      year: milestone.from.year,
      month: milestone.from.month,
      day: milestone.from.day ?? 1,
      hour: 0,
      minute: 0,
      second: 0,
    };

    if (dateSortValue(opens) <= now) continue;
    if (!best || dateSortValue(opens) < dateSortValue(best.opens)) best = { title: milestone.title, opens };
  }

  return best;
}

/**
 * The longest this skip may run: what was asked, at most 3 years, stopping
 * the day before the next personal beat opens.
 */
export function skipLimit(db: AppDatabase, asked: number) {
  const beat = nextPersonalBeat(db);
  let limit = Math.min(asked, MAX_SKIP_SECONDS);
  let stopsFor: string | null = null;

  if (beat) {
    const dayBefore = secondsBetween(db.state.inStoryDate, beat.opens) - SECONDS_PER_DAY;

    if (dayBefore < limit) {
      limit = Math.max(SECONDS_PER_DAY, dayBefore);
      stopsFor = beat.title;
    }
  }

  return { seconds: limit, stopsFor };
}

/** "3 months", "1 year and 2 months", "12 days". */
export function describeSpan(seconds: number) {
  const days = Math.round(seconds / SECONDS_PER_DAY);

  if (days < 14) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;

  const years = Math.floor(days / 365);
  const months = Math.round((days - years * 365) / 30);

  if (years === 0) return `${months} months`;
  return `${years} year${years === 1 ? '' : 's'}${months > 0 ? ` and ${months} month${months === 1 ? '' : 's'}` : ''}`;
}

/**
 * The skip this turn's state step may apply, or null: the player asked for
 * one, no fight is on, and the tracker's elapsed time agrees.
 */
export function allowedSkip(
  db: AppDatabase,
  input: string,
  reportedSeconds: number,
  fighting: boolean
): number | null {
  const asked = requestedSkip(input, db.state.inStoryDate);

  if (!asked || fighting) return null;

  const { seconds: limit } = skipLimit(db, asked);
  // The narrator may have stopped early for a personal beat: agreement is
  // with what was allowed, not only with what was asked.
  const agrees = (target: number) => Math.abs(reportedSeconds - target) <= target * SKIP_AGREEMENT;

  if (!agrees(asked) && !agrees(limit)) return null;

  return Math.min(reportedSeconds, limit);
}

/** The TIME SKIP line for the narrator's dynamic block, when the player asked for one. */
export function formatTimeSkipLine(db: AppDatabase, input: string, fighting: boolean): string {
  const asked = requestedSkip(input, db.state.inStoryDate);

  if (!asked) return '';

  if (fighting) {
    return 'TIME SKIP: not now. A fight is on; time cannot jump in the middle of it. Play the moment and let the player ask again later.';
  }

  const { seconds, stopsFor } = skipLimit(db, asked);
  const until = advanceSeconds(db.state.inStoryDate, seconds);

  return [
    `TIME SKIP: Kan asked for about ${describeSpan(asked)} to pass. Compress the stretch into this one reply: what he does, how it changes him, the few moments that matter. Say plainly how long passed, and end at the first moment that needs him.`,
    stopsFor
      ? `It can run only ${describeSpan(seconds)} (to about Year ${until.year}, month ${until.month}): something of his own is about to begin, so end there and say that only ${describeSpan(seconds)} passed.`
      : `It runs up to about Year ${until.year}, month ${until.month}.`,
    'The world went on meanwhile, but its news reaches him only through people, letters and birds, as always.',
  ].join(' ');
}
