/**
 * Section 12 of claude/before-variety-ideas.md (14 Nov 2026): people who know
 * Kan through connections. A KNEW YOU line on their card: what they know, what
 * they believe of his fate, and their first reaction the first time they see
 * him in the story.
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

import { CANON_CAST } from '../lib/rpg/canonCast';
import { normalizeDatabase } from '../lib/rpg/db';
import { KNOWS_KAN, knowsKanLine } from '../lib/rpg/knowsKan';
import { buildNarrationPrompt } from '../lib/rpg/prompt';
import { applyNameOut } from '../lib/rpg/renown';
import { seedDatabase } from '../lib/rpg/seed';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_knows_kan', 'Knows Kan'));
const entity = (db: AppDatabase, name: string) => db.entities.find((item) => item.name === name)!;
const happened = (db: AppDatabase, id: string): AppDatabase => ({
  ...db,
  state: {
    ...db.state,
    canonProgress: { ...db.state.canonProgress!, completed: [...(db.state.canonProgress?.completed ?? []), id] },
  },
});
const promptText = (db: AppDatabase, input: string) =>
  buildNarrationPrompt(db, input).messages.map((message) => message.content).join('\n');

describe('who knew Kan', () => {
  test('the eight people section 12 names, all in the cast', () => {
    const cast = new Set(CANON_CAST.map((entry) => entry.name));
    expect(Object.keys(KNOWS_KAN).sort()).toEqual(
      ['Danzo Shimura', 'Hiruzen Sarutobi', 'Kakashi Hatake', 'Kiba Inuzuka', 'Might Guy', 'Sasuke Uchiha', 'Tsume Inuzuka', 'Yamato'].sort()
    );
    for (const name of Object.keys(KNOWS_KAN)) expect(cast.has(name)).toBe(true);
  });

  test('anyone else gets no line', () => {
    expect(knowsKanLine(seed(), { name: 'Naruto Uzumaki', met: false })).toBeNull();
  });

  test('the first reaction only while they are still unmet', () => {
    const db = seed();
    const kakashi = entity(db, 'Kakashi Hatake');
    const first = knowsKanLine(db, kakashi)!;

    expect(first).toContain('Team Ro');
    expect(first).toContain('FIRST TIME THEY SEE YOU');
    expect(first).toContain('measures you');

    const later = knowsKanLine(db, { ...kakashi, met: true })!;
    expect(later).toContain('Team Ro');
    expect(later).not.toContain('FIRST TIME');
  });

  test('the Leaf’s people believe him dead until his name reaches the Leaf', () => {
    const db = seed();
    expect(knowsKanLine(db, entity(db, 'Might Guy'))).toContain('probably dead');

    const known = applyNameOut(db, [{ audience: 'leaf', how: 'recognised' }]);
    expect(knowsKanLine(known, entity(known, 'Might Guy'))).toContain('the Leaf’s word that you are alive');
    expect(knowsKanLine(known, entity(known, 'Danzo Shimura'))).toContain('knows now that you are alive');
  });

  test('Hiruzen knows the truth and never tells Sasuke or Danzō; Danzō only knows the body was never found', () => {
    const db = seed();
    const hiruzen = knowsKanLine(db, entity(db, 'Hiruzen Sarutobi'))!;
    expect(hiruzen).toContain('left with him');
    expect(hiruzen).toContain('never Sasuke, never Danzō');
    expect(hiruzen).not.toContain('probably dead');

    const danzo = knowsKanLine(db, entity(db, 'Danzo Shimura'))!;
    expect(danzo).toContain('body was never found');
    expect(danzo).toContain('Root or dead');
  });

  test('Sasuke changes with Itachi’s death and the masked man’s truth, canon path kept', () => {
    let db = seed();
    const sasuke = () => knowsKanLine(db, entity(db, 'Sasuke Uchiha'))!;

    expect(sasuke()).toContain('big brother');
    expect(sasuke()).toContain('another betrayal');
    db = happened(db, 'itachi-vs-sasuke');
    expect(sasuke()).toContain('just killed');
    db = happened(db, 'masked-man-truth');
    expect(sasuke()).toContain('the one person he can talk to');
    expect(sasuke()).toContain('canon path does not change');
  });

  test('the Inuzuka think of Hana', () => {
    const db = seed();
    expect(knowsKanLine(db, entity(db, 'Kiba Inuzuka'))).toContain('on Hana’s behalf');
    expect(knowsKanLine(db, entity(db, 'Tsume Inuzuka'))).toContain('whether Hana knows');
  });
});

describe('the narrator prompt', () => {
  test('the line rides on the card of someone really in the scene, not one only named', () => {
    const base = seed();
    const here = { ...base, state: { ...base.state, sceneCast: ['Kakashi Hatake'] } };
    expect(promptText(here, 'I look at Kakashi.')).toContain('KNEW YOU: your ANBU captain');

    const named = promptText(base, 'I wonder whether Kakashi is still in ANBU.');
    expect(named).not.toContain('KNEW YOU: your ANBU captain');
  });
});
