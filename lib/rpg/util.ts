// Small shared helpers.

export function trimToSentence(text: string): string {
  let cleaned = text.trim();

  const fenceStart = cleaned.indexOf('```');

  if (fenceStart !== -1) {
    cleaned = cleaned.slice(0, fenceStart).trim();
  }

  const labelMatch = /(?:^|\n)\s*(?:chapter|arc|year)\s+summary\s*:\s*\n?/i.exec(cleaned);

  if (labelMatch && cleaned.slice(labelMatch.index + labelMatch[0].length).trim().length > 0) {
    cleaned = cleaned.slice(labelMatch.index + labelMatch[0].length).trim();
  }

  const sentenceEnd = /[.!?](?:["'”’)]+)?(?=\s|$)/g;
  let lastEnd = -1;

  for (const match of cleaned.matchAll(sentenceEnd)) {
    lastEnd = match.index + match[0].length;
  }

  if (lastEnd > 0 && lastEnd < cleaned.length) {
    return cleaned.slice(0, lastEnd).trim();
  }

  return cleaned;
}

/**
 * What to keep of a reply that was stopped or broke off mid-stream: the text
 * up to its last full sentence, if that holds at least two complete
 * sentences. Otherwise null (the reply is thrown away).
 */
export function keepablePartial(text: string): string | null {
  const trimmed = trimToSentence(text);
  const sentences = trimmed.match(/[^.!?]+[.!?]+(?:["'”’)]+)?(?=\s|$)/g) ?? [];
  const complete = sentences.filter((sentence) => /[A-Za-z]{2}/.test(sentence));

  if (complete.length < 2 || !/[.!?]["'”’)]*$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function uniqueList(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

/** Small stable string hash (FNV-1a) for deterministic per-turn choices. */
export function hashText(text: string): number {
  let value = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }

  return value >>> 0;
}

/** Player turns so far: the seed for choices that must survive a regenerate. */
export function playerTurnCount(db: { rawLog: { kind: string; role: string }[] }): number {
  return db.rawLog.filter((entry) => entry.kind === 'story' && entry.role === 'user').length;
}

const TITLE_MAX = 60;
const SENTENCE_TITLE_MAX = 90;

/**
 * Splits text into a short title and the rest: "Title: …", else a short
 * first sentence, else the first words cut at a word boundary (the rest of
 * the text stays as the description, so nothing is lost).
 */
export function titleAndBody(text: string): { title: string; body: string | null } {
  const trimmed = text.trim();
  const colon = /^([^:.!?\n]{3,70}):\s+(.+)$/s.exec(trimmed);

  if (colon) {
    return { title: colon[1].trim(), body: colon[2].trim() };
  }

  const sentence = new RegExp(`^(.{8,${SENTENCE_TITLE_MAX}}?[.!?…])(?:["'”’)]*)\\s+(.+)$`, 's').exec(trimmed);

  if (sentence) {
    return { title: sentence[1].trim(), body: sentence[2].trim() };
  }

  if (trimmed.length <= TITLE_MAX) {
    return { title: trimmed, body: null };
  }

  const head = trimmed.slice(0, TITLE_MAX + 1);
  const space = head.lastIndexOf(' ');
  const end = space >= 20 ? space : TITLE_MAX;
  const title = trimmed.slice(0, end).replace(/[\s,;:—–-]+$/, '');
  const rest = trimmed.slice(end).trim();

  return { title: `${title}…`, body: rest ? `…${rest}` : null };
}

/** A short title for a summary that came without one. */
export function shortTitle(text: string): string {
  const { title } = titleAndBody(text);
  const clean = title.replace(/[.!?…]+$/, '').trim();

  if (clean.length <= 48) {
    return clean;
  }

  const head = clean.slice(0, 49);
  const space = head.lastIndexOf(' ');
  return `${clean.slice(0, space >= 16 ? space : 48).replace(/[\s,;:—–-]+$/, '')}…`;
}

/** The first one or two sentences of a text, for a memory's description. */
export function firstSentences(text: string, count = 2, maxLength = 260): string {
  const parts = text.trim().match(/[^.!?]+[.!?]+(?:["'”’)]+)?/g) ?? [text.trim()];
  let result = '';

  for (const part of parts.slice(0, count)) {
    const next = `${result} ${part.trim()}`.trim();

    if (result && next.length > maxLength) {
      break;
    }

    result = next;
  }

  return result.length > maxLength ? `${result.slice(0, maxLength).replace(/\s+\S*$/, '')}…` : result;
}

export type TitledSummary = {
  title: string | null;
  memory: string | null;
  summary: string;
  /** The raw POV: section (points of view, see povMemories.ts), when the reply had one. */
  pov?: string;
};

/**
 * Reads a summary reply written as TITLE / MEMORY / SUMMARY lines. A reply
 * without the labels is taken as the summary itself.
 */
export function parseTitledSummary(raw: string): TitledSummary | null {
  const text = raw.replace(/\r/g, '').trim();
  const label = /^\s*\**\s*(TITLE|MEMORY|SUMMARY|POV)\s*\**\s*:\s*\**\s*/gim;
  const marks = [...text.matchAll(label)];

  if (marks.length === 0) {
    const summary = trimToSentence(text);
    return summary ? { title: null, memory: null, summary } : null;
  }

  const fields: Record<string, string> = {};

  marks.forEach((mark, index) => {
    const start = (mark.index ?? 0) + mark[0].length;
    const end = index + 1 < marks.length ? marks[index + 1].index ?? text.length : text.length;
    const key = mark[1].toUpperCase();

    if (!fields[key]) {
      fields[key] = text.slice(start, end).replace(/\*+$/, '').trim();
    }
  });

  const summary = fields.SUMMARY ? trimToSentence(fields.SUMMARY) : '';

  if (!summary) {
    return null;
  }

  const title = (fields.TITLE ?? '')
    .split('\n')[0]
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/[.!?]+$/, '')
    .trim()
    .slice(0, 60);
  const memory = fields.MEMORY ? trimToSentence(fields.MEMORY.replace(/\s+/g, ' ')) : '';

  return {
    title: title.length >= 2 ? title : null,
    memory: memory || null,
    summary,
    ...(fields.POV ? { pov: fields.POV } : {}),
  };
}

const KAN_VERB_BE: Record<string, string> = { is: 'are', was: 'were', has: 'have', does: 'do', "isn't": "aren't", "wasn't": "weren't", "hasn't": "haven't", "doesn't": "don't" };

/** "watches" → "watch", "carries" → "carry", "knows" → "know". */
function baseVerb(verb: string) {
  if (/ies$/.test(verb)) return verb.replace(/ies$/, 'y');
  if (/(ches|shes|sses|xes|zes)$/.test(verb)) return verb.replace(/es$/, '');
  if (/s$/.test(verb) && !/ss$/.test(verb)) return verb.replace(/s$/, '');
  return verb;
}

/**
 * Text that reaches the player calls Kan "you". Rewrites the common shapes
 * ("Kan's", "Kan is", "Kan knows", "with Kan") so app-written and canon text
 * reads in second person; ids and the jutsu user field never go through it.
 */
export function secondPerson(text: string): string {
  if (!/\bKan\b/.test(text)) {
    return text;
  }

  let out = text
    .replace(/\bKan[’']s\b/g, 'your')
    .replace(/\bKan (is|was|has|does|isn't|wasn't|hasn't|doesn't)\b/g, (_, verb: string) => `you ${KAN_VERB_BE[verb] ?? verb}`)
    .replace(/\bKan ([a-z]+s)\b/g, (match, verb: string) =>
      /^(?:and|as|thus|plus|always|perhaps|has|is|was)$/.test(verb) ? match : `you ${baseVerb(verb)}`
    )
    .replace(/\bKan\b/g, 'you');

  // Sentence starts: "you" → "You", "your" → "Your".
  out = out.replace(/(^|[.!?]\s+|["“]\s*)(you|your)\b/g, (_, lead: string, word: string) => `${lead}${word.charAt(0).toUpperCase()}${word.slice(1)}`);

  return out;
}
