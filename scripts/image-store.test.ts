import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { IDBFactory } from 'fake-indexeddb';

const local = new Map<string, string>();
mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => local.get(key) ?? null,
    setItem: async (key: string, value: string) => void local.set(key, value),
    removeItem: async (key: string) => void local.delete(key),
    getAllKeys: async () => [...local.keys()],
    multiGet: async () => [],
    multiSet: async () => undefined,
    multiRemove: async () => undefined,
  },
}));

import { freeUpImageSpace, imageKeysInUse, resetBackupsForTests, saveSlot } from '../lib/rpg/db';
import {
  collectImageGarbage,
  displayCacheStats,
  imageRefsIn,
  listImageKeys,
  loadImage,
  resetImageStoreForTests,
  storeImage,
} from '../lib/rpg/imageStore';
import { seedDatabase } from '../lib/rpg/seed';
import { resetSlotStoreForTests, writeSlotJson } from '../lib/rpg/slotStore';

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const LATER = () => Date.now() + 3 * 3600_000;

function storyWithImage(slotId: string, ref: string) {
  const db = seedDatabase(slotId, 'Test');
  return {
    ...db,
    rawLog: [{ id: 'log_1', turn: 1, kind: 'story', role: 'assistant', content: 'Rain.', image: ref, createdAt: 1 } as any],
  };
}

describe('image garbage collection (audit 3.5)', () => {
  beforeEach(() => {
    local.clear();
    (globalThis as any).indexedDB = new IDBFactory();
    resetSlotStoreForTests({ retryDelayMs: 1 });
    resetImageStoreForTests();
    resetBackupsForTests();
  });

  afterEach(() => {
    delete (globalThis as any).indexedDB;
    resetSlotStoreForTests();
    resetImageStoreForTests();
  });

  test('a stored image is readable as soon as storeImage resolves (resolved on commit)', async () => {
    const ref = await storeImage(PIXEL);
    expect(ref.startsWith('img:')).toBe(true);
    expect(await listImageKeys()).toContain(ref.slice(4));
  });

  test('refs are found anywhere in a save', () => {
    expect(imageRefsIn('{"image":"img:pic_abc","x":["img:pic_d-e_f"]}')).toEqual(['pic_abc', 'pic_d-e_f']);
  });

  test('images no save refers to are deleted; referenced and recent ones stay', async () => {
    const kept = await storeImage(PIXEL);
    const inBackup = await storeImage(PIXEL);
    const orphan = await storeImage(PIXEL);
    await saveSlot(storyWithImage('slot_a', kept));
    await writeSlotJson('kan.slot.slot_a.bak', JSON.stringify(storyWithImage('slot_a', inBackup)));

    // Just painted: kept, it may not be in a save yet.
    expect((await freeUpImageSpace()).deleted).toBe(0);

    const result = await collectImageGarbage(await imageKeysInUse(), LATER());
    expect(result.deleted).toBe(1);
    const keys = await listImageKeys();
    expect(keys).toContain(kept.slice(4));
    expect(keys).toContain(inBackup.slice(4));
    expect(keys).not.toContain(orphan.slice(4));
  });

  test('the open story in memory counts even before it is saved', async () => {
    const fresh = await storeImage(PIXEL);
    const inUse = await imageKeysInUse([storyWithImage('slot_b', fresh) as any]);
    await collectImageGarbage(inUse, LATER());
    expect(await listImageKeys()).toContain(fresh.slice(4));
  });

  test('the data cache is bounded', async () => {
    for (let index = 0; index < 30; index += 1) {
      await loadImage(await storeImage(PIXEL));
    }
    expect(displayCacheStats().data).toBeLessThanOrEqual(24);
  });
});
