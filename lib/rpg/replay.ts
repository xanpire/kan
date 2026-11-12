// Replay tests from real play (audit 11d). Settings → Debug → "Export this
// session as a test" writes the last few turns (Kan's input, the narration,
// the tracker's raw Core and World replies) with the save as it was before
// the first of them. `scripts/replay.test.ts` replays every fixture in
// `scripts/fixtures/` through applyStateStep and asserts no rule is broken,
// so a bug hit in play becomes a fixture and cannot come back.
//
// Pure: the Debug panel builds the file, the test reads it.

import type { DebugTurn } from './debug';
import { checkSave, checkTurn, type Violation } from './invariants';
import { appendStoryMessage } from './log';
import { applyStateStep } from './memoryJobs';
import { repairSave } from './saveDoctor';
import { diffFromParsedReplies } from './services';
import { parseJsonObject, repairTruncatedJson } from './stateBlock';
import { WORLD_AREAS, type WorldArea } from './stateSchema';
import type { AppDatabase, RawLogEntry } from './types';

export const REPLAY_VERSION = 1;
/** Undo keeps 5 snapshots, so at most 5 turns can be exported with their starting save. */
export const REPLAY_MAX_TURNS = 5;
/** The starting save keeps only this much of the story log (the step reads the recent end). */
const START_LOG_KEEP = 30;

export type ReplayTurn = {
  input: string;
  narration: string;
  /** The Core reply as received (null: the step fell back to the prose). */
  raw: string | null;
  worldRaw?: string;
  worldAreas?: string[];
};

export type ReplayFixture = {
  version: number;
  name: string;
  exportedAt: string;
  app: string;
  /** The save just before the first turn, without images and with a short log. */
  start: AppDatabase;
  turns: ReplayTurn[];
};

/** The last reply in a raw state reply that holds two attempts ("--- retry ---"). */
function readRaw(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  const attempts = raw.split(/\n\n--- retry ---\n\n/);
  for (const attempt of attempts.reverse()) {
    const parsed = parseJsonObject(attempt) ?? repairTruncatedJson(attempt);
    if (parsed) return parsed;
  }
  return null;
}

function withoutImages(entry: RawLogEntry): RawLogEntry {
  const { image: _image, ...rest } = entry;
  return rest as RawLogEntry;
}

/**
 * The fixture for the last `count` turns of the open save, or a reason it
 * can't be made (no undo snapshot that far back, or no tracker reply logged).
 */
export function buildReplayFixture(
  db: AppDatabase,
  debugTurns: DebugTurn[],
  options: { count?: number; name?: string; app?: string } = {}
): { fixture: ReplayFixture } | { error: string } {
  const count = Math.max(1, Math.min(options.count ?? REPLAY_MAX_TURNS, REPLAY_MAX_TURNS));
  const replies = db.rawLog.filter((entry) => entry.kind === 'story' && entry.role === 'assistant' && !entry.flashback);
  const chosen = replies.slice(-count);
  if (chosen.length === 0) return { error: 'There are no turns to export yet.' };

  // The save before the first chosen turn: its undo snapshot.
  const firstIndex = db.rawLog.findIndex((entry) => entry.id === chosen[0].id);
  const userIndex = db.rawLog[firstIndex - 1]?.role === 'user' ? firstIndex - 1 : firstIndex;
  const snapshot = db.snapshots.find((item) => item.rawLogLength === userIndex);
  if (!snapshot) {
    return { error: `Only the last ${db.snapshots.length} turns can be undone, so only those can be exported. Try fewer turns.` };
  }

  const byId = new Map(debugTurns.map((turn) => [turn.id, turn]));
  const turns: ReplayTurn[] = [];

  for (const reply of chosen) {
    const index = db.rawLog.findIndex((entry) => entry.id === reply.id);
    const input = db.rawLog[index - 1]?.role === 'user' ? db.rawLog[index - 1].content : '';
    const debug = byId.get(reply.id);
    if (!debug?.state) return { error: 'A turn in that range has no tracker reply in the Debug log (it keeps 30 turns).' };
    turns.push({
      input,
      narration: reply.content,
      raw: debug.state.status === 'fallback' ? null : debug.state.raw ?? null,
      ...(debug.state.worldRaw ? { worldRaw: debug.state.worldRaw, worldAreas: debug.state.worldAreas } : {}),
    });
  }

  // The log before the turn: the live log cut back, its tail as it was.
  const before = db.rawLog.slice(0, snapshot.rawLogLength);
  snapshot.rawLogTail.forEach((entry, position) => {
    before[snapshot.rawLogLength - snapshot.rawLogTail.length + position] = entry;
  });

  const start = repairSave({
    ...(snapshot.database as AppDatabase),
    rawLog: before.slice(-START_LOG_KEEP).map(withoutImages),
    snapshots: [],
    portraits: [],
    characterPortraits: [],
    characterFaces: [],
    memoryJobs: [],
  }).db;

  return {
    fixture: {
      version: REPLAY_VERSION,
      name: options.name ?? db.meta.slotName,
      exportedAt: new Date().toISOString(),
      app: options.app ?? '',
      start,
      turns,
    },
  };
}

export type ReplayResult = {
  db: AppDatabase;
  /** Rules broken by the starting save itself (the fixture's own baseline). */
  baseline: Violation[];
  /** Rules broken after each turn, newly (not already in the baseline). */
  perTurn: Violation[][];
};

/** Replays a fixture's turns through the real state step. */
export function replayFixture(fixture: ReplayFixture, normalize: (db: AppDatabase) => AppDatabase): ReplayResult {
  let db = normalize(fixture.start);
  const baseline = checkSave(db);
  const known = new Set(baseline.map((item) => `${item.code}:${item.text}`));
  const perTurn: Violation[][] = [];

  for (const turn of fixture.turns) {
    let next = appendStoryMessage(db, 'user', turn.input, null, 0, 0);
    next = appendStoryMessage(next, 'assistant', turn.narration, null, 0, 0);
    const turnLogId = next.rawLog[next.rawLog.length - 1].id;
    const core = readRaw(turn.raw);
    const worldParsed = readRaw(turn.worldRaw);
    const areas = (turn.worldAreas ?? []).filter((area): area is WorldArea => (WORLD_AREAS as readonly string[]).includes(area));
    const diff = core ? diffFromParsedReplies(next, core, worldParsed ? { parsed: worldParsed, areas } : null) : null;
    const result = applyStateStep(next, diff, { turnLogId, userMessage: turn.input, narration: turn.narration }, new Set());
    const violations = checkTurn(next, result.db, {
      turnLogId,
      userMessage: turn.input,
      narration: turn.narration,
      pace: result.appliedDiff?.state?.scenePace,
      sceneEnded: result.appliedDiff?.scene?.ended ?? false,
      skipSeconds: result.events.some((event) => event.text.startsWith('Time skip:')) ? Number.MAX_SAFE_INTEGER : null,
    });
    perTurn.push(violations.filter((item) => !known.has(`${item.code}:${item.text}`)));
    db = result.db;
  }

  return { db, baseline, perTurn };
}
