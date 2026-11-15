/**
 * Section 8 of claude/before-variety-ideas.md (14 Nov 2026): living NPCs.
 * A voice line for every cast member, sent only for the people in the scene;
 * what sensors, dōjutsu users and noses perceive; Samehada; temperaments for
 * the nameless; and the reactions rule in the narrator's prompt.
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
import { normalizeDatabase } from '../lib/rpg/db';
import { NARRATION_SYSTEM, buildNarrationPrompt } from '../lib/rpg/prompt';
import { seedDatabase } from '../lib/rpg/seed';
import type { AppDatabase } from '../lib/rpg/types';
import { CAST_VOICES, TEMPERAMENTS } from '../lib/rpg/voiceData';
import {
  REACTION_RULES,
  backgroundTemperaments,
  formatReactionsBlock,
  naturesReadLine,
  samehadaLine,
  temperamentFor,
  voiceOf,
} from '../lib/rpg/voices';

const seed = () => normalizeDatabase(seedDatabase('slot_living_npcs', 'Living NPCs'));
const SEEDED = ['Itachi Uchiha', 'Hana Inuzuka', 'Izumi Uchiha', 'Suzume'];

const happened = (db: AppDatabase, id: string): AppDatabase => ({
  ...db,
  state: {
    ...db.state,
    canonProgress: { ...db.state.canonProgress!, completed: [...(db.state.canonProgress?.completed ?? []), id] },
  },
  events: [...db.events, { ...db.events[0], id: `event_canon_${id}`, tags: [`canon-${id}`] }],
});

const idOf = (db: AppDatabase, name: string) => db.entities.find((entity) => entity.name === name)!.id;
const promptText = (db: AppDatabase, input = 'I look around.') =>
  buildNarrationPrompt(db, input).messages.map((message) => message.content).join('\n');

describe('voice lines', () => {
  test('every cast member and the seeded four have one, and no line belongs to nobody', () => {
    const names = new Set([...CANON_CAST.map((entry) => entry.name), ...SEEDED]);
    const missing = [...names].filter((name) => !CAST_VOICES[name]);
    const orphans = Object.keys(CAST_VOICES).filter((name) => !names.has(name));

    expect(missing).toEqual([]);
    expect(orphans).toEqual([]);
  });

  test('no stock reactions in the lines themselves', () => {
    for (const line of Object.values(CAST_VOICES)) {
      expect(line).not.toMatch(/eyes widen|\bgasps?\b/i);
    }
  });

  test('the verbal habits section 8 names are there', () => {
    expect(CAST_VOICES['Naruto Uzumaki']).toContain('dattebayo');
    expect(CAST_VOICES['Deidara']).toContain('"un"');
    expect(CAST_VOICES['Hidan']).toContain('Jashin');
    expect(CAST_VOICES['Kakuzu']).toMatch(/money|prices/);
    expect(CAST_VOICES['Tobi']).toContain('Tobi is a good boy');
  });

  test('anyone outside the cast gets a temperament that stays the same', () => {
    expect(voiceOf({ id: 'entity_ferryman', name: 'the scarred ferryman' })).toBe(
      `temperament: ${temperamentFor('entity_ferryman')}`
    );
    expect(TEMPERAMENTS).toContain(temperamentFor('entity_ferryman'));
    expect(voiceOf({ id: 'x', name: 'Kan' })).toBeNull();
  });
});

describe('the narrator prompt', () => {
  test('carries the reactions rule', () => {
    expect(NARRATION_SYSTEM).toContain(REACTION_RULES);
    expect(REACTION_RULES).toContain('No stock reactions');
    expect(REACTION_RULES).toContain('Surprised once, then they remember');
  });

  test('sends a voice only for the people really in the scene', () => {
    const db = { ...seed(), state: { ...seed().state, sceneCast: ['Itachi Uchiha'] } };
    const text = promptText(db, '"Do you think Hana is safe?"');

    expect(text).toContain(`VOICE: ${CAST_VOICES['Itachi Uchiha']}`);
    // Hana is named, not here: her card may come, her voice doesn't.
    expect(text).not.toContain(`VOICE: ${CAST_VOICES['Hana Inuzuka']}`);
    expect(text).toContain('HOW YOU READ TO OTHERS');
    expect(text).toContain('BACKGROUND PEOPLE');
  });
});

describe('what people perceive', () => {
  test('two natures at 13 read as jōnin level', () => {
    const line = naturesReadLine(seed());
    expect(line).toContain('2: Fire, Earth');
    expect(line).toContain('jōnin level at 13');
  });

  test('a third nature is almost unheard of', () => {
    const db = seed();
    const natures = [
      ...(db.state.player.natures ?? []),
      { nature: 'Wind', source: 'thousand-souls' as const, from: 'a Sand chūnin', acquiredOn: db.state.inStoryDate },
    ];
    const line = naturesReadLine({ ...db, state: { ...db.state, player: { ...db.state.player, natures } } });
    expect(line).toContain('almost unheard of');
    expect(line).toContain('the extra natures are not');
  });

  test('Sasuke sees the drain only once his Sharingan is awake', () => {
    const db = seed();
    const ids = new Set([idOf(db, 'Sasuke Uchiha')]);
    expect(formatReactionsBlock(db, ids)).not.toContain('Sasuke Uchiha:');
    expect(formatReactionsBlock(happened(db, 'land-of-waves'), ids)).toContain('Sasuke Uchiha: Sharingan');
  });

  test('the Inuzuka know you by scent', () => {
    const db = seed();
    expect(formatReactionsBlock(db, new Set([idOf(db, 'Kiba Inuzuka')]))).toContain('knows you by scent');
  });

  test('a sensor who felt you before your chakra changed may not recognise it', () => {
    const db = seed();
    const karin = idOf(db, 'Karin');
    const before = { ...db.state.inStoryDate };
    const later = { ...before, year: before.year + 1 };
    const changed: AppDatabase = {
      ...db,
      entities: db.entities.map((entity) => (entity.id === karin ? { ...entity, lastSeen: before } : entity)),
      state: {
        ...db.state,
        player: {
          ...db.state.player,
          natures: [...(db.state.player.natures ?? []), { nature: 'Water', source: 'thousand-souls', acquiredOn: later }],
        },
      },
    };
    expect(formatReactionsBlock(changed, new Set([karin]))).toContain('may not recognise it');
    expect(formatReactionsBlock(db, new Set([karin]))).not.toContain('may not recognise it');
  });
});

describe('Samehada', () => {
  test('stirs while Kisame carries it, with the canon guard', () => {
    const db = seed();
    const line = samehadaLine(db, new Set([idOf(db, 'Kisame Hoshigaki')]));
    expect(line).toContain('Kisame notices');
    expect(line).toContain('Samehada still ends up with Bee');
  });

  test('goes with Bee after Kisame’s end', () => {
    const db = happened(seed(), 'kisame-dies');
    expect(samehadaLine(db, new Set([idOf(db, 'Kisame Hoshigaki')]))).toBe('');
    expect(samehadaLine(db, new Set([idOf(db, 'Killer Bee')]))).toContain('Bee carries it');
  });
});

describe('the nameless', () => {
  test('get three different temperaments', () => {
    const picks = backgroundTemperaments(seed());
    expect(picks).toHaveLength(3);
    expect(new Set(picks).size).toBe(3);
  });
});
