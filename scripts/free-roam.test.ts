// Audit 8: after the last canon milestone the story does not end; play goes
// on in the same world with no more canon beats, and nothing from later eras.
// Also: Kan is never killed, for now.

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
import { appendStoryMessage } from '../lib/rpg/log';
import { applyStateStep } from '../lib/rpg/memoryJobs';
import { buildExtractionPrompt, buildNarrationPrompt, trackerPromptText } from '../lib/rpg/prompt';
import { seedDatabase } from '../lib/rpg/seed';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import {
  activeCanonMilestones,
  advanceCanon,
  upcomingCanonMilestones,
  upcomingWorldMilestones,
  worldClock,
} from '../lib/rpg/canon';
import { CANON_MILESTONES } from '../lib/rpg/canonData';
import { newsOffer } from '../lib/rpg/newsDelivery';
import { KAN_FATE_RULE } from '../lib/rpg/kanFate';
import { NARRATION_SYSTEM } from '../lib/rpg/prompt';
import { isDeceased } from '../lib/rpg/deaths';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_roam', 'Roam'));

function play(db: AppDatabase, narration: string, state: Record<string, unknown> | null) {
  let next = appendStoryMessage(db, 'user', 'I keep going.', null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  const reply = state ? convertStateBlock(state).diff : null;
  const diff = reply ? resolveCharacterRefs(next, reply) : null;
  return applyStateStep(next, diff, { turnLogId, userMessage: 'I keep going.', narration }, new Set());
}

/** A save past the very last milestone, with every beat settled. */
function afterTheEnd(): AppDatabase {
  const db = seed();
  const lastYear = Math.max(...CANON_MILESTONES.map((milestone) => milestone.to?.year ?? milestone.from.year));
  const later: AppDatabase = {
    ...db,
    state: {
      ...db.state,
      inStoryDate: { year: lastYear + 2, month: 4, day: 3, hour: 12, minute: 0 },
      canonProgress: {
        ...(db.state.canonProgress ?? { version: 0, active: [], engaged: [] }),
        completed: CANON_MILESTONES.map((milestone) => milestone.id),
        active: [],
      },
    },
  } as AppDatabase;
  return advanceCanon(later);
}

describe('free roam after the story', () => {
  test('the last milestone is the Seventh Hokage era, and nothing is from Boruto', () => {
    const titles = CANON_MILESTONES.map((milestone) => `${milestone.title} ${milestone.description}`).join('\n');
    expect(titles).toContain('Seventh Hokage');
    // Boruto's birth is in the epilogue years before the Seventh Hokage; nothing after it.
    expect(titles).not.toMatch(/kawaki|\bkara\b|isshiki|momoshiki|chunin exams of boruto/i);
  });

  test('every canon-facing block copes with an empty timeline', () => {
    const db = afterTheEnd();
    expect(activeCanonMilestones(db)).toEqual([]);
    expect(upcomingCanonMilestones(db, 3)).toEqual([]);
    expect(upcomingWorldMilestones(db, 10)).toEqual([]);
    expect(() => newsOffer(db)).not.toThrow();
    expect(() => worldClock(db)).not.toThrow();

    const narrator = buildNarrationPrompt(db, '*You walk on.*').messages.map((m) => m.content).join('\n');
    expect(narrator).toContain('CANON TIMELINE');
    expect(narrator).toContain('The canon story is over');
    expect(narrator).not.toContain('PERSONAL STORY BEAT —');
    expect(narrator).not.toContain("RUMORS OF WHAT'S COMING (planned");
    expect(narrator).not.toContain('ACTIVE STORY BEAT:');

    const tracker = trackerPromptText(buildExtractionPrompt(db, '*You walk on.*', 'The road is quiet.'));
    expect(tracker).not.toContain('(active story beat)');
  });

  test('a turn after the final milestone plays and the clock still moves', () => {
    const db = afterTheEnd();
    const before = JSON.stringify(db.state.inStoryDate);
    const result = play(db, 'You walk the market road for an hour, then stop at a tea stall.', {
      time: { elapsed: 1, unit: 'hours', clock_time: null },
      scene_pace: 'travel',
      location: 'Market road',
    });
    expect(JSON.stringify(result.db.state.inStoryDate)).not.toBe(before);
    expect(result.db.state.location).toBe('Market road');
    expect(activeCanonMilestones(result.db)).toEqual([]);
  });
});

describe('Kan is never killed (for now)', () => {
  test('the narrator is told, in one place', () => {
    expect(KAN_FATE_RULE).toContain('he is never killed');
    expect(NARRATION_SYSTEM).toContain(KAN_FATE_RULE);
    expect(NARRATION_SYSTEM.split('he is never killed').length).toBe(2);
  });

  test('a tracker death for Kan never lands', () => {
    // By ref, the roster has no "kan" to kill.
    const byRef = play(seed(), 'The blade goes in. Everything goes dark.', { deaths: [{ character_id: 'kan', cause: 'stabbed' }] });
    expect(isDeceased(byRef.db.entities.find((entity) => entity.name === 'Kan')!)).toBe(false);

    // By name, straight into the step: refused, and Debug says so.
    let next = appendStoryMessage(seed(), 'user', 'I fight.', null, 0, 0);
    next = appendStoryMessage(next, 'assistant', 'The blade goes in.', null, 0, 0);
    const turnLogId = next.rawLog[next.rawLog.length - 1].id;
    const result = applyStateStep(next, { deaths: [{ name: 'Kan', cause: 'stabbed' }] }, { turnLogId, userMessage: 'I fight.', narration: 'The blade goes in.' }, new Set());
    expect(isDeceased(result.db.entities.find((entity) => entity.name === 'Kan')!)).toBe(false);
    expect(result.events.some((event) => event.kind === 'refused' && event.text.includes('Kan'))).toBe(true);
  });
});
