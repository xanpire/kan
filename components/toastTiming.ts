// How long a toast stays on screen. Kept apart from Toast.tsx so tests can read it.

export type ToastTone = 'success' | 'error' | 'info';

/** Roughly reading time: 2.8 s for a short line, up to 8 s for a long one. */
export function toastDuration(message: string, tone: ToastTone, options?: { durationMs?: number }): number | null {
  if (options?.durationMs !== undefined) {
    return options.durationMs;
  }

  if (tone === 'error') {
    return null;
  }

  return Math.min(8000, Math.max(2800, 1200 + message.length * 45));
}

