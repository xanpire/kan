// Finding your way around a long story (audit 10): the chapter list behind
// the "Chapter N" label, and the "Where you left off" card shown when you come
// back after a day or more. Built only from what the save already holds; no
// model calls.

import { companionsOf } from './companions';
import { localizePlaceNames } from './glossary';
import { hiddenGrudge } from './journal';
import { displayName, scrubNameLeaks } from './names';
import { dayLine, storyMarkers } from './storyMarkers';
import type { AppDatabase, RawLogEntry } from './types';

export type ChapterJump = {
  number: number;
  title: string;
  /** "10 October · The forest outside the Leaf" */
  line: string;
  /** The story entry (Kan's action) that opens the chapter. */
  entryId: string;
};

function storyEntries(db: AppDatabase): RawLogEntry[] {
  return db.rawLog.filter((entry) => entry.kind === 'story');
}

/**
 * Every chapter that has begun, oldest first, with the entry to jump to.
 * Chapter 1 opens on the very first turn; later ones on their chapter card.
 */
export function chapterJumps(db: AppDatabase): ChapterJump[] {
  const story = storyEntries(db);
  const first = story.find((entry) => entry.role === 'user') ?? story[0];

  if (!first) return [];

  const jumps: ChapterJump[] = [];
  const firstTitle =
    first.chapter === db.state.chapter
      ? db.state.chapterTitle?.trim()
      : db.state.chapters?.find((item) => item.chapter === first.chapter)?.title?.trim();

  jumps.push({
    number: first.chapter,
    title: firstTitle || `Chapter ${first.chapter}`,
    line: dayLine(first.inStoryDate, true),
    entryId: first.id,
  });

  const markers = storyMarkers(db);

  for (const entry of story) {
    const chapter = markers.get(entry.id)?.chapter;
    if (chapter && !jumps.some((jump) => jump.number === chapter.number)) {
      jumps.push({ number: chapter.number, title: chapter.title, line: chapter.line, entryId: entry.id });
    }
  }

  return jumps;
}

/** How many story entries must be drawn (from the end) for `entryId` to be on screen. */
export function entriesToShow(db: AppDatabase, entryId: string): number | null {
  const story = storyEntries(db);
  const index = story.findIndex((entry) => entry.id === entryId);
  return index < 0 ? null : story.length - index;
}

export const LEFT_OFF_AFTER_MS = 24 * 60 * 60 * 1000;

export type LeftOff = {
  /** "3 days" */
  away: string;
  /** Title and text of the newest chapter summary, if one has landed. */
  chapter: { title: string | null; text: string } | null;
  withYou: string[];
  /** The open threads that matter most, at most three. */
  threads: string[];
  place: string;
};

function awayText(ms: number) {
  const days = Math.floor(ms / LEFT_OFF_AFTER_MS);
  if (days < 7) return days === 1 ? 'a day' : `${days} days`;
  const weeks = Math.floor(days / 7);
  if (days < 60) return weeks === 1 ? 'a week' : `${weeks} weeks`;
  const months = Math.floor(days / 30);
  return `${months} months`;
}

/**
 * A short reminder when you open a story you last played a real day or more
 * ago. Null for a story not yet begun, or played within the day.
 */
export function whereYouLeftOff(db: AppDatabase, now = Date.now()): LeftOff | null {
  const story = storyEntries(db);
  const last = story[story.length - 1];

  if (!last || now - last.createdAt < LEFT_OFF_AFTER_MS) return null;

  const latest = db.summaries
    .filter((summary) => summary.level === 'chapter')
    .sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0) || a.createdAt - b.createdAt)
    .pop();

  const threads = db.threads
    .filter((thread) => thread.status === 'open' && !hiddenGrudge(db, thread))
    .reverse() // newest first among equals
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 3)
    .map((thread) => localizePlaceNames(scrubNameLeaks(db, thread.title).text));

  return {
    away: awayText(now - last.createdAt),
    chapter: latest
      ? {
          title: latest.title ? scrubNameLeaks(db, latest.title).text : null,
          text: localizePlaceNames(scrubNameLeaks(db, latest.text).text),
        }
      : null,
    withYou: companionsOf(db).map((entity) => displayName(db, entity)),
    threads,
    place: localizePlaceNames(db.state.location),
  };
}
