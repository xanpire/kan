// Seasons and weather (living-world Stage 4, section 13).
//
// Weather comes from the calendar and the region Kan is in: snow in the north
// in winter, the Land of Fire's rainy season and monsoon heat, fog that never
// lifts off the Mist, sandstorms in the Wind, and the Rain that never stops.
// It is deterministic per save, region and six-hour block, and spells last
// (each block mostly keeps the last one's weather), so the sky doesn't flip
// from turn to turn.
//
// Once a scene starts its weather is held (state.weather) so it stays the
// same through the scene. The story can change it (a storm rolls in, a jutsu
// clears the fog): the state tracker reports `weather`, and that holds for a
// while in that region.
//
// The narrator gets one WEATHER line a turn: what it is, the season, and what
// it does to travel, tracking, footing and mood.

import { daysFromCivil, civilFromDays, secondsBetween, timeOfDayOf } from './calendar';
import { REGION_NAME, currentRegion, type Region } from './geography';
import { locationKindOf } from './encounters';
import type { AppDatabase, CalendarDate, SceneModeName, WeatherCondition, WeatherLock } from './types';
import { hashText } from './util';

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

export const WEATHER_CONDITIONS: WeatherCondition[] = [
  'clear',
  'cloudy',
  'drizzle',
  'rain',
  'downpour',
  'storm',
  'fog',
  'snow',
  'blizzard',
  'sleet',
  'wind',
  'sandstorm',
  'heat',
  'humid',
];

type ConditionInfo = {
  /** How the narrator should picture it. */
  label: string;
  /** At night, when it reads differently. */
  night?: string;
  /** Multiplier on travel time. */
  travel: number;
  /** What it does to tracks and scent. */
  tracks: string;
  /** Footing, sight and sound in a fight. */
  ground: string;
  /** The feel it gives a scene. */
  mood: string;
  /** Shown on the map and the Story header. */
  short: string;
};

export const CONDITION_INFO: Record<WeatherCondition, ConditionInfo> = {
  clear: {
    label: 'clear skies',
    night: 'a clear, cold night under the stars',
    travel: 1,
    tracks: 'tracks and scent hold well',
    ground: 'firm, dry footing and good sight; little cover from being seen',
    mood: 'open, exposed',
    short: 'Clear',
  },
  cloudy: {
    label: 'a grey, overcast sky',
    night: 'a dark, starless night',
    travel: 1,
    tracks: 'tracks hold',
    ground: 'dry footing, flat light',
    mood: 'flat and grey',
    short: 'Overcast',
  },
  drizzle: {
    label: 'a thin, steady drizzle',
    travel: 1.1,
    tracks: 'scent fades within hours',
    ground: 'slick stone and roots',
    mood: 'damp and dreary',
    short: 'Drizzle',
  },
  rain: {
    label: 'steady rain',
    travel: 1.25,
    tracks: 'rain washes out scent and soft tracks',
    ground: 'mud and slick footing; the rain muffles footsteps',
    mood: 'heavy and grey',
    short: 'Rain',
  },
  downpour: {
    label: 'a hard downpour',
    travel: 1.4,
    tracks: 'tracks and scent wash away fast',
    ground: 'deep mud, poor sight, rain drowns out every footstep',
    mood: 'oppressive',
    short: 'Downpour',
  },
  storm: {
    label: 'a thunderstorm',
    travel: 1.6,
    tracks: 'tracking is close to impossible',
    ground: 'driving rain and wind, lightning, poor sight; the noise covers movement',
    mood: 'tense and wild',
    short: 'Storm',
  },
  fog: {
    label: 'thick fog',
    travel: 1.15,
    tracks: 'a trail is easy to lose, and easy to hide in',
    ground: 'sight down to a few dozen paces; sound carries strangely',
    mood: 'muffled and uneasy',
    short: 'Fog',
  },
  snow: {
    label: 'falling snow',
    travel: 1.4,
    tracks: 'fresh tracks show clearly in the snow',
    ground: 'snow underfoot, numb fingers, breath that shows',
    mood: 'quiet and cold',
    short: 'Snow',
  },
  blizzard: {
    label: 'a blizzard',
    travel: 2,
    tracks: 'tracks fill in within minutes',
    ground: 'a white-out and numbing cold; shelter matters more than speed',
    mood: 'harsh and isolating',
    short: 'Blizzard',
  },
  sleet: {
    label: 'cold sleet',
    travel: 1.3,
    tracks: 'scent fades, but slush keeps tracks',
    ground: 'icy, treacherous footing',
    mood: 'miserable',
    short: 'Sleet',
  },
  wind: {
    label: 'a strong, gusting wind',
    travel: 1.1,
    tracks: 'the wind scatters scent',
    ground: 'gusts throw off thrown weapons and feed fire jutsu',
    mood: 'restless',
    short: 'Wind',
  },
  sandstorm: {
    label: 'a sandstorm',
    travel: 1.8,
    tracks: 'tracks vanish under blowing sand',
    ground: 'stinging sand, near-blind, every breath gritty',
    mood: 'brutal',
    short: 'Sandstorm',
  },
  heat: {
    label: 'fierce, dry heat',
    night: 'a warm, close night',
    travel: 1.2,
    tracks: 'tracks hold in the dust',
    ground: 'the heat drains stamina; water matters',
    mood: 'heavy and sluggish',
    short: 'Heat',
  },
  humid: {
    label: 'thick, humid heat',
    night: 'a sticky, airless night',
    travel: 1.1,
    tracks: 'scent hangs in the heavy air',
    ground: 'sweat and heavy air; thunder is never far off',
    mood: 'sticky and heavy',
    short: 'Humid',
  },
};

type Weights = Partial<Record<WeatherCondition, number>>;
type Climate = Record<Season, Weights> & {
  /** The weather sticks around: chance each block keeps the last one's (default 0.78). */
  persistence?: number;
  /** Per-month overrides (the Land of Fire's rainy season). */
  months?: Partial<Record<number, Weights>>;
  /** A line about the place's weather that is always true. */
  note?: string;
  /** Cold-climate wording for the season. */
  cold?: Partial<Record<Season, string>>;
};

const TEMPERATE: Climate = {
  winter: { clear: 3, cloudy: 3, rain: 1, fog: 1.5, sleet: 0.6, snow: 0.8, wind: 1 },
  spring: { clear: 4, cloudy: 2, drizzle: 2, rain: 1.2, fog: 1 },
  summer: { humid: 4, heat: 2, storm: 1.6, downpour: 0.8, clear: 2 },
  autumn: { clear: 4, cloudy: 2.5, rain: 1.6, wind: 1, fog: 1.2, storm: 0.4 },
};

export const CLIMATES: Record<Region, Climate> = {
  fire: {
    ...TEMPERATE,
    months: {
      // The rainy season, then monsoon heat with afternoon thunder.
      6: { rain: 4, drizzle: 3, downpour: 2, humid: 2, cloudy: 1.5 },
      7: { humid: 5, storm: 2.5, downpour: 1.5, heat: 1.5, clear: 1 },
      8: { humid: 4, heat: 3, storm: 2, clear: 1.5 },
      9: { clear: 3, humid: 1.5, storm: 1.5, rain: 2, wind: 1 },
    },
  },
  rice: { ...TEMPERATE, months: { 6: { rain: 4, drizzle: 3, cloudy: 2, humid: 1.5 } } },
  rivers: {
    winter: { cloudy: 3, fog: 3, rain: 1, clear: 2 },
    spring: { rain: 3, drizzle: 2, clear: 2, fog: 1 },
    summer: { heat: 3, humid: 2, storm: 1, clear: 3 },
    autumn: { clear: 3, cloudy: 2, rain: 1, fog: 1 },
  },
  rain: {
    // It almost never stops raining here.
    winter: { drizzle: 3, rain: 5, downpour: 2, storm: 1, fog: 1, sleet: 1 },
    spring: { drizzle: 3, rain: 5, downpour: 3, storm: 2, fog: 1 },
    summer: { drizzle: 2, rain: 4, downpour: 4, storm: 3 },
    autumn: { drizzle: 3, rain: 5, downpour: 3, storm: 2, fog: 1 },
    persistence: 0.86,
    note: 'it almost never stops raining here',
  },
  grass: {
    winter: { cloudy: 3, rain: 2, fog: 2, sleet: 1, snow: 1 },
    spring: { drizzle: 2, rain: 2, cloudy: 2, clear: 2, fog: 1 },
    summer: { humid: 3, storm: 2, clear: 2, rain: 2 },
    autumn: { rain: 2, cloudy: 3, fog: 2, clear: 2 },
  },
  waterfall: {
    winter: { cloudy: 3, fog: 3, rain: 1.5, snow: 1, clear: 1.5 },
    spring: { fog: 3, drizzle: 2, rain: 2, clear: 2 },
    summer: { humid: 4, fog: 2, storm: 2, clear: 2 },
    autumn: { fog: 3, rain: 2, cloudy: 2, clear: 2 },
    note: 'spray and mist hang over the falls',
  },
  'hot-water': {
    winter: { snow: 3, clear: 2, cloudy: 2, fog: 2 },
    spring: { clear: 3, drizzle: 2, cloudy: 2, fog: 1 },
    summer: { humid: 3, clear: 3, storm: 1 },
    autumn: { clear: 3, cloudy: 2, rain: 1, fog: 2 },
    note: 'steam rises from the hot springs',
  },
  waves: {
    winter: { wind: 3, cloudy: 3, rain: 2, fog: 2, storm: 1 },
    spring: { fog: 3, clear: 2, drizzle: 2, cloudy: 2 },
    summer: { clear: 4, humid: 2, storm: 1 },
    autumn: { storm: 1.5, wind: 2, rain: 2, clear: 2, fog: 1 },
    note: 'the sea is never far',
  },
  whirlpools: {
    winter: { wind: 3, storm: 2, rain: 2, cloudy: 2 },
    spring: { fog: 2, clear: 2, drizzle: 2, wind: 2 },
    summer: { clear: 4, humid: 2, storm: 1.2 },
    autumn: { storm: 2, wind: 3, rain: 2, clear: 1.5 },
    note: 'the whirlpools roar off the coast',
  },
  wind: {
    winter: { clear: 5, wind: 2, sandstorm: 0.6, cloudy: 1 },
    spring: { clear: 4, wind: 2, sandstorm: 1.2, heat: 2 },
    summer: { heat: 6, clear: 3, sandstorm: 0.8 },
    autumn: { clear: 4, heat: 2, sandstorm: 0.8, wind: 1 },
    note: 'desert: scorching by day, freezing at night',
  },
  earth: {
    winter: { snow: 3, clear: 3, wind: 2, cloudy: 2, blizzard: 1 },
    spring: { clear: 4, wind: 2, cloudy: 2, rain: 1 },
    summer: { clear: 4, heat: 2, storm: 1, wind: 1 },
    autumn: { clear: 3, wind: 2, cloudy: 2, rain: 1, snow: 0.5 },
    cold: { winter: 'a hard mountain winter' },
  },
  water: {
    winter: { fog: 5, sleet: 2, rain: 2, cloudy: 2, snow: 1 },
    spring: { fog: 6, drizzle: 2, cloudy: 2 },
    summer: { fog: 4, humid: 2, rain: 2, storm: 1 },
    autumn: { fog: 5, rain: 2, cloudy: 2, storm: 1 },
    persistence: 0.82,
    note: 'the mist rarely lifts off the islands',
  },
  lightning: {
    winter: { snow: 4, blizzard: 2, storm: 1, cloudy: 2, clear: 1 },
    spring: { storm: 3, rain: 2, cloudy: 2, clear: 2, snow: 1 },
    summer: { storm: 4, clear: 2, rain: 2, cloudy: 1 },
    autumn: { storm: 2, cloudy: 2, rain: 2, clear: 2, snow: 1 },
    note: 'thunder rolls around the peaks',
    cold: { winter: 'a bitter northern winter', autumn: 'a cold northern autumn' },
  },
  frost: {
    winter: { snow: 5, blizzard: 2, clear: 1, cloudy: 1 },
    spring: { snow: 2, sleet: 2, cloudy: 2, clear: 2 },
    summer: { clear: 4, cloudy: 2, rain: 1.5, fog: 1 },
    autumn: { cloudy: 2, sleet: 2, snow: 2, clear: 2, wind: 1 },
    note: 'a cold, snowy country even by the north’s standards',
    cold: { winter: 'a hard northern winter', autumn: 'an early, cold autumn' },
  },
  graveyard: {
    winter: { snow: 3, wind: 3, cloudy: 2, fog: 1, blizzard: 0.6 },
    spring: { wind: 3, cloudy: 3, fog: 2, clear: 1.5, drizzle: 1 },
    summer: { clear: 3, wind: 2, cloudy: 2, storm: 1 },
    autumn: { wind: 3, cloudy: 3, fog: 2, rain: 1, snow: 0.5 },
    note: 'wind moans through the great bones',
    cold: { winter: 'a raw northern winter' },
  },
  birds: {
    winter: { clear: 3, wind: 3, cloudy: 2, snow: 1 },
    spring: { clear: 4, wind: 2, drizzle: 1.5, cloudy: 2 },
    summer: { clear: 4, heat: 3, wind: 1, storm: 0.8 },
    autumn: { clear: 4, wind: 2, cloudy: 2, rain: 1 },
    note: 'dry wind off the western hills',
  },
  silence: {
    winter: { snow: 2, cloudy: 3, fog: 2, clear: 2, wind: 1 },
    spring: { fog: 2, drizzle: 2, clear: 3, cloudy: 2 },
    summer: { clear: 3, humid: 2, storm: 1.2, heat: 1 },
    autumn: { fog: 2, cloudy: 3, rain: 2, clear: 2 },
    note: 'mountains and forest close in on every side',
  },
  woods: {
    winter: { cloudy: 3, fog: 3, rain: 2, clear: 1.5, sleet: 0.6 },
    spring: { drizzle: 3, fog: 2, rain: 2, clear: 2 },
    summer: { humid: 4, storm: 2, clear: 2, downpour: 1 },
    autumn: { fog: 3, rain: 2, cloudy: 2, clear: 2 },
    note: 'the trees never quite let the light in',
  },
  tea: {
    winter: { cloudy: 3, wind: 2, rain: 2, clear: 2 },
    spring: { clear: 3, drizzle: 2, fog: 2, cloudy: 1 },
    summer: { clear: 4, humid: 3, storm: 1 },
    autumn: { clear: 3, wind: 2, rain: 2, storm: 1 },
    note: 'sea wind blows across the tea terraces',
  },
  sea: {
    winter: { wind: 3, storm: 2, rain: 2, cloudy: 2 },
    spring: { clear: 3, fog: 2, wind: 2, drizzle: 1 },
    summer: { clear: 4, humid: 3, storm: 1.5 },
    autumn: { storm: 2, wind: 3, rain: 2, clear: 2 },
    note: 'nothing but open water between the islands',
  },
  iron: {
    winter: { snow: 5, blizzard: 3, clear: 1 },
    spring: { snow: 3, cloudy: 2, clear: 2, sleet: 1 },
    summer: { clear: 3, cloudy: 2, rain: 1, snow: 1 },
    autumn: { snow: 3, cloudy: 2, clear: 2, sleet: 1, wind: 1 },
    note: 'snow lies on the land most of the year',
    cold: { winter: 'a deep northern winter', spring: 'a late, cold spring', autumn: 'an early northern winter' },
  },
};

export function seasonOf(month: number): Season {
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

/** "early winter", "the rainy season", "monsoon heat": the season as people there would say it. */
export function seasonLabel(region: Region | null, date: CalendarDate): string {
  const season = seasonOf(date.month);

  if (region === 'fire' || region === 'rice') {
    if (date.month === 6) return 'the rainy season';
    if (region === 'fire' && (date.month === 7 || date.month === 8)) return 'monsoon heat, high summer';
  }

  const cold = region ? CLIMATES[region].cold?.[season] : undefined;

  if (cold) return cold;

  // Dec, Mar, Jun, Sep open a season; Feb, May, Aug, Nov close one.
  const position = [12, 3, 6, 9].includes(date.month) ? 'early' : [2, 5, 8, 11].includes(date.month) ? 'late' : 'mid';

  return `${position} ${season}`;
}

const BLOCK_HOURS = 6;
const BLOCKS_PER_DAY = 24 / BLOCK_HOURS;
/**
 * Spells are walked forward from a fixed anchor (every four days, two days
 * of warm-up before it), so neighbouring hours share the same chain and only
 * change when the weather itself changes.
 */
const ANCHOR_BLOCKS = 16;
const WARM_UP = 8;

function blockOf(date: CalendarDate) {
  return daysFromCivil(date.year, date.month, date.day) * BLOCKS_PER_DAY + Math.floor(date.hour / BLOCK_HOURS);
}

function monthOfBlock(block: number) {
  return civilFromDays(Math.floor(block / BLOCKS_PER_DAY)).month;
}

function weightsFor(region: Region, month: number, part: number): Weights {
  const climate = CLIMATES[region];
  const base = { ...(climate.months?.[month] ?? climate[seasonOf(month)]) };

  // Fog gathers before and around dawn; summer thunder builds in the afternoon.
  if (base.fog && part <= 1) base.fog *= 1.4;
  if (base.storm && part === 2 && seasonOf(month) === 'summer') base.storm *= 1.5;

  return base;
}

function pick(weights: Weights, roll: number): WeatherCondition {
  const entries = Object.entries(weights).filter(([, weight]) => (weight ?? 0) > 0) as [WeatherCondition, number][];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);

  if (entries.length === 0 || total <= 0) return 'clear';

  let target = roll * total;

  for (const [condition, weight] of entries) {
    target -= weight;

    if (target < 0) return condition;
  }

  return entries[entries.length - 1][0];
}

function roll(seed: string, region: Region, block: number, salt: string) {
  return hashText(`${seed}:weather:${region}:${block}:${salt}`) / 4294967296;
}

/**
 * The world's own weather in a region at a moment. Same save, region and
 * hour always give the same answer; a spell usually lasts a day or more.
 */
export function weatherAt(seed: string, region: Region, date: CalendarDate): WeatherCondition {
  const target = blockOf(date);
  const persistence = CLIMATES[region].persistence ?? 0.78;
  let condition: WeatherCondition | null = null;

  const start = Math.floor(target / ANCHOR_BLOCKS) * ANCHOR_BLOCKS - WARM_UP;

  for (let block = start; block <= target; block += 1) {
    const weights = weightsFor(region, monthOfBlock(block), block % BLOCKS_PER_DAY);
    const keeps = condition !== null && (weights[condition] ?? 0) > 0 && roll(seed, region, block, 'keep') < persistence;

    if (!keeps) condition = pick(weights, roll(seed, region, block, 'pick'));
  }

  return condition ?? 'clear';
}

/** How long story weather holds, and how long a scene keeps its weather. */
const STORY_HOLD_HOURS = 8;
const SCENE_HOLD_HOURS = 12;

function hoursSince(from: CalendarDate, to: CalendarDate) {
  return secondsBetween(from, to) / 3600;
}

function lockHolds(lock: WeatherLock | undefined, db: Pick<AppDatabase, 'state'>, region: Region): lock is WeatherLock {
  if (!lock || lock.region !== region) return false;

  const hours = hoursSince(lock.since, db.state.inStoryDate);

  if (hours < 0) return false;
  if (lock.source === 'story') return hours < STORY_HOLD_HOURS;

  return lock.sceneSeq === db.state.sceneSeq && hours < SCENE_HOLD_HOURS;
}

export type WeatherNow = {
  region: Region;
  condition: WeatherCondition;
  season: Season;
  seasonLabel: string;
  /** The story's own words, when it set the weather. */
  text?: string;
  source: 'world' | 'story';
  night: boolean;
};

/** The weather where Kan is right now: the scene's held weather, else the world's. */
export function currentWeather(db: Pick<AppDatabase, 'state' | 'meta'>): WeatherNow {
  const region = currentRegion(db);
  const date = db.state.inStoryDate;
  const lock = db.state.weather;
  const held = lockHolds(lock, db, region);
  const condition = held ? lock.condition : weatherAt(db.meta.slotId, region, date);

  return {
    region,
    condition,
    season: seasonOf(date.month),
    seasonLabel: seasonLabel(region, date),
    text: held ? lock.text : undefined,
    source: held ? lock.source : 'world',
    night: timeOfDayOf(date) === 'night',
  };
}

/** The weather a region has now, for the map (no scene lock unless it is Kan's region). */
export function regionWeather(db: Pick<AppDatabase, 'state' | 'meta'>, region: Region): WeatherCondition {
  const here = currentWeather(db);

  return here.region === region ? here.condition : weatherAt(db.meta.slotId, region, db.state.inStoryDate);
}

export function weatherTravelFactor(condition: WeatherCondition) {
  return CONDITION_INFO[condition].travel;
}

/** How the condition reads at this hour (a clear night, a cold desert night). */
export function weatherPhrase(now: Pick<WeatherNow, 'condition' | 'night' | 'region'>): string {
  const info = CONDITION_INFO[now.condition];

  if (now.night && now.region === 'wind' && (now.condition === 'heat' || now.condition === 'clear')) {
    return 'a bitterly cold, clear desert night';
  }

  return now.night && info.night ? info.night : info.label;
}

/** Story words → a condition. Order matters: "rain turning to snow" is snow. */
const STORY_PATTERNS: [RegExp, WeatherCondition][] = [
  [/\b(blizzard|white-?out)\b/i, 'blizzard'],
  [/\bsand ?storm|dust ?storm\b/i, 'sandstorm'],
  [/\b(rain|downpour|storm|drizzle)\b[^.]*\b(stops?|stopped|eases?|eased|lets up|let up|clears?|cleared|ends?|ended|passes|passed)\b/i, 'cloudy'],
  [/\b(fog|mist)\b[^.]*\b(lifts?|lifted|clears?|cleared|burns? off|thins?)\b/i, 'clear'],
  [/\b(thunder|lightning|thunderstorm|storm|typhoon|gale)\b/i, 'storm'],
  [/\b(downpour|pouring|torrential|sheets of rain|deluge|cloudburst)\b/i, 'downpour'],
  [/\bsleet\b/i, 'sleet'],
  [/\b(snow|snowfall|snowing|flurr(y|ies))\b/i, 'snow'],
  [/\b(drizzle|drizzling|mizzle)\b/i, 'drizzle'],
  [/\b(fog|mist|haze)\b/i, 'fog'],
  [/\b(rain|raining|rainfall|showers?)\b/i, 'rain'],
  [/\b(wind|gusts?|gusting)\b/i, 'wind'],
  [/\b(humid|muggy|sticky|sweltering)\b/i, 'humid'],
  [/\b(heat|scorching|blazing|baking|hot)\b/i, 'heat'],
  [/\b(clear|sun|sunny|sunlight|stars|cloudless)\b/i, 'clear'],
  [/\b(cloud|clouds|cloudy|overcast|grey sky|gray sky)\b/i, 'cloudy'],
];

/** "no wind", "not raining", "without rain", "the rain stopped": the word is there, the weather isn't. */
const NEGATED = /\b(no|not|without|never|isn't|wasn't|stopped|no more|nor)\s+(?:\w+\s+)?$/i;

export function conditionFromText(text: string | undefined | null): WeatherCondition | null {
  if (!text) return null;

  for (const [pattern, condition] of STORY_PATTERNS) {
    const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);

    for (const match of text.matchAll(global)) {
      const before = text.slice(Math.max(0, (match.index ?? 0) - 24), match.index);

      if (!NEGATED.test(before)) return condition;
    }
  }

  return null;
}

/** Weather in the prose, narrow on purpose: only what falls from the sky, or fog. */
const PROSE_PATTERNS: [RegExp, WeatherCondition][] = [
  [/\b(rain|downpour|drizzle)\b[^.]*\b(stops|stopped|eases off|eased off|lets up|let up|ends|ended|dies away|died away)\b/i, 'cloudy'],
  [/\b(blizzard|white-?out)\b/i, 'blizzard'],
  [/\b(thunder|thunderclap|thunderstorm)\b/i, 'storm'],
  [/\b(downpour|pouring rain|torrential|sheets of rain|deluge|cloudburst|lashing rain)\b/i, 'downpour'],
  [/\bsleet\b/i, 'sleet'],
  [/\b(snow is falling|snow falls|snow fell|snowfall|snowing|falling snow|flurr(?:y|ies))\b/i, 'snow'],
  [/\b(drizzle|drizzling)\b/i, 'drizzle'],
  [/\b(fog|thick mist|the mist)\b/i, 'fog'],
  [/\b(rain|raining|rainfall|rainwater)\b/i, 'rain'],
];

const FAMILY: Partial<Record<WeatherCondition, string>> = {
  drizzle: 'wet', rain: 'wet', downpour: 'wet', storm: 'wet',
  snow: 'snow', sleet: 'snow', blizzard: 'snow',
  fog: 'fog',
};

/**
 * The weather the narration shows, when it disagrees with the held weather
 * (Session 1: a downpour all turn under a "cloudy" sky, because the tracker
 * only reports changes). Speech, and the Rain and the Mist as places, don't
 * count. Returns words applyWeather reads, or undefined.
 */
export function weatherFromNarration(db: AppDatabase, narration: string): string | undefined {
  const prose = narration
    .replace(/"[^"\n]*(?:"|(?=\n)|$)/g, ' ')
    .replace(/“[^”\n]*(?:”|(?=\n)|$)/g, ' ')
    // Place names: "the Rain", "Hidden Mist", "Land of Snow" (capital, mid-sentence).
    .replace(/(?<![.!?]\s|^|\n)\b(?:Rain|Mist|Snow)\b/g, ' ')
    .replace(/\b(?:Amegakure|Kirigakure)\b/gi, ' ');
  const now = currentWeather(db).condition;

  for (const [pattern, condition] of PROSE_PATTERNS) {
    const global = new RegExp(pattern.source, `${pattern.flags}g`);

    for (const match of prose.matchAll(global)) {
      const before = prose.slice(Math.max(0, (match.index ?? 0) - 24), match.index);
      if (NEGATED.test(before)) continue;

      if (condition === 'cloudy') {
        return FAMILY[now] === 'wet' ? 'the rain stops' : undefined;
      }

      if (FAMILY[condition] === FAMILY[now] && FAMILY[now]) return undefined;

      return CONDITION_INFO[condition].label;
    }
  }

  return undefined;
}

/**
 * After a turn: the story's weather if the page changed it, else keep the
 * scene's held weather, else hold the world's weather for this new scene.
 */
export function applyWeather(db: AppDatabase, reported: string | undefined): AppDatabase {
  const region = currentRegion(db);
  const fromStory = conditionFromText(reported);

  if (fromStory) {
    return {
      ...db,
      state: {
        ...db.state,
        weather: {
          region,
          condition: fromStory,
          text: reported!.trim().slice(0, 60),
          since: db.state.inStoryDate,
          sceneSeq: db.state.sceneSeq,
          source: 'story',
        },
      },
    };
  }

  const lock = db.state.weather;

  if (lockHolds(lock, db, region)) {
    // Story weather that outlives its scene still holds; a world lock follows the scene.
    return lock.sceneSeq === db.state.sceneSeq || lock.source === 'story'
      ? db
      : { ...db, state: { ...db.state, weather: { ...lock, sceneSeq: db.state.sceneSeq } } };
  }

  return {
    ...db,
    state: {
      ...db.state,
      weather: {
        region,
        condition: weatherAt(db.meta.slotId, region, db.state.inStoryDate),
        since: db.state.inStoryDate,
        sceneSeq: db.state.sceneSeq,
        source: 'world',
      },
    },
  };
}

function slowerBy(factor: number) {
  if (factor >= 1.9) return 'travel takes about twice as long';
  if (factor >= 1.55) return 'travel takes half again as long';
  if (factor >= 1.35) return 'travel is about a third slower';
  if (factor >= 1.2) return 'travel is about a quarter slower';
  if (factor > 1.05) return 'travel is a little slower';
  return '';
}

/**
 * One line for the narrator: the weather, the season, and what it does,
 * shaped by the turn's mode (footing in a fight, only the feel in a talk).
 */
export function formatWeatherLine(db: AppDatabase, mode: SceneModeName = 'normal'): string {
  const now = currentWeather(db);
  const info = CONDITION_INFO[now.condition];
  const climateNote = CLIMATES[now.region].note;
  const indoors = locationKindOf(db) === 'structure';
  const phrase = now.text ? `${weatherPhrase(now)} (as the story has it: ${now.text})` : weatherPhrase(now);
  const head = `WEATHER (${REGION_NAME[now.region]}, ${now.seasonLabel}${climateNote ? `; ${climateNote}` : ''}): ${indoors ? `outside, ${phrase}` : phrase}.`;
  const keep = 'Keep it the same through this scene unless the story changes it.';

  if (mode === 'conversation') {
    return `${head} Feel: ${info.mood}. ${keep}`;
  }

  if (mode === 'fight') {
    return indoors
      ? `${head} ${keep}`
      : `${head} In this fight: ${info.ground}. ${keep}`;
  }

  if (indoors) {
    return `${head} Feel: ${info.mood}. ${keep}`;
  }

  const slower = slowerBy(info.travel);
  const effects = [slower, info.tracks, info.ground].filter(Boolean).join('; ');

  return `${head} ${effects.charAt(0).toUpperCase()}${effects.slice(1)}. Feel: ${info.mood}. ${keep}`;
}

/** For the state tracker: what the weather is now, and the rule for changing it. */
export function formatWeatherTracking(db: AppDatabase): string {
  const now = currentWeather(db);

  return `WEATHER NOW\n${weatherPhrase(now)} (${REGION_NAME[now.region]}, ${now.seasonLabel})`;
}

/** "Rain · late autumn" for the map and the status sheet. */
export function weatherSummary(db: Pick<AppDatabase, 'state' | 'meta'>): string {
  const now = currentWeather(db);

  return `${CONDITION_INFO[now.condition].short} · ${now.seasonLabel}`;
}
