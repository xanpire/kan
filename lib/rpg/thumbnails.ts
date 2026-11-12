// Small thumbnails for the scrapbook (audit 11c). Every thumbnail used to
// load its full scene image into memory as soon as the Journal mounted; now a
// thumbnail is drawn only when it comes near the screen, from the stored
// blob (the full image never enters the display cache), at a small size,
// a few at a time, and kept in a small in-memory cache.

import { useEffect, useRef, useState, type RefObject } from 'react';

import { isImageRef, readImageBlob } from './imageStore';

/** Longest side of a thumbnail, in pixels (three columns on a phone, at 2-3x). */
export const THUMB_SIDE = 320;
/** Thumbnails kept in memory. */
export const THUMB_CACHE_LIMIT = 150;
/** Thumbnails drawn at once. */
export const THUMB_CONCURRENCY = 3;

/** A small least-recently-used map. */
export class LruCache<V> {
  private map = new Map<string, V>();

  constructor(private limit: number) {}

  get(key: string): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: string, value: V) {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.limit) {
      const oldest = this.map.keys().next().value as string;
      this.map.delete(oldest);
    }
  }

  get size() {
    return this.map.size;
  }
}

/** Runs async jobs at most `limit` at a time, in the order they were asked for. */
export function limiter(limit: number) {
  let running = 0;
  const waiting: (() => void)[] = [];

  const next = () => {
    if (running >= limit) return;
    const job = waiting.shift();
    if (job) job();
  };

  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      waiting.push(() => {
        running += 1;
        task()
          .then(resolve, reject)
          .finally(() => {
            running -= 1;
            next();
          });
      });
      next();
    });
  };
}

const cache = new LruCache<string>(THUMB_CACHE_LIMIT);
const pending = new Map<string, Promise<string | null>>();
const run = limiter(THUMB_CONCURRENCY);

async function drawThumbnail(blob: Blob): Promise<string | null> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return null;

  const bitmap = await createImageBitmap(blob);

  try {
    const scale = Math.min(1, THUMB_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL('image/webp', 0.7);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.7);
  } finally {
    bitmap.close?.();
  }
}

/** A small thumbnail of a stored image, or null where one can't be drawn (the caller shows the full image). */
export function loadThumbnail(ref: string): Promise<string | null> {
  const hit = cache.get(ref);
  if (hit) return Promise.resolve(hit);

  const already = pending.get(ref);
  if (already) return already;

  const job = run(async () => {
    if (!isImageRef(ref)) return null;
    const blob = await readImageBlob(ref.slice('img:'.length));
    return blob ? drawThumbnail(blob) : null;
  })
    .catch(() => null)
    .then((thumb) => {
      pending.delete(ref);
      if (thumb) cache.set(ref, thumb);
      return thumb;
    });

  pending.set(ref, job);
  return job;
}

/**
 * True once the element has come within a screen or so of the viewport (web:
 * IntersectionObserver). Stays true. Where there is no observer, it is true
 * at once.
 */
export function useNearScreen(ref: RefObject<unknown>, margin = 600): boolean {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  const done = useRef(near);

  useEffect(() => {
    if (done.current) return;
    const node = ref.current as Element | null;

    if (!node || typeof IntersectionObserver === 'undefined' || !(node instanceof Element)) {
      done.current = true;
      setNear(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          done.current = true;
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: `${margin}px 0px` }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [margin, ref]);

  return near;
}
