// Audit 7 (measure first) and 11e.3: tracker field stats, hand corrections,
// the Debug panel showing one story at a time, and cost formatting.

import { describe, expect, mock, test } from 'bun:test';

mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

import {
  beginDebugTurn,
  clearDebugLog,
  getDebugLog,
  linkDebugTurn,
  recordDebugCorrection,
  recordDebugState,
  turnsForSlot,
} from '../lib/rpg/debug';
import { isFilled, TRACKER_FIELDS, trackerFieldStats } from '../lib/rpg/trackerStats';

function turn(slotId: string, id: string, raw?: string) {
  const temp = beginDebugTurn({ slotId, action: 'x', narratorModel: 'm', prompt: [], promptEstimate: 0 });
  linkDebugTurn(temp, id);
  if (raw !== undefined) {
    recordDebugState(id, { status: 'applied', raw });
  }
  return id;
}

describe('tracker field stats', () => {
  test('every schema field is counted', () => {
    expect(TRACKER_FIELDS.length).toBeGreaterThan(40);
    expect(TRACKER_FIELDS).toContain('time');
    expect(TRACKER_FIELDS).toContain('grudges');
  });

  test('null, empty lists, false and all-null objects are not filled', () => {
    expect(isFilled(null)).toBe(false);
    expect(isFilled([])).toBe(false);
    expect(isFilled(false)).toBe(false);
    expect(isFilled('  ')).toBe(false);
    expect(isFilled({ elapsed: null, unit: null, clock_time: null })).toBe(false);
    expect(isFilled({ elapsed: 5, unit: 'minutes', clock_time: null })).toBe(true);
    expect(isFilled(true)).toBe(true);
    expect(isFilled(0)).toBe(true);
  });

  test('counts filled fields, unreadable replies and hand fixes per turn', () => {
    clearDebugLog();
    turn('a', 't1', JSON.stringify({ time: { elapsed: 2, unit: 'minutes', clock_time: null }, location: 'Leaf', letters_sent: [] }));
    turn('a', 't2', '```json\n{"time":{"elapsed":null,"unit":null,"clock_time":"07:30"},"location":null}\n```');
    turn('a', 't3', 'not json at all');
    recordDebugCorrection('a', 'time', { turnId: 't1' });
    recordDebugCorrection('a', 'time', { turnId: 't1' });

    const stats = trackerFieldStats(getDebugLog().turns);
    const field = (name: string) => stats.fields.find((entry) => entry.field === name)!;

    expect(stats.turns).toBe(2);
    expect(stats.unreadable).toBe(1);
    expect(field('time')).toEqual({ field: 'time', filled: 2, corrected: 1 });
    expect(field('location').filled).toBe(1);
    expect(field('letters_sent').filled).toBe(0);
    // Fixed fields sort first.
    expect(stats.fields[0].field).toBe('time');
  });
});

describe('hand corrections land on the right turn', () => {
  test('a merge goes on the turn that added the dropped person', () => {
    clearDebugLog();
    turn('a', 'old', '{}');
    recordDebugState('old', { status: 'applied', changes: [{ path: 'entities · added', from: '—', to: 'Ren' }] });
    turn('a', 'new', '{}');
    recordDebugCorrection('a', 'new_characters', { addedName: 'Ren' });

    const turns = getDebugLog().turns;
    expect(turns.find((t) => t.id === 'old')?.corrections?.map((c) => c.field)).toEqual(['new_characters']);
    expect(turns.find((t) => t.id === 'new')?.corrections).toBeUndefined();
  });

  test('without a match it goes on the newest turn of that story only', () => {
    clearDebugLog();
    turn('a', 'a1', '{}');
    turn('b', 'b1', '{}');
    recordDebugCorrection('a', 'deaths');

    const turns = getDebugLog().turns;
    expect(turns.find((t) => t.id === 'a1')?.corrections?.length).toBe(1);
    expect(turns.find((t) => t.id === 'b1')?.corrections).toBeUndefined();
  });

  test('a time fix for a turn no longer logged is not put on another turn', () => {
    clearDebugLog();
    turn('a', 'a1', '{}');
    recordDebugCorrection('a', 'time', { turnId: 'gone' });
    expect(getDebugLog().turns[0].corrections).toBeUndefined();
  });
});

describe('Debug panel shows one story', () => {
  test('turnsForSlot keeps only the open story', () => {
    clearDebugLog();
    turn('a', 'a1');
    turn('b', 'b1');
    turn('a', 'a2');
    expect(turnsForSlot(getDebugLog().turns, 'a').map((t) => t.id)).toEqual(['a2', 'a1']);
    expect(turnsForSlot(getDebugLog().turns, null).length).toBe(3);
  });
});

import { formatCost } from '../lib/rpg/debug';

describe('formatCost', () => {
  test('tiny costs print in fixed decimals, never in e-notation', () => {
    expect(formatCost(0)).toBe('$0');
    expect(formatCost(0.000123)).toBe('$0.000123');
    expect(formatCost(1.23e-7)).toBe('<$0.000001');
    expect(formatCost(0.0042)).toBe('$0.0042');
    expect(formatCost(0.5)).toBe('$0.5000');
    expect(formatCost(0.0000004)).not.toContain('e');
  });
});
