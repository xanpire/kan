// The default model ids are hard-coded, and OpenRouter retires models (audit
// 10). When Settings opens, the model lists load once per session and every
// model this story uses is checked against them; one that is gone is named
// plainly in Settings.

import { fetchOpenRouterImageModels, fetchOpenRouterModels } from '../openrouter';
import type { Settings } from './types';

export type ModelLists = { text: Set<string>; image: Set<string>; /** Text models that take images. */ seesImages?: Set<string> };

export type MissingModel = { key: keyof Settings; label: string; id: string };

const CHECKS: { key: keyof Settings; label: string; list: 'text' | 'image' }[] = [
  { key: 'narrationModel', label: 'Story', list: 'text' },
  { key: 'imageModel', label: 'Images', list: 'image' },
  { key: 'summaryModel', label: 'Summaries', list: 'text' },
  { key: 'extractionModel', label: 'Memory', list: 'text' },
  { key: 'imageDirectorModel', label: 'Image director', list: 'text' },
];

/** OpenRouter ids may carry a variant (":free", ":nitro"); the base must exist. */
function listed(ids: Set<string>, id: string) {
  return ids.has(id) || ids.has(id.split(':')[0]);
}

/** The chosen models that are not on OpenRouter's lists. An empty list (it failed) checks nothing. */
export function missingModels(settings: Settings, lists: ModelLists): MissingModel[] {
  const missing: MissingModel[] = [];

  for (const check of CHECKS) {
    const id = String(settings[check.key] ?? '').trim();
    if (!id) continue;

    const ids = check.list === 'image' ? lists.image : lists.text;
    // An image model can also show up in the text list (and the other way round).
    if (ids.size === 0 || listed(ids, id) || listed(check.list === 'image' ? lists.text : lists.image, id)) continue;

    missing.push({ key: check.key, label: check.label, id });
  }

  return missing;
}

let cached: Promise<ModelLists> | null = null;

/** Both lists, fetched once per session; a list that fails to load comes back empty. */
export function loadModelLists(): Promise<ModelLists> {
  if (!cached) {
    cached = Promise.all([
      fetchOpenRouterModels().then((models) => models, () => []),
      fetchOpenRouterImageModels().then((models) => new Set(models.map((model) => model.id)), () => new Set<string>()),
    ]).then(([models, image]) => {
      const text = new Set(models.map((model) => model.id));
      const seesImages = new Set(models.filter((model) => model.seesImages).map((model) => model.id));
      // Try again next time if both failed (offline).
      if (text.size === 0 && image.size === 0) cached = null;
      return { text, image, seesImages };
    });
  }

  return cached;
}

/** "Story uses google/x, which isn't on OpenRouter any more. Pick another." */
export function missingModelLine(missing: MissingModel) {
  return `${missing.label} uses ${missing.id}, which isn’t on OpenRouter any more. Pick another model, or the ${missing.label.toLowerCase()} calls will fail.`;
}

/**
 * Whether a text model can look at an image (audit 11c: the image check needs
 * one). Unknown (the list did not load, or the model is not on it) counts as yes.
 */
export function modelSeesImages(lists: ModelLists, id: string): boolean {
  if (!lists.seesImages || lists.text.size === 0 || !listed(lists.text, id)) return true;
  return listed(lists.seesImages, id);
}
