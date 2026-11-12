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
import { seedDatabase } from '../lib/rpg/seed';
import { shiftDate } from '../lib/rpg/calendar';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import { resolveCharacterRefs } from '../lib/rpg/entities';
import { applyTurnDiff } from '../lib/rpg/services';
import { buildExtractionPrompt, buildNarrationPrompt, NARRATION_SYSTEM, trackerPromptText } from '../lib/rpg/prompt';
import { TURN_STATE_SCHEMA } from '../lib/rpg/stateSchema';
import {
  COOL_AFTER_DAYS,
  LIST_HEAT,
  bingoListings,
  bountyFor,
  currentHeat,
  formatReputationBlock,
  hunterOffer,
  rankFor,
  territoryOf,
} from '../lib/rpg/reputation';
import {
  GRUDGE_AFFINITY,
  STRIKE_GAP_DAYS,
  STRIKE_PRESS_DAYS,
  grudgeHeat,
  grudgeOffer,
  grudgeStage,
} from '../lib/rpg/grudges';
import type { AppDatabase, RawLogEntry } from '../lib/rpg/types';

function fresh(): AppDatabase {
  return normalizeDatabase(seedDatabase('slot_enemies', 'Enemies'));
}

function later(db: AppDatabase, days: number, patch: Partial<AppDatabase['state']> = {}): AppDatabase {
  return {
    ...db,
    state: { ...db.state, inStoryDate: shiftDate(db.state.inStoryDate, days), scenePace: 'downtime', ...patch },
  };
}

/** One state reply applied the way the state step does. */
function turn(db: AppDatabase, block: Record<string, unknown>): AppDatabase {
  const { diff } = convertStateBlock(block);
  return applyTurnDiff(db, diff ? resolveCharacterRefs(db, diff) : null);
}

function withTurns(db: AppDatabase, count: number): AppDatabase {
  const entry = db.rawLog.find((item) => item.kind === 'story') as RawLogEntry;
  const users: RawLogEntry[] = Array.from({ length: count }, (_, index) => ({
    ...entry,
    id: `log_user_${index}`,
    kind: 'story',
    role: 'user',
    content: '*waits*',
  }));

  return { ...db, rawLog: [...db.rawLog.filter((item) => !(item.kind === 'story' && item.role === 'user')), ...users] };
}

function addRonin(db: AppDatabase): AppDatabase {
  return turn(db, {
    new_characters: [
      { is_new: true, name: 'Goro Tsuda', age: 30, role: 'Ronin swordsman', personality: 'proud', speech_style: 'clipped', appearance: 'scarred' },
    ],
    bonds: [{ character_id: 'Goro Tsuda', affinity_change: -2, status: 'Wary', note: 'You beat him in front of his men', relationship: null, attraction: null, romance_note: null }],
    // He is there: only the scene cast makes someone met and gives them a bond.
    characters_present: ['Goro Tsuda'],
  });
}

const goro = (db: AppDatabase) => db.entities.find((entity) => entity.name === 'Goro Tsuda')!;
const goroBond = (db: AppDatabase) => db.bonds.find((bond) => bond.entityId === goro(db).id)!;

describe('reputation: bingo books and Akatsuki standing', () => {
  test('the Leaf writes you into its book the morning after the massacre night, unseen by you', () => {
    let db = fresh();
    db = turn(db, { mood: 'cold' });
    expect(bingoListings(db)).toHaveLength(0);

    db = turn(later(db, 1), { mood: 'cold' });
    const [leaf] = bingoListings(db);
    expect(leaf).toMatchObject({ village: 'leaf', rank: 'B', known: false });
    expect(leaf.bounty).toBe(bountyFor(leaf.heat));
  });

  test('deeds raise a village’s heat into a rank and a bounty; seeing it makes it known', () => {
    let db = turn(later(fresh(), 3), {
      reputation: [{ faction: 'sand', change: 20, reason: 'Killed two Sand chunin at the border' }],
      bounty_seen: ['sand'],
    });
    const sand = bingoListings(db).find((item) => item.village === 'sand')!;
    expect(sand).toMatchObject({ rank: 'C', known: true, lastReason: 'Killed two Sand chunin at the border' });

    db = turn(db, { reputation: [{ faction: 'sand', change: 99, reason: 'Massacre at the oasis' }] });
    // A single turn moves heat at most 25.
    expect(bingoListings(db).find((item) => item.village === 'sand')!.heat).toBe(45);
    expect(rankFor(45)).toBe('B');
  });

  test('heat cools slowly without new deeds, but a listing is never torn out', () => {
    let db = turn(later(fresh(), 3), { reputation: [{ faction: 'mist', change: 25, reason: 'x' }] });
    db = turn(db, { reputation: [{ faction: 'mist', change: 25, reason: 'x' }] });
    const entry = db.state.reputation!.villages.mist!;
    expect(currentHeat(entry, shiftDate(db.state.inStoryDate, COOL_AFTER_DAYS))).toBe(50);
    expect(currentHeat(entry, shiftDate(db.state.inStoryDate, COOL_AFTER_DAYS + 200))).toBe(40);
    expect(currentHeat(entry, shiftDate(db.state.inStoryDate, 20000))).toBe(LIST_HEAT);
  });

  test('strangers react by the land you stand in; nobody is around in empty wilderness at night', () => {
    let db = turn(later(fresh(), 3), { reputation: [{ faction: 'sand', change: 25, reason: 'x' }] });
    expect(territoryOf('A market street in Suna')).toBe('sand');
    expect(territoryOf('Tea house in the Land of Waves')).toBeNull();

    const town = { ...db, state: { ...db.state, location: 'Market street, Hidden Sand', locationKind: 'settlement' as const, inStoryDate: { ...db.state.inStoryDate, hour: 12 } } };
    const block = formatReputationBlock(town);
    expect(block).toContain('YOUR NAME OUT THERE');
    expect(block).toContain("Hidden Sand's bingo book lists you C-rank");
    expect(block).toContain('Also wanted by: Hidden Leaf (B-rank)');
    expect(block).toContain('Kan has not seen what');

    const wilds = { ...db, state: { ...db.state, location: 'Deep forest', locationKind: 'wilderness' as const, inStoryDate: { ...db.state.inStoryDate, hour: 23 } } };
    expect(formatReputationBlock(wilds)).toBe('');

    const prompt = buildNarrationPrompt(town, '*Kan buys water.*').messages.map((m) => m.content).join('\n');
    expect(prompt).toContain('YOUR NAME OUT THERE');
    expect(NARRATION_SYSTEM).toContain('ENEMIES');
  });

  test('Akatsuki standing only matters once you are a member', () => {
    let db = turn(later(fresh(), 3), { reputation: [{ faction: 'akatsuki', change: 20, reason: 'Clean mission' }] });
    db = { ...db, state: { ...db.state, location: 'Rain village street', locationKind: 'settlement', inStoryDate: { ...db.state.inStoryDate, hour: 12 } } };
    expect(formatReputationBlock(db)).not.toContain('Within the Akatsuki');

    db = { ...db, state: { ...db.state, canonProgress: { ...db.state.canonProgress!, completed: ['kan-joins-akatsuki'] } } };
    expect(formatReputationBlock(db)).toContain('Within the Akatsuki (trusted)');
  });

  test('bounty hunters turn up now and then on roads and in towns, never for the unwanted', () => {
    let db = turn(later(fresh(), 3), { reputation: [{ faction: 'cloud', change: 25, reason: 'x' }] });
    db = turn(db, { reputation: [{ faction: 'cloud', change: 25, reason: 'x' }] });
    db = turn(db, { reputation: [{ faction: 'cloud', change: 25, reason: 'x' }] });
    db = { ...db, state: { ...db.state, location: 'Road through the Land of Lightning', locationKind: 'road', inStoryDate: { ...db.state.inStoryDate, hour: 10 } } };

    const offers = Array.from({ length: 60 }, (_, index) => hunterOffer(withTurns(db, index + 1)));
    const hits = offers.filter(Boolean);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(6);
    expect(hits[0]!.listing.village).toBe('cloud');
    // Deterministic: the same turn gets the same offer.
    const first = offers.findIndex(Boolean);
    expect(hunterOffer(withTurns(db, first + 1))).toEqual(offers[first]);

    // Fights and empty places get none.
    expect(hunterOffer({ ...withTurns(db, first + 1), state: { ...db.state, scenePace: 'combat' } })).toBeNull();
    expect(hunterOffer({ ...withTurns(db, first + 1), state: { ...db.state, locationKind: 'wilderness' } })).toBeNull();
  });
});

describe('grudges: the dark mirror of romance', () => {
  test('a bond soured far enough becomes a grudge with a thread', () => {
    let db = addRonin(later(fresh(), 3));
    expect(goroBond(db).grudge).toBeUndefined();

    // One turn moves feelings at most 3 (bondGuard.ts): the humiliation takes two.
    db = turn(db, { bonds: [{ character_id: 'Goro Tsuda', affinity_change: -2, status: 'Wary', note: 'You mocked him at the inn', relationship: null, attraction: null, romance_note: null }] });
    expect(goroBond(db).grudge).toBeUndefined();
    db = turn(db, { bonds: [{ character_id: 'Goro Tsuda', affinity_change: -5, status: 'Humiliated', note: 'You cut his topknot in the square', relationship: null, attraction: null, romance_note: null }] });
    const bond = goroBond(db);
    expect(bond.affinity).toBeLessThanOrEqual(GRUDGE_AFFINITY);
    expect(bond.grudge?.reason).toBe('You cut his topknot in the square');
    expect(grudgeStage(db, bond)).toBe('resentful');
    expect(db.threads.some((thread) => thread.type === 'grudge' && thread.status === 'open')).toBe(true);
  });

  test('left alone it stews; an original can end up hunting you, canon characters cannot', () => {
    let db = addRonin(later(fresh(), 3));
    db = turn(db, { grudges: [{ character_id: 'Goro Tsuda', event: 'wronged', reason: 'You killed his brother' }] });
    expect(grudgeStage(db, goroBond(db))).toBe('vengeful');

    db = turn(db, { grudges: [{ character_id: 'Goro Tsuda', event: 'wronged', reason: 'again' }] });
    expect(grudgeStage(db, goroBond(db))).toBe('hunting');

    let canon = turn(later(fresh(), 3), {
      grudges: [{ character_id: 'kisame-hoshigaki', event: 'wronged', reason: 'You humiliated him before Itachi' }],
      characters_present: ['kisame-hoshigaki'],
    });
    canon = turn(canon, { grudges: [{ character_id: 'kisame-hoshigaki', event: 'wronged', reason: 'again' }] });
    const hana = canon.bonds.find((bond) => bond.characterName === 'Kisame Hoshigaki')!;
    expect(hana.grudge).toBeDefined();
    expect(grudgeStage(later(canon, 400), hana)).toBe('vengeful');

    const stewing = later(db, 300);
    expect(grudgeHeat(goroBond(stewing).grudge!, stewing.state.inStoryDate)).toBeGreaterThan(goroBond(db).grudge!.heat);
  });

  test('a due grudge is offered, pressed when overdue, never mid-fight or when they are already here', () => {
    let db = addRonin(later(fresh(), 3));
    db = turn(db, { grudges: [{ character_id: 'Goro Tsuda', event: 'wronged', reason: 'You killed his brother' }] });
    db = turn(db, { grudges: [{ character_id: 'Goro Tsuda', event: 'wronged', reason: 'again' }] });
    db = withTurns({ ...db, state: { ...db.state, sceneCast: [] } }, 7);

    expect(grudgeOffer(db)).toBeNull();

    const overdue = later(db, STRIKE_GAP_DAYS.hunting + STRIKE_PRESS_DAYS, { sceneCast: [] });
    const offer = grudgeOffer(overdue)!;
    expect(offer.entity.name).toBe('Goro Tsuda');
    expect(offer.pressed).toBe(true);
    expect(offer.stage).toBe('hunting');

    expect(grudgeOffer({ ...overdue, state: { ...overdue.state, scenePace: 'combat' } })).toBeNull();
    expect(grudgeOffer({ ...overdue, state: { ...overdue.state, sceneCast: ['Goro Tsuda'] } })).toBeNull();

    const prompt = buildNarrationPrompt(overdue, '*Kan makes camp.*').messages.map((m) => m.content).join('\n');
    expect(prompt).toContain('SOMEONE WANTS YOU TO PAY');
    expect(prompt).toContain('[grudge: hunting');
    expect(prompt).not.toContain('A FAMILIAR FACE');
    const statePrompt = trackerPromptText(buildExtractionPrompt(overdue, '*Kan makes camp.*', 'Goro steps out of the dark.'));
    expect(statePrompt).toContain('REPUTATION & GRUDGES');
    expect(statePrompt).toContain("This turn's offered grudge is");

    // Once it strikes, the clock restarts.
    const struck = turn(overdue, { grudges: [{ character_id: 'Goro Tsuda', event: 'struck', reason: null }] });
    expect(goroBond(struck).grudge!.strikes).toBe(1);
    expect(grudgeOffer(struck)).toBeNull();
  });

  test('real amends, a settled reckoning, or death end it', () => {
    const base = turn(addRonin(later(fresh(), 3)), {
      grudges: [{ character_id: 'Goro Tsuda', event: 'wronged', reason: 'You killed his brother' }],
    });

    const mended = turn(base, { bonds: [{ character_id: 'Goro Tsuda', affinity_change: 6, status: 'Grudging respect', note: null, relationship: null, attraction: null, romance_note: null }] });
    expect(goroBond(mended).grudge).toBeUndefined();
    expect(mended.facts.some((fact) => fact.text.includes('let go of their grudge'))).toBe(true);

    const settled = turn(base, { grudges: [{ character_id: 'Goro Tsuda', event: 'settled', reason: 'He bested you in a duel and called it even' }] });
    expect(goroBond(settled).grudge).toBeUndefined();
    expect(settled.threads.find((thread) => thread.type === 'grudge')!.status).toBe('resolved');

    const dead = turn(base, { deaths: [{ character_id: 'Goro Tsuda', cause: 'fell from the bridge' }] });
    expect(goroBond(dead).grudge).toBeUndefined();
  });

  test('the schema carries both systems, and saves keep them through a reload', () => {
    expect(TURN_STATE_SCHEMA.required).toEqual(expect.arrayContaining(['reputation', 'bounty_seen', 'grudges']));

    let db = turn(addRonin(later(fresh(), 3)), {
      grudges: [{ character_id: 'Goro Tsuda', event: 'wronged', reason: 'You killed his brother' }],
      reputation: [{ faction: 'stone', change: 30, reason: 'x' }],
    });
    db = normalizeDatabase(JSON.parse(JSON.stringify(db)));
    expect(goroBond(db).grudge?.reason).toBe('You killed his brother');
    expect(bingoListings(db).map((item) => item.village)).toEqual(expect.arrayContaining(['leaf', 'stone']));
  });
});
