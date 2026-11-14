import { beforeEach, describe, expect, test } from 'bun:test';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
};

import { clearPendingAction, savePendingAction, takePendingAction } from '../lib/rpg/draft';

describe('a reload while the narrator thinks keeps the action (audit 5.6)', () => {
  beforeEach(() => store.clear());

  test('the sent action comes back once after a reload', () => {
    savePendingAction('slot_main', '*I follow him.*');
    expect(takePendingAction('slot_main', 'I keep going.')).toBe('*I follow him.*');
    expect(takePendingAction('slot_main', 'I keep going.')).toBe('');
  });

  test('not when the story already ends with it (the reply was saved)', () => {
    savePendingAction('slot_main', '*I follow him.*');
    expect(takePendingAction('slot_main', '*I follow him.*')).toBe('');
  });

  test('a finished turn leaves nothing behind', () => {
    savePendingAction('slot_main', '*I follow him.*');
    clearPendingAction('slot_main');
    expect(takePendingAction('slot_main', undefined)).toBe('');
  });

  test('kept per story', () => {
    savePendingAction('slot_a', 'A');
    expect(takePendingAction('slot_b', undefined)).toBe('');
    expect(takePendingAction('slot_a', undefined)).toBe('A');
  });
});
