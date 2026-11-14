// What the Journal shows (audit 11a): one Story timeline grouped by real
// chapter, and the Now view's "your condition". Pure, so it can be tested.
// No engine words ("Arc", "Year" levels) reach the player here.

import { dateSortValue, daysBetween, formatDayMonth } from './calendar';
import { localizePlaceNames } from './glossary';
import { displayName, scrubNameLeaks } from './names';
import { grudgeKnown } from './disclosure';
import type { AppDatabase, CalendarDate, EventRecord, FactRecord, ThreadRecord } from './types';
import { secondPerson, titleAndBody } from './util';

/** A memory's title and description: its own title, else one cut from its text. */
export function memoryTitle(event: EventRecord): { title: string; body: string | null } {
  if (event.title?.trim()) {
    return { title: event.title.trim(), body: event.summary.trim() || null };
  }

  return titleAndBody(event.summary);
}

export type TimelineEntry = {
  id: string;
  kind: 'memory' | 'flashback' | 'news';
  date: CalendarDate;
  title: string;
  body: string | null;
  /** "18 Oct · with Itachi" or "17 Oct · word from Itachi". */
  meta: string;
};

export type TimelineChapter = {
  chapter: number;
  title: string;
  from: CalendarDate | null;
  /** Null for the chapter you are in. */
  to: CalendarDate | null;
  current: boolean;
  entries: TimelineEntry[];
};

function peopleIn(db: AppDatabase, eventId: string) {
  const ids = new Set(db.eventEntities.filter((link) => link.eventId === eventId).map((link) => link.entityId));

  return db.entities
    .filter((entity) => ids.has(entity.id) && entity.type === 'character' && entity.name.toLowerCase() !== 'kan')
    .slice(0, 2)
    .map((entity) => displayName(db, entity));
}

function within(date: CalendarDate, from: CalendarDate | null, to: CalendarDate | null) {
  const value = dateSortValue(date);
  return (!from || value >= dateSortValue(from)) && (!to || value <= dateSortValue(to));
}

/** "16 Oct to now", "9 to 15 Oct", "9 Oct to 2 Nov". */
export function chapterDates(chapter: Pick<TimelineChapter, 'from' | 'to'>) {
  if (!chapter.from) return chapter.to ? `until ${formatDayMonth(chapter.to)}` : '';
  const from = formatDayMonth(chapter.from);
  if (!chapter.to) return `${from} to now`;
  const to = formatDayMonth(chapter.to);
  if (from === to) return from;
  const [fromDay, fromMonth] = from.split(' ');
  const [toDay, toMonth] = to.split(' ');
  return fromMonth === toMonth && chapter.from.year === chapter.to.year ? `${fromDay} to ${toDay} ${toMonth}` : `${from} to ${to}`;
}

/**
 * The whole story as Kan lived it, newest chapter first: each chapter's
 * memories (flashbacks in the chapter they were played in) and the news that
 * reached him while it ran, newest first.
 */
export function storyTimeline(db: AppDatabase): TimelineChapter[] {
  const closed = db.state.chapters ?? [];
  const chapters = new Map<number, TimelineChapter>();

  for (const record of closed) {
    chapters.set(record.chapter, {
      chapter: record.chapter,
      title: record.title,
      from: record.from,
      to: record.to,
      current: false,
      entries: [],
    });
  }

  const now = db.state.chapter;
  chapters.set(now, {
    chapter: now,
    title: db.state.chapterTitle?.trim() || `Chapter ${now}`,
    from: db.state.chapterStart?.date ?? null,
    to: null,
    current: true,
    entries: [],
  });

  const memories = db.events.filter((event) => !event.tags.includes('canon'));

  for (const event of memories) {
    const number = Math.min(event.chapter ?? now, now);
    let chapter = chapters.get(number);

    // An older save made chapters before they were recorded: name them by number.
    if (!chapter) {
      chapter = { chapter: number, title: `Chapter ${number}`, from: null, to: null, current: false, entries: [] };
      chapters.set(number, chapter);
    }

    const flashback = event.tags.includes('flashback');
    const { title, body } = memoryTitle(event);
    const people = peopleIn(db, event.id);

    chapter.entries.push({
      id: event.id,
      kind: flashback ? 'flashback' : 'memory',
      date: event.inStoryDate,
      title: scrubNameLeaks(db, title).text,
      body: body ? scrubNameLeaks(db, body).text : null,
      meta: flashback
        ? `Remembered · ${formatDayMonth(event.inStoryDate)}, year ${event.inStoryDate.year}`
        : [formatDayMonth(event.inStoryDate), people.length ? `with ${people.join(', ')}` : null].filter(Boolean).join(' · '),
    });
  }

  // Undated old chapters take their dates from their memories.
  for (const chapter of chapters.values()) {
    if (chapter.from || chapter.current) continue;
    const dated = chapter.entries.filter((entry) => entry.kind === 'memory').map((entry) => entry.date);
    if (dated.length === 0) continue;
    const sorted = [...dated].sort((a, b) => dateSortValue(a) - dateSortValue(b));
    chapter.from = sorted[0];
    chapter.to = chapter.to ?? sorted[sorted.length - 1];
  }

  // News, in the chapter during which it reached Kan.
  const heard = db.state.canonProgress?.heard ?? {};
  const today = dateSortValue(db.state.inStoryDate);
  const ordered = [...chapters.values()].sort((a, b) => a.chapter - b.chapter);

  for (const event of db.events) {
    const word = heard[event.id];
    if (!event.tags.includes('canon') || !word || dateSortValue(event.inStoryDate) > today) continue;

    const when = word.date ?? event.inStoryDate;
    const chapter = ordered.find((item) => !item.current && within(when, item.from, item.to)) ?? chapters.get(now)!;
    const { title, body } = titleAndBody(event.summary);
    const source = word.from === 'witnessed' ? 'you saw it' : word.from ? `word from ${word.from}` : 'word reached you';

    chapter.entries.push({
      id: event.id,
      kind: 'news',
      date: when,
      title: localizePlaceNames(scrubNameLeaks(db, title).text),
      body: body ? localizePlaceNames(scrubNameLeaks(db, body).text) : null,
      meta: `${formatDayMonth(when)} · ${source}`,
    });
  }

  for (const chapter of chapters.values()) {
    chapter.entries.sort((a, b) => dateSortValue(b.date) - dateSortValue(a.date));
  }

  return [...chapters.values()]
    .filter((chapter) => chapter.current || chapter.entries.length > 0 || closed.some((item) => item.chapter === chapter.chapter))
    .sort((a, b) => b.chapter - a.chapter);
}

export type KanCondition = { id: string; text: string; lasts: string | null };

function aboutKan(db: AppDatabase, fact: FactRecord) {
  if (!fact.subjectEntityId) return true;
  return db.entities.find((entity) => entity.id === fact.subjectEntityId)?.name.toLowerCase() === 'kan';
}

/** Kan's wounds and passing conditions, as the player may see them (audit 10). */
/**
 * A passing state that should have ended (audit 7.1): an "until you rest"
 * one more than two days old, or a condition with no length more than
 * three. Injuries keep their own length.
 */
function staleCondition(fact: AppDatabase['facts'][number], today: AppDatabase['state']['inStoryDate']) {
  if (fact.type !== 'condition' || fact.expiresAt) return false;
  const age = daysBetween(fact.validFrom, today);
  return fact.untilRest ? age > 2 : age > 3;
}

export function kanConditions(db: AppDatabase): KanCondition[] {
  const today = db.state.inStoryDate;

  return db.facts
    .filter(
      (fact) =>
        fact.validTo === null &&
        (fact.type === 'injury' || fact.type === 'condition') &&
        aboutKan(db, fact) &&
        (!fact.expiresAt || dateSortValue(fact.expiresAt) >= dateSortValue(today)) &&
        !staleCondition(fact, today)
    )
    .slice(-8)
    .reverse()
    .map((fact) => {
      const days = fact.expiresAt ? Math.max(0, Math.ceil(daysBetween(today, fact.expiresAt))) : null;
      const lasts = fact.untilRest
        ? 'Until you rest'
        : days === null
          ? null
          : days <= 1
            ? 'About a day'
            : `About ${days} days`;
      const text = secondPerson(fact.text.trim());

      return { id: fact.id, text: `${text.charAt(0).toUpperCase()}${text.slice(1)}`, lasts };
    });
}

/** A grudge stays off the page until they have acted on it. */
export function hiddenGrudge(db: AppDatabase, thread: ThreadRecord) {
  if (thread.type !== 'grudge') return false;

  const ids = new Set(thread.participantIds ?? []);
  const bond = db.bonds.find(
    (item) => item.grudge && (ids.has(item.entityId) || thread.participants?.includes(item.characterName))
  );

  return !bond || !grudgeKnown(bond.grudge);
}
