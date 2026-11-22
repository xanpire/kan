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

describe('the memory the moment names most closely is the one offered', () => {
  test('"her dream on Hazuki\'s roof" offers Her dream, not The Academy', async () => {
    const { flashbackOffer } = await import('../lib/rpg/flashbacks');
    const db = seeded();
    const at = { year: 13, month: 12, day: 31, hour: 17, minute: 0, second: 0 };
    const turns = Array.from({ length: 30 }, (_, index) => ({
      id: `log_${index}`, kind: 'story', role: index % 2 ? 'assistant' : 'user', content: 'You wait.', text: 'You wait.', turn: index, chapter: 1, inStoryDate: at,
    }));
    const quiet = { ...db, rawLog: [...db.rawLog, ...turns] as never, state: { ...db.state, inStoryDate: at, scenePace: 'downtime' as const } };
    const offer = flashbackOffer(quiet, "I stare into the fire. Izumi on Hazuki's roof, the night she told me her dream of an ordinary life.", 'normal');
    expect(offer?.id).toBe('her-dream');
  });
});

describe('someone Kan beat and left wanting payback becomes a rival', () => {
  test('a spared seed that wants revenge starts a grudge', async () => {
    const { grudgesFromSeeds } = await import('../lib/rpg/services');
    const events = grudgesFromSeeds({
      consequences: [
        { kind: 'spared', who: 'the broad-shouldered Earth shinobi', what: 'You broke his jaw and left him alive.', want: 'To see the ones who took his convoy pay for it.' },
        { kind: 'helped', who: 'a farmer', what: 'You carried his cart.', want: 'To thank you.' },
      ],
    } as never);
    // The hunter Kan crippled in Tanzaku (live, Session 5).
    expect(grudgesFromSeeds({ consequences: [{ kind: 'spared', who: 'the bounty-hunter leader', what: 'You broke his knees.', want: 'to see you dead, or to sell what he knows of where you sleep' }] } as never)).toHaveLength(1);
    expect(events).toEqual([{ entityId: undefined, name: 'the broad-shouldered Earth shinobi', event: 'wronged', reason: 'You broke his jaw and left him alive.' }]);
  });
});

describe('a returned kiss makes it romance', () => {
  test('Hana at 18, former teammate, kisses Kan back: romantic interest', () => {
    let db = seeded();
    const hana = db.entities.find((entity) => entity.name === 'Hana Inuzuka')!;
    db = { ...db, state: { ...db.state, inStoryDate: { year: 18, month: 7, day: 6, hour: 20, minute: 0, second: 0 } } };
    const bond = { ...db.bonds.find((item) => item.entityId === hana.id)!, relationship: 'former teammate' as const, attraction: 'warm' as const };
    const guarded = guardBondDiff(db, hana, bond, {
      character: 'hana-inuzuka', attraction: 'strong', romanceNote: 'She kissed you back, hard, then cursed you for it and stayed close.',
    } as never, { bigTurn: false });
    expect(guarded.bond.relationship).toBe('romantic interest');

    // At thirteen it never does.
    const young = { ...db, state: { ...db.state, inStoryDate: { year: 13, month: 12, day: 1, hour: 20, minute: 0, second: 0 } } };
    const blocked = guardBondDiff(young, hana, bond, {
      character: 'hana-inuzuka', attraction: 'strong', romanceNote: 'She kissed you back.',
    } as never, { bigTurn: false });
    expect(blocked.bond.relationship).not.toBe('romantic interest');
  });
});

describe('a seed finds the person it describes', () => {
  test('"the bounty-hunter leader you crippled" is the notched-blade bounty hunter in the scene', async () => {
    const { presentMatch } = await import('../lib/rpg/services');
    const db = seeded();
    const hunter = { ...db.entities[0], id: 'entity_hunter', name: 'the notched-blade bounty hunter', aliases: [], tags: [], type: 'character' as const, deceased: false, status: 'Active', known: { label: 'the notched-blade bounty hunter' } };
    const withHunter = { ...db, entities: [...db.entities, hunter as never] };
    expect(presentMatch(withHunter, 'the bounty-hunter leader you crippled in Tanzaku', new Set(['entity_hunter']))?.id).toBe('entity_hunter');
    expect(presentMatch(withHunter, 'a farmer by the road', new Set(['entity_hunter']))).toBeNull();
    const leader = { ...hunter, id: 'entity_leader', name: "the bounty hunters' leader", known: { label: "the bounty hunters' leader" } };
    const withLeader = { ...db, entities: [...db.entities, leader as never] };
    expect(presentMatch(withLeader, 'the bounty hunter leader you crippled in the Tanzaku room', new Set(['entity_leader']))?.id).toBe('entity_leader');
  });
});

describe('a stranger with a hyphen in his label is found by the tracker\'s slug', () => {
  test('"the-notched-blade-bounty-hunter"', async () => {
    const { resolveEntity } = await import('../lib/rpg/entities');
    const db = seeded();
    const hunter = { ...db.entities[0], id: 'entity_hunter', name: 'the notched-blade bounty hunter', aliases: [], unnamed: true };
    const withHunter = { ...db, entities: [...db.entities, hunter] };
    expect(resolveEntity(withHunter, 'the-notched-blade-bounty-hunter')?.id).toBe('entity_hunter');
  });
});

describe('the enemy behind a revenge seed is made when the tracker never listed him', () => {
  test('"the bounty hunter whose knees you broke" holds a grudge', async () => {
    const { applyTurnDiff } = await import('../lib/rpg/services');
    const db = seeded();
    const next = applyTurnDiff(db, {
      consequences: [{ kind: 'spared', who: 'the bounty hunter whose knees you broke', what: 'You broke his knees and killed his men.', want: 'to see you dead, or to be paid enough to try again' }],
    } as never);
    const hunter = next.entities.find((entity) => entity.name === 'the bounty hunter whose knees you broke');
    expect(hunter?.met).toBe(true);
    const bond = next.bonds.find((item) => item.entityId === hunter?.id);
    expect(bond?.grudge?.heat).toBeGreaterThanOrEqual(40);
  });
});

describe('a rival strike that reached the page counts as struck', () => {
  test('the hunter selling word of the Vulture', async () => {
    const { applyTurnDiff } = await import('../lib/rpg/services');
    const { withStrikeOnThePage, grudgeOffer } = await import('../lib/rpg/grudges');
    let db = seeded();
    db = applyTurnDiff(db, {
      consequences: [{ kind: 'spared', who: 'the scarred bounty hunter', what: 'You crippled him.', want: 'to see you dead' }],
    } as never);
    const later = { ...db, rawLog: Array.from({ length: 20 }, (_, i) => ({ id: `l${i}`, kind: 'story', role: i % 2 ? 'assistant' : 'user', content: 'x', turn: i, chapter: 1 })) as never, state: { ...db.state, inStoryDate: { ...db.state.inStoryDate, month: db.state.inStoryDate.month + 3 > 12 ? 1 : db.state.inStoryDate.month + 3, year: db.state.inStoryDate.year + (db.state.inStoryDate.month + 3 > 12 ? 1 : 0) }, scenePace: 'downtime' as const } };
    expect(grudgeOffer(later)?.pressed).toBe(true);
    const diff = withStrikeOnThePage(later, {} as never, 'They say a bounty hunter on shattered knees is selling word of the Vulture.');
    expect(diff.grudges?.[0]?.event).toBe('struck');
    expect(withStrikeOnThePage(later, {} as never, 'The wind howls.').grudges).toBeUndefined();
  });
});
