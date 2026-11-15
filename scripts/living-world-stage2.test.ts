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

import { advanceCanon, upcomingCanonMilestones } from '../lib/rpg/canon';
import { CANON_CAST, FEMALE_CAST, ensureCanonCast } from '../lib/rpg/canonCast';
import { CAST_ADDITIONS } from '../lib/rpg/canonCastMore';
import { CANON_MILESTONES, CANON_VERSION } from '../lib/rpg/canonData';
import { normalizeDatabase } from '../lib/rpg/db';
import { resolveCharacterRefs, resolveEntity } from '../lib/rpg/entities';
import { appendStoryMessage } from '../lib/rpg/log';
import { applyStateStep } from '../lib/rpg/memoryJobs';
import { buildExtractionPrompt, buildNarrationPrompt } from '../lib/rpg/prompt';
import { seedDatabase } from '../lib/rpg/seed';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import { TURN_STATE_SCHEMA } from '../lib/rpg/stateSchema';
import type { AppDatabase, CalendarDate } from '../lib/rpg/types';
import {
  birthdayThisYear,
  knowsBirthday,
  todayNotes,
  upcomingBirthdays,
  yearlyCandidates,
  yearlyOffer,
} from '../lib/rpg/yearly';

const seed = () => normalizeDatabase(seedDatabase('slot_stage2', 'Stage 2'));
const baseline: CalendarDate = { year: 13, month: 10, day: 1, hour: 22, minute: 0 };
const person = (db: AppDatabase, name: string) => db.entities.find((entity) => entity.name === name);
const byId = (id: string) => CANON_MILESTONES.find((milestone) => milestone.id === id)!;
const key = (w: { year: number; month: number; day?: number }) => (w.year * 12 + w.month) * 32 + (w.day ?? 1);

/** A save with the clock set and the canon run up to that date. */
function at(date: CalendarDate, base: AppDatabase = seed()): AppDatabase {
  const db: AppDatabase = {
    ...base,
    state: {
      ...base.state,
      inStoryDate: date,
      scenePace: 'conversation',
      canonProgress: { version: CANON_VERSION, baselineDate: baseline, completed: [], active: [], engaged: [] },
    },
  };
  return advanceCanon(db, { inCombat: false });
}

/** Same date, with these people in the scene and met. */
function withScene(db: AppDatabase, names: string[], extra: Partial<AppDatabase['state']> = {}): AppDatabase {
  return {
    ...db,
    entities: db.entities.map((entity) => (names.includes(entity.name) ? { ...entity, met: true } : entity)),
    state: { ...db.state, sceneCast: names, ...extra },
  };
}

function play(db: AppDatabase, input: string, narration: string, block: Record<string, unknown>) {
  let next = appendStoryMessage(db, 'user', input, null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  const diff = resolveCharacterRefs(next, convertStateBlock(block).diff);
  return applyStateStep(next, diff, { turnLogId, userMessage: input, narration }, new Set()).db;
}

describe('the new cast', () => {
  test('67 people, and everyone but the beasts and summons has a birthday', () => {
    expect(CAST_ADDITIONS).toHaveLength(67);
    const without = CANON_CAST.filter((entry) => !entry.birthday).map((entry) => entry.name);
    expect(without.every((name) => CANON_CAST.find((entry) => entry.name === name)!.tags.some((tag) => tag === 'tailed-beast' || tag === 'summon'))).toBe(true);
    expect(person(seed(), 'Akamaru')?.birthday).toEqual({ month: 7, day: 7 });
  });

  test('birthday fixes from the databooks, and invented dates are marked', () => {
    const db = seed();
    expect(person(db, 'Hana Inuzuka')?.birthday).toEqual({ month: 4, day: 13 });
    expect(person(db, 'Suzume')?.birthday).toEqual({ month: 10, day: 19 });
    expect(person(db, 'Danzo Shimura')?.birthday).toEqual({ month: 1, day: 6 });
    expect(person(db, 'Anko Mitarashi')?.birthday).toEqual({ month: 10, day: 24 });
    expect(person(db, 'Kimimaro')?.birthday).toEqual({ month: 6, day: 15 });
    expect(person(db, 'Killer Bee')?.birthday).toEqual({ month: 5, day: 15 });
    for (const name of ['Zetsu', 'Jūzō Biwa', 'Chiriku', 'Izumi Uchiha']) {
      expect(person(db, name)?.birthdayInvented).toBe(true);
    }
    expect(person(db, 'Kakashi Hatake')?.birthdayInvented).toBeUndefined();
  });

  test('an older save is moved off the old dates and gains the birthdays it lacked', () => {
    const base = seed();
    const old = {
      ...base,
      entities: base.entities.map((entity) =>
        entity.name === 'Hana Inuzuka'
          ? { ...entity, birthday: { month: 4, day: 12 } }
          : entity.name === 'Inoichi Yamanaka'
            ? { ...entity, birthday: undefined }
            : entity.name === 'Izumi Uchiha'
              ? { ...entity, birthdayInvented: undefined }
              : entity
      ),
    } as AppDatabase;
    const db = normalizeDatabase(old);
    expect(person(db, 'Hana Inuzuka')?.birthday).toEqual({ month: 4, day: 13 });
    expect(person(db, 'Inoichi Yamanaka')?.birthday).toEqual({ month: 1, day: 24 });
    expect(person(db, 'Izumi Uchiha')?.birthdayInvented).toBe(true);
  });

  test('the unborn, the real Madara and Kaguya are not in a new save', () => {
    const db = seed();
    for (const name of ['Boruto Uzumaki', 'Sarada Uchiha', 'Himawari Uzumaki', 'Shikadai Nara', 'Inojin Yamanaka', 'Chōchō Akimichi', 'Metal Lee', 'Mirai Sarutobi', 'Madara Uchiha', 'Kaguya Ōtsutsuki']) {
      expect(person(db, name)).toBeUndefined();
    }
    // A bare "Madara" is still the masked man.
    expect(resolveEntity(db, 'Madara')?.name).toBe('Tobi');
    expect(resolveEntity(db, 'Boruto')).toBeNull();
  });

  test('children enter the save at their birth, alive and not yet met', () => {
    const before = at({ year: 27, month: 3, day: 26, hour: 12, minute: 0 });
    expect(person(before, 'Boruto Uzumaki')).toBeUndefined();
    expect(person(before, 'Shikadai Nara')?.status).toBe('Not yet met');
    const after = at({ year: 27, month: 3, day: 28, hour: 12, minute: 0 }, before);
    const boruto = person(after, 'Boruto Uzumaki')!;
    expect(boruto.status).toBe('Not yet met');
    expect(boruto.met).toBe(false);
    expect(boruto.romanceAccessibility).toBe('not-applicable');
    expect(person(at({ year: 22, month: 5, day: 20, hour: 9, minute: 0 }), 'Mirai Sarutobi')?.birthYear).toBe(22);
    // Reloading keeps them, and a save before the birth stays without them.
    expect(person(normalizeDatabase(after), 'Boruto Uzumaki')).toBeDefined();
    expect(ensureCanonCast(before.entities, () => 'x', []).some((entity) => entity.name === 'Sarada Uchiha')).toBe(false);
  });

  test('the real Madara appears in the war, takes his name, and dies in the canon', () => {
    const war = at({ year: 22, month: 10, day: 9, hour: 9, minute: 0 });
    const madara = person(war, 'Madara Uchiha')!;
    expect(madara).toBeDefined();
    expect(resolveEntity(war, 'Madara')?.name).toBe('Madara Uchiha');
    expect(person(war, 'Kaguya Ōtsutsuki')).toBeUndefined();
    const after = at({ year: 22, month: 11, day: 1, hour: 9, minute: 0 }, war);
    expect(person(after, 'Madara Uchiha')?.deceased).toBeDefined();
    expect(person(after, 'Kaguya Ōtsutsuki')?.status).toBe('Sealed');
    expect(person(after, 'Shukaku')?.status).toBe('Free');
    // She returns awake; only her sealing makes her "Sealed" again.
    const awake = ensureCanonCast(war.entities, () => 'entity_kaguya', ['kaguya-awakens']);
    expect(awake.find((entity) => entity.name === 'Kaguya Ōtsutsuki')?.status).toBe('Not yet met');
  });

  test('everyone named in a canon death exists by the time it fires', () => {
    const end = at({ year: 36, month: 1, day: 1, hour: 9, minute: 0 });
    const names = new Set(
      end.entities
        .flatMap((entity) => [entity.name, ...entity.aliases, ...(entity.identities ?? []).flatMap((identity) => [identity.name, identity.name.split(' ')[0]])])
        .map((name) => name.toLowerCase())
    );
    const missing = CANON_MILESTONES.flatMap((milestone) => milestone.deaths ?? []).filter((name) => !names.has(name.toLowerCase()));
    expect(missing).toEqual([]);
    for (const name of ['Zaku Abumi', 'Kin Tsuchi', 'Manda', 'Torune Aburame', 'Fū Yamanaka', 'Mabui', 'Raiga Kurosuki', 'Dosu Kinuta']) {
      expect(person(end, name)?.deceased).toBeDefined();
    }
  });

  test('beasts are genderless and never romance; Kurama keeps his name hidden', () => {
    const db = seed();
    const fox = person(db, 'Nine-Tails')!;
    expect(fox.gender).toBe('unknown');
    expect(fox.romanceAccessibility).toBe('not-applicable');
    expect(fox.aliases).not.toContain('Kurama');
    expect(fox.identities?.map((identity) => identity.name)).toEqual(['Nine-Tails', 'Kurama']);
    expect(resolveEntity(db, 'Kurama')).toBeNull();
    expect(resolveEntity(db, 'Nine-Tails')?.id).toBe(fox.id);
    for (const name of ['Moegi Kazamatsuri', 'Katsuyu', 'Shima']) {
      expect(FEMALE_CAST.has(name)).toBe(true);
      expect(person(db, name)?.romanceAccessibility).toBe('not-applicable');
    }
    expect(person(db, 'Yūgao Uzuki')?.romanceAccessibility).toBe('lore-locked');
    expect(person(db, 'Mabui')?.romanceAccessibility).toBe('winnable');
  });

  test('the state tracker roster leaves out the unmet dead and sealed until a turn names them', () => {
    const db = seed();
    const prompt = buildExtractionPrompt(db, 'hello', 'Itachi speaks of Mito Uzumaki.');
    const roster = prompt.messages[0].content;
    expect(roster).not.toContain('Fuguki Suikazan');
    expect(roster).toContain('Sasuke Uchiha');
    expect(prompt.messages[1].content).toMatch(/mito-uzumaki: Mito Uzumaki, DECEASED/);
  });
});

describe('the fuller timeline', () => {
  test('new world events and births are in order and on canon dates', () => {
    for (const id of ['kimimaro-illness', 'sai-root-test', 'orochimaru-stopgap', 'jiraiya-reports', 'hashirama-history', 'kakashi-first-crisis', 'shikamaru-silence', 'gaara-marriage-talks', 'sakura-sasuke-leave', 'mirai-born', 'shikadai-born', 'inojin-born', 'chocho-born', 'metal-lee-born']) {
      expect(byId(id).playerDriven).toBeUndefined();
    }
    expect(key(byId('mirai-born').from)).toBeGreaterThan(key(byId('hidan-kakuzu').from));
    expect(key(byId('mirai-born').from)).toBeLessThan(key(byId('war-begins').from));
    expect(key(byId('orochimaru-stopgap').from)).toBeGreaterThan(key(byId('sasuke-defects').from));
    expect(key(byId('gaara-marriage-talks').to!)).toBeLessThan(key(byId('shikadai-born').from));
    expect(key(byId('sakura-sasuke-leave').to!)).toBeLessThan(key(byId('sarada-born').from));
    expect(byId('himawari-born').from.day).toBe(21);
  });

  test('the Karin arc runs before the exams and her reunion carries the history', () => {
    expect(byId('karin-meets').playerDriven).toBe(true);
    expect(byId('karin-lessons').after).toBe('karin-meets');
    expect(byId('karin-parting').after).toBe('karin-meets');
    expect(key(byId('karin-parting').to!)).toBeLessThanOrEqual(key(byId('sasuke-cursed-seal').from));
    expect(byId('karin-senses-uzumaki').encounter?.context).toContain('Land of Grass');
    expect(byId('karin-senses-uzumaki').encounter?.context).toContain('Never romance');
  });

  test('the eyes worsen in stages, and the Shisui eye thread fits canon', () => {
    expect(byId('kan-sight-strain').after).toBe('kan-sight-fades');
    expect(byId('kan-eyes-choice').after).toBe('kan-sight-strain');
    expect(key(byId('shisui-eye-danzo').to!)).toBeLessThan(key(byId('sasuke-rampage').from));
    expect(byId('shisui-eye-iron').from).toEqual(byId('sasuke-rampage').from);
    expect(byId('naka-tablet-mangekyo').requires?.flag).toBe('hasMangekyo');
  });

  test('Karin is offered in the Grass years, and peacetime romance only in a romance', () => {
    const db = at({ year: 15, month: 8, day: 1, hour: 9, minute: 0 });
    const offered = upcomingCanonMilestones(db, 99).map((milestone) => milestone.id);
    expect(offered).toContain('karin-meets');
    expect(offered).not.toContain('karin-lessons');
    const peace = at({ year: 24, month: 1, day: 1, hour: 9, minute: 0 });
    expect(upcomingCanonMilestones(peace, 99).map((milestone) => milestone.id)).not.toContain('kan-peace-romance');
    const hana = person(peace, 'Hana Inuzuka')!;
    const inLove = {
      ...peace,
      bonds: peace.bonds.map((bond) => (bond.entityId === hana.id ? { ...bond, relationship: 'lover' as const } : bond)),
    };
    expect(upcomingCanonMilestones(inLove, 99).map((milestone) => milestone.id)).toContain('kan-peace-romance');
  });
});

describe('birthdays, anniversaries and festivals', () => {
  test('a present friend’s birthday is offered once, with the bond rule for the tracker', () => {
    const db = withScene(at({ year: 15, month: 4, day: 13, hour: 18, minute: 0 }), ['Hana Inuzuka'], {
      location: 'a forest clearing in the Land of Fire',
    });
    const offer = yearlyOffer(db)!;
    expect(offer.kind).toBe('birthday');
    expect(offer.line).toContain("Hana Inuzuka's birthday today (15 today)");
    const narrator = buildNarrationPrompt(db, '"Hana."').messages[1].content;
    expect(narrator).toContain('THE DAY');
    const tracker = buildExtractionPrompt(db, '"Happy birthday."', 'Hana grins.').messages[1].content;
    expect(tracker).toMatch(/hana-inuzuka's birthday.*affinity_change \+1/);

    const next = play(db, '"Happy birthday, Hana."', 'Hana grins and punches your arm.', {
      characters_present: ['hana-inuzuka'],
      scene_pace: 'conversation',
    });
    expect(yearlyOffer(next)?.key).not.toBe(offer.key);
    expect(next.state.yearly?.offered[offer.key]).toBe(15);
  });

  test('a stranger who announces it can let it slip, and Kan learns it', () => {
    const db = withScene(at({ year: 18, month: 10, day: 10, hour: 18, minute: 0 }), ['Naruto Uzumaki'], {
      location: 'the Hidden Leaf Village',
    });
    // Kan's own hard day comes first.
    expect(yearlyOffer(db)?.key).toBe('anniversary:nine-tails');
    const candidates = yearlyCandidates(db).map((offer) => offer.kind);
    expect(candidates).toContain('birthday-unknown');
    const naruto = person(db, 'Naruto Uzumaki')!;
    expect(knowsBirthday(db, naruto)).toBe(false);
    const next = play(db, '"What are you smiling about?"', '"It\'s my birthday today, after all!"', {
      characters_present: [naruto.name.toLowerCase().replace(' ', '-')],
      birthdays_learned: ['naruto-uzumaki'],
      scene_pace: 'conversation',
    });
    expect(knowsBirthday(next, person(next, 'Naruto Uzumaki')!)).toBe(true);
  });

  test('the massacre anniversary, remembrance days and nothing in a fight', () => {
    const oct = at({ year: 16, month: 10, day: 1, hour: 9, minute: 0 });
    expect(yearlyOffer(oct)?.line).toMatch(/3 years since the night the clan died/);
    expect(yearlyOffer({ ...oct, state: { ...oct.state, scenePace: 'combat' } })).toBeNull();
    const izumi = person(oct, 'Izumi Uchiha')!;
    const knows = {
      ...at({ year: 16, month: 8, day: 14, hour: 9, minute: 0 }),
    };
    const known = {
      ...knows,
      entities: knows.entities.map((entity) => (entity.id === izumi.id ? { ...entity, deceased: { ...entity.deceased, known: true } } : entity)),
    };
    expect(yearlyOffer(known)?.kind).toBe('remembrance');
    expect(todayNotes(known)).toContain("Izumi Uchiha's birthday (remembered)");
  });

  test('festivals only near their village, and the Mist keeps them quiet in the bloody years', () => {
    const leaf = at({ year: 19, month: 12, day: 22, hour: 19, minute: 0 });
    const inLeaf = { ...leaf, state: { ...leaf.state, location: 'the Hidden Leaf Village' } };
    expect(yearlyOffer(inLeaf)?.key).toBe('festival:rinne-festival');
    expect(yearlyOffer({ ...leaf, state: { ...leaf.state, location: 'the Hidden Rain Village' } })).toBeNull();
    const mist = at({ year: 16, month: 7, day: 7, hour: 19, minute: 0 });
    const inMist = { ...mist, state: { ...mist.state, location: 'the Hidden Mist Village' } };
    expect(yearlyOffer(inMist)?.line).toContain('kept quietly');
  });

  test('upcoming birthdays for the bonds screen, and the leap-day birthday', () => {
    const db = at({ year: 14, month: 4, day: 1, hour: 9, minute: 0 });
    const upcoming = upcomingBirthdays(db, 30);
    expect(upcoming[0]).toMatchObject({ inDays: 12, turning: 14 });
    expect(upcoming[0].entity.name).toBe('Hana Inuzuka');
    expect(birthdayThisYear({ month: 2, day: 29 }, 15)).toEqual({ month: 2, day: 28 });
    expect(birthdayThisYear({ month: 2, day: 29 }, 16)).toEqual({ month: 2, day: 29 });
  });

  test('the schema carries birthdays_learned', () => {
    expect(Object.keys((TURN_STATE_SCHEMA as unknown as { properties: Record<string, unknown> }).properties)).toContain('birthdays_learned');
  });
});
