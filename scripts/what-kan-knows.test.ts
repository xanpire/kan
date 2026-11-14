/**
 * Session 2, what Kan knows (audit 6b.1 to 6b.3): the opening is his own
 * memory, a milestone he only heard of never places him there, and a name he
 * doesn't know leaves no trace.
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

import { CANON_MILESTONES } from '../lib/rpg/canonData';
import { normalizeDatabase } from '../lib/rpg/db';
import { displayName, scrubNameLeaks } from '../lib/rpg/names';
import { LEGACY_OPENING_SUMMARY_START, OPENING_BRIEFING, OPENING_MEMORY, seedDatabase } from '../lib/rpg/seed';

const seed = () => normalizeDatabase(seedDatabase('slot_knows', 'Knows'));

describe('the opening is Kan’s memory, not the narrator’s briefing (audit 6b.1)', () => {
  test('a new story', () => {
    const opening = seed().events.find((event) => event.tags.includes('opening'))!;
    expect(opening.summary).toBe(OPENING_MEMORY);
    expect(opening.summary).not.toMatch(/Akatsuki|truth back|about to arrive/);
    expect(opening.narratorNote).toBe(OPENING_BRIEFING);
  });

  test('an old save is migrated on load', () => {
    const db = seed();
    const old = {
      ...db,
      events: db.events.map((event) =>
        event.tags.includes('opening')
          ? { ...event, summary: `${LEGACY_OPENING_SUMMARY_START}, but you were already in the forest… he will hold the truth back.`, narratorNote: undefined }
          : event
      ),
    };
    const opening = normalizeDatabase(old).events.find((event) => event.tags.includes('opening'))!;
    expect(opening.summary).toBe(OPENING_MEMORY);
    expect(opening.narratorNote).toBe(OPENING_BRIEFING);
  });
});

describe('a milestone Kan only heard of never places him there (audit 6b.2)', () => {
  test('no world milestone description puts "you" at the event', () => {
    const placing = /\byou\s+(?:are|stand|stood|watch|watched|meet|met|see|saw|attend|attended|were there)\b|\ba ghost at\b/i;
    const offenders = CANON_MILESTONES.filter((milestone) => !milestone.playerDriven && placing.test(milestone.description)).map((milestone) => milestone.id);
    expect(offenders).toEqual([]);
  });

  test('a save that fired the funeral before gets the new wording', () => {
    const db = seed();
    const funeral = CANON_MILESTONES.find((milestone) => milestone.id === 'izumi-funeral')!;
    const old = {
      ...db,
      events: [
        ...db.events,
        {
          id: 'event_funeral',
          chapter: 1,
          scene: 'Canon event',
          inStoryDate: db.state.inStoryDate,
          summary: `${funeral.title}: Izumi Uchiha is buried with the rest of the clan. Hana and Suzume stand at the grave; you are a ghost at the edge of the ceremony.`,
          importance: 3 as const,
          tags: ['canon', 'canon-izumi-funeral', 'ashes'],
          pinned: false,
          sourceLogId: null,
          createdAt: 0,
        },
      ],
    };
    const event = normalizeDatabase(old).events.find((item) => item.id === 'event_funeral')!;
    expect(event.summary).toBe(`${funeral.title}: ${funeral.description}`);
    expect(event.summary).not.toContain('ghost');
  });
});

describe('the name guard leaves no trace (audit 6b.3)', () => {
  test('an appositive name goes with its commas', () => {
    const db = seed();
    const konan = db.entities.find((entity) => entity.name === 'Konan')!;
    const label = displayName(db, konan);
    if (label === konan.name) return; // Kan already knows her in this seed.

    const { text, replaced } = scrubNameLeaks(db, 'The woman, Konan, does not reach for a weapon.');
    expect(replaced).toContain('Konan');
    expect(text).toBe('The woman does not reach for a weapon.');
    expect(scrubNameLeaks(db, 'Beside him stands a woman, Konan.').text).toBe('Beside him stands a woman.');
    // Elsewhere the name still becomes the label.
    expect(scrubNameLeaks(db, 'Konan nods.').text).toBe(`${label.charAt(0).toUpperCase()}${label.slice(1)} nods.`);
  });
});
