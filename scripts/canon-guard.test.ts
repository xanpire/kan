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
import { applyStateStep } from '../lib/rpg/memoryJobs';
import { filterCanonMarks, newsOffer, trackedCanonBeats } from '../lib/rpg/newsDelivery';
import { isDeceased } from '../lib/rpg/deaths';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_canon_guard', 'Canon guard'));
const lastReply = (db: AppDatabase) => db.rawLog.filter((entry) => entry.role === 'assistant').at(-1)?.id ?? 'log_x';

describe('canon marks (audit 6.18)', () => {
  test('a tracker reply cannot kill Jiraiya or grant the Mangekyō years early', () => {
    const db = seed();
    const turn = { turnLogId: lastReply(db), userMessage: '*I keep walking.*', narration: 'You walk on through the rain. The road is empty.' };
    const result = applyStateStep(
      db,
      { canonCompleted: ['jiraiya-dies', 'kan-mangekyo'] },
      turn,
      new Set()
    );

    const jiraiya = result.db.entities.find((entity) => entity.name === 'Jiraiya');
    expect(jiraiya && isDeceased(jiraiya)).toBe(false);
    expect(JSON.stringify(result.db.state)).not.toContain('"kan-mangekyo"');
    expect(result.events.filter((event) => event.kind === 'dropped')).toHaveLength(2);
    expect(result.events[0].text).toContain('jiraiya-dies');
  });

  test('beats the tracker was shown are still accepted', () => {
    const db = seed();
    const { active, offered } = trackedCanonBeats(db);
    const shown = [...active, ...offered].map((milestone) => milestone.id);
    const marks = filterCanonMarks(db, { completed: [...shown, 'jiraiya-dies'], engaged: shown });
    expect(marks.completed).toEqual(shown);
    expect(marks.engaged).toEqual(shown);
    expect(marks.dropped.map((drop) => drop.id)).toEqual(['jiraiya-dies']);
  });

  test('news sent as completed is read as relayed news, not a witnessed beat', () => {
    const db = seed();
    const offer = newsOffer(db, { ignoreCombat: true });

    if (!offer) {
      // The seed offers no news: the rule still holds for an id outside the offer.
      expect(filterCanonMarks(db, { completed: ['jiraiya-dies'] }).relayed).toEqual([]);
      return;
    }

    const id = offer.items[0].milestoneId;
    const marks = filterCanonMarks(db, { completed: [id] });
    expect(marks.completed).toEqual([]);
    expect(marks.relayed).toEqual([{ id }]);
  });

  test('canon_passed only for an active beat', () => {
    const db = seed();
    expect(filterCanonMarks(db, { passed: ['jiraiya-dies'] }).passed).toEqual([]);
  });
});

import { advanceCanon } from '../lib/rpg/canon';
import { CANON_MILESTONES } from '../lib/rpg/canonData';
import { canonRoleAhead, milestoneKeyActors, milestoneNeeds } from '../lib/rpg/canonRoles';
import { markDeceased } from '../lib/rpg/deaths';
import { buildNarrationPrompt } from '../lib/rpg/prompt';

const atYear = (db: AppDatabase, year: number, month = 1): AppDatabase => ({
  ...db,
  state: { ...db.state, inStoryDate: { ...db.state.inStoryDate, year, month, day: 1 } },
});
const person = (db: AppDatabase, name: string) => db.entities.find((entity) => entity.name === name);

describe('canon protects itself (audit 6.19)', () => {
  test('the tracker cannot kill Hidan in year 15; Asuma still dies on his date', () => {
    let db = advanceCanon(atYear(seed(), 15));
    expect(person(db, 'Hidan')).toBeDefined();
    const turn = { turnLogId: lastReply(db), userMessage: '*I strike.*', narration: 'Your blade takes Hidan through the chest.' };
    const result = applyStateStep(db, { deaths: [{ name: 'Hidan' }] }, turn, new Set());
    expect(isDeceased(person(result.db, 'Hidan')!)).toBe(false);
    expect(result.events.some((event) => event.kind === 'refused' && event.text.includes('Hidan'))).toBe(true);

    db = advanceCanon(atYear(result.db, 21, 11), { inCombat: false });
    expect(isDeceased(person(db, 'Asuma Sarutobi')!)).toBe(true);
  });

  test('an old save with Hidan already dead skips the milestone instead of firing it as written', () => {
    let db = advanceCanon(atYear(seed(), 15));
    db = markDeceased(db, person(db, 'Hidan')!.id, { cause: 'an old save', known: true });
    db = advanceCanon(atYear(db, 21, 11));
    expect(isDeceased(person(db, 'Asuma Sarutobi')!)).toBe(false);
    expect(db.state.canonProgress?.expired).toContain('hidan-kakuzu');
  });

  test('original characters and people whose role is over can die', () => {
    const db = seed();
    expect(canonRoleAhead(db, { name: 'Ren Kisaragi', aliases: [] })).toBeNull();
    expect(canonRoleAhead(db, { name: 'Kan', aliases: [] })).toBeNull();
    expect(canonRoleAhead(db, { name: 'Jiraiya', aliases: [] })?.id).toBeDefined();
  });

  test('in a fight, the card tells the narrator they must come out alive', () => {
    let db = advanceCanon(atYear(seed(), 15));
    const hidan = person(db, 'Hidan')!;
    db = {
      ...db,
      entities: db.entities.map((entity) => (entity.id === hidan.id ? { ...entity, met: true } : entity)),
      state: { ...db.state, scenePace: 'combat', sceneCast: ['Hidan'] },
    };
    const text = buildNarrationPrompt(db, '*I strike.*').messages.map((message) => message.content).join('\n');
    expect(text).toContain('[CANON: cannot die here');
  });

  test('data: everyone a milestone needs or kills is alive in canon up to it', () => {
    const dead = new Set<string>();

    for (const milestone of CANON_MILESTONES) {
      for (const name of [...milestoneNeeds(milestone), ...(milestone.deaths ?? [])]) {
        expect(`${milestone.id}: ${name} ${dead.has(name) ? 'is already dead' : 'ok'}`).toBe(`${milestone.id}: ${name} ok`);
      }

      for (const name of milestone.deaths ?? []) {
        dead.add(name);
      }
    }

    expect(milestoneNeeds(CANON_MILESTONES.find((item) => item.id === 'hidan-kakuzu')!)).toEqual(
      expect.arrayContaining(['Asuma Sarutobi', 'Hidan', 'Kakuzu'])
    );
    expect(milestoneKeyActors(CANON_MILESTONES.find((item) => item.id === 'hidan-kakuzu')!)).toEqual(
      expect.arrayContaining(['Hidan', 'Kakuzu', 'Asuma Sarutobi'])
    );
  });
});
