/**
 * Section 9 of claude/before-variety-ideas.md (14 Nov 2026): the built-in
 * jutsu list. Canon entries for the narrator only, sent when relevant; nothing
 * before it exists; names Kan hasn't heard stay descriptions; Kan's records
 * linked to their entries, with their real cost on his list.
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
import { CANON_MILESTONES } from '../lib/rpg/canonData';
import { normalizeDatabase } from '../lib/rpg/db';
import { applyJutsuDiff } from '../lib/rpg/jutsu';
import { ALL_JUTSU, CANON_JUTSU, KAN_JUTSU } from '../lib/rpg/jutsuData';
import {
  canonJutsuOf,
  currentUsers,
  formatCanonJutsuEntry,
  jutsuExists,
  kanKnowsJutsuName,
  matchCanonJutsu,
  parseUser,
  selectCanonJutsu,
} from '../lib/rpg/jutsuList';
import { buildNarrationPrompt } from '../lib/rpg/prompt';
import { seedDatabase } from '../lib/rpg/seed';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_jutsu_list', 'Jutsu list'));
const byId = (id: string) => ALL_JUTSU.find((entry) => entry.id === id)!;
const promptText = (db: AppDatabase, input = 'I look around.') =>
  buildNarrationPrompt(db, input).messages.map((message) => message.content).join('\n');

const completed = (db: AppDatabase, ids: string[]): AppDatabase => ({
  ...db,
  state: { ...db.state, canonProgress: { ...db.state.canonProgress!, completed: [...(db.state.canonProgress?.completed ?? []), ...ids] } },
});

const at = (db: AppDatabase, year: number, month = 1): AppDatabase => ({
  ...db,
  state: { ...db.state, inStoryDate: { ...db.state.inStoryDate, year, month, day: 1 } },
});

describe('the data', () => {
  const names = new Set([...CANON_CAST.map((entry) => entry.name), 'Itachi Uchiha', 'Hana Inuzuka', 'Izumi Uchiha', 'Suzume', 'Kan']);
  const milestones = new Set(CANON_MILESTONES.map((milestone) => milestone.id));

  test('about 200 entries to start, ids unique', () => {
    expect(CANON_JUTSU.length).toBeGreaterThanOrEqual(200);
    expect(new Set(ALL_JUTSU.map((entry) => entry.id)).size).toBe(ALL_JUTSU.length);
  });

  test('every user is a cast name and every milestone exists', () => {
    const badUsers = ALL_JUTSU.flatMap((entry) => entry.users.map(parseUser).filter((user) => !names.has(user.name)).map((user) => `${entry.id}: ${user.name}`));
    const badMilestones = ALL_JUTSU.flatMap((entry) => [
      entry.firstExists,
      ...entry.users.map(parseUser).flatMap((user) => [user.from, user.until]),
    ]).filter((id): id is string => Boolean(id) && !milestones.has(id!));

    expect(badUsers).toEqual([]);
    expect(badMilestones).toEqual([]);
  });

  test('every entry has the fields the spec asks for', () => {
    for (const entry of ALL_JUTSU) {
      expect(entry.name && entry.japanese && entry.cost && entry.effect && entry.look).toBeTruthy();
    }
  });

  test('Kan’s own are only his, and no canon entry lists Kan', () => {
    expect(KAN_JUTSU.every((entry) => entry.kan && entry.users.join() === 'Kan')).toBe(true);
    expect(CANON_JUTSU.some((entry) => entry.users.includes('Kan'))).toBe(false);
  });
});

describe('nothing before it exists', () => {
  test('no entry is sent before its "first exists", nor a user before they have it', () => {
    const db = seed();
    // Each jutsu named on its own, at the start of the story.
    const early: string[] = [];
    for (const entry of ALL_JUTSU) {
      const sent = selectCanonJutsu(db, { recentText: `${entry.name}.`, presentNames: [] });
      for (const item of sent) {
        expect(jutsuExists(db, item)).toBe(true);
        if (item.id === entry.id) early.push(entry.id);
      }
    }
    // The later-era ones are all held back.
    for (const id of ['wind-rasengan', 'kirin', 'night-guy', 'c4', 'six-paths-sage', 'truth-seeking-balls', 'kurama-mode', 'purple-lightning', 'paper-ocean', 'kaguya-powers', 'true-thousand-hands']) {
      expect(early).not.toContain(id);
    }
    expect(early).toContain('rasengan');
    expect(early).toContain('chidori');
    // Naruto has no Rasenshuriken at the start, and no Rasengan.
    expect(currentUsers(db, byId('wind-rasengan'))).toEqual([]);
    expect(currentUsers(db, byId('rasengan'))).not.toContain('Naruto Uzumaki');
  });

  test('a later jutsu exists once its window opens', () => {
    expect(jutsuExists(seed(), byId('kirin'))).toBe(false);
    expect(jutsuExists(completed(seed(), ['itachi-vs-sasuke']), byId('kirin'))).toBe(true);
  });

  test('a user’s jutsu arrives with its milestone, and a lost one leaves with its milestone', () => {
    const late = completed(at(seed(), 21, 12), ['hidan-kakuzu', 'gaara-captured']);
    expect(currentUsers(late, byId('wind-rasengan'))).toContain('Naruto Uzumaki');
    // Gaara loses Shukaku when the Akatsuki take him.
    expect(currentUsers(late, byId('shukaku-possession'))).not.toContain('Gaara');
    expect(currentUsers(seed(), byId('shukaku-possession'))).toContain('Gaara');
  });

  test('Kan’s own entries are never sent before he has them', () => {
    const db = seed();
    const sent = selectCanonJutsu(db, { recentText: 'Sky Burial, Okuribi, the Long Dream and Gyre.', presentNames: [] });
    expect(sent.filter((entry) => entry.kan)).toEqual([]);
  });
});

describe('linking Kan’s records', () => {
  test('his starting jutsu link to their entries and his list shows the real cost', () => {
    const db = seed();
    const fireball = db.jutsuRecords.find((record) => record.user === 'Kan' && record.name === 'Great Fireball');
    expect(fireball?.canonId).toBe('great-fireball');
    expect(canonJutsuOf(db.jutsuRecords.find((record) => record.name === 'Shadow Clone')!)?.id).toBe('shadow-clone');
    expect(promptText(db)).toMatch(/Great Fireball[^\n]*\[Fire, cost moderate\]/);
  });

  test('a new record is linked, and Kan’s Susanoo is his own', () => {
    let db = seed();
    db = applyJutsuDiff(db, { name: 'Fire Release: Phoenix Flower Jutsu', user: 'Sasuke Uchiha', chakraNature: 'Fire' });
    expect(db.jutsuRecords.find((record) => record.user === 'Sasuke Uchiha')?.canonId).toBe('phoenix-flower');
    expect(matchCanonJutsu('Susanoo', true)?.id).toBe('kan-susanoo');
    expect(matchCanonJutsu('Susanoo', false)?.id).toBe('susanoo');
    // "Clone Jutsu" is not the Shadow Clone.
    expect(matchCanonJutsu('Clone Jutsu')?.id).toBe('clone');
  });
});

describe('the turn’s reference', () => {
  test('a jutsu named recently is sent', () => {
    const db = seed();
    const sent = selectCanonJutsu(db, { recentText: 'Kisame’s Water Prison closes around him.', presentNames: [] });
    expect(sent.map((entry) => entry.id)).toContain('water-prison');
  });

  test('the people in the scene bring their signature jutsu, not basics', () => {
    const db = seed();
    const sent = selectCanonJutsu(db, { recentText: '', presentNames: ['Itachi Uchiha'] });
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.length).toBeLessThanOrEqual(2);
    expect(sent.every((entry) => entry.fame !== 'common')).toBe(true);
  });

  test('it reaches the narrator, and the limit holds', () => {
    const db = { ...seed(), state: { ...seed().state, sceneCast: ['Itachi Uchiha'] } };
    const text = promptText(db, 'I think of the Water Dragon Bullet, the Chidori and the Rasengan.');
    expect(text).toContain('JUTSU REFERENCE');
    expect(text).toContain('- Chidori (Chidori)');
    const many = selectCanonJutsu(db, { recentText: CANON_JUTSU.map((entry) => entry.name).join('. '), presentNames: ['Itachi Uchiha', 'Kisame Hoshigaki'] });
    expect(many.length).toBeLessThanOrEqual(8);
  });

  test('nothing is sent when nothing is relevant', () => {
    expect(promptText(seed(), 'I sit by the fire.')).not.toContain('JUTSU REFERENCE');
  });
});

describe('names Kan has not heard', () => {
  test('a famous jutsu is known by name, a secret one is described until said', () => {
    const db = seed();
    expect(kanKnowsJutsuName(db, byId('rasengan'))).toBe(true);
    expect(kanKnowsJutsuName(db, byId('earth-grudge'))).toBe(false);
    expect(formatCanonJutsuEntry(db, byId('earth-grudge'))).toContain('Kan has not heard its name');

    const said = { ...db, rawLog: [...db.rawLog, { ...db.rawLog[0], role: 'assistant' as const, content: '“Earth Grudge Fear,” Kakuzu says.' }] };
    expect(kanKnowsJutsuName(said, byId('earth-grudge'))).toBe(true);
  });

  test('a name the player types this turn counts as said', () => {
    const db = seed();
    expect(formatCanonJutsuEntry(db, byId('water-prison'), 'I watch the Water Prison close.')).not.toContain('Kan has not heard its name');
  });

  test('the dead are not users now', () => {
    const db = seed();
    expect(currentUsers(db, byId('samehada'))).not.toContain('Fuguki Suikazan');
    expect(currentUsers(db, byId('flying-thunder-god'))).toEqual([]);
  });

  test('the Leaf’s and the Uchiha’s known jutsu are known to Kan; the Mist’s are not', () => {
    const db = seed();
    expect(kanKnowsJutsuName(db, byId('great-fireball'))).toBe(true);
    expect(kanKnowsJutsuName(db, byId('shadow-possession'))).toBe(true);
    expect(kanKnowsJutsuName(db, byId('water-prison'))).toBe(false);
  });
});
