/**
 * Background memory pipeline.
 *
 * A turn is two model calls, then background summaries:
 *  1. The narrator streams prose only (no JSON). The prose is saved as soon as
 *     it finishes.
 *  2. The state step: a cheap model reads that prose and returns the state
 *     change (clock, bonds, facts, canon) as structured JSON, which is applied
 *     and saved straight away. It never waits on a summary.
 *  3. Summaries (time skip, scene, arc, year) run afterwards as separate jobs.
 *     Each job reads the latest copy of the save, calls the model, and then
 *     applies its result to whatever the save looks like *now* — never to the
 *     copy it started from — so edits, undo and new turns made in the
 *     meantime are kept.
 *
 * Jobs are stored in the save (`db.memoryJobs`). A job that fails stays there
 * as "pending" until it is retried, and is dropped once the turn it belongs
 * to no longer exists (undo, regenerate).
 */
import { bingoListings, formatRyo } from './reputation';
import { CANON_MILESTONES } from './canonData';
import { syncBondSides } from './bonds';
import { isDeceased, markKnownDeathsOnBonds } from './deaths';
import { castWithCompanions } from './companions';
import { markMet } from './met';
import { applyStoryHooks } from './hooks';
import { advanceCanon, applyCanonMarks, isCombatPace, markNewsHeard, unfireFutureMilestones } from './canon';
import { applyCanonEndgames } from './canonEndgame';
import { deliverLetters, receiveLetters, sendLetters, turnLetterOffer } from './letters';
import { advanceLives, applyLifeEvents, markReunions } from './lives';
import { advanceConsequences, applyConsequences, markConsequenceOffered, turnConsequenceOffer } from './consequences';
import { applyEpithet, markEpithetsSeen, recordDeeds } from './renown';
import { applyYearly, yearlyOffer } from './yearly';
import { recordTravel } from './mapData';
import { applyWeather, weatherFromNarration } from './weather';
import { applySafehouses } from './safehouses';
import { applyPurse } from './money';
import {
  FLASHBACK_BY_ID,
  activeFlashback,
  ageWord,
  applyFlashbackMarks,
  applyFlashbackTurn,
  applyFlashbackWriteUp,
  kanAgeAt,
} from './flashbacks';
import { parsePovLines, povCandidates, resolvePovs } from './povMemories';
import { filterCanonMarks, newsAllowance, newsOffer } from './newsDelivery';
import type { DebugEvent } from './debugEvents';
import { MAX_SKIP_SECONDS, allowedSkip, describeSpan, requestedSkip } from './timeSkip';
import { daysBetween, secondsBetween, shiftDatesAfter, shiftSeconds } from './calendar';
import { mentionsEntity } from './characterRefs';
import { buildIndices } from './db';
import { makeId } from './id';
import { inferScenePace, resolveTurnClock, validateScenePace } from './pacing';
import { CONVERSATION_MODE_MINIMUM_SECONDS, applySceneBeat, cleanFightOptions } from './sceneMode';
import { resolveEntity } from './entities';
import { applyNameStep, displayName, nameLeaks, scrubNameLeaks } from './names';
import { fallbackDiffFromProse, preferPlayerJutsuNames } from './proseFallback';
import {
  applyTurnDiff,
  extractTurnDiff,
  isRest,
  foldSagaSummary,
  rollArcSummary,
  summarizeScene,
  summarizeTimeSkip,
} from './services';
import { storyMessagesSinceLastSummary } from './log';
import { firstSentences, shortTitle } from './util';
import { detectNarrationTime } from './timeparse';
import type {
  AppDatabase,
  CalendarDate,
  EventRecord,
  MemoryJob,
  MemoryJobKind,
  RawLogEntry,
  SummaryRecord,
  TurnDiff,
} from './types';

const TIME_SKIP_DAYS = 180;
/** Most story messages one chapter summary covers; the rest wait for the next. */
const MAX_SCENE_MESSAGES = 16;
/** Fewest new messages worth a chapter summary, unless the scene ended. */
const MIN_SCENE_MESSAGES = 4;
const ARC_SIZE = 3;
const SUMMARY_TAG = 'summary';

// ---------------------------------------------------------------------------
// Lookups

function jobsOf(db: AppDatabase): MemoryJob[] {
  return db.memoryJobs ?? [];
}

function storyLog(db: AppDatabase): RawLogEntry[] {
  return db.rawLog.filter((entry) => entry.kind === 'story');
}

function hasLog(db: AppDatabase, logId: string) {
  return db.rawLog.some((entry) => entry.id === logId);
}

function lastAssistantId(db: AppDatabase) {
  const story = storyLog(db);

  for (let index = story.length - 1; index >= 0; index -= 1) {
    if (story[index].role === 'assistant') {
      return story[index].id;
    }
  }

  return null;
}

function chapterSummaries(db: AppDatabase) {
  return db.summaries.filter((summary) => summary.level === 'chapter');
}

/**
 * Story messages no chapter summary covers yet, oldest first. A message
 * counts as covered when a summary lists it, or (for older saves whose
 * summaries don't list their messages) when it is older than the newest one.
 */
export function unsummarizedStory(db: AppDatabase): RawLogEntry[] {
  const chapters = chapterSummaries(db);
  const covered = new Set(chapters.flatMap((summary) => summary.sourceLogIds ?? []));
  const untracedAt = Math.max(
    0,
    ...chapters.filter((summary) => !summary.sourceLogIds?.length).map((summary) => summary.createdAt)
  );

  // Flashback turns are written up as their own memory, never as a chapter.
  return storyLog(db).filter((entry) => !entry.flashback && !covered.has(entry.id) && entry.createdAt > untracedAt);
}

function sameIds(a: string[] | undefined, b: string[] | undefined) {
  if (!a || !b || a.length !== b.length) {
    return false;
  }

  return a.every((id, index) => id === b[index]);
}

function errorText(caught: unknown) {
  const message = caught instanceof Error ? caught.message : String(caught ?? '');
  return (message || 'Unknown error').slice(0, 160);
}

function newJob(kind: MemoryJobKind, turnLogId: string, extra: Partial<MemoryJob>): MemoryJob {
  return {
    id: makeId('memjob'),
    kind,
    status: 'queued',
    turnLogId,
    attempts: 0,
    createdAt: Date.now(),
    ...extra,
  };
}

/** Whether a job still makes sense for this copy of the save. */
export function isJobValid(db: AppDatabase, job: MemoryJob): boolean {
  switch (job.kind) {
    case 'state':
      // A state step only belongs to the newest turn: once another turn has
      // been narrated, applying an older turn's clock and bonds would be wrong.
      return lastAssistantId(db) === job.turnLogId;
    case 'timeSkip':
      return hasLog(db, job.turnLogId) && Boolean(job.fromDate && job.toDate);
    case 'scene':
      return (job.logIds ?? []).filter((id) => hasLog(db, id)).length >= 2;
    case 'flashback':
      // Its memory must still exist (an undone ending removes it).
      return (
        (job.logIds ?? []).filter((id) => hasLog(db, id)).length >= 2 &&
        db.events.some((event) => event.tags.includes('flashback') && event.tags.includes(job.flashbackId ?? ''))
      );
    case 'arc': {
      const ids = job.summaryIds ?? [];
      return ids.length >= ARC_SIZE && ids.every((id) => db.summaries.some((s) => s.id === id));
    }
    case 'saga': {
      const ids = job.summaryIds ?? [];
      return ids.length === 1 && db.summaries.some((s) => s.id === ids[0] && s.level === 'arc');
    }
    // Year summaries are no longer made (nothing read them); queued ones are dropped.
    case 'year':
      return false;
    default:
      return false;
  }
}

/** Jobs waiting for a retry: everything valid that isn't running right now. */
export function pendingMemoryJobs(db: AppDatabase | null, activeIds: ReadonlySet<string>) {
  if (!db) {
    return [];
  }

  return jobsOf(db).filter((job) => !activeIds.has(job.id) && isJobValid(db, job));
}

function withJobs(db: AppDatabase, jobs: MemoryJob[]): AppDatabase {
  return { ...db, memoryJobs: jobs };
}

export function removeJob(db: AppDatabase, jobId: string): AppDatabase {
  return withJobs(
    db,
    jobsOf(db).filter((job) => job.id !== jobId)
  );
}

export function markJobFailed(db: AppDatabase, jobId: string, caught: unknown): AppDatabase {
  return withJobs(
    db,
    jobsOf(db).map((job) =>
      job.id === jobId
        ? { ...job, status: 'failed', attempts: job.attempts + 1, error: errorText(caught) }
        : job
    )
  );
}

export function markJobsQueued(db: AppDatabase, jobIds: string[]): AppDatabase {
  const ids = new Set(jobIds);
  return withJobs(
    db,
    jobsOf(db).map((job) => (ids.has(job.id) ? { ...job, status: 'queued', error: undefined } : job))
  );
}

/** Drops jobs whose turn no longer exists. */
export function pruneJobs(db: AppDatabase, keepIds: ReadonlySet<string> = new Set()): AppDatabase {
  const jobs = jobsOf(db);
  const kept = jobs.filter((job) => keepIds.has(job.id) || isJobValid(db, job));
  return kept.length === jobs.length ? db : withJobs(db, kept);
}

// ---------------------------------------------------------------------------
// Phase 1: the state step

export type TurnInfo = {
  turnLogId: string;
  userMessage: string;
  narration: string;
};

export type StateStepResult = {
  db: AppDatabase;
  /** Follow-up summary jobs that were queued by this step. */
  followUpIds: string[];
  /** Short "world news" line to show, if a canon event was relayed. */
  notice: string | null;
  /** The diff that was applied, after the app settled the clock. */
  appliedDiff: TurnDiff | null;
  /** Names the narration used outside dialogue that Kan couldn't know (for the Debug panel). */
  nameLeaks?: string[];
  /** What the engine refused, dropped or merged on its own (for the Debug panel). */
  events: DebugEvent[];
};

/**
 * Applies a turn's state change to `latest` and queues the summaries it
 * calls for. Pure: the caller saves the result.
 */
export function applyStateStep(
  latest: AppDatabase,
  stateReply: TurnDiff | null,
  turn: TurnInfo,
  activeIds: ReadonlySet<string>
): StateStepResult {
  // A turn played inside a flashback moves only the memory (see flashbacks.ts).
  const turnEntry = latest.rawLog.find((entry) => entry.id === turn.turnLogId);

  if (turnEntry?.flashback) {
    return applyMemoryStep(latest, stateReply, turn);
  }

  // Unreadable state reply: still record who the prose shows and the jutsu
  // Kan called in his own message. Clock and pace come from the prose below.
  // Kan's jutsu always keep the names the player wrote.
  const events: DebugEvent[] = [];
  const extraction = stateReply
    ? preferPlayerJutsuNames(latest, stateReply, turn.userMessage)
    : fallbackDiffFromProse(latest, turn);
  const beforeDate = latest.state.inStoryDate;
  const parsedTime = detectNarrationTime(turn.narration, beforeDate);
  const reportedSeconds = extraction?.state?.elapsedSeconds ?? 0;
  const pace = validateScenePace(extraction?.state?.scenePace, turn.narration) ?? inferScenePace(turn.narration);
  const sceneEnded = extraction?.scene?.ended ?? false;
  // The mode the reply was narrated in (set when it was saved).
  const modeUsed = latest.rawLog.find((entry) => entry.id === turn.turnLogId)?.sceneMode;
  // A time skip the player asked for, if the tracker agrees (audit 4.4).
  const skipSeconds = allowedSkip(latest, turn.userMessage, reportedSeconds, isCombatPace(pace) && !sceneEnded);

  if (skipSeconds) {
    events.push({ kind: 'mode', text: `Time skip: ${describeSpan(skipSeconds)}.` });
  } else if (requestedSkip(turn.userMessage, beforeDate)) {
    const why = isCombatPace(pace) && !sceneEnded ? 'a fight is on' : 'the tracker did not agree on how long passed';
    events.push({ kind: 'refused', text: `Time skip refused: ${why}.` });
  }

  const clock = resolveTurnClock({
    skipSeconds,
    proseOnly: !stateReply,
    reportedSeconds,
    reportedClock: extraction?.state?.clockTime,
    detected: parsedTime,
    pace,
    sceneEnded,
    current: beforeDate,
    // A line or two of real conversation takes seconds, not minutes.
    minimumSeconds: modeUsed === 'conversation' && pace === 'conversation' ? CONVERSATION_MODE_MINIMUM_SECONDS : undefined,
  });

  // The clock always moves: resolveTurnClock folds the reported time, the
  // parsed time and the pace minimum into one forward step.
  const merged = { ...(extraction ?? {}) };
  merged.state = {
    ...(merged.state ?? {}),
    elapsedSeconds: clock.elapsedSeconds,
    scenePace: pace,
    clockTime: undefined,
    inStoryDate: undefined,
  };
  const effectiveDiff: TurnDiff = merged;

  let next = applyTurnDiff(latest, effectiveDiff, { events });

  // No tracker reply: people the prose shows join the scene cast, but only
  // people Kan has already met (the fallback never meets anyone new). Nobody
  // is taken out: someone silent in a reply may still be in the room.
  if (!stateReply && extraction?.suggestedCast?.length) {
    const current = next.state.sceneCast ?? [];
    const joined = extraction.suggestedCast.filter((name) => {
      const entity = resolveEntity(next, name);
      return entity && entity.met !== false && !isDeceased(entity) && !current.includes(entity.name);
    });

    if (joined.length > 0) {
      next = { ...next, state: { ...next.state, sceneCast: castWithCompanions(next, [...current, ...joined]) } };
      events.push({ kind: 'fallback', text: `Added to the scene from the prose: ${joined.join(', ')}.` });
    }
  }

  // Someone Kan had not seen in a long time is here again.
  next = markReunions(latest, next);
  const appliedSeconds = Math.max(0, secondsBetween(beforeDate, next.state.inStoryDate));
  const stalled = latest.state.turnsWithoutTimeChange ?? 0;

  // Fight moves to offer under the reply, only while the fight goes on.
  const fightGoesOn = !sceneEnded && (pace === 'combat' || extraction?.beat?.kind === 'combat');
  const fightOptions = fightGoesOn ? cleanFightOptions(extraction?.fightOptions) : undefined;

  next = {
    ...next,
    // The chip under the reply shows this, and tapping it corrects it.
    rawLog: next.rawLog.map((entry) =>
      entry.id === turn.turnLogId
        ? { ...entry, elapsedSeconds: appliedSeconds, fightOptions, ...(extraction?.imageWorthy ? { imageWorthy: true } : {}) }
        : entry
    ),
    state: {
      ...next.state,
      // Counts turns where only the pace minimum moved the clock.
      turnsWithoutTimeChange: clock.storyTimed ? 0 : Math.min(stalled + 1, 9),
    },
  };
  // How the turn played: the conversation streak, the mode, the chip choice.
  next = applySceneBeat(next, {
    beat: extraction?.beat,
    modeUsed,
    input: turn.userMessage,
    narration: turn.narration,
    pace,
    sceneEnded,
  });
  // A real chapter break opens a new chapter with this turn (and a new scene).
  const chapterBefore = next.state.chapter;
  next = applyChapterBreak(latest, next, turn.turnLogId, {
    title: extraction?.chapterTitle,
    majorCompleted: (extraction?.canonCompleted ?? []).some((id) => CANON_MILESTONES.some((m) => m.id === id && m.major)),
    elapsedSeconds: clock.elapsedSeconds,
  });

  // Which scene this turn belongs to, and who was in it: memories are cut
  // and shared by this, never by names in their text.
  next = stampTurnScene(latest, next, turn.turnLogId, extraction?.scene?.ended === true, next.state.chapter !== chapterBefore);
  // Kan's road and the scene's weather (held through the scene unless the page changed it).
  next = recordTravel(next);
  // A miss by the tracker no longer leaves the sky wrong: the prose's own
  // rain, snow or fog wins over the world's roll for this turn.
  next = applyWeather(next, extraction?.weather ?? weatherFromNarration(next, turn.narration));

  // One piece of news per turn (or one catch-up report); nothing in the
  // world fires mid-fight. The allowance comes from the state the turn's
  // prompt was built on.
  const allowance = newsAllowance(latest);
  // Canon marks count only for the beats the tracker was shown this turn: a
  // confused reply must never kill someone years early or grant a power.
  const marks = filterCanonMarks(latest, {
    completed: extraction?.canonCompleted,
    engaged: extraction?.canonEngaged,
    passed: extraction?.canonPassed,
    relayed: extraction?.newsRelayed,
  });
  for (const drop of marks.dropped) {
    events.push({
      kind: drop.reason.startsWith('news') ? 'mode' : 'dropped',
      text: `canon_${drop.as} "${drop.id}" ${drop.reason === 'news, read as relayed' ? 'is news: read as news_relayed' : 'ignored: it was not offered this turn'}.`,
    });
  }
  const relays = marks.relayed.slice(0, allowance);
  const inCombat = isCombatPace(pace) && !sceneEnded;

  next = applyCanonMarks(next, marks.completed, marks.engaged, marks.passed);
  next = markNewsHeard(next, relays, allowance);

  // Old minor news folded into this turn's delivery was heard in passing,
  // once the turn delivered any news at all.
  const folded = newsOffer(latest, { ignoreCombat: true })?.inPassing ?? [];

  if (relays.length > 0 && folded.length > 0) {
    next = markNewsHeard(
      next,
      folded.map((item) => ({ id: item.milestoneId, from: 'in passing' })),
      folded.length
    );
  }
  next = advanceCanon(next, { inCombat });
  // Names Kan heard, read or recognised this turn, and identities the world
  // revealed to him (the mask breaking); labels for anyone he can't name.
  const presentIds =
    next.rawLog.find((entry) => entry.id === turn.turnLogId)?.sceneCastIds ??
    (next.state.sceneCast ?? []).map((name) => resolveEntity(next, name)?.id).filter((id): id is string => Boolean(id));
  next = applyNameStep(next, {
    learned: extraction?.namesLearned,
    told: extraction?.namesTold,
    narration: turn.narration,
    presentIds,
  });
  // Canon-bound hearts whose time has come go to their canon partners.
  next = applyCanonEndgames(next);

  // Side characters' lives move on; consequences fade or (witnesses) talk.
  next = applyLifeEvents(next, extraction?.lifeEvents);
  next = advanceLives(next);
  next = advanceConsequences(next);

  // Letters: what Kan sent sets out, what reached him on the page is read,
  // and his letters that arrived by now move their reader's bond.
  next = receiveLetters(next, extraction?.lettersReceived, turnLetterOffer(latest));
  next = sendLetters(next, extraction?.lettersSent, turn.userMessage);
  next = deliverLetters(next);

  // What people saw becomes talk and a name; choices that could come back
  // are kept. The offers come from the state this turn's prompt was built on.
  next = recordDeeds(next, extraction?.reputation);
  next = applyEpithet(next, extraction?.epithet);
  next = markEpithetsSeen(next, extraction?.bountySeen);
  const offeredSeed = turnConsequenceOffer(latest);
  const planted = applyConsequences(next, extraction?.consequences, extraction?.consequencesReturned, offeredSeed);
  next = markConsequenceOffered(planted.db, offeredSeed);
  // Kan's own money: what he paid, was paid, found or lost, and his total
  // when the prose states it.
  next = applyPurse(next, extraction?.money, extraction?.moneyCounted);
  // Where Kan stays: a place he sleeps at or settles in, what is stashed or built there, who
  // knows (after consequences, so a found place that came back this turn is compromised).
  // Only real downtime counts as sleeping somewhere: a long day on the road is not a night's rest.
  next = applySafehouses(latest, next, extraction?.safehouse, {
    rested: isRest(effectiveDiff) && pace === 'downtime',
    elapsedSeconds: clock.elapsedSeconds,
  });
  // The day's birthday or anniversary was offered (once a year), and any
  // birthday Kan learned is kept.
  next = applyYearly(next, yearlyOffer(latest), extraction?.birthdaysLearned);
  // A memory offered on this reply waits for Kan; one he follows starts next turn.
  next = applyFlashbackMarks(next, {
    offeredId: turnEntry?.flashbackOffer,
    mark: extraction?.flashback,
    turnLogId: turn.turnLogId,
  });
  next = syncBondSides(next);
  next = markKnownDeathsOnBonds(next);
  // The big personal threads open and close as the story reaches them.
  next = applyStoryHooks(next);

  let notice: string | null = null;

  if (relays.length > 0) {
    const id = relays[0].id.startsWith('event_canon_')
      ? relays[0].id
      : `event_canon_${relays[0].id}`;
    const delivered = next.events.find((event) => event.id === id);

    if (delivered) {
      const title = delivered.summary.split(':')[0].trim();
      const bearer = relays[0].from?.trim() ? resolveEntity(next, relays[0].from.trim()) : null;
      // As Kan knows them; never an id or a name he hasn't learned.
      const from = bearer ? displayName(next, bearer) : relays[0].from?.trim() || 'a rumor';
      notice = `${title} — from ${from}`.slice(0, 110);

      if (relays.length > 1) {
        notice = `${notice} (+${relays.length - 1} more)`.slice(0, 120);
      }
    }
  }

  if (!notice && extraction?.lettersReceived?.length) {
    const writer = extraction.lettersReceived[0].entityId
      ? next.entities.find((entity) => entity.id === extraction.lettersReceived![0].entityId)
      : resolveEntity(next, extraction.lettersReceived[0].name);
    notice = `A letter from ${writer ? displayName(next, writer) : extraction.lettersReceived[0].name}`;
  }

  // Kan just learned what a village has on him.
  if (!notice && extraction?.bountySeen?.length) {
    const listing = bingoListings(next).find((item) => item.village === extraction.bountySeen![0]);

    if (listing) {
      notice = `${listing.name} bingo book: ${listing.rank}-rank · ${formatRyo(listing.bounty)}`;
    }
  }

  // The state step is done; any earlier state job for this turn is settled.
  next = withJobs(
    next,
    jobsOf(next).filter((job) => !(job.kind === 'state' && job.turnLogId === turn.turnLogId))
  );

  const followUpIds: string[] = [];

  if (Math.abs(daysBetween(beforeDate, next.state.inStoryDate)) >= TIME_SKIP_DAYS) {
    const job = newJob('timeSkip', turn.turnLogId, {
      fromDate: beforeDate,
      toDate: next.state.inStoryDate,
    });
    next = withJobs(next, [...jobsOf(next), job]);
    followUpIds.push(job.id);
  }

  const shouldSummarize =
    extraction?.imageWorthy === true ||
    sceneEnded ||
    storyMessagesSinceLastSummary(next) >= next.settings.autoSummarizeThreshold;

  if (shouldSummarize) {
    const planned = queueSceneJob(next, turn.turnLogId, activeIds, sceneEnded ? 2 : MIN_SCENE_MESSAGES);
    next = planned.db;

    if (planned.jobId) {
      followUpIds.push(planned.jobId);
    }
  }

  // A name Kan doesn't know yet, used outside dialogue, becomes the label he
  // knows in the saved prose (audit 6b.2); the Debug panel keeps a note.
  const leaks = nameLeaks(next, turn.narration);
  const scrubbed = leaks.length > 0 ? scrubNameLeaks(next, turn.narration) : null;

  if (scrubbed && scrubbed.replaced.length > 0) {
    next = {
      ...next,
      rawLog: next.rawLog.map((entry) => (entry.id === turn.turnLogId ? { ...entry, content: scrubbed.text } : entry)),
    };
    events.push({ kind: 'mode', text: `Names Kan doesn't know yet replaced in the prose: ${scrubbed.replaced.join(', ')}.` });
  }

  return { db: next, followUpIds, notice, appliedDiff: effectiveDiff, nameLeaks: leaks, events };
}

/**
 * The state step for a turn inside a flashback: the memory's clock, place,
 * cast and mode move; nothing in the present does. When the memory ends it
 * is saved as a past memory and written up by a `flashback` job.
 */
function applyMemoryStep(latest: AppDatabase, stateReply: TurnDiff | null, turn: TurnInfo): StateStepResult {
  const entry = latest.rawLog.find((item) => item.id === turn.turnLogId);
  const playing = activeFlashback(latest);
  const settle = (db: AppDatabase) =>
    withJobs(db, jobsOf(db).filter((job) => !(job.kind === 'state' && job.turnLogId === turn.turnLogId)));

  // A memory turn whose flashback is no longer playing changes nothing.
  if (!playing || playing.active.id !== entry?.flashback?.id) {
    return { db: settle(latest), followUpIds: [], notice: null, appliedDiff: null, events: [] };
  }

  const result = applyFlashbackTurn(latest, stateReply, turn);
  let next = settle(syncBondSides(result.db));
  const followUpIds: string[] = [];

  if (result.ended && result.ended.logIds.length >= 2) {
    const job = newJob('flashback', turn.turnLogId, {
      logIds: result.ended.logIds,
      flashbackId: result.ended.flashbackId,
    });
    next = withJobs(next, [...jobsOf(next), job]);
    followUpIds.push(job.id);
  }

  return { db: next, followUpIds, notice: null, appliedDiff: stateReply, events: [] };
}

/** The save with its indices rebuilt (after records were removed). */
function buildIndexed(db: AppDatabase): AppDatabase {
  return { ...db, indices: buildIndices(db) };
}

/** A chapter is long: a break only counts once this much story has passed in it. */
export const CHAPTER_MIN_TURNS = 6;
export const CHAPTER_MIN_HOURS = 12;
/** A chapter that runs this long without a break is closed anyway. */
export const CHAPTER_MAX_TURNS = 60;
/** A single turn this long is a time skip, which opens a chapter. */
const CHAPTER_SKIP_SECONDS = 2 * 86400;

/**
 * Chapters are narrative units, not summary chunks. A new one opens with
 * this turn when the state reply marks a chapter break, a major milestone
 * completes, or a long time skip passes, but only once the current chapter
 * has run at least CHAPTER_MIN_TURNS turns or CHAPTER_MIN_HOURS in-story
 * hours; one that reaches CHAPTER_MAX_TURNS closes regardless.
 */
export function applyChapterBreak(
  before: AppDatabase,
  after: AppDatabase,
  turnLogId: string,
  reason: { title?: string; majorCompleted?: boolean; elapsedSeconds?: number }
): AppDatabase {
  const chapter = before.state.chapter;
  const turnsIn = storyLog(before).filter((entry) => entry.role === 'assistant' && entry.chapter === chapter).length;
  const start = before.state.chapterStart?.date ?? storyLog(before).find((entry) => entry.chapter === chapter)?.inStoryDate ?? before.state.inStoryDate;
  const hoursIn = secondsBetween(start, before.state.inStoryDate) / 3600;
  const wanted = Boolean(reason.title) || reason.majorCompleted === true || (reason.elapsedSeconds ?? 0) >= CHAPTER_SKIP_SECONDS;
  const longEnough = turnsIn >= CHAPTER_MIN_TURNS || hoursIn >= CHAPTER_MIN_HOURS;

  if (!((wanted && longEnough) || turnsIn >= CHAPTER_MAX_TURNS)) {
    return after;
  }

  const title = reason.title?.trim() || after.state.scene || `Chapter ${chapter + 1}`;
  const index = after.rawLog.findIndex((entry) => entry.id === turnLogId);
  const userIndex = index > 0 && after.rawLog[index - 1].role === 'user' ? index - 1 : -1;
  const turnNumber = after.rawLog[userIndex !== -1 ? userIndex : index]?.turn ?? 0;

  return {
    ...after,
    rawLog: after.rawLog.map((entry, position) =>
      position === index || position === userIndex ? { ...entry, chapter: chapter + 1 } : entry
    ),
    state: {
      ...after.state,
      chapter: chapter + 1,
      chapterTitle: title,
      chapterStart: { turn: turnNumber, date: before.state.inStoryDate },
      chapters: [
        ...(after.state.chapters ?? []),
        { chapter, title: before.state.chapterTitle ?? `Chapter ${chapter}`, from: start, to: before.state.inStoryDate },
      ],
    },
  };
}

function placeKey(location: string | undefined) {
  return (location ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * Ties this turn's story entries to a scene (GameState.sceneSeq) and records
 * the scene cast on them. A new scene starts on the turn after one ended, or
 * on a turn that moves Kan somewhere else. Scene-end memories made this turn
 * remember the turn they came from.
 */
function stampTurnScene(
  before: AppDatabase,
  after: AppDatabase,
  turnLogId: string,
  sceneEnded: boolean,
  newChapter = false
): AppDatabase {
  const moved =
    newChapter ||
    (!sceneEnded &&
      placeKey(after.state.location) !== '' &&
      placeKey(after.state.location) !== placeKey(before.state.location));
  const seq = (before.state.sceneSeq ?? 0) + (before.state.sceneClosed || moved ? 1 : 0);
  const castIds = [
    ...new Set(
      (after.state.sceneCast ?? [])
        .map((name) => resolveEntity(after, name))
        .filter((entity) => entity && entity.name.toLowerCase() !== 'kan')
        .map((entity) => entity!.id)
    ),
  ];

  const index = after.rawLog.findIndex((entry) => entry.id === turnLogId);
  let userIndex = -1;

  for (let position = index - 1; position >= 0; position -= 1) {
    const entry = after.rawLog[position];

    if (entry.kind !== 'story') continue;
    if (entry.role === 'user' && entry.sceneSeq === undefined) userIndex = position;
    break;
  }

  // A one-scene character seen in a second scene is one no longer: they
  // become an ordinary character, with a bond card.
  const minorsHere = castIds.filter((id) => after.entities.find((entity) => entity.id === id)?.tier === 'minor');
  const promoted = new Set(
    minorsHere.filter((id) => {
      const scenes = new Set(
        after.rawLog.filter((entry) => entry.sceneCastIds?.includes(id) && entry.sceneSeq !== undefined).map((entry) => entry.sceneSeq)
      );
      scenes.add(seq);
      return scenes.size >= 2;
    })
  );

  if (promoted.size > 0) {
    after = markMet(
      {
        ...after,
        entities: after.entities.map((entity) => {
          if (!promoted.has(entity.id)) return entity;
          const next = { ...entity };
          delete next.tier;
          return next;
        }),
      },
      promoted
    );
  }

  // A look of the moment lasts its scene: set this turn, it belongs to this
  // scene; from an earlier scene, it is gone.
  after = {
    ...after,
    entities: after.entities.map((entity) => {
      if (!entity.currentLook) return entity;
      if (entity.currentLookSeq === undefined) return { ...entity, currentLookSeq: seq };
      if (entity.currentLookSeq === seq) return entity;
      const cleared = { ...entity };
      delete cleared.currentLook;
      delete cleared.currentLookSeq;
      return cleared;
    }),
  };

  const knownEvents = new Set(before.events.map((event) => event.id));
  const knownFacts = new Set(before.facts.map((fact) => fact.id));
  const knownThreads = new Set(before.threads.map((thread) => thread.id));

  return {
    ...after,
    rawLog: after.rawLog.map((entry, position) =>
      position === index || position === userIndex
        ? { ...entry, sceneSeq: seq, sceneCastIds: castIds }
        : entry
    ),
    events: after.events.map((event) =>
      !knownEvents.has(event.id) && event.sourceLogId === null && !event.turnLogId
        ? { ...event, turnLogId }
        : event
    ),
    // Everything this turn recorded points back at it.
    facts: after.facts.map((fact) => (!knownFacts.has(fact.id) && !fact.sourceLogId ? { ...fact, sourceLogId: turnLogId } : fact)),
    threads: after.threads.map((thread) =>
      !knownThreads.has(thread.id) && !thread.sourceLogId ? { ...thread, sourceLogId: turnLogId } : thread
    ),
    state: { ...after.state, sceneSeq: seq, sceneClosed: sceneEnded },
  };
}

/**
 * The oldest unsummarized stretch that stays inside one scene, and whether
 * that scene is over. Entries from before scenes were tracked join the
 * stretch they sit in. A finished scene of a single entry (a reply with no
 * message, say) rides along with the next one rather than blocking it.
 */
function firstSceneStretch(db: AppDatabase, entries: RawLogEntry[]): { entries: RawLogEntry[]; closed: boolean } {
  const out: RawLogEntry[] = [];
  let key: number | undefined;

  for (const entry of entries) {
    if (entry.sceneSeq !== undefined) {
      if (key === undefined) {
        key = entry.sceneSeq;
      } else if (entry.sceneSeq !== key) {
        if (out.length >= 2) {
          return { entries: out, closed: true };
        }

        key = entry.sceneSeq;
      }
    }

    out.push(entry);
  }

  const closed = key !== undefined && db.state.sceneClosed === true && key === db.state.sceneSeq;
  return { entries: out, closed };
}

/**
 * Sets how much time a past reply took (the "+2 min" chip). The clock, every
 * later entry's timestamp, and every date the turn (or a later one) stamped
 * on a record shift by the difference. Pure.
 */
export function correctTurnTime(db: AppDatabase, logId: string, seconds: number): AppDatabase | null {
  const index = db.rawLog.findIndex((entry) => entry.id === logId);
  const entry = db.rawLog[index];

  if (!entry || entry.role !== 'assistant') {
    return null;
  }

  // Up to the longest time skip (audit 4.5).
  const target = Math.max(0, Math.min(MAX_SKIP_SECONDS, Math.round(seconds)));
  const delta = target - (entry.elapsedSeconds ?? 0);

  if (delta === 0) {
    return null;
  }

  const nextDate = shiftSeconds(db.state.inStoryDate, delta);
  // One clock: everything this turn and later turns stamped (facts, bonds,
  // events, portraits, canon "heard" dates, letters...) moves with it.
  const { rawLog, snapshots, meta, settings, state, ...records } = db;
  const shifted = shiftDatesAfter(
    { ...records, state: { ...state, inStoryDate: undefined } },
    entry.inStoryDate,
    delta
  );
  let next = applyTurnDiff(
    {
      ...db,
      ...shifted,
      rawLog,
      snapshots,
      meta,
      settings,
      state: { ...shifted.state, inStoryDate: state.inStoryDate },
    } as AppDatabase,
    { state: { inStoryDate: nextDate } }
  );

  next = {
    ...next,
    rawLog: next.rawLog.map((item, position) =>
      position === index
        ? { ...item, elapsedSeconds: target, timeCorrected: true }
        : position > index
          ? { ...item, inStoryDate: shiftSeconds(item.inStoryDate, delta) }
          : item
    ),
  };

  // Backwards: anything canon fired that now lies in the future is taken back (audit 4.5).
  return delta > 0 ? applyCanonEndgames(advanceCanon(next)) : buildIndexed(unfireFutureMilestones(next));
}

/**
 * Queues a chapter summary for the story messages no summary covers yet.
 * If an earlier one is still pending (and not running), it is widened to
 * cover the new messages instead of stacking a second job each turn.
 */
function queueSceneJob(
  db: AppDatabase,
  turnLogId: string,
  activeIds: ReadonlySet<string>,
  minMessages: number,
  options: { onlyClosed?: boolean } = {}
): { db: AppDatabase; jobId: string | null } {
  // Messages a running job is already writing about are left to it.
  const running = new Set(
    jobsOf(db)
      .filter((job) => job.kind === 'scene' && activeIds.has(job.id))
      .flatMap((job) => job.logIds ?? [])
  );
  const fresh = unsummarizedStory(db).filter((entry) => !running.has(entry.id));
  // One memory never spans two scenes: only the oldest scene's stretch.
  const stretch = firstSceneStretch(db, fresh);
  const logIds = stretch.entries.slice(0, MAX_SCENE_MESSAGES).map((entry) => entry.id);

  // A finished scene is summed up however short it was.
  if (logIds.length < (stretch.closed ? 2 : Math.max(2, minMessages)) || (options.onlyClosed && !stretch.closed)) {
    return { db, jobId: null };
  }

  const existing = jobsOf(db).find((job) => job.kind === 'scene' && !activeIds.has(job.id));

  if (existing) {
    return {
      db: withJobs(
        db,
        jobsOf(db).map((job) =>
          job.id === existing.id
            ? { ...job, logIds, turnLogId, status: 'queued', error: undefined }
            : job
        )
      ),
      jobId: existing.id,
    };
  }

  const job = newJob('scene', turnLogId, { logIds });
  return { db: withJobs(db, [...jobsOf(db), job]), jobId: job.id };
}

/** The one rolling saga summary, if there is one yet. */
export function latestSaga(db: AppDatabase) {
  return db.summaries.filter((summary) => summary.level === 'saga').sort((a, b) => a.createdAt - b.createdAt).pop() ?? null;
}

/** Queues an arc roll-up once enough chapter summaries exist. */
function queueRollups(db: AppDatabase, turnLogId: string): { db: AppDatabase; jobIds: string[] } {
  const chapters = chapterSummaries(db);
  const count = chapters.length;
  const jobIds: string[] = [];
  let next = db;

  const plan = (kind: 'arc', size: number) => {
    const summaryIds = chapters.slice(-size).map((summary) => summary.id);
    const alreadyDone = next.summaries.some(
      (summary) => summary.level === kind && sameIds(summary.sourceSummaryIds, summaryIds)
    );
    const alreadyQueued = jobsOf(next).some(
      (job) => job.kind === kind && sameIds(job.summaryIds, summaryIds)
    );

    if (alreadyDone || alreadyQueued) {
      return;
    }

    const job = newJob(kind, turnLogId, { summaryIds });
    next = withJobs(next, [...jobsOf(next), job]);
    jobIds.push(job.id);
  };

  if (count > 0 && count % ARC_SIZE === 0) {
    plan('arc', ARC_SIZE);
  }

  return { db: next, jobIds };
}

/** Records a state step that couldn't run (the extraction call failed) so it can be retried. */
export function queueStateRetry(
  db: AppDatabase,
  turn: Pick<TurnInfo, 'turnLogId' | 'userMessage'>,
  caught: unknown
): AppDatabase {
  const others = jobsOf(db).filter(
    (job) => !(job.kind === 'state' && job.turnLogId === turn.turnLogId)
  );
  const job: MemoryJob = {
    ...newJob('state', turn.turnLogId, { userMessage: turn.userMessage }),
    status: 'failed',
    attempts: 1,
    error: errorText(caught),
  };

  return withJobs(db, [...others, job]);
}

/** The newest turn's state step, when it failed and is waiting for a retry. */
export function failedStateJob(db: AppDatabase | null): MemoryJob | undefined {
  if (!db) {
    return undefined;
  }

  return jobsOf(db).find((job) => job.kind === 'state' && job.status === 'failed' && isJobValid(db, job));
}

/**
 * The last resort for a turn whose state call failed and failed again: the
 * prose fallback moves the clock, the cast and Kan's jutsu, so playing on
 * never drops a turn. The turn is marked `stateFromFallback`.
 */
export function applyStateFallback(
  latest: AppDatabase,
  job: MemoryJob,
  activeIds: ReadonlySet<string>
): StateStepResult | null {
  if (job.kind !== 'state' || !isJobValid(latest, job)) {
    return null;
  }

  const narration = latest.rawLog.find((entry) => entry.id === job.turnLogId)?.content ?? '';
  const result = applyStateStep(
    latest,
    null,
    { turnLogId: job.turnLogId, userMessage: job.userMessage ?? '', narration },
    activeIds
  );

  return {
    ...result,
    db: {
      ...result.db,
      rawLog: result.db.rawLog.map((entry) =>
        entry.id === job.turnLogId ? { ...entry, stateFromFallback: true } : entry
      ),
    },
  };
}

/** Summary steps that failed and get another go after the next good turn (3 attempts in all). */
export const SUMMARY_AUTO_ATTEMPTS = 3;

export function retryableSummaryJobs(db: AppDatabase | null, activeIds: ReadonlySet<string>) {
  return pendingMemoryJobs(db, activeIds).filter(
    (job) => job.kind !== 'state' && job.status === 'failed' && job.attempts < SUMMARY_AUTO_ATTEMPTS
  );
}

/** Re-runs the state call for a turn whose first attempt failed. */
export async function extractStateForJob(apiKey: string, db: AppDatabase, job: MemoryJob) {
  const narration = db.rawLog.find((entry) => entry.id === job.turnLogId)?.content ?? '';

  return extractTurnDiff({
    apiKey,
    db,
    userMessage: job.userMessage ?? '',
    assistantMessage: narration,
    debugTurnId: job.turnLogId,
  });
}

// ---------------------------------------------------------------------------
// Phase 2: summary jobs

export type SummaryJobOutput = {
  text: string;
  /** Short title from the summary model. */
  title?: string;
  /** One or two sentences for the scene's memory (chapter summaries). */
  memory?: string;
  /** Inputs actually used, so the result can be checked against the latest save. */
  logIds?: string[];
  /** Points of view on the memory, by entity id (scene summaries, see povMemories.ts). */
  povs?: { entityId: string; text: string }[];
};

/** Calls the model for one summary job, using `base` only as context. Throws on failure. */
export async function runSummaryJob(
  apiKey: string,
  base: AppDatabase,
  job: MemoryJob
): Promise<SummaryJobOutput> {
  let result: Awaited<ReturnType<typeof summarizeScene>> = null;
  let logIds: string[] | undefined;
  let povs: { entityId: string; text: string }[] | undefined;

  switch (job.kind) {
    case 'timeSkip':
      result = await summarizeTimeSkip({
        apiKey,
        db: base,
        fromDate: job.fromDate as CalendarDate,
        toDate: job.toDate as CalendarDate,
        debugTurnId: job.turnLogId,
      });
      break;
    case 'scene': {
      const wanted = new Set(job.logIds ?? []);
      const messages = base.rawLog.filter((entry) => wanted.has(entry.id));
      logIds = messages.map((entry) => entry.id);
      result = await summarizeScene({ apiKey, db: base, messages, debugTurnId: job.turnLogId });
      povs = result?.pov ? resolvePovs(povCandidates(base, messages), parsePovLines(result.pov), (entity) => displayName(base, entity)) : undefined;
      break;
    }
    case 'flashback': {
      const wanted = new Set(job.logIds ?? []);
      const messages = base.rawLog.filter((entry) => wanted.has(entry.id));
      const record = FLASHBACK_BY_ID[job.flashbackId ?? ''];
      logIds = messages.map((entry) => entry.id);
      result = await summarizeScene({
        apiKey,
        db: base,
        messages,
        debugTurnId: job.turnLogId,
        memoryNote: record
          ? `This scene is a memory you lived through again: "${record.title}", Year ${record.date.year}, when you were ${ageWord(kanAgeAt(base, record.date))}. Write it up as that memory, in its own time; the present plays no part in it.`
          : undefined,
      });
      povs = result?.pov ? resolvePovs(povCandidates(base, messages), parsePovLines(result.pov), (entity) => displayName(base, entity)) : undefined;
      break;
    }
    case 'arc': {
      const wanted = job.summaryIds ?? [];
      const texts = wanted
        .map((id) => base.summaries.find((summary) => summary.id === id)?.text)
        .filter((value): value is string => Boolean(value));
      result = await rollArcSummary({
        apiKey,
        db: base,
        chapterSummaries: texts,
        debugTurnId: job.turnLogId,
      });
      break;
    }
    case 'saga': {
      const arc = base.summaries.find((summary) => summary.id === job.summaryIds?.[0]);
      result = arc
        ? await foldSagaSummary({
            apiKey,
            db: base,
            saga: latestSaga(base)?.text ?? null,
            arc: arc.text,
            debugTurnId: job.turnLogId,
          })
        : null;
      break;
    }
    default:
      throw new Error(`Unknown memory step: ${job.kind}`);
  }

  if (!result?.summary) {
    throw new Error('The summary came back empty.');
  }

  return {
    text: result.summary,
    title: result.title ?? undefined,
    memory: result.memory ?? undefined,
    logIds,
    ...(povs?.length ? { povs } : {}),
  };
}

/**
 * Applies a finished summary to the latest save. Returns null when the job no
 * longer applies (turn undone, job removed), so nothing is written.
 */
export function applySummaryJob(
  latest: AppDatabase,
  job: MemoryJob,
  output: SummaryJobOutput
): { db: AppDatabase; followUpIds: string[] } | null {
  const current = jobsOf(latest).find((entry) => entry.id === job.id);

  if (!current || !isJobValid(latest, current)) {
    return null;
  }

  let next = latest;
  let followUpIds: string[] = [];

  switch (job.kind) {
    case 'timeSkip': {
      const duplicate = next.events.some(
        (event) => event.sourceLogId === job.turnLogId && event.tags.includes('time-skip')
      );

      if (!duplicate) {
        const event: EventRecord = {
          id: makeId('event'),
          chapter: next.state.chapter,
          scene: 'Time skip',
          inStoryDate: job.toDate ?? next.state.inStoryDate,
          title: output.title ?? 'Time passes',
          summary: output.text,
          importance: 4,
          tags: ['time-skip', 'meanwhile'],
          pinned: false,
          sourceLogId: job.turnLogId,
          createdAt: Date.now(),
        };
        next = { ...next, events: [...next.events, event] };
      }
      break;
    }
    case 'scene': {
      const used = new Set(output.logIds ?? []);
      // Only messages no other summary covers yet: a job that ran twice, or
      // overlapped one that already landed, never saves the same stretch again.
      const open = new Set(unsummarizedStory(next).map((entry) => entry.id));
      const messages = next.rawLog.filter((entry) => used.has(entry.id) && open.has(entry.id));
      const repeated = chapterSummaries(next).some(
        (summary) => summary.text.trim() === output.text.trim()
      );

      // Undone while the summary was being written, or already summarized.
      if (messages.length < 2 || repeated) {
        const left = (current.logIds ?? []).filter((id) => !used.has(id) && open.has(id));

        if (left.length >= 2) {
          return {
            db: withJobs(
              next,
              jobsOf(next).map((entry) =>
                entry.id === job.id ? { ...entry, logIds: left, status: 'queued' } : entry
              )
            ),
            followUpIds: [job.id],
          };
        }

        return { db: removeJob(next, job.id), followUpIds: [] };
      }

      const title = output.title?.trim() || shortTitle(output.text);
      // A summary is rolling compression inside a chapter; it never ends one
      // (chapters move on at real breaks, see applyChapterBreak).
      const chapter = Math.max(1, messages[messages.length - 1].chapter || next.state.chapter);

      const first = messages[0];
      const last = messages[messages.length - 1];
      // The memory this summary is saved as, linked both ways.
      const eventId = makeId('event');
      const record: SummaryRecord = {
        id: makeId('summary'),
        level: 'chapter',
        range: {
          fromEventId: eventId,
          toEventId: eventId,
          from: first.inStoryDate,
          to: last.inStoryDate,
        },
        text: output.text,
        title,
        chapter,
        tokenCount: Math.ceil(output.text.length / 4),
        eventIds: [eventId],
        // Stamped just after the last covered message, so a summary that
        // lands late (after a retry) doesn't hide newer, unsummarized turns.
        createdAt: last.createdAt + 1,
        sourceLogIds: messages.map((entry) => entry.id),
      };
      next = {
        ...next,
        summaries: [...next.summaries, record],
      };
      next = saveSummaryMemory(next, record, messages, output.memory, eventId, output.povs);

      // No memory was saved (one already existed for this stretch): link that one.
      if (!next.events.some((event) => event.id === eventId)) {
        const existing = next.events.find((event) => event.tags.includes(SUMMARY_TAG) && event.sourceLogId === last.id);
        next = {
          ...next,
          summaries: next.summaries.map((summary) =>
            summary.id === record.id
              ? {
                  ...summary,
                  eventIds: existing ? [existing.id] : [],
                  range: { ...summary.range, fromEventId: existing?.id ?? '', toEventId: existing?.id ?? '' },
                }
              : summary
          ),
        };
      }

      // If the job was widened while this one was running, keep the newer
      // messages queued instead of marking them as summarized.
      const remaining = (current.logIds ?? []).filter((id) => !used.has(id) && hasLog(next, id));

      if (remaining.length >= 2) {
        next = withJobs(
          next,
          jobsOf(next).map((entry) =>
            entry.id === job.id ? { ...entry, logIds: remaining, status: 'queued' } : entry
          )
        );
        followUpIds.push(job.id);
      } else {
        next = removeJob(next, job.id);

        // A finished scene waiting behind this one is summed up next.
        if (!jobsOf(next).some((entry) => entry.kind === 'scene')) {
          const queued = queueSceneJob(next, job.turnLogId, new Set(), MIN_SCENE_MESSAGES, { onlyClosed: true });
          next = queued.db;

          if (queued.jobId) {
            followUpIds.push(queued.jobId);
          }
        }
      }

      const rollups = queueRollups(next, job.turnLogId);
      next = rollups.db;
      followUpIds = [...followUpIds, ...rollups.jobIds];
      return { db: next, followUpIds };
    }
    case 'flashback': {
      const updated = applyFlashbackWriteUp(next, job.flashbackId ?? '', output);

      if (updated) {
        next = updated;
      }
      break;
    }
    case 'saga': {
      const arcId = job.summaryIds?.[0];
      const already = next.summaries.some((summary) => summary.level === 'saga' && summary.sourceSummaryIds?.includes(arcId ?? ''));

      if (!already && arcId) {
        const previous = latestSaga(next);
        const first = next.summaries.find((summary) => summary.level === 'chapter');
        const record: SummaryRecord = {
          id: makeId('summary'),
          level: 'saga',
          range: { fromEventId: '', toEventId: '', from: first?.range.from ?? next.state.inStoryDate, to: next.state.inStoryDate },
          text: output.text,
          title: 'The story so far',
          tokenCount: Math.ceil(output.text.length / 4),
          eventIds: [],
          createdAt: Date.now(),
          sourceSummaryIds: [arcId, ...(previous ? [previous.id] : [])],
        };
        // Only the newest saga is ever read; older ones are dropped.
        next = { ...next, summaries: [...next.summaries.filter((summary) => summary.level !== 'saga'), record] };
      }
      break;
    }
    case 'arc':
    case 'year': {
      const summaryIds = job.summaryIds ?? [];
      const duplicate = next.summaries.some(
        (summary) => summary.level === job.kind && sameIds(summary.sourceSummaryIds, summaryIds)
      );

      if (!duplicate) {
        const sources = next.summaries.filter((summary) => summaryIds.includes(summary.id));
        const from = sources[0]?.range.from ?? next.state.inStoryDate;
        const to = sources[sources.length - 1]?.range.to ?? next.state.inStoryDate;
        const record: SummaryRecord = {
          id: makeId('summary'),
          level: job.kind,
          range: { fromEventId: '', toEventId: '', from, to },
          text: output.text,
          title: output.title?.trim() || shortTitle(output.text),
          tokenCount: Math.ceil(output.text.length / 4),
          eventIds: [],
          createdAt: Date.now(),
          sourceSummaryIds: summaryIds,
        };
        next = { ...next, summaries: [...next.summaries, record] };

        // Each new arc is folded into the one rolling saga (audit 6.5).
        if (job.kind === 'arc') {
          const saga = newJob('saga', job.turnLogId, { summaryIds: [record.id] });
          next = withJobs(next, [...jobsOf(next), saga]);
          followUpIds.push(saga.id);
        }
      }
      break;
    }
    default:
      return null;
  }

  return { db: removeJob(next, job.id), followUpIds };
}

/**
 * Every chapter summary is also saved as a memory, shared by everyone in the
 * scene cast on the turns it was written from (one scene: see
 * firstSceneStretch). The short "scene ended" memories made on those same
 * turns are folded into it.
 */
function saveSummaryMemory(
  db: AppDatabase,
  summary: SummaryRecord,
  messages: RawLogEntry[],
  memory?: string,
  eventId: string = makeId('event'),
  povs?: { entityId: string; text: string }[]
): AppDatabase {
  const last = messages[messages.length - 1];

  if (db.events.some((event) => event.tags.includes(SUMMARY_TAG) && event.sourceLogId === last.id)) {
    return db;
  }

  // The scene-end memories made on the very turns this summary was written
  // from — matched by turn, never by time, so a neighbouring scene stays out.
  const turnIds = new Set(messages.map((entry) => entry.id));
  const superseded = db.events.filter(
    (event) =>
      event.sourceLogId === null &&
      !event.pinned &&
      !event.tags.includes('time-skip') &&
      event.turnLogId !== undefined &&
      turnIds.has(event.turnLogId)
  );
  const supersededIds = new Set(superseded.map((event) => event.id));
  // Everyone in the scene cast on those turns was there and shares it,
  // named in the text or not. Being named in it links no one.
  const presentIds = new Set(messages.flatMap((entry) => entry.sceneCastIds ?? []));
  const present = db.entities.filter((entity) => presentIds.has(entity.id));
  // Names in the text still help recall the memory later (tags only).
  const mentioned = db.entities.filter(
    (entity) => entity.type === 'character' && entity.name.toLowerCase() !== 'kan' && mentionsEntity(summary.text, entity)
  );

  const event: EventRecord = {
    id: eventId,
    chapter: summary.chapter ?? db.state.chapter,
    scene: last.scene || db.state.scene,
    inStoryDate: last.inStoryDate,
    // The Journal shows the title and a one-to-two sentence description;
    // the narrator recalls the whole summary through summaryId.
    title: summary.title,
    summary: memory?.trim() || firstSentences(summary.text),
    summaryId: summary.id,
    importance: Math.max(3, ...superseded.map((entry) => entry.importance)) as EventRecord['importance'],
    tags: [
      SUMMARY_TAG,
      ...new Set([
        ...superseded.flatMap((entry) => entry.tags),
        ...[...present, ...mentioned].map((entity) => entity.name.split(/\s+/)[0].toLowerCase()),
      ]),
    ].slice(0, 10),
    pinned: false,
    sourceLogId: last.id,
    // Only people who were there keep their own side of it.
    ...(povs?.some((item) => presentIds.has(item.entityId))
      ? { povs: povs.filter((item) => presentIds.has(item.entityId)) }
      : {}),
    createdAt: summary.createdAt,
  };

  const links = [
    ...present.map((entity) => ({ eventId: event.id, entityId: entity.id, role: 'present' as const })),
    ...db.eventEntities
      .filter((link) => supersededIds.has(link.eventId) && link.role !== 'mentioned')
      .map((link) => ({ ...link, eventId: event.id })),
  ].filter(
    (link, index, all) => all.findIndex((other) => other.entityId === link.entityId) === index
  );

  const next: AppDatabase = {
    ...db,
    events: [...db.events.filter((entry) => !supersededIds.has(entry.id)), event],
    eventEntities: [
      ...db.eventEntities.filter((link) => !supersededIds.has(link.eventId)),
      ...links,
    ],
  };

  return { ...next, indices: buildIndices(next) };
}

// ---------------------------------------------------------------------------
// Undo / regenerate

/**
 * Undo restores a snapshot taken before the turn. Summaries that finished
 * after that snapshot are carried over when everything they were written
 * from still exists, and so are pending jobs that still apply.
 */
export function carryOverMemory(current: AppDatabase, restored: AppDatabase): AppDatabase {
  const restoredLogIds = new Set(restored.rawLog.map((entry) => entry.id));
  const restoredSummaryIds = new Set(restored.summaries.map((summary) => summary.id));
  const restoredEventIds = new Set(restored.events.map((event) => event.id));

  const extraSummaries: SummaryRecord[] = [];

  for (const summary of current.summaries) {
    if (restoredSummaryIds.has(summary.id)) {
      continue;
    }

    const logsOk = (summary.sourceLogIds ?? []).every((id) => restoredLogIds.has(id));
    const sourcesOk = (summary.sourceSummaryIds ?? []).every(
      (id) => restoredSummaryIds.has(id) || extraSummaries.some((extra) => extra.id === id)
    );
    const traceable = Boolean(summary.sourceLogIds?.length || summary.sourceSummaryIds?.length);

    if (traceable && logsOk && sourcesOk) {
      extraSummaries.push(summary);
    }
  }

  const extraEvents = current.events.filter(
    (event) =>
      !restoredEventIds.has(event.id) &&
      (event.tags.includes('time-skip') || event.tags.includes(SUMMARY_TAG)) &&
      event.sourceLogId !== null &&
      restoredLogIds.has(event.sourceLogId)
  );
  const extraEventIds = new Set(extraEvents.map((event) => event.id));

  const merged: AppDatabase = {
    ...restored,
    // Undo takes back story, not choices made since: the model you just
    // picked, the story's new name and when you last exported all stay.
    settings: current.settings,
    meta: current.meta,
    summaries: [...restored.summaries, ...extraSummaries],
    events: [...restored.events, ...extraEvents],
    eventEntities: [
      ...restored.eventEntities,
      ...current.eventEntities.filter((link) => extraEventIds.has(link.eventId)),
    ],
    memoryJobs: jobsOf(current),
  };

  return pruneJobs(extraEvents.length > 0 ? { ...merged, indices: buildIndices(merged) } : merged);
}
