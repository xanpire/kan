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
import { isUndergroundText, lightLine, lightNow, recentCloseUp, shotFraming } from '../lib/rpg/imageDirection';
import type { AppDatabase, RawLogEntry } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_s6', 'S6'));

function withReply(db: AppDatabase, content: string, extra: Partial<RawLogEntry> = {}): AppDatabase {
  const entry: RawLogEntry = {
    id: `log_${db.rawLog.length}`, turn: db.rawLog.length + 1, kind: 'story', role: 'assistant', content, model: 'm',
    promptTokens: 0, completionTokens: 0, chapter: 1, scene: db.state.scene,
    inStoryDate: db.state.inStoryDate, createdAt: Date.now(),
    ...extra,
  } as RawLogEntry;
  return { ...db, rawLog: [...db.rawLog, entry] };
}

function painted(db: AppDatabase, shotType: string) {
  return withReply(db, 'x', { imageMeta: { shot: shotType, shotType } as RawLogEntry['imageMeta'], image: 'img' } as Partial<RawLogEntry>);
}

describe('Session 6: image framing', () => {
  test('close-ups and tiny figures get a plain size line', () => {
    expect(shotFraming('close-up')).toContain('head fills most of the frame');
    expect(shotFraming('aerial')).toContain('tiny');
    expect(shotFraming('extreme wide')).toContain('tenth of the frame');
    expect(shotFraming('medium')).toBeNull();
    expect(shotFraming(null)).toBeNull();
  });

  test('the painter prompt carries the framing right after the shot', () => {
    const db = withReply(seed(), 'You stand at the rail, alone.');
    const prompt = buildSceneImagePrompt(db, [], 'Kan stands at the rail.', { shot: 'close-up, eye level, side profile', shotType: 'close-up' });
    const lines = prompt.split('\n');
    const shotLine = lines.findIndex((line) => line.startsWith('SHOT:'));
    expect(lines[shotLine + 1]).toContain('FRAMING: a true close-up');
    expect(prompt).toContain('the face off-center, filling the frame height');
  });

  test('the director is nudged to a close-up when none was recent', () => {
    let db = seed();
    db = painted(db, 'wide');
    db = painted(db, 'medium');
    expect(recentCloseUp(db)).toBe(false);
    const context = directorContext(withReply(db, 'You scream.'))!;
    expect(context).toContain('None of the recent images was a close-up');

    const withClose = painted(db, 'close-up');
    expect(recentCloseUp(withClose)).toBe(true);
    expect(directorContext(withReply(withClose, 'You scream.'))!).not.toContain('None of the recent images was a close-up');
  });
});

describe('Session 6: underground has no windows', () => {
  test('cave and cell words count as underground', () => {
    expect(isUndergroundText('A holding cell beneath the tower')).toBe(true);
    expect(isUndergroundText('Amegakure: an underground cell')).toBe(true);
    expect(isUndergroundText('The cavern under the waterfall')).toBe(true);
    expect(isUndergroundText('The top of the spire')).toBe(false);
  });

  test('the light lines say no windows and no sky', () => {
    const base = seed();
    const db = withReply(
      {
        ...base,
        state: { ...base.state, location: 'Amegakure, an underground cell', locationKind: 'structure', inStoryDate: { ...base.state.inStoryDate, hour: 18, minute: 40 } },
      },
      'The lamp gutters.'
    );
    expect(lightNow(db)).toContain('no windows');
    const line = lightLine(db, 'The lamp gutters.');
    expect(line).toContain('no windows and no sky');
    expect(line).not.toContain('outside,');
    expect(directorContext(db)!).toContain('(underground: no windows)');
  });
});
