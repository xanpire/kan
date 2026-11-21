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
