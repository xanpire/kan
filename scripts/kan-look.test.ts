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
import { buildSceneImagePrompt, directorContext } from '../lib/rpg/image';
import { buildPortraitPrompt, portraitSignature, wearsAkatsukiCloak } from '../lib/rpg/portrait';
import { kanLookAt } from '../lib/rpg/flashbacks';
import { KAN_EYES, kanAgeLine, kanEntity, kanOutfit, kanRightNow, migrateKanEyes, SCRATCHED_PROTECTOR_LINE } from '../lib/rpg/kanLook';
import type { AppDatabase, FactRecord, RawLogEntry } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_look', 'Look'));

function withReply(db: AppDatabase, content = 'You wait.'): AppDatabase {
  const entry: RawLogEntry = {
    id: 'log_x', turn: 1, kind: 'story', role: 'assistant', content, model: 'm',
    promptTokens: 0, completionTokens: 0, chapter: 1, scene: db.state.scene,
    inStoryDate: db.state.inStoryDate, createdAt: Date.now(),
  };
  return { ...db, rawLog: [...db.rawLog, entry] };
}

function lookNow(db: AppDatabase, currentLook: string): AppDatabase {
  return { ...db, entities: db.entities.map((e) => (e.name === 'Kan' ? { ...e, currentLook } : e)) };
}

function owning(db: AppDatabase, ...items: string[]): AppDatabase {
  return { ...db, state: { ...db.state, inventory: [...db.state.inventory, ...items] } };
}

function aged(db: AppDatabase, year: number): AppDatabase {
  return { ...db, state: { ...db.state, inStoryDate: { ...db.state.inStoryDate, year } } };
}

describe("Kan's eyes are brown, in one place (audit 11c, decided by Xan)", () => {
  test('the narrator card, portraits, scenes and flashbacks all say brown', () => {
    const db = seed();
    expect(kanEntity(db)?.appearance).toContain(KAN_EYES);
    expect(kanEntity(db)?.appearance).not.toContain('dark watchful');
    expect(buildSceneImagePrompt(withReply(db), [], 'Kan waits.')).toContain(KAN_EYES);
    expect(buildPortraitPrompt(db, portraitSignature(db), [])).toContain(KAN_EYES);
    expect(kanLookAt(8)).toContain(KAN_EYES);
  });

  test('an old save is migrated', () => {
    expect(migrateKanEyes('Lean teenage shinobi with black hair, dark watchful eyes, wearing black.')).toBe(
      'Lean teenage shinobi with black spiky hair, watchful brown eyes and a long, gently arched Roman nose, wearing black.'
    );
    const old = seed();
    const raw = { ...old, entities: old.entities.map((e) => (e.name === 'Kan' ? { ...e, appearance: 'Lean, dark watchful eyes' } : e)) };
    expect(kanEntity(normalizeDatabase(raw))?.appearance).toContain('watchful brown eyes');
  });
});

describe('Kan ages in scene images', () => {
  test('the age line follows the clock', () => {
    expect(kanAgeLine(13)).toContain('not yet grown');
    expect(kanAgeLine(19)).toContain('Kan is 19');
    expect(kanAgeLine(19)).toContain('sharper jaw');
    expect(kanAgeLine(31)).toContain('thirties');
    const young = buildSceneImagePrompt(withReply(seed()), [], 'Kan waits.');
    expect(young).toContain('Kan is 13');
    const older = buildSceneImagePrompt(withReply(aged(seed(), 19)), [], 'Kan waits.');
    expect(older).toContain('Kan is 19');
    expect(directorContext(withReply(aged(seed(), 19)))).toContain('Kan is 19');
  });
});

describe('Kan right now', () => {
  test('his look, wounds and the scratched protector reach the prompt', () => {
    let db = lookNow(seed(), 'soaked to the skin, Sharingan active');
    const fact = db.facts[0];
    const wound: FactRecord = {
      ...fact,
      id: 'fact_wound',
      type: 'injury',
      text: 'A shallow cut across his left forearm',
      subjectEntityId: kanEntity(db)!.id,
      validTo: null,
      expiresAt: undefined,
    };
    db = owning({ ...db, facts: [...db.facts, wound] }, 'Scratched Hidden Leaf forehead protector');
    const line = kanRightNow(db)!;
    expect(line).toContain('soaked to the skin, Sharingan active');
    expect(line).toContain('shallow cut across his left forearm');
    expect(line).toContain('scratch cut straight through the Leaf symbol');
    const prompt = buildSceneImagePrompt(withReply(db), [], 'Kan waits.');
    expect(prompt).toContain('Kan right now:');
    expect(directorContext(withReply(db))).toContain('Kan right now:');
  });

  test('a scratched protector is among the first lines about Kan, said once (audit 11c.1)', () => {
    const db = owning(seed(), 'Scratched Hidden Leaf forehead protector');
    const prompt = buildSceneImagePrompt(withReply(db), [{ kind: 'face', uri: 'data:f' }], 'Kan waits.');
    const scratch = prompt.indexOf(SCRATCHED_PROTECTOR_LINE);
    expect(scratch).toBeGreaterThan(-1);
    expect(scratch).toBeLessThan(prompt.indexOf('Kan is '));
    expect(prompt.match(/scratch/gi)!.length).toBe(1); // said once, not again in "Kan right now"
  });

  test('nothing to add is no line', () => {
    const db = { ...seed(), facts: [] };
    expect(kanRightNow(db)).toBeNull();
  });
});

describe('owning the cloak is not wearing it', () => {
  test('with no look of the moment, the cloak counts once he has it', () => {
    expect(kanOutfit(seed()).sheet).toBe('black');
    expect(kanOutfit(owning(seed(), 'Akatsuki cloak')).sheet).toBe('akatsuki');
  });

  test('a disguise is described in words, not forced onto a sheet', () => {
    const db = lookNow(owning(seed(), 'Akatsuki cloak'), 'disguised as a travelling monk in grey robes and a straw hat');
    expect(kanOutfit(db)).toEqual({ sheet: null, words: 'disguised as a travelling monk in grey robes and a straw hat' });
    expect(wearsAkatsukiCloak(db)).toBe(false);
    const prompt = buildSceneImagePrompt(withReply(db), [{ kind: 'face', uri: 'data:f' }], 'Kan walks.');
    expect(prompt).toContain("Kan's clothes right now: disguised as a travelling monk");
    expect(prompt).not.toContain('Kan currently wears the Akatsuki cloak');
  });

  test('the cloak folded away is the black outfit; the cloak on is the cloak', () => {
    expect(kanOutfit(lookNow(owning(seed(), 'Akatsuki cloak'), 'Akatsuki cloak folded in his pack')).sheet).toBe('black');
    expect(kanOutfit(lookNow(seed(), 'in the Akatsuki cloak, hood of rain on it')).sheet).toBe('akatsuki');
    expect(kanOutfit(lookNow(owning(seed(), 'Akatsuki cloak'), 'plain black shinobi outfit, sleeves torn')).sheet).toBe('black');
  });
});
