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
  /**
   * The last time of day the prose names, loosely ("on the morning of the
   * twenty-ninth day", "that evening"). Never moves the clock alone; a time
   * skip lands on it (resolveTurnClock), the way a rest lands on morning.
   */
  landing?: { hour: number; minute: number };
  /**
   * The time of day in the sentence where a journey ends ("By the late
   * afternoon of the second day, you reach the border"). Lands the turn when
   * it fits the stated duration, or there is none (resolveTurnClock).
   */
  arrival?: { hour: number; minute: number };
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
function explicitClock(text: string): ClockReading | undefined {
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

  return undefined;
}

/** A period word as an event: "dawn breaks", "night falls", "it is evening now". */
function periodEventClock(text: string): ClockReading | undefined {
  // When the prose passes through several ("dusk… another dawn… by evening"),
  // the last one is where the turn ends.
  const events: Array<{ index: number; word: string }> = [];
  const collect = (pattern: RegExp, word?: string) => {
    for (const match of text.matchAll(pattern)) {
      events.push({ index: match.index ?? 0, word: word ?? match[1] });
    }
  };

  collect(/\b(?:it is|it's|it was|now)\s+(?:already\s+)?(morning|noon|midday|afternoon|evening|night|midnight|dawn|dusk)\b(?!\s+(?:when|before|after|by))/gi);
  collect(/\b(dawn|daybreak|sunrise|dusk|sunset|nightfall|first light)\s+(?:broke|breaks|is breaking|settles?|settled|falls?|fell|came|comes|arrives?|arrived)\b/gi);
  collect(/\b(morning|evening|night|noon|midday|darkness)\s+(?:came|comes|fell|falls|settled|settles|arrives?|arrived)\b/gi);
  collect(/\bthe sun\s+(?:rises|rose|is rising|comes up|came up)\b/gi, 'dawn');
  collect(/\bthe sun\s+(?:sets|set|is setting|goes down|went down|sinks|sank)\b/gi, 'dusk');

  const last = events.sort((a, b) => a.index - b.index).at(-1);
  return hourOfPeriod(last?.word);
}

/** Time-of-day words with an early / late / mid shade ("late afternoon" ~ 16:30). */
const SHADED_PERIOD = '(early|late|mid)?[\\s-]*(midnight|dawn|daybreak|sunrise|first light|morning|noon|midday|afternoon|dusk|sunset|evening|nightfall|night)';

const SHADED_HOURS: Record<string, Record<string, [number, number]>> = {
  morning: { early: [6, 0], mid: [10, 0], late: [10, 30] },
  afternoon: { early: [13, 0], mid: [15, 0], late: [16, 30] },
  evening: { early: [18, 0], mid: [19, 30], late: [21, 0] },
  night: { early: [20, 0], mid: [0, 0], late: [23, 0] },
};

function shadedHour(shade: string | undefined, word: string): ClockReading | undefined {
  const lower = word.toLowerCase();
  const shaded = shade ? SHADED_HOURS[lower]?.[shade.toLowerCase()] : undefined;
  return shaded ? { hour: shaded[0], minute: shaded[1] } : hourOfPeriod(lower);
}

// "you reach", "you arrive", "make camp": the sentence that ends the journey.
const ARRIVAL =
  /\b(?:reach|reaches|reached|reaching|arrive|arrives|arrived|arriving|make it|makes it|made it|stumble into|stumbles into|stumbled into|limp into|limps into|limped into|pull into|pulls into|pulled into|make camp|makes camp|made camp|halt|halts|halted|come to a stop|comes to a stop|came to a stop)\b/i;
// Plans and conditions are not arrivals: "you would need to reach it by morning".
const NOT_YET =
  /\b(?:will|would|could|should|might|must|shall|going to|need to|needs to|needed to|have to|has to|had to|plan|plans|planned|hope|hopes|hoped|expect|expects|expected|if|unless|want to|wants to|try to|tries to)\b/i;

function sentencesOf(text: string) {
  return text.split(/(?<=[.!?])\s+|\n+/).filter((sentence) => sentence.trim());
}

function arrivalSentences(text: string) {
  return sentencesOf(text)
    .filter((sentence) => ARRIVAL.test(sentence) && !NOT_YET.test(sentence))
    .reverse();
}

/** An hour or period event inside the sentence where the journey ends. */
function arrivalStrictClock(text: string): ClockReading | undefined {
  for (const sentence of arrivalSentences(text)) {
    const reading = explicitClock(sentence) ?? periodEventClock(sentence);
    if (reading) return reading;
  }

  return undefined;
}

/**
 * "By the late afternoon of the second day, you reach the border." The prose
 * may pass through dusk and another dawn on the way; the arrival is where
 * the turn lands (audit 4.7).
 */
function arrivalPeriod(text: string): ClockReading | undefined {
  const pattern = new RegExp(`\\b(?:at|by|until|till|around|toward|towards|in|on|near)\\s+(?:the\\s+)?${SHADED_PERIOD}\\b`, 'i');

  for (const sentence of arrivalSentences(text)) {
    const shaded = pattern.exec(sentence);
    if (shaded) return shadedHour(shaded[1], shaded[2]);
  }

  return undefined;
}

/**
 * The last time of day the prose names at all, with its shade ("on the
 * morning of the twenty-ninth day", "that evening", "late one night").
 */
function landingOf(text: string): ClockReading | undefined {
  const pattern = new RegExp(`\\b${SHADED_PERIOD}\\b`, 'gi');
  let last: ClockReading | undefined;

  for (const match of text.matchAll(pattern)) {
    last = shadedHour(match[1], match[2]) ?? last;
  }

  return last;
}

/**
 * The hour the reply names. The arrival sentence's hour comes first; then an
 * explicit hour anywhere; then the last period event, unless an arrival
 * names its time of day (then the dawns and dusks on the way are passing).
 */
function parseClock(text: string, arrival: ClockReading | undefined): ClockReading | undefined {
  return arrivalStrictClock(text) ?? explicitClock(text) ?? (arrival ? undefined : periodEventClock(text));
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

  const arrivalReading = arrivalPeriod(text);
  const reading = parseClock(text, arrivalReading);

  if (reading) {
    clock = nextOccurrence(reading, advanceSeconds(current, elapsedSeconds));
  }

  const sleep = sleptNight ? { sleptNight: true } : {};

  if (nextDayMatch && !clock) {
    clock = { hour: MORNING_HOUR, minute: 0 };
  }

  const periodHint = clock ? undefined : periodHintOf(text);
  const landing = clock ? undefined : landingOf(text);
  const arrival = clock ? undefined : arrivalReading;

  return {
    elapsedSeconds,
    clock,
    ...(arrival ? { arrival } : {}),
    ...(periodHint ? { periodHint } : {}),
    ...(landing ? { landing } : {}),
    ...sleep,
  };
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
