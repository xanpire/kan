/**
 * Step 10 of the audit, the Story screen's Session 1 items: a new chapter
 * drops the old chapter's scene name, the "Word reaches you" strip is gone
 * (what reached Kan shows in Debug only), and the export line counts "1 turn".
 */
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

import { exportLine, normalizeDatabase } from '../lib/rpg/db';
import { appendStoryMessage } from '../lib/rpg/log';
import { applyChapterBreak, CHAPTER_MIN_TURNS } from '../lib/rpg/memoryJobs';
import { seedDatabase } from '../lib/rpg/seed';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_story_screen', 'Story screen'));

function longChapter(): AppDatabase {
  let db = seed();
  for (let index = 0; index < CHAPTER_MIN_TURNS + 1; index += 1) {
    db = appendStoryMessage(db, 'user', '*I walk on.*', null, 0, 0);
    db = appendStoryMessage(db, 'assistant', 'The road goes on through the rain.', null, 0, 0);
  }
  return { ...db, state: { ...db.state, scene: 'The masked man strikes' } };
}

describe('a new chapter does not keep the old scene name (S1)', () => {
  test('no new scene this turn: the scene name is cleared and the chapter title is the tracker’s', () => {
    const before = longChapter();
    const turnLogId = before.rawLog[before.rawLog.length - 1].id;
    const after = applyChapterBreak(before, before, turnLogId, { title: 'Into the Rain' });

    expect(after.state.chapter).toBe(before.state.chapter + 1);
    expect(after.state.chapterTitle).toBe('Into the Rain');
    expect(after.state.scene).toBe('');
  });

  test('a scene named this same turn stays, and names the chapter when the tracker gave no title', () => {
    const before = longChapter();
    const turnLogId = before.rawLog[before.rawLog.length - 1].id;
    const named = { ...before, state: { ...before.state, scene: 'The Rain border' } };
    const after = applyChapterBreak(before, named, turnLogId, { majorCompleted: true });

    expect(after.state.scene).toBe('The Rain border');
    expect(after.state.chapterTitle).toBe('The Rain border');
  });

  test('without a title or a new scene the chapter is called by its number, never the old scene', () => {
    const before = longChapter();
    const turnLogId = before.rawLog[before.rawLog.length - 1].id;
    const after = applyChapterBreak(before, before, turnLogId, { majorCompleted: true });

    expect(after.state.chapterTitle).toBe(`Chapter ${before.state.chapter + 1}`);
  });
});

describe('small wording (S1)', () => {
  test('one turn is singular', () => {
    expect(exportLine(null, 1)).toBe('Not exported yet. 1 turn is only on this device.');
    expect(exportLine(null, 3)).toBe('Not exported yet. 3 turns are only on this device.');
    expect(exportLine('12 Nov', 1)).toBe('Last exported 12 Nov, 1 turn ago.');
  });
});
