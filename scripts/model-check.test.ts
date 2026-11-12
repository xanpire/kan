/** A chosen model that OpenRouter no longer lists is named in Settings (audit 10). */
import { describe, expect, test } from 'bun:test';

import { DEFAULT_SETTINGS } from '../lib/rpg/defaults';
import { missingModelLine, missingModels } from '../lib/rpg/modelCheck';

const lists = (text: string[], image: string[]) => ({ text: new Set(text), image: new Set(image) });

describe('retired models', () => {
  test('the defaults pass when they are listed', () => {
    const all = lists(
      [DEFAULT_SETTINGS.narrationModel, DEFAULT_SETTINGS.summaryModel, DEFAULT_SETTINGS.extractionModel],
      [DEFAULT_SETTINGS.imageModel]
    );
    expect(missingModels(DEFAULT_SETTINGS, all)).toEqual([]);
  });

  test('a model that is gone is named with where it is used', () => {
    const settings = { ...DEFAULT_SETTINGS, extractionModel: 'old/retired-model', imageDirectorModel: 'old/director' };
    const missing = missingModels(settings, lists([DEFAULT_SETTINGS.narrationModel], [DEFAULT_SETTINGS.imageModel]));

    expect(missing.map((item) => item.label)).toEqual(['Memory', 'Image director']);
    expect(missingModelLine(missing[0])).toContain('old/retired-model');
  });

  test('a variant suffix counts as its base model; a list that failed checks nothing', () => {
    const settings = { ...DEFAULT_SETTINGS, narrationModel: `${DEFAULT_SETTINGS.narrationModel}:nitro`, summaryModel: DEFAULT_SETTINGS.narrationModel };
    expect(missingModels(settings, lists([DEFAULT_SETTINGS.narrationModel, DEFAULT_SETTINGS.extractionModel], [DEFAULT_SETTINGS.imageModel]))).toEqual([]);
    expect(missingModels({ ...DEFAULT_SETTINGS, narrationModel: 'gone/model' }, lists([], []))).toEqual([]);
  });

  test('an image model found in the text list is not called gone', () => {
    const settings = { ...DEFAULT_SETTINGS };
    expect(
      missingModels(settings, lists([DEFAULT_SETTINGS.narrationModel, DEFAULT_SETTINGS.extractionModel, DEFAULT_SETTINGS.imageModel], ['other/image']))
    ).toEqual([]);
  });
});
