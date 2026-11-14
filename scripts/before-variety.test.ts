/**
 * Xan's notes before the variety test (14 Nov 2026): nothing on Kan's pages
 * that he can't know yet or that doesn't exist yet, Team 3 as former
 * teammates, plain text as action, and a map whose pinch and drag agree.
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

import { normalizeDatabase } from '../lib/rpg/db';
import { ITACHI_SEED_ROLE, shownField } from '../lib/rpg/disclosure';
import { hiddenThread } from '../lib/rpg/journal';
import { BRIDGES } from '../lib/rpg/mapShapes';
import { MAP_PLACES, NARUTO_BRIDGE_BUILT_BY, isBuilt, mapPlace, placeKnown, placeNote } from '../lib/rpg/mapData';
import { WHOLE_MAP, boardPoint, boardTouchAction, panBy, pinchStep, zoomTo } from '../lib/rpg/mapView';
import { playerSegments } from '../lib/rpg/narrationText';
import { normalizeRelationship } from '../lib/rpg/romance';
import { seedDatabase } from '../lib/rpg/seed';
import { RELATIONSHIPS } from '../lib/rpg/stateSchema';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_before_variety', 'Before variety'));

const happened = (db: AppDatabase, id: string): AppDatabase => ({
  ...db,
  state: {
    ...db.state,
    canonProgress: { ...db.state.canonProgress!, completed: [...(db.state.canonProgress?.completed ?? []), id] },
  },
  events: [...db.events, { ...db.events[0], id: `event_canon_${id}`, tags: [`canon-${id}`] }],
});

const reply = (db: AppDatabase, content: string): AppDatabase => ({
  ...db,
  rawLog: [...db.rawLog, { ...({} as AppDatabase['rawLog'][number]), id: 'log_test', kind: 'story', role: 'assistant', content }],
});

describe("Itachi's offer is not on your pages before he makes it", () => {
  const offer = (db: AppDatabase) => db.threads.find((thread) => /^itachi.s offer/i.test(thread.title))!;

  test('hidden on the first night, though the save holds it for the narrator', () => {
    const db = seed();
    expect(offer(db)).toBeTruthy();
    expect(hiddenThread(db, offer(db))).toBe(true);
    // The other opening threads are Kan's own and stay.
    expect(db.threads.filter((thread) => !hiddenThread(db, thread)).map((thread) => thread.title)).toEqual([
      'What really happened to Shisui?',
      'Make Itachi explain',
    ]);
  });

  test('shown once the story names the Akatsuki, or you agree to go', () => {
    const db = seed();
    expect(hiddenThread(reply(db, 'The rain keeps falling. Itachi says nothing.'), offer(db))).toBe(true);
    expect(hiddenThread(reply(db, '"There is an organisation. The Akatsuki. Come with me."'), offer(db))).toBe(false);

    const engaged = {
      ...db,
      state: { ...db.state, canonProgress: { ...db.state.canonProgress!, engaged: ['kan-joins-akatsuki'] } },
    };
    expect(hiddenThread(engaged, offer(db))).toBe(false);
  });

  test("Itachi's page does not say Akatsuki until then", () => {
    const db = seed();
    const itachi = db.entities.find((entity) => entity.name === 'Itachi Uchiha')!;
    expect(itachi.role).toBe(ITACHI_SEED_ROLE);
    expect(shownField(db, itachi, 'role')).toBe('Hidden Leaf ANBU captain');

    const engaged = {
      ...db,
      state: { ...db.state, canonProgress: { ...db.state.canonProgress!, engaged: ['kan-joins-akatsuki'] } },
    };
    expect(shownField(engaged, itachi, 'role')).toBe(ITACHI_SEED_ROLE);
    // A role the story itself wrote is what Kan saw.
    expect(shownField(db, { ...itachi, role: 'Akatsuki member' }, 'role')).toBe('Akatsuki member');
  });
});

describe('the map shows nothing ahead of its time', () => {
  const bridge = mapPlace('naruto-bridge')!;

  test('the Great Naruto Bridge appears only after the Land of Waves', () => {
    const db = seed();
    expect(placeKnown(db, bridge)).toBe(false);
    // Even if a reply names it early, it is not there to be on the map.
    expect(placeKnown(reply(db, 'You cross the Great Naruto Bridge.'), bridge)).toBe(false);
    expect(isBuilt(db, NARUTO_BRIDGE_BUILT_BY)).toBe(false);

    const later = happened(db, NARUTO_BRIDGE_BUILT_BY);
    expect(placeKnown(later, bridge)).toBe(true);
    expect(isBuilt(later, NARUTO_BRIDGE_BUILT_BY)).toBe(true);
    expect(BRIDGES.filter((item) => item.builtBy === NARUTO_BRIDGE_BUILT_BY)).toHaveLength(1);
  });

  test('the narrator is told the bridge is not there yet', () => {
    const geography = seed().loreEntries.find((lore) => lore.text.startsWith('GEOGRAPHY (fixed'))!;
    expect(geography.text).toMatch(/reached only by boat until its bridge/);
    expect(geography.text).not.toMatch(/joined to Fire by the Great Naruto Bridge/);
  });

  test('place notes give nothing away on the first night', () => {
    const db = seed();
    const shown = MAP_PLACES.map((place) => placeNote(db, place) ?? '').join(' ');
    expect(shown).not.toMatch(/Akatsuki|Karin|massacre|the Sound\b/);

    expect(placeNote(happened(db, 'kan-joins-akatsuki'), mapPlace('rain')!)).toMatch(/Akatsuki/);
    expect(placeNote(happened(db, 'karin-meets'), mapPlace('grass')!)).toMatch(/Karin/);
  });
});

describe('Team 3 are former teammates', () => {
  test('a new story', () => {
    const db = seed();
    for (const name of ['Hana Inuzuka', 'Izumi Uchiha']) {
      expect(db.bonds.find((bond) => bond.characterName === name)!.relationship).toBe('former teammate');
    }
    expect(RELATIONSHIPS as readonly string[]).toContain('former teammate');
  });

  test('an older save is moved over, a current teammate is not', () => {
    const db = seed();
    const old = {
      ...db,
      bonds: db.bonds.map((bond) =>
        bond.characterName === 'Hana Inuzuka'
          ? { ...bond, relationship: 'teammate' as const }
          : bond.characterName === 'Izumi Uchiha'
            ? { ...bond, relationship: 'teammate' as const, status: 'Deceased · Former teammate' }
            : bond.characterName === 'Suzume'
              ? { ...bond, relationship: 'teammate' as const, status: 'Teammate' }
              : bond
      ),
    };
    const loaded = normalizeDatabase(old);
    const of = (name: string) => loaded.bonds.find((bond) => bond.characterName === name)!.relationship;
    expect(of('Hana Inuzuka')).toBe('former teammate');
    expect(of('Izumi Uchiha')).toBe('former teammate');
    expect(of('Suzume')).toBe('teammate');
  });

  test('the tracker’s wording', () => {
    expect(normalizeRelationship('Former teammate')).toBe('former teammate');
    expect(normalizeRelationship('ex-teammate from Team 3')).toBe('former teammate');
    expect(normalizeRelationship('teammate')).toBe('teammate');
    expect(normalizeRelationship('ex-girlfriend')).toBe('ex');
  });
});

describe('only quoted text is speech in your turn', () => {
  test('a turn with no speech is left plain', () => {
    expect(playerSegments('You step out of the trees.')).toEqual([{ text: 'You step out of the trees.', action: false }]);
  });

  test('speech plain, the rest in italics', () => {
    expect(playerSegments('I look at him. "Did you do it?" I wait.')).toEqual([
      { text: 'I look at him. ', action: true },
      { text: '"Did you do it?"', action: false },
      { text: ' I wait.', action: true },
    ]);
  });

  test('asterisks from older turns still mark actions and never show', () => {
    expect(playerSegments('*I nod.* "Fine."')).toEqual([
      { text: 'I nod. ', action: true },
      { text: '"Fine."', action: false },
    ]);
    expect(playerSegments('*I nod.*')).toEqual([{ text: 'I nod.', action: true }]);
  });
});

describe('the map: one pinch, one answer', () => {
  const WIDTH = 400;

  test('pinching keeps the point under the fingers', () => {
    const focal = { x: 100, y: 300 };
    const before = boardPoint(WHOLE_MAP, WIDTH, focal.x, focal.y);
    const view = pinchStep(WHOLE_MAP, 2, WIDTH, focal, null);
    const after = boardPoint(view, WIDTH, focal.x, focal.y);

    expect(view.span).toBe(50);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  test('many small steps land where one big one does', () => {
    const focal = { x: 220, y: 140 };
    let view = WHOLE_MAP;
    for (let step = 0; step < 20; step += 1) view = pinchStep(view, 2 ** (1 / 20), WIDTH, focal, focal);

    const once = zoomTo(WHOLE_MAP, 50, WIDTH, focal);
    expect(view.span).toBeCloseTo(once.span, 6);
    expect(view.cx).toBeCloseTo(once.cx, 6);
    expect(view.cy).toBeCloseTo(once.cy, 6);
  });

  test('fingers that move together carry the map with them', () => {
    const start = zoomTo(WHOLE_MAP, 40, WIDTH, { x: 200, y: 200 });
    const moved = pinchStep(start, 1, WIDTH, { x: 230, y: 180 }, { x: 200, y: 200 });

    expect(moved).toEqual(panBy(start, WIDTH, 30, -20));
  });

  test('a bad scale changes nothing', () => {
    expect(pinchStep(WHOLE_MAP, 0, WIDTH, { x: 0, y: 0 }, null)).toBe(WHOLE_MAP);
    expect(pinchStep(WHOLE_MAP, Number.NaN, WIDTH, { x: 0, y: 0 }, null)).toBe(WHOLE_MAP);
  });

  test('the page scrolls past the whole map, a zoomed map keeps the finger', () => {
    expect(boardTouchAction(WHOLE_MAP)).toBe('pan-y');
    expect(boardTouchAction(zoomTo(WHOLE_MAP, 50, WIDTH, { x: 200, y: 200 }))).toBe('none');
  });
});
