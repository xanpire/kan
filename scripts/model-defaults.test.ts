/** Model choices are app-wide (audit 10): a new story starts with the last ones picked. */
import { describe, expect, mock, test } from 'bun:test';

const store = new Map<string, string>();
mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => void store.set(key, value),
    removeItem: async (key: string) => void store.delete(key),
    getAllKeys: async () => [...store.keys()],
    multiGet: async (keys: string[]) => keys.map((key) => [key, store.get(key) ?? null]),
    multiSet: async (pairs: [string, string][]) => pairs.forEach(([k, v]) => store.set(k, v)),
    multiRemove: async (keys: string[]) => keys.forEach((key) => store.delete(key)),
  },
}));

import '../lib/rpg/db';
import { DEFAULT_SETTINGS } from '../lib/rpg/defaults';
import { loadAppModels, modelChoices, rememberAppModels, withAppModels } from '../lib/rpg/modelDefaults';
import { seedDatabase } from '../lib/rpg/seed';

describe('app-wide model choices', () => {
  test('only model ids are remembered, blanks left out, later picks win', async () => {
    expect(modelChoices({ narrationModel: 'a/b', temperature: 1, imageDirectorModel: '  ' })).toEqual({ narrationModel: 'a/b' });

    await rememberAppModels({ narrationModel: 'x/narrator', promptTokenBudget: 6000 });
    await rememberAppModels({ imageModel: 'x/painter' });
    await rememberAppModels({ narrationModel: 'y/narrator' });

    expect(await loadAppModels()).toEqual({ narrationModel: 'y/narrator', imageModel: 'x/painter' });
  });

  test('a new story copies them; everything else stays on the defaults', async () => {
    const db = withAppModels(seedDatabase('slot_models', 'Models'), await loadAppModels());

    expect(db.settings.narrationModel).toBe('y/narrator');
    expect(db.settings.imageModel).toBe('x/painter');
    expect(db.settings.extractionModel).toBe(DEFAULT_SETTINGS.extractionModel);
    expect(db.settings.promptTokenBudget).toBe(DEFAULT_SETTINGS.promptTokenBudget);
  });

  test('a broken stored value starts new stories on the defaults', async () => {
    store.set('kan.models.v1', '{nope');
    expect(await loadAppModels()).toEqual({});
  });
});
