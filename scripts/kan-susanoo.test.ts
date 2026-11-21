// Kan's Susanoo (approved by Xan, 21 Nov 2026): blood red and built like his
// vultures, growing ribs → skeleton → armoured, Perfect only with the Eternal.
import { describe, expect, test } from 'bun:test';
import { normalizeDatabase } from '../lib/rpg/db';
import { kanPowerLines, kanSusanooLine, kanSusanooStage, KAN_SUSANOO_STAGES } from '../lib/rpg/kanPowers';
import { seedDatabase } from '../lib/rpg/seed';
import type { AppDatabase, CalendarDate } from '../lib/rpg/types';

const on: CalendarDate = { year: 13, month: 10, day: 6, hour: 12, minute: 0, second: 0 };
function withEyes(susanoo: string | null, eternal = false): AppDatabase {
  const db = normalizeDatabase(seedDatabase('slot_susanoo', 'Susanoo'));
  const abilities = [
    { name: eternal ? 'Eternal Mangekyō Sharingan' : 'Mangekyō Sharingan', stage: 'awakened', acquiredOn: on },
    ...(susanoo ? [{ name: 'Susanoo', stage: susanoo, acquiredOn: on }] : []),
  ];
  return { ...db, state: { ...db.state, player: { ...db.state.player, abilities } } } as AppDatabase;
}

describe("Kan's Susanoo", () => {
  test('four stages, the last needing the Eternal', () => {
    expect(KAN_SUSANOO_STAGES.map((item) => item.stage)).toEqual(['ribs and an arm', 'skeleton', 'armoured', 'perfect']);
    expect(kanSusanooStage(withEyes('ribs and an arm'))).toBe(0);
    expect(kanSusanooStage(withEyes('skeleton'))).toBe(1);
    expect(kanSusanooStage(withEyes('full body'))).toBe(2);
    expect(kanSusanooStage(withEyes('perfect'))).toBe(2);
    expect(kanSusanooStage(withEyes('perfect', true))).toBe(3);
  });

  test('the narrator gets the design only once he has the Mangekyō', () => {
    expect(kanPowerLines(normalizeDatabase(seedDatabase('s', 's'))).join(' ')).not.toContain("KAN'S SUSANOO");
    const line = kanSusanooLine(withEyes('armoured'));
    expect(kanPowerLines(withEyes('armoured')).join(' ')).toContain("KAN'S SUSANOO");
    expect(line).toContain('hooked bill');
    expect(line).toContain('talon sickle');
    expect(line).toContain('Perfect Susanoo only with the Eternal');
  });
});
