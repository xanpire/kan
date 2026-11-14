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
import { buildSceneImagePrompt, personReferenceSlots } from '../lib/rpg/image';
import { buildPortraitPrompt, portraitSignature } from '../lib/rpg/portrait';
import { kanLookAt } from '../lib/rpg/flashbacks';
import { protectorCheckQuestion } from '../lib/rpg/imageCheck';
import { migrateProtectorName } from '../lib/rpg/inventory';
import {
  KAN_AKATSUKI_OUTFIT,
  KAN_APPEARANCE,
  KAN_BLACK_OUTFIT,
  KAN_NOSE,
  kanEntity,
  kanProtectorPlace,
} from '../lib/rpg/kanLook';
import { kanProtectorLine } from '../lib/rpg/prompt';
import { planReferences, wantsProfileReference } from '../lib/rpg/referencePlan';
import type { AppDatabase, RawLogEntry } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_look14', 'Look'));

function withReply(db: AppDatabase): AppDatabase {
  const entry: RawLogEntry = {
    id: 'log_x', turn: 1, kind: 'story', role: 'assistant', content: 'You wait.', model: 'm',
    promptTokens: 0, completionTokens: 0, chapter: 1, scene: db.state.scene,
    inStoryDate: db.state.inStoryDate, createdAt: Date.now(),
  };
  return { ...db, rawLog: [...db.rawLog, entry] };
}

const cloaked = (db: AppDatabase): AppDatabase => ({
  ...db,
  state: { ...db.state, inventory: [...db.state.inventory, 'Akatsuki cloak'] },
});

describe('boots, never sandals (decided 14 Nov 2026)', () => {
  test("no text about Kan's clothes mentions sandals, except the one negative line", () => {
    const db = seed();
    const texts = [KAN_APPEARANCE, KAN_BLACK_OUTFIT, KAN_AKATSUKI_OUTFIT, kanLookAt(10), kanLookAt(12), kanEntity(db)?.appearance ?? ''];
    for (const text of texts) expect(text).not.toMatch(/sandal/i);
    expect(KAN_BLACK_OUTFIT).toContain('boots');
    expect(KAN_AKATSUKI_OUTFIT).toContain('boots');
    const prompt = buildSceneImagePrompt(withReply(db), [], 'Kan waits.');
    expect(prompt).toContain('boots, never sandals');
    expect(prompt.match(/sandal/gi)?.length).toBe(1);
    expect(kanProtectorLine(db)).toContain('boots, never sandals');
  });
});

describe('the Leaf protector at the waist, out of sight with the cloak (14 Nov 2026)', () => {
  test('before the cloak it is on his belt at his left hip, never his forehead', () => {
    const db = seed();
    expect(kanProtectorPlace(db)).toBe('waist');
    expect(KAN_BLACK_OUTFIT).toContain('left hip');
    expect(kanProtectorLine(db)).toContain('never wears it on his forehead');
    expect(buildSceneImagePrompt(withReply(db), [], 'Kan waits.')).toContain('left hip');
    expect(protectorCheckQuestion('waist', false)).toContain('never on his forehead');
    expect(protectorCheckQuestion('waist', true)).toContain('scratch');
  });

  test('with the cloak: bare chest, same trousers and boots, no protector anywhere', () => {
    const db = cloaked(seed());
    expect(kanProtectorPlace(db)).toBe('hidden');
    expect(KAN_AKATSUKI_OUTFIT).toContain('bare chest');
    expect(kanProtectorLine(db)).toContain('Never describe it on him');
    expect(buildSceneImagePrompt(withReply(db), [], 'Kan waits.')).toContain('no Leaf protector anywhere');
    expect(protectorCheckQuestion('hidden', true)).toContain('no Leaf forehead protector at all');
  });

  test("it is a headband in the inventory; old saves' forehead protector is renamed", () => {
    expect(seed().state.inventory).toContain('Hidden Leaf headband');
    expect(migrateProtectorName('Hidden Leaf forehead protector, scratched through')).toBe('Hidden Leaf headband, scratched through');
    expect(migrateProtectorName('Kunai pouch')).toBe('Kunai pouch');
    const old = seedDatabase('slot_old', 'Old');
    old.state.inventory = ['Hidden Leaf forehead protector', 'Kunai pouch (6 kunai)'];
    expect(normalizeDatabase(old).state.inventory[0]).toBe('Hidden Leaf headband');
  });
});

describe("Kan's Roman nose (decided 14 Nov 2026)", () => {
  test('named in every prompt that describes him', () => {
    const db = seed();
    expect(buildSceneImagePrompt(withReply(db), [], 'Kan waits.')).toContain(KAN_NOSE);
    expect(buildPortraitPrompt(db, portraitSignature(db), [])).toContain(KAN_NOSE);
    expect(KAN_APPEARANCE).toContain('Roman nose');
    expect(kanLookAt(12)).toContain('nose');
  });

  test('the profile crop goes after the face and before the outfit, and only in close shots', () => {
    const plan = planReferences(
      [
        { kind: 'outfit', uri: 'data:image/o' },
        { kind: 'profile', uri: 'data:image/p' },
        { kind: 'face', uri: 'data:image/f' },
      ],
      3
    );
    expect(plan.references.map((r) => r.kind)).toEqual(['face', 'profile', 'outfit']);
    expect(wantsProfileReference(false)).toBe(true);
    expect(wantsProfileReference(true)).toBe(false);
    expect(personReferenceSlots(8, true, true)).toBe(5);
    const prompt = buildSceneImagePrompt(withReply(seed()), [{ kind: 'face', uri: 'f' }, { kind: 'profile', uri: 'p' }], 'Kan waits.');
    expect(prompt).toContain("Kan's profile: copy the exact shape of his nose");
  });
});

describe("Kan's vultures in images (14 Nov 2026)", () => {
  test('a scene with his vultures gets their look', () => {
    const prompt = buildSceneImagePrompt(withReply(seed()), [], 'Kan sends Okuri off with the letter.');
    expect(prompt).toContain('bearded vultures');
    expect(buildSceneImagePrompt(withReply(seed()), [], 'Kan waits.')).not.toContain('bearded vultures');
  });
});
