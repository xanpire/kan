import { describe, expect, test } from 'bun:test';

import { placeIdOf } from '../lib/rpg/mapData';
import { regionOf } from '../lib/rpg/geography';
import { territoryOf } from '../lib/rpg/reputation';

describe('ordinary words never put Kan in the wrong village (audit 6b.1)', () => {
  const cases: Array<[string, string | null, string | null, string | null]> = [
    // text, map place, territory, region
    ['A roadside shrine in the rain', null, null, null],
    ['The stone bridge over the gorge, Land of Fire', null, 'leaf', 'fire'],
    ['A valley thick with the mist', null, null, null],
    ['Camp under the leaf canopy', null, null, null],
    ['The sand flats south of the river', null, null, null],
    ["An old samurai's house near Tanzaku Town", 'tanzaku', 'leaf', 'fire'],
  ];

  for (const [text, place, territory, region] of cases) {
    test(text, () => {
      expect(placeIdOf(text)).toBe(place);
      expect(territoryOf(text)).toBe(territory);
      expect(regionOf(text)).toBe(region);
    });
  }

  test('real names still resolve', () => {
    expect(placeIdOf('The rain tower in the Hidden Rain Village')).toBe('rain');
    expect(placeIdOf('Back in the Rain, at the tower')).toBe('rain');
    expect(placeIdOf('Amegakure')).toBe('rain');
    expect(placeIdOf('the gates of the Leaf')).toBe('leaf');
    expect(territoryOf('the gates of the Leaf')).toBe('leaf');
    expect(territoryOf('Kirigakure harbour')).toBe('mist');
    expect(territoryOf('A Land of Rain alley')).toBeNull();
    expect(regionOf('The Land of Iron, under snow')).toBe('iron');
    expect(placeIdOf('the Land of Iron')).toBe('iron');
    expect(territoryOf('the Forest of Death')).toBe('leaf');
  });
});

import { mock } from 'bun:test';

mock.module('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined, getAllKeys: async () => [], multiGet: async () => [], multiSet: async () => undefined, multiRemove: async () => undefined },
}));

import { conditionFromText } from '../lib/rpg/weather';
import { classifyLocation, formatEncounterConditions } from '../lib/rpg/encounters';
import { resolveTurnMode } from '../lib/rpg/sceneMode';
import { normalizeDatabase } from '../lib/rpg/db';
import { seedDatabase } from '../lib/rpg/seed';

describe('smaller world-model fixes (audit 6b.2)', () => {
  test('weather words that are negated do not count', () => {
    expect(conditionFromText('a clear night, no wind')).toBe('clear');
    expect(conditionFromText('not raining anymore, sun out')).toBe('clear');
    expect(conditionFromText('heavy rain')).toBe('rain');
    expect(conditionFromText('without a breath of wind, the snow falls')).toBe('snow');
  });

  test('location words match whole words', () => {
    expect(classifyLocation('the inner chamber of a cave')).toBe('structure');
    expect(classifyLocation('reading the report by the road')).toBe('road');
    expect(classifyLocation('the search party in the forest')).toBe('wilderness');
    expect(classifyLocation('a quiet inn')).toBe('settlement');
  });

  test('a hideout with people in it is not "nobody would be here"', () => {
    const db = normalizeDatabase(seedDatabase('slot_places', 'Places'));
    const hideout = { ...db, state: { ...db.state, location: 'The Akatsuki hideout', locationKind: 'structure' as const, sceneCast: ['Itachi Uchiha'] } };
    expect(formatEncounterConditions(hideout)).toContain('only those already here');
    const empty = { ...hideout, state: { ...hideout.state, sceneCast: [] } };
    expect(formatEncounterConditions(empty)).toContain('almost nobody');
  });

  test('a figure of speech alone is not a fight', () => {
    const db = normalizeDatabase(seedDatabase('slot_places', 'Places'));
    const alone = { ...db, state: { ...db.state, sceneCast: [] } };
    expect(resolveTurnMode(alone, '*I kick a pebble into the river.*').mode).not.toBe('fight');
    expect(resolveTurnMode(alone, '*I strike a match.*').mode).not.toBe('fight');
    const withItachi = { ...db, state: { ...db.state, sceneCast: ['Itachi Uchiha'] } };
    expect(resolveTurnMode(withItachi, '*I strike at his throat.*').mode).toBe('fight');
    expect(resolveTurnMode(withItachi, '*I strike a match.*').mode).not.toBe('fight');
  });
});

import { povInstruction } from '../lib/rpg/povMemories';
import { displayName } from '../lib/rpg/names';

describe('app-written lines use the names Kan knows (audit 6b.2)', () => {
  test('the summariser is given the name Kan knows, not the record', () => {
    const db = normalizeDatabase(seedDatabase('slot_names', 'Names'));
    const kisame = db.entities.find((entity) => entity.name === 'Kisame Hoshigaki')!;
    const known = displayName(db, kisame);
    const line = povInstruction([kisame], (entity) => displayName(db, entity));
    expect(line).toContain(known);
    if (known !== kisame.name) {
      expect(line).not.toContain('Kisame');
    }
  });
});

import { scrubNameLeaks } from '../lib/rpg/names';

describe('name leaks are fixed, not just logged (audit 6b.2)', () => {
  test('a name Kan does not know becomes his label outside quotes', () => {
    const db = normalizeDatabase(seedDatabase('slot_leaks', 'Leaks'));
    const kisame = db.entities.find((entity) => entity.name === 'Kisame Hoshigaki')!;
    const label = displayName(db, kisame);
    if (label === kisame.name) return; // Kan already knows him in this seed.

    const { text, replaced } = scrubNameLeaks(db, 'Kisame grins at you. "Kisame," the other man says, and Kisame laughs.');
    expect(replaced).toContain('Kisame');
    expect(text.startsWith(label.charAt(0).toUpperCase() + label.slice(1))).toBe(true);
    expect(text).toContain('"Kisame,"');
    expect(text).toContain(`and ${label} laughs`);
  });
});
