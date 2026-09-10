// Shared service worker behavior for sibling music-tools PWAs.
// Each app's local sw.js must define PWA_CACHE_NAME and PWA_URLS_TO_CACHE,
// then import this file with: importScripts('../pwa/sw-common.js');

const CACHE_NAME = self.PWA_CACHE_NAME;
const URLS_TO_CACHE = self.PWA_URLS_TO_CACHE || [];
const FALLBACK_URL = self.PWA_FALLBACK_URL || './index.html';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(URLS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  const isNavigation = event.request.mode === 'navigate';
  const acceptsHtml = event.request.headers.get('accept')?.includes('text/html');

  if (isNavigation || acceptsHtml) {
    event.respondWith(
      fetch(event.request, { cache: 'reload' })
        .then(response => {
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match(FALLBACK_URL)))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return response;
        });
      })
      .catch(() => caches.match(FALLBACK_URL))
  );
});
