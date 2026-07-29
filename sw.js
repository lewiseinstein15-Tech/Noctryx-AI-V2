// Minimal service worker — required by Chrome/Android for the automatic
// "Install app" prompt. Currently just passes requests straight through
// (no offline caching yet). Expand the fetch handler later if you want
// offline support.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});