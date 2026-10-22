// Keeps the game on the device so the second visit loads almost at once: the page itself
// from the network when there is one (so a new version shows up straight away), the built code
// (its names change with every version) from the cache for good, and the textures, people,
// skies and art from the cache at once while a fresh copy comes down for next time.
const CACHE = 'stomped-v1';
const KEEP = /\/assets\//;
const SWR = /\/(tex|people|sky|art|trees)\/|fonts\.(googleapis|gstatic)\.com/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

const put = async (req, res) => { if (res.ok && res.type !== 'opaque') (await caches.open(CACHE)).put(req, res.clone()); return res; };

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === location.origin;
  if (req.mode === 'navigate' && same) {
    e.respondWith(fetch(req).then((r) => put(req, r)).catch(async () => (await caches.match(req)) ?? caches.match(new URL('./', location).href)));
  } else if (same && KEEP.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit ?? fetch(req).then((r) => put(req, r))));
  } else if ((same && SWR.test(url.pathname)) || (!same && SWR.test(url.href))) {
    e.respondWith(caches.match(req).then((hit) => {
      const net = fetch(req).then((r) => put(req, r));
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net;
    }));
  }
});
