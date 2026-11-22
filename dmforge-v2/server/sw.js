/* DM Forge service worker: lets the app open with no connection.
   It keeps the last copy of the app page that the server sent while signed in, and hands it back when the server cannot
   be reached. It never touches /api/ (notes are kept by the app itself) and never keeps the sign-in page. */
const CACHE = 'dmforge-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode !== 'navigate' || url.pathname !== '/') return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.headers.get('X-DMF-App') === '1') {
        const cache = await caches.open(CACHE);
        await cache.put('/', res.clone());
      }
      return res;
    } catch (err) {
      const cache = await caches.open(CACHE);
      const hit = await cache.match('/');
      if (hit) return hit;
      throw err;
    }
  })());
});
