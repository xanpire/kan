import { advanceSeconds, shiftDate } from './calendar';
import type { CalendarDate } from './types';

export type ParsedTime = {
  elapsedSeconds: number;
  /** An hour the prose clearly names ("at 7:30", "at seven in the evening", "dawn breaks"). */
  clock?: { hour: number; minute: number };
  /**
   * A period word that doesn't fix the time by itself ("until nightfall",
   * "by morning"). It only counts when the state tracker's clock_time agrees
   * (see resolveTurnClock).
   */
  periodHint?: { hour: number; minute: number };
  /** A full night's sleep: the turn clock jumps to the next morning. */
  sleptNight?: boolean;
};

/** Hour a "next morning" lands on (pacing.ts has the same WAKE_HOUR). */
const MORNING_HOUR = 7;

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  couple: 2,
  few: 3,
  several: 4,
};

const UNIT_SECONDS: Record<string, number> = {
  second: 1,
  seconds: 1,
  minute: 60,
  minutes: 60,
  hour: 3600,
  hours: 3600,
  day: 86400,
  days: 86400,
  week: 604800,
  weeks: 604800,
  month: 2592000,
  months: 2592000,
  year: 31536000,
  years: 31536000,
};

function countValue(raw: string): number {
  const lower = raw.toLowerCase();

  if (NUMBER_WORDS[lower] !== undefined) {
    return NUMBER_WORDS[lower];
  }

  const parsed = Number.parseInt(lower, 10);

  return Number.isFinite(parsed) ? parsed : 0;
}

const CLOCK_WORDS: Array<[RegExp, number]> = [
  [/\bmidnight\b/i, 0],
  [/\bdawn|daybreak|sunrise|first light\b/i, 6],
  [/\bmorning\b/i, 8],
  [/\bnoon|midday\b/i, 12],
  [/\bafternoon\b/i, 14],
  [/\bdusk|sunset\b/i, 19],
  [/\bevening\b/i, 19],
  [/\bnightfall\b/i, 21],
  [/\bnight\b/i, 22],
];

type ClockReading = { hour: number; minute: number; /** No am/pm: either half of the day. */ ambiguous?: boolean };

/**
 * An hour the prose names. Strict on purpose: a number word only counts with
 * a suffix ("o'clock", am/pm, "in the evening", "at night"), so "at one point"
 * or "watched by two guards" are never times. Digits ("at 7:30") count alone.
 */
function parseClock(text: string): ClockReading | undefined {
  const explicit = /\b(?:at|by|until|before|around|after|past)\s+(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?(?![\w])/i.exec(text);

  if (explicit) {
    let hour = Number(explicit[1]);
    const minute = Number(explicit[2]);
    const suffix = explicit[3]?.toLowerCase().replace(/\./g, '');

    if (suffix === 'pm' && hour < 12) hour += 12;
    if (suffix === 'am' && hour === 12) hour = 0;

    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute, ambiguous: !suffix && hour >= 1 && hour <= 12 };
    }
  }

  const twelveHour = /\b(?:at|by|until|before|around|after|past)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})(\s+o'clock|\s+o’clock)?\s*(am|pm|a\.m\.|p\.m\.|in the morning|in the afternoon|in the evening|at night)?(?![\w])/i.exec(text);

  if (twelveHour && (twelveHour[2] || twelveHour[3])) {
    let hour = NUMBER_WORDS[twelveHour[1].toLowerCase()] ?? Number.parseInt(twelveHour[1], 10);
    const suffix = (twelveHour[3] ?? '').toLowerCase().replace(/\./g, '');

    if (!(hour >= 1 && hour <= 12)) {
      return undefined;
    }

    if (suffix === 'pm' || suffix.includes('afternoon') || suffix.includes('evening') || suffix.includes('night')) {
      if (hour < 12) hour += 12;
    } else if ((suffix === 'am' || suffix.includes('morning')) && hour === 12) {
      hour = 0;
    }

    return { hour: hour % 24, minute: 0, ambiguous: !suffix };
  }

  // A period word fixes the time only as an event: "dawn breaks", "night
  // falls", "it is evening now".
  const periodState =
    /\b(?:it is|it's|it was|now)\s+(?:already\s+)?(morning|noon|midday|afternoon|evening|night|midnight|dawn|dusk)\b(?!\s+(?:when|before|after|by))/i.exec(text) ??
    /\b(dawn|daybreak|sunrise|dusk|sunset|nightfall|first light)\s+(?:broke|breaks|is breaking|settles?|settled|falls?|fell|came|comes|arrives?|arrived)\b/i.exec(text) ??
    /\b(morning|evening|night|noon|midday|darkness)\s+(?:came|comes|fell|falls|settled|settles|arrives?|arrived)\b/i.exec(text);
  const sun = /\bthe sun\s+(?:rises|rose|is rising|comes up|came up)\b/i.test(text)
    ? 'dawn'
    : /\bthe sun\s+(?:sets|set|is setting|goes down|went down|sinks|sank)\b/i.test(text)
      ? 'dusk'
      : undefined;

  return hourOfPeriod(periodState?.[1] ?? sun);
}

function hourOfPeriod(word: string | undefined): ClockReading | undefined {
  const lower = (word ?? '').toLowerCase();

  if (!lower) {
    return undefined;
  }

  if (lower === 'darkness') {
    return { hour: 21, minute: 0 };
  }

  for (const [pattern, hour] of CLOCK_WORDS) {
    if (pattern.test(lower)) {
      return { hour, minute: 0 };
    }
  }

  return undefined;
}

/**
 * "until nightfall", "by morning": a period word that names no event. Never
 * moves the clock alone; resolveTurnClock uses it only to accept a matching
 * clock_time from the state tracker.
 */
function periodHintOf(text: string): ClockReading | undefined {
  const phrase = /\b(?:at|by|until|till|before|around|after|toward|towards)\s+(midnight|dawn|daybreak|sunrise|first light|morning|noon|midday|afternoon|dusk|sunset|evening|nightfall|night)\b/i.exec(text);
  return hourOfPeriod(phrase?.[1]);
}

/** "At seven" with no am/pm: the next seven ahead of `base`, never one behind it. */
function nextOccurrence(reading: ClockReading, base: CalendarDate): { hour: number; minute: number } {
  if (!reading.ambiguous) {
    return { hour: reading.hour, minute: reading.minute };
  }

  const baseSeconds = base.hour * 3600 + base.minute * 60 + (base.second ?? 0);
  const morningHour = reading.hour % 12;
  const candidates = [morningHour, morningHour + 12];
  const ahead = candidates.find((hour) => hour * 3600 + reading.minute * 60 >= baseSeconds);

  return { hour: ahead ?? morningHour, minute: reading.minute };
}

/**
 * Removes speech, so a spoken plan ("Walk until nightfall, Kan.") never moves
 * the clock: only what the narration says happened counts. Handles straight
 * and curly double quotes; a quote left open runs to the end of its paragraph.
 */
export function stripSpeech(text: string): string {
  return text
    .replace(/"[^"\n]*(?:"|(?=\n)|$)/g, ' ')
    .replace(/“[^”\n]*(?:”|(?=\n)|$)/g, ' ');
}

// Reads narration into elapsed clock time. Deliberately conservative: only
// clear elapsed phrasing counts, and explicit clocks/dates always win.
export function detectNarrationTime(rawText: string, current: CalendarDate): ParsedTime {
  const text = rawText ? stripSpeech(rawText) : '';

  if (!text.trim()) {
    return { elapsedSeconds: 0 };
  }

  let elapsedSeconds = 0;
  let clock: { hour: number; minute: number } | undefined;

  // A full night's sleep jumps to morning (resolveTurnClock), so it adds no
  // fixed hours here.
  const sleptNight =
    /\b(a|one)\s+(good\s+|full\s+|long\s+)?night'?s?\s+(sleep|rest)\b|\bslept\s+(through\s+the\s+night|until\s+(dawn|morning|sunrise))\b/i.test(
      text
    );

  if (/\b(a\s+)?(short\s+rest|nap)\b|\bdosed\s+off\b/i.test(text)) {
    elapsedSeconds = Math.max(elapsedSeconds, 30 * 60);
  }

  if (
    /\ba\s+(heartbeat|little\s+longer\s+than\s+a\s+heartbeat)\b|\ban\s+instant\b|\bin\s+the\s+blink\s+of\s+an\s+eye\b/i.test(
      text
    )
  ) {
    elapsedSeconds = Math.max(elapsedSeconds, 2);
  }

  if (/\b(a\s+)?few\s+seconds\b|\bseconds?\s+later\b/i.test(text)) {
    elapsedSeconds = Math.max(elapsedSeconds, 5);
  }

  if (/\bseconds?\s+of\s+(fighting|clashing|struggle)\b/i.test(text)) {
    elapsedSeconds = Math.max(elapsedSeconds, 15);
  }

  // Up to two words may sit between the number and the unit ("two relentless
  // hours", "three long, cold days"), but never another number or unit, so
  // "a few more days" reads as a few, not one.
  const numbers = `${Object.keys(NUMBER_WORDS).join('|')}|\\d+`;
  const units = Object.keys(UNIT_SECONDS).join('|');
  const unitPattern = new RegExp(
    `\\b(${numbers})\\s+(?:(?!(?:${numbers}|${units})\\b)[a-z'-]+,?\\s+){0,2}(${units})\\b`,
    'gi'
  );

  let match: RegExpExecArray | null;

  while ((match = unitPattern.exec(text)) !== null) {
    const amount = countValue(match[1]);
    const unitSeconds = UNIT_SECONDS[match[2].toLowerCase()] ?? 0;
    const before = text.slice(Math.max(0, match.index - 30), match.index).toLowerCase();
    const after = text
      .slice(match.index + match[0].length, match.index + match[0].length + 24)
      .toLowerCase();

    // Plans, needs, the past and distances are not time passing now.
    const notNow =
      AFTER_NOT_NOW.test(after) || BEFORE_NOT_NOW.test(before);
    const elapsedMarker = AFTER_MARKER.test(after) || BEFORE_MARKER.test(before) || /\bafter\s+$/.test(before);

    if (elapsedMarker && !notNow && amount > 0 && unitSeconds > 0) {
      elapsedSeconds = Math.max(elapsedSeconds, amount * unitSeconds);
    }
  }

  // "An hour passes", "a day goes by": the number is "a"/"an", already above
  // when the verb follows; this also catches "hours pass" with no number.
  if (/\bhours\s+(?:pass|passed|go by|went by|crawl by|crawled by)\b/i.test(text)) {
    elapsedSeconds = Math.max(elapsedSeconds, 2 * 3600);
  }

  const nextDayMatch = /\bthe (?:next|following)\s+(day|morning|dawn|evening|night|afternoon)\b/i.exec(text);
  // After midnight and before waking, "the next morning" is later the same day.
  const sameDayMorning =
    Boolean(nextDayMatch) &&
    /^(morning|dawn)$/i.test(nextDayMatch?.[1] ?? '') &&
    current.hour < MORNING_HOUR;

  if (nextDayMatch && !sameDayMorning) {
    elapsedSeconds = Math.max(elapsedSeconds, 86400);
  }

  const reading = parseClock(text);

  if (reading) {
    clock = nextOccurrence(reading, advanceSeconds(current, elapsedSeconds));
  }

  const sleep = sleptNight ? { sleptNight: true } : {};

  if (nextDayMatch && !clock) {
    clock = { hour: MORNING_HOUR, minute: 0 };
  }

  const periodHint = clock ? undefined : periodHintOf(text);

  return { elapsedSeconds, clock, ...(periodHint ? { periodHint } : {}), ...sleep };
}

// Words right after the duration that mean it passed: "two hours later", "three months pass".
const AFTER_MARKER =
  /^[\s,]*(?:\w+\s+)?\b(later|after|pass|passes|passed|go by|goes by|went by|slip by|slips by|slipped by|crawl by|of travel|of riding|of marching|on the road|on the trail|of walking|of running|of training|in training)\b/;
// Verbs right before it that spend it: "you walk for two hours", "she spent three days".
const BEFORE_MARKER =
  /\b(spent|spend|spends|spending|travel|travels|traveled|travelled|traveling|travelling|march|marches|marched|marching|ride|rides|rode|riding|walk|walks|walked|walking|run|runs|ran|running|sleep|sleeps|slept|rest|rests|rested|wait|waits|waited|waiting|search|searches|searched|searching|fought|fight|fights|endured|endure|endures|train|trains|trained|training|take|takes|took|for)\b[^.!?]*$/;
// "four months ago", "a week from now", "for the next two days" are not this turn.
const AFTER_NOT_NOW = /^[\s,]*(ago|before that|earlier|from now|away|out|off|'s|’s|of (?:stubble|beard|growth|rations|food|water|supplies|travel away))\b/;
const BEFORE_NOT_NOW =
  /\b(will|would|could|should|might|must|shall|need|needs|needed|going to|plan|plans|planned|hope|hopes|want|wants|had been|has been|have been|the next|the last|the past|in|within|than|every|each|per)\s+(?:\w+\s+){0,3}$/;

export function applyParsedTime(current: CalendarDate, parsed: ParsedTime): CalendarDate {
  let next = current;

  if (parsed.elapsedSeconds > 0) {
    next = advanceSeconds(next, parsed.elapsedSeconds);
  }

  if (parsed.clock) {
    const targetSeconds = parsed.clock.hour * 3600 + parsed.clock.minute * 60;
    const currentSeconds = next.hour * 3600 + next.minute * 60 + (next.second ?? 0);

    if (parsed.elapsedSeconds === 0 && targetSeconds < currentSeconds) {
      next = shiftDate(next, 1);
    }

    next = { ...next, hour: parsed.clock.hour, minute: parsed.clock.minute, second: 0 };
  }

  return next;
}
