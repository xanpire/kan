/**
 * Replay tests from real play (audit 11d): every fixture in scripts/fixtures/
 * replayed through applyStateStep breaks no rule. Plus a round trip of the
 * export on a played save, and the clock fuzz test over real prose.
 */
import { describe, expect, mock, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

import { paceCapSeconds, SECONDS_PER_DAY } from '../lib/rpg/calendar';
import { normalizeDatabase } from '../lib/rpg/db';
import type { DebugTurn } from '../lib/rpg/debug';
import { resolveCharacterRefs } from '../lib/rpg/entities';
import { appendStoryMessage, pushSnapshot } from '../lib/rpg/log';
import { applyStateStep } from '../lib/rpg/memoryJobs';
import { resolveTurnClock } from '../lib/rpg/pacing';
import { buildReplayFixture, replayFixture, type ReplayFixture } from '../lib/rpg/replay';
import { seedDatabase } from '../lib/rpg/seed';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import { detectNarrationTime } from '../lib/rpg/timeparse';
import type { AppDatabase, ScenePace } from '../lib/rpg/types';

const FIXTURES = join(import.meta.dir, 'fixtures');
const fixtureFiles = readdirSync(FIXTURES).filter((file) => file.endsWith('.json'));
const loadFixture = (file: string) => JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as ReplayFixture;

describe('replay fixtures from real play', () => {
  test('the fixtures folder is readable', () => {
    expect(Array.isArray(fixtureFiles)).toBe(true);
  });

  for (const file of fixtureFiles) {
    test(`${file} breaks no rule`, () => {
      const result = replayFixture(loadFixture(file), normalizeDatabase);
      const broken = result.perTurn.flatMap((violations, index) =>
        violations.filter((item) => item.severity === 'error').map((item) => `turn ${index + 1}: ${item.text}`)
      );
      expect(broken).toEqual([]);
    });
  }
});

/** Plays a turn the way the app saves it: snapshot, messages, state step, debug record. */
function playLogged(db: AppDatabase, debug: DebugTurn[], input: string, narration: string, state: Record<string, unknown>) {
  let next = pushSnapshot(db);
  next = appendStoryMessage(next, 'user', input, null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  const diff = resolveCharacterRefs(next, convertStateBlock(state).diff);
  const result = applyStateStep(next, diff, { turnLogId, userMessage: input, narration }, new Set());
  debug.unshift({
    id: turnLogId,
    slotId: db.meta.slotId,
    action: input,
    startedAt: 0,
    narratorModel: 'test',
    prompt: null,
    promptEstimate: 0,
    calls: [],
    state: { status: 'applied', raw: JSON.stringify(state), at: 0 },
  });
  return result.db;
}

describe('Export this session as a test', () => {
  test('a played save round-trips through a fixture', () => {
    let db = normalizeDatabase(seedDatabase('slot_replay', 'Replay'));
    const debug: DebugTurn[] = [];
    db = playLogged(db, debug, '*I wait under the branches.*', 'Rain drums on the leaves above you. Nobody comes.', {
      characters_present: [],
      time: { elapsed: '10 minutes' },
      scene_pace: 'downtime',
    });
    db = playLogged(db, debug, '"Itachi?"', 'Itachi steps out of the rain. "You waited," he says.', {
      characters_present: ['itachi-uchiha'],
      scene_pace: 'conversation',
      beat: 'exchange',
      beat_with: ['itachi-uchiha'],
    });

    const built = buildReplayFixture(db, debug, { count: 2, app: 'test' });
    if ('error' in built) throw new Error(built.error);
    const fixture = JSON.parse(JSON.stringify(built.fixture)) as ReplayFixture;
    expect(fixture.turns.map((turn) => turn.input)).toEqual(['*I wait under the branches.*', '"Itachi?"']);
    expect(fixture.start.rawLog.some((entry) => entry.content.includes('Nobody comes'))).toBe(false);

    const replayed = replayFixture(fixture, normalizeDatabase);
    expect(replayed.perTurn.flat().filter((item) => item.severity === 'error')).toEqual([]);
    expect(replayed.db.state.sceneCast).toEqual(db.state.sceneCast);
  });

  test('without an undo snapshot that far back it says so', () => {
    const db = normalizeDatabase(seedDatabase('slot_replay2', 'Replay'));
    const next = appendStoryMessage(appendStoryMessage(db, 'user', 'x', null, 0, 0), 'assistant', 'y', null, 0, 0);
    const built = buildReplayFixture(next, [], { count: 1 });
    expect('error' in built).toBe(true);
  });
});

/**
 * Clock fuzz (audit 11d): every sentence of real prose, alone, never moves
 * the clock past its pace cap. The prose: every fixture's narration, plus the
 * narrations the test files already hold (lines written as the narrator does).
 */
function corpus(): string[] {
  const texts: string[] = [];
  for (const file of fixtureFiles) for (const turn of loadFixture(file).turns) texts.push(turn.narration);
  for (const file of readdirSync(import.meta.dir).filter((name) => name.endsWith('.test.ts'))) {
    const source = readFileSync(join(import.meta.dir, file), 'utf8');
    const lead = '(?:You|Your|The|By|At|Two|Three|An?|It|He|She|They|Rain|Dawn|Night|Morning|When|After|Hours|Days|Later|For|In|On|Itachi|Kisame|Kakuzu)\\b';
    for (const quote of ["'", '`']) {
      const pattern = new RegExp(`${quote}(${lead}[^${quote}\\n]{30,})${quote}`, 'g');
      for (const match of source.matchAll(pattern)) texts.push(match[1]);
    }
  }
  const sentences = texts.flatMap((text) => text.split(/(?<=[.!?])\s+/)).map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 12);
  return [...new Set(sentences)];
}

describe('clock fuzz over real prose', () => {
  const sentences = corpus();

  test('there is prose to fuzz', () => {
    expect(sentences.length).toBeGreaterThan(200);
  });

  test('no sentence moves the clock past its pace cap', () => {
    const start = { year: 13, month: 10, day: 3, hour: 21, minute: 30, second: 0 };
    const paces: ScenePace[] = ['combat', 'conversation', 'travel', 'downtime'];
    const over: string[] = [];

    for (const sentence of sentences) {
      const detected = detectNarrationTime(sentence, start);
      for (const pace of paces) {
        const { elapsedSeconds } = resolveTurnClock({ reportedSeconds: 0, detected, pace, sceneEnded: false, current: start });
        if (elapsedSeconds > paceCapSeconds(pace, false) + SECONDS_PER_DAY) over.push(`${pace}: ${sentence}`);
      }
    }

    expect(over).toEqual([]);
  });
});
