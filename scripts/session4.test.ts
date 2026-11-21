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
