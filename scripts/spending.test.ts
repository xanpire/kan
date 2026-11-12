/**
 * Spending on a story (audit 10): its own running totals in the save, fed by
 * the Debug log's calls, never taken back by undo or an older copy.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';

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

import { beginDebugTurn, recordDebugCall } from '../lib/rpg/debug';
import { normalizeDatabase } from '../lib/rpg/db';
import { seedDatabase } from '../lib/rpg/seed';
import {
  foldSpending,
  formatDollars,
  noteSpend,
  pendingSpending,
  resetPendingSpending,
  spendingLine,
  storySpending,
} from '../lib/rpg/spending';

const usage = (cost: number | null) => ({
  promptTokens: 100,
  completionTokens: 50,
  reasoningTokens: 0,
  cachedTokens: 0,
  estimated: false,
  cost,
  generationId: null,
  servedModel: null,
  provider: null,
  durationMs: 10,
});

beforeEach(() => resetPendingSpending());

describe('spending on a story', () => {
  test('debug calls feed the story they belong to: narrator turns, paintings, the rest', () => {
    const turn = beginDebugTurn({ slotId: 'slot_spend', action: 'x', narratorModel: 'm', prompt: [], promptEstimate: 0 });
    recordDebugCall(turn, { kind: 'narrator', model: 'm', usage: usage(0.01) });
    recordDebugCall(turn, { kind: 'state', model: 'm', usage: usage(0.002) });
    recordDebugCall(turn, { kind: 'image', model: 'm', usage: usage(0.04) });
    recordDebugCall(turn, { kind: 'narrator', model: 'm', usage: null, error: 'timeout' });

    const pending = pendingSpending('slot_spend');
    expect(pending?.total).toBeCloseTo(0.052, 6);
    expect(pending?.turns).toBe(1);
    expect(pending?.images).toBe(1);
    expect(pendingSpending('slot_other')).toBeNull();
  });

  test('folding moves pending costs into the save once', () => {
    const db = normalizeDatabase(seedDatabase('slot_fold', 'Fold'));
    noteSpend('slot_fold', 0.02, 'turn');
    noteSpend('slot_fold', 0.005, 'other');

    const saved = foldSpending(db, null);
    expect(saved.spending?.total).toBeCloseTo(0.025, 6);
    expect(saved.spending?.turns).toBe(1);
    expect(pendingSpending('slot_fold')).toBeNull();
    expect(foldSpending(saved, saved).spending).toBe(saved.spending);
  });

  test('an older copy (undo, a snapshot) never lowers the totals', () => {
    const before = normalizeDatabase(seedDatabase('slot_undo', 'Undo'));
    noteSpend('slot_undo', 0.03, 'turn');
    const after = foldSpending(before, null);

    // Undo hands back the copy from before the turn, without spending.
    const undone = foldSpending(before, after);
    expect(undone.spending?.total).toBeCloseTo(0.03, 6);

    noteSpend('slot_undo', 0.01, 'turn');
    const next = foldSpending(undone, undone);
    expect(next.spending?.total).toBeCloseTo(0.04, 6);
    expect(next.spending?.turns).toBe(2);
  });

  test('another story in memory does not leak into this one', () => {
    const open = foldSpending(normalizeDatabase(seedDatabase('slot_a', 'A')), null);
    noteSpend('slot_a', 0.5, 'turn');
    const a = foldSpending(open, null);
    const b = foldSpending(normalizeDatabase(seedDatabase('slot_b', 'B')), a);

    expect(b.spending).toBeUndefined();
  });

  test('Settings reads saved plus pending, in plain words', () => {
    let db = normalizeDatabase(seedDatabase('slot_line', 'Line'));
    expect(spendingLine(storySpending(db))).toBeNull();

    for (let i = 0; i < 15; i += 1) noteSpend('slot_line', 0.012, 'turn');
    db = foldSpending(db, null);
    noteSpend('slot_line', 0.01, 'image');

    expect(spendingLine(storySpending(db))).toBe('$0.19 so far · about $0.01 a turn · 15 turns, 1 painting');
    expect(formatDollars(0.0042)).toBe('$0.0042');
  });
});

describe('the totals travel with the save', () => {
  test('normalizing (load, import) keeps them', () => {
    const db = { ...normalizeDatabase(seedDatabase('slot_keep', 'Keep')), spending: { total: 1.5, turns: 90, images: 4, since: 1 } };
    expect(normalizeDatabase(JSON.parse(JSON.stringify(db))).spending).toEqual(db.spending);
  });
});
