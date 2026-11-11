/**
 * One tab per story. Two tabs writing the same save would each overwrite the
 * other's turns, so the open story holds a Web Lock (`navigator.locks`) named
 * after its slot. A second tab that can't get it stays read-only and waits;
 * when the first tab closes or switches story, the lock passes to the waiting
 * tab, which then reloads the save from storage.
 *
 * Browsers without `navigator.locks` (and native) always get the lock.
 */

type LockManagerLike = {
  request: (
    name: string,
    options: { ifAvailable?: boolean; signal?: AbortSignal },
    callback: (lock: unknown | null) => Promise<void> | void
  ) => Promise<unknown>;
};

function lockManager(): LockManagerLike | null {
  const locks = typeof navigator !== 'undefined' ? (navigator as { locks?: LockManagerLike }).locks : undefined;
  return locks && typeof locks.request === 'function' ? locks : null;
}

export const lockName = (slotId: string) => `kan-slot-${slotId}`;

export type SlotLock = {
  /** True once this tab holds the lock. */
  held: () => boolean;
  /** Gives the lock up (switching story, closing) and stops waiting for it. */
  release: () => void;
};

/**
 * Takes the slot's lock if it is free. If another tab holds it, calls
 * `onBlocked` at once and keeps waiting; `onAcquired` runs when the lock is
 * (or becomes) this tab's.
 */
export function acquireSlotLock(
  slotId: string,
  handlers: { onAcquired: () => void; onBlocked: () => void }
): SlotLock {
  const locks = lockManager();
  let held = false;
  let released = false;
  let letGo: (() => void) | null = null;
  const abort = typeof AbortController !== 'undefined' ? new AbortController() : null;

  const release = () => {
    released = true;
    held = false;
    letGo?.();
    letGo = null;
    abort?.abort();
  };

  if (!locks) {
    held = true;
    handlers.onAcquired();
    return { held: () => held, release };
  }

  const hold = () =>
    new Promise<void>((resolve) => {
      held = true;
      letGo = resolve;
      handlers.onAcquired();
    });

  void locks
    .request(lockName(slotId), { ifAvailable: true }, (lock) => {
      if (released) {
        return;
      }

      if (lock) {
        return hold();
      }

      handlers.onBlocked();

      // Wait in line for the other tab to let go.
      void locks
        .request(lockName(slotId), abort ? { signal: abort.signal } : {}, () => (released ? undefined : hold()))
        .catch(() => undefined);
    })
    .catch(() => {
      // Locks refused (some private modes): behave as if there were no locks.
      if (!released && !held) {
        held = true;
        handlers.onAcquired();
      }
    });

  return { held: () => held, release };
}
