// "A new version is ready" (audit 10). The service worker takes over as soon
// as a new one installs (skipWaiting + clients.claim), but the open page keeps
// running the old code until it reloads. When the controller changes under a
// page that already had one, a new version is waiting: say so and offer Reload.

const CHECK_EVERY_MS = 30 * 60 * 1000;

type Target = {
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

type Env = {
  serviceWorker?: Target & { controller: unknown; getRegistration: () => Promise<{ update: () => Promise<unknown> } | undefined> };
  document?: Target & { visibilityState: string };
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
};

function webEnv(): Env | null {
  // Only a browser has service workers; native builds have no `navigator.serviceWorker`.
  if (typeof navigator === 'undefined' || !navigator || !('serviceWorker' in navigator)) return null;
  return {
    serviceWorker: navigator.serviceWorker as unknown as Env['serviceWorker'],
    document: typeof document === 'undefined' ? undefined : (document as unknown as Env['document']),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
  };
}

/**
 * Calls `onReady` once when a new version has taken over this page. Also asks
 * for an update when the app comes back to the front and every half hour, so
 * an installed app left open for days still hears about one.
 */
export function watchForUpdate(onReady: () => void, env: Env | null = webEnv()): () => void {
  const sw = env?.serviceWorker;
  if (!env || !sw) return () => undefined;

  // The very first install takes control of a page that had none: not an update.
  const hadController = Boolean(sw.controller);
  let fired = false;

  const onChange = () => {
    if (!hadController || fired) return;
    fired = true;
    onReady();
  };

  const check = () => {
    if (env.document && env.document.visibilityState !== 'visible') return;
    void sw
      .getRegistration()
      .then((registration) => registration?.update())
      .catch(() => undefined);
  };

  sw.addEventListener('controllerchange', onChange);
  env.document?.addEventListener('visibilitychange', check);
  const timer = env.setInterval(check, CHECK_EVERY_MS);

  return () => {
    sw.removeEventListener('controllerchange', onChange);
    env.document?.removeEventListener('visibilitychange', check);
    env.clearInterval(timer);
  };
}
