import { dateSortValue } from './calendar';
import { resolveEntity } from './entities';
import { makeId } from './id';
import type { AppDatabase, JutsuRecord, TurnDiff } from './types';

export const JUTSU_NATURES = [
  'Fire',
  'Water',
  'Wind',
  'Earth',
  'Lightning',
  'Wood',
  'Ice',
  'Lava',
  'Boil',
  'Storm',
  'Yin',
  'Yang',
  'Yin-Yang',
  'Physical',
  'Genjutsu',
  'Space-Time',
  'Unknown',
] as const;

export type JutsuNature = (typeof JUTSU_NATURES)[number];

const NATURE_RULES: Array<{ nature: Exclude<JutsuNature, 'Unknown'>; keywords: string[] }> = [
  { nature: 'Fire', keywords: ['fire', 'flame', 'burn', 'katon'] },
  { nature: 'Water', keywords: ['water', 'suiton', 'aqua'] },
  { nature: 'Wind', keywords: ['wind', 'air', 'futon', 'gale'] },
  { nature: 'Earth', keywords: ['earth', 'stone', 'mud', 'doton'] },
  { nature: 'Lightning', keywords: ['lightning', 'thunder', 'raiton'] },
  { nature: 'Wood', keywords: ['wood', 'tree', 'mokuton'] },
  { nature: 'Ice', keywords: ['ice', 'frost', 'hyoton'] },
  { nature: 'Lava', keywords: ['lava', 'magma', 'yoton'] },
  { nature: 'Boil', keywords: ['boil', 'steam', 'futton'] },
  { nature: 'Storm', keywords: ['storm', 'tempest'] },
  { nature: 'Yin', keywords: ['yin', 'shadow', 'spirit'] },
  { nature: 'Yang', keywords: ['yang', 'life', 'vitality'] },
  { nature: 'Yin-Yang', keywords: ['yin-yang', 'yin and yang'] },
  { nature: 'Physical', keywords: ['physical', 'taijutsu', 'kenjutsu', 'weapon', 'none'] },
  { nature: 'Genjutsu', keywords: ['genjutsu', 'illusion'] },
  { nature: 'Space-Time', keywords: ['space-time', 'space', 'time', 'teleport', 'summon'] },
];

/** Every keyword, longest first, as a whole-word pattern: "yin-yang" before "yin", and "air" never in "chair". */
const NATURE_KEYWORDS = NATURE_RULES.flatMap((rule) => rule.keywords.map((keyword) => ({ keyword, nature: rule.nature })))
  .sort((a, b) => b.keyword.length - a.keyword.length)
  .map(({ keyword, nature }) => ({
    nature,
    pattern: new RegExp(`(?<![a-z])${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`),
  }));

export function normalizeJutsuNature(value: string | undefined): JutsuNature {
  const nature = value?.trim().toLowerCase();

  if (!nature) {
    return 'Unknown';
  }

  const exact = JUTSU_NATURES.find((name) => name.toLowerCase() === nature);

  if (exact) {
    return exact;
  }

  return NATURE_KEYWORDS.find((rule) => rule.pattern.test(nature))?.nature ?? 'Unknown';
}

export function groupJutsuByNature(records: JutsuRecord[]) {
  const grouped = new Map<JutsuNature, JutsuRecord[]>();

  for (const record of records) {
    const nature = normalizeJutsuNature(record.chakraNature);
    const current = grouped.get(nature) ?? [];
    current.push(record);
    grouped.set(nature, current);
  }

  return [...grouped.entries()]
    .map(([nature, jutsu]) => ({
      nature,
      jutsu: [...jutsu].sort((a, b) => {
        if (a.user !== b.user) {
          const aKan = a.user === 'Kan' ? 1 : 0;
          const bKan = b.user === 'Kan' ? 1 : 0;

          if (aKan !== bKan) {
            return bKan - aKan;
          }

          return a.user.localeCompare(b.user);
        }

        return b.timesUsed - a.timesUsed;
      }),
    }))
    .sort((a, b) => {
      const aIndex = JUTSU_NATURES.indexOf(a.nature);
      const bIndex = JUTSU_NATURES.indexOf(b.nature);

      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }

      return a.nature.localeCompare(b.nature);
    });
}

export function countJutsuByNature(records: JutsuRecord[]) {
  const counts = new Map<JutsuNature, number>();

  for (const record of records) {
    const nature = normalizeJutsuNature(record.chakraNature);
    counts.set(nature, (counts.get(nature) ?? 0) + 1);
  }

  return counts;
}

// ---------------------------------------------------------------------------
// Recording jutsu from a turn
// ---------------------------------------------------------------------------

type JutsuDiff = NonNullable<TurnDiff['jutsuUsed']>[number];

/**
 * The key two jutsu names are compared by. "Style" and "Release" are the same
 * word ("Fire Style: Hell" = "Fire Release: Hell"), and case, spacing and the
 * colon don't matter.
 */
/** Words that say what kind of thing a name is, not which jutsu. */
const FILLER_WORDS = new Set(['style', 'release', 'jutsu', 'technique', 'no', 'the', 'of', 'art', 'justu']);

function jutsuWords(name: string) {
  const words = name
    .toLowerCase()
    .replace(/[^\p{L}\s-]/gu, ' ')
    .split(/[\s]+/)
    .filter((word) => word && !FILLER_WORDS.has(word));

  return {
    core: new Set(words.filter((word) => !NATURE_WORDS.has(word))),
    natures: new Set(words.filter((word) => NATURE_WORDS.has(word))),
  };
}

/**
 * Two names for the same jutsu: the same words once "style / release /
 * jutsu / technique / no" and element words are set aside, and no clash
 * between the elements they do name.
 */
export function sameJutsu(a: string, b: string) {
  const left = jutsuWords(a);
  const right = jutsuWords(b);

  if (left.core.size === 0 || left.core.size !== right.core.size) {
    return false;
  }

  if ([...left.core].some((word) => !right.core.has(word))) {
    return false;
  }

  if (left.natures.size > 0 && right.natures.size > 0) {
    return [...left.natures].some((word) => right.natures.has(word));
  }

  return true;
}

export function jutsuKey(name: string) {
  return name
    .toLowerCase()
    .replace(/\brelease\b/g, 'style')
    .replace(/\s*:\s*/g, ': ')
    .replace(/[\s,;.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Element words: "Fire" in "Fire Style", "Scorch" in "Scorch Release". */
export const NATURE_WORDS = new Set([
  'fire', 'water', 'wind', 'earth', 'lightning', 'wood', 'ice', 'lava', 'boil', 'storm',
  'scorch', 'magnet', 'dust', 'crystal', 'explosion', 'swift', 'steel', 'yin', 'yang',
  'yin-yang', 'shadow', 'sand', 'mud', 'stone',
]);

/**
 * A chakra element's name with nothing after it ("Fire Release", "Water
 * Style:"). It names a nature, not a jutsu, so it is never kept as a record.
 */
export function isBareNatureName(name: string) {
  const match = name.trim().match(/^([\p{L}-]+)\s+(?:style|release)\s*:?\s*$/iu);
  return Boolean(match && NATURE_WORDS.has(match[1].toLowerCase()));
}

/** The same name with "Style" and "Release" swapped, for finding it in text. */
export function jutsuNameVariants(name: string) {
  const swapped = /\bstyle\b/i.test(name)
    ? name.replace(/\b(s)tyle\b/gi, (_, s: string) => (s === 'S' ? 'Release' : 'release'))
    : name.replace(/\b(r)elease\b/gi, (_, r: string) => (r === 'R' ? 'Style' : 'style'));

  return swapped === name ? [name] : [name, swapped];
}

export function applyJutsuDiff(db: AppDatabase, jutsu: JutsuDiff): AppDatabase {
  if (!jutsu?.name || typeof jutsu.name !== 'string' || !jutsu.user) {
    return db;
  }

  const name = jutsu.name.trim();
  const user = jutsu.user.trim();

  if (!name || !user || isBareNatureName(name)) {
    return db;
  }

  const key = jutsuKey(name);
  const sameUser = (item: JutsuRecord) =>
    item.user.toLowerCase() === user.toLowerCase() || resolveEntity(db, user)?.id === resolveEntity(db, item.user)?.id;
  const exactIndex = db.jutsuRecords.findIndex((item) => jutsuKey(item.name) === key && sameUser(item));
  // "Fireball Jutsu" and "Fire Style: Fireball Technique" are one jutsu; the
  // first name recorded is kept (the player's wording always wins).
  const existingIndex =
    exactIndex !== -1 ? exactIndex : db.jutsuRecords.findIndex((item) => sameUser(item) && sameJutsu(item.name, name));

  if (existingIndex === -1) {
    const record = {
      id: makeId('jutsu'),
      name,
      user,
      chakraNature: normalizeJutsuNature(jutsu.chakraNature),
      effect: jutsu.effect?.trim() || jutsu.description?.trim() || '',
      visual: jutsu.visual?.trim() || '',
      firstSeen: db.state.inStoryDate,
      lastSeen: db.state.inStoryDate,
      timesUsed: 1,
      description: jutsu.description?.trim() || '',
      tags: [],
    };

    return {
      ...db,
      jutsuRecords: [...db.jutsuRecords, record],
    };
  }

  const jutsuRecords = [...db.jutsuRecords];
  const existing = jutsuRecords[existingIndex];

  jutsuRecords[existingIndex] = {
    ...existing,
    chakraNature: normalizeJutsuNature(jutsu.chakraNature ?? existing.chakraNature),
    effect: jutsu.effect?.trim() || existing.effect,
    visual: jutsu.visual?.trim() || existing.visual,
    lastSeen: db.state.inStoryDate,
    timesUsed: existing.timesUsed + 1,
    description: jutsu.description?.trim() || existing.description,
  };

  return {
    ...db,
    jutsuRecords,
  };
}

// ---------------------------------------------------------------------------
// Hand corrections from the jutsu screen
// ---------------------------------------------------------------------------

function sameUser(db: AppDatabase, a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase() || resolveEntity(db, a)?.id === resolveEntity(db, b)?.id;
}

/** Swaps one name for another in Kan's quick jutsu list. */
function renameInKanList(db: AppDatabase, oldName: string, newName: string | null) {
  const oldKey = jutsuKey(oldName);
  const list = db.state.jutsu ?? [];

  if (!list.some((item) => jutsuKey(item) === oldKey)) {
    return db.state;
  }

  const seen = new Set<string>();
  const jutsu = list
    .map((item) => (jutsuKey(item) === oldKey ? newName : item))
    .filter((item): item is string => {
      if (!item || seen.has(jutsuKey(item))) {
        return false;
      }
      seen.add(jutsuKey(item));
      return true;
    });

  return { ...db.state, jutsu };
}

/**
 * Renames a jutsu record. If the same user already has a jutsu by the new
 * name, the two become one record with both histories.
 */
export function renameJutsuRecord(db: AppDatabase, recordId: string, rawName: string): AppDatabase {
  const record = db.jutsuRecords.find((item) => item.id === recordId);
  const name = rawName.trim().replace(/\s+/g, ' ');

  if (!record || !name || name === record.name) {
    return db;
  }

  const twin = db.jutsuRecords.find(
    (item) => item.id !== record.id && jutsuKey(item.name) === jutsuKey(name) && sameUser(db, item.user, record.user)
  );
  let jutsuRecords: JutsuRecord[];

  if (twin) {
    const first = dateSortValue(twin.firstSeen) <= dateSortValue(record.firstSeen) ? twin : record;
    const last = dateSortValue(twin.lastSeen) >= dateSortValue(record.lastSeen) ? twin : record;
    const merged: JutsuRecord = {
      ...twin,
      name,
      chakraNature: twin.chakraNature !== 'Unknown' ? twin.chakraNature : record.chakraNature,
      effect: twin.effect || record.effect,
      visual: twin.visual || record.visual,
      description: twin.description || record.description,
      firstSeen: first.firstSeen,
      lastSeen: last.lastSeen,
      timesUsed: twin.timesUsed + record.timesUsed,
      tags: [...new Set([...twin.tags, ...record.tags])],
    };
    jutsuRecords = db.jutsuRecords
      .filter((item) => item.id !== record.id)
      .map((item) => (item.id === twin.id ? merged : item));
  } else {
    jutsuRecords = db.jutsuRecords.map((item) => (item.id === record.id ? { ...item, name } : item));
  }

  const isKan = record.user.toLowerCase() === 'kan';

  return {
    ...db,
    jutsuRecords,
    state: isKan ? renameInKanList(db, record.name, name) : db.state,
  };
}

/** Removes a jutsu record (and, for Kan, the same name from his quick list). */
export function deleteJutsuRecord(db: AppDatabase, recordId: string): AppDatabase {
  const record = db.jutsuRecords.find((item) => item.id === recordId);

  if (!record) {
    return db;
  }

  const jutsuRecords = db.jutsuRecords.filter((item) => item.id !== record.id);
  const isKan = record.user.toLowerCase() === 'kan';
  const stillHas = jutsuRecords.some(
    (item) => item.user.toLowerCase() === 'kan' && jutsuKey(item.name) === jutsuKey(record.name)
  );

  return {
    ...db,
    jutsuRecords,
    state: isKan && !stillHas ? renameInKanList(db, record.name, null) : db.state,
  };
}

/** Clears element names saved as if they were jutsu ("Fire Release" alone). */
export function dropBareNatureJutsu(db: AppDatabase): AppDatabase {
  const jutsuRecords = db.jutsuRecords.filter((record) => !isBareNatureName(record.name));
  const list = db.state.jutsu ?? [];
  const jutsu = list.filter((name) => !isBareNatureName(name));

  if (jutsuRecords.length === db.jutsuRecords.length && jutsu.length === list.length) {
    return db;
  }

  return { ...db, jutsuRecords, state: { ...db.state, jutsu } };
}
