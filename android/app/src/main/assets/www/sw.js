// Women's Safety Service Worker for Offline Execution and PWA Installation
const CACHE_NAME = 'womens-safety-v4.0';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './css/mapbox-gl.css',
  './assets/fonts/inter.css',
  './js/map.js',
  './js/ai-risk-client.js',
  './js/sos.js',
  './js/contacts.js',
  './js/incidents.js',
  './js/live-guard.js',
  './js/app.js',
  './backend/ai_risk_engine/risk_engine.js',
  './assets/images/icon-192.png',
  './assets/images/icon-512.png',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.log('SW cache err', err));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Network-First with Cache Fallback: ensures live updates are fetched immediately
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
        });
      })
  );
});
