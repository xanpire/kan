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

import { DEFAULT_DATE, dateSortValue } from '../lib/rpg/calendar';
import { normalizeDatabase } from '../lib/rpg/db';
import { resolveCharacterRefs } from '../lib/rpg/entities';
import { appendStoryMessage, storyMessagesSinceLastSummary } from '../lib/rpg/log';
import { applyStateStep, applySummaryJob, isJobValid, unsummarizedStory } from '../lib/rpg/memoryJobs';
import { buildExtractionPrompt, buildNarrationPrompt, getRecentMessages, trackerPromptText } from '../lib/rpg/prompt';
import { seedDatabase } from '../lib/rpg/seed';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import { TURN_STATE_SCHEMA } from '../lib/rpg/stateSchema';
import { currentAmbience } from '../lib/rpg/ambience';
import { currentWeather, weatherAt } from '../lib/rpg/weather';
import { buildSceneImagePrompt } from '../lib/rpg/image';
import { scrapbook, MEMORY_ERA } from '../lib/rpg/scrapbook';
import { yearlyOffer } from '../lib/rpg/yearly';
import {
  FLASHBACKS,
  FLASHBACK_BY_ID,
  FLASHBACK_HARD_CAP,
  REMEMBER_INPUT,
  activeFlashback,
  beginFlashback,
  flashbackDateLine,
  flashbackOffer,
  flashbackView,
  kanAgeAt,
  normalizeFlashbacks,
  rememberChip,
} from '../lib/rpg/flashbacks';
import { KAN_PARENTS } from '../lib/rpg/flashbackData';
import type { AppDatabase, CalendarDate, TurnDiff } from '../lib/rpg/types';

const NOW: CalendarDate = { year: 14, month: 3, day: 3, hour: 19, minute: 0, second: 0 };

/** A save some way into the story, in a quiet scene. */
function quietSave(change: Partial<AppDatabase['state']> = {}): AppDatabase {
  let db = normalizeDatabase(seedDatabase('slot_flashbacks', 'Flashbacks'));

  for (let index = 0; index < 13; index += 1) {
    db = appendStoryMessage(db, 'user', `*You walk on.* ${index}`, null, 0, 0);
    db = appendStoryMessage(db, 'assistant', `The road goes on. ${index}`, null, 0, 0);
  }

  return {
    ...db,
    state: {
      ...db.state,
      inStoryDate: NOW,
      location: 'a roadside inn in the Land of Fire',
      locationKind: 'structure',
      scenePace: 'downtime',
      sceneCast: [],
      ...change,
    },
  };
}

const person = (db: AppDatabase, name: string) => db.entities.find((entity) => entity.name === name)!;
const narratorText = (db: AppDatabase, input = '*You sit by the fire.*') =>
  buildNarrationPrompt(db, input).messages.map((message) => message.content).join('\n');

/** One present turn: the reply carries the offer the prompt made, like game.tsx. */
function playPresent(db: AppDatabase, input: string, narration: string, block: Record<string, unknown>) {
  const prompt = buildNarrationPrompt(db, input);
  let next = appendStoryMessage(db, 'user', input, null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const last = next.rawLog.length - 1;
  next.rawLog[last] = {
    ...next.rawLog[last],
    sceneMode: prompt.sceneMode.mode,
    ...(prompt.flashback.offerId ? { flashbackOffer: prompt.flashback.offerId } : {}),
  };
  const turnLogId = next.rawLog[last].id;
  const converted = convertStateBlock(block).diff;
  const diff = converted ? resolveCharacterRefs(next, converted) : null;
  return { ...applyStateStep(next, diff, { turnLogId, userMessage: input, narration }, new Set()), prompt };
}

/** One turn inside the memory: both entries are stamped with it, like game.tsx. */
function playMemory(db: AppDatabase, input: string, narration: string, block: Record<string, unknown>) {
  const prompt = buildNarrationPrompt(db, input);
  let next = appendStoryMessage(db, 'user', input, null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const last = next.rawLog.length - 1;
  const memory = prompt.flashback.active!;
  next.rawLog[last] = { ...next.rawLog[last], sceneMode: prompt.sceneMode.mode, flashback: memory };
  next.rawLog[last - 1] = { ...next.rawLog[last - 1], flashback: memory };
  const turnLogId = next.rawLog[last].id;
  const converted = convertStateBlock(block).diff;
  const diff = converted ? resolveCharacterRefs(next, converted) : null;
  return { ...applyStateStep(next, diff, { turnLogId, userMessage: input, narration }, new Set()), prompt };
}

describe('the eighteen flashbacks', () => {
  test('numbered 1-18 with unique ids, all before the story begins', () => {
    expect(FLASHBACKS).toHaveLength(18);
    expect(new Set(FLASHBACKS.map((record) => record.id)).size).toBe(18);
    expect(FLASHBACKS.map((record) => record.number).sort((a, b) => a - b)).toEqual([...Array(18)].map((_, i) => i + 1));

    for (const record of FLASHBACKS) {
      expect(dateSortValue(record.date)).toBeLessThan(dateSortValue(DEFAULT_DATE));
      expect(record.fixed.length).toBeGreaterThan(0);
      expect(record.memoryLine.length).toBeGreaterThan(10);
    }
  });

  test('Kan is the right age in each (0-13)', () => {
    const db = quietSave();
    expect(kanAgeAt(db, FLASHBACK_BY_ID['nine-tails-night'].date)).toBe(5);
    expect(kanAgeAt(db, FLASHBACK_BY_ID['team-three'].date)).toBe(9);
    expect(kanAgeAt(db, FLASHBACK_BY_ID['the-mask'].date)).toBe(12);
    expect(kanAgeAt(db, FLASHBACK_BY_ID['the-fight'].date)).toBe(13);

    for (const record of FLASHBACKS) {
      const age = kanAgeAt(db, record.date);
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThanOrEqual(13);
    }
  });

  test('Team 3 plays as a team only between graduation (9) and ANBU (12)', () => {
    const db = quietSave();
    const joinsAnbu = FLASHBACK_BY_ID['the-mask'].date;

    for (const id of ['team-three', 'hanas-dogs']) {
      const record = FLASHBACK_BY_ID[id];
      expect(kanAgeAt(db, record.date)).toBeGreaterThanOrEqual(9);
      expect(dateSortValue(record.date)).toBeLessThan(dateSortValue(joinsAnbu));
    }

    // The week before is not a Team 3 day.
    expect(FLASHBACK_BY_ID['the-week-before'].scene).toContain('Not a Team 3 day');
  });

  test('everyone in a flashback is in the save, or is one of Kan’s parents', () => {
    const db = quietSave();
    const parents = new Set(KAN_PARENTS.map((parent) => parent.name));

    for (const record of FLASHBACKS) {
      for (const name of record.cast) {
        expect(parents.has(name) || db.entities.some((entity) => entity.name === name)).toBe(true);
      }
    }
  });

  test('the date line reads like the decision', () => {
    const db = quietSave();
    expect(flashbackDateLine(db, FLASHBACK_BY_ID['nine-tails-night'].date)).toBe('Year 5, Oct 10. You are five.');
  });
});

describe('offers', () => {
  test('a fitting quiet moment offers one; the narrator gets one optional line', () => {
    const db = quietSave({ sceneCast: ['Suzume'] });
    const offer = flashbackOffer(db, '"Sensei."', 'conversation');
    expect(offer?.id).toBe('team-three');

    const text = narratorText(db, '"Sensei."');
    expect(text).toContain('A MEMORY (optional): a flashback fits here: Team 3');
    expect(text).toContain('do not start the memory');
  });

  test('nothing on an ordinary turn, in a fight, on the road or early in the story', () => {
    expect(flashbackOffer(quietSave(), '*You sit.*', 'normal')).toBeNull();
    expect(narratorText(quietSave())).not.toContain('A MEMORY');

    const withSuzume = quietSave({ sceneCast: ['Suzume'] });
    expect(flashbackOffer(withSuzume, '*You attack.*', 'fight')).toBeNull();
    expect(flashbackOffer({ ...withSuzume, state: { ...withSuzume.state, scenePace: 'combat' } }, '"Sensei."', 'conversation')).toBeNull();
    expect(flashbackOffer({ ...withSuzume, state: { ...withSuzume.state, scenePace: 'travel' } }, '"Sensei."', 'normal')).toBeNull();

    const early = normalizeDatabase(seedDatabase('slot_early', 'Early'));
    expect(flashbackOffer({ ...early, state: { ...early.state, sceneCast: ['Suzume'], scenePace: 'downtime' } }, '"Sensei."', 'normal')).toBeNull();
  });

  test('a date-tied memory is offered only near its day', () => {
    const night = quietSave({ inStoryDate: { year: 14, month: 10, day: 10, hour: 20, minute: 0 } });
    expect(flashbackOffer(night, '*You sit.*', 'normal')?.id).toBe('nine-tails-night');

    const later = quietSave({ inStoryDate: { year: 14, month: 10, day: 26, hour: 20, minute: 0 } });
    expect(flashbackOffer(later, '*You sit.*', 'normal')).toBeNull();
  });

  test('at most one offer a month, and a played memory never comes back', () => {
    const db = quietSave({ sceneCast: ['Suzume'] });
    const offered = { ...db, state: { ...db.state, flashbacks: { played: [], offered: {}, lastOfferOn: { ...NOW, day: 1 } } } };
    expect(flashbackOffer(offered, '"Sensei."', 'conversation')).toBeNull();

    const played = { ...db, state: { ...db.state, flashbacks: { played: ['team-three'], offered: {} } } };
    expect(flashbackOffer(played, '"Sensei."', 'conversation')?.id).not.toBe('team-three');
  });

  test('Shisui’s last night waits until Kan knows the truth', () => {
    const db = quietSave();
    const text = 'You think of Shisui.';
    expect(flashbackOffer(db, text, 'normal')?.id).not.toBe('shisuis-last-night');

    const knows = {
      ...db,
      state: {
        ...db.state,
        flashbacks: { played: ['shisui-of-the-body-flicker', 'last-good-day'], offered: {} },
        canonProgress: { ...db.state.canonProgress!, completed: [...db.state.canonProgress!.completed, 'shisui-truth'] },
      },
    };
    expect(flashbackOffer(knows, text, 'normal')?.id).toBe('shisuis-last-night');
  });

  test('a shown offer waits under the reply as a Remember chip; the month gap starts either way', () => {
    const db = quietSave({ sceneCast: ['Suzume'] });
    const shown = playPresent(db, '"Sensei."', 'Suzume turns your old forehead protector over in her hands.', { flashback: 'offered' });
    const state = shown.db.state.flashbacks!;
    expect(state.lastOfferOn).toBeDefined();
    expect(state.pending?.id).toBe('team-three');
    const replyId = shown.db.rawLog[shown.db.rawLog.length - 1].id;
    expect(rememberChip(shown.db, replyId)?.id).toBe('team-three');

    const unshown = playPresent(db, '"Sensei."', 'Suzume pours the tea.', { flashback: null });
    expect(unshown.db.state.flashbacks!.lastOfferOn).toBeDefined();
    expect(unshown.db.state.flashbacks!.pending).toBeUndefined();
  });

  test('the tracker is told about an offer and a waiting memory; the schema has the field', () => {
    const db = quietSave({ sceneCast: ['Suzume'] });
    const shown = playPresent(db, '"Sensei."', 'Suzume turns your old forehead protector over.', { flashback: 'offered' }).db;
    const tracker = trackerPromptText(buildExtractionPrompt(shown, '*You stare at it.*', 'The cloth is faded.'));
    expect(tracker).toContain('A MEMORY IS WAITING: "Team 3"');
    expect((TURN_STATE_SCHEMA as { properties: Record<string, unknown> }).properties.flashback).toBeDefined();
    expect(convertStateBlock({ flashback: 'started' }).diff?.flashback).toBe('started');
  });

  test('Kan following it in his own words starts it from the next turn', () => {
    const db = quietSave({ sceneCast: ['Suzume'] });
    const shown = playPresent(db, '"Sensei."', 'Suzume turns your old forehead protector over.', { flashback: 'offered' }).db;
    const follows = playPresent(shown, '*You close your eyes and remember the day she took you on.*', 'The inn fades.', { flashback: 'started' }).db;
    expect(activeFlashback(follows)?.record.id).toBe('team-three');
    // Nothing else moved in the present.
    expect(follows.state.location).toBe(db.state.location);
  });

  test('the chip starts it at once, and the pending offer runs out after two turns', () => {
    const db = quietSave({ sceneCast: ['Suzume'] });
    const shown = playPresent(db, '"Sensei."', 'Suzume turns your old forehead protector over.', { flashback: 'offered' }).db;
    expect(activeFlashback(beginFlashback(shown, 'team-three'))?.active.date).toEqual(FLASHBACK_BY_ID['team-three'].date);

    let ignored = playPresent(shown, '"Let\'s eat."', 'The food comes.', {}).db;
    expect(ignored.state.flashbacks!.pending).toBeDefined();
    ignored = playPresent(ignored, '"Good."', 'You eat.', {}).db;
    expect(ignored.state.flashbacks!.pending).toBeUndefined();
    expect(REMEMBER_INPUT).toContain('memory');
  });
});

describe('playing a flashback', () => {
  const start = (id = 'team-three') => beginFlashback(quietSave({ sceneCast: ['Suzume'], inventory: ['kunai', 'Akatsuki cloak'] }), id);

  test('the narrator gets the memory instead of the present', () => {
    const db = start();
    const text = narratorText(db, REMEMBER_INPUT);
    expect(text).toContain('FLASHBACK — A MEMORY KAN IS LIVING THROUGH');
    expect(text).toContain('You are nine.');
    expect(text).toContain('KAN THEN: a genin of nine');
    expect(text).toContain('No Sharingan');
    expect(text).toContain('THIS TURN THE MEMORY BEGINS');
    expect(text).toContain('how Shisui really died');
    expect(text).toContain('- Hana Inuzuka, 9');
    expect(text).not.toContain('CURRENT STATE\nDate:');
    expect(text).not.toContain('\nCANON TIMELINE');
    expect(text).not.toContain('ENCOUNTER CONDITIONS:');
    expect(text).toContain('WEATHER (');
  });

  test('the dead are alive in it, at their age then', () => {
    const db = beginFlashback(quietSave(), 'three-boys');
    const text = narratorText(db, REMEMBER_INPUT);
    expect(text).toContain('- Shisui Uchiha, 6');
    expect(text).toContain('(dead in the present; alive here)');
    expect(text).toContain('You are three.');
  });

  test('Kan’s parents enter the save when a memory needs them, once, as the dead', () => {
    const db = beginFlashback(quietSave(), 'erisa-and-banri');
    const erisa = person(db, 'Erisa Uchiha');
    expect(erisa.deceased?.known).toBe(true);
    expect(person(db, 'Banri Uzumaki').met).toBe(true);
    const again = beginFlashback({ ...db, state: { ...db.state, flashbacks: { played: [], offered: {} } } }, 'nine-tails-night');
    expect(again.entities.filter((entity) => entity.name === 'Erisa Uchiha')).toHaveLength(1);
  });

  test('a memory turn moves only the memory: the present clock, place, inventory and jutsu stand still', () => {
    const db = start();
    const before = db.state;
    const turn = playMemory(db, REMEMBER_INPUT, 'The inn slips away. Nine years old, you stand on the training ground; Suzume looks the three of you over for a long minute.', {
      time: { elapsed: 20, unit: 'minutes', clock_time: null },
      location: 'Training Ground 3, Hidden Leaf',
      location_kind: 'wilderness',
      characters_present: ['hana-inuzuka', 'izumi-uchiha', 'suzume'],
      inventory_added: ['a bell'],
      jutsu_used: [{ name: 'Fire Style: Great Fireball', user: 'kan', chakra_nature: 'Fire', effect: 'fire', visual: 'fire' }],
      deaths: ['izumi-uchiha'],
      facts: [{ action: 'add', type: 'event', text: 'Suzume tested you.', entity: 'kan', who_knows: ['kan'] }],
      flashback: null,
    }).db;

    expect(turn.state.inStoryDate).toEqual(before.inStoryDate);
    expect(turn.state.location).toBe(before.location);
    expect(turn.state.inventory).toEqual(before.inventory);
    expect(turn.state.jutsu).toEqual(before.jutsu);
    expect(turn.facts.length).toBe(db.facts.length);
    expect(person(turn, 'Izumi Uchiha').deceased?.date).toEqual(person(db, 'Izumi Uchiha').deceased?.date);

    const memory = activeFlashback(turn)!.active;
    expect(dateSortValue(memory.date)).toBeGreaterThan(dateSortValue(FLASHBACK_BY_ID['team-three'].date));
    expect(memory.place).toBe('Training Ground 3, Hidden Leaf');
    expect(memory.turns).toBe(1);
    expect(memory.castIds).toContain(person(turn, 'Suzume').id);
    // Memory turns are never chapter material.
    expect(unsummarizedStory(turn).some((entry) => entry.flashback)).toBe(false);
    expect(storyMessagesSinceLastSummary(turn)).toBe(storyMessagesSinceLastSummary(db) + 0);
  });

  test('the weather and the ambience follow the memory; the present’s held weather is untouched', () => {
    const db = start();
    const view = flashbackView(db)!;
    const memoryDate = FLASHBACK_BY_ID['team-three'].date;
    expect(currentWeather(view).condition).toBe(weatherAt(db.meta.slotId, 'fire', memoryDate));
    expect(db.state.weather).toEqual(quietSave({ sceneCast: ['Suzume'] }).state.weather);
    expect(currentAmbience(db).key).toBe(currentAmbience(view).key);
  });

  test('ending: a past-dated, shared memory, a small bond nudge, and the present picks up the same second', () => {
    let db = start();
    const hana = person(db, 'Hana Inuzuka');
    const bondBefore = db.bonds.find((bond) => bond.entityId === hana.id)!.affinity;
    db = playMemory(db, REMEMBER_INPUT, 'Nine years old, you stand on the training ground with Hana and Izumi.', {
      characters_present: ['hana-inuzuka', 'izumi-uchiha', 'suzume'],
      bonds: [{ character_id: 'hana-inuzuka', affinity_change: 5, note: 'proud of you' }],
    }).db;
    const ended = playMemory(db, '"We passed."', 'Suzume nods once. The training ground fades, and the inn is there again, the same second you left it.', {
      characters_present: ['hana-inuzuka', 'izumi-uchiha', 'suzume'],
      flashback: 'ended',
    });
    const next = ended.db;

    expect(activeFlashback(next)).toBeNull();
    expect(next.state.flashbacks!.played).toContain('team-three');
    expect(next.state.inStoryDate).toEqual(NOW);

    const memory = next.events.find((event) => event.tags.includes('flashback'))!;
    expect(memory.inStoryDate).toEqual(FLASHBACK_BY_ID['team-three'].date);
    expect(memory.title).toBe('Team 3');
    const linked = next.eventEntities.filter((link) => link.eventId === memory.id).map((link) => link.entityId);
    expect(linked).toContain(hana.id);
    expect(linked).toContain(person(next, 'Suzume').id);

    expect(next.bonds.find((bond) => bond.entityId === hana.id)!.affinity - bondBefore).toBe(1);

    // A write-up job, and the narrator's return line.
    const job = next.memoryJobs!.find((item) => item.kind === 'flashback')!;
    expect(job.flashbackId).toBe('team-three');
    expect(isJobValid(next, job)).toBe(true);
    const text = narratorText(next, '*You blink.*');
    expect(text).toContain('BACK FROM A MEMORY');
    expect(text).toContain('CURRENT STATE\nDate:');
    expect(getRecentMessages(next, 40).some((entry) => entry.flashback)).toBe(false);
    expect(ended.followUpIds).toContain(job.id);

    // The write-up lands on the memory.
    const written = applySummaryJob(next, job, {
      text: 'You meet Suzume on the training ground. She tests you, Hana and Izumi, and keeps you.',
      memory: 'The day Suzume tested you, Hana and Izumi and became your sensei.',
      povs: [{ entityId: hana.id, text: 'You were so serious that day.' }],
    })!.db;
    const after = written.events.find((event) => event.id === memory.id)!;
    expect(after.summary).toContain('Suzume tested you');
    expect(after.povs?.[0].entityId).toBe(hana.id);

    // The return note goes after one present turn, and the memory never comes back.
    const back = playPresent(next, '*You blink.*', 'The fire crackles.', {}).db;
    expect(back.state.flashbacks!.returned).toBeUndefined();
    expect(flashbackOffer({ ...back, state: { ...back.state, sceneCast: ['Suzume'], flashbacks: { ...back.state.flashbacks!, lastOfferOn: undefined } } }, '"Sensei."', 'conversation')?.id).not.toBe('team-three');
  });

  test('a memory the narrator never closes lets go after the hard cap', () => {
    let db = start();

    for (let turn = 0; turn < FLASHBACK_HARD_CAP; turn += 1) {
      db = playMemory(db, '"Again."', `Suzume makes you run it again. ${turn}`, { characters_present: ['suzume'] }).db;
    }

    expect(activeFlashback(db)).toBeNull();
    expect(db.state.flashbacks!.returned?.forced).toBe(true);
    expect(narratorText(db, '*You blink.*')).toContain('let go of him before it was finished');
  });

  test('the narrator is told to wrap it up, then to end it', () => {
    let db = start();

    for (let turn = 0; turn < 6; turn += 1) {
      db = playMemory(db, '"Again."', `Suzume makes you run it again. ${turn}`, { characters_present: ['suzume'] }).db;
    }

    expect(narratorText(db, '"Again."')).toContain("look for the scene's natural end");

    for (let turn = 0; turn < 3; turn += 1) {
      db = playMemory(db, '"Again."', `Again. ${turn}`, { characters_present: ['suzume'] }).db;
    }

    expect(narratorText(db, '"Again."')).toContain('END THE MEMORY THIS REPLY');
  });

  test('inside the memory the tracker sees its clock and none of the present’s canon or letters', () => {
    const db = start();
    const tracker = buildExtractionPrompt(db, REMEMBER_INPUT, 'The inn slips away.').messages.map((m) => m.content).join('\n');
    expect(tracker).toContain('THIS TURN IS A MEMORY');
    expect(tracker).toContain('CURRENT STATE (inside the memory)');
    expect(tracker).toContain('Year 9');
    expect(tracker).not.toMatch(/\nCANON TRACKING/);
  });

  test('a scene image of a memory shows Kan at his age then, without his present outfit', () => {
    let db = start();
    db = playMemory(db, REMEMBER_INPUT, 'Hana grins at you across the training ground.', { characters_present: ['hana-inuzuka'] }).db;
    const prompt = buildSceneImagePrompt(db, [], 'Kan and Hana stand on a training ground.');
    expect(prompt).toContain('THIS IS A MEMORY from Year 9');
    expect(prompt).toContain('Kan at 9');
    expect(prompt).toContain('Hana Inuzuka (age 9)');
    expect(prompt).not.toContain('Akatsuki cloak');
  });

  test('its photos sit before the story in the scrapbook, under the memory’s date and title', () => {
    let db = start();
    db = playMemory(db, REMEMBER_INPUT, 'Hana grins at you.', { characters_present: ['hana-inuzuka'] }).db;
    const replyId = db.rawLog[db.rawLog.length - 1].id;
    db = { ...db, rawLog: db.rawLog.map((entry) => (entry.id === replyId ? { ...entry, image: 'img:test' } : entry)) };
    const book = scrapbook(db);
    expect(book[0].era).toBe(MEMORY_ERA);
    expect(book[0].chapters[0].title).toBe('Team 3');
    expect(book[0].chapters[0].photos[0].age).toBe(9);
  });
});

describe('around the edges', () => {
  test('older saves load without flashbacks; a broken one is let go', () => {
    expect(normalizeFlashbacks(undefined)).toBeUndefined();
    const repaired = normalizeFlashbacks({ played: ['team-three', 'nope'], offered: { nope: NOW }, active: { id: 'nope' } });
    expect(repaired).toEqual({ played: ['team-three'], offered: {} });

    const db = normalizeDatabase(beginFlashback(quietSave(), 'team-three'));
    expect(activeFlashback(db)?.record.id).toBe('team-three');
  });

  test('a remembrance day remembers a memory lived again with the dead', () => {
    let db = beginFlashback(quietSave(), 'three-boys');
    db = playMemory(db, REMEMBER_INPUT, 'Shisui grins down at the two of you.', { characters_present: ['shisui-uchiha', 'itachi-uchiha'] }).db;
    db = playMemory(db, '"Again!"', 'The rooftops fade, and the inn is there again.', { characters_present: ['shisui-uchiha'], flashback: 'ended' }).db;
    const birthday = { ...db, state: { ...db.state, inStoryDate: { year: 14, month: 10, day: 19, hour: 9, minute: 0 }, sceneCast: [] } };
    const offer = yearlyOffer(birthday);
    expect(offer?.kind).toBe('remembrance');
    expect(offer?.line).toContain('Three boys');
  });

  test('a memory turn whose flashback is gone changes nothing', () => {
    const db = quietSave();
    let next = appendStoryMessage(db, 'user', '"Hm."', null, 0, 0);
    next = appendStoryMessage(next, 'assistant', 'Nothing.', null, 0, 0);
    const last = next.rawLog.length - 1;
    next.rawLog[last] = { ...next.rawLog[last], flashback: { id: 'team-three', date: FLASHBACK_BY_ID['team-three'].date } };
    const diff: TurnDiff = { state: { location: 'somewhere else' } };
    const result = applyStateStep(next, diff, { turnLogId: next.rawLog[last].id, userMessage: '"Hm."', narration: 'Nothing.' }, new Set());
    expect(result.db.state.location).toBe(db.state.location);
    expect(result.db.state.inStoryDate).toEqual(db.state.inStoryDate);
  });
});
