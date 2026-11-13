// Keeps the narrator from repeating itself: how its recent replies ended,
// images and phrases it keeps reaching for, and decisions already made.

import type { AppDatabase, RawLogEntry } from './types';

const STOP = new Set(
  'the a an and or but of to in on at by for with from as is are was were be been it its it’s his her their your you he she they them him this that these those there here then than into onto over under through like just only not no nor so too very can could would should will shall may might must do does did have has had what which who whom whose when where why how all any each every some more most other such own same one two three up down out off again further once about against between before after above below while because until if'.split(
    ' '
  )
);

/** The last few narrator replies, oldest first. */
function recentReplies(db: AppDatabase, count: number): string[] {
  return db.rawLog
    .filter((entry: RawLogEntry) => entry.kind === 'story' && entry.role === 'assistant')
    .slice(-count)
    .map((entry) => entry.content);
}

/** How many of the last few replies ended on a question. */
export function questionEndings(db: AppDatabase, count = 3): number {
  return recentReplies(db, count).filter((text) => /\?["”’')\]]*\s*$/.test(text.trim())).length;
}

function phrases(text: string, names: Set<string>) {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\s'’-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const found = new Set<string>();

  for (let size = 2; size <= 3; size += 1) {
    for (let index = 0; index + size <= words.length; index += 1) {
      const gram = words.slice(index, index + size);

      // Content words only, at both ends; names don't count as a motif.
      const first = gram[0];
      const last = gram[gram.length - 1];

      if (STOP.has(first) || STOP.has(last) || first.length < 3 || last.length < 3 || gram.some((word) => names.has(word))) {
        continue;
      }

      found.add(gram.join(' '));
    }
  }

  return found;
}

/**
 * Phrases that turned up in at least `minReplies` of the last `window`
 * replies ("smell of iron", "flat voice"), most frequent first.
 */
export function repeatedMotifs(db: AppDatabase, window = 8, minReplies = 3, limit = 6): string[] {
  const names = new Set(
    db.entities
      .flatMap((entity) => [entity.name, ...entity.aliases])
      .flatMap((name) => name.toLowerCase().split(/\s+/))
      .filter((word) => !STOP.has(word))
  );
  const counts = new Map<string, number>();

  for (const reply of recentReplies(db, window)) {
    for (const phrase of phrases(reply, names)) {
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
  }

  const repeated = [...counts.entries()].filter(([, count]) => count >= minReplies).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  const picked: string[] = [];

  for (const [phrase] of repeated) {
    // "smell of iron" covers "smell iron"-like overlaps: keep the longer.
    if (picked.some((kept) => kept.includes(phrase) || phrase.includes(kept))) continue;
    picked.push(phrase);
    if (picked.length >= limit) break;
  }

  return picked;
}

/** The narrator's variety notes for this turn, or '' when there is nothing to say. */
export function formatVarietyBlock(db: AppDatabase): string {
  const lines: string[] = [];

  if (questionEndings(db) >= 2) {
    lines.push('- Your last replies ended on a question to you. End this one on an action, an image, a sound or an open beat instead.');
  }

  // Off from Debug for the with/without comparison (audit 8, 11e.3).
  const motifs = db.settings.varietyPhrases === false ? [] : repeatedMotifs(db);

  if (motifs.length > 0) {
    lines.push(`- These images and phrases keep coming back; leave them out this turn: ${motifs.map((motif) => `"${motif}"`).join(', ')}.`);
  }

  const settled = db.threads
    .filter((thread) => thread.status === 'resolved')
    .slice(-5)
    .map((thread) => thread.title);

  if (settled.length > 0) {
    lines.push(`- Already decided, never ask again: ${settled.join('; ')}.`);
  }

  return lines.length > 0 ? ['VARIETY', ...lines].join('\n') : '';
}
