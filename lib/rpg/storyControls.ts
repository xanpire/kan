// The Story screen's small controls (audit 10): Wait, Enter to send, edit
// your last action, copy a reply. Pure, so they can be tested.

import type { AppDatabase } from './types';

/** What an empty send does: the scene goes on without Kan acting. */
export const WAIT_INPUT = '*You wait and watch.*';

/** Your last action, as you typed it (the one Edit puts back in the box). */
export function lastPlayerAction(db: AppDatabase): string | null {
  for (let index = db.rawLog.length - 1; index >= 0; index -= 1) {
    const entry = db.rawLog[index];

    if (entry.kind === 'story' && entry.role === 'user') {
      return entry.content;
    }
  }

  return null;
}

/** A reply or action as plain text for the clipboard: no action markers. */
export function copyableText(content: string) {
  return content
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type KeyLike = { key?: string; shiftKey?: boolean; isComposing?: boolean; nativeEvent?: { isComposing?: boolean } };

/**
 * Enter sends on a hardware keyboard (Shift+Enter is a new line). Phones keep
 * the send button: `finePointer` is true only where a mouse or trackpad is
 * the main pointer, which is where a hardware keyboard is.
 */
export function enterSends(event: KeyLike, finePointer: boolean) {
  return (
    finePointer &&
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.isComposing &&
    !event.nativeEvent?.isComposing
  );
}

/** True on a desktop browser (a mouse or trackpad as the main pointer). */
export function hasFinePointer() {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: fine)').matches
      : false;
  } catch {
    return false;
  }
}

/** Copies text where the browser allows it; false when it can't. */
export async function copyText(text: string) {
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;

  if (!clipboard?.writeText) {
    return false;
  }

  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
