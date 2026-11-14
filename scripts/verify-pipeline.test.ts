import { describe, expect, test, mock } from 'bun:test';

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

import { buildIndices, normalizeDatabase } from '../lib/rpg/db';
import { seedDatabase } from '../lib/rpg/seed';
import { advanceSeconds, dateSortValue, daysBetween, daysInMonth, formatClock, paceCapSeconds, timeOfDayOf } from '../lib/rpg/calendar';
import { applyEntityDiff, entityGroup, entityHints, mergeEntityPair, resolveCharacterRefs, resolveEntity } from '../lib/rpg/entities';
import { learnFromCanon } from '../lib/rpg/names';
import { appendStoryMessage, cloneDatabase } from '../lib/rpg/log';
import { unsummarizedStory } from '../lib/rpg/memoryJobs';
import { trimToSentence } from '../lib/rpg/util';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import { buildExtractionPrompt, buildNarrationPrompt, splitNarrationAndDiff, streamingPreview, stripNarrationJson, trackerPromptText } from '../lib/rpg/prompt';
import { TURN_STATE_SCHEMA } from '../lib/rpg/stateSchema';
import { mentionsName } from '../lib/rpg/characterRefs';
import { NARRATION_SYSTEM } from '../lib/rpg/prompt';
import { buildSceneImagePrompt, collectRecentSceneImages } from '../lib/rpg/image';
import { planReferences } from '../lib/rpg/referencePlan';
import { buildImageRequestBody, type ImageModelCaps } from '../lib/openrouter';
import { CANON_MILESTONES, CANON_VERSION } from '../lib/rpg/canonData';
import { activeCanonMilestones, upcomingCanonMilestones, advanceCanon, applyCanonMarks, markNewsHeard, milestoneBearers, milestoneChannel, milestoneKnowledge, milestoneLocation, milestoneRegion, unheardCanonNews, worldClock, NEWS_PER_TURN } from '../lib/rpg/canon';
import { RELATIONSHIP_STAGES, eraNoteFor, loreProfileFor, normalizeRelationship } from '../lib/rpg/romance';
import { applyCanonEndgames, endgameNote } from '../lib/rpg/canonEndgame';
import { CANON_CAST } from '../lib/rpg/canonCast';
import { slug } from '../lib/rpg/id';
import { PLACE_NAME_RULE, hasJapanesePlaceName, localizePlaceNames } from '../lib/rpg/glossary';
import { applyParsedTime, detectNarrationTime } from '../lib/rpg/timeparse';
import { inferScenePace, resolveElapsedSeconds, resolveTurnClock } from '../lib/rpg/pacing';
import { classifyLocation, encounterRisk, formatEncounterConditions } from '../lib/rpg/encounters';
import { applyTurnDiff } from '../lib/rpg/services';
import { isDeceased, kanKnowsDeath, markDeathsByName, markDeceased } from '../lib/rpg/deaths';
import { CATCH_UP_QUIET_DAYS, couldKnow, livingBearers, newsAllowance, newsOffer } from '../lib/rpg/newsDelivery';
import { deliverLetters, letterOffer, receiveLetters, sendLetters, LETTER_BOND_GAIN, LETTER_MAX_DAYS } from '../lib/rpg/letters';
import { newsUrgency } from '../lib/rpg/canon';
import { entityAge, shiftDate } from '../lib/rpg/calendar';
import type { AppDatabase, TurnDiff } from '../lib/rpg/types';

function loadSave(_path?: string): AppDatabase {
  return normalizeDatabase(seedDatabase('slot_test', 'Test story'));
}


/** Every canon role played out, so canon no longer protects anyone (canonRoles.ts). */
function canonDone<T extends { state: { canonProgress?: unknown } }>(db: T): T {
  const ids = CANON_MILESTONES.map((milestone) => milestone.id);
  const progress = (db.state.canonProgress ?? {}) as Record<string, unknown>;
  return { ...db, state: { ...db.state, canonProgress: { version: 3, active: [], engaged: [], ...progress, completed: ids } } } as T;
}

describe('seed save compatibility', () => {
  {
    test('loads and normalizes the seeded story', () => {
      const db = loadSave();

      expect(db.state).toBeDefined();
      expect(db.state.player).toBeDefined();
      expect(Array.isArray(db.rawLog)).toBe(true);
      expect(Array.isArray(db.bonds)).toBe(true);
      expect(Array.isArray(db.jutsuRecords)).toBe(true);

      for (const entity of db.entities) {
        expect(Array.isArray(entity.aliases)).toBe(true);
      }

      for (const fact of db.facts) {
        expect(Array.isArray(fact.whoKnows)).toBe(true);
      }
    });

    test('seeded story has no JSON pollution in assistant messages', () => {
      const db = loadSave();

      for (const entry of db.rawLog) {
        if (entry.kind === 'story' && entry.role === 'assistant' && entry.content) {
          const { narration } = splitNarrationAndDiff(entry.content);
          expect(narration).toBe(entry.content);
          expect(entry.content.includes('```')).toBe(false);
        }
      }
    });
  }
});

describe('inline diff wiring', () => {
  test('jutsu_used creates jutsu records', () => {
    const db = loadSave();
    const { diff } = convertStateBlock({
      state: { location: 'Training field' },
      jutsu_used: [
        {
          name: 'Water Release: Water Dragon',
          user: 'Kan',
          chakra_nature: 'Water',
          effect: 'A large sphere of fire.',
          visual: 'A cone of roaring flames.',
        },
      ],
    });

    expect(diff).not.toBeNull();
    expect(diff?.jutsuUsed?.length).toBe(1);

    const next = applyTurnDiff(db, diff);
    const record = next.jutsuRecords.find(
      (item) => item.name === 'Water Release: Water Dragon' && item.user === 'Kan'
    );

    expect(record).toBeDefined();
    expect(record?.chakraNature).toBe('Water');
    expect(record?.timesUsed).toBe(1);
  });

  test('bonds accumulate and clamp, repeated threads dedupe', () => {
    let db = loadSave();
    const threadsBefore = db.threads.length;

    db = applyTurnDiff(db, {
      bonds: [{ character: 'Itachi Uchiha', affinityDelta: 3, status: 'Ally', note: 'Trained together' }],
      facts: [{ action: 'add', type: 'event', text: 'Kan trained with Itachi at dawn.', subject: 'Kan' }],
      threads: [{ action: 'update', title: 'Find a reason to keep going after the massacre', description: 'Find a reason to keep going after the massacre', type: 'goal' }],
    });

    db = applyTurnDiff(db, {
      bonds: [{ character: 'Itachi Uchiha', affinityDelta: 2 }],
      threads: [{ action: 'update', title: 'Find a reason to keep going', description: 'Find a reason to keep going', type: 'goal' }],
    });

    const bond = db.bonds.find((item) => item.characterName === 'Itachi Uchiha');
    expect(bond?.affinity).toBeGreaterThanOrEqual(3);
    expect(db.threads.filter((item) => item.status === 'open').length).toBeLessThanOrEqual(
      threadsBefore + 1
    );
  });

  test('state strings and lists stay capped', () => {
    let db = loadSave();

    for (let turn = 0; turn < 60; turn += 1) {
      const diff: TurnDiff = {
        state: {
          worldDescription: 'A very long world description. '.repeat(30),
          canonPoint: 'A very long canon point. '.repeat(30),
          location: `Location variant ${turn}`,
          inventoryAdded: [`item ${turn}`],
          jutsuAdded: [`jutsu ${turn}`],
        },
        facts: [{ action: 'add', type: 'event', text: `Fact number ${turn} happened.`, subject: 'Kan' }],
      };

      db = applyTurnDiff(db, diff);
    }

    expect(db.state.inventory.length).toBeLessThanOrEqual(40);
    expect(db.state.jutsu.length).toBeLessThanOrEqual(12);
    expect(db.state.worldDescription.length).toBeLessThanOrEqual(220);
    expect(db.state.canonPoint.length).toBeLessThanOrEqual(220);
    expect(db.state.location.length).toBeLessThanOrEqual(100);
  });
});

describe('prompt token stability', () => {
  test('tokens plateau as the story grows', () => {
    let db = loadSave();
    const story = () => db.rawLog.filter((message) => message.kind === 'story');

    const tokensAt: Array<[number, number]> = [];
    const totalTurns = 60;

    for (let turn = 0; turn < totalTurns; turn += 1) {
      const userText = `"We should keep moving." *Kan adjusts his pack and scans the treeline.* (turn ${turn})`;
      const narrationBody = [
        `The wind carries ash from the valley as you push through the undergrowth. Itachi walks half a step ahead, his crimson eyes tracking movement you cannot see. Somewhere behind, the hounds have lost the scent — for now.`,
        `You cross a stream, cold water biting through worn tabi, and climb the far bank into deeper shadow. Hana's voice still echoes somewhere in your memory, sharp with accusation.`,
        `Itachi stops. He tilts his head, listening. A crow bursts from the canopy above and wheels east, against the wind. Turn ${turn}, and the road grows no shorter.`,
      ].join(' ');
      const narration =
        turn % 3 === 0
          ? `${narrationBody}\n\n\`\`\`json\n{"state":{"location":"High ridge above the stream"},"facts":[{"entity":"Kan","fact":"Crossed the stream at dawn on turn ${turn}."}]}\n\`\`\``
          : narrationBody;

      db = appendStoryMessage(cloneDatabase(db), 'user', userText, 'm', 0, 0);
      const { narration: clean, inlineDiff } = splitNarrationAndDiff(narration);
      db = appendStoryMessage(db, 'assistant', clean, 'm', 3000, 400);

      const { diff } = convertStateBlock(inlineDiff);
      const fallback: TurnDiff = diff ?? {
        facts: [{ action: 'add', type: 'event', text: `Quiet turn ${turn}: nothing of note.`, subject: 'Kan' }],
      };

      if (turn % 5 === 0) {
        fallback.threads = [
          { action: 'update', title: `Open question raised on turn ${turn}`, description: `Open question raised on turn ${turn}`, type: 'mystery' },
        ];
      }

      if (turn % 6 === 0) {
        fallback.entities = [
          { name: `Scout ${turn}`, age: 20 + (turn % 10), role: 'Hunter-nin', personality: 'Cold, precise', speechStyle: 'Clipped', mood: 'Wary', appearance: 'Masked, grey cloak' },
        ];
      }

      if (turn % 7 === 0) {
        fallback.jutsuUsed = [
          { name: `Wind Scythe ${turn}`, user: 'Kan', chakraNature: 'Wind', effect: 'Slashes of compressed air.', visual: 'Curved white arcs.' },
        ];
      }

      db = applyTurnDiff(db, fallback);

      if (turn % 10 === 0 || turn === totalTurns - 1) {
        const prompt = buildNarrationPrompt(db, userText);
        tokensAt.push([turn, prompt.estimatedTokens]);
      }
    }

    // Turn 0 has an empty story; measure from turn 10, once recent messages fill.
    const first = tokensAt[1][1];
    const last = tokensAt[tokensAt.length - 1][1];
    const growth = (last - first) / first;

    console.log(
      'token samples:',
      tokensAt.map(([turn, tokens]) => `turn ${turn}: ${tokens}`).join(' | ')
    );

    expect(growth).toBeLessThan(0.35);
  });
});
describe('narration JSON stripping edge cases', () => {
  const cases: Array<[string, string, string | null]> = [
    ['complete fenced block', 'Story text.\n\n\`\`\`json\n{"state":{"location":"X"}}\n\`\`\`', 'state'],
    ['truncated fenced block', 'Story text.\n\n\`\`\`json\n{"state":{"location":"X"},"facts":[', null],
    ['unparseable fenced block', 'Story.\n\n\`\`\`json\n{broken json "state": [', null],
    ['unfenced complete JSON', 'Story. {"state":{"location":"Y"}}', 'state'],
    ['unfenced truncated JSON', 'Story. {"state":{"location":"Y", "canon_point":', null],
    ['trailing label', 'Story.\n\nState update:', null],
    ['no JSON at all', 'Just a story paragraph.', null],
  ];

  for (const [name, raw, diffKey] of cases) {
    test(name, () => {
      const { narration, inlineDiff } = splitNarrationAndDiff(raw);

      expect(narration.includes('\u0060\u0060\u0060')).toBe(false);
      expect(narration.includes('"state"')).toBe(false);
      expect(narration.includes('State update')).toBe(false);
      expect(stripNarrationJson(raw)).toBe(narration);

      if (diffKey) {
        expect(inlineDiff).not.toBeNull();
        expect(Object.keys(inlineDiff ?? {})).toContain(diffKey);
      }
    });
  }
});

describe('image reference pipeline', () => {
  test('prompt numbers references dynamically and carries scene data', () => {
    const db = loadSave();
    const plan = planReferences(
      [
        { kind: 'face', uri: 'data:face' },
        { kind: 'outfit', uri: 'data:outfit' },
        { kind: 'previous', uri: 'data:image/jpeg;base64,AAA' },
        { kind: 'previous', uri: 'data:image/jpeg;base64,BBB' },
        { kind: 'alternate', uri: 'data:alt' },
      ],
      5
    );
    const prompt = buildSceneImagePrompt(db, plan.references, 'Kan waits.');

    expect(prompt).toContain("Reference image 1: Kan's face sheet");
    expect(prompt).toContain('Reference image 3: a previous scene image');
    expect(prompt).toContain('Reference image 5: the alternate outfit');
    expect(prompt).toContain(db.state.location.slice(0, 20));
    expect(prompt).toContain('no text');
    expect(prompt).toContain('face sheet');
    expect(prompt).toContain('NO person');
  });

  test('recent images collect from assistant messages in order', () => {
    let db = loadSave();

    db = appendStoryMessage(db, 'assistant', 'First scene.', 'm', 0, 0);
    db = appendStoryMessage(db, 'assistant', 'Second scene.', 'm', 0, 0);
    db = appendStoryMessage(db, 'assistant', 'Third scene.', 'm', 0, 0);
    db = {
      ...db,
      rawLog: db.rawLog.map((entry, index) =>
        entry.kind === 'story' && entry.role === 'assistant'
          ? { ...entry, image: `data:image/jpeg;base64,IMG${index}` }
          : entry
      ),
    };

    const recent = collectRecentSceneImages(db);
    // At most one earlier scene goes along, for rendering style only.
    expect(recent.length).toBe(1);
  });
});

describe('time progression via inline diffs', () => {
  test('days_passed and time_of_day advance the date', () => {
    let db = loadSave();
    const before = db.state.inStoryDate;

    const { diff } = convertStateBlock({
      time: { elapsed: 3, unit: 'days', clock_time: '08:00' },
      mood: 'Weary but resolute',
    });

    expect(diff).not.toBeNull();

    db = applyTurnDiff(db, diff);

    expect(daysBetween(before, db.state.inStoryDate)).toBe(3);
    expect(timeOfDayOf(db.state.inStoryDate)).toBe('morning');
    expect(db.state.mood).toBe('Weary but resolute');
  });

  test('time_of_day alone shifts only the time of day', () => {
    let db = loadSave();
    const before = { ...db.state.inStoryDate };

    db = applyTurnDiff(db, {
      state: { clockTime: { hour: 19, minute: 0 } },
    });

    expect(db.state.inStoryDate.day).toBe(before.day + 1);
    expect(timeOfDayOf(db.state.inStoryDate)).toBe('evening');
  });

  test('absolute inStoryDate from extraction still works and ages NPCs', () => {
    let db = loadSave();
    const yearBefore = db.state.inStoryDate.year;
    const agable = db.entities.find((e) => e.type === 'character' && e.birthYear === undefined && e.age !== undefined);

    db = applyTurnDiff(db, {
      state: { inStoryDate: { year: yearBefore + 1, month: 1, day: 1, hour: 8, minute: 0 } },
    });

    expect(db.state.inStoryDate.year).toBe(yearBefore + 1);

    if (agable) {
      const after = db.entities.find((e) => e.id === agable.id);
      expect(after?.age).toBe((agable.age ?? 0) + 1);
    }
  });

  test('scene_ended inline diff records a memory event', () => {
    let db = loadSave();
    db = appendStoryMessage(db, 'user', '*Kan waits.*', 'm', 0, 0);
    db = appendStoryMessage(db, 'assistant', 'Rain falls over the empty road.', 'm', 0, 0);
    const eventsBefore = db.events.length;

    const { diff } = convertStateBlock({ scene_ended: true });

    expect(diff?.scene?.ended).toBe(true);

    db = applyTurnDiff(db, diff);

    expect(db.events.length).toBe(eventsBefore + 1);
  });
});

describe('summarize cadence', () => {
  test('counts only messages since the last chapter summary', () => {
    let db = loadSave();

    for (let i = 0; i < 14; i += 1) {
      db = appendStoryMessage(db, 'user', `msg ${i}`, 'm', 0, 0);
    }

    const sinceBefore = unsummarizedStory(db).length;
    expect(sinceBefore).toBeGreaterThan(12);

    const now = Date.now();
    db = {
      ...db,
      summaries: [
        ...db.summaries,
        {
          id: 'summary_test',
          level: 'chapter' as const,
          range: { fromEventId: '', toEventId: '', from: db.state.inStoryDate, to: db.state.inStoryDate },
          text: 'A fresh summary resetting the cadence.',
          tokenCount: 10,
          eventIds: [],
          createdAt: now,
        },
      ],
    };

    expect(unsummarizedStory(db).length).toBe(0);
  });

  test('messages written while a summary ran still count, whatever their wall-clock time', () => {
    let db = loadSave();
    db = { ...db, summaries: db.summaries.filter((summary) => summary.level !== 'chapter') };
    const before = unsummarizedStory(db).length;

    for (let i = 0; i < 6; i += 1) {
      db = appendStoryMessage(db, 'user', `covered ${i}`, 'm', 0, 0);
    }
    const covered = unsummarizedStory(db).map((entry) => entry.id);
    expect(covered.length).toBe(before + 6);

    for (let i = 0; i < 3; i += 1) {
      db = appendStoryMessage(db, 'user', `late ${i}`, 'm', 0, 0);
    }

    // The summary lists what it covers and was stamped after the late messages
    // were written (they arrived while it ran); the old wall-clock count said 0.
    db = {
      ...db,
      summaries: [
        ...db.summaries,
        {
          id: 'summary_traced',
          level: 'chapter' as const,
          range: { fromEventId: '', toEventId: '', from: db.state.inStoryDate, to: db.state.inStoryDate },
          text: 'A summary of the covered messages.',
          tokenCount: 10,
          eventIds: [],
          sourceLogIds: covered,
          createdAt: Date.now() + 60_000,
        },
      ],
    };

    expect(unsummarizedStory(db).map((entry) => entry.content)).toEqual(['late 0', 'late 1', 'late 2']);
  });
});

describe('summary text hygiene', () => {
  test('trims mid-sentence truncation to the last complete sentence', () => {
    const cut = 'Kan fled through the rain. Itachi followed without a word and the boar-masked ANBU captain attacked with Fire Style, but';
    const trimmed = trimToSentence(cut);

    expect(trimmed.endsWith('but')).toBe(false);
    expect(trimmed).toBe('Kan fled through the rain.');
  });

  test('keeps complete text intact', () => {
    const full = 'Kan fled through the rain. Itachi followed without a word.';
    expect(trimToSentence(full)).toBe(full);
  });

  test('strips stray code fences and label lines', () => {
    expect(trimToSentence('A clean summary.\n\n```json')).toBe('A clean summary.');
    expect(trimToSentence('Chapter summary:\nAnother sentence here.')).toBe('Another sentence here.');
  });

  test('save summaries all end at sentence boundaries', () => {
    const db = loadSave();

    for (const summary of db.summaries) {
      expect(/[.!?\"]$/.test(summary.text.trim())).toBe(true);
    }
  });
});

describe('presence tracking and bonds ordering', () => {
  test('characters_present marks entities as seen', () => {
    let db = loadSave();

    const { diff } = convertStateBlock({
      characters_present: ['Itachi Uchiha'],
      time: { elapsed: 2, unit: 'days', clock_time: '08:00' },
    });

    db = applyTurnDiff(db, diff);

    const itachi = db.entities.find((entity) => entity.name === 'Itachi Uchiha');

    expect(itachi?.lastSeen).toBeDefined();
    expect(itachi?.lastSeen?.day).toBe(db.state.inStoryDate.day);
    expect(timeOfDayOf(itachi!.lastSeen!)).toBe('morning');
  });

  test('sleeping through the night advances exactly one day to morning', () => {
    let db = loadSave();
    const before = db.state.inStoryDate;

    const { diff } = convertStateBlock({
      time: { elapsed: 9, unit: 'hours' },
    });

    db = applyTurnDiff(db, diff);

    expect(daysBetween(before, db.state.inStoryDate)).toBe(1);
    expect(db.state.inStoryDate.hour).toBe(7);
    expect(timeOfDayOf(db.state.inStoryDate)).toBe('morning');
  });

  test('narrator prompt asks for prose only and carries no JSON schema', () => {
    expect(NARRATION_SYSTEM).not.toContain('```');
    expect(NARRATION_SYSTEM).not.toContain('characters_present');
    expect(NARRATION_SYSTEM).not.toContain('scene_pace');
    expect(NARRATION_SYSTEM).not.toContain('"time"');
    expect(NARRATION_SYSTEM).toContain('Story prose only');
    expect(NARRATION_SYSTEM).toContain('a night\'s sleep 8-9 hours');
  });

  test('full narration prompt never asks the narrator for JSON fields', () => {
    const db = loadSave();
    const prompt = buildNarrationPrompt(db, '*Kan looks around.*');
    const all = prompt.messages.map((message) => message.content).join('\n');

    for (const key of ['news_relayed', 'canon_engaged', 'canon_completed', 'canon_passed', 'image_worthy', '```json']) {
      expect(all).not.toContain(key);
    }
  });

  test('narration prompt does not duplicate the current action', () => {
    const db = loadSave();
    const action = '"We move at dawn." *Kan checks his pack.*';

    const prompt = buildNarrationPrompt(db, action);
    const dynamic = prompt.messages[1].content;

    const occurrences = dynamic.split(action).length - 1;

    expect(occurrences).toBe(1);
  });
});


function hearCanon(db: AppDatabase, milestoneId: string): AppDatabase {
  const progress = db.state.canonProgress ?? { completed: [], active: [], engaged: [] };

  return learnFromCanon({
    ...db,
    state: {
      ...db.state,
      canonProgress: {
        ...progress,
        heard: { ...(progress.heard ?? {}), [`event_canon_${milestoneId}`]: { from: 'a rumor', date: db.state.inStoryDate } },
      },
    },
  });
}

describe('Tobi identity resolution', () => {
  test('Tobi and a bare "Madara" are one entity; descriptions match no one', () => {
    let db = loadSave();

    db = applyEntityDiff(db, { name: 'Tobi', role: 'Mystery' });
    db = applyEntityDiff(db, { name: 'Madara', role: 'Mystery' });

    const tobiId = resolveEntity(db, 'Tobi')?.id;

    expect(tobiId).toBeDefined();
    expect(resolveEntity(db, 'Madara')?.id).toBe(tobiId);
    expect(db.entities.filter((entity) => /\btobi\b/i.test(entity.name)).length).toBe(1);

    // "The masked man" is how anyone in a mask is described.
    for (const description of ['Masked Man', 'the masked man', 'The leader', 'the woman', 'a hooded figure']) {
      expect(resolveEntity(db, description)).toBeNull();
    }

    db = applyEntityDiff(db, { isNew: true, name: 'the masked man', role: 'Bounty hunter' });
    expect(db.entities.some((entity) => entity.name.toLowerCase() === 'the masked man')).toBe(false);
  });

  test('Obito is a hidden name until the mask breaks', () => {
    let db = loadSave();
    const tobi = db.entities.find((entity) => entity.name === 'Tobi')!;

    expect(tobi.aliases.map((alias) => alias.toLowerCase())).not.toContain('obito');
    expect(tobi.identities?.map((identity) => identity.name)).toContain('Obito Uchiha');
    expect(resolveEntity(db, 'Obito')).toBeNull();
    expect(resolveEntity(db, 'Obito Uchiha')).toBeNull();

    // The narrator never sees it unless he is in the scene (then only as a
    // narrator-only truth); the state tracker sees true identities.
    const narration = buildNarrationPrompt(db, '*You watch the rain.*').messages.map((message) => message.content).join('\n');
    expect(narration).not.toContain('Obito');
    expect(narration).not.toContain('Nagato');
    const tracker = buildExtractionPrompt(db, '*You watch.*', 'Rain falls.').messages.map((message) => message.content).join('\n');
    expect(tracker).toContain('Obito Uchiha (true)');

    // Kakashi's dead teammate, named in the story, is someone else for now.
    db = applyEntityDiff(db, { isNew: true, name: 'Obito Uchiha', role: "Kakashi's fallen teammate" });
    const teammate = resolveEntity(db, 'Obito Uchiha')!;
    expect(teammate.id).not.toBe(tobi.id);
    expect(teammate.met).toBe(false);

    const revealed = hearCanon(loadSave(), 'obito-unmasked');
    const after = revealed.entities.find((entity) => entity.name === 'Tobi')!;
    expect(after.aliases).toContain('Obito Uchiha');
    expect(after.known?.identities).toContain('Obito Uchiha');
    expect(resolveEntity(revealed, 'Obito')?.id).toBe(after.id);
  });

  test('the real Madara is a separate character from Tobi', () => {
    let db = loadSave();
    const tobiId = resolveEntity(db, 'Tobi')?.id;

    expect(resolveEntity(db, 'Madara')?.id).toBe(tobiId);

    // The real Madara Uchiha appears much later and stays a separate entity.
    db = applyEntityDiff(db, { name: 'Madara Uchiha', role: 'Legend', age: 40 });

    const madaraId = resolveEntity(db, 'Madara Uchiha')?.id;

    expect(madaraId).toBeDefined();
    expect(madaraId).not.toBe(tobiId);
    expect(resolveEntity(db, 'Tobi')?.id).toBe(tobiId);
    expect(resolveEntity(db, 'Madara')?.id).toBe(madaraId);
  });

  test('Pain and the six paths are one character; Nagato stays hidden until the Leaf learns it', () => {
    let db = loadSave();

    db = applyEntityDiff(db, { name: 'Pain', role: 'Akatsuki leader' });
    db = applyEntityDiff(db, { name: 'Deva Path', role: 'Akatsuki' });

    const painId = resolveEntity(db, 'Pain')?.id;

    expect(resolveEntity(db, 'Deva Path')?.id).toBe(painId);
    expect(resolveEntity(db, 'Nagato')).toBeNull();
    expect(db.entities.filter((entity) => entityGroup(entityHints(entity)) === 'pain').length).toBe(1);

    db = hearCanon(db, 'pain-assault');
    expect(resolveEntity(db, 'Nagato')?.id).toBe(painId);
    expect(resolveEntity(db, 'Nagato')?.name).toBe('Pain');
  });

  test('Pain never merges with Tobi or the real Madara', () => {
    let db = loadSave();

    db = applyEntityDiff(db, { name: 'Madara Uchiha', role: 'Legend', age: 40 });
    db = applyEntityDiff(db, { name: 'Pain', role: 'Akatsuki leader' });

    expect(resolveEntity(db, 'Pain')?.id).not.toBe(resolveEntity(db, 'Tobi')?.id);
    expect(resolveEntity(db, 'Pain')?.id).not.toBe(resolveEntity(db, 'Madara Uchiha')?.id);
  });

  test('Black Zetsu and White Zetsu resolve to one entity', () => {
    let db = loadSave();

    db = applyEntityDiff(db, { name: 'Black Zetsu', role: 'Akatsuki' });
    db = applyEntityDiff(db, { name: 'White Zetsu', role: 'Akatsuki' });

    const zetsuId = resolveEntity(db, 'Black Zetsu')?.id;

    expect(resolveEntity(db, 'White Zetsu')?.id).toBe(zetsuId);
    expect(db.entities.filter((entity) => entity.name.toLowerCase().includes('zetsu')).length).toBe(1);
  });
});

describe('encounter frequency and image cast', () => {
  test('the narrator gets no dice roll and no style guard', () => {
    const db = loadSave();
    const prompt = buildNarrationPrompt(db, '*You wait.*');
    const text = prompt.messages.map((m) => m.content).join('\n');

    expect(text).not.toContain('ENCOUNTER HINT');
    expect(text).not.toContain('d20');
    expect(text).not.toContain('STYLE GUARD');
    expect(text).toContain('ENCOUNTER CONDITIONS');
    expect(NARRATION_SYSTEM).toContain('never reuse a description');
  });

  test('image prompt forbids characters from previous images and lists the cast', () => {
    let db = loadSave();

    db = applyTurnDiff(db, {
      scene: { ended: false, entities: ['Itachi Uchiha'] },
    });

    const prompt = buildSceneImagePrompt(db, [{ kind: 'previous', uri: 'data:image/jpeg;base64,AAA' }], 'Kan waits.');

    expect(prompt).toContain('must NOT appear now');
    expect(prompt).toContain('Itachi Uchiha');
    expect(prompt).toContain('Only the people named in the ACTION may appear');
  });

  test('Tobi stays one entity and no "masked man" entity appears', () => {
    let db = loadSave();
    db = applyEntityDiff(db, { name: 'Masked Man', role: 'Mystery' });
    db = applyEntityDiff(db, { name: 'Tobi', role: 'Mystery' });

    expect(db.entities.filter((entity) => /masked man|\btobi\b/i.test(entity.name)).map((entity) => entity.name)).toEqual(['Tobi']);
  });
});

describe('canon timeline dataset', () => {
  test('milestones are unique, ordered, and lore-gated', () => {
    const ids = CANON_MILESTONES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const m of CANON_MILESTONES) {
      if (m.knowledge === 'secret') expect(m.bearers?.length ?? 0).toBeGreaterThan(0);
      if (m.bearers) expect(m.knowledge).toBe('secret');
      expect(m.from.year).toBeGreaterThanOrEqual(13);
      expect(m.facts.length + (m.opensThreads?.length ?? 0)).toBeGreaterThanOrEqual(0);
      if (m.to) {
        expect(m.to.year * 12 + m.to.month).toBeGreaterThanOrEqual(
          m.from.year * 12 + m.from.month
        );
      }
    }

    const unmask = CANON_MILESTONES.find((m) => m.id === 'obito-unmasked');
    expect(unmask).toBeDefined();
    const unmaskYear = unmask!.from.year;
    expect(unmaskYear).toBeGreaterThanOrEqual(23);

    const audience = CANON_MILESTONES.find((m) => m.id === 'masked-man-audience');
    expect(audience?.description).toContain('masked');
    expect(audience?.description.toLowerCase()).not.toContain('obito');

    for (const m of CANON_MILESTONES) {
      if (m.playerDriven && m.encounter) {
        expect(m.encounter.context.length).toBeGreaterThan(20);
      }
    }
  });
});

describe('canon scheduler', () => {
  test('no milestones fire on a fresh save before the story advances', () => {
    const db = loadSave();
    const next = advanceCanon(db);
    expect(next.state.canonProgress?.completed ?? []).toEqual([]);
    expect(next.events.filter((e) => e.tags.includes('canon')).length).toBe(0);
  });

  test('world milestones wait for the date window and baseline turns', () => {
    let db = loadSave();

    db = {
      ...db,
      state: {
        ...db.state,
        inStoryDate: { year: 16, month: 2, day: 1, hour: 8, minute: 0 },
        canonProgress: {
          version: CANON_VERSION,
          baselineDate: { year: 13, month: 10, day: 1, hour: 22, minute: 0 },
          baselineTurn: 0,
          completed: [],
          active: [],
          engaged: [],
        },
      },
      rawLog: Array.from({ length: 30 }, (_, index) => ({
        ...db.rawLog[0],
        id: `log_${index}`,
        kind: 'story' as const,
        role: 'assistant' as const,
        content: 'A turn.',
        createdAt: index,
      })),
    };

    const next = advanceCanon(db);
    expect(next.state.canonProgress?.completed).toContain('juzo-death');
    expect(next.events.some((e) => e.id === 'event_canon_juzo-death')).toBe(true);
  });

  test('kan joining the Akatsuki is personal and only fires when narrated', () => {
    let db = loadSave();
    db = {
      ...db,
      state: {
        ...db.state,
        canonProgress: {
          version: CANON_VERSION,
          baselineDate: db.state.inStoryDate,
          baselineTurn: 0,
          completed: [],
          active: [],
          engaged: [],
        },
      },
    };

    const auto = advanceCanon(db);
    expect(auto.state.canonProgress?.completed ?? []).not.toContain('kan-joins-akatsuki');
    expect(auto.threads.some((t) => t.title === 'Prove yourself to the Akatsuki')).toBe(false);

    const narrated = applyCanonMarks(auto, ['kan-joins-akatsuki'], []);
    expect(narrated.state.canonProgress?.completed).toContain('kan-joins-akatsuki');
    expect(narrated.threads.some((t) => t.title === 'Prove yourself to the Akatsuki')).toBe(true);
    expect(narrated.facts.some((f) => f.text.includes('You went into the Akatsuki'))).toBe(true);
  });

  test('does not run ahead of its date window', () => {
    let db = loadSave();
    db = {
      ...db,
      state: {
        ...db.state,
        inStoryDate: { year: 14, month: 2, day: 1, hour: 8, minute: 0 },
        canonProgress: { completed: [], active: [], engaged: [] },
      },
      events: [...db.events, ...db.events, ...db.events],
    };

    const next = advanceCanon(db);
    expect(next.state.canonProgress?.completed ?? []).not.toContain('gaara-captured');
    expect(next.state.canonProgress?.completed ?? []).not.toContain('war-begins');
  });

  test('narrator-marked beats complete and stamp attendance', () => {
    let db = loadSave();
    db = {
      ...db,
      state: { ...db.state, canonProgress: { completed: [], active: [], engaged: [] } },
    };

    const completed = applyCanonMarks(db, ['masked-man-audience'], []);
    expect(completed.facts.some((f) => f.text.includes('You attended'))).toBe(true);
    expect(completed.state.canonProgress?.completed).toContain('masked-man-audience');

    const engaged = applyCanonMarks(db, [], ['itachi-hunt-naruto']);
    expect(engaged.state.canonProgress?.engaged).toContain('itachi-hunt-naruto');
    expect(engaged.state.canonProgress?.active).toContain('itachi-hunt-naruto');
    expect(engaged.state.canonProgress?.completed ?? []).not.toContain('itachi-hunt-naruto');

    const finished = applyCanonMarks(engaged, ['itachi-hunt-naruto'], []);
    expect(finished.state.canonProgress?.completed).toContain('itachi-hunt-naruto');
    expect(finished.state.canonProgress?.engaged ?? []).not.toContain('itachi-hunt-naruto');
    expect(finished.facts.some((f) => f.text.includes('accompanied Itachi'))).toBe(true);
  });

  test('expired player-driven encounters log a missed fact', () => {
    let db = loadSave();
    db = {
      ...db,
      state: {
        ...db.state,
        inStoryDate: { year: 19, month: 9, day: 1, hour: 22, minute: 0 },
        canonProgress: { completed: [], active: ['itachi-hunt-naruto'], engaged: [] },
      },
    };

    const next = advanceCanon(db);
    expect(next.state.canonProgress?.completed).toContain('itachi-hunt-naruto');
    expect(next.state.canonProgress?.active ?? []).not.toContain('itachi-hunt-naruto');
    expect(
      next.facts.some((f) => f.text.toLowerCase().includes('never crossed paths'))
    ).toBe(true);
  });

  test('canon progression stays on even if an old save turned it off', () => {
    const base = loadSave();
    const db = { ...base, settings: { ...base.settings, canonProgress: false } } as typeof base;
    const started = advanceCanon(db, { inCombat: false });
    const later = advanceCanon(
      { ...started, state: { ...started.state, inStoryDate: { ...started.state.inStoryDate, year: started.state.inStoryDate.year + 2 } } },
      { inCombat: false }
    );
    expect(later.events.filter((e) => e.tags.includes('canon')).length).toBeGreaterThan(
      started.events.filter((e) => e.tags.includes('canon')).length
    );
  });
});

describe('cross-era memory and romance', () => {
  test('old saves migrate romance and canon fields', () => {
    const db = loadSave();

    expect(db.settings.canonProgress).toBe(true);
    expect(Array.isArray(db.state.canonProgress?.completed)).toBe(true);

    for (const bond of db.bonds) {
      expect(RELATIONSHIP_STAGES).toContain(bond.relationship ?? 'stranger');
    }

    for (const entity of db.entities.filter((e) => e.type === 'character' && e.name !== 'Kan')) {
      expect(['winnable', 'lore-locked', 'not-applicable']).toContain(entity.romanceAccessibility ?? 'not-applicable');
      // Kan is straight: no man is ever a romance option.
      if (entity.gender === 'male') {
        expect(entity.romanceAccessibility).toBe('not-applicable');
      }
    }

    const kan = db.entities.find((e) => e.name === 'Kan')!;
    expect(kan.romanceAccessibility).toBeUndefined();
    for (const name of ['Kakashi Hatake', 'Gaara', 'Killer Bee', 'Might Guy', 'Neji Hyuga', 'Shikamaru Nara', 'Sai', 'Itachi Uchiha']) {
      expect(db.entities.find((e) => e.name === name)?.romanceAccessibility).toBe('not-applicable');
    }
    for (const name of ['Temari', 'Ino Yamanaka', 'Karui', 'Hana Inuzuka', 'Suzume']) {
      expect(db.entities.find((e) => e.name === name)?.romanceAccessibility).toBe('winnable');
    }
    expect(db.entities.find((e) => e.name === 'Sakura Haruno')?.romanceAccessibility).toBe('lore-locked');
  });

  test('characters met once are remembered across eras', () => {
    let db = loadSave();
    const itachiId = resolveEntity(db, 'Itachi')?.id;
    const factsBefore = db.facts.length;

    db = applyTurnDiff(db, {
      state: { inStoryDate: { year: 22, month: 1, day: 1, hour: 8, minute: 0 } },
      entities: [{ name: 'Itachi', role: 'Akatsuki' }],
    });

    expect(resolveEntity(db, 'Itachi')?.id).toBe(itachiId);
    expect(db.bonds.some((b) => b.entityId === itachiId)).toBe(true);
    expect(db.facts.length).toBeGreaterThanOrEqual(factsBefore);
    expect(db.entities.filter((e) => e.name === 'Itachi Uchiha').length).toBe(1);
  });

  test('romance state persists rejections without resetting', () => {
    let db = loadSave();

    db = applyTurnDiff(db, {
      bonds: [
        {
          character: 'Hana Inuzuka',
          relationship: 'rejected',
          attraction: 'none',
          romanceNote: 'She turned Kan down and the awkwardness lingers.',
        },
      ],
    });

    const bond = db.bonds.find((b) => b.characterName === 'Hana Inuzuka');
    expect(bond?.relationship).toBe('rejected');
    expect(bond?.romanceNote).toContain('awkwardness');

    db = applyTurnDiff(db, { bonds: [{ character: 'Hana', affinityDelta: 1 }] });
    expect(db.bonds.find((b) => b.characterName === 'Hana Inuzuka')?.relationship).toBe(
      'rejected'
    );
  });

  test('a rejection can slowly thaw when the story earns it', () => {
    let db = loadSave();
    db = applyTurnDiff(db, {
      bonds: [{ character: 'Hana Inuzuka', relationship: 'rejected', attraction: 'none' }],
    });
    db = applyTurnDiff(db, {
      bonds: [
        {
          character: 'Hana Inuzuka',
          relationship: 'close',
          attraction: 'warm',
          romanceNote: 'Years on, she sees who he really is.',
        },
      ],
    });
    const bond = db.bonds.find((b) => b.characterName === 'Hana Inuzuka');
    expect(bond?.relationship).toBe('close');
    expect(bond?.attraction).toBe('warm');
  });

  test('narration prompt carries canon, romance, and lore hearts', () => {
    let db = loadSave();
    db = applyTurnDiff(db, {
      scene: { ended: false, entities: ['Itachi Uchiha'] },
    });

    const prompt = buildNarrationPrompt(db, '*Kan looks at Itachi.*');
    const system = prompt.messages[0].content;
    const dynamic = prompt.messages[1].content;

    expect(system).toContain('written openly with no fade-out');
    expect(system).toContain('Lore-locked hearts');
    expect(system).toContain('CANON TIMELINE');
    expect(dynamic).toContain('CANON TIMELINE');
    expect(`${system}\n${dynamic}`).toContain('heart:');
  });
});

describe('expanded lore and team 3', () => {
  test('team 3 beats exist with encounters across eras', () => {
    const ids = ['izumi-funeral', 'hana-hunt', 'suzume-inquiry', 'team-3-reunion', 'izumi-grave', 'team-3-war'];

    for (const id of ids) {
      const milestone = CANON_MILESTONES.find((m) => m.id === id);
      expect(milestone).toBeDefined();
      expect(milestone?.encounter).toBeDefined();
      expect(milestone?.encounter?.who.toLowerCase()).toMatch(/hana|suzume|izumi/);
    }
  });

  test('canon includes the war deaths and late twists', () => {
    const ids = new Set(CANON_MILESTONES.map((m) => m.id));
    for (const id of ['hayate-death', 'neji-death', 'shikaku-inoichi-death', 'kaguya-awakens', 'obito-redemption', 'kaguya-sealed', 'naruto-hokage']) {
      expect(ids.has(id)).toBe(true);
    }
    expect(CANON_MILESTONES.length).toBeGreaterThanOrEqual(85);
  });

  test('era personalities shift with the timeline', () => {
    expect(eraNoteFor('Hana Inuzuka', 13)).toContain('Grieving teammate');
    expect(eraNoteFor('Hana Inuzuka', 21)).toContain('Jonin');
    expect(eraNoteFor('Naruto Uzumaki', 13)).toContain('lonely');
    expect(eraNoteFor('Naruto Uzumaki', 23)).toContain('Composed');
    expect(eraNoteFor('Itachi Uchiha', 23)).toContain('Edo Tensei');
    expect(eraNoteFor('Suzume', 18)).toContain('new team');
  });

  test('character cards include the era note', () => {
    const db = loadSave();
    const prompt = buildNarrationPrompt(db, '*Kan looks at Itachi.*');
    // Era notes ride on the character cards in the scene message.
    expect(prompt.messages.map((m) => m.content).join('\n')).toContain('now: Gentle older brother');
  });
});

describe('encounter realism', () => {
  test('location classification and risk matrix', () => {
    expect(classifyLocation('Konoha marketplace at noon')).toBe('settlement');
    expect(classifyLocation('deep forest outside the village')).toBe('wilderness');
    expect(classifyLocation('abandoned temple in the mountains')).toBe('structure');
    expect(classifyLocation('the road north')).toBe('road');

    expect(encounterRisk('settlement', 'morning')).toBe('high');
    expect(encounterRisk('settlement', 'night')).toBe('low');
    expect(encounterRisk('wilderness', 'afternoon')).toBe('low');
    expect(encounterRisk('wilderness', 'night')).toBe('none');
    expect(encounterRisk('structure', 'night')).toBe('none');
  });

  test('encounter conditions follow place and time', () => {
    let db = loadSave();
    db = {
      ...db,
      state: {
        ...db.state,
        location: 'deep woods',
        locationKind: 'wilderness',
        inStoryDate: { ...db.state.inStoryDate, hour: 22, minute: 0 },
      },
    };

    expect(formatEncounterConditions(db)).toContain('isolated');

    const village = {
      ...db,
      state: {
        ...db.state,
        location: 'Konoha market',
        locationKind: 'settlement' as const,
        inStoryDate: { ...db.state.inStoryDate, hour: 14, minute: 0 },
      },
    };

    expect(formatEncounterConditions(village)).toContain('settlement');
    expect(formatEncounterConditions(village)).toContain('crowded');
  });

  test('location_kind flows through the diff and fallback classifier', () => {
    let db = loadSave();
    db = applyTurnDiff(db, { state: { location: 'Konoha marketplace' } });
    expect(db.state.locationKind).toBe('settlement');

    db = applyTurnDiff(db, { state: { location: 'somewhere new', locationKind: 'structure' } });
    expect(db.state.locationKind).toBe('structure');
  });
});

describe('silent turns', () => {
  test('the clock does not move on its own', () => {
    let db = loadSave();
    db = {
      ...db,
      state: { ...db.state, turnsWithoutTimeChange: 0 },
    };

    const before = db.state.inStoryDate;
    db = applyTurnDiff(db, {});
    db = applyTurnDiff(db, {});
    db = applyTurnDiff(db, {});

    expect(db.state.inStoryDate).toEqual(before);
    expect(db.state.turnsWithoutTimeChange).toBe(3);
  });

  test('reporting time resets the stall counter', () => {
    let db = loadSave();
    db = applyTurnDiff(db, {});
    expect(db.state.turnsWithoutTimeChange).toBe(1);

    db = applyTurnDiff(db, { state: { elapsedSeconds: 60 } });
    expect(db.state.turnsWithoutTimeChange).toBe(0);
  });
});

describe('canon endings and prompt memory', () => {
  test('canon_passed completes an opportunity with a missed fact', () => {
    let db = loadSave();
    db = {
      ...db,
      state: { ...db.state, canonProgress: { completed: [], active: [], engaged: [] } },
    };

    const next = applyCanonMarks(db, [], [], ['itachi-hunt-naruto']);
    expect(next.state.canonProgress?.completed).toContain('itachi-hunt-naruto');
    expect(next.state.canonProgress?.active ?? []).not.toContain('itachi-hunt-naruto');
    expect(next.facts.some((f) => f.text.includes('never crossed paths'))).toBe(true);
  });

  test('recent messages keep the newest narration ending', () => {
    let db = loadSave();
    const longNarration = `${'The rain falls. '.repeat(150)}FINAL BEAT: the masked man turns away and vanishes.`;

    db = appendStoryMessage(db, 'assistant', longNarration, 'm', 0, 0);
    const prompt = buildNarrationPrompt(db, '*Kan watches.*');
    const dynamic = prompt.messages[1].content;

    expect(dynamic).toContain('FINAL BEAT');
    expect(dynamic).toContain('Narrator (continue directly from here)');
    expect(dynamic).not.toContain('LAST NARRATED BEAT');
    expect(dynamic).toContain('CONTINUITY');
  });

  test('prompt budget guard caps runaway context', () => {
    let db = loadSave();
    for (let i = 0; i < 12; i += 1) {
      db = appendStoryMessage(db, 'assistant', 'Long narration. '.repeat(400), 'm', 0, 0);
    }

    const prompt = buildNarrationPrompt(db, '*Kan waits.*');
    expect(prompt.estimatedTokens).toBeLessThanOrEqual(db.settings.promptTokenBudget);
    expect(prompt.recentMessages.length).toBeGreaterThanOrEqual(4);
  });

  test('canon block lists concluded beats', () => {
    let db = loadSave();
    db = {
      ...db,
      state: {
        ...db.state,
        canonProgress: { completed: ['gaara-captured', 'itachi-vs-sasuke'], active: [], engaged: [] },
      },
    };

    const prompt = buildNarrationPrompt(db, '*Kan waits.*');
    expect(prompt.messages[1].content).toContain('RECENTLY CONCLUDED');
    // Titles only: the narrator never sees ids.
    expect(prompt.messages[1].content).toContain('Itachi falls');
    expect(prompt.messages[1].content).not.toContain('itachi-vs-sasuke');
  });
});

describe('canon timing and migration', () => {
  test('fresh save does not show canon before the story reaches it', () => {
    const seeded = loadSave();
    const seededPoint = seeded.state.canonPoint;
    const db = advanceCanon(seeded);

    expect(db.events.filter((e) => e.tags.includes('canon')).length).toBe(0);
    expect(db.state.canonProgress?.completed ?? []).toEqual([]);
    expect(db.threads.some((t) => t.title === 'Prove yourself to the Akatsuki')).toBe(false);
    expect(db.state.canonPoint).toBe(seededPoint);
  });

  test('izumi funeral waits until day 6', () => {
    let db = loadSave();
    db = {
      ...db,
      state: {
        ...db.state,
        canonProgress: {
          version: CANON_VERSION,
          baselineDate: { year: 13, month: 10, day: 1, hour: 22, minute: 0 },
          baselineTurn: 0,
          completed: [],
          active: [],
          engaged: [],
          expired: [],
        },
      },
      rawLog: Array.from({ length: 10 }, (_, i) => ({
        ...db.rawLog[0],
        id: `t_${i}`,
        kind: 'story' as const,
        role: 'assistant' as const,
        content: 'x',
        createdAt: i,
      })),
    };

    const day1 = advanceCanon({ ...db, state: { ...db.state, inStoryDate: { year: 13, month: 10, day: 1, hour: 22, minute: 0 } } });
    expect(day1.state.canonProgress?.completed ?? []).not.toContain('izumi-funeral');

    const day6 = advanceCanon({ ...db, state: { ...db.state, inStoryDate: { year: 13, month: 10, day: 6, hour: 8, minute: 0 } } });
    expect(day6.state.canonProgress?.completed).toContain('izumi-funeral');
    expect(day6.state.canonPoint).not.toContain('buried');
  });

  test('v1 saves are cleaned of phantom canon entries', () => {
    let db = loadSave();
    db = {
      ...db,
      state: {
        ...db.state,
        canonPoint: 'Kan and Itachi have joined the Akatsuki together.',
        canonProgress: { version: 1, completed: ['kan-joins-akatsuki'], active: [], engaged: [] },
      },
      events: [
        ...db.events,
        {
          id: 'event_canon_kan-joins-akatsuki',
          chapter: 1,
          scene: 'Canon event',
          inStoryDate: db.state.inStoryDate,
          summary: 'Kan joins the Akatsuki: he joins.',
          importance: 5 as const,
          tags: ['canon'],
          pinned: true,
          sourceLogId: null,
          createdAt: 1,
        },
      ],
      facts: [
        ...db.facts,
        {
          id: 'fact_canon_kan-joins-akatsuki_0',
          subjectEntityId: null,
          type: 'event' as const,
          text: 'Kan joined the Akatsuki together with Itachi Uchiha.',
          whoKnows: [],
          validFrom: db.state.inStoryDate,
          validTo: null,
          confidence: 'confirmed' as const,
          sourceEventId: null,
        },
      ],
      threads: [
        ...db.threads,
        {
          id: 'thread_canon_kan-joins-akatsuki_0',
          type: 'goal' as const,
          title: 'Prove yourself to the Akatsuki',
          description: 'Earn a place.',
          status: 'open' as const,
          openedAt: db.state.inStoryDate,
          resolvedAt: null,
          importance: 4 as const,
          participants: ['Kan'],
          sourceEventId: null,
        },
      ],
    };

    const migrated = normalizeDatabase(db);

    expect(migrated.events.some((e) => e.id === 'event_canon_kan-joins-akatsuki')).toBe(false);
    expect(migrated.facts.some((f) => f.id.startsWith('fact_canon_'))).toBe(false);
    expect(migrated.threads.some((t) => t.id.startsWith('thread_canon_'))).toBe(false);
    expect(migrated.state.canonPoint).not.toContain('joined the Akatsuki');
    expect(migrated.state.canonProgress?.version).toBe(CANON_VERSION);
    expect(migrated.state.canonProgress?.completed).toEqual([]);
  });
});

describe('english place names', () => {
  test('glossary localizes Japanese place names', () => {
    expect(localizePlaceNames('Return to Konoha from Amegakure')).toBe(
      'Return to Hidden Leaf from Hidden Rain Village'
    );
    expect(localizePlaceNames('Sunagakure and Kirigakure')).toBe(
      'Hidden Sand Village and Hidden Mist Village'
    );
    expect(localizePlaceNames('Hokage, genin, jinchūriki, Akatsuki')).toBe(
      'Hokage, genin, jinchūriki, Akatsuki'
    );
  });

  test('canon data contains no Japanese place names', () => {
    for (const milestone of CANON_MILESTONES) {
      expect(hasJapanesePlaceName(`${milestone.title} ${milestone.description} ${milestone.canonPoint ?? ''}`)).toBe(false);
    }
  });

  test('prompt uses English place names', () => {
    const db = loadSave();
    const prompt = buildNarrationPrompt(db, '*Kan walks.*');
    expect(prompt.messages[0].content).toContain('Hidden Leaf');
    expect(hasJapanesePlaceName(prompt.messages[1].content)).toBe(false);
    expect(prompt.messages[0].content).toContain('Use English place names only');
  });
});

describe('world news and couriers', () => {
  test('milestones carry world locations and knowledge classes', () => {
    const summit = CANON_MILESTONES.find((m) => m.id === 'kage-summit')!;
    expect(milestoneRegion(summit)).toBe('Land of Iron');
    expect(milestoneLocation(summit)).toContain('Summit hall');

    const gaara = CANON_MILESTONES.find((m) => m.id === 'gaara-captured')!;
    expect(milestoneRegion(gaara)).toBe('Hidden Sand');

    const funeral = CANON_MILESTONES.find((m) => m.id === 'izumi-funeral')!;
    expect(milestoneKnowledge(funeral)).toBe('village');
    expect(milestoneBearers(funeral)).toContain('Itachi Uchiha');
    expect(milestoneChannel(funeral)).toContain('hawk');

    expect(milestoneChannel(summit)).toContain('samurai');

    const truth = CANON_MILESTONES.find((m) => m.id === 'masked-man-truth')!;
    expect(milestoneKnowledge(truth)).toBe('secret');
    expect(milestoneBearers(truth)).toContain('Sasuke Uchiha');
  });

  test('unheard news stays queued until relayed', () => {
    let db = loadSave();
    db = {
      ...db,
      state: {
        ...db.state,
        canonProgress: {
          version: CANON_VERSION,
          baselineDate: db.state.inStoryDate,
          baselineTurn: 0,
          completed: [],
          active: [],
          engaged: [],
          expired: [],
          heard: {},
        },
      },
    };

    db = {
      ...db,
      events: [
        ...db.events,
        {
          id: 'event_canon_gaara-captured',
          chapter: 1,
          scene: 'Canon event',
          inStoryDate: db.state.inStoryDate,
          summary: 'Gaara captured: the Shukaku is extracted.',
          importance: 5,
          tags: ['canon'],
          pinned: true,
          sourceLogId: null,
          createdAt: 1,
        },
      ],
      state: {
        ...db.state,
        canonProgress: {
          version: CANON_VERSION,
          baselineDate: db.state.inStoryDate,
          baselineTurn: 0,
          completed: ['gaara-captured'],
          active: [],
          engaged: [],
          expired: [],
          heard: {},
        },
      },
    };
    const news = unheardCanonNews(db, 5);
    expect(news.some((n) => n.milestoneId === 'gaara-captured')).toBe(true);

    const delivered = markNewsHeard(db, [{ id: 'gaara-captured', from: 'a traveling merchant' }]);
    expect(unheardCanonNews(delivered, 5).some((n) => n.milestoneId === 'gaara-captured')).toBe(false);
    expect(delivered.state.canonProgress?.heard?.['event_canon_gaara-captured']?.from).toBe('a traveling merchant');
  });

  test('witnessed beats are marked heard automatically', () => {
    let db = loadSave();
    db = applyCanonMarks(db, ['itachi-vs-sasuke'], []);
    const heard = db.state.canonProgress?.heard?.['event_canon_itachi-vs-sasuke'];
    expect(heard?.from).toBe('witnessed');
  });

  test('news block appears in prompt with courier channel', () => {
    let db = loadSave();
    db = {
      ...db,
      events: [
        ...db.events,
        {
          id: 'event_canon_gaara-captured',
          chapter: 1,
          scene: 'Canon event',
          inStoryDate: db.state.inStoryDate,
          summary: 'Gaara captured: the Shukaku is extracted.',
          importance: 5,
          tags: ['canon'],
          pinned: true,
          sourceLogId: null,
          createdAt: 1,
        },
      ],
      state: {
        ...db.state,
        canonProgress: {
          version: CANON_VERSION,
          baselineDate: db.state.inStoryDate,
          baselineTurn: 0,
          completed: ['gaara-captured'],
          active: [],
          engaged: [],
          expired: [],
          heard: {},
        },
      },
    };
    const prompt = buildNarrationPrompt(db, '*Kan waits.*');
    const dynamic = prompt.messages[1].content;

    expect(dynamic).toContain('NEWS & RUMORS');
    expect(dynamic).toContain('Gaara captured');
  });

  test('heard news disappears from the prompt queue', () => {
    let db = loadSave();
    db = applyCanonMarks(db, ['gaara-captured'], []);
    const prompt = buildNarrationPrompt(db, '*Kan waits.*');
    expect(prompt.messages[1].content).not.toContain('NEWS & RUMORS');
  });
});

describe('place names', () => {
  test('the narrator still sees which Japanese names to avoid', () => {
    const db = loadSave();
    const system = buildNarrationPrompt(db, '*Kan waits.*').messages[0].content;
    expect(system).toContain('Hidden Leaf (never Konoha)');
    expect(system).toContain('Hidden Rain (never Amegakure)');
    expect(system).not.toContain('(never Hidden');
  });

  test('everything else is still translated', () => {
    expect(localizePlaceNames(`Rumors from Konoha. ${PLACE_NAME_RULE} Sunagakure is quiet.`)).toBe(
      `Rumors from Hidden Leaf. ${PLACE_NAME_RULE} Hidden Sand Village is quiet.`
    );
  });
});

describe('narration clock parsing', () => {
  const current = { year: 13, month: 10, day: 4, hour: 22, minute: 0, second: 0 };

  test('never reads calendar dates from prose (audit 4.1)', () => {
    const parsed = detectNarrationTime(
      'By the time full darkness falls on the fifth of October, the gate is close.',
      current
    );
    expect((parsed as any).explicitDate).toBeUndefined();

    // Only the event ("darkness falls") is read, never "the fifth of October".
    expect(parsed.clock).toEqual({ hour: 21, minute: 0 });
    expect(applyParsedTime(current, { elapsedSeconds: 0 }).day).toBe(4);
  });

  test('detects elapsed days, hours and seconds', () => {
    expect(detectNarrationTime('Two days later, they reached the quarry.', current).elapsedSeconds).toBe(2 * 86400);
    expect(detectNarrationTime('They traveled for three days across the ridge.', current).elapsedSeconds).toBe(3 * 86400);
    expect(detectNarrationTime('A week passed before the rain stopped.', current).elapsedSeconds).toBe(7 * 86400);
    expect(detectNarrationTime('A good night\'s sleep left him rested.', current).sleptNight).toBe(true);
    expect(detectNarrationTime('A short rest by the fire.', current).elapsedSeconds).toBe(1800);
    expect(detectNarrationTime('A heartbeat later, the blade was at his throat.', current).elapsedSeconds).toBe(2);
  });

  test('ignores past, distance and future phrasing', () => {
    expect(detectNarrationTime('Three nights of flight had hollowed him out.', current).elapsedSeconds).toBe(0);
    expect(detectNarrationTime('The contract was signed four months ago.', current).elapsedSeconds).toBe(0);
    expect(detectNarrationTime('The graves will be watched for a week.', current).elapsedSeconds).toBe(0);
    expect(detectNarrationTime('It was a two-day march to the quarry.', current).elapsedSeconds).toBe(0);
  });

  test('spoken plans never move the clock', () => {
    const morning = { year: 13, month: 10, day: 4, hour: 10, minute: 0, second: 0 };
    const spoken = detectNarrationTime(
      'Itachi does not slow. "Walk until nightfall, Kan. We rest at dawn, and in two days we cross the border." He waits for your answer.',
      morning
    );
    expect(spoken.clock).toBeUndefined();
    expect(spoken.elapsedSeconds).toBe(0);

    const curly = detectNarrationTime('“We leave the next morning,” he says.', morning);
    expect(curly.elapsedSeconds).toBe(0);
    expect(curly.clock).toBeUndefined();

    // Narration outside the quotes still counts: "until nightfall" is a period
    // hint, used only when the tracker's clock agrees (audit 4.2).
    const narrated = detectNarrationTime('"Keep up." You walk until nightfall.', morning);
    expect(narrated.clock).toBeUndefined();
    expect(narrated.periodHint).toEqual({ hour: 21, minute: 0 });

    // A quote left open runs to the end of its paragraph only.
    const open = detectNarrationTime('"Until nightfall, then\nTwo hours later, you reach the river.', morning);
    expect(open.clock).toBeUndefined();
    expect(open.elapsedSeconds).toBe(2 * 3600);
  });

  test('allows a word or two between the number and the unit', () => {
    expect(detectNarrationTime('After two relentless hours, the trees thin out.', current).elapsedSeconds).toBe(2 * 3600);
    expect(detectNarrationTime('Three long, cold days later, the border appears.', current).elapsedSeconds).toBe(3 * 86400);
    expect(detectNarrationTime('You spent a few more days in the hideout.', current).elapsedSeconds).toBe(3 * 86400);
    expect(detectNarrationTime('You waited a couple of minutes.', current).elapsedSeconds).toBe(120);
    // Still no elapsed marker, still nothing.
    expect(detectNarrationTime('The two silent men watched for hours.', current).elapsedSeconds).toBe(0);
  });

  test('detects exact clocks and rolls the day when needed', () => {
    const evening = detectNarrationTime('It is evening now.', current);
    expect(evening.clock).toEqual({ hour: 19, minute: 0 });

    const applied = applyParsedTime(current, evening);
    expect(applied.day).toBe(5);
    expect(applied.hour).toBe(19);

    const explicit = detectNarrationTime('At 3:40 PM she finally answered.', current);
    expect(explicit.clock).toEqual({ hour: 15, minute: 40 });
  });
});

describe('clock arithmetic', () => {
  test('rolls over minutes, hours, days, months and years', () => {
    const base = { year: 13, month: 10, day: 4, hour: 23, minute: 58, second: 30 };

    const plusMinutes = advanceSeconds(base, 150);
    expect(plusMinutes.day).toBe(5);
    expect(plusMinutes.hour).toBe(0);
    expect(plusMinutes.minute).toBe(1);
    expect(plusMinutes.second).toBe(0);

    // October has 31 days: Oct 4 + 27 days = Oct 31.
    const plusDays = advanceSeconds(base, 86400 * 27);
    expect(plusDays.month).toBe(10);
    expect(plusDays.day).toBe(31);

    const plusYear = advanceSeconds(base, 86400 * 365);
    expect(plusYear.year).toBe(14);
  });

  test('formats AM/PM and derives day periods', () => {
    expect(formatClock({ year: 13, month: 10, day: 4, hour: 22, minute: 5 })).toBe('10:05 PM');
    expect(formatClock({ year: 13, month: 10, day: 4, hour: 0, minute: 0 })).toBe('12:00 AM');
    expect(timeOfDayOf({ year: 13, month: 10, day: 4, hour: 8, minute: 0 })).toBe('morning');
    expect(timeOfDayOf({ year: 13, month: 10, day: 4, hour: 19, minute: 0 })).toBe('evening');
    expect(timeOfDayOf({ year: 13, month: 10, day: 4, hour: 2, minute: 0 })).toBe('night');
  });

  test('months have their real lengths and leap years work', () => {
    expect(daysInMonth(13, 1)).toBe(31);
    expect(daysInMonth(13, 6)).toBe(30);
    expect(daysInMonth(13, 9)).toBe(30);
    expect(daysInMonth(13, 10)).toBe(31);
    expect(daysInMonth(13, 12)).toBe(31);
    expect(daysInMonth(15, 2)).toBe(28);
    expect(daysInMonth(16, 2)).toBe(29);
    expect(daysInMonth(100, 2)).toBe(28);
    expect(daysInMonth(400, 2)).toBe(29);

    const octoberEnd = advanceSeconds({ year: 13, month: 10, day: 31, hour: 23, minute: 59, second: 0 }, 120);
    expect(octoberEnd.month).toBe(11);
    expect(octoberEnd.day).toBe(1);
    expect(octoberEnd.hour).toBe(0);
    expect(octoberEnd.minute).toBe(1);

    const januaryEnd = advanceSeconds({ year: 13, month: 1, day: 31, hour: 12, minute: 0, second: 0 }, 86400);
    expect(januaryEnd.month).toBe(2);
    expect(januaryEnd.day).toBe(1);

    const commonFeb = advanceSeconds({ year: 15, month: 2, day: 28, hour: 12, minute: 0, second: 0 }, 86400);
    expect(commonFeb.month).toBe(3);
    expect(commonFeb.day).toBe(1);

    const leapFeb = advanceSeconds({ year: 16, month: 2, day: 28, hour: 12, minute: 0, second: 0 }, 86400);
    expect(leapFeb.month).toBe(2);
    expect(leapFeb.day).toBe(29);
  });

  test('pacing caps keep fights and travel honest', () => {
    expect(paceCapSeconds('combat', false)).toBe(600);
    expect(paceCapSeconds('combat', true)).toBe(7200);
    expect(paceCapSeconds('travel', false)).toBe(3 * 86400);
    expect(paceCapSeconds('downtime', false)).toBe(7 * 86400);
    expect(paceCapSeconds('conversation', false)).toBe(3600);
  });
});

describe('image brief', () => {
  test('image prompt follows the action brief and live cast', () => {
    let db = loadSave();
    db = applyTurnDiff(db, {
      state: {
        sceneCast: ['Itachi Uchiha'],
      },
    });

    const prompt = buildSceneImagePrompt(
      db,
      [
        { kind: 'face', uri: 'data:face' },
        { kind: 'outfit', uri: 'data:outfit' },
      ],
      'Kan chokes a Stone ninja from behind at the quarry gate; the ninja\'s face reddens.'
    );

    expect(prompt).toContain("Reference image 1: Kan's face sheet");
    expect(prompt).toContain('Reference image 2: the clothes Kan currently wears');

    expect(prompt).toContain('ACTION (depict this exactly)');
    expect(prompt).toContain('chokes a Stone ninja');
    expect(prompt).toContain('NEVER depict Kan as the victim');
    expect(prompt).toContain('Named people in this scene besides Kan: Itachi Uchiha');
    expect(prompt).not.toContain('Kan is alone');
  });

  test('upcoming world rumors are shown before they happen', () => {
    let db = loadSave();
    const prompt = buildNarrationPrompt(db, '*Kan waits.*');
    const dynamic = prompt.messages[1].content;

    expect(dynamic).toContain("RUMORS OF WHAT'S COMING");
    expect(dynamic).toContain("Izumi Uchiha's funeral");
  });

  test('narrated canon completion is marked witnessed', () => {
    let db = loadSave();
    db = applyCanonMarks(db, ['kan-joins-akatsuki'], []);
    expect(db.state.canonProgress?.heard?.['event_canon_kan-joins-akatsuki']?.from).toBe('witnessed');
  });
});

describe('scene pacing and the clock', () => {
  test('infers pace from narration', () => {
    expect(inferScenePace('Kan chokes a Stone ninja while the blade whistles past.')).toBe('combat');
    expect(inferScenePace('They rode for two days along the border road.')).toBe('travel');
    expect(inferScenePace('Kan sleeps until the coals die down.')).toBe('downtime');
    expect(inferScenePace('Itachi says nothing and looks away.')).toBe('conversation');
    expect(inferScenePace('The Root hounds are hunting him through the trees.')).toBe('chase');
    // One fighting word is not a fight: a quiet scene must not freeze the clock.
    expect(inferScenePace('You wipe the blood from your sleeve and sit by the fire.')).toBe('conversation');
    expect(inferScenePace('Itachi says the jutsu can wait.')).toBe('conversation');
    expect(inferScenePace('You cut the bread and hand Itachi half.')).toBe('conversation');
  });

  test('combat caps time even if the narrator overreports', () => {
    const capped = resolveElapsedSeconds({
      reportedSeconds: 2 * 86400,
      detectedSeconds: 0,
      pace: 'combat',
      sceneEnded: false,
    });
    expect(capped).toBe(600);
  });

  test('travel respects explicit days but caps at three', () => {
    expect(
      resolveElapsedSeconds({ reportedSeconds: 2 * 86400, detectedSeconds: 0, pace: 'travel', sceneEnded: false })
    ).toBe(2 * 86400);
    expect(
      resolveElapsedSeconds({ reportedSeconds: 30 * 86400, detectedSeconds: 0, pace: 'travel', sceneEnded: false })
    ).toBe(3 * 86400);
  });

  test('fight seconds accumulate correctly on the clock', () => {
    const start = { year: 13, month: 10, day: 4, hour: 14, minute: 0, second: 0 };
    const afterOneStrike = advanceSeconds(start, 8);
    const afterShortFight = advanceSeconds(start, 8 * 3);

    expect(afterOneStrike.second).toBe(8);
    expect(afterShortFight.second).toBe(24);
    expect(afterShortFight.day).toBe(4);
  });

  test('a ninth-hour sleep crosses into the next morning', () => {
    const start = { year: 13, month: 10, day: 4, hour: 22, minute: 0, second: 0 };
    const wake = advanceSeconds(start, 9 * 3600);

    expect(wake.day).toBe(5);
    expect(wake.hour).toBe(7);
    expect(timeOfDayOf(wake)).toBe('morning');
  });
});

describe('canon + clock integration', () => {
  test('milestones open exactly on their real-calendar date', () => {
    let db = loadSave();
    db = {
      ...db,
      state: {
        ...db.state,
        canonProgress: {
          version: CANON_VERSION,
          baselineDate: { year: 13, month: 10, day: 1, hour: 22, minute: 0, second: 0 },
          baselineTurn: 0,
          completed: [],
          active: [],
          engaged: [],
          expired: [],
          heard: {},
        },
      },
      rawLog: Array.from({ length: 12 }, (_, i) => ({
        ...db.rawLog[0],
        id: `m_${i}`,
        kind: 'story' as const,
        role: 'assistant' as const,
        content: 'x',
        createdAt: i,
      })),
    };

    const before = advanceCanon({ ...db, state: { ...db.state, inStoryDate: { year: 13, month: 10, day: 5, hour: 22, minute: 0, second: 0 } } });
    expect(before.state.canonProgress?.completed).not.toContain('izumi-funeral');

    const onDay = advanceCanon({ ...db, state: { ...db.state, inStoryDate: { year: 13, month: 10, day: 6, hour: 22, minute: 0, second: 0 } } });
    expect(onDay.state.canonProgress?.completed).toContain('izumi-funeral');
  });

  test('completed encounters are not listed as active, personal ones are', () => {
    let db = loadSave();
    db = applyCanonMarks(db, ['kan-joins-akatsuki'], []);
    expect(activeCanonMilestones(db).some((m) => m.id === 'kan-joins-akatsuki')).toBe(false);

    const engaged = applyCanonMarks(db, [], ['masked-man-audience']);
    expect(activeCanonMilestones(engaged).some((m) => m.id === 'masked-man-audience')).toBe(true);
  });

  test('combat blocks date jumps but allows the clock to move forward', () => {
    const current = { year: 13, month: 10, day: 4, hour: 18, minute: 0, second: 0 };

    const fight = resolveTurnClock({
      reportedSeconds: 2 * 86400,
      detected: {
        elapsedSeconds: 2 * 86400,
        explicitDate: { year: 13, month: 10, day: 6, hour: 22, minute: 0, second: 0 },
        clock: { hour: 20, minute: 0 },
      },
      pace: 'combat',
      sceneEnded: false,
      current,
    });

    // Capped at 600 s of fighting, then the stated hour (forward, same day) lands.
    expect(fight.elapsedSeconds).toBe(2 * 3600);
  });

  test('every turn moves at least the pace minimum', () => {
    const current = { year: 13, month: 10, day: 4, hour: 18, minute: 0, second: 0 };
    const none = { elapsedSeconds: 0 };
    const run = (pace: 'combat' | 'chase' | 'conversation' | 'downtime' | 'travel') =>
      resolveTurnClock({ reportedSeconds: 0, detected: none, pace, sceneEnded: false, current });

    expect(run('combat').elapsedSeconds).toBe(15);
    expect(run('chase').elapsedSeconds).toBe(60);
    expect(run('conversation').elapsedSeconds).toBe(120);
    expect(run('downtime').elapsedSeconds).toBe(600);
    expect(run('travel').elapsedSeconds).toBe(1800);
    expect(run('conversation').storyTimed).toBe(false);
  });

  test('the largest of reported, parsed and minimum wins', () => {
    const current = { year: 13, month: 10, day: 4, hour: 18, minute: 0, second: 0 };
    const result = resolveTurnClock({
      reportedSeconds: 300,
      detected: { elapsedSeconds: 900 },
      pace: 'conversation',
      sceneEnded: false,
      current,
    });
    expect(result.elapsedSeconds).toBe(900);
    expect(result.storyTimed).toBe(true);
  });

  test('fights cannot skip days, travel only when the story says so', () => {
    const current = { year: 13, month: 10, day: 4, hour: 18, minute: 0, second: 0 };
    const fight = resolveTurnClock({
      reportedSeconds: 3 * 86400,
      detected: { elapsedSeconds: 0 },
      pace: 'combat',
      sceneEnded: false,
      current,
    });
    expect(fight.elapsedSeconds).toBe(600);

    const quietRoad = resolveTurnClock({
      reportedSeconds: 0,
      detected: { elapsedSeconds: 0 },
      pace: 'travel',
      sceneEnded: false,
      current,
    });
    expect(quietRoad.elapsedSeconds).toBe(1800);

    const longRoad = resolveTurnClock({
      reportedSeconds: 2 * 86400,
      detected: { elapsedSeconds: 0 },
      pace: 'travel',
      sceneEnded: false,
      current,
    });
    expect(longRoad.elapsedSeconds).toBe(2 * 86400);
  });

  test('a full night of sleep jumps to the next morning', () => {
    const late = { year: 13, month: 10, day: 4, hour: 22, minute: 30, second: 0 };
    const parsed = detectNarrationTime('After a full night\'s sleep, the fire is cold.', late);
    const result = resolveTurnClock({
      reportedSeconds: 0,
      detected: parsed,
      pace: 'conversation',
      sceneEnded: false,
      current: late,
    });
    const wake = advanceSeconds(late, result.elapsedSeconds);
    expect(wake.day).toBe(5);
    expect(wake.hour).toBe(7);
    expect(wake.minute).toBe(0);
  });

  test('a stated duration beats a guessed clock_time', () => {
    const current = { year: 13, month: 10, day: 4, hour: 8, minute: 0, second: 0 };
    // "Two relentless hours" + a guessed 14:00 used to move six hours.
    const guessed = resolveTurnClock({
      reportedSeconds: 2 * 3600,
      reportedClock: { hour: 14, minute: 0 },
      detected: detectNarrationTime('After two relentless hours, the trees thin out.', current),
      pace: 'travel',
      sceneEnded: false,
      current,
    });
    expect(guessed.elapsedSeconds).toBe(2 * 3600);

    // A reported clock that fits the duration still lands.
    const fits = resolveTurnClock({
      reportedSeconds: 2 * 3600,
      reportedClock: { hour: 10, minute: 15 },
      detected: { elapsedSeconds: 0 },
      pace: 'travel',
      sceneEnded: false,
      current,
    });
    expect(fits.elapsedSeconds).toBe(2 * 3600 + 15 * 60);

    // An hour the prose names still wins over the duration.
    const named = resolveTurnClock({
      reportedSeconds: 2 * 3600,
      detected: detectNarrationTime('Two hours later, at seven in the evening, you reach the river.', current),
      pace: 'travel',
      sceneEnded: false,
      current,
    });
    expect(named.elapsedSeconds).toBe(11 * 3600);

    // "by dusk" alone is a period word, not an hour: it counts only when the
    // tracker's clock agrees (audit 4.2).
    const dusk = detectNarrationTime('Two hours later, by dusk, you reach the river.', current);
    expect(dusk.clock).toBeUndefined();
    expect(
      resolveTurnClock({ reportedSeconds: 2 * 3600, detected: dusk, pace: 'travel', sceneEnded: false, current })
        .elapsedSeconds
    ).toBe(2 * 3600);

    // With no duration, a reported clock never rolls into tomorrow.
    const backwards = resolveTurnClock({
      reportedSeconds: 0,
      reportedClock: { hour: 6, minute: 0 },
      detected: { elapsedSeconds: 0 },
      pace: 'conversation',
      sceneEnded: false,
      current,
    });
    expect(backwards.elapsedSeconds).toBe(120);
  });

  test('an order in dialogue does not jump the clock', () => {
    const current = { year: 13, month: 10, day: 4, hour: 10, minute: 0, second: 0 };
    const prose = 'Itachi looks back once. "Walk until nightfall, Kan." The forest is quiet.';
    const result = resolveTurnClock({
      reportedSeconds: 0,
      detected: detectNarrationTime(prose, current),
      pace: 'conversation',
      sceneEnded: false,
      current,
    });
    expect(result.elapsedSeconds).toBe(120);
  });

  test('a restated current hour does not roll the clock a day', () => {
    const current = { year: 13, month: 10, day: 4, hour: 15, minute: 45, second: 0 };
    const result = resolveTurnClock({
      reportedSeconds: 0,
      detected: { elapsedSeconds: 0, clock: { hour: 15, minute: 40 } },
      pace: 'conversation',
      sceneEnded: false,
      current,
    });
    expect(result.elapsedSeconds).toBe(120);
  });

  test('a reply time correction shifts the clock by the difference', async () => {
    const { correctTurnTime } = await import('../lib/rpg/memoryJobs');
    const base = loadSave();
    const db = {
      ...base,
      rawLog: [
        {
          id: 'reply_1',
          turn: 1,
          kind: 'story' as const,
          role: 'assistant' as const,
          content: 'x',
          model: null,
          promptTokens: 0,
          completionTokens: 0,
          chapter: 1,
          scene: 'x',
          inStoryDate: base.state.inStoryDate,
          createdAt: 0,
          elapsedSeconds: 120,
        },
      ],
    };
    const corrected = correctTurnTime(db, 'reply_1', 3600);
    expect(corrected).not.toBeNull();
    expect(corrected!.rawLog[0].elapsedSeconds).toBe(3600);
    expect(dateSortValue(corrected!.state.inStoryDate) - dateSortValue(db.state.inStoryDate)).toBe(3480);

    const back = correctTurnTime(corrected!, 'reply_1', 15);
    expect(dateSortValue(back!.state.inStoryDate) - dateSortValue(db.state.inStoryDate)).toBe(-105);
  });

  test('scenePace survives an export/import round trip', () => {
    let db = loadSave();
    db = applyTurnDiff(db, { state: { scenePace: 'travel' } });
    const round = normalizeDatabase(JSON.parse(JSON.stringify(db)));
    expect(round.state.scenePace).toBe('travel');
  });
});

describe('portraits', () => {
  test('mood text maps to a coarse expression, leading word first', async () => {
    const { expressionFromMood } = await import('../lib/rpg/portrait');
    expect(expressionFromMood('Numb, guarded, quietly exhausted')).toBe('tired');
    expect(expressionFromMood('Guarded, numb')).toBe('grim');
    expect(expressionFromMood('Furious and cold')).toBe('angry');
    expect(expressionFromMood('Something unusual')).toBe('calm');
  });

  test('a portrait goes stale on outfit, age, expression or setting changes only', async () => {
    const { portraitSignature, portraitStaleReason } = await import('../lib/rpg/portrait');
    const db = seedDatabase('slot_portrait', 'Portrait');
    const signature = portraitSignature(db);
    const record = {
      id: 'p1',
      image: 'img:x',
      signature,
      inStoryDate: db.state.inStoryDate,
      location: db.state.location,
      createdAt: 0,
    };

    expect(portraitStaleReason(null, signature)).toBe('No portrait yet');
    expect(portraitStaleReason(record, signature)).toBeNull();

    const reworded = { ...db, state: { ...db.state, mood: 'Exhausted, numb, quiet' } };
    expect(portraitStaleReason(record, portraitSignature(reworded))).toBeNull();

    const cloaked = { ...db, state: { ...db.state, inventory: [...db.state.inventory, 'Akatsuki cloak'] } };
    expect(portraitStaleReason(record, portraitSignature(cloaked))).toBe('Now wearing the Akatsuki cloak');

    const older = { ...db, state: { ...db.state, inStoryDate: { ...db.state.inStoryDate, year: db.state.inStoryDate.year + 1 } } };
    expect(portraitStaleReason(record, portraitSignature(older))).toBe(`Turned ${signature.age + 1}`);
  });

  test('saves keep image references and old portraits through normalize', () => {
    const db = seedDatabase('slot_refs', 'Refs');
    const withPortrait = {
      ...db,
      portraits: [
        { id: 'p1', image: 'img:abc', signature: { age: 13, outfit: 'black' as const, expression: 'tired' as const, setting: 'wilds' as const }, inStoryDate: db.state.inStoryDate, location: 'x', createdAt: 1 },
      ],
    };
    const normalized = normalizeDatabase(withPortrait);
    expect(normalized.portraits?.length).toBe(1);
    expect(normalized.portraits?.[0].image).toBe('img:abc');
  });
});

describe('character portraits', () => {
  async function setup() {
    const mod = await import('../lib/rpg/characterPortrait');
    const db = seedDatabase('slot_cportrait', 'Character portraits');
    const itachi = db.entities.find((entity) => entity.name.startsWith('Itachi'))!;
    return { mod, db, itachi };
  }

  test('a character portrait goes stale on age, look, expression or a new face reference', async () => {
    const { mod, db, itachi } = await setup();
    const signature = mod.characterPortraitSignature(db, itachi);
    const withPortrait = mod.addCharacterPortraitToDb(db, itachi.id, 'img:a', signature, false);
    const latest = mod.latestCharacterPortrait(withPortrait, itachi.id)!;

    expect(mod.characterPortraitStaleReason(null, signature)).toBe('No portrait yet');
    expect(mod.characterPortraitStaleReason(latest, signature)).toBeNull();
    expect(mod.characterPortraitStaleReason(latest, signature, { hasFace: true })).toBe('Face reference added');

    const older = { ...db, state: { ...db.state, inStoryDate: { ...db.state.inStoryDate, year: db.state.inStoryDate.year + 1 } } };
    const olderSig = mod.characterPortraitSignature(older, itachi);
    if (signature.age !== null) {
      expect(mod.characterPortraitStaleReason(latest, olderSig)).toBe(`Turned ${signature.age + 1}`);
    }
    // The dead stop ageing and changing.
    expect(mod.characterPortraitStaleReason(latest, olderSig, { dead: true })).toBeNull();

    const restyled = mod.characterPortraitSignature(db, { ...itachi, appearance: 'Long black hair, Akatsuki cloak.' });
    expect(mod.characterPortraitStaleReason(latest, restyled)).toBe('Their look has changed');

    const angry = mod.characterPortraitSignature(db, { ...itachi, mood: 'Furious' });
    expect(mod.characterPortraitStaleReason(latest, angry)).toBe('Looks angry now');
  });

  test('only the newest few portraits are kept per person', async () => {
    const { mod, db, itachi } = await setup();
    const signature = mod.characterPortraitSignature(db, itachi);
    let next = db;
    for (let i = 0; i < mod.PORTRAITS_PER_CHARACTER + 3; i += 1) {
      next = mod.addCharacterPortraitToDb(next, itachi.id, `img:${i}`, { ...signature, appearance: `${signature.appearance} ${i}` }, false);
    }
    next = mod.addCharacterPortraitToDb(next, 'someone-else', 'img:other', signature, false);
    expect(mod.characterPortraitsOf(next, itachi.id).length).toBe(mod.PORTRAITS_PER_CHARACTER);
    expect(mod.latestCharacterPortrait(next, itachi.id)?.image).toBe(`img:${mod.PORTRAITS_PER_CHARACTER + 2}`);
    expect(mod.latestCharacterPortraitMap(next).get('someone-else')).toBe('img:other');
  });

  test('the same painting landing twice is kept once, and a second one cannot start while one runs', async () => {
    const { mod, db, itachi } = await setup();
    const signature = mod.characterPortraitSignature(db, itachi);
    let next = mod.addCharacterPortraitToDb(db, itachi.id, 'img:a', signature, false);
    next = mod.addCharacterPortraitToDb(next, itachi.id, 'img:b', signature, false);
    expect(mod.characterPortraitsOf(next, itachi.id).map((portrait: { image: string }) => portrait.image)).toEqual(['img:a']);
    expect(mod.alreadyPainted(mod.latestCharacterPortrait(next, itachi.id), signature, false)).toBe(true);

    const key = mod.portraitKey(itachi.id, signature);
    expect(mod.beginPainting(key)).toBe(true);
    expect(mod.beginPainting(key)).toBe(false);
    mod.endPainting(key);
    expect(mod.beginPainting(key)).toBe(true);
    mod.endPainting(key);
  });

  test('the prompt uses the face reference when sent, canon design otherwise', async () => {
    const { mod, db, itachi } = await setup();
    const signature = mod.characterPortraitSignature(db, itachi);
    const withFace = mod.buildCharacterPortraitPrompt(db, itachi, signature, [{ kind: 'face', uri: 'data:x' }]);
    expect(withFace).toContain(`Reference image 1: this is ${itachi.name}.`);
    expect(withFace).not.toContain('canon design');
    const bare = mod.buildCharacterPortraitPrompt(db, itachi, signature, []);
    expect(bare).toContain('canon design');
    expect(bare).toContain('no other people');
  });

  test('face references are set, replaced and removed; merges carry images over', async () => {
    const { mod, db, itachi } = await setup();
    const signature = mod.characterPortraitSignature(db, itachi);
    let next = mod.setCharacterFaceInDb(db, itachi.id, 'img:face1');
    next = mod.setCharacterFaceInDb(next, itachi.id, 'img:face2');
    expect(next.characterFaces?.length).toBe(1);
    expect(mod.characterFaceOf(next, itachi.id)?.image).toBe('img:face2');
    expect(mod.characterFaceOf(mod.setCharacterFaceInDb(next, itachi.id, null), itachi.id)).toBeNull();

    // A duplicate "Itachi" with a portrait and a face folds into the real one.
    const dupe = { ...itachi, id: 'dupe-itachi', name: 'The Uchiha prodigy', aliases: [] };
    let split = { ...db, entities: [...db.entities, dupe] };
    split = mod.addCharacterPortraitToDb(split, dupe.id, 'img:dupe', signature, true);
    split = mod.setCharacterFaceInDb(split, dupe.id, 'img:dupeface');
    const merged = mergeEntityPair(split, itachi.id, dupe.id);
    expect(mod.latestCharacterPortrait(merged, itachi.id)?.image).toBe('img:dupe');
    expect(mod.characterFaceOf(merged, itachi.id)?.image).toBe('img:dupeface');
    expect(mod.characterPortraitsOf(merged, dupe.id).length).toBe(0);
  });

  test('scene images send the faces of people named in the action', async () => {
    const { mod, db, itachi } = await setup();
    const { sceneCharacterReferences } = await import('../lib/rpg/image');
    const hana = db.entities.find((entity) => entity.name.startsWith('Hana'))!;
    const signature = mod.characterPortraitSignature(db, itachi);
    let next = mod.addCharacterPortraitToDb(db, itachi.id, 'img:itachi-portrait', signature, false);
    next = mod.setCharacterFaceInDb(next, hana.id, 'img:hana-face');
    next = mod.addCharacterPortraitToDb(next, hana.id, 'img:hana-portrait', signature, true);

    const action = `${hana.name.split(' ')[0]} grips Kan's wrist while ${itachi.name.split(' ')[0]} watches from the trees.`;
    const refs = sceneCharacterReferences(next, action);
    // Named order, face reference over portrait, nobody who isn't named.
    expect(refs.map((ref) => [ref.name, ref.image, ref.source])).toEqual([
      [hana.name, 'img:hana-face', 'face'],
      [itachi.name, 'img:itachi-portrait', 'portrait'],
    ]);
    expect(sceneCharacterReferences(next, 'Kan stands alone in the rain.')).toEqual([]);
    expect(sceneCharacterReferences(next, action, 1).length).toBe(1);

    const plan = planReferences(
      [
        { kind: 'face', uri: 'data:kan' },
        { kind: 'outfit', uri: 'data:outfit' },
        { kind: 'previous', uri: 'data:old' },
        ...refs.map((ref) => ({ kind: 'character' as const, uri: 'data:' + ref.name, name: ref.name, source: ref.source })),
      ],
      4
    );
    // People outrank older scenes.
    expect(plan.references.map((r) => r.kind)).toEqual(['face', 'outfit', 'character', 'character']);
    const prompt = buildSceneImagePrompt(next, plan.references, action);
    expect(prompt).toContain(`Reference image 3: ${hana.name}'s face,`);
    expect(prompt).toContain(`Reference image 4: a portrait of ${itachi.name}:`);
    expect(prompt).toContain('Identity only');
    expect(prompt).toContain('never give one person another');
  });

  test('character portraits and faces survive normalize', async () => {
    const { mod, db, itachi } = await setup();
    const signature = mod.characterPortraitSignature(db, itachi);
    const saved = mod.setCharacterFaceInDb(
      mod.addCharacterPortraitToDb(db, itachi.id, 'img:p', signature, true),
      itachi.id,
      'img:f'
    );
    const normalized = normalizeDatabase({ ...saved, characterFaces: [...(saved.characterFaces ?? []), { bad: true } as never] });
    expect(normalized.characterPortraits?.[0].image).toBe('img:p');
    expect(normalized.characterFaces?.length).toBe(1);
  });
});

describe('two-call turn: prose narrator + structured state call', () => {
  function collectObjects(node: unknown, out: Record<string, unknown>[] = []) {
    if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>;

      if (record.type === 'object' || (Array.isArray(record.type) && record.type.includes('object'))) {
        out.push(record);
      }

      for (const value of Object.values(record)) {
        collectObjects(value, out);
      }
    }

    return out;
  }

  test('state schema is valid for strict structured output', () => {
    const objects = collectObjects(TURN_STATE_SCHEMA);
    expect(objects.length).toBeGreaterThan(5);

    for (const object of objects) {
      const properties = Object.keys(object.properties as Record<string, unknown>);
      expect(object.additionalProperties).toBe(false);
      expect([...(object.required as string[])].sort()).toEqual([...properties].sort());
    }
  });

  test('converts a full structured reply with nulls and empty lists', () => {
    const { diff, imageWorthy } = convertStateBlock({
      time: { elapsed: 2, unit: 'hours', clock_time: null },
      scene_pace: 'travel',
      location: 'Road north of the Hidden Leaf',
      location_kind: 'road',
      mood: null,
      world_description: null,
      canon_point: null,
      inventory_added: ['Rice balls'],
      inventory_removed: [],
      jutsu_used: [],
      bonds: [{ character: 'Itachi Uchiha', affinity_change: 1, status: null, note: null, relationship: null, attraction: null, romance_note: null }],
      facts: [{ entity: 'Kan', fact: 'Kan knows the massacre happened.', type: 'knowledge', who_knows: ['Kan', 'Itachi Uchiha'] }],
      threads: [{ title: 'Reach the Hidden Rain', description: 'You and Itachi head for the Hidden Rain.', status: 'open' }],
      new_characters: [],
      character_updates: [{ name: 'Itachi Uchiha', mood: 'withdrawn', appearance: null }],
      characters_present: ['Itachi Uchiha'],
      image_worthy: true,
      scene_ended: false,
      canon_engaged: [],
      canon_completed: [],
      canon_passed: [],
      news_relayed: [],
    });

    expect(imageWorthy).toBe(true);
    expect(diff?.imageWorthy).toBe(true);
    expect(diff?.state?.elapsedSeconds).toBe(7200);
    expect(diff?.state?.scenePace).toBe('travel');
    expect(diff?.state?.location).toBe('Road north of the Hidden Leaf');
    expect(diff?.state?.locationKind).toBe('road');
    expect(diff?.state?.inventoryAdded).toEqual(['Rice balls']);
    expect(diff?.state?.mood).toBeUndefined();
    expect(diff?.bonds?.[0].affinityDelta).toBe(1);
    expect(diff?.facts?.[0].type).toBe('knowledge');
    expect(diff?.facts?.[0].whoKnows).toEqual(['Kan', 'Itachi Uchiha']);
    expect(diff?.threads?.[0]).toMatchObject({ action: 'open', title: 'Reach the Hidden Rain' });
    expect(diff?.entities?.[0]).toMatchObject({ name: 'Itachi Uchiha', mood: 'withdrawn' });
    expect(diff?.canonCompleted).toEqual([]);
  });

  test('an all-unchanged structured reply says only that Kan is alone (characters_present [] is authoritative)', () => {
    const { diff } = convertStateBlock({
      time: { elapsed: null, unit: null, clock_time: null },
      scene_pace: null, location: null, location_kind: null, mood: null,
      world_description: null, canon_point: null, inventory_added: [], inventory_removed: [],
      jutsu_used: [], bonds: [], facts: [], threads: [], new_characters: [], character_updates: [],
      characters_present: [], image_worthy: false, scene_ended: false,
      canon_engaged: [], canon_completed: [], canon_passed: [], news_relayed: [],
    });

    expect(diff?.state).toEqual({ sceneCast: [] });
    expect(diff?.scene).toEqual({ ended: false, entities: [] });
    expect(diff?.bonds ?? []).toEqual([]);
    expect(diff?.facts ?? []).toEqual([]);
  });

  test('state prompt carries the turn prose and canon ids', () => {
    const db = loadSave();
    const prompt = buildExtractionPrompt(db, '*Kan follows.*', 'You walk for an hour behind Itachi.');
    const user = prompt.messages[1].content;

    expect(prompt.messages[0].content).toContain('state tracker');
    expect(user).toContain('THIS TURN');
    expect(user).toContain('You walk for an hour behind Itachi.');
    expect(user).toContain('TIME BEFORE THIS TURN');

    const tracked = [
      ...activeCanonMilestones(db).slice(0, 2).map((milestone) => milestone.id),
      ...unheardCanonNews(db, 3).map((item) => item.milestoneId),
    ];

    for (const id of tracked) {
      expect(user).toContain(id);
    }
  });

  test('streaming preview hides any code block or JSON a model adds anyway', () => {
    expect(streamingPreview('Rain falls.\n\nItachi waits.')).toBe('Rain falls.\n\nItachi waits.');
    expect(streamingPreview('Rain falls.\n\n```json\n{"mood"')).toBe('Rain falls.');
    expect(streamingPreview('Rain falls.\n{"state":')).toBe('Rain falls.');
    expect(streamingPreview('Rain falls. "Move," he says.')).toBe('Rain falls. "Move," he says.');
  });
});

describe('duplicate characters', () => {
  const kisameCount = (db: AppDatabase) =>
    db.entities.filter((entity) =>
      [entity.name, ...entity.aliases].some((name) => /\bkisame\b/i.test(name))
    ).length;

  test('the canon cast is loaded once each, unmet, with aliases', () => {
    const db = loadSave();
    const kisame = db.entities.find((entity) => entity.name === 'Kisame Hoshigaki');

    expect(kisame?.met).toBe(false);
    expect(kisame?.aliases).toContain('Kisame');
    expect(kisameCount(db)).toBe(1);
    // Itachi comes from the story seed, not the cast list, and is not doubled.
    expect(db.entities.filter((entity) => /\bitachi\b/i.test(entity.name)).length).toBe(1);
    // The real Madara is not pre-loaded: bare "Madara" still means the masked man.
    expect(resolveEntity(db, 'Madara')?.name).toBe('Tobi');
  });

  test('older saves gain the cast without doubling people they already have', () => {
    const seeded = loadSave();
    const old: AppDatabase = {
      ...seeded,
      entities: [
        ...seeded.entities.filter((entity) => entity.met !== false),
        { id: 'entity_old_kisame', name: 'Kisame', type: 'character', aliases: [], tags: [], role: 'Swordsman' },
      ],
    };

    const once = normalizeDatabase(old);
    const twice = normalizeDatabase(once);
    const kisame = once.entities.find((entity) => entity.id === 'entity_old_kisame');

    expect(kisameCount(once)).toBe(1);
    expect(kisame?.aliases).toContain('Kisame Hoshigaki');
    expect(kisame?.met).toBeUndefined();
    expect(twice.entities.length).toBe(once.entities.length);
  });

  test('the state prompt lists everyone by id', () => {
    const db = loadSave();
    const prompt = buildExtractionPrompt(db, 'I nod.', 'Kisame grins at you.')
      .messages.map((message) => message.content)
      .join('\n');

    expect(prompt).toContain('KNOWN CHARACTERS');
    expect(prompt).toContain('- kisame-hoshigaki: Kisame Hoshigaki (Kisame, Hoshigaki Kisame) [not met yet]');
    expect(prompt).toContain('- itachi-uchiha: Itachi Uchiha');
    expect(prompt).toContain('CHARACTERS IN THIS TURN');
    expect(TURN_STATE_SCHEMA.properties.bonds.items.properties).toHaveProperty('character_id');
    expect(TURN_STATE_SCHEMA.properties.new_characters.items.properties).toHaveProperty('is_new');
  });

  test('ids resolve to known people; only is_new adds someone', () => {
    let db = loadSave();
    const before = db.entities.length;
    const { diff } = convertStateBlock({
      characters_present: ['kisame-hoshigaki', 'itachi-uchiha', 'Haku the Fisherman'],
      bonds: [
        { character_id: 'kisame-hoshigaki', affinity_change: 1, status: 'Wary', note: null, relationship: null, attraction: null, romance_note: null },
        { character_id: 'some-stranger', affinity_change: 2, status: null, note: null, relationship: null, attraction: null, romance_note: null },
      ],
      new_characters: [
        { is_new: false, name: 'Kisame', age: 30, role: null, personality: null, speech_style: null, appearance: null },
        { is_new: true, name: 'Hoshigaki Kisame', age: null, role: 'Swordsman', personality: null, speech_style: null, appearance: null },
        { is_new: true, name: 'Haku the Fisherman', age: 50, role: 'Ferryman', personality: null, speech_style: null, appearance: null },
      ],
      character_updates: [
        { character_id: 'itachi-uchiha', mood: 'tired', appearance: null },
        { character_id: 'nobody-at-all', mood: 'angry', appearance: null },
      ],
      jutsu_used: [{ name: 'Water Prison', user: 'kisame-hoshigaki', chakra_nature: 'Water', effect: null, visual: null }],
    });

    db = applyTurnDiff(db, resolveCharacterRefs(db, diff as TurnDiff));

    const kisame = db.entities.find((entity) => entity.name === 'Kisame Hoshigaki');

    expect(kisameCount(db)).toBe(1);
    expect(kisame?.met).toBe(true);
    expect(db.bonds.find((bond) => bond.entityId === kisame?.id)?.status).toBe('Wary');
    expect(db.bonds.some((bond) => bond.characterName === 'some-stranger')).toBe(false);
    expect(db.entities.length).toBe(before + 1);
    expect(db.entities.some((entity) => entity.name === 'Haku the Fisherman')).toBe(true);
    expect(db.entities.find((entity) => entity.name === 'Itachi Uchiha')?.mood).toBe('tired');
    expect(db.state.sceneCast).toEqual(['Kisame Hoshigaki', 'Itachi Uchiha', 'Haku the Fisherman']);
    expect(db.jutsuRecords.find((record) => record.name === 'Water Prison')?.user).toBe('Kisame Hoshigaki');
  });

  test('merging folds one person into another', () => {
    let db = loadSave();
    db = applyEntityDiff(db, { name: 'Shark-faced man', isNew: true, role: 'Swordsman' });
    // Met in a scene: the scene cast is what makes him met and gives him a bond.
    db = applyTurnDiff(db, {
      scene: { ended: false, entities: ['Shark-faced man'] },
      bonds: [{ character: 'Shark-faced man', affinityDelta: 2, status: 'Respect' }],
    });

    const shark = db.entities.find((entity) => entity.name === 'Shark-faced man')!;
    const kisame = db.entities.find((entity) => entity.name === 'Kisame Hoshigaki')!;

    db = mergeEntityPair(db, kisame.id, shark.id);

    const merged = db.entities.find((entity) => entity.id === kisame.id);

    expect(db.entities.some((entity) => entity.id === shark.id)).toBe(false);
    expect(merged?.aliases).toContain('Shark-faced man');
    expect(merged?.met).toBeUndefined();
    expect(db.bonds.filter((bond) => bond.entityId === kisame.id).length).toBe(1);
    expect(db.bonds.find((bond) => bond.entityId === kisame.id)?.affinity).toBe(2);
    expect(resolveEntity(db, 'Shark-faced man')?.id).toBe(kisame.id);
  });
});

describe('name mentions', () => {
  test('names match whole words only', () => {
    expect(mentionsName('You fall asleep by the fire.', 'Lee')).toBe(false);
    expect(mentionsName('Lee bows deeply.', 'Lee')).toBe(true);
    expect(mentionsName('Hiruzen Sarutobi lights his pipe.', 'Tobi')).toBe(false);
    expect(mentionsName('Tobi waves.', 'tobi')).toBe(true);
    expect(mentionsName('Jūzō lowers his blade.', 'Jūzō')).toBe(true);
    expect(mentionsName('The pain in your side flares.', 'Pain')).toBe(false);
    expect(mentionsName('Pain looks down at you.', 'Pain')).toBe(true);
  });
});

describe('image model capabilities', () => {
  const caps = (params: ImageModelCaps['params'], maxReferences: number): ImageModelCaps => ({
    modelId: 'test/image',
    params,
    maxReferences,
    source: 'endpoints',
    fetchedAt: Date.now(),
  });

  test('Kan\'s face is the last reference to be left out', () => {
    const candidates = [
      { kind: 'previous' as const, uri: 'data:old' },
      { kind: 'face' as const, uri: 'data:face' },
      { kind: 'outfit' as const, uri: 'data:outfit' },
      { kind: 'alternate' as const, uri: 'data:alt' },
    ];

    const one = planReferences(candidates, 1);
    expect(one.references.map((r) => r.kind)).toEqual(['face']);
    expect(one.faceDropped).toBeNull();

    const three = planReferences(candidates, 3);
    expect(three.references.map((r) => r.kind)).toEqual(['face', 'outfit', 'previous']);

    const none = planReferences(candidates, 0);
    expect(none.references).toEqual([]);
    expect(none.faceDropped).toBe('no-references');

    const missing = planReferences([{ kind: 'face', uri: '' }, { kind: 'outfit', uri: 'data:o' }], 4);
    expect(missing.faceDropped).toBe('not-loaded');
  });

  test('requests carry only settings the model accepts', () => {
    const { body, sentReferences } = buildImageRequestBody(
      caps(
        {
          aspect_ratio: { type: 'enum', values: ['1:1', '3:2', '2:3'] },
          input_references: { type: 'range', min: 0, max: 2 },
        },
        2
      ),
      { prompt: 'p', references: ['a', 'b', 'c'], aspectRatio: '16:9' }
    );

    expect(body.aspect_ratio).toBe('3:2');
    expect(body.resolution).toBeUndefined();
    expect(body.quality).toBeUndefined();
    expect(body.output_format).toBeUndefined();
    expect(sentReferences).toBe(2);

    const full = buildImageRequestBody(
      caps(
        {
          resolution: { type: 'enum', values: ['1K', '2K'] },
          aspect_ratio: { type: 'enum', values: ['16:9', '3:4'] },
          quality: { type: 'enum', values: ['low', 'high'] },
          output_format: { type: 'enum', values: ['png', 'jpeg'] },
          output_compression: { type: 'range', min: 0, max: 100 },
        },
        0
      ),
      { prompt: 'p', references: ['a'], aspectRatio: '3:4' }
    );

    expect(full.body).toMatchObject({
      resolution: '1K',
      aspect_ratio: '3:4',
      quality: 'high',
      output_format: 'jpeg',
      output_compression: 80,
    });
    expect(full.body.input_references).toBeUndefined();
  });

  test('a scene without the face reference describes Kan in words', () => {
    const db = loadSave();
    const prompt = buildSceneImagePrompt(db, [], 'Kan stands in the rain.');
    expect(prompt).not.toContain('Reference image');
    expect(prompt).toContain('black spiky hair');
  });
});

describe('canon timing: dates only, combat holds, one news per turn', () => {
  const baseline = { year: 13, month: 10, day: 1, hour: 22, minute: 0 };
  const lateDate = { year: 16, month: 2, day: 1, hour: 8, minute: 0 };
  const withProgress = (db: AppDatabase, date = lateDate): AppDatabase => ({
    ...db,
    rawLog: [],
    state: {
      ...db.state,
      inStoryDate: date,
      canonProgress: {
        version: CANON_VERSION,
        baselineDate: baseline,
        baselineTurn: 0,
        completed: [],
        active: [],
        engaged: [],
      },
    },
  });

  test('world events fire from the date alone, with zero turns played', () => {
    const next = advanceCanon(withProgress(loadSave()));
    expect(next.state.canonProgress?.completed).toContain('juzo-death');
  });

  test('a long time skip fires everything due, not a capped handful', () => {
    const next = advanceCanon(withProgress(loadSave()));
    const opened = CANON_MILESTONES.filter(
      (m) => !m.playerDriven && m.from.year * 12 + m.from.month <= 16 * 12 + 2
    );
    expect(opened.length).toBeGreaterThan(4);
    for (const m of opened) {
      expect(next.state.canonProgress?.completed).toContain(m.id);
    }
  });

  test('fired events are dated when they happened, not when the clock caught up', () => {
    const next = advanceCanon(withProgress(loadSave()));
    const juzo = CANON_MILESTONES.find((m) => m.id === 'juzo-death')!;
    const event = next.events.find((e) => e.id === 'event_canon_juzo-death')!;
    expect(event.inStoryDate.year).toBe(juzo.from.year);
    expect(event.inStoryDate.month).toBe(juzo.from.month);
  });

  test('nothing fires or expires during combat; it all fires once the fight ends', () => {
    const db = withProgress(loadSave());
    const held = advanceCanon(db, { inCombat: true });
    expect(held.state.canonProgress?.completed ?? []).toEqual([]);
    expect(held.events.filter((e) => e.tags.includes('canon')).length).toBe(0);
    expect(held.state.canonProgress?.heldForCombat).toBe(true);

    const fromState = advanceCanon({ ...db, state: { ...db.state, scenePace: 'combat' } });
    expect(fromState.state.canonProgress?.completed ?? []).toEqual([]);

    const after = advanceCanon(held, { inCombat: false });
    expect(after.state.canonProgress?.completed).toContain('juzo-death');
    expect(after.state.canonProgress?.heldForCombat).toBe(false);
  });

  test('only one piece of news is marked heard per turn', () => {
    const db = advanceCanon(withProgress(loadSave()));
    const unheard = unheardCanonNews(db, 99);
    expect(unheard.length).toBeGreaterThan(1);
    const relayed = markNewsHeard(db, unheard.slice(0, 3).map((n) => ({ id: n.milestoneId, from: 'Kisame' })));
    expect(unheardCanonNews(relayed, 99).length).toBe(unheard.length - NEWS_PER_TURN);
  });

  test('narrator is offered at most one piece of news, and none mid-fight', () => {
    const fired = advanceCanon(withProgress(loadSave()));
    // Kan heard something today, so nothing has piled up: one item, not a catch-up.
    const db = {
      ...fired,
      state: {
        ...fired.state,
        canonProgress: { ...fired.state.canonProgress!, heard: { event_canon_none: { from: 'Kisame', date: lateDate } } },
      },
    };
    const calm = buildNarrationPrompt({ ...db, state: { ...db.state, scenePace: 'conversation' } }, '*Kan listens.*')
      .messages.map((m) => m.content).join('\n');
    const block = calm.split('NEWS & RUMORS (')[1]?.split('\n\n')[0] ?? '';
    expect(block.split('\n').filter((line) => line.startsWith('- ')).length).toBe(1);

    const fight = buildNarrationPrompt({ ...db, state: { ...db.state, scenePace: 'combat' } }, '*Kan strikes.*')
      .messages.map((m) => m.content).join('\n');
    expect(fight).not.toContain('NEWS & RUMORS (');
    expect(fight).not.toContain("RUMORS OF WHAT'S COMING (");
  });

  test('world clock shows fired, unheard and queued events', () => {
    const db = advanceCanon(withProgress(loadSave()));
    const clock = worldClock(db);
    expect(clock.fired.some((f) => f.milestone.id === 'juzo-death')).toBe(true);
    expect(clock.unheard.length).toBeGreaterThan(0);
    expect(clock.queued.length).toBeGreaterThan(0);
    expect(clock.queued.every((q) => !q.milestone.playerDriven)).toBe(true);
    expect(clock.queued.some((q) => q.milestone.id === 'war-begins')).toBe(true);
  });
});

describe('deaths', () => {
  const jiraiyaOf = (db: AppDatabase) => db.entities.find((entity) => entity.name === 'Jiraiya')!;
  // The world moves on to mid-year 22: Jiraiya's death fires off-screen.
  const afterJiraiya = (db: AppDatabase) =>
    advanceCanon({ ...db, state: { ...db.state, inStoryDate: { year: 22, month: 6, day: 1, hour: 8, minute: 0, second: 0 } } }, { inCombat: false });

  test('the seeded dead are recorded; Kan knows Shisui but not Izumi', () => {
    const db = loadSave();
    const shisui = db.entities.find((entity) => entity.name === 'Shisui Uchiha')!;
    const izumi = db.entities.find((entity) => entity.name === 'Izumi Uchiha')!;

    expect(isDeceased(shisui)).toBe(true);
    expect(kanKnowsDeath(db, shisui)).toBe(true);
    expect(isDeceased(izumi)).toBe(true);
    expect(kanKnowsDeath(db, izumi)).toBe(false);
  });

  test('a canon death marks the record, and Kan knows only once the news reaches him', () => {
    let db = loadSave();
    db = applyCanonMarks(db, ['jiraiya-dies'], []);
    // completed = witnessed
    expect(isDeceased(jiraiyaOf(db))).toBe(true);
    expect(kanKnowsDeath(db, jiraiyaOf(db))).toBe(true);

    let fresh = afterJiraiya(loadSave());
    expect(isDeceased(jiraiyaOf(fresh))).toBe(true);
    expect(kanKnowsDeath(fresh, jiraiyaOf(fresh))).toBe(false);
    fresh = markNewsHeard(fresh, [{ id: 'jiraiya-dies', from: 'Konan' }]);
    expect(kanKnowsDeath(fresh, jiraiyaOf(fresh))).toBe(true);
  });

  test('canon deaths use exact names only', () => {
    let db = loadSave();
    db = applyEntityDiff(db, { name: 'Ino Yamanaka', isNew: true, role: 'Genin' });
    db = applyTurnDiff(db, { entities: [{ name: 'Ino Yamanaka', isNew: false }] });
    db = { ...db, entities: db.entities.map((e) => (e.name === 'Ino Yamanaka' ? { ...e, aliases: ['Yamanaka'] } : e)) };
    db = markDeathsByName(db, ['Inoichi Yamanaka', 'Shikaku Nara'], {});
    expect(isDeceased(db.entities.find((e) => e.name === 'Ino Yamanaka')!)).toBe(false);
    expect(isDeceased(db.entities.find((e) => e.name === 'Shikamaru Nara')!)).toBe(false);
  });

  test('the state tracker reports a death on screen, including someone new this turn', () => {
    let db = canonDone(loadSave());
    const { diff } = convertStateBlock({
      new_characters: [{ is_new: true, name: 'Goro the Bandit', age: 30, role: 'Bandit', personality: null, speech_style: null, appearance: null }],
      deaths: [
        { character_id: 'Goro the Bandit', cause: 'Cut down by Kan on the road' },
        { character_id: 'kisame-hoshigaki', cause: null },
        { character_id: 'kan', cause: null },
        { character_id: 'nobody-at-all', cause: null },
      ],
    });

    db = applyTurnDiff(db, resolveCharacterRefs(db, diff as TurnDiff));

    const goro = db.entities.find((entity) => entity.name === 'Goro the Bandit')!;
    expect(goro.deceased?.known).toBe(true);
    expect(goro.deceased?.cause).toBe('Cut down by Kan on the road');
    expect(isDeceased(db.entities.find((e) => e.name === 'Kisame Hoshigaki')!)).toBe(true);
    expect(isDeceased(db.entities.find((e) => e.name === 'Kan')!)).toBe(false);
  });

  test('being told of a death makes it known; revived brings them back', () => {
    let db = loadSave();
    const izumiId = db.entities.find((entity) => entity.name === 'Izumi Uchiha')!.id;
    const { diff } = convertStateBlock({ deaths: [{ character_id: 'izumi-uchiha', cause: null }] });
    db = applyTurnDiff(db, resolveCharacterRefs(db, diff as TurnDiff));
    expect(kanKnowsDeath(db, db.entities.find((e) => e.id === izumiId)!)).toBe(true);

    db = afterJiraiya(db);
    const back = convertStateBlock({ revived: ['jiraiya'] }).diff;
    db = applyTurnDiff(db, resolveCharacterRefs(db, back as TurnDiff));
    expect(isDeceased(jiraiyaOf(db))).toBe(false);
    // Reloading never kills a revived person again.
    expect(isDeceased(jiraiyaOf(normalizeDatabase(db)))).toBe(false);
  });

  test('the dead are not "seen", and loading backfills deaths for older saves', () => {
    let db = afterJiraiya(loadSave());
    const before = jiraiyaOf(db).lastSeen;
    db = applyTurnDiff(db, { scene: { ended: false, entities: ['Jiraiya'] } });
    expect(jiraiyaOf(db).lastSeen).toEqual(before);

    const old = {
      ...db,
      entities: db.entities.map((entity) => {
        const { deceased: _d, ...rest } = entity;
        return entity.name === 'Jiraiya' ? rest : entity;
      }),
    };
    expect(isDeceased(jiraiyaOf(normalizeDatabase(old)))).toBe(true);
  });

  test('every turn the narrator and the state tracker see who is dead', () => {
    let db = afterJiraiya(loadSave());
    db = { ...db, facts: [...Array(30)].map((_, index) => ({ ...db.facts[0], id: `f${index}`, text: `Filler fact ${index}` })).concat(db.facts) };

    const narration = buildNarrationPrompt(db, '*Kan waits.*').messages.map((m) => m.content).join('\n');
    expect(narration).toContain('THE DEAD');
    expect(narration).toContain('- Jiraiya (Kan does not know yet)');
    expect(narration).toContain('- Izumi Uchiha (Kan does not know yet)');
    expect(narration).toContain('- Shisui Uchiha');

    const state = buildExtractionPrompt(db, '*Kan waits.*', 'Rain falls.').messages.map((m) => m.content).join('\n');
    expect(state).toMatch(/- jiraiya: Jiraiya.*deceased, Kan does not know yet\]/);
    expect(JSON.stringify(TURN_STATE_SCHEMA)).toContain('"deaths"');
  });

  test('canon milestones with deaths name people the cast can resolve', () => {
    const db = loadSave();
    for (const name of ['Jiraiya', 'Itachi Uchiha', 'Kisame Hoshigaki', 'Nagato', 'Obito Uchiha', 'Jūzō Biwa', 'Hiruzen Sarutobi', 'Danzo Shimura']) {
      const marked = markDeathsByName(db, [name], {});
      expect(marked).not.toBe(db);
    }
  });
});

describe('characters who come back', () => {
  const { returningCandidates, pickReturningCharacter, isReturnTurn, formatReturningCharacter, RETURN_WINDOW_TURNS } =
    require('../lib/rpg/returning') as typeof import('../lib/rpg/returning');

  function withOriginal(overrides: Partial<AppDatabase['entities'][number]> = {}) {
    const db = loadSave();
    const lastSeen = { ...db.state.inStoryDate, year: db.state.inStoryDate.year - 1 };

    return {
      ...db,
      state: {
        ...db.state,
        location: 'Tanzaku Town gambling district',
        locationKind: 'settlement' as const,
        scenePace: 'downtime' as const,
        sceneCast: [],
        inStoryDate: { ...db.state.inStoryDate, hour: 14, minute: 0 },
      },
      entities: [
        ...db.entities,
        {
          id: 'entity_mei',
          name: 'Mei Tsukada',
          type: 'character' as const,
          aliases: ['Mei'],
          role: 'Teahouse owner',
          personality: 'Sharp-tongued, kind underneath.',
          lastSeen,
          lastSeenAt: 'a teahouse in Tanzaku Town',
          tags: [],
          ...overrides,
        },
      ],
    };
  }

  function atReturnTurn(db: AppDatabase): AppDatabase {
    for (let turn = 6; turn < 6 + RETURN_WINDOW_TURNS * 3; turn += 1) {
      const log = Array.from({ length: turn }, (_, index) => ({
        id: `log_${index}`,
        turn: index,
        kind: 'story' as const,
        role: 'user' as const,
        content: 'I look around.',
        model: null,
        promptTokens: 0,
        completionTokens: 0,
        chapter: 1,
        scene: 'test',
        inStoryDate: db.state.inStoryDate,
        createdAt: 0,
      }));
      const candidate = { ...db, rawLog: log };

      if (isReturnTurn(candidate)) {
        return candidate;
      }
    }

    throw new Error('no return turn found');
  }

  test('an original last seen here long ago is a candidate', () => {
    const db = withOriginal();
    const candidates = returningCandidates(db);

    expect(candidates.map((offer) => offer.entity.name)).toContain('Mei Tsukada');
    expect(candidates[0].reason).toBe('last-seen-here');
  });

  test('canon cast, the recently seen, the dead and people elsewhere are never offered', () => {
    const db = withOriginal();

    for (const offer of returningCandidates(db)) {
      expect(offer.entity.tags).not.toContain('canon');
      expect(offer.entity.name).not.toBe('Kan');
    }

    expect(returningCandidates(withOriginal({ lastSeen: db.state.inStoryDate }))).toHaveLength(0);
    expect(returningCandidates(withOriginal({ status: 'Deceased' }))).toHaveLength(0);
    expect(returningCandidates(withOriginal({ lastSeenAt: 'the Hidden Mist Village', role: 'Fisherman' }))).toHaveLength(0);
    expect(returningCandidates(withOriginal(), 'Mei waved at you yesterday.')).toHaveLength(0);
  });

  test('travellers can turn up on roads and in towns', () => {
    const db = withOriginal({ lastSeenAt: 'the Hidden Mist Village', role: 'Wandering merchant' });

    expect(returningCandidates(db)[0]?.reason).toBe('traveller');
  });

  test('offers are occasional, deterministic and skipped in fights or empty places', () => {
    const db = atReturnTurn(withOriginal());

    expect(pickReturningCharacter(db)?.entity.name).toBe('Mei Tsukada');
    expect(pickReturningCharacter(db)?.entity.id).toBe(pickReturningCharacter(db)?.entity.id);
    expect(formatReturningCharacter(db)).toContain('A FAMILIAR FACE');
    expect(formatReturningCharacter(db)).toContain('Mei Tsukada');

    const fight = { ...db, state: { ...db.state, scenePace: 'combat' as const } };
    expect(pickReturningCharacter(fight)).toBeNull();

    const empty = { ...db, state: { ...db.state, locationKind: 'wilderness' as const, inStoryDate: { ...db.state.inStoryDate, hour: 23 } } };
    expect(pickReturningCharacter(empty)).toBeNull();

    // At most one offer turn per window.
    let offers = 0;
    for (let turn = 0; turn < RETURN_WINDOW_TURNS; turn += 1) {
      if (isReturnTurn(db, RETURN_WINDOW_TURNS * 5 + turn)) offers += 1;
    }
    expect(offers).toBe(1);
  });

  test('presence records where Kan saw someone', () => {
    let db = withOriginal({ lastSeenAt: undefined });
    db = applyTurnDiff(db, { state: { location: 'the Hidden Rain Village' }, scene: { entities: ['Mei Tsukada'] } } as TurnDiff);

    expect(db.entities.find((entity) => entity.id === 'entity_mei')?.lastSeenAt).toBe('the Hidden Rain Village');
  });
});

import {
  BOND_POINTS_PER_STEP,
  MAX_COMPANIONS,
  SHARED_TIME_AFFINITY_CAP,
  companionsOf,
  setCompanion,
} from '../lib/rpg/companions';

describe('companions', () => {
  const itachiOf = (db: AppDatabase) => db.entities.find((entity) => entity.name === 'Itachi Uchiha')!;
  const bondOf = (db: AppDatabase, id: string) => db.bonds.find((bond) => bond.entityId === id);
  const withItachi = () => {
    const db = loadSave();
    const id = itachiOf(db).id;

    return { db: applyTurnDiff(db, { companionsJoined: [{ entityId: id, name: 'Itachi Uchiha', reason: 'leaving the Leaf together' }] }), id };
  };

  test('the state reply joins and parts companions', () => {
    const block = {
      companions_joined: [{ character_id: 'itachi-uchiha', reason: 'leaving together' }],
      companions_left: [{ character_id: 'kan', reason: null }],
    };
    const { diff } = convertStateBlock(block);

    expect(diff?.companionsJoined).toEqual([{ name: 'itachi-uchiha', reason: 'leaving together' }]);
    expect(diff?.companionsLeft).toBeUndefined();

    const db = loadSave();
    const resolved = resolveCharacterRefs(db, diff!);
    expect(resolved.companionsJoined?.[0].entityId).toBe(itachiOf(db).id);
    expect(TURN_STATE_SCHEMA.required).toContain('companions_joined');
    expect(TURN_STATE_SCHEMA.required).toContain('companions_left');
  });

  test('a companion is in every scene, even when the tracker leaves them out', () => {
    const { db, id } = withItachi();

    expect(companionsOf(db).map((entity) => entity.id)).toEqual([id]);
    expect(itachiOf(db).companion?.reason).toBe('leaving the Leaf together');
    expect(bondOf(db, id)).toBeDefined();
    expect(db.facts.some((fact) => fact.text.startsWith('Itachi Uchiha began travelling with you'))).toBe(true);

    const later = applyTurnDiff(db, {
      state: { sceneCast: ['Kisame Hoshigaki'], elapsedSeconds: 3600 },
      scene: { ended: true, entities: ['Kisame Hoshigaki'] },
    });

    expect(later.state.sceneCast).toContain('Itachi Uchiha');
    expect(later.state.sceneCast?.[0]).toBe('Itachi Uchiha');
    expect(dateSortValue(itachiOf(later).lastSeen!)).toBe(dateSortValue(later.state.inStoryDate));

    const scene = later.events[later.events.length - 1];
    expect(later.eventEntities.some((link) => link.eventId === scene.id && link.entityId === id)).toBe(true);
    expect(itachiOf(later).companion?.sharedScenes).toBe(1);

    // A bare clock step (time correction path) still keeps them present.
    const tick = applyTurnDiff(db, { state: { elapsedSeconds: 60 } });
    expect(tick.state.sceneCast).toContain('Itachi Uchiha');
  });

  test('shared scenes slowly build the bond; the story moving it resets the count', () => {
    let { db, id } = withItachi();
    db = { ...db, bonds: db.bonds.map((bond) => (bond.entityId === id ? { ...bond, affinity: 2 } : bond)) };
    const start = 2;

    // Calm scenes: one point each.
    for (let index = 0; index < BOND_POINTS_PER_STEP; index += 1) {
      db = applyTurnDiff(db, { state: { scenePace: 'conversation' }, scene: { ended: true } });
    }
    expect(bondOf(db, id)!.affinity).toBe(start + 1);

    // A fight survived together counts double.
    db = applyTurnDiff(db, { state: { scenePace: 'combat' }, scene: { ended: true } });
    expect(itachiOf(db).companion?.bondPoints).toBe(2);

    // The story moved the bond itself: no extra drift, count starts over.
    db = applyTurnDiff(db, {
      state: { scenePace: 'combat' },
      bonds: [{ entityId: id, character: 'Itachi Uchiha', affinityDelta: -2 }],
      scene: { ended: true },
    });
    expect(bondOf(db, id)!.affinity).toBe(start - 1);
    expect(itachiOf(db).companion?.bondPoints).toBe(0);

    // Time alone never pushes past the cap.
    db = { ...db, bonds: db.bonds.map((bond) => (bond.entityId === id ? { ...bond, affinity: SHARED_TIME_AFFINITY_CAP } : bond)) };
    for (let index = 0; index < BOND_POINTS_PER_STEP * 3; index += 1) {
      db = applyTurnDiff(db, { scene: { ended: true } });
    }
    expect(bondOf(db, id)!.affinity).toBe(SHARED_TIME_AFFINITY_CAP);
  });

  test('time together does not soften real hostility', () => {
    let { db, id } = withItachi();
    db = { ...db, bonds: db.bonds.map((bond) => (bond.entityId === id ? { ...bond, affinity: -5 } : bond)) };

    for (let index = 0; index < BOND_POINTS_PER_STEP * 2; index += 1) {
      db = applyTurnDiff(db, { scene: { ended: true } });
    }

    expect(bondOf(db, id)!.affinity).toBe(-5);
  });

  test('companions leave when the story parts them, or when they die', () => {
    const { db, id } = withItachi();
    const parted = applyTurnDiff(db, {
      state: { sceneCast: ['Itachi Uchiha'] },
      companionsLeft: [{ entityId: id, name: 'Itachi Uchiha', reason: 'called away by the Akatsuki' }],
    });

    expect(companionsOf(parted)).toHaveLength(0);
    expect(parted.state.sceneCast ?? []).not.toContain('Itachi Uchiha');
    expect(parted.facts.some((fact) => fact.text.startsWith('Itachi Uchiha parted ways with you'))).toBe(true);

    const died = applyTurnDiff(canonDone(db), { deaths: [{ entityId: id, name: 'Itachi Uchiha', cause: 'illness' }] });
    expect(companionsOf(died)).toHaveLength(0);
    expect(itachiOf(died).companion).toBeUndefined();
  });

  test('a person introduced this turn can join at once; Kan and the dead never join', () => {
    const db = loadSave();
    const raw = convertStateBlock({
      new_characters: [{ is_new: true, name: 'Rokuro Tanabe', age: 30, role: 'Ferryman', personality: null, speech_style: null, appearance: null }],
      companions_joined: [{ character_id: 'Rokuro Tanabe', reason: 'hired as a guide' }],
      characters_present: ['Rokuro Tanabe'],
    }).diff!;
    const next = applyTurnDiff(db, resolveCharacterRefs(db, raw));

    expect(companionsOf(next).map((entity) => entity.name)).toEqual(['Rokuro Tanabe']);

    const kan = db.entities.find((entity) => entity.name === 'Kan')!;
    expect(setCompanion(db, kan.id, true)).toBe(db);

    const dead = db.entities.find((entity) => entity.deceased)!;
    expect(setCompanion(db, dead.id, true)).toBe(db);
  });

  test('the party has a size limit', () => {
    let db = loadSave();
    const people = db.entities.filter((entity) => entity.type === 'character' && entity.name !== 'Kan' && !entity.deceased);

    for (const person of people.slice(0, MAX_COMPANIONS + 2)) {
      db = setCompanion(db, person.id, true);
    }

    expect(companionsOf(db)).toHaveLength(MAX_COMPANIONS);
    expect(db.state.sceneCast!.length).toBeLessThanOrEqual(6);
  });

  test('both prompts know who travels with Kan', () => {
    const { db } = withItachi();
    const narration = buildNarrationPrompt(db, '"We move at dawn."');
    const system = narration.messages[0].content;
    const user = narration.messages[1].content;

    expect(system).toContain('TRAVELLING WITH KAN is physically at his side in every scene');
    expect(user).toContain('TRAVELLING WITH KAN (at his side');
    expect(user).toMatch(/- Itachi Uchiha: joined today \(leaving the Leaf together/);
    expect(user).toContain('CHARACTERS IN SCENE');
    expect(JSON.stringify(narration.messages)).not.toContain('companions_joined');

    const state = buildExtractionPrompt(db, 'We move.', 'You walk on beside Itachi.');
    const stateText = state.messages.map((message) => message.content).join('\n');
    expect(stateText).toContain('TRAVELLING WITH KAN: itachi-uchiha (Itachi Uchiha)');
    expect(stateText).toContain('[travelling with Kan]');
    expect(stateText).toContain('companions_joined');

    const alone = buildExtractionPrompt(loadSave(), 'Wait.', 'You wait.');
    expect(alone.messages[1].content).toContain('TRAVELLING WITH KAN: nobody');
  });

  test('companions survive a merge and a reload', () => {
    const { db, id } = withItachi();
    const reloaded = normalizeDatabase(JSON.parse(JSON.stringify(db)));
    expect(companionsOf(reloaded).map((entity) => entity.id)).toEqual([id]);

    const duplicate = applyEntityDiff(reloaded, { isNew: true, name: 'Hayate Moriya' });
    const dupId = duplicate.entities.find((entity) => entity.name === 'Hayate Moriya')!.id;
    const merged = mergeEntityPair(duplicate, dupId, id);
    expect(companionsOf(merged).map((entity) => entity.id)).toEqual([dupId]);
  });
});

describe('news delivery: bearers, styles, escalation, catch-up', () => {
  const baseline = { year: 13, month: 10, day: 1, hour: 22, minute: 0 };
  const lateDate = { year: 16, month: 2, day: 1, hour: 8, minute: 0 };
  const fired = (date = lateDate, heardOn?: typeof lateDate): AppDatabase => {
    const seed = loadSave();
    const db = advanceCanon({
      ...seed,
      rawLog: [],
      state: {
        ...seed.state,
        inStoryDate: date,
        canonProgress: { version: CANON_VERSION, baselineDate: baseline, baselineTurn: 0, completed: [], active: [], engaged: [] },
      },
    });

    return heardOn
      ? { ...db, state: { ...db.state, canonProgress: { ...db.state.canonProgress!, heard: { event_canon_none: { from: 'x', date: heardOn } } } } }
      : db;
  };
  const akatsukiNews = (db: AppDatabase) => unheardCanonNews(db, 99).find((item) => item.knowledge === 'akatsuki');

  test('Kakuzu, Hidan and Tobi can carry Akatsuki news; the dead cannot', () => {
    const db = fired(lateDate, lateDate);
    const item = akatsukiNews(db)!;
    expect(item.bearers).toEqual(expect.arrayContaining(['Kakuzu', 'Hidan', 'Tobi']));

    const kisame = db.entities.find((entity) => entity.name === 'Kisame Hoshigaki')!;
    const dead = { ...db, entities: db.entities.map((entity) => (entity.id === kisame.id ? { ...entity, deceased: { known: true } } : entity)) };
    expect(livingBearers(db, item)).toContain('Kisame Hoshigaki');
    expect(livingBearers(dead, item)).not.toContain('Kisame Hoshigaki');
  });

  test('Hidan, Kisame and Deidara carry Akatsuki news only while they are members', () => {
    const db = fired(lateDate, lateDate);
    const item = akatsukiNews(db)!;
    const withCompleted = (completed: string[]): AppDatabase => ({
      ...db,
      state: { ...db.state, canonProgress: { ...db.state.canonProgress!, completed } },
    });

    const early = livingBearers(withCompleted([]), item);
    expect(early).not.toContain('Hidan');
    expect(early).not.toContain('Kisame Hoshigaki');
    expect(early).not.toContain('Deidara');
    expect(early).toContain('Kakuzu');

    const hidan = db.entities.find((entity) => entity.name === 'Hidan')!;
    expect(couldKnow(withCompleted([]), hidan, item)).toBe(false);

    const joined = withCompleted(['kisame-joins', 'deidara-recruited', 'roster-completes']);
    expect(livingBearers(joined, item)).toEqual(expect.arrayContaining(['Hidan', 'Kisame Hoshigaki', 'Deidara']));
    expect(couldKnow(joined, hidan, item)).toBe(true);

    // Buried alive by Shikamaru: not dead, but no longer carrying news.
    const buried = withCompleted(['kisame-joins', 'deidara-recruited', 'roster-completes', 'hidan-kakuzu']);
    expect(livingBearers(buried, item)).not.toContain('Hidan');
  });

  test('someone in the scene who could know is offered first', () => {
    const base = fired(lateDate, lateDate);
    const item = akatsukiNews(base)!;
    // Make the Akatsuki item the one on offer by hearing everything else.
    const heard = Object.fromEntries(
      unheardCanonNews(base, 99).filter((news) => news.eventId !== item.eventId).map((news) => [news.eventId, { from: 'x', date: lateDate }])
    );
    const db: AppDatabase = {
      ...base,
      state: {
        ...base.state,
        sceneCast: ['Kakuzu', 'Hana Inuzuka'],
        scenePace: 'conversation',
        canonProgress: { ...base.state.canonProgress!, heard: { ...base.state.canonProgress!.heard, ...heard } },
      },
    };
    const offer = newsOffer(db)!;
    expect(offer.mode).toBe('single');
    // Kan hasn't learned his name here, so he is offered by his look (the name is for the narrator only).
    expect(offer.items[0].sceneBearers.some((label) => label.includes('narrator only: Kakuzu'))).toBe(true);
    // Hana is a Leaf shinobi: she could not know Akatsuki business.
    expect(offer.items[0].sceneBearers.some((label) => label.startsWith('Hana'))).toBe(false);
    expect(offer.items[0].otherBearers).not.toContain('Kakuzu');

    const prompt = buildNarrationPrompt(db, '*Kan listens.*').messages.map((m) => m.content).join('\n');
    expect(prompt).toContain('In the scene: the masked man with stitched arms [Kan doesn\'t know their name; narrator only: Kakuzu]');
    expect(prompt).toContain('Delivery this time:');
  });

  test('public news in a town can come from a local', () => {
    const base = fired(lateDate, lateDate);
    const pub = unheardCanonNews(base, 99).find((item) => item.knowledge === 'public')!;
    const heard = Object.fromEntries(
      unheardCanonNews(base, 99).filter((news) => news.eventId !== pub.eventId).map((news) => [news.eventId, { from: 'x', date: lateDate }])
    );
    const db: AppDatabase = {
      ...base,
      state: {
        ...base.state,
        location: 'A teahouse in Tanzaku Town',
        locationKind: 'settlement',
        sceneCast: [],
        scenePace: 'downtime',
        canonProgress: { ...base.state.canonProgress!, heard: { ...base.state.canonProgress!.heard, ...heard } },
      },
    };
    const offer = newsOffer(db)!;
    expect(offer.items[0].sceneBearers.join(' ')).toContain('innkeeper');
  });

  test('the delivery style varies from turn to turn and holds on a regenerate', () => {
    let db = fired(lateDate, lateDate);
    // Secrets only ever travel face to face (one fixed style): hear those first.
    for (let guard = 0; guard < 50; guard += 1) {
      const first = newsOffer(db)?.items[0];
      if (!first || (first.knowledge !== 'secret' && first.knowledge !== 'witnesses')) break;
      db = { ...db, state: { ...db.state, canonProgress: { ...db.state.canonProgress!, heard: { ...db.state.canonProgress!.heard, [first.eventId]: { from: 'x', date: lateDate } } } } };
    }
    const withTurns = (n: number): AppDatabase => ({
      ...db,
      state: { ...db.state, scenePace: 'conversation', locationKind: 'settlement', location: 'Market street' },
      rawLog: Array.from({ length: n }, (_, index) => ({ ...db.rawLog[0], id: `u${index}`, kind: 'story' as const, role: 'user' as const })),
    });
    const styles = new Set(Array.from({ length: 12 }, (_, n) => newsOffer(withTurns(n))!.style));
    expect(styles.size).toBeGreaterThan(2);
    expect(newsOffer(withTurns(5))!.style).toBe(newsOffer(withTurns(5))!.style);
  });

  test('minor news escalates too, just slower', () => {
    expect(newsUrgency({ major: true, daysOld: 1 })).toBe('fresh');
    expect(newsUrgency({ major: true, daysOld: 3 })).toBe('due');
    expect(newsUrgency({ major: true, daysOld: 7 })).toBe('overdue');
    expect(newsUrgency({ major: false, daysOld: 7 })).toBe('fresh');
    expect(newsUrgency({ major: false, daysOld: 14 })).toBe('due');
    expect(newsUrgency({ major: false, daysOld: 28 })).toBe('overdue');
  });

  test('old minor news is not starved behind fresh major news', () => {
    const db = fired(lateDate, lateDate);
    const unheard = unheardCanonNews(db, 99);
    const minor = unheard.find((item) => !item.major && item.daysOld >= 30);
    const freshMajor = unheard.find((item) => item.major && item.daysOld <= 3);

    if (minor && freshMajor) {
      expect(unheard.indexOf(minor)).toBeLessThan(unheard.indexOf(freshMajor));
    }

    expect(unheard.length).toBeGreaterThan(1);
  });

  test('after a long quiet stretch, piled-up news comes as one catch-up report', () => {
    const db = { ...fired(), state: { ...fired().state, scenePace: 'downtime' as const } };
    const offer = newsOffer(db)!;
    expect(offer.mode).toBe('catch-up');
    expect(offer.quietDays).toBeGreaterThanOrEqual(CATCH_UP_QUIET_DAYS);
    expect(offer.items.length).toBeGreaterThan(1);
    expect(offer.items.every((item) => item.knowledge !== 'secret')).toBe(true);

    const prompt = buildNarrationPrompt(db, '*Kan rests.*').messages.map((m) => m.content).join('\n');
    expect(prompt).toContain('CATCH-UP');

    const allowance = newsAllowance(db);
    expect(allowance).toBe(offer.items.length);
    const relayed = markNewsHeard(db, offer.items.map((item) => ({ id: item.milestoneId, from: 'Itachi Uchiha' })), allowance);
    const left = unheardCanonNews(relayed, 99).map((item) => item.eventId);
    expect(offer.items.every((item) => !left.includes(item.eventId))).toBe(true);

    // Once news has reached Kan today, it is back to one item at a time.
    expect(newsOffer(relayed)?.mode ?? 'single').toBe('single');

    const tracking = trackerPromptText(buildExtractionPrompt(db, '*Kan rests.*', 'Itachi tells you everything.'));
    for (const item of offer.items) expect(tracking).toContain(item.milestoneId);
  });
});

describe('personal letters', () => {
  const hanaOf = (db: AppDatabase) => db.entities.find((entity) => entity.name === 'Hana Inuzuka')!;
  const later = (db: AppDatabase, days: number): AppDatabase => ({
    ...db,
    state: { ...db.state, inStoryDate: shiftDate(db.state.inStoryDate, days), scenePace: 'downtime' },
  });
  const affinity = (db: AppDatabase, id: string) => db.bonds.find((bond) => bond.entityId === id)?.affinity ?? 0;

  test('Kan writes to Hana: it travels, arrives, moves the bond, and she writes back', () => {
    let db: AppDatabase = { ...loadSave(), state: { ...loadSave().state, sceneCast: [] } };
    const hana = hanaOf(db);
    const before = affinity(db, hana.id);

    db = sendLetters(db, [{ entityId: hana.id, name: hana.name, gist: 'you are alive and sorry you left' }]);
    expect(db.state.post!.letters).toHaveLength(1);
    expect(db.state.post!.letters[0]).toMatchObject({ direction: 'from-kan', status: 'travelling' });

    // Not there yet the same day (a letter takes at least a day, even inside the Land of Fire).
    db = deliverLetters(db);
    expect(affinity(db, hana.id)).toBe(before);

    db = deliverLetters(later(db, LETTER_MAX_DAYS));
    expect(affinity(db, hana.id)).toBe(Math.min(10, before + LETTER_BOND_GAIN));
    expect(db.facts.some((fact) => fact.text.includes('Hana Inuzuka received a letter from you'))).toBe(true);

    const reply = db.state.post!.letters.find((letter) => letter.direction === 'to-kan')!;
    expect(reply.status).toBe('travelling');

    db = later(db, LETTER_MAX_DAYS + 1);
    const offer = letterOffer(db)!;
    expect(offer.kind).toBe('reply');
    expect(offer.entity.id).toBe(hana.id);

    const prompt = buildNarrationPrompt(db, '*Kan waits.*').messages.map((m) => m.content).join('\n');
    expect(prompt).toContain('A LETTER FOR YOU');
    expect(prompt).toContain('answering the letter you sent (you are alive and sorry you left)');
    expect(trackerPromptText(buildExtractionPrompt(db, '*Kan reads.*', 'A ninken finds you.'))).toContain('letters_received');

    db = receiveLetters(db, [{ entityId: hana.id, name: hana.name }]);
    expect(db.state.post!.letters.find((letter) => letter.id === reply.id)!.status).toBe('delivered');
    expect(db.state.post!.lastLetterIn).toEqual(db.state.inStoryDate);
    // The post goes quiet for a while after a letter.
    expect(letterOffer(later(db, 2))).toBeNull();
  });

  test('someone close writes unprompted after a while apart, never mid-fight', () => {
    const seed = loadSave();
    const db = later({ ...seed, state: { ...seed.state, sceneCast: [] } }, 40);
    const offer = letterOffer(db);
    expect(offer?.kind).toBe('unprompted');
    expect(['Hana Inuzuka', 'Suzume', 'Itachi Uchiha']).toContain(offer!.entity.name);

    expect(letterOffer({ ...db, state: { ...db.state, scenePace: 'combat' } })).toBeNull();
    // Too soon after the story starts: nothing yet.
    expect(letterOffer(later({ ...seed, state: { ...seed.state, sceneCast: [] } }, 3))).toBeNull();
  });

  test('a letter to someone who died is lost, with no reply', () => {
    let db: AppDatabase = { ...loadSave(), state: { ...loadSave().state, sceneCast: [] } };
    const hana = hanaOf(db);
    db = sendLetters(db, [{ entityId: hana.id, name: hana.name }]);
    db = { ...db, entities: db.entities.map((entity) => (entity.id === hana.id ? { ...entity, deceased: { known: false } } : entity)) };
    db = deliverLetters(later(db, LETTER_MAX_DAYS + 1));
    expect(db.state.post!.letters[0].status).toBe('lost');
    expect(db.state.post!.letters.some((letter) => letter.direction === 'to-kan')).toBe(false);
  });

  test('the state block carries letters, resolved to known people', () => {
    const db = loadSave();
    const { diff } = convertStateBlock({
      letters_sent: [{ to: 'hana-inuzuka', gist: 'meet me at the old bridge' }],
      letters_received: ['suzume'],
    });
    const resolved = resolveCharacterRefs(db, diff!);
    expect(resolved.lettersSent?.[0]).toMatchObject({ name: 'Hana Inuzuka', gist: 'meet me at the old bridge' });
    expect(resolved.lettersReceived?.[0].name).toBe('Suzume');
    expect(TURN_STATE_SCHEMA.required).toEqual(expect.arrayContaining(['letters_sent', 'letters_received']));
  });

  test('saves keep their post through a reload', () => {
    let db: AppDatabase = { ...loadSave(), state: { ...loadSave().state, sceneCast: [] } };
    const hana = hanaOf(db);
    db = sendLetters(db, [{ entityId: hana.id, name: hana.name }]);
    const reloaded = normalizeDatabase(JSON.parse(JSON.stringify(db)));
    expect(reloaded.state.post?.letters).toHaveLength(1);
  });
});

describe('living world timeline', () => {
  const baseline = { year: 13, month: 10, day: 1, hour: 22, minute: 0, second: 0 };
  const key = (w: { year: number; month: number; day?: number }) => (w.year * 12 + w.month) * 32 + (w.day ?? 1);
  const byId = (id: string) => CANON_MILESTONES.find((m) => m.id === id)!;

  test('the world list is in date order, so the chain never holds an event back', () => {
    const world = CANON_MILESTONES.filter((m) => !m.playerDriven);
    for (let i = 1; i < world.length; i++) {
      expect(key(world[i].from)).toBeGreaterThanOrEqual(key(world[i - 1].from));
    }
  });

  test('walking the clock day by day fires every world event on its own day', () => {
    let db: AppDatabase = {
      ...loadSave(),
      rawLog: [],
      state: {
        ...loadSave().state,
        inStoryDate: baseline,
        canonProgress: { version: CANON_VERSION, baselineDate: baseline, baselineTurn: 0, completed: [], active: [], engaged: [] },
      },
    };
    const firedOn = new Map<string, number>();
    let date = { ...baseline, hour: 8, minute: 0 };

    for (let step = 0; step < 365 * 24; step++) {
      db = advanceCanon({ ...db, state: { ...db.state, inStoryDate: date } }, { inCombat: false });
      for (const id of db.state.canonProgress?.completed ?? []) {
        if (!firedOn.has(id)) firedOn.set(id, key(date));
      }
      date = { ...date, ...advanceSeconds(date, 86400) };
      if (date.year > 34) break;
    }

    for (const m of CANON_MILESTONES.filter((item) => !item.playerDriven && item.from.year <= 33)) {
      expect({ id: m.id, day: firedOn.get(m.id) }).toEqual({ id: m.id, day: key(m.from) });
    }
  });

  test('the requested canon points exist in the right years', () => {
    for (const [id, year] of [
      ['five-tails-captured', 19],
      ['seven-tails-captured', 20],
      ['yagura-dies', 20],
      ['mei-mizukage', 20],
      ['sai-yamato', 21],
      ['four-tails-captured', 21],
      ['six-tails-captured', 21],
      ['taka-formed', 21],
      ['kurenai-pregnant', 21],
      ['itachi-izanami', 23],
    ] as const) {
      expect(byId(id).from.year).toBe(year);
    }
    expect(byId('yagura-puppet').bearers).toContain('Tobi');
    expect(byId('kan-hunt-seven-tails').encounter?.who).toContain('Kakuzu');
  });

  test('canon order: Hebi before Itachi dies before Taka; Jiraiya dies before sage training', () => {
    expect(key(byId('sasuke-absorbs-orochimaru').from)).toBeLessThan(key(byId('itachi-vs-sasuke').from));
    expect(key(byId('itachi-vs-sasuke').from)).toBeLessThan(key(byId('taka-formed').from));
    expect(key(byId('jiraiya-dies').from)).toBeLessThan(key(byId('naruto-sage-training').from));
    expect(key(byId('two-tails-captured').from)).toBeLessThan(key(byId('hidan-kakuzu').from));
    expect(key(byId('pain-assault').from)).toBeLessThan(key(byId('killer-bee-training').from));
    expect(key(byId('edo-itachi').from)).toBeLessThanOrEqual(key(byId('itachi-izanami').from));
    expect(key(byId('itachi-izanami').from)).toBeLessThanOrEqual(key(byId('hokage-edo').from));
  });

  test('the Fourth War lasts four days', () => {
    const war = CANON_MILESTONES.filter((m) => m.era === 'The Fourth War' && !m.playerDriven);
    for (const m of war) {
      expect(key(m.from)).toBeGreaterThanOrEqual(key({ year: 23, month: 1, day: 10 }));
      expect(key(m.from)).toBeLessThanOrEqual(key({ year: 23, month: 1, day: 13 }));
    }
  });

  test('each hunt offer closes on the day its capture fires', () => {
    for (const [offer, capture] of [
      ['kan-hunt-five-tails', 'five-tails-captured'],
      ['kan-hunt-seven-tails', 'seven-tails-captured'],
      ['kan-hunt-one-tail', 'gaara-captured'],
      ['kan-hunt-two-tails', 'two-tails-captured'],
      ['kan-hunt-four-tails', 'four-tails-captured'],
      ['kan-hunt-six-tails', 'six-tails-captured'],
    ] as const) {
      expect(byId(offer).playerDriven).toBe(true);
      expect(byId(offer).encounter).toBeDefined();
      expect(key(byId(offer).to!)).toBe(key(byId(capture).from));
    }
  });

  test('the personal beat closing soonest is offered first', () => {
    const db = loadSave();
    const next = {
      ...db,
      state: {
        ...db.state,
        inStoryDate: { year: 20, month: 4, day: 15, hour: 8, minute: 0, second: 0 },
        canonProgress: { version: CANON_VERSION, baselineDate: baseline, completed: [], active: [], engaged: [] },
      },
    };
    expect(upcomingCanonMilestones(next, 1)[0]?.id).toBe('kan-hunt-seven-tails');
  });

  test('the Mangekyō is offered first from the funeral until Part 1, at Izumi\'s grave', () => {
    const mangekyo = byId('kan-mangekyo');
    expect(mangekyo.priority).toBe(true);
    expect(mangekyo.location).toContain('Uchiha cemetery');
    expect(key(mangekyo.to!)).toBeLessThan(key(byId('team-7-formed').from));
    const db = loadSave();
    const at = (year: number, month: number) => ({
      ...db,
      state: {
        ...db.state,
        inStoryDate: { year, month, day: 1, hour: 8, minute: 0, second: 0 },
        canonProgress: { version: CANON_VERSION, baselineDate: baseline, completed: [], active: [], engaged: [] },
      },
    });
    // Not offered while you don't know she is dead; offered first once you do.
    expect(upcomingCanonMilestones(at(15, 3), 2).map((m) => m.id)).not.toContain('kan-mangekyo');
    const knowing = (year: number, month: number) => {
      const base = at(year, month);
      return {
        ...base,
        entities: base.entities.map((entity) =>
          entity.name === 'Izumi Uchiha' ? { ...entity, deceased: { ...entity.deceased, known: true } } : entity
        ),
      };
    };
    expect(upcomingCanonMilestones(knowing(15, 3), 2)[0]?.id).toBe('kan-mangekyo');
    expect(upcomingCanonMilestones(knowing(15, 3), 2)).toHaveLength(2);
    expect(upcomingCanonMilestones(at(17, 9), 2).map((m) => m.id)).not.toContain('kan-mangekyo');
  });

  test('Team 3 has meetings in every era', () => {
    const team3 = CANON_MILESTONES.filter(
      (m) => m.playerDriven && /hana|suzume/i.test(m.encounter?.who ?? '')
    );
    for (const era of ['Ashes', 'The shadow war', 'Part 1', 'The hidden years', 'Shippuden', 'The sky falls', 'The Fourth War']) {
      expect(team3.some((m) => m.era === era) || era === 'Ashes').toBe(true);
    }
    expect(team3.length).toBeGreaterThanOrEqual(10);
  });
});

describe('the Mangekyō and gated beats', () => {
  const baseline = { year: 13, month: 10, day: 1, hour: 22, minute: 0, second: 0 };
  const at = (db: AppDatabase, year: number, month: number): AppDatabase => ({
    ...db,
    state: {
      ...db.state,
      inStoryDate: { year, month, day: 1, hour: 8, minute: 0, second: 0 },
      canonProgress: db.state.canonProgress ?? { version: CANON_VERSION, baselineDate: baseline, completed: [], active: [], engaged: [] },
    },
  });

  test('awakening the Mangekyō records Sky Burial, Okuribi and Susanoo', () => {
    let db = at(loadSave(), 15, 3);
    db = applyCanonMarks(db, ['kan-mangekyo'], []);
    const mine = db.jutsuRecords.filter((r) => r.user === 'Kan');
    for (const name of ['Sky Burial', 'Okuribi', 'Susanoo']) {
      const record = mine.find((r) => r.name === name);
      expect(record?.tags).toContain('signature');
      expect(db.state.jutsu).toContain(name);
    }
    db = applyCanonMarks(db, ['kan-mangekyo'], []);
    expect(db.jutsuRecords.filter((r) => r.name === 'Susanoo').length).toBe(1);
  });

  test('beats that follow the Mangekyō wait for it', () => {
    const before = at(loadSave(), 15, 3);
    expect(upcomingCanonMilestones(before, 99).map((m) => m.id)).not.toContain('itachi-sees-mangekyo');
    const after = applyCanonMarks(before, ['kan-mangekyo'], []);
    expect(upcomingCanonMilestones(after, 99).map((m) => m.id)).toContain('itachi-sees-mangekyo');
  });

  test('a gated beat that never opened does not leave a "missed" fact', () => {
    const db = advanceCanon(at(loadSave(), 22, 6), { inCombat: false });
    expect(db.facts.some((f) => f.id === 'fact_missed_root-hunter-free')).toBe(false);
  });
});

describe('the wider canon cast', () => {
  test('everyone named in a canon death is in a new save (the real Madara aside)', () => {
    const db = loadSave();
    const names = new Set(
      db.entities
        .flatMap((entity) => [
          entity.name,
          ...entity.aliases,
          ...(entity.identities ?? []).filter((identity) => identity.alias !== false).flatMap((identity) => [identity.name, identity.name.split(' ')[0]]),
        ])
        .map((name) => name.toLowerCase())
    );
    const missing = CANON_MILESTONES.flatMap((milestone) => milestone.deaths ?? []).filter(
      (name) => !names.has(name.toLowerCase())
    );

    expect(missing).toEqual(['Madara Uchiha']);
  });

  test('no name or alias belongs to two people, and everyone has a lore heart', () => {
    const owner = new Map<string, string>();

    for (const entry of CANON_CAST) {
      for (const name of [entry.name, ...entry.aliases]) {
        const key = name.toLowerCase();
        expect(owner.get(key) ?? entry.name).toBe(entry.name);
        owner.set(key, entry.name);
      }

      expect(loreProfileFor(entry.name)).not.toBeNull();
    }
  });

  test('short names never borrow someone else’s heart or era', () => {
    expect(loreProfileFor('Han')?.orientation).toBe('Not interested');
    expect(eraNoteFor('Han', 13)).toBeNull();
    expect(loreProfileFor('A')?.romanceAccessibility).toBe('lore-locked');
    expect(eraNoteFor('A', 13)).toBeNull();
    expect(loreProfileFor('Ino')?.romanceAccessibility).toBe('winnable');
    expect(loreProfileFor('Mei Terumī')?.romanceAccessibility).toBe('winnable');
  });

  test('a new person who shares a given name is someone else', () => {
    let db = loadSave();
    const before = db.entities.length;
    db = applyEntityDiff(db, { isNew: true, name: 'Haku the Fisherman', role: 'Ferryman' });
    db = applyEntityDiff(db, { isNew: true, name: 'Hayate Moriya', role: 'Ronin' });

    expect(db.entities.length).toBe(before + 2);
    expect(resolveEntity(db, 'Hayate')?.name).toBe('Gekko Hayate');
    expect(resolveEntity(loadSave(), 'Hayate Moriya')).toBeNull();
    expect(resolveEntity(loadSave(), 'Lady Chiyo')?.name).toBe('Chiyo');
  });

  test('older saves gain the new cast without duplicating people they met', () => {
    const seeded = loadSave();
    const db = normalizeDatabase({
      ...seeded,
      entities: [
        ...seeded.entities.filter((entity) => entity.name !== 'Temari' && entity.name !== 'Zabuza Momochi'),
        { id: 'entity_temari', name: 'Temari', type: 'character', aliases: [], met: true, tags: [] },
      ],
    } as AppDatabase);

    expect(db.entities.filter((entity) => entity.name === 'Temari').map((entity) => entity.id)).toEqual(['entity_temari']);
    expect(db.entities.find((entity) => entity.id === 'entity_temari')?.aliases).toContain('Temari of the Sand');
    expect(db.entities.some((entity) => entity.name === 'Zabuza Momochi')).toBe(true);
  });

  test('ages come from the birth year when no birthday is known', () => {
    const db = loadSave();
    const ibiki = db.entities.find((entity) => entity.name === 'Ibiki Morino')!;
    // Every cast member has a birthday now; a stranger the story adds may not.
    const stranger = { ...ibiki, birthday: undefined };

    expect(ibiki.birthday).toEqual({ month: 3, day: 20 });
    expect(entityAge(db.state.inStoryDate, stranger)).toBe(db.state.inStoryDate.year + 18);
  });

  test('two-letter names count only when capitalized; IDs keep their letters', () => {
    expect(mentionsName('Ao narrows his good eye.', 'Ao')).toBe(true);
    expect(mentionsName('the ao of the sky', 'Ao')).toBe(false);
    expect(mentionsName('Fū laughs.', 'Fū')).toBe(true);
    expect(slug('Fū')).toBe('fu');
  });
});

describe('canon-bound hearts', () => {
  function withBond(name: string, relationship: string, year: number, month = 1) {
    const seeded = loadSave();
    const entity = seeded.entities.find((item) => item.name === name)!;

    return {
      ...seeded,
      state: { ...seeded.state, inStoryDate: { ...seeded.state.inStoryDate, year, month, day: 1 } },
      bonds: [
        ...seeded.bonds,
        {
          id: `bond_${entity.id}`,
          entityId: entity.id,
          characterName: entity.name,
          affinity: 9,
          status: 'In love',
          lastKeyEventId: null,
          note: '',
          isMajor: true,
          relationship: relationship as never,
          attraction: 'strong' as const,
          updatedInStoryDate: seeded.state.inStoryDate,
        },
      ],
    } as AppDatabase;
  }

  const bondOf = (db: AppDatabase, name: string) => db.bonds.find((bond) => bond.characterName === name)!;

  test('Kan can have her until canon says otherwise; then he is her ex', () => {
    expect(bondOf(applyCanonEndgames(withBond('Temari', 'lover', 22)), 'Temari').relationship).toBe('lover');

    const settled = applyCanonEndgames(withBond('Temari', 'lover', 24, 10));
    expect(bondOf(settled, 'Temari').relationship).toBe('ex');
    expect(bondOf(settled, 'Temari').attraction).toBe('warm');
    expect(bondOf(settled, 'Temari').affinity).toBe(9);
  });

  test('an open romance that never began cools to closeness', () => {
    expect(bondOf(applyCanonEndgames(withBond('Ino Yamanaka', 'romantic interest', 25, 3)), 'Ino Yamanaka').relationship).toBe('close');
  });

  test('the story cannot rekindle it after the canon date', () => {
    const settled = applyCanonEndgames(withBond('Karui', 'lover', 25, 6));
    const again = applyTurnDiff(settled, { bonds: [{ character: 'Karui', relationship: 'lover' }] });

    expect(bondOf(again, 'Karui').relationship).toBe('ex');
  });

  test('if the canon partner is dead, nothing is forced', () => {
    const db = withBond('Temari', 'lover', 25);
    const shikamaru = db.entities.find((item) => item.name === 'Shikamaru Nara')!;
    const widowed = markDeceased(db, shikamaru.id, { known: true });

    expect(bondOf(applyCanonEndgames(widowed), 'Temari').relationship).toBe('lover');
    expect(endgameNote(widowed, 'Temari')).toBe('');
  });

  test('the narrator is warned as the time nears', () => {
    expect(endgameNote(withBond('Temari', 'lover', 20), 'Temari')).toContain('ends up with Shikamaru Nara');
    expect(endgameNote(withBond('Temari', 'lover', 23, 6), 'Temari')).toContain('let it end naturally');
    expect(endgameNote(withBond('Temari', 'lover', 25), 'Temari')).toContain('her ex');
    expect(endgameNote(withBond('Tenten', 'lover', 25), 'Tenten')).toBe('');
    expect(normalizeRelationship('ex')).toBe('ex');
    expect(normalizeRelationship('broke up')).toBe('ex');
  });
});
