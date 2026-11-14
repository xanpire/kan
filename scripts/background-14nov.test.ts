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
import { normalizeDatabase } from '../lib/rpg/db';
import { seedDatabase } from '../lib/rpg/seed';
import { buildNarrationPrompt } from '../lib/rpg/prompt';
import { normalizeRelationship } from '../lib/rpg/romance';
import { CANON_CAST } from '../lib/rpg/canonCast';

const seed = () => normalizeDatabase(seedDatabase('slot_bg', 'Background'));
const narrator = (db = seed()) => buildNarrationPrompt(db, '*I wait.*').messages.map((m) => m.content).join('\n');

describe('Fire and Earth from the start (decided 14 Nov 2026)', () => {
  test('a new story has both as innate natures, and the narrator is told', () => {
    const db = seed();
    expect(db.state.player.natures?.map((n) => `${n.nature}:${n.source}`)).toEqual(['Fire:innate', 'Earth:innate']);
    expect(narrator(db)).toContain('Fire (innate), Earth (innate)');
    expect(db.loreEntries.some((lore) => /not known yet/.test(lore.text))).toBe(false);
  });

  test('an old save without natures gets them; a stolen nature stays', () => {
    const old = seedDatabase('slot_old', 'Old');
    old.state.player.natures = [{ nature: 'Water', source: 'thousand-souls', from: 'a Mist ninja', acquiredOn: old.state.inStoryDate }];
    const natures = normalizeDatabase(old).state.player.natures!.map((n) => n.nature);
    expect(natures).toEqual(['Fire', 'Earth', 'Water']);
  });
});

describe('Suzume is his former sensei (decided 14 Nov 2026)', () => {
  test('a new bond says so, and an old "mentor" with that status moves over', () => {
    const db = seed();
    const suzume = db.bonds.find((bond) => bond.characterName === 'Suzume')!;
    expect(suzume.relationship).toBe('former sensei');
    expect(normalizeRelationship('old sensei')).toBe('former sensei');
    const old = normalizeDatabase({
      ...db,
      bonds: db.bonds.map((bond) => (bond.characterName === 'Suzume' ? { ...bond, relationship: 'mentor' as const, status: 'Former sensei' } : bond)),
    });
    expect(old.bonds.find((bond) => bond.characterName === 'Suzume')!.relationship).toBe('former sensei');
  });
});

describe("Kan's background (decided 14 Nov 2026)", () => {
  test('Hazuki raised him: Izumi is his cousin, and Hazuki dies in the massacre unknown to him', () => {
    const db = seed();
    const hazuki = db.entities.find((entity) => entity.name === 'Hazuki Uchiha')!;
    expect(hazuki.deceased).toEqual({ known: false, canonEventId: 'event_canon_izumi-funeral' });
    expect(db.entities.filter((entity) => entity.name === 'Hazuki Uchiha')).toHaveLength(1);
    expect(CANON_CAST.some((entry) => entry.name === 'Hazuki Uchiha')).toBe(true);
    expect(db.bonds.find((bond) => bond.characterName === 'Hazuki Uchiha')?.relationship).toBe('family');
    expect(db.entities.find((entity) => entity.name === 'Izumi Uchiha')!.notes).toContain('cousin');
  });

  test('the narrator knows the bat mask, Kakashi’s unit, the only chūnin and the forearm seal', () => {
    const db = seed();
    const all = `${narrator(db)}\n${db.loreEntries.map((lore) => lore.text).join('\n')}`;
    for (const bit of ['bat mask', 'Team Ro', 'only chūnin', 'left forearm', 'under the floor of Hazuki’s house', 'never the eighth']) {
      expect(all).toContain(bit);
    }
  });
});
