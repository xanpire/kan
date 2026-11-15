/**
 * Section 1 of claude/before-variety-ideas.md (15 Nov 2026): era accuracy.
 * Roles move with canon (eraRoles.ts), the Rain's map note waits for the
 * stronghold, Karin's beat names Sasuke's team for both of its names, Tobi
 * carries news only once he is Tobi, and Gaara sounds like the killer he is
 * until the invasion.
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

import { advanceCanon, unfireFutureMilestones } from '../lib/rpg/canon';
import { CANON_CAST } from '../lib/rpg/canonCast';
import { CANON_MILESTONES } from '../lib/rpg/canonData';
import { normalizeDatabase } from '../lib/rpg/db';
import { ROLE_STAGES, eraRoleFor, roleBeforeStory, syncEraRoles } from '../lib/rpg/eraRoles';
import { MAP_PLACES, placeNote } from '../lib/rpg/mapData';
import { inTenure } from '../lib/rpg/newsDelivery';
import { seedDatabase } from '../lib/rpg/seed';
import type { AppDatabase, CalendarDate } from '../lib/rpg/types';
import { voiceOf } from '../lib/rpg/voices';

const seed = () => normalizeDatabase(seedDatabase('slot_era_roles', 'Era roles'));
const date = (year: number, month: number, day = 1): CalendarDate => ({ year, month, day, hour: 12, minute: 0, second: 0 });
const at = (db: AppDatabase, when: CalendarDate): AppDatabase => ({ ...db, state: { ...db.state, inStoryDate: when } });
const withDone = (db: AppDatabase, ids: string[]): AppDatabase => ({
  ...db,
  state: { ...db.state, canonProgress: { ...db.state.canonProgress!, completed: [...(db.state.canonProgress?.completed ?? []), ...ids] } },
});
// The map reads a milestone as happened only with its event in the save, as when it really fires.
const fired = (db: AppDatabase, ids: string[]): AppDatabase => {
  const done = withDone(db, ids);
  return { ...done, events: [...done.events, ...ids.map((id) => ({ ...done.events[0], id: `event_canon_${id}`, tags: ['canon'] }))] };
};
const roleOf = (db: AppDatabase, name: string) => db.entities.find((entity) => entity.name === name)?.role;
const rain = MAP_PLACES.find((place) => place.id === 'rain')!;

describe('roles move with canon', () => {
  test('every stage names a real person and a real milestone', () => {
    const names = new Set(CANON_CAST.map((entry) => entry.name));
    const ids = new Set(CANON_MILESTONES.map((milestone) => milestone.id));

    for (const [name, stages] of Object.entries(ROLE_STAGES)) {
      expect(names.has(name)).toBe(true);
      for (const stage of stages) {
        expect(stage.from === 'start' || ids.has(stage.from)).toBe(true);
      }
    }
  });

  test('stages are in timeline order', () => {
    const order = new Map(CANON_MILESTONES.map((milestone, index) => [milestone.id, index]));

    for (const stages of Object.values(ROLE_STAGES)) {
      const positions = stages.map((stage) => (stage.from === 'start' ? -1 : order.get(stage.from)!));
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    }
  });

  test('the first night: Kakashi still in ANBU, Orochimaru still in the Akatsuki, no Sound yet', () => {
    const db = seed();
    expect(roleOf(db, 'Kakashi Hatake')).toBe('Leaf ANBU captain · Team Ro');
    expect(roleOf(db, 'Orochimaru')).toBe('Legendary Sannin · Akatsuki member');
    expect(roleOf(db, 'Sakura Haruno')).toBe('Leaf Academy student');
    expect(roleOf(db, 'Tayuya')).toBe('Orochimaru’s guard');
    expect(roleOf(db, 'Gaara')).toBe('Sand · One-Tail jinchuriki');
  });

  test('the engine moves them as milestones fire', () => {
    let db = at(seed(), date(18, 4, 20));
    db = advanceCanon(db);

    expect(db.state.canonProgress?.completed).toContain('tsunade-hokage');
    expect(roleOf(db, 'Tsunade Senju')).toBe('Fifth Hokage · Legendary Sannin');
    expect(roleOf(db, 'Kakashi Hatake')).toBe('Leaf jonin · Team 7’s sensei');
    expect(roleOf(db, 'Orochimaru')).toBe('Legendary Sannin · lord of the Sound');
    expect(roleOf(db, 'Tayuya')).toBe('Sound Four · Orochimaru’s guard');
    expect(roleOf(db, 'Shikamaru Nara')).toBe('Nara clan strategist · chunin · Team 10');
  });

  test('Gaara: Kazekage, then no longer a host', () => {
    const done = new Set(['gaara-kage']);
    expect(eraRoleFor('Gaara', done)).toBe('Fifth Kazekage · One-Tail jinchuriki');
    done.add('gaara-captured');
    expect(eraRoleFor('Gaara', done)).toBe('Fifth Kazekage');
  });

  test('a role the story wrote itself is never overwritten', () => {
    const db = seed();
    const written: AppDatabase = {
      ...db,
      entities: db.entities.map((entity) => (entity.name === 'Tsunade Senju' ? { ...entity, role: 'Gambler hiding in Tanzaku Town' } : entity)),
    };
    expect(roleOf(syncEraRoles(withDone(written, ['tsunade-hokage'])), 'Tsunade Senju')).toBe('Gambler hiding in Tanzaku Town');
  });

  test('an old save with the old seed text catches up on load', () => {
    const db = seed();
    const old: AppDatabase = withDone(
      { ...db, entities: db.entities.map((entity) => (entity.name === 'Orochimaru' ? { ...entity, role: 'Legendary Sannin · rogue scientist' } : entity)) },
      ['orochimaru-betrayal']
    );
    expect(roleOf(normalizeDatabase(old), 'Orochimaru')).toBe('Legendary Sannin · missing-nin');
  });

  test('a clock set back takes the role back too', () => {
    let db = advanceCanon(at(seed(), date(18, 4, 20)));
    expect(roleOf(db, 'Tsunade Senju')).toBe('Fifth Hokage · Legendary Sannin');
    db = unfireFutureMilestones(at(db, date(18, 3, 1)));
    expect(roleOf(db, 'Tsunade Senju')).toBe('Legendary Sannin · medical ninja');
  });

  test('flashbacks get the role from before the story', () => {
    expect(roleBeforeStory({ name: 'Tsunade Senju', role: 'Fifth Hokage · Legendary Sannin' })).toBe('Legendary Sannin · medical ninja');
    expect(roleBeforeStory({ name: 'Kakashi Hatake', role: 'Sixth Hokage' })).toBe('Leaf ANBU captain · Team Ro');
    expect(roleBeforeStory({ name: 'Tsunade Senju', role: 'Gambler' })).toBe('Gambler');
  });

  test('roles stay short enough for the narrator’s card to keep the point', () => {
    for (const stages of Object.values(ROLE_STAGES)) {
      for (const stage of stages) expect(stage.role.split('·')[0].trim().length).toBeLessThanOrEqual(40);
    }
  });
});

describe('the rest of the sweep', () => {
  test('the Rain is the stronghold only from ame-stronghold', () => {
    const joined = fired(seed(), ['kan-joins-akatsuki']);
    expect(placeNote(joined, rain)).toContain('meet here in secret');
    expect(placeNote(fired(joined, ['ame-stronghold']), rain)).toBe('The Akatsuki’s stronghold, in the tower.');
    expect(placeNote(seed(), rain)).toBeNull();
  });

  test('Karin’s beat names Sasuke’s team for both of its names', () => {
    const beat = CANON_MILESTONES.find((milestone) => milestone.id === 'karin-senses-uzumaki')!;
    expect(beat.description).not.toContain('Hebi');
    expect(beat.encounter?.who).toContain('Taka');
  });

  test('Tobi carries Akatsuki news only once he is Tobi', () => {
    expect(inTenure(seed(), 'Tobi')).toBe(false);
    expect(inTenure(withDone(seed(), ['tobi-joins-akatsuki']), 'Tobi')).toBe(true);
  });

  test('Gaara is the killer until the invasion', () => {
    const db = seed();
    const gaara = db.entities.find((entity) => entity.name === 'Gaara')!;
    expect(voiceOf(gaara, db)).toContain('murderous');
    expect(voiceOf(gaara, withDone(db, ['konoha-invasion']))).toContain('learning to care');
  });
});
