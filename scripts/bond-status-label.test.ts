// Bonds list (22 Nov 2026, v1.25.47): Pain's line read "The pierced man took
// your report without warmth: ..." instead of "Akatsuki leader". A bond status
// is a short label; a story sentence from the tracker is dropped.
import { describe, expect, test } from 'bun:test';
import { statusLabel } from '../lib/rpg/bonds';
import { convertStateBlock } from '../lib/rpg/stateBlock';

const SENTENCE =
  "The pierced man took your report without warmth: four hours early is only 'passable', and the cloak buys you nothing but the right to be used again.";

describe('a bond status is a short label, never a sentence', () => {
  test('labels pass, sentences do not', () => {
    expect(statusLabel('Akatsuki leader')).toBe('Akatsuki leader');
    expect(statusLabel('Travelling with you')).toBe('Travelling with you');
    expect(statusLabel('Wronged by you')).toBe('Wronged by you');
    expect(statusLabel('Deceased · former teammate')).toBe('Deceased · former teammate');
    expect(statusLabel('  Newly met ')).toBe('Newly met');
    expect(statusLabel(SENTENCE)).toBeUndefined();
    expect(statusLabel('Took your report coldly.')).toBeUndefined();
    expect(statusLabel('Wary: watches you closely')).toBeUndefined();
    expect(statusLabel('')).toBeUndefined();
    expect(statusLabel(undefined)).toBeUndefined();
  });

  test('the tracker cannot store a sentence as a status', () => {
    const { diff } = convertStateBlock({
      bonds: [
        { character_id: 'pain', affinity_change: 0, status: SENTENCE, note: 'Cold reception.' },
        { character_id: 'konan', affinity_change: 1, status: 'Akatsuki member', note: 'Led you in.' },
      ],
    });
    const bonds = diff?.bonds ?? [];
    expect(bonds.find((bond) => bond.character === 'pain')?.status).toBeUndefined();
    expect(bonds.find((bond) => bond.character === 'pain')?.note).toBe('Cold reception.');
    expect(bonds.find((bond) => bond.character === 'konan')?.status).toBe('Akatsuki member');
  });
});
