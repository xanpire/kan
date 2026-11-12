/**
 * Debug log: what each turn actually sent, what came back, what it changed,
 * and what it cost. Shown in Settings → Debug.
 *
 * Kept outside the save so it never bloats the save or travels with an
 * exported story. Persisted to its own IndexedDB store when available, so it
 * survives a reload; on platforms without IndexedDB it lives in memory only.
 */
import { useSyncExternalStore } from 'react';

import { fetchGenerationCost, type CallUsage } from '../openrouter';
import { formatDate } from './calendar';
import type { AppDatabase, OpenRouterMessage, TurnDiff } from './types';

export type DebugCallKind =
  | 'narrator'
  | 'state'
  | 'timeSkip'
  | 'scene'
  | 'arc'
  | 'year'
  | 'saga'
  | 'image'
  | 'imageAction'
  | 'imageCheck'
  | 'portrait';

export type { DebugEvent } from './debugEvents';
import type { DebugEvent } from './debugEvents';
import type { TrackerCorrection } from './trackerStats';

export type DebugCall = {
  id: string;
  kind: DebugCallKind;
  /** The model the app asked for. */
  model: string;
  at: number;
  usage: CallUsage | null;
  /** Where the cost came from: in the reply, looked up afterwards, or not yet known. */
  costSource: 'reply' | 'lookup' | 'pending' | 'unavailable';
  finishReason?: string;
  error?: string;
  /** For JSON calls: strict schema, JSON mode or a plain reply (audit 5.4). */
  responseMode?: 'schema' | 'json_object' | 'plain';
};

export type DebugChange = {
  /** e.g. "state.location", "bonds · Itachi Uchiha · trust" */
  path: string;
  from: string;
  to: string;
};

export type DebugStateStep = {
  status: 'running' | 'applied' | 'fallback' | 'failed';
  /** The memory model's reply, exactly as received. */
  raw?: string;
  /** What the app read from it, after clock resolution. */
  diff?: TurnDiff | null;
  changes?: DebugChange[];
  error?: string;
  /** How the reply was read when the first attempt failed (retry, repair). */
  note?: string;
  /** Names the narration used outside dialogue that Kan couldn't know yet. */
  nameLeaks?: string[];
  /** What the engine refused, dropped, merged or fell back on during the step. */
  events?: DebugEvent[];
  at: number;
};

export type DebugTurn = {
  /** Temporary id until the narrator reply is saved, then the reply's log id. */
  id: string;
  slotId: string;
  action: string;
  startedAt: number;
  narratorModel: string;
  prompt: OpenRouterMessage[] | null;
  promptEstimate: number;
  calls: DebugCall[];
  state: DebugStateStep | null;
  error?: string;
  /** Parts of this turn the player fixed by hand afterwards (audit 7). */
  corrections?: Array<{ field: TrackerCorrection; at: number }>;
};

type DebugLog = { turns: DebugTurn[] };

const MAX_TURNS = 30;
/** Full prompts are large; only the newest few keep theirs. */
const KEEP_PROMPTS = 5;
const IDB_NAME = 'kan-debug';
const IDB_STORE = 'log';
const IDB_KEY = 'turns';

let log: DebugLog = { turns: [] };
const listeners = new Set<() => void>();
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let callCounter = 0;

// ---------------------------------------------------------------------------
// Persistence

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }

      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function idb() {
  dbPromise = dbPromise ?? openDb();
  return dbPromise;
}

async function persist() {
  const database = await idb();

  if (!database) {
    return;
  }

  try {
    const tx = database.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(log.turns, IDB_KEY);
  } catch {
    // Debug data is best-effort.
  }
}

function schedulePersist() {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  saveTimer = setTimeout(() => {
    saveTimer = null;
    void persist();
  }, 400);
}

export async function loadDebugLog() {
  if (loaded) {
    return;
  }

  loaded = true;
  const database = await idb();

  if (!database) {
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      const request = database
        .transaction(IDB_STORE, 'readonly')
        .objectStore(IDB_STORE)
        .get(IDB_KEY);
      request.onsuccess = () => {
        const stored = request.result as DebugTurn[] | undefined;

        if (Array.isArray(stored)) {
          // Turns started this session come first; stored ones fill in behind.
          const ids = new Set(log.turns.map((turn) => turn.id));
          log = {
            turns: [...log.turns, ...stored.filter((turn) => !ids.has(turn.id))].slice(
              0,
              MAX_TURNS
            ),
          };
          emit();
        }

        resolve();
      };
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ---------------------------------------------------------------------------
// Store

function emit() {
  listeners.forEach((listener) => listener());
}

function commit(turns: DebugTurn[]) {
  const trimmed = turns.slice(0, MAX_TURNS).map((turn, index) =>
    index >= KEEP_PROMPTS && turn.prompt ? { ...turn, prompt: null } : turn
  );
  log = { turns: trimmed };
  emit();
  schedulePersist();
}

function updateTurn(turnId: string, change: (turn: DebugTurn) => DebugTurn) {
  if (!log.turns.some((turn) => turn.id === turnId)) {
    return;
  }

  commit(log.turns.map((turn) => (turn.id === turnId ? change(turn) : turn)));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return log;
}

export function useDebugLog(): DebugLog {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function getDebugLog(): DebugLog {
  return log;
}

export function clearDebugLog() {
  commit([]);
}

// ---------------------------------------------------------------------------
// Recording

export function beginDebugTurn(input: {
  slotId: string;
  action: string;
  narratorModel: string;
  prompt: OpenRouterMessage[];
  promptEstimate: number;
}): string {
  const id = `pending_${Date.now()}_${(callCounter += 1)}`;
  const turn: DebugTurn = {
    id,
    slotId: input.slotId,
    action: input.action,
    startedAt: Date.now(),
    narratorModel: input.narratorModel,
    // Keep the plain text only; the cache split is rebuilt every turn.
    prompt: input.prompt.map(({ role, content }) => ({ role, content })),
    promptEstimate: input.promptEstimate,
    calls: [],
    state: null,
  };
  commit([turn, ...log.turns]);
  return id;
}

/** Re-keys a turn to the saved narrator reply, so background steps can find it. */
export function linkDebugTurn(tempId: string, turnLogId: string) {
  updateTurn(tempId, (turn) => ({ ...turn, id: turnLogId }));
}

export function failDebugTurn(turnId: string, error: string) {
  updateTurn(turnId, (turn) => ({ ...turn, error }));
}

/**
 * Records one model call against a turn. If the reply carried no cost, it is
 * looked up from OpenRouter in the background.
 */
export function recordDebugCall(
  turnId: string | null | undefined,
  call: {
    kind: DebugCallKind;
    model: string;
    usage: CallUsage | null;
    finishReason?: string;
    error?: string;
    apiKey?: string;
    responseMode?: DebugCall['responseMode'];
  }
) {
  if (!turnId || !log.turns.some((turn) => turn.id === turnId)) {
    return;
  }

  const id = `call_${Date.now()}_${(callCounter += 1)}`;
  const hasCost = typeof call.usage?.cost === 'number';
  const canLookUp = !hasCost && Boolean(call.usage?.generationId && call.apiKey);
  const entry: DebugCall = {
    id,
    kind: call.kind,
    model: call.model,
    at: Date.now(),
    usage: call.usage,
    costSource: hasCost ? 'reply' : canLookUp ? 'pending' : 'unavailable',
    finishReason: call.finishReason,
    error: call.error,
    ...(call.responseMode ? { responseMode: call.responseMode } : {}),
  };

  updateTurn(turnId, (turn) => ({ ...turn, calls: [...turn.calls, entry] }));

  if (canLookUp) {
    void fetchGenerationCost(call.apiKey as string, call.usage?.generationId as string).then(
      (cost) => {
        const owner = log.turns.find((turn) => turn.calls.some((c) => c.id === id));

        if (!owner) {
          return;
        }

        updateTurn(owner.id, (turn) => ({
          ...turn,
          calls: turn.calls.map((c) =>
            c.id === id
              ? {
                  ...c,
                  usage: c.usage ? { ...c.usage, cost } : c.usage,
                  costSource: cost === null ? 'unavailable' : 'lookup',
                }
              : c
          ),
        }));
      }
    );
  }
}

/** Attaches an image call to the turn whose reply it illustrates (or the newest turn). */
export function recordDebugImage(
  turnLogId: string | null,
  kind: 'image' | 'portrait',
  model: string,
  cost: number | null,
  durationMs: number
) {
  const target =
    (turnLogId && log.turns.find((turn) => turn.id === turnLogId)) || log.turns[0] || null;

  if (!target) {
    return;
  }

  recordDebugCall(target.id, {
    kind,
    model,
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      cachedTokens: 0,
      estimated: false,
      cost,
      generationId: null,
      servedModel: null,
      provider: null,
      durationMs,
    },
  });
}

/** Records a side call (like the image description) against a reply's turn, or the newest turn. */
export function recordDebugSideCall(
  turnLogId: string | null,
  call: { kind: DebugCallKind; model: string; usage: CallUsage | null; apiKey?: string; error?: string }
) {
  const target =
    (turnLogId && log.turns.find((turn) => turn.id === turnLogId)) || log.turns[0] || null;

  if (target) {
    recordDebugCall(target.id, call);
  }
}

export function recordDebugState(turnId: string | null | undefined, step: Omit<DebugStateStep, 'at'>) {
  if (!turnId) {
    return;
  }

  updateTurn(turnId, (turn) => ({
    ...turn,
    state: { ...(turn.state ?? {}), ...step, at: Date.now() },
  }));
}

/**
 * Notes that the player fixed part of a turn by hand. Goes on the turn named
 * (the reply whose time was corrected), or on the newest logged turn whose
 * state step added `addedName` (a duplicate that got merged away), or else on
 * the newest logged turn of that story.
 */
export function recordDebugCorrection(
  slotId: string,
  field: TrackerCorrection,
  target: { turnId?: string | null; addedName?: string | null } = {}
) {
  const own = log.turns.filter((turn) => turn.slotId === slotId);
  const byId = target.turnId ? own.find((turn) => turn.id === target.turnId) : undefined;
  const byAdded = target.addedName
    ? own.find((turn) =>
        (turn.state?.changes ?? []).some(
          (change) => change.path.endsWith(' · added') && change.to === target.addedName
        )
      )
    : undefined;
  const owner = byId ?? byAdded ?? (target.turnId ? undefined : own[0]);

  if (!owner) {
    return;
  }

  updateTurn(owner.id, (turn) => ({
    ...turn,
    corrections: [...(turn.corrections ?? []), { field, at: Date.now() }],
  }));
}

/** The turns that belong to one story, newest first. */
export function turnsForSlot(turns: DebugTurn[], slotId: string | null | undefined) {
  return slotId ? turns.filter((turn) => turn.slotId === slotId) : turns;
}

// ---------------------------------------------------------------------------
// Totals

/** A cost in dollars for the Debug panel, in fixed decimals. */
export function formatCost(cost: number) {
  if (cost === 0) {
    return '$0';
  }

  if (cost < 0.01) {
    // Fixed decimals: toPrecision printed tiny costs as "$1.23e-7".
    const text = cost.toFixed(6).replace(/0+$/, '');
    return text === '0.' ? '<$0.000001' : `$${text}`;
  }

  return `$${cost.toFixed(4)}`;
}

export function turnCost(turn: DebugTurn): { total: number; complete: boolean } {
  let total = 0;
  let complete = true;

  for (const call of turn.calls) {
    if (typeof call.usage?.cost === 'number') {
      total += call.usage.cost;
    } else {
      complete = false;
    }
  }

  return { total, complete };
}

export function turnTokens(turn: DebugTurn) {
  return turn.calls.reduce(
    (sum, call) => ({
      prompt: sum.prompt + (call.usage?.promptTokens ?? 0),
      completion: sum.completion + (call.usage?.completionTokens ?? 0),
    }),
    { prompt: 0, completion: 0 }
  );
}

// ---------------------------------------------------------------------------
// State diff

/** Parts of the save that a state step never touches, or that are too noisy to diff. */
const SKIP_KEYS = new Set(['rawLog', 'snapshots', 'indices', 'meta', 'settings', 'memoryJobs']);
const MAX_CHANGES = 120;

function show(value: unknown): string {
  if (value === undefined) {
    return '—';
  }

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return value.length > 220 ? `${value.slice(0, 220)}…` : value;
  }

  if (isDate(value)) {
    return formatDate(value);
  }

  const text = JSON.stringify(value);
  return text.length > 220 ? `${text.slice(0, 220)}…` : text;
}

function isDate(value: unknown): value is AppDatabase['state']['inStoryDate'] {
  return (
    typeof value === 'object' &&
    value !== null &&
    'year' in value &&
    'month' in value &&
    'day' in value
  );
}

function same(a: unknown, b: unknown) {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function labelOf(record: Record<string, unknown>) {
  const name = record.name ?? record.title ?? record.subject ?? record.summary ?? record.id;
  const text = typeof name === 'string' ? name : String(record.id ?? '?');
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

function diffObject(path: string, before: unknown, after: unknown, out: DebugChange[]) {
  if (out.length >= MAX_CHANGES || same(before, after)) {
    return;
  }

  const bothObjects =
    typeof before === 'object' &&
    typeof after === 'object' &&
    before !== null &&
    after !== null &&
    !Array.isArray(before) &&
    !Array.isArray(after) &&
    !isDate(before) &&
    !isDate(after);

  if (!bothObjects) {
    out.push({ path, from: show(before), to: show(after) });
    return;
  }

  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const key of keys) {
    diffObject(`${path}.${key}`, a[key], b[key], out);
  }
}

function diffRecords(
  name: string,
  before: Array<Record<string, unknown>>,
  after: Array<Record<string, unknown>>,
  out: DebugChange[]
) {
  const byId = new Map(before.map((record) => [String(record.id), record]));
  const afterIds = new Set(after.map((record) => String(record.id)));

  for (const record of after) {
    if (out.length >= MAX_CHANGES) {
      return;
    }

    const previous = byId.get(String(record.id));

    if (!previous) {
      out.push({ path: `${name} · added`, from: '—', to: labelOf(record) });
      continue;
    }

    if (same(previous, record)) {
      continue;
    }

    const keys = new Set([...Object.keys(previous), ...Object.keys(record)]);

    for (const key of keys) {
      if (!same(previous[key], record[key])) {
        diffObject(`${name} · ${labelOf(record)} · ${key}`, previous[key], record[key], out);
      }
    }
  }

  for (const record of before) {
    if (!afterIds.has(String(record.id)) && out.length < MAX_CHANGES) {
      out.push({ path: `${name} · removed`, from: labelOf(record), to: '—' });
    }
  }
}

/** Field-by-field list of what a state step changed in the save. */
export function describeStateChange(before: AppDatabase, after: AppDatabase): DebugChange[] {
  const out: DebugChange[] = [];
  const a = before as unknown as Record<string, unknown>;
  const b = after as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const key of keys) {
    if (SKIP_KEYS.has(key) || same(a[key], b[key])) {
      continue;
    }

    const left = a[key];
    const right = b[key];
    const recordList = (value: unknown) =>
      Array.isArray(value) &&
      value.every((item) => typeof item === 'object' && item !== null && 'id' in item);

    if (recordList(left ?? []) && recordList(right ?? [])) {
      diffRecords(
        key,
        (left ?? []) as Array<Record<string, unknown>>,
        (right ?? []) as Array<Record<string, unknown>>,
        out
      );
    } else {
      diffObject(key, left, right, out);
    }
  }

  return out;
}
