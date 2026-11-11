// The scrapbook (living-world Stage 4, section 15).
//
// Every scene image you asked for, kept like photos of your life: sorted by
// era and chapter, each with a short caption, its in-story date, where you
// were and how old you were. Nothing is stored twice: it is read from the
// story log (rawLog[].image and imageMeta), the chapters and your road.

import { calculateAge, dateSortValue } from './calendar';
import { CANON_ERA_ORDER, CANON_MILESTONES, eraTitle } from './canonData';
import { localizePlaceNames } from './glossary';
import { FLASHBACK_BY_ID } from './flashbackData';
import type { AppDatabase, CalendarDate, RawLogEntry } from './types';
import { firstSentences, secondPerson } from './util';

export type ScrapbookPhoto = {
  logId: string;
  image: string;
  date: CalendarDate;
  chapter: number;
  caption: string;
  place: string | null;
  age: number;
  /** A photo from a flashback: shown under its own past date and its memory's title. */
  memory?: string;
};

/** Flashback photos sit in an era of their own, before the story. */
export const MEMORY_ERA = 'Before the story';

export type ScrapbookChapter = {
  chapter: number;
  title: string | null;
  photos: ScrapbookPhoto[];
  /** A flashback, not a chapter: shown by its title. */
  memory?: boolean;
};
export type ScrapbookEra = { era: string; chapters: ScrapbookChapter[]; count: number };

function dateValue(date: { year: number; month: number; day?: number }) {
  return (date.year * 12 + date.month) * 32 + (date.day ?? 1);
}

// World events only: personal beats have wide windows and would blur the line.
const ERA_STARTS = CANON_MILESTONES.filter((milestone) => !milestone.playerDriven)
  .map((milestone) => ({ era: milestone.era, at: dateValue(milestone.from) }))
  .sort((a, b) => a.at - b.at);

/** The era a date falls in: the era of the last world event that had begun by then. */
export function eraOfDate(date: CalendarDate): string {
  const at = dateValue(date);
  let era = CANON_ERA_ORDER[0];
  let rank = 0;

  for (const start of ERA_STARTS) {
    if (start.at > at) break;

    // Eras only move forward, so a late-listed early-era event can't pull it back.
    const startRank = CANON_ERA_ORDER.indexOf(start.era);

    if (startRank >= rank) {
      era = start.era;
      rank = startRank;
    }
  }

  return eraTitle(era);
}

const CAPTION_LENGTH = 150;

/**
 * A photo's caption: the one written for it in your words when the image was
 * made, else the reply's opening sentence (the narrator already says "you").
 * The third-person action line is never used: rewriting it word by word
 * leaves slips like "You kneel and sets down" or "You draw his blade".
 */
export function captionOf(entry: Pick<RawLogEntry, 'content' | 'imageMeta'>): string {
  const written = entry.imageMeta?.caption?.trim();

  if (written) return firstSentences(written, 1, CAPTION_LENGTH);

  const opening = firstSentences(entry.content.replace(/\*+/g, '').replace(/\s+/g, ' ').trim(), 1, CAPTION_LENGTH);

  // Only a reply that names Kan needs the swap; the narrator normally writes "you".
  return secondPerson(opening);
}

/** Where you were at a moment, from your road. */
export function placeAt(db: AppDatabase, date: CalendarDate): string | null {
  const when = dateSortValue(date);
  let place: string | null = null;

  for (const stop of db.state.travelLog ?? []) {
    if (dateSortValue(stop.date) > when) break;
    place = stop.place;
  }

  return place ? localizePlaceNames(place) : null;
}

export function scrapbookPhotos(db: AppDatabase): ScrapbookPhoto[] {
  const player = db.state.player;

  return db.rawLog
    .filter((entry) => entry.role === 'assistant' && typeof entry.image === 'string' && entry.image.length > 0)
    .map((entry) => {
      // A flashback photo keeps the memory's own date, place and Kan's age then.
      const memory = entry.flashback ? FLASHBACK_BY_ID[entry.flashback.id] : undefined;
      const date = entry.flashback?.date ?? entry.inStoryDate;

      return {
        logId: entry.id,
        image: entry.image as string,
        date,
        chapter: memory ? -memory.number : entry.chapter,
        caption: captionOf(entry),
        place: memory ? localizePlaceNames(memory.place) : placeAt(db, entry.inStoryDate),
        age: calculateAge(date, player.birthday, player.birthYear),
        ...(memory ? { memory: memory.title } : {}),
      };
    })
    .sort((a, b) => dateSortValue(a.date) - dateSortValue(b.date));
}

function chapterTitle(db: AppDatabase, chapter: number): string | null {
  const done = db.state.chapters?.find((item) => item.chapter === chapter);

  if (done?.title) return done.title;
  if (chapter === db.state.chapter) return db.state.chapterTitle ?? null;

  return null;
}

/** The scrapbook: eras in story order, chapters inside them, photos oldest first. */
export function scrapbook(db: AppDatabase): ScrapbookEra[] {
  const eras: ScrapbookEra[] = [];

  for (const photo of scrapbookPhotos(db)) {
    const era = photo.memory ? MEMORY_ERA : eraOfDate(photo.date);
    let group = eras[eras.length - 1];

    if (!group || group.era !== era) {
      group = { era, chapters: [], count: 0 };
      eras.push(group);
    }

    let chapter = group.chapters[group.chapters.length - 1];

    if (!chapter || chapter.chapter !== photo.chapter) {
      chapter = photo.memory
        ? { chapter: photo.chapter, title: photo.memory, photos: [], memory: true }
        : { chapter: photo.chapter, title: chapterTitle(db, photo.chapter), photos: [] };
      group.chapters.push(chapter);
    }

    chapter.photos.push(photo);
    group.count += 1;
  }

  return eras;
}
