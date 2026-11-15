// Session 3: Shadow Clone, Sealing and Transformation sat under "Physical"
// beside taijutsu. The Jutsu tab now sorts what has no element by its kind.
import { describe, expect, test } from 'bun:test';
import { normalizeDatabase } from '../lib/rpg/db';
import { groupJutsuForDisplay, jutsuKindSection } from '../lib/rpg/jutsu';
import { canonJutsuById } from '../lib/rpg/jutsuList';
import { seedDatabase } from '../lib/rpg/seed';

describe('the Jutsu tab’s sections', () => {
  const db = normalizeDatabase(seedDatabase('slot_jutsu', 'Jutsu'));
  const groups = groupJutsuForDisplay(db.jutsuRecords, (record) => canonJutsuById(record.canonId)?.type);
  const section = (name: string) => groups.find((group) => group.jutsu.some((jutsu) => jutsu.name === name))?.nature;

  test('elements first, then kinds, and nothing is lost', () => {
    expect(groups.slice(0, 2).map((group) => group.nature)).toEqual(['Fire', 'Earth']);
    expect(groups.some((group) => group.nature === 'Physical')).toBe(false);
    expect(groups.reduce((sum, group) => sum + group.jutsu.length, 0)).toBe(db.jutsuRecords.length);
  });

  test('each starting jutsu is where a player would look for it', () => {
    expect(section('Great Fireball')).toBe('Fire');
    expect(section('Taijutsu (your own style)')).toBe('Taijutsu');
    expect(section('Eight Gates')).toBe('Taijutsu');
    expect(section('Shadow Clone')).toBe('Ninjutsu');
    expect(section('Hell Viewing')).toBe('Genjutsu');
    expect(section('Genjutsu Release')).toBe('Genjutsu');
    expect(section('Adamantine Sealing Chains')).toBe('Sealing and barriers');
    expect(section('Sensing barrier')).toBe('Sealing and barriers');
    expect(section('Vulture Flight')).toBe('Vulture arts');
    expect(section('Thousand Souls')).toBe('Forbidden');
    expect(section('Shadow Shuriken')).toBe('Tools and weapons');
  });

  test('a jutsu the story adds later finds a section by its name', () => {
    expect(jutsuKindSection({ name: 'Sky Burial', chakraNature: 'Yin' })).toBe('Dōjutsu');
    expect(jutsuKindSection({ name: 'Leaf Hurricane', chakraNature: 'Physical' })).toBe('Taijutsu');
    expect(jutsuKindSection({ name: 'Summoning: Rashōmon', chakraNature: 'Space-Time' }, 'summoning')).toBe('Summoning');
    expect(jutsuKindSection({ name: 'Mystery move', chakraNature: 'none' })).toBe('Ninjutsu');
  });
});
