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
import { applyJutsuDiff, normalizeJutsuNature, sameJutsu } from '../lib/rpg/jutsu';
import { buildNarrationPrompt } from '../lib/rpg/prompt';

const seed = () => normalizeDatabase(seedDatabase('slot_jutsu', 'Jutsu story'));

describe('jutsu (audit 6.13)', () => {
  test('natures match exact names first, then whole words', () => {
    expect(normalizeJutsuNature('Yin-Yang')).toBe('Yin-Yang');
    expect(normalizeJutsuNature('yin and yang release')).toBe('Yin-Yang');
    expect(normalizeJutsuNature('Yin')).toBe('Yin');
    expect(normalizeJutsuNature('Fire Release')).toBe('Fire');
    expect(normalizeJutsuNature('chair throw')).toBe('Unknown');
    expect(normalizeJutsuNature('Space-Time')).toBe('Space-Time');
  });

  test('two names for one jutsu are one record; the first name stays', () => {
    expect(sameJutsu('Fireball Jutsu', 'Fire Style: Fireball Technique')).toBe(true);
    expect(sameJutsu('Fire Style: Dragon Flame', 'Water Style: Water Dragon')).toBe(false);
    expect(sameJutsu('Fire Style: Dragon', 'Water Style: Dragon')).toBe(false);
    expect(sameJutsu('Chidori', 'Lightning Blade')).toBe(false);

    let db = seed();
    const before = db.jutsuRecords.length;
    db = applyJutsuDiff(db, { name: 'Fireball Jutsu', user: 'Kan', chakraNature: 'Fire' });
    db = applyJutsuDiff(db, { name: 'Fire Style: Fireball Technique', user: 'Kan', chakraNature: 'Fire' });
    expect(db.jutsuRecords.length).toBe(before + 1);
    const record = db.jutsuRecords.find((item) => item.name === 'Fireball Jutsu')!;
    expect(record.timesUsed).toBe(2);
  });

  test("the narrator sees all of Kan's own jutsu, whatever their nature", () => {
    let db = seed();
    const names = ['Demonic Illusion: Mist Servant', 'Leaf Hurricane', 'Body Flicker', 'Fire Style: Phoenix Flower', 'Fire Style: Great Fireball', 'Fire Style: Dragon Fire', 'Fire Style: Ash Pile Burning'];
    const natures = ['Genjutsu', 'Physical', 'Space-Time', 'Fire', 'Fire', 'Fire', 'Fire'];
    names.forEach((name, index) => {
      db = applyJutsuDiff(db, { name, user: 'Kan', chakraNature: natures[index], effect: `effect of ${name}` });
    });
    const text = buildNarrationPrompt(db, '*I wait.*').messages.map((message) => message.content).join('\n');
    for (const name of names) {
      expect(text).toContain(name);
    }
    expect(text).toContain('KAN’S JUTSU');
  });
});
