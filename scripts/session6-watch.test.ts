/**
 * The watch items Session 6 did not reach live (claude/session-notes.md and
 * claude/before-variety-ideas.md, "Watch in play"), played through the same
 * pipeline as a real turn: prompt → reply → state step. Plus the narrator
 * slips from Sessions 5 and 6 that the app can guard against.
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

import { canonTitleOutOfEra, guardBondDiff, heldFeelingsCeiling } from '../lib/rpg/bondGuard';
import { daylightNote } from '../lib/rpg/calendar';
import { CANON_MILESTONES } from '../lib/rpg/canonData';
import { normalizeDatabase } from '../lib/rpg/db';
import { applyEntityDiff, resolveCharacterRefs } from '../lib/rpg/entities';
import { eraRoleFor } from '../lib/rpg/eraRoles';
import { appendStoryMessage } from '../lib/rpg/log';
import { applyStateStep } from '../lib/rpg/memoryJobs';
import { PRIOR_BONDS } from '../lib/rpg/priorBonds';
import { KAN_FEET_LINE, KAN_HISTORY, NARRATION_SYSTEM, buildExtractionPrompt, buildNarrationPrompt, drawnToKanLine, formatHanaPrivacyLine } from '../lib/rpg/prompt';
import { friendlyScuffle, resolveTurnMode } from '../lib/rpg/sceneMode';
import { seedDatabase } from '../lib/rpg/seed';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import { roomVoices, temperamentFor } from '../lib/rpg/voices';
import type { AppDatabase, EntityRecord } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_watch', 'Watch'));
const person = (db: AppDatabase, name: string) => db.entities.find((entity) => entity.name === name)!;
const bondOf = (db: AppDatabase, name: string) => db.bonds.find((bond) => bond.entityId === person(db, name).id);
const promptText = (db: AppDatabase, input: string) =>
  buildNarrationPrompt(db, input).messages.map((message) => message.content).join('\n');

function at(db: AppDatabase, year: number, cast: string[], extra: Partial<AppDatabase['state']> = {}): AppDatabase {
  return { ...db, state: { ...db.state, inStoryDate: { ...db.state.inStoryDate, year }, sceneCast: cast, ...extra } };
}

/** One turn the way game.tsx plays it: prompt → reply saved with its mode → state step. */
function play(db: AppDatabase, input: string, narration: string, block: Record<string, unknown>) {
  const prompt = buildNarrationPrompt(appendStoryMessage(db, 'user', input, null, 0, 0), input);
  let next = appendStoryMessage(db, 'user', input, null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  next.rawLog[next.rawLog.length - 1] = { ...next.rawLog[next.rawLog.length - 1], sceneMode: prompt.sceneMode.mode };
  const diff = resolveCharacterRefs(next, convertStateBlock(block).diff!);
  const result = applyStateStep(next, diff, { turnLogId, userMessage: input, narration }, new Set());
  return { db: result.db, prompt, reply: result.db.rawLog.find((entry) => entry.id === turnLogId)! };
}

const TACKLE =
  '"Until four," Hana says, and before you can blink she tackles you into the straw, laughing, a knee on your chest. "You said that last time, and you left at two."';
const COMBAT_TAG = { beat: 'combat', scene_pace: 'combat', fight_options: ['Roll her off', 'Pin her arm'] };

describe('Session 6 slip: "I stay until four" became a fight against Hana', () => {
  const withHana = () => at(seed(), 18, ['Hana Inuzuka']);

  test('a playful tackle by a friend is talk, not Fight mode', () => {
    const { db, reply } = play(withHana(), 'I stay until four.', TACKLE, { ...COMBAT_TAG, characters_present: ['hana-inuzuka'] });

    expect(db.state.scenePace).toBe('conversation');
    expect(db.state.sceneMode?.lastBeat).toBe('exchange');
    expect(reply.fightOptions).toBeUndefined();
    // The chip's forecast for the next turn.
    expect(resolveTurnMode(db, '"Get off me."').mode).not.toBe('fight');
  });

  test('a real fight still starts', () => {
    const base = withHana();
    // Kan attacks.
    expect(friendlyScuffle(base, { input: 'I punch her.', narration: TACKLE, cast: ['Hana Inuzuka'] })).toBe(false);
    // A spar Kan agreed to.
    expect(friendlyScuffle(base, { input: '"Fine. Spar with me, then."', narration: TACKLE, cast: ['Hana Inuzuka'] })).toBe(false);
    // A weapon or blood on the page.
    expect(friendlyScuffle(base, { input: 'I stay.', narration: 'She drives a kunai at your ribs.', cast: ['Hana Inuzuka'] })).toBe(false);
    // A jutsu was used.
    expect(friendlyScuffle(base, { input: 'I stay.', narration: TACKLE, cast: ['Hana Inuzuka'], jutsuUsed: 1 })).toBe(false);
    // A stranger, not a friend.
    const stranger = at(seed(), 18, ['Kisame Hoshigaki']);
    expect(friendlyScuffle(stranger, { input: 'I stay.', narration: 'He tackles you into the mud.', cast: ['Kisame Hoshigaki'] })).toBe(false);
    // Itachi on the first night: a Sharingan on the page is no game.
    const night = seed();
    expect(friendlyScuffle(night, { input: 'I stay.', narration: 'His Sharingan turns, and he pins you to the wall.', cast: ['Itachi Uchiha'] })).toBe(false);
    // Once Kan knows Izumi is dead he hates Itachi, so even a bare shove is no game.
    const izumi = person(night, 'Izumi Uchiha');
    const knows = { ...night, entities: night.entities.map((e) => (e.id === izumi.id ? { ...e, deceased: undefined, status: 'Deceased' } : e)) };
    expect(heldFeelingsCeiling(knows, person(knows, 'Itachi Uchiha'))).not.toBeNull();
    expect(friendlyScuffle(knows, { input: 'I stay.', narration: 'He shoves you against the wall.', cast: ['Itachi Uchiha'] })).toBe(false);
    // Alone: nobody to be friends with.
    expect(friendlyScuffle(base, { input: 'I stay.', narration: TACKLE, cast: [] })).toBe(false);
  });

  test('a fight already on stays a fight', () => {
    const fighting = { ...withHana(), state: { ...withHana().state, scenePace: 'combat' as const } };
    expect(friendlyScuffle(fighting, { input: 'I stay.', narration: TACKLE, cast: ['Hana Inuzuka'] })).toBe(false);
  });

  test('the narrator and the tracker are told what is not a fight', () => {
    expect(NARRATION_SYSTEM).toContain('Play between friends');
    expect(NARRATION_SYSTEM).toContain('"I stay until four"');
    const tracker = buildExtractionPrompt(withHana(), 'I stay until four.', TACKLE).messages.map((m) => m.content).join('\n');
    expect(tracker).toContain('play between friends, a hug or an argument is never combat');
  });
});

describe('watch: meeting Kakashi or Guy for the first time', () => {
  test('the first-time card, then a bond that remembers the past', () => {
    let db = at(seed(), 14, ['Kakashi Hatake']);
    expect(person(db, 'Kakashi Hatake').met).toBe(false);
    const first = promptText(db, '"Senpai."');
    expect(first).toContain('FIRST TIME THEY SEE YOU IN THE STORY: measures you');
    expect(first).toContain('Kan knows them as Kakashi Hatake');

    db = play(db, '"Senpai."', '"Kan," Kakashi says, one hand near his pouch. "You\'re supposed to be dead."', {
      characters_present: ['kakashi-hatake'],
      beat: 'exchange',
      beat_with: ['kakashi-hatake'],
      scene_pace: 'conversation',
    }).db;

    const kakashi = person(db, 'Kakashi Hatake');
    expect(kakashi.met).toBe(true);
    const bond = bondOf(db, 'Kakashi Hatake')!;
    expect(bond.status).toBe('Your old ANBU captain');
    expect(bond.relationship).toBe('acquaintance');
    expect(bond.affinity).toBe(PRIOR_BONDS['Kakashi Hatake'].theirs);
    expect(bond.yourFeelings?.affinity).toBe(PRIOR_BONDS['Kakashi Hatake'].yours);

    const later = promptText(db, '"Still reading those books?"');
    expect(later).toContain('KNEW YOU: your ANBU captain');
    expect(later).not.toContain('FIRST TIME THEY SEE YOU');
  });

  test('the tracker’s own bond line adds to the old bond, it does not replace it', () => {
    let db = at(seed(), 14, ['Might Guy']);
    db = play(db, '"Guy-san."', '"KAN! You\'re ALIVE!" Guy grabs both your shoulders.', {
      characters_present: ['might-guy'],
      beat: 'exchange',
      bonds: [{ character_id: 'might-guy', affinity_change: 2, note: 'Overjoyed you are alive; wants answers.' }],
    }).db;
    const bond = bondOf(db, 'Might Guy')!;
    expect(bond.affinity).toBe(PRIOR_BONDS['Might Guy'].theirs + 2);
    expect(bond.status).toBe('Taught you some taijutsu');
    expect(bond.note).toBe('Overjoyed you are alive; wants answers.');
  });

  test('Guy’s grab of joy is not a fight either', () => {
    const db = at(seed(), 14, ['Might Guy']);
    const result = play(db, '"Guy-san."', '"KAN!" Guy tackles you in a hug that lifts you off your boots.', {
      ...COMBAT_TAG,
      characters_present: ['might-guy'],
    });
    expect(result.db.state.scenePace).toBe('conversation');
  });

  test('every prior bond is someone in KNEW YOU, with a second-person note', () => {
    for (const [name, prior] of Object.entries(PRIOR_BONDS)) {
      expect(seed().entities.some((entity) => entity.name === name)).toBe(true);
      expect(prior.note).not.toMatch(/\bKan\b/);
      expect(prior.status.split(/\s+/).length).toBeLessThanOrEqual(4);
    }
  });

  test('Kakashi led the unit; Kan served in it (Session 5 slip)', () => {
    expect(KAN_HISTORY).toContain('Kakashi was its captain; Kan was one of its members and never led it');
  });

  test('Kakashi’s first scene after the funeral: jonin, former ANBU', () => {
    const completed = new Set(['izumi-funeral']);
    expect(eraRoleFor('Kakashi Hatake', completed)).toBe('Leaf jonin · former ANBU');
  });
});

describe('watch: Itachi raises Hana only in private', () => {
  test('alone at 18: he may', () => {
    expect(formatHanaPrivacyLine(at(seed(), 18, ['Itachi Uchiha']))).toContain('PRIVATE: you and Itachi are alone');
    expect(promptText(at(seed(), 18, ['Itachi Uchiha']), '"Say it."')).toContain('He may raise your crush on Hana');
  });

  test('anyone else in the scene, Hana included: never', () => {
    for (const other of ['Kisame Hoshigaki', 'Hana Inuzuka']) {
      const line = formatHanaPrivacyLine(at(seed(), 18, ['Itachi Uchiha', other]));
      expect(line).toStartWith('NOT PRIVATE');
      expect(line).toContain('never mentions or hints');
    }
  });

  test('a crowded place is not private', () => {
    const db = at(seed(), 18, ['Itachi Uchiha'], { location: 'Tanzaku Town market street', locationKind: 'settlement' });
    expect(formatHanaPrivacyLine(db)).toContain('strangers within earshot');
  });

  test('under 18 he does not raise it; without Itachi there is no line', () => {
    expect(formatHanaPrivacyLine(at(seed(), 16, ['Itachi Uchiha']))).toContain('under 18');
    expect(formatHanaPrivacyLine(at(seed(), 18, ['Kisame Hoshigaki']))).toBe('');
  });
});

describe('watch: women showing interest on their own (from 18)', () => {
  const adult = (db: AppDatabase) => at(db, 21, []);

  test('about a third of eligible women, fixed per person, never Hana or a locked heart', () => {
    const db = adult(seed());
    const women = db.entities.filter((entity) => entity.gender === 'female' && entity.romanceAccessibility === 'winnable' && entity.name !== 'Hana Inuzuka');
    const drawn = women.filter((entity) => drawnToKanLine(db, entity, undefined));
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.length).toBeLessThan(women.length);
    for (const entity of db.entities.filter((item) => item.romanceAccessibility === 'lore-locked')) {
      expect(drawnToKanLine(db, entity, undefined)).toBe('');
    }
    expect(drawnToKanLine(db, person(db, 'Hana Inuzuka'), undefined)).toBe('');
    // Fixed: the same answer every turn.
    for (const entity of women) {
      expect(Boolean(drawnToKanLine(db, entity, undefined))).toBe(Boolean(drawnToKanLine(db, entity, undefined)));
    }
  });

  test('a woman already interested always shows it; an ex or a refusal never does', () => {
    const db = adult(seed());
    const woman = person(db, 'Anko Mitarashi');
    const bond = { ...bondOf(db, 'Hana Inuzuka')!, entityId: woman.id, characterName: woman.name };
    expect(drawnToKanLine(db, woman, { ...bond, relationship: 'romantic interest' })).toContain('she wants you');
    expect(drawnToKanLine(db, woman, { ...bond, relationship: 'ex' })).toBe('');
    expect(drawnToKanLine(db, woman, { ...bond, relationship: 'rejected' })).toBe('');
  });

  test('nothing while Kan or she is under 18', () => {
    const young = at(seed(), 16, []);
    for (const entity of young.entities) expect(drawnToKanLine(young, entity, undefined)).toBe('');
  });

  test('the cue is on her card only while she is in the scene', () => {
    const db = adult(seed());
    const woman = db.entities.find((entity) => entity.gender === 'female' && drawnToKanLine(db, entity, undefined))!;
    const here = at(db, 21, [woman.name]);
    expect(promptText(here, '"Evening."')).toContain('DRAWN TO YOU');
    expect(promptText(at(db, 21, ['Kisame Hoshigaki']), `"Have you seen ${woman.name}?"`)).not.toContain('DRAWN TO YOU');
  });
});

describe('watch: people in a room react differently', () => {
  const stranger = (id: string, name: string): EntityRecord =>
    ({ id, name, type: 'character', aliases: [], tags: [] }) as unknown as EntityRecord;

  test('no two people in a room share a temperament', () => {
    // Find three ids that hash to the same temperament.
    const ids: string[] = [];
    const target = temperamentFor('room_0');
    for (let i = 0; ids.length < 3 && i < 5000; i += 1) {
      if (temperamentFor(`room_${i}`) === target) ids.push(`room_${i}`);
    }
    expect(ids.length).toBe(3);
    const voices = roomVoices(ids.map((id, index) => stranger(id, `the stranger ${index}`)));
    expect(new Set(voices.values()).size).toBe(3);
  });

  test('the cast keeps its own voices', () => {
    const db = seed();
    const voices = roomVoices([person(db, 'Itachi Uchiha'), person(db, 'Hana Inuzuka')], db);
    expect(voices.get(person(db, 'Itachi Uchiha').id)).not.toStartWith('temperament:');
  });

  test('the narrator is told how many are really here, and who', () => {
    const db = at(seed(), 18, ['Hana Inuzuka', 'Kiba Inuzuka', 'Tsume Inuzuka']);
    const text = promptText(db, 'I show them the Sharingan.');
    expect(text).toMatch(/3 people here \([^)]*Hana Inuzuka[^)]*\): when something happens, each reacts differently/);
    // Someone only mentioned is not counted.
    const alone = promptText(at(seed(), 18, ['Hana Inuzuka']), '"Is Kiba home?"');
    expect(alone).not.toMatch(/\d people here/);
  });
});

describe('watch: the tracker rewriting a canon person’s role', () => {
  test('a character update never changes a canon role', () => {
    const db = seed();
    const kakashi = person(db, 'Kakashi Hatake');
    const next = applyEntityDiff(db, { entityId: kakashi.id, name: kakashi.name, role: 'Sixth Hokage' });
    expect(person(next, 'Kakashi Hatake').role).toBe(kakashi.role);
  });

  test('nor a bond label: a title they don’t hold yet is dropped', () => {
    const db = seed();
    const kakashi = person(db, 'Kakashi Hatake');
    expect(canonTitleOutOfEra(kakashi, undefined, 'The Hokage')).toBe('Hokage');
    expect(canonTitleOutOfEra(kakashi, undefined, 'Your old ANBU captain')).toBeNull();
    expect(canonTitleOutOfEra(kakashi, undefined, 'Wary old comrade')).toBeNull();
    expect(canonTitleOutOfEra(person(db, 'Tsunade Senju'), undefined, 'Fifth Hokage')).toBe('Hokage');

    const guarded = guardBondDiff(db, kakashi, undefined, { character: kakashi.name, status: 'Sixth Hokage', affinityDelta: 1 }, { bigTurn: false });
    expect(guarded.bond.status).toBeUndefined();
    expect(guarded.refused.join(' ')).toContain('Hokage is not who they are now');
  });

  test('once canon gives the title, it is allowed', () => {
    const db = seed();
    const done = new Set(CANON_MILESTONES.map((milestone) => milestone.id));
    const kakashi = { ...person(db, 'Kakashi Hatake'), role: eraRoleFor('Kakashi Hatake', done)! };
    expect(canonTitleOutOfEra(kakashi, undefined, 'Sixth Hokage')).toBeNull();
  });

  test('an original character’s label is the story’s to write', () => {
    let db = seed();
    db = applyEntityDiff(db, { isNew: true, name: 'Renji the ferryman', role: 'ferryman', gender: 'male' });
    expect(canonTitleOutOfEra(person(db, 'Renji the ferryman'), undefined, 'Lord of the river')).toBeNull();
  });

  test('an old save already past 18/3 catches up on load', () => {
    const db = seed();
    const cutoff = 18 * 10000 + 3 * 100 + 31;
    const completed = CANON_MILESTONES.filter((m) => m.from && m.from.year * 10000 + m.from.month * 100 + (m.from.day ?? 1) <= cutoff).map((m) => m.id);
    const old = {
      ...db,
      state: { ...db.state, inStoryDate: { year: 18, month: 4, day: 2, hour: 9, minute: 0 }, canonProgress: { ...db.state.canonProgress!, completed } },
    };
    const loaded = normalizeDatabase(JSON.parse(JSON.stringify(old)));
    const role = person(loaded, 'Kakashi Hatake').role!;
    expect(role).toBe(eraRoleFor('Kakashi Hatake', new Set(completed))!);
    expect(role).not.toContain('ANBU captain');
    expect(role).not.toContain('Hokage');
  });
});

describe('Sessions 5 and 6: narrator slips the app can head off', () => {
  test('6 AM is the start of the day, not six hours of daylight gone', () => {
    const at6 = { year: 15, month: 3, day: 2, hour: 6, minute: 0 };
    expect(daylightNote(at6)).toContain('the day has just begun');
    expect(daylightNote({ ...at6, hour: 13 })).toBe('about 7 hours of daylight gone, about 6 left');
    expect(daylightNote({ ...at6, hour: 3 })).toContain('before dawn');
    expect(daylightNote({ ...at6, hour: 22 })).toContain('night');
    const db = { ...seed(), state: { ...seed().state, inStoryDate: at6 } };
    expect(promptText(db, 'I wake.')).toContain('6:00 AM, the day has just begun');
  });

  test('boots stay on, asleep too, until the page takes them off', () => {
    expect(KAN_FEET_LINE).toContain('His boots stay on (asleep too)');
  });

  test('the Haimaru brothers are three dogs', () => {
    expect(promptText(at(seed(), 18, ['Hana Inuzuka']), '"Hi."')).toContain('three separate grey dogs, never one three-headed dog');
  });
});
