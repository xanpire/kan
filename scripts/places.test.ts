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
