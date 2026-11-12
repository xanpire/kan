// Model choices are app-wide (audit 10): the models you pick become the ones
// every new story starts with. Each story still keeps its own copy in its
// settings, so an older story plays on with what it had until you change it.

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AppDatabase, Settings } from './types';

const MODELS_KEY = 'kan.models.v1';

export const MODEL_KEYS = ['narrationModel', 'summaryModel', 'extractionModel', 'imageModel', 'imageDirectorModel'] as const;
export type ModelKey = (typeof MODEL_KEYS)[number];
export type ModelChoices = Partial<Pick<Settings, ModelKey>>;

/** The model ids in a settings patch, if any; blank ids are left out. */
export function modelChoices(patch: Partial<Settings>): ModelChoices {
  const picked: ModelChoices = {};
  for (const key of MODEL_KEYS) {
    const value = patch[key];
    if (typeof value === 'string' && value.trim()) picked[key] = value.trim();
  }
  return picked;
}

export async function loadAppModels(): Promise<ModelChoices> {
  try {
    const raw = await AsyncStorage.getItem(MODELS_KEY);
    return raw ? modelChoices(JSON.parse(raw) as Partial<Settings>) : {};
  } catch {
    return {};
  }
}

/** Remembers the models in a settings change for new stories. */
export async function rememberAppModels(patch: Partial<Settings>) {
  const picked = modelChoices(patch);
  if (Object.keys(picked).length === 0) return;

  try {
    const current = await loadAppModels();
    await AsyncStorage.setItem(MODELS_KEY, JSON.stringify({ ...current, ...picked }));
  } catch {
    // A new story then starts on the defaults; nothing else depends on it.
  }
}

/** A new story with the app-wide model choices copied in. */
export function withAppModels(db: AppDatabase, models: ModelChoices): AppDatabase {
  return Object.keys(models).length > 0 ? { ...db, settings: { ...db.settings, ...models } } : db;
}
