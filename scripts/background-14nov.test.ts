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

import { KAN_STARTING_JUTSU } from '../lib/rpg/kanStartingJutsu';
import { KAN_VULTURES, kanEyeReference, kanPowerLines } from '../lib/rpg/kanPowers';
import { CANON_MILESTONES } from '../lib/rpg/canonData';

describe("Kan's starting jutsu, vultures and eyes (decided 14 Nov 2026)", () => {
  test('a new story seeds the starting jutsu, the vultures and both vulture jutsu; no tantō', () => {
    const db = seed();
    const mine = db.jutsuRecords.filter((record) => record.user === 'Kan').map((record) => record.name);
    for (const name of ['Shadow Clone', 'Great Fireball', 'Majestic Destroyer Flame', 'Earth Flow Rampart', 'Adamantine Sealing Chains', 'Vulture Clone', 'Vulture Flight', 'Eight Gates', 'Thousand Souls']) {
      expect(mine).toContain(name);
    }
    expect(KAN_STARTING_JUTSU.some((jutsu) => /tant[oō]|kenjutsu/i.test(jutsu.name))).toBe(false);
    expect(db.state.jutsu).toContain('Vulture Flight');
    expect(KAN_VULTURES.map((vulture) => vulture.name)).toEqual(['Okuri', 'Hōmuri', 'Tomurai']);
    expect(narrator(db)).toContain('Okuri the courier');
    expect(narrator(db)).toContain('about Itachi’s equal');
  });

  test('the Mangekyō beat names Sky Burial and Okuribi; the Eternal is Izumi’s eyes with the Long Dream', () => {
    const mangekyo = CANON_MILESTONES.find((milestone) => milestone.id === 'kan-mangekyo')!;
    expect(mangekyo.grantsJutsu?.map((jutsu) => jutsu.name)).toEqual(['Sky Burial', 'Okuribi', 'Susanoo']);
    const eternal = CANON_MILESTONES.find((milestone) => milestone.id === 'masked-man-eyes')!;
    expect(eternal.grantsAbilities?.[0].name).toBe('Eternal Mangekyō Sharingan');
    expect(eternal.grantsJutsu?.[0].name).toBe('Long Dream');
  });

  test('the narrator gets the eye lines only once Kan has them, and Gyre only with a stolen Wind', () => {
    const db = seed();
    expect(kanPowerLines(db).join(' ')).not.toContain('Sky Burial');
    const withEyes = { ...db, state: { ...db.state, player: { ...db.state.player, abilities: [{ name: 'Mangekyō Sharingan', stage: 'awakened', acquiredOn: db.state.inStoryDate, stageOn: db.state.inStoryDate }] } } };
    expect(kanPowerLines(withEyes).join(' ')).toContain('Sky Burial');
    expect(kanPowerLines(withEyes).join(' ')).not.toContain('Gyre');
    const windy = { ...withEyes, state: { ...withEyes.state, player: { ...withEyes.state.player, natures: [...(withEyes.state.player.natures ?? []), { nature: 'Wind', source: 'thousand-souls' as const, acquiredOn: db.state.inStoryDate }] } } };
    expect(kanPowerLines(windy).join(' ')).toContain('Gyre');
    expect(kanEyeReference(db, 'Kan uses Sky Burial')).toBeNull();
    expect(kanEyeReference(withEyes, 'Kan stares him down')).toBeNull();
    expect(kanEyeReference(withEyes, 'Kan catches him in Sky Burial')).toBe('mangekyo');
  });
});
