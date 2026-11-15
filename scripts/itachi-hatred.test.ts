// Section 17 (decided by Xan 15 Nov 2026): Itachi tells Kan nothing, sends
// him away on a false ANBU order, and Kan learns the massacre from him in the
// first scene; the Sharingan wakes in that fight, the Mangekyō at Izumi's
// funeral, and Itachi (not the masked man) holds Izumi's eyes.
import { describe, expect, test } from 'bun:test';
import { CANON_MILESTONES } from '../lib/rpg/canonData';
import { normalizeDatabase } from '../lib/rpg/db';
import { FLASHBACKS, FLASHBACK_BY_ID, openingOf } from '../lib/rpg/flashbacks';
import { loreActive } from '../lib/rpg/lore';
import { IZUMI_EYES_LORE, OPENING_BRIEFING, OPENING_MEMORY, seedDatabase } from '../lib/rpg/seed';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_itachi', 'Itachi'));
const milestone = (id: string) => CANON_MILESTONES.find((item) => item.id === id)!;
const knowsIzumiDead = (db: AppDatabase): AppDatabase => ({
  ...db,
  entities: db.entities.map((entity) =>
    entity.name === 'Izumi Uchiha' ? { ...entity, deceased: { ...entity.deceased, known: true } } : entity
  ),
});
const kanId = (db: AppDatabase) => db.entities.find((entity) => entity.name === 'Kan')!.id;

describe('the opening: a false order, no fight before the story', () => {
  test('a new story starts with the false-order opening', () => {
    const db = seed();
    expect(db.state.opening).toBe('false-order');
    expect(openingOf(db)).toBe('false-order');
    expect(db.events[0].summary).toBe(OPENING_MEMORY);
    expect(db.events[0].narratorNote).toBe(OPENING_BRIEFING);
  });

  test('Kan’s own memory and pages give nothing away', () => {
    const db = seed();
    expect(OPENING_MEMORY).toMatch(/order/);
    expect(OPENING_MEMORY).not.toMatch(/massacre|dead|died|kill|fought|Akatsuki/i);

    const itachi = db.bonds.find((bond) => bond.characterName === 'Itachi Uchiha')!;
    expect(itachi.yourFeelings?.note).not.toMatch(/massacre|kill|fought|lost/i);
    expect(itachi.yourFeelings?.affinity).toBe(7);

    // What Kan knows on the first night: the order, never that it was false or what happened.
    const kanKnows = db.facts.filter((fact) => fact.whoKnows.includes(kanId(db)));
    expect(kanKnows.some((fact) => /ANBU order/.test(fact.text))).toBe(true);
    expect(kanKnows.some((fact) => /false|massacred|fought him/.test(fact.text))).toBe(false);
  });

  test('the narrator is told the night, the fight and the Sharingan guard', () => {
    expect(OPENING_BRIEFING).toMatch(/false/);
    expect(OPENING_BRIEFING).toMatch(/Izumi and Hazuki/);
    expect(OPENING_BRIEFING).toMatch(/Sharingan awakens mid-fight from rage/);
    expect(OPENING_BRIEFING).toMatch(/never the Mangekyō/);
    expect(OPENING_BRIEFING).toMatch(/only defends/);
  });

  test('the Sharingan lore: first fight, from rage, tomoe only', () => {
    const db = seed();
    const lore = db.loreEntries.find((entry) => entry.text.startsWith('Your Sharingan awakens'))!;
    expect(lore.hidden).toBe(true);
    expect(lore.text).toMatch(/first fight with Itachi/);
    expect(lore.text).toMatch(/NEVER the Mangekyō/);
    expect(db.loreEntries.some((entry) => /not in a fight/.test(entry.text))).toBe(false);
    expect(db.loreEntries.some((entry) => /told you his plan/.test(entry.text))).toBe(false);
  });
});

describe('hatred, once Kan knows', () => {
  test('the hatred lore waits for Izumi’s death to be known; the "you don’t know" lore ends then', () => {
    let db = seed();
    const hatred = db.loreEntries.find((entry) => entry.text.startsWith('You and Itachi, since the forest'))!;
    const notYet = db.loreEntries.find((entry) => entry.text.startsWith('Until Itachi tells you in the forest'))!;
    expect(loreActive(db, hatred)).toBe(false);
    expect(loreActive(db, notYet)).toBe(true);

    db = knowsIzumiDead(db);
    expect(loreActive(db, hatred)).toBe(true);
    expect(loreActive(db, notYet)).toBe(false);
    expect(hatred.text).toMatch(/nowhere else/);
    expect(hatred.text).toMatch(/wants to be hated/);
  });

  test('Itachi’s voice: he never defends himself', () => {
    const db = seed();
    const itachi = db.entities.find((entity) => entity.name === 'Itachi Uchiha')!;
    expect(itachi.notes).toMatch(/false ANBU order/);
    expect(itachi.notes).toMatch(/Izumi’s eyes/);
  });
});

describe('the Mangekyō at the funeral, the eyes with Itachi', () => {
  test('kan-mangekyo opens on the funeral day, grave as the fallback', () => {
    const beat = milestone('kan-mangekyo');
    expect(beat.from).toEqual({ year: 13, month: 10, day: 6 });
    expect(beat.from).toEqual(milestone('izumi-funeral').from);
    expect(beat.to).toEqual({ year: 18, month: 3, day: 21 });
    expect(beat.completesWhen).toMatch(/funeral/);
    expect(beat.completesWhen).toMatch(/grave/);
    expect(beat.encounter?.context).toMatch(/never in the first fight with Itachi/i);
    expect(milestone('itachi-sees-mangekyo').from).toEqual({ year: 13, month: 10, day: 6 });
  });

  test('Izumi’s eyes come from Itachi, not the masked man', () => {
    const beat = milestone('masked-man-eyes');
    expect(beat.encounter?.who).toMatch(/Itachi/);
    expect(beat.encounter?.context).toMatch(/masked man never had them/);
    expect(beat.from).toEqual({ year: 21, month: 12, day: 1 });
    expect(beat.after).toBe('kan-mangekyo');
    expect(IZUMI_EYES_LORE).toMatch(/Itachi took her eyes/);
    expect(IZUMI_EYES_LORE).toMatch(/Tsukuyomi/);
  });

  test('an old save’s hidden eyes lore is rewritten to Itachi', () => {
    const db = seed();
    const old = {
      ...db,
      loreEntries: db.loreEntries.map((entry) =>
        entry.text === IZUMI_EYES_LORE
          ? { ...entry, text: 'Hidden truth about Izumi (never reveal it): after the massacre the masked man harvested her eyes.' }
          : entry
      ),
    };
    const loaded = normalizeDatabase(old);
    expect(loaded.loreEntries.filter((entry) => entry.text === IZUMI_EYES_LORE)).toHaveLength(1);
    expect(loaded.loreEntries.some((entry) => /masked man harvested/.test(entry.text))).toBe(false);
  });
});

describe('flashback 23 follows the opening', () => {
  test('new stories get The order; old saves keep The fight', () => {
    expect(FLASHBACK_BY_ID['the-order'].opening).toBe('false-order');
    expect(FLASHBACK_BY_ID['the-fight'].opening).toBe('told');
    expect(FLASHBACK_BY_ID['the-order'].fixed.join(' ')).toMatch(/last time you see them/);
    expect(FLASHBACK_BY_ID['the-order'].hidden?.join(' ')).toMatch(/order is false/);

    const old = seed();
    delete old.state.opening;
    expect(openingOf(old)).toBe('told');
    expect(FLASHBACKS.filter((record) => record.opening === 'false-order').map((record) => record.id)).toEqual(['the-order']);
  });
});
