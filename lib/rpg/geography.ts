// Where things are, in shinobi travel days.
//
// The GEOGRAPHY lore (seed.ts) gives the narrator fixed directions and
// travel times. This module turns the same numbers into a small graph so the
// engine can reason about distance too: how long a letter takes, how far a
// rumour has travelled, whether someone could plausibly cross Kan's path.
//
// Regions are coarse (a country, or the land around a great village). Times
// are shinobi days at a hard pace with rest, matching the lore; civilians and
// couriers are slower, birds faster (see letters.ts).

import { localizePlaceNames } from './glossary';
import type { AppDatabase, EntityRecord } from './types';

export type Region =
  | 'fire'
  | 'rain'
  | 'grass'
  | 'waterfall'
  | 'hot-water'
  | 'rice'
  | 'waves'
  | 'rivers'
  | 'wind'
  | 'earth'
  | 'water'
  | 'lightning'
  | 'iron'
  | 'frost'
  | 'whirlpools'
  | 'graveyard'
  | 'birds'
  | 'silence'
  | 'woods'
  | 'tea'
  | 'sea';

export const REGION_NAME: Record<Region, string> = {
  fire: 'the Land of Fire',
  rain: 'the Land of Rain',
  grass: 'the Land of Grass',
  waterfall: 'the Land of Waterfalls',
  'hot-water': 'the Land of Hot Water',
  // The old Land of Rice Fields: Orochimaru's Sound rules it now. The id stays 'rice' so old saves still match.
  rice: 'the Land of Sound',
  waves: 'the Land of Waves',
  rivers: 'the Land of Rivers',
  wind: 'the Land of Wind',
  earth: 'the Land of Earth',
  water: 'the Land of Water',
  lightning: 'the Land of Lightning',
  iron: 'the Land of Iron',
  frost: 'the Land of Frost',
  whirlpools: 'the Land of Whirlpools',
  graveyard: 'the Mountain Graveyard',
  birds: 'the Land of Birds',
  silence: 'the Land of Silence',
  woods: 'the Land of Woods',
  tea: 'the Land of Tea',
  sea: 'the Land of the Sea',
};

// Earliest match in the text wins, so "a teahouse in the Rain, three days
// from the Leaf" is the Rain.
const PATTERNS: Array<[RegExp, Region]> = [
  // Proper names only (audit 6b.1): "leaf", "rain", "stone", "mist", "sand", "cloud", "desert" or
  // "samurai" alone never place Kan; the capitalised "the Leaf" forms are below, case-sensitive.
  [/\b(hidden leaf|konoha(gakure)?|leaf village|land of fire|fire country|naka (river|shrine)|uchiha (district|compound|quarter)|valley of the end|tanzaku|otafuku|fire temple|forest of death)\b/i, 'fire'],
  [/\b(hidden rain|amegakure|land of rain|rain country)\b/i, 'rain'],
  [/\b(hidden grass|kusagakure|land of grass|grass country|tenchi bridge|h[oō]zuki castle|blood prison)\b/i, 'grass'],
  [/\b(hidden waterfall|takigakure|land of waterfalls?|waterfall village)\b/i, 'waterfall'],
  [/\b(land of hot water|hot water country|land of hot ?springs|yugakure|hidden steam|hot springs? town|bamboo village)\b/i, 'hot-water'],
  [/\b(land of rice( fields| paddies)?|rice country|land of sound|sound country|hidden sound|otogakure|sound village)\b/i, 'rice'],
  [/\b(mountain graveyard|graveyard of (the )?mountains?)\b/i, 'graveyard'],
  [/\b(land of birds|bird country|hidden rock|ishigakure)\b/i, 'birds'],
  [/\b(land of silence|curtain village)\b/i, 'silence'],
  [/\b(land of woods|woods country)\b/i, 'woods'],
  [/\b(land of tea|tea country|degarashi|nagi island|ouza island|todoroki (great )?shrine|modoroki shrine)\b/i, 'tea'],
  [/\b(land of (the )?sea|sea country|demon island|mother island)\b/i, 'sea'],
  [/\b(land of waves|wave country|great naruto bridge)\b/i, 'waves'],
  [/\b(land of rivers|river country|hidden valley|tanigakure|artisans'? village)\b/i, 'rivers'],
  [/\b(hidden sand|sunagakure|sand village|land of wind|wind country|loran|rouran|ceramic village)\b/i, 'wind'],
  [/\b(hidden stone|iwagakure|stone village|land of earth|earth country)\b/i, 'earth'],
  [/\b(hidden mist|kirigakure|mist village|land of water|water country|nadeshiko)\b/i, 'water'],
  [/\b(hidden cloud|kumogakure|cloud village|land of lightning|lightning country|island turtle|genbu)\b/i, 'lightning'],
  [/\b(land of iron|iron country|three wolf mountains?|land of medicines?)\b/i, 'iron'],
  // Only the names: "frost" alone is weather.
  [/\b(land of frost|frost country|hidden frost|shimogakure)\b/i, 'frost'],
  // "the Rain", "the Sand": only capitalised, so weather and beaches stay out.
  [/\bthe Leaf\b/, 'fire'],
  [/\bthe Rain\b/, 'rain'],
  [/\bthe Sand\b/, 'wind'],
  [/\bthe Mist\b/, 'water'],
  [/\bthe Cloud\b/, 'lightning'],
  [/\bthe Stone\b/, 'earth'],
  // The villages' short Japanese names, capitalised: "Suna", "Kiri", "Kumo", "Iwa".
  [/\bSuna\b/, 'wind'],
  [/\bKiri\b/, 'water'],
  [/\bKumo\b/, 'lightning'],
  [/\bIwa\b/, 'earth'],
  [/\b(land of whirlpools|whirlpool country|uzushio|uzushiogakure|hidden whirlpool|hidden eddy)\b/i, 'whirlpools'],
];

/** Travel times between neighbours, in shinobi days (from the GEOGRAPHY lore). */
const ROADS: Array<[Region, Region, number]> = [
  // From the Land of Fire.
  ['fire', 'rain', 3],
  ['fire', 'grass', 2.5],
  ['fire', 'waterfall', 2],
  ['fire', 'rice', 1.5],
  ['fire', 'hot-water', 1.5],
  ['fire', 'waves', 2],
  ['fire', 'rivers', 1.5],
  ['fire', 'wind', 3],
  ['fire', 'earth', 5],
  ['fire', 'whirlpools', 2],
  ['fire', 'water', 4.5],
  ['fire', 'lightning', 6],
  ['fire', 'iron', 3.5],
  ['fire', 'graveyard', 2.5],
  ['fire', 'woods', 2],
  ['fire', 'tea', 2.5],
  // Shikamaru's team ran from the Leaf to the Land of Silence in three days and nights without rest.
  ['fire', 'silence', 4.5],
  // The small countries to the west and north.
  ['rain', 'grass', 1],
  ['rain', 'wind', 3],
  ['rain', 'rivers', 1.5],
  ['rain', 'earth', 3],
  ['grass', 'earth', 2.5],
  ['grass', 'waterfall', 1.5],
  ['waterfall', 'earth', 3],
  ['waterfall', 'rice', 1.5],
  ['rice', 'hot-water', 1.5],
  ['rivers', 'wind', 1.5],
  ['earth', 'iron', 3],
  // West, between Earth and Wind: the Land of Birds (the Hidden Rock), then Silence at the continent's edge.
  ['birds', 'rain', 1.5],
  ['birds', 'earth', 2],
  ['birds', 'wind', 2.5],
  ['birds', 'silence', 1.5],
  ['silence', 'earth', 2.5],
  ['silence', 'wind', 2.5],
  // North: the Mountain Graveyard runs up from the Sound to the cold tip where the samurai of Iron live.
  ['graveyard', 'waterfall', 1.5],
  ['graveyard', 'rice', 1],
  ['graveyard', 'iron', 1.5],
  ['graveyard', 'earth', 3],
  // North-east: Hot Water, then Frost, then across the strait to Lightning.
  ['hot-water', 'frost', 1.5],
  ['frost', 'lightning', 2.5],
  ['iron', 'lightning', 3],
  // The sea: Whirlpools lies off Fire's east coast on the way to the Mist;
  // Waves is on the south coast, below the Leaf.
  ['whirlpools', 'water', 2.5],
  ['waves', 'water', 3.5],
  ['woods', 'whirlpools', 1],
  ['woods', 'hot-water', 2.5],
  // South, anime lands: Tea hangs off Fire's southern tongue; the Sea's islands lie past it.
  ['tea', 'waves', 1.5],
  ['tea', 'sea', 1.5],
  ['sea', 'waves', 2.5],
];

/** Within one country: a day or so. */
const SAME_REGION_DAYS = 0.75;

let table: Map<string, number> | null = null;

function distances(): Map<string, number> {
  if (table) return table;

  const regions = Object.keys(REGION_NAME) as Region[];
  const dist = new Map<string, number>();
  const key = (a: Region, b: Region) => `${a}|${b}`;

  for (const a of regions) {
    for (const b of regions) dist.set(key(a, b), a === b ? 0 : Infinity);
  }

  for (const [a, b, days] of ROADS) {
    dist.set(key(a, b), Math.min(days, dist.get(key(a, b))!));
    dist.set(key(b, a), Math.min(days, dist.get(key(b, a))!));
  }

  // Floyd-Warshall: a couple of dozen regions, computed once.
  for (const k of regions) {
    for (const i of regions) {
      for (const j of regions) {
        const through = dist.get(key(i, k))! + dist.get(key(k, j))!;

        if (through < dist.get(key(i, j))!) dist.set(key(i, j), through);
      }
    }
  }

  table = dist;
  return dist;
}

/** The region a place description is in, or null when it names none. */
export function regionOf(text: string | undefined | null): Region | null {
  if (!text) return null;

  const localized = localizePlaceNames(text);
  let best: { index: number; region: Region } | null = null;

  for (const [pattern, region] of PATTERNS) {
    const match = pattern.exec(localized);

    if (match && (!best || match.index < best.index)) best = { index: match.index, region };
  }

  return best?.region ?? null;
}

/** The great village whose land a region is; null for the small countries. */
export const TERRITORY_OF_REGION: Partial<Record<Region, 'leaf' | 'sand' | 'mist' | 'cloud' | 'stone'>> = {
  fire: 'leaf',
  wind: 'sand',
  water: 'mist',
  lightning: 'cloud',
  earth: 'stone',
};

/** Shinobi travel days between two regions. */
export function travelDaysBetween(from: Region, to: Region): number {
  if (from === to) return SAME_REGION_DAYS;

  return distances().get(`${from}|${to}`) ?? 4;
}

const HOME_BY_TAG: Array<[string, Region]> = [
  ['akatsuki', 'rain'],
  ['rain', 'rain'],
  ['leaf', 'fire'],
  ['sand', 'wind'],
  ['mist', 'water'],
  ['cloud', 'lightning'],
  ['stone', 'earth'],
  ['sound', 'rice'],
  ['waves', 'waves'],
  ['waterfall', 'waterfall'],
  ['frost', 'frost'],
  ['tea', 'tea'],
];

/**
 * Where someone most likely is right now, as far as the save knows: where
 * the story last said they were going, else where Kan last saw them, else
 * their home village.
 */
export function whereaboutsRegion(entity: EntityRecord): Region | null {
  const told = regionOf(entity.whereabouts);

  if (told) return told;

  const seen = regionOf(entity.lastSeenAt);

  if (seen) return seen;

  const fromRole = regionOf(entity.role);

  if (fromRole) return fromRole;

  for (const [tag, region] of HOME_BY_TAG) {
    if (entity.tags.includes(tag)) return region;
  }

  return null;
}

export function isRegion(value: unknown): value is Region {
  return typeof value === 'string' && value in REGION_NAME;
}

/**
 * The region Kan is in now: the one his location names, else the last one
 * on his road (a forest clearing is still in the country he was last in),
 * else the Land of Fire, where the story starts.
 */
export function currentRegion(db: Pick<AppDatabase, 'state'>): Region {
  const named = regionOf(db.state.location);

  if (named) return named;

  const road = db.state.travelLog ?? [];

  for (let index = road.length - 1; index >= 0; index -= 1) {
    const region = road[index].region;

    if (isRegion(region)) return region;
  }

  return 'fire';
}
