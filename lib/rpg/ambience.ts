// Ambient sound (living-world Stage 5, section 17).
//
// Ambience only: no music, no stingers. The point is to make you feel where
// Kan is: water running by a river, birds in a forest by day, a little wind
// on the road, rain on a roof.
//
// This module is pure. It reads state the app already tracks (the scene's
// weather, the location and its kind, the clock, the season, the region and
// the scene mode) and returns a mix: how loud each sound bed should be. The
// player (lib/audio/) synthesises the beds and crossfades between mixes. The
// narrator's prompt is untouched.
//
// A flashback (section 19) can build its own AmbienceInput from its date and
// place and pass it to ambienceMix, so the present scene is never touched.

import { flashbackView } from './flashbacks';
import { timeOfDayOf, type DayPeriod } from './calendar';
import { locationKindOf } from './encounters';
import { localizePlaceNames } from './glossary';
import type { Region } from './geography';
import { placeIdOf } from './mapData';
import { campCover, currentSafehouse } from './safehouses';
import { sceneModeOf } from './sceneMode';
import type { AppDatabase, LocationKind, SafehouseKind, WeatherCondition } from './types';
import { currentWeather, type Season } from './weather';

export const AMBIENCE_BEDS = [
  // Weather
  'rain-light',
  'rain-heavy',
  'rain-roof',
  'storm',
  'wind-light',
  'wind-strong',
  'wind-high',
  'snow-quiet',
  // Life
  'forest-day',
  'insects',
  'owl',
  'cicadas',
  // Water
  'stream',
  'river',
  'waterfall',
  'sea',
  // People and places
  'village',
  'murmur',
  'room',
  'fire',
  'cave',
] as const;

export type AmbienceBed = (typeof AMBIENCE_BEDS)[number];

/** Beds that sit inside with Kan; everything else is outside and gets muffled indoors. */
export const INDOOR_BEDS: ReadonlySet<AmbienceBed> = new Set<AmbienceBed>(['rain-roof', 'murmur', 'room', 'fire', 'cave']);

export type AmbienceInput = {
  condition: WeatherCondition;
  period: DayPeriod;
  hour: number;
  season: Season;
  region: Region;
  kind: LocationKind;
  /** The location, place names in English. */
  place: string;
  /** A map place id, when the location names one. */
  placeId: string | null;
  fight: boolean;
  /** The kind of safehouse Kan is at: walls and a roof, or a camp under the sky. */
  shelter?: SafehouseKind;
  /** The calendar month, for when the light goes (birds stop after dusk). */
  month?: number;
};

export type AmbienceMix = {
  /** Bed levels, 0–1. Beds not listed are silent. */
  beds: Partial<Record<AmbienceBed, number>>;
  /** Kan is inside: outside sounds go through a low-pass and drop. */
  indoors: boolean;
  /** A fight lowers everything instead of adding anything. */
  fight: boolean;
  /** Stable text for the mix, to tell when it changes. */
  key: string;
};

const INDOOR_WORDS =
  /\b(inside|indoors|room|rooms|inn|teahouse|tea house|tavern|bar|restaurant|house|home|hut|cabin|shack|attic|cellar|basement|hall|chamber|office|library|kitchen|barracks|hospital|tent|hideout|lair|bunker|tower|palace|mansion|temple hall|shrine hall|dojo|bathhouse|bedroom|corridor|hallway|interior)\b/i;
const OUTSIDE_WORDS =
  /\b(outside|rooftop|roof of|courtyard|garden|street|streets|square|plaza|market|bridge|road|path|trail|field|forest|woods|treetops?|canopy|clearing|riverbank|shore|beach|dock|docks|cliff|ridge|summit|peak)\b/i;
const CAVE_WORDS = /\b(cave|cavern|grotto|tunnel|catacomb|underground|mine shaft)\b/i;
const FIRE_WORDS = /\b(hearth|fireplace|campfire|camp fire|fire pit|brazier|stove|bonfire|cooking fire|embers)\b/i;
const CROWD_WORDS = /\b(inn|teahouse|tea house|tavern|bar|restaurant|bathhouse|dining|common room)\b/i;
const MARKET_WORDS = /\b(market|bazaar|festival|fair|stalls?|shopping street|crowd|crowded|busy street|main street|port|harbou?r|docks)\b/i;
const FOREST_WORDS = /\b(forest|woods|woodland|grove|jungle|trees|treetops?|canopy|thicket|clearing|bamboo)\b/i;
const HIGH_WORDS = /\b(mountain|mountainside|peak|summit|cliff|cliffs|ridge|pass|heights|crag|plateau|tower top|hokage rock|hokage monument)\b/i;
const DESERT_WORDS = /\b(desert|dunes?|sands|wasteland|badlands)\b/i;
const WATERFALL_WORDS = /\b(waterfall|waterfalls|falls|cascade)\b/i;
const RIVER_WORDS = /\b(river|riverbank|riverside|rapids)\b/i;
const STREAM_WORDS = /\b(stream|creek|brook|spring|hot springs?|onsen|pond|lake|lakeshore|lakeside)\b/i;
const SEA_WORDS = /\b(sea|seaside|ocean|coast|coastal|shore|shoreline|beach|cove|bay|harbou?r|port|docks?|pier|island|cliffs? over the sea|whirlpools?|boat|ship|ferry)\b/i;

const WATERFALL_PLACES = new Set(['valley-end', 'waterfall']);
const RIVER_PLACES = new Set(['naka-river']);
const SEA_PLACES = new Set(['uzushio', 'naruto-bridge', 'mist']);
const SEA_REGIONS = new Set<Region>(['whirlpools', 'water', 'sea']);

/** Where Kan is right now, read from the save. */
export function ambienceInputOf(db: AppDatabase): AmbienceInput {
  const weather = currentWeather(db);
  const house = currentSafehouse(db);
  // A safehouse's own name says what it is ("the cave above the falls").
  const place = localizePlaceNames([db.state.location ?? '', house?.name ?? ''].filter(Boolean).join(', '));

  return {
    condition: weather.condition,
    period: timeOfDayOf(db.state.inStoryDate),
    hour: db.state.inStoryDate.hour,
    month: db.state.inStoryDate.month,
    season: weather.season,
    region: weather.region,
    kind: locationKindOf(db),
    place,
    placeId: placeIdOf(db.state.location),
    fight: sceneModeOf(db).current === 'fight',
    ...(house ? { shelter: house.kind } : {}),
  };
}

/** Is Kan inside? The location's own words decide; a structure counts unless it says outside. */
export function isIndoors(input: Pick<AmbienceInput, 'kind' | 'place' | 'shelter'>): boolean {
  const location = input.place;

  if (CAVE_WORDS.test(location)) return true;
  // A camp is what it's in: a cave (above), ruins (half open, see ambienceMix), the walls of a hut, or the sky.
  if (input.shelter === 'camp') {
    const cover = campCover(location);
    // "A hut in the forest" is inside the hut; "outside the hut" is not.
    return cover === 'walls' && !/\b(outside|roof of|rooftop)\b/i.test(location);
  }
  // Ruins with no place of Kan's own in them are open to the sky.
  if (!input.shelter && campCover(location) === 'ruin') return false;
  // Any other safehouse has walls unless the words say he's outside it.
  if (input.shelter && !(OUTSIDE_WORDS.test(location) && !INDOOR_WORDS.test(location))) return true;
  if (OUTSIDE_WORDS.test(location) && !INDOOR_WORDS.test(location)) return false;
  if (INDOOR_WORDS.test(location)) return true;

  return input.kind === 'structure';
}

function add(beds: Partial<Record<AmbienceBed, number>>, bed: AmbienceBed, level: number) {
  if (level <= 0) return;
  beds[bed] = Math.min(1, Math.max(beds[bed] ?? 0, level));
}

function scale(beds: Partial<Record<AmbienceBed, number>>, bed: AmbienceBed, factor: number) {
  const level = beds[bed];

  if (level === undefined) return;
  if (level * factor < 0.03) delete beds[bed];
  else beds[bed] = level * factor;
}

/** How hard it is raining, 0–1. */
function rainOf(condition: WeatherCondition) {
  switch (condition) {
    case 'drizzle':
      return 0.3;
    case 'sleet':
      return 0.4;
    case 'rain':
      return 0.6;
    case 'downpour':
      return 0.9;
    case 'storm':
      return 1;
    default:
      return 0;
  }
}

/**
 * Roughly when the sun sets in the shinobi lands: about 8 PM at midsummer,
 * 5 PM at midwinter (6 PM in March and September). No month: 7 PM.
 */
export function sunsetHour(month: number | undefined): number {
  if (!month) return 19;
  return 18.5 + 1.5 * Math.cos(((month - 6.5) / 12) * 2 * Math.PI);
}

/** What Kan should hear, from where he is. */
export function ambienceMix(input: AmbienceInput): AmbienceMix {
  const beds: Partial<Record<AmbienceBed, number>> = {};
  const indoors = isIndoors(input);
  const { condition, period, season, kind, place, placeId, region } = input;
  const day = period === 'morning' || period === 'afternoon';
  const night = period === 'night';
  const dawn = input.hour >= 5 && input.hour <= 8;
  const rain = rainOf(condition);
  const cave = CAVE_WORDS.test(place);

  // ---- Weather ------------------------------------------------------------
  if (rain > 0) {
    if (indoors && !cave) {
      add(beds, 'rain-roof', 0.35 + rain * 0.6);
    } else {
      add(beds, 'rain-light', rain >= 0.9 ? 0.35 : 0.3 + rain * 0.5);
      if (rain >= 0.5) add(beds, 'rain-heavy', (rain - 0.3) * 1.2);
    }
  }
  if (condition === 'storm') {
    add(beds, 'storm', 1);
    add(beds, 'wind-strong', 0.55);
  }
  if (condition === 'sleet') add(beds, 'wind-light', 0.45);
  if (condition === 'snow') {
    add(beds, 'snow-quiet', 1);
    add(beds, 'wind-light', 0.2);
  }
  if (condition === 'blizzard') {
    add(beds, 'wind-strong', 1);
    add(beds, 'wind-high', 0.45);
    add(beds, 'snow-quiet', 0.4);
  }
  if (condition === 'wind') add(beds, 'wind-strong', 0.7);
  if (condition === 'sandstorm') {
    add(beds, 'wind-strong', 1);
    add(beds, 'wind-high', 0.6);
  }

  // A little wind on the road and in the open, on calm days too.
  const calm = condition === 'clear' || condition === 'cloudy' || condition === 'heat' || condition === 'humid';
  if (calm && (kind === 'road' || kind === 'wilderness')) add(beds, 'wind-light', condition === 'humid' ? 0.15 : 0.28);
  if (condition === 'fog') add(beds, 'wind-light', 0.1);
  if (HIGH_WORDS.test(place)) {
    add(beds, 'wind-high', condition === 'fog' ? 0.3 : 0.55);
    add(beds, 'wind-light', 0.4);
  }
  if (DESERT_WORDS.test(place) || (region === 'wind' && kind === 'wilderness')) add(beds, 'wind-light', 0.45);

  // ---- Life ---------------------------------------------------------------
  const desert = DESERT_WORDS.test(place) || (region === 'wind' && kind !== 'settlement');
  const wild = kind === 'wilderness' || kind === 'road' || FOREST_WORDS.test(place);
  const forest = FOREST_WORDS.test(place) || (kind === 'wilderness' && !desert && !SEA_WORDS.test(place));
  const harsh = rain >= 0.6 || condition === 'blizzard' || condition === 'sandstorm' || condition === 'storm';

  if (wild && !desert && !harsh) {
    // Birds by day, louder at dawn, fewer in winter, rain, fog and on roads.
    if (day || dawn) {
      let birds = forest ? 0.75 : 0.4;
      if (dawn) birds += 0.2;
      if (season === 'winter') birds *= 0.4;
      if (rain > 0) birds *= 0.5;
      if (condition === 'fog') birds *= 0.55;
      if (condition === 'snow') birds *= 0.5;
      add(beds, 'forest-day', birds);
      // Summer heat brings the cicadas.
      if (season === 'summer' && period === 'afternoon' && (region === 'fire' || region === 'rice' || region === 'hot-water' || region === 'waves' || region === 'woods' || region === 'tea')) {
        add(beds, 'cicadas', forest ? 0.55 : 0.35);
      }
    }
    // Crickets need warmth: none in winter or in falling snow. The owl calls
    // in every season (audit 11e.1: crickets in the snow).
    const warm = season !== 'winter' && condition !== 'snow' && condition !== 'sleet';
    if (period === 'evening') {
      if (warm) add(beds, 'insects', forest ? 0.4 : 0.25);
      if (forest) add(beds, 'owl', 0.3);
      // The last birds only while there is light (Session 1: birds at 7 PM
      // in a pitch-dark October gorge).
      if (input.hour < sunsetHour(input.month) + 0.5) add(beds, 'forest-day', season === 'winter' ? 0.1 : 0.22);
    }
    if (night) {
      if (warm) add(beds, 'insects', forest ? 0.75 : 0.5);
      add(beds, 'owl', forest ? 0.6 : 0.4);
    }
  }

  // ---- Water --------------------------------------------------------------
  if (placeId && WATERFALL_PLACES.has(placeId)) add(beds, 'waterfall', placeId === 'valley-end' ? 0.9 : 0.5);
  if (placeId && RIVER_PLACES.has(placeId)) add(beds, 'river', 0.7);
  if (WATERFALL_WORDS.test(place) && !/\bhidden waterfall\b|\bland of waterfalls\b/i.test(place)) add(beds, 'waterfall', 0.8);
  if (RIVER_WORDS.test(place)) add(beds, 'river', kind === 'settlement' ? 0.4 : 0.7);
  if (STREAM_WORDS.test(place)) add(beds, 'stream', 0.6);
  if (region === 'waterfall' && kind !== 'settlement' && !indoors) add(beds, 'stream', 0.3);
  if (SEA_WORDS.test(place)) add(beds, 'sea', kind === 'settlement' ? 0.55 : 0.8);
  if (placeId && SEA_PLACES.has(placeId)) add(beds, 'sea', 0.5);
  // The island countries: the sea is never far.
  if (SEA_REGIONS.has(region) && kind !== 'structure') add(beds, 'sea', 0.3);

  // ---- People and places --------------------------------------------------
  if (kind === 'settlement' && !indoors) {
    const busy = MARKET_WORDS.test(place);
    const level = night ? 0.12 : period === 'evening' ? (busy ? 0.6 : 0.4) : busy ? 0.95 : 0.55;
    add(beds, 'village', rain >= 0.6 || condition === 'blizzard' ? level * 0.35 : level);
    if (day && !harsh) add(beds, 'forest-day', 0.12);
    if (night && season !== 'winter' && condition !== 'snow') add(beds, 'insects', 0.18);
  }

  if (indoors) {
    if (cave) add(beds, 'cave', 0.75);
    else add(beds, 'room', 0.55);
    if (CROWD_WORDS.test(place)) add(beds, 'murmur', night && input.hour >= 1 && input.hour < 5 ? 0.1 : 0.55);
  }

  if (
    FIRE_WORDS.test(place) ||
    ((input.shelter === 'camp' || (kind !== 'settlement' && /\bcamp\b/i.test(place))) && (period === 'evening' || night))
  ) {
    add(beds, 'fire', 0.7);
  }

  // ---- Ruins: half a shelter ---------------------------------------------
  // Broken walls: some rain drips off what's left of the roof, wind whistles
  // through the gaps, the birds keep their distance, and wet stone drips.
  const ruined = !indoors && (input.shelter === 'camp' || !input.shelter) && campCover(place) === 'ruin';
  if (ruined) {
    scale(beds, 'rain-light', 0.6);
    scale(beds, 'rain-heavy', 0.6);
    if (rain > 0) {
      add(beds, 'rain-roof', 0.2 + rain * 0.25);
      add(beds, 'cave', 0.2);
    }
    if (!harsh) add(beds, 'wind-light', 0.3);
    scale(beds, 'forest-day', 0.6);
    scale(beds, 'cicadas', 0.6);
    delete beds.village;
  }

  // ---- Inside -------------------------------------------------------------
  if (indoors) {
    // Outside sounds come through the walls, quieter.
    for (const bed of ['wind-light', 'wind-strong', 'wind-high'] as const) scale(beds, bed, 0.35);
    for (const bed of ['forest-day', 'insects', 'owl', 'cicadas', 'village'] as const) scale(beds, bed, cave ? 0 : 0.3);
    for (const bed of ['stream', 'river', 'waterfall', 'sea'] as const) scale(beds, bed, 0.45);
    scale(beds, 'snow-quiet', 0.5);
  }

  const key = Object.entries(beds)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bed, level]) => `${bed}:${(level ?? 0).toFixed(2)}`)
    .concat(indoors ? 'in' : 'out', input.fight ? 'fight' : 'calm')
    .join(' ');

  return { beds, indoors, fight: input.fight, key };
}

/**
 * The mix for the save's scene: the present's, or while a flashback plays,
 * the memory's own date, place and weather (never the present's held weather).
 */
export function currentAmbience(db: AppDatabase): AmbienceMix {
  return ambienceMix(ambienceInputOf(flashbackView(db) ?? db));
}

const BED_LABEL: Record<AmbienceBed, string> = {
  'rain-light': 'rain',
  'rain-heavy': 'heavy rain',
  'rain-roof': 'rain on the roof',
  storm: 'thunder',
  'wind-light': 'a little wind',
  'wind-strong': 'strong wind',
  'wind-high': 'wind over the heights',
  'snow-quiet': 'the hush of snow',
  'forest-day': 'birds',
  insects: 'night insects',
  owl: 'an owl',
  cicadas: 'cicadas',
  stream: 'a stream',
  river: 'the river',
  waterfall: 'falling water',
  sea: 'the sea',
  village: 'the street',
  murmur: 'voices',
  room: 'a quiet room',
  fire: 'a fire',
  cave: 'dripping stone',
};

/** What's playing, loudest first, in a few words ("Rain on the roof, a fire"). */
export function describeAmbience(mix: AmbienceMix, limit = 3): string {
  const beds = (Object.entries(mix.beds) as Array<[AmbienceBed, number]>)
    .filter(([, level]) => level >= 0.1)
    .sort((a, b) => b[1] - a[1]);
  // Heavy rain already says rain.
  const names = beds.map(([bed]) => bed).filter((bed) => !(bed === 'rain-light' && mix.beds['rain-heavy']));
  const text = names.slice(0, limit).map((bed) => BED_LABEL[bed]).join(', ');

  if (!text) return 'Silence';
  return text.charAt(0).toUpperCase() + text.slice(1);
}
