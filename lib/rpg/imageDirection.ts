// How scene images are framed: the director's shot vocabulary, the light
// line built from the real weather and clock, jutsu visuals, canon art
// direction, and the variety tracker. Pure, so it can be tested.
//
// See docs: claude/image-generator-cinematic.md.

import { CANON_MILESTONES } from './canonData';
import { mentionsEntity } from './characterRefs';
import { secondsBetween } from './calendar';
import { currentWeather } from './weather';
import { sunsetHour } from './ambience';
import type { AppDatabase, CalendarDate, JutsuRecord, RawLogEntry, WeatherCondition } from './types';

// ---------------------------------------------------------------------------
// Shot types
// ---------------------------------------------------------------------------

export type ShotType =
  | 'impact frame'
  | 'extreme close-up'
  | 'close-up'
  | 'medium'
  | 'full body'
  | 'wide'
  | 'extreme wide'
  | 'aerial'
  | 'ensemble'
  | 'over-the-shoulder';

/** Matched in this order: the most specific words first. */
const SHOT_PATTERNS: [RegExp, ShotType][] = [
  [/\bimpact[- ]frame\b/i, 'impact frame'],
  [/\bextreme close[- ]?up\b/i, 'extreme close-up'],
  [/\bclose[- ]?up\b/i, 'close-up'],
  [/\bensemble\b|\bline[- ]?up\b|\bbattle lines\b|\bgathering in a circle\b/i, 'ensemble'],
  [/\bextreme wide\b|\bestablishing\b/i, 'extreme wide'],
  [/\baerial\b|\bbird'?s[- ]eye\b/i, 'aerial'],
  [/\bover[- ]the[- ]shoulder\b/i, 'over-the-shoulder'],
  [/\bwide\b/i, 'wide'],
  [/\bfull[- ]body\b/i, 'full body'],
  [/\bmedium\b/i, 'medium'],
];

/** The shot type a SHOT line opens with, or null when it names none. */
export function shotTypeOf(shot: string | undefined): ShotType | null {
  if (!shot) return null;

  // The shot type comes first in the line: judge the opening words first,
  // so "close-up ... with a wide sky behind" stays a close-up.
  const head = shot.split(/[,;:.]/)[0] ?? '';

  for (const text of [head, shot]) {
    for (const [pattern, type] of SHOT_PATTERNS) {
      if (pattern.test(text)) return type;
    }
  }

  return null;
}

/** Shots that show a big space: tiny faceless figures and crowds are allowed. */
export function isScaleShot(type: ShotType | null) {
  return type === 'wide' || type === 'extreme wide' || type === 'aerial';
}

// ---------------------------------------------------------------------------
// Shot chips
// ---------------------------------------------------------------------------

export type ShotChip = 'auto' | 'closeup' | 'jutsu' | 'impact' | 'epic' | 'ensemble' | 'aftermath';

export const SHOT_CHIPS: { value: ShotChip; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto', hint: 'The director picks the shot.' },
  { value: 'closeup', label: 'Close-up', hint: 'A face at its peak emotion.' },
  { value: 'jutsu', label: 'Jutsu', hint: 'Low angle, the technique filling the frame.' },
  { value: 'impact', label: 'Impact', hint: 'The instant a blow lands, in an impact frame.' },
  { value: 'epic', label: 'Epic wide', hint: 'A tiny figure in a huge landscape and sky.' },
  { value: 'ensemble', label: 'Ensemble', hint: 'Everyone in the scene in one frame.' },
  { value: 'aftermath', label: 'Aftermath', hint: 'From above, looking down on what is left.' },
];

const CHIP_DIRECTION: Record<Exclude<ShotChip, 'auto'>, string> = {
  closeup: 'close-up or extreme close-up on the face at the emotional peak',
  jutsu: "low angle or worm's-eye, the jutsu or power filling most of the frame",
  impact: 'impact frame: the instant the blow lands or the shock hits',
  epic: 'extreme wide: the figures tiny, a huge landscape and sky around them',
  ensemble: 'ensemble: everyone in the scene in one frame, using one of the ensemble layouts',
  aftermath: "aerial or bird's-eye view of the aftermath and destruction",
};

export function chipDirection(chip: ShotChip | undefined): string | null {
  return chip && chip !== 'auto' ? CHIP_DIRECTION[chip] : null;
}

/** Ensemble shots can carry more people (sceneCast, references, action words). */
export function wantsEnsemble(chip: ShotChip | undefined, shotType: ShotType | null) {
  return chip === 'ensemble' || shotType === 'ensemble';
}

// ---------------------------------------------------------------------------
// Variety tracker (#7) and impact-frame rarity (#11)
// ---------------------------------------------------------------------------

function paintedReplies(db: Pick<AppDatabase, 'rawLog'>): RawLogEntry[] {
  return db.rawLog.filter((entry) => entry.kind === 'story' && entry.role === 'assistant' && entry.image && entry.imageMeta);
}

/** The camera lines of the last few scene images, newest last. */
export function recentShots(db: Pick<AppDatabase, 'rawLog'>, count = 3): string[] {
  return paintedReplies(db)
    .slice(-count)
    .map((entry) => entry.imageMeta?.shot ?? entry.imageMeta?.shotType ?? '')
    .filter(Boolean);
}

/** About 1 in 6 at most: no impact frame among the last five images. */
export function impactFrameAllowed(db: Pick<AppDatabase, 'rawLog'>) {
  return !paintedReplies(db)
    .slice(-5)
    .some((entry) => (entry.imageMeta?.shotType ?? shotTypeOf(entry.imageMeta?.shot)) === 'impact frame');
}

// ---------------------------------------------------------------------------
// Light and atmosphere (#3)
// ---------------------------------------------------------------------------

const WEATHER_VISUAL: Record<WeatherCondition, { day: string; night?: string }> = {
  clear: { day: 'a clear sky with wind-torn clouds', night: 'a clear starry sky and a bright moon' },
  cloudy: { day: 'heavy overcast clouds, soft diffuse light', night: 'a dark, starless sky' },
  drizzle: { day: 'a fine drizzle, a wet sheen on every surface' },
  rain: { day: 'steady rain, wet reflections on the ground' },
  downpour: { day: 'heavy driving rain in sheets, water streaming everywhere' },
  storm: { day: 'a thunderstorm, lightning forking through black clouds' },
  fog: { day: 'thick fog, shapes fading into white' },
  snow: { day: 'drifting snow, a white hush over everything' },
  blizzard: { day: 'a howling blizzard, snow streaking sideways' },
  sleet: { day: 'grey sleet slanting down, icy puddles' },
  wind: { day: 'strong wind tearing at cloaks, hair and leaves' },
  sandstorm: { day: 'a sandstorm, an orange haze swallowing the horizon' },
  heat: { day: 'shimmering heat haze under a bleached sky', night: 'a still, warm night, heat rising off the stone' },
  humid: { day: 'hazy, humid air with a soft glow' },
};

/** Weather that hides the sun and the moon: no burning sky, no moonlight. */
const SKY_HIDDEN = new Set<WeatherCondition>([
  'cloudy', 'drizzle', 'rain', 'downpour', 'storm', 'fog', 'snow', 'blizzard', 'sleet', 'sandstorm',
]);

export type SkyPhase = 'night' | 'before-dawn' | 'sunrise' | 'morning' | 'noon' | 'afternoon' | 'golden' | 'sunset' | 'blue-hour';

/** Roughly when the sun rises: mirrored around a solar noon of about 12:15. */
export function sunriseHour(month: number | undefined): number {
  return 24.5 - sunsetHour(month);
}

/**
 * Where the sun is at this moment, from the clock and the month's real
 * sunrise and sunset (Session 1: 7:12 PM in autumn was painted as a bright
 * sunset; the sun had set more than an hour before).
 */
export function skyPhase(date: CalendarDate): SkyPhase {
  const h = Math.max(0, Math.min(23, date.hour ?? 12)) + Math.max(0, Math.min(59, date.minute ?? 0)) / 60;
  const set = sunsetHour(date.month);
  const rise = sunriseHour(date.month);

  if (h < rise - 1 || h >= set + 1.25) return 'night';
  if (h < rise) return 'before-dawn';
  if (h < rise + 1) return 'sunrise';
  if (h < 10.5) return 'morning';
  if (h < 14.5) return 'noon';
  if (h < set - 1.5) return 'afternoon';
  if (h < set) return 'golden';
  if (h < set + 0.5) return 'sunset';
  return 'blue-hour';
}

/** After the sun is down: the image must not show a sunset or a daylight sky. */
export function isDark(phase: SkyPhase) {
  return phase === 'night' || phase === 'before-dawn' || phase === 'blue-hour';
}

const OPEN_SKY: Record<SkyPhase, string> = {
  night: 'night: moonlight and deep blue shadows, the sky black',
  'before-dawn': 'the grey-blue first light before dawn, the sun not yet up, no colour in the sky',
  sunrise: 'dawn: a cold blue sky warming to a pink and gold horizon',
  morning: 'clean morning light, long soft shadows',
  noon: 'harsh noon sun, short hard shadows',
  afternoon: 'warm afternoon light',
  golden: 'golden hour: the sun low, warm orange light and long shadows',
  sunset: 'just after sunset: the sun gone below the horizon, a fading orange band low in the sky, the land falling into shadow',
  'blue-hour': 'deep dusk after sunset: a dark blue sky, the last faint light on the horizon, the land almost black',
};

const HIDDEN_SKY: Record<SkyPhase, string> = {
  night: 'a dark night under thick cloud: no moon, no stars, the land nearly black',
  'before-dawn': 'grey pre-dawn gloom under low cloud',
  sunrise: 'a grey dawn, the sun hidden behind cloud',
  morning: 'flat grey morning light, the sun hidden',
  noon: 'flat grey daylight, no sun and no hard shadows',
  afternoon: 'dull grey afternoon light, the sun hidden',
  golden: 'a dim late afternoon, the sun hidden, the light fading grey',
  sunset: 'a dim grey dusk, no sun and no sunset colours',
  'blue-hour': 'a dark grey-blue dusk under cloud, light almost gone',
};

function lightOfMoment(date: CalendarDate, condition: WeatherCondition, indoors: boolean) {
  const phase = skyPhase(date);

  if (indoors) {
    return isDark(phase)
      ? 'warm lamplight and torchlight, deep shadows; dark outside'
      : 'daylight falling through openings, deep shadows inside';
  }

  return (SKY_HIDDEN.has(condition) ? HIDDEN_SKY : OPEN_SKY)[phase];
}

/** One short line for the director: what the light is right now. */
export function lightNow(db: AppDatabase, inMemory = false): string {
  const moment = sceneMoment(db, inMemory);
  const phase = skyPhase(moment.date);
  const text = lightOfMoment(moment.date, moment.condition, moment.indoors);

  return isDark(phase) && !moment.indoors
    ? `${text}. It is dark: never a sunset or a daylight sky`
    : text;
}

/** Colour accents a scene's effects give it, from its words. */
const ACCENTS: [RegExp, string][] = [
  [/\bamaterasu\b|\bblack flames?\b/i, 'black and violet flames'],
  [/\bsusanoo\b|\bsusano'?o\b/i, 'ghostly Susanoo glow'],
  [/\b(chidori|kirin|lightning|raiton|lightning style)\b/i, 'white-blue lightning'],
  [/\b(fire|flames?|fireball|katon|fire style|burning|blaze|embers?)\b/i, 'orange and red firelight'],
  [/\b(water style|suiton|tidal|water dragon|shark)\b/i, 'deep ocean blue'],
  [/\b(rasengan|wind style|futon)\b/i, 'swirling pale blue chakra'],
  [/\bsand\b/i, 'gold sand'],
  [/\b(sharingan|mangeky[oō])\b/i, 'the red glow of the Sharingan'],
  [/\b(blood|bleeding|bloodied|wound)\b/i, 'crimson blood'],
];

export function colourAccent(text: string): string | null {
  const found = ACCENTS.filter(([pattern]) => pattern.test(text)).map(([, accent]) => accent);
  return found.length > 0 ? found.slice(0, 2).join(' and ') : null;
}

/** The scene's clock and weather: the memory's own in a flashback. */
export function sceneMoment(db: AppDatabase, inMemory: boolean): {
  date: CalendarDate;
  condition: WeatherCondition;
  weatherText?: string;
  indoors: boolean;
} {
  const memory = inMemory ? db.state.flashbacks?.active ?? null : null;

  if (memory) {
    return {
      date: memory.date,
      condition: memory.weather?.condition ?? 'clear',
      weatherText: memory.weather?.text,
      indoors: memory.locationKind === 'structure',
    };
  }

  const now = currentWeather(db);

  return {
    date: db.state.inStoryDate,
    condition: now.condition,
    weatherText: now.text,
    indoors: db.state.locationKind === 'structure',
  };
}

/** One line of light and atmosphere from the real weather and time of day. */
export function lightLine(db: AppDatabase, sceneText: string, inMemory = false): string {
  const moment = sceneMoment(db, inMemory);
  const night = isDark(skyPhase(moment.date));
  const visual = WEATHER_VISUAL[moment.condition];
  const weather = moment.weatherText?.trim() || (night && visual.night ? visual.night : visual.day);
  const accent = colourAccent(sceneText);

  return [
    `Light and atmosphere: ${lightOfMoment(moment.date, moment.condition, moment.indoors)}`,
    moment.indoors ? `; outside, ${weather}` : `; ${weather}`,
    accent ? `; colour accent: ${accent}` : '',
    '.',
    night && !moment.indoors ? ' It is dark: no sunset, no sun, no daylight sky.' : '',
  ].join('');
}

// ---------------------------------------------------------------------------
// Jutsu on screen (#5)
// ---------------------------------------------------------------------------

function jutsuNamed(text: string, record: JutsuRecord) {
  const lower = text.toLowerCase();
  const name = record.name.toLowerCase();

  if (lower.includes(name)) return true;

  // "Fire Style: Great Fireball Technique" is often just "Great Fireball".
  const short = name.replace(/^[^:]+:\s*/, '').replace(/\s+(technique|jutsu)$/, '').trim();
  return short.length >= 6 && lower.includes(short);
}

/** Recorded jutsu named in the scene text, with a visual, most used first. */
export function jutsuOnScreen(db: Pick<AppDatabase, 'jutsuRecords'>, text: string, limit = 2): JutsuRecord[] {
  return (db.jutsuRecords ?? [])
    .filter((record) => record.visual?.trim() && jutsuNamed(text, record))
    .sort((a, b) => b.timesUsed - a.timesUsed)
    .slice(0, limit);
}

export function jutsuLines(records: JutsuRecord[]): string[] {
  return records.map(
    (record) =>
      `Jutsu on screen: ${record.name} — ${record.visual.trim().replace(/\.$/, '')}. Make it the visual centrepiece: scale, glow, motion, debris.`
  );
}

// ---------------------------------------------------------------------------
// Canon art direction (#13)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(['the', 'of', 'land', 'village', 'hidden', 'an', 'a', 'near', 'outside', 'in', 'at']);

function placeWords(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

/** Within this long after a milestone happened, its art direction still applies. */
const ART_DIRECTION_WINDOW_SECONDS = 2 * 24 * 3600;

/**
 * A fixed visual hint when the story is at, or just past, a big canon
 * moment Kan is part of or near: the beat he took on, or a milestone that
 * happened in the last two days where he is.
 */
export function canonArtDirection(db: AppDatabase): string | null {
  const date = db.state.inStoryDate;

  // The massacre night, if Kan is where it happened.
  if (date.year === 13 && date.month === 10 && date.day <= 1 && /\buchiha\b|\bdistrict\b|\bcompound\b/i.test(db.state.location ?? '')) {
    return 'the night of the Uchiha massacre: a huge blood-red full moon low in the sky, silhouettes on rooftops, deep red and black';
  }

  const progress = db.state.canonProgress;

  if (!progress) return null;

  const here = new Set(placeWords(db.state.location ?? ''));

  for (const milestone of CANON_MILESTONES) {
    if (!milestone.artDirection) continue;

    if (progress.engaged.includes(milestone.id) && !progress.completed.includes(milestone.id)) {
      return milestone.artDirection;
    }

    if (!progress.completed.includes(milestone.id)) continue;

    const event = db.events.find((item) => item.id === `event_canon_${milestone.id}`);

    if (!event) continue;

    const since = secondsBetween(event.inStoryDate, date);

    if (since < 0 || since > ART_DIRECTION_WINDOW_SECONDS) continue;

    const there = placeWords(`${milestone.location ?? ''} ${milestone.region ?? ''}`);

    if (there.some((word) => here.has(word))) {
      return milestone.artDirection;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Look tags for canon characters (#6c)
// ---------------------------------------------------------------------------

/** "Kisame: tall, blue-grey skin…" for each person named in the action. */
export function lookTags(
  db: AppDatabase,
  action: string,
  options: { exclude?: Set<string>; limit?: number; ageAt?: (entityId: string) => number | undefined } = {}
): string[] {
  const lower = action.toLowerCase();

  return db.entities
    .filter(
      (entity) =>
        entity.type === 'character' &&
        entity.name.toLowerCase() !== 'kan' &&
        !options.exclude?.has(entity.name) &&
        (entity.appearance?.trim() || entity.currentLook?.trim()) &&
        mentionsEntity(action, entity)
    )
    .map((entity) => {
      const at = Math.min(
        ...[entity.name, ...entity.aliases].map((name) => lower.indexOf(name.toLowerCase())).filter((i) => i >= 0),
        Number.MAX_SAFE_INTEGER
      );
      const age = options.ageAt?.(entity.id);
      const look = [entity.appearance?.trim(), entity.currentLook?.trim() ? `right now: ${entity.currentLook.trim()}` : '']
        .filter(Boolean)
        .join('; ')
        .replace(/\.(?=;|$)/g, '');

      return { at, line: `${entity.name}${age !== undefined ? ` (age ${age})` : ''}: ${look.slice(0, 220)}` };
    })
    .sort((a, b) => a.at - b.at)
    .slice(0, options.limit ?? 10)
    .map((entry) => entry.line);
}
