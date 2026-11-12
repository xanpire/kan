import { afterEach, describe, expect, mock, test } from 'bun:test';

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
import { writeImageAction } from '../lib/rpg/image';
import { modelSeesImages } from '../lib/rpg/modelCheck';
import type { AppDatabase, RawLogEntry } from '../lib/rpg/types';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function withReply(db: AppDatabase): AppDatabase {
  const entry: RawLogEntry = {
    id: 'log_x', turn: 1, kind: 'story', role: 'assistant', content: 'Itachi turns away.', model: 'm',
    promptTokens: 0, completionTokens: 0, chapter: 1, scene: db.state.scene,
    inStoryDate: db.state.inStoryDate, createdAt: Date.now(),
  };
  return { ...db, rawLog: [...db.rawLog, entry] };
}

describe('the image helper calls (audit 11c)', () => {
  test('the director asks for low reasoning and has room to answer', async () => {
    const bodies: Record<string, unknown>[] = [];
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'ACTION: Itachi turns away from Kan.\nSHOT: wide\nCAPTION: Itachi turns away.' } }], usage: {} }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const db = withReply(normalizeDatabase(seedDatabase('slot_h', 'H')));
    const result = await writeImageAction('key', db);
    expect(result?.action).toContain('Itachi turns away');
    expect(bodies[0].max_tokens).toBe(1500);
    expect(bodies[0].reasoning).toEqual({ exclude: true, effort: 'low' });
  });

  test('an empty answer is reported, then the cheap model is tried', async () => {
    const models: string[] = [];
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      models.push(body.model);
      const content = models.length === 1 ? '' : 'ACTION: Kan waits.';
      return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: {} }), { status: 200 });
    }) as typeof fetch;

    const db = withReply(normalizeDatabase(seedDatabase('slot_h2', 'H')));
    const failures: string[] = [];
    const result = await writeImageAction('key', db, undefined, {}, (model, reason) => failures.push(`${model}: ${reason}`));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('empty answer');
    expect(result?.model).toBe(models[1]);
  });

  test('the image check only runs on a model that can see images', () => {
    const lists = {
      text: new Set(['google/gemini-x', 'deepseek/text-only']),
      image: new Set<string>(),
      seesImages: new Set(['google/gemini-x']),
    };
    expect(modelSeesImages(lists, 'google/gemini-x')).toBe(true);
    expect(modelSeesImages(lists, 'deepseek/text-only')).toBe(false);
    // Unknown: not on the list, or the list failed to load.
    expect(modelSeesImages(lists, 'someone/new-model')).toBe(true);
    expect(modelSeesImages({ text: new Set(), image: new Set() }, 'deepseek/text-only')).toBe(true);
  });
});
