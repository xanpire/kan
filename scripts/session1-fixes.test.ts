/**
 * Session 1 items folded into step 9 of the audit: Kan's background in the
 * narrator's sheet (6.20), the scratched forehead protector (6.21, 6.22),
 * the seeded taijutsu count and the mood rule (7), and the tracker prompt no
 * longer seeding "Fire Style: Hell" (8).
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

import { normalizeDatabase } from '../lib/rpg/db';
import { resolveCharacterRefs } from '../lib/rpg/entities';
import { isScratchedProtector, scratchProtectorFromProse, settleProtector } from '../lib/rpg/inventory';
import { appendStoryMessage } from '../lib/rpg/log';
import { LORE_FLAGS } from '../lib/rpg/lore';
import { applyStateStep } from '../lib/rpg/memoryJobs';
import { buildExtractionPrompt, buildNarrationPrompt, trackerPromptText } from '../lib/rpg/prompt';
import { seedDatabase } from '../lib/rpg/seed';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_s1fix', 'Session 1 fixes'));
const narratorText = (db: AppDatabase) => buildNarrationPrompt(db, '*I wait.*').messages.map((message) => message.content).join('\n');

function play(db: AppDatabase, input: string, narration: string, state: Record<string, unknown> | null) {
  let next = appendStoryMessage(db, 'user', input, null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  const diff = state ? resolveCharacterRefs(next, convertStateBlock(state).diff) : null;
  return applyStateStep(next, diff, { turnLogId, userMessage: input, narration }, new Set()).db;
}

describe("Kan's background reaches the narrator (6.20)", () => {
  test('ANBU, and only ANBU, is in the sheet', () => {
    const text = narratorText(seed());
    expect(text).toContain('ANBU is the only unit he ever served in');
    expect(text).toContain('never the barrier corps');
  });
});

describe('the forehead protector (6.21, 6.22)', () => {
  test('a fresh story carries it unscratched, and the narrator is told nobody hands him a scratched one', () => {
    const db = seed();
    expect(db.state.inventory.some(isScratchedProtector)).toBe(false);
    expect(narratorText(db)).toContain('nobody hands him a protector already scratched');
  });

  test('carving it on the page changes the pinned item, even when the tracker misses it', () => {
    const narration = 'You draw the kunai across the plate, and the Leaf’s spiral splits under a single deep line. Itachi watches without a word.';
    const db = play(seed(), '*I scratch my forehead protector.*', narration, { characters_present: ['itachi-uchiha'] });
    expect(db.state.inventory.filter((item) => /headband/i.test(item))).toEqual(['Hidden Leaf headband, scratched through']);
    expect(LORE_FLAGS.headbandScratched(db)).toBe(true);
    expect(narratorText(db)).toContain('scratched through by his own hand');
  });

  test('the tracker adding a scratched one replaces the old one in place', () => {
    const before = ['Hidden Leaf forehead protector', 'Kunai pouch (6 kunai)'];
    expect(settleProtector([...before, 'Scratched Hidden Leaf forehead protector'])).toEqual([
      'Scratched Hidden Leaf forehead protector',
      'Kunai pouch (6 kunai)',
    ]);
    const db = play(seed(), '*I scratch it.*', 'Done.', {
      characters_present: [],
      inventory_added: ['Scratched Hidden Leaf forehead protector'],
      inventory_removed: [],
    });
    expect(db.state.inventory.filter((item) => /forehead protector/i.test(item))).toEqual(['Scratched Hidden Leaf forehead protector']);
  });

  test("speech, hesitation and Itachi's protector don't count", () => {
    const inventory = ['Hidden Leaf forehead protector'];
    expect(scratchProtectorFromProse(inventory, '"Scratch your forehead protector," Itachi says.')).toBeNull();
    expect(scratchProtectorFromProse(inventory, 'You turn the kunai over, but you do not scratch your forehead protector. Not yet.')).toBeNull();
    expect(scratchProtectorFromProse(inventory, "You look at the line carved through Itachi's forehead protector.")).toBeNull();
    expect(scratchProtectorFromProse(['Hidden Leaf forehead protector, scratched through'], 'You scratch your forehead protector again.')).toBeNull();
  });
});

describe('the tracker (7, 8)', () => {
  test('taijutsu starts unused, and an old seeded count goes back to 0', () => {
    const db = seed();
    expect(db.jutsuRecords.find((record) => record.name === 'Shinobi taijutsu')?.timesUsed).toBe(0);
    const old = { ...db, jutsuRecords: db.jutsuRecords.map((record) => (record.name === 'Shinobi taijutsu' ? { ...record, timesUsed: 1 } : record)) };
    expect(normalizeDatabase(old).jutsuRecords.find((record) => record.name === 'Shinobi taijutsu')?.timesUsed).toBe(0);
    // A real use (lastSeen moved) is kept.
    const used = {
      ...db,
      jutsuRecords: db.jutsuRecords.map((record) =>
        record.name === 'Shinobi taijutsu' ? { ...record, timesUsed: 1, lastSeen: { ...record.lastSeen, hour: record.lastSeen.hour + 1 } } : record
      ),
    };
    expect(normalizeDatabase(used).jutsuRecords.find((record) => record.name === 'Shinobi taijutsu')?.timesUsed).toBe(1);
  });

  test('the tracker prompt asks for a feeling as mood, and no longer names "Fire Style: Hell"', () => {
    const db = seed();
    const text = trackerPromptText(buildExtractionPrompt(db, '*I wait.*', 'You wait.'));
    expect(text).toContain('never a word for the air, the place or the pace');
    expect(text).not.toContain('Fire Style: Hell');
    expect(text).toContain('a move may name only jutsu on that list');
  });
});
