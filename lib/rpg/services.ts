// One turn's state change (applyTurnDiff) and the model calls behind memory:
// the state step and the summaries. The pieces live in entities, bonds,
// facts, clock, jutsu, log and stateBlock.

import { CALL_TIMEOUTS, isTransientError, type ChatRequest, completeChat } from '../openrouter';
import { applyAbilityChanges } from './abilities';
import { applyBondDiff, syncBondSides } from './bonds';
import { applyCanonEndgames } from './canonEndgame';
import { daysBetween, formatDate } from './calendar';
import { applyClockChange, applyClockTick } from './clock';
import { applyCompanionChanges, applySharedScene, castWithCompanions } from './companions';
import { markAlive, markDeceased } from './deaths';
import { buildIndices } from './db';
import { type DebugCallKind, recordDebugCall, recordDebugState } from './debug';
import { validateLocationKind } from './encounters';
import { applyEntityDiff, mergeDuplicateEntities, recordPresence, resolveCharacterRefs, resolveEntity } from './entities';
import { applyGrudgeChanges } from './grudges';
import { applyReputationChanges } from './reputation';
import { restBlocked } from './safehouses';
import { applyFactDiff, applyThreadDiff, endFacts, expireFacts, recordSceneEvent } from './facts';
import { applyJutsuDiff, isBareNatureName, jutsuKey } from './jutsu';
import { settleNewlyMet } from './met';
import { cloneDatabase } from './log';
import { buildArcSummaryPrompt, buildExtractionPrompt, buildSceneSummaryPrompt, buildTimeSkipPrompt } from './prompt';
import { convertStateBlock, parseJsonObject, repairTruncatedJson } from './stateBlock';
import { TURN_STATE_SCHEMA, TURN_STATE_SCHEMA_NAME } from './stateSchema';
import { type TitledSummary, parseTitledSummary, uniqueList } from './util';
import type { AppDatabase, CalendarDate, RawLogEntry, TurnDiff } from './types';

/** Room for the state reply. Thinking tokens count against this too. */
const STATE_MAX_TOKENS = 3000;
/** A retry after the first reply hit the cap. */
const STATE_RETRY_MAX_TOKENS = 4500;

export function applyTurnDiff(db: AppDatabase, diff: TurnDiff | null): AppDatabase {
  if (!diff || typeof diff !== 'object') {
    return db;
  }

  let next = cloneDatabase(db);
  // The scene that was running when this turn began (a new scene_title
  // names what comes next, not the scene that just ended).
  const sceneBefore = db.state.scene;

  if (diff.state) {
    next = applyStateDiff(next, diff.state);
  }

  // A night's rest clears everyone's look of the moment (wet, bloodied,
  // Sharingan active); this turn's updates then say how they look after it.
  if (isRest(diff)) {
    next = {
      ...next,
      entities: next.entities.map((entity) => {
        if (!entity.currentLook) return entity;
        const cleared = { ...entity };
        delete cleared.currentLook;
        delete cleared.currentLookSeq;
        return cleared;
      }),
    };
  }

  if (Array.isArray(diff.entities)) {
    for (const entity of diff.entities) {
      next = applyEntityDiff(next, entity);
    }
  }

  // After entities, so someone introduced and killed in the same turn exists.
  if (Array.isArray(diff.revived)) {
    for (const person of diff.revived) {
      if (person.entityId) {
        next = markAlive(next, person.entityId);
      }
    }
  }

  if (Array.isArray(diff.deaths)) {
    for (const death of diff.deaths) {
      const entity = death.entityId
        ? next.entities.find((item) => item.id === death.entityId)
        : resolveEntity(next, death.name);

      if (entity) {
        next = markDeceased(next, entity.id, { cause: death.cause, known: true });
      }
    }
  }

  if (Array.isArray(diff.jutsuUsed)) {
    for (const jutsu of diff.jutsuUsed) {
      next = applyJutsuDiff(next, jutsu);
    }
  }

  next = applyAbilityChanges(next, diff);

  // Who the scene cast puts in the room this turn. Only they can be met: a
  // bond, grudge or join for someone unmet who isn't here changes nothing.
  const presentIds = presentEntityIds(next, diff);

  // Joins and partings: after people and deaths, before bonds, so a bond
  // the story gives a new companion lands on the bond they start with.
  next = applyCompanionChanges(next, diff, { presentIds });

  // Whose bond the story itself moved this turn (shared time adds nothing on top).
  const storyMovedBond = new Set<string>();

  if (Array.isArray(diff.bonds)) {
    for (const bond of diff.bonds) {
      next = applyBondDiff(next, bond, { presentIds });

      if (typeof bond.affinityDelta === 'number' && bond.affinityDelta !== 0) {
        const id = bond.entityId ?? resolveEntity(next, bond.character)?.id;

        if (id) {
          storyMovedBond.add(id);
        }
      }
    }
  }

  // After bonds and deaths: a soured bond can turn into a grudge, and the
  // dead let theirs go.
  next = applyGrudgeChanges(next, diff, { presentIds });
  next = applyReputationChanges(next, diff.reputation, diff.bountySeen);

  if (Array.isArray(diff.factsEnded) && diff.factsEnded.length > 0) {
    next = endFacts(next, diff.factsEnded);
  }

  if (Array.isArray(diff.facts)) {
    for (const fact of diff.facts) {
      next = applyFactDiff(next, fact);
    }
  }

  if (Array.isArray(diff.threads)) {
    for (const thread of diff.threads) {
      next = applyThreadDiff(next, thread, { presentIds });
    }
  }

  // Companions are in every scene, whether or not the tracker listed them.
  const present = castWithCompanions(next, diff.scene?.entities ?? []);

  if (diff.scene?.ended) {
    next = recordSceneEvent(
      next,
      { ...diff, scene: { ...diff.scene, entities: present } },
      { sceneName: sceneBefore }
    );
    next = applySharedScene(next, { pace: next.state.scenePace, storyMovedBond });
  }

  next = mergeDuplicateEntities(next);

  if (present.length > 0) {
    next = recordPresence(next, present);
    const cast =
      Array.isArray(next.state.sceneCast) && next.state.sceneCast.length > 0
        ? next.state.sceneCast
        : present;
    next = {
      ...next,
      state: {
        ...next.state,
        sceneCast: castWithCompanions(next, cast).slice(0, 6),
      },
    };
  }

  // Anyone seen for the first time this turn: "Newly met" and a bond.
  next = settleNewlyMet(db, next);

  next = syncBondSides(next);
  next = applyClockTick(next, diff);
  // Temporary conditions run out; a long stretch of rest ends the "until rest" ones
  // (not in a compromised safehouse: Kan may not sleep there at all).
  next = expireFacts(next, { rested: isRest(diff) && !restBlocked(next) });
  // After the clock: a bond the story set this turn cannot outlast canon.
  next = applyCanonEndgames(next);

  next.indices = buildIndices(next);

  return next;
}

/** A turn that covers a night's sleep or a long rest. */
export function isRest(diff: TurnDiff) {
  const seconds = diff.state?.elapsedSeconds ?? 0;
  return seconds >= 5 * 3600 && diff.state?.scenePace !== 'combat' && diff.state?.scenePace !== 'chase';
}

/** Entity ids of this turn's scene cast (characters_present) and companions. */
function presentEntityIds(db: AppDatabase, diff: TurnDiff): Set<string> {
  const names = castWithCompanions(db, diff.scene?.entities ?? diff.state?.sceneCast ?? []);

  return new Set(
    names.map((name) => resolveEntity(db, name)?.id).filter((id): id is string => Boolean(id))
  );
}

type StateDiff = NonNullable<TurnDiff['state']>;

function applyStateDiff(db: AppDatabase, state: StateDiff): AppDatabase {
  let next = { ...db, state: { ...db.state } };

  if (typeof state.mood === 'string' && state.mood.trim()) {
    next.state.mood = state.mood.trim().slice(0, 60);

    next.entities = next.entities.map((entity) =>
      entity.name.toLowerCase() === 'kan'
        ? { ...entity, mood: next.state.mood }
        : entity
    );
  }

  if (typeof state.worldDescription === 'string' && state.worldDescription.trim()) {
    next.state.worldDescription = state.worldDescription.trim().slice(0, 220);
  }

  if (Array.isArray(state.jutsuAdded)) {
    // Same jutsu under "Style" or "Release": keep the name already listed.
    const listed = new Set(next.state.jutsu.map(jutsuKey));
    const added = state.jutsuAdded.filter((name) => {
      if (!name || isBareNatureName(name) || listed.has(jutsuKey(name))) {
        return false;
      }
      listed.add(jutsuKey(name));
      return true;
    });
    next.state.jutsu = uniqueList([...next.state.jutsu, ...added]).slice(-12);
  }

  if (Array.isArray(state.jutsuRemoved)) {
    const removed = new Set(state.jutsuRemoved.map(jutsuKey));
    next.state.jutsu = next.state.jutsu.filter((jutsu) => !removed.has(jutsuKey(jutsu)));
  }

  if (Array.isArray(state.inventoryAdded)) {
    next.state.inventory = uniqueList([
      ...next.state.inventory,
      ...state.inventoryAdded.filter(Boolean),
    ]).slice(-12);
  }

  if (Array.isArray(state.inventoryRemoved)) {
    next.state.inventory = next.state.inventory.filter(
      (item) => !state.inventoryRemoved?.includes(item)
    );
  }

  if (typeof state.location === 'string' && state.location.trim()) {
    const moved = state.location.trim().toLowerCase() !== (db.state.location ?? '').trim().toLowerCase();

    // Kan left, and the tracker didn't say who came along: only companions
    // (added back by the caller) are with him now.
    if (moved && !Array.isArray(state.sceneCast)) {
      next.state.sceneCast = [];
    }

    next.state.location = state.location.trim().slice(0, 100);
    next.state.locationKind = validateLocationKind(next.state.location, state.locationKind);
  } else if (state.locationKind) {
    next.state.locationKind = state.locationKind;
  }

  // You are never in your own scene cast.
  if (Array.isArray(state.sceneCast)) {
    next.state.sceneCast = state.sceneCast.filter((name) => name && name.trim().toLowerCase() !== 'kan').slice(0, 6);
  }

  if (
    state.scenePace === 'combat' ||
    state.scenePace === 'chase' ||
    state.scenePace === 'conversation' ||
    state.scenePace === 'travel' ||
    state.scenePace === 'downtime'
  ) {
    next.state.scenePace = state.scenePace;
  }

  next = applyClockChange(next, state);

  if (typeof state.canonPoint === 'string' && state.canonPoint.trim()) {
    next.state.canonPoint = state.canonPoint.trim().slice(0, 220);
  }

  if (typeof state.chapter === 'number' && Number.isFinite(state.chapter)) {
    next.state.chapter = Math.max(1, Math.round(state.chapter));
  }

  if (typeof state.scene === 'string' && state.scene.trim()) {
    next.state.scene = state.scene.trim().slice(0, 60);
  }

  return next;
}

/** completeChat, with the call (tokens, cost, errors) recorded against a turn in the debug log. */
/** Waits before the 2nd and 3rd attempt of a call that failed for a passing reason. */
let transientRetryDelays = [1500, 4000];

/** Tests only. */
export function setTransientRetryDelaysForTests(delays: number[]) {
  transientRetryDelays = delays;
}

/**
 * Runs a model call up to three times when it fails for a passing reason
 * (network, 429, 5xx); any other failure, or a cancel, is thrown at once.
 */
export async function withTransientRetry<T>(call: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await call();
    } catch (caught) {
      if (attempt >= transientRetryDelays.length || signal?.aborted || !isTransientError(caught)) {
        throw caught;
      }

      await new Promise((resolve) => setTimeout(resolve, transientRetryDelays[attempt]));
    }
  }
}

async function tracedChat(kind: DebugCallKind, debugTurnId: string | undefined, request: ChatRequest) {
  try {
    const result = await completeChat(request);
    recordDebugCall(debugTurnId, {
      kind,
      model: request.model,
      usage: result.usage,
      finishReason: result.finishReason,
      apiKey: request.apiKey,
      responseMode: result.responseMode,
    });
    return result;
  } catch (caught) {
    recordDebugCall(debugTurnId, {
      kind,
      model: request.model,
      usage: null,
      error: caught instanceof Error ? caught.message : String(caught),
    });
    throw caught;
  }
}

/**
 * Call 2 of a turn: a cheap model reads the narrator's prose and returns the
 * state change through structured JSON output. Throws if the call fails, so
 * the caller can queue a retry.
 */
export async function extractTurnDiff(options: {
  apiKey: string;
  db: AppDatabase;
  userMessage: string;
  assistantMessage: string;
  signal?: AbortSignal;
  /** The narrator reply this belongs to, for the debug log. */
  debugTurnId?: string;
}): Promise<TurnDiff | null> {
  const { apiKey, db, userMessage, assistantMessage, signal, debugTurnId } = options;
  const prompt = buildExtractionPrompt(db, userMessage, assistantMessage);
  recordDebugState(debugTurnId, { status: 'running' });

  const request: ChatRequest = {
    apiKey,
    model: db.settings.extractionModel,
    messages: prompt.messages,
    temperature: 0,
    // The schema asks for every field every turn, and any thinking the model
    // does counts against this cap too. Too low and the JSON is cut off.
    maxTokens: STATE_MAX_TOKENS,
    signal,
    reasoning: { effort: 'low', exclude: true },
    jsonSchema: { name: TURN_STATE_SCHEMA_NAME, schema: TURN_STATE_SCHEMA },
  };

  const first = await withTransientRetry(() => tracedChat('state', debugTurnId, request), signal);
  let raw = first.text;
  let parsed = parseJsonObject(first.text);
  let note: string | undefined;

  // Unreadable reply: ask once more (with more room if it ran out), and if
  // that fails too, salvage whatever complete part of either reply exists.
  if (!parsed && !signal?.aborted) {
    const cutOff = first.finishReason === 'length';
    let second: Awaited<ReturnType<typeof tracedChat>> | null = null;

    try {
      second = await tracedChat('state', debugTurnId, {
        ...request,
        maxTokens: cutOff ? STATE_RETRY_MAX_TOKENS : STATE_MAX_TOKENS,
      });
    } catch {
      // Fall through to repairing the first reply.
    }

    if (second) {
      raw = `${first.text}\n\n--- retry ---\n\n${second.text}`;
      parsed = parseJsonObject(second.text);
    }

    if (parsed) {
      note = `First reply unreadable${cutOff ? ' (cut off at the token cap)' : ''}; the retry was read.`;
    } else {
      const repaired =
        (second ? repairTruncatedJson(second.text) : null) ?? repairTruncatedJson(first.text);

      if (repaired) {
        parsed = repaired;
        note = 'Reply was cut off; the complete part of it was applied.';
      }
    }
  }

  recordDebugState(debugTurnId, { status: 'running', raw, note });

  // Still unreadable: the caller falls back to what the app can read from
  // the prose itself (clock, pace, who is named, jutsu Kan called).
  if (!parsed) {
    return null;
  }

  const diff = convertStateBlock(parsed).diff;

  return diff ? resolveCharacterRefs(db, diff) : null;
}

/**
 * Room for a summary reply. Any thinking the model does counts against the
 * cap too, so it is generous; a reply that still runs out is asked again
 * with more room.
 */
const SUMMARY_MAX_TOKENS = 2000;
const ARC_SUMMARY_MAX_TOKENS = 2400;
const SUMMARY_RETRY_FACTOR = 1.75;

async function summaryChat(
  kind: DebugCallKind,
  debugTurnId: string | undefined,
  base: ChatRequest
): Promise<TitledSummary | null> {
  const request: ChatRequest = { timeoutMs: CALL_TIMEOUTS.summary, ...base };
  const first = await tracedChat(kind, debugTurnId, request);
  const parsed = parseTitledSummary(first.text);

  // Cut off before the summary was finished (or began): ask once more.
  if (first.finishReason === 'length' && (!parsed || !/[.!?]["'”’)]*\s*$/.test(first.text.trim()))) {
    const second = await tracedChat(kind, debugTurnId, {
      ...request,
      maxTokens: Math.round((request.maxTokens ?? SUMMARY_MAX_TOKENS) * SUMMARY_RETRY_FACTOR),
    });
    return parseTitledSummary(second.text) ?? parsed;
  }

  return parsed;
}

export async function summarizeScene(options: {
  apiKey: string;
  db: AppDatabase;
  messages: RawLogEntry[];
  debugTurnId?: string;
  /** For a flashback: what memory this scene is, so it is written up as one. */
  memoryNote?: string;
}): Promise<TitledSummary | null> {
  const { apiKey, db, messages, debugTurnId, memoryNote } = options;

  if (messages.length === 0) {
    return null;
  }

  const prompt = buildSceneSummaryPrompt(db, messages, { memoryNote });

  return summaryChat('scene', debugTurnId, {
    apiKey,
    model: db.settings.summaryModel,
    messages: prompt.messages,
    temperature: 0.2,
    maxTokens: SUMMARY_MAX_TOKENS,
    reasoning: { effort: 'low', exclude: true },
  });
}

export async function summarizeTimeSkip(options: {
  apiKey: string;
  db: AppDatabase;
  fromDate: CalendarDate;
  toDate: CalendarDate;
  debugTurnId?: string;
}): Promise<TitledSummary | null> {
  const { apiKey, db, fromDate, toDate, debugTurnId } = options;

  if (Math.abs(daysBetween(fromDate, toDate)) < 180) {
    return null;
  }

  const prompt = buildTimeSkipPrompt(
    db,
    formatDate(fromDate),
    formatDate(toDate)
  );

  return summaryChat('timeSkip', debugTurnId, {
    apiKey,
    model: db.settings.summaryModel,
    messages: prompt.messages,
    temperature: 0.2,
    maxTokens: SUMMARY_MAX_TOKENS,
    reasoning: { effort: 'low', exclude: true },
  });
}

export async function rollArcSummary(options: {
  apiKey: string;
  db: AppDatabase;
  chapterSummaries: string[];
  debugTurnId?: string;
  debugKind?: 'arc' | 'year';
}): Promise<TitledSummary | null> {
  const { apiKey, db, chapterSummaries, debugTurnId, debugKind = 'arc' } = options;

  if (chapterSummaries.length < 3) {
    return null;
  }

  const prompt = buildArcSummaryPrompt(db, chapterSummaries);

  return summaryChat(debugKind, debugTurnId, {
    apiKey,
    model: db.settings.summaryModel,
    messages: prompt.messages,
    temperature: 0.2,
    maxTokens: ARC_SUMMARY_MAX_TOKENS,
    reasoning: { effort: 'low', exclude: true },
  });
}
