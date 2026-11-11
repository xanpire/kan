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

// ---------------------------------------------------------------------------
// Audit 3.6: zip export and import, and Recently deleted.
// ---------------------------------------------------------------------------

import {
  clearBrokenSlot,
  deleteSlot,
  importDatabase,
  listTrash,
  loadSlot,
  purgeTrash,
  restoreFromTrash,
} from '../lib/rpg/db';
import { buildExportZip, exportFileName, isZip, readSaveFile, saveJson } from '../lib/rpg/saveFile';
import { listStoredKeys } from '../lib/rpg/slotStore';

describe('export files (audit 3.6)', () => {
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

  test('a zip export carries compact save.json and the images, and imports back', async () => {
    const ref = await storeImage(PIXEL);
    const db = { ...storyWithImage('slot_a', ref), snapshots: [{ at: 1 } as any] };
    const zip = await buildExportZip(db as any);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    expect(isZip(bytes)).toBe(true);

    // A fresh device: no images stored yet.
    (globalThis as any).indexedDB = new IDBFactory();
    resetSlotStoreForTests({ retryDelayMs: 1 });
    resetImageStoreForTests();
    expect(await listImageKeys()).toEqual([]);

    const json = await readSaveFile(bytes);
    expect(json.startsWith('{"')).toBe(true);
    expect(json).not.toContain('\n  ');
    expect(JSON.parse(json).snapshots).toEqual([]);
    expect(await listImageKeys()).toEqual([ref.slice(4)]);

    const imported = await importDatabase(json, 'Back');
    expect(imported.rawLog[0].image).toBe(ref);
  });

  test('an old pretty-printed JSON save still imports', async () => {
    const old = JSON.stringify(seedDatabase('slot_old', 'Old'), null, 2);
    const json = await readSaveFile(new TextEncoder().encode(old));
    expect((await importDatabase(json)).meta.slotName).toBe('Old import');
  });

  test('a zip without save.json is refused with a plain message', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    await expect(readSaveFile(zipSync({ 'other.txt': strToU8('x') }))).rejects.toThrow('no save.json');
  });

  test('compact JSON and safe file names', () => {
    expect(saveJson(seedDatabase('slot_x', 'X'))).not.toContain('\n');
    expect(exportFileName('Main / Story: 2', true)).toBe('kan-story-Main-Story-2.zip');
    expect(exportFileName('', false)).toBe('kan-story-save-no-images.json');
  });
});

describe('Recently deleted (audit 3.6)', () => {
  beforeEach(() => {
    local.clear();
    (globalThis as any).indexedDB = new IDBFactory();
    resetSlotStoreForTests({ retryDelayMs: 1 });
    resetBackupsForTests();
  });

  afterEach(() => {
    delete (globalThis as any).indexedDB;
    resetSlotStoreForTests();
    clearBrokenSlot('slot_a');
  });

  async function twoStories() {
    await saveSlot({ ...storyWithImage('slot_a', 'img:pic_x'), meta: { ...seedDatabase('slot_a', 'Alpha').meta } } as any);
    await saveSlot(seedDatabase('slot_b', 'Beta'));
    local.set('kan.meta.v1', JSON.stringify({ activeSlotId: 'slot_a', slotOrder: ['slot_a', 'slot_b'] }));
  }

  test('deleting moves a story to the trash, and it can be restored', async () => {
    await twoStories();
    await deleteSlot('slot_a');
    expect(JSON.parse(local.get('kan.meta.v1')!).slotOrder).toEqual(['slot_b']);
    const trash = await listTrash();
    expect(trash.map((item) => item.slotName)).toEqual(['Alpha']);
    expect(trash[0].storyTurns).toBe(1);

    const restored = await restoreFromTrash(trash[0].key);
    expect(restored.meta.slotName).toBe('Alpha');
    expect(JSON.parse(local.get('kan.meta.v1')!).slotOrder).toEqual(['slot_b', restored.meta.slotId]);
    expect((await loadSlot(restored.meta.slotId)).rawLog.length).toBe(1);
    expect(await listTrash()).toEqual([]);
  });

  test('a trashed story keeps its images from being collected', async () => {
    await twoStories();
    await deleteSlot('slot_a');
    expect((await imageKeysInUse()).has('pic_x')).toBe(true);
  });

  test('after seven days the trash and every other copy of that slot go', async () => {
    await twoStories();
    await writeSlotJson('kan.slot.slot_a.bak', JSON.stringify(seedDatabase('slot_a', 'Alpha backup')));
    await deleteSlot('slot_a');
    expect(await purgeTrash(Date.now() + 6 * 86_400_000)).toBe(0);
    expect(await purgeTrash(Date.now() + 8 * 86_400_000)).toBe(1);
    const keys = await listStoredKeys();
    expect(keys.filter((key) => key.startsWith('kan.slot.slot_a.'))).toEqual([]);
    expect(keys).toContain('kan.slot.slot_b.v1');
  });

  test('deleting the last story starts a fresh one under a new id', async () => {
    await saveSlot(seedDatabase('slot_a', 'Only'));
    local.set('kan.meta.v1', JSON.stringify({ activeSlotId: 'slot_a', slotOrder: ['slot_a'] }));
    await deleteSlot('slot_a');
    const meta = JSON.parse(local.get('kan.meta.v1')!);
    expect(meta.slotOrder.length).toBe(1);
    expect(meta.slotOrder[0]).not.toBe('slot_a');
    expect((await listTrash()).length).toBe(1);
  });
});
