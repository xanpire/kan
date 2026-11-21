// Session 3 (v1.25.17): a use overwrote what a jutsu does with that turn's
// account; a drain named no nature; past 20 jutsu the narrator saw nothing.
import { describe, expect, test } from 'bun:test';
import { normalizeDatabase } from '../lib/rpg/db';
import { applyJutsuDiff, lastUseOf } from '../lib/rpg/jutsu';
import { buildNarrationPrompt } from '../lib/rpg/prompt';
import { seedDatabase } from '../lib/rpg/seed';

const seed = () => normalizeDatabase(seedDatabase('slot_j3', 'J3'));
const record = (db: ReturnType<typeof seed>, name: string) => db.jutsuRecords.find((item) => item.user === 'Kan' && item.name === name)!;

describe('a jutsu keeps what it does', () => {
  test('using Thousand Souls counts the use but keeps its description', () => {
    const before = record(seed(), 'Thousand Souls');
    const after = applyJutsuDiff(seed(), {
      name: 'Thousand Souls',
      user: 'Kan',
      chakraNature: 'Yin',
      effect: 'Stripped the sentry’s chakra out through your palm and killed him.',
      visual: 'His skin greyed in your grip.',
    });
    const used = record(after, 'Thousand Souls');
    expect(used.effect).toBe(before.effect);
    expect(used.timesUsed).toBe(before.timesUsed + 1);
    expect(used.visual).toBe('His skin greyed in your grip.');
  });

  test('a new jutsu takes its first account as what it does', () => {
    const after = applyJutsuDiff(seed(), { name: 'Water Prison', user: 'Kan', chakraNature: 'Water', effect: 'Traps a man in a sphere of water.' });
    expect(record(after, 'Water Prison').effect).toBe('Traps a man in a sphere of water.');
  });
});

describe('the narrator', () => {
  test('is told to name the nature a drain takes', () => {
    const text = buildNarrationPrompt(seed(), '*I wait.*').messages.map((message) => message.content).join('\n');
    expect(text).toContain('Thousand Souls on the page (fixed)');
  });

  test('sees every jutsu Kan knows, past the detailed list', () => {
    const db = seed();
    const text = buildNarrationPrompt(db, '*I wait.*').messages.map((message) => message.content).join('\n');
    for (const item of db.jutsuRecords.filter((entry) => entry.user === 'Kan')) expect(text).toContain(item.name);
    expect(text).toContain('Also knows:');
  });
});

import { natureSourceName } from '../lib/rpg/abilities';

describe('a stolen nature names whose it was', () => {
  test('a known person by name; a stranger’s slug as plain words', () => {
    const db = seed();
    expect(natureSourceName(db, 'itachi-uchiha')).toBe('Itachi Uchiha');
    expect(natureSourceName(db, 'the-lean-grass-rogue')).toBe('the lean grass rogue');
    expect(natureSourceName(db, 'a Mist hunter-nin')).toBe('a Mist hunter-nin');
  });
});

describe('a jutsu card keeps its latest use (ideas for later #3, v1.25.23)', () => {

  test('a use that says more than the effect becomes the Last line, one sentence', () => {
    expect(lastUseOf('Steals chakra.', "Stripped the sentry's chakra in the courtyard. He fell.")).toEqual({ lastUse: "Stripped the sentry's chakra in the courtyard" });
  });

  test('the same words as the effect, or nothing, leave it alone', () => {
    expect(lastUseOf('Steals chakra.', 'Steals chakra.')).toEqual({});
    expect(lastUseOf('Steals chakra.', undefined)).toEqual({});
  });

  test('a long account is cut at a word', () => {
    const long = lastUseOf('x', 'word '.repeat(40)).lastUse ?? '';
    expect(long.length).toBeLessThanOrEqual(110);
    expect(long.endsWith('…')).toBe(true);
  });
});
