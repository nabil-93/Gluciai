/* Minimal service worker — required by Chrome/Android's PWA install
 * criteria (a controlling SW with a fetch handler) for the "Add to Home
 * screen" flow to actually complete, not just show the prompt. Pure
 * network passthrough: no caching, so it never risks serving stale data
 * for API calls (Supabase, AI endpoints, etc). */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
