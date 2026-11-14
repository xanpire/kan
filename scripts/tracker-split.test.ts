// Audit 7: the state tracker split into a Core call (every turn) and a World
// call (only for the areas the turn touched), run side by side.

import { afterEach, describe, expect, mock, test } from 'bun:test';

mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

import { normalizeDatabase } from '../lib/rpg/db';
import { seedDatabase } from '../lib/rpg/seed';
import { beginDebugTurn, clearDebugLog, getDebugLog, linkDebugTurn, recordDebugState } from '../lib/rpg/debug';
import { buildExtractionPrompt, worldAreasForTurn } from '../lib/rpg/prompt';
import { extractTurnDiff, setTransientRetryDelaysForTests } from '../lib/rpg/services';
import {
  CORE_FIELDS,
  CORE_STATE_SCHEMA,
  TURN_STATE_SCHEMA,
  WORLD_AREA_FIELDS,
  WORLD_AREAS,
  fieldsOf,
  worldStateSchema,
} from '../lib/rpg/stateSchema';
import { trackerFieldStats } from '../lib/rpg/trackerStats';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_test', 'Test story'));
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  setTransientRetryDelaysForTests([1000, 3000]);
});

function reply(content: string) {
  return new Response(
    JSON.stringify({
      id: 'gen',
      choices: [{ message: { content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0 },
    }),
    { status: 200 }
  );
}

type Body = { response_format?: { json_schema?: { name?: string; schema?: { properties?: object } } }; messages?: unknown[] };

/** Answers Core and World separately and records what each was sent. */
function mockTracker(core: () => Response, world: () => Response) {
  const seen: { core: Body[]; world: Body[] } = { core: [], world: [] };
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Body) : null;
    if (!body?.messages) return reply('{}');
    if (body.response_format?.json_schema?.name === 'kan_turn_world') {
      seen.world.push(body);
      return world();
    }
    seen.core.push(body);
    return core();
  }) as typeof fetch;
  return seen;
}

describe('the two schemas', () => {
  test('Core and World together are exactly the full schema, with no field in both', () => {
    const world = Object.values(WORLD_AREA_FIELDS).flat();
    const all = Object.keys(TURN_STATE_SCHEMA.properties);
    expect([...CORE_FIELDS, ...world].sort()).toEqual([...all].sort());
    expect(new Set(world).size).toBe(world.length);
    expect(CORE_FIELDS.some((field) => world.includes(field))).toBe(false);
  });

  test('Core holds what matters every turn, and stays strict', () => {
    for (const field of ['time', 'scene_pace', 'location', 'characters_present', 'bonds', 'facts', 'deaths', 'new_characters', 'inventory_added', 'money', 'names_learned', 'fight_options']) {
      expect(CORE_FIELDS).toContain(field);
    }
    expect(CORE_STATE_SCHEMA.required).toEqual(Object.keys(CORE_STATE_SCHEMA.properties));
    expect(CORE_STATE_SCHEMA.additionalProperties).toBe(false);
  });

  test('a World schema carries only the asked-for areas', () => {
    const schema = worldStateSchema(['weather', 'letters']);
    expect(Object.keys(schema.properties).sort()).toEqual(['letters_received', 'letters_sent', 'weather']);
    expect(schema.required.sort()).toEqual(['letters_received', 'letters_sent', 'weather']);
    expect(fieldsOf(['canon'])).toEqual(['canon_engaged', 'canon_completed', 'canon_passed', 'news_relayed', 'trial_mission']);
    expect(WORLD_AREAS.length).toBe(8);
  });
});

describe('which areas a turn calls for', () => {
  const quiet = (db: AppDatabase) => worldAreasForTurn(db, '"Fine."', 'She nods and pours the tea.');

  test('a quiet exchange asks for no letters, safehouse, weather or abilities', () => {
    const areas = quiet(seed());
    for (const area of ['letters', 'safehouse', 'weather', 'abilities', 'enemies'] as const) {
      expect(areas).not.toContain(area);
    }
  });

  test('the words of the turn reach an area', () => {
    const db = seed();
    expect(worldAreasForTurn(db, '*You wait.*', 'A hawk lands on your arm with a scroll.')).toContain('letters');
    expect(worldAreasForTurn(db, '*You rent a room.*', 'The innkeeper hands you a key.')).toContain('safehouse');
    expect(worldAreasForTurn(db, '*You look up.*', 'Snow begins to fall.')).toContain('weather');
    expect(worldAreasForTurn(db, '*You focus.*', 'A third tomoe spins in your Sharingan.')).toContain('abilities');
    expect(worldAreasForTurn(db, '*You draw.*', 'The man in the bingo book grins.')).toContain('enemies');
    expect(worldAreasForTurn(db, '"How is she?"', 'She was promoted to jonin last spring.')).toContain('lives');
  });

  test('the Core prompt keeps out World rules; the World prompt has only what it was asked', () => {
    const prompt = buildExtractionPrompt(seed(), '*You look up.*', 'Snow begins to fall.');
    const core = prompt.messages.map((message) => message.content).join('\n');
    expect(core).toContain('TIME:');
    expect(core).not.toContain('ABILITIES: natures_gained');
    expect(core).not.toContain('LETTERS: letters_sent');
    expect(core).not.toContain('weather: a few words');
    expect(core).not.toContain('WEATHER NOW');
    const world = prompt.world!.messages.map((message) => message.content).join('\n');
    expect(prompt.world!.areas).toContain('weather');
    expect(world).toContain('THIS CALL:');
    expect(world).toContain('weather: a few words');
    expect(world).not.toContain('LETTERS: letters_sent');
    expect(world).not.toContain('SAFEHOUSES');
    // Both share the roster in the cached front.
    expect(prompt.world!.messages[0].content).toContain('KNOWN CHARACTERS');
    expect(prompt.messages[0].content).toContain('KNOWN CHARACTERS');
  });
});

describe('running both calls', () => {
  const snowy = { userMessage: '*You look up.*', assistantMessage: 'Snow begins to fall over the forest.' };

  test('Core and World are asked side by side and their fields merge; each only sets its own', async () => {
    let worldStarted = false;
    let coreSawWorld = false;
    const seen = mockTracker(
      () => {
        coreSawWorld = worldStarted;
        return reply(JSON.stringify({ location: 'Old shrine', weather: 'Hot sun', letters_sent: [{ to: 'x', gist: null, text: 'Hi', carrier: null, coded: null }] }));
      },
      () => {
        worldStarted = true;
        return reply(JSON.stringify({ weather: 'Light snow', location: 'Wrong place' }));
      }
    );
    const diff = await extractTurnDiff({ apiKey: 'k', db: seed(), ...snowy });
    expect(seen.core).toHaveLength(1);
    expect(seen.world).toHaveLength(1);
    expect(coreSawWorld || worldStarted).toBe(true);
    expect(diff?.state?.location).toBe('Old shrine');
    expect(diff?.weather).toBe('Light snow');
    // Core may not write World fields, and World may not write Core's.
    expect(diff?.lettersSent ?? []).toEqual([]);
  });

  test('a World failure loses only its areas; Core still applies and Debug says so', async () => {
    setTransientRetryDelaysForTests([0]);
    clearDebugLog();
    const temp = beginDebugTurn({ slotId: 'slot_test', action: 'x', narratorModel: 'm', prompt: [], promptEstimate: 0 });
    linkDebugTurn(temp, 'turn-1');
    mockTracker(
      () => reply(JSON.stringify({ location: 'Old shrine' })),
      () => new Response('nope', { status: 500 })
    );
    const diff = await extractTurnDiff({ apiKey: 'k', db: seed(), ...snowy, debugTurnId: 'turn-1' });
    expect(diff?.state?.location).toBe('Old shrine');
    expect(diff?.weather).toBeUndefined();
    const state = getDebugLog().turns[0].state;
    expect(state?.note).toMatch(/World \(.*weather.*\) was not read/);
    expect(state?.note).toContain('Core applied without it');
    expect(state?.worldAreas).toContain('weather');
  });

  test('an unreadable Core reply still falls back to the prose, World or not', async () => {
    mockTracker(
      () => reply('not json'),
      () => reply(JSON.stringify({ weather: 'Light snow' }))
    );
    expect(await extractTurnDiff({ apiKey: 'k', db: seed(), ...snowy })).toBeNull();
  });

  test('a turn that touches no World area makes one call', async () => {
    const seen = mockTracker(
      () => reply(JSON.stringify({ mood: 'calm' })),
      () => reply('{}')
    );
    const db = seed();
    const turn = { userMessage: '"Fine."', assistantMessage: 'She nods and pours the tea.' };
    const expected = worldAreasForTurn(db, turn.userMessage, turn.assistantMessage).length > 0 ? 1 : 0;
    await extractTurnDiff({ apiKey: 'k', db, ...turn });
    expect(seen.core).toHaveLength(1);
    expect(seen.world).toHaveLength(expected);
  });
});

describe('tracker stats read both replies', () => {
  test('a World field filled in worldRaw counts as filled', () => {
    clearDebugLog();
    const temp = beginDebugTurn({ slotId: 'a', action: 'x', narratorModel: 'm', prompt: [], promptEstimate: 0 });
    linkDebugTurn(temp, 't1');
    recordDebugState('t1', { status: 'applied', raw: '{"location":"Leaf"}', worldRaw: '{"weather":"Rain"}', worldAreas: ['weather'] });
    const stats = trackerFieldStats(getDebugLog().turns);
    expect(stats.fields.find((field) => field.field === 'weather')?.filled).toBe(1);
    expect(stats.fields.find((field) => field.field === 'location')?.filled).toBe(1);
  });
});
