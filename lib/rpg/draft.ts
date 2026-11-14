// The unsent text in the Story screen's input box, kept per story so it
// survives a reload (and a failed turn's action, which is put back there).

const PREFIX = 'kan.draft.v1.';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadDraft(slotId: string): string {
  try {
    return storage()?.getItem(PREFIX + slotId) ?? '';
  } catch {
    return '';
  }
}

export function saveDraft(slotId: string, text: string) {
  try {
    const store = storage();

    if (!store) {
      return;
    }

    if (text.trim()) {
      store.setItem(PREFIX + slotId, text.slice(0, 2000));
    } else {
      store.removeItem(PREFIX + slotId);
    }
  } catch {
    // Full or blocked storage: the draft is a convenience, never worth an error.
  }
}

// The action of a turn still being narrated (audit 5.6). The box is cleared
// on send, so a reload before the reply is saved would lose it: it is kept
// here until the turn ends, and put back in the box on load.
const PENDING_PREFIX = 'kan.pending.v1.';

export function savePendingAction(slotId: string, text: string) {
  try {
    storage()?.setItem(PENDING_PREFIX + slotId, text.slice(0, 2000));
  } catch {
    // A convenience only.
  }
}

export function clearPendingAction(slotId: string) {
  try {
    storage()?.removeItem(PENDING_PREFIX + slotId);
  } catch {
    // A convenience only.
  }
}

/**
 * The action a reload interrupted, once: '' when there is none, or when the
 * story already ends with it (the reply was saved just before the reload).
 */
export function takePendingAction(slotId: string, lastPlayerText: string | undefined): string {
  try {
    const store = storage();
    const pending = store?.getItem(PENDING_PREFIX + slotId) ?? '';
    store?.removeItem(PENDING_PREFIX + slotId);
    return pending && pending.trim() !== (lastPlayerText ?? '').trim() ? pending : '';
  } catch {
    return '';
  }
}
