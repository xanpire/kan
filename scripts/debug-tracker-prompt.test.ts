// Audit 11e.3: the Debug panel keeps the tracker's prompt (Core and World)
// for the newest turns, and a switch leaves the VARIETY phrase line out of
// the narrator's prompt for the open story.

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
import { appendStoryMessage } from '../lib/rpg/log';
import { beginDebugTurn, clearDebugLog, getDebugLog, linkDebugTurn, recordDebugState, trackerPromptForCopy } from '../lib/rpg/debug';
import { buildExtractionPrompt, buildNarrationPrompt, trackerPromptText } from '../lib/rpg/prompt';
import { extractTurnDiff, setTransientRetryDelaysForTests } from '../lib/rpg/services';
import { formatVarietyBlock } from '../lib/rpg/variety';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_test', 'Test story'));
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  setTransientRetryDelaysForTests([1000, 3000]);
});

function reply(content: string) {
  return new Response(
    JSON.stringify({ id: 'gen', choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0 } }),
    { status: 200 }
  );
}

const snowy = { userMessage: '*You look up.*', assistantMessage: 'Snow begins to fall over the forest.' };

describe('the tracker prompt in Debug', () => {
  test('the state step keeps its Core and World prompts on the turn, exactly as sent', async () => {
    setTransientRetryDelaysForTests([0]);
    clearDebugLog();
    const temp = beginDebugTurn({ slotId: 'slot_test', action: 'x', narratorModel: 'm', prompt: [], promptEstimate: 0 });
    linkDebugTurn(temp, 'turn-1');
    globalThis.fetch = (async () => reply(JSON.stringify({ location: 'Old shrine', weather: 'Light snow' }))) as unknown as typeof fetch;

    const db = seed();
    await extractTurnDiff({ apiKey: 'k', db, ...snowy, debugTurnId: 'turn-1' });
    const kept = getDebugLog().turns[0].state?.prompt;
    const built = buildExtractionPrompt(db, snowy.userMessage, snowy.assistantMessage);

    expect(kept).toBeTruthy();
    expect(kept!.core.map((message) => message.content)).toEqual(built.messages.map((message) => message.content));
    // The snowfall touches the weather, so a World call was made and kept.
    expect(built.world).toBeTruthy();
    expect(kept!.world!.map((message) => message.content)).toEqual(built.world!.messages.map((message) => message.content));

    // Copy carries every message of both calls.
    const copied = trackerPromptForCopy(kept!);
    for (const part of trackerPromptText(built).split('\n\n').slice(0, 20)) expect(copied).toContain(part);
    expect(copied).toContain('--- World call ---');
    // The reply that came back is still recorded beside it.
    expect(getDebugLog().turns[0].state?.raw).toContain('Old shrine');
  });

  test('only the newest 5 turns keep the tracker prompt, as with the narrator prompt', () => {
    clearDebugLog();
    for (let i = 0; i < 7; i += 1) {
      const temp = beginDebugTurn({ slotId: 's', action: `a${i}`, narratorModel: 'm', prompt: [{ role: 'user', content: 'hi' }], promptEstimate: 1 });
      linkDebugTurn(temp, `t${i}`);
      recordDebugState(`t${i}`, { status: 'applied', prompt: { core: [{ role: 'system', content: `core ${i}` }], world: null } });
    }
    const turns = getDebugLog().turns;
    expect(turns).toHaveLength(7);
    expect(turns.slice(0, 5).every((turn) => turn.state?.prompt && turn.prompt)).toBe(true);
    expect(turns.slice(5).every((turn) => !turn.state?.prompt && !turn.prompt)).toBe(true);
    // Trimming the prompt keeps the rest of the step.
    expect(turns[6].state?.status).toBe('applied');
  });
});

describe('the repeated-phrase switch', () => {
  /** Three replies that all reach for the same images and all end on a question. */
  function repetitive(): AppDatabase {
    let db = seed();
    for (let i = 0; i < 4; i += 1) {
      db = appendStoryMessage(db, 'user', 'I keep going.', null, 0, 0);
      db = appendStoryMessage(db, 'assistant', `The smell of iron hangs over the cold river stones. Turn ${i}. What do you do?`, null, 0, 0);
    }
    return db;
  }

  test('on (the default): the narrator is told the repeated phrases', () => {
    const block = formatVarietyBlock(repetitive());
    expect(block).toContain('keep coming back');
    expect(block).toContain('"smell of iron"');
  });

  test('off for this story: the phrase line goes, the question line stays, and the prompt follows', () => {
    const db = repetitive();
    const off = { ...db, settings: { ...db.settings, varietyPhrases: false } };
    const block = formatVarietyBlock(off);
    expect(block).not.toContain('keep coming back');
    expect(block).not.toContain('smell of iron');
    expect(block).toContain('ended on a question');

    const text = buildNarrationPrompt(off, '*You wait.*').messages.map((message) => message.content).join('\n');
    expect(text).not.toContain('"smell of iron"');
    expect(text).toContain('VARIETY');
  });
});
