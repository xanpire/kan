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
import { buildSceneImagePrompt, directorContext, parseImageAction } from '../lib/rpg/image';
import { placeKeyOf, placeLookOf, rememberPlaceLook } from '../lib/rpg/placeLooks';
import { planReferences } from '../lib/rpg/referencePlan';
import type { AppDatabase, RawLogEntry, SceneImageMeta } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_place', 'Place'));

function withReply(db: AppDatabase, id = 'log_x'): AppDatabase {
  const entry: RawLogEntry = {
    id, turn: 1, kind: 'story', role: 'assistant', content: 'You wait by the falls.', model: 'm',
    promptTokens: 0, completionTokens: 0, chapter: 1, scene: db.state.scene,
    inStoryDate: db.state.inStoryDate, createdAt: Date.now(),
  };
  return { ...db, rawLog: [...db.rawLog, entry] };
}

const at = (db: AppDatabase, location: string): AppDatabase => ({ ...db, state: { ...db.state, location } });

function meta(db: AppDatabase, look?: string, extra: Partial<SceneImageMeta> = {}): SceneImageMeta {
  return {
    prompt: 'p', action: 'a', references: [], model: 'm', createdAt: 1,
    place: { key: placeKeyOf(db)!, name: db.state.location, ...(look ? { look } : {}) },
    ...extra,
  };
}

describe('places look the same every time (audit 11c)', () => {
  test('the director writes a PLACE line', () => {
    const parsed = parseImageAction('ACTION: Kan waits.\nSHOT: wide\nPLACE: a twin waterfall over black rock, a stone statue on each side\nCAPTION: You wait.');
    expect(parsed.place).toBe('a twin waterfall over black rock, a stone statue on each side');
    expect(parsed.action).toBe('Kan waits.');
  });

  test('the same place keeps its key whatever the articles and case', () => {
    expect(placeKeyOf(at(seed(), 'The Valley of the End'))).toBe(placeKeyOf(at(seed(), 'valley of the end')));
    expect(placeKeyOf(at(seed(), 'Valley of the End'))).not.toBe(placeKeyOf(at(seed(), 'Hidden Leaf')));
  });

  test('the first image painted at a place becomes its look and reference', () => {
    let db = withReply(at(seed(), 'Valley of the End'));
    db = rememberPlaceLook(db, 'log_x', 'img:first', meta(db, 'twin falls, two stone statues'));
    expect(placeLookOf(db)).toMatchObject({ image: 'img:first', look: 'twin falls, two stone statues', name: 'Valley of the End' });

    // A second painting there changes nothing.
    db = withReply(db, 'log_y');
    const again = rememberPlaceLook(db, 'log_y', 'img:second', meta(db, 'something else'));
    expect(placeLookOf(again)?.image).toBe('img:first');

    // A retouch never sets it.
    const elsewhere = withReply(at(seed(), 'Naka River'));
    expect(rememberPlaceLook(elsewhere, 'log_x', 'img:r', meta(elsewhere, 'x', { tweak: 'darker' })).placeLooks).toBeUndefined();
  });

  test('the look reaches the director and the prompt, and survives a reload', () => {
    let db = withReply(at(seed(), 'Valley of the End'));
    db = rememberPlaceLook(db, 'log_x', 'img:first', meta(db, 'twin falls, two stone statues'));
    expect(directorContext(db)).toContain('This place looks like: twin falls, two stone statues');
    const prompt = buildSceneImagePrompt(db, [{ kind: 'place', uri: 'data:image/webp;base64,P', name: 'Valley of the End' }], 'Kan waits.');
    expect(prompt).toContain('This place looks like: twin falls, two stone statues.');
    expect(prompt).toContain('Reference image 1: this place (Valley of the End) as it looked');
    expect(placeLookOf(normalizeDatabase(JSON.parse(JSON.stringify(db))))?.image).toBe('img:first');
  });

  test('the place reference ranks after people and before the previous scene', () => {
    const plan = planReferences(
      [
        { kind: 'previous', uri: 'data:prev' },
        { kind: 'place', uri: 'data:place' },
        { kind: 'character', uri: 'data:itachi', name: 'Itachi' },
        { kind: 'face', uri: 'data:face' },
      ],
      3
    );
    expect(plan.references.map((r) => r.kind)).toEqual(['face', 'character', 'place']);
  });
});
