/** "A new version is ready" (audit 10): only when a new worker takes over a page that already had one. */
import { describe, expect, mock, test } from 'bun:test';

import { watchForUpdate } from '../lib/appUpdate';
import { toastDuration } from '../components/toastTiming';

function fakeEnv(controller: unknown) {
  const listeners = new Map<string, Set<() => void>>();
  const target = () => ({
    addEventListener: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
  });
  let updates = 0;
  const env = {
    serviceWorker: { ...target(), controller, getRegistration: async () => ({ update: async () => void (updates += 1) }) },
    document: { ...target(), visibilityState: 'visible' },
    setInterval: () => 1,
    clearInterval: () => undefined,
  };
  return { env, fire: (type: string) => listeners.get(type)?.forEach((fn) => fn()), updates: () => updates, listeners };
}

describe('new version ready', () => {
  test('a new worker taking over a controlled page says so, once', () => {
    const fake = fakeEnv({});
    let ready = 0;
    watchForUpdate(() => (ready += 1), fake.env);
    fake.fire('controllerchange');
    fake.fire('controllerchange');
    expect(ready).toBe(1);
  });

  test('the first install is not an update', () => {
    const fake = fakeEnv(null);
    let ready = 0;
    watchForUpdate(() => (ready += 1), fake.env);
    fake.fire('controllerchange');
    expect(ready).toBe(0);
  });

  test('coming back to the app asks for an update; stopping removes the listeners', async () => {
    const fake = fakeEnv({});
    const stop = watchForUpdate(() => undefined, fake.env);
    fake.fire('visibilitychange');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.updates()).toBe(1);
    stop();
    expect(fake.listeners.get('controllerchange')?.size).toBe(0);
  });

  test('the notice stays until tapped', () => {
    expect(toastDuration('A new version of Kan is ready.', 'info', { durationMs: null })).toBeNull();
  });
});
