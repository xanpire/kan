// Section 11 of claude/before-variety-ideas.md: the canon lore library at
// work. Each turn the narrator gets up to five canon entries (loreData.ts)
// on top of the four for Kan's own story: those the recent text calls up,
// then one about each person in the scene. Nothing is sent before it is true,
// each says who knows it and what most believe instead, and Kan learns one
// only when the tracker sees him told it, reading it or seeing it. The
// Journal's "What you know" lists only what he learned in the story.

import { formatDayMonth } from './calendar';
import { isDeceased } from './deaths';
import { resolveEntity } from './entities';
import { CANON_LORE, LORE_GROUPS, type CanonLore } from './loreData';
import { displayName } from './names';
import type { AppDatabase, CalendarDate, LoreLearned, RawLogEntry, TurnDiff } from './types';

/** Canon entries a turn gets, at most. */
export const CANON_LORE_LIMIT = 5;

const BY_ID = new Map(CANON_LORE.map((entry) => [entry.id, entry]));

export function canonLoreById(id: string | undefined): CanonLore | undefined {
  return id ? BY_ID.get(id) : undefined;
}

// ---------------------------------------------------------------------------
// When it is true, and who knows it

function happened(db: AppDatabase, id: string) {
  return Boolean(db.state.canonProgress?.completed?.includes(id));
}

/** True now: its `from` has happened and its `until` hasn't. */
export function loreTrue(db: AppDatabase, entry: CanonLore) {
  if (entry.from && !happened(db, entry.from)) return false;
  if (entry.until && happened(db, entry.until)) return false;
  return true;
}

/** Who knows the truth now, and who believes the other version (group keys and names). */
export function knowersOf(db: AppDatabase, entry: CanonLore) {
  const known = [...entry.known];
  const held = [...(entry.belief?.heldBy ?? [])];

  for (const step of entry.widens ?? []) {
    if (!happened(db, step.at)) continue;
    known.push(...(step.known ?? []));
    held.push(...(step.held ?? []));
  }

  const knowSet = new Set(known);
  // Someone who knows the truth no longer holds the belief.
  return { known: [...knowSet], held: [...new Set(held)].filter((who) => !knowSet.has(who)) };
}

function deadNames(db: AppDatabase) {
  return new Set(db.entities.filter(isDeceased).map((entity) => entity.name));
}

/** Knowers in the narrator's words, the dead left out. */
function describeKnowers(db: AppDatabase, list: string[]) {
  const dead = deadNames(db);
  return list
    .filter((who) => !dead.has(who))
    .map((who) => LORE_GROUPS[who] ?? who)
    .join(', ');
}

// ---------------------------------------------------------------------------
// What Kan knows

export function loreKnownOf(db: AppDatabase): Record<string, LoreLearned> {
  return db.state.loreKnown ?? {};
}

/** The version Kan holds now: what he learned in the story, else what he knew at the start. */
export function kanVersion(db: AppDatabase, entry: CanonLore): 'truth' | 'belief' | null {
  const learned = loreKnownOf(db)[entry.id];
  if (learned) return learned.version === 'belief' && !entry.belief ? 'truth' : learned.version;
  if (entry.kan === 'knows') return 'truth';
  if (entry.kan === 'belief') return entry.belief ? 'belief' : 'truth';
  return null;
}

/** Whether there is still something for Kan to learn here. */
export function kanCanLearn(db: AppDatabase, entry: CanonLore) {
  return kanVersion(db, entry) !== 'truth';
}

// ---------------------------------------------------------------------------
// Choosing the turn's entries

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PATTERNS = new Map<string, RegExp>(
  CANON_LORE.map((entry) => [
    entry.id,
    new RegExp(
      entry.keywords
        .map((word) => `(?<![\\p{L}])${escape(word.trim()).replace(/[’']/g, '[’\']').replace(/\s+/g, '\\s+')}(?:e?s)?(?![\\p{L}])`)
        .join('|'),
      'giu'
    ),
  ])
);

/** How many times the text calls the entry up. */
export function loreHits(text: string, entry: CanonLore) {
  const pattern = PATTERNS.get(entry.id);
  if (!pattern || !text) return 0;
  pattern.lastIndex = 0;
  return text.match(pattern)?.length ?? 0;
}

/**
 * The entries for this turn: the ones the recent text calls up most (an
 * entry Kan could still learn first among equals), then one about each person
 * in the scene. Only what is true now.
 */
export function selectCanonLore(
  db: AppDatabase,
  options: { recentText: string; presentNames: string[]; limit?: number }
): CanonLore[] {
  const limit = options.limit ?? CANON_LORE_LIMIT;
  const live = CANON_LORE.filter((entry) => loreTrue(db, entry));
  const chosen: CanonLore[] = [];

  live
    .map((entry) => ({ entry, hits: loreHits(options.recentText, entry) }))
    .filter((item) => item.hits > 0)
    .sort(
      (a, b) =>
        (b.entry.priority ?? 1) + Math.min(b.hits, 3) - ((a.entry.priority ?? 1) + Math.min(a.hits, 3)) ||
        Number(kanCanLearn(db, b.entry)) - Number(kanCanLearn(db, a.entry))
    )
    .slice(0, limit)
    .forEach((item) => chosen.push(item.entry));

  for (const person of options.presentNames) {
    if (chosen.length >= limit) break;
    const about = live
      .filter((entry) => !chosen.includes(entry) && entry.people?.includes(person))
      // The entry most about them: they come first in it, and it is about few people.
      .sort(
        (a, b) =>
          a.people!.indexOf(person) - b.people!.indexOf(person) ||
          a.people!.length - b.people!.length ||
          (b.priority ?? 1) - (a.priority ?? 1)
      )[0];
    if (about) chosen.push(about);
  }

  return chosen;
}

function kanLine(db: AppDatabase, entry: CanonLore) {
  const version = kanVersion(db, entry);
  if (version === 'truth') return 'Kan knows this.';
  if (version === 'belief') return 'Kan believes what most believe; he learns the truth only from someone who knows it, or by seeing it.';
  return 'Kan does not know this: he learns it only if someone who knows tells him, he reads it, or he sees it.';
}

export function formatCanonLoreEntry(db: AppDatabase, entry: CanonLore) {
  const { known, held } = knowersOf(db, entry);
  const knowers = describeKnowers(db, known) || 'no one living';

  if (!entry.belief) {
    return `- ${entry.title} [${entry.id}]: ${entry.text} Known to: ${knowers}. ${kanLine(db, entry)}`;
  }

  return `- ${entry.title} [${entry.id}]: THE TRUTH (known to ${knowers}): ${entry.text} WHAT OTHERS BELIEVE (${describeKnowers(db, held) || 'no one now'}): ${entry.belief.text} ${kanLine(db, entry)}`;
}

export function formatCanonLore(db: AppDatabase, entries: CanonLore[]) {
  if (entries.length === 0) return '';
  return [
    'CANON LORE (for you only: never recite it; a person says only what they could know and keeps to the version they believe; ordinary people get the details wrong)',
    ...entries.map((entry) => formatCanonLoreEntry(db, entry)),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// The tracker: what Kan learned this turn

/**
 * The entries the tracker may mark learned for this reply: those the narrator
 * was sent on it, and those the turn's own words call up, that Kan could
 * still learn and are true now.
 */
export function loreTrackingCandidates(db: AppDatabase, reply: Pick<RawLogEntry, 'loreSent'> | undefined, text: string): CanonLore[] {
  const sent = (reply?.loreSent ?? []).map((id) => BY_ID.get(id)).filter((entry): entry is CanonLore => Boolean(entry));
  const named = CANON_LORE.filter((entry) => loreHits(text, entry) > 0);
  return [...new Set([...sent, ...named])]
    .filter((entry) => loreTrue(db, entry) && kanCanLearn(db, entry))
    .slice(0, 8);
}

function clip(text: string, length = 200) {
  return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
}

export function formatLoreTracking(candidates: CanonLore[]) {
  if (candidates.length === 0) return '';
  return [
    'LORE YOU (KAN) COULD LEARN (lore_learned uses these ids only)',
    ...candidates.map((entry) =>
      entry.belief
        ? `- ${entry.id}: ${entry.title}. truth: ${clip(entry.text)} | belief: ${clip(entry.belief.text, 140)}`
        : `- ${entry.id}: ${entry.title}. ${clip(entry.text)}`
    ),
  ].join('\n');
}

export const LORE_TRACKING_RULE =
  'LORE: lore_learned: {id, version, from, how} only when THIS turn you (Kan) are told one of the entries under LORE YOU (KAN) COULD LEARN, read it (a letter, a book, a report) or see it with your own eyes, in enough of its substance to know it; a hint, a rumour you shrug off, or something said out of your hearing never counts. version: truth, or belief when what you were told is the version most believe. from: the id of who told you, or null for reading or seeing. how: told, read or seen. Otherwise [].';

type Learned = NonNullable<TurnDiff['loreLearned']>[number];

/**
 * Marks what Kan learned this turn: only the ids offered to the tracker, the
 * truth always over a belief, never a belief over the truth.
 */
export function applyLoreLearned(
  db: AppDatabase,
  learned: TurnDiff['loreLearned'],
  offered: CanonLore[],
  date: CalendarDate = db.state.inStoryDate
): AppDatabase {
  if (!learned?.length) return db;
  const offeredIds = new Set(offered.map((entry) => entry.id));
  const known = { ...loreKnownOf(db) };
  let changed = false;

  for (const item of learned as Learned[]) {
    const entry = BY_ID.get(item.id);
    if (!entry || !offeredIds.has(entry.id)) continue;
    const version = item.version === 'belief' && entry.belief ? 'belief' : 'truth';
    const current = kanVersion(db, entry);
    if (current === 'truth' || (current === 'belief' && version === 'belief')) continue;

    const teller = item.from ? resolveEntity(db, item.from) ?? db.entities.find((entity) => entity.id === item.from) : null;
    known[entry.id] = {
      version,
      how: item.how,
      ...(teller && teller.name !== 'Kan' ? { from: displayName(db, teller), fromId: teller.id } : {}),
      date: { ...date },
    };
    changed = true;
  }

  return changed ? { ...db, state: { ...db.state, loreKnown: known } } : db;
}

/** Keeps only entries the library still has (an old or edited save). */
export function normalizeLoreKnown(value: unknown): Record<string, LoreLearned> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const out: Record<string, LoreLearned> = {};
  for (const [id, item] of Object.entries(value as Record<string, LoreLearned>)) {
    if (!BY_ID.has(id) || !item || typeof item !== 'object' || !item.date) continue;
    out[id] = {
      version: item.version === 'belief' ? 'belief' : 'truth',
      how: item.how === 'read' || item.how === 'seen' ? item.how : 'told',
      ...(typeof item.from === 'string' ? { from: item.from } : {}),
      ...(typeof item.fromId === 'string' ? { fromId: item.fromId } : {}),
      date: item.date,
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// The Journal: "What you know"

export type KnownLoreRow = { id: string; title: string; body: string; meta: string; date: CalendarDate };

const HOW: Record<LoreLearned['how'], string> = { told: 'Told', read: 'Read', seen: 'Seen with your own eyes' };

/**
 * What Kan learned in the story, newest first: each as the version he holds
 * (a belief reads as the belief until he learns the truth). What he knew
 * before the story began is not listed.
 */
export function whatYouKnow(db: AppDatabase): KnownLoreRow[] {
  return Object.entries(loreKnownOf(db))
    .map(([id, learned]) => {
      const entry = BY_ID.get(id);
      if (!entry) return null;
      const belief = learned.version === 'belief' && entry.belief;
      const body = belief ? entry.belief!.journal ?? entry.belief!.text : entry.journal ?? entry.text;
      const who = learned.how === 'told' && learned.from ? `${learned.from} told you` : HOW[learned.how];
      return {
        id,
        title: entry.title,
        body,
        meta: `${who} · ${formatDayMonth(learned.date)}, Year ${learned.date.year}`,
        date: learned.date,
      };
    })
    .filter((row): row is KnownLoreRow => Boolean(row))
    .sort((a, b) => b.date.year - a.date.year || b.date.month - a.date.month || b.date.day - a.date.day);
}
