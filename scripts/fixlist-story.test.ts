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

import { buildIndices, normalizeDatabase } from '../lib/rpg/db';
import { resolveCharacterRefs } from '../lib/rpg/entities';
import { compressImage, dataUriBytes } from '../lib/rpg/imageCompress';
import { appendStoryMessage, pushSnapshot, restoreLastSnapshot, SNAPSHOT_LIMIT } from '../lib/rpg/log';
import { loreActive } from '../lib/rpg/lore';
import { applyStateStep } from '../lib/rpg/memoryJobs';
import { buildNarrationPrompt } from '../lib/rpg/prompt';
import { seedDatabase } from '../lib/rpg/seed';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import { formatVarietyBlock, questionEndings, repeatedMotifs } from '../lib/rpg/variety';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_story', 'Story'));

function play(db: AppDatabase, narration: string, state: Record<string, unknown> | null): AppDatabase {
  let next = appendStoryMessage(db, 'user', 'I keep going.', null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  const reply = state ? convertStateBlock(state).diff : null;
  const diff = reply ? resolveCharacterRefs(next, reply) : null;

  return applyStateStep(next, diff, { turnLogId, userMessage: 'I keep going.', narration }, new Set()).db;
}

/** The beat is under way, so the tracker is shown it and may complete it (audit 6.18). */
function underway(db: AppDatabase, id: string): AppDatabase {
  const progress = db.state.canonProgress ?? { version: 0, completed: [], active: [], engaged: [] };
  return {
    ...db,
    state: { ...db.state, canonProgress: { ...progress, active: [id], engaged: [...(progress.engaged ?? []), id] } },
  } as AppDatabase;
}

const promptText = (db: AppDatabase) => buildNarrationPrompt(db, '*You wait.*').messages.map((m) => m.content).join('\n');
const thread = (db: AppDatabase, title: string) => db.threads.find((item) => item.title === title);

describe('22. indices and undo snapshots', () => {
  test('events are indexed by a padded date, not under tags', () => {
    const db = seed();
    const index = buildIndices(db);
    expect(index.eventsByDate['13-10-01']).toEqual([db.events[0].id]);
    expect(index.eventsByTag['13-10-1']).toBeUndefined();
  });

  test('snapshots hold no images, keep the last few, and undo brings images back', () => {
    let db = seed();
    db = { ...db, characterPortraits: [{ id: 'p', entityId: 'e', image: 'img:portrait', signature: { age: 13, expression: 'calm', appearance: '' }, usedFace: false, inStoryDate: db.state.inStoryDate, createdAt: 1 }] };
    for (let i = 0; i < SNAPSHOT_LIMIT + 2; i += 1) {
      db = pushSnapshot(appendStoryMessage(db, 'assistant', `Turn ${i}`, null, 0, 0));
    }
    db = { ...db, rawLog: db.rawLog.map((entry, index) => (index === 0 ? { ...entry, image: 'data:image/png;base64,AAAA' } : entry)) };
    db = pushSnapshot(db);

    expect(db.snapshots).toHaveLength(SNAPSHOT_LIMIT);
    const latest = db.snapshots.at(-1)!;
    expect((latest.database as any).characterPortraits).toBeUndefined();
    expect((latest.database as any).rawLog).toBeUndefined();
    expect(latest.rawLogLength).toBe(db.rawLog.length);

    const restored = restoreLastSnapshot(db)!;
    expect(restored.characterPortraits?.[0].image).toBe('img:portrait');
    expect(restored.rawLog[0].image).toBe('data:image/png;base64,AAAA');
  });
});

describe('23. narrator variety', () => {
  test('question endings, repeated images and settled decisions are named', () => {
    let db = seed();
    for (const ending of ['Can you keep up, Kan?', 'How do you take them?', 'Will you come?']) {
      db = appendStoryMessage(db, 'assistant', `The smell of iron hangs over the stones. ${ending}`, null, 0, 0);
    }
    expect(questionEndings(db)).toBe(3);
    expect(repeatedMotifs(db)).toContain('smell of iron');

    db = { ...db, threads: db.threads.map((item) => (item.title === 'Itachi’s offer: join Akatsuki' ? { ...item, status: 'resolved' } : item)) };
    const block = formatVarietyBlock(db);
    expect(block).toContain('ended on a question');
    expect(block).toContain('"smell of iron"');
    expect(block).toContain('never ask again: Itachi’s offer: join Akatsuki');
    expect(promptText(db)).toContain('VARIETY');
  });
});

describe('24-26. clock, numbers, places, gear', () => {
  test('the narrator gets the exact time, stated figures, where others are, geography and its kit', () => {
    let db = seed();
    db = play(db, '"Twenty thousand ryō," Kakuzu says, and Jūzō leaves to wait at the eastern border.', {
      characters_present: ['kakuzu', 'juzo-biwa'],
      facts: [{ entity: 'kakuzu', fact: "The deserter's bounty is 20,000 ryō.", type: 'figure', who_knows: ['kan', 'kakuzu'], supersedes: [], claimed_by: null, lasts: null, days: null }],
    });
    db = play(db, 'Jūzō is gone.', {
      characters_present: ['kakuzu'],
      character_updates: [{ character_id: 'juzo-biwa', mood: null, appearance: null, lasting_appearance: null, whereabouts: 'waiting at the eastern border' }],
    });
    const text = promptText(db);

    expect(text).toMatch(/exactly \d{1,2}:\d{2} (AM|PM)/);
    expect(text).toContain("FIGURES ALREADY SAID");
    expect(text).toContain('20,000 ryō');
    expect(text).toContain('Jūzō Biwa: waiting at the eastern border');
    expect(text).toContain('GEOGRAPHY');
    expect(text).toContain('the Land of Grass is NORTH of Rain');
    expect(db.state.inventory).toContain('Kunai pouch (6 kunai)');
    expect(db.state.inventory).toContain('Hidden Leaf forehead protector');
  });

  test('the headband note lasts until you scratch it', () => {
    let db = seed();
    const note = db.loreEntries.find((lore) => lore.text.startsWith('Your Hidden Leaf forehead protector'))!;
    expect(loreActive(db, note)).toBe(true);
    db = play(db, 'You draw the kunai across the leaf.', {
      inventory_removed: ['Hidden Leaf forehead protector'],
      inventory_added: ['Hidden Leaf forehead protector (scratched through)'],
    });
    expect(loreActive(db, note)).toBe(false);
  });
});

describe('27. smaller images', () => {
  test('without a canvas the image is kept as it is; sizes are measured', async () => {
    const uri = 'data:image/png;base64,AAAAAAAA';
    expect(await compressImage(uri)).toBe(uri);
    expect(dataUriBytes(uri)).toBe(6);
  });
});

describe('28. story hooks', () => {
  test("Izumi's grave opens when you learn she died, and the Mangekyō closes it with its abilities", () => {
    let db = seed();
    expect(thread(db, "Visit Izumi's grave")).toBeUndefined();

    db = play(db, 'Itachi tells you Izumi died.', { characters_present: ['itachi-uchiha'], deaths: [{ character_id: 'izumi-uchiha', cause: 'the massacre' }] });
    // Knowing she died is not knowing where she lies: the goal waits for word of the funeral (Session 1).
    expect(thread(db, "Visit Izumi's grave")).toBeUndefined();

    const progress = db.state.canonProgress!;
    db = {
      ...db,
      state: {
        ...db.state,
        canonProgress: {
          ...progress,
          completed: [...progress.completed, 'izumi-funeral'],
          heard: { ...(progress.heard ?? {}), 'event_canon_izumi-funeral': { from: 'Itachi Uchiha', date: db.state.inStoryDate } },
        },
      },
    };
    db = play(db, 'You listen.', { characters_present: ['itachi-uchiha'] });
    expect(thread(db, "Visit Izumi's grave")?.status).toBe('open');

    db = play(underway(db, 'kan-mangekyo'), 'At her grave, your eyes change.', { canon_completed: ['kan-mangekyo'] });
    expect(thread(db, "Visit Izumi's grave")?.status).toBe('resolved');
    expect(db.state.player.abilities?.map((ability) => ability.name)).toEqual(['Mangekyō Sharingan', 'Susanoo']);
  });

  test('joining opens Survive Kakuzu; the Shisui truth closes the Shisui thread', () => {
    let db = seed();
    // Agreeing to go is not being paired with Kakuzu (Session 1: the goal showed from turn 1).
    expect(thread(underway(db, 'kan-joins-akatsuki'), 'Survive Kakuzu')).toBeUndefined();
    expect(thread(play(underway(db, 'kan-joins-akatsuki'), 'You follow Itachi west.', { characters_present: ['itachi-uchiha'] }), 'Survive Kakuzu')).toBeUndefined();
    db = play(underway(db, 'kan-joins-akatsuki'), 'Pain hands you the cloak.', { characters_present: ['pain', 'kakuzu'], canon_completed: ['kan-joins-akatsuki'] });
    // The cloak is the trial, not the partnership (audit 8).
    expect(thread(db, 'Survive Kakuzu')).toBeUndefined();
    db = play(underway(db, 'kan-accepted-akatsuki'), 'Pain gives you your ring.', { characters_present: ['pain', 'kakuzu'], canon_completed: ['kan-accepted-akatsuki'] });
    expect(thread(db, 'Survive Kakuzu')?.participantIds).toContain(db.entities.find((e) => e.name === 'Kakuzu')!.id);

    db = play(underway(db, 'shisui-truth'), 'Itachi tells you about the river.', { characters_present: ['itachi-uchiha'], canon_completed: ['shisui-truth'] });
    expect(thread(db, 'What really happened to Shisui?')?.status).toBe('resolved');
    expect(db.facts.some((fact) => fact.text.includes('Danzō Shimura took one of Shisui'))).toBe(true);
  });
});
