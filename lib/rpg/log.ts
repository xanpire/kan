// Story log and undo snapshots.

import { makeId } from './id';
import type { AppDatabase, RawLogEntry, TurnSnapshot } from './types';

export function cloneDatabase(db: AppDatabase): AppDatabase {
  return JSON.parse(JSON.stringify(db)) as AppDatabase;
}

export function currentTurn(db: AppDatabase) {
  return db.rawLog.filter((message) => message.kind === 'story').length + 1;
}

/** Undo keeps this many turns. Snapshots hold no images and no story log, so they stay small. */
export const SNAPSHOT_LIMIT = 5;

/**
 * How many log entries before the turn a snapshot keeps a copy of. A turn
 * only appends to the log (and may stamp the newest entries), so the rest
 * is the live log cut back to the snapshot's length.
 */
export const SNAPSHOT_TAIL = 2;

const isInline = (value: string | null | undefined) => typeof value === 'string' && value.startsWith('data:');

/**
 * A lightweight copy of the state before a turn: everything but images and
 * the story log. Image references (img:…) are kept; inline images and the
 * portrait and face collections are left out, and come back from the live
 * save on undo. The log is kept as its length plus its last entries.
 */
export function createSnapshot(db: AppDatabase): TurnSnapshot {
  const {
    snapshots: _snapshots,
    rawLog,
    portraits: _portraits,
    characterPortraits: _cp,
    characterFaces: _cf,
    ...rest
  } = db;
  const database = JSON.parse(JSON.stringify(rest)) as TurnSnapshot['database'];
  const tail = rawLog
    .slice(-SNAPSHOT_TAIL)
    .map((entry) => (isInline(entry.image) ? { ...entry, image: null } : entry));

  return {
    id: makeId('snapshot'),
    turn: currentTurn(db),
    database,
    rawLogLength: rawLog.length,
    rawLogTail: JSON.parse(JSON.stringify(tail)) as RawLogEntry[],
    createdAt: Date.now(),
  };
}

/** A snapshot in the current shape (log length and tail, no full log). Older ones are dropped. */
export function isCurrentSnapshot(snapshot: unknown): snapshot is TurnSnapshot {
  const value = snapshot as Partial<TurnSnapshot> | null;
  return Boolean(
    value &&
      typeof value === 'object' &&
      value.database &&
      typeof value.rawLogLength === 'number' &&
      Array.isArray(value.rawLogTail) &&
      !('rawLog' in (value.database as object))
  );
}

export function pushSnapshot(db: AppDatabase, limit = SNAPSHOT_LIMIT): AppDatabase {
  const snapshot = createSnapshot(db);
  const snapshots = [...db.snapshots, snapshot].slice(-limit);

  return {
    ...db,
    snapshots,
  };
}

export function restoreLastSnapshot(db: AppDatabase): AppDatabase | null {
  const snapshot = db.snapshots[db.snapshots.length - 1];

  if (!snapshot || !isCurrentSnapshot(snapshot)) {
    return null;
  }

  const { rawLogLength, rawLogTail } = snapshot;
  const keep = rawLogLength - rawLogTail.length;

  // The live log must still hold everything the snapshot cut off, ending
  // where the snapshot's tail begins; otherwise there is nothing safe to undo to.
  if (keep < 0 || db.rawLog.length < rawLogLength) {
    return null;
  }

  for (let index = 0; index < rawLogTail.length; index += 1) {
    if (db.rawLog[keep + index]?.id !== rawLogTail[index].id) {
      return null;
    }
  }

  const restored = cloneDatabase({ ...snapshot.database, rawLog: [], snapshots: [] } as AppDatabase);
  restored.snapshots = db.snapshots.slice(0, -1);
  // Images are not in snapshots: they come from the live save.
  const liveImages = new Map(
    db.rawLog.slice(keep, rawLogLength).filter((entry) => entry.image).map((entry) => [entry.id, entry.image])
  );
  const tail = (JSON.parse(JSON.stringify(rawLogTail)) as RawLogEntry[]).map((entry) =>
    !entry.image && liveImages.has(entry.id) ? { ...entry, image: liveImages.get(entry.id) } : entry
  );
  // Entries before the tail are shared with the live log: a turn never changes them.
  restored.rawLog = [...db.rawLog.slice(0, keep), ...tail];
  restored.portraits = db.portraits;
  restored.characterPortraits = db.characterPortraits;
  restored.characterFaces = db.characterFaces;

  return restored;
}

export function appendStoryMessage(
  db: AppDatabase,
  role: 'user' | 'assistant',
  content: string,
  model: string | null,
  promptTokens: number,
  completionTokens: number
): AppDatabase {
  const message: RawLogEntry = {
    id: makeId('log'),
    turn: currentTurn(db),
    kind: 'story',
    role,
    content,
    model,
    promptTokens,
    completionTokens,
    chapter: db.state.chapter,
    scene: db.state.scene,
    inStoryDate: db.state.inStoryDate,
    createdAt: Date.now(),
  };

  return {
    ...db,
    rawLog: [...db.rawLog, message],
  };
}

export function getLastExchange(db: AppDatabase) {
  const story = db.rawLog.filter((message) => message.kind === 'story');
  const lastUser = [...story].reverse().find((message) => message.role === 'user');
  const lastAssistant = [...story].reverse().find((message) => message.role === 'assistant');

  return {
    userMessage: lastUser?.content ?? null,
    assistantMessage: lastAssistant?.content ?? null,
  };
}

export function storyMessagesSinceLastSummary(db: AppDatabase): number {
  const lastChapterSummaryAt = [...db.summaries]
    .filter((summary) => summary.level === 'chapter')
    .sort((a, b) => b.createdAt - a.createdAt)[0]?.createdAt ?? 0;

  // Flashback turns are written up on their own (see flashbacks.ts).
  return db.rawLog.filter(
    (message) => message.kind === 'story' && !message.flashback && message.createdAt > lastChapterSummaryAt
  ).length;
}
