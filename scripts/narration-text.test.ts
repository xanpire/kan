import { describe, expect, test } from 'bun:test';

import { narrationSegments } from '../lib/rpg/narrationText';

describe('action lines are dim italics without asterisks (audit 10.1)', () => {
  test('a paragraph that is one whole action line is an action, not plain text with asterisks', () => {
    expect(narrationSegments('*Itachi looks away.*')).toEqual([{ text: 'Itachi looks away.', action: true }]);
  });

  test('mixed speech and action', () => {
    expect(narrationSegments('"Come." *He turns.* "Now."')).toEqual([
      { text: '"Come." ', action: false },
      { text: 'He turns.', action: true },
      { text: ' "Now."', action: false },
    ]);
  });

  test('plain prose stays plain', () => {
    expect(narrationSegments('The rain keeps falling.')).toEqual([{ text: 'The rain keeps falling.', action: false }]);
  });

  test('speech inside asterisks is never italic', () => {
    const segments = narrationSegments('"…first," *Itachi says. "He intended it to be used."*');
    expect(segments).toEqual([
      { text: '"…first," ', action: false },
      { text: 'Itachi says. ', action: true },
      { text: '"He intended it to be used."', action: false },
    ]);
    expect(segments.map((segment) => segment.text).join('')).not.toContain('*');
  });
});
