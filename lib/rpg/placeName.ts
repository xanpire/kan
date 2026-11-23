// Place names in two parts (test run §11): the header showed "The inner ward
// of the Rain village, past the iron…". Now `state.location` is a short name,
// "Region · spot" (at most about 28 characters: "Hidden Rain · inner ward"),
// and `state.locationDetail` holds the rest ("past the iron gate beneath the
// steel spires"). The narrator, the image prompts and the travel log get the
// two joined, so nothing they relied on is lost.

import { currentRegion, regionName, regionOf } from './geography';
import { MAP_PLACES, mapPlace, placeIdOf } from './mapData';
import type { AppDatabase } from './types';

export const SHORT_PLACE_MAX = 28;
const DETAIL_MAX = 90;

/** "Hidden Rain Village" → "Hidden Rain"; a country → "Land of Rain". Only names Kan could know (era-accurate). */
function regionLabel(db: Pick<AppDatabase, 'state'>, text: string): string {
  const place =
    mapPlace(placeIdOf(text)) ??
    // "the Rain village": the map only knows "Hidden Rain".
    MAP_PLACES.find((item) => item.kind === 'village' && item.short && new RegExp(`\\b${item.short} village\\b`, 'i').test(text)) ??
    null;
  const village = place && !place.parent ? place : place?.parent ? mapPlace(place.parent) : null;
  if (village && village.kind === 'village' && !village.secret) return village.name.replace(/\s+Village$/i, '');
  const region = regionOf(text) ?? currentRegion(db);
  return regionName(region, db).replace(/^the\s+/i, '');
}

const SPLIT = /\s*,\s*|\s+(?=(?:of|past|beneath|below|near|beside|outside|inside|under|by|at|in|on|along|toward|towards|across|behind|above|over|within|between|overlooking|facing|where|with)\s)/i;
const LEADING = /^(?:the|a|an|your|his)\s+/i;

function cap(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Cut to at most `max` characters at a word. */
function fit(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  return (space > 4 ? cut.slice(0, space) : text.slice(0, max)).replace(/[\s,;:·–—-]+$/, '');
}

/** Already "Region · spot" and short. */
export function isShortPlace(text: string) {
  return text.length <= SHORT_PLACE_MAX + 4 && !/[,;]/.test(text);
}

/**
 * A place the tracker gave (and its detail, when it gave one) as a short
 * name and a detail. A short "Region · spot" comes back as it is.
 */
export function splitPlace(
  db: Pick<AppDatabase, 'state'>,
  raw: string,
  detail?: string | null
): { location: string; detail?: string } {
  const text = raw.trim().replace(/\s+/g, ' ');
  const given = detail?.trim().replace(/\s+/g, ' ').replace(/[.]+$/, '');

  if (!text) return { location: text };
  if (isShortPlace(text)) return { location: text, ...(given ? { detail: fit(given, DETAIL_MAX) } : {}) };

  // The main noun phrase first ("The inner ward"), the rest is detail.
  const [head, ...rest] = text.split(SPLIT);
  const headIndex = text.indexOf(head) + head.length;
  let remainder = text.slice(headIndex).replace(/^\s*,\s*/, '').trim();
  const label = regionLabel(db, text);
  let spot = head.replace(LEADING, '').trim();

  // "Hidden Rain Village" alone: the region is the whole name.
  if (spot.toLowerCase() === label.toLowerCase() || label.toLowerCase().includes(spot.toLowerCase())) spot = '';
  // "of the Rain village," adds nothing the label doesn't say.
  remainder = remainder.replace(/^of\s+(?:the\s+)?[^,]*?(?:village|country|land of [a-z ]+)\s*,?\s*/i, '').trim();
  void rest;

  let location = spot ? `${label} · ${spot}` : label;
  if (location.length > SHORT_PLACE_MAX && spot) {
    const room = SHORT_PLACE_MAX - label.length - 3;
    location = room >= 6 ? `${label} · ${fit(spot, room)}` : cap(fit(spot, SHORT_PLACE_MAX));
  }
  const detailText = given || remainder;
  return { location, ...(detailText ? { detail: fit(detailText.replace(/[.]+$/, ''), DETAIL_MAX) } : {}) };
}

/** The place with its detail, for the narrator, the image prompts and the travel log. */
export function fullPlace(state: Pick<AppDatabase['state'], 'location' | 'locationDetail'>): string {
  const location = state.location ?? '';
  return state.locationDetail ? `${location}, ${state.locationDetail}` : location;
}

/** The header's place: the short name, or just the spot when even that is long. */
export function headerPlace(location: string): string {
  if (location.length <= SHORT_PLACE_MAX + 4) return location;
  const spot = location.split(' · ').pop() ?? location;
  return cap(fit(spot, SHORT_PLACE_MAX));
}
