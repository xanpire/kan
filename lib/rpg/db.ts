import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizePost } from './letters';
import { normalizeYearly } from './yearly';
import { normalizeReputation } from './reputation';
import { normalizeRenown } from './renown';
import { normalizeConsequences } from './consequences';
import { normalizeDeaths } from './deaths';
import { ensureNames } from './names';
import { knowersOf } from './facts';

import { DEFAULT_SETTINGS, emptyIndex, normalizePromptBudget } from './defaults';
import { makeId } from './id';
import { stripNarrationJson } from './prompt';
import { CANON_MILESTONES, CANON_VERSION, LEGACY_CANON_POINTS } from './canonData';
import { dropBareNatureJutsu, normalizeJutsuNature } from './jutsu';
import { normalizeDate } from './calendar';
import { GEOGRAPHY_LORE, seedDatabase } from './seed';
import { CANON_CAST, FEMALE_CAST, ensureCanonCast } from './canonCast';
import { repairUnmetLabels } from './met';
import { readSlotJson, removeSlotJson, writeSlotJson } from './slotStore';
import { normalizeSceneMode } from './sceneMode';
import type { AppDatabase, MemoryIndex, WeatherLock } from './types';
import { normalizeTravelLog } from './mapData';
import { WEATHER_CONDITIONS } from './weather';
import { normalizeFlashbacks } from './flashbacks';
import { normalizeSafehouses } from './safehouses';
import { normalizePurse } from './money';

const META_KEY = 'kan.meta.v1';
const SLOT_PREFIX = 'kan.slot.';
const API_KEY_KEY = 'kan.apiKey.v1';

export type StorageMeta = {
  activeSlotId: string;
  slotOrder: string[];
};

const DEFAULT_SLOT_ID = 'slot_main';
const DEFAULT_SLOT_NAME = 'Main Story';

export async function loadStorageMeta(): Promise<StorageMeta> {
  const stored = await AsyncStorage.getItem(META_KEY);

  if (!stored) {
    const meta: StorageMeta = {
      activeSlotId: DEFAULT_SLOT_ID,
      slotOrder: [DEFAULT_SLOT_ID],
    };
    await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
    await ensureSlot(DEFAULT_SLOT_ID, DEFAULT_SLOT_NAME);
    return meta;
  }

  try {
    const parsed = JSON.parse(stored) as StorageMeta;

    if (!parsed.activeSlotId || !Array.isArray(parsed.slotOrder) || parsed.slotOrder.length === 0) {
      const meta: StorageMeta = {
        activeSlotId: DEFAULT_SLOT_ID,
        slotOrder: [DEFAULT_SLOT_ID],
      };
      await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
      await ensureSlot(DEFAULT_SLOT_ID, DEFAULT_SLOT_NAME);
      return meta;
    }

    return parsed;
  } catch {
    const meta: StorageMeta = {
      activeSlotId: DEFAULT_SLOT_ID,
      slotOrder: [DEFAULT_SLOT_ID],
    };
    await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
    await ensureSlot(DEFAULT_SLOT_ID, DEFAULT_SLOT_NAME);
    return meta;
  }
}

export async function saveStorageMeta(meta: StorageMeta) {
  await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
}

export async function ensureSlot(slotId: string, slotName: string) {
  const existing = await readSlotJson(`${SLOT_PREFIX}${slotId}.v1`);

  if (existing) {
    return;
  }

  const db = seedDatabase(slotId, slotName);
  await saveSlot(db);
}

/** Why a stored slot could not be opened. */
export type SlotLoadFailure = 'unreadable' | 'normalize' | 'storage';

/**
 * A slot that exists but could not be opened. Never answered with a fresh
 * story: the caller shows a blocking screen, and nothing is written to that
 * slot until it opens again (see `saveSlot`).
 */
export class SlotLoadError extends Error {
  readonly slotId: string;
  readonly kind: SlotLoadFailure;
  /** The stored text, when it could be read (for "Download the raw save"). */
  readonly raw: string | null;
  readonly cause?: unknown;

  constructor(slotId: string, kind: SlotLoadFailure, raw: string | null, cause?: unknown) {
    const detail = cause instanceof Error ? cause.message : cause ? String(cause) : '';
    super(
      kind === 'storage'
        ? `Your saves could not be reached${detail ? ` (${detail})` : ''}.`
        : kind === 'unreadable'
          ? 'Your save is not readable as a Kan story.'
          : `Your save could not be prepared${detail ? ` (${detail})` : ''}.`
    );
    this.name = 'SlotLoadError';
    this.slotId = slotId;
    this.kind = kind;
    this.raw = raw;
    this.cause = cause;
  }
}

/** Slots open in another tab (see tabLock.ts). Writes to them are refused. */
const readOnlySlots = new Set<string>();

export function setSlotReadOnly(slotId: string, readOnly: boolean) {
  if (readOnly) {
    readOnlySlots.add(slotId);
  } else {
    readOnlySlots.delete(slotId);
  }
}

/** Slots whose stored copy failed to load this session. Writes to them are refused. */
const brokenSlots = new Map<string, SlotLoadError>();
/** Raw copies already set aside this session, so a retry loop doesn't pile them up. */
const backedUpRaw = new Map<string, string>();

export function isSlotBroken(slotId: string) {
  return brokenSlots.has(slotId);
}

export function brokenSlotError(slotId: string) {
  return brokenSlots.get(slotId) ?? null;
}

/** Lets a broken slot be loaded (and then written) again, e.g. on Retry. */
export function clearBrokenSlot(slotId: string) {
  brokenSlots.delete(slotId);
}

export function brokenBackupKey(slotId: string, at = Date.now()) {
  return `${SLOT_PREFIX}${slotId}.broken.${at}`;
}

async function markBroken(error: SlotLoadError): Promise<SlotLoadError> {
  brokenSlots.set(error.slotId, error);

  // Set the raw text aside under its own key before anything else can touch the slot.
  if (error.raw && backedUpRaw.get(error.slotId) !== error.raw) {
    try {
      await writeSlotJson(brokenBackupKey(error.slotId), error.raw);
      backedUpRaw.set(error.slotId, error.raw);
    } catch {
      // The raw text is still on the error for the download button.
    }
  }

  return error;
}

/** Reads, parses and normalizes a stored slot. Null when the slot has never been saved. */
async function readStoredSlot(slotId: string): Promise<AppDatabase | null> {
  let stored: string | null;

  try {
    stored = await readSlotJson(`${SLOT_PREFIX}${slotId}.v1`);
  } catch (cause) {
    throw await markBroken(new SlotLoadError(slotId, 'storage', null, cause));
  }

  if (!stored) {
    return null;
  }

  let parsed: AppDatabase;

  try {
    parsed = JSON.parse(stored) as AppDatabase;
  } catch (cause) {
    throw await markBroken(new SlotLoadError(slotId, 'unreadable', stored, cause));
  }

  if (!parsed || typeof parsed !== 'object' || parsed.schemaVersion !== 1) {
    throw await markBroken(new SlotLoadError(slotId, 'unreadable', stored));
  }

  try {
    const normalized = normalizeDatabase(parsed);
    brokenSlots.delete(slotId);
    return normalized;
  } catch (cause) {
    throw await markBroken(new SlotLoadError(slotId, 'normalize', stored, cause));
  }
}

/**
 * Loads a slot. Only a slot that has never been saved gets a fresh story;
 * a stored one that can't be read or prepared throws a `SlotLoadError`.
 */
export async function loadSlot(slotId: string): Promise<AppDatabase> {
  return (await readStoredSlot(slotId)) ?? seedDatabase(slotId, DEFAULT_SLOT_NAME);
}

/** Loads a slot only if it is actually stored, without seeding a fresh one. Throws a `SlotLoadError` if it is stored but broken. */
export async function loadStoredSlot(slotId: string): Promise<AppDatabase | null> {
  return readStoredSlot(slotId);
}

const MAX_STORED_IMAGES = 3;
const MAX_SNAPSHOTS = 1;

function trimDatabase(db: AppDatabase, maxImages: number, maxSnapshots: number): AppDatabase {
  const imageIndexes: number[] = [];

  for (let index = db.rawLog.length - 1; index >= 0; index -= 1) {
    const entry = db.rawLog[index];

    if (entry.image?.startsWith('data:')) {
      imageIndexes.push(index);
    }
  }

  const keepImages = new Set(imageIndexes.slice(0, maxImages));

  const rawLog = db.rawLog.map((entry, index) =>
    entry.image?.startsWith('data:') && !keepImages.has(index)
      ? { ...entry, image: null }
      : entry
  );

  return {
    ...db,
    rawLog,
    snapshots: db.snapshots.slice(-maxSnapshots),
  };
}

export function backupKey(slotId: string) {
  return `${SLOT_PREFIX}${slotId}.bak`;
}

/** The local calendar day of a real-world time, e.g. "2026-11-11". */
function realDay(at: number) {
  const date = new Date(at);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/** Slots whose daily backup has been checked today, this session. */
const backupCheckedOn = new Map<string, string>();

/**
 * Once per real-world day, on the first save of the day, the copy stored so
 * far (yesterday's, or older) is kept under `kan.slot.<id>.bak`. One read per
 * slot per day; never fails the save.
 */
async function keepDailyBackup(slotId: string, now: number) {
  const today = realDay(now);

  if (backupCheckedOn.get(slotId) === today) {
    return;
  }

  backupCheckedOn.set(slotId, today);

  try {
    const previous = await readSlotJson(`${SLOT_PREFIX}${slotId}.v1`);

    if (!previous) {
      return;
    }

    const updatedAt = (JSON.parse(previous) as AppDatabase)?.meta?.updatedAt;

    if (typeof updatedAt === 'number' && realDay(updatedAt) !== today) {
      await writeSlotJson(backupKey(slotId), previous);
    }
  } catch {
    // A missed backup is not worth failing the save over; try again tomorrow.
  }
}

export type BackupInfo = { updatedAt: number; storyTurns: number; inStoryDate: AppDatabase['state']['inStoryDate'] };

/** What the daily backup holds, or null when there is none (or it can't be read). */
export async function backupInfo(slotId: string): Promise<BackupInfo | null> {
  try {
    const stored = await readSlotJson(backupKey(slotId));

    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as AppDatabase;
    return {
      updatedAt: parsed.meta?.updatedAt ?? 0,
      storyTurns: storyEntryCount(parsed),
      inStoryDate: parsed.state?.inStoryDate,
    };
  } catch {
    return null;
  }
}

/**
 * Swaps the daily backup in as the slot. The copy it replaces is kept under
 * `kan.slot.<id>.before-restore.<timestamp>`, so a restore can itself be undone
 * by hand. Throws if the backup can't be opened.
 */
export async function restoreBackup(slotId: string): Promise<AppDatabase> {
  const stored = await readSlotJson(backupKey(slotId));

  if (!stored) {
    throw new Error('There is no backup of this story yet.');
  }

  const parsed = JSON.parse(stored) as AppDatabase;

  if (!parsed || parsed.schemaVersion !== 1) {
    throw new Error('The backup is not readable.');
  }

  const restored = normalizeDatabase(parsed);
  const current = await readSlotJson(`${SLOT_PREFIX}${slotId}.v1`).catch(() => null);

  if (current) {
    await writeSlotJson(`${SLOT_PREFIX}${slotId}.before-restore.${Date.now()}`, current);
  }

  brokenSlots.delete(slotId);
  // The restored copy must not become today's backup of itself.
  backupCheckedOn.set(slotId, realDay(Date.now()));
  await saveSlot(restored);
  return restored;
}

/** Story entries in the log (Kan's actions and the replies). */
export function storyEntryCount(db: Pick<AppDatabase, 'rawLog'>) {
  return Array.isArray(db.rawLog) ? db.rawLog.filter((entry) => entry?.kind === 'story').length : 0;
}

/** Story turns (replies) since the last export, for the quiet export reminder. */
export function turnsSinceExport(db: AppDatabase) {
  return Math.max(0, Math.floor((storyEntryCount(db) - (db.meta.exportedAtTurn ?? 0)) / 2));
}

export const EXPORT_REMINDER_TURNS = 50;

/** Tests only. */
export function resetBackupsForTests() {
  backupCheckedOn.clear();
}

export async function saveSlot(db: AppDatabase) {
  const next = {
    ...db,
    meta: {
      ...db.meta,
      updatedAt: Date.now(),
    },
  };

  const key = `${SLOT_PREFIX}${next.meta.slotId}.v1`;

  if (brokenSlots.has(next.meta.slotId)) {
    // Never write over a save that failed to open: the real one may still be there.
    throw new Error('This story could not be opened, so nothing is saved to it until it opens again.');
  }

  if (readOnlySlots.has(next.meta.slotId)) {
    throw new Error('Kan is open in another tab, so this tab does not save.');
  }

  await keepDailyBackup(next.meta.slotId, next.meta.updatedAt);

  // Progressive trimming: try the full save first, then strip increasingly
  // heavy data until the write succeeds or there is nothing left to cut.
  const attempts = [
    next,
    trimDatabase(next, MAX_STORED_IMAGES, MAX_SNAPSHOTS),
    trimDatabase(next, 1, 0),
    trimDatabase(next, 0, 0),
  ];

  for (const attempt of attempts) {
    try {
      await writeSlotJson(key, JSON.stringify(attempt));
      return;
    } catch (error) {
      if (attempt === attempts[attempts.length - 1]) {
        throw error;
      }
    }
  }
}

export async function createSlot(slotName: string): Promise<AppDatabase> {
  const slotId = makeId('slot');
  const db = seedDatabase(slotId, slotName || 'New story');
  await saveSlot(db);

  const meta = await loadStorageMeta();
  const nextMeta = {
    activeSlotId: db.meta.slotId,
    slotOrder: [...meta.slotOrder, db.meta.slotId],
  };
  await saveStorageMeta(nextMeta);

  return db;
}

export async function duplicateSlot(sourceSlotId: string, slotName: string): Promise<AppDatabase> {
  const source = await loadSlot(sourceSlotId);
  const slotId = makeId('slot');
  const copy: AppDatabase = {
    ...source,
    meta: {
      ...source.meta,
      slotId,
      slotName: slotName || `${source.meta.slotName} copy`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    snapshots: [],
  };

  await saveSlot(copy);

  const meta = await loadStorageMeta();
  await saveStorageMeta({
    activeSlotId: slotId,
    slotOrder: [...meta.slotOrder, slotId],
  });

  return copy;
}

export async function deleteSlot(slotId: string) {
  // Deleting is the player's choice: a broken slot's raw copy is already set aside.
  brokenSlots.delete(slotId);
  const meta = await loadStorageMeta();
  const slotOrder = meta.slotOrder.filter((id) => id !== slotId);

  await removeSlotJson(`${SLOT_PREFIX}${slotId}.v1`);

  if (slotOrder.length === 0) {
    const fresh = seedDatabase(slotId, DEFAULT_SLOT_NAME);
    await saveSlot(fresh);
    await saveStorageMeta({
      activeSlotId: slotId,
      slotOrder: [slotId],
    });
    return;
  }

  const activeSlotId =
    meta.activeSlotId === slotId ? slotOrder[slotOrder.length - 1] : meta.activeSlotId;

  await saveStorageMeta({
    activeSlotId,
    slotOrder,
  });
}

export async function renameSlot(slotId: string, slotName: string) {
  const db = await loadSlot(slotId);
  const next = {
    ...db,
    meta: {
      ...db.meta,
      slotName,
    },
  };
  await saveSlot(next);
  return next;
}

export async function switchSlot(slotId: string) {
  const meta = await loadStorageMeta();

  if (!meta.slotOrder.includes(slotId)) {
    return null;
  }

  await saveStorageMeta({
    ...meta,
    activeSlotId: slotId,
  });

  return loadSlot(slotId);
}

export const BROKEN_SLOT_NAME = 'A story that could not be opened';

/**
 * Every slot, for the story list. A slot that fails to open is listed as a
 * placeholder (see `isSlotBroken`), so one broken save never hides the rest
 * and can't be written over: `saveSlot` refuses broken slots.
 */
export async function listSlots(): Promise<AppDatabase[]> {
  const meta = await loadStorageMeta();
  const slots = await Promise.all(
    meta.slotOrder.map((id) =>
      loadSlot(id).catch((error) => {
        if (error instanceof SlotLoadError) {
          return seedDatabase(id, BROKEN_SLOT_NAME);
        }
        throw error;
      })
    )
  );
  return slots;
}

export async function loadActiveSlot(): Promise<AppDatabase> {
  const meta = await loadStorageMeta();
  return loadSlot(meta.activeSlotId);
}

export async function loadApiKey(): Promise<string> {
  return (await AsyncStorage.getItem(API_KEY_KEY)) ?? '';
}

export async function saveApiKey(key: string) {
  const trimmed = key.trim();

  if (trimmed) {
    await AsyncStorage.setItem(API_KEY_KEY, trimmed);
    return;
  }

  await AsyncStorage.removeItem(API_KEY_KEY);
}

export function exportDatabase(db: AppDatabase) {
  const exportable = {
    ...db,
    snapshots: [],
  };

  return JSON.stringify(exportable, null, 2);
}

export async function importDatabase(
  json: string,
  slotName?: string
): Promise<AppDatabase> {
  const parsed = JSON.parse(json) as AppDatabase;

  if (!parsed || parsed.schemaVersion !== 1) {
    throw new Error('This save file is not a valid Kan story database.');
  }

  const slotId = makeId('slot');
  const normalized = normalizeDatabase(parsed);
  const imported: AppDatabase = {
    ...normalized,
    meta: {
      ...normalized.meta,
      slotId,
      slotName: slotName?.trim() || `${normalized.meta.slotName} import`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      // The file it came from is itself an export of everything in it.
      exportedAtTurn: storyEntryCount(normalized),
      exportedAt: Date.now(),
    },
    snapshots: [],
  };

  await saveSlot(imported);

  const meta = await loadStorageMeta();
  await saveStorageMeta({
    activeSlotId: slotId,
    slotOrder: [...meta.slotOrder, slotId],
  });

  return imported;
}

function migrateCanonV2(db: AppDatabase): AppDatabase {
  const progress = db.state?.canonProgress;

  if (!progress || (typeof progress.version === 'number' && progress.version >= CANON_VERSION)) {
    return db;
  }

  const canonFactIds = new Set(
    (db.facts ?? [])
      .filter((fact) => /^fact_(canon|attended|missed)_/.test(fact.id))
      .map((fact) => fact.id)
  );
  const canonThreadIds = new Set(
    (db.threads ?? []).filter((thread) => thread.id.startsWith('thread_canon_')).map((thread) => thread.id)
  );
  const canonPoints = new Set([
    ...(CANON_MILESTONES.map((milestone) => milestone.canonPoint).filter(Boolean) as string[]),
    ...LEGACY_CANON_POINTS,
  ]);
  const canonEventIds = new Set(
    (db.events ?? [])
      .filter(
        (event) => event.tags?.includes('canon') || event.id.startsWith('event_canon_')
      )
      .map((event) => event.id)
  );

  const next: AppDatabase = {
    ...db,
    events: (db.events ?? []).filter((event) => !canonEventIds.has(event.id)),
    facts: (db.facts ?? []).filter((fact) => !canonFactIds.has(fact.id)),
    threads: (db.threads ?? []).filter((thread) => !canonThreadIds.has(thread.id)),
    eventEntities: (db.eventEntities ?? []).filter(
      (link) => !canonEventIds.has(link.eventId)
    ),
    state: {
      ...db.state,
      canonPoint:
        db.state?.canonPoint && canonPoints.has(db.state.canonPoint)
          ? (db.state.scene || 'The story is still unfolding.')
          : db.state?.canonPoint,
      canonProgress: {
        version: CANON_VERSION,
        baselineDate: db.state?.inStoryDate,
        baselineTurn: (db.rawLog ?? []).filter(
          (entry) => entry.kind === 'story' && entry.role === 'assistant'
        ).length,
        completed: [],
        active: [],
        engaged: [],
        expired: [],
        heard: {},
      },
    },
  };

  return next;
}

export function normalizeDatabase(db: AppDatabase): AppDatabase {
  const migrated = migrateCanonV2(db);
  db = migrated;
  const normalized: AppDatabase = {
    schemaVersion: 1,
    meta: db.meta ?? {
      slotId: makeId('slot'),
      slotName: DEFAULT_SLOT_NAME,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    settings: {
      ...DEFAULT_SETTINGS,
      ...(db.settings ?? {}),
      contextMessages: DEFAULT_SETTINGS.contextMessages,
      retrievalLimit: DEFAULT_SETTINGS.retrievalLimit,
      autoSummarizeThreshold: DEFAULT_SETTINGS.autoSummarizeThreshold,
      temperature: DEFAULT_SETTINGS.temperature,
      maxTokens: DEFAULT_SETTINGS.maxTokens,
      canonProgress: true,
      promptTokenBudget: normalizePromptBudget(db.settings?.promptTokenBudget),
    },
    rawLog: Array.isArray(db.rawLog)
      ? db.rawLog.map((entry) =>
          entry.kind === 'story' && entry.role === 'assistant' && entry.content
            ? { ...entry, content: stripNarrationJson(entry.content) }
            : entry
        )
      : [],
    jutsuRecords: Array.isArray(db.jutsuRecords)
      ? db.jutsuRecords.map((record) => ({
          ...record,
          chakraNature: normalizeJutsuNature(record.chakraNature),
          effect: record.effect ?? record.description ?? '',
          visual: record.visual ?? '',
          description: record.description ?? '',
        }))
      : [],
    entities: ensureCanonCast(
      Array.isArray(db.entities)
        ? db.entities.map((entity) => ({
          ...entity,
          mood:
            entity.mood ??
            (entity.type === 'character' ? 'Unknown' : undefined),
          appearance:
            entity.appearance ??
            (entity.type === 'character' ? 'Unknown' : undefined),
          gender: entity.type === 'character' ? (entity.gender ?? genderOf(entity)) : undefined,
          // Kan is straight: men are never romance options, and he has none himself.
          romanceAccessibility:
            entity.type !== 'character' || entity.name.toLowerCase() === 'kan'
              ? undefined
              : (entity.gender ?? genderOf(entity)) === 'male'
                ? 'not-applicable'
                : entity.romanceAccessibility,
        }))
        : [],
      () => makeId('entity'),
      // People who arrive with a milestone (a birth, a revival) once it has happened.
      db.state?.canonProgress?.completed ?? []
    ),
    events: Array.isArray(db.events) ? db.events : [],
    eventEntities: Array.isArray(db.eventEntities) ? db.eventEntities : [],
    bonds: Array.isArray(db.bonds)
      ? db.bonds.map((bond) => ({
          ...bond,
          relationship:
            bond.relationship ??
            (bond.affinity >= 7
              ? 'close'
              : bond.affinity >= 4
                ? 'friendly'
                : bond.affinity <= -4
                  ? 'rejected'
                  : 'stranger'),
          attraction: bond.attraction ?? 'none',
          theirFeelings: { affinity: bond.affinity, note: bond.note ?? '' },
          yourFeelings: bond.yourFeelings ?? { affinity: bond.affinity, note: '' },
        }))
      : [],
    facts: Array.isArray(db.facts) ? db.facts : [],
    threads: Array.isArray(db.threads) ? db.threads : [],
    // The geography paragraph is the app's, not the story's: older saves get the current one.
    loreEntries: Array.isArray(db.loreEntries)
      ? db.loreEntries.map((lore) =>
          typeof lore.text === 'string' && lore.text.startsWith('GEOGRAPHY (fixed') && lore.text !== GEOGRAPHY_LORE
            ? { ...lore, text: GEOGRAPHY_LORE }
            : lore
        )
      : [],
    // The same summary saved twice (a job that ran twice) is kept once.
    summaries: Array.isArray(db.summaries)
      ? db.summaries.filter(
          (summary, index, all) =>
            all.findIndex(
              (other) => other.level === summary.level && other.text.trim() === summary.text.trim()
            ) === index
        )
      : [],
    state: normalizeState(db.state),
    indices: db.indices ?? emptyIndex(),
    snapshots: Array.isArray(db.snapshots) ? db.snapshots : [],
    portraits: Array.isArray(db.portraits)
      ? db.portraits.filter((portrait) => portrait && typeof portrait.image === 'string')
      : [],
    characterPortraits: Array.isArray(db.characterPortraits)
      ? db.characterPortraits.filter(
          (portrait) => portrait && typeof portrait.image === 'string' && typeof portrait.entityId === 'string'
        )
      : [],
    characterFaces: Array.isArray(db.characterFaces)
      ? db.characterFaces.filter(
          (face) => face && typeof face.image === 'string' && typeof face.entityId === 'string'
        )
      : [],
    memoryJobs: Array.isArray(db.memoryJobs)
      ? db.memoryJobs.filter((job) => job && typeof job.turnLogId === 'string')
      : [],
  };

  const withDeaths = ensureNames(dropBareNatureJutsu(repairUnmetLabels(normalizeDeaths(normalizeFactKnowers(normalized)))));
  withDeaths.indices = buildIndices(withDeaths);

  return withDeaths;
}

/** A saved person's gender when the save doesn't say: the canon cast's, else unknown. */
function genderOf(entity: { name: string; tags?: string[] }) {
  if (entity.name.toLowerCase() === 'kan') return 'male' as const;
  if (FEMALE_CAST.has(entity.name)) return 'female' as const;
  if (CANON_CAST.some((entry) => entry.name === entity.name)) return 'male' as const;
  return 'unknown' as const;
}

/** who_knows holds entity ids (plus group tags); names from older saves and the seed are converted. */
function normalizeFactKnowers(db: AppDatabase): AppDatabase {
  const ids = new Set(db.entities.map((entity) => entity.id));

  if (db.facts.every((fact) => fact.whoKnows.every((name) => ids.has(name)))) {
    return db;
  }

  return {
    ...db,
    facts: db.facts.map((fact) => {
      if (fact.whoKnows.every((name) => ids.has(name))) {
        return fact;
      }

      const knowers = knowersOf(db, fact.whoKnows);
      const groups = [...new Set([...(fact.whoKnowsGroups ?? []), ...knowers.groups])];

      return { ...fact, whoKnows: knowers.ids, ...(groups.length > 0 ? { whoKnowsGroups: groups } : {}) };
    }),
  };
}

export function buildIndices(db: AppDatabase): MemoryIndex {
  const index = emptyIndex();

  for (const event of db.events) {
    // Year-month-day, padded so keys sort ("13-10-01").
    const dateKey = `${String(event.inStoryDate.year).padStart(2, '0')}-${String(event.inStoryDate.month).padStart(2, '0')}-${String(event.inStoryDate.day).padStart(2, '0')}`;

    pushIndex(index.eventsByDate, dateKey, event.id);

    for (const tag of event.tags) {
      pushIndex(index.eventsByTag, tag.toLowerCase(), event.id);
    }

    for (const link of db.eventEntities) {
      if (link.eventId !== event.id) {
        continue;
      }

      pushIndex(index.eventsByEntity, link.entityId, event.id);
    }
  }

  for (const fact of db.facts) {
    if (fact.subjectEntityId) {
      pushIndex(index.factsBySubject, fact.subjectEntityId, fact.id);
    }
  }

  for (const thread of db.threads) {
    pushIndex(index.threadsByStatus, thread.status, thread.id);
  }

  for (const lore of db.loreEntries) {
    for (const keyword of lore.keywords) {
      pushIndex(index.loreByKeyword, keyword.toLowerCase(), lore.id);
    }
  }

  return index;
}

let seededStateCache: AppDatabase['state'] | null = null;

/** A fresh story's state, built once: only read for defaults, never handed out to mutate. */
function seededState(): AppDatabase['state'] {
  if (!seededStateCache) {
    seededStateCache = seedDatabase('slot_defaults', DEFAULT_SLOT_NAME).state;
  }
  return seededStateCache;
}

function normalizeState(state: AppDatabase['state'] | undefined): AppDatabase['state'] {
  if (!state) {
    return seedDatabase(makeId('slot'), DEFAULT_SLOT_NAME).state;
  }

  const seeded = seededState();

  // Start from everything stored, so a field added to GameState later survives
  // a load even if nobody adds a repair for it here; then repair what needs it.
  return {
    ...state,
    player: state.player
      ? {
          ...state.player,
          birthYear: state.player.birthYear ?? seeded.player.birthYear,
        }
      : structuredClone(seeded.player),
    mood: state.mood ?? seeded.mood,
    worldDescription: state.worldDescription ?? seeded.worldDescription,
    jutsu: Array.isArray(state.jutsu) ? state.jutsu : [...seeded.jutsu],
    inventory: Array.isArray(state.inventory) ? state.inventory : [...seeded.inventory],
    location: state.location ?? seeded.location,
    locationKind:
      state.locationKind === 'settlement' ||
      state.locationKind === 'road' ||
      state.locationKind === 'wilderness' ||
      state.locationKind === 'structure'
        ? state.locationKind
        : undefined,
    inStoryDate: normalizeDate(state.inStoryDate, seeded.inStoryDate),
    turnsWithoutTimeChange:
      typeof state.turnsWithoutTimeChange === 'number'
        ? Math.max(0, Math.round(state.turnsWithoutTimeChange))
        : 0,
    canonPoint: state.canonPoint ?? seeded.canonPoint,
    canonProgress:
      state.canonProgress && Array.isArray(state.canonProgress.completed)
        ? {
            version: state.canonProgress.version ?? CANON_VERSION,
            baselineDate: state.canonProgress.baselineDate,
            baselineTurn: state.canonProgress.baselineTurn ?? 0,
            completed: state.canonProgress.completed.filter(Boolean),
            active: Array.isArray(state.canonProgress.active)
              ? state.canonProgress.active.filter(Boolean)
              : [],
            engaged: Array.isArray(state.canonProgress.engaged)
              ? state.canonProgress.engaged.filter(Boolean)
              : [],
            expired: Array.isArray(state.canonProgress.expired)
              ? state.canonProgress.expired.filter(Boolean)
              : [],
            heard:
              state.canonProgress.heard && typeof state.canonProgress.heard === 'object'
                ? state.canonProgress.heard
                : {},
          }
        : {
            version: CANON_VERSION,
            baselineDate: state.inStoryDate,
            baselineTurn: 0,
            completed: [],
            active: [],
            engaged: [],
            expired: [],
            heard: {},
          },
    chapter: state.chapter ?? seeded.chapter,
    chapterTitle: typeof state.chapterTitle === 'string' ? state.chapterTitle : undefined,
    chapterStart: state.chapterStart,
    chapters: Array.isArray(state.chapters) ? state.chapters : [],
    sceneSeq: typeof state.sceneSeq === 'number' ? state.sceneSeq : undefined,
    sceneClosed: state.sceneClosed === true,
    scene: state.scene ?? seeded.scene,
    scenePace:
      state.scenePace === 'combat' ||
      state.scenePace === 'chase' ||
      state.scenePace === 'conversation' ||
      state.scenePace === 'travel' ||
      state.scenePace === 'downtime'
        ? state.scenePace
        : undefined,
    sceneCast: Array.isArray(state.sceneCast)
      ? state.sceneCast.filter(Boolean).slice(0, 6)
      : [],
    sceneMode: normalizeSceneMode(state.sceneMode),
    post: normalizePost(state.post),
    reputation: normalizeReputation(state.reputation),
    yearly: normalizeYearly(state.yearly),
    renown: normalizeRenown(state.renown),
    consequences: normalizeConsequences(state.consequences),
    weather: normalizeWeather(state.weather),
    travelLog: normalizeTravelLog(state.travelLog, state.location ?? seeded.location, normalizeDate(state.inStoryDate, seeded.inStoryDate)),
    flashbacks: normalizeFlashbacks(state.flashbacks),
    safehouses: normalizeSafehouses(state.safehouses),
    purse: normalizePurse(state.purse),
    namesVersion: typeof state.namesVersion === 'number' ? state.namesVersion : undefined,
  };
}

function normalizeWeather(value: unknown): WeatherLock | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const lock = value as WeatherLock;

  if (!WEATHER_CONDITIONS.includes(lock.condition) || typeof lock.region !== 'string' || !lock.since) return undefined;

  return {
    region: lock.region,
    condition: lock.condition,
    ...(typeof lock.text === 'string' ? { text: lock.text.slice(0, 60) } : {}),
    since: lock.since,
    ...(typeof lock.sceneSeq === 'number' ? { sceneSeq: lock.sceneSeq } : {}),
    source: lock.source === 'story' ? 'story' : 'world',
  };
}

function pushIndex(record: Record<string, string[]>, key: string, value: string) {
  if (!record[key]) {
    record[key] = [];
  }

  if (!record[key].includes(value)) {
    record[key].push(value);
  }
}
