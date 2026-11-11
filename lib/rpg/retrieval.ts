import { loreActive } from './lore';
import { daysBetween, sameDate } from './calendar';
import { mentionsEntity } from './characterRefs';
import type {
  AppDatabase,
  EntityRecord,
  EventRecord,
  FactRecord,
  LoreRecord,
  RawLogEntry,
} from './types';

const STOPWORDS = new Set([
  'the','and','for','are','but','not','you','your','with','that','this','have','from',
  'what','when','where','who','how','why','was','were','been','being','into','onto',
  'about','after','before','again','there','their','them','they','then','than','some',
  'just','only','very','much','more','most','over','under','between','through','while',
  'does','doing','done','said','says','say','tell','told','back','away','around',
]);

export type RetrievalQuery = {
  recentMessages: RawLogEntry[];
  userMessage: string;
};

export function retrieveMemories(
  db: AppDatabase,
  query: RetrievalQuery,
  limit: number
): EventRecord[] {
  const rawText = [
    ...query.recentMessages.map((message) => message.content),
    query.userMessage,
  ].join('\n');
  const combinedText = rawText.toLowerCase();

  const entities = matchEntities(db, rawText);
  const entityIds = new Set(entities.map((entity) => entity.id));
  const tags = extractTags(combinedText);
  const candidateIds = new Set<string>();

  for (const entity of entities) {
    for (const eventId of db.indices.eventsByEntity[entity.id] ?? []) {
      candidateIds.add(eventId);
    }
  }

  for (const tag of tags) {
    for (const eventId of db.indices.eventsByTag[tag] ?? []) {
      candidateIds.add(eventId);
    }
  }

  const locationEntity = db.entities.find(
    (entity) =>
      entity.type === 'place' &&
      db.state.location.toLowerCase().includes(entity.name.toLowerCase())
  );

  if (locationEntity) {
    for (const eventId of db.indices.eventsByEntity[locationEntity.id] ?? []) {
      candidateIds.add(eventId);
    }
  }

  for (const event of db.events) {
    if (event.pinned) {
      candidateIds.add(event.id);
    }
  }

  if (candidateIds.size < limit * 3) {
    for (const event of [...db.events]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit * 3)) {
      candidateIds.add(event.id);
    }
  }

  const eventsById = new Map(db.events.map((event) => [event.id, event]));
  const scored = [...candidateIds]
    .map((id) => eventsById.get(id))
    .filter((event): event is EventRecord => Boolean(event))
    .map((event) => ({
      event,
      score: scoreEvent(event, entityIds, tags, db),
    }))
    .sort((a, b) => b.score - a.score);

  const selected = scored.slice(0, limit).map((item) => item.event);

  return selected;
}

function scoreEvent(
  event: EventRecord,
  entityIds: Set<string>,
  tags: Set<string>,
  db: AppDatabase
) {
  let score = event.importance * 2;

  if (event.pinned) {
    score += 10;
  }

  for (const entityId of entityIds) {
    if (db.indices.eventsByEntity[entityId]?.includes(event.id)) {
      score += 5;
    }
  }

  for (const tag of tags) {
    if (event.tags.some((eventTag) => eventTag.toLowerCase() === tag)) {
      score += 3;
    }
  }

  if (sameDate(event.inStoryDate, db.state.inStoryDate)) {
    score += 3;
  }

  const dayDistance = Math.abs(daysBetween(event.inStoryDate, db.state.inStoryDate));

  if (dayDistance <= 7) {
    score += 2;
  } else if (dayDistance <= 30) {
    score += 1;
  }

  return score;
}

/** Words too common to tell one fact from another. */
const FACT_STOP_WORDS = new Set([
  'about', 'after', 'again', 'against', 'being', 'before', 'could', 'every', 'their', 'there', 'these', 'those',
  'which', 'while', 'would', 'where', 'other', 'still', 'never', 'through', 'under', 'knows', 'known', 'yours',
]);

function distinctiveWords(text: string) {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^\p{L}\s-]/gu, ' ')
        .split(/\s+/)
        .filter((word) => word.length >= 5 && !FACT_STOP_WORDS.has(word))
    ),
  ];
}

/** How many facts the narrator gets each turn. */
export const FACT_LIMIT = 10;

const dateRank = (date: { year: number; month: number; day: number } | null | undefined) =>
  date ? date.year * 10000 + date.month * 100 + date.day : 0;

/**
 * The facts worth the narrator's attention this turn (audit 6.3), ranked:
 * what is true about Kan right now (injuries, conditions, what he carries),
 * then facts about people in the scene, secrets and plans they are part of,
 * people named in the recent text, facts whose distinctive words the text
 * uses; newest first within each. With nothing to go on, the newest facts.
 */
export function relevantFacts(
  db: AppDatabase,
  entityIds: Set<string>,
  text: string,
  sceneIds: Set<string> = new Set()
): FactRecord[] {
  const active = db.facts.filter((fact) => fact.validTo === null);
  const lower = text.toLowerCase();
  const kanId = db.entities.find((entity) => entity.name.toLowerCase() === 'kan')?.id ?? null;

  const score = (fact: FactRecord) => {
    const aboutKan = fact.subjectEntityId !== null && fact.subjectEntityId === kanId;
    const involves = (ids: Set<string>) =>
      (fact.subjectEntityId !== null && ids.has(fact.subjectEntityId)) || fact.whoKnows.some((id) => ids.has(id));

    if (aboutKan && (fact.type === 'injury' || fact.type === 'condition' || fact.type === 'possession')) return 6;
    if (fact.subjectEntityId !== null && sceneIds.has(fact.subjectEntityId)) return 5;
    if ((fact.type === 'secret' || fact.type === 'plan' || fact.type === 'relationship') && involves(sceneIds)) return 4;
    if (fact.subjectEntityId !== null && entityIds.has(fact.subjectEntityId)) return 3;

    const words = distinctiveWords(fact.text);
    const hits = words.filter((word) => lower.includes(word)).length;

    if (words.length > 0 && hits >= Math.min(2, words.length)) return 2;
    return 0;
  };

  const ranked = active
    .map((fact) => ({ fact, rank: score(fact) }))
    .sort((a, b) => b.rank - a.rank || dateRank(b.fact.validFrom) - dateRank(a.fact.validFrom));
  const relevant = ranked.filter((entry) => entry.rank > 0).map((entry) => entry.fact);

  if (relevant.length >= 4) {
    return relevant.slice(0, FACT_LIMIT);
  }

  // Too little to go on: fill with the newest facts, not the oldest.
  const newest = ranked.filter((entry) => entry.rank === 0).map((entry) => entry.fact);
  return [...relevant, ...newest].slice(0, Math.max(4, Math.min(FACT_LIMIT, relevant.length + 4)));
}

export function triggeredLore(db: AppDatabase, text: string): LoreRecord[] {
  const lower = text.toLowerCase();
  const active = db.loreEntries.filter((lore) => loreActive(db, lore));
  const always = active.filter((lore) => lore.always);
  const triggered = active.filter(
    (lore) => !lore.always && lore.keywords.some((keyword) => lower.includes(keyword.toLowerCase()))
  );

  return [...always, ...triggered.sort((a, b) => b.priority - a.priority).slice(0, 4)];
}

function matchEntities(db: AppDatabase, text: string): EntityRecord[] {
  return db.entities.filter((entity) => mentionsEntity(text, entity));
}

function extractTags(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOPWORDS.has(word));

  return new Set(words.slice(-80));
}
