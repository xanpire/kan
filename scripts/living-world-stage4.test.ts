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

import { advanceSeconds, shiftDate } from '../lib/rpg/calendar';
import { startCompanion } from '../lib/rpg/companions';
import { normalizeDatabase } from '../lib/rpg/db';
import { resolveCharacterRefs } from '../lib/rpg/entities';
import { currentRegion, regionOf, travelDaysBetween } from '../lib/rpg/geography';
import { GEOGRAPHY_LORE } from '../lib/rpg/seed';
import { appendStoryMessage } from '../lib/rpg/log';
import {
  MAP_PLACES,
  knownWhereabouts,
  normalizeTravelLog,
  placeIdOf,
  placeVisits,
  pointOfStop,
  REGION_SHAPES,
  regionAt,
  recordTravel,
  routePoints,
  travelEstimate,
} from '../lib/rpg/mapData';
import { parseImageAction } from '../lib/rpg/image';
import { applyStateStep } from '../lib/rpg/memoryJobs';
import { buildExtractionPrompt, buildNarrationPrompt } from '../lib/rpg/prompt';
import { captionOf, eraOfDate, placeAt, scrapbook } from '../lib/rpg/scrapbook';
import { seedDatabase } from '../lib/rpg/seed';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import { TURN_STATE_SCHEMA } from '../lib/rpg/stateSchema';
import type { AppDatabase, CalendarDate, EntityRecord } from '../lib/rpg/types';
import {
  applyWeather,
  conditionFromText,
  currentWeather,
  formatWeatherLine,
  seasonLabel,
  seasonOf,
  weatherAt,
} from '../lib/rpg/weather';

const seed = () => normalizeDatabase(seedDatabase('slot_stage4', 'Stage 4'));
const person = (db: AppDatabase, name: string) => db.entities.find((entity) => entity.name === name)!;
const update = (db: AppDatabase, name: string, change: Partial<EntityRecord>): AppDatabase => ({
  ...db,
  entities: db.entities.map((entity) => (entity.name === name ? { ...entity, ...change } : entity)),
});
const at = (db: AppDatabase, change: Partial<AppDatabase['state']>): AppDatabase => ({ ...db, state: { ...db.state, ...change } });
const narratorText = (db: AppDatabase, input = '*You wait.*') =>
  buildNarrationPrompt(db, input).messages.map((message) => message.content).join('\n');
const weatherLine = (db: AppDatabase, input = '*You wait.*') =>
  narratorText(db, input).split('\n').find((line) => line.startsWith('WEATHER')) ?? '';

function play(db: AppDatabase, input: string, narration: string, block: Record<string, unknown>) {
  let next = appendStoryMessage(db, 'user', input, null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  const diff = resolveCharacterRefs(next, convertStateBlock(block).diff);
  return applyStateStep(next, diff, { turnLogId, userMessage: input, narration }, new Set()).db;
}

/** Every six hours across a year in one region. */
function yearOf(region: Parameters<typeof weatherAt>[1], seedText = 'slot_stage4') {
  const days: { date: CalendarDate; condition: string }[] = [];
  let date: CalendarDate = { year: 14, month: 1, day: 1, hour: 3, minute: 0 };

  for (let index = 0; index < 365 * 4; index += 1) {
    days.push({ date, condition: weatherAt(seedText, region, date) });
    date = advanceSeconds(date, 6 * 3600);
  }

  return days;
}

describe('seasons', () => {
  test('real seasons from the calendar, named the way the place would', () => {
    expect(seasonOf(1)).toBe('winter');
    expect(seasonOf(4)).toBe('spring');
    expect(seasonOf(7)).toBe('summer');
    expect(seasonOf(10)).toBe('autumn');
    expect(seasonLabel('fire', { year: 14, month: 6, day: 10, hour: 9, minute: 0 })).toBe('the rainy season');
    expect(seasonLabel('fire', { year: 14, month: 7, day: 10, hour: 9, minute: 0 })).toContain('monsoon');
    expect(seasonLabel('iron', { year: 14, month: 1, day: 10, hour: 9, minute: 0 })).toContain('northern winter');
    expect(seasonLabel('wind', { year: 14, month: 12, day: 10, hour: 9, minute: 0 })).toBe('early winter');
  });
});

describe('weather', () => {
  test('the same save, place and hour always give the same weather', () => {
    const date: CalendarDate = { year: 15, month: 3, day: 12, hour: 14, minute: 0 };
    expect(weatherAt('a', 'fire', date)).toBe(weatherAt('a', 'fire', date));
  });

  test('the Rain never stops; the north snows in winter; the desert never snows', () => {
    const rain = yearOf('rain');
    expect(rain.every((entry) => ['drizzle', 'rain', 'downpour', 'storm', 'fog', 'sleet'].includes(entry.condition))).toBe(true);

    const ironWinter = yearOf('iron').filter((entry) => seasonOf(entry.date.month) === 'winter');
    const snowy = ironWinter.filter((entry) => entry.condition === 'snow' || entry.condition === 'blizzard').length;
    expect(snowy / ironWinter.length).toBeGreaterThan(0.6);

    expect(yearOf('wind').some((entry) => ['snow', 'blizzard', 'sleet'].includes(entry.condition))).toBe(false);

    const fireSummer = yearOf('fire').filter((entry) => seasonOf(entry.date.month) === 'summer');
    expect(fireSummer.some((entry) => entry.condition === 'snow')).toBe(false);
    expect(fireSummer.filter((entry) => ['humid', 'heat', 'storm', 'downpour', 'rain', 'drizzle'].includes(entry.condition)).length / fireSummer.length).toBeGreaterThan(0.6);

    const mist = yearOf('water');
    expect(mist.filter((entry) => entry.condition === 'fog').length / mist.length).toBeGreaterThan(0.35);
  });

  test('spells last: the sky does not flip every few hours', () => {
    const fire = yearOf('fire');
    const flips = fire.filter((entry, index) => index > 0 && entry.condition !== fire[index - 1].condition).length;
    // Under one change a day on average.
    expect(flips).toBeLessThan(365);
  });

  test('a scene keeps its weather; a new scene gets the world\'s', () => {
    const db = seed();
    const held = applyWeather(db, undefined);
    expect(held.state.weather?.source).toBe('world');

    // Hours later in the same scene: the same weather, whatever the world's is now.
    const forced = at(held, { weather: { ...held.state.weather!, condition: 'fog' } });
    const later = at(forced, { inStoryDate: advanceSeconds(forced.state.inStoryDate, 5 * 3600) });
    expect(currentWeather(later).condition).toBe('fog');
    expect(applyWeather(later, undefined).state.weather?.condition).toBe('fog');

    // A new scene: the lock follows the world again.
    const next = at(later, { sceneSeq: (later.state.sceneSeq ?? 0) + 1 });
    expect(currentWeather(next).condition).toBe(weatherAt(next.meta.slotId, 'fire', next.state.inStoryDate));

    // Another country: its own weather.
    const elsewhere = at(held, { weather: { ...held.state.weather!, condition: 'blizzard' }, location: 'a teahouse in the Hidden Rain Village' });
    expect(currentWeather(elsewhere).region).toBe('rain');
    expect(currentWeather(elsewhere).condition).not.toBe('blizzard');
  });

  test('the story can change the weather, and it holds a while', () => {
    expect(conditionFromText('the rain stops')).toBe('cloudy');
    expect(conditionFromText('snow begins to fall')).toBe('snow');
    expect(conditionFromText('thunder rolls in')).toBe('storm');
    expect(conditionFromText('the fog lifts')).toBe('clear');
    expect(conditionFromText('a downpour')).toBe('downpour');
    expect(conditionFromText(null)).toBeNull();

    const db = play(
      seed(),
      '*You keep walking.*',
      'Thunder cracks overhead and the sky opens. Within a minute you are soaked.',
      { weather: 'a thunderstorm breaks', scene_pace: 'travel', time: { elapsed: 2, unit: 'minutes', clock_time: null } }
    );
    expect(db.state.weather?.source).toBe('story');
    expect(db.state.weather?.condition).toBe('storm');
    expect(weatherLine(db)).toContain('as the story has it');

    // A new scene an hour later: still the storm. Nine hours later: the world's weather.
    const scene = at(db, { sceneSeq: (db.state.sceneSeq ?? 0) + 1, inStoryDate: advanceSeconds(db.state.inStoryDate, 3600) });
    expect(currentWeather(scene).condition).toBe('storm');
    const gone = at(scene, { inStoryDate: advanceSeconds(db.state.inStoryDate, 9 * 3600) });
    expect(currentWeather(gone).source).toBe('world');
  });

  test('the narrator gets one line: weather, season, and what it does', () => {
    const base = applyWeather(seed(), undefined);
    const rain = at(base, { weather: { ...base.state.weather!, condition: 'rain' } });
    const line = weatherLine(rain);
    expect(line).toContain('the Land of Fire');
    expect(line).toMatch(/autumn/);
    expect(line).toContain('quarter slower');
    expect(line).toContain('scent');
    expect(line.length).toBeLessThan(420);

    expect(formatWeatherLine(rain, 'fight')).toContain('In this fight: mud');
    expect(formatWeatherLine(rain, 'conversation')).not.toContain('slower');
    expect(formatWeatherLine(at(rain, { locationKind: 'structure', location: 'a cellar in the Hidden Leaf' }), 'normal')).toContain('outside, steady rain');

    // The Rain says what it is.
    const inRain = at(seed(), { location: 'a teahouse in the Hidden Rain Village' });
    expect(weatherLine(inRain)).toContain('never stops raining');
  });

  test('the state tracker sees the weather and can change it', () => {
    const db = seed();
    expect(buildExtractionPrompt(db, 'x', 'y').messages[1].content).toContain('WEATHER NOW');
    expect(buildExtractionPrompt(db, 'x', 'y').messages[0].content).toContain('weather: a few words');
    expect((TURN_STATE_SCHEMA as { properties: Record<string, unknown> }).properties.weather).toBeTruthy();
    expect(convertStateBlock({ weather: 'Snow starts falling' }).diff.weather).toBe('Snow starts falling');
    expect(convertStateBlock({ weather: null, mood: 'calm' }).diff?.weather).toBeUndefined();
  });

  test('older saves load without weather and get it on the next turn', () => {
    const db = seed();
    const old = normalizeDatabase({ ...db, state: { ...db.state, weather: undefined, travelLog: undefined } } as AppDatabase);
    expect(old.state.weather).toBeUndefined();
    expect(old.state.travelLog?.length).toBe(1);
    const broken = normalizeDatabase({ ...db, state: { ...db.state, weather: { condition: 'hail' } } } as unknown as AppDatabase);
    expect(broken.state.weather).toBeUndefined();
  });
});

describe('the map', () => {
  test('Stage 2 places are on it, and locations find them', () => {
    const ids = MAP_PLACES.map((place) => place.id);
    for (const id of ['grass', 'uzushio', 'silence', 'naka-shrine', 'mask-shrine']) expect(ids).toContain(id);
    expect(placeIdOf('the Naka Shrine in the ruins of the Hidden Leaf')).toBe('naka-shrine');
    expect(placeIdOf('the Uzumaki mask shrine on the outskirts of the Hidden Leaf')).toBe('mask-shrine');
    expect(placeIdOf('the ruins of Uzushiogakure')).toBe('uzushio');
    expect(placeIdOf('the Land of Silence')).toBe('silence');
    expect(placeIdOf('a teahouse in Amegakure')).toBe('rain');
    expect(placeIdOf('a cave in the hills')).toBeNull();
  });

  test('your road: each new place once, with its country', () => {
    let db = seed();
    expect(db.state.travelLog?.[0].region).toBe('fire');

    db = play(db, '*You head west.*', 'Three days on the road bring you into the Land of Rain.', {
      location: 'the Rain border',
      location_kind: 'road',
      scene_pace: 'travel',
      time: { elapsed: 3, unit: 'days', clock_time: null },
    });
    expect(db.state.travelLog?.at(-1)?.place).toBe('the Rain border');
    expect(db.state.travelLog?.at(-1)?.region).toBe('rain');

    // A place with no country stays in the last one.
    db = play(db, '*You find shelter.*', 'A shallow cave keeps the worst of the rain off.', {
      location: 'a shallow cave',
      location_kind: 'wilderness',
      scene_pace: 'downtime',
      time: { elapsed: 20, unit: 'minutes', clock_time: null },
    });
    expect(db.state.travelLog?.at(-1)?.region).toBe('rain');
    expect(currentRegion(db)).toBe('rain');

    // Staying put adds nothing.
    const count = db.state.travelLog!.length;
    db = recordTravel(db);
    expect(db.state.travelLog!.length).toBe(count);

    expect(routePoints(db).length).toBeGreaterThanOrEqual(2);
  });

  test('visits are counted, and a shrine also counts for its village', () => {
    const date: CalendarDate = { year: 14, month: 2, day: 1, hour: 9, minute: 0 };
    const db = at(seed(), {
      travelLog: normalizeTravelLog(
        [
          { place: 'the Naka Shrine', region: 'fire', placeId: 'naka-shrine', date },
          { place: 'the ruins of Uzushio', region: 'whirlpools', placeId: 'uzushio', date: shiftDate(date, 4) },
        ],
        'x',
        date
      ),
    });
    const visits = placeVisits(db);
    expect(visits.get('naka-shrine')?.count).toBe(1);
    expect(visits.get('leaf')?.count).toBe(1);
    expect(visits.get('uzushio')?.count).toBe(1);
  });

  test('travel times from where you are, slower in bad weather', () => {
    const base = applyWeather(at(seed(), { location: 'a teahouse in the Hidden Rain Village' }), undefined);
    const clear = at(base, { weather: { ...base.state.weather!, region: 'rain', condition: 'drizzle' } });
    const storm = at(base, { weather: { ...base.state.weather!, region: 'rain', condition: 'storm' } });
    expect(travelEstimate(clear, 'grass')?.days).toBe(1);
    expect(travelEstimate(storm, 'grass')!.inWeather).toBeGreaterThan(travelEstimate(storm, 'grass')!.days);
    expect(travelEstimate(clear, null)).toBeNull();
  });

  test('where people are, as far as you know, not the truth', () => {
    let db = seed();
    db = update(db, 'Hana Inuzuka', { whereabouts: 'on a mission in the Land of Waves', met: true });
    db = update(db, 'Suzume', { whereabouts: undefined, lastSeenAt: 'the Hidden Leaf', lastSeen: db.state.inStoryDate, met: true });
    // Dead, but you don't know yet: still where you think.
    db = update(db, 'Izumi Uchiha', {
      deceased: { known: false, date: db.state.inStoryDate },
      status: 'Deceased',
      lastSeenAt: 'the Uchiha district in the Hidden Leaf',
      met: true,
    });
    const known = knownWhereabouts(db);
    const hana = known.find((entry) => entry.entity.name === 'Hana Inuzuka')!;
    expect(hana.region).toBe('waves');
    expect(hana.basis).toBe('told');
    expect(known.find((entry) => entry.entity.name === 'Suzume')?.basis).toBe('seen');
    expect(known.some((entry) => entry.entity.name === 'Izumi Uchiha')).toBe(true);

    // Once you know she died, she is off the map.
    const knows = update(db, 'Izumi Uchiha', { deceased: { known: true, date: db.state.inStoryDate } });
    expect(knownWhereabouts(knows).some((entry) => entry.entity.name === 'Izumi Uchiha')).toBe(false);

    // Unmet people never show.
    expect(known.some((entry) => person(db, entry.entity.name).met === false)).toBe(false);

    // Companions are with you.
    const itachi = person(db, 'Itachi Uchiha');
    const together = startCompanion(db, itachi.id, 'travelling west');
    expect(knownWhereabouts(together).find((entry) => entry.entity.id === itachi.id)?.basis).toBe('with-you');
  });
});

describe('the canon world map layout', () => {
  test('Whirlpools off Fire\'s east coast, Waves on the south coast, Frost past Hot Water', () => {
    expect(travelDaysBetween('fire', 'whirlpools')).toBe(2);
    expect(travelDaysBetween('whirlpools', 'water')).toBe(2.5);
    // Opposite sides of Fire now: no one-day road between them.
    expect(travelDaysBetween('waves', 'whirlpools')).toBeGreaterThanOrEqual(4);
    expect(travelDaysBetween('hot-water', 'frost')).toBe(1.5);
    expect(travelDaysBetween('fire', 'frost')).toBe(3);
    expect(travelDaysBetween('grass', 'waterfall')).toBe(1.5);
    expect(regionOf('the gates of the Hidden Frost Village')).toBe('frost');
    // "frost" alone is weather, not a country.
    expect(regionOf('a field white with frost')).toBeNull();
  });

  test('the Land of Silence is on the board now, at the western edge between Earth and Wind', () => {
    const silence = MAP_PLACES.find((place) => place.id === 'silence')!;
    expect(silence.unplaced).toBeFalsy();
    expect(silence.region).toBe('silence');
    expect(regionOf('the Land of Silence')).toBe('silence');
    expect(pointOfStop({ place: 'the Land of Silence', placeId: 'silence' })).toEqual({ x: silence.x, y: silence.y });
    expect(travelDaysBetween('fire', 'silence')).toBe(4.5);
  });

  test('every place on the board sits inside its own country', () => {
    // The Island Turtle swims off Lightning's coast and the bridge spans the strait; everything else is on land.
    for (const place of MAP_PLACES.filter((item) => !item.unplaced && item.id !== 'genbu' && item.id !== 'naruto-bridge')) {
      expect([place.id, regionAt(place.x, place.y)]).toEqual([place.id, place.region]);
    }
  });

  test('every country\'s anchor is inside it, so a stop with only a country lands on it', () => {
    for (const [region, shape] of Object.entries(REGION_SHAPES)) {
      expect([region, regionAt(shape.x, shape.y)]).toEqual([region, region]);
    }
    expect(regionAt(60, 50)).toBeNull(); // the bay south of the Leaf is sea
  });

  test('the Land of Rice Fields is the Land of Sound, and the new lands are found by name', () => {
    expect(regionOf('the Land of Sound')).toBe('rice');
    expect(regionOf('a farm in the Land of Rice Fields')).toBe('rice');
    expect(regionOf('the bone fields of the Mountain Graveyard')).toBe('graveyard');
    expect(regionOf('Degarashi Port')).toBe('tea');
    expect(regionOf('the Hidden Rock village')).toBe('birds');
    expect(travelDaysBetween('rice', 'graveyard')).toBe(1);
    expect(travelDaysBetween('fire', 'tea')).toBe(2.5);
  });

  test('the narrator\'s geography matches, and older saves get the new text', () => {
    expect(GEOGRAPHY_LORE).toContain('southern coast, south of Hidden Leaf');
    expect(GEOGRAPHY_LORE).toContain('Land of Whirlpools');
    expect(GEOGRAPHY_LORE).toContain('Land of Frost');
    const db = seed();
    const old = {
      ...db,
      loreEntries: db.loreEntries.map((lore) =>
        lore.text === GEOGRAPHY_LORE ? { ...lore, text: 'GEOGRAPHY (fixed; old directions)' } : lore
      ),
    } as AppDatabase;
    const loaded = normalizeDatabase(old);
    expect(loaded.loreEntries.some((lore) => lore.text === GEOGRAPHY_LORE)).toBe(true);
    expect(loaded.loreEntries.some((lore) => lore.text.includes('old directions'))).toBe(false);
  });
});

describe('the scrapbook', () => {
  test('eras follow the canon timeline', () => {
    expect(eraOfDate({ year: 13, month: 10, day: 2, hour: 9, minute: 0 })).toBe('Ashes');
    expect(eraOfDate({ year: 30, month: 1, day: 1, hour: 9, minute: 0 })).toBe('After');
    const part1 = eraOfDate({ year: 18, month: 1, day: 1, hour: 9, minute: 0 });
    // In-world names only (audit 6b.2): never "Part 1" or "Shippuden".
    expect(['The new generation', 'The hidden years']).toContain(part1);
  });

  test('photos by era and chapter, with captions in your words', () => {
    let db = seed();
    db = appendStoryMessage(db, 'assistant', 'Kan stands at the edge of the burned district. Smoke rises.', null, 0, 0);
    const first = db.rawLog.at(-1)!.id;
    db = {
      ...db,
      rawLog: db.rawLog.map((entry) =>
        entry.id === first
          ? {
              ...entry,
              image: 'img:one',
              imageMeta: {
                prompt: '',
                action: "Kan kneels at Izumi's grave and sets down a white flower.",
                caption: "You kneel at Izumi's grave and set down a white flower.",
                references: [],
                model: 'x',
                createdAt: 0,
              },
            }
          : entry
      ),
    };
    const later = at(db, { inStoryDate: { year: 18, month: 3, day: 1, hour: 9, minute: 0 }, chapter: 9, chapterTitle: 'The exams' });
    let next = appendStoryMessage(later, 'assistant', '*The arena roars.* Kan watches from the stands.', null, 0, 0);
    const second = next.rawLog.at(-1)!.id;
    next = { ...next, rawLog: next.rawLog.map((entry) => (entry.id === second ? { ...entry, image: 'img:two' } : entry)) };

    const book = scrapbook(next);
    expect(book.length).toBe(2);
    expect(book[0].era).toBe('Ashes');
    expect(book[0].chapters[0].photos[0].caption).toBe("You kneel at Izumi's grave and set down a white flower.");
    expect(book[0].chapters[0].photos[0].age).toBe(13);
    expect(book[1].chapters[0].chapter).toBe(9);
    expect(book[1].chapters[0].title).toBe('The exams');
    expect(book[1].chapters[0].photos[0].caption).toBe('The arena roars.');
    expect(book[0].chapters[0].photos[0].place).toBe('Forest outside Hidden Leaf');
  });

  test('captions: the one written in your words, else the narration, never the action line', () => {
    const meta = { prompt: '', action: 'Kan draws his blade and steps forward.', references: [], model: 'x', createdAt: 0 };
    // An older image with no caption: the narration's opening, already in "you".
    expect(captionOf({ content: 'You draw your blade. Rain falls.', imageMeta: meta })).toBe('You draw your blade.');
    expect(captionOf({ content: 'You draw your blade.', imageMeta: { ...meta, caption: 'You draw your blade in the rain.' } })).toBe(
      'You draw your blade in the rain.'
    );
    expect(parseImageAction('ACTION: Kan draws his blade.\nCAPTION: You draw your blade.')).toEqual({
      action: 'Kan draws his blade.',
      caption: 'You draw your blade.',
    });
    expect(parseImageAction('Kan draws his blade.')).toEqual({ action: 'Kan draws his blade.' });
    expect(parseImageAction('CAPTION: You draw your blade.\nACTION: Kan draws his blade.').action).toBe('Kan draws his blade.');
    const db = seed();
    expect(placeAt(db, shiftDate(db.state.inStoryDate, -5))).toBeNull();
  });
});

describe('prompt size', () => {
  test('the weather adds one short line, and nothing else new', () => {
    const db = seed();
    const lines = narratorText(db).split('\n').filter((line) => line.startsWith('WEATHER'));
    expect(lines.length).toBe(1);
    expect(lines[0].length).toBeLessThan(420);
  });
});
