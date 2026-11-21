// Session 4 (21 Nov 2026, v1.25.24), played by Claude on the live build.
import { describe, expect, test } from 'bun:test';
import { CANON_MILESTONES } from '../lib/rpg/canonData';

describe('Session 4 findings', () => {
  test('the funeral Mangekyō: fusing tomoe are the awakening, never more tomoe', () => {
    // The narrator wrote "the single tomoe … fuse into a new, sharp geometry";
    // the tracker filed it as "2 tomoe" and left the beat only engaged.
    const beat = CANON_MILESTONES.find((item) => item.id === 'kan-mangekyo')!;
    expect(beat.completesWhen).toContain('never more tomoe');
    expect(beat.completesWhen).toContain('Mangekyō Sharingan');
    expect(beat.encounter?.context).toContain('make it unmistakable');
  });
});

describe('the Mangekyō pattern reaches the narrator with the offer', () => {
  test('the beat carries the fixed pattern, black iris and red bills', () => {
    const beat = CANON_MILESTONES.find((item) => item.id === 'kan-mangekyo')!;
    expect(beat.onThePage).toContain('black iris with a red pattern');
    expect(beat.onThePage).toContain('vulture bills');
  });
});

describe('the cloak is given by the Akatsuki, not carried out of the Leaf', () => {
  test('kan-joins-akatsuki says where the cloaks come from', () => {
    const beat = CANON_MILESTONES.find((item) => item.id === 'kan-joins-akatsuki')!;
    expect(beat.onThePage).toContain('never on the road out of the Land of Fire');
  });
});

describe('the Leaf never found a body', () => {
  test('the line after the first night says so (Itachi spoke of "charred remains")', async () => {
    const { normalizeDatabase } = await import('../lib/rpg/db');
    const { seedDatabase } = await import('../lib/rpg/seed');
    const { buildNarrationPrompt } = await import('../lib/rpg/prompt');
    const db = normalizeDatabase(seedDatabase('slot_s4', 'S4'));
    const later = { ...db, state: { ...db.state, inStoryDate: { year: 13, month: 10, day: 6, hour: 22, minute: 0, second: 0 } } };
    const text = buildNarrationPrompt(later, 'I ask.').messages.map((m) => m.content as string).join('\n');
    expect(text).toContain('your body was never found');
  });
});

describe('a cost word after a comma is still a cost word', () => {
  test('"…, draining" splits like "[draining]"', async () => {
    const { splitFightOption, fightOptionInput } = await import('../lib/rpg/sceneMode');
    expect(splitFightOption('Great Fireball point-blank down the corridor, draining')).toEqual({ move: 'Great Fireball point-blank down the corridor', cost: 'draining' });
    expect(splitFightOption('Open the Gates — heavy')).toEqual({ move: 'Open the Gates', cost: 'heavy' });
    expect(fightOptionInput('Great Fireball point-blank, draining')).toBe('*Great Fireball point-blank.*');
    expect(splitFightOption('Duck under the cleaver')).toEqual({ move: 'Duck under the cleaver' });
  });
});

describe('tracker wording from Session 4', () => {
  test('Sky Burial alone is not a Thousand Souls use, and Kan\'s feelings follow only what he shows', async () => {
    const { STATE_FIELD_RULES } = (await import('../lib/rpg/prompt')) as unknown as { STATE_FIELD_RULES?: Record<string, string> };
    const text = (await Bun.file(new URL('../lib/rpg/prompt.ts', import.meta.url)).text()) + JSON.stringify(STATE_FIELD_RULES ?? {});
    expect(text).toContain("Sky Burial's drain is Sky Burial alone");
    expect(text).toContain('never warmer because they were kind to you');
  });
});
