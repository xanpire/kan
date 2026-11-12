/**
 * Story screen controls (audit 10 and 11a): Wait, Enter to send, edit your
 * last action, copy a reply.
 */
import { describe, expect, test } from 'bun:test';

import { normalizeDatabase } from '../lib/rpg/db';
import { appendStoryMessage } from '../lib/rpg/log';
import { seedDatabase } from '../lib/rpg/seed';
import { WAIT_INPUT, copyableText, enterSends, lastPlayerAction } from '../lib/rpg/storyControls';

describe('Wait', () => {
  test('is an action line, so the narrator reads it as Kan holding still', () => {
    expect(WAIT_INPUT).toBe('*You wait and watch.*');
  });
});

describe('Enter sends on a hardware keyboard', () => {
  test('Enter sends where there is a fine pointer', () => {
    expect(enterSends({ key: 'Enter' }, true)).toBe(true);
  });
  test('Shift+Enter is a new line', () => {
    expect(enterSends({ key: 'Enter', shiftKey: true }, true)).toBe(false);
  });
  test('a phone keeps the send button', () => {
    expect(enterSends({ key: 'Enter' }, false)).toBe(false);
  });
  test('Enter that confirms an input-method word does not send', () => {
    expect(enterSends({ key: 'Enter', isComposing: true }, true)).toBe(false);
    expect(enterSends({ key: 'Enter', nativeEvent: { isComposing: true } }, true)).toBe(false);
  });
  test('other keys never send', () => {
    expect(enterSends({ key: 'a' }, true)).toBe(false);
  });
});

describe('edit your last action', () => {
  test('finds the last thing you typed, not a reply', () => {
    let db = normalizeDatabase(seedDatabase('slot_controls', 'Controls'));
    expect(lastPlayerAction(db)).toBeNull();
    db = appendStoryMessage(db, 'user', '*I wait.*', null, 0, 0);
    db = appendStoryMessage(db, 'assistant', 'Rain.', null, 0, 0);
    db = appendStoryMessage(db, 'user', '"Itachi?" *I stand.*', null, 0, 0);
    db = appendStoryMessage(db, 'assistant', 'He turns.', null, 0, 0);
    expect(lastPlayerAction(db)).toBe('"Itachi?" *I stand.*');
  });
});

describe('copy', () => {
  test('drops the action markers and extra blank lines', () => {
    expect(copyableText('*You kneel.* The rain.\n\n\n\nItachi waits.')).toBe('You kneel. The rain.\n\nItachi waits.');
  });
});
