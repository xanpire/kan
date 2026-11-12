import { describe, expect, test } from 'bun:test';
import { LruCache, limiter } from '../lib/rpg/thumbnails';

describe('scrapbook thumbnails (audit 11c)', () => {
  test('the cache keeps the most recently used', () => {
    const cache = new LruCache<string>(2);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.get('a');
    cache.set('c', '3');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('1');
    expect(cache.size).toBe(2);
  });

  test('only a few are drawn at once', async () => {
    const run = limiter(3);
    let now = 0;
    let most = 0;
    const job = () =>
      run(async () => {
        now += 1;
        most = Math.max(most, now);
        await new Promise((resolve) => setTimeout(resolve, 5));
        now -= 1;
        return true;
      });
    const results = await Promise.all(Array.from({ length: 12 }, job));
    expect(results.every(Boolean)).toBe(true);
    expect(most).toBe(3);
  });
});
