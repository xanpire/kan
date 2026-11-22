// What a turn can still record when the state model's reply was unreadable.
// The clock and pace are read from the prose elsewhere (timeparse, pacing);
// this adds which jutsu Kan used, and suggests who the prose shows (never
// applied: only the state reply's characters_present can say who is there).

import { mentionsEntity, mentionsName } from './characterRefs';
import { isCompanion } from './companions';
import { jutsuKey, jutsuNameVariants, NATURE_WORDS, normalizeJutsuNature } from './jutsu';
import type { AppDatabase, TurnDiff } from './types';

/** Ending one, not using it: "I let Susanoo fall away", "I dismiss it" (Session 6). */
const ENDING =
  /\b(let|lets|letting)\b[^.!?]{0,40}\b(fall|fade|die|collapse|crumble|dissolve)\b|\b(dismiss|dismisses|dismissed|cancel|cancels|cancelled)\b/i;

/** Sentences that describe someone else, or talk about a jutsu, not Kan using it. */
const NOT_USING =
  /\b(watch|watches|watched|see|sees|saw|seen|ask|asks|asked|about|remember|remembers|recall|tell|tells|told|explain|explains|how|teach|teaches|taught|learn|learns|study|studies|think|thinks)\b/i;

/** Lead words that are part of the sentence, not the jutsu's name. */
const LEAD_WORDS = new Set(['i', 'the', 'my', 'a', 'an', 'then', 'and', 'with', 'kan', 'so', 'now']);

/** Small words allowed inside a name ("Dragon of the Flames", "Gōkakyū no Jutsu"). */
const NAME_JOINERS = '(?:(?:of|no|the|and|to|de)\\s+){0,2}';

/** "Fire Style: Hell", "fire style: Hell", "Lava Release: Rubber Wall". */
const STYLE_PATTERN = new RegExp(
  `((?:[\\p{L}][\\p{L}'-]*\\s+){1,2})([Ss]tyle|[Rr]elease)\\s*:\\s*([\\p{L}][\\p{L}'-]*(?:\\s+${NAME_JOINERS}\\p{Lu}[\\p{L}'-]*){0,5})`,
  'gu'
);
/** "Shadow Clone Jutsu", "Katon: Gōkakyū no Jutsu", "Hidden Mist Technique". */
const JUTSU_PATTERN =
  /((?:\p{Lu}[\p{L}'-]*\s*:\s*)?(?:\p{Lu}[\p{L}'-]*\s+){1,5}(?:no\s+)?(?:Jutsu|jutsu|Technique|technique))\b/gu;

function sentences(text: string) {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanJutsuName(raw: string) {
  const words = raw.trim().replace(/[\s,;:.!?]+$/, '').split(/\s+/);

  while (words.length > 1 && LEAD_WORDS.has(words[0].toLowerCase())) {
    words.shift();
  }

  const name = words.join(' ');
  // "Jutsu" or "Technique" on its own is not a name.
  return /^(no\s+)?(jutsu|technique)$/i.test(name) ? '' : name;
}

/** A "Style"/"Release" match, keeping only the element words before it. */
function styleName(prefix: string, word: string, rest: string) {
  const before = prefix.trim().split(/\s+/);
  const kept: string[] = [];

  // Walk back from "Style": keep capitalized words and element words.
  for (let index = before.length - 1; index >= 0; index -= 1) {
    const item = before[index];

    if (LEAD_WORDS.has(item.toLowerCase())) {
      break;
    }

    if (/^\p{Lu}/u.test(item) || NATURE_WORDS.has(item.toLowerCase())) {
      kept.unshift(item);
    } else {
      break;
    }
  }

  if (kept.length === 0) {
    return '';
  }

  // Exactly as the player wrote it, colon spacing tidied.
  return `${kept.join(' ')} ${word}: ${rest.trim().replace(/[\s,;.!?]+$/, '')}`;
}

/** Names written in the text, in the player's own spelling. */
function namedJutsuIn(text: string): string[] {
  const names: string[] = [];

  for (const match of text.matchAll(STYLE_PATTERN)) {
    const name = styleName(match[1], match[2], match[3]);

    if (name) {
      names.push(name);
    }
  }

  for (const match of text.matchAll(JUTSU_PATTERN)) {
    const name = cleanJutsuName(match[1]);

    if (name) {
      names.push(name);
    }
  }

  return names;
}

/** Known characters the narration shows in the scene. */
export function presentFromProse(db: AppDatabase, narration: string): string[] {
  if (!narration.trim()) {
    return [];
  }

  const parts = sentences(narration);
  const cast = new Set((db.state.sceneCast ?? []).map((name) => name.toLowerCase()));
  const present: string[] = [];

  for (const entity of db.entities) {
    if (
      entity.type !== 'character' ||
      entity.name === 'Kan' ||
      entity.deceased ||
      entity.status === 'Deceased'
    ) {
      continue;
    }

    const hits = parts.filter((part) => mentionsEntity(part, entity)).length;

    if (hits === 0) {
      continue;
    }

    // A single passing mention ("rumors of Orochimaru") isn't enough for
    // someone new; it is for someone already here or travelling with Kan.
    const alreadyHere =
      isCompanion(entity) ||
      cast.has(entity.name.toLowerCase()) ||
      entity.aliases.some((alias) => cast.has(alias.toLowerCase()));

    if (alreadyHere || hits >= 2) {
      present.push(entity.name);
    }
  }

  return present.slice(0, 8);
}

/** Jutsu Kan uses in the player's own message: ones he already knows, and named techniques. */
export function kanJutsuFromMessage(db: AppDatabase, userMessage: string): string[] {
  if (!userMessage.trim()) {
    return [];
  }

  const known = [
    ...db.jutsuRecords.filter((record) => record.user === 'Kan').map((record) => record.name),
    ...(db.state.jutsu ?? []),
  ];
  const storedByKey = new Map(known.map((name) => [jutsuKey(name), name]));
  const found = new Map<string, string>();
  const add = (name: string) => {
    const key = jutsuKey(name);

    if (name && !found.has(key)) {
      found.set(key, name);
    }
  };

  for (const part of sentences(userMessage)) {
    if (NOT_USING.test(part) || ENDING.test(part)) {
      continue;
    }

    for (const name of known) {
      if (jutsuNameVariants(name).some((variant) => mentionsName(part, variant))) {
        add(name);
      }
    }

    for (const name of namedJutsuIn(part)) {
      // Prefer the stored spelling when it's one Kan already has.
      add(storedByKey.get(jutsuKey(name)) ?? name);
    }
  }

  // Drop a short match that is only part of a longer one ("Fireball Jutsu" in
  // "Fire Style: Fireball Jutsu").
  const names = [...found.values()];
  return names
    .filter(
      (name) =>
        !names.some(
          (other) => other !== name && jutsuKey(other).includes(jutsuKey(name))
        )
    )
    .slice(0, 4);
}

function isKanUser(user: string | undefined) {
  return !user || user.trim().toLowerCase() === 'kan';
}

/**
 * Kan's jutsu keep the names the player wrote. When the state model reports
 * one of Kan's jutsu under another name (often the generic canon one, like
 * "Fire Release" for "Fire Style: Hell"), the player's name replaces it; a
 * jutsu the player named that the model missed is added.
 */
export function preferPlayerJutsuNames(
  db: AppDatabase,
  diff: TurnDiff,
  userMessage: string
): TurnDiff {
  const written = kanJutsuFromMessage(db, userMessage);

  if (written.length === 0) {
    return diff;
  }

  const used = [...(diff.jutsuUsed ?? [])];
  const writtenKeys = new Set(written.map(jutsuKey));
  const reportedKeys = new Set(used.filter((item) => isKanUser(item.user)).map((item) => jutsuKey(item.name)));
  const missing = written.filter((name) => !reportedKeys.has(jutsuKey(name)));

  // Kan's entries the player didn't name: candidates to carry the player's name.
  const spare = used
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isKanUser(item.user) && !writtenKeys.has(jutsuKey(item.name)));
  const taken = new Set<number>();

  for (const name of missing) {
    const nature = natureOfName(name);
    // Same element first; otherwise the only spare entry, if there is just one
    // name and one entry left to pair.
    const match =
      spare.find(({ item, index }) =>
        !taken.has(index) &&
        nature !== 'Unknown' &&
        (normalizeJutsuNature(item.chakraNature) === nature || natureOfName(item.name) === nature)
      ) ??
      (missing.length === 1 && spare.filter(({ index }) => !taken.has(index)).length === 1
        ? spare.find(({ index }) => !taken.has(index))
        : undefined);

    if (match) {
      taken.add(match.index);
      used[match.index] = { ...match.item, name, user: 'Kan' };
    } else {
      used.push({ name, user: 'Kan', ...(nature !== 'Unknown' ? { chakraNature: nature } : {}) });
    }
  }

  return { ...diff, jutsuUsed: used };
}

/** The element a name points to, from its first word ("Fire Style: Hell" → Fire). */
function natureOfName(name: string) {
  if (!/\b(style|release)\b/i.test(name)) {
    return 'Unknown';
  }

  const first = name.trim().split(/[\s:]+/)[0]?.toLowerCase() ?? '';
  return NATURE_WORDS.has(first) ? normalizeJutsuNature(first) : 'Unknown';
}

/** The diff a turn gets when the state model's reply couldn't be read. */
export function fallbackDiffFromProse(
  db: AppDatabase,
  turn: { userMessage: string; narration: string }
): TurnDiff | null {
  const present = presentFromProse(db, turn.narration);
  const jutsu = kanJutsuFromMessage(db, turn.userMessage);

  if (present.length === 0 && jutsu.length === 0) {
    return null;
  }

  const diff: TurnDiff = {};

  // Only a suggestion: reading names in prose never marks anyone met or
  // seen, and never changes the scene cast (the last one carries on).
  if (present.length > 0) {
    diff.suggestedCast = present;
  }

  if (jutsu.length > 0) {
    diff.jutsuUsed = jutsu.map((name) => ({ name, user: 'Kan' }));
  }

  return diff;
}
