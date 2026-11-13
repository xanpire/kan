const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')
);
const version = pkg.version;
const cacheName = `kan-shell-${version.replace(/\./g, '-')}`;

const v = `?v=${version}`;

const APP_SHELL = [
  '/',
  `/manifest.webmanifest${v}`,
  `/icon-192.png${v}`,
  `/icon-512.png${v}`,
  `/icon-maskable-512.png${v}`,
  `/apple-touch-icon.png${v}`,
];

const sw = `const CACHE_NAME = '${cacheName}';
const APP_SHELL = ${JSON.stringify(APP_SHELL)};

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
    /\\.(?:js|css|woff2?|png|jpg|jpeg|webp|svg)$/.test(url.pathname)
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
`;

const outPath = path.resolve(__dirname, '../public/sw.js');
fs.writeFileSync(outPath, sw);
console.log(`sw.js generated with cache: ${cacheName} (app version: ${version})`);

// The manifest's icons carry the same ?v= as the precache list above, so the
// installed app's icons and the cached copies are the same URLs.
const manifestPath = path.resolve(__dirname, '../public/manifest.webmanifest');
const manifest = fs.readFileSync(manifestPath, 'utf8');
const stamped = manifest.replace(/\?v=[0-9A-Za-z.\-]+/g, v);
if (stamped !== manifest) {
  fs.writeFileSync(manifestPath, stamped);
  console.log(`manifest.webmanifest icons stamped ${v}`);
}
