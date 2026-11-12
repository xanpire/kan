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

import {
  INDOOR_BEDS,
  ambienceInputOf,
  ambienceMix,
  currentAmbience,
  describeAmbience,
  isIndoors,
  type AmbienceInput,
} from '../lib/rpg/ambience';
import { normalizeDatabase } from '../lib/rpg/db';
import { seedDatabase } from '../lib/rpg/seed';
import type { AppDatabase } from '../lib/rpg/types';

const base: AmbienceInput = {
  condition: 'clear',
  period: 'morning',
  hour: 10,
  season: 'spring',
  region: 'fire',
  kind: 'wilderness',
  place: 'Forest north of the Leaf',
  placeId: null,
  fight: false,
};
const mix = (change: Partial<AmbienceInput>) => ambienceMix({ ...base, ...change });
const seed = () => normalizeDatabase(seedDatabase('slot_ambience', 'Ambience'));
const at = (db: AppDatabase, change: Partial<AppDatabase['state']>): AppDatabase => ({ ...db, state: { ...db.state, ...change } });

describe('ambience: what you hear where you are', () => {
  test('a forest by day has birds and a little wind; at night, insects', () => {
    const day = mix({});
    expect(day.beds['forest-day']).toBeGreaterThan(0.5);
    expect(day.beds['wind-light']).toBeGreaterThan(0);
    expect(day.beds.insects).toBeUndefined();
    expect(day.beds.owl).toBeUndefined();

    const night = mix({ period: 'night', hour: 23 });
    expect(night.beds['forest-day']).toBeUndefined();
    expect(night.beds.insects).toBeGreaterThan(0.5);
    expect(night.beds.owl).toBeGreaterThan(0);
  });

  test('dawn birds are louder; winter birds are fewer and winter nights have no insects', () => {
    expect(mix({ hour: 6 }).beds['forest-day']!).toBeGreaterThan(mix({ hour: 10 }).beds['forest-day']!);
    expect(mix({ season: 'winter' }).beds['forest-day']!).toBeLessThan(mix({}).beds['forest-day']!);
    expect(mix({ season: 'winter', period: 'night', hour: 2 }).beds.insects).toBeUndefined();
    expect(mix({ season: 'winter', period: 'night', hour: 2 }).beds.owl).toBeGreaterThan(0);
  });

  test('summer afternoons in the Land of Fire bring cicadas', () => {
    expect(mix({ season: 'summer', period: 'afternoon', hour: 14 }).beds.cicadas).toBeGreaterThan(0);
    expect(mix({ season: 'summer', period: 'afternoon', hour: 14, region: 'iron' }).beds.cicadas).toBeUndefined();
  });

  test('rain outside is rain; inside it is rain on the roof, and outside sounds are muffled', () => {
    const out = mix({ condition: 'rain' });
    expect(out.beds['rain-light']).toBeGreaterThan(0);
    expect(out.beds['rain-heavy']).toBeGreaterThan(0);
    expect(out.indoors).toBe(false);

    const inside = mix({ condition: 'rain', kind: 'structure', place: 'A rented room at a roadside inn' });
    expect(inside.indoors).toBe(true);
    expect(inside.beds['rain-roof']).toBeGreaterThan(0.5);
    expect(inside.beds['rain-light']).toBeUndefined();
    expect(inside.beds.room).toBeGreaterThan(0);
    expect(inside.beds.murmur).toBeGreaterThan(0);
  });

  test('heavy rain silences the birds; a storm adds thunder and wind', () => {
    expect(mix({ condition: 'downpour' }).beds['forest-day']).toBeUndefined();
    const storm = mix({ condition: 'storm' });
    expect(storm.beds.storm).toBe(1);
    expect(storm.beds['wind-strong']).toBeGreaterThan(0);
  });

  test('snow is hushed; a blizzard howls; sand storms roar', () => {
    expect(mix({ condition: 'snow', region: 'iron' }).beds['snow-quiet']).toBe(1);
    const blizzard = mix({ condition: 'blizzard', region: 'iron' });
    expect(blizzard.beds['wind-strong']).toBe(1);
    expect(blizzard.beds['wind-high']).toBeGreaterThan(0);
    expect(mix({ condition: 'sandstorm', region: 'wind', place: 'Open desert' }).beds['wind-strong']).toBe(1);
  });

  test('high places get the wind over the heights', () => {
    expect(mix({ place: 'Mountain pass into the Land of Earth' }).beds['wind-high']).toBeGreaterThan(0);
  });

  test('water comes from places known to have it', () => {
    expect(mix({ place: 'Naka River', placeId: 'naka-river', kind: 'road' }).beds.river).toBeGreaterThan(0.5);
    expect(mix({ place: 'Valley of the End', placeId: 'valley-end' }).beds.waterfall).toBeGreaterThan(0.8);
    expect(mix({ place: 'A stream in the woods' }).beds.stream).toBeGreaterThan(0);
    expect(mix({ place: 'Rocky coast', kind: 'road' }).beds.sea).toBeGreaterThan(0.5);
    expect(mix({ place: 'Ruins of Uzushio', placeId: 'uzushio', region: 'whirlpools', kind: 'structure' }).beds.sea).toBeGreaterThan(0);
    // A plain forest has no water.
    const dry = mix({});
    expect(dry.beds.river ?? dry.beds.stream ?? dry.beds.sea ?? dry.beds.waterfall).toBeUndefined();
    // The Hidden Waterfall village is a name, not a waterfall in the street.
    expect(mix({ place: 'Hidden Waterfall village', placeId: 'waterfall', region: 'waterfall', kind: 'settlement' }).beds.waterfall).toBe(0.5);
  });

  test('villages bustle by day, markets more, and go quiet at night', () => {
    const street = mix({ kind: 'settlement', place: 'Hidden Leaf, main road' });
    const market = mix({ kind: 'settlement', place: 'Market street, Hidden Sand', region: 'wind' });
    const night = mix({ kind: 'settlement', place: 'Hidden Leaf, main road', period: 'night', hour: 1 });
    expect(street.beds.village).toBeGreaterThan(0.4);
    expect(market.beds.village!).toBeGreaterThan(street.beds.village!);
    expect(night.beds.village!).toBeLessThan(0.2);
  });

  test('a hearth or a campfire crackles; a cave drips', () => {
    expect(mix({ place: 'By the campfire', period: 'evening', hour: 19 }).beds.fire).toBeGreaterThan(0);
    expect(mix({ kind: 'structure', place: 'Farmhouse kitchen by the hearth' }).beds.fire).toBeGreaterThan(0);
    const cave = mix({ kind: 'structure', place: 'A cave behind the falls' });
    expect(cave.indoors).toBe(true);
    expect(cave.beds.cave).toBeGreaterThan(0);
    expect(cave.beds['forest-day']).toBeUndefined();
  });

  test('a fight is marked so the player can lower the ambience; nothing is added', () => {
    const calm = mix({});
    const fight = mix({ fight: true });
    expect(fight.fight).toBe(true);
    expect(fight.beds).toEqual(calm.beds);
    expect(fight.key).not.toBe(calm.key);
  });

  test('indoor beds are the only ones that skip the outdoor muffle', () => {
    expect([...INDOOR_BEDS].sort()).toEqual(['cave', 'fire', 'murmur', 'rain-roof', 'room']);
    expect(isIndoors({ kind: 'structure', place: 'Shrine courtyard' })).toBe(false);
    expect(isIndoors({ kind: 'settlement', place: 'Ichiraku, inside' })).toBe(true);
  });

  test('every level stays between 0 and 1, and the key only changes with the mix', () => {
    const conditions = ['clear', 'cloudy', 'drizzle', 'rain', 'downpour', 'storm', 'fog', 'snow', 'blizzard', 'sleet', 'wind', 'sandstorm', 'heat', 'humid'] as const;
    for (const condition of conditions) {
      for (const kind of ['settlement', 'road', 'wilderness', 'structure'] as const) {
        const result = mix({ condition, kind, place: 'Forest river by the coast, near a mountain camp' });
        for (const level of Object.values(result.beds)) {
          expect(level).toBeGreaterThan(0);
          expect(level).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(mix({}).key).toBe(mix({}).key);
  });

  test('describes what is playing in a few words', () => {
    expect(describeAmbience(mix({ condition: 'rain', kind: 'structure', place: 'Inn room' }))).toMatch(/^Rain on the roof/);
    expect(describeAmbience(mix({ condition: 'downpour', place: 'Open road', kind: 'road' }))).not.toMatch(/^Rain, /);
    expect(describeAmbience({ beds: {}, indoors: false, fight: false, key: '' })).toBe('Silence');
  });
});

describe('ambience: read from the save', () => {
  test('uses the scene weather, the place, the clock and the scene mode', () => {
    let db = at(seed(), {
      location: 'Naka River, Hidden Leaf',
      locationKind: 'road',
      inStoryDate: { ...seed().state.inStoryDate, hour: 9, minute: 0 },
    });
    db = at(db, { weather: { region: 'fire', condition: 'storm', since: db.state.inStoryDate, source: 'story', text: 'thunder' } });
    const input = ambienceInputOf(db);
    expect(input.condition).toBe('storm');
    expect(input.placeId).toBe('naka-river');
    expect(input.period).toBe('morning');
    const result = currentAmbience(db);
    expect(result.beds.storm).toBe(1);
    expect(result.beds.river).toBeGreaterThan(0);

    const fighting = at(db, { sceneMode: { current: 'fight', exchangeStreak: 0, partners: [] } });
    expect(currentAmbience(fighting).fight).toBe(true);
  });

  test('a new save has something to hear', () => {
    expect(Object.keys(currentAmbience(seed()).beds).length).toBeGreaterThan(0);
  });
});
