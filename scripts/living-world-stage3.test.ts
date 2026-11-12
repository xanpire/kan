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

import { shiftDate } from '../lib/rpg/calendar';
import {
  applyConsequences,
  advanceConsequences,
  canReturn,
  consequenceOffer,
  plantSeed,
  seedsOf,
} from '../lib/rpg/consequences';
import { normalizeDatabase } from '../lib/rpg/db';
import { resolveCharacterRefs } from '../lib/rpg/entities';
import { regionOf, travelDaysBetween, whereaboutsRegion } from '../lib/rpg/geography';
import {
  deliverLetters,
  interceptionRisks,
  keepKansWords,
  letterArchive,
  letterDays,
  letterOffer,
  receiveLetters,
  sendLetters,
  tidyLetter,
} from '../lib/rpg/letters';
import {
  advanceLives,
  applyLifeEvents,
  canonStoryWeight,
  isSideCharacter,
  markReunions,
  sinceYouLastSaw,
} from '../lib/rpg/lives';
import { appendStoryMessage } from '../lib/rpg/log';
import { applyStateStep } from '../lib/rpg/memoryJobs';
import { latestPov, parsePovLines, povCandidates, povInstruction, resolvePovs } from '../lib/rpg/povMemories';
import { buildExtractionPrompt, buildNarrationPrompt, buildSceneSummaryPrompt, trackerPromptText } from '../lib/rpg/prompt';
import { bingoListings, ensureLeafListing } from '../lib/rpg/reputation';
import {
  applyEpithet,
  epithetLines,
  formatRenownBlock,
  knownEpithets,
  localEpithet,
  posterLine,
  recordDeeds,
  renownOf,
  rumourOffer,
  themeScores,
} from '../lib/rpg/renown';
import { seedDatabase } from '../lib/rpg/seed';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import { TURN_STATE_SCHEMA } from '../lib/rpg/stateSchema';
import type { AppDatabase, CalendarDate, EntityRecord } from '../lib/rpg/types';
import { parseTitledSummary } from '../lib/rpg/util';

const seed = () => normalizeDatabase(seedDatabase('slot_stage3', 'Stage 3'));
const person = (db: AppDatabase, name: string) => db.entities.find((entity) => entity.name === name)!;
const later = (db: AppDatabase, days: number, extra: Partial<AppDatabase['state']> = {}): AppDatabase => ({
  ...db,
  state: { ...db.state, inStoryDate: shiftDate(db.state.inStoryDate, days), scenePace: 'downtime', ...extra },
});
const update = (db: AppDatabase, name: string, change: Partial<EntityRecord>): AppDatabase => ({
  ...db,
  entities: db.entities.map((entity) => (entity.name === name ? { ...entity, ...change } : entity)),
});
const affinity = (db: AppDatabase, id: string) => db.bonds.find((bond) => bond.entityId === id)?.affinity ?? 0;
const narratorText = (db: AppDatabase, input = '*You wait.*') =>
  buildNarrationPrompt(db, input).messages.map((message) => message.content).join('\n');
const trackerText = (db: AppDatabase, narration = 'Nothing happens.') => trackerPromptText(buildExtractionPrompt(db, '*You wait.*', narration));

function play(db: AppDatabase, input: string, narration: string, block: Record<string, unknown>) {
  let next = appendStoryMessage(db, 'user', input, null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  const diff = resolveCharacterRefs(next, convertStateBlock(block).diff);
  return applyStateStep(next, diff, { turnLogId, userMessage: input, narration }, new Set());
}

/** A save in the Rain with nobody around, the clock at a date of our choosing. */
function inRain(date?: CalendarDate): AppDatabase {
  const base = seed();
  return {
    ...base,
    state: {
      ...base.state,
      location: 'a teahouse in the Hidden Rain Village',
      locationKind: 'settlement',
      sceneCast: [],
      scenePace: 'downtime',
      ...(date ? { inStoryDate: date } : {}),
    },
  };
}

describe('geography', () => {
  test('regions from place text, and travel days from the lore', () => {
    expect(regionOf('Forest outside Hidden Leaf')).toBe('fire');
    expect(regionOf('a teahouse in the Hidden Rain Village')).toBe('rain');
    expect(regionOf('a cave, out of the rain')).toBeNull();
    expect(regionOf('Amegakure')).toBe('rain');
    expect(regionOf('the ruins of Uzushio')).toBe('whirlpools');
    expect(travelDaysBetween('fire', 'rain')).toBe(3);
    expect(travelDaysBetween('rain', 'grass')).toBe(1);
    expect(travelDaysBetween('fire', 'lightning')).toBeGreaterThanOrEqual(5);
    // Through the Rain is shorter than nothing at all: Grass to Wind goes via the Rain.
    expect(travelDaysBetween('grass', 'wind')).toBe(4);
  });

  test('where someone is: what the story said, where Kan saw them, else home', () => {
    const db = seed();
    expect(whereaboutsRegion(person(db, 'Danzo Shimura'))).toBe('fire');
    expect(whereaboutsRegion({ ...person(db, 'Hana Inuzuka'), whereabouts: 'on a mission in the Land of Waves' })).toBe('waves');
  });
});

describe('better letters', () => {
  test('travel time follows the distance and the carrier', () => {
    expect(letterDays('rain', 'fire', 'bird', 'x')).toBeLessThan(letterDays('rain', 'fire', 'courier', 'x'));
    expect(letterDays('fire', 'lightning', 'courier', 'x')).toBeGreaterThan(letterDays('fire', 'rain', 'courier', 'x'));
    expect(letterDays('rain', 'rain', 'bird', 'x')).toBeGreaterThanOrEqual(1);
    // Nobody knows where anyone is: the old 3-9 days.
    const unknown = letterDays(null, 'fire', 'bird', 'x');
    expect(unknown).toBeGreaterThanOrEqual(3);
    expect(unknown).toBeLessThanOrEqual(9);
  });

  test("Kan's own words are kept, only spelling and punctuation tidied", () => {
    expect(tidyLetter('hana , i am alive.i think of you')).toBe('Hana, I am alive. I think of you.');
    const input = '*I write to Hana.* "hana , i am alive and i am sorry i left without a word"';
    // The tracker fixed spelling only: kept.
    expect(keepKansWords('Hana, I am alive and I am sorry I left without a word.', input)).toBe(
      'Hana, I am alive and I am sorry I left without a word.'
    );
    // The tracker rewrote it: Kan's own words win.
    const rewritten = keepKansWords('Dearest Hana, my heart aches with regret for my sudden departure into the night.', input);
    expect(rewritten).toBe('Hana, I am alive and I am sorry I left without a word.');
  });

  test('a letter to Hana is kept word for word, and her reply is archived with its words', () => {
    let db = inRain();
    const hana = person(db, 'Hana Inuzuka');
    db = sendLetters(
      db,
      [{ entityId: hana.id, name: hana.name, gist: 'alive and sorry', text: 'Hana, I am alive.', carrier: 'bird' }],
      '"Hana, I am alive."'
    );
    const sent = db.state.post!.letters.find((letter) => letter.direction === 'from-kan')!;
    expect(sent.text).toBe('Hana, I am alive.');
    expect(sent.carrier).toBe('bird');
    expect(sent.toRegion).toBe('fire');

    db = deliverLetters(later(db, 21));
    const reply = db.state.post!.letters.find((letter) => letter.direction === 'to-kan');

    // Whatever the road did, it is decided and kept.
    if (!reply) {
      expect(sent.status === 'travelling' || db.state.post!.letters[0].status === 'lost').toBe(true);
      return;
    }

    db = later(db, 21);
    const offer = letterOffer(db);
    if (offer?.kind === 'reply') {
      db = receiveLetters(db, [{ entityId: hana.id, name: hana.name, text: 'You idiot. Come home.' }], offer);
      const archive = letterArchive(db);
      expect(archive.some((letter) => letter.text === 'You idiot. Come home.' && letter.label === 'From Hana Inuzuka')).toBe(true);
      expect(archive.some((letter) => letter.label.startsWith('To Hana Inuzuka · answered'))).toBe(true);
    }
  });

  test('letters to the dead are kept, never sent, and need no reply', () => {
    let db = inRain();
    const shisui = person(db, 'Shisui Uchiha');
    db = sendLetters(db, [{ entityId: shisui.id, name: shisui.name, text: 'I still have your kunai.' }], '"I still have your kunai."');
    const letter = db.state.post!.letters[0];
    expect(letter.status).toBe('unsent');
    db = deliverLetters(later(db, 30));
    expect(db.state.post!.letters.some((item) => item.direction === 'to-kan')).toBe(false);
    expect(letterArchive(db)[0].label).toBe('To Shisui Uchiha · never sent');
  });

  test('Root reads letters to the Leaf while Danzō lives; codes and dead drops lower the risk', () => {
    const db = inRain();
    const hana = person(db, 'Hana Inuzuka');
    const plain = interceptionRisks(db, hana, 'courier', false);
    expect(plain.find((risk) => risk.who === 'root')?.chance).toBe(22);
    const careful = interceptionRisks(db, hana, 'dead-drop', true);
    expect(careful.find((risk) => risk.who === 'root')!.chance).toBeLessThan(10);

    const danzoDead = update(db, 'Danzo Shimura', { deceased: { known: true } });
    expect(interceptionRisks(danzoDead, hana, 'courier', false).some((risk) => risk.who === 'root')).toBe(false);
  });

  test('an interception plants a delayed consequence (the letter still arrives)', () => {
    // Try a handful of days: the road is deterministic per day, so some day is read.
    let found = false;

    for (let day = 0; day < 40 && !found; day += 1) {
      let db = later(inRain(), day);
      const hana = person(db, 'Hana Inuzuka');
      db = sendLetters(db, [{ entityId: hana.id, name: hana.name, gist: 'meet me at the bridge' }]);
      const letter = db.state.post!.letters[0];

      if (letter.interceptedBy === 'root') {
        found = true;
        const seed = seedsOf(db)[0];
        expect(seed.kind).toBe('intercepted');
        expect(seed.what).toContain('Root read your letter to Hana Inuzuka');
        expect(seed.letterId).toBe(letter.id);
        expect(letter.status).toBe('travelling');
      }
    }

    expect(found).toBe(true);
  });

  test('a letter can be lost for a real reason: the reader moved on', () => {
    let lost = false;

    for (let day = 0; day < 40 && !lost; day += 1) {
      let db = later(inRain(), day);
      const hana = person(db, 'Hana Inuzuka');
      db = sendLetters(db, [{ entityId: hana.id, name: hana.name, carrier: 'bird' }]);
      // She left for the Land of Lightning before it got there.
      db = update(db, 'Hana Inuzuka', { whereabouts: 'on a long mission in the Land of Lightning' });
      db = deliverLetters(later(db, 25));
      const letter = db.state.post!.letters.find((item) => item.direction === 'from-kan')!;

      // The road itself can also lose one (a bird, a courier); keep looking
      // for one lost because she had moved on.
      if (letter.status === 'lost') {
        expect(letter.lostReason).toBeTruthy();
        if (letter.lostReason === 'they had moved on before it arrived') lost = true;
      }
    }

    expect(lost).toBe(true);
  });

  test("someone close writes for Kan's birthday, and only once that year", () => {
    const birthday: CalendarDate = { year: 14, month: 6, day: 30, hour: 20, minute: 0 };
    let db = inRain(birthday);
    // Everyone has been apart a while, and the post was quiet recently.
    db = { ...db, state: { ...db.state, post: { letters: [], lastLetterIn: shiftDate(birthday, -3) } } };
    const offer = letterOffer(db);
    expect(offer?.kind).toBe('birthday');
    expect(narratorText(db)).toContain('for your birthday: they remembered');

    db = receiveLetters(db, [{ entityId: offer!.entity.id, name: offer!.entity.name, text: 'Happy birthday, idiot.' }], offer);
    expect(db.state.post!.letters[0].occasion).toBe('birthday');
    expect(letterOffer(later(db, 1))?.kind).not.toBe('birthday');
  });

  test('the state block carries the letter words, the carrier, and received letters with text', () => {
    const db = seed();
    const { diff } = convertStateBlock({
      letters_sent: [{ to: 'hana-inuzuka', gist: 'alive', text: 'Hana, I am alive.', carrier: 'ninken', coded: true }],
      letters_received: [{ from: 'suzume', text: 'Eat something.' }],
    });
    const resolved = resolveCharacterRefs(db, diff!);
    expect(resolved.lettersSent?.[0]).toMatchObject({ name: 'Hana Inuzuka', text: 'Hana, I am alive.', carrier: 'ninken', coded: true });
    expect(resolved.lettersReceived?.[0]).toMatchObject({ name: 'Suzume', text: 'Eat something.' });
    // Older replies (a list of ids) still read.
    expect(convertStateBlock({ letters_received: ['suzume'] }).diff?.lettersReceived?.[0].name).toBe('suzume');
    expect(trackerText(db, 'A hawk lands with a letter.')).toContain('ONLY spelling, commas and punctuation corrected');
  });
});

describe('people with their own lives', () => {
  test('side characters are the ones canon leaves alone', () => {
    const db = seed();
    expect(isSideCharacter(person(db, 'Hana Inuzuka'))).toBe(true);
    expect(isSideCharacter(person(db, 'Suzume'))).toBe(true);
    expect(canonStoryWeight(person(db, 'Itachi Uchiha'))).toBeGreaterThanOrEqual(3);
    expect(isSideCharacter(person(db, 'Itachi Uchiha'))).toBe(false);
  });

  test("Hana's life moves on while Kan is away, with canon-safe events only", () => {
    let db = later(seed(), 400);
    db = advanceLives(db);
    const life = person(db, 'Hana Inuzuka').lifeEvents ?? [];
    expect(life.length).toBeGreaterThanOrEqual(2);
    expect(life.every((event) => !['romance', 'family', 'move', 'promotion'].includes(event.kind))).toBe(true);
    expect(life.every((event) => !event.known)).toBe(true);
    // Itachi's life is canon's to tell.
    expect(person(db, 'Itachi Uchiha').lifeEvents ?? []).toHaveLength(0);
    // Deterministic: the same save gets the same life.
    expect(advanceLives(later(seed(), 400)).entities.find((e) => e.name === 'Hana Inuzuka')!.lifeEvents).toEqual(life);
  });

  test('original characters can be promoted, marry and move', () => {
    let db = seed();
    const ryo: EntityRecord = {
      id: 'entity_ryo',
      name: 'Ryo Tanabe',
      type: 'character',
      aliases: [],
      role: 'genin of the Hidden Grass',
      birthYear: -5,
      lastSeen: db.state.inStoryDate,
      lastSeenAt: 'a village in the Land of Grass',
      met: true,
      tags: [],
    };
    db = { ...db, entities: [...db.entities, ryo], bonds: [...db.bonds, { ...db.bonds[0], id: 'bond_ryo', entityId: ryo.id, characterName: ryo.name, affinity: 3, isMajor: false }] };
    db = advanceLives(later(db, 1500));
    db = advanceLives(db);
    db = advanceLives(db);
    const kinds = (person(db, 'Ryo Tanabe').lifeEvents ?? []).map((event) => event.kind);
    expect(kinds.length).toBeGreaterThan(3);
  });

  test('meeting again after months: the narrator gets a "since you last saw them" note', () => {
    let db = advanceLives(later(seed(), 200));
    const before = db;
    // Hana walks into the scene.
    db = {
      ...db,
      state: { ...db.state, sceneCast: ['Hana Inuzuka'] },
      entities: db.entities.map((entity) => (entity.name === 'Hana Inuzuka' ? { ...entity, lastSeen: db.state.inStoryDate } : entity)),
    };
    db = markReunions(before, db);
    const hana = person(db, 'Hana Inuzuka');
    expect(hana.reunion?.lastSeen.year).toBe(13);
    expect((hana.lifeEvents ?? []).every((event) => event.known)).toBe(true);

    const note = sinceYouLastSaw(db, hana);
    expect(note).toContain('Since you last saw them');
    expect(note).toContain('their life:');
    expect(narratorText(db, '"Hana."')).toContain('Since you last saw them');
  });

  test('named but not here yet: the note waits for them to appear; canon-silent lives leave room', () => {
    const db = later(seed(), 90);
    const suzume = { ...person(db, 'Suzume'), lifeEvents: [] };
    const note = sinceYouLastSaw(db, suzume);
    expect(note.startsWith('Only if they appear: ')).toBe(true);
    expect(note).toContain('canon says nothing of their life since');
    expect(note).toContain('Nothing that changes their canon path.');
  });

  test('the tracker keeps what the page said about their life', () => {
    let db = seed();
    const { diff } = convertStateBlock({ life_events: [{ character_id: 'hana-inuzuka', event: 'was made head of the Inuzuka clinic' }] });
    db = applyLifeEvents(db, resolveCharacterRefs(db, diff!).lifeEvents);
    const life = person(db, 'Hana Inuzuka').lifeEvents!;
    expect(life[life.length - 1]).toMatchObject({ text: 'was made head of the Inuzuka clinic', source: 'story', known: true });
  });

  test("a letter can carry news of the writer's own life", () => {
    let db = advanceLives(later(inRain(), 300));
    db = { ...db, state: { ...db.state, post: { letters: [] } } };
    const offer = letterOffer(db);
    expect(offer).not.toBeNull();
    if (offer?.theirNews) {
      expect(narratorText(db)).toContain('news of their own life');
      db = receiveLetters(db, [{ entityId: offer.entity.id, name: offer.entity.name }], offer);
      expect((person(db, offer.entity.name).lifeEvents ?? []).every((event) => event.known)).toBe(true);
    }
  });
});

describe("rumours, posters and Kan's name", () => {
  test("the Leaf's first word on Kan names him; the underworld picks it up", () => {
    let db = later(seed(), 2);
    db = ensureLeafListing(db);
    db = recordDeeds(db, []);
    expect(renownOf(db).epithets.leaf?.name).toBe("Itachi's Shadow");
    expect(renownOf(db).epithets.underworld?.name).toBe('the Other Uchiha');
    expect(knownEpithets(db)).toHaveLength(0);
  });

  test('new deeds outgrow the old name over the years, per audience', () => {
    let db = ensureLeafListing(later(seed(), 2));
    db = recordDeeds(db, []);

    for (let i = 0; i < 4; i += 1) {
      db = later(db, 120);
      db = recordDeeds(db, [{ faction: 'leaf', change: 10, reason: 'Burned a Leaf patrol camp to ash with Fire Style and walked away' }]);
    }

    expect(themeScores(db, 'leaf')[0].theme.id).toBe('fire');
    expect(renownOf(db).epithets.leaf?.name).toBe('the Ash Wraith');
    expect(renownOf(db).epithets.leaf?.history?.[0].name).toBe("Itachi's Shadow");
    // The Rain never saw it.
    expect(renownOf(db).epithets.rain).toBeUndefined();
  });

  test('a name the story gives Kan sticks, and Kan knows it', () => {
    let db = ensureLeafListing(later(seed(), 2));
    db = recordDeeds(db, []);
    db = applyEpithet(db, { audience: 'rain', name: 'the Ghost of the Rain' });
    expect(renownOf(db).epithets.rain).toMatchObject({ name: 'the Ghost of the Rain', theme: 'story', known: true });
    // Hearing an engine name marks it known.
    db = applyEpithet(db, { audience: 'underworld', name: 'The Other Uchiha' });
    expect(renownOf(db).epithets.underworld?.known).toBe(true);
  });

  test('strangers use the local name; wanted posters hang where a village lists him at B or above', () => {
    let db = ensureLeafListing(later(seed(), 2));
    db = recordDeeds(db, []);
    db = { ...db, state: { ...db.state, location: 'Tanzaku Town, Land of Fire', locationKind: 'settlement', inStoryDate: { ...db.state.inStoryDate, hour: 14 } } };
    expect(localEpithet(db)?.epithet.name).toBe("Itachi's Shadow");
    expect(epithetLines(db)[0]).toContain("Itachi's Shadow");
    expect(bingoListings(db).find((listing) => listing.village === 'leaf')?.rank).toBe('B');
    expect(posterLine(db)).toContain("Hidden Leaf's poster for you hangs here");
    expect(posterLine(db)).toContain('poor sketch');
    expect(narratorText(db)).toContain('WANTED POSTERS');
    // Out in the forest there are no posters.
    expect(posterLine({ ...db, state: { ...db.state, location: 'deep forest', locationKind: 'wilderness' } })).toBe('');
  });

  test('rumours travel as fast as people carry them, and grow with distance', () => {
    let db = ensureLeafListing(later(inRain(), 2));
    db = recordDeeds(db, []);
    db = { ...db, state: { ...db.state, inStoryDate: { ...db.state.inStoryDate, hour: 14 } } };
    // Fill the log so the rumour window can open.
    for (let i = 0; i < 12; i += 1) db = appendStoryMessage(db, 'user', 'look', null, 0, 0);

    const offers = [];
    let probe = db;
    for (let i = 0; i < 12; i += 1) {
      probe = appendStoryMessage(probe, 'user', 'look', null, 0, 0);
      const offer = rumourOffer(later(probe, 60, { inStoryDate: { ...shiftDate(db.state.inStoryDate, 60), hour: 14 } }));
      if (offer) offers.push(offer);
    }

    expect(offers.length).toBeGreaterThan(0);
    // The massacre in the Leaf, told in the Rain two months on: grown in the telling.
    expect(offers[0].level).toBe(1);
    // Too soon: three days of road need about twelve days of talk.
    const tooSoon = later(probe, 3);
    expect(rumourOffer(tooSoon)).toBeNull();
    expect(formatRenownBlock(later(probe, 60))).toBeDefined();
  });

  test('the tracker can report a name, and seeing a bingo book teaches the village name', () => {
    const { diff } = convertStateBlock({ epithet: { audience: 'rain', name: 'the Grey Fire' } });
    expect(diff?.epithet).toEqual({ audience: 'rain', name: 'the Grey Fire' });
    expect(TURN_STATE_SCHEMA.required).toEqual(expect.arrayContaining(['epithet', 'consequences', 'consequences_returned', 'life_events']));
  });
});

describe('delayed consequences', () => {
  test('the tracker plants a seed; it waits, and only comes back where it is realistic', () => {
    let db = { ...seed(), state: { ...seed().state, location: 'a road in the Land of Grass', locationKind: 'road' as const, sceneCast: [] } };
    const { diff } = convertStateBlock({
      consequences: [
        {
          kind: 'spared',
          character_id: null,
          who: 'the bandit you spared at the ford',
          what: 'You let the bandit live at the Grass ford',
          want: 'to repay you, or to get even',
          witnesses: [],
          faction: null,
          when: 'weeks',
        },
      ],
    });
    const applied = applyConsequences(db, resolveCharacterRefs(db, diff!).consequences, [], null);
    db = applied.db;
    const [seedRecord] = seedsOf(db);
    expect(seedRecord).toMatchObject({ kind: 'spared', status: 'waiting', region: 'grass' });
    expect(canReturn(db, seedRecord)).toBe(false);

    // Months later, back on a road in the Grass: it can come back.
    const back = later(db, 60, { locationKind: 'road', scenePace: 'travel' });
    expect(canReturn(back, seedRecord)).toBe(true);
    // Far away in the Land of Lightning: it cannot.
    expect(canReturn({ ...back, state: { ...back.state, location: 'a road in the Land of Lightning' } }, seedRecord)).toBe(false);
    // Deep in the wilderness nobody crosses paths with you.
    expect(canReturn({ ...back, state: { ...back.state, locationKind: 'wilderness' } }, seedRecord)).toBe(false);
  });

  test('a lie comes out only face to face; the person must be in the scene', () => {
    let db = seed();
    db = applyConsequences(db, [{ kind: 'lie', entityId: person(db, 'Itachi Uchiha').id, who: 'Itachi Uchiha', what: 'You lied to Itachi about where you went', when: 'weeks' }], [], null).db;
    const [lie] = seedsOf(db);
    const apart = later(db, 60);
    expect(canReturn(apart, lie)).toBe(false);
    const together = { ...apart, state: { ...apart.state, sceneCast: ['Itachi Uchiha'] } };
    expect(canReturn(together, lie)).toBe(true);
  });

  test('a witness talks when the time comes: the village wants Kan more', () => {
    let db = ensureLeafListing(later(seed(), 2));
    db = applyConsequences(db, [{ kind: 'witness', who: 'the chunin you left alive', what: 'A Leaf chunin saw you kill his squad and lived', faction: 'leaf', when: 'weeks' }], [], null).db;
    const heat = db.state.reputation!.villages.leaf!.heat;
    db = advanceConsequences(later(db, 60));
    expect(db.state.reputation!.villages.leaf!.heat).toBeGreaterThan(heat);
    expect(seedsOf(db)[0].status).toBe('returned');
  });

  test('a seed fades when its time runs out, or when the person it comes through dies', () => {
    let db = seed();
    db = plantSeed(db, { kind: 'debt', who: 'a smuggler', what: 'You owe a smuggler for passage', witnesses: [], when: 'weeks' });
    db = advanceConsequences(later(db, 400));
    expect(seedsOf(db)[0].status).toBe('faded');
  });

  test('offered to the narrator softly, marked returned by the tracker, and no "will remember that" notice', () => {
    let db = { ...seed(), state: { ...seed().state, location: 'a road in the Land of Fire', locationKind: 'road' as const, sceneCast: [] } };
    db = applyConsequences(db, [{ kind: 'spared', who: 'the hunter-nin you let go', what: 'You let a Leaf hunter-nin go', when: 'weeks' }], [], null).db;
    db = later(db, 150, { locationKind: 'road', scenePace: 'travel', inStoryDate: { ...shiftDate(db.state.inStoryDate, 150), hour: 13 } });

    let offered = null;
    let probe = db;
    for (let i = 0; i < 12 && !offered; i += 1) {
      probe = appendStoryMessage(probe, 'user', 'walk', null, 0, 0);
      offered = consequenceOffer(probe);
    }
    expect(offered).not.toBeNull();
    // Pressed: past 90 days it is offered on every fitting turn.
    expect(narratorText(probe)).toContain('SOMETHING COMES BACK');
    expect(trackerText(probe)).toContain(`consequences_returned ["${offered!.id}"]`);

    const result = play(probe, '*I keep walking.*', 'The hunter-nin steps out of the trees and lowers his mask.', {
      consequences_returned: [offered!.id],
      consequences: [{ kind: 'promise', character_id: 'itachi-uchiha', who: 'Itachi', what: 'You promised Itachi you would not go back to the Leaf', want: null, witnesses: [], faction: null, when: 'months' }],
    });
    expect(seedsOf(result.db).find((item) => item.id === offered!.id)?.status).toBe('returned');
    expect(result.notice).toBeNull();
    expect(seedsOf(result.db).some((item) => item.kind === 'promise' && item.status === 'waiting')).toBe(true);
  });
});

describe('memories from their point of view', () => {
  test('the summary asks the people it mattered to for their own line, and reads it back', () => {
    let db = seed();
    db = appendStoryMessage({ ...db, state: { ...db.state, sceneCast: ['Itachi Uchiha'] } }, 'user', '"We go north."', null, 0, 0);
    db = appendStoryMessage(db, 'assistant', 'Itachi nods once.', null, 0, 0);
    const itachi = person(db, 'Itachi Uchiha');
    const messages = db.rawLog.slice(-2).map((entry) => ({ ...entry, sceneCastIds: [itachi.id] }));
    const candidates = povCandidates(db, messages);
    expect(candidates.map((entity) => entity.name)).toContain('Itachi Uchiha');
    expect(povInstruction(candidates)).toContain('POV:');
    expect(buildSceneSummaryPrompt(db, messages).messages[1].content).toContain('POINTS OF VIEW: Itachi Uchiha');

    const parsed = parseTitledSummary(
      'TITLE: North\nMEMORY: You leave with Itachi.\nSUMMARY: You leave the Leaf behind with Itachi and walk north through the night.\nPOV:\n- Itachi Uchiha: You did not ask why. I will remember that you did not ask.\n- Kisame: Sharp kid.'
    )!;
    expect(parsed.summary).not.toContain('POV');
    const povs = resolvePovs(candidates, parsePovLines(parsed.pov));
    expect(povs).toEqual([{ entityId: itachi.id, text: 'You did not ask why. I will remember that you did not ask.' }]);
  });

  test("their latest line sits on their character card for the narrator", () => {
    let db = seed();
    const itachi = person(db, 'Itachi Uchiha');
    db = {
      ...db,
      events: [
        ...db.events,
        {
          id: 'event_pov',
          chapter: 1,
          scene: 'North',
          inStoryDate: db.state.inStoryDate,
          summary: 'You leave with Itachi.',
          importance: 4,
          tags: ['summary'],
          pinned: false,
          sourceLogId: null,
          povs: [{ entityId: itachi.id, text: 'You did not ask why.' }],
          createdAt: 1,
        },
      ],
      state: { ...db.state, sceneCast: ['Itachi Uchiha'] },
    };
    expect(latestPov(db, itachi.id)).toBe('You did not ask why.');
    expect(narratorText(db, '"Itachi."')).toContain('remembers of you: "You did not ask why."');
  });
});

describe('prompt size', () => {
  test('nothing new reaches the narrator on a quiet turn', () => {
    const db = seed();
    const text = buildNarrationPrompt(db, '*You wait.*').messages[1].content;
    for (const block of ['SOMETHING COMES BACK', 'TALK OF YOU', 'WANTED POSTERS', 'Since you last saw them']) {
      expect(text).not.toContain(block);
    }
  });
});
