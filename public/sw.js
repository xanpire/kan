const CACHE_NAME = 'kan-shell-1-24-66';
const APP_SHELL = ["/","/manifest.webmanifest?v=1.24.66","/icon-192.png?v=1.24.66","/icon-512.png?v=1.24.66","/icon-maskable-512.png?v=1.24.66","/apple-touch-icon.png?v=1.24.66"];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(APP_SHELL.map((url) => cache.add(url)))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    // Each route's page is kept under its own path (/settings, /kan), so a
    // sub-route opens offline too; anything not seen yet falls back to '/'.
    const key = url.pathname;
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(key, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = (await caches.match(key)) || (await caches.match('/'));
          return cached || new Response('Offline', { status: 503 });
        })
    );
    return;
  }

  if (
    url.pathname.startsWith('/_expo/') ||
    /\.(?:js|css|woff2?|png|jpg|jpeg|webp|svg)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);

        return cached || network;
      })
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
