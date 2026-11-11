/**
 * Where save slots are stored.
 *
 * localStorage only holds about 5 MB for the whole app, shared by every slot,
 * and a long story with its undo snapshots outgrows that. So on the web each
 * slot's JSON lives in IndexedDB (hundreds of MB), and the small things —
 * slot list, API key — stay in AsyncStorage.
 *
 * Old saves are moved over on first read: the IndexedDB copy is written, then
 * the localStorage copy is removed to free the quota. If IndexedDB cannot be
 * opened (native, some private modes), everything stays in AsyncStorage as
 * before. The choice is made once per session, so reads and writes never
 * split across the two.
 *
 * Once any slot has been written to IndexedDB, `kan.backend` remembers it. From
 * then on a failed open (iOS does this after backgrounding) is retried and then
 * reported as an error: falling back to AsyncStorage would show an empty story
 * and, on the next session, let it win over the real one.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const DB_NAME = 'kan-saves';
const STORE = 'slots';

let dbPromise: Promise<IDBDatabase | null> | null = null;

/** Set in AsyncStorage once a slot has been written to IndexedDB. */
export const BACKEND_KEY = 'kan.backend';
const OPEN_ATTEMPTS = 3;
let openRetryDelayMs = 250;

function openOnce(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function openWithRetry(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return null;
  }

  for (let attempt = 0; attempt < OPEN_ATTEMPTS; attempt += 1) {
    const db = await openOnce();

    if (db) {
      return db;
    }

    if (attempt < OPEN_ATTEMPTS - 1) {
      await wait(openRetryDelayMs * (attempt + 1));
    }
  }

  const usedBefore = await AsyncStorage.getItem(BACKEND_KEY).catch(() => null);

  if (usedBefore === 'indexeddb') {
    throw new Error('the browser would not open its save storage');
  }

  // Never used IndexedDB: AsyncStorage is this device's real backend.
  return null;
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) {
    return dbPromise;
  }

  const opening = openWithRetry();
  dbPromise = opening;
  // A failed open is not remembered: the next read (or "Try again") opens afresh.
  opening.catch(() => {
    if (dbPromise === opening) {
      dbPromise = null;
    }
  });

  void requestPersistentStorage();
  return opening;
}

let persistRequested = false;
let persistGranted: boolean | null = null;

/**
 * Asks the browser not to clear the app's data when the device is low on
 * space. Browsers may grant it silently (installed PWAs usually are) or
 * ignore it. The answer is shown in Settings (`storageStatus`).
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (persistRequested) {
    return persistGranted ?? false;
  }

  persistRequested = true;
  persistGranted = await askPersist();
  return persistGranted;
}

export type StorageStatus = {
  /** Null where the browser can't say (native, old browsers). */
  persisted: boolean | null;
  /** Bytes used and available for the whole app, when the browser reports them. */
  usage?: number;
  quota?: number;
};

/** Whether the browser has promised to keep the app's data, and how much space it uses. */
export async function storageStatus(): Promise<StorageStatus> {
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;

  if (!storage) {
    return { persisted: null };
  }

  let persisted: boolean | null = null;

  try {
    persisted = storage.persisted ? await storage.persisted() : null;

    if (persisted === false && !persistRequested) {
      persisted = await requestPersistentStorage();
    }
  } catch {
    persisted = null;
  }

  try {
    const estimate = storage.estimate ? await storage.estimate() : undefined;
    return { persisted, usage: estimate?.usage, quota: estimate?.quota };
  } catch {
    return { persisted };
  }
}

async function askPersist(): Promise<boolean> {
  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;

    if (!storage?.persist) {
      return false;
    }

    if (storage.persisted && (await storage.persisted())) {
      return true;
    }

    return await storage.persist();
  } catch {
    return false;
  }
}

function idbGet(db: IDBDatabase, key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    try {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      request.onsuccess = () =>
        resolve(typeof request.result === 'string' ? request.result : null);
      request.onerror = () => reject(request.error ?? new Error('Could not read the save.'));
    } catch (error) {
      reject(error);
    }
  });
}

/** Resolves once the write is committed; rejects on quota or other errors. */
function idbWrite(db: IDBDatabase, key: string, value: string | null): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);

      if (value === null) {
        store.delete(key);
      } else {
        store.put(value, key);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not write the save.'));
      tx.onabort = () => reject(tx.error ?? new Error('The save was aborted.'));
    } catch (error) {
      reject(error);
    }
  });
}

function rankOf(json: string): { turns: number; updatedAt: number } {
  try {
    const parsed = JSON.parse(json) as {
      meta?: { updatedAt?: unknown };
      rawLog?: { kind?: string; role?: string }[];
    };
    const turns = Array.isArray(parsed?.rawLog)
      ? parsed.rawLog.filter((entry) => entry?.kind === 'story').length
      : 0;
    return {
      turns,
      updatedAt: typeof parsed?.meta?.updatedAt === 'number' ? parsed.meta.updatedAt : 0,
    };
  } catch {
    return { turns: -1, updatedAt: -1 };
  }
}

/**
 * Of two copies of one slot, the one to keep: more story first, then the newer.
 * A copy with fewer turns never wins just because it was saved later (a blank
 * story played for one turn in a fallback session must not beat the real one).
 */
export function pickSlotCopy(a: string, b: string): string {
  const left = rankOf(a);
  const right = rankOf(b);

  if (left.turns !== right.turns) {
    return left.turns > right.turns ? a : b;
  }

  return left.updatedAt >= right.updatedAt ? a : b;
}

/** Where the losing copy of a two-copy conflict is kept. */
export function conflictBackupKey(key: string, at = Date.now()) {
  return `${key}.conflict.${at}`;
}

/** The stored JSON for a slot key, or null. Moves a localStorage copy into IndexedDB. */
export async function readSlotJson(key: string): Promise<string | null> {
  const db = await openDb();

  if (!db) {
    return AsyncStorage.getItem(key);
  }

  const [stored, legacy] = await Promise.all([
    idbGet(db, key),
    AsyncStorage.getItem(key).catch(() => null),
  ]);

  if (!legacy) {
    return stored;
  }

  if (!stored || stored === legacy) {
    try {
      await idbWrite(db, key, legacy);
      await markIndexedDbUsed();
      await AsyncStorage.removeItem(key);
    } catch {
      // Leave it in place; the next read tries again.
    }
    return legacy;
  }

  // Both exist only after a session that couldn't open IndexedDB. Keep the
  // copy with more story, and the other one under a backup key.
  const winner = pickSlotCopy(stored, legacy);
  const loser = winner === stored ? legacy : stored;

  try {
    await idbWrite(db, conflictBackupKey(key), loser);
    if (winner !== stored) {
      await idbWrite(db, key, winner);
    }
    await AsyncStorage.removeItem(key);
  } catch {
    // Leave both in place; the next read tries again.
  }

  return winner;
}

async function markIndexedDbUsed() {
  await AsyncStorage.setItem(BACKEND_KEY, 'indexeddb').catch(() => undefined);
}

/** Writes a slot's JSON. Rejects if it doesn't fit, so callers can trim and retry. */
export async function writeSlotJson(key: string, json: string): Promise<void> {
  const db = await openDb();

  if (!db) {
    await AsyncStorage.setItem(key, json);
    return;
  }

  await idbWrite(db, key, json);
  await markIndexedDbUsed();
  // Drop any leftover localStorage copy so it can't shadow this one or eat quota.
  await AsyncStorage.removeItem(key).catch(() => undefined);
}

export async function removeSlotJson(key: string): Promise<void> {
  const db = await openDb();

  if (db) {
    await idbWrite(db, key, null).catch(() => undefined);
  }

  await AsyncStorage.removeItem(key).catch(() => undefined);
}

/** Which backend this session uses (for Settings/debug and tests). */
export async function slotBackend(): Promise<'indexeddb' | 'asyncstorage'> {
  return (await openDb()) ? 'indexeddb' : 'asyncstorage';
}

/** Tests only: forget the opened database so a new environment is picked up. */
export function resetSlotStoreForTests(options: { retryDelayMs?: number } = {}) {
  dbPromise = null;
  persistRequested = false;
  persistGranted = null;
  openRetryDelayMs = options.retryDelayMs ?? 250;
}

/** Every stored key (IndexedDB only), e.g. to find backups. Empty without IndexedDB. */
export async function listStoredKeys(): Promise<string[]> {
  const db = await openDb();

  if (!db) {
    return [];
  }

  return new Promise((resolve, reject) => {
    try {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
      request.onsuccess = () => resolve((request.result as IDBValidKey[]).map(String));
      request.onerror = () => reject(request.error ?? new Error('Could not list the saves.'));
    } catch (error) {
      reject(error);
    }
  });
}
