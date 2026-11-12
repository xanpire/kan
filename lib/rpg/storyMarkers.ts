// The Story log reads like a book (audit 11b): a quiet chapter card where a
// chapter opens, and thin centred lines when a new day begins or Kan is
// somewhere new. Built from what the save already holds; no model calls.

import { dateSortValue, monthName } from './calendar';
import { localizePlaceNames } from './glossary';
import type { AppDatabase, CalendarDate, RawLogEntry } from './types';

/** The three stages the Story screen names while a scene is painted. */
export type PaintStage = 'framing' | 'painting' | 'checking';

export const PAINT_STAGE_LABEL: Record<PaintStage, string> = {
  framing: 'Framing the shot',
  painting: 'Painting',
  checking: 'Checking',
};

export type StoryMarker = {
  chapter?: { number: number; title: string; line: string };
  /** "17 October", with the year when it changed. */
  day?: string;
  place?: string;
};

function dayKey(date: CalendarDate) {
  return date.year * 10000 + date.month * 100 + date.day;
}

export function dayLine(date: CalendarDate, withYear: boolean) {
  return `${date.day} ${monthName(date.month)}${withYear ? `, year ${date.year}` : ''}`;
}

function placeAt(db: AppDatabase, date: CalendarDate) {
  const value = dateSortValue(date);
  const stops = db.state.travelLog ?? [];
  let found: string | null = null;

  for (const stop of stops) {
    if (dateSortValue(stop.date) <= value) found = stop.place;
    else break;
  }

  return found;
}

function chapterTitle(db: AppDatabase, number: number) {
  if (number === db.state.chapter) return db.state.chapterTitle?.trim() || null;
  return db.state.chapters?.find((item) => item.chapter === number)?.title?.trim() || null;
}

/**
 * Markers keyed by the story entry they sit above: Kan's action that opens a
 * chapter, a new day or a new place. The very first turn gets none (the
 * opening speaks for itself); flashback turns get none (their clock is the past).
 */
export function storyMarkers(db: AppDatabase): Map<string, StoryMarker> {
  const markers = new Map<string, StoryMarker>();
  const story = db.rawLog.filter((entry) => entry.kind === 'story' && entry.role === 'user' && !entry.flashback);
  const stops = db.state.travelLog ?? [];
  let previous: RawLogEntry | null = null;

  for (const entry of story) {
    if (!previous) {
      previous = entry;
      continue;
    }

    const marker: StoryMarker = {};

    if (entry.chapter > previous.chapter) {
      const place = placeAt(db, entry.inStoryDate);
      marker.chapter = {
        number: entry.chapter,
        title: chapterTitle(db, entry.chapter) ?? `Chapter ${entry.chapter}`,
        line: [dayLine(entry.inStoryDate, entry.inStoryDate.year !== previous.inStoryDate.year), place ? localizePlaceNames(place) : null]
          .filter(Boolean)
          .join(' · '),
      };
    } else {
      if (dayKey(entry.inStoryDate) !== dayKey(previous.inStoryDate)) {
        marker.day = dayLine(entry.inStoryDate, entry.inStoryDate.year !== previous.inStoryDate.year);
      }

      // A place Kan reached since the last action.
      const from = dateSortValue(previous.inStoryDate);
      const to = dateSortValue(entry.inStoryDate);
      const arrived = [...stops].reverse().find((stop) => {
        const value = dateSortValue(stop.date);
        return value > from && value <= to;
      });

      if (arrived) marker.place = localizePlaceNames(arrived.place);
    }

    if (marker.chapter || marker.day || marker.place) markers.set(entry.id, marker);
    previous = entry;
  }

  return markers;
}
