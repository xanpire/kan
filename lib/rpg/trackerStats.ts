/**
 * How the state tracker is doing, field by field (audit 7): over the turns in
 * the Debug log, how often each top-level field of the tracker's reply was
 * filled, and how often the player later fixed that part of a turn by hand
 * (the time chip, a merge, Mark as dead, Travel together).
 *
 * Pure: reads Debug log turns, returns counts. Shown in Settings → Debug.
 */
import type { DebugTurn } from './debug';
import { parseJsonObject, repairTruncatedJson } from './stateBlock';
import { TURN_STATE_SCHEMA } from './stateSchema';

export const TRACKER_FIELDS = Object.keys(TURN_STATE_SCHEMA.properties);

/** Which tracker field a hand correction fixes. */
export type TrackerCorrection = 'time' | 'new_characters' | 'deaths' | 'companions_joined' | 'inventory_added' | 'inventory_removed';

export type TrackerFieldStat = {
  field: string;
  /** Turns whose reply filled this field (not null, not an empty list, not false). */
  filled: number;
  /** Turns where the player fixed this part by hand afterwards. */
  corrected: number;
};

export type TrackerStats = {
  /** Turns with a readable tracker reply. */
  turns: number;
  /** Turns whose reply could not be read at all. */
  unreadable: number;
  fields: TrackerFieldStat[];
};

export function isFilled(value: unknown): boolean {
  if (value === null || value === undefined || value === false) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(isFilled);
  }

  return true;
}

/** A reply as the step read it: after a retry, the retry's half. */
function readReply(raw: string): Record<string, unknown> | null {
  const last = raw.split('--- retry ---').at(-1) ?? raw;
  return parseJsonObject(last) ?? repairTruncatedJson(last);
}

export function trackerFieldStats(turns: DebugTurn[]): TrackerStats {
  const filled = new Map<string, number>(TRACKER_FIELDS.map((field) => [field, 0]));
  const corrected = new Map<string, number>(TRACKER_FIELDS.map((field) => [field, 0]));
  let read = 0;
  let unreadable = 0;

  for (const turn of turns) {
    const raw = turn.state?.raw;

    if (typeof raw === 'string') {
      const core = readReply(raw);
      // The World call's reply, when it ran, adds its own fields (audit 7).
      const world = typeof turn.state?.worldRaw === 'string' ? readReply(turn.state.worldRaw) : null;
      const reply = core ? { ...core, ...(world ?? {}) } : null;

      if (reply) {
        read += 1;

        for (const field of TRACKER_FIELDS) {
          if (isFilled(reply[field])) {
            filled.set(field, (filled.get(field) ?? 0) + 1);
          }
        }
      } else {
        unreadable += 1;
      }
    }

    // One fix per field per turn: fixing the time twice is still one wrong turn.
    const fixedHere = new Set((turn.corrections ?? []).map((entry) => entry.field));

    for (const field of fixedHere) {
      corrected.set(field, (corrected.get(field) ?? 0) + 1);
    }
  }

  const fields = TRACKER_FIELDS.map((field) => ({
    field,
    filled: filled.get(field) ?? 0,
    corrected: corrected.get(field) ?? 0,
  })).sort((a, b) => b.corrected - a.corrected || b.filled - a.filled || a.field.localeCompare(b.field));

  return { turns: read, unreadable, fields };
}
