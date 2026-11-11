/**
 * Image storage outside the save file.
 *
 * Generated images are large data URIs, so they go into their own IndexedDB
 * store and the save only keeps a short reference
 * like `img:abc123`. Where IndexedDB is unavailable (native, private mode),
 * storeImage falls back to returning the data URI itself, so callers never
 * need a second code path.
 */
import { useEffect, useState } from 'react';

import { makeId } from './id';
import { compressImage, FACE_IMAGE, SCENE_IMAGE, type CompressOptions } from './imageCompress';
import type { AppDatabase } from './types';

const DB_NAME = 'kan-images';
const STORE = 'images';
const REF_PREFIX = 'img:';

/**
 * Data URIs of recently used images (model references, exports). Bounded, so a
 * long session doesn't keep every image it ever touched in memory as text.
 */
const DATA_CACHE_LIMIT = 24;
const cache = new Map<string, string>();

function cacheData(ref: string, uri: string) {
  cache.delete(ref);
  cache.set(ref, uri);

  while (cache.size > DATA_CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string;
    cache.delete(oldest);
  }
}

function cachedData(ref: string) {
  const uri = cache.get(ref);

  if (uri) {
    // Most recently used goes to the back.
    cache.delete(ref);
    cache.set(ref, uri);
  }

  return uri;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

export function isImageRef(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith(REF_PREFIX);
}

function isDataUri(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith('data:');
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }

      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }

        try {
          const tx = db.transaction(STORE, mode);
          const request = action(tx.objectStore(STORE));
          let result: T | null = null;
          request.onsuccess = () => {
            result = request.result ?? null;

            if (mode === 'readonly') {
              resolve(result);
            }
          };
          request.onerror = () => resolve(null);

          if (mode === 'readwrite') {
            // A write counts only once it is committed: a put can succeed and
            // its transaction still abort afterwards (quota), leaving nothing stored.
            tx.oncomplete = () => resolve(result ?? (true as unknown as T));
            tx.onabort = () => resolve(null);
            tx.onerror = () => resolve(null);
          }
        } catch {
          resolve(null);
        }
      })
  );
}

function dataUriToBlob(dataUri: string): Blob | null {
  try {
    const [header, body] = dataUri.split(',', 2);
    const mime = /data:([^;]+)/.exec(header)?.[1] ?? 'application/octet-stream';
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

function blobToDataUri(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Stores an image and returns a reference (or the data URI if storage is
 * unavailable). It is recompressed first (WebP, see imageCompress.ts) and kept
 * as binary data, not text, so it takes about a quarter of the room.
 */
export async function storeImage(dataUri: string, options: CompressOptions = SCENE_IMAGE): Promise<string> {
  if (!isDataUri(dataUri)) {
    return dataUri;
  }

  const compressed = await compressImage(dataUri, options).catch(() => dataUri);
  const key = makeId('pic');
  const blob = typeof Blob !== 'undefined' ? dataUriToBlob(compressed) : null;
  const ok = await run('readwrite', (store) => store.put(blob ?? compressed, key));

  if (ok === null) {
    return compressed;
  }

  const ref = `${REF_PREFIX}${key}`;
  cacheData(ref, compressed);
  return ref;
}

/** Resolves a reference or data URI to something an <Image> can show. */
export async function loadImage(value: string | null | undefined): Promise<string | null> {
  if (!value) {
    return null;
  }

  if (!isImageRef(value)) {
    return value;
  }

  const cached = cachedData(value);

  if (cached) {
    return cached;
  }

  const stored = await readStored(value);

  // Older images were kept as text; newer ones as binary.
  const uri =
    typeof stored === 'string'
      ? stored
      : typeof Blob !== 'undefined' && stored instanceof Blob
        ? await blobToDataUri(stored)
        : null;

  if (uri) {
    cacheData(value, uri);
    return uri;
  }

  return null;
}

function readStored(ref: string) {
  return run<string | Blob>('readonly', (store) => store.get(ref.slice(REF_PREFIX.length)));
}

/** Turns whatever an <Image> was shown (a data URI or a blob: URL) back into a data URI for a model call. */
export async function toDataUri(uri: string): Promise<string> {
  if (!uri.startsWith('blob:') || typeof fetch === 'undefined') {
    return uri;
  }

  const blob = await (await fetch(uri)).blob();
  return (await blobToDataUri(blob)) ?? uri;
}

// ---------------------------------------------------------------------------
// Display: object URLs, shared by every mounted view of an image, with a
// small LRU of unused ones. A URL still on screen is never revoked.
// ---------------------------------------------------------------------------

const DISPLAY_LIMIT = 40;
type Displayed = { url: string; users: number; revoke: boolean };
const displayed = new Map<string, Displayed>();
const loadingDisplay = new Map<string, Promise<string | null>>();

function canMakeObjectUrls() {
  return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined';
}

function trimDisplayed() {
  if (displayed.size <= DISPLAY_LIMIT) {
    return;
  }

  // Oldest first (Map keeps insertion order; use refreshes it).
  for (const [ref, entry] of displayed) {
    if (displayed.size <= DISPLAY_LIMIT) {
      break;
    }

    if (entry.users === 0) {
      displayed.delete(ref);

      if (entry.revoke) {
        URL.revokeObjectURL(entry.url);
      }
    }
  }
}

async function makeDisplayUrl(ref: string): Promise<{ url: string; revoke: boolean } | null> {
  const stored = await readStored(ref);

  if (canMakeObjectUrls()) {
    const blob =
      stored instanceof Blob ? stored : typeof stored === 'string' ? dataUriToBlob(stored) : null;

    if (blob) {
      return { url: URL.createObjectURL(blob), revoke: true };
    }
  }

  const uri =
    typeof stored === 'string'
      ? stored
      : typeof Blob !== 'undefined' && stored instanceof Blob
        ? await blobToDataUri(stored)
        : null;
  return uri ? { url: uri, revoke: false } : null;
}

/** A URL to show the image with; call `releaseDisplayUrl` when the view goes away. */
async function acquireDisplayUrl(ref: string): Promise<string | null> {
  const existing = displayed.get(ref);

  if (existing) {
    existing.users += 1;
    displayed.delete(ref);
    displayed.set(ref, existing);
    return existing.url;
  }

  let pending = loadingDisplay.get(ref);

  if (!pending) {
    pending = makeDisplayUrl(ref).then((made) => {
      loadingDisplay.delete(ref);

      if (!made) {
        return null;
      }

      displayed.set(ref, { url: made.url, users: 0, revoke: made.revoke });
      return made.url;
    });
    loadingDisplay.set(ref, pending);
  }

  const url = await pending;
  const entry = displayed.get(ref);

  if (!url || !entry) {
    return null;
  }

  entry.users += 1;
  trimDisplayed();
  return entry.url;
}

function releaseDisplayUrl(ref: string) {
  const entry = displayed.get(ref);

  if (entry) {
    entry.users = Math.max(0, entry.users - 1);
    trimDisplayed();
  }
}

/** Tests: how many display URLs are held, and how many are on screen. */
export function displayCacheStats() {
  let inUse = 0;
  for (const entry of displayed.values()) if (entry.users > 0) inUse += 1;
  return { held: displayed.size, inUse, data: cache.size };
}

// ---------------------------------------------------------------------------
// Garbage collection
// ---------------------------------------------------------------------------

const KEY_RE = /^pic_([0-9a-z]+)$/;
/** Images newer than this are never collected: a painting may not be saved into a story yet. */
const GC_GRACE_MS = 60 * 60 * 1000;

/** When an image key was made (makeId: base36 time + 6 random characters), or null. */
function keyTime(key: string): number | null {
  const match = KEY_RE.exec(key);

  if (!match || match[1].length <= 6) {
    return null;
  }

  const time = Number.parseInt(match[1].slice(0, -6), 36);
  return Number.isFinite(time) ? time : null;
}

/** Every `img:` reference in a piece of text (a save's JSON). */
export function imageRefsIn(text: string): string[] {
  return [...text.matchAll(/img:([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
}

export async function listImageKeys(): Promise<string[]> {
  const keys = await run<IDBValidKey[]>('readonly', (store) => store.getAllKeys());
  return (keys ?? []).map(String);
}

/**
 * Deletes every stored image no save refers to. `inUse` holds the image keys
 * (without "img:") found in every slot, snapshot, backup and trashed story.
 * Recent images are kept whatever (see GC_GRACE_MS).
 */
export async function collectImageGarbage(
  inUse: Set<string>,
  now = Date.now()
): Promise<{ deleted: number; kept: number }> {
  const keys = await listImageKeys();
  const doomed = keys.filter((key) => {
    if (inUse.has(key)) return false;
    const made = keyTime(key);
    return made === null || now - made > GC_GRACE_MS;
  });

  if (doomed.length > 0) {
    await run('readwrite', (store) => {
      let last: IDBRequest<undefined> | null = null;
      for (const key of doomed) last = store.delete(key);
      return last as IDBRequest<undefined>;
    });

    for (const key of doomed) {
      const ref = `${REF_PREFIX}${key}`;
      cache.delete(ref);
      const entry = displayed.get(ref);
      if (entry && entry.users === 0) {
        displayed.delete(ref);
        if (entry.revoke) URL.revokeObjectURL(entry.url);
      }
    }
  }

  return { deleted: doomed.length, kept: keys.length - doomed.length };
}

/** Tests only. */
export function resetImageStoreForTests() {
  dbPromise = null;
  cache.clear();
  displayed.clear();
  loadingDisplay.clear();
}

export async function loadImages(values: string[]): Promise<string[]> {
  const resolved = await Promise.all(values.map((value) => loadImage(value)));
  return resolved.filter((value): value is string => Boolean(value));
}

export function useStoredImage(value: string | null | undefined): string | null {
  const immediate = !value ? null : isImageRef(value) ? displayed.get(value)?.url ?? null : value;
  const [resolved, setResolved] = useState<{ value: string; uri: string | null } | null>(null);

  useEffect(() => {
    if (!value || !isImageRef(value)) {
      return;
    }

    let active = true;
    let held = false;

    void acquireDisplayUrl(value).then((uri) => {
      if (!active) {
        if (uri) releaseDisplayUrl(value);
        return;
      }

      held = Boolean(uri);
      setResolved({ value, uri });
    });

    return () => {
      active = false;

      if (held) {
        releaseDisplayUrl(value);
      }
    };
  }, [value]);

  if (!value) {
    return null;
  }

  if (!isImageRef(value)) {
    return value;
  }

  return resolved?.value === value ? resolved.uri ?? immediate : immediate;
}

function hasInlineImages(db: AppDatabase) {
  return (
    db.rawLog.some((entry) => isDataUri(entry.image)) ||
    (db.portraits ?? []).some((portrait) => isDataUri(portrait.image)) ||
    (db.characterPortraits ?? []).some((portrait) => isDataUri(portrait.image)) ||
    (db.characterFaces ?? []).some((face) => isDataUri(face.image))
  );
}

async function externalizeOne<T extends { image: string }>(item: T): Promise<T> {
  return isDataUri(item.image) ? { ...item, image: await storeImage(item.image) } : item;
}

async function inlineOne<T extends { image: string }>(item: T): Promise<T> {
  return { ...item, image: (await loadImage(item.image)) ?? '' };
}

/** Moves inline data URIs out of the save into IndexedDB. Returns null if nothing changed. */
export async function externalizeImages(db: AppDatabase): Promise<AppDatabase | null> {
  if (!hasInlineImages(db)) {
    return null;
  }

  const rawLog = await Promise.all(
    db.rawLog.map(async (entry) =>
      isDataUri(entry.image) ? { ...entry, image: await storeImage(entry.image) } : entry
    )
  );
  const portraits = db.portraits
    ? await Promise.all(
        db.portraits.map(async (portrait) =>
          isDataUri(portrait.image)
            ? { ...portrait, image: await storeImage(portrait.image) }
            : portrait
        )
      )
    : db.portraits;
  const characterPortraits = db.characterPortraits
    ? await Promise.all(db.characterPortraits.map(externalizeOne))
    : db.characterPortraits;
  const characterFaces = db.characterFaces
    ? await Promise.all(
        db.characterFaces.map(async (face) =>
          isDataUri(face.image) ? { ...face, image: await storeImage(face.image, FACE_IMAGE) } : face
        )
      )
    : db.characterFaces;

  // Snapshots are kept (undo needs them); they never hold inline images.
  const snapshots = db.snapshots.map((snapshot) => ({
    ...snapshot,
    database: {
      ...snapshot.database,
      rawLog: snapshot.database.rawLog.map((entry) => (isDataUri(entry.image) ? { ...entry, image: null } : entry)),
      portraits: undefined,
      characterPortraits: undefined,
      characterFaces: undefined,
    },
  }));

  return { ...db, rawLog, portraits, characterPortraits, characterFaces, snapshots };
}

/** Inlines referenced images back into data URIs, for export files. */
export async function inlineImages(db: AppDatabase): Promise<AppDatabase> {
  const rawLog = await Promise.all(
    db.rawLog.map(async (entry) =>
      isImageRef(entry.image) ? { ...entry, image: await loadImage(entry.image) } : entry
    )
  );
  const portraits = db.portraits
    ? (
        await Promise.all(
          db.portraits.map(async (portrait) => ({
            ...portrait,
            image: (await loadImage(portrait.image)) ?? '',
          }))
        )
      ).filter((portrait) => portrait.image)
    : db.portraits;
  const characterPortraits = db.characterPortraits
    ? (await Promise.all(db.characterPortraits.map(inlineOne))).filter((item) => item.image)
    : db.characterPortraits;
  const characterFaces = db.characterFaces
    ? (await Promise.all(db.characterFaces.map(inlineOne))).filter((item) => item.image)
    : db.characterFaces;

  return { ...db, rawLog, portraits, characterPortraits, characterFaces };
}
