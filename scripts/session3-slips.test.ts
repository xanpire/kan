// Session 3's narrator slips (v1.25.22): Itachi called them both "missing-nin"
// on the second day, Kan wore his bat mask and ANBU uniform after the errand,
// a mask moved back to Itachi's face on its own, and (Session 2) Hana's letter
// said Izumi's marker had no body.
import { describe, expect, test } from 'bun:test';
import { normalizeDatabase } from '../lib/rpg/db';
import { FIRST_DAWN, kanRankNow } from '../lib/rpg/opening';
import { buildNarrationPrompt, KAN_HISTORY } from '../lib/rpg/prompt';
import { seedDatabase } from '../lib/rpg/seed';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_slips', 'Slips'));
const prompt = (db: AppDatabase) => buildNarrationPrompt(db, 'I keep walking.').messages.map((m) => m.content as string).join('\n');
const secondDay = (db: AppDatabase): AppDatabase => ({
  ...db,
  state: { ...db.state, inStoryDate: { ...FIRST_DAWN, day: 3, hour: 9 }, location: 'Land of Rivers', scene: 'A ford' },
});

describe('Session 3 narrator slips', () => {
  test('after the first night nobody calls Kan a missing-nin while the Leaf thinks him dead', () => {
    const text = prompt(secondDay(seed()));
    expect(text).toContain('Nobody has declared you a missing-nin');
  });

  test('the line is not sent on the first night itself', () => {
    expect(prompt(seed())).not.toContain('Nobody has declared you a missing-nin');
  });

  test('no ANBU gear after the massacre, and the graves hold bodies', () => {
    expect(KAN_HISTORY).toContain('bat mask stayed behind');
    expect(KAN_HISTORY).toContain('their graves hold their bodies');
    expect(prompt(secondDay(seed()))).toContain('their graves hold their bodies');
  });

  test('carried things stay where they were put', () => {
    expect(prompt(secondDay(seed()))).toContain('stay where they were last put');
  });
});

describe('the sheet no longer calls Kan a missing-nin before the cloak', () => {

  test('the second day: former Leaf ANBU, counted among the dead', () => {
    const db = secondDay(seed());
    expect(kanRankNow(db)).toBe('Former Hidden Leaf ANBU');
    const text = prompt(db);
    expect(text).toContain("Rank/Role: Former Hidden Leaf ANBU, counted among the massacre's dead");
    expect(text).not.toContain('Rank/Role: Missing-nin');
  });

  test('with the cloak the rank shows it, and the line goes', () => {
    const db = secondDay(seed());
    const cloaked: AppDatabase = { ...db, state: { ...db.state, canonProgress: { ...db.state.canonProgress!, completed: [...db.state.canonProgress!.completed, 'kan-joins-akatsuki'] } } };
    expect(kanRankNow(cloaked)).toBe('Akatsuki, on trial · missing-nin');
    expect(prompt(cloaked)).not.toContain('Nobody has declared you a missing-nin');
  });
});
