/* DM Forge service worker: lets the app open with no connection.
   It keeps the last copy of the app page that the server sent while signed in, and hands it back when the server cannot
   be reached or is too slow (a few seconds). It never touches /api/ (notes are kept by the app itself) and never keeps the sign-in page. */
const CACHE = 'dmforge-shell-v1';
const WAIT_MS = 3500;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode !== 'navigate' || url.pathname !== '/') return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const network = (async () => {
      const res = await fetch(req);
      if (res.ok && res.headers.get('X-DMF-App') === '1') await cache.put('/', res.clone());
      return res;
    })();
    network.catch(() => {});                       // the race below may already be over; do not report a late failure twice
    // A server that answers slowly (poor wifi, a relayed connection, a restart in progress) must not leave a blank page:
    // after a few seconds the saved copy is used, and the fresh one is still kept for next time.
    const saved = await cache.match('/');
    if (!saved) return network;
    return Promise.race([network, new Promise(done => setTimeout(() => done(saved), WAIT_MS))]).catch(() => saved);
  })());
});
