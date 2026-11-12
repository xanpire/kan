// Places look the same every time (audit 11c). The first scene painted at a
// place keeps a one-line look (from the director's PLACE line) and the image
// itself, which later images of the same place get as a "place" reference,
// ranked after people and before the previous scene. Safehouses are keyed
// by the safehouse, so a camp keeps its look even when the location wording
// drifts.

import { currentSafehouse } from './safehouses';
import type { AppDatabase, PlaceLookRecord, SceneImageMeta } from './types';

/** Most places remembered; the oldest go first. */
export const PLACE_LOOK_LIMIT = 80;

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Which place this is: the safehouse Kan is at, else the location's own words. */
export function placeKeyOf(db: Pick<AppDatabase, 'state'>): string | null {
  if (db.state.flashbacks?.active) return null;

  const house = currentSafehouse(db);
  if (house) return `safehouse:${house.id}`;

  const key = normalize(db.state.location ?? '');
  return key ? `place:${key}` : null;
}

export function placeLookOf(db: Pick<AppDatabase, 'state' | 'placeLooks'>): PlaceLookRecord | null {
  const key = placeKeyOf(db);
  if (!key) return null;
  return (db.placeLooks ?? []).find((place) => place.key === key) ?? null;
}

/**
 * After a scene image is kept: the first one painted at a place becomes its
 * look and reference. A retouch, a memory, or a place already remembered
 * changes nothing. Returns the database unchanged when there is nothing to add.
 */
export function rememberPlaceLook(db: AppDatabase, logId: string, image: string, meta: SceneImageMeta | undefined): AppDatabase {
  const place = meta?.place;

  if (!place || meta?.tweak || !image.startsWith('img:')) return db;

  const entry = db.rawLog.find((item) => item.id === logId);
  if (!entry || entry.flashback) return db;

  const places = db.placeLooks ?? [];
  const existing = places.find((item) => item.key === place.key);

  if (existing?.image) return db;

  const record: PlaceLookRecord = {
    key: place.key,
    name: place.name,
    ...(place.look ? { look: place.look } : existing?.look ? { look: existing.look } : {}),
    image,
    createdAt: Date.now(),
  };

  return {
    ...db,
    placeLooks: [...places.filter((item) => item.key !== place.key), record].slice(-PLACE_LOOK_LIMIT),
  };
}

/** Keeps only well-formed place records (normalizeDatabase). */
export function normalizePlaceLooks(value: unknown): PlaceLookRecord[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item): item is PlaceLookRecord =>
        Boolean(item) && typeof item.key === 'string' && typeof item.name === 'string'
    )
    .slice(-PLACE_LOOK_LIMIT);
}
