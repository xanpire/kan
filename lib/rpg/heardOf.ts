// People Kan knows of but hasn't met in the story (test run of 23 Nov 2026:
// Itachi named Danzō and the council, and nothing about Danzō showed on the
// bonds screen). Meeting still happens only in the scene cast (met.ts); being
// named on the page by a name Kan knows puts someone under "Talked about" with
// the day they last came up, so you can open what you know of them.

import { mentionsEntity } from './characterRefs';
import { isDeceased } from './deaths';
import { knewBefore } from './kanView';
import { kanKnowsName } from './names';
import type { AppDatabase, CalendarDate, EntityRecord } from './types';

/** Someone the "Talked about" list can hold: a person, unmet, Kan knows their name. */
export function canBeHeardOf(entity: EntityRecord): boolean {
  if (entity.type !== 'character' || entity.name.toLowerCase() === 'kan') return false;
  if (entity.met !== false || entity.tier === 'minor') return false;
  if (entity.tags.includes('tailed-beast') || entity.tags.includes('summon')) return false;
  if (!kanKnowsName(entity)) return false;
  // The dead only when Kan knew them himself (Fugaku, Mikoto): not every
  // Hokage a history lesson names.
  if (isDeceased(entity) && !knewBefore(entity)) return false;
  return true;
}

/** Marks everyone the text names (by a name Kan knows) as heard of on this day. */
export function markHeardOf(db: AppDatabase, text: string, date: CalendarDate = db.state.inStoryDate): AppDatabase {
  if (!text.trim()) return db;
  let changed = false;
  const entities = db.entities.map((entity) => {
    if (!canBeHeardOf(entity) || !mentionsEntity(text, entity)) return entity;
    const was = entity.heardOf;
    if (was && was.year === date.year && was.month === date.month && was.day === date.day && was.hour === date.hour && was.minute === date.minute) {
      return entity;
    }
    changed = true;
    return { ...entity, heardOf: date };
  });
  return changed ? { ...db, entities } : db;
}

/** Old saves: the story so far is read once for people already talked about. */
export function backfillHeardOf(db: AppDatabase): AppDatabase {
  if (db.state?.heardOfScanned || !Array.isArray(db.rawLog) || !Array.isArray(db.entities)) return db;
  let next = db;
  for (const entry of db.rawLog) {
    if ((entry.kind && entry.kind !== 'story') || entry.flashback) continue;
    if (typeof entry.content !== 'string' || !entry.inStoryDate) continue;
    next = markHeardOf(next, entry.content, entry.inStoryDate);
  }
  return { ...next, state: { ...next.state, heardOfScanned: true } };
}
