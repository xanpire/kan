// Section 9 of claude/before-variety-ideas.md: the built-in jutsu list at work.
// Each turn the narrator gets a few canon entries (jutsuData.ts): the jutsu
// named in the last few turns, and the signature jutsu of the people in the
// scene. Nothing is sent before it exists in canon, a person is listed as a
// user only once they have it, and a jutsu whose name Kan hasn't heard is
// described, not named. Kan's own records are linked to their entry, which
// gives his list their real cost (for fight options). Never shown in the UI.

import { dateSortValue } from './calendar';
import { milestoneOpensAt } from './canon';
import { CANON_MILESTONES } from './canonData';
import { isDeceased } from './deaths';
import { ALL_JUTSU, CANON_JUTSU, KAN_JUTSU, type CanonJutsu } from './jutsuData';
import type { AppDatabase, JutsuRecord } from './types';

/** How many canon entries a turn gets, at most. */
export const JUTSU_REFERENCE_LIMIT = 8;
const NAMED_LIMIT = 6;
const PER_PERSON = 2;

/** Where Kan, a Leaf ANBU raised Uchiha with Uzumaki blood, would know a `known` jutsu by name. */
const KAN_HOMES = new Set(['leaf', 'uchiha', 'uzumaki']);

const BY_ID = new Map(ALL_JUTSU.map((entry) => [entry.id, entry]));
const MILESTONES = new Map(CANON_MILESTONES.map((milestone) => [milestone.id, milestone]));

export function canonJutsuById(id: string | undefined): CanonJutsu | undefined {
  return id ? BY_ID.get(id) : undefined;
}

// ---------------------------------------------------------------------------
// When things exist

/** A milestone's window has opened (or it has already happened). */
function milestoneOpen(db: AppDatabase, id: string) {
  if (db.state.canonProgress?.completed?.includes(id)) return true;
  const milestone = MILESTONES.get(id);
  if (!milestone) return false;
  return dateSortValue(milestoneOpensAt(milestone)) <= dateSortValue(db.state.inStoryDate);
}

function milestoneDone(db: AppDatabase, id: string) {
  return Boolean(db.state.canonProgress?.completed?.includes(id));
}

/**
 * Whether the jutsu exists yet in this story: its own `firstExists` has
 * opened, and its first user has it (a jutsu every user only gains later,
 * like the Rasenshuriken or Kirin, doesn't exist before then). A jutsu
 * whose last user lost it (a sword taken, a beast drawn out) still exists.
 */
export function jutsuExists(db: AppDatabase, entry: CanonJutsu) {
  if (entry.firstExists && !milestoneOpen(db, entry.firstExists)) return false;
  return entry.users.length === 0 || entry.users.map(parseUser).some((user) => !user.from || milestoneOpen(db, user.from));
}

/** "Naruto Uzumaki>tsunade-hokage<kurama-mastered" into its parts. */
export function parseUser(user: string) {
  const match = user.match(/^([^<>]+?)(?:>([^<>]+?))?(?:<([^<>]+))?$/);
  return { name: (match?.[1] ?? user).trim(), from: match?.[2]?.trim(), until: match?.[3]?.trim() };
}

/** The people who have it now, by name: not before they gain it, not after they lose it, not the dead. */
export function currentUsers(db: AppDatabase, entry: CanonJutsu): string[] {
  const dead = new Set(db.entities.filter(isDeceased).map((entity) => entity.name));
  return entry.users
    .map(parseUser)
    .filter((user) => (!user.from || milestoneOpen(db, user.from)) && (!user.until || !milestoneDone(db, user.until)))
    .map((user) => user.name)
    .filter((name) => !dead.has(name));
}

// ---------------------------------------------------------------------------
// Names

/** A name reduced to what tells jutsu apart: "Fire Style: Great Fireball Technique" → "great fireball". */
export function simpleJutsuKey(name: string) {
  return name
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[’']/g, '')
    .replace(/^[\p{L}-]+\s+(?:style|release)\s*:\s*/u, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\b(?:the|jutsu|technique|no jutsu)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesOf(entry: CanonJutsu) {
  return [entry.name, ...(entry.aliases ?? []), ...(entry.japanese.includes('/') ? [] : [entry.japanese])];
}

const KEYS = new Map<string, Set<string>>(ALL_JUTSU.map((entry) => [entry.id, new Set(namesOf(entry).map(simpleJutsuKey).filter(Boolean))]));

/**
 * The canon entry a recorded jutsu is, or undefined. Kan's records look at his
 * own jutsu first ("Susanoo" on his list is his blood-red one); nobody else's
 * ever match his.
 */
export function matchCanonJutsu(name: string, forKan = false): CanonJutsu | undefined {
  const key = simpleJutsuKey(name);
  if (!key) return undefined;
  const pool = forKan ? [...KAN_JUTSU, ...CANON_JUTSU] : CANON_JUTSU;
  return pool.find((entry) => KEYS.get(entry.id)?.has(key));
}

function isKan(user: string) {
  return user.trim().toLowerCase() === 'kan';
}

/** The entry a jutsu record is linked to (or matches, for a record from before the list). */
export function canonJutsuOf(record: Pick<JutsuRecord, 'name' | 'user' | 'canonId'>): CanonJutsu | undefined {
  return canonJutsuById(record.canonId) ?? matchCanonJutsu(record.name, isKan(record.user));
}

/** Links every record to its entry where one matches (old saves). */
export function linkJutsuRecords(records: JutsuRecord[]): JutsuRecord[] {
  return records.map((record) => {
    if (record.canonId && BY_ID.has(record.canonId)) return record;
    const entry = matchCanonJutsu(record.name, isKan(record.user));
    return entry ? { ...record, canonId: entry.id } : record;
  });
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A name as a pattern: Style and Release interchangeable, a plural allowed, whole words only. */
function namePattern(name: string) {
  const body = escape(name.trim())
    .replace(/\\?\b(?:Style|Release)\b/gi, '(?:Style|Release)')
    .replace(/[’']/g, '[’\']')
    .replace(/\s+/g, '\\s+');
  return `(?<![\\p{L}])${body}(?:e?s)?(?![\\p{L}])`;
}

const PATTERNS = new Map<string, RegExp>(
  ALL_JUTSU.map((entry) => [
    entry.id,
    new RegExp(
      namesOf(entry)
        .filter((name) => name.replace(/[^\p{L}]/gu, '').length >= 4)
        .map(namePattern)
        .join('|'),
      'iu'
    ),
  ])
);

export function mentionsJutsu(text: string, entry: CanonJutsu) {
  return PATTERNS.get(entry.id)?.test(text) ?? false;
}

const STORY_TEXT = new WeakMap<object, string>();

function storyText(db: AppDatabase) {
  const cached = STORY_TEXT.get(db.rawLog);
  if (cached !== undefined) return cached;
  const text = db.rawLog.map((entry) => entry.content ?? '').join('\n');
  STORY_TEXT.set(db.rawLog, text);
  return text;
}

function kanHas(db: AppDatabase, entry: CanonJutsu) {
  return db.jutsuRecords.some((record) => isKan(record.user) && canonJutsuOf(record)?.id === entry.id);
}

/**
 * Whether Kan knows the jutsu's name: a famous or common one, one known by
 * name where he grew up, one of his own, or one whose name has been said in
 * the story.
 */
export function kanKnowsJutsuName(db: AppDatabase, entry: CanonJutsu, recentText = '') {
  if (entry.fame === 'common' || entry.fame === 'famous') return true;
  if (entry.fame === 'known' && entry.home && KAN_HOMES.has(entry.home)) return true;
  if (kanHas(db, entry)) return true;
  // Typed by the player this turn counts: the name is said aloud, and people react.
  return mentionsJutsu(recentText, entry) || mentionsJutsu(storyText(db), entry);
}

// ---------------------------------------------------------------------------
// Choosing the turn's entries

// A person's best-known jutsu first: S, their dōjutsu or sword, A; a forbidden last resort after those.
const RANK_WEIGHT: Record<string, number> = { S: 6, '—': 5, A: 4, Forbidden: 3.5, B: 3, C: 2, D: 1, E: 0 };

/**
 * The entries for this turn: the ones named in the recent text first, then
 * the strongest of each present person's (their signature jutsu come first
 * in `users`). Kan's own only once he has them.
 */
export function selectCanonJutsu(
  db: AppDatabase,
  options: { recentText: string; presentNames: string[]; limit?: number }
): CanonJutsu[] {
  const limit = options.limit ?? JUTSU_REFERENCE_LIMIT;
  const usable = (entry: CanonJutsu) => jutsuExists(db, entry) && (!entry.kan || kanHas(db, entry));
  const chosen: CanonJutsu[] = [];
  const add = (entry: CanonJutsu) => {
    if (chosen.length < limit && !chosen.includes(entry)) chosen.push(entry);
  };

  ALL_JUTSU.filter((entry) => usable(entry) && mentionsJutsu(options.recentText, entry))
    .slice(0, NAMED_LIMIT)
    .forEach(add);

  for (const person of options.presentNames) {
    if (isKan(person)) continue;
    CANON_JUTSU.filter((entry) => entry.fame !== 'common' && usable(entry))
      .map((entry) => ({ entry, index: currentUsers(db, entry).indexOf(person) }))
      .filter((item) => item.index !== -1)
      .sort((a, b) => a.index - b.index || (RANK_WEIGHT[b.entry.rank] ?? 0) - (RANK_WEIGHT[a.entry.rank] ?? 0))
      .slice(0, PER_PERSON)
      .forEach((item) => add(item.entry));
  }

  return chosen;
}

const LEARNED: Record<CanonJutsu['learned'], string> = {
  open: 'anyone with the nature and the skill can learn it',
  taught: 'only from someone who knows it, or a scroll',
  clan: 'a clan secret, taught inside the clan',
  'kekkei-genkai': 'needs the bloodline or the body; never learned by watching',
  unique: 'one person’s own; nobody else has it',
};

const HOME_NAME: Record<string, string> = {
  leaf: 'the Leaf', uchiha: 'the Uchiha clan', uzumaki: 'the Uzumaki', sand: 'the Sand', mist: 'the Mist',
  cloud: 'the Cloud', stone: 'the Stone', rain: 'the Rain', waterfall: 'the Waterfall', iron: 'the Land of Iron',
  root: 'Root', toads: 'Mount Myōboku', jashin: 'Jashin’s followers', 'medical-nin': 'medical-nin',
};

function fameWord(entry: CanonJutsu) {
  switch (entry.fame) {
    case 'common':
      return 'every shinobi knows its name';
    case 'famous':
      return 'known by name across the shinobi world';
    case 'known':
      return `known by name in ${HOME_NAME[entry.home ?? ''] ?? 'its home'}, little outside`;
    case 'rare':
      return 'few have heard of it';
    default:
      return 'almost nobody alive knows it exists';
  }
}

export function formatCanonJutsuEntry(db: AppDatabase, entry: CanonJutsu, recentText = '') {
  const users = entry.kan ? ['you'] : currentUsers(db, entry).slice(0, 6);
  const kind = [entry.rank === '—' ? null : `${entry.rank === 'Forbidden' ? 'forbidden' : `${entry.rank}-rank`}`, entry.type, entry.natures.join('/') || null]
    .filter(Boolean)
    .join(', ');
  const name = kanKnowsJutsuName(db, entry, recentText)
    ? ''
    : ' Kan has not heard its name: describe it, and name it only once someone in the story says it.';

  return `- ${entry.name} (${entry.japanese}) [${kind}]; users now: ${users.join(', ') || 'none living who are known'}; cost: ${entry.cost}; learning: ${LEARNED[entry.learned]}${entry.needs ? `; needs ${entry.needs}` : ''}. ${entry.effect} Looks: ${entry.look} Fame: ${fameWord(entry)}.${name}`;
}

export function formatJutsuReference(db: AppDatabase, entries: CanonJutsu[], recentText = '') {
  if (entries.length === 0) return '';
  return [
    'JUTSU REFERENCE (canon, for you only: never recite or list it; someone names a jutsu only if they could know its name; a person uses only what they have here or on their card)',
    ...entries.map((entry) => formatCanonJutsuEntry(db, entry, recentText)),
  ].join('\n');
}
