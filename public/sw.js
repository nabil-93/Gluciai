/* Minimal service worker — required by Chrome/Android's PWA install
 * criteria (a controlling SW with a fetch handler) for the "Add to Home
 * screen" flow to actually complete, not just show the prompt. No caching,
 * so it never risks serving stale data for API calls.
 *
 * WHAT WAS WRONG. This file used to be:
 *
 *     event.respondWith(fetch(event.request));
 *
 * `respondWith` takes ownership of the response. When the wrapped `fetch`
 * REJECTS — a dropped connection, a request the browser cancels, a slow
 * network, an aborted navigation, all routine — the browser has no response
 * to serve and reports it as:
 *
 *     FetchEvent.respondWith received an error: TypeError: Load failed
 *
 * Registered at `/sw.js`, its scope is `/`, so it intercepted EVERYTHING:
 * the app, the Supabase auth calls, and the admin panel at /panel-x7k42m/.
 * A sign-in whose token request happened to fail once surfaced as that
 * opaque error instead of a normal, retryable network failure.
 *
 * THE FIX. Do not call `respondWith` at all for requests we add nothing to.
 * Returning without calling it lets the browser perform its OWN default
 * fetch — the exact same network request, but with the browser's normal
 * error handling, retries and diagnostics. A passthrough that can break the
 * request it is passing through is worse than no passthrough.
 *
 * The handler is kept (Chrome requires a fetch listener to exist for
 * installability) but is now genuinely inert.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  /* Intentionally empty: no respondWith → the browser handles the request
     itself. Never intercept auth/API traffic we do not cache. */
});
