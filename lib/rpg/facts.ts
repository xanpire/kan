// Permanent facts, plot threads and scene-end memories from a turn.

import { dateSortValue, normalizeDate, shiftSeconds } from './calendar';
import { displayName } from './names';
import { kanKnowsDeath } from './deaths';
import { resolveEntity } from './entities';
import { makeId } from './id';
import { secondPerson, trimToSentence, uniqueList } from './util';
import type { AppDatabase, EntityRecord, EventRecord, FactRecord, ThreadRecord, ThreadType, TurnDiff } from './types';

type FactDiff = NonNullable<TurnDiff['facts']>[number];

type ThreadDiff = NonNullable<TurnDiff['threads']>[number];

/** The short handle the state tracker uses for a fact ("f-3k9x2a"). */
export function factRef(fact: { id: string }) {
  return `f-${fact.id.slice(-6)}`;
}

/** An active fact by its ref or full id. */
export function findActiveFact(db: AppDatabase, ref: string) {
  const wanted = ref.trim().toLowerCase();

  return (
    db.facts.find(
      (fact) => fact.validTo === null && (fact.id.toLowerCase() === wanted || factRef(fact) === wanted)
    ) ?? null
  );
}

/** Ends active facts (by ref or id) as of now. */
export function endFacts(db: AppDatabase, refs: string[], replacedBy?: string): AppDatabase {
  const ids = new Set(
    refs.map((ref) => findActiveFact(db, ref)?.id).filter((id): id is string => Boolean(id) && id !== replacedBy)
  );

  if (ids.size === 0) {
    return db;
  }

  return {
    ...db,
    facts: db.facts.map((fact) => (ids.has(fact.id) ? { ...fact, validTo: db.state.inStoryDate } : fact)),
  };
}

function groupTag(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Who knows a fact: people as entity ids, everyone else as group tags
 * ("Hidden Leaf leadership" → "hidden-leaf-leadership"). Entity ids already
 * in the list stay as they are.
 */
export function knowersOf(db: AppDatabase, names: string[]): { ids: string[]; groups: string[] } {
  const ids: string[] = [];
  const groups: string[] = [];

  for (const raw of names) {
    const name = raw?.trim();

    if (!name) continue;

    if (db.entities.some((entity) => entity.id === name)) {
      ids.push(name);
      continue;
    }

    const entity = resolveEntity(db, name);

    if (entity) {
      ids.push(entity.id);
    } else if (groupTag(name)) {
      groups.push(groupTag(name));
    }
  }

  return { ids: uniqueList(ids), groups: uniqueList(groups) };
}

/** The names of whoever knows a fact, for prompts and the Journal. */
export function knowerNames(db: AppDatabase, fact: Pick<FactRecord, 'whoKnows' | 'whoKnowsGroups'>) {
  // As Kan knows them: "the masked man", not a name he has never heard.
  const names = fact.whoKnows.map((id) => {
    const entity = db.entities.find((item) => item.id === id);

    return entity ? displayName(db, entity) : id;
  });
  const groups = (fact.whoKnowsGroups ?? []).map((tag) => tag.replace(/-/g, ' '));

  return [...names, ...groups];
}

function kanEntity(db: AppDatabase) {
  return db.entities.find((entity) => entity.name.toLowerCase() === 'kan') ?? null;
}

const NOT_YET = /\b(does not know|doesn't know|do not know|don't know|not yet|has not (?:yet )?(?:learned|heard|been told))\b/i;
const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'on', 'is', 'was', 'that', 'this', 'with', 'for', 'his', 'her', 'their', 'you', 'your', 'kan', 'kan’s', "kan's", 'yet', 'not', 'does', 'know', 'knows', 'now', 'has', 'had', 'been']);

function contentWords(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s'’]/gu, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP.has(word))
  );
}

/** Whether the new fact turns an old "does not know yet" fact about the same thing into the past. */
function overtakes(previous: FactRecord, next: { text: string; subjectEntityId: string | null }) {
  if (previous.subjectEntityId !== next.subjectEntityId || !NOT_YET.test(previous.text) || NOT_YET.test(next.text)) {
    return false;
  }

  const before = contentWords(previous.text);
  const after = contentWords(next.text);
  const shared = [...after].filter((word) => before.has(word)).length;

  return after.size > 0 && shared / Math.min(before.size, after.size) >= 0.5;
}

/** Default lifetimes: a passing condition lasts until rest, an injury about a week, a plan a few days. */
function lifetime(db: AppDatabase, fact: FactDiff): Pick<FactRecord, 'expiresAt' | 'untilRest'> {
  const lasts = fact.lasts ?? (fact.type === 'condition' ? 'until_rest' : fact.type === 'injury' || fact.type === 'plan' ? 'days' : 'lasting');

  if (lasts === 'until_rest') {
    return { untilRest: true };
  }

  if (lasts === 'days') {
    const days =
      typeof fact.days === 'number' && fact.days > 0 ? Math.min(fact.days, 365) : fact.type === 'injury' ? 7 : 3;
    return { expiresAt: shiftSeconds(db.state.inStoryDate, Math.round(days * 86400)) };
  }

  return {};
}

export function applyFactDiff(db: AppDatabase, fact: FactDiff): AppDatabase {
  if (!fact?.text || typeof fact.text !== 'string') {
    return db;
  }

  const text = fact.text.trim();

  if (!text) {
    return db;
  }

  const currentDate = fact.validFrom
    ? normalizeDate(fact.validFrom, db.state.inStoryDate)
    : db.state.inStoryDate;

  if (fact.action === 'end') {
    const facts = db.facts.map((item) => {
      if (
        item.validTo === null &&
        (item.text.toLowerCase() === text.toLowerCase() ||
          item.text.toLowerCase().includes(text.toLowerCase()))
      ) {
        return {
          ...item,
          validTo: currentDate,
        };
      }

      return item;
    });

    return {
      ...db,
      facts,
    };
  }

  // Every fact is about someone: whoever the tracker named, else Kan.
  const subjectEntity = (fact.subject ? resolveEntity(db, fact.subject) : null) ?? kanEntity(db);

  const duplicate = db.facts.find(
    (item) =>
      item.validTo === null &&
      (item.text.toLowerCase() === text.toLowerCase() ||
        (text.length > 30 &&
          item.text.toLowerCase().includes(text.toLowerCase())))
  );

  if (duplicate) {
    // Saying it again renews a temporary condition.
    if (duplicate.expiresAt || duplicate.untilRest) {
      return {
        ...db,
        facts: db.facts.map((item) => (item.id === duplicate.id ? { ...item, ...lifetime(db, fact) } : item)),
      };
    }

    return db;
  }

  const knowers = knowersOf(db, Array.isArray(fact.whoKnows) ? fact.whoKnows : []);
  const claimant = fact.claimedBy ? resolveEntity(db, fact.claimedBy) : null;
  const replaced = (fact.supersedes ?? [])
    .map((ref) => findActiveFact(db, ref))
    .filter((item): item is FactRecord => Boolean(item));
  const newFact: FactRecord = {
    id: makeId('fact'),
    subjectEntityId: subjectEntity?.id ?? null,
    type: fact.type ?? 'other',
    text: secondPerson(text).slice(0, 200),
    whoKnows: knowers.ids,
    ...(knowers.groups.length > 0 ? { whoKnowsGroups: knowers.groups } : {}),
    validFrom: currentDate,
    validTo: null,
    confidence: fact.claimedBy ? 'claimed' : 'confirmed',
    ...(claimant ? { claimedBy: claimant.id } : {}),
    ...lifetime(db, fact),
    ...(replaced[0] ? { supersedes: replaced[0].id } : {}),
    sourceEventId: null,
  };

  // What this fact replaces, and any "does not know yet" it overtakes, ends now.
  const overtaken = db.facts.filter((item) => item.validTo === null && overtakes(item, newFact));
  let next: AppDatabase = { ...db, facts: [...db.facts, newFact] };
  next = endFacts(next, [...replaced, ...overtaken].map((item) => item.id), newFact.id);

  return next;
}

const LONG_STRETCH_SECONDS = 2 * 86400;

/**
 * Runs after a turn: temporary conditions run out (their date passed, or a
 * rest ended them), and a "does not know yet" about someone's death ends once
 * Kan knows.
 */
export function expireFacts(db: AppDatabase, options: { rested: boolean; elapsedSeconds?: number }): AppDatabase {
  // A stretch of days (a time skip, a long journey) ends every passing state:
  // nobody stays awake that long, and a condition with no length was a
  // moment, not a month (audit 7.1).
  const longStretch = (options.elapsedSeconds ?? 0) >= LONG_STRETCH_SECONDS;
  const now = db.state.inStoryDate;
  const nowValue = dateSortValue(now);
  let changed = false;

  const facts = db.facts.map((fact) => {
    if (fact.validTo !== null) {
      return fact;
    }

    const subject = fact.subjectEntityId ? db.entities.find((entity) => entity.id === fact.subjectEntityId) : undefined;
    const ran = fact.expiresAt !== undefined && dateSortValue(fact.expiresAt) <= nowValue;
    const rested = (options.rested || longStretch) && fact.untilRest === true;
    const passed = longStretch && fact.type === 'condition' && !fact.expiresAt;
    const learned = subject !== undefined && NOT_YET.test(fact.text) && fact.type === 'death' && kanKnowsDeath(db, subject);

    if (ran || rested || passed || learned) {
      changed = true;
      return { ...fact, validTo: now };
    }

    return fact;
  });

  return changed ? { ...db, facts } : db;
}

/** A thread title reduced to its words: case, quotes and punctuation don't make a new thread. */
export function threadKey(title: string) {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’‘`']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const THREAD_STOP = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'for', 'with', 'your', 'you', 'kan', 'kans', 'his', 'her', 'on', 'in', 'at']);

function threadWords(text: string) {
  return new Set(threadKey(text).split(' ').filter((word) => word.length > 2 && !THREAD_STOP.has(word)));
}

/** The existing thread a new one means: same title once normalized, or mostly the same words. */
function matchingThread(db: AppDatabase, title: string, description?: string) {
  const key = threadKey(title);
  const exact = db.threads.findIndex((item) => threadKey(item.title) === key);

  if (exact !== -1) {
    return exact;
  }

  const words = threadWords(title);
  const described = description ? threadWords(description) : new Set<string>();

  return db.threads.findIndex((item) => {
    if (item.status !== 'open') return false;

    const theirs = threadWords(item.title);
    const shared = [...words].filter((word) => theirs.has(word)).length;
    const titleOverlap = words.size > 0 && theirs.size > 0 ? shared / Math.min(words.size, theirs.size) : 0;

    if (titleOverlap >= 0.75 && shared >= 2) return true;

    if (described.size >= 4) {
      const theirText = threadWords(`${item.title} ${item.description}`);
      const sharedText = [...described].filter((word) => theirText.has(word)).length;
      return sharedText / described.size >= 0.7 && titleOverlap >= 0.5;
    }

    return false;
  });
}

/**
 * Opens, updates or resolves a thread. A thread the story already has (same
 * title once normalized, or the same goal in other words) is updated rather
 * than opened twice. Every thread has participants, by name and id: Kan and
 * whoever is in the scene unless the tracker names them.
 */
/**
 * A thread's type from its words, for threads the tracker didn't type (and
 * the one-time migration of old "other" threads).
 */
export function classifyThread(title: string, description?: string): ThreadType {
  const text = `${title} ${description ?? ''}`.toLowerCase();

  if (/\b(owe|owes|owed|debt|repay|pay (him|her|them) back)\b/.test(text)) return 'debt';
  if (/\b(promise|promised|swore|sworn|vow|vowed|oath)\b/.test(text)) return 'promise';
  if (/\b(find out|what really|the truth|who is|who was|why did)\b|\?/.test(text)) return 'mystery';
  if (/\b(mission|deliver|escort|kill|assassinate|retrieve|capture|find|track|hunt|steal|infiltrate|guard|bounty)\b/.test(text)) return 'quest';
  return 'other';
}

export function applyThreadDiff(
  db: AppDatabase,
  thread: ThreadDiff,
  options: { presentIds?: ReadonlySet<string> } = {}
): AppDatabase {
  if (!thread?.title || typeof thread.title !== 'string') {
    return db;
  }

  const title = thread.title.trim().replace(/\s+/g, ' ');

  if (!title) {
    return db;
  }

  const existingIndex = matchingThread(db, title, thread.description);

  if (thread.action === 'resolve') {
    if (existingIndex === -1) {
      return db;
    }

    const threads = [...db.threads];
    threads[existingIndex] = {
      ...threads[existingIndex],
      status: 'resolved',
      resolvedAt: db.state.inStoryDate,
      description: thread.description?.trim() || threads[existingIndex].description,
    };

    return {
      ...db,
      threads,
    };
  }

  const kan = kanEntity(db);
  const named = (thread.participants ?? []).map((name) => resolveEntity(db, name)).filter((entity): entity is EntityRecord => Boolean(entity));
  const present = [...(options.presentIds ?? [])]
    .map((id) => db.entities.find((entity) => entity.id === id))
    .filter((entity): entity is EntityRecord => Boolean(entity));
  const people = uniqueList([...(kan ? [kan.id] : []), ...(named.length > 0 ? named : present).map((entity) => entity.id)]);
  const names = people.map((id) => db.entities.find((entity) => entity.id === id)?.name ?? id);

  if (existingIndex === -1) {
    const newThread: ThreadRecord = {
      id: makeId('thread'),
      type: thread.type ?? classifyThread(title, thread.description),
      // Keeps the tracker's casing ("Itachi's offer", not "itachi's offer").
      title: title.charAt(0).toUpperCase() + title.slice(1),
      description: secondPerson(thread.description?.trim() || ''),
      status: 'open' as const,
      openedAt: db.state.inStoryDate,
      resolvedAt: null,
      importance: thread.importance ?? 3,
      participants: names,
      participantIds: people,
      // The memory this turn is part of; the turn itself is stamped by the state step.
      sourceEventId: db.events.at(-1)?.id ?? null,
    };

    return {
      ...db,
      threads: [...db.threads, newThread],
    };
  }

  const threads = [...db.threads];
  const current = threads[existingIndex];
  const currentIds = current.participantIds ?? current.participants.map((name) => resolveEntity(db, name)?.id).filter((id): id is string => Boolean(id));
  const mergedIds = uniqueList([...currentIds, ...named.map((entity) => entity.id)]);
  threads[existingIndex] = {
    ...current,
    description: thread.description?.trim() ? secondPerson(thread.description.trim()) : current.description,
    // "other" never overwrites a real type (a story hook's quest stays a quest).
    type: thread.type && thread.type !== 'other' ? thread.type : current.type,
    importance: thread.importance ?? current.importance,
    participantIds: mergedIds,
    participants: uniqueList([...current.participants, ...named.map((entity) => entity.name)]),
  };

  return {
    ...db,
    threads,
  };
}

export function recordSceneEvent(
  db: AppDatabase,
  diff: TurnDiff,
  options: { sceneName?: string } = {}
): AppDatabase {
  const scene = diff.scene;
  const summary =
    scene?.summary?.trim() ||
    trimToSentence(
      db.rawLog
        .filter((message) => message.kind === 'story')
        .slice(-2)
        .map((message) => message.content)
        .join(' ')
    ).slice(0, 240);

  if (!summary) {
    return db;
  }

  const event: EventRecord = {
    id: makeId('event'),
    chapter: db.state.chapter,
    scene: options.sceneName ?? db.state.scene,
    inStoryDate: db.state.inStoryDate,
    // Raw prose until the scene's summary replaces this memory; the scene's
    // name is its title, so the prose is never shown as one.
    title: options.sceneName ?? db.state.scene,
    summary: trimToSentence(summary.slice(0, 220)),
    importance: scene?.importance ?? 3,
    tags: Array.isArray(scene?.tags) ? scene.tags.filter(Boolean).slice(0, 6) : [],
    pinned: false,
    sourceLogId: null,
    createdAt: Date.now(),
  };

  const eventEntities = (scene?.entities ?? [])
    .map((name) => resolveEntity(db, name))
    .filter((entity): entity is EntityRecord => Boolean(entity))
    .map((entity) => ({
      eventId: event.id,
      entityId: entity.id,
      role: 'present' as const,
    }));

  return {
    ...db,
    events: [...db.events, event],
    eventEntities: [...db.eventEntities, ...eventEntities],
  };
}
