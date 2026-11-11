import { describe, expect, mock, test } from 'bun:test';

mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
    getAllKeys: async () => [],
    multiGet: async () => [],
    multiSet: async () => undefined,
    multiRemove: async () => undefined,
  },
}));

import { normalizeDatabase } from '../lib/rpg/db';
import { seedDatabase } from '../lib/rpg/seed';
import { appendStoryMessage, pushSnapshot, restoreLastSnapshot } from '../lib/rpg/log';
import { carryOverMemory } from '../lib/rpg/memoryJobs';
import { toastDuration } from '../components/toastTiming';

const seed = () => normalizeDatabase(seedDatabase('slot_undo', 'Undo story'));

describe('undo keeps your choices', () => {
  test('the narrator model, the story name and the export mark survive an undo', () => {
    const before = seed();
    const turned = appendStoryMessage(
      appendStoryMessage(pushSnapshot(before), 'user', '*I wait.*', null, 0, 0),
      'assistant',
      'Rain falls.',
      'm',
      0,
      0
    );
    const changed = {
      ...turned,
      settings: { ...turned.settings, narrationModel: 'new/model' },
      meta: { ...turned.meta, slotName: 'Renamed', exportedAtTurn: 2, exportedAt: 123 },
    };

    const restored = restoreLastSnapshot(changed);
    expect(restored).not.toBeNull();
    const next = carryOverMemory(changed, restored!);

    expect(next.rawLog.filter((entry) => entry.kind === 'story')).toHaveLength(
      before.rawLog.filter((entry) => entry.kind === 'story').length
    );
    expect(next.settings.narrationModel).toBe('new/model');
    expect(next.meta.slotName).toBe('Renamed');
    expect(next.meta.exportedAtTurn).toBe(2);
    expect(next.meta.exportedAt).toBe(123);
  });

  test('a save without snapshots has nothing to undo', () => {
    const imported = { ...seed(), snapshots: [] };
    expect(restoreLastSnapshot(imported)).toBeNull();
  });
});

describe('toasts', () => {
  test('stay as long as it takes to read them, errors until tapped', () => {
    expect(toastDuration('Saved.', 'success')).toBe(2800);
    expect(toastDuration('x'.repeat(400), 'info')).toBe(8000);
    expect(toastDuration('Painting failed.', 'error')).toBeNull();
    expect(toastDuration('Turn undone.', 'info', { durationMs: 8000 })).toBe(8000);
  });
});
