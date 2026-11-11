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
import { appendStoryMessage } from '../lib/rpg/log';
import { applyStateStep } from '../lib/rpg/memoryJobs';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import { resolveCharacterRefs, resolveEntity } from '../lib/rpg/entities';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_cast', 'Cast story'));

function play(db: AppDatabase, narration: string, state: Record<string, unknown>) {
  let next = appendStoryMessage(db, 'user', '*I go.*', null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  const diff = resolveCharacterRefs(next, convertStateBlock(state).diff);
  const result = applyStateStep(next, diff, { turnLogId, userMessage: '*I go.*', narration }, new Set());
  return { db: result.db, entry: result.db.rawLog.find((item) => item.id === turnLogId)!, events: result.events };
}

describe('the scene cast follows Kan (audit 6.10)', () => {
  test('walking away alone leaves Itachi behind', () => {
    const first = play(seed(), 'Itachi stands beside you at the river.', {
      characters_present: ['itachi-uchiha'],
      location: 'A riverbank, Land of Fire',
      time: { elapsed: 5, unit: 'minutes' },
    });
    expect(first.db.state.sceneCast).toEqual(['Itachi Uchiha']);

    const second = play(first.db, 'You walk north alone for an hour. The forest thins.', {
      characters_present: [],
      location: 'A forest trail north of the river, Land of Fire',
      time: { elapsed: 1, unit: 'hours' },
    });
    expect(second.db.state.sceneCast).toEqual([]);
    expect(second.entry.sceneCastIds ?? []).toEqual([]);
  });

  test('a new place with no cast listed keeps only companions', () => {
    const first = play(seed(), 'Itachi stands beside you at the river.', {
      characters_present: ['itachi-uchiha'],
      location: 'A riverbank, Land of Fire',
    });
    const second = play(first.db, 'You reach the inn at dusk.', { location: 'An inn in Tanzaku Town' });
    expect(second.db.state.sceneCast).toEqual([]);
  });

  test('a missing field in the same place changes nothing', () => {
    const first = play(seed(), 'Itachi stands beside you at the river.', {
      characters_present: ['itachi-uchiha'],
      location: 'A riverbank, Land of Fire',
    });
    const second = play(first.db, 'The water runs on.', { mood: 'quiet' });
    expect(second.db.state.sceneCast).toEqual(['Itachi Uchiha']);
  });
});

describe('who someone is never changes by accident (audit 6.11)', () => {
  const itachi = (db: AppDatabase) => db.entities.find((entity) => entity.name === 'Itachi Uchiha')!;

  test('a known canon person listed under new_characters keeps their card', () => {
    const db = seed();
    const before = itachi(db);
    const after = play(db, 'Itachi watches you.', {
      new_characters: [
        { is_new: true, name: 'Itachi Uchiha', age: 17, role: 'Rogue ninja', personality: 'Cold and cruel', speech_style: 'Mocking' },
      ],
    }).db;
    const now = itachi(after);
    expect(now.role).toBe(before.role);
    expect(now.personality).toBe(before.personality);
    expect(now.speechStyle).toBe(before.speechStyle);
    expect(now.birthYear).toBe(before.birthYear);
  });

  test('an original person only gets blanks filled, and changes only through personality_change', () => {
    let db = play(seed(), 'A ferryman nods at you.', {
      new_characters: [{ is_new: true, name: 'Ren Kisaragi', role: 'Ferryman', personality: 'Unknown', speech_style: 'Unknown' }],
    }).db;
    db = play(db, 'Ren talks.', {
      new_characters: [{ is_new: true, name: 'Ren Kisaragi', role: 'Spy', personality: 'Quiet, careful', speech_style: 'Clipped' }],
    }).db;
    let ren = db.entities.find((entity) => entity.name === 'Ren Kisaragi')!;
    expect(ren.role).toBe('Ferryman');
    expect(ren.personality).toBe('Quiet, careful');
    expect(ren.speechStyle).toBe('Clipped');

    const renId = ren.id;
    db = play(db, 'Something in Ren has broken.', {
      character_updates: [{ character_id: 'ren-kisaragi', personality_change: 'Bitter and reckless since the fire' }],
    }).db;
    ren = db.entities.find((entity) => entity.id === renId)!;
    expect(ren.personality).toBe('Bitter and reckless since the fire');

    const canonBefore = itachi(db).personality;
    db = play(db, 'Itachi.', {
      character_updates: [{ character_id: 'itachi-uchiha', personality_change: 'Cheerful' }],
    }).db;
    expect(itachi(db).personality).toBe(canonBefore);
  });
});

describe('the prose fallback sets the cast (audit 6.16)', () => {
  test('a failed state turn puts people Kan has met into the scene, never new people', () => {
    const met = play(seed(), 'Itachi stands beside you.', { characters_present: ['itachi-uchiha'], location: 'A riverbank' });
    const left = play(met.db, 'You walk on alone.', { characters_present: [], location: 'A forest trail' });
    expect(left.db.state.sceneCast).toEqual([]);

    let next = appendStoryMessage(left.db, 'user', '*I wait.*', null, 0, 0);
    const narration = 'Itachi steps out of the trees. Itachi studies you without a word.';
    next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
    const turnLogId = next.rawLog[next.rawLog.length - 1].id;
    const result = applyStateStep(next, null, { turnLogId, userMessage: '*I wait.*', narration }, new Set());
    expect(result.db.state.sceneCast).toEqual(['Itachi Uchiha']);
    expect(result.events.some((event) => event.kind === 'fallback')).toBe(true);
  });
});

import { buildNarrationPrompt } from '../lib/rpg/prompt';
import { SCENE_CAST_LIMIT } from '../lib/rpg/sceneLimits';

describe('the people in the scene keep their cards (audit 6.1, 6.2)', () => {
  test('a new person standing in front of Kan gets a card, with how they feel about him', () => {
    let db = play(seed(), 'A ferryman nods.', {
      new_characters: [{ is_new: true, name: 'Ren Kisaragi', role: 'Ferryman', personality: 'Dry', speech_style: 'Short' }],
      characters_present: ['Ren Kisaragi'],
      bonds: [{ character_id: 'Ren Kisaragi', affinity_change: -2, note: 'Wary of you', relationship: 'acquaintance' }],
    }).db;
    // Seven canon people talked about in the last reply.
    db = appendStoryMessage(db, 'assistant', 'Ren talks about Itachi, Kisame, Pain, Konan, Kakuzu, Hidan, Deidara and Sasori while he rows.', null, 0, 0);
    const text = buildNarrationPrompt(db, '*I listen.*').messages[1].content;
    const cards = text.split('CHARACTERS IN SCENE')[1] ?? '';
    expect(cards.indexOf('Ren Kisaragi')).toBeGreaterThan(-1);
    expect(cards.indexOf('Ren Kisaragi')).toBeLessThan(cards.indexOf('Itachi'));
    expect(cards).toContain('they feel -2/10 toward you');
  });

  test('an ensemble scene keeps everyone', () => {
    const names = ['itachi-uchiha', 'kisame-hoshigaki', 'pain', 'konan', 'kakuzu', 'hidan', 'deidara', 'sasori', 'zetsu', 'orochimaru'];
    const db = play(seed(), 'The Akatsuki gather in the hall.', { characters_present: names }).db;
    expect(db.state.sceneCast!.length).toBe(Math.min(names.length, SCENE_CAST_LIMIT));
    const text = buildNarrationPrompt(db, '*I wait.*').messages[1].content;
    expect(text).toContain('ALSO HERE');
  });
});

describe('duplicate people (audit 6.14)', () => {
  test('"Ren" seen recently and "Ren Kisaragi" named now are one person, with the fuller name', () => {
    let db = play(seed(), 'A ferryman called Ren rows you across.', {
      new_characters: [{ is_new: true, name: 'Ren', role: 'Ferryman' }],
      characters_present: ['Ren'],
    }).db;
    const result = play(db, 'He tells you his full name.', {
      new_characters: [{ is_new: true, name: 'Ren Kisaragi', role: 'Ferryman' }],
      characters_present: ['Ren Kisaragi'],
    });
    db = result.db;
    const rens = db.entities.filter((entity) => entity.name.startsWith('Ren'));
    expect(rens).toHaveLength(1);
    expect(rens[0].name).toBe('Ren Kisaragi');
    expect(rens[0].aliases).toContain('Ren');
    expect(result.events.some((event) => event.kind === 'merged')).toBe(true);
  });

  test('a stranger described twice in one scene is one person', () => {
    let db = play(seed(), 'A scarred ferryman watches you.', {
      new_characters: [{ is_new: true, name: 'scarred ferryman', name_known: false, role: 'Ferryman' }],
      characters_present: ['scarred ferryman'],
    }).db;
    const before = db.entities.filter((entity) => entity.unnamed).length;
    db = play(db, 'The ferryman with the scar spits.', {
      new_characters: [{ is_new: true, name: 'ferryman with the scar', name_known: false, role: 'Ferryman' }],
      characters_present: ['ferryman with the scar'],
    }).db;
    expect(db.entities.filter((entity) => entity.unnamed).length).toBe(before);
    const ferryman = db.entities.find((entity) => entity.unnamed)!;
    expect(db.state.sceneCast!.map((name) => resolveEntity(db, name)?.id)).toContain(ferryman.id);
  });

  test('a canon name is never merged by given name', () => {
    const db = play(seed(), 'A girl named Hana Uzumaki waves.', {
      new_characters: [{ is_new: true, name: 'Hana Uzumaki', role: 'Courier' }],
      characters_present: ['Hana Uzumaki'],
    }).db;
    expect(db.entities.some((entity) => entity.name === 'Hana Uzumaki')).toBe(true);
    expect(db.entities.some((entity) => entity.name === 'Hana Inuzuka')).toBe(true);
  });
});
