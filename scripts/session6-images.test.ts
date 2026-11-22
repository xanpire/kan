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
import { isUndergroundText, jutsuOnScreen, lightLine, lightNow, recentCloseUp, shotFraming } from '../lib/rpg/imageDirection';
import { kanJutsuFromMessage } from '../lib/rpg/proseFallback';
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

describe('Session 6: a jutsu that has ended stays off the page', () => {
  const susanoo = (lastSeen: AppDatabase['state']['inStoryDate']) => ({
    id: 'j1', name: 'Susanoo', user: 'Kan', chakraNature: 'Yin', effect: 'x',
    visual: 'Crimson rib-bones and a taloned arm.', firstSeen: lastSeen, lastSeen, timesUsed: 1, description: '', tags: [],
  });

  test('a reply that only mentions Susanoo used earlier does not paint it', () => {
    const base = seed();
    const turnStart = { ...base.state.inStoryDate, hour: 22, minute: 10, second: 15 };
    const db = { ...base, jutsuRecords: [susanoo({ ...turnStart, minute: 0 })] } as AppDatabase;
    expect(jutsuOnScreen(db, 'the posts where your Susanoo broke them', 2, turnStart)).toEqual([]);
    // Used this turn (it ends after the turn began): painted.
    const used = { ...base, jutsuRecords: [susanoo({ ...turnStart, second: 30 })] } as AppDatabase;
    expect(jutsuOnScreen(used, 'Susanoo rises', 2, turnStart)).toHaveLength(1);
    // A turn that starts exactly where the use ended is the next turn.
    expect(jutsuOnScreen(db, 'Susanoo', 2, { ...turnStart, minute: 0 })).toEqual([]);
    // Without a turn start (a memory), the old rule: named is enough.
    expect(jutsuOnScreen(db, 'Susanoo', 2)).toHaveLength(1);
  });

  test("letting a jutsu fall is not using it", () => {
    const db = seed();
    expect(kanJutsuFromMessage(db, 'I let Thousand Souls fall away and wipe the blood from my eyes.')).toEqual([]);
    expect(kanJutsuFromMessage(db, 'I dismiss the Water Clone Jutsu.')).toEqual([]);
    expect(kanJutsuFromMessage(db, 'I reach for Thousand Souls.')).toEqual(['Thousand Souls']);
  });
});
