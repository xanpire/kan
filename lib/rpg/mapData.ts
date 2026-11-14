// The map (living-world Stage 4, section 14).
//
// A stylised map of the shinobi world built on the same geography as the
// GEOGRAPHY lore and geography.ts: the countries, the great villages, the
// places the story uses (the Naka Shrine and the Uzumaki mask shrine in the
// Leaf, Karin's Grass, Uzushio's ruins, the Land of Silence), Kan's road over
// time, and where the people he knows are, as far as he knows. That last part
// is what he was told or last saw, never the truth the save holds.
//
// Coordinates are on a 100 × 100 board (x east, y south); the outlines are
// in mapShapes.ts, traced after the canon maps.

import { daysBetween } from './calendar';
import { companionsOf } from './companions';
import { isDeceased, kanKnowsDeath } from './deaths';
import {
  REGION_NAME,
  regionName,
  currentRegion,
  isRegion,
  regionOf,
  travelDaysBetween,
  whereaboutsRegion,
  type Region,
} from './geography';
import { localizePlaceNames } from './glossary';
import type { AppDatabase, CalendarDate, EntityRecord, TravelStop } from './types';
import { hashText } from './util';
import { REGION_SHAPES } from './mapShapes';
import { regionWeather, weatherTravelFactor } from './weather';

export const MAP_WIDTH = 100;
export const MAP_HEIGHT = 100;

export { REGION_SHAPES, regionAt, type RegionShape } from './mapShapes';

export type MapPlaceKind = 'village' | 'place' | 'shrine' | 'ruin' | 'hideout';

export type MapPlace = {
  id: string;
  name: string;
  /** null for places off every road Kan knows (the Land of Silence). */
  region: Region | null;
  x: number;
  y: number;
  kind: MapPlaceKind;
  /** Matches the story's location text (proper names only). */
  match: RegExp;
  /** The short name, matched only capitalised after "the": "the Rain", never "the rain" (audit 6b.1). */
  short?: string;
  /**
   * Not on Kan's map from the start (audit 6b.2): it appears once he has
   * been there, the story has named it, or this canon milestone has happened.
   */
  secret?: { knownFrom?: string };
  /** The note says more than Kan knows: shown only once he has been there or this milestone happened. */
  noteFrom?: string;
  /** The note names something only this milestone brings (a person Kan hasn't met): being there is not enough. */
  noteNeeds?: string;
  /** Does not exist until this canon milestone has happened: not on the map, whatever the story says. */
  builtBy?: string;
  /** A place inside another (a shrine in the Leaf): listed under it, drawn with it. */
  parent?: string;
  /** No known location: never drawn, listed apart (x and y are unused). */
  unplaced?: boolean;
  /** Where its name goes when the map is zoomed in (below the dot unless that hits a neighbour). */
  nameAt?: 'above' | 'right' | 'left';
  note?: string;
};

/** The Great Naruto Bridge is finished, and named, when Team 7's mission in the Land of Waves ends. */
export const NARUTO_BRIDGE_BUILT_BY = 'land-of-waves';

export const MAP_PLACES: MapPlace[] = [
  // The Land of Fire.
  { id: 'leaf', name: 'Hidden Leaf Village', region: 'fire', x: 41, y: 33.5, kind: 'village', match: /\b(hidden leaf|konoha(gakure)?|leaf village)\b/i, short: 'Leaf' },
  { id: 'uchiha-district', name: 'Uchiha district', region: 'fire', x: 41, y: 33.5, kind: 'ruin', parent: 'leaf', match: /\buchiha (district|compound|quarter)\b/i, note: 'Your clan’s streets, behind their own wall at the village’s edge.' },
  { id: 'naka-shrine', name: 'Naka Shrine', region: 'fire', x: 41, y: 33.5, kind: 'shrine', parent: 'leaf', match: /\bnaka shrine\b/i, note: 'The Uchiha stone tablet lies beneath it.' },
  { id: 'naka-river', name: 'Naka River', region: 'fire', x: 41, y: 33.5, kind: 'place', parent: 'leaf', match: /\bnaka river\b/i },
  { id: 'mask-shrine', name: 'Uzumaki mask shrine', region: 'fire', x: 41, y: 33.5, kind: 'shrine', parent: 'leaf', match: /\b(uzumaki )?mask shrine\b/i, note: 'Kept by the Uzumaki since Uzushio fell, on the edge of the Leaf.' },
  { id: 'valley-end', name: 'Valley of the End', region: 'fire', x: 43.05, y: 24.15, kind: 'place', match: /\bvalley of the end\b/i, note: 'On the Land of Fire’s northern border.' },
  { id: 'tanzaku', name: 'Tanzaku Town', region: 'fire', x: 37.6, y: 38.6, kind: 'place', match: /\btanzaku\b/i },
  { id: 'fire-temple', name: 'Fire Temple', region: 'fire', x: 51, y: 31.5, kind: 'shrine', match: /\bfire temple\b/i },
  // The west: Wind, Rivers, Rain, Grass, Birds and Silence.
  { id: 'sand', name: 'Hidden Sand Village', region: 'wind', x: 23.5, y: 40.4, kind: 'village', match: /\b(hidden sand|sunagakure)\b/i, short: 'Sand' },
  { id: 'loran', name: 'Ruins of Loran', region: 'wind', x: 5.65, y: 45.5, kind: 'ruin', match: /\b(loran|rouran)\b/i, note: 'A desert city long since buried in sand.' },
  { id: 'ceramic', name: 'Ceramic Village', region: 'wind', x: 26.8, y: 49.6, kind: 'place', match: /\bceramic village\b/i, note: 'A potters’ village in the mountains where Wind meets Rivers.' },
  { id: 'valley-village', name: 'Hidden Valley Village', region: 'rivers', x: 32.5, y: 41.9, kind: 'village', match: /\b(hidden valley|tanigakure|village hidden in the vale)\b/i },
  { id: 'artisans', name: 'Artisans Village', region: 'rivers', x: 34.7, y: 47.4, kind: 'place', match: /\bartisans'? village\b/i, },
  { id: 'rain', name: 'Hidden Rain Village', region: 'rain', x: 25.1, y: 29.2, kind: 'village', match: /\b(hidden rain|amegakure)\b/i, short: 'Rain', noteFrom: 'kan-joins-akatsuki', note: 'The Akatsuki’s stronghold, in the tower.' },
  { id: 'grass', name: 'Hidden Grass Village', region: 'grass', x: 25.75, y: 26.25, kind: 'village', nameAt: 'right', match: /\b(hidden grass|kusagakure)\b/i, noteNeeds: 'karin-meets', note: 'Where Karin is from.' },
  { id: 'tenchi-bridge', name: 'Tenchi Bridge', region: 'grass', x: 27.6, y: 28.3, kind: 'place', nameAt: 'right', match: /\btenchi bridge\b/i },
  { id: 'hozuki-castle', name: 'Hōzuki Castle', region: 'grass', x: 25.75, y: 26.25, kind: 'place', parent: 'grass', match: /\b(h[oō]zuki castle|blood prison)\b/i, note: 'The Blood Prison. Said to stand by the sea, though Grass has no coast.' },
  { id: 'hidden-rock', name: 'Hidden Rock Village', region: 'birds', x: 15.5, y: 28.6, kind: 'village', match: /\b(hidden rock|ishigakure)\b/i, note: 'A small village between Earth and Wind, in the Land of Birds.' },
  { id: 'silence', name: 'Curtain Village', region: 'silence', x: 4.2, y: 24.4, kind: 'village', match: /\b(land of silence|curtain village)\b/i, note: 'The walled Land of Silence at the continent’s western edge: it takes in missing-nin, past a guarded checkpoint.' },
  // The north: Earth, Waterfall, the Graveyard, Iron, Sound, Hot Water, Frost.
  { id: 'stone', name: 'Hidden Stone Village', region: 'earth', x: 23.75, y: 13, kind: 'village', match: /\b(hidden stone|iwagakure)\b/i, short: 'Stone' },
  { id: 'waterfall', name: 'Hidden Waterfall Village', region: 'waterfall', x: 31.6, y: 16.75, kind: 'village', match: /\b(hidden waterfall|takigakure)\b/i },
  { id: 'mountain-graveyard', name: 'Mountain Graveyard', region: 'graveyard', x: 43.5, y: 12.6, kind: 'hideout', nameAt: 'above', match: /\b(mountain graveyard|graveyard of (the )?mountains?)\b/i, noteFrom: 'masked-man-truth', note: 'A wasteland of enormous bones, with caverns beneath it.' },
  { id: 'iron', name: 'Samurai of the Land of Iron', region: 'iron', x: 46.8, y: 4.6, kind: 'place', nameAt: 'above', match: /\b(land of iron|iron country|samurai of the land of iron)\b/i, note: 'Samurai country, on the snowy tip north of the Mountain Graveyard.' },
  { id: 'three-wolves', name: 'Three Wolf Mountains', region: 'iron', x: 40.6, y: 6.6, kind: 'place', nameAt: 'above', match: /\b(three wolf mountains?|land of medicines?|howling wolf|awakening wolf|nourishing wolf)\b/i, note: 'Three wolf-shaped peaks with a village on each, among fields of medicinal flowers.' },
  { id: 'sound', name: 'Hidden Sound Village', region: 'rice', x: 45.2, y: 19.3, kind: 'hideout', nameAt: 'above', match: /\b(hidden sound|otogakure|sound (village|hideout|base)|orochimaru'?s (hideout|lair|base))\b/i, secret: { knownFrom: 'otogakure-grows' }, note: 'Not one village but Orochimaru’s scattered hidden bases.' },
  { id: 'hot-springs', name: 'Hidden Hot Springs Village', region: 'hot-water', x: 47.4, y: 20.6, kind: 'village', nameAt: 'right', match: /\b(yugakure|hot springs?|hidden steam)\b/i },
  { id: 'bamboo', name: 'Bamboo Village', region: 'hot-water', x: 58.2, y: 30, kind: 'place', match: /\bbamboo village\b/i, note: 'A village on Hot Water’s coast, on the road north to Lightning.' },
  { id: 'frost', name: 'Hidden Frost Village', region: 'frost', x: 52.5, y: 18.4, kind: 'village', nameAt: 'right', match: /\b(hidden frost|shimogakure)\b/i },
  { id: 'cloud', name: 'Hidden Cloud Village', region: 'lightning', x: 64, y: 13.4, kind: 'village', match: /\b(hidden cloud|kumogakure)\b/i, short: 'Cloud' },
  { id: 'genbu', name: 'Island Turtle', region: 'lightning', x: 74.75, y: 17.75, kind: 'place', match: /\b(island turtle|genbu)\b/i, secret: { knownFrom: 'killer-bee-training' }, note: 'An island that is really a giant turtle, drifting off Lightning’s coast.' },
  // The east and the sea.
  { id: 'uzushio', name: 'Ruins of Uzushio', region: 'whirlpools', x: 60.1, y: 36.7, kind: 'ruin', nameAt: 'above', match: /\b(uzushio(gakure)?|hidden whirlpool|hidden eddy)\b/i, note: 'Your father’s people. Ruins, old seals and graves.' },
  { id: 'mist', name: 'Hidden Mist Village', region: 'water', x: 79, y: 37.5, kind: 'village', nameAt: 'above', match: /\b(hidden mist|kirigakure)\b/i, short: 'Mist' },
  { id: 'nadeshiko', name: 'Nadeshiko Village', region: 'water', x: 88.5, y: 46, kind: 'place', match: /\bnadeshiko\b/i, note: 'An island village of women shinobi near the Land of Water.' },
  { id: 'waves', name: 'Land of Waves', region: 'waves', x: 39.3, y: 55.2, kind: 'place', nameAt: 'above', match: /\b(land of waves|wave country|tazuna)\b/i, note: 'A small island south of the Leaf, lapped by gentle waves; famous for its mangroves.' },
  { id: 'naruto-bridge', name: 'Great Naruto Bridge', region: 'waves', x: 43.8, y: 55.35, kind: 'place', nameAt: 'right', builtBy: NARUTO_BRIDGE_BUILT_BY, match: /\bgreat naruto bridge\b/i, note: 'Joins the Land of Waves to the mainland.' },
  // The anime-only south.
  { id: 'tea-fishing', name: 'Fishing village of the Land of Tea', region: 'tea', x: 44.7, y: 67.2, kind: 'place', match: /\b(land of tea|tea country)\b.*\bfishing village\b|\bfishing village\b.*\b(land of tea|tea country)\b/i },
  { id: 'degarashi', name: 'Degarashi Port', region: 'tea', x: 46.7, y: 75.3, kind: 'place', match: /\bdegarashi\b/i },
  { id: 'modoroki', name: 'Modoroki Shrine', region: 'tea', x: 64, y: 64.3, kind: 'shrine', match: /\b(modoroki shrine|nagi island)\b/i, note: 'On Nagi Island.' },
  { id: 'todoroki', name: 'Todoroki Great Shrine', region: 'tea', x: 79.8, y: 81.8, kind: 'shrine', match: /\b(todoroki (great )?shrine|ouza island)\b/i, note: 'At the southern end of Ouza Island.' },
  // Off every map Kan knows.
  { id: 'snow', name: 'Land of Snow', region: null, x: 0, y: 0, unplaced: true, kind: 'place', match: /\b(land of snow|snow country|land of spring)\b/i, note: 'Reached by ship from the Land of Fire; no map you know shows where.' },
  { id: 'valley-lies', name: 'Valley of Lies', region: null, x: 0, y: 0, unplaced: true, kind: 'place', match: /\b(valley of lies|shangri-?la)\b/i, note: 'A mountain valley far from every village: five days from the Rain, they say.' },
  { id: 'flowers', name: 'Land of Flowers', region: null, x: 0, y: 0, unplaced: true, kind: 'place', match: /\bland of flowers\b/i, note: 'Somewhere on the Land of Earth’s border.' },
  { id: 'moon', name: 'Land of the Moon', region: null, x: 0, y: 0, unplaced: true, kind: 'place', match: /\b(land of the moon|moon country|crescent moon kingdom)\b/i, note: 'An island kingdom somewhere in the sea to the south.' },
];

const PLACE_BY_ID = new Map(MAP_PLACES.map((place) => [place.id, place]));

/** Where a place's name sits when the map is zoomed in, beside its dot. */
export function placeNameSpot(place: MapPlace): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const r = place.kind === 'village' ? 0.85 : 0.55;

  if (place.nameAt === 'above') return { x: place.x, y: place.y - r - 0.45, anchor: 'middle' };
  if (place.nameAt === 'right') return { x: place.x + r + 0.5, y: place.y + 0.33, anchor: 'start' };
  if (place.nameAt === 'left') return { x: place.x - r - 0.5, y: place.y + 0.33, anchor: 'end' };

  return { x: place.x, y: place.y + r + 1.1, anchor: 'middle' };
}

export function mapPlace(id: string | undefined | null): MapPlace | null {
  return id ? PLACE_BY_ID.get(id) ?? null : null;
}

/** Canon milestones that have happened (completed) in this save. */
function happened(db: AppDatabase, milestoneId: string) {
  return Boolean(db.state.canonProgress?.completed?.includes(milestoneId) && db.events.some((event) => event.id === `event_canon_${milestoneId}`));
}

/** Whether something built during the story stands yet (the Great Naruto Bridge). */
export function isBuilt(db: AppDatabase, milestoneId: string) {
  return happened(db, milestoneId);
}

/** The story has named this place to Kan (in a reply). */
function named(db: AppDatabase, place: MapPlace) {
  return db.rawLog.some((entry) => entry.kind === 'story' && entry.role === 'assistant' && place.match.test(localizePlaceNames(entry.content)));
}

/** Is this place on Kan's map yet? (audit 6b.2) */
export function placeKnown(db: AppDatabase, place: MapPlace, visits?: Map<string, unknown>): boolean {
  if (place.builtBy && !happened(db, place.builtBy)) return false;
  if (!place.secret) return true;
  if ((visits ?? placeVisits(db)).has(place.id)) return true;
  if (place.secret.knownFrom && happened(db, place.secret.knownFrom)) return true;
  return named(db, place);
}

/** Its note, or null while the note says more than Kan knows. */
export function placeNote(db: AppDatabase, place: MapPlace, visits?: Map<string, unknown>): string | null {
  if (!place.note) return null;
  if (place.noteNeeds) return happened(db, place.noteNeeds) ? place.note : null;
  if (!place.noteFrom && !place.secret) return place.note;
  if ((visits ?? placeVisits(db)).has(place.id)) return place.note;
  if (place.noteFrom && happened(db, place.noteFrom)) return place.note;
  if (place.secret?.knownFrom && happened(db, place.secret.knownFrom)) return place.note;
  return null;
}

/** The map place a location names (earliest mention wins; a shrine in the Leaf beats the Leaf). */
export function placeIdOf(text: string | undefined | null): string | null {
  if (!text) return null;

  const localized = localizePlaceNames(text);
  let best: { index: number; place: MapPlace } | null = null;

  for (const place of MAP_PLACES) {
    const found = place.match.exec(localized) ?? (place.short ? new RegExp(`\\bthe ${place.short}\\b`).exec(localized) : null);

    if (!found) continue;
    // Prefer the earliest mention; on a tie, the more specific (a place with a parent).
    if (!best || found.index < best.index || (found.index === best.index && place.parent && !best.place.parent)) {
      best = { index: found.index, place };
    }
  }

  // "the Naka Shrine in the ruins of the Hidden Leaf": the shrine, not the Leaf.
  if (best && !best.place.parent) {
    const child = MAP_PLACES.find((place) => place.parent === best!.place.id && place.match.test(localized));


    if (child) return child.id;
  }

  return best?.place.id ?? null;
}

const TRAVEL_LOG_LIMIT = 400;

function samePlace(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * After a turn: a new place goes on Kan's road. A place that names no
 * country stays in the country he was last in.
 */
export function recordTravel(db: AppDatabase): AppDatabase {
  const log = db.state.travelLog ?? [];
  const last = log[log.length - 1];
  const place = db.state.location?.trim();

  if (!place || (last && samePlace(last.place, place))) return db;

  const region = regionOf(place) ?? (last && isRegion(last.region) ? last.region : null) ?? (log.length === 0 ? currentRegion(db) : null);
  const stop: TravelStop = {
    place: place.slice(0, 140),
    ...(region ? { region } : {}),
    ...(placeIdOf(place) ? { placeId: placeIdOf(place)! } : {}),
    date: db.state.inStoryDate,
  };

  return { ...db, state: { ...db.state, travelLog: [...log, stop].slice(-TRAVEL_LOG_LIMIT) } };
}

export function normalizeTravelLog(value: unknown, location: string, date: CalendarDate): TravelStop[] {
  const stops = Array.isArray(value)
    ? (value as TravelStop[]).filter(
        (stop) => stop && typeof stop.place === 'string' && stop.date && typeof stop.date.year === 'number'
      )
    : [];

  if (stops.length > 0) return stops.slice(-TRAVEL_LOG_LIMIT);

  // Older saves: the road starts where Kan is now.
  const region = regionOf(location);
  const placeId = placeIdOf(location);

  return location
    ? [{ place: location.slice(0, 140), ...(region ? { region } : {}), ...(placeId ? { placeId } : {}), date }]
    : [];
}

export type MapPoint = { x: number; y: number };

/** Where a stop goes on the board: its place, else its country (spread a little so stops don't stack). */
export function pointOfStop(stop: Pick<TravelStop, 'place' | 'region' | 'placeId'>): MapPoint | null {
  const place = mapPlace(stop.placeId);

  if (place && !place.unplaced) return { x: place.x, y: place.y };
  if (!isRegion(stop.region)) return null;

  const shape = REGION_SHAPES[stop.region];
  const hash = hashText(stop.place.toLowerCase());
  const angle = ((hash % 360) * Math.PI) / 180;
  const reach = 0.25 + ((hash >>> 9) % 40) / 100;

  return {
    x: shape.x + Math.cos(angle) * shape.rx * reach,
    y: shape.y + Math.sin(angle) * shape.ry * reach,
  };
}

/** Kan's road as points, oldest first, with repeats of the same spot folded. */
export function routePoints(db: AppDatabase, limit = 60): (MapPoint & { date: CalendarDate; place: string })[] {
  const points: (MapPoint & { date: CalendarDate; place: string })[] = [];

  for (const stop of db.state.travelLog ?? []) {
    const point = pointOfStop(stop);

    if (!point) continue;

    const previous = points[points.length - 1];

    if (previous && Math.abs(previous.x - point.x) < 0.5 && Math.abs(previous.y - point.y) < 0.5) continue;

    points.push({ ...point, date: stop.date, place: stop.place });
  }

  return points.slice(-limit);
}

export type PlaceVisits = { count: number; first: CalendarDate; last: CalendarDate };

/** How often and when Kan has been at each map place (a shrine also counts for its village). */
export function placeVisits(db: AppDatabase): Map<string, PlaceVisits> {
  const visits = new Map<string, PlaceVisits>();
  const add = (id: string, date: CalendarDate) => {
    const known = visits.get(id);

    visits.set(id, known ? { count: known.count + 1, first: known.first, last: date } : { count: 1, first: date, last: date });
  };

  for (const stop of db.state.travelLog ?? []) {
    const place = mapPlace(stop.placeId);

    if (!place) continue;

    add(place.id, stop.date);
    if (place.parent) add(place.parent, stop.date);
  }

  return visits;
}

/** Countries Kan has set foot in. */
export function regionsVisited(db: AppDatabase): Set<Region> {
  return new Set((db.state.travelLog ?? []).map((stop) => stop.region).filter(isRegion));
}

/**
 * Shinobi days from where Kan is to a place, plain and in the weather
 * where he is now. Null for a place off every road.
 */
export function travelEstimate(db: AppDatabase, to: Region | null): { days: number; inWeather: number } | null {
  if (!to) return null;

  const from = currentRegion(db);
  const days = travelDaysBetween(from, to);
  const factor = Math.max(weatherTravelFactor(regionWeather(db, from)), weatherTravelFactor(regionWeather(db, to)));

  return { days, inWeather: Math.round(days * factor * 4) / 4 };
}

export function formatTravelDays(days: number) {
  if (days < 1) return 'under a day';
  if (days === 1) return 'about a day';

  const rounded = Math.round(days * 2) / 2;

  return `about ${rounded % 1 === 0 ? rounded : rounded.toFixed(1)} days`;
}

export type KnownWhereabouts = {
  entity: EntityRecord;
  region: Region;
  /** told: the story said where they went; seen: where you last saw them; assumed: their home; with-you: travelling with you. */
  basis: 'told' | 'seen' | 'assumed' | 'with-you';
  /** In your words, for the list. */
  detail: string;
  /** How old that knowledge is, in days. */
  daysOld?: number;
};

const HOME_TAGS = ['akatsuki', 'leaf', 'sand', 'mist', 'cloud', 'stone', 'sound', 'rain', 'waves', 'waterfall'];

/**
 * Where the people Kan has met are, as far as he knows: what he was told,
 * else where he last saw them, else where they would usually be. Someone
 * who died without Kan knowing is still where he thinks they are.
 */
export function knownWhereabouts(db: AppDatabase): KnownWhereabouts[] {
  const companions = new Set(companionsOf(db).map((entity) => entity.id));
  const here = currentRegion(db);
  const now = db.state.inStoryDate;
  const result: KnownWhereabouts[] = [];

  for (const entity of db.entities) {
    if (entity.type !== 'character' || entity.name === 'Kan' || entity.met === false || entity.tier === 'minor') continue;
    if (isDeceased(entity) && kanKnowsDeath(db, entity)) continue;

    if (companions.has(entity.id)) {
      result.push({ entity, region: here, basis: 'with-you', detail: 'Travelling with you' });
      continue;
    }

    const told = regionOf(entity.whereabouts);
    const seen = regionOf(entity.lastSeenAt);
    const daysOld = entity.lastSeen ? Math.max(0, daysBetween(entity.lastSeen, now)) : undefined;
    const ago = daysOld === undefined ? '' : daysOld < 1 ? 'today' : daysOld < 2 ? 'yesterday' : `${Math.round(daysOld)} days ago`;

    if (told) {
      result.push({ entity, region: told, basis: 'told', detail: `Last word: ${localizePlaceNames(entity.whereabouts!)}`, daysOld });
      continue;
    }

    if (seen) {
      result.push({ entity, region: seen, basis: 'seen', detail: `You saw them there${ago ? ` ${ago}` : ''}`, daysOld });
      continue;
    }

    const home = regionOf(entity.role) ?? whereaboutsFromTags(entity);

    if (home) result.push({ entity, region: home, basis: 'assumed', detail: 'Where they would usually be', daysOld });
  }

  const order = { 'with-you': 0, told: 1, seen: 2, assumed: 3 } as const;

  return result.sort(
    (a, b) => order[a.basis] - order[b.basis] || (a.daysOld ?? 9999) - (b.daysOld ?? 9999) || a.entity.name.localeCompare(b.entity.name)
  );
}

function whereaboutsFromTags(entity: EntityRecord): Region | null {
  if (!HOME_TAGS.some((tag) => entity.tags.includes(tag))) return null;

  return whereaboutsRegion({ ...entity, whereabouts: undefined, lastSeenAt: undefined, role: undefined });
}

export function regionLabel(region: Region | null, db?: Pick<AppDatabase, 'state'> | null) {
  return region ? regionName(region, db).replace(/^the /, 'The ') : 'Off the map';
}
