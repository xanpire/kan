// What Kan himself knows of someone (test run §10, Xan's idea of 23 Nov
// 2026). The narrator keeps the canon seed, so characters stay in
// character; the bonds profile shows only Kan's own layer: what he saw at
// first sight, what he has been told or seen of their role, what he noticed
// about them, what he suspects, how they speak, and what others told him.
// A stranger starts blank; it fills in as the story goes.

import { speakerKin } from './kinGuard';
import { shownField } from './disclosure';
import { fameOf, kanKnowsName } from './names';
import { PRIOR_BONDS } from './priorBonds';
import { makeId } from './id';
import { secondPerson } from './util';
import type { AppDatabase, EntityRecord, KanViewEntry, TurnDiff } from './types';

/** The people of Kan's life before the story (seed.ts and priorBonds.ts): their profiles start full. */
const SEEDED_BEFORE = ['Itachi Uchiha', 'Hana Inuzuka', 'Izumi Uchiha', 'Hazuki Uchiha', 'Suzume', 'Shisui Uchiha', 'Fugaku Uchiha', 'Mikoto Uchiha'];

export function knewBefore(entity: Pick<EntityRecord, 'name'>): boolean {
  return SEEDED_BEFORE.includes(entity.name) || Object.prototype.hasOwnProperty.call(PRIOR_BONDS, entity.name);
}

export type ProfileBasis = 'known' | 'public' | 'stranger';

/** Where a profile starts: someone Kan knew, someone famous he has heard of, or a stranger. */
export function profileBasis(db: AppDatabase, entity: EntityRecord): ProfileBasis {
  if (knewBefore(entity)) return 'known';
  if (fameOf(db, entity) !== 'unknown') return 'public';
  return 'stranger';
}

/** The tracker's handle for one line ("v-3k9x2"). */
export function viewRef(entry: Pick<KanViewEntry, 'id'>) {
  return `v-${entry.id.slice(-5)}`;
}

const MAX_PER_PERSON_PER_TURN = 2;
/** Noticed lines before the background job folds them into one or two. */
export const CONDENSE_AFTER = 8;

const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'on', 'is', 'was', 'that', 'this', 'with', 'for', 'his', 'her', 'their', 'they', 'them', 'you', 'your', 'he', 'she', 'it', 'at', 'as', 'be', 'has', 'had', 'when', 'never', 'always']);

function words(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP.has(word))
  );
}

/** Says the same thing as a line already there. */
function repeats(entries: KanViewEntry[], field: KanViewEntry['field'], text: string) {
  const next = words(text);
  if (next.size === 0) return true;
  return entries.some((entry) => {
    if (entry.field !== field && !(field === 'noticed' && entry.field === 'suspect')) return false;
    const old = words(entry.text);
    const shared = [...next].filter((word) => old.has(word)).length;
    return shared / Math.min(old.size || 1, next.size) >= 0.6;
  });
}

/** A line as the profile shows it: second person, one sentence or two, no name Kan doesn't know. */
function cleanLine(db: AppDatabase, entity: EntityRecord, text: string) {
  let line = secondPerson(text.trim()).replace(/\s+/g, ' ');
  // Kan doesn't know their name yet: it never shows (names.ts).
  if (!kanKnowsName(entity)) {
    for (const name of [entity.name, ...entity.aliases].filter((n) => n.length > 2)) {
      line = line.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:['’]s)?\\b`, 'gi'), 'they');
    }
  }
  if (line.length > 160) {
    const cut = line.slice(0, 160);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
    line = end > 60 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
  }
  line = line.charAt(0).toUpperCase() + line.slice(1);
  return /[.!?…]$/.test(line) ? line : `${line}.`;
}

/** The short place name for a line's "where" (the part before any detail). */
function placeNow(db: AppDatabase) {
  return (db.state.location ?? '').split(/[,;(]/)[0].trim().slice(0, 60) || undefined;
}

/**
 * Applies the turn's learned_about: at most two lines per person, never a
 * repeat, each stamped with where and when; a line can settle an earlier
 * guess or claim (confirmed, or proven wrong).
 */
export function applyLearnedAbout(db: AppDatabase, diff: TurnDiff): AppDatabase {
  const items = diff.learnedAbout ?? [];
  if (items.length === 0) return db;

  const counts = new Map<string, number>();
  let entities = db.entities;

  for (const item of items) {
    const entity = entities.find((candidate) => candidate.id === item.entityId);
    if (!entity || entity.type !== 'character' || entity.name.toLowerCase() === 'kan') continue;
    const count = counts.get(entity.id) ?? 0;
    if (count >= MAX_PER_PERSON_PER_TURN) continue;

    let view = [...(entity.kanView ?? [])];

    // Settling an earlier line.
    if (item.settles) {
      const ref = item.settles.trim().toLowerCase();
      const index = view.findIndex((entry) => viewRef(entry) === ref || entry.id === item.settles);
      if (index !== -1 && (item.verdict || item.field === 'noticed')) {
        view[index] = { ...view[index], verdict: item.verdict ?? 'confirmed' };
      }
    }

    // Their "Father" and "our home" are theirs, never Kan's (third test).
    const own = speakerKin(db, cleanLine(db, entity, item.text), item.toldBy ?? entity.id);
    if (!own) continue;
    const text = own;
    const field = item.field;
    const live = view.filter((entry) => !entry.folded && entry.verdict !== 'wrong');

    // A role replaces the old one; anything else never repeats.
    if (field === 'role' ? !live.some((entry) => entry.field === 'role' && entry.text === text) : !repeats(live, field, text)) {
      const source = field === 'suspect' ? 'guess' : item.source;
      view.push({
        id: makeId('view'),
        field,
        text,
        source,
        ...(item.toldBy && (field === 'heard' || source === 'told' || source === 'rumour') ? { toldBy: item.toldBy } : {}),
        ...(placeNow(db) ? { place: placeNow(db) } : {}),
        date: db.state.inStoryDate,
      });
      counts.set(entity.id, count + 1);
    } else if (!item.settles) {
      continue;
    }

    view = view.slice(-60);
    entities = entities.map((candidate) => (candidate.id === entity.id ? { ...candidate, kanView: view } : candidate));
  }

  return entities === db.entities ? db : { ...db, entities };
}

export type ProfileLine = KanViewEntry & { crossed?: boolean };

export type KanProfile = {
  basis: ProfileBasis;
  role?: string;
  roleEntry?: KanViewEntry;
  appearance?: string;
  /** Only for people Kan knew before the story: what he knows of who they are. */
  personality?: string;
  speech?: string;
  speechEntry?: KanViewEntry;
  noticed: ProfileLine[];
  suspect: ProfileLine[];
  heard: ProfileLine[];
};

/** Someone's profile as Kan can know it. */
export function kanProfile(db: AppDatabase, entity: EntityRecord): KanProfile {
  const basis = profileBasis(db, entity);
  const view = (entity.kanView ?? []).filter((entry) => !entry.folded);
  const latest = (field: KanViewEntry['field']) => [...view].reverse().find((entry) => entry.field === field && entry.verdict !== 'wrong');
  const roleEntry = latest('role');
  const speechEntry = latest('speech');
  const met = entity.met !== false;

  const role =
    roleEntry?.text.replace(/\.$/, '') ??
    (basis === 'stranger' ? undefined : shownField(db, entity, 'role'));

  return {
    basis,
    ...(role ? { role } : {}),
    ...(roleEntry ? { roleEntry } : {}),
    // What he saw: fair from the first meeting, never before it.
    ...(met ? { appearance: shownField(db, entity, 'appearance') } : {}),
    ...(basis === 'known' ? { personality: shownField(db, entity, 'personality') } : {}),
    ...(speechEntry
      ? { speech: speechEntry.text.replace(/\.$/, ''), speechEntry }
      : basis === 'known'
        ? { speech: shownField(db, entity, 'speechStyle') }
        : {}),
    noticed: view
      .filter((entry) => entry.field === 'noticed' || (entry.field === 'suspect' && entry.verdict === 'confirmed'))
      .map((entry) => ({ ...entry })),
    suspect: view
      .filter((entry) => entry.field === 'suspect' && entry.verdict !== 'confirmed')
      .map((entry) => ({ ...entry, crossed: entry.verdict === 'wrong' })),
    heard: view.filter((entry) => entry.field === 'heard').map((entry) => ({ ...entry, crossed: entry.verdict === 'wrong' })),
  };
}

/** "the conduit, Land of Rain · 2 Oct, year 13 · from Itachi": where a line came from, for the tap detail. */
export function entryOrigin(db: AppDatabase, entry: KanViewEntry, formatDay: (date: KanViewEntry['date']) => string): string {
  const teller = entry.toldBy ? db.entities.find((item) => item.id === entry.toldBy) : undefined;
  const from = entry.toldBy ? (teller ? (kanKnowsName(teller) ? teller.name.split(' ')[0] : 'someone') : entry.toldBy) : null;
  return [
    entry.place,
    `${formatDay(entry.date)}, year ${entry.date.year}`,
    from ? `from ${from}` : entry.source === 'rumour' ? 'a rumour' : null,
    entry.condensedFrom?.length ? `${entry.condensedFrom.length} things you noticed` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** For the tracker: what Kan already knows of a person, with refs, so it can settle and never repeat. */
export function formatKanViewForTracker(entity: EntityRecord): string {
  const view = (entity.kanView ?? []).filter((entry) => !entry.folded && entry.verdict !== 'wrong').slice(-6);
  if (view.length === 0) return '';
  return `; you know: ${view.map((entry) => `[${viewRef(entry)}] ${entry.field}: ${entry.text.replace(/\.$/, '')}`).join(' | ')}`;
}

/** People with more noticed lines than a profile can show: their next condense job. */
export function needsCondensing(entity: EntityRecord) {
  return (entity.kanView ?? []).filter((entry) => entry.field === 'noticed' && !entry.folded && !entry.condensedFrom).length > CONDENSE_AFTER;
}

/** The lines a condense job folds: every noticed line but the newest two. */
export function linesToCondense(entity: EntityRecord): KanViewEntry[] {
  const lines = (entity.kanView ?? []).filter((entry) => entry.field === 'noticed' && !entry.folded && !entry.condensedFrom);
  return lines.slice(0, Math.max(0, lines.length - 2));
}

/** Folds the condensed lines behind one or two new ones; the originals stay for the tap detail. */
export function applyCondensed(db: AppDatabase, entityId: string, folded: string[], lines: string[]): AppDatabase {
  const entity = db.entities.find((item) => item.id === entityId);
  if (!entity || lines.length === 0) return db;
  const ids = new Set(folded);
  const view = entity.kanView ?? [];
  const sources = view.filter((entry) => ids.has(entry.id) && !entry.folded);
  if (sources.length === 0) return db;

  const condensed: KanViewEntry[] = lines.slice(0, 2).map((text) => ({
    id: makeId('view'),
    field: 'noticed',
    text: cleanLine(db, entity, text),
    source: 'seen',
    date: sources[sources.length - 1].date,
    ...(sources[sources.length - 1].place ? { place: sources[sources.length - 1].place } : {}),
    condensedFrom: sources.map((entry) => entry.id),
  }));
  const next = view.map((entry) => (ids.has(entry.id) ? { ...entry, folded: true } : entry));
  // The condensed lines go where the oldest folded one stood.
  const at = next.findIndex((entry) => ids.has(entry.id));
  next.splice(at, 0, ...condensed);

  return { ...db, entities: db.entities.map((item) => (item.id === entityId ? { ...item, kanView: next } : item)) };
}

/**
 * Old saves (test run §10): people Kan met in the story get a view built
 * from what he knows of them — the facts he knows about them — plus their
 * appearance. People he knew before keep their full profile.
 */
export function migrateKanViews(db: AppDatabase): AppDatabase {
  const kanId = db.entities.find((entity) => entity.name.toLowerCase() === 'kan')?.id;
  let changed = false;

  const entities = db.entities.map((entity) => {
    if (entity.kanView || entity.type !== 'character' || entity.met === false || entity.id === kanId || knewBefore(entity)) return entity;
    const known = db.facts
      .filter(
        (fact) =>
          fact.subjectEntityId === entity.id &&
          fact.validTo === null &&
          (fact.whoKnows.includes(kanId ?? '') || fact.whoKnows.length === 0) &&
          fact.type !== 'secret' &&
          fact.type !== 'death' &&
          fact.type !== 'injury' &&
          fact.type !== 'condition'
      )
      .slice(-4);
    changed = true;
    return {
      ...entity,
      kanView: known.map(
        (fact): KanViewEntry => ({
          id: makeId('view'),
          field: fact.confidence === 'claimed' ? 'heard' : 'noticed',
          text: cleanLine(db, entity, fact.text),
          source: fact.confidence === 'claimed' ? 'told' : 'seen',
          ...(fact.claimedBy ? { toldBy: fact.claimedBy } : {}),
          date: fact.validFrom,
        })
      ),
    };
  });

  return changed ? { ...db, entities } : db;
}
