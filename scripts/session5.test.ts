// Session 5 (22 Nov 2026, v1.25.32), every screen checked by Claude on the live build.
import { describe, expect, test } from 'bun:test';
import { guardBondDiff, heldFeelingsCeiling, ITACHI_AFTER_THE_NIGHT } from '../lib/rpg/bondGuard';
import { normalizeDatabase } from '../lib/rpg/db';
import { markDeceased } from '../lib/rpg/deaths';
import { seedDatabase } from '../lib/rpg/seed';
import { withoutSkyBurialAsThousandSouls } from '../lib/rpg/services';
import { chapterName, clipLocation, plainMemory } from '../lib/rpg/util';

function seeded() {
  return normalizeDatabase(seedDatabase('slot_s5', 'S5'));
}

describe('a long place is cut at a word, and staying there is not a move', () => {
  test('never mid-word, never on a dangling "the"', () => {
    const long = 'The flooded borderlands west of the Land of Fire, on the muddy gully track toward an abandoned outpost on the ridge';
    const clipped = clipLocation(long);
    expect(clipped.length).toBeLessThanOrEqual(100);
    expect(long.startsWith(clipped)).toBe(true);
    expect(long.charAt(clipped.length)).toBe(' ');
    expect(clipped).not.toMatch(/\s(the|of|an|a)$/i);
    expect(clipLocation('A short place')).toBe('A short place');
    // The same long place twice is the same stored place.
    expect(clipLocation(long)).toBe(clipLocation(`  ${long} `));
  });
});

describe('a chapter without a name is called by its number once', () => {
  test('"Chapter 5" is not a name', () => {
    expect(chapterName('Chapter 5')).toBeNull();
    expect(chapterName(' chapter 12 ')).toBeNull();
    expect(chapterName('Beneath the Hidden Rain')).toBe('Beneath the Hidden Rain');
    expect(chapterName(undefined)).toBeNull();
  });
});

describe('memories read "You remember", not "You will remember"', () => {
  test('plainMemory', () => {
    expect(plainMemory('You will remember the pierced man holding out the ring.')).toBe('You remember the pierced man holding out the ring.');
    expect(plainMemory("You'll always remember her face.")).toBe('You always remember her face.');
    expect(plainMemory('The bridge was empty.')).toBe('The bridge was empty.');
  });
});

describe('Sky Burial alone is never a Thousand Souls use', () => {
  const drain = { name: 'Thousand Souls', user: 'Kan', thisUse: "draining the Earth shinobi's Earth chakra through the genjutsu" };
  test('a Thousand Souls line that describes Sky Burial becomes Sky Burial', () => {
    expect(withoutSkyBurialAsThousandSouls([drain]).map((item) => item.name)).toEqual(['Sky Burial']);
  });
  test('with Sky Burial in the same turn, the Thousand Souls line goes', () => {
    expect(withoutSkyBurialAsThousandSouls([{ name: 'Sky Burial', user: 'Kan' }, drain]).map((item) => item.name)).toEqual(['Sky Burial']);
  });
  test('a fused use counts', () => {
    const fused = [{ name: 'Sky Burial', user: 'Kan', thisUse: 'fused with Thousand Souls' }, drain];
    expect(withoutSkyBurialAsThousandSouls(fused)).toHaveLength(2);
  });
  test('a plain drain by the hand stays', () => {
    const hand = { name: 'Thousand Souls', user: 'Kan', thisUse: "seized his wrist and dragged the Water chakra into you" };
    expect(withoutSkyBurialAsThousandSouls([hand])).toEqual([hand]);
  });
});

describe('Kan does not warm to Itachi after the night', () => {
  test('his side is held at the cold level until the illness or Itachi dies', () => {
    let db = seeded();
    const izumi = db.entities.find((entity) => entity.name === 'Izumi Uchiha')!;
    const itachi = db.entities.find((entity) => entity.name === 'Itachi Uchiha')!;
    expect(heldFeelingsCeiling(db, itachi)).toBeNull();

    db = markDeceased(db, izumi.id, { cause: 'the massacre', known: true } as never);
    expect(heldFeelingsCeiling(db, itachi)).toBe(3);

    const bond = db.bonds.find((item) => item.entityId === itachi.id)!;
    const warm = { ...bond, yourFeelings: { affinity: 3, note: '' } };
    const guarded = guardBondDiff(db, itachi, warm, { character: 'itachi-uchiha', yourDelta: 1 } as never, { bigTurn: false });
    expect(guarded.bond.yourDelta).toBe(0);

    // A save that already climbed comes back down on his next bond line.
    const climbed = { ...bond, yourFeelings: { affinity: 9, note: '' } };
    const down = guardBondDiff(db, itachi, climbed, { character: 'itachi-uchiha', yourDelta: 1 } as never, { bigTurn: false });
    expect(down.bond.yourDelta).toBe(-6);

    // Their side is untouched.
    const theirs = guardBondDiff(db, itachi, warm, { character: 'itachi-uchiha', affinityDelta: 2 } as never, { bigTurn: false });
    expect(theirs.bond.affinityDelta).toBe(2);
  });

  test('the seeded "closest friend" status gives way', () => {
    let db = seeded();
    const izumi = db.entities.find((entity) => entity.name === 'Izumi Uchiha')!;
    const itachi = db.entities.find((entity) => entity.name === 'Itachi Uchiha')!;
    db = markDeceased(db, izumi.id, { cause: 'the massacre', known: true } as never);
    const bond = { ...db.bonds.find((item) => item.entityId === itachi.id)!, status: 'Closest friend, like an older brother' };
    const guarded = guardBondDiff(db, itachi, bond, { character: 'itachi-uchiha' } as never, { bigTurn: false });
    expect(guarded.bond.status).toBe(ITACHI_AFTER_THE_NIGHT);
  });
});

describe('a world event Kan watched is not news to be told', () => {
  test("Izumi's funeral, seen from the ridgeline, is witnessed", async () => {
    const { advanceCanon, markWitnessedNews, hasHeardNews } = await import('../lib/rpg/canon');
    const db = seeded();
    const at = { year: 13, month: 10, day: 6, hour: 9, minute: 0, second: 0 };
    const there = {
      ...db,
      state: { ...db.state, inStoryDate: at, travelLog: [{ place: 'Ridgeline above the Uchiha clan cemetery', region: 'fire', date: at }] },
    };
    const fired = advanceCanon(there);
    expect(fired.events.some((event) => event.id === 'event_canon_izumi-funeral')).toBe(true);
    expect(hasHeardNews(fired, 'event_canon_izumi-funeral')).toBe(false);
    expect(hasHeardNews(markWitnessedNews(fired), 'event_canon_izumi-funeral')).toBe(true);

    // Somewhere else that day, it stays news.
    const away = { ...there, state: { ...there.state, travelLog: [{ place: 'A hollow under the roots of a fallen cedar', region: 'fire', date: at }] } };
    expect(hasHeardNews(markWitnessedNews(advanceCanon(away)), 'event_canon_izumi-funeral')).toBe(false);
  });
});

describe('Kan knows Hana\'s brother', () => {
  test('Kiba is known from the start, and an old save learns it on load', async () => {
    const { ensureNames, displayName } = await import('../lib/rpg/names');
    const db = seeded();
    const kiba = db.entities.find((entity) => entity.name === 'Kiba Inuzuka')!;
    expect(displayName(db, kiba)).toBe('Kiba Inuzuka');
    const old = { ...db, entities: db.entities.map((entity) => (entity.id === kiba.id ? { ...entity, known: {} } : entity)) };
    const loaded = ensureNames(old);
    expect(displayName(loaded, loaded.entities.find((entity) => entity.id === kiba.id)!)).toBe('Kiba Inuzuka');
  });
});

describe('a skip lands on the time of day its scene opens on', () => {
  test('"By dusk on the thirty-first" beats "the tracker you cornered at midday"', async () => {
    const { detectNarrationTime } = await import('../lib/rpg/timeparse');
    const text =
      'Two months pass in a brutal rhythm. By dusk on the thirty-first of December, the passes are buried under snow. Beside his boots lies the carcass of a rogue tracker you cornered at midday. "Do we push on before midnight?"';
    const read = detectNarrationTime(text, { year: 13, month: 11, day: 1, hour: 7, minute: 5, second: 0 }, { action: '*Time passes: 3 years.*' });
    expect(read.landing?.hour).toBeGreaterThanOrEqual(16);
  });
});
