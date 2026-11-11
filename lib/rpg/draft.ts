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
