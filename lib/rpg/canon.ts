// Canon engine: schedules the milestones in canonData.ts against the in-story
// clock, applies the state tracker's marks, and routes news to Kan.
//
// Rules:
// - World milestones fire on the in-story date (+ every earlier world milestone),
//   never on turn counts. Each is stamped with the day it happened.
// - Personal beats (playerDriven) are offers; only the state tracker's marks fire them.
// - Nothing fires or expires while Kan is mid-fight.
// - Every fired world event is unheard until someone who could know tells Kan,
//   one piece of news per turn.

import { daysBetween, daysFromCivil, dateSortValue, shiftDate } from './calendar';
import {
  BEARERS_BY_KNOWLEDGE,
  CANON_MILESTONES,
  CANON_VERSION,
  CHANNEL_BY_KNOWLEDGE,
  REGION_CHANNEL,
  type CanonJutsuGrant,
  type CanonKnowledge,
  type CanonMilestone,
  type CanonProgress,
  type CanonWindow,
} from './canonData';
import { markDeathsByName } from './deaths';
import { missingKeyActor } from './canonRoles';
import { castAppearingWith, ensureCanonCast } from './canonCast';
import { knowersOf } from './facts';
import { resolveEntity } from './entities';
import { mentionsName } from './characterRefs';
import { makeId } from './id';
import { secondPerson } from './util';
import { conditionHolds } from './lore';
import { applyAbilityChanges } from './abilities';
import type { AppDatabase, CalendarDate, FactRecord } from './types';

export type { CanonKnowledge, CanonMilestone, CanonProgress } from './canonData';

/** At most one piece of world news reaches Kan per turn. */
export const NEWS_PER_TURN = 1;

/** Kan is mid-fight (or mid-chase): the world holds its breath. */
export function isCombatPace(pace: string | undefined): boolean {
  return pace === 'combat' || pace === 'chase';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const eventIdFor = (milestoneId: string) => `event_canon_${milestoneId}`;

const byId = new Map(CANON_MILESTONES.map((milestone) => [milestone.id, milestone]));

function dayKey(window: CanonWindow): number {
  return daysFromCivil(window.year, window.month, window.day ?? 1);
}

/** The in-story moment a milestone's window opens (08:00 on its first day). */
export function milestoneOpensAt(milestone: CanonMilestone): CalendarDate {
  return {
    year: milestone.from.year,
    month: milestone.from.month,
    day: milestone.from.day ?? 1,
    hour: 8,
    minute: 0,
    second: 0,
  };
}

function windowOpen(milestone: CanonMilestone, today: number) {
  return {
    started: today >= dayKey(milestone.from),
    notClosed: !milestone.to || today <= dayKey(milestone.to),
  };
}

function normalizeProgress(db: AppDatabase): CanonProgress {
  const progress = db.state.canonProgress;
  const list = (value: unknown) => (Array.isArray(value) ? value.filter(Boolean) : []);

  if (!progress || !Array.isArray(progress.completed)) {
    return { version: CANON_VERSION, completed: [], active: [], engaged: [] };
  }

  return {
    version: typeof progress.version === 'number' ? progress.version : 1,
    baselineDate: progress.baselineDate,
    baselineTurn: typeof progress.baselineTurn === 'number' ? progress.baselineTurn : 0,
    completed: list(progress.completed),
    active: list(progress.active),
    engaged: list(progress.engaged),
    expired: list(progress.expired),
    heard: progress.heard && typeof progress.heard === 'object' ? progress.heard : {},
    heldForCombat: Boolean(progress.heldForCombat),
  };
}

function withProgress(db: AppDatabase, progress: CanonProgress): AppDatabase {
  return {
    ...db,
    state: {
      ...db.state,
      canonProgress: { ...progress, completed: [...new Set(progress.completed)] },
    },
  };
}

const addId = (list: string[], id: string) => (list.includes(id) ? list : [...list, id]);
const dropId = (list: string[], id: string) => list.filter((item) => item !== id);

/** Adds a confirmed event fact unless an open fact with the same text exists. */
function addFactOnce(
  db: AppDatabase,
  id: string,
  text: string,
  whoKnows: string[],
  validFrom: CalendarDate = db.state.inStoryDate,
  subjectEntityId: string | null = factSubject(db, text),
  sourceEventId: string | null = null
): AppDatabase {
  // Canon data says "Kan"; what you read says "you".
  text = secondPerson(text);
  const lower = text.toLowerCase();

  if (db.facts.some((fact) => fact.validTo === null && fact.text.toLowerCase() === lower)) {
    return db;
  }

  const knowers = knowersOf(db, whoKnows);
  const fact: FactRecord = {
    id,
    subjectEntityId,
    type: 'event',
    text: text.slice(0, 200),
    whoKnows: knowers.ids,
    ...(knowers.groups.length > 0 ? { whoKnowsGroups: knowers.groups } : {}),
    validFrom,
    validTo: null,
    confidence: 'confirmed',
    sourceEventId,
  };

  return { ...db, facts: [...db.facts, fact] };
}

function addMissedFact(db: AppDatabase, milestone: CanonMilestone): AppDatabase {
  if (!milestone.attendanceFact) {
    return db;
  }

  const who = milestone.encounter?.who ?? milestone.title;

  return addFactOnce(
    db,
    `fact_missed_${milestone.id}`,
    `You never crossed paths with ${who} before this window closed.`,
    ['Kan']
  );
}

function resolveThread(db: AppDatabase, titleKey: string): AppDatabase {
  const lower = titleKey.toLowerCase();

  return {
    ...db,
    threads: db.threads.map((thread) =>
      thread.status === 'open' &&
      (thread.title.toLowerCase() === lower || thread.title.toLowerCase().includes(lower))
        ? { ...thread, status: 'resolved', resolvedAt: db.state.inStoryDate }
        : thread
    ),
  };
}

/** Who a canon fact is about: you when it says "you", else the first person it names, else you. */
function factSubject(db: AppDatabase, text: string): string | null {
  const kan = db.entities.find((entity) => entity.name.toLowerCase() === 'kan');

  if (/\b(you|your)\b/i.test(text)) {
    return kan?.id ?? null;
  }

  let first: { id: string; at: number } | null = null;

  for (const entity of db.entities) {
    if (entity.type !== 'character' || entity === kan) continue;

    for (const name of [entity.name, ...entity.aliases]) {
      const at = text.toLowerCase().indexOf(name.toLowerCase());

      if (at !== -1 && mentionsName(text, name) && (!first || at < first.at)) {
        first = { id: entity.id, at };
      }
    }
  }

  return first?.id ?? kan?.id ?? null;
}

/** Where a personal beat stands: offered to you, accepted (under way), or completed on the page. */
export function milestoneStage(db: AppDatabase, milestoneId: string): 'offered' | 'accepted' | 'completed' | null {
  const progress = normalizeProgress(db);

  if (progress.completed.includes(milestoneId)) return 'completed';
  if (progress.engaged.includes(milestoneId)) return 'accepted';
  if (upcomingCanonMilestones(db, 99).some((milestone) => milestone.id === milestoneId)) return 'offered';
  return null;
}

const hasFired = (db: AppDatabase, milestoneId: string) =>
  db.events.some((event) => event.id === eventIdFor(milestoneId));

/** Records the milestone as an event plus its facts, threads and canon point. */
function fireMilestone(
  db: AppDatabase,
  milestone: CanonMilestone,
  happenedAt: CalendarDate = db.state.inStoryDate,
  /** Who saw it happen (Kan and the scene cast); world events go by how word travels instead. */
  witnesses?: string[]
): AppDatabase {
  if (hasFired(db, milestone.id)) {
    return db;
  }

  // A birth, a revival or a return brings its people into the story first,
  // so the milestone's own facts and deaths can find them.
  const entities = castAppearingWith(milestone.id).length
    ? ensureCanonCast(db.entities, () => makeId('entity'), [
        ...(db.state.canonProgress?.completed ?? []),
        milestone.id,
      ])
    : db.entities;

  let next: AppDatabase = {
    ...db,
    entities,
    events: [
      ...db.events,
      {
        id: eventIdFor(milestone.id),
        chapter: db.state.chapter,
        scene: 'Canon event',
        inStoryDate: happenedAt,
        summary: `${milestone.title}: ${milestone.description}`.slice(0, 240),
        importance: milestone.major ? 5 : 3,
        tags: ['canon', `canon-${milestone.id}`, milestone.era.toLowerCase()],
        pinned: Boolean(milestone.major),
        sourceLogId: null,
        createdAt: Date.now(),
      },
    ],
  };

  // Outcome facts carry the real moment, who they are about, and who knows:
  // the people who were there, or (for world events) the groups word reaches.
  const knowers = witnesses ?? [`${milestone.knowledge ?? 'public'} knowledge`];

  for (const text of milestone.facts) {
    next = addFactOnce(
      next,
      `fact_canon_${milestone.id}_${next.facts.length}`,
      text,
      knowers,
      happenedAt,
      factSubject(next, text),
      eventIdFor(milestone.id)
    );
  }

  if (milestone.deaths?.length) {
    next = markDeathsByName(next, milestone.deaths, {
      date: happenedAt,
      canonEventId: eventIdFor(milestone.id),
    });
  }

  for (const [name, status] of Object.entries(milestone.setsStatus ?? {})) {
    const entity = resolveEntity(next, name);

    if (entity) {
      next = { ...next, entities: next.entities.map((item) => (item.id === entity.id ? { ...item, status } : item)) };
    }
  }

  for (const title of milestone.resolvesThreadTitles ?? []) {
    next = resolveThread(next, title);
  }

  for (const seed of milestone.opensThreads ?? []) {
    const lower = seed.title.toLowerCase();

    if (next.threads.some((thread) => thread.title.toLowerCase() === lower)) {
      continue;
    }

    next = {
      ...next,
      threads: [
        ...next.threads,
        {
          id: `thread_canon_${milestone.id}_${next.threads.length}`,
          type: seed.type,
          title: seed.title,
          description: secondPerson(seed.description),
          status: 'open',
          openedAt: happenedAt,
          resolvedAt: null,
          importance: seed.importance ?? 3,
          participants: seed.participants ?? [],
          participantIds: (seed.participants ?? [])
            .map((name) => resolveEntity(next, name)?.id)
            .filter((id): id is string => Boolean(id)),
          sourceEventId: eventIdFor(milestone.id),
        },
      ],
    };
  }

  for (const grant of milestone.grantsJutsu ?? []) {
    next = grantJutsu(next, grant, happenedAt);
  }

  if (milestone.grantsAbilities?.length) {
    next = applyAbilityChanges(next, { abilitiesChanged: milestone.grantsAbilities });
  }

  if (milestone.canonPoint) {
    next = { ...next, state: { ...next.state, canonPoint: milestone.canonPoint.slice(0, 220) } };
  }

  return next;
}

/** Records a jutsu Kan gained from a story beat, once. */
function grantJutsu(db: AppDatabase, grant: CanonJutsuGrant, when: CalendarDate): AppDatabase {
  const lower = grant.name.toLowerCase();
  const hasRecord = db.jutsuRecords.some(
    (record) => record.name.toLowerCase() === lower && record.user.toLowerCase() === 'kan'
  );
  const jutsuRecords = hasRecord
    ? db.jutsuRecords
    : [
        ...db.jutsuRecords,
        {
          id: makeId('jutsu'),
          name: grant.name,
          user: 'Kan',
          chakraNature: grant.chakraNature,
          effect: grant.effect,
          visual: grant.visual,
          firstSeen: when,
          lastSeen: when,
          timesUsed: 0,
          description: grant.description,
          tags: [...new Set(['signature', 'kan', ...(grant.tags ?? [])])],
        },
      ];
  const known = db.state.jutsu.some((name) => name.toLowerCase() === lower);

  return {
    ...db,
    jutsuRecords,
    state: known ? db.state : { ...db.state, jutsu: [...db.state.jutsu, grant.name] },
  };
}

/** A gated beat is open only once the beat it follows has actually happened. */
function gateOpen(db: AppDatabase, milestone: CanonMilestone): boolean {
  return (!milestone.after || hasFired(db, milestone.after)) && (!milestone.requires || conditionHolds(db, milestone.requires));
}

/** You and whoever is in the scene. */
function sceneWitnesses(db: AppDatabase): string[] {
  return ['Kan', ...(db.state.sceneCast ?? [])];
}

// ---------------------------------------------------------------------------
// State-tracker marks
// ---------------------------------------------------------------------------

/**
 * completed → happened with Kan there (attendance fact, heard as "witnessed").
 * engaged   → a personal beat has started but not finished.
 * passed    → the window closed without Kan; logs a "never crossed paths" fact.
 */
export function applyCanonMarks(
  db: AppDatabase,
  completedIds: string[],
  engagedIds: string[],
  passedIds: string[] = []
): AppDatabase {
  let next = db;
  let progress = normalizeProgress(next);

  for (const id of completedIds) {
    const milestone = byId.get(id);

    if (!milestone) {
      continue;
    }

    if (!progress.completed.includes(id)) {
      // The state reply confirmed the moment itself: it happens now, seen by
      // you and whoever is in the scene.
      next = fireMilestone(next, milestone, next.state.inStoryDate, sceneWitnesses(next));
      progress = { ...progress, completed: [...progress.completed, id] };
    }

    progress = {
      ...progress,
      heard: {
        ...(progress.heard ?? {}),
        [eventIdFor(id)]: { from: 'witnessed', date: next.state.inStoryDate },
      },
      active: dropId(progress.active, id),
      engaged: dropId(progress.engaged, id),
    };

    if (milestone.attendanceFact) {
      next = addFactOnce(next, `fact_attended_${id}`, milestone.attendanceFact, ['Kan']);
    }
  }

  for (const id of engagedIds) {
    const milestone = byId.get(id);

    if (!milestone?.playerDriven || progress.completed.includes(id)) {
      continue;
    }

    // Accepted, not done: nothing it promises is true yet (no facts, no
    // threads, no canon point) until the state reply marks it completed.
    progress = {
      ...progress,
      active: addId(progress.active, id),
      engaged: addId(progress.engaged, id),
    };
  }

  for (const id of passedIds) {
    const milestone = byId.get(id);

    if (!milestone?.attendanceFact) {
      continue;
    }

    if (!progress.completed.includes(id)) {
      next = fireMilestone(next, milestone);
    }

    progress = {
      ...progress,
      completed: addId(progress.completed, id),
      active: dropId(progress.active, id),
      engaged: dropId(progress.engaged, id),
    };
    next = addMissedFact(next, milestone);
  }

  return withProgress(next, progress);
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

/**
 * Moves the world forward to the current in-story date. Only the date decides
 * what fires — never how many turns have been played. While Kan is in a fight
 * nothing fires or expires; everything due waits until the fight is over.
 */
export function advanceCanon(db: AppDatabase, options: { inCombat?: boolean } = {}): AppDatabase {
  let next = db;
  let progress = normalizeProgress(next);
  const now = next.state.inStoryDate;
  const inCombat = options.inCombat ?? isCombatPace(next.state.scenePace);

  if (progress.version !== CANON_VERSION || !progress.baselineDate) {
    progress = { ...progress, version: CANON_VERSION, baselineDate: now, baselineTurn: 0 };
  }

  if (inCombat) {
    return withProgress(next, { ...progress, heldForCombat: true });
  }

  progress = { ...progress, heldForCombat: false };

  const baseline = progress.baselineDate ?? now;
  const baselineKey = dayKey(baseline);
  const baselineSort = dateSortValue(baseline);
  const nowSort = dateSortValue(now);
  const today = dayKey(now);
  const completed = new Set(progress.completed);
  const complete = (id: string) => {
    completed.add(id);
    progress = { ...progress, completed: addId(progress.completed, id) };
  };

  // A world event is stamped with the day it happened, not the day Kan's
  // clock caught up with it (clamped to the start of this save).
  const happenedAt = (milestone: CanonMilestone): CalendarDate => {
    const opens = milestoneOpensAt(milestone);
    const sort = dateSortValue(opens);

    if (sort > nowSort) return now;
    if (sort < baselineSort) return baseline;
    return opens;
  };

  // Every earlier world milestone must have fired first.
  let worldChainIntact = true;

  for (const milestone of CANON_MILESTONES) {
    const { id } = milestone;

    if (completed.has(id)) {
      continue;
    }

    // Closed before this save began: done silently, never shown.
    if (milestone.to && dayKey(milestone.to) < baselineKey) {
      complete(id);
      progress = { ...progress, expired: addId(progress.expired ?? [], id) };
      continue;
    }

    const { started, notClosed } = windowOpen(milestone, today);

    if (milestone.playerDriven) {
      if (progress.engaged.includes(id)) {
        progress = { ...progress, active: addId(progress.active, id) };
      } else if (!notClosed) {
        complete(id);
        progress = { ...progress, active: dropId(progress.active, id) };
        if (gateOpen(next, milestone)) {
          next = addMissedFact(next, milestone);
        }
      }

      continue;
    }

    if (!started || !worldChainIntact) {
      worldChainIntact = false;
      continue;
    }

    // Safety net: someone it is about is already dead in this save (an old
    // save from before canon protected itself). Skip it; never fire it as written.
    if (missingKeyActor(next, milestone)) {
      complete(id);
      progress = { ...progress, expired: addId(progress.expired ?? [], id) };
      continue;
    }

    next = fireMilestone(next, milestone, happenedAt(milestone));
    complete(id);

    if (milestone.encounter) {
      if (notClosed) {
        progress = { ...progress, active: addId(progress.active, id) };
      } else {
        next = addMissedFact(next, milestone);
      }
    }
  }

  // Close encounter windows that have run out.
  for (const activeId of [...progress.active]) {
    const milestone = byId.get(activeId);

    if (milestone && !(milestone.to && today > dayKey(milestone.to))) {
      continue;
    }

    progress = { ...progress, active: dropId(progress.active, activeId) };

    if (!milestone) {
      continue;
    }

    const wasEngaged = progress.engaged.includes(activeId);

    complete(activeId);
    progress = { ...progress, engaged: dropId(progress.engaged, activeId) };

    // A beat you accepted is not missed: if the page never showed the moment
    // itself, it happened off the page by the time its window closed.
    if (!wasEngaged) {
      next = addMissedFact(next, milestone);
    } else if (!hasFired(next, milestone.id)) {
      next = fireMilestone(next, milestone, next.state.inStoryDate, sceneWitnesses(next));
    }
  }

  return withProgress(next, progress);
}

// ---------------------------------------------------------------------------
// Queries used by the prompt
// ---------------------------------------------------------------------------

export function activeCanonMilestones(db: AppDatabase): CanonMilestone[] {
  const progress = normalizeProgress(db);

  return CANON_MILESTONES.filter(
    ({ id }) => progress.active.includes(id) && !progress.completed.includes(id)
  );
}

/** How many personal beats the narrator is offered per turn. */
export const PERSONAL_OFFERS_PER_TURN = 2;

/**
 * Personal beats whose window is open and that have not started: priority
 * beats first, then the one closing soonest, so a short mission offer (a
 * beast hunt) is not buried under a beat that stays open for years.
 */
export function upcomingCanonMilestones(db: AppDatabase, limit = 3): CanonMilestone[] {
  const progress = normalizeProgress(db);
  const today = dayKey(db.state.inStoryDate);
  const closes = (milestone: CanonMilestone) =>
    milestone.to ? dayKey(milestone.to) : Number.POSITIVE_INFINITY;

  return CANON_MILESTONES.filter((milestone) => {
    const { started, notClosed } = windowOpen(milestone, today);

    return (
      milestone.playerDriven &&
      !progress.completed.includes(milestone.id) &&
      !progress.engaged.includes(milestone.id) &&
      started &&
      notClosed &&
      gateOpen(db, milestone)
    );
  })
    .sort((a, b) => {
      if (Boolean(a.priority) !== Boolean(b.priority)) return a.priority ? -1 : 1;
      return closes(a) === closes(b) ? 0 : closes(a) < closes(b) ? -1 : 1;
    })
    .slice(0, limit);
}

export function recentlyConcludedMilestones(db: AppDatabase, limit = 3): CanonMilestone[] {
  const progress = normalizeProgress(db);
  const expired = new Set(progress.expired ?? []);

  return CANON_MILESTONES.filter(
    ({ id }) => progress.completed.includes(id) && !expired.has(id)
  )
    .slice(-limit)
    .reverse();
}

/** World events planned within the next `days` days (at most 3). */
export function upcomingWorldMilestones(
  db: AppDatabase,
  days = 10
): { milestone: CanonMilestone; daysUntil: number }[] {
  const progress = normalizeProgress(db);
  const now = db.state.inStoryDate;
  const today = dayKey(now);
  const horizon = dayKey(shiftDate(now, days));

  return CANON_MILESTONES.filter((milestone) => {
    const opens = dayKey(milestone.from);

    return (
      !milestone.playerDriven &&
      !progress.completed.includes(milestone.id) &&
      opens > today &&
      opens <= horizon
    );
  })
    .map((milestone) => ({
      milestone,
      daysUntil: Math.max(0, daysBetween(now, milestoneOpensAt(milestone))),
    }))
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 3);
}

export function recentCanonEvents(db: AppDatabase, limit = 4) {
  return db.events
    .filter((event) => event.tags.includes('canon'))
    .sort((a, b) => dateSortValue(b.inStoryDate) - dateSortValue(a.inStoryDate))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// News: where events happen, who could know, and how word travels
// ---------------------------------------------------------------------------

export function milestoneRegion(milestone: CanonMilestone): string {
  return milestone.region ?? 'the shinobi world';
}

export function milestoneLocation(milestone: CanonMilestone): string {
  return milestone.location ?? milestoneRegion(milestone);
}

export function milestoneKnowledge(milestone: CanonMilestone): CanonKnowledge {
  return milestone.knowledge ?? 'public';
}

export function milestoneBearers(milestone: CanonMilestone): string[] {
  const knowledge = milestoneKnowledge(milestone);

  return knowledge === 'secret' ? milestone.bearers ?? [] : BEARERS_BY_KNOWLEDGE[knowledge];
}

export function milestoneChannel(milestone: CanonMilestone): string {
  const knowledge = milestoneKnowledge(milestone);
  const regional =
    knowledge === 'public' || knowledge === 'village'
      ? REGION_CHANNEL[milestoneRegion(milestone)]
      : undefined;

  return regional ?? CHANNEL_BY_KNOWLEDGE[knowledge];
}

export type UnheardNews = {
  eventId: string;
  milestoneId: string;
  title: string;
  summary: string;
  date: CalendarDate;
  major: boolean;
  region: string;
  location: string;
  bearers: string[];
  channel: string;
  knowledge: CanonKnowledge;
  daysOld: number;
};

/** Major news counts this many times over while it waits. */
export const MAJOR_NEWS_WEIGHT = 4;

/** Waiting this long (weighted) makes news overdue: a week for major news, four for minor. */
export const NEWS_OVERDUE_WEIGHTED_DAYS = 28;

/** Waiting this long (weighted) makes news due: it should come in when any bearer fits. */
export const NEWS_DUE_WEIGHTED_DAYS = 12;

/**
 * How pressing a piece of news is. Major news escalates fast; minor news
 * escalates too, just four times slower, so it never starves behind the big
 * stories.
 */
export function newsUrgency(item: Pick<UnheardNews, 'major' | 'daysOld'>): 'fresh' | 'due' | 'overdue' {
  const weighted = item.daysOld * (item.major ? MAJOR_NEWS_WEIGHT : 1);

  if (weighted >= NEWS_OVERDUE_WEIGHTED_DAYS) return 'overdue';
  if (weighted >= NEWS_DUE_WEIGHTED_DAYS) return 'due';
  return 'fresh';
}

/** Queue order: (days waiting + 1) × weight, so fresh major news leads but old minor news catches up. */
function newsPriority(item: Pick<UnheardNews, 'major' | 'daysOld'>) {
  return (item.daysOld + 1) * (item.major ? MAJOR_NEWS_WEIGHT : 1);
}

/** The last time any news reached Kan (not counting beats he witnessed), or the story's start. */
export function lastNewsHeardDate(db: AppDatabase): CalendarDate {
  const progress = normalizeProgress(db);
  let latest: CalendarDate | null = null;

  for (const record of Object.values(progress.heard ?? {})) {
    if (record.from === 'witnessed' || !record.date) {
      continue;
    }

    if (!latest || dateSortValue(record.date) > dateSortValue(latest)) {
      latest = record.date;
    }
  }

  return latest ?? progress.baselineDate ?? db.state.inStoryDate;
}

/**
 * Fired events Kan has not heard about, most pressing first: by weighted
 * waiting time, then major first, then oldest first.
 */
export function unheardCanonNews(db: AppDatabase, limit = 3): UnheardNews[] {
  const heard = normalizeProgress(db).heard ?? {};
  const news: UnheardNews[] = [];

  for (const event of db.events) {
    if (!event.tags.includes('canon') || heard[event.id]) {
      continue;
    }

    const milestoneId = event.id.replace('event_canon_', '');
    const milestone = byId.get(milestoneId);

    if (!milestone) {
      continue;
    }

    news.push({
      eventId: event.id,
      milestoneId,
      title: milestone.title,
      summary: milestone.description,
      date: event.inStoryDate,
      major: Boolean(milestone.major),
      region: milestoneRegion(milestone),
      location: milestoneLocation(milestone),
      bearers: milestoneBearers(milestone),
      channel: milestoneChannel(milestone),
      knowledge: milestoneKnowledge(milestone),
      daysOld: Math.max(0, daysBetween(event.inStoryDate, db.state.inStoryDate)),
    });
  }

  return news
    .sort(
      (a, b) =>
        newsPriority(b) - newsPriority(a) ||
        (a.major !== b.major ? (a.major ? -1 : 1) : dayKey(a.date) - dayKey(b.date))
    )
    .slice(0, limit);
}

/**
 * Records who told Kan. Accepts at most `limit` relays per call: one piece
 * of news per turn, or the size of a catch-up report (see newsDelivery.ts).
 */
export function markNewsHeard(
  db: AppDatabase,
  relays: { id: string; from?: string }[],
  limit = NEWS_PER_TURN
): AppDatabase {
  if (relays.length === 0) {
    return db;
  }

  const progress = normalizeProgress(db);
  const heard = { ...(progress.heard ?? {}) };
  let delivered = 0;

  for (const relay of relays) {
    if (delivered >= limit) {
      break;
    }

    const eventId = relay.id.startsWith('event_canon_') ? relay.id : eventIdFor(relay.id);

    if (heard[eventId] || !db.events.some((event) => event.id === eventId)) {
      continue;
    }

    delivered += 1;
    heard[eventId] = { from: relay.from?.trim() || 'a rumor', date: db.state.inStoryDate };
  }

  return withProgress(db, { ...progress, heard });
}

export function hasHeardNews(db: AppDatabase, eventId: string): boolean {
  return Boolean(normalizeProgress(db).heard?.[eventId]);
}

// ---------------------------------------------------------------------------
// World clock: a read-only view of the scheduler for the hidden screen.
// ---------------------------------------------------------------------------

export type WorldClockFired = {
  milestone: CanonMilestone;
  date: CalendarDate;
  heardFrom: string | null;
  heardOn: CalendarDate | null;
  expired: boolean;
};

export type WorldClockQueued = {
  milestone: CanonMilestone;
  opensAt: CalendarDate;
  daysUntil: number;
  /** Its date has arrived but it is waiting (a fight, or an earlier event). */
  due: boolean;
};

export type WorldClock = {
  now: CalendarDate;
  heldForCombat: boolean;
  inCombat: boolean;
  fired: WorldClockFired[];
  unheard: UnheardNews[];
  queued: WorldClockQueued[];
  offers: CanonMilestone[];
  missed: CanonMilestone[];
};

export function worldClock(db: AppDatabase): WorldClock {
  const progress = normalizeProgress(db);
  const completed = new Set(progress.completed);
  const expired = new Set(progress.expired ?? []);
  const heard = progress.heard ?? {};
  const now = db.state.inStoryDate;
  const nowSort = dateSortValue(now);
  const today = dayKey(now);
  const world = CANON_MILESTONES.filter((milestone) => !milestone.playerDriven);
  const personal = CANON_MILESTONES.filter((milestone) => milestone.playerDriven);

  const fired: WorldClockFired[] = world
    .flatMap((milestone) => {
      const event = db.events.find((item) => item.id === eventIdFor(milestone.id));

      if (!event && !completed.has(milestone.id)) {
        return [];
      }

      const record = heard[eventIdFor(milestone.id)];

      return [
        {
          milestone,
          date: event?.inStoryDate ?? milestoneOpensAt(milestone),
          heardFrom: record?.from ?? null,
          heardOn: record?.date ?? null,
          expired: expired.has(milestone.id) && !event,
        },
      ];
    })
    .sort((a, b) => dateSortValue(b.date) - dateSortValue(a.date));

  const queued: WorldClockQueued[] = world
    .filter((milestone) => !completed.has(milestone.id))
    .map((milestone) => {
      const opensAt = milestoneOpensAt(milestone);

      return {
        milestone,
        opensAt,
        daysUntil: Math.max(0, daysBetween(now, opensAt)),
        due: dateSortValue(opensAt) <= nowSort,
      };
    });

  const offers = personal.filter((milestone) => {
    const { started, notClosed } = windowOpen(milestone, today);
    return !completed.has(milestone.id) && started && notClosed;
  });

  const missed = personal.filter(
    (milestone) =>
      completed.has(milestone.id) &&
      db.facts.some((fact) => fact.id === `fact_missed_${milestone.id}`)
  );

  return {
    now,
    heldForCombat: Boolean(progress.heldForCombat),
    inCombat: isCombatPace(db.state.scenePace),
    fired,
    unheard: unheardCanonNews(db, 99),
    queued,
    offers,
    missed,
  };
}
