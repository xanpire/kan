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
import { buildSceneImagePrompt, directorContext } from '../lib/rpg/image';
import { isDark, lightLine, lightNow, skyPhase, sunriseHour } from '../lib/rpg/imageDirection';
import { currentRegion } from '../lib/rpg/geography';
import type { AppDatabase, RawLogEntry, WeatherCondition } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_light', 'Light'));

function at(db: AppDatabase, month: number, hour: number, minute = 0, condition: WeatherCondition = 'clear'): AppDatabase {
  const date = { ...db.state.inStoryDate, month, hour, minute };
  return {
    ...db,
    state: {
      ...db.state,
      inStoryDate: date,
      weather: { region: currentRegion(db), condition, since: date, source: 'story', sceneSeq: db.state.sceneSeq },
    },
  };
}

function withReply(db: AppDatabase, content: string): AppDatabase {
  const entry: RawLogEntry = {
    id: 'log_x', turn: 1, kind: 'story', role: 'assistant', content, model: 'm',
    promptTokens: 0, completionTokens: 0, chapter: 1, scene: db.state.scene,
    inStoryDate: db.state.inStoryDate, createdAt: Date.now(),
  };
  return { ...db, rawLog: [...db.rawLog, entry] };
}

describe('the painted light follows the clock (audit 11c, Session 1)', () => {
  test('7:12 PM in autumn is after sunset: dark, no sunset sky', () => {
    const db = at(seed(), 10, 19, 12);
    expect(isDark(skyPhase(db.state.inStoryDate))).toBe(true);
    const line = lightLine(db, 'The gorge plunges into pitch dark.');
    expect(line).not.toContain('golden hour');
    expect(line).not.toContain('burning orange');
    expect(line).toContain('no sunset');
  });

  test('7:12 PM at midsummer is still golden hour', () => {
    expect(skyPhase({ ...seed().state.inStoryDate, month: 6, hour: 19, minute: 12 })).toBe('golden');
  });

  test('sunrise moves with the season', () => {
    expect(sunriseHour(6)).toBeLessThan(sunriseHour(12));
    expect(skyPhase({ ...seed().state.inStoryDate, month: 12, hour: 6, minute: 30 })).toBe('before-dawn');
    expect(skyPhase({ ...seed().state.inStoryDate, month: 6, hour: 6, minute: 30 })).not.toBe('before-dawn');
  });

  test('cloud and rain hide the sun and the moon', () => {
    const rainyDusk = lightLine(at(seed(), 9, 18, 0, 'rain'), 'Kan waits.');
    expect(rainyDusk).not.toContain('golden hour');
    expect(rainyDusk).toContain('sun hidden');
    const cloudyNight = lightLine(at(seed(), 9, 23, 0, 'cloudy'), 'Kan waits.');
    expect(cloudyNight).toContain('no moon');
    expect(cloudyNight).not.toContain('moonlight');
  });

  test('indoors after dark is lamplight', () => {
    const db = at(seed(), 10, 21);
    const inside = { ...db, state: { ...db.state, locationKind: 'structure' as const } };
    expect(lightLine(inside, 'x')).toContain('lamplight');
  });

  test('the director is told the light, and the prompt puts it before the action', () => {
    const db = withReply(at(seed(), 10, 19, 12), 'The gorge plunges into pitch dark.');
    expect(directorContext(db)).toContain(`Light now: ${lightNow(db)}`);
    expect(lightNow(db)).toContain('never a sunset');
    const prompt = buildSceneImagePrompt(db, [], 'Kan drops into the gorge.', { shot: 'wide, low angle' });
    expect(prompt.indexOf('Light and atmosphere')).toBeLessThan(prompt.indexOf('ACTION'));
    expect(prompt.indexOf('SHOT:')).toBeLessThan(prompt.indexOf('Light and atmosphere'));
  });
});

import { sceneStyleOf } from '../lib/rpg/image';

describe('the style opener follows the scene (audit 11c)', () => {
  const mode = (db: AppDatabase, current: 'normal' | 'conversation' | 'fight', lastBeat?: 'exchange' | 'combat' | 'travel' | 'action'): AppDatabase => ({
    ...db,
    state: { ...db.state, sceneMode: { current, exchangeStreak: 0, partners: [], ...(lastBeat ? { lastBeat } : {}) } },
  });

  test('a fight is a fight frame, a talk is a quiet still, the road is background art', () => {
    expect(sceneStyleOf(mode(seed(), 'fight', 'combat'), 'medium')).toBe('fight');
    expect(sceneStyleOf(mode(seed(), 'conversation', 'exchange'), 'medium')).toBe('quiet');
    expect(sceneStyleOf(mode(seed(), 'normal', 'travel'), 'wide')).toBe('travel');
    expect(sceneStyleOf(mode(seed(), 'normal', 'action'), 'extreme wide')).toBe('travel');
    expect(sceneStyleOf(mode(seed(), 'normal', 'action'), 'medium')).toBe('drama');
    expect(sceneStyleOf(mode(seed(), 'normal'), 'close-up')).toBe('quiet');
  });

  test('the prompt opens with the matching style', () => {
    const quiet = buildSceneImagePrompt(withReply(mode(at(seed(), 9, 12), 'conversation', 'exchange'), 'x'), [], 'Kan pours tea for Itachi.', { shot: 'medium, eye level' });
    expect(quiet.split('\n')[0]).toContain('soft widescreen anime film still');
    expect(quiet).not.toContain('fight episode');
    const fight = buildSceneImagePrompt(withReply(mode(at(seed(), 9, 12), 'fight', 'combat'), 'x'), [], 'Kan kicks Kisame.', { shot: 'low angle' });
    expect(fight.split('\n')[0]).toContain('fight episode');
  });
});
