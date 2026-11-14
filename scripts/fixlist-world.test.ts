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

import { entityAge } from '../lib/rpg/calendar';
import { characterPortraitSignature } from '../lib/rpg/characterPortrait';
import { normalizeDatabase } from '../lib/rpg/db';
import { resolveCharacterRefs } from '../lib/rpg/entities';
import { appendStoryMessage } from '../lib/rpg/log';
import { applyStateStep } from '../lib/rpg/memoryJobs';
import { buildNarrationPrompt } from '../lib/rpg/prompt';
import { seedDatabase } from '../lib/rpg/seed';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import { secondPerson } from '../lib/rpg/util';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_world', 'World'));

function play(db: AppDatabase, narration: string, state: Record<string, unknown> | null): AppDatabase {
  let next = appendStoryMessage(db, 'user', 'I keep going.', null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  const reply = state ? convertStateBlock(state).diff : null;
  const diff = reply ? resolveCharacterRefs(next, reply) : null;

  return applyStateStep(next, diff, { turnLogId, userMessage: 'I keep going.', narration }, new Set()).db;
}

const person = (db: AppDatabase, name: string) => db.entities.find((entity) => entity.name === name)!;
const bondOf = (db: AppDatabase, name: string) => db.bonds.find((bond) => bond.entityId === person(db, name).id);

describe('15. the starting cast', () => {
  test('Team 3 and Itachi are met, seen days ago, with birthdays and no stored age; Shisui has a bond', () => {
    const db = seed();
    for (const name of ['Hana Inuzuka', 'Izumi Uchiha', 'Suzume', 'Itachi Uchiha']) {
      const entity = person(db, name);
      expect(entity.met).toBe(true);
      expect(entity.lastSeen).toBeDefined();
      expect(entity.birthday).toBeDefined();
      expect(entity.age).toBeUndefined();
    }
    expect(person(db, 'Itachi Uchiha').birthday).toEqual({ month: 6, day: 9 });
    expect(entityAge(db.state.inStoryDate, person(db, 'Itachi Uchiha'))).toBe(13);
    expect(bondOf(db, 'Shisui Uchiha')).toMatchObject({ relationship: 'old friend', status: 'Deceased · Childhood friend' });
  });

  test('a bond shows a death once you know of it, not before', () => {
    let db = seed();
    expect(bondOf(db, 'Izumi Uchiha')?.status).toBe('Cousin · former teammate');
    db = play(db, 'Itachi tells you Izumi died.', { characters_present: ['itachi-uchiha'], deaths: [{ character_id: 'izumi-uchiha', cause: 'the massacre' }] });
    expect(bondOf(db, 'Izumi Uchiha')?.status).toBe('Deceased · Cousin · former teammate');
  });
});

describe('16. minor characters', () => {
  test('a one-scene character gets no bond until a second scene', () => {
    let db = seed();
    db = play(db, 'The deserter turns at the bridge.', {
      location: 'Bridge over the gorge',
      characters_present: ['Goro'],
      new_characters: [{ is_new: true, name: 'Goro', age: 30, role: 'Deserter', personality: null, speech_style: null, appearance: null, gender: 'male', attracted_to: null, minor: true }],
    });
    expect(person(db, 'Goro').met).toBe(true);
    expect(person(db, 'Goro').tier).toBe('minor');
    expect(bondOf(db, 'Goro')).toBeUndefined();

    db = play(db, 'You leave.', { scene_ended: true });
    db = play(db, 'Goro is waiting at the inn.', { location: 'Roadside inn', characters_present: ['goro'] });
    expect(person(db, 'Goro').tier).toBeUndefined();
    expect(bondOf(db, 'Goro')).toBeDefined();
  });
});

describe('17. base look and current look', () => {
  test('updates set the current look; it ends with the scene; portraits and the narrator use both', () => {
    let db = seed();
    const base = person(db, 'Itachi Uchiha').appearance;
    expect(base).not.toContain('red clouds');

    db = play(db, 'Itachi is soaked and spattered with blood.', {
      characters_present: ['itachi-uchiha'],
      character_updates: [{ character_id: 'itachi-uchiha', mood: null, appearance: 'Soaked, blood-spattered vest', lasting_appearance: null }],
    });
    expect(person(db, 'Itachi Uchiha').appearance).toBe(base);
    expect(person(db, 'Itachi Uchiha').currentLook).toBe('Soaked, blood-spattered vest');
    expect(characterPortraitSignature(db, person(db, 'Itachi Uchiha')).appearance).toContain('Right now: Soaked');

    db = play(db, 'Morning, somewhere else.', { location: 'Grass country ridge', characters_present: ['itachi-uchiha'] });
    expect(person(db, 'Itachi Uchiha').currentLook).toBeUndefined();

    db = play(db, 'Itachi pulls on the cloak for good.', {
      characters_present: ['itachi-uchiha'],
      character_updates: [{ character_id: 'itachi-uchiha', mood: null, appearance: null, lasting_appearance: 'Long black hair tied low; black Akatsuki cloak with red clouds.' }],
    });
    expect(person(db, 'Itachi Uchiha').appearance).toContain('Akatsuki cloak');
  });
});

describe('18. abilities and natures', () => {
  test('the state reply records the Sharingan by stage and natures by source', () => {
    let db = seed();
    expect((db.state.player.natures ?? []).map((n) => `${n.nature}:${n.source}`)).toEqual(['Fire:innate', 'Earth:innate']);
    expect(db.jutsuRecords.some((record) => record.name === 'Fire Release')).toBe(false);

    db = play(db, 'Your eyes burn red.', { abilities_changed: [{ name: 'Sharingan', stage: '1 tomoe' }] });
    db = play(db, 'You drain the ninja.', {
      abilities_changed: [{ name: 'Sharingan', stage: '2 tomoe' }],
      natures_gained: [{ nature: 'Water', source: 'thousand-souls', from: 'Mist ninja' }],
    });
    const sharingan = db.state.player.abilities!.find((ability) => ability.name === 'Sharingan')!;
    expect(sharingan.stage).toBe('2 tomoe');
    expect(sharingan.history?.map((item) => item.stage)).toEqual(['1 tomoe', '2 tomoe']);
    expect(db.state.player.natures).toEqual([
      expect.objectContaining({ nature: 'Fire', source: 'innate' }),
      expect.objectContaining({ nature: 'Earth', source: 'innate' }),
      expect.objectContaining({ nature: 'Water', source: 'thousand-souls', from: 'Mist ninja' }),
    ]);
    expect(buildNarrationPrompt(db, '*You look.*').messages[0].content).toContain('Sharingan (2 tomoe)');
  });
});

describe('19. scene labels', () => {
  test('a ravine is not a settlement, an ambush is not travel, and you are not in your own cast', () => {
    let db = seed();
    db = play(db, 'They strike from the rocks. A kunai lunges at you; you dodge and strike back.', {
      location: 'Ravine below the pass',
      location_kind: 'settlement',
      scene_pace: 'travel',
      characters_present: ['kan', 'itachi-uchiha'],
    });
    expect(db.state.locationKind).toBe('wilderness');
    expect(db.state.scenePace).toBe('combat');
    expect(db.state.sceneCast).toEqual(['Itachi Uchiha']);
  });
});

describe('21. second person', () => {
  test('text that reaches you says "you"', () => {
    const db = seed();
    expect(db.events[0].summary.startsWith('You wait alone')).toBe(true);
    expect(db.jutsuRecords.find((record) => record.name === 'Thousand Souls')?.visual).toContain('your skin');
    expect(db.facts.every((fact) => !/\bKan\b/.test(fact.text))).toBe(true);
    expect(secondPerson("Kan's cloak is torn, and Kakuzu watches Kan.")).toBe('Your cloak is torn, and Kakuzu watches you.');
  });
});
