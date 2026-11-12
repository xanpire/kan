/** Reading: text size in three steps (audit 10). */
import { describe, expect, mock, test } from 'bun:test';

const store = new Map<string, string>();
mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => void store.set(key, value),
    removeItem: async (key: string) => void store.delete(key),
  },
}));

import { type } from '../constants/theme';
import { scaledType, scaleOf, setTextSize, TEXT_SIZES } from '../lib/reading';

describe('text size', () => {
  test('three steps, the first is the theme as it is', () => {
    expect(TEXT_SIZES.map((size) => size.label)).toEqual(['Default', 'Larger', 'Largest']);
    expect(scaledType(1).prose).toBe(type.prose);
    expect(scaledType(1).rowTitle).toBe(type.rowTitle);
  });

  test('every reading style grows, line height with it, and stays readable', () => {
    for (const size of TEXT_SIZES.slice(1)) {
      const scaled = scaledType(size.scale);
      expect(scaled.prose.fontSize).toBeGreaterThan(type.prose.fontSize as number);
      expect(scaled.prose.lineHeight).toBeGreaterThan(type.prose.lineHeight as number);
      expect(scaled.rowMeta.fontSize).toBeGreaterThan(type.rowMeta.fontSize as number);
      expect(scaled.prose.fontFamily).toBe(type.prose.fontFamily);
      expect((scaled.prose.lineHeight as number) / (scaled.prose.fontSize as number)).toBeGreaterThan(1.4);
    }
    expect(scaledType(scaleOf('largest')).prose.fontSize).toBe(20);
  });

  test('the same objects for a scale, so memoised rows keep their props', () => {
    expect(scaledType(1.12)).toBe(scaledType(1.12));
  });

  test('the choice is kept on the device; an unknown value falls back to Default', async () => {
    setTextSize('larger');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(JSON.parse(store.get('kan.reading.v1') ?? '{}').textSize).toBe('larger');
    expect(scaleOf('huge' as never)).toBe(1);
  });
});
