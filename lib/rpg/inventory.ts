// What Kan carries (audit 6.8). Items are free text from the state tracker,
// so adding and removing match loosely: case, plurals, and a count written
// in front ("3 kunai") or behind ("Shuriken (10)", "Kunai pouch (6 kunai)").
// Counts merge and go down instead of an item vanishing. A few things never
// drop off the end of a long list: the forehead protector, the cloak, the ring.

/** Most items kept. Beyond this the oldest unpinned item drops. */
export const INVENTORY_LIMIT = 40;

/** Never dropped by the limit: who Kan is. */
const PINNED_PATTERNS = [/\b(forehead protector|headband)\b/i, /\bakatsuki\b.*\b(cloak|robe)\b|\b(cloak|robe)\b.*\bakatsuki\b/i, /\bring\b/i];

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, twenty: 20,
};

type Parsed = { count: number | null; base: string; shape: 'front' | 'back' | 'inner' | 'none'; inner?: string };

function singular(word: string) {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('es') && /(sh|ch|x|s)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Lower case, no punctuation, singular words: "Explosive tags" → "explosive tag". */
export function itemKey(text: string) {
  return text
    .toLowerCase()
    .replace(/[’‘`']s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(singular)
    .join(' ');
}

export function parseItem(item: string): Parsed {
  const text = item.trim();
  const inner = text.match(/^(.*?)\s*\((\d+)\s+([^)]+)\)\s*$/);

  if (inner) {
    return { count: Number(inner[2]), base: itemKey(inner[3]), shape: 'inner', inner: inner[1] };
  }

  const back = text.match(/^(.*?)\s*[(x×]\s*(\d+)\s*\)?\s*$/i);

  if (back && back[1].trim()) {
    return { count: Number(back[2]), base: itemKey(back[1]), shape: 'back' };
  }

  const front = text.match(/^(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty)\s+(.+)$/i);

  if (front) {
    const word = front[1].toLowerCase();
    const count = /^\d+$/.test(word) ? Number(word) : NUMBER_WORDS[word];
    return { count, base: itemKey(front[2]), shape: 'front' };
  }

  return { count: null, base: itemKey(text), shape: 'none' };
}

function withCount(item: string, parsed: Parsed, count: number) {
  if (parsed.shape === 'inner') return item.replace(/\((\d+)(\s+[^)]+)\)\s*$/, `(${count}$2)`);
  if (parsed.shape === 'back') return item.replace(/(\d+)(\s*\)?\s*)$/, `${count}$2`);
  if (parsed.shape === 'front') return item.replace(/^(\S+)/, String(count));
  return item;
}

/** The same thing, loosely: same words once case, plurals and counts are set aside. */
export function sameItem(a: string, b: string) {
  const left = parseItem(a);
  const right = parseItem(b);
  // A pouch is the pouch, not the kunai inside it.
  const x = left.shape === 'inner' ? itemKey(left.inner ?? a) : left.base;
  const y = right.shape === 'inner' ? itemKey(right.inner ?? b) : right.base;

  if (!x || !y) return false;
  if (x === y) return true;

  // "kunai" is the kunai in "Kunai pouch (6 kunai)"; "sealing scroll" is "the sealing scroll".
  const xs = new Set(x.split(' '));
  const ys = new Set(y.split(' '));
  const [small, large] = xs.size <= ys.size ? [xs, ys] : [ys, xs];
  return [...small].every((word) => large.has(word)) && [...small].join('').length >= 4;
}

export function isPinnedItem(item: string) {
  return PINNED_PATTERNS.some((pattern) => pattern.test(item));
}

/** Which item in the list a counted item belongs to (its counted thing matches). */
function countedMatch(inventory: string[], parsed: Parsed) {
  return inventory.findIndex((item) => {
    const other = parseItem(item);
    return other.count !== null && other.base === parsed.base;
  });
}

export function addItems(inventory: string[], added: string[]): string[] {
  let next = [...inventory];

  for (const raw of added) {
    const item = raw?.trim();

    if (!item) continue;

    const parsed = parseItem(item);
    const counted = parsed.count !== null ? countedMatch(next, parsed) : -1;

    if (counted !== -1) {
      const other = parseItem(next[counted]);
      next[counted] = withCount(next[counted], other, (other.count ?? 0) + (parsed.count ?? 0));
      continue;
    }

    if (next.some((existing) => itemKey(existing) === itemKey(item))) continue;

    next.push(item);
  }

  // Over the limit: the oldest unpinned item goes first.
  while (next.length > INVENTORY_LIMIT) {
    const drop = next.findIndex((item) => !isPinnedItem(item));
    if (drop === -1) break;
    next = [...next.slice(0, drop), ...next.slice(drop + 1)];
  }

  return next;
}

export function removeItems(inventory: string[], removed: string[]): string[] {
  let next = [...inventory];

  for (const raw of removed) {
    const item = raw?.trim();

    if (!item) continue;

    const parsed = parseItem(item);
    const counted = countedMatch(next, parsed);
    const index = counted !== -1 ? counted : next.findIndex((existing) => sameItem(existing, item));

    if (index === -1) continue;

    const other = parseItem(next[index]);

    // A counted item goes down ("used 2 kunai"; a bare "kunai" is one).
    if (other.count !== null && other.base === parsed.base) {
      const left = other.count - (parsed.count ?? 1);

      if (left > 0 || other.shape === 'inner') {
        next[index] = withCount(next[index], other, Math.max(0, left));
        continue;
      }
    }

    next = [...next.slice(0, index), ...next.slice(index + 1)];
  }

  return next;
}

const PROTECTOR = /\b(forehead protector|headband|hitai-ate)\b/i;
const SCRATCHED = /\b(scratch(?:ed)?|slash(?:ed)?|gouged?|carved?|scored|struck through|cut through|crossed out|defaced)\b/i;
const SCRATCH_ACT =
  /\b(scratch(?:es)?|scratched|carv(?:e|es|ed)|goug(?:e|es|ed)|scor(?:e|es|ed)|slash(?:es|ed)?|cut(?:s)?|drag(?:s|ged)?|draw(?:s)?|run(?:s)?|ran)\b/i;
const PROTECTOR_PART = /\b(forehead protector|headband|hitai-ate|leaf symbol|leaf insignia|insignia|the plate|metal plate|the leaf(?:'s|’s)? (?:symbol|mark|spiral))\b/i;
const NOT_YET = /\b(not|never|don't|do not|won't|without|almost|nearly|hesitat\w*|refuse\w*|instead of|consider\w*|think\w* about|wonder\w*)\b/i;

/** Kan's forehead protector, scratched through (the lore flag `headbandScratched` reads this). */
export function isScratchedProtector(item: string) {
  return PROTECTOR.test(item) && SCRATCHED.test(item);
}

/**
 * The prose shows Kan scratching his own forehead protector (Session 1, audit
 * 6.21: he carved it on the page and the inventory kept "Hidden Leaf forehead
 * protector"). A pinned item is never dropped, but it can change: the
 * unscratched protector becomes the scratched one. Speech, negations and
 * someone else's protector don't count. Returns the new inventory, or null.
 */
export function scratchProtectorFromProse(inventory: string[], narration: string): string[] | null {
  const index = inventory.findIndex((item) => PROTECTOR.test(item));
  if (index === -1 || isScratchedProtector(inventory[index])) return null;

  const prose = narration.replace(/"[^"\n]*(?:"|$)/g, ' ').replace(/“[^”\n]*(?:”|$)/g, ' ');
  const sentences = prose.split(/(?<=[.!?])\s+/);
  const shows = sentences.some(
    (sentence) =>
      /\byou(?:r)?\b/i.test(sentence) &&
      SCRATCH_ACT.test(sentence) &&
      PROTECTOR_PART.test(sentence) &&
      !NOT_YET.test(sentence) &&
      // Itachi's own scratched protector is not yours.
      !/\b(his|her|their|itachi(?:'s|’s))\s+(?:own\s+)?(forehead protector|headband)\b/i.test(sentence)
  );

  if (!shows) return null;

  const next = [...inventory];
  next[index] = 'Hidden Leaf forehead protector, scratched through';
  return next;
}

/**
 * One forehead protector: once a scratched one is carried (the tracker added
 * it, with or without removing the old name), the unscratched one is gone.
 */
export function settleProtector(inventory: string[]): string[] {
  const scratched = inventory.findIndex(isScratchedProtector);
  if (scratched === -1) return inventory;
  const old = inventory.findIndex((item) => PROTECTOR.test(item) && !isScratchedProtector(item));
  if (old === -1) return inventory;
  // The scratched one takes the old one's place in the list.
  const next = [...inventory];
  next[old] = inventory[scratched];
  return next.filter((_, position) => position !== scratched);
}
