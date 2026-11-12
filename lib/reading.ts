// Reading: text size in three steps (audit 10). A device setting, like the
// ambience: it belongs to this phone and is the same for every story.
//
// The theme's `type` styles stay static. What you read most (the story's prose
// and your actions, and every list row's title, body and meta line) takes its
// size from `scaledType(scale)` through `useReadingType()`.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import type { TextStyle } from 'react-native';

import { type } from '../constants/theme';

export type TextSize = 'default' | 'larger' | 'largest';

export const TEXT_SIZES: { value: TextSize; label: string; scale: number }[] = [
  { value: 'default', label: 'Default', scale: 1 },
  { value: 'larger', label: 'Larger', scale: 1.12 },
  { value: 'largest', label: 'Largest', scale: 1.25 },
];

const KEY = 'kan.reading.v1';

let current: TextSize = 'default';
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function normalize(value: unknown): TextSize {
  return TEXT_SIZES.some((size) => size.value === value) ? (value as TextSize) : 'default';
}

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored) {
      current = normalize(JSON.parse(stored)?.textSize);
      emit();
    }
  } catch {
    // Keep the default.
  }
}

export function setTextSize(size: TextSize) {
  current = normalize(size);
  emit();
  void AsyncStorage.setItem(KEY, JSON.stringify({ textSize: current })).catch(() => {});
}

export function scaleOf(size: TextSize) {
  return TEXT_SIZES.find((item) => item.value === size)?.scale ?? 1;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSize = () => current;

export function useTextSize(): TextSize {
  useEffect(() => {
    void load();
  }, []);
  return useSyncExternalStore(subscribe, getSize, getSize);
}

/** The base player-action style on the Story screen (kept here so it scales with the rest). */
const PLAYER_TEXT: TextStyle = { fontSize: 15, lineHeight: 23 };

export type ReadingType = {
  prose: TextStyle;
  player: TextStyle;
  rowTitle: TextStyle;
  rowBody: TextStyle;
  rowMeta: TextStyle;
};

const cache = new Map<number, ReadingType>();

function grow(style: TextStyle, scale: number): TextStyle {
  if (scale === 1) return style;
  return {
    ...style,
    fontSize: Math.round((style.fontSize ?? 14) * scale),
    lineHeight: style.lineHeight ? Math.round(style.lineHeight * scale) : undefined,
  };
}

/** The reading styles at a scale; the same objects every time for a scale. */
export function scaledType(scale: number): ReadingType {
  let found = cache.get(scale);
  if (!found) {
    found = {
      prose: grow(type.prose, scale),
      player: grow(PLAYER_TEXT, scale),
      rowTitle: grow(type.rowTitle, scale),
      rowBody: grow(type.rowBody, scale),
      rowMeta: grow(type.rowMeta, scale),
    };
    cache.set(scale, found);
  }
  return found;
}

export function useReadingType(): ReadingType {
  return scaledType(scaleOf(useTextSize()));
}
